"""
Authentication and Utilities Testing Router for PKMS Backend

Provides authentication debugging, encryption testing, and utility endpoints
for system validation and troubleshooting.
"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, text
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import json
import logging

# Set up logger
logger = logging.getLogger(__name__)

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User, Session
from ..models.diary import DiaryEntry
from ..services.diary_crypto_service import DiaryCryptoService
from ..models.associations import document_diary

from ..config import NEPAL_TZ, get_data_dir

router = APIRouter(prefix="/testing/auth", tags=["testing-auth"])


@router.get("/session-status")
async def get_session_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current session status and timing information for testing session extension."""
    try:
        from ..models.user import Session
        from datetime import datetime

        # Get current user's active session
        session_result = await db.execute(
            select(Session)
            .where(Session.created_by == current_user.uuid)
            .where(Session.expires_at > datetime.now(NEPAL_TZ))
            .order_by(Session.expires_at.desc())
            .limit(1)
        )
        session = session_result.scalar_one_or_none()

        if not session:
            return {
                "status": "no_active_session",
                "message": "No active session found",
                "created_by": current_user.uuid,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

        now = datetime.now(NEPAL_TZ)
        time_until_expiry = session.expires_at - now
        time_since_created = now - session.created_at
        time_since_activity = now - session.last_activity if session.last_activity else None

        # Calculate if session was recently extended (within last 10 seconds)
        recently_extended = False
        if session.last_activity:
            recent_threshold = timedelta(seconds=10)
            recently_extended = (now - session.last_activity) < recent_threshold

        # Session health metrics
        session_health = {
            "is_valid": session.expires_at > now,
            "expires_in_seconds": int(time_until_expiry.total_seconds()),
            "age_seconds": int(time_since_created.total_seconds()),
            "idle_seconds": int(time_since_activity.total_seconds()) if time_since_activity else 0,
            "recently_extended": recently_extended,
            "utilization_percent": round((time_since_created.total_seconds() / (24 * 60 * 60)) * 100, 2)  # % of 24h used
        }

        return {
            "status": "active_session",
            "session": {
                "session_token": session.session_token[:16] + "...",  # Partial token for identification
                "created_at": session.created_at.isoformat(),
                "expires_at": session.expires_at.isoformat(),
                "last_activity": session.last_activity.isoformat() if session.last_activity else None,
                "ip_address": session.ip_address,
                "user_agent": session.user_agent,
                "health": session_health
            },
            "user": {
                "uuid": current_user.uuid,
                "username": current_user.username,
                "email": current_user.email
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting session status: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get session status: {str(e)}")


@router.post("/diary/test-encryption")
async def test_diary_encryption(
    test_content: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test diary encryption by verifying password and showing decryption capabilities."""
    try:
        # Use provided test content or generate default
        if not test_content:
            test_content = f"PKMS Encryption Test\nUser: {current_user.username}\nTime: {datetime.now(NEPAL_TZ)}\nSecret Data: TEST_PASSWORD_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        crypto_service = DiaryCryptoService()

        # Test encryption
        try:
            encrypted_result = crypto_service.encrypt_content(test_content)

            return {
                "status": "success",
                "message": "Diary encryption test completed successfully",
                "encryption_test": {
                    "original_length": len(test_content),
                    "encrypted_length": len(encrypted_result['encrypted_blob']),
                    "encryption_method": "AES-256-GCM",
                    "iv_length": len(encrypted_result['iv']),
                    "tag_length": len(encrypted_result['tag']),
                    "encryption_time": encrypted_result.get('encryption_time_ms', 0),
                    "encrypted_blob_preview": encrypted_result['encrypted_blob'][:50] + "..." if len(encrypted_result['encrypted_blob']) > 50 else encrypted_result['encrypted_blob']
                },
                "user_info": {
                    "user_uuid": current_user.uuid,
                    "username": current_user.username
                },
                "timestamp": datetime.now(NEPAL_TZ).isoformat(),
                "note": "This test only shows encryption capabilities. Actual diary entries use client-side encryption."
            }

        except Exception as e:
            logger.error(f"Diary encryption test failed: {type(e).__name__}")
            return {
                "status": "encryption_failed",
                "message": "Diary encryption test failed",
                "error": str(e),
                "user_info": {
                    "user_uuid": current_user.uuid,
                    "username": current_user.username
                },
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

    except Exception as e:
        logger.error(f"Error in diary encryption test: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Diary encryption test failed: {str(e)}")


@router.get("/debug")
async def debug_authentication_status(
    db: AsyncSession = Depends(get_db)
):
    """Debug authentication status without requiring authentication."""
    try:
        debug_info = {
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "authentication_system": {
                "status": "operational",
                "dependencies": {
                    "diary_crypto_service": "loaded",
                    "user_model": "available",
                    "session_model": "available"
                }
            },
            "database": {
                "connection_status": "active",
                "user_count": 0,
                "session_count": 0
            },
            "encryption": {
                "algorithm": "AES-256-GCM",
                "client_side": True,
                "server_capabilities": "encryption_service_available"
            }
        }

        # Get user count
        try:
            user_count_result = await db.execute(text("SELECT COUNT(*) FROM users"))
            debug_info["database"]["user_count"] = user_count_result.scalar()
        except:
            debug_info["database"]["user_count"] = "unknown"

        # Get session count
        try:
            session_count_result = await db.execute(text("SELECT COUNT(*) FROM sessions"))
            debug_info["database"]["session_count"] = session_count_result.scalar()
        except:
            debug_info["database"]["session_count"] = "unknown"

        # Test crypto service
        try:
            crypto_service = DiaryCryptoService()
            test_encrypt = crypto_service.encrypt_content("test")
            debug_info["encryption"]["test_result"] = "encryption_working"
        except Exception as e:
            debug_info["encryption"]["test_result"] = f"encryption_failed: {str(e)}"

        return debug_info

    except Exception as e:
        logger.error(f"Error in authentication debug: {type(e).__name__}")
        return {
            "status": "error",
            "message": "Authentication debug failed",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }


@router.get("/check-users")
async def check_user_database(
    db: AsyncSession = Depends(get_db)
):
    """Debug endpoint to check if there are users in the database."""
    try:
        # Get basic user statistics
        user_stats_query = text("""
            SELECT
                COUNT(*) as total_users,
                COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as users_with_email,
                COUNT(CASE WHEN created_at > datetime('now', '-7 days') THEN 1 END) as recent_users,
                MIN(created_at) as earliest_user,
                MAX(created_at) as latest_user
            FROM users
        """)

        result = await db.execute(user_stats_query)
        stats = result.fetchone()

        # Get recent users (last 5)
        recent_users_query = text("""
            SELECT uuid, username, email, created_at, is_active
            FROM users
            ORDER BY created_at DESC
            LIMIT 5
        """)

        recent_result = await db.execute(recent_users_query)
        recent_users = []

        for row in recent_result:
            recent_users.append({
                "uuid": row[0],
                "username": row[1],
                "email": row[2],
                "created_at": row[3].isoformat() if row[3] else None,
                "is_active": bool(row[4])
            })

        # Get session statistics
        session_stats_query = text("""
            SELECT
                COUNT(*) as total_sessions,
                COUNT(CASE WHEN expires_at > datetime('now') THEN 1 END) as active_sessions,
                COUNT(CASE WHEN created_at > datetime('now', '-1 day') THEN 1 END) as recent_sessions
            FROM sessions
        """)

        session_result = await db.execute(session_stats_query)
        session_stats = session_result.fetchone()

        return {
            "status": "success",
            "user_statistics": {
                "total_users": stats[0] if stats else 0,
                "users_with_email": stats[1] if stats else 0,
                "recent_users_7_days": stats[2] if stats else 0,
                "earliest_user": stats[3].isoformat() if stats and stats[3] else None,
                "latest_user": stats[4].isoformat() if stats and stats[4] else None
            },
            "recent_users": recent_users,
            "session_statistics": {
                "total_sessions": session_stats[0] if session_stats else 0,
                "active_sessions": session_stats[1] if session_stats else 0,
                "recent_sessions_24h": session_stats[2] if session_stats else 0
            },
            "system_status": {
                "database_accessible": True,
                "user_table_exists": True,
                "session_table_exists": True
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        logger.error(f"Error checking user database: {type(e).__name__}")
        return {
            "status": "error",
            "message": "Failed to check user database",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }


@router.get("/health")
async def basic_health_check():
    """Basic health check without authentication requirement."""
    try:
        return {
            "status": "healthy",
            "service": "PKMS Backend",
            "version": "1.0.0",
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "checks": {
                "server": "running",
                "database": "connected",
                "authentication": "available"
            }
        }

    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "service": "PKMS Backend",
                "error": str(e),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        )


@router.get("/diary/entries-encryption-check")
async def check_diary_entries_encryption(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Check the encryption status of diary entries for the current user."""
    try:
        # Get diary entries with encryption information
        entries_query = text("""
            SELECT
                uuid,
                date,
                content_length,
                content_file_path,
                file_hash,
                created_at,
                updated_at
            FROM diary_entries
            WHERE created_by = :user_uuid
            ORDER BY date DESC
            LIMIT 10
        """)

        result = await db.execute(entries_query, {"user_uuid": current_user.uuid})
        entries = result.fetchall()

        encryption_status = {
            "total_entries_checked": len(entries),
            "entries_with_files": 0,
            "entries_without_files": 0,
            "entries_with_hashes": 0,
            "entries_without_hashes": 0,
            "average_content_length": 0,
            "entries": []
        }

        total_content_length = 0
        for entry in entries:
            uuid, date, content_length, content_file_path, file_hash, created_at, updated_at = entry

            entry_info = {
                "uuid": uuid,
                "date": str(date),
                "has_file": content_file_path is not None,
                "has_hash": file_hash is not None,
                "content_length": content_length or 0,
                "created_at": created_at.isoformat() if created_at else None,
                "updated_at": updated_at.isoformat() if updated_at else None
            }

            if content_file_path:
                encryption_status["entries_with_files"] += 1

                # Check if file actually exists
                try:
                    file_path = get_data_dir() / content_file_path
                    entry_info["file_exists"] = file_path.exists()
                    if file_path.exists():
                        entry_info["file_size"] = file_path.stat().st_size
                except:
                    entry_info["file_exists"] = False
            else:
                encryption_status["entries_without_files"] += 1

            if file_hash:
                encryption_status["entries_with_hashes"] += 1
            else:
                encryption_status["entries_without_hashes"] += 1

            if content_length:
                total_content_length += content_length

            encryption_status["entries"].append(entry_info)

        # Calculate averages
        if entries:
            encryption_status["average_content_length"] = total_content_length // len(entries)

        # Check document attachments
        try:
            doc_count_query = select(func.count()).select_from(document_diary).join(
                DiaryEntry, document_diary.c.diary_entry_uuid == DiaryEntry.uuid
            ).where(DiaryEntry.created_by == current_user.uuid)

            doc_result = await db.execute(doc_count_query)
            document_count = doc_result.scalar()

            encryption_status["document_attachments"] = document_count
        except:
            encryption_status["document_attachments"] = 0

        return {
            "status": "success",
            "encryption_status": encryption_status,
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "note": "This shows the storage status of your diary entries. Content is client-side encrypted for privacy."
        }

    except Exception as e:
        logger.error(f"Error checking diary entries encryption: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to check diary entries encryption: {str(e)}")


@router.post("/encryption/stress-test")
async def encryption_stress_test(
    test_iterations: int = 10,
    content_size: int = 1000,
    current_user: User = Depends(get_current_user)
):
    """Perform stress testing of the encryption system."""
    try:
        import time
        import random
        import string

        crypto_service = DiaryCryptoService()

        # Generate test content
        def generate_test_content(size):
            chars = string.ascii_letters + string.digits + string.punctuation + ' \n'
            return ''.join(random.choice(chars) for _ in range(size))

        results = {
            "status": "success",
            "test_parameters": {
                "iterations": test_iterations,
                "content_size_bytes": content_size,
                "user_uuid": current_user.uuid
            },
            "performance_metrics": {
                "encryption_times": [],
                "decryption_times": [],
                "average_encryption_time_ms": 0,
                "average_decryption_time_ms": 0,
                "min_encryption_time_ms": 0,
                "max_encryption_time_ms": 0,
                "min_decryption_time_ms": 0,
                "max_decryption_time_ms": 0,
                "total_time_seconds": 0
            },
            "encryption_integrity": {
                "successful_encryptions": 0,
                "successful_decryptions": 0,
                "integrity_checks_passed": 0,
                "integrity_checks_failed": 0
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

        test_content = generate_test_content(content_size)
        start_time = time.time()

        # Run encryption tests
        for i in range(test_iterations):
            # Test encryption
            encrypt_start = time.perf_counter()
            encrypted = crypto_service.encrypt_content(test_content)
            encrypt_end = time.perf_counter()
            encrypt_time = (encrypt_end - encrypt_start) * 1000
            results["performance_metrics"]["encryption_times"].append(encrypt_time)

            # Test decryption
            decrypt_start = time.perf_counter()
            decrypted = crypto_service.decrypt_content(
                encrypted['encrypted_blob'],
                encrypted['iv'],
                encrypted['tag']
            )
            decrypt_end = time.perf_counter()
            decrypt_time = (decrypt_end - decrypt_start) * 1000
            results["performance_metrics"]["decryption_times"].append(decrypt_time)

            # Verify integrity
            if decrypted == test_content:
                results["encryption_integrity"]["integrity_checks_passed"] += 1
            else:
                results["encryption_integrity"]["integrity_checks_failed"] += 1
                logger.warning(f"Integrity check failed on iteration {i}")

            results["encryption_integrity"]["successful_encryptions"] += 1
            results["encryption_integrity"]["successful_decryptions"] += 1

        end_time = time.time()

        # Calculate performance metrics
        if results["performance_metrics"]["encryption_times"]:
            enc_times = results["performance_metrics"]["encryption_times"]
            dec_times = results["performance_metrics"]["decryption_times"]

            results["performance_metrics"]["average_encryption_time_ms"] = round(sum(enc_times) / len(enc_times), 3)
            results["performance_metrics"]["average_decryption_time_ms"] = round(sum(dec_times) / len(dec_times), 3)
            results["performance_metrics"]["min_encryption_time_ms"] = round(min(enc_times), 3)
            results["performance_metrics"]["max_encryption_time_ms"] = round(max(enc_times), 3)
            results["performance_metrics"]["min_decryption_time_ms"] = round(min(dec_times), 3)
            results["performance_metrics"]["max_decryption_time_ms"] = round(max(dec_times), 3)

        results["performance_metrics"]["total_time_seconds"] = round(end_time - start_time, 3)

        # Determine overall status
        if results["encryption_integrity"]["integrity_checks_failed"] == 0:
            results["overall_status"] = "all_tests_passed"
        else:
            results["overall_status"] = "some_tests_failed"

        return results

    except Exception as e:
        logger.error(f"Error in encryption stress test: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Encryption stress test failed: {str(e)}")


@router.get("/system/time-verification")
async def verify_system_time():
    """Verify system time configuration and timezone handling."""
    try:
        now_utc = datetime.utcnow()
        now_local = datetime.now(NEPAL_TZ)

        # Time verification
        time_info = {
            "utc_time": now_utc.isoformat(),
            "local_time": now_local.isoformat(),
            "timezone": str(NEPAL_TZ),
            "utc_offset_hours": NEPAL_TZ.utcoffset(now_utc).total_seconds() / 3600,
            "is_dst": NEPAL_TZ.dst(now_utc).total_seconds() > 0,
            "time_format_checks": {
                "iso_format_utc": now_utc.isoformat(),
                "iso_format_local": now_local.isoformat(),
                "timestamp_utc": now_utc.timestamp(),
                "timestamp_local": now_local.timestamp()
            },
            "date_checks": {
                "utc_date": now_utc.date().isoformat(),
                "local_date": now_local.date().isoformat(),
                "formatted_utc": now_utc.strftime("%Y-%m-%d %H:%M:%S UTC"),
                "formatted_local": now_local.strftime("%Y-%m-%d %H:%M:%S %Z")
            }
        }

        return {
            "status": "success",
            "time_verification": time_info,
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "note": "This endpoint helps verify that time handling is consistent across the system."
        }

    except Exception as e:
        logger.error(f"Error in time verification: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Time verification failed: {str(e)}")


@router.post("/diary/encryption-test")
async def diary_encryption_test_alias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Alias that forwards to the main diary encryption test endpoint."""
    return await test_diary_encryption(current_user, db)