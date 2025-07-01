from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, and_, text, func, select
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
import json
import re

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User
from ..models.note import Note
from ..models.document import Document
from ..models.todo import Todo
from ..models.archive import ArchiveItem, ArchiveFolder
from ..models.tag import Tag, archive_tags

router = APIRouter(prefix="/search", tags=["search"])

@router.get("/global")
async def global_search(
    q: str = Query(..., description="Search query"),
    content_types: Optional[str] = Query(None, description="Comma-separated content types: note,document,todo,archive"),
    tags: Optional[str] = Query(None, description="Comma-separated tags to filter by"),
    sort_by: str = Query("relevance", description="Sort by: relevance, date, title"),
    include_content: bool = Query(False, description="Include file content in search results and preview"),
    limit: int = Query(50, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Global search across all modules except diary with advanced filtering."""
    
    start_time = datetime.now()
    search_pattern = f"%{q.lower()}%"
    results = []
    
    # Parse content types filter
    allowed_types = set()
    if content_types:
        allowed_types = set(content_types.split(','))
    else:
        allowed_types = {'note', 'document', 'todo', 'archive'}
    
    # Parse tags filter
    tag_names = []
    if tags:
        tag_names = [tag.strip() for tag in tags.split(',') if tag.strip()]
    
    # Search Notes
    if 'note' in allowed_types:
        # Build note query with tag filtering
        note_query = select(Note).options(selectinload(Note.tags)).where(
            and_(
                Note.user_id == current_user.id,
                Note.is_archived == False,
                or_(
                    Note.title.ilike(search_pattern),
                    Note.area.ilike(search_pattern),
                    Note.content.ilike(search_pattern) if include_content else Note.title.ilike(search_pattern)
                )
            )
        )
        
        # Add tag filtering if specified
        if tag_names:
            note_query = note_query.join(Note.tags).where(
                Tag.name.in_(tag_names)
            )
        
        notes_result = await db.execute(note_query.limit(limit))
        notes = notes_result.scalars().unique().all()
        
        for note in notes:
            score = calculate_relevance_score(q, note.title, note.content if include_content else "")
            preview = extract_preview(note.content or '', q, 200) if include_content else note.title
            
            results.append({
                'id': str(note.id),
                'type': 'note',
                'title': note.title,
                'preview': preview,
                'content': note.content if include_content else "",
                'path': f'/notes/{note.id}',
                'score': score,
                'relevance': get_relevance_level(score),
                'tags': [tag.name for tag in note.tags],
                'createdAt': note.created_at.isoformat(),
                'updatedAt': note.updated_at.isoformat(),
                'metadata': {
                    'area': note.area,
                    'year': note.year,
                    'hasContent': bool(note.content) if not include_content else True
                }
            })
    
    # Search Documents (including extracted text)
    if 'document' in allowed_types:
        # Build document query with tag filtering
        doc_query = select(Document).options(selectinload(Document.tags)).where(
            and_(
                Document.user_id == current_user.id,
                Document.is_archived == False,
                or_(
                    Document.filename.ilike(search_pattern),
                    Document.original_name.ilike(search_pattern),
                    Document.extracted_text.ilike(search_pattern) if include_content else or_(
                        Document.filename.ilike(search_pattern),
                        Document.original_name.ilike(search_pattern)
                    )
                )
            )
        )
        
        # Add tag filtering if specified
        if tag_names:
            doc_query = doc_query.join(Document.tags).where(
                Tag.name.in_(tag_names)
            )
        
        docs_result = await db.execute(doc_query.limit(limit))
        documents = docs_result.scalars().unique().all()
        
        for doc in documents:
            score = calculate_relevance_score(q, doc.original_name, doc.extracted_text or '' if include_content else '')
            preview = extract_preview(doc.extracted_text or doc.original_name, q, 200) if include_content else doc.original_name
            
            results.append({
                'id': str(doc.uuid),
                'type': 'document',
                'title': doc.original_name,
                'preview': preview,
                'content': doc.extracted_text if include_content else "",
                'path': f'/documents',
                'score': score,
                'relevance': get_relevance_level(score),
                'tags': [tag.name for tag in doc.tags],
                'createdAt': doc.created_at.isoformat(),
                'updatedAt': doc.updated_at.isoformat(),
                'metadata': {
                    'size': doc.size_bytes,
                    'mimeType': doc.mime_type,
                    'filename': doc.filename,
                    'hasContent': bool(doc.extracted_text) if not include_content else True
                }
            })
    
    # Search Todos (including descriptions)
    if 'todo' in allowed_types:
        # Build todo query with tag filtering
        todo_query = select(Todo).options(selectinload(Todo.tags)).where(
            and_(
                Todo.user_id == current_user.id,
                or_(
                    Todo.title.ilike(search_pattern),
                    Todo.description.ilike(search_pattern) if include_content else Todo.title.ilike(search_pattern)
                )
            )
        )
        
        # Add tag filtering if specified
        if tag_names:
            todo_query = todo_query.join(Todo.tags).where(
                Tag.name.in_(tag_names)
            )
        
        todos_result = await db.execute(todo_query.limit(limit))
        todos = todos_result.scalars().unique().all()
        
        for todo in todos:
            score = calculate_relevance_score(q, todo.title, todo.description or '' if include_content else '')
            preview = extract_preview(todo.description or todo.title, q, 200) if include_content else todo.title
            
            results.append({
                'id': str(todo.id),
                'type': 'todo',
                'title': todo.title,
                'preview': preview,
                'content': todo.description if include_content else "",
                'path': f'/todos',
                'score': score,
                'relevance': get_relevance_level(score),
                'tags': [tag.name for tag in todo.tags],
                'createdAt': todo.created_at.isoformat(),
                'updatedAt': todo.updated_at.isoformat(),
                'metadata': {
                    'status': todo.status,
                    'priority': todo.priority,
                    'dueDate': todo.due_date.isoformat() if todo.due_date else None,
                    'projectId': todo.project_id,
                    'hasContent': bool(todo.description) if not include_content else True
                }
            })
    
    # Search Archive Items (including extracted text and descriptions)
    if 'archive' in allowed_types:
        # First search in archive folders
        archive_folders_query = select(ArchiveFolder).where(
            and_(
                ArchiveFolder.user_id == current_user.id,
                ArchiveFolder.is_archived == False,
                or_(
                    ArchiveFolder.name.ilike(search_pattern),
                    ArchiveFolder.description.ilike(search_pattern) if include_content else ArchiveFolder.name.ilike(search_pattern)
                )
            )
        )
        
        archive_folders_result = await db.execute(archive_folders_query.limit(limit))
        archive_folders = archive_folders_result.scalars().unique().all()
        
        for folder in archive_folders:
            score = calculate_relevance_score(q, folder.name, folder.description or '' if include_content else '')
            preview = extract_preview(folder.description or folder.name, q, 200) if include_content and folder.description else folder.name
            
            results.append({
                'id': str(folder.uuid),
                'type': 'archive-folder',
                'title': folder.name,
                'preview': preview,
                'content': folder.description if include_content else "",
                'path': f'/archive?folder={folder.uuid}',
                'score': score,
                'relevance': get_relevance_level(score),
                'tags': [],
                'createdAt': folder.created_at.isoformat(),
                'updatedAt': folder.updated_at.isoformat(),
                'metadata': {
                    'path': folder.path,
                    'hasContent': bool(folder.description) if not include_content else True
                }
            })

        # Then search in archive items
        # Build archive query with tag filtering
        archive_query = select(ArchiveItem).options(selectinload(ArchiveItem.tags)).where(
            and_(
                ArchiveItem.user_id == current_user.id,
                ArchiveItem.is_archived == False,
                or_(
                    ArchiveItem.name.ilike(search_pattern),
                    ArchiveItem.description.ilike(search_pattern),
                    ArchiveItem.original_filename.ilike(search_pattern),
                    ArchiveItem.extracted_text.ilike(search_pattern) if include_content else or_(
                        ArchiveItem.name.ilike(search_pattern),
                        ArchiveItem.description.ilike(search_pattern),
                        ArchiveItem.original_filename.ilike(search_pattern)
                    )
                )
            )
        )
        
        # Add tag filtering if specified
        if tag_names:
            archive_query = archive_query.join(ArchiveItem.tags).where(
                Tag.name.in_(tag_names)
            )
        
        archive_result = await db.execute(archive_query.limit(limit))
        archive_items = archive_result.scalars().unique().all()
        
        for item in archive_items:
            score = calculate_relevance_score(q, item.name, item.extracted_text or item.description or '' if include_content else '')
            preview = extract_preview(item.extracted_text or item.description or item.name, q, 200) if include_content else item.name
            
            results.append({
                'id': str(item.uuid),
                'type': 'archive',
                'title': item.name,
                'preview': preview,
                'content': item.extracted_text if include_content else "",
                'path': f'/archive',
                'score': score,
                'relevance': get_relevance_level(score),
                'tags': [tag.name for tag in item.tags],
                'createdAt': item.created_at.isoformat(),
                'updatedAt': item.updated_at.isoformat(),
                'metadata': {
                    'originalFilename': item.original_filename,
                    'mimeType': item.mime_type,
                    'size': item.file_size,
                    'folderUuid': item.folder_uuid,
                    'hasContent': bool(item.extracted_text) if not include_content else True
                }
            })
    
    # Sort results
    if sort_by == 'relevance':
        results.sort(key=lambda x: x['score'], reverse=True)
    elif sort_by == 'date':
        results.sort(key=lambda x: x['createdAt'], reverse=True)
    elif sort_by == 'title':
        results.sort(key=lambda x: x['title'].lower())
    
    # Calculate search statistics
    search_time = (datetime.now() - start_time).total_seconds() * 1000
    
    # Group results by type for statistics
    stats = {
        'totalResults': len(results),
        'resultsByType': {
            'note': len([r for r in results if r['type'] == 'note']),
            'document': len([r for r in results if r['type'] == 'document']),
            'todo': len([r for r in results if r['type'] == 'todo']),
            'archive': len([r for r in results if r['type'] == 'archive']),
            'archive-folder': len([r for r in results if r['type'] == 'archive-folder']),
        },
        'searchTime': round(search_time, 2),
        'query': q,
        'includeContent': include_content,
        'appliedFilters': {
            'contentTypes': list(allowed_types),
            'tags': tag_names
        }
    }
    
    return {
        'results': results[offset:offset + limit],
        'stats': stats,
        'suggestions': [] if not results else await get_search_suggestions_for_query(db, current_user.id, q)
    }

@router.get("/suggestions")
async def get_search_suggestions(
    q: str = Query(..., description="Partial search query"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get search suggestions based on existing content and user history."""
    
    if len(q.strip()) < 2:
        return {'suggestions': []}
    
    pattern = f"%{q.lower()}%"
    suggestions = set()
    
    try:
        # Get title suggestions from notes
        notes_result = await db.execute(
            select(Note.title).where(
                and_(
                    Note.user_id == current_user.id,
                    Note.title.ilike(pattern),
                    Note.is_archived == False
                )
            ).limit(10)
        )
        for (title,) in notes_result.fetchall():
            suggestions.add(title)
        
        # Get suggestions from document names
        docs_result = await db.execute(
            select(Document.original_name).where(
                and_(
                    Document.user_id == current_user.id,
                    Document.original_name.ilike(pattern),
                    Document.is_archived == False
                )
            ).limit(10)
        )
        for (name,) in docs_result.fetchall():
            suggestions.add(name)
        
        # Get suggestions from todo titles
        todos_result = await db.execute(
            select(Todo.title).where(
                and_(
                    Todo.user_id == current_user.id,
                    Todo.title.ilike(pattern)
                )
            ).limit(10)
        )
        for (title,) in todos_result.fetchall():
            suggestions.add(title)
        
        # Get suggestions from archive folder names
        folders_result = await db.execute(
            select(ArchiveFolder.name).where(
                and_(
                    ArchiveFolder.user_id == current_user.id,
                    ArchiveFolder.name.ilike(pattern),
                    ArchiveFolder.is_archived == False
                )
            ).limit(10)
        )
        for (name,) in folders_result.fetchall():
            suggestions.add(name)

        # Get tag suggestions
        tags_result = await db.execute(
            select(Tag.name).where(
                and_(
                    Tag.user_id == current_user.id,
                    Tag.name.ilike(pattern),
                    Tag.is_archived == False
                )
            ).limit(10)
        )
        for (name,) in tags_result.fetchall():
            suggestions.add(f"#{name}")
        
        return {'suggestions': sorted(list(suggestions))[:20]}
        
    except Exception as e:
        return {'suggestions': []}

@router.get("/popular-tags")
async def get_popular_tags(
    module_type: Optional[str] = Query(None, description="Filter by module type"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get popular tags with usage counts across modules."""
    
    try:
        # Build query for tag usage statistics
        query = select(Tag.name, Tag.module_type, func.count(Tag.name).label('count')).where(
            and_(
                Tag.user_id == current_user.id,
                Tag.is_archived == False
            )
        )
        
        if module_type:
            query = query.where(Tag.module_type == module_type)
        
        # Group by tag name and module type, order by count
        query = query.group_by(Tag.name, Tag.module_type).order_by(func.count(Tag.name).desc()).limit(50)
        
        result = await db.execute(query)
        tags_data = result.fetchall()
        
        popular_tags = [
            {
                'name': name,
                'type': module_type,
                'count': count
            }
            for name, module_type, count in tags_data
        ]
        
        return {'tags': popular_tags}
        
    except Exception as e:
        return {'tags': []}

@router.get("/tags/autocomplete")
async def get_tag_autocomplete(
    q: str = Query(..., description="Tag search query"),
    module_type: Optional[str] = Query(None, description="Filter by module type"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get tag autocomplete suggestions for tagging interface."""
    
    if len(q.strip()) < 1:
        return {'tags': []}
    
    pattern = f"%{q.lower()}%"
    
    try:
        query = select(Tag.name, Tag.color, Tag.module_type).where(
            and_(
                Tag.user_id == current_user.id,
                Tag.name.ilike(pattern),
                Tag.is_archived == False
            )
        )
        
        if module_type:
            query = query.where(Tag.module_type == module_type)
        
        query = query.distinct().order_by(Tag.name).limit(20)
        
        result = await db.execute(query)
        tags_data = result.fetchall()
        
        tags = [
            {
                'name': name,
                'color': color,
                'type': module_type
            }
            for name, color, module_type in tags_data
        ]
        
        return {'tags': tags}
        
    except Exception as e:
        return {'tags': []}

@router.post("/tags/create")
async def create_tag(
    name: str = Query(..., description="Tag name"),
    color: str = Query("#757575", description="Tag color"),
    module_type: str = Query(..., description="Module type: notes, documents, todos, archive"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new tag for the specified module."""
    
    try:
        # Check if tag already exists for this user and module
        existing_tag = await db.execute(
            select(Tag).where(
                and_(
                    Tag.user_id == current_user.id,
                    Tag.name == name,
                    Tag.module_type == module_type
                )
            )
        )
        
        if existing_tag.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Tag already exists for this module")
        
        # Create new tag
        new_tag = Tag(
            name=name,
            color=color,
            module_type=module_type,
            user_id=current_user.id
        )
        
        db.add(new_tag)
        await db.commit()
        await db.refresh(new_tag)
        
        return {
            'id': new_tag.id,
            'name': new_tag.name,
            'color': new_tag.color,
            'module_type': new_tag.module_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create tag")

@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: int,
    name: Optional[str] = Query(None, description="New tag name"),
    color: Optional[str] = Query(None, description="New tag color"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing tag."""
    
    try:
        # Get the tag
        tag_result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.id == tag_id,
                    Tag.user_id == current_user.id
                )
            )
        )
        tag = tag_result.scalar_one_or_none()
        
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")
        
        # Update fields if provided
        if name is not None:
            tag.name = name
        if color is not None:
            tag.color = color
        
        await db.commit()
        await db.refresh(tag)
        
        return {
            'id': tag.id,
            'name': tag.name,
            'color': tag.color,
            'module_type': tag.module_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update tag")

@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a tag and remove it from all associated items."""
    
    try:
        # Get the tag
        tag_result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.id == tag_id,
                    Tag.user_id == current_user.id
                )
            )
        )
        tag = tag_result.scalar_one_or_none()
        
        if not tag:
            raise HTTPException(status_code=404, detail="Tag not found")
        
        # Delete the tag (relationships will be automatically removed due to cascade)
        await db.delete(tag)
        await db.commit()
        
        return {'message': 'Tag deleted successfully'}
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete tag")

async def get_search_suggestions_for_query(db: AsyncSession, user_id: int, query: str) -> List[str]:
    """Helper function to get search suggestions based on similar content."""
    
    if len(query.strip()) < 3:
        return []
    
    suggestions = set()
    pattern = f"%{query.lower()}%"
    
    try:
        # Get related titles that might be interesting
        notes_result = await db.execute(
            select(Note.title).where(
                and_(
                    Note.user_id == user_id,
                    Note.title.ilike(pattern),
                    Note.is_archived == False
                )
            ).limit(5)
        )
        
        for (title,) in notes_result.fetchall():
            if title.lower() != query.lower():
                suggestions.add(title)
        
        return list(suggestions)[:10]
        
    except Exception:
        return []

def calculate_relevance_score(query: str, title: str, content: str) -> float:
    """Calculate relevance score for search results."""
    query_lower = query.lower()
    title_lower = title.lower() if title else ""
    content_lower = content.lower() if content else ""
    
    score = 0.0
    
    # Title exact match (highest weight)
    if query_lower == title_lower:
        score += 100
    elif query_lower in title_lower:
        score += 50
    
    # Title word matches
    query_words = query_lower.split()
    title_words = title_lower.split()
    
    for word in query_words:
        if word in title_words:
            score += 20
    
    # Content matches
    if content_lower:
        content_matches = content_lower.count(query_lower)
        score += min(content_matches * 5, 30)  # Cap content score
        
        # Word matches in content
        for word in query_words:
            word_matches = content_lower.count(word)
            score += min(word_matches * 2, 10)  # Cap word score
        
        # Normalize by content length (favor shorter, more focused content)
        score = score * (1000 / max(len(content_lower), 1000))
    
    return round(score, 2)

def get_relevance_level(score: float) -> str:
    """Convert numeric score to relevance level."""
    if score >= 50:
        return 'high'
    elif score >= 20:
        return 'medium'
    else:
        return 'low'

def extract_preview(text: str, query: str, max_length: int = 200) -> str:
    """Extract preview text highlighting the search query."""
    if not text:
        return ""
    
    query_lower = query.lower()
    text_lower = text.lower()
    
    # Find the first occurrence of the query
    index = text_lower.find(query_lower)
    
    if index == -1:
        # If exact query not found, look for first word
        first_word = query_lower.split()[0] if query_lower.split() else ""
        if first_word:
            index = text_lower.find(first_word)
    
    if index == -1:
        # If still not found, just return the beginning
        return text[:max_length] + "..." if len(text) > max_length else text
    
    # Calculate start and end positions for preview
    start = max(0, index - max_length // 3)
    end = min(len(text), start + max_length)
    
    # Adjust start if we're too close to the end
    if end - start < max_length and start > 0:
        start = max(0, end - max_length)
    
    preview = text[start:end]
    
    # Add ellipsis if needed
    if start > 0:
        preview = "..." + preview
    if end < len(text):
        preview = preview + "..."
    
    return preview 