"""Tag utilities router - autocomplete and future tag endpoints"""

# noqa: E501
from typing import List, Tuple, Dict, Optional
import time

from rapidfuzz import process, fuzz

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tag import Tag
from app.auth.dependencies import get_current_user
from app.schemas.tag import TagResponse
from app.models.user import User

router = APIRouter(tags=["Tags"])

# Simple in-process cache: {(created_by, query): (timestamp, suggestions)}
_CACHE: Dict[Tuple[str, str], Tuple[float, List[str]]] = {}
_CACHE_TTL_S = 5  # seconds


@router.get("/autocomplete", response_model=List[TagResponse])
async def autocomplete_tags(
    q: str = Query("", description="Tag search query"),
    module_type: Optional[str] = Query(None, description="Filter by module type"),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get tag autocomplete suggestions for tagging interface."""
    # Check cache first
    cache_key = (current_user.uuid, q.lower())
    now = time.time()
    if cache_key in _CACHE:
        ts, cached = _CACHE[cache_key]
        if now - ts < _CACHE_TTL_S:
            return cached[:limit]

    # Fetch all tags for this user (full objects for response)
    result = await db.execute(
        select(Tag).where(
            and_(
                Tag.created_by == current_user.uuid,
                Tag.is_archived == False  # Exclude archived tags
            )
        )
    )
    all_tags = result.scalars().all()
    
    # Create lookup map: name -> Tag object (for fuzzy search)
    tag_map = {tag.name: tag for tag in all_tags}
    tag_names = list(tag_map.keys())  # Names for fuzzy matching

    if not tag_names:
        return []

    # If no query supplied, return most-used tags (usage_count desc) then alpha
    if not q:
        result = await db.execute(
            select(Tag)
            .where(
                and_(
                    Tag.created_by == current_user.uuid,
                    Tag.is_archived == False
                )
            )
            .order_by(Tag.usage_count.desc(), Tag.name)
            .limit(limit)
        )
        # Map to response format
        return [
            TagResponse(
                uuid=tag.uuid,
                name=tag.name,
                usage_count=tag.usage_count
            )
            for tag in result.scalars().all()
        ]

    q_lower = q.lower()

    # 1. Prefix matches first
    prefix_matches = [name for name in tag_names if name.lower().startswith(q_lower)]

    # 2. Fuzzy matches using RapidFuzz for speed/quality
    fuzzy_pool = [name for name in tag_names if name not in prefix_matches]
    if fuzzy_pool:
        fuzzy_results = process.extract(
            q_lower,
            fuzzy_pool,
            scorer=fuzz.QRatio,
            limit=limit,
            score_cutoff=40,
        )
        fuzzy_matches = [match for match, score, _ in fuzzy_results]
    else:
        fuzzy_matches = []

    suggestions = prefix_matches + [m for m in fuzzy_matches if m not in prefix_matches]

    # Convert matched names back to full Tag objects
    final_tag_objects = [tag_map[name] for name in suggestions if name in tag_map]
    
    # Map to response format
    response_list = [
        TagResponse(
            uuid=tag.uuid,
            name=tag.name,
            usage_count=tag.usage_count
        )
        for tag in final_tag_objects[:limit]  # Apply limit here
    ]

    # Cache the structured response (not just strings)
    _CACHE[cache_key] = (now, response_list)

    return response_list


# Broken endpoints deleted - /autocomplete is now superior 