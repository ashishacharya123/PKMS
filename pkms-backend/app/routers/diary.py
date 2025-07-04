"""
Diary Router - New Single-Blob Encryption Implementation
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, extract, or_
from sqlalchemy.orm import selectinload, aliased
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import json
import logging

from app.database import get_db
from app.models.diary import DiaryEntry, DiaryMedia
from app.models.user import User, RecoveryKey
from app.auth.dependencies import get_current_user
from app.auth.security import verify_password

logger = logging.getLogger(__name__)

router = APIRouter(tags=["diary"])

# --- Pydantic Models ---

class DiaryEntryCreate(BaseModel):
    date: date
    title: Optional[str] = Field(None, max_length=255)
    encrypted_blob: str
    encryption_iv: str
    encryption_tag: str
    mood: Optional[int] = Field(None, ge=1, le=5)
    metadata: Optional[Dict[str, Any]] = {}
    is_template: Optional[bool] = False

class DiaryEntryResponse(BaseModel):
    id: int
    date: date
    title: Optional[str]
    encrypted_blob: str
    encryption_iv: str
    encryption_tag: str
    mood: Optional[int]
    metadata: Dict[str, Any]
    is_template: bool
    created_at: datetime
    updated_at: datetime
    media_count: int

    class Config:
        from_attributes = True

    @validator('metadata', pre=True)
    def parse_metadata_json(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

class DiaryEntrySummary(BaseModel):
    id: int
    date: date
    title: Optional[str]
    mood: Optional[int]
    is_template: bool
    created_at: datetime
    media_count: int
    encrypted_blob: str
    encryption_iv: str
    encryption_tag: str
    
    class Config:
        from_attributes = True
        
class DiaryCalendarData(BaseModel):
    date: str
    mood: Optional[int]
    has_entry: bool
    media_count: int

class MoodStats(BaseModel):
    average_mood: Optional[float]
    mood_distribution: Dict[int, int]
    total_entries: int

class DiaryMediaResponse(BaseModel):
    uuid: str
    entry_id: int
    filename_encrypted: str
    mime_type: str
    size_bytes: int
    media_type: str
    duration_seconds: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True

# --- API Endpoints ---

@router.post("/entries", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry_data: DiaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new diary entry with a single encrypted data blob."""
    entry = DiaryEntry(
        date=datetime.combine(entry_data.date, datetime.min.time()),
        title=entry_data.title,
        encrypted_blob=entry_data.encrypted_blob,
        encryption_iv=entry_data.encryption_iv,
        encryption_tag=entry_data.encryption_tag,
        mood=entry_data.mood,
        metadata_json=json.dumps(entry_data.metadata),
        is_template=entry_data.is_template,
        user_id=current_user.id
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    
    # Manually set media_count for the response since it's a new entry
    response = DiaryEntryResponse.from_orm(entry)
    response.media_count = 0
    return response

@router.get("/entries", response_model=List[DiaryEntrySummary])
async def list_diary_entries(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    mood: Optional[int] = Query(None),
    templates: bool = Query(False),
    search_title: Optional[str] = Query(None, description="Search by entry title"),
    day_of_week: Optional[int] = Query(None, description="Filter by day of week (0=Sun, 1=Mon..)", ge=0, le=6),
    has_media: Optional[bool] = Query(None, description="Filter entries that have media attached"),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List diary entries with filtering."""
    
    # Subquery to count media per entry
    media_count_subquery = (
        select(DiaryMedia.entry_id, func.count(DiaryMedia.uuid).label("media_count"))
        .group_by(DiaryMedia.entry_id)
        .subquery()
    )
    
    query = (
        select(DiaryEntry, func.coalesce(media_count_subquery.c.media_count, 0).label("media_count"))
        .outerjoin(media_count_subquery, DiaryEntry.id == media_count_subquery.c.entry_id)
        .where(DiaryEntry.user_id == current_user.id)
    )

    if year:
        query = query.where(extract('year', DiaryEntry.date) == year)
    if month:
        query = query.where(extract('month', DiaryEntry.date) == month)
    if mood:
        query = query.where(DiaryEntry.mood == mood)
    if search_title:
        query = query.where(DiaryEntry.title.ilike(f"%{search_title}%"))
    if day_of_week is not None:
        # In SQLite, %w is day of week (0=Sunday)
        query = query.where(func.strftime('%w', DiaryEntry.date) == str(day_of_week))
    
    if has_media is not None:
        if has_media:
            query = query.where(media_count_subquery.c.media_count > 0)
        else:
            query = query.where(
                or_(
                    media_count_subquery.c.media_count == 0,
                    media_count_subquery.c.media_count == None
                )
            )

    if templates:
        query = query.where(DiaryEntry.is_template == True)
    else:
        query = query.where(DiaryEntry.is_template == False)

    query = query.order_by(DiaryEntry.date.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    
    summaries = []
    for entry, media_count in result.all():
        summary = DiaryEntrySummary.from_orm(entry)
        summary.media_count = media_count
        summaries.append(summary)
        
    return summaries

@router.get("/entries/date/{entry_date}", response_model=List[DiaryEntryResponse])
async def get_diary_entries_by_date(
    entry_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all diary entries for a specific date."""
    result = await db.execute(
        select(DiaryEntry)
        .options(selectinload(DiaryEntry.media))
        .where(
            and_(
                func.date(DiaryEntry.date) == entry_date,
                DiaryEntry.user_id == current_user.id
            )
        ).order_by(DiaryEntry.date.asc())
    )
    
    entries = result.scalars().all()
    
    response = []
    for entry in entries:
        res = DiaryEntryResponse.from_orm(entry)
        res.media_count = len(entry.media)
        response.append(res)
        
    return response

@router.get("/entries/{entry_id}", response_model=DiaryEntryResponse)
async def get_diary_entry_by_id(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single diary entry by its unique ID."""
    result = await db.execute(
        select(DiaryEntry)
        .options(selectinload(DiaryEntry.media))
        .where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    response = DiaryEntryResponse.from_orm(entry)
    response.media_count = len(entry.media)
    return response

@router.put("/entries/{entry_id}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_id: int,
    entry_data: DiaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing diary entry."""
    result = await db.execute(
        select(DiaryEntry).options(selectinload(DiaryEntry.media)).where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    entry.date = datetime.combine(entry_data.date, datetime.min.time())
    entry.title = entry_data.title
    entry.encrypted_blob = entry_data.encrypted_blob
    entry.encryption_iv = entry_data.encryption_iv
    entry.encryption_tag = entry_data.encryption_tag
    entry.mood = entry_data.mood
    entry.metadata_json = json.dumps(entry_data.metadata)
    entry.is_template = entry_data.is_template
    entry.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(entry)

    response = DiaryEntryResponse.from_orm(entry)
    response.media_count = len(entry.media) if hasattr(entry, 'media') else 0
    return response

@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary_entry(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a diary entry by its ID."""
    result = await db.execute(
        select(DiaryEntry).where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    await db.delete(entry)
    await db.commit()
    return None

@router.get("/entries/{entry_id}/media", response_model=List[DiaryMediaResponse])
async def get_entry_media(
    entry_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all media associated with a diary entry."""
    # First, ensure the user has access to the diary entry
    entry_res = await db.execute(
        select(DiaryEntry.id).where(
            and_(DiaryEntry.id == entry_id, DiaryEntry.user_id == current_user.id)
        )
    )
    if not entry_res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Diary entry not found")

    media_res = await db.execute(
        select(DiaryMedia).where(DiaryMedia.entry_id == entry_id)
    )
    media_items = media_res.scalars().all()
    return media_items

@router.get("/calendar/{year}/{month}", response_model=Dict[str, List[DiaryCalendarData]])
async def get_calendar_data(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get calendar data for a specific month, showing which days have entries."""
    
    # Subquery to count media per day
    media_count_subquery = (
        select(
            func.date(DiaryMedia.created_at).label("media_date"),
            func.count(DiaryMedia.uuid).label("media_count")
        )
        .where(
            and_(
                DiaryMedia.user_id == current_user.id,
                extract('year', DiaryMedia.created_at) == year,
                extract('month', DiaryMedia.created_at) == month
            )
        )
        .group_by(func.date(DiaryMedia.created_at))
        .subquery()
    )

    query = (
        select(
            func.date(DiaryEntry.date).label("entry_date"),
            func.avg(DiaryEntry.mood).label("avg_mood"),
            func.count(DiaryEntry.id).label("entry_count")
        )
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                extract('year', DiaryEntry.date) == year,
                extract('month', DiaryEntry.date) == month,
                DiaryEntry.is_template == False
            )
        )
        .group_by(func.date(DiaryEntry.date))
    )
    
    result = await db.execute(query)
    db_data = {row.entry_date.strftime('%Y-%m-%d'): row for row in result.all()}

    media_result = await db.execute(select(media_count_subquery))
    media_data = {row.media_date.strftime('%Y-%m-%d'): row.media_count for row in media_result.all()}

    calendar_data = []
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    for day in range(1, num_days + 1):
        date_str = f"{year}-{month:02d}-{day:02d}"
        day_data = db_data.get(date_str)
        media_count = media_data.get(date_str, 0)
        
        calendar_data.append(
            DiaryCalendarData(
                date=date_str,
                has_entry=day_data is not None and day_data.entry_count > 0,
                mood=round(day_data.avg_mood) if (day_data and day_data.avg_mood) else None,
                media_count=media_count
            )
        )
        
    return {"calendar_data": calendar_data}

@router.get("/stats/mood", response_model=MoodStats)
async def get_mood_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get mood statistics."""
    # Mood Distribution
    dist_query = (
        select(DiaryEntry.mood, func.count(DiaryEntry.id).label("count"))
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                DiaryEntry.mood.isnot(None)
            )
        )
        .group_by(DiaryEntry.mood)
    )
    dist_result = await db.execute(dist_query)
    mood_distribution = {mood: count for mood, count in dist_result.all()}

    # Average Mood
    avg_query = select(func.avg(DiaryEntry.mood)).where(
        and_(
            DiaryEntry.user_id == current_user.id,
            DiaryEntry.mood.isnot(None)
        )
    )
    average_mood = (await db.execute(avg_query)).scalar_one_or_none()

    # Total entries with mood
    total_entries = sum(mood_distribution.values())

    return MoodStats(
        average_mood=average_mood,
        mood_distribution=mood_distribution,
        total_entries=total_entries
    ) 

@router.post("/unlock-with-master")
async def unlock_diary_with_master_password(
    master_password: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unlock diary using master recovery password (simplified for single user)
    This allows users to access their diary if they forget the regular diary password
    """
    
    try:
        # Get recovery record (simplified for single user)
        result = await db.execute(select(RecoveryKey))
        recovery_record = result.scalar_one_or_none()
        
        if not recovery_record or not recovery_record.master_password_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No master recovery password found. Please set up master recovery first."
            )
        
        # Verify master recovery password
        if not verify_password(master_password, recovery_record.master_password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect master recovery password"
            )
        
        # Update last used timestamp
        recovery_record.last_used = datetime.utcnow()
        await db.commit()
        
        # Return success - frontend can handle the diary unlock logic
        # The master password can be used as a fallback encryption key
        return {
            "message": "Diary unlocked successfully with master recovery password",
            "unlock_method": "master_password",
            "can_access_diary": True,
            "hint": "Your master recovery password can be used to access encrypted diary entries"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error unlocking diary with master password: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unlock diary. Please try again."
        )

@router.get("/recovery-options")
async def get_diary_recovery_options(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get available recovery options for diary access (simplified for single user)
    """
    
    try:
        # Check if master recovery is available
        result = await db.execute(select(RecoveryKey))
        recovery_record = result.scalar_one_or_none()
        
        has_master = (recovery_record and recovery_record.master_password_hash)
        has_questions = (recovery_record and recovery_record.questions_json and 
                        recovery_record.questions_json != "[]")
        
        return {
            "has_master_recovery": has_master,
            "has_security_questions": has_questions,
            "recovery_message": (
                "You can use your master recovery password to unlock your diary" if has_master
                else "Set up a master recovery password to easily unlock your diary in the future"
            ),
            "recommended_action": (
                "Use master recovery password" if has_master
                else "Set up master recovery password"
            )
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting recovery options: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get recovery options"
        ) 