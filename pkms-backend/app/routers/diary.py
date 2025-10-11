"""
Diary Router for Personal Journal and Diary Entries
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query, Form, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, extract, or_, text
from sqlalchemy.orm import selectinload, aliased
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
from pathlib import Path
import json
import logging
import base64
import uuid as uuid_lib
import hashlib
from typing import Dict
import time
import asyncio
import gc
import threading
from contextlib import contextmanager

from app.database import get_db
from app.config import NEPAL_TZ, get_data_dir, get_file_storage_dir
from app.models.diary import DiaryEntry, DiaryMedia, DiaryDailyMetadata
from app.models.user import User, RecoveryKey
from app.auth.dependencies import get_current_user
from app.auth.security import verify_password, hash_password
from app.utils.diary_encryption import write_encrypted_file, read_encrypted_header, InvalidPKMSFile
from app.models.tag import Tag
from app.models.tag_associations import diary_tags
from app.services.chunk_service import chunk_manager
from app.services.fts_service_enhanced import enhanced_fts_service
from app.schemas.diary import (
    DiaryEntryCreate,
    DiaryEntryResponse,
    DiaryEntrySummary,
    DiaryCalendarData,
    MoodStats,
    WellnessStats,
    WellnessTrendPoint,
    DiaryMediaResponse,
    DiaryMediaUpload,
    CommitDiaryMediaRequest,
    DiaryDailyMetadataResponse,
    DiaryDailyMetadataUpdate,
    WEATHER_CODE_LABELS,
    EncryptionSetupRequest,
    EncryptionUnlockRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["diary"])

WEATHER_CODE_DEFAULT = None

# Secure in-memory session store for diary encryption material with thread safety
# Format: {user_id: {"key": bytes, "timestamp": float, "expires_at": float}}
_diary_sessions: Dict[int, Dict[str, any]] = {}
_diary_sessions_lock = threading.RLock()
DIARY_SESSION_TIMEOUT = 1800  # 30 minutes in seconds (aligned with app session)

@contextmanager
def _get_session_lock():
    """Thread-safe access to diary sessions"""
    with _diary_sessions_lock:
        yield

def _get_diary_password_from_session(user_id: int) -> Optional[bytes]:
    """Get diary derived key from session if valid and not expired."""
    with _get_session_lock():
        if user_id not in _diary_sessions:
            return None
        
        session = _diary_sessions[user_id]
        current_time = time.time()
        
        # Check if session has expired (atomic check and clear)
        if current_time > session["expires_at"]:
            logger.info(f"Diary session expired for user {user_id}")
            _clear_diary_session(user_id)
            return None
        
        return session["key"]

def _store_diary_password_in_session(user_id: int, password: str):
    """Store derived diary key in secure session with expiry.
    
    SECURITY: Uses proper key derivation with salt and stores both key and salt
    for secure encryption operations.
    """
    with _get_session_lock():
        current_time = time.time()
        key, salt = _derive_diary_encryption_key(password)
        
        _diary_sessions[user_id] = {
            "key": key,
            "salt": salt,
            "timestamp": current_time,
            "expires_at": current_time + DIARY_SESSION_TIMEOUT
        }
        logger.info(f"Diary session created for user {user_id}, expires in {DIARY_SESSION_TIMEOUT}s")

def _clear_diary_session(user_id: int):
    """Clear diary session and password from memory.
    
    SECURITY: Securely overwrites all sensitive data in memory before deletion.
    """
    with _get_session_lock():
        if user_id in _diary_sessions:
            session = _diary_sessions[user_id]
            
            # Securely overwrite all sensitive data
            try:
                # Overwrite key
                if "key" in session and session["key"]:
                    key_len = len(session["key"])
                    session["key"] = b"\x00" * key_len
                
                # Overwrite salt
                if "salt" in session and session["salt"]:
                    salt_len = len(session["salt"])
                    session["salt"] = b"\x00" * salt_len
                
                # Overwrite timestamp data
                session["timestamp"] = 0.0
                session["expires_at"] = 0.0
                
            except Exception as e:
                logger.warning(f"Error securely clearing session data for user {user_id}: {e}")
            
            # Remove from dictionary and force garbage collection
            del _diary_sessions[user_id]
            logger.info(f"Diary session cleared for user {user_id}")
            
            # Force cleanup
            gc.collect()

def _is_diary_unlocked(user_id: int) -> bool:
    """Check if diary is currently unlocked for user."""
    return _get_diary_password_from_session(user_id) is not None

async def _cleanup_expired_sessions():
    """Periodically clean up expired diary sessions with error recovery."""
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes

            with _get_session_lock():
                current_time = time.time()
                expired_users = [
                    user_id for user_id, session in _diary_sessions.items()
                    if current_time > session["expires_at"]
                ]

                for user_id in expired_users:
                    try:
                        _clear_diary_session(user_id)
                    except Exception as e:
                        logger.error(f"Error clearing session for user {user_id}: {e}")

                if expired_users:
                    logger.info(f"Cleaned up {len(expired_users)} expired diary sessions")

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Critical error in session cleanup: {e}")
            # Don't exit - continue cleanup loop
            continue

# Start cleanup task when module is imported (application startup)
try:
    # Only start if not already running (avoid multiple tasks in development)
    if not hasattr(_cleanup_expired_sessions, '_task_started'):
        asyncio.create_task(_cleanup_expired_sessions())
        _cleanup_expired_sessions._task_started = True
        logger.info("Started diary session cleanup task (runs every 5 minutes)")
except RuntimeError:
    # Handle case where no event loop is running (e.g., during testing)
    logger.info("Diary session cleanup task will start when event loop is available")

# --- Helper Functions ---

def _derive_diary_encryption_key(password: str, salt: bytes = None) -> tuple[bytes, bytes]:
    """Derive encryption key from diary password using PBKDF2-HMAC-SHA256.
    
    SECURITY: Uses proper key derivation with salt and iterations to prevent
    rainbow table attacks and make brute force computationally expensive.
    
    Args:
        password: User's diary password
        salt: Optional salt (generates new one if None)
        
    Returns:
        Tuple of (derived_key, salt) for AES-256
    """
    import secrets
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
    
    if salt is None:
        salt = secrets.token_bytes(32)  # 256-bit salt
    
    # Use PBKDF2 with 100,000 iterations (OWASP recommended minimum)
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,  # 256-bit key for AES-256
        salt=salt,
        iterations=100000,
    )
    
    key = kdf.derive(password.encode("utf-8"))
    return key, salt


def _generate_diary_file_path(entry_uuid: str) -> Path:
    """Generate stable file path for diary entry using UUID.
    
    Format: diary_{UUID}.dat
    Example: diary_550e8400-e29b-41d4-a716-446655440000.dat
    """
    data_dir = get_file_storage_dir()
    diary_dir = data_dir / "secure" / "entries" / "text"
    diary_dir.mkdir(parents=True, exist_ok=True)
    
    filename = f"diary_{entry_uuid}.dat"
    return diary_dir / filename


async def _handle_diary_tags(db: AsyncSession, entry: DiaryEntry, tag_names: List[str], user_id: int):
    """Handle diary entry tag associations and update usage counts."""
    from app.models.tag import Tag
    from app.models.tag_associations import diary_tags
    from sqlalchemy import delete
    
    # Clear existing tag associations
    await db.execute(
        delete(diary_tags).where(diary_tags.c.diary_entry_uuid == entry.uuid)
    )
    
    if not tag_names:
        return
    
    for tag_name in tag_names:
        # Get or create tag with proper module_type
        result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.name == tag_name,
                    Tag.user_id == user_id,
                    Tag.module_type == "diary"
                )
            )
        )
        tag = result.scalar_one_or_none()
        
        if not tag:
            # Create new tag with diary module_type
            tag = Tag(
                name=tag_name,
                user_id=user_id,
                module_type="diary",
                usage_count=1,
                color="#10b981"  # Green color for diary tags
            )
            db.add(tag)
            await db.flush()
        else:
            # Increment usage count
            tag.usage_count += 1
        
        # Create association
        await db.execute(
            diary_tags.insert().values(
                diary_entry_uuid=entry.uuid,
                tag_uuid=tag.uuid
            )
        )

    # Update denormalized tags_text for FTS and summaries
    try:
        entry.tags_text = " ".join(tag_names)
        await db.flush()
    except Exception:
        # Non-fatal; FTS will still have tags via triggers/population
        pass


async def _get_entry_tags(db: AsyncSession, entry_uuid: str) -> List[str]:
    """Get tag names for a diary entry."""
    from app.models.tag import Tag
    from app.models.tag_associations import diary_tags
    
    result = await db.execute(
        select(Tag.name)
        .select_from(diary_tags.join(Tag))
        .where(diary_tags.c.diary_entry_uuid == entry_uuid)
    )
    return [row[0] for row in result.fetchall()]


async def _get_tags_for_entries(db: AsyncSession, entry_uuids: List[str]) -> Dict[str, List[str]]:
    """Fetch tags for multiple diary entries in a single query."""
    if not entry_uuids:
        return {}

    from app.models.tag import Tag
    from app.models.tag_associations import diary_tags

    result = await db.execute(
        select(diary_tags.c.diary_entry_uuid, Tag.name)
        .select_from(diary_tags.join(Tag))
        .where(diary_tags.c.diary_entry_uuid.in_(entry_uuids))
    )

    tag_map: Dict[str, List[str]] = {}
    for entry_uuid, tag_name in result.fetchall():
        tag_map.setdefault(entry_uuid, []).append(tag_name)
    return tag_map


def _calculate_day_of_week(entry_date: date) -> int:
    """Calculate day of week for database storage.
    
    Returns 0=Sunday, 1=Monday, ..., 6=Saturday to align with SQLite strftime('%w')
    and UI expectations.
    """
    # Python weekday(): Monday=0..Sunday=6 → convert to Sunday=0..Saturday=6
    return (entry_date.weekday() + 1) % 7

async def _upsert_daily_metadata(
    db: AsyncSession,
    user_id: int,
    entry_date: datetime,
    nepali_date: Optional[str],
    metrics: Dict[str, Any]
) -> DiaryDailyMetadata:
    result = await db.execute(
        select(DiaryDailyMetadata)
        .where(
            and_(
                DiaryDailyMetadata.user_id == user_id,
                func.date(DiaryDailyMetadata.date) == entry_date.date(),
            )
        )
        .with_for_update()
    )
    snapshot = result.scalar_one_or_none()
    if snapshot:
        existing_metrics = json.loads(snapshot.metrics_json) if snapshot.metrics_json else {}
        merged = {**existing_metrics, **metrics}
        snapshot.metrics_json = json.dumps(merged)
        snapshot.nepali_date = nepali_date or snapshot.nepali_date
        snapshot.updated_at = datetime.now(NEPAL_TZ)
        await db.flush()
        return snapshot

    snapshot = DiaryDailyMetadata(
        user_id=user_id,
        date=entry_date.replace(tzinfo=NEPAL_TZ),
        nepali_date=nepali_date,
        metrics_json=json.dumps(metrics or {}),
    )
    db.add(snapshot)
    await db.flush()
    return snapshot


# Helper to format daily metadata response
def _format_daily_metadata(snapshot: DiaryDailyMetadata) -> DiaryDailyMetadataResponse:
    metrics = json.loads(snapshot.metrics_json) if snapshot.metrics_json else {}
    return DiaryDailyMetadataResponse(
        date=snapshot.date.date() if isinstance(snapshot.date, datetime) else snapshot.date,
        nepali_date=snapshot.nepali_date,
        metrics=metrics,
        created_at=snapshot.created_at,
        updated_at=snapshot.updated_at,
    )


# --- Pydantic Models ---
# Models are now in app/schemas/diary.py

# --- Encryption Endpoints ---

@router.get("/encryption/status")
async def get_encryption_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if diary encryption is set up for the current user.
    
    Now checks for the presence of diary_password_hash in the User model.
    """
    try:
        # Simple check: encryption is setup if user has diary_password_hash
        is_setup = current_user.diary_password_hash is not None
        is_unlocked = _is_diary_unlocked(current_user.id) if is_setup else False
        
        # Additional security info for monitoring
        session_info = {}
        if is_unlocked and current_user.id in _diary_sessions:
            session = _diary_sessions[current_user.id]
            time_remaining = max(0, int(session["expires_at"] - time.time()))
            session_info = {
                "session_expires_in": time_remaining,
                "session_created_at": session["timestamp"]
            }
        
        logger.info(
            f"Diary encryption status for user {current_user.id}: "
            f"{'setup' if is_setup else 'not setup'}, "
            f"{'unlocked' if is_unlocked else 'locked'}"
        )
        return {
            "is_setup": is_setup,
            "is_unlocked": is_unlocked,
            **session_info,
        }
        
    except (ValueError, TypeError) as e:
        # Handle specific data type errors
        logger.warning(f"Data type error checking diary encryption status for user {current_user.id}: {type(e).__name__}")
        return {"is_setup": False}
    except Exception as e:
        # SECURITY: Don't expose system details in error messages
        logger.error(f"Unexpected error checking diary encryption status for user {current_user.id}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to check diary encryption status"
        )

@router.post("/encryption/setup")
async def setup_encryption(
    request: EncryptionSetupRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set up diary encryption for the current user.
    
    Stores diary_password_hash and diary_password_hint in the User model.
    """
    try:
        logger.info(f"Setting up diary encryption for user {current_user.id}")
        
        # Hash the diary password using bcrypt
        from app.auth.security import hash_password
        pwd_hash = hash_password(request.password)
        
        # Store in User model
        current_user.diary_password_hash = pwd_hash
        current_user.diary_password_hint = request.hint
        
        # Mark user as no longer first-time login since they've set up diary
        if current_user.is_first_login:
            current_user.is_first_login = False
        
        await db.commit()
        
        logger.info(f"Diary encryption setup completed for user {current_user.id}")
        return {"success": True}
        
    except (ValueError, TypeError) as e:
        # Handle specific data type errors
        logger.warning(f"Data type error setting up diary encryption for user {current_user.id}: {type(e).__name__}")
        await db.rollback()
        return {"success": False, "error": "Invalid data provided"}
    except Exception as e:
        # SECURITY: Don't expose system details in error messages
        logger.error(f"Unexpected error setting up diary encryption for user {current_user.id}: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to setup diary encryption"
        )

@router.post("/encryption/unlock")
async def unlock_encryption(
    request: EncryptionUnlockRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Unlock diary encryption session by validating the password.
    
    Validates against diary_password_hash in the User model.
    """
    try:
        logger.info(f"Diary unlock attempt for user {current_user.id}")
        
        # Check if diary encryption is set up
        if not current_user.diary_password_hash:
            logger.warning(f"No diary password hash found for user {current_user.id}")
            return {"success": False, "error": "Diary encryption not set up"}
        
        # SECURITY: Validate password with constant-time comparison
        from app.auth.security import verify_password
        
        # Use bcrypt verification (already constant-time and secure)
        password_valid = verify_password(request.password, current_user.diary_password_hash)
        
        if password_valid:
            # Store password in secure session for subsequent operations
            _store_diary_password_in_session(current_user.id, request.password)
            logger.info(f"Diary unlock successful for user {current_user.id}")
            return {"success": True, "session_expires_in": DIARY_SESSION_TIMEOUT}
        else:
            logger.warning(f"Diary unlock failed due to incorrect password for user {current_user.id}")
            return {"success": False, "error": "Incorrect diary password"}
        
    except (ValueError, TypeError) as e:
        # Handle specific data type errors
        logger.warning(f"Data type error unlocking diary encryption for user {current_user.id}: {type(e).__name__}")
        return {"success": False, "error": "Invalid data provided"}
    except Exception as e:
        # SECURITY: Don't expose system details in error messages
        logger.error(f"Unexpected error unlocking diary encryption for user {current_user.id}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to unlock diary encryption"
        )

@router.post("/encryption/lock")
async def lock_encryption(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Lock diary encryption session by clearing the stored password.
    
    This securely clears the diary password from memory, requiring
    the user to unlock again for subsequent operations.
    """
    try:
        logger.info(f"Diary lock requested for user {current_user.id}")
        
        # Clear the session (password) from memory
        _clear_diary_session(current_user.id)
        
        logger.info(f"Diary locked successfully for user {current_user.id}")
        return {"success": True, "message": "Diary locked successfully"}
        
    except Exception as e:
        # SECURITY: Don't expose system details in error messages
        logger.error(f"Unexpected error locking diary encryption for user {current_user.id}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to lock diary encryption"
        )

@router.get("/encryption/hint")
async def get_password_hint(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the password hint for diary encryption.
    
    Returns hint from User.diary_password_hint field.
    """
    try:
        # Return hint from User model
        hint = current_user.diary_password_hint or ""
        logger.info(f"Password hint requested for user {current_user.id}")
        return {"hint": hint}
        
    except Exception as e:
        # SECURITY: Don't expose system details in error messages
        logger.error(f"Unexpected error getting password hint for user {current_user.id}: {type(e).__name__}")
        return {"hint": ""}

# --- API Endpoints ---

@router.post("/entries", response_model=DiaryEntryResponse)
async def create_diary_entry(
    entry_data: DiaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new diary entry with file-based encrypted storage."""
    try:
        logger.info(f"Creating diary entry for user {current_user.id} on {entry_data.date}")
        
        entry_date = datetime.combine(entry_data.date, datetime.min.time())
        day_of_week = _calculate_day_of_week(entry_data.date)
        
        # Upsert daily metadata snapshot for this day
        daily_metadata = await _upsert_daily_metadata(
            db=db,
            user_id=current_user.id,
            entry_date=entry_date,
            nepali_date=entry_data.nepali_date,
            metrics=entry_data.daily_metrics or {},
        )

        entry = DiaryEntry(
            uuid=str(uuid_lib.uuid4()),
            date=entry_date,
            title=entry_data.title,
            day_of_week=day_of_week,
            media_count=0,
            content_length=len(base64.b64decode(entry_data.encrypted_blob)) if entry_data.encrypted_blob else 0,
            content_file_path="",
            file_hash="",
            mood=entry_data.mood,
            weather_code=entry_data.weather_code,
            location=entry_data.location,
            is_template=entry_data.is_template,
            from_template_id=entry_data.from_template_id,
            user_id=current_user.id,
            encryption_iv=entry_data.encryption_iv,
            encryption_tag=None,
            daily_metadata_id=daily_metadata.id if daily_metadata else None,
        )
        
        db.add(entry)
        await db.flush()
        await db.refresh(entry)
        
        # Persist encrypted content to TEMPORARY location first
        final_file_path = _generate_diary_file_path(entry.uuid)
        temp_file_path = final_file_path.parent / f"temp_{final_file_path.name}"
        
        file_result = write_encrypted_file(
            dest_path=temp_file_path,
            iv_b64=entry_data.encryption_iv,
            encrypted_blob_b64=entry_data.encrypted_blob,
            original_extension="",
        )
        
        entry.content_file_path = str(final_file_path)  # Use final path for DB record
        entry.file_hash = file_result["file_hash"]
        entry.encryption_tag = file_result.get("tag_b64")
        if entry_data.content_length is not None:
            entry.content_length = entry_data.content_length
        
        await db.commit()
        
        # SECURITY: Move encrypted file to final location ONLY after successful DB commit
        try:
            temp_file_path.rename(final_file_path)
            logger.info(f"✅ Diary entry file moved to final location: {final_file_path}")
        except Exception as move_error:
            logger.error(f"❌ Failed to move diary entry file to final location: {move_error}")
            # Clean up temp file
            try:
                if temp_file_path.exists():
                    temp_file_path.unlink()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Failed to finalize diary entry file storage")
        await db.refresh(entry)
        
        if entry_data.tags:
            await _handle_diary_tags(db, entry, entry_data.tags, current_user.id)
            await db.commit()
        
        tags = await _get_entry_tags(db, entry.uuid)
        daily_metrics = json.loads(daily_metadata.metrics_json) if daily_metadata and daily_metadata.metrics_json else {}
        response = DiaryEntryResponse(
            uuid=entry.uuid,
            id=entry.id,
            date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
            title=entry.title,
            encrypted_blob=entry_data.encrypted_blob,
            encryption_iv=entry.encryption_iv,
            mood=entry.mood,
            weather_code=entry.weather_code,
            location=entry.location,
            daily_metrics=daily_metrics,
            nepali_date=daily_metadata.nepali_date if daily_metadata else entry_data.nepali_date,
            is_template=entry.is_template,
            from_template_id=entry.from_template_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            media_count=entry.media_count,
            tags=tags,
            content_length=entry.content_length,
        )
        return response
        
    except (ValueError, TypeError) as e:
        # Handle specific data type errors
        logger.warning(f"Data type error creating diary entry for user {current_user.id}: {type(e).__name__}")
        await db.rollback()
        # Clean up temp file on DB rollback
        try:
            if 'temp_file_path' in locals() and temp_file_path.exists():
                temp_file_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid data provided")
    except Exception as e:
        # SECURITY: Don't expose system details in error messages
        logger.error(f"Unexpected error creating diary entry for user {current_user.id}: {type(e).__name__}")
        await db.rollback()
        # Clean up temp file on DB rollback
        try:
            if 'temp_file_path' in locals() and temp_file_path.exists():
                temp_file_path.unlink()
        except Exception:
            pass
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create diary entry")

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
    
    # Check if diary is unlocked
    diary_password = _get_diary_password_from_session(current_user.id)
    if not diary_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diary is locked. Please unlock diary first."
        )
    
    from sqlalchemy import text
    import json
    
    # Subquery to count media per entry
    media_count_subquery = (
        select(DiaryMedia.diary_entry_uuid, func.count(DiaryMedia.id).label("media_count"))
        .group_by(DiaryMedia.diary_entry_uuid)
        .subquery()
    )

    daily_metadata_alias = aliased(DiaryDailyMetadata)

    summaries = []
    if search_title:
        # Use centralized FTS5 for full-text search (title, tags, metadata)
        id_list = await enhanced_fts_service.search_diary_entries(
            db, search_title, current_user.id, limit=limit, offset=offset
        )
        if not id_list:
            return []
        # Fetch full rows, preserving FTS5 order
        entry_query = (
            select(
                DiaryEntry.uuid,
                DiaryEntry.id,
                DiaryEntry.title,
                DiaryEntry.date,
                DiaryEntry.mood,
                DiaryEntry.weather_code,
                DiaryEntry.location,
                DiaryEntry.is_template,
                DiaryEntry.from_template_id,
                DiaryEntry.created_at,
                DiaryEntry.updated_at,
                func.coalesce(media_count_subquery.c.media_count, 0).label("media_count"),
                daily_metadata_alias.metrics_json.label("metrics_json"),
                daily_metadata_alias.nepali_date.label("nepali_date"),
                DiaryEntry.content_length,
            )
            .outerjoin(media_count_subquery, DiaryEntry.uuid == media_count_subquery.c.diary_entry_uuid)
            .outerjoin(daily_metadata_alias, DiaryEntry.daily_metadata_id == daily_metadata_alias.id)
            .where(and_(DiaryEntry.uuid.in_(id_list), DiaryEntry.user_id == current_user.id))
        )
        # Apply other filters
        # Apply year/month via date-range for index usage
        if year and month:
            start = datetime(year, month, 1)
            # month rollover
            if month == 12:
                end = datetime(year + 1, 1, 1)
            else:
                end = datetime(year, month + 1, 1)
            entry_query = entry_query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
        elif year:
            start = datetime(year, 1, 1)
            end = datetime(year + 1, 1, 1)
            entry_query = entry_query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
        if mood:
            entry_query = entry_query.where(DiaryEntry.mood == mood)
        if day_of_week is not None:
            entry_query = entry_query.where(DiaryEntry.day_of_week == day_of_week)
        if templates is True:
            entry_query = entry_query.where(DiaryEntry.is_template.is_(True))
        elif templates is False:
            entry_query = entry_query.where(DiaryEntry.is_template.is_(False))
        entry_result = await db.execute(entry_query)
        entry_rows = entry_result.fetchall()
        # Map uuid to row for FTS5 order
        row_map = {row.uuid: row for row in entry_rows}
        tag_map = await _get_tags_for_entries(db, list(row_map.keys()))
        for uuid in id_list:
            r = row_map.get(uuid)
            if r:
                summary = DiaryEntrySummary(
                    uuid=r.uuid,
                    id=r.id,
                    date=r.date.date() if isinstance(r.date, datetime) else r.date,
                    title=r.title,
                    mood=r.mood,
                    weather_code=r.weather_code,
                    location=r.location,
                    daily_metrics=json.loads(r.metrics_json) if r.metrics_json else {},
                    nepali_date=r.nepali_date,
                    is_template=r.is_template,
                    from_template_id=r.from_template_id,
                    created_at=r.created_at,
                    media_count=r.media_count,
                    encrypted_blob="",
                    encryption_iv="",
                    tags=tag_map.get(uuid, []),
                    content_length=r.content_length,
                )
                summaries.append(summary)
        return summaries
    else:
        # Default: no search, use existing logic
        query = (
            select(
                DiaryEntry.uuid,
                DiaryEntry.id,
                DiaryEntry.title,
                DiaryEntry.date,
                DiaryEntry.mood,
                DiaryEntry.weather_code,
                DiaryEntry.location,
                DiaryEntry.is_template,
                DiaryEntry.from_template_id,
                DiaryEntry.created_at,
                DiaryEntry.updated_at,
                func.coalesce(media_count_subquery.c.media_count, 0).label("media_count"),
                daily_metadata_alias.metrics_json.label("metrics_json"),
                daily_metadata_alias.nepali_date.label("nepali_date"),
                DiaryEntry.content_length,
            )
            .outerjoin(media_count_subquery, DiaryEntry.uuid == media_count_subquery.c.diary_entry_uuid)
            .outerjoin(daily_metadata_alias, DiaryEntry.daily_metadata_id == daily_metadata_alias.id)
            .where(DiaryEntry.user_id == current_user.id)
        )
        # Apply year/month via date-range for index usage
        if year and month:
            start = datetime(year, month, 1)
            if month == 12:
                end = datetime(year + 1, 1, 1)
            else:
                end = datetime(year, month + 1, 1)
            query = query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
        elif year:
            start = datetime(year, 1, 1)
            end = datetime(year + 1, 1, 1)
            query = query.where(and_(DiaryEntry.date >= start, DiaryEntry.date < end))
        if mood:
            query = query.where(DiaryEntry.mood == mood)
        if day_of_week is not None:
            query = query.where(DiaryEntry.day_of_week == day_of_week)
        if templates is True:
            query = query.where(DiaryEntry.is_template.is_(True))
        elif templates is False:
            query = query.where(DiaryEntry.is_template.is_(False))
        query = query.order_by(DiaryEntry.date.desc()).offset(offset).limit(limit)
        result = await db.execute(query)
        entry_rows = result.all()
        tag_map = await _get_tags_for_entries(db, [row.uuid for row in entry_rows])
        for row in entry_rows:
            summary = DiaryEntrySummary(
                uuid=row.uuid,
                id=row.id,
                date=row.date.date() if isinstance(row.date, datetime) else row.date,
                title=row.title,
                mood=row.mood,
                weather_code=row.weather_code,
                location=row.location,
                daily_metrics=json.loads(row.metrics_json) if row.metrics_json else {},
                nepali_date=row.nepali_date,
                is_template=row.is_template,
                from_template_id=row.from_template_id,
                created_at=row.created_at,
                media_count=row.media_count,
                encrypted_blob="",
                encryption_iv="",
                tags=tag_map.get(row.uuid, []),
                content_length=row.content_length,
            )
            summaries.append(summary)
        return summaries

@router.get("/entries/date/{entry_date}", response_model=List[DiaryEntryResponse])
async def get_diary_entries_by_date(
    entry_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all diary entries for a specific date."""
    # Require diary to be unlocked
    diary_password = _get_diary_password_from_session(current_user.id)
    if not diary_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diary is locked. Please unlock diary first."
        )
    
    result = await db.execute(
        select(DiaryEntry)
        .options(
            selectinload(DiaryEntry.media),
            selectinload(DiaryEntry.daily_metadata)
        )
        .where(
            and_(
                func.date(DiaryEntry.date) == entry_date,
                DiaryEntry.user_id == current_user.id
            )
        ).order_by(DiaryEntry.date.asc())
    )
    
    entries = result.scalars().all()
    
    # Fetch tags for all entries in a single query (avoid lazy loading in async)
    entry_uuids = [entry.uuid for entry in entries]
    tags_map = await _get_tags_for_entries(db, entry_uuids) if entry_uuids else {}
    
    response = []
    for entry in entries:
        # Read encrypted blob from file if available
        encrypted_blob = ""
        try:
            if entry.content_file_path and Path(entry.content_file_path).exists():
                extension, iv, tag, header_size = read_encrypted_header(Path(entry.content_file_path))
                with open(entry.content_file_path, "rb") as f:
                    f.seek(header_size)
                    ciphertext = f.read()
                encrypted_blob = base64.b64encode(ciphertext + tag).decode()
        except Exception:
            encrypted_blob = ""

        daily_metrics = json.loads(entry.daily_metadata.metrics_json) if entry.daily_metadata and entry.daily_metadata.metrics_json else {}
        nepali_date = entry.daily_metadata.nepali_date if entry.daily_metadata else None
        res = DiaryEntryResponse(
            uuid=entry.uuid,
            id=entry.id,
            date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
            nepali_date=nepali_date,
            title=entry.title,
            encrypted_blob=encrypted_blob,
            encryption_iv=entry.encryption_iv,
            weather_code=entry.weather_code,
            location=entry.location,
            mood=entry.mood,
            daily_metrics=daily_metrics,
            is_template=entry.is_template,
            from_template_id=entry.from_template_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            media_count=len(entry.media),
            tags=tags_map.get(entry.uuid, []),  # Use pre-fetched tags
            content_length=entry.content_length,
        )
        response.append(res)
        
    return response

@router.get("/entries/{entry_ref}", response_model=DiaryEntryResponse)
async def get_diary_entry_by_id(
    entry_ref: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single diary entry by its unique ID.
    
    Reads encrypted content from file but returns it in API-compatible format.
    """
    # Require diary to be unlocked
    diary_password = _get_diary_password_from_session(current_user.id)
    if not diary_password:
        raise HTTPException(status_code=401, detail="Diary is locked. Please unlock first.")
    
    try:
        # Allow lookup by numeric id or uuid
        try:
            numeric_id = int(entry_ref)
            condition = DiaryEntry.id == numeric_id
        except ValueError:
            condition = DiaryEntry.uuid == entry_ref

        result = await db.execute(
            select(DiaryEntry)
            .options(
                selectinload(DiaryEntry.media),
                selectinload(DiaryEntry.daily_metadata)
            )
            .where(
                and_(condition, DiaryEntry.user_id == current_user.id)
            )
        )
        entry = result.scalar_one_or_none()
        if not entry:
            raise HTTPException(status_code=404, detail="Diary entry not found")
        
        # Read encrypted_blob from file for API compatibility
        encrypted_blob = ""
        if entry.content_file_path and Path(entry.content_file_path).exists():
            try:
                # Read the file and extract ciphertext + tag
                file_path = Path(entry.content_file_path)
                extension, iv, tag, header_size = read_encrypted_header(file_path)
                
                # Read ciphertext from after header
                with open(file_path, "rb") as f:
                    f.seek(header_size)
                    ciphertext = f.read()
                
                # Combine ciphertext + tag and encode as base64 (matching frontend expectation)
                # Note: read_encrypted_header properly separates tag from ciphertext
                combined = ciphertext + tag
                encrypted_blob = base64.b64encode(combined).decode()
                
                logger.debug(f"Read encrypted content from {file_path.name} for entry {entry_ref}")
                
            except InvalidPKMSFile as e:
                logger.error(f"Corrupt diary file for entry {entry_ref}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Diary file is corrupted or has invalid format: {str(e)}"
                )
            except FileNotFoundError:
                logger.error(f"Diary file missing for entry {entry_ref}: {entry.content_file_path}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Diary content file not found on disk"
                )
            except PermissionError:
                logger.error(f"Permission denied reading diary file for entry {entry_ref}: {entry.content_file_path}")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Permission denied accessing diary file"
                )
            except OSError as e:
                logger.error(f"OS error reading diary file for entry {entry_ref}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=f"File system error: {str(e)}"
                )
            except (UnicodeDecodeError, ValueError) as e:
                logger.error(f"Encoding error reading diary file for entry {entry_ref}: {e}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Diary file contains invalid data encoding"
                )
        else:
            if not entry.content_file_path:
                logger.warning(f"No file path configured for entry {entry_ref}")
                # This is okay - entry might be from older version without file storage
                encrypted_blob = ""
            else:
                logger.error(f"Diary file not found for entry {entry_ref} at {entry.content_file_path}")
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Diary content file not found on disk"
                )
        
        # Get tags
        tags = await _get_entry_tags(db, entry.uuid)
        
        daily_metrics = json.loads(entry.daily_metadata.metrics_json) if entry.daily_metadata and entry.daily_metadata.metrics_json else {}
        nepali_date = entry.daily_metadata.nepali_date if entry.daily_metadata else None
        response = DiaryEntryResponse(
            uuid=entry.uuid,
            id=entry.id,
            date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
            nepali_date=nepali_date,
            title=entry.title,
            encrypted_blob=encrypted_blob,  # Read from file for API compatibility
            encryption_iv=entry.encryption_iv or "",
            weather_code=entry.weather_code,
            location=entry.location,
            mood=entry.mood,
            daily_metrics=daily_metrics,
            is_template=entry.is_template,
            from_template_id=entry.from_template_id,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            media_count=len(entry.media) if hasattr(entry, 'media') else entry.media_count,
            tags=tags,
            content_length=entry.content_length,
        )
        return response
        
    except HTTPException:
        # Re-raise specific HTTP exceptions (from file operations above)
        raise
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in metadata for entry {entry_ref}: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Diary entry contains invalid metadata format"
        )
    except Exception as e:
        # Catch remaining unexpected errors (like database connection issues)
        logger.error(f"Unexpected error retrieving diary entry {entry_ref}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while retrieving the diary entry"
        )

@router.put("/entries/{entry_ref}", response_model=DiaryEntryResponse)
async def update_diary_entry(
    entry_ref: str,
    entry_data: DiaryEntryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing diary entry."""
    # Allow lookup by numeric id or uuid
    try:
        numeric_id = int(entry_ref)
        condition = DiaryEntry.id == numeric_id
    except ValueError:
        condition = DiaryEntry.uuid == entry_ref

    result = await db.execute(
        select(DiaryEntry).options(selectinload(DiaryEntry.media)).where(
            and_(condition, DiaryEntry.user_id == current_user.id)
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="Diary entry not found")

    entry.date = datetime.combine(entry_data.date, datetime.min.time())
    entry.title = entry_data.title
    entry.mood = entry_data.mood
    entry.weather_code = entry_data.weather_code
    entry.location = entry_data.location
    if entry_data.daily_metrics is not None or entry_data.nepali_date is not None:
        entry_date = entry.date
        daily_metadata = await _upsert_daily_metadata(
            db,
            user_id=current_user.id,
            entry_date=entry_date,
            nepali_date=entry_data.nepali_date,
            metrics=entry_data.daily_metrics or {}
        )
        entry.daily_metadata_id = daily_metadata.id
    entry.is_template = entry_data.is_template
    entry.from_template_id = entry_data.from_template_id
    entry.day_of_week = _calculate_day_of_week(entry_data.date)
    entry.encryption_iv = entry_data.encryption_iv
    entry.updated_at = datetime.now(NEPAL_TZ)
    
    # Store original file path for rollback in case of failure
    original_file_path = entry.content_file_path
    
    # Write updated encrypted content to TEMPORARY location first
    final_file_path = _generate_diary_file_path(entry.uuid)
    temp_file_path = final_file_path.parent / f"temp_{final_file_path.name}"

    try:
        file_result = write_encrypted_file(
            dest_path=temp_file_path,
            iv_b64=entry_data.encryption_iv,
            encrypted_blob_b64=entry_data.encrypted_blob,
            original_extension=""
        )
        entry.content_file_path = str(final_file_path)  # Use final path for DB record
        entry.file_hash = file_result["file_hash"]
        entry.encryption_tag = file_result.get("tag_b64")
        entry.content_length = entry_data.content_length if entry_data.content_length is not None else entry.content_length
    except Exception as e:
        # Clean up temp file on write failure
        try:
            if temp_file_path.exists():
                temp_file_path.unlink()
        except Exception:
            pass
        logger.error(f"Failed to write diary file during update for entry {entry_ref}: {e}")
        raise HTTPException(status_code=500, detail="Failed to write diary file")

    # Update tags if provided
    if entry_data.tags is not None:
        await _handle_diary_tags(db, entry, entry_data.tags, current_user.id)

    # CRITICAL FIX: Use transaction to ensure atomicity of DB commit + file move
    try:
        await db.commit()
        
        # SECURITY: Move encrypted file to final location ONLY after successful DB commit
        temp_file_path.rename(final_file_path)
        logger.info(f"✅ Diary entry file moved to final location: {final_file_path}")
        
    except Exception as move_error:
        # CRITICAL: If file move fails after DB commit, we have a serious inconsistency
        # The DB points to a file that doesn't exist. We must rollback.
        logger.error(f"❌ Failed to move diary entry file to final location: {move_error}")
        logger.error(f"❌ CRITICAL: Database inconsistency detected - attempting to fix")

        # Clean up temp file
        try:
            if temp_file_path.exists():
                temp_file_path.unlink()
        except Exception:
            pass

        # CRITICAL: We cannot rollback after commit, so we must fix the DB record
        # Restore the original file path since the move failed
        try:
            if original_file_path:
                entry.content_file_path = original_file_path
                await db.commit()
                logger.info(f"✅ Restored original file path: {original_file_path}")
            else:
                # No original file path - this is a critical data loss situation
                logger.error(f"❌ CRITICAL DATA LOSS: No original file for diary entry {entry_ref}")
                entry.content_file_path = None
                await db.commit()
                logger.error(f"❌ Set content_file_path to NULL for entry {entry_ref}")
        except Exception as fix_error:
            logger.error(f"❌ Failed to fix DB record: {fix_error}")

        raise HTTPException(status_code=500, detail="Failed to finalize diary entry file storage")
    await db.refresh(entry)

    daily_metrics = json.loads(entry.daily_metadata.metrics_json) if entry.daily_metadata and entry.daily_metadata.metrics_json else {}
    nepali_date = entry.daily_metadata.nepali_date if entry.daily_metadata else None
    return DiaryEntryResponse(
        uuid=entry.uuid,
        id=entry.id,
        date=entry.date.date() if isinstance(entry.date, datetime) else entry.date,
        title=entry.title,
        encrypted_blob=entry_data.encrypted_blob,
        encryption_iv=entry.encryption_iv,
        mood=entry.mood,
        weather_code=entry.weather_code,
        location=entry.location,
        daily_metrics=daily_metrics,
        nepali_date=nepali_date,
        is_template=entry.is_template,
        from_template_id=entry.from_template_id,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        media_count=len(entry.media) if hasattr(entry, 'media') else 0,
        tags=await _get_entry_tags(db, entry.uuid)
    )
    
    except HTTPException:
        # Re-raise specific HTTP exceptions (from file operations above)
        raise
    except Exception as e:
        # Catch remaining unexpected errors (like database connection issues)
        logger.error(f"Unexpected error updating diary entry {entry_ref}: {str(e)}")
        await db.rollback()
        # Clean up temp file on DB rollback
        try:
            if 'temp_file_path' in locals() and temp_file_path.exists():
                temp_file_path.unlink()
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while updating the diary entry"
        )

@router.delete("/entries/{entry_ref}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_diary_entry(
    entry_ref: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a diary entry by its ID.
    
    Also deletes the associated encrypted file from storage.
    """
    try:
        # Check if diary is unlocked first
        diary_password = _get_diary_password_from_session(current_user.id)
        if not diary_password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )

        # Allow lookup by numeric id or uuid
        try:
            numeric_id = int(entry_ref)
            condition = DiaryEntry.id == numeric_id
        except ValueError:
            condition = DiaryEntry.uuid == entry_ref

        result = await db.execute(
            select(DiaryEntry).where(
                and_(condition, DiaryEntry.user_id == current_user.id)
            )
        )
        entry = result.scalar_one_or_none()
        if not entry:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, 
                detail="Diary entry not found"
            )
        
        # Delete associated encrypted file
        if entry.content_file_path:
            try:
                file_path = Path(entry.content_file_path)
                if file_path.exists():
                    file_path.unlink()
                    logger.info(f"Deleted diary file: {file_path.name}")
            except Exception as e:
                logger.error(f"Failed to delete diary file {entry.content_file_path}: {str(e)}")
                # Continue with DB deletion even if file deletion fails
        
        await db.delete(entry)
        await db.commit()
        
        logger.info(f"Diary entry {entry_ref} deleted successfully")
        return None
        
    except HTTPException:
        # Re-raise specific HTTP exceptions (like entry not found)
        raise
    except Exception as e:
        # Catch remaining unexpected errors (like database connection issues)
        logger.error(f"Unexpected error deleting diary entry {entry_ref}: {str(e)}")
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete diary entry"
        )

@router.get("/entries/{entry_ref}/media", response_model=List[DiaryMediaResponse])
async def get_entry_media(
    entry_ref: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all media associated with a diary entry."""
    # Check if diary is unlocked first
    diary_password = _get_diary_password_from_session(current_user.id)
    if not diary_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Diary is locked. Please unlock diary first."
        )

    # First, ensure the user has access to the diary entry
    entry_res = await db.execute(
        select(DiaryEntry.uuid).where(
            and_(DiaryEntry.uuid == entry_ref, DiaryEntry.user_id == current_user.id)
        )
    )
    entry_uuid = entry_res.scalar_one_or_none()
    if not entry_uuid:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Diary entry not found"
        )

    media_res = await db.execute(
        select(DiaryMedia).where(DiaryMedia.diary_entry_uuid == entry_uuid)
    )
    media_items = media_res.scalars().all()
    
    # Serialize ORM objects to DiaryMediaResponse
    return [
        DiaryMediaResponse(
            uuid=media.uuid,
            entry_id=media.diary_entry_uuid,
            filename_encrypted=media.filename,
            mime_type=media.mime_type,
            size_bytes=media.file_size,
            media_type=media.media_type,
            duration_seconds=None,  # Could be extracted for audio/video
            created_at=media.created_at
        )
        for media in media_items
    ]

@router.post("/media/upload/commit", response_model=DiaryMediaResponse)
async def commit_diary_media_upload(
    payload: CommitDiaryMediaRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Finalize a previously chunk-uploaded diary media file: encrypt it and create DB record.
    
    Uses the core chunk upload service for efficient uploading, then applies diary-specific
    encryption with the naming scheme: {date}_{diary_id}_{media_id}.dat
    """
    try:
        # Check if diary is unlocked first
        diary_password = _get_diary_password_from_session(current_user.id)
        if not diary_password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Diary is locked. Please unlock diary first."
            )
            
        # Verify diary entry exists and belongs to user
        entry_result = await db.execute(
            select(DiaryEntry).where(
                and_(
                    DiaryEntry.uuid == payload.entry_id,
                    DiaryEntry.user_id == current_user.id
                )
            )
        )
        entry = entry_result.scalar_one_or_none()
        if not entry:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Diary entry not found"
            )

        # Create DiaryMedia record first to get the ID for filename
        diary_media = DiaryMedia(
            uuid=str(uuid_lib.uuid4()),
            diary_entry_uuid=entry.uuid,
            user_id=current_user.id,
            filename="temp",  # Will be updated with proper name
            original_name="",
            file_path="temp",  # Will be updated
            file_size=0,  # Placeholder, will be updated after encryption
            mime_type="application/octet-stream",  # Default, will be updated
            media_type=payload.media_type,
            caption=payload.caption,
            is_encrypted=True
        )
        
        db.add(diary_media)
        await db.flush()  # Get the ID without committing

        # Generate proper filename using the naming scheme: {date}_{diary_id}_{media_id}.dat
        entry_date = entry.date.strftime("%Y-%m-%d")
        encrypted_filename = f"{entry_date}_{entry.uuid}_{diary_media.id}.dat"

        # Check assembled file status
        status_obj = await chunk_manager.get_upload_status(payload.file_id)
        if not status_obj or status_obj.get("status") != "completed":
            raise HTTPException(status_code=400, detail="File not yet assembled")

        # SECURITY: Locate assembled file path with validation
        temp_dir = Path(get_data_dir()) / "temp_uploads"
        
        # Validate file_id to prevent path traversal
        if not payload.file_id or not payload.file_id.replace('-', '').replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Invalid file ID format")
        
        # Use safe glob pattern
        assembled = next(temp_dir.glob(f"complete_{payload.file_id}_*"), None)
        if not assembled:
            raise HTTPException(status_code=404, detail="Assembled file not found")
        
        # Additional security: ensure file is within temp directory
        try:
            assembled.resolve().relative_to(temp_dir.resolve())
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid file path")

        # Prepare destination directory
        media_dir = get_file_storage_dir() / "secure" / "entries" / "media"
        media_dir.mkdir(parents=True, exist_ok=True)
        
        # Use temporary path first, move to final after DB commit
        temp_encrypted_file_path = media_dir / f"temp_{encrypted_filename}"
        final_encrypted_file_path = media_dir / encrypted_filename

        # Read the assembled file content for encryption
        with open(assembled, "rb") as f:
            file_content = f.read()

        # SECURITY: Use proper diary password-based encryption
        import os
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        
        # SECURITY: Generate cryptographically secure IV
        import secrets
        iv = secrets.token_bytes(12)  # 96-bit IV for AES-GCM
        # Note: 96-bit random IVs have astronomically low collision probability
        # No need to scan database for uniqueness
        
        # SECURITY: Atomic check and retrieval to prevent race conditions
        session = _diary_sessions.get(current_user.id)
        if not session or time.time() > session["expires_at"]:
            _clear_diary_session(current_user.id)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Diary session expired. Please unlock diary again."
            )
        
        encryption_key = session["key"]
        aesgcm = AESGCM(encryption_key)
        
        # Encrypt the file content using user's unique key
        encrypted_content = aesgcm.encrypt(iv, file_content, None)
        
        logger.info(f"Media encrypted using user-specific diary password for user {current_user.id}")
        
        # Extract file extension (strip leading dot)
        file_extension = assembled.suffix.lstrip('.').lower() if assembled.suffix else ""
        
        # Use diary_encryption utility to write the encrypted file to TEMPORARY location
        # write_encrypted_file expects ciphertext+tag (full encrypted_content)
        write_encrypted_file(
            dest_path=temp_encrypted_file_path,
            iv_b64=base64.b64encode(iv).decode(),
            encrypted_blob_b64=base64.b64encode(encrypted_content).decode(),  # Full output (ciphertext+tag)
            original_extension=file_extension
        )

        # Get file size before database operations
        assembled_file_size = assembled.stat().st_size
        
        # Update the DiaryMedia record with proper values
        diary_media.filename = encrypted_filename
        diary_media.file_path = str(final_encrypted_file_path)  # Use final path for DB record
        diary_media.file_size = assembled_file_size
        diary_media.mime_type = status_obj.get("mime_type", "application/octet-stream")

        # Calculate and update entry media count
        media_count_result = await db.execute(
            select(func.count(DiaryMedia.id)).where(DiaryMedia.diary_entry_uuid == entry.uuid)
        )
        new_media_count = media_count_result.scalar() or 0
        entry.media_count = new_media_count

        await db.commit()
        await db.refresh(diary_media)

        # SECURITY: Move encrypted file to final location ONLY after successful DB commit
        try:
            temp_encrypted_file_path.rename(final_encrypted_file_path)
            logger.info(f"✅ Encrypted file moved to final location: {final_encrypted_file_path}")
        except Exception as move_error:
            logger.error(f"❌ Failed to move encrypted file to final location: {move_error}")
            # Clean up temp file
            try:
                if temp_encrypted_file_path.exists():
                    temp_encrypted_file_path.unlink()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail="Failed to finalize encrypted file storage")

        # Clean up temporary assembled file
        try:
            assembled.unlink()
            logger.debug(f"Cleaned up temporary file: {assembled}")
        except Exception as e:
            logger.warning(f"Failed to cleanup temporary file: {e}")

        # Remove tracking from chunk manager
        if payload.file_id in chunk_manager.uploads:
            del chunk_manager.uploads[payload.file_id]

        logger.info(f"Diary media committed successfully: {encrypted_filename}")
        
        return DiaryMediaResponse(
            uuid=diary_media.uuid,
            entry_id=diary_media.diary_entry_uuid,
            filename_encrypted=diary_media.filename,
            mime_type=diary_media.mime_type,
            size_bytes=diary_media.file_size,
            media_type=diary_media.media_type,
            duration_seconds=None,  # Could be extracted for audio/video files
            created_at=diary_media.created_at
        )
        
    except HTTPException:
        await db.rollback()
        # Clean up temp encrypted file on DB rollback
        try:
            if 'temp_encrypted_file_path' in locals() and temp_encrypted_file_path.exists():
                temp_encrypted_file_path.unlink()
        except Exception:
            pass
        raise
    except Exception as e:
        await db.rollback()
        # Clean up temp encrypted file on DB rollback
        try:
            if 'temp_encrypted_file_path' in locals() and temp_encrypted_file_path.exists():
                temp_encrypted_file_path.unlink()
        except Exception:
            pass
        logger.error(f"Error committing diary media upload: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to commit media upload"
        )

@router.get("/media/{media_uuid}/download")
async def download_diary_media(
    media_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download and decrypt diary media file.
    
    Returns the original decrypted file with proper content headers.
    Requires diary to be unlocked.
    """
    try:
        # SECURITY: Check diary is unlocked and get password from session  
        diary_password = _get_diary_password_from_session(current_user.id)
        if not diary_password:
            logger.warning(f"Diary not unlocked for download attempt by user {current_user.id}")
            raise HTTPException(status_code=401, detail="Diary is locked. Please unlock first.")
        
        # Get media record
        result = await db.execute(
            select(DiaryMedia)
            .join(DiaryEntry)
            .where(
                and_(
                    DiaryMedia.uuid == media_uuid,
                    DiaryEntry.user_id == current_user.id
                )
            )
        )
        media = result.scalar_one_or_none()
        if not media:
            raise HTTPException(status_code=404, detail="Media file not found")
        
        # Check if encrypted file exists
        file_path = Path(media.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Media file not found on disk")
        
        # Decrypt the file and return decrypted content
        try:
            from app.utils.diary_encryption import read_encrypted_header
            
            # Read encrypted file header
            extension, iv, tag, header_size = read_encrypted_header(file_path)
            
            # Read ciphertext after header
            with open(file_path, "rb") as f:
                f.seek(header_size)
                ciphertext = f.read()
            
            # Decrypt using the same encryption key from diary session
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            
            # Get the encryption key from the current diary session (same key used for encryption)
            diary_session = _diary_sessions.get(current_user.id)
            if not diary_session:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Diary session expired. Please unlock diary again."
                )
            
            # SECURITY: Check if session has expired
            current_time = time.time()
            if current_time > diary_session["expires_at"]:
                logger.info(f"Diary session expired for user {current_user.id}")
                _clear_diary_session(current_user.id)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Diary session expired. Please unlock diary again."
                )
            
            encryption_key = diary_session["key"]  # Use the same key from session
            aesgcm = AESGCM(encryption_key)
            
            # SECURITY: Decrypt the content with proper error handling
            try:
                decrypted_content = aesgcm.decrypt(iv, ciphertext + tag, None)
            except Exception as decrypt_error:
                logger.error(f"Decryption failed for media {media_uuid}: {str(decrypt_error)}")
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Failed to decrypt media file. The file may be corrupted or the encryption key may be invalid."
                )
            
            # SECURITY: Use secure temporary file with proper lifecycle
            import tempfile
            import os
            
            # Create temporary file that will be cleaned up after streaming
            temp_file = tempfile.NamedTemporaryFile(
                delete=False,  # Let FileResponse handle cleanup
                suffix=f".{extension}" if extension else "",
                mode='wb'
            )
            
            temp_file.write(decrypted_content)
            temp_file.flush()
            temp_file.close()  # Close but don't delete
            
            logger.info(f"Successfully decrypted media {media_uuid} for user {current_user.id}")
            
            # FileResponse will clean up after streaming
            from starlette.background import BackgroundTask
            return FileResponse(
                path=temp_file.name,
                filename=f"{media.original_name}",
                media_type=media.mime_type,
                headers={
                    "X-Media-Type": media.media_type,
                    "X-File-Size": str(len(decrypted_content)),
                    "X-Is-Encrypted": "false"
                },
                background=BackgroundTask(os.unlink, temp_file.name)  # Cleanup after streaming
            )
            
        except InvalidPKMSFile as e:
            logger.error(f"Corrupt media file for media {media_uuid}: {e}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Media file is corrupted or has invalid format: {str(e)}"
            )
        except FileNotFoundError:
            logger.error(f"Media file not found for media {media_uuid}: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Media file not found on disk"
            )
        except PermissionError:
            logger.error(f"Permission denied accessing media file {media_uuid}: {file_path}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied accessing media file"
            )
        except ValueError as e:
            # Decryption failed (wrong password, corrupted data, etc.)
            logger.error(f"Decryption failed for media {media_uuid}: {e}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Failed to decrypt media file - invalid password or corrupted data"
            )
        except OSError as e:
            logger.error(f"File system error for media {media_uuid}: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"File system error: {str(e)}"
            )
        except Exception as e:
            # Catch any other unexpected errors during decryption/file handling
            logger.error(f"Unexpected error during media decryption {media_uuid}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An unexpected error occurred during media decryption"
            )
        
    except HTTPException:
        # Re-raise specific HTTP exceptions (from above)
        raise
    except Exception as e:
        # Catch remaining unexpected errors (like database connection issues)
        logger.error(f"Unexpected error downloading diary media {media_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while downloading media"
        )

@router.get("/calendar/{year}/{month}", response_model=Dict[str, List[DiaryCalendarData]])
async def get_calendar_data(
    year: int,
    month: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    logger.info(f"Fetching calendar data for user {current_user.id}, year {year}, month {month}")
    """Get calendar data for a specific month, showing which days have entries."""
    
    # Subquery to count media per day
    media_count_subquery = (
        select(
            func.date(DiaryMedia.created_at).label("media_date"),
            func.count(DiaryMedia.id).label("media_count")
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
    db_data = {}
    for row in result.all():
        # Handle case where entry_date might be string or date
        if isinstance(row.entry_date, str):
            date_key = row.entry_date
        else:
            date_key = row.entry_date.strftime('%Y-%m-%d')
        db_data[date_key] = row

    media_result = await db.execute(select(media_count_subquery))
    media_data = {}
    for row in media_result.all():
        # Handle case where media_date might be string or date
        if isinstance(row.media_date, str):
            date_key = row.media_date
        else:
            date_key = row.media_date.strftime('%Y-%m-%d')
        media_data[date_key] = row.media_count

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
                mood=round(float(day_data.avg_mood)) if (day_data and day_data.avg_mood is not None) else None,
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


@router.get("/stats/wellness", response_model=WellnessStats)
async def get_wellness_stats(
    days: int = Query(30, ge=1, le=365, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get comprehensive wellness analytics including mood, sleep, exercise, 
    screen time, energy, stress, and correlations.
    """
    # Calculate date range
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days - 1)
    
    # Query all diary entries in range with mood
    entries_query = (
        select(DiaryEntry)
        .where(
            and_(
                DiaryEntry.user_id == current_user.id,
                func.date(DiaryEntry.date) >= start_date,
                func.date(DiaryEntry.date) <= end_date
            )
        )
        .order_by(DiaryEntry.date)
    )
    entries_result = await db.execute(entries_query)
    entries = entries_result.scalars().all()
    
    # Query all daily metadata in range
    metadata_query = (
        select(DiaryDailyMetadata)
        .where(
            and_(
                DiaryDailyMetadata.user_id == current_user.id,
                func.date(DiaryDailyMetadata.date) >= start_date,
                func.date(DiaryDailyMetadata.date) <= end_date
            )
        )
        .order_by(DiaryDailyMetadata.date)
    )
    metadata_result = await db.execute(metadata_query)
    metadata_records = metadata_result.scalars().all()
    
    # Parse metrics from JSON
    daily_data = {}  # {date_str: {mood, metrics_dict}}
    for record in metadata_records:
        date_str = record.date.strftime("%Y-%m-%d")
        try:
            metrics = json.loads(record.metrics_json) if record.metrics_json else {}
        except json.JSONDecodeError:
            metrics = {}
        daily_data[date_str] = {"metrics": metrics, "mood": None}
    
    # Add mood data from entries
    for entry in entries:
        date_str = entry.date.strftime("%Y-%m-%d")
        if date_str not in daily_data:
            daily_data[date_str] = {"metrics": {}, "mood": entry.mood}
        else:
            daily_data[date_str]["mood"] = entry.mood
    
    # Initialize aggregators
    mood_values = []
    sleep_values = []
    exercise_days = 0
    exercise_minutes = []
    screen_time_values = []
    energy_values = []
    stress_values = []
    water_values = []
    meditation_days = 0
    gratitude_days = 0
    social_days = 0
    sleep_quality_days = 0
    
    # Trends
    mood_trend = []
    sleep_trend = []
    exercise_trend = []
    screen_time_trend = []
    energy_trend = []
    stress_trend = []
    hydration_trend = []
    
    # Correlation data
    mood_sleep_pairs = []
    
    # Mood distribution
    mood_distribution = {}
    
    # Process each day in range
    for single_date in (start_date + timedelta(n) for n in range(days)):
        date_str = single_date.strftime("%Y-%m-%d")
        data = daily_data.get(date_str, {"metrics": {}, "mood": None})
        metrics = data["metrics"]
        mood = data["mood"]
        
        # Mood
        if mood is not None:
            mood_values.append(mood)
            mood_distribution[mood] = mood_distribution.get(mood, 0) + 1
            mood_trend.append(WellnessTrendPoint(date=date_str, value=float(mood)))
        else:
            mood_trend.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Sleep
        sleep_duration = metrics.get("sleep_duration")
        if sleep_duration is not None:
            sleep_values.append(sleep_duration)
            sleep_trend.append(WellnessTrendPoint(date=date_str, value=float(sleep_duration)))
            if sleep_duration >= 7:
                sleep_quality_days += 1
            # For correlation
            if mood is not None:
                mood_sleep_pairs.append({"mood": float(mood), "sleep": float(sleep_duration)})
        else:
            sleep_trend.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Exercise
        did_exercise = metrics.get("did_exercise", False)
        exercise_minutes_val = metrics.get("exercise_minutes", 0) if did_exercise else 0
        if did_exercise:
            exercise_days += 1
            if exercise_minutes_val:
                exercise_minutes.append(exercise_minutes_val)
        exercise_trend.append(WellnessTrendPoint(
            date=date_str, 
            value=float(exercise_minutes_val) if exercise_minutes_val else 0,
            label="Yes" if did_exercise else "No"
        ))
        
        # Screen time
        screen_time = metrics.get("screen_time")
        if screen_time is not None:
            screen_time_values.append(screen_time)
            screen_time_trend.append(WellnessTrendPoint(date=date_str, value=float(screen_time)))
        else:
            screen_time_trend.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Energy
        energy = metrics.get("energy_level")
        if energy is not None:
            energy_values.append(energy)
            energy_trend.append(WellnessTrendPoint(date=date_str, value=float(energy)))
        else:
            energy_trend.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Stress
        stress = metrics.get("stress_level")
        if stress is not None:
            stress_values.append(stress)
            stress_trend.append(WellnessTrendPoint(date=date_str, value=float(stress)))
        else:
            stress_trend.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Water intake
        water = metrics.get("water_intake")
        if water is not None:
            water_values.append(water)
            hydration_trend.append(WellnessTrendPoint(date=date_str, value=float(water)))
        else:
            hydration_trend.append(WellnessTrendPoint(date=date_str, value=None))
        
        # Habits
        if metrics.get("did_meditation"):
            meditation_days += 1
        if metrics.get("gratitude_practice"):
            gratitude_days += 1
        if metrics.get("social_interaction"):
            social_days += 1
    
    # Calculate averages with proper floating point handling
    avg_mood = round(sum(mood_values) / len(mood_values), 2) if mood_values else None
    avg_sleep = round(sum(sleep_values) / len(sleep_values), 2) if sleep_values else None
    avg_screen_time = round(sum(screen_time_values) / len(screen_time_values), 2) if screen_time_values else None
    avg_energy = round(sum(energy_values) / len(energy_values), 2) if energy_values else None
    avg_stress = round(sum(stress_values) / len(stress_values), 2) if stress_values else None
    avg_water = round(sum(water_values) / len(water_values), 2) if water_values else None
    avg_exercise_minutes = round(sum(exercise_minutes) / len(exercise_minutes), 2) if exercise_minutes else None
    
    # Exercise frequency per week
    weeks = days / 7.0
    exercise_freq_per_week = exercise_days / weeks if weeks > 0 else 0
    
    # Calculate correlation coefficient (Pearson r) for mood vs sleep
    correlation_coefficient = None
    if len(mood_sleep_pairs) >= 3:  # Need at least 3 points for correlation
        try:
            moods = [p["mood"] for p in mood_sleep_pairs]
            sleeps = [p["sleep"] for p in mood_sleep_pairs]
            
            n = len(moods)
            sum_mood = sum(moods)
            sum_sleep = sum(sleeps)
            sum_mood_sq = sum(m * m for m in moods)
            sum_sleep_sq = sum(s * s for s in sleeps)
            sum_mood_sleep = sum(m * s for m, s in zip(moods, sleeps))
            
            numerator = n * sum_mood_sleep - sum_mood * sum_sleep
            denominator = ((n * sum_mood_sq - sum_mood ** 2) * (n * sum_sleep_sq - sum_sleep ** 2)) ** 0.5
            
            if denominator != 0:
                correlation_coefficient = numerator / denominator
        except Exception as e:
            logger.warning(f"Failed to calculate correlation: {e}")
    
    # Calculate wellness score (0-100)
    score_components = {}
    component_scores = []
    
    # Sleep component (25%)
    if avg_sleep is not None:
        sleep_score = min(100, (avg_sleep / 8.0) * 100)
        score_components["sleep"] = round(sleep_score, 1)
        component_scores.append(sleep_score * 0.25)
    
    # Exercise component (20%)
    if exercise_freq_per_week > 0:
        exercise_score = min(100, (exercise_freq_per_week / 4.0) * 100)
        score_components["exercise"] = round(exercise_score, 1)
        component_scores.append(exercise_score * 0.20)
    
    # Mental wellness component (20%)
    if avg_energy is not None and avg_stress is not None:
        mental_score = ((avg_energy + (6 - avg_stress)) / 10.0) * 100
        score_components["mental"] = round(mental_score, 1)
        component_scores.append(mental_score * 0.20)
    
    # Healthy habits component (15%)
    if avg_water is not None:
        habits_score = min(100, (avg_water / 8.0) * 100)
        score_components["habits"] = round(habits_score, 1)
        component_scores.append(habits_score * 0.15)
    
    # Low screen time component (10%)
    if avg_screen_time is not None:
        screen_score = max(0, 100 - (avg_screen_time / 8.0) * 100)
        score_components["screenTime"] = round(screen_score, 1)
        component_scores.append(screen_score * 0.10)
    
    # Mindfulness component (10%)
    mindfulness_score = (meditation_days / days) * 100 if days > 0 else 0
    score_components["mindfulness"] = round(mindfulness_score, 1)
    component_scores.append(mindfulness_score * 0.10)
    
    overall_wellness_score = sum(component_scores) if component_scores else None
    
    # Generate insights
    insights = []
    
    # Positive insights
    if avg_sleep and avg_sleep >= 7.5:
        insights.append({
            "type": "positive",
            "message": f"Excellent sleep quality! Averaging {avg_sleep:.1f} hours per night.",
            "metric": "sleep"
        })
    
    if exercise_freq_per_week >= 4:
        insights.append({
            "type": "positive",
            "message": f"Great job! You exercised {exercise_freq_per_week:.1f} days per week.",
            "metric": "exercise"
        })
    
    if meditation_days >= days * 0.5:
        insights.append({
            "type": "positive",
            "message": f"Wonderful mindfulness practice! {meditation_days} meditation days.",
            "metric": "mental"
        })
    
    # Areas for improvement
    if avg_sleep and avg_sleep < 6:
        insights.append({
            "type": "negative",
            "message": f"You're averaging only {avg_sleep:.1f} hours of sleep. Aim for 7-8 hours.",
            "metric": "sleep"
        })
    
    if avg_screen_time and avg_screen_time > 6:
        insights.append({
            "type": "negative",
            "message": f"High screen time detected ({avg_screen_time:.1f} hrs/day). Consider reducing it.",
            "metric": "habits"
        })
    
    if exercise_freq_per_week < 2:
        insights.append({
            "type": "neutral",
            "message": f"Only {exercise_freq_per_week:.1f} exercise days per week. Try to increase activity.",
            "metric": "exercise"
        })
    
    # Correlation insights
    if correlation_coefficient is not None:
        if correlation_coefficient > 0.5:
            insights.append({
                "type": "neutral",
                "message": f"Strong positive link: Better sleep improves your mood (r={correlation_coefficient:.2f}).",
                "metric": "correlation"
            })
        elif correlation_coefficient < -0.5:
            insights.append({
                "type": "neutral",
                "message": f"Inverse relationship: More sleep correlates with lower mood (r={correlation_coefficient:.2f}).",
                "metric": "correlation"
            })
    
    # Days with data
    days_with_data = len([d for d in daily_data.values() if d["metrics"] or d["mood"] is not None])
    
    return WellnessStats(
        period_start=start_date.strftime("%Y-%m-%d"),
        period_end=end_date.strftime("%Y-%m-%d"),
        total_days=days,
        days_with_data=days_with_data,
        wellness_score=round(overall_wellness_score, 1) if overall_wellness_score else None,
        average_mood=round(avg_mood, 2) if avg_mood else None,
        average_sleep=round(avg_sleep, 1) if avg_sleep else None,
        mood_trend=mood_trend,
        mood_distribution=mood_distribution,
        sleep_trend=sleep_trend,
        sleep_quality_days=sleep_quality_days,
        exercise_trend=exercise_trend,
        days_exercised=exercise_days,
        exercise_frequency_per_week=round(exercise_freq_per_week, 1),
        average_exercise_minutes=round(avg_exercise_minutes, 1) if avg_exercise_minutes else None,
        screen_time_trend=screen_time_trend,
        average_screen_time=round(avg_screen_time, 1) if avg_screen_time else None,
        energy_trend=energy_trend,
        stress_trend=stress_trend,
        average_energy=round(avg_energy, 1) if avg_energy else None,
        average_stress=round(avg_stress, 1) if avg_stress else None,
        hydration_trend=hydration_trend,
        average_water_intake=round(avg_water, 1) if avg_water else None,
        meditation_days=meditation_days,
        gratitude_days=gratitude_days,
        social_interaction_days=social_days,
        mood_sleep_correlation=mood_sleep_pairs,
        correlation_coefficient=round(correlation_coefficient, 3) if correlation_coefficient else None,
        wellness_components=score_components,
        insights=insights
    )


@router.get("/daily-metadata/{target_date}", response_model=DiaryDailyMetadataResponse)
async def get_daily_metadata(
    target_date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        date_obj = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD")

    result = await db.execute(
        select(DiaryDailyMetadata)
        .where(
            and_(
                DiaryDailyMetadata.user_id == current_user.id,
                func.date(DiaryDailyMetadata.date) == date_obj,
            )
        )
    )
    snapshot = result.scalar_one_or_none()
    if not snapshot:
        raise HTTPException(status_code=404, detail="No daily metadata found for this date")

    return _format_daily_metadata(snapshot)


@router.put("/daily-metadata/{target_date}", response_model=DiaryDailyMetadataResponse)
async def update_daily_metadata(
    target_date: str,
    payload: DiaryDailyMetadataUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        date_obj = datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Expected YYYY-MM-DD")

    snapshot = await _upsert_daily_metadata(
        db=db,
        user_id=current_user.id,
        entry_date=date_obj,
        nepali_date=payload.nepali_date,
        metrics=payload.metrics,
    )
    await db.commit()
    await db.refresh(snapshot)
    return _format_daily_metadata(snapshot)