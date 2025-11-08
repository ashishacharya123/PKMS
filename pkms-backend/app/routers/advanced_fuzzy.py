from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any, Optional
from rapidfuzz import fuzz
from dataclasses import dataclass
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.todo import Todo
from app.models.project import Project
from app.models.note import Note
from app.models.document import Document
# Note: DiaryEntry is excluded from global search - use dedicated diary FTS5 interface
from app.models.archive import ArchiveItem
from app.utils.security import sanitize_search_query
from app.utils.search_snippets import generate_snippet
import json

router = APIRouter(tags=["advanced-fuzzy-search"])


@dataclass
class SearchConfig:
    """Configuration for unified fuzzy search"""
    modules: Optional[List[str]] = None  # List of modules to search
    include_content: bool = True  # Whether to include full content in search
    fuzzy_threshold: int = 70  # Minimum fuzzy match score (0-100)
    limit: int = 30  # Maximum results to return

    def __post_init__(self):
        # Set default modules if none provided
        # Note: diary entries are only searchable through dedicated diary FTS5 interface
        if self.modules is None:
            self.modules = ["todo", "project", "note", "document", "archive"]


def _get_search_blob(item_type: str, item, include_content: bool) -> str:
    """Generate search blob for different item types"""
    # Get tags for all item types
    tags = [t.name for t in getattr(item, 'tag_objs', [])] if hasattr(item, 'tag_objs') else []

    if item_type == "todo":
        # Get first project from M2M relationship
        project = item.projects[0] if item.projects else None
        project_name = project.name if project else ""
        return f"{item.title or ''} {item.description or ''} {' '.join(tags)} {project_name}"

    elif item_type == "project":
        return f"{item.name or ''} {item.description or ''} {' '.join(tags)}"

    elif item_type == "note":
        if include_content:
            return f"{item.title or ''} {item.content or ''} {' '.join(tags)}"
        else:
            # Light search: title + tags only
            return f"{item.title or ''} {' '.join(tags)}"

    elif item_type == "document":
        return f"{item.title or ''} {item.original_name or ''} {item.description or ''} {' '.join(tags)}"

    # Note: diary entries are excluded from global fuzzy search
    # Use dedicated diary FTS5 interface for diary searching

    elif item_type == "archive":
        meta = {}
        if item.metadata_json:
            try:
                meta = json.loads(item.metadata_json)
            except json.JSONDecodeError:
                meta = {}
        meta_flat = ' '.join([str(v) for v in meta.values()])
        return f"{item.name or ''} {item.original_filename or ''} {item.description or ''} {' '.join(tags)} {meta_flat}"

    return ""


def _generate_navigation_url(item_type: str, item_uuid: str) -> str:
    """Generate frontend navigation URL based on item type"""
    url_map = {
        "note": f"/notes/{item_uuid}",
        "document": f"/documents/{item_uuid}",
        "todo": f"/todos/{item_uuid}",
        "project": f"/projects/{item_uuid}",
        "archive": f"/archive"  # Archive needs special handling - navigate to archive page
    }
    return url_map.get(item_type, "/")


def _get_field_content(item_type: str, item, field: str) -> str:
    """Extract content from specific field for snippet generation"""
    if field == "title":
        if item_type == "todo":
            return item.title or ""
        elif item_type == "project":
            return item.name or ""
        elif item_type == "note":
            return item.title or ""
        elif item_type == "document":
            return item.title or item.original_name or ""
        elif item_type == "archive":
            return item.name or ""
    elif field == "content":
        if item_type == "note":
            return item.content or ""
        return ""
    elif field == "description":
        return item.description or ""
    return ""


def _format_search_result(
    item_type: str,
    item,
    score: int,
    include_content: bool,
    query: str,
    best_field: Optional[str] = None
) -> Dict[str, Any]:
    """Format search result consistently across item types with contextual snippets"""
    tags = [t.name for t in getattr(item, 'tag_objs', [])] if hasattr(item, 'tag_objs') else []

    # Get item UUID for navigation URL
    item_uuid = getattr(item, 'uuid', '')

    # Determine which field to use for snippet generation
    snippet_content = ""
    if best_field:
        snippet_content = _get_field_content(item_type, item, best_field)
    
    # Fallback: use content if available, otherwise description
    if not snippet_content:
        if item_type == "note" and include_content:
            snippet_content = item.content or ""
        else:
            snippet_content = item.description or ""
    
    # Generate snippet if we have content and query
    snippet_data = None
    if snippet_content and query:
        snippet_data = generate_snippet(snippet_content, query, max_length=200, context_words=10)
    
    # Build base result
    base_result = {
        "type": item_type,
        "score": score,
        "tags": tags,
        "created_at": item.created_at.isoformat() if hasattr(item.created_at, 'isoformat') else str(item.created_at),
        "media_count": None,
        "navigation_url": _generate_navigation_url(item_type, item_uuid),
    }

    if item_type == "todo":
        project = item.projects[0] if item.projects else None
        title = item.title or ""
        base_result.update({
            "title": title,
            "module": "todo",
            "type_info": f"{project.name if project else ''}: {title}",
        })
        # Use description for snippet if available, otherwise title
        if not snippet_data and item.description:
            snippet_data = generate_snippet(item.description, query, max_length=200, context_words=10)
        base_result["description"] = snippet_data["snippet"] if snippet_data else item.description

    elif item_type == "project":
        title = item.name or ""
        base_result.update({
            "title": title,
            "module": "project",
            "type_info": title,
        })
        # Use description for snippet if available, otherwise name
        if not snippet_data and item.description:
            snippet_data = generate_snippet(item.description, query, max_length=200, context_words=10)
        base_result["description"] = snippet_data["snippet"] if snippet_data else item.description

    elif item_type == "note":
        title = item.title or ""
        base_result.update({
            "title": title,
            "module": "note",
            "type_info": title,
        })
        # Use content for snippet (this is where we save the most space)
        if include_content and item.content:
            snippet_data = generate_snippet(item.content, query, max_length=200, context_words=10)
            base_result["description"] = snippet_data["snippet"] if snippet_data else None
        else:
            base_result["description"] = None

    elif item_type == "document":
        title = item.title or item.original_name or ""
        base_result.update({
            "title": title,
            "module": "document",
            "type_info": title,
        })
        # Use description for snippet if available
        if not snippet_data and item.description:
            snippet_data = generate_snippet(item.description, query, max_length=200, context_words=10)
        base_result["description"] = snippet_data["snippet"] if snippet_data else item.description

    # Note: diary entries are excluded from global fuzzy search
    # Use dedicated diary FTS5 interface for diary searching

    elif item_type == "archive":
        title = item.name or ""
        base_result.update({
            "title": title,
            "module": "archive",
            "type_info": title,
        })
        # Use description for snippet if available
        if not snippet_data and item.description:
            snippet_data = generate_snippet(item.description, query, max_length=200, context_words=10)
        base_result["description"] = snippet_data["snippet"] if snippet_data else item.description

    # Add snippet and metadata if available
    if snippet_data:
        base_result["snippet"] = snippet_data["snippet"]
        base_result["snippet_metadata"] = {
            "match_position": snippet_data["match_position"],
            "match_end": snippet_data["match_end"],
            "total_matches": snippet_data["total_matches"],
            "match_positions": snippet_data["match_positions"],
            "best_match_index": snippet_data["best_match_index"],
            "has_more_matches": snippet_data["has_more_matches"]
        }

    return base_result


async def unified_fuzzy_search(
    db: AsyncSession,
    user_uuid: str,
    query: str,
    config: SearchConfig
) -> List[Dict[str, Any]]:
    """
    Unified fuzzy search function that replaces both advanced_fuzzy_search and fuzzy_search_light
    """
    results = []

    # Parse and validate modules
    # Note: diary entries are excluded from global fuzzy search - use dedicated diary FTS5 interface
    allowed_modules = {"todo", "project", "note", "document", "archive"}
    selected_modules = set(config.modules) & allowed_modules
    if not selected_modules:
        selected_modules = allowed_modules

    # Define model mappings and required relationships
    module_configs = {
        "todo": {
            "model": Todo,
            "relationships": [selectinload(Todo.tag_objs), selectinload(Todo.projects)],
        },
        "project": {
            "model": Project,
            "relationships": [selectinload(Project.tag_objs)],
        },
        "note": {
            "model": Note,
            "relationships": [selectinload(Note.tag_objs)],
        },
        "document": {
            "model": Document,
            "relationships": [selectinload(Document.tag_objs)],
        },
        "archive": {
            "model": ArchiveItem,
            "relationships": [selectinload(ArchiveItem.tag_objs)],
        },
    }

    # Search each module
    for module in selected_modules:
        if module not in module_configs:
            continue

        module_config = module_configs[module]
        model = module_config["model"]
        relationships = module_config["relationships"]

        # Query items for this module
        items = (await db.execute(
            select(model)
            .options(*relationships)
            .where(
                model.created_by == user_uuid,
                model.is_deleted.is_(False)
            )
        )).scalars().all()

        # Process each item
        for item in items:
            search_blob = _get_search_blob(module, item, config.include_content)
            score = fuzz.token_set_ratio(query, search_blob)

            if score >= config.fuzzy_threshold:
                # Track which field had the best match for snippet generation
                field_scores = {}
                
                # Score individual fields
                if module == "todo":
                    if item.title:
                        field_scores["title"] = fuzz.partial_ratio(query, item.title)
                    if item.description:
                        field_scores["description"] = fuzz.partial_ratio(query, item.description)
                elif module == "project":
                    if item.name:
                        field_scores["title"] = fuzz.partial_ratio(query, item.name)
                    if item.description:
                        field_scores["description"] = fuzz.partial_ratio(query, item.description)
                elif module == "note":
                    if item.title:
                        field_scores["title"] = fuzz.partial_ratio(query, item.title)
                    if config.include_content and item.content:
                        field_scores["content"] = fuzz.partial_ratio(query, item.content)
                    if item.description:
                        field_scores["description"] = fuzz.partial_ratio(query, item.description)
                elif module == "document":
                    title = item.title or item.original_name or ""
                    if title:
                        field_scores["title"] = fuzz.partial_ratio(query, title)
                    if item.description:
                        field_scores["description"] = fuzz.partial_ratio(query, item.description)
                elif module == "archive":
                    if item.name:
                        field_scores["title"] = fuzz.partial_ratio(query, item.name)
                    if item.description:
                        field_scores["description"] = fuzz.partial_ratio(query, item.description)
                
                # Determine best matching field
                best_field = None
                if field_scores:
                    best_field = max(field_scores, key=field_scores.get)
                
                result = _format_search_result(
                    module,
                    item,
                    score,
                    config.include_content,
                    query,
                    best_field=best_field
                )
                results.append(result)

    # Sort by score descending, return top N
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:config.limit]


@router.get("/advanced-fuzzy-search")
async def advanced_fuzzy_search(
    query: str = Query(..., min_length=2, max_length=500),
    limit: int = Query(30, ge=1, le=100),
    modules: str = Query(None, description="Comma-separated list of modules to search (todo,project,note,document,archive). Note: diary entries use dedicated FTS5 search."),
    fuzzy_threshold: int = Query(70, ge=0, le=100, description="Minimum fuzzy match score (0-100)"),
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
    module_list = None
    if modules:
        allowed_modules = {"todo", "project", "note", "document", "archive"}
        module_list = []
        for m in modules.split(","):
            clean_module = m.strip().lower()
            if clean_module in allowed_modules:
                module_list.append(clean_module)

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
    limit: int = Query(30, ge=1, le=100),
    modules: str = Query(None, description="Comma-separated list of modules to search (todo,project,note,document,archive). Note: diary entries use dedicated FTS5 search."),
    fuzzy_threshold: int = Query(70, ge=0, le=100, description="Minimum fuzzy match score (0-100)"),
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
    module_list = None
    if modules:
        allowed_modules = {"todo", "project", "note", "document", "archive"}
        module_list = []
        for m in modules.split(","):
            clean_module = m.strip().lower()
            if clean_module in allowed_modules:
                module_list.append(clean_module)
        # If no valid modules found, use all allowed modules
        if not module_list:
            module_list = list(allowed_modules)

    # Create config for light search (excludes content)
    config = SearchConfig(
        modules=module_list,
        include_content=False,  # Light search excludes content
        fuzzy_threshold=fuzzy_threshold,
        limit=limit
    )

    return await unified_fuzzy_search(db, current_user.uuid, sanitized_query, config)