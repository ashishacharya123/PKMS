"""Tag utilities router – autocomplete and future tag endpoints"""

# noqa: E501
from typing import List, Tuple, Dict
import time

from rapidfuzz import process, fuzz

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.tag import Tag
from app.auth.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/tags", tags=["Tags"])

# Simple in-process cache: {(user_id, query): (timestamp, suggestions)}
_CACHE: Dict[Tuple[int, str], Tuple[float, List[str]]] = {}
_CACHE_TTL_S = 5  # seconds


@router.get("/autocomplete", response_model=List[str])
async def autocomplete_tags(
    q: str = Query("", alias="query", min_length=0, max_length=100),
    limit: int = Query(5, le=20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return tag name suggestions for the current user.

    Uses simple prefix+fuzzy matching over the user's existing tag names.
    """
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