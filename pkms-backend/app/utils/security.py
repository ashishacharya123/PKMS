"""
Security utility functions for input sanitization and validation
"""

import bleach
import re
from typing import List, Dict, Any
from fastapi import HTTPException, status
import html


# Allowed HTML tags and attributes for sanitization
ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'ol', 'ul', 'li']
ALLOWED_ATTRIBUTES = {
    '*': ['class'],
    'a': ['href', 'title'],
}

# Safe text patterns
SAFE_FILENAME_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,()[\]{}]+$')
SAFE_FOLDER_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,()[\]{}]+$')
SAFE_SEARCH_PATTERN = re.compile(r'^[a-zA-Z0-9\s\-_.,()[\]{}!?@#$%^&*+=|\\:;<>/~`"\']+$')

# SQL injection patterns to detect
SQL_INJECTION_PATTERNS = [
    r'(\bunion\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bcreate\b|\balter\b)',
    r'(\'|\"|;|--|\/\*|\*\/)',
    r'(\bor\b|\band\b).*(\=|\<|\>)'
]


def sanitize_html(text: str, strip: bool = False) -> str:
    """
    Sanitize HTML content to prevent XSS attacks
    
    Args:
        text: Text content to sanitize
        strip: If True, remove all HTML tags
    
    Returns:
        Sanitized text content
    """
    if not text:
        return ""
    
    if strip:
        # Remove all HTML tags
        return bleach.clean(text, tags=[], attributes={}, strip=True)
    else:
        # Allow safe HTML tags only
        return bleach.clean(text, tags=ALLOWED_TAGS, attributes=ALLOWED_ATTRIBUTES, strip=True)


def sanitize_text_input(text: str, max_length: int = 1000) -> str:
    """
    Sanitize general text input
    
    Args:
        text: Text to sanitize
        max_length: Maximum allowed length
    
    Returns:
        Sanitized text
    """
    if not text:
        return ""
    
    # Normalize and strip
    text = text.strip()
    
    # Length check
    if len(text) > max_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Input text too long. Maximum {max_length} characters allowed."
        )
    
    # HTML escape for safety
    text = html.escape(text)
    
    # Additional XSS protection
    text = sanitize_html(text, strip=True)
    
    return text


def sanitize_folder_name(name: str) -> str:
    """
    Sanitize folder names to prevent directory traversal and XSS
    
    Args:
        name: Folder name to sanitize
    
    Returns:
        Sanitized folder name
    """
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder name cannot be empty"
        )
    
    # Basic sanitization
    name = sanitize_text_input(name, 255)
    
    # Check for path traversal attempts
    if '..' in name or '/' in name or '\\' in name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder name contains invalid characters"
        )
    
    # Check pattern
    if not SAFE_FOLDER_NAME_PATTERN.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder name contains unsafe characters"
        )
    
    return name


def sanitize_filename(filename: str) -> str:
    """
    Sanitize filenames to prevent directory traversal and injection
    
    Args:
        filename: Filename to sanitize
    
    Returns:
        Sanitized filename
    """
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename cannot be empty"
        )
    
    # Basic sanitization
    filename = sanitize_text_input(filename, 255)
    
    # Check for path traversal
    if '..' in filename or '/' in filename or '\\' in filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename contains invalid path characters"
        )
    
    # Check pattern
    if not SAFE_FILENAME_PATTERN.match(filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename contains unsafe characters"
        )
    
    return filename


def sanitize_search_query(query: str) -> str:
    """
    Sanitize search queries to prevent SQL injection and XSS
    
    Args:
        query: Search query to sanitize
    
    Returns:
        Sanitized search query
    """
    if not query:
        return ""
    
    # Length check
    if len(query) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query too long. Maximum 500 characters allowed."
        )
    
    # Check for SQL injection patterns
    query_lower = query.lower()
    for pattern in SQL_INJECTION_PATTERNS:
        if re.search(pattern, query_lower, re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Search query contains potentially unsafe content"
            )
    
    # HTML escape
    query = html.escape(query)
    
    # Strip HTML tags
    query = sanitize_html(query, strip=True)
    
    # Additional pattern check
    if not SAFE_SEARCH_PATTERN.match(query):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query contains invalid characters"
        )
    
    return query.strip()


def sanitize_description(description: str) -> str:
    """
    Sanitize descriptions allowing limited HTML
    
    Args:
        description: Description text to sanitize
    
    Returns:
        Sanitized description
    """
    if not description:
        return ""
    
    # Length check
    if len(description) > 2000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description too long. Maximum 2000 characters allowed."
        )
    
    # Allow limited HTML tags for formatting
    return sanitize_html(description, strip=False)


def validate_file_size(file_size: int, max_size: int = 50 * 1024 * 1024) -> None:
    """
    Validate file size is within limits
    
    Args:
        file_size: Size of file in bytes
        max_size: Maximum allowed size in bytes (default 50MB)
    
    Raises:
        HTTPException: If file is too large
    """
    if file_size > max_size:
        max_mb = max_size / (1024 * 1024)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size allowed is {max_mb:.1f}MB"
        )


def validate_uuid_format(uuid_str: str) -> str:
    """
    Validate UUID format to prevent injection
    
    Args:
        uuid_str: UUID string to validate
    
    Returns:
        Validated UUID string
    """
    if not uuid_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="UUID cannot be empty"
        )
    
    # UUID pattern (36 characters with hyphens)
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)
    
    if not uuid_pattern.match(uuid_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid UUID format"
        )
    
    return uuid_str.lower()


def sanitize_tags(tags: List[str]) -> List[str]:
    """
    Sanitize a list of tags
    
    Args:
        tags: List of tag names
    
    Returns:
        List of sanitized tag names
    """
    if not tags:
        return []
    
    sanitized_tags = []
    for tag in tags:
        if tag:
            sanitized_tag = sanitize_text_input(tag.strip(), 50)
            if sanitized_tag and sanitized_tag not in sanitized_tags:
                sanitized_tags.append(sanitized_tag)
    
    return sanitized_tags[:20]  # Limit to 20 tags


def sanitize_json_metadata(metadata: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitize JSON metadata to prevent XSS and injection
    
    Args:
        metadata: Dictionary of metadata
    
    Returns:
        Sanitized metadata dictionary
    """
    if not metadata:
        return {}
    
    sanitized = {}
    for key, value in metadata.items():
        # Sanitize key
        clean_key = sanitize_text_input(str(key), 100)
        
        # Sanitize value based on type
        if isinstance(value, str):
            clean_value = sanitize_text_input(value, 1000)
        elif isinstance(value, (int, float, bool)):
            clean_value = value
        elif isinstance(value, list):
            clean_value = [sanitize_text_input(str(item), 500) for item in value[:10]]
        else:
            clean_value = sanitize_text_input(str(value), 500)
        
        sanitized[clean_key] = clean_value
    
    return sanitized 