"""
Diary CRUD Service

Handles all CRUD operations for diary entries and file management.
Includes entry creation, reading, updating, deletion, and file operations.
"""

import logging
import json
import uuid as uuid_lib
import base64
import asyncio
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from sqlalchemy.orm import aliased
from fastapi import HTTPException, status
from fastapi.responses import FileResponse

from app.config import NEPAL_TZ, get_file_storage_dir
from app.models.diary import DiaryEntry, DiaryDailyMetadata
from app.models.tag import Tag
from app.models.tag_associations import diary_entry_tags
from app.models.enums import ModuleType
from app.utils.diary_encryption import write_encrypted_file, read_encrypted_header, InvalidPKMSFile
from app.services.tag_service import tag_service
from app.services.search_service import search_service
from app.services.unified_upload_service import unified_upload_service
from app.services.unified_download_service import unified_download_service
from app.schemas.diary import (
    DiaryEntryCreate,
    DiaryEntryUpdate,
    DiaryEntryResponse,
    DiaryEntrySummary,
)

logger = logging.getLogger(__name__)


class DiaryCRUDService:
    """
    Service for diary CRUD operations including entry management and file operations.
    """
    
    @staticmethod
    def generate_diary_file_path(entry_uuid: str) -> Path:
        """
        Generate stable file path for diary entry using UUID.
        
        Format: diary_{UUID}.dat
        Example: diary_550e8400-e29b-41d4-a716-446655440000.dat
        """
        data_dir = get_file_storage_dir()
        diary_dir = data_dir / "secure" / "entries" / "text"
        diary_dir.mkdir(parents=True, exist_ok=True)
        
        filename = f"diary_{entry_uuid}.dat"
        return diary_dir / filename
    
    @staticmethod
    def calculate_day_of_week(entry_date: date) -> int:
        """
        Calculate day of week for database storage.
        
        Returns 0=Sunday, 1=Monday, ..., 6=Saturday to align with SQLite strftime('%w')
        and UI expectations.
        """
        # Python weekday(): Monday=0..Sunday=6 - convert to Sunday=0..Saturday=6
        return (entry_date.weekday() + 1) % 7
    
    @staticmethod
    async def get_entry_tags(db: AsyncSession, entry_uuid: str) -> List[str]:
        """Get tag names for a diary entry."""
        result = await db.execute(
            select(Tag.name)
            .select_from(diary_entry_tags.join(Tag))
            .where(diary_entry_tags.c.diary_entry_uuid == entry_uuid)
        )
        return [row[0] for row in result.fetchall()]
    
    @staticmethod
    async def get_tags_for_entries(db: AsyncSession, entry_uuids: List[str]) -> Dict[str, List[str]]:
        """Fetch tags for multiple diary entries in a single query."""
        if not entry_uuids:
            return {}

        result = await db.execute(
            select(diary_entry_tags.c.diary_entry_uuid, Tag.name)
            .select_from(diary_entry_tags.join(Tag))
            .where(diary_entry_tags.c.diary_entry_uuid.in_(entry_uuids))
        )

        tag_map: Dict[str, List[str]] = {}
        for entry_uuid, tag_name in result.fetchall():
            tag_map.setdefault(entry_uuid, []).append(tag_name)
        return tag_map
    
    @staticmethod
    async def create_entry(
        db: AsyncSession,
        user_uuid: str,
        entry_data: DiaryEntryCreate,
        diary_key: bytes
    ) -> DiaryEntryResponse:
        """
        Create a new diary entry with file-based encrypted storage.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_data: Entry creation data
            diary_key: Decrypted diary key for encryption
            
        Returns:
            DiaryEntryResponse with created entry data
        """
        from app.services.diary_metadata_service import diary_metadata_service
        
        logger.info(f"Creating diary entry for user {user_uuid} on {entry_data.date}")
        
        entry_date = datetime.combine(entry_data.date, datetime.min.time())
        day_of_week = DiaryCRUDService.calculate_day_of_week(entry_data.date)
        
        # Upsert daily metadata snapshot for this day
        daily_metadata = await diary_metadata_service.get_or_create_daily_metadata(
            db=db,
            user_uuid=user_uuid,
            entry_date=entry_date,
            nepali_date=entry_data.nepali_date,
            metrics=entry_data.daily_metrics or {},
            daily_income=entry_data.daily_income,
            daily_expense=entry_data.daily_expense,
            is_office_day=entry_data.is_office_day,
        )

        entry = DiaryEntry(
            uuid=str(uuid_lib.uuid4()),
            date=entry_date,
            title=entry_data.title,
            file_count=0,
            content_length=entry_data.content_length or 0,
            content_file_path="",
            file_hash="",
            mood=entry_data.mood,
            weather_code=entry_data.weather_code,
            location=entry_data.location,
            is_template=entry_data.is_template,
            from_template_id=entry_data.from_template_id,
            created_by=user_uuid,
            encryption_iv=entry_data.encryption_iv,
            encryption_tag=None,
        )
        
        db.add(entry)
        await db.flush()
        await db.refresh(entry)
        
        # Persist encrypted content to TEMPORARY location first
        final_file_path = DiaryCRUDService.generate_diary_file_path(entry.uuid)
        temp_file_path = final_file_path.parent / f"temp_{final_file_path.name}"
        
        file_result = write_encrypted_file(
            dest_path=temp_file_path,
            iv_b64=entry_data.encryption_iv,
            encrypted_blob_b64=entry_data.encrypted_blob,
            original_extension="",
        )
        
        entry.content_file_path = str(temp_file_path)  # update to final after successful move
        entry.file_hash = file_result["file_hash"]
        entry.encryption_tag = file_result.get("tag_b64")
        if entry_data.content_length is not None:
            entry.content_length = entry_data.content_length
        
        await db.commit()
        
        # SECURITY: Move encrypted file to final location ONLY after successful DB commit
        try:
            import os
            os.replace(temp_file_path, final_file_path)
            entry.content_file_path = str(final_file_path)
            await db.commit()
            logger.info(f"SUCCESS: Diary entry file moved to final location: {final_file_path}")
        except Exception as move_error:
            logger.exception("ERROR: Failed to move diary entry file to final location")
            # Clean up temp file
            try:
                if await asyncio.to_thread(temp_file_path.exists):
                    await asyncio.to_thread(temp_file_path.unlink)
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Failed to move encrypted diary entry file to final storage location") from move_error
        
        await db.refresh(entry)
        
        if entry_data.tags:
            await tag_service.handle_tags(db, entry, entry_data.tags, user_uuid, ModuleType.DIARY, diary_entry_tags)
            await db.commit()
        
        # Index in search
        await search_service.index_item(db, entry, 'diary')
        await db.commit()
        
        tags = await DiaryCRUDService.get_entry_tags(db, entry.uuid)
        daily_metrics = json.loads(daily_metadata.default_habits_json) if daily_metadata and daily_metadata.default_habits_json else {}
        
        response = DiaryEntryResponse(
            uuid=entry.uuid,
            date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
            title=entry.title,
            encrypted_blob="",  # SECURITY: Never return decrypted content in responses
            encryption_iv=entry.encryption_iv,
            mood=entry.mood,
            weather_code=entry.weather_code,
            location=entry.location,
            daily_metrics=daily_metrics,
            daily_income=daily_metadata.daily_income if daily_metadata else 0,
            daily_expense=daily_metadata.daily_expense if daily_metadata else 0,
            is_office_day=daily_metadata.is_office_day if daily_metadata else False,
            nepali_date=daily_metadata.nepali_date if daily_metadata else entry_data.nepali_date,
            is_template=entry.is_template,
            from_template_id=entry.from_template_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            file_count=entry.file_count,
            tags=tags,
            content_length=entry.content_length,
        )
        return response
    
    @staticmethod
    async def list_entries(
        db: AsyncSession,
        user_uuid: str,
        diary_key: bytes,
        year: Optional[int] = None,
        month: Optional[int] = None,
        mood: Optional[int] = None,
        templates: bool = False,
        search_title: Optional[str] = None,
        day_of_week: Optional[int] = None,
        limit: int = 20,
        offset: int = 0
    ) -> List[DiaryEntrySummary]:
        """
        List diary entries with filtering. Uses FTS5 for text search if search_title is provided.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            diary_key: Decrypted diary key
            year: Filter by year
            month: Filter by month
            mood: Filter by mood
            templates: Filter by template status
            search_title: Search by title/tags/metadata
            day_of_week: Filter by day of week (0=Sun, 1=Mon..)
            limit: Maximum entries to return
            offset: Number of entries to skip
            
        Returns:
            List of DiaryEntrySummary
        """
        # Subquery to count documents per entry (using document_diary association)
        from app.models.associations import document_diary
        file_count_subquery = (
            select(document_diary.c.diary_entry_uuid, func.count(document_diary.c.document_uuid).label("file_count"))
            .group_by(document_diary.c.diary_entry_uuid)
            .subquery()
        )

        daily_metadata_alias = aliased(DiaryDailyMetadata)
        summaries = []
        
        if search_title:
            # Use unified FTS5 search
            fts_results = await search_service.search(db, user_uuid, search_title, item_types=["diary"], limit=limit)

            if not fts_results:
                return []

            # Extract UUIDs from FTS results
            uuid_list = [r["uuid"] for r in fts_results if r["type"] == "diary"]
            if not uuid_list:
                return []

            # Fetch full rows, preserving FTS5 order
            entry_query = (
                select(
                    DiaryEntry.uuid,
                    DiaryEntry.title,
                    DiaryEntry.date,
                    DiaryEntry.mood,
                    DiaryEntry.weather_code,
                    DiaryEntry.location,
                    DiaryEntry.is_template,
                    DiaryEntry.from_template_id,
                    DiaryEntry.created_at,
                    DiaryEntry.updated_at,
                    func.coalesce(file_count_subquery.c.file_count, 0).label("file_count"),
                    daily_metadata_alias.default_habits_json.label("default_habits_json"),
                    daily_metadata_alias.nepali_date.label("nepali_date"),
                    DiaryEntry.content_length,
                )
                .outerjoin(file_count_subquery, DiaryEntry.uuid == file_count_subquery.c.diary_entry_uuid)
                .outerjoin(daily_metadata_alias, and_(
                    DiaryEntry.created_by == daily_metadata_alias.created_by,
                    func.date(DiaryEntry.date) == func.date(daily_metadata_alias.date)
                ))
                .where(and_(DiaryEntry.uuid.in_(uuid_list), DiaryEntry.created_by == user_uuid))
            )
            
            # Apply filters
            if year and month:
                start = datetime(year, month, 1)
                if month == 12:
                    end = datetime(year + 1, 1, 1)
                else:
                    end = datetime(year, month + 1, 1)
                entry_query = entry_query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
            elif year:
                start = datetime(year, 1, 1)
                end = datetime(year + 1, 1, 1)
                entry_query = entry_query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
            if mood:
                entry_query = entry_query.where(DiaryEntry.mood == mood)
            if day_of_week is not None:
                entry_query = entry_query.where(DiaryEntry.day_of_week == day_of_week)
            if templates is True:
                entry_query = entry_query.where(DiaryEntry.is_template.is_(True))
            elif templates is False:
                entry_query = entry_query.where(DiaryEntry.is_template.is_(False))
                
            entry_result = await db.execute(entry_query)
            entry_rows = entry_result.fetchall()
            
            # Map uuid to row for FTS5 order
            row_map = {row.uuid: row for row in entry_rows}
            tag_map = await DiaryCRUDService.get_tags_for_entries(db, list(row_map.keys()))
            
            for uuid in uuid_list:
                r = row_map.get(uuid)
                if r:
                    summary = DiaryEntrySummary(
                        uuid=r.uuid,
                        date=r.date.date() if isinstance(r.date, datetime) else r.date,
                        title=r.title,
                        mood=r.mood,
                        weather_code=r.weather_code,
                        location=r.location,
                        daily_metrics=json.loads(r.default_habits_json) if r.default_habits_json else {},
                        nepali_date=r.nepali_date,
                        is_template=r.is_template,
                        from_template_id=r.from_template_id,
                        created_at=r.created_at,
                        file_count=r.file_count,
                        encrypted_blob="",  # SECURITY: Never return decrypted content
                        encryption_iv="",
                        tags=tag_map.get(uuid, []),
                        content_length=r.content_length,
                    )
                    summaries.append(summary)
            return summaries
        else:
            # Default: no search, use existing logic
            query = (
                select(
                    DiaryEntry.uuid,
                    DiaryEntry.title,
                    DiaryEntry.date,
                    DiaryEntry.mood,
                    DiaryEntry.weather_code,
                    DiaryEntry.location,
                    DiaryEntry.is_template,
                    DiaryEntry.from_template_id,
                    DiaryEntry.created_at,
                    DiaryEntry.updated_at,
                    func.coalesce(file_count_subquery.c.file_count, 0).label("file_count"),
                    daily_metadata_alias.default_habits_json.label("default_habits_json"),
                    daily_metadata_alias.nepali_date.label("nepali_date"),
                    DiaryEntry.content_length,
                )
                .outerjoin(file_count_subquery, DiaryEntry.uuid == file_count_subquery.c.diary_entry_uuid)
                .outerjoin(daily_metadata_alias, and_(
                    DiaryEntry.created_by == daily_metadata_alias.created_by,
                    func.date(DiaryEntry.date) == func.date(daily_metadata_alias.date)
                ))
                .where(DiaryEntry.created_by == user_uuid)
            )
            
            # Apply filters
            if year and month:
                start = datetime(year, month, 1)
                if month == 12:
                    end = datetime(year + 1, 1, 1)
                else:
                    end = datetime(year, month + 1, 1)
                query = query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
            elif year:
                start = datetime(year, 1, 1)
                end = datetime(year + 1, 1, 1)
                query = query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
            if mood:
                query = query.where(DiaryEntry.mood == mood)
            if day_of_week is not None:
                query = query.where(DiaryEntry.day_of_week == day_of_week)
            if templates is True:
                query = query.where(DiaryEntry.is_template.is_(True))
            elif templates is False:
                query = query.where(DiaryEntry.is_template.is_(False))
                
            query = query.order_by(DiaryEntry.date.desc()).offset(offset).limit(limit)
            result = await db.execute(query)
            entry_rows = result.all()
            tag_map = await DiaryCRUDService.get_tags_for_entries(db, [row.uuid for row in entry_rows])
            
            for row in entry_rows:
                summary = DiaryEntrySummary(
                    uuid=row.uuid,
                    date=row.date.date() if isinstance(row.date, datetime) else row.date,
                    title=row.title,
                    mood=row.mood,
                    weather_code=row.weather_code,
                    location=row.location,
                    daily_metrics=json.loads(row.default_habits_json) if row.default_habits_json else {},
                    nepali_date=row.nepali_date,
                    is_template=row.is_template,
                    from_template_id=row.from_template_id,
                    created_at=row.created_at,
                    file_count=row.file_count,
                    encrypted_blob="",  # SECURITY: Never return decrypted content
                    encryption_iv="",
                    tags=tag_map.get(row.uuid, []),
                    content_length=row.content_length,
                )
                summaries.append(summary)
            return summaries
    
    @staticmethod
    async def get_entries_by_date(
        db: AsyncSession,
        user_uuid: str,
        entry_date: date,
        diary_key: bytes
    ) -> List[DiaryEntryResponse]:
        """
        Get all diary entries for a specific date.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_date: Date to get entries for
            diary_key: Decrypted diary key
            
        Returns:
            List of DiaryEntryResponse with decrypted content
        """
        # Check if diary is unlocked
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        # Query entries for the specific date
        query = (
            select(DiaryEntry)
            .where(
                and_(
                    DiaryEntry.created_by == user_uuid,
                    func.date(DiaryEntry.date) == entry_date,
                    DiaryEntry.is_deleted.is_(False)
                )
            )
            .order_by(DiaryEntry.created_at.desc())
        )
        
        result = await db.execute(query)
        entries = result.scalars().all()
        
        if not entries:
            return []
        
        # Get daily metadata for this date
        from app.services.diary_metadata_service import diary_metadata_service
        try:
            daily_metadata = await diary_metadata_service.get_daily_metadata(
                db, user_uuid, entry_date.strftime("%Y-%m-%d")
            )
        except ValueError:
            daily_metadata = None
        
        responses = []
        for entry in entries:
            # SECURITY: Never decrypt content in list responses
            # Content should only be decrypted when explicitly requested via get_entry_by_ref
            encrypted_blob = ""
            
            # Get tags
            tags = await DiaryCRUDService.get_entry_tags(db, entry.uuid)
            
            response = DiaryEntryResponse(
                uuid=entry.uuid,
                date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
                title=entry.title,
                mood=entry.mood,
                weather_code=entry.weather_code,
                location=entry.location,
                daily_metrics=daily_metadata.metrics if daily_metadata else {},
                daily_income=daily_metadata.daily_income if daily_metadata else 0,
                daily_expense=daily_metadata.daily_expense if daily_metadata else 0,
                is_office_day=daily_metadata.is_office_day if daily_metadata else False,
                nepali_date=daily_metadata.nepali_date if daily_metadata else None,
                is_template=entry.is_template,
                from_template_id=entry.from_template_id,
                created_at=entry.created_at,
                updated_at=entry.updated_at,
                file_count=entry.file_count,
                tags=tags,
                content_length=entry.content_length,
            )
            responses.append(response)
        
        return responses
    
    @staticmethod
    async def get_entry_by_ref(
        db: AsyncSession,
        user_uuid: str,
        entry_ref: str,
        diary_key: bytes
    ) -> DiaryEntryResponse:
        """
        Get a single diary entry by UUID or date.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_ref: Entry UUID or date string
            diary_key: Decrypted diary key
            
        Returns:
            DiaryEntryResponse with decrypted content
        """
        # Check if diary is unlocked
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        # Try to parse as date first, then as UUID
        try:
            entry_date = datetime.strptime(entry_ref, "%Y-%m-%d").date()
            # Get entries by date and return the first one
            entries = await DiaryCRUDService.get_entries_by_date(db, user_uuid, entry_date, diary_key)
            if not entries:
                raise HTTPException(status_code=404, detail=f"No diary entry found for date {entry_date}")
            return entries[0]  # Return first entry for the date
        except ValueError:
            # Not a date, try as UUID
            pass
        
        # Query by UUID
        query = select(DiaryEntry).where(
            and_(
                DiaryEntry.uuid == entry_ref,
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.is_deleted.is_(False)
            )
        )
        
        result = await db.execute(query)
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise HTTPException(status_code=404, detail=f"Diary entry not found: {entry_ref}")
        
        # For single entry retrieval, we don't decrypt on server side
        # Client handles decryption. Return empty blob for security.
        encrypted_blob = ""
        
        # Get daily metadata
        from app.services.diary_metadata_service import diary_metadata_service
        try:
            daily_metadata = await diary_metadata_service.get_daily_metadata(
                db, user_uuid, entry.date.strftime("%Y-%m-%d")
            )
        except ValueError:
            daily_metadata = None
        
        # Get tags
        tags = await DiaryCRUDService.get_entry_tags(db, entry.uuid)
        
        response = DiaryEntryResponse(
            uuid=entry.uuid,
            date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
            title=entry.title,
            mood=entry.mood,
            weather_code=entry.weather_code,
            location=entry.location,
            daily_metrics=daily_metadata.metrics if daily_metadata else {},
            daily_income=daily_metadata.daily_income if daily_metadata else 0,
            daily_expense=daily_metadata.daily_expense if daily_metadata else 0,
            is_office_day=daily_metadata.is_office_day if daily_metadata else False,
            nepali_date=daily_metadata.nepali_date if daily_metadata else None,
            is_template=entry.is_template,
            from_template_id=entry.from_template_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            file_count=entry.file_count,
            tags=tags,
            content_length=entry.content_length,
        )
        return response
    
    @staticmethod
    async def get_entry_summary_by_ref(
        db: AsyncSession,
        user_uuid: str,
        entry_ref: str
    ) -> DiaryEntrySummary:
        """
        Get a single diary entry by UUID or date without decrypted content (for security).
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_ref: Entry UUID or date string
            
        Returns:
            DiaryEntrySummary without decrypted content
        """
        # Try to parse as date first, then as UUID
        try:
            entry_date = datetime.strptime(entry_ref, "%Y-%m-%d").date()
            # Get entries by date and return the first one
            # fetch summaries without requiring diary_key (bypass gating)
            entries = await DiaryCRUDService.get_entries_by_date(db, user_uuid, entry_date, diary_key=b"")
            if not entries:
                raise HTTPException(status_code=404, detail=f"No diary entry found for date {entry_date}")
            return entries[0]  # Return first entry for the date
        except ValueError:
            # Not a date, try as UUID
            pass
        
        # Query by UUID
        query = select(DiaryEntry).where(
            and_(
                DiaryEntry.uuid == entry_ref,
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.is_deleted.is_(False)
            )
        )
        
        result = await db.execute(query)
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise HTTPException(status_code=404, detail=f"Diary entry not found: {entry_ref}")
        
        # Get daily metadata
        from app.services.diary_metadata_service import diary_metadata_service
        try:
            daily_metadata = await diary_metadata_service.get_daily_metadata(
                db, user_uuid, entry.date.strftime("%Y-%m-%d")
            )
        except ValueError:
            daily_metadata = None
        
        # Get tags
        tags = await DiaryCRUDService.get_entry_tags(db, entry.uuid)
        
        response = DiaryEntrySummary(
            uuid=entry.uuid,
            date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
            title=entry.title,
            mood=entry.mood,
            weather_code=entry.weather_code,
            location=entry.location,
            daily_metrics=daily_metadata.metrics if daily_metadata else {},
            nepali_date=daily_metadata.nepali_date if daily_metadata else None,
            is_template=entry.is_template,
            from_template_id=entry.from_template_id,
            created_at=entry.created_at,
            file_count=entry.file_count,
            tags=tags,
            content_length=entry.content_length,
            content_available=False,
        )
        return response
    
    @staticmethod
    async def update_entry(
        db: AsyncSession,
        user_uuid: str,
        entry_ref: str,
        updates: DiaryEntryUpdate,
        diary_key: bytes
    ) -> DiaryEntryResponse:
        """
        Update a diary entry.
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_ref: Entry UUID
            updates: Update data
            diary_key: Decrypted diary key
            
        Returns:
            Updated DiaryEntryResponse
        """
        # Check if diary is unlocked
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        # Get existing entry
        query = select(DiaryEntry).where(
            and_(
                DiaryEntry.uuid == entry_ref,
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.is_deleted.is_(False)
            )
        )
        
        result = await db.execute(query)
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise HTTPException(status_code=404, detail=f"Diary entry not found: {entry_ref}")
        
        # Update fields
        if updates.title is not None:
            entry.title = updates.title
        if updates.mood is not None:
            entry.mood = updates.mood
        if updates.weather_code is not None:
            entry.weather_code = updates.weather_code
        if updates.location is not None:
            entry.location = updates.location
        if updates.is_template is not None:
            entry.is_template = updates.is_template
        if updates.from_template_id is not None:
            entry.from_template_id = updates.from_template_id
        
        # Update encrypted content if provided
        if updates.encrypted_blob and updates.encryption_iv:
            # Write new encrypted content
            final_file_path = DiaryCRUDService.generate_diary_file_path(entry.uuid)
            temp_file_path = final_file_path.parent / f"temp_{final_file_path.name}"
            
            file_result = write_encrypted_file(
                dest_path=temp_file_path,
                iv_b64=updates.encryption_iv,
                encrypted_blob_b64=updates.encrypted_blob,
                original_extension="",
            )
            
            entry.encryption_iv = updates.encryption_iv
            entry.file_hash = file_result["file_hash"]
            entry.encryption_tag = file_result.get("tag_b64")
            entry.content_length = len(base64.b64decode(updates.encrypted_blob))
            
            await db.commit()
            
            # Move to final location
            try:
                temp_file_path.rename(final_file_path)
            except Exception as e:
                logger.error(f"Failed to move updated diary file: {e}")
                raise HTTPException(status_code=500, detail="Failed to move updated diary entry file to final storage location")
        
        # Update daily metadata if provided
        if (updates.daily_metrics is not None or 
            updates.daily_income is not None or 
            updates.daily_expense is not None or 
            updates.is_office_day is not None or 
            updates.nepali_date is not None):
            
            from app.services.diary_metadata_service import diary_metadata_service
            await diary_metadata_service.get_or_create_daily_metadata(
                db=db,
                user_uuid=user_uuid,
                entry_date=entry.date,
                nepali_date=updates.nepali_date,
                metrics=updates.daily_metrics or {},
                daily_income=updates.daily_income,
                daily_expense=updates.daily_expense,
                is_office_day=updates.is_office_day,
            )
        
        # Update tags if provided
        if updates.tags is not None:
            await tag_service.handle_tags(db, entry, updates.tags, user_uuid, ModuleType.DIARY, diary_entry_tags)
        
        entry.updated_at = datetime.now(NEPAL_TZ)
        await db.commit()
        await db.refresh(entry)
        
        # Re-index in search
        await search_service.index_item(db, entry, 'diary')
        await db.commit()
        
        # Return updated entry (without decrypted content for security)
        return await DiaryCRUDService.get_entry_summary_by_ref(db, user_uuid, entry_ref)
    
    @staticmethod
    async def delete_entry(
        db: AsyncSession,
        user_uuid: str,
        entry_ref: str
    ) -> None:
        """
        Delete a diary entry (soft delete).
        
        Args:
            db: Database session
            user_uuid: User's UUID
            entry_ref: Entry UUID
        """
        # Get existing entry
        query = select(DiaryEntry).where(
            and_(
                DiaryEntry.uuid == entry_ref,
                DiaryEntry.created_by == user_uuid,
                DiaryEntry.is_deleted.is_(False)
            )
        )
        
        result = await db.execute(query)
        entry = result.scalar_one_or_none()
        
        if not entry:
            raise HTTPException(status_code=404, detail=f"Diary entry not found: {entry_ref}")
        
        # Soft delete
        entry.is_deleted = True
        entry.updated_at = datetime.now(NEPAL_TZ)
        
        await db.commit()
        
        # Remove from search index
        await search_service.remove_item(db, entry.uuid, 'diary')
        await db.commit()

    # Habit tracking methods - integrating with diary workflow
    @staticmethod
    async def update_habits_for_diary_day(
        db: AsyncSession,
        user_uuid: str,
        target_date: str,
        habits_data: Dict[str, Any],
        units: Optional[Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Update habits for a specific diary day using the metadata service.

        Args:
            db: Database session
            user_uuid: User's UUID
            target_date: Date string in YYYY-MM-DD format
            habits_data: Dictionary of habit values
            units: Dictionary of habit units

        Returns:
            Updated habits data with streaks
        """
        from app.services.diary_metadata_service import diary_metadata_service

        logger.info(f"Updating habits for user {user_uuid} on {target_date}")

        try:
            habits_result = await diary_metadata_service.update_daily_habits(
                db=db,
                user_uuid=user_uuid,
                target_date=target_date,
                habits_data=habits_data,
                units=units
            )

            logger.info(f"Successfully updated {len(habits_result)} habits for {target_date}")
            return habits_result

        except Exception as e:
            logger.error(f"Failed to update habits for {target_date}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to update habits for {target_date}"
            )

    @staticmethod
    async def get_habits_for_diary_day(
        db: AsyncSession,
        user_uuid: str,
        target_date: str
    ) -> Dict[str, Any]:
        """
        Get habits for a specific diary day.

        Args:
            db: Database session
            user_uuid: User's UUID
            target_date: Date string in YYYY-MM-DD format

        Returns:
            Dictionary of habits data or empty dict if not found
        """
        from app.services.diary_metadata_service import diary_metadata_service

        try:
            daily_metadata = await diary_metadata_service.get_daily_metadata(
                db=db,
                user_uuid=user_uuid,
                target_date=target_date
            )

            if daily_metadata and daily_metadata.defined_habits_json:
                habits = json.loads(daily_metadata.defined_habits_json)
                logger.debug(f"Found {len(habits)} habits for {target_date}")
                return habits

            return {}

        except ValueError:
            # No daily metadata found
            return {}
        except Exception as e:
            logger.error(f"Failed to get habits for {target_date}: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to retrieve habits for {target_date}"
            )

    @staticmethod
    async def get_habit_analytics_for_user(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get habit analytics for a user using the metadata service.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to analyze

        Returns:
            Habit analytics data
        """
        from app.services.diary_metadata_service import diary_metadata_service

        try:
            analytics = await diary_metadata_service.get_habit_analytics(
                db=db,
                user_uuid=user_uuid,
                days=days
            )

            logger.info(f"Retrieved habit analytics for user {user_uuid} over {days} days")
            return analytics

        except Exception as e:
            logger.error(f"Failed to get habit analytics: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve habit analytics"
            )

    @staticmethod
    async def get_habit_insights_for_user(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Get habit insights for a user using the metadata service.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to analyze

        Returns:
            Habit insights data
        """
        from app.services.diary_metadata_service import diary_metadata_service

        try:
            insights = await diary_metadata_service.get_habit_insights(
                db=db,
                user_uuid=user_uuid,
                days=days
            )

            logger.info(f"Retrieved habit insights for user {user_uuid} over {days} days")
            return insights

        except Exception as e:
            logger.error(f"Failed to get habit insights: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve habit insights"
            )

    @staticmethod
    async def get_active_habits_for_user(
        db: AsyncSession,
        user_uuid: str,
        days: int = 30
    ) -> List[str]:
        """
        Get list of active habits for a user using the metadata service.

        Args:
            db: Database session
            user_uuid: User's UUID
            days: Number of days to look back

        Returns:
            List of active habit names
        """
        from app.services.diary_metadata_service import diary_metadata_service

        try:
            active_habits = await diary_metadata_service.get_active_habits(
                db=db,
                user_uuid=user_uuid,
                days=days
            )

            logger.info(f"Found {len(active_habits)} active habits for user {user_uuid}")
            return active_habits

        except Exception as e:
            logger.error(f"Failed to get active habits: {e}")
            raise HTTPException(
                status_code=500,
                detail="Failed to retrieve active habits"
            )

    @staticmethod
    async def get_habit_streak_for_user(
        db: AsyncSession,
        user_uuid: str,
        habit_key: str,
        end_date: Optional[str] = None
    ) -> int:
        """
        Get current streak for a specific habit using the metadata service.

        Args:
            db: Database session
            user_uuid: User's UUID
            habit_key: Habit name/key
            end_date: End date for streak calculation (defaults to today)

        Returns:
            Current streak count
        """
        from app.services.diary_metadata_service import diary_metadata_service

        try:
            streak = await diary_metadata_service.calculate_habit_streak(
                db=db,
                user_uuid=user_uuid,
                habit_key=habit_key,
                end_date=end_date
            )

            logger.info(f"Retrieved streak {streak} for habit '{habit_key}' for user {user_uuid}")
            return streak

        except Exception as e:
            logger.error(f"Failed to get habit streak for '{habit_key}': {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to retrieve streak for habit '{habit_key}'"
            )

# DiaryFile-related methods removed - using Document + document_diary association instead


# Global instance
diary_crud_service = DiaryCRUDService()
