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


def validate_email_address(email: str) -> str:
    """
    Validate and sanitize email address

    Args:
        email: Email address to validate

    Returns:
        Sanitized email address
    """
    if not email:
        return ""

    email = email.strip().lower()

    # Basic email pattern validation
    email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

    if not email_pattern.match(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid email address format"
        )

    # Length check
    if len(email) > 254:  # RFC 5321 limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address too long"
        )

    return html.escape(email)


def validate_username(username: str) -> str:
    """
    Validate and sanitize username

    Args:
        username: Username to validate

    Returns:
        Sanitized username
    """
    if not username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username cannot be empty"
        )

    username = username.strip()

    # Length check
    if len(username) < 3 or len(username) > 50:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be between 3 and 50 characters"
        )

    # Pattern check (alphanumeric, hyphens, underscores only)
    username_pattern = re.compile(r'^[a-zA-Z0-9_-]+$')

    if not username_pattern.match(username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username can only contain letters, numbers, hyphens, and underscores"
        )

    # Prevent reserved usernames
    reserved_usernames = {
        'admin', 'administrator', 'root', 'system', 'api', 'www',
        'test', 'demo', 'guest', 'user', 'null', 'undefined'
    }

    if username.lower() in reserved_usernames:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is not allowed"
        )

    return html.escape(username)


def validate_priority(priority: str) -> str:
    """
    Validate priority field

    Args:
        priority: Priority value to validate

    Returns:
        Validated priority
    """
    if not priority:
        return "medium"  # Default priority

    valid_priorities = {'low', 'medium', 'high', 'urgent'}

    if priority.lower() not in valid_priorities:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid priority. Must be one of: {', '.join(valid_priorities)}"
        )

    return priority.lower()


def validate_status(status: str, valid_statuses: List[str]) -> str:
    """
    Validate status field against allowed values

    Args:
        status: Status value to validate
        valid_statuses: List of allowed status values

    Returns:
        Validated status
    """
    if not status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status cannot be empty"
        )

    if status.lower() not in [s.lower() for s in valid_statuses]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    return status.lower()


def sanitize_url(url: str) -> str:
    """
    Validate and sanitize URL

    Args:
        url: URL to validate

    Returns:
        Sanitized URL
    """
    if not url:
        return ""

    url = url.strip()

    # Basic URL pattern validation
    url_pattern = re.compile(
        r'^https?://'  # http:// or https://
        r'(?:(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,6}\.?|'  # domain...
        r'localhost|'  # localhost...
        r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})'  # ...or ip
        r'(?::\d+)?'  # optional port
        r'(?:/?|[/?]\S+)$', re.IGNORECASE)

    if not url_pattern.match(url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid URL format"
        )

    # Length check
    if len(url) > 2048:  # Common URL length limit
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL too long"
        )

    return html.escape(url)


def validate_date_string(date_str: str) -> str:
    """
    Validate date string format (YYYY-MM-DD)

    Args:
        date_str: Date string to validate

    Returns:
        Validated date string
    """
    if not date_str:
        return ""

    date_str = date_str.strip()

    # Date pattern validation (YYYY-MM-DD)
    date_pattern = re.compile(r'^\d{4}-\d{2}-\d{2}$')

    if not date_pattern.match(date_str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date format. Use YYYY-MM-DD"
        )

    try:
        from datetime import datetime
        datetime.strptime(date_str, '%Y-%m-%d')
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid date"
        )

    return date_str


def validate_sort_parameters(sort_by: str, allowed_fields: List[str], sort_order: str = "desc") -> tuple:
    """
    Validate sort parameters

    Args:
        sort_by: Field to sort by
        allowed_fields: List of allowed sort fields
        sort_order: Sort order (asc/desc)

    Returns:
        Tuple of (validated_sort_by, validated_sort_order)
    """
    if not sort_by:
        sort_by = "created_at"  # Default sort field
    elif sort_by not in allowed_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid sort field. Must be one of: {', '.join(allowed_fields)}"
        )

    if sort_order not in ["asc", "desc"]:
        sort_order = "desc"  # Default sort order

    return sort_by, sort_order 