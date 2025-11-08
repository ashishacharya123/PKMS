"""
Search result schemas for fuzzy search endpoints.

Provides type-safe response models with snippet metadata.
"""

from typing import Optional, List
from app.schemas.base import CamelCaseModel


class SnippetMetadata(CamelCaseModel):
    """Metadata about search match snippet"""
    match_position: int
    match_end: int
    total_matches: int
    match_positions: List[List[int]]  # List of [start, end] pairs
    best_match_index: int
    has_more_matches: bool


class FuzzySearchResult(CamelCaseModel):
    """Fuzzy search result with contextual snippet"""
    type: str
    score: int
    title: str
    snippet: Optional[str] = None
    snippet_metadata: Optional[SnippetMetadata] = None
    navigation_url: str
    tags: List[str]
    created_at: str
    module: str
    # Backward compatibility fields
    description: Optional[str] = None  # Populated with snippet for compatibility
    type_info: Optional[str] = None
    media_count: Optional[int] = None

