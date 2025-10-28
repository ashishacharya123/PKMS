"""
System Health and Monitoring Testing Router for PKMS Backend

Provides comprehensive system health checks, performance monitoring,
resource usage tracking, and data integrity validation.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime
import psutil
import logging
import time
import random
import shutil

# Set up logger
logger = logging.getLogger(__name__)

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.testing import DetailedHealthResponse

from app.config import NEPAL_TZ, get_data_dir

router = APIRouter(prefix="/testing/system", tags=["testing-system"])


@router.get("/health-detailed", response_model=DetailedHealthResponse)
async def get_detailed_health_check(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed system health information including database connectivity."""
    try:
        health_status = {
            "status": "healthy",
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "checks": {}
        }

        # Database connectivity check
        try:
            db_check_start = datetime.now()
            result = await db.execute(text("SELECT 1"))
            db_check_end = datetime.now()
            db_response_time = (db_check_end - db_check_start).total_seconds() * 1000

            health_status["checks"]["database"] = {
                "status": "healthy",
                "response_time_ms": round(db_response_time, 2),
                "timestamp": db_check_end.isoformat()
            }
        except Exception as e:
            health_status["checks"]["database"] = {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            health_status["status"] = "degraded"

        # File system check
        try:
            data_dir = get_data_dir()
            if data_dir.exists():
                # Check if we can create a test file
                test_file = data_dir / "health_check_test.txt"
                test_file.write_text("health_check", encoding='utf-8')
                test_file.unlink()  # Clean up

                # Get disk usage
                disk_usage = psutil.disk_usage(data_dir)
                free_space_gb = disk_usage.free / (1024**3)
                total_space_gb = disk_usage.total / (1024**3)
                used_space_gb = disk_usage.used / (1024**3)
                usage_percent = (disk_usage.used / disk_usage.total) * 100

                health_status["checks"]["filesystem"] = {
                    "status": "healthy",
                    "data_directory": str(data_dir),
                    "disk_usage": {
                        "total_gb": round(total_space_gb, 2),
                        "used_gb": round(used_space_gb, 2),
                        "free_gb": round(free_space_gb, 2),
                        "usage_percent": round(usage_percent, 2)
                    },
                    "writeable": True,
                    "timestamp": datetime.now(NEPAL_TZ).isoformat()
                }

                # Set overall status to degraded if disk space is low
                if free_space_gb < 1:  # Less than 1GB free
                    health_status["checks"]["filesystem"]["status"] = "degraded"
                    if health_status["status"] == "healthy":
                        health_status["status"] = "degraded"
            else:
                health_status["checks"]["filesystem"] = {
                    "status": "unhealthy",
                    "error": f"Data directory does not exist: {data_dir}",
                    "timestamp": datetime.now(NEPAL_TZ).isoformat()
                }
                health_status["status"] = "unhealthy"

        except Exception as e:
            health_status["checks"]["filesystem"] = {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            health_status["status"] = "degraded"

        # Memory usage check
        try:
            memory = psutil.virtual_memory()
            process_memory = psutil.Process().memory_info()

            health_status["checks"]["memory"] = {
                "status": "healthy",
                "system_memory": {
                    "total_gb": round(memory.total / (1024**3), 2),
                    "available_gb": round(memory.available / (1024**3), 2),
                    "used_gb": round(memory.used / (1024**3), 2),
                    "usage_percent": memory.percent
                },
                "process_memory": {
                    "rss_mb": round(process_memory.rss / (1024**2), 2),
                    "vms_mb": round(process_memory.vms / (1024**2), 2)
                },
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

            # Set overall status to degraded if memory usage is high
            if memory.percent > 90:
                health_status["checks"]["memory"]["status"] = "degraded"
                if health_status["status"] == "healthy":
                    health_status["status"] = "degraded"

        except Exception as e:
            health_status["checks"]["memory"] = {
                "status": "unknown",
                "error": str(e),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

        # CPU usage check
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            health_status["checks"]["cpu"] = {
                "status": "healthy",
                "usage_percent": round(cpu_percent, 2),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

            # Set overall status to degraded if CPU usage is high
            if cpu_percent > 80:
                health_status["checks"]["cpu"]["status"] = "degraded"
                if health_status["status"] == "healthy":
                    health_status["status"] = "degraded"

        except Exception as e:
            health_status["checks"]["cpu"] = {
                "status": "unknown",
                "error": str(e),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

        # Database size and basic stats
        try:
            db_path = get_data_dir() / "pkm_metadata.db"
            if db_path.exists():
                import os
                db_size = os.path.getsize(db_path)
                db_size_mb = round(db_size / (1024**2), 2)

                # Get basic table counts
                table_counts = {}
                tables_to_check = ["users", "notes", "documents", "todos", "projects", "diary_entries"]
                for table in tables_to_check:
                    try:
                        result = await db.execute(text(f"SELECT COUNT(*) FROM {table}"))
                        count = result.scalar()
                        table_counts[table] = count
                    except:
                        table_counts[table] = 0

                health_status["checks"]["database_stats"] = {
                    "status": "healthy",
                    "database_size_mb": db_size_mb,
                    "table_counts": table_counts,
                    "timestamp": datetime.now(NEPAL_TZ).isoformat()
                }
            else:
                health_status["checks"]["database_stats"] = {
                    "status": "unhealthy",
                    "error": "Database file does not exist",
                    "timestamp": datetime.now(NEPAL_TZ).isoformat()
                }
                health_status["status"] = "unhealthy"

        except Exception as e:
            health_status["checks"]["database_stats"] = {
                "status": "unknown",
                "error": str(e),
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

        return health_status

    except Exception as e:
        logger.error(f"Error in detailed health check: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Health check failed: {str(e)}")


@router.get("/resource-usage")
async def get_resource_usage(
    duration_minutes: int = 5,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Monitor system resource usage and database connections."""
    try:
        # Get current resource usage
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage(get_data_dir())

        # Get process information
        process = psutil.Process()
        process_memory = process.memory_info()
        process_cpu = process.cpu_percent()

        # Get database connection info if available
        db_info = {}
        try:
            # Check active connections (SQLite specific)
            result = await db.execute(text("PRAGMA busy_timeout"))
            busy_timeout = result.scalar()

            # Get database performance stats
            db_info = {
                "busy_timeout_ms": busy_timeout,
                "journal_mode": "unknown"
            }

            # Try to get journal mode
            try:
                result = await db.execute(text("PRAGMA journal_mode"))
                journal_mode = result.scalar()
                db_info["journal_mode"] = journal_mode
            except:
                pass

        except Exception as e:
            db_info = {"error": str(e)}

        # Calculate trends
        timestamp = datetime.now(NEPAL_TZ).isoformat()

        return {
            "timestamp": timestamp,
            "duration_minutes": duration_minutes,
            "system_resources": {
                "cpu": {
                    "usage_percent": round(cpu_percent, 2),
                    "core_count": psutil.cpu_count()
                },
                "memory": {
                    "total_gb": round(memory.total / (1024**3), 2),
                    "available_gb": round(memory.available / (1024**3), 2),
                    "used_gb": round(memory.used / (1024**3), 2),
                    "usage_percent": memory.percent
                },
                "disk": {
                    "total_gb": round(disk.total / (1024**3), 2),
                    "used_gb": round(disk.used / (1024**3), 2),
                    "free_gb": round(disk.free / (1024**3), 2),
                    "usage_percent": round((disk.used / disk.total) * 100, 2)
                }
            },
            "process_resources": {
                "pid": process.pid,
                "memory": {
                    "rss_mb": round(process_memory.rss / (1024**2), 2),
                    "vms_mb": round(process_memory.vms / (1024**2), 2),
                    "percent": round(process.memory_percent(), 2)
                },
                "cpu": {
                    "usage_percent": round(process_cpu, 2)
                },
                "threads": process.num_threads(),
                "create_time": datetime.fromtimestamp(process.create_time()).isoformat()
            },
            "database_info": db_info,
            "alerts": [],
            "user_uuid": current_user.uuid
        }

    except Exception as e:
        logger.error(f"Error getting resource usage: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get resource usage: {str(e)}")


@router.get("/database-metrics")
async def get_database_performance_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get database performance metrics and query timings."""
    try:
        metrics = {}

        # Test basic query performance
        test_queries = [
            ("simple_count", "SELECT COUNT(*) FROM sqlite_master"),
            ("table_list", "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"),
            ("pragma_info", "PRAGMA table_info(users)"),
            ("index_list", "PRAGMA index_list(users)"),
        ]

        query_performance = {}
        for query_name, query_sql in test_queries:
            start_time = datetime.now()
            try:
                result = await db.execute(text(query_sql))
                end_time = datetime.now()
                execution_time = (end_time - start_time).total_seconds() * 1000

                query_performance[query_name] = {
                    "execution_time_ms": round(execution_time, 3),
                    "status": "success",
                    "result_count": len(result.fetchall()) if hasattr(result, 'fetchall') else 1
                }
            except Exception as e:
                end_time = datetime.now()
                execution_time = (end_time - start_time).total_seconds() * 1000
                query_performance[query_name] = {
                    "execution_time_ms": round(execution_time, 3),
                    "status": "error",
                    "error": str(e)
                }

        metrics["query_performance"] = query_performance

        # Get database configuration
        try:
            config_queries = {
                "page_size": "PRAGMA page_size",
                "page_count": "PRAGMA page_count",
                "journal_mode": "PRAGMA journal_mode",
                "synchronous": "PRAGMA synchronous",
                "cache_size": "PRAGMA cache_size",
                "temp_store": "PRAGMA temp_store",
                "mmap_size": "PRAGMA mmap_size"
            }

            db_config = {}
            for config_name, config_sql in config_queries.items():
                try:
                    result = await db.execute(text(config_sql))
                    value = result.scalar()
                    db_config[config_name] = value
                except:
                    db_config[config_name] = "unknown"

            metrics["database_config"] = db_config
        except Exception as e:
            metrics["database_config"] = {"error": str(e)}

        # Get table sizes and row counts
        try:
            tables_query = text("""
                SELECT name FROM sqlite_master
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            """)
            result = await db.execute(tables_query)
            tables = result.fetchall()

            table_stats = {}
            for table_row in tables:
                table_name = table_row[0]
                try:
                    # Get row count
                    count_result = await db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                    row_count = count_result.scalar()

                    # Estimate table size (rough calculation)
                    try:
                        # Get page count for this table (approximate)
                        stats_result = await db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                        table_stats[table_name] = {
                            "row_count": row_count,
                            "estimated_size_kb": row_count * 0.1  # Rough estimate
                        }
                    except:
                        table_stats[table_name] = {
                            "row_count": row_count,
                            "estimated_size_kb": "unknown"
                        }

                except Exception as e:
                    table_stats[table_name] = {
                        "error": str(e)
                    }

            metrics["table_statistics"] = table_stats
        except Exception as e:
            metrics["table_statistics"] = {"error": str(e)}

        # Database file information
        try:
            db_path = get_data_dir() / "pkm_metadata.db"
            if db_path.exists():
                file_stats = os.stat(db_path)

                metrics["database_file"] = {
                    "path": str(db_path),
                    "size_bytes": file_stats.st_size,
                    "size_kb": round(file_stats.st_size / 1024, 2),
                    "size_mb": round(file_stats.st_size / (1024**2), 2),
                    "created": datetime.fromtimestamp(file_stats.st_ctime).isoformat(),
                    "modified": datetime.fromtimestamp(file_stats.st_mtime).isoformat()
                }
            else:
                metrics["database_file"] = {"error": "Database file not found"}
        except Exception as e:
            metrics["database_file"] = {"error": str(e)}

        return {
            "status": "success",
            "metrics": metrics,
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "user_uuid": current_user.uuid
        }

    except Exception as e:
        logger.error(f"Error getting database metrics: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get database metrics: {str(e)}")


@router.get("/data-integrity")
async def perform_data_integrity_validation(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Perform comprehensive data integrity validation checks."""
    try:
        integrity_results = {
            "status": "success",
            "checks_performed": [],
            "issues_found": [],
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

        # Check 1: Foreign key integrity
        try:
            fk_check_query = text("PRAGMA foreign_key_check")
            fk_result = await db.execute(fk_check_query)
            fk_issues = fk_result.fetchall()

            integrity_results["checks_performed"].append("foreign_key_check")
            if fk_issues:
                integrity_results["issues_found"].append({
                    "type": "foreign_key_violations",
                    "count": len(fk_issues),
                    "details": [str(issue) for issue in fk_issues]
                })
            else:
                integrity_results["checks_performed"].append("foreign_key_check ✅")
        except Exception as e:
            integrity_results["issues_found"].append({
                "type": "foreign_key_check_error",
                "error": str(e)
            })

        # Check 2: Unique constraint violations for key tables
        key_tables = ["users", "notes", "documents", "todos", "projects", "diary_entries"]
        for table in key_tables:
            try:
                # Check for duplicate UUIDs (primary key)
                uuid_check_query = text(f"""
                    SELECT uuid, COUNT(*) as count
                    FROM {table}
                    GROUP BY uuid
                    HAVING COUNT(*) > 1
                """)
                result = await db.execute(uuid_check_query)
                duplicates = result.fetchall()

                if duplicates:
                    integrity_results["issues_found"].append({
                        "type": f"duplicate_primary_keys_{table}",
                        "count": len(duplicates),
                        "details": [f"UUID {dup[0]} has {dup[1]} occurrences" for dup in duplicates]
                    })

                integrity_results["checks_performed"].append(f"{table}_primary_key_check")

            except Exception as e:
                integrity_results["issues_found"].append({
                    "type": f"{table}_check_error",
                    "error": str(e)
                })

        # Check 3: Orphaned records in association tables
        try:
            # Check document_diary associations
            orphaned_docs_query = text("""
                SELECT dd.document_uuid, dd.diary_entry_uuid
                FROM document_diary dd
                LEFT JOIN documents d ON dd.document_uuid = d.uuid
                LEFT JOIN diary_entries de ON dd.diary_entry_uuid = de.uuid
                WHERE d.uuid IS NULL OR de.uuid IS NULL
            """)
            orphaned_docs = await db.execute(orphaned_docs_query)
            orphaned_count = len(orphaned_docs.fetchall())

            integrity_results["checks_performed"].append("association_integrity_check")
            if orphaned_count > 0:
                integrity_results["issues_found"].append({
                    "type": "orphaned_associations",
                    "count": orphaned_count,
                    "details": f"Found {orphaned_count} orphaned document-diary associations"
                })
        except Exception as e:
            integrity_results["issues_found"].append({
                "type": "association_check_error",
                "error": str(e)
            })

        # Check 4: Data consistency checks
        try:
            # Check for invalid dates in diary entries
            invalid_dates_query = text("""
                SELECT uuid, date FROM diary_entries
                WHERE date < '2020-01-01' OR date > '2030-12-31'
            """)
            result = await db.execute(invalid_dates_query)
            invalid_dates = result.fetchall()

            if invalid_dates:
                integrity_results["issues_found"].append({
                    "type": "invalid_diary_dates",
                    "count": len(invalid_dates),
                    "details": [f"Entry {date[0]} has date {date[1]}" for date in invalid_dates]
                })

            integrity_results["checks_performed"].append("date_validation_check")

        except Exception as e:
            integrity_results["issues_found"].append({
                "type": "date_validation_error",
                "error": str(e)
            })

        # Check 5: File system consistency
        try:
            # Check for diary entries with file references but no actual files
            missing_files_query = text("""
                SELECT uuid, content_file_path FROM diary_entries
                WHERE content_file_path IS NOT NULL
            """)
            result = await db.execute(missing_files_query)
            entries_with_files = result.fetchall()

            missing_files = []
            for entry in entries_with_files:
                file_path = entry[1]
                if file_path and not (get_data_dir() / file_path).exists():
                    missing_files.append({
                        "entry_uuid": entry[0],
                        "missing_file": file_path
                    })

            if missing_files:
                integrity_results["issues_found"].append({
                    "type": "missing_files",
                    "count": len(missing_files),
                    "details": missing_files
                })

            integrity_results["checks_performed"].append("file_system_check")

        except Exception as e:
            integrity_results["issues_found"].append({
                "type": "file_system_check_error",
                "error": str(e)
            })

        # Update overall status
        if integrity_results["issues_found"]:
            integrity_results["status"] = "issues_found"
        else:
            integrity_results["status"] = "all_checks_passed"

        return integrity_results

    except Exception as e:
        logger.error(f"Error during data integrity validation: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Data integrity validation failed: {str(e)}")


@router.get("/console-commands")
async def get_console_commands(
    current_user: User = Depends(get_current_user)
):
    """Get comprehensive console commands for debugging and troubleshooting."""
    try:
        commands = {
            "database_operations": {
                "check_database": {
                    "command": "sqlite3 data/pkm_metadata.db \"PRAGMA integrity_check;\"",
                    "description": "Check database integrity",
                    "expected_output": "ok (if integrity check passes)"
                },
                "check_foreign_keys": {
                    "command": "sqlite3 data/pkm_metadata.db \"PRAGMA foreign_key_check;\"",
                    "description": "Check foreign key constraints",
                    "expected_output": "No output if no violations"
                },
                "list_tables": {
                    "command": "sqlite3 data/pkm_metadata.db \".tables\"",
                    "description": "List all tables in database",
                    "expected_output": "List of table names"
                },
                "table_schema": {
                    "command": "sqlite3 data/pkm_metadata.db \".schema diary_entries\"",
                    "description": "Show table schema",
                    "expected_output": "CREATE TABLE statement"
                },
                "table_info": {
                    "command": "sqlite3 data/pkm_metadata.db \"PRAGMA table_info(diary_entries);\"",
                    "description": "Show table column information",
                    "expected_output": "Column details"
                },
                "database_size": {
                    "command": "ls -lh data/pkm_metadata.db",
                    "description": "Check database file size",
                    "expected_output": "File size information"
                }
            },
            "system_monitoring": {
                "disk_usage": {
                    "command": "df -h",
                    "description": "Check disk usage",
                    "expected_output": "Filesystem usage information"
                },
                "memory_usage": {
                    "command": "free -h",
                    "description": "Check memory usage",
                    "expected_output": "Memory usage information"
                },
                "process_info": {
                    "command": "ps aux | grep python",
                    "description": "Check running Python processes",
                    "expected_output": "Process information"
                },
                "log_monitoring": {
                    "command": "tail -f logs/app.log",
                    "description": "Monitor application logs",
                    "expected_output": "Live log output"
                }
            },
            "debugging_commands": {
                "check_user_sessions": {
                    "command": "sqlite3 data/pkm_metadata.db \"SELECT session_token, created_by, created_at, expires_at FROM sessions ORDER BY created_at DESC LIMIT 10;\"",
                    "description": "Check recent user sessions",
                    "expected_output": "Session information"
                },
                "check_failed_logins": {
                    "command": "grep \"Failed login attempt\" logs/app.log | tail -10",
                    "description": "Check recent failed login attempts",
                    "expected_output": "Failed login log entries"
                },
                "check_file_permissions": {
                    "command": "ls -la data/secure/",
                    "description": "Check secure directory permissions",
                    "expected_output": "Directory permissions"
                }
            },
            "recovery_commands": {
                "backup_database": {
                    "command": "cp data/pkm_metadata.db data/pkm_metadata_backup_$(date +%Y%m%d_%H%M%S).db",
                    "description": "Create database backup",
                    "expected_output": "No output if successful"
                },
                "vacuum_database": {
                    "command": "sqlite3 data/pkm_metadata.db \"VACUUM;\"",
                    "description": "Optimize database and reclaim space",
                    "expected_output": "No output if successful"
                },
                "analyze_database": {
                    "command": "sqlite3 data/pkm_metadata.db \"ANALYZE;\"",
                    "description": "Update database statistics",
                    "expected_output": "No output if successful"
                }
            },
            "api_testing": {
                "health_check": {
                    "command": "curl -X GET http://localhost:8000/api/v1/testing/system/health-detailed -H \"Authorization: Bearer $TOKEN\"",
                    "description": "Test system health endpoint",
                    "expected_output": "Health check JSON response"
                },
                "database_stats": {
                    "command": "curl -X GET http://localhost:8000/api/v1/testing/database/stats -H \"Authorization: Bearer $TOKEN\"",
                    "description": "Test database statistics endpoint",
                    "expected_output": "Database stats JSON response"
                },
                "test_encryption": {
                    "command": "curl -X POST http://localhost:8000/api/v1/testing/diary/test-encryption -H \"Authorization: Bearer $TOKEN\"",
                    "description": "Test diary encryption functionality",
                    "expected_output": "Encryption test results"
                }
            }
        }

        return {
            "status": "success",
            "commands": commands,
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "note": "Use these commands with caution. Always create backups before running recovery operations."
        }

    except Exception as e:
        logger.error(f"Error generating console commands: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to generate console commands: {str(e)}")




@router.post("/files/sanity-check")
async def perform_file_sanity_check(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test file system operations: create, write, read, and delete with detailed logging."""
    try:
        test_id = generate_test_id()
        temp_dir = get_data_dir() / "temp" / f"sanity_check_{test_id}"
        temp_dir.mkdir(parents=True, exist_ok=True)

        test_filename = f"sanity_test_{test_id}.txt"
        file_path = temp_dir / test_filename

        results = {
            "test_id": test_id,
            "overall_status": "unknown",
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "operations": {}
        }

        def add_message(msg: str):
            logger.info(f"File Sanity Check: {msg}")

        # Test: Create and Write
        add_message("Starting CREATE/WRITE operation...")
        start_time = time.perf_counter()

        test_content = f"PKMS File System Sanity Check\nTest ID: {test_id}\nTimestamp: {datetime.now(NEPAL_TZ)}\nTest Data: {'A' * 100}"

        file_path.write_text(test_content, encoding='utf-8')
        write_time = (time.perf_counter() - start_time) * 1000

        results["operations"]["write"] = {
            "status": "success",
            "time_ms": round(write_time, 3),
            "bytes_written": len(test_content.encode('utf-8'))
        }

        # Test: Read
        add_message("Starting READ operation...")
        start_time = time.perf_counter()
        read_content = file_path.read_text(encoding='utf-8')
        read_time = (time.perf_counter() - start_time) * 1000

        content_matches = read_content == test_content
        results["operations"]["read"] = {
            "status": "success" if content_matches else "error",
            "time_ms": round(read_time, 3),
            "bytes_read": len(read_content.encode('utf-8')),
            "content_verified": content_matches
        }

        # Test: File properties
        add_message("Checking file properties...")
        file_stats = file_path.stat()
        results["operations"]["properties"] = {
            "status": "success",
            "size_bytes": file_stats.st_size,
            "size_matches": file_stats.st_size == len(test_content.encode('utf-8')),
            "modified_time": datetime.fromtimestamp(file_stats.st_mtime).isoformat()
        }

        # Test: Delete
        add_message("Starting DELETE operation...")
        start_time = time.perf_counter()
        file_path.unlink()
        delete_time = (time.perf_counter() - start_time) * 1000

        file_exists_after_delete = file_path.exists()
        results["operations"]["delete"] = {
            "status": "success" if not file_exists_after_delete else "error",
            "time_ms": round(delete_time, 3),
            "file_removed": not file_exists_after_delete
        }

        # Test: Directory cleanup
        add_message("Cleaning up test directory...")
        try:
            temp_dir.rmdir()
            results["operations"]["cleanup"] = {
                "status": "success",
                "directory_removed": True
            }
        except Exception as e:
            results["operations"]["cleanup"] = {
                "status": "warning",
                "error": str(e)
            }

        # Determine overall status
        all_success = all(
            op.get("status") == "success"
            for op in results["operations"].values()
        )
        results["overall_status"] = "success" if all_success else "partial_success"

        # Cleanup temp directory if it still exists
        if temp_dir.exists():
            try:
                shutil.rmtree(temp_dir)
            except:
                pass

        return results

    except Exception as e:
        logger.error(f"File system sanity check failed: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"File system sanity check failed: {str(e)}")


# Generate a unique test identifier
def generate_test_id():
    return f"TEST_{int(time.time())}_{random.randint(1000, 9999)}"