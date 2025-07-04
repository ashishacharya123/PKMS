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
    
    # Simplified search queries for single-user application
    # Remove user ownership checks while keeping authentication

        # Search notes (simplified for single user)
        if 'note' in search_types:
            note_query = (
                select(Note)
                .where(
                    and_(
                        Note.is_archived == False,
                        search_condition_func('Note', Note.title, Note.content)
                    )
                )
                .order_by(Note.updated_at.desc())
                .limit(limit_per_type)
            )
            
            note_result = await db.execute(note_query)
            notes = note_result.scalars().all()
            
            for note in notes:
                results.append(SearchResult(
                    type='note',
                    id=str(note.id),
                    title=note.title,
                    content=note.content if include_content else None,
                    preview=note.content[:200] + "..." if note.content and len(note.content) > 200 else note.content,
                    created_at=note.created_at,
                    updated_at=note.updated_at,
                    tags=[],
                    metadata={}
                ))
                stats['note'] += 1

        # Search documents (simplified for single user)
        if 'document' in search_types:
            document_fields = [Document.filename, Document.original_name]
            if include_content:
                document_fields.append(Document.extracted_text)
                
            document_query = (
                select(Document)
                .where(
                    and_(
                        Document.is_archived == False,
                        search_condition_func('Document', *document_fields)
                    )
                )
                .order_by(Document.updated_at.desc())
                .limit(limit_per_type)
            )
            
            document_result = await db.execute(document_query)
            documents = document_result.scalars().all()
            
            for doc in documents:
                results.append(SearchResult(
                    type='document',
                    id=doc.uuid,
                    title=doc.filename,
                    content=doc.extracted_text if include_content else None,
                    preview=doc.extracted_text[:200] + "..." if doc.extracted_text and len(doc.extracted_text) > 200 else doc.extracted_text or doc.filename,
                    created_at=doc.created_at,
                    updated_at=doc.updated_at,
                    tags=[],
                    metadata={'mime_type': doc.mime_type, 'size': doc.size_bytes}
                ))
                stats['document'] += 1

        # Search todos (simplified for single user)
        if 'todo' in search_types:
            todo_fields = [Todo.task, Todo.description]
            
            todo_query = (
                select(Todo)
                .where(
                    and_(
                        Todo.is_archived == False,
                        search_condition_func('Todo', *todo_fields)
                    )
                )
                .order_by(Todo.updated_at.desc())
                .limit(limit_per_type)
            )
            
            todo_result = await db.execute(todo_query)
            todos = todo_result.scalars().all()
            
            for todo in todos:
                results.append(SearchResult(
                    type='todo',
                    id=str(todo.id),
                    title=todo.task,
                    content=todo.description if include_content else None,
                    preview=todo.description[:200] + "..." if todo.description and len(todo.description) > 200 else todo.description or todo.task,
                    created_at=todo.created_at,
                    updated_at=todo.updated_at,
                    tags=[],
                    metadata={'status': todo.status, 'priority': todo.priority}
                ))
                stats['todo'] += 1

        # Search archive folders (simplified for single user)
        if 'archive-folder' in search_types:
            folder_fields = [ArchiveFolder.name]
            if include_content:
                folder_fields.append(ArchiveFolder.description)
                
            folder_query = (
                select(ArchiveFolder)
                .where(
                    and_(
                        ArchiveFolder.is_archived == False,
                        search_condition_func('ArchiveFolder', *folder_fields)
                    )
                )
                .order_by(ArchiveFolder.updated_at.desc())
                .limit(limit_per_type)
            )
            
            folder_result = await db.execute(folder_query)
            folders = folder_result.scalars().all()
            
            for folder in folders:
                results.append(SearchResult(
                    type='archive-folder',
                    id=folder.uuid,
                    title=folder.name,
                    content=folder.description if include_content else None,
                    preview=folder.description[:100] + "..." if folder.description and len(folder.description) > 100 else folder.description or folder.name,
                    created_at=folder.created_at,
                    updated_at=folder.updated_at,
                    tags=[],
                    metadata={'path': folder.path}
                ))
                stats['archive-folder'] += 1

        # Search archive items (simplified for single user)
        if 'archive-item' in search_types:
            item_fields = [ArchiveItem.name]
            if include_content:
                item_fields.extend([ArchiveItem.extracted_text, ArchiveItem.description])
                
            item_query = (
                select(ArchiveItem)
                .where(
                    and_(
                        ArchiveItem.is_archived == False,
                        search_condition_func('ArchiveItem', *item_fields)
                    )
                )
                .order_by(ArchiveItem.updated_at.desc())
                .limit(limit_per_type)
            )
            
            item_result = await db.execute(item_query)
            items = item_result.scalars().all()
            
            for item in items:
                results.append(SearchResult(
                    type='archive-item',
                    id=item.uuid,
                    title=item.name,
                    content=item.extracted_text if include_content else None,
                    preview=item.extracted_text[:200] + "..." if item.extracted_text and len(item.extracted_text) > 200 else item.extracted_text or item.name,
                    created_at=item.created_at,
                    updated_at=item.updated_at,
                    tags=[],
                    metadata={'mime_type': item.mime_type, 'file_size': item.file_size, 'folder_uuid': item.folder_uuid}
                ))
                stats['archive-item'] += 1
    
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

@router.get("/search/fts")
async def fts_search(
    query: str = Query(..., description="Search query"),
    content_types: Optional[str] = Query(None, description="Comma-separated content types"),
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Full-text search using FTS5"""
    
    try:
        # Sanitize and prepare search query
        query = sanitize_search_query(query)
        search_query = f"{query}*"  # Enable prefix matching
        
        # Build FTS query for archive items
        fts_query = text('''
            SELECT 
                ai.*,
                rank.rank as search_rank
            FROM archive_items ai
            JOIN (
                SELECT rowid, rank
                FROM archive_items_fts
                WHERE archive_items_fts MATCH :query
                ORDER BY rank DESC
            ) as rank ON ai.uuid = rank.rowid
            WHERE ai.user_id = :user_id
            ORDER BY rank.rank DESC
            LIMIT :limit OFFSET :offset
        ''')
        
        # Execute FTS query
        result = await db.execute(
            fts_query,
            {
                "query": search_query,
                "user_id": current_user.id,
                "limit": limit,
                "offset": offset
            }
        )
        
        items = result.fetchall()
        
        # Format results
        search_results = []
        for item in items:
            search_results.append({
                "id": item.uuid,
                "type": "archive-item",
                "title": item.name,
                "preview": item.description or item.extracted_text[:200] if item.extracted_text else None,
                "rank": item.search_rank,
                "metadata": {
                    "mime_type": item.mime_type,
                    "file_size": item.file_size,
                    "created_at": item.created_at.isoformat(),
                    "updated_at": item.updated_at.isoformat()
                }
            })
        
        return {
            "results": search_results,
            "total": len(search_results),
            "query": query
        }
        
    except Exception as e:
        logger.error(f"FTS search error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Search failed. Please try again."
        )

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