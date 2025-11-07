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


def _format_search_result(item_type: str, item, score: int, include_content: bool) -> Dict[str, Any]:
    """Format search result consistently across item types"""
    tags = [t.name for t in getattr(item, 'tag_objs', [])] if hasattr(item, 'tag_objs') else []

    base_result = {
        "type": item_type,
        "score": score,
        "tags": tags,
        "created_at": item.created_at,
        "media_count": None,
    }

    if item_type == "todo":
        project = item.projects[0] if item.projects else None
        base_result.update({
            "title": item.title,
            "description": item.description,
            "module": "todo",
            "type_info": f"{project.name if project else ''}: {item.title}",
        })

    elif item_type == "project":
        base_result.update({
            "title": item.name,
            "description": item.description,
            "module": "project",
            "type_info": item.name,
        })

    elif item_type == "note":
        base_result.update({
            "title": item.title,
            "description": item.content if include_content else None,
            "module": "note",
            "type_info": item.title,
        })

    elif item_type == "document":
        base_result.update({
            "title": item.title or item.original_name,
            "description": item.description,
            "module": "document",
            "type_info": item.title or item.original_name,
        })

    # Note: diary entries are excluded from global fuzzy search
    # Use dedicated diary FTS5 interface for diary searching

    elif item_type == "archive":
        base_result.update({
            "title": item.name,
            "description": item.description,
            "module": "archive",
            "type_info": item.name,
        })

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
                result = _format_search_result(module, item, score, config.include_content)
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

    # Validate limit parameter
    if not isinstance(limit, int) or limit < 1 or limit > 100:
        limit = 30  # Default value

    # Validate fuzzy_threshold parameter
    if not isinstance(fuzzy_threshold, int) or fuzzy_threshold < 0 or fuzzy_threshold > 100:
        fuzzy_threshold = 70  # Default value

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
    query: str = Query(..., min_length=2),
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
    # Parse modules param
    module_list = None
    if modules:
        module_list = [m.strip().lower() for m in modules.split(",") if m.strip()]

    # Create config for light search (excludes content)
    config = SearchConfig(
        modules=module_list,
        include_content=False,  # Light search excludes content
        fuzzy_threshold=fuzzy_threshold,
        limit=limit
    )

    return await unified_fuzzy_search(db, current_user.uuid, query, config)