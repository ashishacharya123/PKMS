from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from ..dependencies import get_db_session, get_current_user
from ..models.user import User
from ..services.search_service import search_service

router = APIRouter()
logger = logging.getLogger("uvicorn")

@router.post("/search/reindex", status_code=200, tags=["Search"])
async def reindex_user_content(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
):
    """
    Manually triggers a full re-indexing of all content for the current user.
    This is useful if search results ever seem out of sync.
    """
    logger.info(f"Starting manual re-index for user: {current_user.uuid}")
    try:
        await search_service.bulk_index_user_content(db, current_user.uuid)
        logger.info(f"Successfully completed manual re-index for user: {current_user.uuid}")
        return {"status": "success", "message": "All your content has been successfully re-indexed."}
    except Exception as e:
        logger.error(f"Error during manual re-index for user {current_user.uuid}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An unexpected error occurred during re-indexing.")