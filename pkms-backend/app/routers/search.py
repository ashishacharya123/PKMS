from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.database import get_db as get_db_session
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.services.search_service import search_service
from app.utils.security import sanitize_search_query
from typing import List, Optional, Dict, Any

router = APIRouter()
logger = logging.getLogger("uvicorn")

@router.get("/search", tags=["Search"])
async def unified_search(
    q: str = Query(..., description="Search query"),
    item_types: Optional[List[str]] = Query(None, description="Filter by item types"),
    has_attachments: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    try:
        query = sanitize_search_query(q)
        results = await search_service.search(
            db,
            current_user.uuid,
            query,
            item_types=item_types,
            has_attachments=has_attachments,
            limit=limit,
        )
        return results
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unified search failed")
        raise HTTPException(status_code=500, detail="Search failed") from None

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
        logger.exception(f"Error during manual re-index for user {current_user.uuid}: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred during re-indexing.") from e