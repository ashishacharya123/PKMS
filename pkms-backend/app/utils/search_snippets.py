"""
Search snippet generation utility for contextual search results.

Handles multiple match scenarios by finding all occurrences and returning
the best match based on relevance scoring.
"""

import re
from typing import Dict, Any, List, Tuple, Optional
from rapidfuzz import fuzz


def _find_all_matches(
    content: str,
    query: str,
    case_sensitive: bool = False
) -> List[Tuple[int, int, float]]:
    """
    Find all match positions in content using fuzzy matching.
    
    Args:
        content: Text content to search
        query: Search query
        case_sensitive: Whether to perform case-sensitive matching
    
    Returns:
        List of tuples: (start_pos, end_pos, match_score)
        Sorted by position (ascending)
    """
    if not content or not query:
        return []
    
    matches = []
    query_lower = query.lower() if not case_sensitive else query
    content_lower = content.lower() if not case_sensitive else content
    
    # Split query into words for multi-word matching
    query_words = query_lower.split()
    
    # Strategy 1: Exact phrase match (highest priority)
    if len(query_words) > 1:
        phrase_pattern = re.escape(query_lower)
        for match in re.finditer(phrase_pattern, content_lower):
            start, end = match.span()
            score = 100.0  # Perfect match
            matches.append((start, end, score))
    
    # Strategy 2: Individual word matches (fuzzy)
    for word in query_words:
        if len(word) < 2:  # Skip single characters
            continue
        
        # Find all occurrences of this word
        pattern = re.escape(word)
        for match in re.finditer(pattern, content_lower):
            start, end = match.span()
            
            # Calculate fuzzy match score for this position
            # Extract surrounding context for better scoring
            context_start = max(0, start - 20)
            context_end = min(len(content_lower), end + 20)
            context = content_lower[context_start:context_end]
            
            # Use partial ratio for better fuzzy matching
            score = fuzz.partial_ratio(word, context)
            
            # Boost score for whole word matches
            if start > 0 and end < len(content_lower):
                char_before = content_lower[start - 1]
                char_after = content_lower[end]
                if not char_before.isalnum() and not char_after.isalnum():
                    score = min(100.0, score * 1.2)  # Whole word bonus
            
            matches.append((start, end, score))
    
    # Remove duplicates and sort by position
    seen = set()
    unique_matches = []
    for start, end, score in matches:
        key = (start, end)
        if key not in seen:
            seen.add(key)
            unique_matches.append((start, end, score))
    
    return sorted(unique_matches, key=lambda x: x[0])


def _score_match_relevance(
    content: str,
    match_pos: int,
    match_end: int,
    query: str
) -> float:
    """
    Score a match position based on local context relevance.
    
    Scoring factors:
    - Exact vs fuzzy match quality
    - Proximity to document start (earlier = slight boost)
    - Word boundary match (whole word = higher score)
    - Context density (surrounding keyword density)
    
    Args:
        content: Full content text
        match_pos: Match start position
        match_end: Match end position
        query: Search query
    
    Returns:
        Relevance score (0-100)
    """
    if not content or match_pos < 0 or match_end > len(content):
        return 0.0
    
    score = 50.0  # Base score
    
    # Extract match text
    match_text = content[match_pos:match_end].lower()
    query_lower = query.lower()
    
    # Exact match bonus
    if match_text == query_lower:
        score += 30.0
    elif query_lower in match_text or match_text in query_lower:
        score += 20.0
    
    # Proximity to start bonus (earlier matches slightly preferred)
    if match_pos < len(content) * 0.1:  # First 10% of document
        score += 5.0
    elif match_pos < len(content) * 0.3:  # First 30% of document
        score += 2.0
    
    # Word boundary check
    if match_pos > 0 and match_end < len(content):
        char_before = content[match_pos - 1]
        char_after = content[match_end]
        if not char_before.isalnum() and not char_after.isalnum():
            score += 10.0  # Whole word match bonus
    
    # Context density: check for query words nearby
    context_start = max(0, match_pos - 50)
    context_end = min(len(content), match_end + 50)
    context = content[context_start:context_end].lower()
    
    query_words = query_lower.split()
    context_word_count = sum(1 for word in query_words if word in context)
    if context_word_count > 1:
        score += min(15.0, context_word_count * 3.0)  # Multiple query words nearby
    
    return min(100.0, score)


def _extract_snippet(
    content: str,
    match_pos: int,
    match_end: int,
    max_length: int = 200,
    context_words: int = 10
) -> str:
    """
    Extract snippet with context around match position.
    
    Args:
        content: Full content text
        match_pos: Match start position
        match_end: Match end position
        max_length: Maximum snippet length
        context_words: Number of words before/after match
    
    Returns:
        Snippet string with match highlighted
    """
    if not content:
        return ""
    
    # If content is shorter than max_length, return full content
    if len(content) <= max_length:
        # Highlight match if found
        if 0 <= match_pos < len(content):
            match_text = content[match_pos:match_end]
            return content.replace(match_text, f"**{match_text}**", 1)
        return content
    
    # Split content into words for word-boundary extraction
    words = content.split()
    word_positions = []
    current_pos = 0
    
    for word in words:
        start_pos = content.find(word, current_pos)
        if start_pos == -1:
            break
        end_pos = start_pos + len(word)
        word_positions.append((start_pos, end_pos, word))
        current_pos = end_pos
    
    # Find which word contains the match
    match_word_idx = -1
    for idx, (w_start, w_end, _) in enumerate(word_positions):
        if w_start <= match_pos < w_end or w_start <= match_end <= w_end:
            match_word_idx = idx
            break
    
    if match_word_idx == -1:
        # Match not found in word boundaries, use character-based extraction
        snippet_start = max(0, match_pos - max_length // 2)
        snippet_end = min(len(content), match_end + max_length // 2)
        snippet = content[snippet_start:snippet_end]
        
        # Highlight match
        rel_match_start = match_pos - snippet_start
        rel_match_end = match_end - snippet_start
        if 0 <= rel_match_start < len(snippet):
            match_text = snippet[rel_match_start:rel_match_end]
            snippet = snippet[:rel_match_start] + f"**{match_text}**" + snippet[rel_match_end:]
        
        # Add ellipsis if needed
        if snippet_start > 0:
            snippet = "..." + snippet
        if snippet_end < len(content):
            snippet = snippet + "..."
        
        return snippet[:max_length]
    
    # Extract words around match
    start_idx = max(0, match_word_idx - context_words)
    end_idx = min(len(words), match_word_idx + context_words + 1)
    
    snippet_words = words[start_idx:end_idx]
    snippet = " ".join(snippet_words)
    
    # Highlight match in snippet
    match_text = content[match_pos:match_end]
    if match_text in snippet:
        snippet = snippet.replace(match_text, f"**{match_text}**", 1)
    
    # Truncate if too long
    if len(snippet) > max_length:
        # Try to preserve word boundaries
        truncated = snippet[:max_length]
        last_space = truncated.rfind(" ")
        if last_space > max_length * 0.7:  # If we can preserve most of a word
            snippet = truncated[:last_space] + "..."
        else:
            snippet = truncated + "..."
    
    # Add ellipsis if not at start/end
    if start_idx > 0:
        snippet = "..." + snippet
    if end_idx < len(words):
        snippet = snippet + "..."
    
    return snippet


def generate_snippet(
    content: str,
    query: str,
    max_length: int = 200,
    context_words: int = 10
) -> Dict[str, Any]:
    """
    Generate contextual snippet from content with match highlighting.
    
    Handles multiple matches by finding all occurrences and returning
    the best match based on relevance scoring.
    
    Args:
        content: Text content to generate snippet from
        query: Search query string
        max_length: Maximum snippet length in characters
        context_words: Number of words before/after match to include
    
    Returns:
        Dictionary with:
        - snippet: Highlighted snippet text
        - match_position: Best match start position
        - match_end: Best match end position
        - total_matches: Total number of matches found
        - match_positions: List of all match positions [(start, end), ...]
        - best_match_index: Index of best match in match_positions
        - has_more_matches: Whether there are multiple matches
    """
    if not content:
        return {
            "snippet": "",
            "match_position": 0,
            "match_end": 0,
            "total_matches": 0,
            "match_positions": [],
            "best_match_index": 0,
            "has_more_matches": False
        }
    
    if not query:
        # No query, return first max_length characters
        snippet = content[:max_length]
        if len(content) > max_length:
            snippet += "..."
        return {
            "snippet": snippet,
            "match_position": 0,
            "match_end": 0,
            "total_matches": 0,
            "match_positions": [],
            "best_match_index": 0,
            "has_more_matches": False
        }
    
    # Find all matches
    all_matches = _find_all_matches(content, query)
    
    if not all_matches:
        # No matches found, return first max_length characters
        snippet = content[:max_length]
        if len(content) > max_length:
            snippet += "..."
        return {
            "snippet": snippet,
            "match_position": 0,
            "match_end": 0,
            "total_matches": 0,
            "match_positions": [],
            "best_match_index": 0,
            "has_more_matches": False
        }
    
    # Score each match for relevance
    scored_matches = []
    for start, end, base_score in all_matches:
        relevance_score = _score_match_relevance(content, start, end, query)
        # Combine base match score with relevance score
        combined_score = (base_score * 0.6) + (relevance_score * 0.4)
        scored_matches.append((start, end, combined_score))
    
    # Sort by score (descending) to get best match
    scored_matches.sort(key=lambda x: x[2], reverse=True)
    
    # Best match is the first one after sorting
    best_match = scored_matches[0]
    best_start, best_end, best_score = best_match
    
    # Extract snippet from best match
    snippet = _extract_snippet(content, best_start, best_end, max_length, context_words)
    
    # Find index of best match in original position-sorted list
    match_positions = [(start, end) for start, end, _ in all_matches]
    best_match_index = 0
    for idx, (start, end) in enumerate(match_positions):
        if start == best_start and end == best_end:
            best_match_index = idx
            break
    
    return {
        "snippet": snippet,
        "match_position": best_start,
        "match_end": best_end,
        "total_matches": len(all_matches),
        "match_positions": match_positions,
        "best_match_index": best_match_index,
        "has_more_matches": len(all_matches) > 1
    }

