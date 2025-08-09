from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_, and_, text, func, select
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
import json
import re
import logging

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User
from ..models.note import Note
from ..models.document import Document
from ..models.todo import Todo
from ..models.archive import ArchiveItem, ArchiveFolder
from ..models.tag import Tag, archive_tags
from ..services.fts_service import fts_service

router = APIRouter(prefix="/search", tags=["search"])
logger = logging.getLogger(__name__)

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
    """
    Enhanced global search across all content types using FTS5
    """
    try:
        # Parse content types
        content_type_list = None
        if content_types:
            content_type_list = [ct.strip() for ct in content_types.split(",")]
            # Map frontend content types to backend types
            type_mapping = {
                'note': 'notes',
                'document': 'documents', 
                'todo': 'todos',
                'archive': 'archive_items'
            }
            content_type_list = [type_mapping.get(ct, ct) for ct in content_type_list]
        
        # Try FTS5 search first (high performance)
        logger.info(f"🔍 Performing FTS5 search for query: '{q}'")
        fts_results = await fts_service.search_all(
            db=db,
            query=q,
            user_id=current_user.id,
            content_types=content_type_list,
            limit=limit,
            offset=offset
        )
        
        if fts_results:
            logger.info(f"✅ FTS5 search returned {len(fts_results)} results")
            
            # Apply tag filtering if specified
            if tags:
                tag_list = [tag.strip().lower() for tag in tags.split(",")]
                filtered_results = []
                
                for result in fts_results:
                    # Get item tags based on type
                    item_tags = await _get_item_tags(db, result['type'], result['id'])
                    if any(tag in [t.lower() for t in item_tags] for tag in tag_list):
                        filtered_results.append(result)
                
                fts_results = filtered_results
            
            # Apply sorting
            if sort_by == "date":
                fts_results.sort(key=lambda x: x.get('updated_at', datetime.min), reverse=True)
            elif sort_by == "title":
                fts_results.sort(key=lambda x: x.get('title', '').lower())
            # 'relevance' is already sorted by FTS5 ranking
            
            # Format results for response
            formatted_results = []
            for result in fts_results:
                formatted_result = {
                    "type": result['type'],
                    "id": result['id'],
                    "title": result.get('title', ''),
                    "preview": result.get('content', '')[:200] + ('...' if len(result.get('content', '')) > 200 else ''),
                    "created_at": result.get('created_at'),
                    "updated_at": result.get('updated_at'),
                    "relevance_score": result.get('relevance_score', 0.0),
                    "relevance_level": _get_relevance_level(result.get('relevance_score', 0.0))
                }
                
                # Add type-specific fields
                if result['type'] == 'note':
                    formatted_result.update({
                        "area": result.get('area'),
                        "url": f"/notes/{result['id']}"
                    })
                elif result['type'] == 'document':
                    formatted_result.update({
                        "filename": result.get('filename'),
                        "url": f"/documents/{result['id']}"
                    })
                elif result['type'] == 'archive_item':
                    formatted_result.update({
                        "filename": result.get('filename'),
                        "folder_uuid": result.get('folder_uuid'),
                        "url": f"/archive/items/{result['id']}"
                    })
                elif result['type'] == 'todo':
                    formatted_result.update({
                        "project_id": result.get('project_id'),
                        "url": f"/todos/{result['id']}"
                    })
                
                # Include full content if requested
                if include_content:
                    formatted_result["content"] = result.get('content', '')
                
                formatted_results.append(formatted_result)
            
            return {
                "results": formatted_results,
                "total": len(formatted_results),
                "query": q,
                "search_type": "fts5",
                "performance": "high"
            }
        
        # Fallback to legacy search if FTS5 fails
        logger.warning("🔄 FTS5 search failed, falling back to legacy search")
        return await _legacy_global_search(q, content_type_list, tags, sort_by, include_content, limit, offset, current_user, db)
        
    except Exception as e:
        logger.error(f"❌ Search error: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

async def _legacy_global_search(q: str, content_types: Optional[List[str]], tags: Optional[str], 
                               sort_by: str, include_content: bool, limit: int, offset: int,
                               current_user: User, db: AsyncSession) -> Dict[str, Any]:
    """Legacy search implementation using LIKE queries"""
    
    logger.info(f"🔍 Performing legacy search for query: '{q}'")
    
    results = []
    search_term = f"%{q}%"
    
    # Determine which content types to search
    if not content_types:
        content_types = ['notes', 'documents', 'archive_items', 'todos']
    
    # Search notes
    if 'notes' in content_types:
        note_query = select(Note).where(
            and_(
                Note.user_id == current_user.id,
                or_(
                    Note.title.ilike(search_term),
                    Note.content.ilike(search_term)
                )
            )
        ).limit(limit // len(content_types))
        
        note_result = await db.execute(note_query)
        notes = note_result.scalars().all()
        
        for note in notes:
            preview = note.content[:200] + '...' if len(note.content) > 200 else note.content
            score = calculate_relevance_score(q, note.title, note.content)
            
            results.append({
                "type": "note",
                "id": note.id,
                "title": note.title,
                "preview": preview,
                "area": note.area,
                "created_at": note.created_at,
                "updated_at": note.updated_at,
                "relevance_score": score,
                "relevance_level": _get_relevance_level(score),
                "url": f"/notes/{note.id}",
                "content": note.content if include_content else None
            })
    
    # Search documents
    if 'documents' in content_types:
        doc_query = select(Document).where(
            and_(
                Document.user_id == current_user.id,
                or_(
                    Document.filename.ilike(search_term),
                    Document.original_name.ilike(search_term),
                    Document.extracted_text.ilike(search_term)
                )
            )
        ).limit(limit // len(content_types))
        
        doc_result = await db.execute(doc_query)
        documents = doc_result.scalars().all()
        
        for doc in documents:
            preview = (doc.extracted_text[:200] + '...' 
                      if doc.extracted_text and len(doc.extracted_text) > 200 
                      else (doc.extracted_text or ''))
            score = calculate_relevance_score(q, doc.original_name, doc.extracted_text or '')
            
            results.append({
                "type": "document",
                "id": doc.uuid,
                "title": doc.original_name,
                "preview": preview,
                "filename": doc.filename,
                "created_at": doc.created_at,
                "updated_at": doc.updated_at,
                "relevance_score": score,
                "relevance_level": _get_relevance_level(score),
                "url": f"/documents/{doc.uuid}",
                "content": doc.extracted_text if include_content else None
            })
    
    # Search archive items
    if 'archive_items' in content_types:
        archive_query = select(ArchiveItem).where(
            and_(
                ArchiveItem.user_id == current_user.id,
                or_(
                    ArchiveItem.name.ilike(search_term),
                    ArchiveItem.original_filename.ilike(search_term),
                    ArchiveItem.extracted_text.ilike(search_term)
                )
            )
        ).limit(limit // len(content_types))
        
        archive_result = await db.execute(archive_query)
        items = archive_result.scalars().all()
        
        for item in items:
            preview = (item.extracted_text[:200] + '...' 
                      if item.extracted_text and len(item.extracted_text) > 200 
                      else (item.extracted_text or item.description or ''))
            score = calculate_relevance_score(q, item.name, item.extracted_text or '')
            
            results.append({
                "type": "archive_item",
                "id": item.uuid,
                "title": item.name,
                "preview": preview,
                "filename": item.original_filename,
                "folder_uuid": item.folder_uuid,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
                "relevance_score": score,
                "relevance_level": _get_relevance_level(score),
                "url": f"/archive/items/{item.uuid}",
                "content": item.extracted_text if include_content else None
            })
    
    # Search todos
    if 'todos' in content_types:
        todo_query = select(Todo).where(
            and_(
                Todo.user_id == current_user.id,
                or_(
                    Todo.title.ilike(search_term),
                    Todo.description.ilike(search_term)
                )
            )
        ).limit(limit // len(content_types))
        
        todo_result = await db.execute(todo_query)
        todos = todo_result.scalars().all()
        
        for todo in todos:
            preview = (todo.description[:200] + '...' 
                      if todo.description and len(todo.description) > 200 
                      else (todo.description or ''))
            score = calculate_relevance_score(q, todo.title, todo.description or '')
            
            results.append({
                "type": "todo",
                "id": todo.id,
                "title": todo.title,
                "preview": preview,
                "project_id": todo.project_id,
                "created_at": todo.created_at,
                "updated_at": todo.updated_at,
                "relevance_score": score,
                "relevance_level": _get_relevance_level(score),
                "url": f"/todos/{todo.id}",
                "content": todo.description if include_content else None
            })
    
    # Apply tag filtering
    if tags:
        tag_list = [tag.strip().lower() for tag in tags.split(",")]
        filtered_results = []
        
        for result in results:
            item_tags = await _get_item_tags(db, result['type'], result['id'])
            if any(tag in [t.lower() for t in item_tags] for tag in tag_list):
                filtered_results.append(result)
        
        results = filtered_results
    
    # Apply sorting
    if sort_by == "relevance":
        results.sort(key=lambda x: x['relevance_score'], reverse=True)
    elif sort_by == "date":
        results.sort(key=lambda x: x['updated_at'], reverse=True)
    elif sort_by == "title":
        results.sort(key=lambda x: x['title'].lower())
    
    # Apply pagination
    paginated_results = results[offset:offset + limit]
    
    return {
        "results": paginated_results,
        "total": len(results),
        "query": q,
        "search_type": "legacy",
        "performance": "standard"
    }

async def _get_item_tags(db: AsyncSession, item_type: str, item_id: str) -> List[str]:
    """Get tags for a specific item"""
    try:
        if item_type == "note":
            query = text("""
                SELECT t.name FROM tags t
                JOIN note_tags nt ON t.uuid = nt.tag_uuid
                WHERE nt.note_uuid = :item_id
            """)
        elif item_type == "document":
            query = text("""
                SELECT t.name FROM tags t
                JOIN document_tags dt ON t.uuid = dt.tag_uuid
                WHERE dt.document_uuid = :item_id
            """)
        elif item_type == "archive_item":
            query = text("""
                SELECT t.name FROM tags t
                JOIN archive_tags at ON t.uuid = at.tag_uuid
                WHERE at.item_uuid = :item_id
            """)
        elif item_type == "todo":
            query = text("""
                SELECT t.name FROM tags t
                JOIN todo_tags tt ON t.uuid = tt.tag_uuid
                WHERE tt.todo_id = :item_id
            """)
        else:
            return []
        
        result = await db.execute(query, {"item_id": item_id})
        return [row[0] for row in result.fetchall()]
        
    except Exception as e:
        logger.warning(f"Failed to get tags for {item_type} {item_id}: {e}")
        return []

def _get_relevance_level(score: float) -> str:
    """Convert relevance score to level"""
    if score >= 0.8:
        return "high"
    elif score >= 0.5:
        return "medium"
    else:
        return "low"

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
                bm25(fts) as search_rank
            FROM archive_items ai
            JOIN archive_items_fts fts ON ai.uuid = fts.uuid
            WHERE fts MATCH :query
            AND ai.user_id = :user_id
            ORDER BY bm25(fts) 
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
                    ArchiveFolder.name.ilike(pattern)
                    # Archive folders don't use is_archived flag - all are active by being in archive
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
            'uuid': new_tag.uuid,
            'name': new_tag.name,
            'color': new_tag.color,
            'module_type': new_tag.module_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create tag")

@router.put("/tags/{tag_uuid}")
async def update_tag(
    tag_uuid: str,
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
                    Tag.uuid == tag_uuid,
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
            'uuid': tag.uuid,
            'name': tag.name,
            'color': tag.color,
            'module_type': tag.module_type
        }
        
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update tag")

@router.delete("/tags/{tag_uuid}")
async def delete_tag(
    tag_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a tag and remove it from all associated items."""
    
    try:
        # Get the tag
        tag_result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.uuid == tag_uuid,
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