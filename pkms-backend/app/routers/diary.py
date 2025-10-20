"""
Diary Router for Personal Journal and Diary Entries

Refactored to use service layer for business logic.
Router now contains only HTTP endpoint definitions and thin wrappers.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, File, UploadFile, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
import logging

from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user
from app.auth.security import hash_password
from app.schemas.diary import (
    DiaryEntryCreate,
    DiaryEntryUpdate,
    DiaryEntryResponse,
    DiaryEntrySummary,
    DiaryDailyMetadataResponse,
    DiaryDailyMetadataUpdate,
    WeeklyHighlights,
    DiaryCalendarData,
    MoodStats,
    WellnessStats,
    DiaryFileResponse,
    DiaryFileUpload,
    CommitDiaryFileRequest,
    EncryptionSetupRequest,
    EncryptionUnlockRequest,
    WEATHER_CODE_LABELS,
)

# Import our new services
from app.services.diary_session_service import diary_session_service
from app.services.diary_metadata_service import diary_metadata_service
from app.services.diary_crud_service import diary_crud_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["diary"])

# Start the session cleanup task
diary_session_service.start_cleanup_task()

# --- Authentication Endpoints ---

@router.get("/encryption/status")
async def get_encryption_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if diary encryption is set up for the current user."""
    try:
        # Simple check: encryption is setup if user has diary_password_hash
        is_setup = current_user.diary_password_hash is not None
        is_unlocked = await diary_session_service.is_unlocked(current_user.uuid) if is_setup else False
        
        logger.info(
            f"Diary encryption status for user {current_user.uuid}: "
            f"{'setup' if is_setup else 'not setup'}, "
            f"{'unlocked' if is_unlocked else 'locked'}"
        )
        return {
            "is_setup": is_setup,
            "is_unlocked": is_unlocked,
        }
        
    except (ValueError, TypeError) as e:
        logger.warning(f"Data type error checking diary encryption status for user {current_user.uuid}: {type(e).__name__}")
        return {"is_setup": False}
    except Exception as e:
        logger.error(f"Unexpected error checking diary encryption status for user {current_user.uuid}: {type(e).__name__}")
        return {"is_setup": False}


@router.post("/encryption/setup")
async def setup_diary_encryption(
    setup_data: EncryptionSetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set up diary encryption for the current user."""
    try:
        # Check if already setup
        if current_user.diary_password_hash is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Diary encryption is already set up for this user"
            )
        
        # Hash the password
        password_hash = hash_password(setup_data.password)
        
        # Update user record
        current_user.diary_password_hash = password_hash
        current_user.diary_password_hint = setup_data.hint
        
        await db.commit()
        await db.refresh(current_user)
        
        logger.info(f"Diary encryption setup completed for user {current_user.uuid}")
        
        return {"message": "Diary encryption setup successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting up diary encryption for user {current_user.uuid}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to setup diary encryption"
        )


@router.post("/encryption/unlock")
async def unlock_diary(
    unlock_data: EncryptionUnlockRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unlock diary with password."""
    try:
        # Check if encryption is setup
        if current_user.diary_password_hash is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Diary encryption is not set up"
            )
        
        # Verify password
        from app.auth.security import verify_password
        if not verify_password(unlock_data.password, current_user.diary_password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid diary password"
            )
        
        # Store password in session
        await diary_session_service.store_password_in_session(current_user.uuid, unlock_data.password)
        
        logger.info(f"Diary unlocked for user {current_user.uuid}")
        
        return {"message": "Diary unlocked successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unlocking diary for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unlock diary"
        )


@router.post("/encryption/lock")
async def lock_diary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lock diary and clear session."""
    try:
        await diary_session_service.clear_session(current_user.uuid)
        
        logger.info(f"Diary locked for user {current_user.uuid}")
        
        return {"message": "Diary locked successfully"}
        
    except Exception as e:
        logger.error(f"Error locking diary for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to lock diary"
        )


@router.get("/encryption/hint")
async def get_encryption_hint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get diary password hint."""
    if current_user.diary_password_hint is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No password hint available"
        )
    
    return {"hint": current_user.diary_password_hint}


# --- CRUD Endpoints ---

@router.post("/entries", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry_data: DiaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new diary entry with file-based encrypted storage."""
    try:
        # Check if diary is unlocked
        diary_key = await diary_session_service.get_password_from_session(current_user.uuid)
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        return await diary_crud_service.create_entry(
            db=db,
            user_uuid=current_user.uuid,
            entry_data=entry_data,
            diary_key=diary_key
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating diary entry for user {current_user.uuid}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create diary entry"
        )


@router.get("/entries", response_model=List[DiaryEntrySummary])
async def list_diary_entries(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    mood: Optional[int] = Query(None),
    templates: bool = Query(False),
    search_title: Optional[str] = Query(None, description="Search by entry title, tag, or metadata"),
    day_of_week: Optional[int] = Query(None, description="Filter by day of week (0=Sun, 1=Mon..)", ge=0, le=6),
    limit: int = Query(20, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List diary entries with filtering. Uses FTS5 for text search if search_title is provided."""
    try:
        # Check if diary is unlocked
        diary_key = await diary_session_service.get_password_from_session(current_user.uuid)
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        return await diary_crud_service.list_entries(
            db=db,
            user_uuid=current_user.uuid,
            diary_key=diary_key,
            year=year,
            month=month,
            mood=mood,
            templates=templates,
            search_title=search_title,
            day_of_week=day_of_week,
            limit=limit,
            offset=offset
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing diary entries for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list diary entries"
        )


@router.get("/entries/date/{entry_date}", response_model=List[DiaryEntryResponse])
async def get_diary_entries_by_date(
    entry_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all diary entries for a specific date."""
    try:
        # Check if diary is unlocked
        diary_key = await diary_session_service.get_password_from_session(current_user.uuid)
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        return await diary_crud_service.get_entries_by_date(
            db=db,
            user_uuid=current_user.uuid,
            entry_date=entry_date,
            diary_key=diary_key
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting diary entries by date for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get diary entries"
        )


@router.get("/entries/{entry_ref}", response_model=DiaryEntryResponse)
async def get_diary_entry_by_id(
    entry_ref: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single diary entry by UUID or date."""
    try:
        # Check if diary is unlocked
        diary_key = await diary_session_service.get_password_from_session(current_user.uuid)
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        return await diary_crud_service.get_entry_by_ref(
            db=db,
            user_uuid=current_user.uuid,
            entry_ref=entry_ref,
            diary_key=diary_key
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting diary entry for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get diary entry"
        )


@router.put("/entries/{entry_ref}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_ref: str,
    updates: DiaryEntryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a diary entry."""
    try:
        # Check if diary is unlocked
        diary_key = await diary_session_service.get_password_from_session(current_user.uuid)
        if not diary_key:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
        
        return await diary_crud_service.update_entry(
            db=db,
            user_uuid=current_user.uuid,
            entry_ref=entry_ref,
            updates=updates,
            diary_key=diary_key
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating diary entry for user {current_user.uuid}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update diary entry"
        )


@router.delete("/entries/{entry_ref}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary_entry(
    entry_ref: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a diary entry (soft delete)."""
    try:
        await diary_crud_service.delete_entry(
            db=db,
            user_uuid=current_user.uuid,
            entry_ref=entry_ref
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting diary entry for user {current_user.uuid}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete diary entry"
        )


# --- File Operations ---

@router.get("/entries/{entry_ref}/files", response_model=List[DiaryFileResponse])
async def get_entry_files(
    entry_ref: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all files attached to a diary entry."""
    try:
        return await diary_crud_service.get_entry_files(
            db=db,
            user_uuid=current_user.uuid,
            entry_ref=entry_ref
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting entry files for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get entry files"
        )


@router.post("/files/upload/commit", response_model=DiaryFileResponse)
async def commit_diary_file_upload(
    upload_id: str = Form(...),
    metadata: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Commit a file upload to a diary entry."""
    try:
        import json
        metadata_dict = json.loads(metadata)
        commit_request = CommitDiaryFileRequest(**metadata_dict)
        
        return await diary_crud_service.commit_file_upload(
            db=db,
            user_uuid=current_user.uuid,
            upload_id=upload_id,
            metadata=commit_request
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error committing diary file upload for user {current_user.uuid}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit file upload"
        )


@router.get("/files/{file_uuid}/download")
async def download_diary_file(
    file_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """Download a diary file."""
    try:
        return await diary_crud_service.download_file(
            db=db,
            user_uuid=current_user.uuid,
            file_uuid=file_uuid,
            request=request
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading diary file for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to download file"
        )


# --- Metadata & Analytics Endpoints ---

@router.get("/calendar/{year}/{month}", response_model=Dict[str, List[DiaryCalendarData]])
async def get_calendar_data(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get calendar data for a specific month, showing which days have entries."""
    try:
        return await diary_metadata_service.get_calendar_data(
            db=db,
            user_uuid=current_user.uuid,
            year=year,
            month=month
        )
        
    except Exception as e:
        logger.error(f"Error getting calendar data for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get calendar data"
        )


@router.get("/stats/mood", response_model=MoodStats)
async def get_mood_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get mood statistics."""
    try:
        return await diary_metadata_service.get_mood_stats(
            db=db,
            user_uuid=current_user.uuid
        )
        
    except Exception as e:
        logger.error(f"Error getting mood stats for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get mood statistics"
        )


@router.get("/stats/wellness", response_model=WellnessStats)
async def get_wellness_stats(
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive wellness analytics including mood, sleep, exercise, screen time, energy, stress, and correlations."""
    try:
        return await diary_metadata_service.get_wellness_stats(
            db=db,
            user_uuid=current_user.uuid,
            days=days
        )
        
    except Exception as e:
        logger.error(f"Error getting wellness stats for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get wellness statistics"
        )


@router.get("/weekly-highlights", response_model=WeeklyHighlights)
async def get_weekly_highlights(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return a simple weekly highlights summary across modules and diary finances."""
    try:
        return await diary_metadata_service.get_weekly_highlights(
            db=db,
            user_uuid=current_user.uuid
        )
        
    except Exception as e:
        logger.error(f"Error getting weekly highlights for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get weekly highlights"
        )


@router.get("/daily-metadata/{target_date}", response_model=DiaryDailyMetadataResponse)
async def get_daily_metadata(
    target_date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get daily metadata for a specific date."""
    try:
        return await diary_metadata_service.get_daily_metadata(
            db=db,
            user_uuid=current_user.uuid,
            target_date=target_date
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error getting daily metadata for user {current_user.uuid}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get daily metadata"
        )


@router.put("/daily-metadata/{target_date}", response_model=DiaryDailyMetadataResponse)
async def update_daily_metadata(
    target_date: str,
    payload: DiaryDailyMetadataUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update daily metadata for a specific date."""
    try:
        return await diary_metadata_service.update_daily_metadata(
            db=db,
            user_uuid=current_user.uuid,
            target_date=target_date,
            payload=payload
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating daily metadata for user {current_user.uuid}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update daily metadata"
        )