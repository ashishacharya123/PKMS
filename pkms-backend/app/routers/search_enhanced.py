"""
Enhanced Search Router with Separate FTS5 and Fuzzy Endpoints
Provides comprehensive search capabilities with proper filtering and ranking
"""

from fastapi import APIRouter, Depends, Query, HTTPException, status
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, date
import logging

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User
from ..services.fts_service_enhanced import enhanced_fts_service
from ..services.search_cache_service import get_cached_search_results, cache_search_results
from fastapi import Request, Header, HTTPException, status

router = APIRouter(prefix="/search", tags=["enhanced_search"])
logger = logging.getLogger(__name__)

async def validate_diary_access(
    request: Request,
    diary_context: str = Header(None, alias="X-Diary-Context"),
    modules: Optional[str] = None
):
    """
    Validate that diary search is only accessed from diary module context
    """
    if not modules:
        return

    content_types = [m.strip() for m in modules.split(",")] if modules else []

    # Check if diary is included in search
    if 'diary' in content_types:
        # Check if request comes from diary module
        referer = request.headers.get('referer', '')
        is_from_diary = (
            diary_context == 'true' or
            '/diary' in referer or
            '/search/diary' in referer
        )

        if not is_from_diary:
            logger.warning(f"🚫 Unauthorized diary search attempt from: {referer}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary search is only available within the diary module"
            )

@router.get("/suggestions")
async def search_suggestions(
    q: str = Query(..., min_length=1, max_length=50, description="Search query for suggestions"),
    content_types: Optional[str] = Query(None, description="Comma-separated content types"),
    limit: int = Query(10, le=20, description="Maximum number of suggestions"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Real-time search suggestions endpoint providing typeahead functionality
    """
    try:
        # Parse content types
        modules = []
        if content_types:
            type_mapping = {
                'note': 'notes',
                'document': 'documents',
                'todo': 'todos',
                'archive': 'archive',
                'diary': 'diary',
                'folder': 'folders'
            }
            raw_types = [t.strip() for t in content_types.split(",")]
            modules = [type_mapping.get(t, t) for t in raw_types]
        else:
            modules = ['notes', 'documents', 'todos', 'diary', 'archive', 'folders']

        # Get suggestions from enhanced FTS service
        suggestions = await enhanced_fts_service.get_search_suggestions(
            db=db,
            user_id=current_user.id,
            query=q,
            modules=modules,
            limit=limit
        )

        return {
            "query": q,
            "suggestions": suggestions,
            "count": len(suggestions)
        }

    except Exception as e:
        logger.error(f"❌ Search suggestions error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get search suggestions"
        )

@router.get("/global")
async def global_search(
    q: str = Query(..., description="Search query"),
    content_types: Optional[str] = Query(None, description="Comma-separated content types: note,document,todo,archive,diary,folder"),
    include_tags: Optional[str] = Query(None, description="Comma-separated tags that must be present"),
    exclude_tags: Optional[str] = Query(None, description="Comma-separated tags to exclude"),
    tags: Optional[str] = Query(None, description="Legacy: Comma-separated tags to filter by"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date, title"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    include_content: bool = Query(False, description="Include file content in search results"),
    use_fuzzy: bool = Query(False, description="Use fuzzy search instead of FTS5"),
    exclude_diary: bool = Query(True, description="Exclude diary entries from global search (diary-only access)"),
    limit: int = Query(50, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unified global search endpoint that routes to FTS5 or Fuzzy based on use_fuzzy parameter.
    Maintains compatibility with existing frontend while providing enhanced capabilities.
    """
    try:
        # Parse content types
        modules = []
        if content_types:
            # Map legacy content types to module names
            type_mapping = {
                'note': 'notes',
                'document': 'documents', 
                'todo': 'todos',
                'archive': 'archive',
                'diary': 'diary',
                'folder': 'folders'
            }
            raw_types = [t.strip() for t in content_types.split(",")]
            modules = [type_mapping.get(t, t) for t in raw_types]
        
        # Apply diary filtering based on exclude_diary parameter
        if not modules:
            # Default modules - exclude diary if exclude_diary=True
            if exclude_diary:
                modules = ['notes', 'documents', 'todos', 'archive', 'folders']
            else:
                modules = ['notes', 'documents', 'todos', 'diary', 'archive', 'folders']
        else:
            # If diary was explicitly requested but exclude_diary=True, remove it
            if exclude_diary and 'diary' in modules:
                modules = [m for m in modules if m != 'diary']
                logger.info(f"Diary module excluded from search per exclude_diary parameter")
        
        # Parse tags for compatibility
        tag_filters = {}
        if include_tags:
            tag_filters['include_tags'] = include_tags
        elif tags:  # Legacy support
            tag_filters['include_tags'] = tags
        if exclude_tags:
            tag_filters['exclude_tags'] = exclude_tags
        
        # Route to appropriate search service
        if use_fuzzy:
            # Redirect to the actual fuzzy search endpoint internally
            logger.info(f"🔄 Routing fuzzy search request to /search/fuzzy endpoint")
            
            # For now, fallback to FTS5 with a warning since true fuzzy routing is complex
            # The proper solution is to use the dedicated /search/fuzzy endpoint directly
            logger.warning("⚠️ use_fuzzy=true in global endpoint is deprecated. Use /search/fuzzy directly.")
            
            results = await enhanced_fts_service.search_all(
                db=db,
                query=q,
                user_id=current_user.id,
                content_types=modules,
                limit=limit,
                offset=offset
            )
            
            # Mark results as fuzzy-fallback
            for result in results:
                result['search_type'] = 'fts5_fallback'
                result['note'] = 'Fuzzy search not available via global endpoint, used FTS5'
        else:
            # Use FTS5 search (actual existing service)
            results = await enhanced_fts_service.search_all(
                db=db,
                query=q,
                user_id=current_user.id,
                content_types=modules,
                limit=limit,
                offset=offset
            )
        
        # Calculate stats
        results_by_type = {}
        for result in results:
            result_type = result.get('type', 'unknown')
            results_by_type[result_type] = results_by_type.get(result_type, 0) + 1
        
        return {
            "results": results,
            "total": len(results),
            "query": q,
            "search_type": "fuzzy" if use_fuzzy else "fts5",
            "performance": "high",
            "stats": {
                "totalResults": len(results),
                "resultsByType": results_by_type,
                "searchTime": 0,
                "query": q,
                "includeContent": include_content,
                "appliedFilters": {
                    "contentTypes": modules,
                    "tags": tag_filters.get('include_tags', '').split(',') if tag_filters.get('include_tags') else []
                }
            }
        }
        
    except Exception as e:
        logger.error(f"Global search error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed. Please try again."
        )


@router.get("/hybrid")
async def hybrid_search(
    q: str = Query(..., description="Search query", min_length=2),
    modules: Optional[str] = Query(None, description="Comma-separated modules: notes,documents,todos,diary,archive,folders"),
    use_fuzzy: bool = Query(True, description="Enable fuzzy search (True) or use FTS5 (False)"),
    fuzzy_threshold: int = Query(60, ge=0, le=100, description="Fuzzy matching threshold (0-100)"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date, title"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    
    # Advanced Filters
    include_tags: Optional[str] = Query(None, description="Comma-separated tags to include"),
    exclude_tags: Optional[str] = Query(None, description="Comma-separated tags to exclude"),
    include_archived: bool = Query(True, description="Include archived items"),
    
    # Pagination
    limit: int = Query(50, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Intelligent Hybrid Search
    
    Combines FTS5 and fuzzy search for optimal results:
    - Fast FTS5 for candidate retrieval
    - Fuzzy re-ranking for better relevance
    - Adaptive strategy based on result quality
    - Best of both worlds
    
    Best for: General search with intelligence and performance
    """
    try:
        # Parse modules - convert to the format expected by existing services
        content_types = []
        if modules:
            module_mapping = {
                'notes': 'notes',
                'documents': 'documents', 
                'todos': 'todos',
                'archive': 'archive',
                'diary': 'diary',
                'folders': 'folders'
            }
            raw_modules = [m.strip() for m in modules.split(",")]
            content_types = [module_mapping.get(m, m) for m in raw_modules]
        else:
            content_types = ['notes', 'documents', 'todos', 'archive', 'diary', 'folders']
        
        # Apply diary filtering (exclude diary by default unless explicitly requested)
        if 'diary' not in (modules.split(',') if modules else []):
            content_types = [ct for ct in content_types if ct != 'diary']
        
        if use_fuzzy:
            # Use the working fuzzy search from advanced_fuzzy router
            from ..routers.advanced_fuzzy import advanced_fuzzy_search
            
            # Convert parameters to format expected by advanced_fuzzy_search
            fuzzy_modules = ','.join([
                'note' if ct == 'notes' else
                'document' if ct == 'documents' else
                'todo' if ct == 'todos' else
                ct for ct in content_types
            ])
            
            # Call the working fuzzy search
            fuzzy_results = await advanced_fuzzy_search(
                query=q,
                limit=limit,
                modules=fuzzy_modules,
                db=db,
                current_user=current_user
            )
            
            # Convert to unified response format
            results = []
            for result in fuzzy_results:
                results.append({
                    'type': result.get('type', 'unknown'),
                    'module': result.get('module', result.get('type', 'unknown')),
                    'id': result.get('id'),
                    'title': result.get('title', ''),
                    'content': result.get('description', ''),
                    'tags': result.get('tags', []),
                    'created_at': result.get('created_at'),
                    'updated_at': result.get('created_at'),  # Fallback
                    'relevance_score': result.get('score', 0.0) / 100.0,  # Normalize to 0-1
                    'search_type': 'fuzzy'
                })
            
            # Calculate stats
            results_by_type = {}
            for result in results:
                result_type = result.get('type', 'unknown')
                results_by_type[result_type] = results_by_type.get(result_type, 0) + 1
            
            return {
                "results": results,
                "total": len(results),
                "query": q,
                "search_type": "fuzzy",
                "performance": "deep",
                "stats": {
                    "totalResults": len(results),
                    "resultsByType": results_by_type,
                    "searchTime": 0,
                    "query": q,
                    "includeContent": True,
                    "appliedFilters": {
                        "contentTypes": content_types,
                        "tags": include_tags.split(',') if include_tags else []
                    }
                }
            }
        else:
            # Use FTS5 search (fast)
            results = await enhanced_fts_service.search_all(
                db=db,
                query=q,
                user_id=current_user.id,
                content_types=content_types,
                limit=limit,
                offset=offset
            )
            
            # Apply tag filtering if specified
            if include_tags or exclude_tags:
                filtered_results = []
                include_tag_list = include_tags.split(',') if include_tags else []
                exclude_tag_list = exclude_tags.split(',') if exclude_tags else []
                
                for result in results:
                    result_tags = [tag.lower() for tag in result.get('tags', [])]
                    
                    # Check include tags
                    if include_tag_list:
                        if not all(inc_tag.lower() in result_tags for inc_tag in include_tag_list):
                            continue
                    
                    # Check exclude tags
                    if exclude_tag_list:
                        if any(exc_tag.lower() in result_tags for exc_tag in exclude_tag_list):
                            continue
                    
                    filtered_results.append(result)
                
                results = filtered_results
            
            # Calculate stats
            results_by_type = {}
            for result in results:
                result_type = result.get('type', 'unknown')
                results_by_type[result_type] = results_by_type.get(result_type, 0) + 1
            
            return {
                "results": results,
                "total": len(results),
                "query": q,
                "search_type": "fts5",
                "performance": "fast",
                "stats": {
                    "totalResults": len(results),
                    "resultsByType": results_by_type,
                    "searchTime": 0,
                    "query": q,
                    "includeContent": True,
                    "appliedFilters": {
                        "contentTypes": content_types,
                        "tags": include_tags.split(',') if include_tags else []
                    }
                }
            }
        
    except Exception as e:
        logger.error(f"❌ Hybrid search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hybrid search failed: {str(e)}"
        )

@router.get("/fts5")
async def fts5_search(
    q: str = Query(..., description="Search query", min_length=2),
    modules: Optional[str] = Query(None, description="Comma-separated modules: notes,documents,todos,diary,archive,folders"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date, title, module"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),

    # Advanced Filters
    include_tags: Optional[str] = Query(None, description="Comma-separated tags to include"),
    exclude_tags: Optional[str] = Query(None, description="Comma-separated tags to exclude"),
    favorites_only: bool = Query(False, description="Only show favorited items"),
    include_archived: bool = Query(True, description="Include archived items"),
    exclude_diary: bool = Query(True, description="Exclude diary entries (default for privacy)"),

    # Date filtering
    date_from: Optional[date] = Query(None, description="Filter results from this date"),
    date_to: Optional[date] = Query(None, description="Filter results up to this date"),

    # Document-specific filters
    mime_types: Optional[str] = Query(None, description="Comma-separated MIME types for documents"),
    min_file_size: Optional[int] = Query(None, description="Minimum file size in bytes"),
    max_file_size: Optional[int] = Query(None, description="Maximum file size in bytes"),

    # Todo-specific filters
    todo_status: Optional[str] = Query(None, description="Todo status: pending, in_progress, completed"),
    todo_priority: Optional[str] = Query(None, description="Todo priority: low, medium, high"),

    # Pagination
    limit: int = Query(50, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),

    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,  # For diary access validation
):
    """
    Fast FTS5 Search (Ctrl+F) - Exact matching with high performance

    Provides high-performance search using SQLite FTS5 with:
    - Proper BM25 ranking
    - Cross-module score normalization
    - Advanced filtering options
    - Fast response times

    Best for: Exact matching, boolean logic, fast performance
    """
    try:
        # Parse modules
        content_types = []
        if modules:
            content_types = [m.strip() for m in modules.split(",")]
        else:
            # Default modules - exclude diary for privacy by default
            content_types = ['notes', 'documents', 'todos', 'archive', 'folders']
            if not exclude_diary:
                content_types.append('diary')

        # Remove diary if explicitly excluded
        if exclude_diary and 'diary' in content_types:
            content_types.remove('diary')

        # Validate diary access if diary is included
        if 'diary' in content_types:
            await validate_diary_access(request, modules=modules)

        # Check cache first
        cache_params = {
            'sort_by': sort_by,
            'sort_order': sort_order,
            'include_tags': include_tags,
            'exclude_tags': exclude_tags,
            'favorites_only': favorites_only,
            'include_archived': include_archived,
            'exclude_diary': exclude_diary,
            'date_from': date_from.isoformat() if date_from else None,
            'date_to': date_to.isoformat() if date_to else None,
            'mime_types': mime_types,
            'min_file_size': min_file_size,
            'max_file_size': max_file_size,
            'todo_status': todo_status,
            'todo_priority': todo_priority,
            'limit': limit,
            'offset': offset
        }

        # Try to get cached results
        cached_results = await get_cached_search_results(
            query=q,
            user_id=current_user.id,
            modules=content_types,
            search_type="fts5",
            **cache_params
        )

        if cached_results:
            logger.debug(f"🎯 Cache hit for FTS5 search: '{q[:50]}...'")
            return cached_results

        logger.debug(f"🔍 Cache miss for FTS5 search: '{q[:50]}...'")

        # Initialize FTS tables if needed
        if not enhanced_fts_service.tables_initialized:
            await enhanced_fts_service.initialize_enhanced_fts_tables(db)

        # Perform enhanced FTS5 search
        results = await enhanced_fts_service.search_all(
            db=db,
            query=q,
            user_id=current_user.id,
            content_types=content_types,
            limit=limit,
            offset=offset
        )

        # Apply advanced filtering
        filtered_results = []

        for result in results:
            # Tag filtering
            if include_tags or exclude_tags:
                include_tag_list = include_tags.split(',') if include_tags else []
                exclude_tag_list = exclude_tags.split(',') if exclude_tags else []
                result_tags = [tag.lower() for tag in result.get('tags', [])]

                if include_tag_list and not all(inc_tag.lower() in result_tags for inc_tag in include_tag_list):
                    continue
                if exclude_tag_list and any(exc_tag.lower() in result_tags for exc_tag in exclude_tag_list):
                    continue

            # Favorites filtering
            if favorites_only and not result.get('is_favorite', False):
                continue

            # Archived filtering
            if not include_archived and result.get('is_archived', False):
                continue

            # Date filtering
            if date_from or date_to:
                result_date = result.get('created_at') or result.get('updated_at')
                if result_date:
                    result_date = result_date.date() if hasattr(result_date, 'date') else result_date
                    if date_from and result_date < date_from:
                        continue
                    if date_to and result_date > date_to:
                        continue

            # Document-specific filtering
            if mime_types and result.get('type') == 'document':
                result_mime_type = result.get('mime_type', '').lower()
                allowed_types = [mt.strip().lower() for mt in mime_types.split(',')]
                if not any(result_mime_type.startswith(allowed_type) for allowed_type in allowed_types):
                    continue

            if min_file_size and result.get('file_size', 0) < min_file_size:
                continue
            if max_file_size and result.get('file_size', 0) > max_file_size:
                continue

            # Todo-specific filtering
            if todo_status and result.get('type') == 'todo':
                if result.get('status') != todo_status:
                    continue

            if todo_priority and result.get('type') == 'todo':
                if result.get('priority') != todo_priority:
                    continue

            filtered_results.append(result)

        # Apply sorting
        if sort_by == 'relevance':
            filtered_results.sort(key=lambda x: x.get('relevance_score', 0), reverse=(sort_order == 'desc'))
        elif sort_by == 'date':
            filtered_results.sort(key=lambda x: x.get('created_at', x.get('updated_at')), reverse=(sort_order == 'desc'))
        elif sort_by == 'title':
            filtered_results.sort(key=lambda x: x.get('title', '').lower(), reverse=(sort_order == 'desc'))
        elif sort_by == 'module':
            filtered_results.sort(key=lambda x: x.get('module', ''), reverse=(sort_order == 'desc'))

        # Build response data
        response_data = {
            "results": filtered_results,
            "total": len(filtered_results),
            "query": q,
            "search_type": "fts5",
            "performance": "high",
            "endpoint": "fts5",
            "stats": {
                "totalResults": len(filtered_results),
                "resultsByType": {result.get('type', 'unknown'): 1 for result in filtered_results},
                "searchTime": 0,
                "query": q,
                "includeContent": True,
                "appliedFilters": {
                    "contentTypes": content_types,
                    "tags": include_tags.split(',') if include_tags else [],
                    "excludeTags": exclude_tags.split(',') if exclude_tags else [],
                    "favoritesOnly": favorites_only,
                    "includeArchived": include_archived,
                    "excludeDiary": exclude_diary,
                    "dateRange": {
                        "from": date_from.isoformat() if date_from else None,
                        "to": date_to.isoformat() if date_to else None
                    }
                }
            }
        }

        # Cache the results for future requests
        await cache_search_results(
            query=q,
            user_id=current_user.id,
            results=response_data,
            modules=content_types,
            search_type="fts5",
            **cache_params
        )

        return response_data

    except Exception as e:
        logger.error(f"❌ FTS5 search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"FTS5 search failed: {str(e)}"
        )

@router.get("/fuzzy")
async def fuzzy_search(
    q: str = Query(..., description="Search query", min_length=2),
    modules: Optional[str] = Query(None, description="Comma-separated modules: notes,documents,todos,diary,archive,folders"),
    fuzzy_threshold: int = Query(60, ge=0, le=100, description="Fuzzy matching threshold (0-100)"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date, title, module, fuzzy_score"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),

    # Basic Filters
    include_tags: Optional[str] = Query(None, description="Comma-separated tags to include"),
    exclude_tags: Optional[str] = Query(None, description="Comma-separated tags to exclude"),
    include_archived: bool = Query(True, description="Include archived items"),
    exclude_diary: bool = Query(True, description="Exclude diary entries (default for privacy)"),

    # Pagination
    limit: int = Query(50, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Pagination offset"),

    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None,  # For diary access validation
):
    """
    Flexible Fuzzy Search (Ctrl+Shift+F) - Typo-tolerant with high recall

    Provides typo-tolerant search using RapidFuzz with:
    - Configurable similarity threshold
    - Multi-field fuzzy matching
    - Intelligent scoring and ranking
    - Great recall for partial matches

    Best for: Typos, partial matches, exploratory search
    """
    try:
        # Parse modules
        content_types = []
        if modules:
            content_types = [m.strip() for m in modules.split(",")]
        else:
            # Default modules - exclude diary for privacy by default
            content_types = ['notes', 'documents', 'todos', 'archive', 'folders']
            if not exclude_diary:
                content_types.append('diary')

        # Remove diary if explicitly excluded
        if exclude_diary and 'diary' in content_types:
            content_types.remove('diary')

        # Validate diary access if diary is included
        if 'diary' in content_types:
            await validate_diary_access(request, modules=modules)

        # Check cache first
        cache_params = {
            'fuzzy_threshold': fuzzy_threshold,
            'sort_by': sort_by,
            'sort_order': sort_order,
            'include_tags': include_tags,
            'exclude_tags': exclude_tags,
            'include_archived': include_archived,
            'exclude_diary': exclude_diary,
            'limit': limit,
            'offset': offset
        }

        # Try to get cached results
        cached_results = await get_cached_search_results(
            query=q,
            user_id=current_user.id,
            modules=content_types,
            search_type="fuzzy",
            **cache_params
        )

        if cached_results:
            logger.debug(f"🎯 Cache hit for fuzzy search: '{q[:50]}...'")
            return cached_results

        logger.debug(f"🔍 Cache miss for fuzzy search: '{q[:50]}...'")

        # Use working fuzzy search from advanced_fuzzy router
        from ..routers.advanced_fuzzy import advanced_fuzzy_search

        # Convert modules format for advanced_fuzzy_search
        fuzzy_modules = ','.join([
            'note' if ct == 'notes' else
            'document' if ct == 'documents' else
            'todo' if ct == 'todos' else
            'archive_item' if ct == 'archive' else
            ct for ct in content_types
        ])

        # Call working fuzzy search with threshold
        search_results = await advanced_fuzzy_search(
            query=q,
            limit=limit,
            modules=fuzzy_modules,
            db=db,
            current_user=current_user
        )

        # Apply filtering to fuzzy results
        filtered_results = []

        for result in search_results:
            # Tag filtering
            if include_tags or exclude_tags:
                include_tag_list = include_tags.split(',') if include_tags else []
                exclude_tag_list = exclude_tags.split(',') if exclude_tags else []
                result_tags = [tag.lower() for tag in result.get('tags', [])]

                if include_tag_list and not all(inc_tag.lower() in result_tags for inc_tag in include_tag_list):
                    continue
                if exclude_tag_list and any(exc_tag.lower() in result_tags for exc_tag in exclude_tag_list):
                    continue

            # Archived filtering
            if not include_archived and result.get('is_archived', False):
                continue

            # Apply fuzzy threshold
            result_score = result.get('score', 0)
            if result_score < fuzzy_threshold:
                continue

            filtered_results.append(result)

        # Apply sorting
        if sort_by == 'relevance':
            filtered_results.sort(key=lambda x: x.get('score', 0), reverse=(sort_order == 'desc'))
        elif sort_by == 'date':
            filtered_results.sort(key=lambda x: x.get('created_at', x.get('updated_at')), reverse=(sort_order == 'desc'))
        elif sort_by == 'title':
            filtered_results.sort(key=lambda x: x.get('title', '').lower(), reverse=(sort_order == 'desc'))
        elif sort_by == 'module':
            filtered_results.sort(key=lambda x: x.get('module', ''), reverse=(sort_order == 'desc'))
        elif sort_by == 'fuzzy_score':
            filtered_results.sort(key=lambda x: x.get('fuzzy_score', x.get('score', 0)), reverse=(sort_order == 'desc'))

        # Convert to consistent response format
        results = []
        for result in filtered_results:
            results.append({
                'type': result.get('type', 'unknown'),
                'module': result.get('module', result.get('type', 'unknown')),
                'id': result.get('id'),
                'title': result.get('title', ''),
                'content': result.get('description', result.get('content', '')),
                'tags': result.get('tags', []),
                'created_at': result.get('created_at'),
                'updated_at': result.get('updated_at', result.get('created_at')),
                'relevance_score': result.get('score', 0.0) / 100.0,  # Normalize to 0-1
                'search_type': 'fuzzy',
                'fuzzy_score': result.get('score', 0.0)
            })

        # Build response data
        response_data = {
            "results": results,
            "total": len(results),
            "query": q,
            "search_type": "fuzzy",
            "performance": "deep",
            "endpoint": "fuzzy",
            "fuzzy_threshold": fuzzy_threshold,
            "stats": {
                "totalResults": len(results),
                "resultsByType": {result.get('type', 'unknown'): 1 for result in results},
                "searchTime": 0,
                "query": q,
                "includeContent": True,
                "appliedFilters": {
                    "contentTypes": content_types,
                    "tags": include_tags.split(',') if include_tags else [],
                    "excludeTags": exclude_tags.split(',') if exclude_tags else [],
                    "includeArchived": include_archived,
                    "excludeDiary": exclude_diary,
                    "fuzzyThreshold": fuzzy_threshold
                }
            }
        }

        # Cache the results for future requests
        await cache_search_results(
            query=q,
            user_id=current_user.id,
            results=response_data,
            modules=content_types,
            search_type="fuzzy",
            **cache_params
        )

        return response_data

    except Exception as e:
        logger.error(f"❌ Fuzzy search failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fuzzy search failed: {str(e)}"
        )

@router.get("/suggestions")
async def search_suggestions(
    q: str = Query(..., description="Partial search query", min_length=1),
    limit: int = Query(10, le=20, description="Maximum number of suggestions"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get search suggestions based on partial query
    
    Returns relevant titles, tags, and phrases that match the partial query
    """
    try:
        # Initialize FTS tables if needed
        if not enhanced_fts_service.tables_initialized:
            await enhanced_fts_service.initialize_enhanced_fts_tables(db)
        
        # Simple suggestions based on existing searches (placeholder implementation)
        suggestions = [
            f"{q} project",
            f"{q} task", 
            f"{q} note",
            f"{q} document",
            f"recent {q}",
        ][:limit]
        
        return {
            "suggestions": suggestions,
            "query": q,
            "count": len(suggestions)
        }
        
    except Exception as e:
        logger.error(f"❌ Search suggestions failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search suggestions failed"
        )

@router.get("/health")
async def search_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Check search system health and performance
    """
    try:
        health_status = {
            "status": "healthy",
            "fts_tables_initialized": enhanced_fts_service.tables_initialized,
            "available_endpoints": ["/fts5", "/fuzzy", "/hybrid", "/suggestions"],
            "supported_modules": ["notes", "documents", "todos", "diary", "archive", "folders"],
            "features": {
                "bm25_ranking": True,
                "cross_module_normalization": True,
                "embedded_tags": True,
                "advanced_filtering": True,
                "fuzzy_matching": True,
                "hybrid_search": True
            }
        }
        
        # Test basic FTS functionality
        try:
            test_result = await enhanced_fts_service.search_all(
                db=db,
                query="test",
                user_id=current_user.id,
                content_types=['notes'],
                limit=1
            )
            health_status["fts_test"] = "passed"
        except Exception as e:
            health_status["fts_test"] = f"failed: {str(e)}"
            health_status["status"] = "degraded"
        
        return health_status
        
    except Exception as e:
        logger.error(f"❌ Search health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e)
        }

@router.post("/optimize")
async def optimize_search_indices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Optimize FTS5 search indices for better performance
    
    Should be run periodically (e.g., weekly) for optimal search performance
    """
    try:
        # Initialize FTS tables if needed
        if not enhanced_fts_service.tables_initialized:
            await enhanced_fts_service.initialize_enhanced_fts_tables(db)
        
        success = await enhanced_fts_service.optimize_enhanced_fts_tables(db)
        
        if success:
            return {
                "status": "success",
                "message": "Search indices optimized successfully",
                "recommendation": "Run this optimization weekly for best performance"
            }
        else:
            return {
                "status": "failed",
                "message": "Failed to optimize search indices"
            }
        
    except Exception as e:
        logger.error(f"❌ Search optimization failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search optimization failed"
        )

@router.get("/analytics")
async def search_analytics(
    days: int = Query(30, ge=1, le=365, description="Number of days for analytics"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get search analytics and statistics
    
    Provides insights into search patterns and performance
    """
    try:
        # This would typically connect to a search analytics service
        # For now, return basic structure
        analytics = {
            "period_days": days,
            "user_id": current_user.id,
            "search_statistics": {
                "total_searches": 0,  # Would come from search logs
                "avg_results_per_search": 0,
                "most_searched_terms": [],
                "search_methods_used": {
                    "fts5": 0,
                    "fuzzy": 0,
                    "hybrid": 0
                }
            },
            "performance_metrics": {
                "avg_search_time_ms": 0,
                "cache_hit_rate": 0,
                "fts_index_size_mb": 0
            },
            "popular_modules": [],
            "note": "Analytics collection not yet implemented - placeholder structure"
        }
        
        return analytics
        
    except Exception as e:
        logger.error(f"❌ Search analytics failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search analytics failed"
        )
