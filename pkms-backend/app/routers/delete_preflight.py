"""
Delete Preflight Router - Unified endpoint for checking item deletion safety

Provides a single endpoint that can check deletion safety for any item type:
- documents, notes, todos, note_files, diary_files
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Literal
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.services.link_count_service import link_count_service
from app.schemas.project import UnifiedDeletePreflightResponse

logger = logging.getLogger(__name__)

router = APIRouter()

# Valid item types
ItemType = Literal["document", "note", "todo", "note_file", "diary_file"]


@router.get("/{item_type}/{item_uuid}/delete-preflight", response_model=UnifiedDeletePreflightResponse)
async def get_delete_preflight(
    item_type: ItemType,
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get preflight information for any item type deletion.
    
    Args:
        item_type: Type of item to check ('document', 'note', 'todo', 'note_file', 'diary_file')
        item_uuid: UUID of the item to check
        
    Returns:
        UnifiedDeletePreflightResponse with link count and warning information
    """
    try:
        preflight_data = await link_count_service.get_delete_preflight(
            db, item_type, item_uuid, current_user.uuid
        )
        return UnifiedDeletePreflightResponse(**preflight_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error getting {item_type} delete preflight")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail=f"Failed to get preflight info: {str(e)}"
        )
