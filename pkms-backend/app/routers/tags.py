"""Tag utilities router – autocomplete and future tag endpoints"""

# noqa: E501
from typing import List, Tuple, Dict, Optional
import time

from rapidfuzz import process, fuzz

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tag import Tag
from app.auth.dependencies import get_current_user
from app.schemas.tag import TagAutocompleteResponse, TagResponse
from app.models.user import User

router = APIRouter(tags=["Tags"])

# Simple in-process cache: {(user_id, query): (timestamp, suggestions)}
_CACHE: Dict[Tuple[int, str], Tuple[float, List[str]]] = {}
_CACHE_TTL_S = 5  # seconds


@router.get("/autocomplete")
async def autocomplete_tags(
    q: str = Query("", description="Tag search query"),
    module_type: Optional[str] = Query(None, description="Filter by module type"),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get tag autocomplete suggestions for tagging interface."""
    # Check cache first
    cache_key = (current_user.id, q.lower())
    now = time.time()
    if cache_key in _CACHE:
        ts, cached = _CACHE[cache_key]
        if now - ts < _CACHE_TTL_S:
            return cached[:limit]

    # Fetch all tag names for this user (distinct names)
    result = await db.execute(
        select(Tag.name).where(Tag.user_id == current_user.id)
    )
    tag_names = [row[0] for row in result.fetchall()]

    if not tag_names:
        return []

    # If no query supplied, return most-used tags (usage_count desc) then alpha
    if not q:
        result = await db.execute(
            select(Tag.name)
            .where(Tag.user_id == current_user.id)
            .order_by(Tag.usage_count.desc(), Tag.name)
            .limit(limit)
        )
        return [row[0] for row in result.fetchall()]

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

    final_list = suggestions[:limit]

    # Save in cache
    _CACHE[cache_key] = (now, final_list)

    return final_list


@router.get("/autocomplete-enhanced", response_model=TagAutocompleteResponse)
async def autocomplete_tags_enhanced(
    q: str = Query("", description="Tag search query"),
    module_type: Optional[str] = Query(None, description="Filter by module type"),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get tag autocomplete suggestions in the format expected by the frontend."""
    
    if len(q.strip()) < 1:
        return TagAutocompleteResponse(tags=[])
    
    pattern = f"%{q.lower()}%"
    
    try:
        query = select(Tag.name, Tag.color, Tag.module_type).where(
            and_(
                Tag.user_id == current_user.id,
                Tag.name.ilike(pattern)
            )
        )
        
        query = query.distinct().order_by(Tag.name).limit(limit)
        
        result = await db.execute(query)
        tags_data = result.fetchall()
        
        tags = [
            TagResponse(
                name=name,
                color=color,
                module_type=tag_module_type
            )
            for name, color, tag_module_type in tags_data
        ]
        
        return TagAutocompleteResponse(tags=tags)
        
    except Exception as e:
        return TagAutocompleteResponse(tags=[])


@router.get("/advanced", response_model=TagAutocompleteResponse)
async def autocomplete_tags_advanced(
    q: str = Query("", description="Tag search query"),
    module_type: Optional[str] = Query(None, description="Filter by module type"),
    limit: int = Query(20, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Alias for autocomplete-enhanced to fix frontend routing."""
    return await autocomplete_tags_enhanced(q, module_type, limit, current_user, db) 