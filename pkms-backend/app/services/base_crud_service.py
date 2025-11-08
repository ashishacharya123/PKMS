"""
Base CRUD Service

Generic base class for CRUD operations with standardized error handling,
logging, soft delete handling, and optional search indexing hooks.
"""

import logging
from typing import Generic, TypeVar, Type, Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status

from app.config import NEPAL_TZ

logger = logging.getLogger(__name__)

ModelType = TypeVar("ModelType")
CreateSchemaType = TypeVar("CreateSchemaType")
UpdateSchemaType = TypeVar("UpdateSchemaType")
ResponseSchemaType = TypeVar("ResponseSchemaType")


class BaseCRUDService(Generic[ModelType, CreateSchemaType, UpdateSchemaType, ResponseSchemaType]):
  def __init__(self, model_class: Type[ModelType], response_schema: Type[ResponseSchemaType], entity_name: str):
    self.model_class = model_class
    self.response_schema = response_schema
    self.entity_name = entity_name

  async def create(self, db: AsyncSession, user_uuid: str, data: CreateSchemaType) -> ResponseSchemaType:
    try:
      payload = data.dict() if hasattr(data, 'dict') else data
      entity = self.model_class(**payload, created_by=user_uuid)
      db.add(entity)
      await db.commit()
      await db.refresh(entity)

      if hasattr(self, '_index_in_search'):
        try:
          await getattr(self, '_index_in_search')(db, entity)  # type: ignore[attr-defined]
        except Exception:
          logger.warning("Search index hook failed for %s", self.entity_name)

      return self._to_response(entity)
    except Exception as e:
      await db.rollback()
      logger.exception("Error creating %s", self.entity_name)
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to create {self.entity_name}") from e

  async def get_by_uuid(self, db: AsyncSession, user_uuid: str, entity_uuid: str, include_deleted: bool = False) -> Optional[ResponseSchemaType]:
    try:
      query = select(self.model_class).where(
        and_(
          self.model_class.uuid == entity_uuid,
          self.model_class.created_by == user_uuid,
        )
      )
      if not include_deleted and hasattr(self.model_class, 'is_deleted'):
        query = query.where(self.model_class.is_deleted.is_(False))

      result = await db.execute(query)
      entity = result.scalar_one_or_none()
      if not entity:
        return None
      return self._to_response(entity)
    except Exception as e:
      logger.exception("Error getting %s %s", self.entity_name, entity_uuid)
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to get {self.entity_name}") from e

  async def list(self, db: AsyncSession, user_uuid: str, limit: int = 50, offset: int = 0, include_deleted: bool = False) -> List[ResponseSchemaType]:
    try:
      query = select(self.model_class).where(self.model_class.created_by == user_uuid)
      if not include_deleted and hasattr(self.model_class, 'is_deleted'):
        query = query.where(self.model_class.is_deleted.is_(False))
      query = query.limit(limit).offset(offset)
      result = await db.execute(query)
      entities = result.scalars().all()
      return [self._to_response(e) for e in entities]
    except Exception as e:
      logger.exception("Error listing %ss", self.entity_name)
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to list {self.entity_name}s") from e

  async def update(self, db: AsyncSession, user_uuid: str, entity_uuid: str, updates: UpdateSchemaType) -> ResponseSchemaType:
    try:
      query = select(self.model_class).where(
        and_(
          self.model_class.uuid == entity_uuid,
          self.model_class.created_by == user_uuid,
        )
      )
      if hasattr(self.model_class, 'is_deleted'):
        query = query.where(self.model_class.is_deleted.is_(False))

      result = await db.execute(query)
      entity = result.scalar_one_or_none()
      if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{self.entity_name} not found")

      update_data = updates.dict(exclude_unset=True) if hasattr(updates, 'dict') else updates
      for field, value in update_data.items():
        if hasattr(entity, field):
          setattr(entity, field, value)

      if hasattr(entity, 'updated_at'):
        setattr(entity, 'updated_at', datetime.now(NEPAL_TZ))

      await db.commit()
      await db.refresh(entity)

      if hasattr(self, '_index_in_search'):
        try:
          await getattr(self, '_index_in_search')(db, entity)  # type: ignore[attr-defined]
        except Exception:
          logger.warning("Search re-index hook failed for %s", self.entity_name)

      return self._to_response(entity)
    except HTTPException:
      raise
    except Exception as e:
      await db.rollback()
      logger.exception("Error updating %s %s", self.entity_name, entity_uuid)
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to update {self.entity_name}") from e

  async def soft_delete(self, db: AsyncSession, user_uuid: str, entity_uuid: str) -> None:
    if not hasattr(self.model_class, 'is_deleted'):
      raise NotImplementedError(f"{self.entity_name} does not support soft delete")
    try:
      query = select(self.model_class).where(
        and_(
          self.model_class.uuid == entity_uuid,
          self.model_class.created_by == user_uuid,
          self.model_class.is_deleted.is_(False),
        )
      )
      result = await db.execute(query)
      entity = result.scalar_one_or_none()
      if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{self.entity_name} not found")

      setattr(entity, 'is_deleted', True)
      if hasattr(entity, 'updated_at'):
        setattr(entity, 'updated_at', datetime.now(NEPAL_TZ))
      await db.commit()
    except HTTPException:
      raise
    except Exception as e:
      await db.rollback()
      logger.exception("Error soft deleting %s %s", self.entity_name, entity_uuid)
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to delete {self.entity_name}") from e

  async def hard_delete(self, db: AsyncSession, user_uuid: str, entity_uuid: str) -> None:
    try:
      query = select(self.model_class).where(
        and_(
          self.model_class.uuid == entity_uuid,
          self.model_class.created_by == user_uuid,
        )
      )
      result = await db.execute(query)
      entity = result.scalar_one_or_none()
      if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{self.entity_name} not found")
      await db.delete(entity)
      await db.commit()
    except HTTPException:
      raise
    except Exception as e:
      await db.rollback()
      logger.exception("Error hard deleting %s %s", self.entity_name, entity_uuid)
      raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to permanently delete {self.entity_name}") from e

  def _to_response(self, entity: ModelType) -> ResponseSchemaType:
    return self.response_schema.from_orm(entity)  # type: ignore[call-arg]


