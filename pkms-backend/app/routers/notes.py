"""
Notes Router - Complete Notes Module Implementation
Handles note creation, editing, linking, tagging, and search
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, text
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime
import re
import json

from app.database import get_db
from app.models.note import Note, note_tags
from app.models.tag import Tag
from app.models.link import Link
from app.models.user import User
from app.auth.dependencies import get_current_user

router = APIRouter()

# Validation patterns
MARKDOWN_LINK_PATTERN = re.compile(r'\[\[([^\]]+)\]\]')  # [[note title]] pattern
SAFE_CONTENT_PATTERN = re.compile(r'^[^<>]*$')  # No HTML tags

class NoteCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=0, max_length=50000)
    area: str = Field(default="Inbox", max_length=50)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    
    @validator('title', 'area')
    def validate_safe_text(cls, v):
        if not SAFE_CONTENT_PATTERN.match(v):
            raise ValueError('Text contains unsafe characters')
        return v.strip()

class NoteUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=0, max_length=50000)
    area: Optional[str] = Field(None, max_length=50)
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    
    @validator('title', 'area')
    def validate_safe_text(cls, v):
        if v is not None and not SAFE_CONTENT_PATTERN.match(v):
            raise ValueError('Text contains unsafe characters')
        return v.strip() if v else v

class NoteResponse(BaseModel):
    id: int
    title: str
    content: str
    area: str
    year: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    backlinks: List[Dict[str, Any]]
    links: List[Dict[str, Any]]
    
    class Config:
        from_attributes = True

class NoteSummary(BaseModel):
    id: int
    title: str
    area: str
    year: int
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    preview: str  # First 200 chars of content
    
    class Config:
        from_attributes = True

@router.post("/", response_model=NoteResponse)
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new note with automatic linking and tagging"""
    
    # Create note
    note = Note(
        title=note_data.title,
        content=note_data.content,
        area=note_data.area,
        year=datetime.now().year,
        user_id=current_user.id
    )
    
    db.add(note)
    await db.flush()  # Get note ID
    
    # Handle tags
    await _handle_note_tags(db, note, note_data.tags, current_user.id)
    
    # Process bidirectional links in content
    await _process_note_links(db, note, note_data.content, current_user.id)
    
    await db.commit()
    await db.refresh(note)
    
    # Return with related data
    return await _get_note_with_relations(db, note.id, current_user.id)

@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific note with backlinks and tags"""
    
    result = await db.execute(
        select(Note).where(
            and_(Note.id == note_id, Note.user_id == current_user.id)
        )
    )
    note = result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    return await _get_note_with_relations(db, note_id, current_user.id)

@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: int,
    note_data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a note with automatic link processing"""
    
    result = await db.execute(
        select(Note).where(
            and_(Note.id == note_id, Note.user_id == current_user.id)
        )
    )
    note = result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    # Update fields
    update_data = note_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        if field == "tags":
            continue  # Handle separately
        setattr(note, field, value)
    
    # Handle tags if provided
    if note_data.tags is not None:
        await _handle_note_tags(db, note, note_data.tags, current_user.id)
    
    # Process links if content changed
    if note_data.content is not None:
        await _process_note_links(db, note, note_data.content, current_user.id)
    
    note.updated_at = datetime.utcnow()
    await db.commit()
    
    return await _get_note_with_relations(db, note_id, current_user.id)

@router.delete("/{note_id}")
async def delete_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a note and clean up its links"""
    
    result = await db.execute(
        select(Note).where(
            and_(Note.id == note_id, Note.user_id == current_user.id)
        )
    )
    note = result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    # Delete associated links
    await db.execute(
        select(Link).where(
            and_(
                or_(
                    and_(Link.from_type == "note", Link.from_id == str(note_id)),
                    and_(Link.to_type == "note", Link.to_id == str(note_id))
                ),
                Link.user_id == current_user.id
            )
        ).delete()
    )
    
    await db.delete(note)
    await db.commit()
    
    return {"message": "Note deleted successfully"}

@router.get("/", response_model=List[NoteSummary])
async def list_notes(
    area: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    archived: Optional[bool] = Query(False),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List notes with filtering and search"""
    
    query = select(Note).where(Note.user_id == current_user.id)
    
    # Apply filters
    if area:
        query = query.where(Note.area == area)
    if year:
        query = query.where(Note.year == year)
    if archived is not None:
        query = query.where(Note.is_archived == archived)
    
    # Tag filter
    if tag:
        query = query.join(note_tags).join(Tag).where(Tag.name == tag)
    
    # Search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Note.title.ilike(search_term),
                Note.content.ilike(search_term)
            )
        )
    
    # Order and pagination
    query = query.order_by(Note.updated_at.desc()).offset(offset).limit(limit)
    
    result = await db.execute(query)
    notes = result.scalars().all()
    
    # Convert to summaries with tags
    summaries = []
    for note in notes:
        # Get tags
        tag_result = await db.execute(
            select(Tag.name).join(note_tags).where(note_tags.c.note_id == note.id)
        )
        note_tags_list = [row[0] for row in tag_result.fetchall()]
        
        summaries.append(NoteSummary(
            id=note.id,
            title=note.title,
            area=note.area,
            year=note.year,
            is_archived=note.is_archived,
            created_at=note.created_at,
            updated_at=note.updated_at,
            tags=note_tags_list,
            preview=note.content[:200] + "..." if len(note.content) > 200 else note.content
        ))
    
    return summaries

@router.get("/areas/list")
async def list_areas(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get list of all note areas"""
    
    result = await db.execute(
        select(Note.area, func.count(Note.id).label('count'))
        .where(and_(Note.user_id == current_user.id, Note.is_archived == False))
        .group_by(Note.area)
        .order_by(Note.area)
    )
    
    areas = [{"name": row[0], "count": row[1]} for row in result.fetchall()]
    return {"areas": areas}

@router.get("/{note_id}/links")
async def get_note_links(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all links for a specific note (outgoing and incoming)"""
    
    # Verify note exists
    result = await db.execute(
        select(Note).where(
            and_(Note.id == note_id, Note.user_id == current_user.id)
        )
    )
    note = result.scalar_one_or_none()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found"
        )
    
    # Get outgoing links (this note links to others)
    outgoing_result = await db.execute(
        select(Link).where(
            and_(
                Link.from_type == "note",
                Link.from_id == str(note_id),
                Link.user_id == current_user.id
            )
        )
    )
    outgoing_links = outgoing_result.scalars().all()
    
    # Get incoming links (other notes link to this one)
    incoming_result = await db.execute(
        select(Link).where(
            and_(
                Link.to_type == "note",
                Link.to_id == str(note_id),
                Link.user_id == current_user.id
            )
        )
    )
    incoming_links = incoming_result.scalars().all()
    
    return {
        "outgoing_links": [_format_link(link) for link in outgoing_links],
        "incoming_links": [_format_link(link) for link in incoming_links]
    }

# Helper functions
async def _handle_note_tags(db: AsyncSession, note: Note, tag_names: List[str], user_id: int):
    """Handle tag assignment for a note"""
    
    # Clear existing tags
    await db.execute(
        note_tags.delete().where(note_tags.c.note_id == note.id)
    )
    
    for tag_name in tag_names:
        if not tag_name.strip():
            continue
            
        tag_name = tag_name.strip().lower()
        
        # Get or create tag
        result = await db.execute(
            select(Tag).where(
                and_(Tag.name == tag_name, Tag.module_type == "notes", Tag.user_id == user_id)
            )
        )
        tag = result.scalar_one_or_none()
        
        if not tag:
            tag = Tag(
                name=tag_name,
                module_type="notes",
                user_id=user_id
            )
            db.add(tag)
            await db.flush()
        
        # Associate with note
        await db.execute(
            note_tags.insert().values(note_id=note.id, tag_id=tag.id)
        )

async def _process_note_links(db: AsyncSession, note: Note, content: str, user_id: int):
    """Process [[note title]] links in content and create Link records"""
    
    # Remove existing outgoing links from this note
    await db.execute(
        select(Link).where(
            and_(
                Link.from_type == "note",
                Link.from_id == str(note.id),
                Link.user_id == user_id
            )
        ).delete()
    )
    
    # Find all [[note title]] patterns
    matches = MARKDOWN_LINK_PATTERN.findall(content)
    
    for match in matches:
        target_title = match.strip()
        
        # Find target note by title
        result = await db.execute(
            select(Note).where(
                and_(
                    Note.title.ilike(f"%{target_title}%"),
                    Note.user_id == user_id,
                    Note.id != note.id  # Don't link to self
                )
            )
        )
        target_note = result.scalar_one_or_none()
        
        if target_note:
            # Create bidirectional link
            link = Link(
                from_type="note",
                from_id=str(note.id),
                to_type="note", 
                to_id=str(target_note.id),
                link_type="reference",
                description=f"Referenced in: {note.title}",
                user_id=user_id
            )
            db.add(link)

async def _get_note_with_relations(db: AsyncSession, note_id: int, user_id: int) -> NoteResponse:
    """Get note with all related data (tags, links, backlinks)"""
    
    # Get note
    result = await db.execute(
        select(Note).where(and_(Note.id == note_id, Note.user_id == user_id))
    )
    note = result.scalar_one()
    
    # Get tags
    tag_result = await db.execute(
        select(Tag.name).join(note_tags).where(note_tags.c.note_id == note_id)
    )
    tags = [row[0] for row in tag_result.fetchall()]
    
    # Get outgoing links
    links_result = await db.execute(
        select(Link).where(
            and_(
                Link.from_type == "note",
                Link.from_id == str(note_id),
                Link.user_id == user_id
            )
        )
    )
    links = [_format_link(link) for link in links_result.scalars().all()]
    
    # Get backlinks (incoming links)
    backlinks_result = await db.execute(
        select(Link).where(
            and_(
                Link.to_type == "note",
                Link.to_id == str(note_id),
                Link.user_id == user_id
            )
        )
    )
    backlinks = [_format_link(link) for link in backlinks_result.scalars().all()]
    
    return NoteResponse(
        id=note.id,
        title=note.title,
        content=note.content,
        area=note.area,
        year=note.year,
        is_archived=note.is_archived,
        created_at=note.created_at,
        updated_at=note.updated_at,
        tags=tags,
        links=links,
        backlinks=backlinks
    )

def _format_link(link: Link) -> Dict[str, Any]:
    """Format a link for API response"""
    return {
        "id": link.id,
        "from_type": link.from_type,
        "from_id": link.from_id,
        "to_type": link.to_type,
        "to_id": link.to_id,
        "link_type": link.link_type,
        "description": link.description,
        "created_at": link.created_at
    } 