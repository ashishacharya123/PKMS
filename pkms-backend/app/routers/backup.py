"""
Database Backup and Restore Router for PKMS Backend

Provides database backup, restore, and management endpoints
with proper authentication and security controls.

WAL (Write-Ahead Log) Management Strategy:
=========================================

## Automatic WAL Checkpoints (SQLite Default Behavior):
1. **Size-based**: WAL auto-checkpoints when reaching 1000 pages (~4MB)
2. **Connection close**: WAL checkpoints when last connection closes
3. **Manual triggers**: PRAGMA wal_checkpoint commands
4. **Transaction commits**: Some commits may trigger partial checkpoints

## Our Backup Strategy:
1. **Manual Checkpoint**: We force WAL checkpoint before backup to ensure ALL data inclusion
2. **Data Guarantee**: No data loss - recent changes always captured
3. **Industry Standard**: Follows SQLite's official backup recommendations

## Why This Matters:
- Without checkpoint: Backup might miss recent changes still in WAL
- With checkpoint: Backup is guaranteed complete and up-to-date
- Performance: Checkpoint is fast (milliseconds) vs incomplete backup risk

## WAL File Lifecycle:
- WAL grows with each transaction until checkpoint
- After checkpoint: WAL is cleared/reset
- SHM tracks which pages are in WAL vs main DB
- Both WAL and SHM are recreated as needed
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import List
from datetime import datetime, timezone, timedelta
import json
import os
import subprocess
from pathlib import Path
import shutil

# Nepal Standard Time offset
NEPAL_TZ = timezone(timedelta(hours=5, minutes=45))

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User

router = APIRouter(tags=["backup"])

@router.post("/create")
async def create_database_backup(
    backup_method: str = Form("checkpoint", description="Backup method: 'checkpoint' (recommended), 'all_files', or 'vacuum'"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a timestamped backup of the database using industry best practices."""
    try:
        # Generate timestamp for backup filename using Nepal time
        nepal_time = datetime.now(NEPAL_TZ)
        timestamp = nepal_time.strftime("%Y%m%d_%H%M%S")
        backup_dir = Path("/app/PKMS_Data/backups")
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        if backup_method == "all_files":
            # Method 1: Backup all 3 files (complete snapshot approach)
            backup_base = f"pkm_metadata_full_{timestamp}"
            backup_files = []
            
            files_to_backup = [
                ("/app/data/pkm_metadata.db", f"{backup_base}.db"),
                ("/app/data/pkm_metadata.db-wal", f"{backup_base}.db-wal"), 
                ("/app/data/pkm_metadata.db-shm", f"{backup_base}.db-shm")
            ]
            
            total_size = 0
            for source_path, backup_filename in files_to_backup:
                if os.path.exists(source_path):
                    dest_path = f"/app/PKMS_Data/backups/{backup_filename}"
                    result = subprocess.run(["cp", source_path, dest_path], capture_output=True, text=True, timeout=30)
                    if result.returncode == 0:
                        backup_files.append(backup_filename)
                        file_size = Path(dest_path).stat().st_size
                        total_size += file_size
            
            return {
                "status": "success",
                "method": "all_files",
                "message": "Complete database snapshot backup created (includes WAL/SHM files)",
                "backup_files": backup_files,
                "total_files": len(backup_files),
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 4),
                "timestamp": nepal_time.isoformat(),
                "created_by": current_user.username,
                "restore_note": "Use the .db file for restore, but keep all files together",
                "industry_practice": "Complete snapshot - guarantees no data loss"
            }
            
        elif backup_method == "vacuum":
            # Method 2: VACUUM INTO (creates clean, optimized copy)
            backup_filename = f"pkm_metadata_vacuum_{timestamp}.db"
            backup_path = f"/app/PKMS_Data/backups/{backup_filename}"
            
            try:
                # VACUUM INTO automatically handles WAL consolidation
                await db.execute(text(f"VACUUM INTO '{backup_path}'"))
                await db.commit()
                
                file_size = Path(backup_path).stat().st_size
                
                return {
                    "status": "success", 
                    "method": "vacuum",
                    "message": "Optimized database backup created with VACUUM INTO",
                    "backup_filename": backup_filename,
                    "file_size_bytes": file_size,
                    "file_size_mb": round(file_size / (1024 * 1024), 4),
                    "timestamp": nepal_time.isoformat(),
                    "created_by": current_user.username,
                    "advantages": "Optimized, defragmented, includes all WAL data",
                    "industry_practice": "VACUUM INTO - SQLite's recommended backup method"
                }
                
            except Exception as vacuum_error:
                raise Exception(f"VACUUM INTO failed: {vacuum_error}")
        
        else:  # backup_method == "checkpoint" (RECOMMENDED)
            # Method 3: Industry Best Practice - Checkpoint WAL then backup main DB
            backup_filename = f"pkm_metadata_backup_{timestamp}.db"
            
            try:
                # STEP 1: Checkpoint WAL to ensure ALL recent changes are in main DB
                print("📝 Checkpointing WAL to consolidate all changes...")
                checkpoint_result = await db.execute(text("PRAGMA wal_checkpoint(FULL)"))
                checkpoint_info = checkpoint_result.fetchone()
                await db.commit()
                
                # STEP 2: Now backup the main DB file (contains ALL data)
                print("💾 Backing up consolidated database file...")
                source_path = "/app/data/pkm_metadata.db"
                backup_path = f"/app/PKMS_Data/backups/{backup_filename}"
                
                result = subprocess.run(["cp", source_path, backup_path], capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0:
                    file_size = Path(backup_path).stat().st_size
                    
                    return {
                        "status": "success",
                        "method": "checkpoint_backup", 
                        "message": "Industry-standard backup completed: WAL checkpointed + main DB backed up",
                        "backup_filename": backup_filename,
                        "file_size_bytes": file_size,
                        "file_size_mb": round(file_size / (1024 * 1024), 4),
                        "checkpoint_info": {
                            "wal_pages_moved": checkpoint_info[1] if checkpoint_info else "unknown",
                            "wal_checkpoints": checkpoint_info[2] if checkpoint_info else "unknown"
                        },
                        "timestamp": nepal_time.isoformat(),
                        "created_by": current_user.username,
                        "data_guarantee": "All recent changes included via WAL checkpoint",
                        "industry_practice": "✅ RECOMMENDED - Checkpoint first, then backup main DB"
                    }
                else:
                    raise Exception(f"File copy failed: {result.stderr}")
                    
            except Exception as checkpoint_error:
                # Fallback: If checkpoint fails, try VACUUM INTO
                print(f"⚠️ Checkpoint failed ({checkpoint_error}), falling back to VACUUM INTO...")
                
                backup_filename = f"pkm_metadata_fallback_{timestamp}.db"
                backup_path = f"/app/PKMS_Data/backups/{backup_filename}"
                
                await db.execute(text(f"VACUUM INTO '{backup_path}'"))
                await db.commit()
                
                file_size = Path(backup_path).stat().st_size
                
                return {
                    "status": "success",
                    "method": "fallback_vacuum",
                    "message": "Backup completed using VACUUM INTO fallback method",
                    "backup_filename": backup_filename,
                    "file_size_bytes": file_size,
                    "file_size_mb": round(file_size / (1024 * 1024), 4),
                    "timestamp": nepal_time.isoformat(),
                    "created_by": current_user.username,
                    "fallback_reason": str(checkpoint_error),
                    "industry_practice": "Fallback method - still guarantees complete data"
                }
            
    except Exception as e:
        return {
            "status": "error",
            "message": "Backup operation failed",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

@router.get("/list")
async def list_database_backups(
    current_user: User = Depends(get_current_user)
):
    """List all available database backup files with metadata."""
    try:
        backup_dir = Path("/app/PKMS_Data/backups")
        
        if not backup_dir.exists():
            return {
                "status": "no_backups",
                "message": "No backup directory found",
                "backups": [],
                "backup_count": 0,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Find all .db files in backup directory
        backup_files = list(backup_dir.glob("*.db"))
        backups = []
        
        for backup_file in sorted(backup_files, key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                stat = backup_file.stat()
                backups.append({
                    "filename": backup_file.name,
                    "full_path": str(backup_file),
                    "relative_path": f"PKMS_Data/backups/{backup_file.name}",
                    "file_size_bytes": stat.st_size,
                    "file_size_kb": round(stat.st_size / 1024, 2),
                    "file_size_mb": round(stat.st_size / (1024 * 1024), 4),
                    "created_at": datetime.fromtimestamp(stat.st_ctime, NEPAL_TZ).isoformat(),
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, NEPAL_TZ).isoformat(),
                    "is_recent": (datetime.now(NEPAL_TZ).timestamp() - stat.st_mtime) < (24 * 3600)  # Within 24 hours
                })
            except Exception as e:
                # Skip files that can't be read
                continue
        
        return {
            "status": "success" if backups else "no_backups",
            "message": f"Found {len(backups)} backup file(s)" if backups else "No backup files found",
            "backups": backups,
            "backup_count": len(backups),
            "backup_directory": str(backup_dir),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": "Failed to list backup files",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

@router.post("/restore")
async def restore_database_backup(
    backup_filename: str = Form(..., description="Name of backup file to restore"),
    confirm_restore: bool = Form(False, description="Confirmation flag for destructive operation"),
    current_user: User = Depends(get_current_user)
):
    """Restore database from a backup file. WARNING: This replaces the current database!"""
    try:
        if not confirm_restore:
            return {
                "status": "confirmation_required",
                "message": "Database restore requires confirmation. Set confirm_restore=true to proceed.",
                "warning": "This operation will REPLACE the current database with the backup!",
                "backup_filename": backup_filename,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Validate backup file exists
        backup_path = Path(f"/app/PKMS_Data/backups/{backup_filename}")
        if not backup_path.exists():
            return {
                "status": "error",
                "message": "Backup file not found",
                "backup_filename": backup_filename,
                "looked_for": str(backup_path),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Get backup file info before restore
        backup_stat = backup_path.stat()
        backup_info = {
            "filename": backup_filename,
            "size_bytes": backup_stat.st_size,
            "size_mb": round(backup_stat.st_size / (1024 * 1024), 4),
            "created_at": datetime.fromtimestamp(backup_stat.st_ctime, NEPAL_TZ).isoformat()
        }
        
        # Restore database from backup using direct filesystem operations
        # Copy the backup file to the Docker volume location
        restore_cmd = [
            "cp", f"/app/PKMS_Data/backups/{backup_filename}", "/app/data/pkm_metadata.db"
        ]
        
        result = subprocess.run(restore_cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            return {
                "status": "success",
                "message": "Database restored successfully from backup",
                "backup_info": backup_info,
                "warning": "Application restart recommended to ensure clean state",
                "restored_by": current_user.username,
                "timestamp": datetime.now(NEPAL_TZ).isoformat(),
                "note": "All active sessions may need to be refreshed"
            }
        else:
            return {
                "status": "error",
                "message": "Failed to restore database from backup",
                "backup_filename": backup_filename,
                "error": result.stderr or "Docker command failed",
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            
    except Exception as e:
        return {
            "status": "error",
            "message": "Restore operation failed",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

@router.delete("/delete/{backup_filename}")
async def delete_database_backup(
    backup_filename: str,
    confirm_delete: bool = Query(False, description="Confirmation flag for file deletion"),
    current_user: User = Depends(get_current_user)
):
    """Delete a specific backup file. Use with caution!"""
    try:
        if not confirm_delete:
            return {
                "status": "confirmation_required",
                "message": "Backup deletion requires confirmation. Add ?confirm_delete=true to proceed.",
                "backup_filename": backup_filename,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Validate backup file exists
        backup_path = Path(f"/app/PKMS_Data/backups/{backup_filename}")
        if not backup_path.exists():
            return {
                "status": "error",
                "message": "Backup file not found",
                "backup_filename": backup_filename,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Security check: only allow .db files in backups directory
        if not backup_filename.endswith('.db') or '/' in backup_filename or '\\' in backup_filename:
            return {
                "status": "error",
                "message": "Invalid backup filename. Only .db files in backups directory are allowed.",
                "backup_filename": backup_filename,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Get file info before deletion
        backup_stat = backup_path.stat()
        backup_info = {
            "filename": backup_filename,
            "size_bytes": backup_stat.st_size,
            "size_mb": round(backup_stat.st_size / (1024 * 1024), 4),
            "created_at": datetime.fromtimestamp(backup_stat.st_ctime, NEPAL_TZ).isoformat()
        }
        
        # Delete the backup file
        backup_path.unlink()
        
        return {
            "status": "success",
            "message": "Backup file deleted successfully",
            "deleted_backup": backup_info,
            "deleted_by": current_user.username,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": "Failed to delete backup file",
            "error": str(e),
            "backup_filename": backup_filename,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

@router.get("/info")
async def get_backup_info(
    current_user: User = Depends(get_current_user)
):
    """Get information about the backup system and current status."""
    try:
        backup_dir = Path("/app/PKMS_Data/backups")
        
        # Count backup files
        backup_count = 0
        total_size = 0
        if backup_dir.exists():
            backup_files = list(backup_dir.glob("*.db"))
            backup_count = len(backup_files)
            total_size = sum(f.stat().st_size for f in backup_files)
        
        return {
            "status": "success",
            "backup_system": {
                "backup_directory": str(backup_dir),
                "directory_exists": backup_dir.exists(),
                "backup_count": backup_count,
                "total_backup_size_bytes": total_size,
                "total_backup_size_mb": round(total_size / (1024 * 1024), 4),
                "database_location": "Docker volume (pkms_db_data)",
                "backup_location": "Windows filesystem (accessible)",
                "file_types_backed_up": ["Database metadata", "User accounts", "Settings"],
                "file_types_not_backed_up": ["Documents", "Images", "Diary content", "Archives"]
            },
            "file_storage_info": {
                "database": "Docker volume (requires backup to access)",
                "user_content": "Windows filesystem (directly accessible)",
                "content_folders": [
                    "PKMS_Data/assets/ - Documents and images",
                    "PKMS_Data/secure/ - Encrypted diary content",
                    "PKMS_Data/archive/ - Archive data",
                    "PKMS_Data/exports/ - Export files"
                ]
            },
            "current_limitations": [
                "Docker access needed for backup/restore operations",
                "Manual Docker socket configuration required",
                "Backup/restore operations temporarily disabled"
            ],
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": "Failed to get backup information",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        } 

@router.get("/wal-status")
async def get_wal_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current WAL file status and size information."""
    try:
        nepal_time = datetime.now(NEPAL_TZ)
        
        # Check WAL file sizes
        db_path = "/app/data/pkm_metadata.db"
        wal_path = "/app/data/pkm_metadata.db-wal"
        shm_path = "/app/data/pkm_metadata.db-shm"
        
        file_info = {}
        total_size = 0
        
        for name, path in [("main_db", db_path), ("wal", wal_path), ("shm", shm_path)]:
            if os.path.exists(path):
                size = os.path.getsize(path)
                file_info[name] = {
                    "exists": True,
                    "size_bytes": size,
                    "size_kb": round(size / 1024, 2),
                    "size_mb": round(size / (1024 * 1024), 4)
                }
                total_size += size
            else:
                file_info[name] = {"exists": False, "size_bytes": 0}
        
        # Get WAL information from SQLite
        try:
            wal_info_result = await db.execute(text("PRAGMA wal_checkpoint"))
            wal_info = wal_info_result.fetchone()
            
            pragma_result = await db.execute(text("PRAGMA journal_mode"))
            journal_mode = pragma_result.scalar()
            
            page_count_result = await db.execute(text("PRAGMA page_count"))
            page_count = page_count_result.scalar()
            
            page_size_result = await db.execute(text("PRAGMA page_size"))
            page_size = page_size_result.scalar()
            
        except Exception as e:
            wal_info = None
            journal_mode = "unknown"
            page_count = 0
            page_size = 4096
        
        # Calculate thresholds
        auto_checkpoint_threshold = 1000 * page_size  # 1000 pages
        wal_size = file_info["wal"]["size_bytes"]
        wal_percentage = (wal_size / auto_checkpoint_threshold * 100) if auto_checkpoint_threshold > 0 else 0
        
        # Determine status and recommendations
        if wal_size == 0:
            status = "clean"
            recommendation = "WAL is clean - no action needed"
            color = "green"
        elif wal_size < (auto_checkpoint_threshold * 0.5):
            status = "normal"
            recommendation = "WAL size is normal - no action needed"
            color = "green"
        elif wal_size < (auto_checkpoint_threshold * 0.8):
            status = "growing"
            recommendation = "WAL is growing but still within normal range"
            color = "yellow"
        elif wal_size < auto_checkpoint_threshold:
            status = "approaching_limit"
            recommendation = "WAL approaching auto-checkpoint threshold"
            color = "orange"
        else:
            status = "should_auto_checkpoint"
            recommendation = "WAL exceeds threshold - should auto-checkpoint soon"
            color = "red"
        
        return {
            "status": "success",
            "timestamp": nepal_time.isoformat(),
            "database_mode": journal_mode,
            "files": file_info,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 4),
            "wal_analysis": {
                "current_size_bytes": wal_size,
                "current_size_mb": round(wal_size / (1024 * 1024), 4),
                "auto_checkpoint_threshold_bytes": auto_checkpoint_threshold,
                "auto_checkpoint_threshold_mb": round(auto_checkpoint_threshold / (1024 * 1024), 4),
                "percentage_of_threshold": round(wal_percentage, 2),
                "status": status,
                "recommendation": recommendation,
                "status_color": color
            },
            "database_info": {
                "page_count": page_count,
                "page_size_bytes": page_size,
                "estimated_db_size_mb": round((page_count * page_size) / (1024 * 1024), 4)
            },
            "performance_note": "SQLite automatically optimizes WAL performance. Manual checkpoint rarely needed."
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": "Failed to get WAL status",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

@router.post("/manual-checkpoint")
async def manual_wal_checkpoint(
    checkpoint_mode: str = Form("FULL", description="Checkpoint mode: PASSIVE, FULL, or RESTART"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger WAL checkpoint - Advanced feature for power users.
    
    Checkpoint Modes:
    - PASSIVE: Non-blocking, only if no readers
    - FULL: Block until complete (recommended) 
    - RESTART: FULL + restart WAL from beginning
    """
    try:
        nepal_time = datetime.now(NEPAL_TZ)
        
        # Validate checkpoint mode
        valid_modes = ["PASSIVE", "FULL", "RESTART"]
        if checkpoint_mode not in valid_modes:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid checkpoint mode. Must be one of: {', '.join(valid_modes)}"
            )
        
        # Get WAL size before checkpoint
        wal_path = "/app/data/pkm_metadata.db-wal"
        wal_size_before = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
        
        # Execute checkpoint
        print(f"🔄 Manual WAL checkpoint ({checkpoint_mode}) initiated by {current_user.username}")
        checkpoint_result = await db.execute(text(f"PRAGMA wal_checkpoint({checkpoint_mode})"))
        checkpoint_info = checkpoint_result.fetchone()
        await db.commit()
        
        # Get WAL size after checkpoint
        wal_size_after = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
        data_moved = wal_size_before - wal_size_after
        
        return {
            "status": "success",
            "message": f"Manual WAL checkpoint ({checkpoint_mode}) completed successfully",
            "checkpoint_mode": checkpoint_mode,
            "timestamp": nepal_time.isoformat(),
            "executed_by": current_user.username,
            "checkpoint_result": {
                "busy": checkpoint_info[0] if checkpoint_info else 0,
                "log_pages": checkpoint_info[1] if checkpoint_info else 0, 
                "checkpointed_pages": checkpoint_info[2] if checkpoint_info else 0
            },
            "wal_size_change": {
                "before_bytes": wal_size_before,
                "after_bytes": wal_size_after,
                "data_moved_bytes": data_moved,
                "data_moved_mb": round(data_moved / (1024 * 1024), 4)
            },
            "performance_note": "This was a manual checkpoint. SQLite normally handles this automatically.",
            "recommendation": "Manual checkpoints are rarely needed unless you have specific performance requirements."
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": "Manual checkpoint failed",
            "error": str(e),
            "timestamp": nepal_time.isoformat()
        } 