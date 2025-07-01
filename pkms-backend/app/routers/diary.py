"""
Diary Router - Complete Encrypted Diary Module Implementation
Handles encrypted diary entries, media uploads, mood tracking, and secure content management
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, extract
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, BinaryIO
from datetime import datetime, date, timedelta, time
import aiofiles
import uuid
import mimetypes
import json
from pathlib import Path
import io
import base64
from dateutil.relativedelta import relativedelta

from app.database import get_db
from app.models.diary import DiaryEntry, DiaryMedia
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.config import get_data_dir

router = APIRouter()

# Supported media types for diary
ALLOWED_MEDIA_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'audio/mp3': '.mp3',
    'audio/wav': '.wav',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov'
}

MAX_MEDIA_SIZE = 100 * 1024 * 1024  # 100MB for media files
MOODS = [1, 2, 3, 4, 5]  # 1=Very Bad, 2=Bad, 3=Neutral, 4=Good, 5=Excellent

class DiaryEntryCreate(BaseModel):
    date: date
    title_encrypted: Optional[str] = Field(None, max_length=1000)  # Encrypted title
    content_encrypted: str = Field(..., max_length=50000)  # Encrypted content
    mood: Optional[int] = Field(None, ge=1, le=5)
    weather: Optional[str] = Field(None, max_length=50)
    # Separate IV / tag for title (optional for backward compatibility)
    title_encryption_iv: Optional[str] = Field(None, max_length=255)
    title_encryption_tag: Optional[str] = Field(None, max_length=255)
    encryption_iv: str = Field(..., max_length=255)  # Base64 encoded IV
    encryption_tag: str = Field(..., max_length=255)  # Base64 encoded auth tag
    is_template: bool = Field(default=False)

class DiaryEntryUpdate(BaseModel):
    title_encrypted: Optional[str] = Field(None, max_length=1000)
    content_encrypted: Optional[str] = Field(None, max_length=50000)
    mood: Optional[int] = Field(None, ge=1, le=5)
    weather: Optional[str] = Field(None, max_length=50)
    # Separate IV / tag for title (optional for backward compatibility)
    title_encryption_iv: Optional[str] = Field(None, max_length=255)
    title_encryption_tag: Optional[str] = Field(None, max_length=255)
    encryption_iv: Optional[str] = Field(None, max_length=255)
    encryption_tag: Optional[str] = Field(None, max_length=255)
    is_template: Optional[bool] = None

class DiaryEntryResponse(BaseModel):
    id: int
    date: date
    title_encrypted: Optional[str]
    content_encrypted: str
    mood: Optional[int]
    weather: Optional[str]
    title_encryption_iv: Optional[str]
    title_encryption_tag: Optional[str]
    encryption_iv: str
    encryption_tag: str
    is_template: bool
    created_at: datetime
    updated_at: datetime
    media_count: int
    
    class Config:
        from_attributes = True

class DiaryEntrySummary(BaseModel):
    id: int
    date: date
    mood: Optional[int]
    weather: Optional[str]
    is_template: bool
    created_at: datetime
    media_count: int
    content_encrypted: str
    encryption_iv: str
    encryption_tag: str
    
    class Config:
        from_attributes = True

class DiaryMediaResponse(BaseModel):
    uuid: str
    entry_id: int
    filename_encrypted: str
    mime_type: str
    size_bytes: int
    encryption_iv: str
    encryption_tag: str
    media_type: str  # voice, photo, video
    duration_seconds: Optional[int]
    created_at: datetime
    
    class Config:
        from_attributes = True

class DiaryCalendarData(BaseModel):
    date: date
    mood: Optional[int]
    has_entry: bool
    media_count: int

class MoodStats(BaseModel):
    average_mood: Optional[float]
    mood_distribution: Dict[int, int]  # mood level -> count
    total_entries: int
    period_start: date
    period_end: date

@router.post("/entries", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry_data: DiaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new diary entry. Multiple entries per day are allowed.
    """
    
    # --- Lightweight automatic migration for legacy databases (SQLite only) ---
    # Ensure optional columns for title encryption IV / tag exist; if not, add them.
    try:
        await db.execute("PRAGMA table_info('diary_entries')")  # SQLite only; will raise for other DBs
        cols_result = await db.execute("PRAGMA table_info(diary_entries)")
        existing_cols = [row[1] for row in cols_result.fetchall()]  # column name is at index 1
        alter_statements: list[str] = []
        if 'title_encryption_iv' not in existing_cols:
            alter_statements.append("ALTER TABLE diary_entries ADD COLUMN title_encryption_iv TEXT")
        if 'title_encryption_tag' not in existing_cols:
            alter_statements.append("ALTER TABLE diary_entries ADD COLUMN title_encryption_tag TEXT")
        for stmt in alter_statements:
            try:
                await db.execute(stmt)
            except Exception:
                pass  # Ignore if column was added in a race condition
        if alter_statements:
            await db.commit()
    except Exception:
        # Non-SQLite DB or error; assume migrations handled externally
        pass

    # Combine user-provided date with current time to create a datetime object
    now_time = datetime.utcnow().time()
    entry_datetime = datetime.combine(entry_data.date, now_time)
    
    # Create new entry object
    entry = DiaryEntry(
        date=entry_datetime,
        title_encrypted=entry_data.title_encrypted,
        content_encrypted=entry_data.content_encrypted,
        mood=entry_data.mood,
        weather=entry_data.weather,
        # Use dedicated title IV/tag when provided; otherwise fall back to the content values
        title_encryption_iv=entry_data.title_encryption_iv or entry_data.encryption_iv,
        title_encryption_tag=entry_data.title_encryption_tag or entry_data.encryption_tag,
        encryption_iv=entry_data.encryption_iv,
        encryption_tag=entry_data.encryption_tag,
        is_template=entry_data.is_template,
        user_id=current_user.id
    )
    
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    
    return await _get_entry_with_media_count(db, entry.id, current_user.id)

@router.get("/entries/{entry_date}", response_model=DiaryEntryResponse)
async def get_diary_entry_by_date(
    entry_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the latest diary entry for a given date."""
    try:
        print(f"[DEBUG] Original date: {entry_date}")
        print(f"[DEBUG] Formatted date: {entry_date.strftime('%Y-%m-%d')}")
        
        # Get the LATEST entry for the given date
        result = await db.execute(
            select(DiaryEntry).where(
                and_(
                    func.date(DiaryEntry.date) == entry_date,
                    DiaryEntry.user_id == current_user.id
                )
            ).order_by(DiaryEntry.date.desc()).limit(1)
        )
        entry = result.scalar_one_or_none()
        
        if entry:
            return await _get_entry_with_media_count(db, entry.id, current_user.id)
        
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No diary entry found for date {entry_date.strftime('%Y-%m-%d')}"
        )
    except Exception as e:
        print(f"[DEBUG] Error in get_diary_entry_by_date: {str(e)}")
        print(f"[DEBUG] Entry date type: {type(entry_date)}")
        print(f"[DEBUG] SQL Query: {str(select(DiaryEntry).where(and_(func.date(DiaryEntry.date) == entry_date, DiaryEntry.user_id == current_user.id)))}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching diary entry: {str(e)}"
        )

@router.get("/entries/id/{entry_id}", response_model=DiaryEntryResponse)
async def get_diary_entry_by_id(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get diary entry by ID"""
    
    result = await db.execute(
        select(DiaryEntry).where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found"
        )
    
    return await _get_entry_with_media_count(db, entry.id, current_user.id)

@router.put("/entries/{entry_date}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_date: date,
    entry_data: DiaryEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing diary entry"""
    
    # Convert entry_date to datetime range for the full day
    start_datetime = datetime.combine(entry_date, datetime.min.time())
    end_datetime = datetime.combine(entry_date, datetime.max.time())
    
    result = await db.execute(
        select(DiaryEntry).where(
            and_(
                DiaryEntry.date >= start_datetime,
                DiaryEntry.date < end_datetime,
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.is_template == False
            )
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No diary entry found for this date"
        )
    
    # Validate encryption data if provided
    if entry_data.encryption_iv or entry_data.encryption_tag:
        try:
            if entry_data.encryption_iv:
                base64.b64decode(entry_data.encryption_iv)
            if entry_data.encryption_tag:
                base64.b64decode(entry_data.encryption_tag)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid encryption data format"
            )
    
    # Update fields
    update_data = entry_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(entry, field, value)
    
    entry.updated_at = datetime.utcnow()
    await db.commit()
    
    return await _get_entry_with_media_count(db, entry.id, current_user.id)

@router.delete("/entries/{entry_date}")
async def delete_diary_entry(
    entry_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a diary entry and all associated media"""
    
    # Convert entry_date to datetime range for the full day
    start_datetime = datetime.combine(entry_date, datetime.min.time())
    end_datetime = datetime.combine(entry_date, datetime.max.time())
    
    result = await db.execute(
        select(DiaryEntry).where(
            and_(
                DiaryEntry.date >= start_datetime,
                DiaryEntry.date < end_datetime,
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.is_template == False
            )
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No diary entry found for this date"
        )
    
    # Delete associated media files
    media_result = await db.execute(
        select(DiaryMedia).where(DiaryMedia.entry_id == entry.id)
    )
    media_files = media_result.scalars().all()
    
    for media in media_files:
        # Delete physical file
        try:
            # Decrypt file path and delete
            encrypted_path = base64.b64decode(media.filepath_encrypted)
            # Note: In real implementation, you'd decrypt the path here
            # For now, we'll assume the path is stored as encrypted base64
            file_path = Path(encrypted_path.decode('utf-8'))
            if file_path.exists():
                file_path.unlink()
        except Exception as e:
            print(f"Failed to delete media file: {e}")
    
    await db.delete(entry)
    await db.commit()
    
    return {"message": "Diary entry deleted successfully"}

@router.get("/entries", response_model=List[DiaryEntrySummary])
async def list_diary_entries(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    mood: Optional[int] = Query(None, ge=1, le=5),
    templates: Optional[bool] = Query(False),
    limit: int = Query(100, le=365),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List diary entries with filtering and pagination"""
    
    query = select(DiaryEntry).where(
        and_(
            DiaryEntry.user_id == current_user.id,
            DiaryEntry.is_template == templates
        )
    )
    
    if year and month:
        try:
            start_date = date(year, month, 1)
            end_date = start_date + relativedelta(months=1)
            query = query.where(
                and_(
                    DiaryEntry.date >= start_date,
                    DiaryEntry.date < end_date
                )
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid year or month")
    elif year:
        try:
            start_date = date(year, 1, 1)
            end_date = start_date + relativedelta(years=1)
            query = query.where(
                and_(
                    DiaryEntry.date >= start_date,
                    DiaryEntry.date < end_date
                )
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid year")
    
    if mood:
        query = query.where(DiaryEntry.mood == mood)
    
    query = query.order_by(DiaryEntry.date.desc()).offset(offset).limit(limit)
    
    result = await db.execute(query)
    entries = result.scalars().all()
    
    summaries = []
    try:
        for entry in entries:
            media_result = await db.execute(
                select(func.count(DiaryMedia.uuid)).where(DiaryMedia.entry_id == entry.id)
            )
            media_count = media_result.scalar() or 0
            summaries.append(
                DiaryEntrySummary(
                    id=entry.id,
                    date=entry.date.date(),
                    mood=entry.mood,
                    weather=entry.weather,
                    is_template=entry.is_template,
                    created_at=entry.created_at,
                    media_count=media_count,
                    content_encrypted=entry.content_encrypted,
                    encryption_iv=entry.encryption_iv,
                    encryption_tag=entry.encryption_tag
                )
            )
        return summaries
    except Exception as e:
        # Better logging for production would be ideal here
        print(f"Error creating diary entry summaries: {e}")
        raise HTTPException(
            status_code=500, detail="Failed to process diary entries"
        )

@router.get("/calendar/{year}/{month}", response_model=List[DiaryCalendarData])
async def get_calendar_data(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get calendar data for a specific month (mood, entries, etc.)"""
    
    try:
        start_date = date(year, month, 1)
        end_date = start_date + relativedelta(months=1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid year or month")

    # Get all entries for the month, ordered by most recent
    result = await db.execute(
        select(DiaryEntry.date, DiaryEntry.mood, DiaryEntry.id)
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.date >= start_date,
                DiaryEntry.date < end_date,
                DiaryEntry.is_template == False
            )
        )
        .order_by(DiaryEntry.date.desc())
    )
    entries = result.fetchall()
    
    # Process entries into a dictionary, keeping only the latest entry per day
    entry_map = {}
    for entry in entries:
        day = entry.date.date()
        if day not in entry_map:
            entry_map[day] = {"mood": entry.mood, "id": entry.id}
    
    # Build calendar data
    calendar_data = []
    current_date = start_date
    while current_date < end_date:
        entry_info = entry_map.get(current_date)
        if entry_info:
            # Get media count for this entry
            media_result = await db.execute(
                select(func.count(DiaryMedia.uuid)).where(DiaryMedia.entry_id == entry_info["id"])
            )
            media_count = media_result.scalar() or 0
            
            calendar_data.append(
                DiaryCalendarData(
                    date=current_date,
                    mood=entry_info["mood"],
                    has_entry=True,
                    media_count=media_count
                )
            )
        else:
            calendar_data.append(
                DiaryCalendarData(date=current_date, mood=None, has_entry=False, media_count=0)
            )
        current_date += timedelta(days=1)
        
    return calendar_data

@router.post("/entries/{entry_id}/media", response_model=DiaryMediaResponse)
async def upload_diary_media(
    entry_id: int,
    file: UploadFile = File(...),
    media_type: str = Form(...),  # voice, photo, video
    duration_seconds: Optional[int] = Form(None),
    encryption_iv: str = Form(...),
    encryption_tag: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload encrypted media file to diary entry"""
    
    # Verify entry exists and belongs to user
    result = await db.execute(
        select(DiaryEntry).where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    entry = result.scalar_one_or_none()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found"
        )
    
    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )
    
    # Validate media type
    if media_type not in ["voice", "photo", "video"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Media type must be 'voice', 'photo', or 'video'"
        )
    
    # Check file size
    content = await file.read()
    if len(content) > MAX_MEDIA_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_MEDIA_SIZE // (1024*1024)}MB"
        )
    
    # Validate MIME type
    content_type = file.content_type
    if content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Allowed types: {list(ALLOWED_MEDIA_TYPES.values())}"
        )
    
    # Validate encryption data
    try:
        base64.b64decode(encryption_iv)
        base64.b64decode(encryption_tag)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid encryption data format"
        )
    
    # Generate unique filename and save encrypted file
    media_uuid = str(uuid.uuid4())
    file_extension = ALLOWED_MEDIA_TYPES[content_type]
    
    # Create secure directory structure
    secure_dir = get_data_dir() / "secure" / media_type / str(entry.date.year)
    secure_dir.mkdir(parents=True, exist_ok=True)
    
    encrypted_filename = f"{media_uuid}{file_extension}"
    file_path = secure_dir / encrypted_filename
    
    # Save encrypted file content
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    # Create media record with encrypted filename and path
    media = DiaryMedia(
        uuid=media_uuid,
        entry_id=entry_id,
        filename_encrypted=base64.b64encode(file.filename.encode('utf-8')).decode('utf-8'),
        filepath_encrypted=base64.b64encode(str(file_path).encode('utf-8')).decode('utf-8'),
        mime_type=content_type,
        size_bytes=len(content),
        encryption_iv=encryption_iv,
        encryption_tag=encryption_tag,
        media_type=media_type,
        duration_seconds=duration_seconds,
        user_id=current_user.id
    )
    
    db.add(media)
    await db.commit()
    await db.refresh(media)
    
    return media

@router.get("/entries/{entry_id}/media", response_model=List[DiaryMediaResponse])
async def list_diary_media(
    entry_id: int,
    media_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List media files for a diary entry"""
    
    # Verify entry exists
    result = await db.execute(
        select(DiaryEntry).where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found"
        )
    
    query = select(DiaryMedia).where(DiaryMedia.entry_id == entry_id)
    
    if media_type:
        if media_type not in ["voice", "photo", "video"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Media type must be 'voice', 'photo', or 'video'"
            )
        query = query.where(DiaryMedia.media_type == media_type)
    
    query = query.order_by(DiaryMedia.created_at.desc())
    
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/media/{media_uuid}/download")
async def download_diary_media(
    media_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download encrypted media file (returns encrypted content)"""
    
    result = await db.execute(
        select(DiaryMedia).where(
            and_(DiaryMedia.uuid == media_uuid, DiaryMedia.user_id == current_user.id)
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found"
        )
    
    # Decrypt file path
    try:
        encrypted_path = base64.b64decode(media.filepath_encrypted)
        file_path = Path(encrypted_path.decode('utf-8'))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt file path"
        )
    
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found on disk"
        )
    
    # Decrypt filename for response
    try:
        encrypted_filename = base64.b64decode(media.filename_encrypted)
        original_filename = encrypted_filename.decode('utf-8')
    except Exception:
        original_filename = f"{media_uuid}{Path(file_path).suffix}"
    
    # Return encrypted file (client will decrypt)
    async def file_generator():
        async with aiofiles.open(file_path, 'rb') as f:
            while chunk := await f.read(8192):
                yield chunk
    
    return StreamingResponse(
        file_generator(),
        media_type=media.mime_type,
        headers={
            "Content-Disposition": f"attachment; filename={original_filename}",
            "X-Encryption-IV": media.encryption_iv,
            "X-Encryption-Tag": media.encryption_tag
        }
    )

@router.delete("/media/{media_uuid}")
async def delete_diary_media(
    media_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a media file from diary entry"""
    
    result = await db.execute(
        select(DiaryMedia).where(
            and_(DiaryMedia.uuid == media_uuid, DiaryMedia.user_id == current_user.id)
        )
    )
    media = result.scalar_one_or_none()
    
    if not media:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found"
        )
    
    # Delete physical file
    try:
        encrypted_path = base64.b64decode(media.filepath_encrypted)
        file_path = Path(encrypted_path.decode('utf-8'))
        if file_path.exists():
            file_path.unlink()
    except Exception as e:
        print(f"Failed to delete media file: {e}")
    
    await db.delete(media)
    await db.commit()
    
    return {"message": "Media file deleted successfully"}

@router.get("/stats/mood", response_model=MoodStats)
async def get_mood_stats(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get mood statistics for a date range"""
    
    # Default to last 30 days if no range specified
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)
    
    # Get mood distribution
    result = await db.execute(
        select(DiaryEntry.mood, func.count(DiaryEntry.id))
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.date.between(start_date, end_date),
                DiaryEntry.mood.isnot(None),
                DiaryEntry.is_template == False
            )
        )
        .group_by(DiaryEntry.mood)
    )
    
    mood_distribution = dict(result.fetchall())
    
    # Calculate average mood
    avg_result = await db.execute(
        select(func.avg(DiaryEntry.mood))
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.date.between(start_date, end_date),
                DiaryEntry.mood.isnot(None),
                DiaryEntry.is_template == False
            )
        )
    )
    average_mood = avg_result.scalar()
    
    # Get total entries
    total_result = await db.execute(
        select(func.count(DiaryEntry.id))
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.date.between(start_date, end_date),
                DiaryEntry.mood.isnot(None),
                DiaryEntry.is_template == False
            )
        )
    )
    total_entries = total_result.scalar() or 0
    
    # Ensure all mood levels are represented
    full_distribution = {mood: mood_distribution.get(mood, 0) for mood in MOODS}
    
    return MoodStats(
        average_mood=round(average_mood, 2) if average_mood else None,
        mood_distribution=full_distribution,
        total_entries=total_entries,
        period_start=start_date,
        period_end=end_date
    )

@router.get("/templates", response_model=List[DiaryEntryResponse])
async def list_diary_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all diary entry templates"""
    
    result = await db.execute(
        select(DiaryEntry).where(
            and_(
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.is_template == True
            )
        ).order_by(DiaryEntry.created_at.desc())
    )
    
    templates = result.scalars().all()
    
    # Convert to responses with media counts
    template_responses = []
    for template in templates:
        template_response = await _get_entry_with_media_count(db, template.id, current_user.id)
        template_responses.append(template_response)
    
    return template_responses

# Helper functions
async def _get_entry_with_media_count(db: AsyncSession, entry_id: int, user_id: int) -> DiaryEntryResponse:
    """Get diary entry with media count"""
    
    # Get entry
    result = await db.execute(
        select(DiaryEntry).where(and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == user_id))
    )
    entry = result.scalar_one()
    
    # Get media count
    media_count_result = await db.execute(
        select(func.count(DiaryMedia.uuid)).where(DiaryMedia.entry_id == entry_id)
    )
    media_count = media_count_result.scalar() or 0
    
    return DiaryEntryResponse(
        id=entry.id,
        date=entry.date.date(),
        title_encrypted=entry.title_encrypted,
        content_encrypted=entry.content_encrypted,
        mood=entry.mood,
        weather=entry.weather,
        title_encryption_iv=entry.title_encryption_iv,
        title_encryption_tag=entry.title_encryption_tag,
        encryption_iv=entry.encryption_iv,
        encryption_tag=entry.encryption_tag,
        is_template=entry.is_template,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        media_count=media_count
    ) 