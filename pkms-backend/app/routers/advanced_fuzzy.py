from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.utils.security import sanitize_search_query
from app.services.fuzzy_search_service import FuzzySearchService, SearchConfig

router = APIRouter(tags=["advanced-fuzzy-search"])

# Fuzzy search configuration constants
DEFAULT_FUZZY_THRESHOLD = 70  # Minimum fuzzy match score (0-100)
# Lower threshold = more results, higher threshold = more precise matches
# 70 is optimal balance for most use cases

DEFAULT_SEARCH_LIMIT = 30  # Maximum results to return per search
# Prevents overwhelming users with too many results
# Can be overridden per request via query parameter


def validate_and_parse_modules(modules: Optional[str]) -> List[str]:
    """
    Validate and parse comma-separated module parameter.
    Raises HTTPException(400) if invalid modules provided.
    Returns list of valid modules to search.
    
    Single source of truth: Uses FuzzySearchService.MODULE_CONFIGS
    """
    # Single source of truth - get allowed modules from service layer
    allowed_modules = set(FuzzySearchService.MODULE_CONFIGS.keys())
    
    if not modules:
        return list(allowed_modules)
    
    module_list = []
    invalid_modules = set()
    
    for m in modules.split(","):
        clean_module = m.strip().lower()
        if not clean_module:
            continue
        if clean_module in allowed_modules:
            module_list.append(clean_module)
        else:
            invalid_modules.add(clean_module)
    
    if invalid_modules:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid module(s): {', '.join(sorted(invalid_modules))}. "
                   f"Valid: {', '.join(sorted(allowed_modules))}"
        )
    
    if not module_list:
        raise HTTPException(
            status_code=400,
            detail="No valid modules specified"
        )
    
    return module_list


async def unified_fuzzy_search(
    db: AsyncSession,
    user_uuid: str,
    query: str,
    config: SearchConfig
) -> List[Dict[str, Any]]:
    """
    Unified fuzzy search endpoint - delegates to service layer.
    
    Router wrapper that forwards search requests to FuzzySearchService
    following the service layer architecture pattern.
    """
    return await FuzzySearchService.unified_fuzzy_search(db, user_uuid, query, config)


@router.get("/advanced-fuzzy-search")
async def advanced_fuzzy_search(
    query: str = Query(..., min_length=2, max_length=500),
    limit: int = Query(DEFAULT_SEARCH_LIMIT, ge=1, le=100),
    modules: str = Query(None, description="Comma-separated list of modules to search (todo,project,note,document,archive). Note: diary entries use dedicated FTS5 search."),
    fuzzy_threshold: int = Query(DEFAULT_FUZZY_THRESHOLD, ge=0, le=100, description="Minimum fuzzy match score (0-100)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Typo-tolerant fuzzy search using Python-based fuzzy matching (RapidFuzz).
    
    This endpoint loads items into memory and performs fuzzy string matching in Python.
    Best for: Typo-tolerant searches, forgiving queries, smaller datasets.
    
    PERFORMANCE WARNING: This search loads all matching items into memory for each module,
    then performs fuzzy matching in Python. For large datasets, this can be slow and memory-intensive.
    For fast, exact text search, use /search (FTS5) instead.
    
    Note: Diary entries are excluded from fuzzy search - use dedicated diary FTS5 interface.
    """
    # Validate and sanitize search query
    sanitized_query = sanitize_search_query(query)

    # Parse and validate modules param
    # Note: diary entries are excluded from global fuzzy search - use dedicated diary FTS5 interface
    module_list = validate_and_parse_modules(modules) if modules else None

    # Create config for advanced search (includes content)
    config = SearchConfig(
        modules=module_list,
        include_content=True,  # Advanced search includes content
        fuzzy_threshold=fuzzy_threshold,
        limit=limit
    )

    return await unified_fuzzy_search(db, current_user.uuid, sanitized_query, config)


@router.get("/fuzzy-search-light")
async def fuzzy_search_light(
    query: str = Query(..., min_length=2, max_length=500),
    limit: int = Query(DEFAULT_SEARCH_LIMIT, ge=1, le=100),
    modules: str = Query(None, description="Comma-separated list of modules to search (todo,project,note,document,archive). Note: diary entries use dedicated FTS5 search."),
    fuzzy_threshold: int = Query(DEFAULT_FUZZY_THRESHOLD, ge=0, le=100, description="Minimum fuzzy match score (0-100)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Lightweight typo-tolerant fuzzy search (title, description, tags only - NO full content).
    
    Similar to /advanced-fuzzy-search but excludes full content from matching, making it faster
    and less memory-intensive. Best for quick searches when you don't need content matching.
    
    PERFORMANCE WARNING: Still loads items into memory for fuzzy matching. For exact text search,
    use /search (FTS5) instead.
    """
    # Validate and sanitize search query
    sanitized_query = sanitize_search_query(query)

    # Parse and validate modules param
    # Note: diary entries are excluded from global fuzzy search - use dedicated diary FTS5 interface
    module_list = validate_and_parse_modules(modules) if modules else None

    # Create config for light search (excludes content)
    config = SearchConfig(
        modules=module_list,
        include_content=False,  # Light search excludes content
        fuzzy_threshold=fuzzy_threshold,
        limit=limit
    )

    return await unified_fuzzy_search(db, current_user.uuid, sanitized_query, config)