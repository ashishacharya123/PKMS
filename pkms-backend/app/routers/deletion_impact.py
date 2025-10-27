"""
Deletion Impact Router - Unified endpoint for analyzing deletion impact

Provides a single endpoint that can analyze deletion impact for any item type:
- documents, notes, todos, projects, diary, archive
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.services.deletion_impact_service import deletion_impact_service

logger = logging.getLogger(__name__)

router = APIRouter()

# Valid item types
ItemType = Literal["document", "note", "todo", "project", "diary", "archive"]


@router.get("/analyze/{item_type}/{item_uuid}")
async def analyze_deletion_impact(
    item_type: ItemType,
    item_uuid: str,
    mode: str = Query("soft", pattern="^(soft|hard)$"),  # NEW parameter
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Analyzes what will happen if this item is deleted.
    UI uses this to show warnings and "unlink-only" option.
    
    Args:
        item_type: Type of item to analyze ('document', 'note', 'todo', 'project', 'diary', 'archive')
        item_uuid: UUID of the item to analyze
        
    Returns:
        Dict with can_delete, unlink_only_allowed, warnings, blockers, orphan_items, preserved_items
    """
    try:
        return await deletion_impact_service.analyze_deletion_impact(
            db, item_type, item_uuid, current_user.uuid, mode
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error analyzing %s deletion impact", item_type)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="Failed to analyze deletion impact"
        ) from e
