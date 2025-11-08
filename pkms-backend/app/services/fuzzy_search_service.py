"""
Fuzzy Search Service for PKMS

Provides fuzzy search functionality across all content types (todos, projects, notes, documents, archive).
Follows service layer pattern consistent with other PKMS services.
"""

from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from rapidfuzz import fuzz
from dataclasses import dataclass
import json

from app.models.todo import Todo
from app.models.project import Project
from app.models.note import Note
from app.models.document import Document
from app.models.archive import ArchiveItem
from app.utils.search_snippets import generate_snippet

# Fuzzy search configuration constants
DEFAULT_FUZZY_THRESHOLD = 70  # Minimum fuzzy match score (0-100)
# Lower threshold = more results, higher threshold = more precise matches
# 70 is optimal balance for most use cases

DEFAULT_SEARCH_LIMIT = 30  # Maximum results to return per search
# Prevents overwhelming users with too many results
# Can be overridden per request via query parameter


@dataclass
class SearchConfig:
    """Configuration for unified fuzzy search"""
    modules: Optional[List[str]] = None  # List of modules to search
    include_content: bool = True  # Whether to include full content in search
    fuzzy_threshold: int = DEFAULT_FUZZY_THRESHOLD  # Minimum fuzzy match score (0-100)
    limit: int = DEFAULT_SEARCH_LIMIT  # Maximum results to return

    def __post_init__(self):
        # Set default modules if none provided
        # Note: diary entries are only searchable through dedicated diary FTS5 interface
        if self.modules is None:
            self.modules = ["todo", "project", "note", "document", "archive"]


class FuzzySearchService:
    """Service for fuzzy search operations across all content types."""
    
    # Module configurations with models and relationships
    MODULE_CONFIGS = {
        "todo": {
            "model": Todo,
            "relationships": [selectinload(Todo.tag_objs)],
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
    
    @staticmethod
    def _get_search_blob(item_type: str, item, include_content: bool) -> str:
        """Generate search blob for different item types"""
        # Get tags for all item types
        tags = [t.name for t in getattr(item, 'tag_objs', [])] if hasattr(item, 'tag_objs') else []

        if item_type == "todo":
            # Note: Projects are accessed via project_items polymorphic table, not direct relationship
            # Project name not included in search blob (can be queried separately if needed)
            return f"{item.title or ''} {item.description or ''} {' '.join(tags)}"

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

    @staticmethod
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

    @staticmethod
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

    @staticmethod
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
            snippet_content = FuzzySearchService._get_field_content(item_type, item, best_field)
        
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
            "navigation_url": FuzzySearchService._generate_navigation_url(item_type, item_uuid),
        }

        if item_type == "todo":
            title = item.title or ""
            base_result.update({
                "title": title,
                "module": "todo",
                "type_info": title,  # Project name removed (accessed via project_items table)
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

    @staticmethod
    async def unified_fuzzy_search(
        db: AsyncSession,
        user_uuid: str,
        query: str,
        config: SearchConfig
    ) -> List[Dict[str, Any]]:
        """
        Unified fuzzy search function that replaces both advanced_fuzzy_search and fuzzy_search_light
        
        Args:
            db: Database session
            user_uuid: User UUID to search for
            query: Search query string
            config: Search configuration
            
        Returns:
            List of search results with scores and metadata
        """
        results = []

        # Parse and validate modules
        # Note: diary entries are excluded from global fuzzy search - use dedicated diary FTS5 interface
        if config.modules:
            selected_modules = set(config.modules)
        else:
            selected_modules = {"todo", "project", "note", "document", "archive"}

        # Search each module
        for module in selected_modules:
            if module not in FuzzySearchService.MODULE_CONFIGS:
                continue

            module_config = FuzzySearchService.MODULE_CONFIGS[module]
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
                search_blob = FuzzySearchService._get_search_blob(module, item, config.include_content)
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
                    
                    result = FuzzySearchService._format_search_result(
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


# Global service instance
fuzzy_search_service = FuzzySearchService()

