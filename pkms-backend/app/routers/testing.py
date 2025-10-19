"""
Testing and Debugging Router for PKMS Backend

Provides comprehensive testing endpoints for database diagnostics,
metadata retrieval, and system health checks accessible from frontend.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, select
from typing import Dict, List, Any, Optional
from datetime import datetime
import json
import time
import uuid
import random
import string
import subprocess
import os
from pathlib import Path
import logging

# Set up logger
logger = logging.getLogger(__name__)

from ..database import get_db
from ..auth.dependencies import get_current_user
from ..models.user import User, Session, RecoveryKey
from ..models.note import Note
from ..models.document import Document
from ..models.todo import Todo
from ..models.project import Project
from ..models.diary import DiaryEntry, DiaryFile, DiaryDailyMetadata
from ..models.archive import ArchiveFolder, ArchiveItem
from ..models.tag import Tag
# from ..models.link import Link  # Link model not implemented
from ..auth.security import verify_password
from ..config import NEPAL_TZ, get_data_dir

router = APIRouter(tags=["testing"])

@router.get("/database/stats")
async def get_database_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive database statistics with accurate size calculations."""
    try:
        stats = {}
        table_sizes = {}
        
        # Count records in each table and get detailed size information
        tables_to_check = [
            ("users", User),
            ("sessions", Session),
            ("recovery_keys", RecoveryKey),
            ("notes", Note),
            ("documents", Document),
            ("todos", Todo),
            ("projects", Project),
            ("diary_entries", DiaryEntry),
            ("diary_files", DiaryFile),
            ("diary_daily_metadata", DiaryDailyMetadata),
            ("archive_folders", ArchiveFolder),
            ("archive_items", ArchiveItem),
            ("tags", Tag)
        ]

        # Get SQLite page size for calculations
        try:
            page_size_result = await db.execute(text("PRAGMA page_size"))
            page_size = page_size_result.scalar() or 4096
        except:
            page_size = 4096

        for table_name, model in tables_to_check:
            try:
                if table_name == "users":
                    # For users table, don't filter by created_by
                    result = await db.execute(select(func.count()).select_from(model))
                elif table_name == "diary_media":
                    # DiaryFile doesn't have created_by, need to join with DiaryEntry
                    result = await db.execute(
                        select(func.count())
                        .select_from(model)
                        .join(DiaryEntry, DiaryEntry.uuid == model.diary_entry_uuid)
                        .where(DiaryEntry.created_by == current_user.uuid)
                    )
                else:
                    # For other tables, filter by current user
                    result = await db.execute(
                        select(func.count()).select_from(model).where(model.created_by == current_user.uuid)
                    )
                count = result.scalar()
                stats[table_name] = count
                
                # Enhanced size calculation with multiple methods
                size_info = {
                    "row_count": count,
                    "page_size": page_size,
                    "estimated": True,
                    "calculation_method": "fallback"
                }
                
                # Method 1: Try dbstat virtual table (most accurate)
                try:
                    dbstat_query = text("""
                        SELECT 
                            sum(pgsize) AS total_bytes,
                            count(*) AS page_count,
                            sum(unused) AS unused_bytes,
                            sum(pgsize - unused) AS used_bytes
                        FROM dbstat WHERE name = :table_name
                    """)
                    dbstat_result = await db.execute(dbstat_query, {"table_name": table_name})
                    dbstat_row = dbstat_result.fetchone()

                    if dbstat_row and dbstat_row[0]:
                        total_bytes = int(dbstat_row[0])
                        page_count = int(dbstat_row[1])
                        unused_bytes = int(dbstat_row[2] or 0)
                        used_bytes = int(dbstat_row[3] or 0)
                        
                        size_info.update({
                            "size_bytes": total_bytes,
                            "used_bytes": used_bytes,
                            "unused_bytes": unused_bytes,
                            "page_count": page_count,
                            "estimated": False,
                            "calculation_method": "dbstat",
                            "efficiency_percent": round((used_bytes / total_bytes * 100) if total_bytes > 0 else 0, 1)
                        })
                    else:
                        raise ValueError("dbstat returned no data")
                        
                except Exception:
                    # Method 2: Try ANALYZE stats (if available)
                    try:
                        analyze_query = text("""
                            SELECT stat FROM sqlite_stat1 
                            WHERE tbl = :table_name AND idx IS NULL
                        """)
                        analyze_result = await db.execute(analyze_query, {"table_name": table_name})
                        analyze_row = analyze_result.fetchone()
                        
                        if analyze_row:
                            # Parse ANALYZE stats (format: "row_count avg_row_size")
                            stats_str = analyze_row[0]
                            if stats_str and ' ' in stats_str:
                                parts = stats_str.split()
                                if len(parts) >= 2:
                                    row_count_stat = int(parts[0])
                                    avg_size = int(parts[1]) if parts[1].isdigit() else 512
                                    estimated_size = max(row_count_stat * avg_size, count * avg_size)
                                    
                                    size_info.update({
                                        "size_bytes": estimated_size,
                                        "used_bytes": estimated_size,
                                        "unused_bytes": 0,
                                        "page_count": (estimated_size + page_size - 1) // page_size,
                                        "estimated": True,
                                        "calculation_method": "analyze_stats",
                                        "avg_row_size": avg_size
                                    })
                                    raise StopIteration  # Break out of nested try blocks
                        
                        raise ValueError("analyze stats not available")
                        
                    except StopIteration:
                        pass  # Successfully got analyze stats
                    except Exception:
                        # Method 3: Intelligent estimation based on table structure
                        base_row_sizes = {
                            "users": 256,          # password hashes, settings
                            "sessions": 128,       # session tokens
                            "recovery_keys": 256,  # recovery key hashes
                            "notes": 1024,         # variable content size
                            "documents": 512,      # metadata only, files stored separately
                            "todos": 256,          # simple task data
                            "projects": 128,       # minimal project info
                            "diary_entries": 2048, # encrypted content
                            "diary_media": 256,    # encrypted filenames/paths
                            "diary_daily_metadata": 512, # wellness metrics JSON
                            "archive_folders": 128, # folder metadata
                            "archive_items": 512,  # file metadata
                            "tags": 64,            # simple tag data
                            "links": 96            # relationship data
                        }
                        
                        estimated_row_size = base_row_sizes.get(table_name, 256)
                        
                        # Add overhead for empty tables (SQLite minimum allocation)
                        if count == 0:
                            estimated_size = page_size  # SQLite allocates at least one page
                        else:
                            # Calculate with SQLite overhead (indexes, metadata, page fragmentation)
                            data_size = count * estimated_row_size
                            overhead_factor = 1.3  # 30% overhead for indexes and fragmentation
                            estimated_size = int(data_size * overhead_factor)
                            
                            # Round up to page boundaries
                            pages_needed = (estimated_size + page_size - 1) // page_size
                            estimated_size = pages_needed * page_size
                        
                        size_info.update({
                            "size_bytes": estimated_size,
                            "used_bytes": count * estimated_row_size if count > 0 else 0,
                            "unused_bytes": estimated_size - (count * estimated_row_size if count > 0 else 0),
                            "page_count": (estimated_size + page_size - 1) // page_size,
                            "estimated": True,
                            "calculation_method": "intelligent_estimate",
                            "estimated_row_size": estimated_row_size
                        })

                # Add human-readable sizes and additional metrics
                size_bytes = size_info.get("size_bytes", 0)
                used_bytes = size_info.get("used_bytes", 0)
                
                size_info.update({
                    "size_mb": round(size_bytes / (1024 * 1024), 4),
                    "size_kb": round(size_bytes / 1024, 2),
                    "used_mb": round(used_bytes / (1024 * 1024), 4),
                    "used_kb": round(used_bytes / 1024, 2),
                    "is_empty": count == 0,
                    "space_efficiency": "good" if size_info.get("efficiency_percent", 70) >= 70 else "poor"
                })
                
                # Special handling for empty tables
                if count == 0:
                    size_info["explanation"] = f"Empty table allocated {page_size} bytes (1 SQLite page minimum)"
                elif size_info["estimated"]:
                    size_info["explanation"] = f"Estimated based on {size_info['calculation_method']}"
                else:
                    size_info["explanation"] = f"Actual size from SQLite dbstat: {size_info['efficiency_percent']}% efficiency"
                
                table_sizes[table_name] = size_info
                    
            except Exception as e:
                stats[table_name] = f"Error: {str(e)}"
                table_sizes[table_name] = {"error": str(e)}
        
        # Get FTS5 tables information
        fts_tables_query = text("""
            SELECT name, sql FROM sqlite_master 
            WHERE type = 'table' AND name LIKE 'fts_%'
            ORDER BY name
        """)
        fts_result = await db.execute(fts_tables_query)
        fts_tables = []
        
        for row in fts_result:
            table_name = row[0]
            # Get FTS table size
            try:
                fts_size_query = text("""
                    SELECT count(*) as row_count FROM """ + table_name)
                fts_count_result = await db.execute(fts_size_query)
                fts_count = fts_count_result.scalar() or 0
                
                # Try to get actual size
                try:
                    dbstat_query = text("""
                        SELECT sum(pgsize) AS size_bytes, count(*) AS page_count
                        FROM dbstat WHERE name = :table_name
                    """)
                    dbstat_result = await db.execute(dbstat_query, {"table_name": table_name})
                    dbstat_row = dbstat_result.fetchone()
                    
                    if dbstat_row and dbstat_row[0]:
                        size_bytes = int(dbstat_row[0])
                        page_count = int(dbstat_row[1])
                    else:
                        # Estimate for FTS tables
                        size_bytes = max(fts_count * 64, page_size)  # FTS overhead
                        page_count = (size_bytes + page_size - 1) // page_size
                except:
                    size_bytes = max(fts_count * 64, page_size)
                    page_count = (size_bytes + page_size - 1) // page_size
                
                fts_tables.append({
                    "name": table_name,
                    "row_count": fts_count,
                    "size_bytes": size_bytes,
                    "size_kb": round(size_bytes / 1024, 2),
                    "page_count": page_count,
                    "purpose": "Full-text search index" if "_content" in table_name 
                             else "FTS configuration" if "_config" in table_name
                             else "FTS document size tracking" if "_docsize" in table_name
                             else "FTS index data" if "_idx" in table_name
                             else "FTS auxiliary data"
                })
            except Exception as e:
                fts_tables.append({
                    "name": table_name,
                    "error": str(e)
                })

        # Get database schema information with categorization
        schema_info = await db.execute(text("""
            SELECT name, type, sql FROM sqlite_master 
            WHERE type IN ('table', 'index', 'view', 'trigger') 
            ORDER BY type, name
        """))
        
        schema_objects = {"tables": [], "indexes": [], "views": [], "triggers": []}
        for row in schema_info:
            obj_name, obj_type, obj_sql = row[0], row[1], row[2]
            category = f"{obj_type}s" if obj_type in ["table", "index", "view", "trigger"] else "other"
            if category in schema_objects:
                schema_objects[category].append({
                    "name": obj_name,
                    "type": obj_type,
                    "sql": obj_sql[:200] + "..." if obj_sql and len(obj_sql) > 200 else obj_sql
                })
        
        # Get database file size (SQLite specific)
        try:
            size_result = await db.execute(text("PRAGMA page_count"))
            page_count = size_result.scalar()
            page_size_result = await db.execute(text("PRAGMA page_size"))
            page_size = page_size_result.scalar()
            db_size_bytes = page_count * page_size if page_count and page_size else 0
            
            # Get additional database info
            journal_mode_result = await db.execute(text("PRAGMA journal_mode"))
            journal_mode = journal_mode_result.scalar()
            
            cache_size_result = await db.execute(text("PRAGMA cache_size"))
            cache_size = cache_size_result.scalar()
            
        except:
            db_size_bytes = 0
            journal_mode = "unknown"
            cache_size = 0

        return {
            "table_counts": stats,
            "table_sizes": table_sizes,
            "fts_tables": fts_tables,
            "schema_objects": schema_objects,
            "database_info": {
                "size_bytes": db_size_bytes,
                "size_mb": round(db_size_bytes / (1024 * 1024), 2),
                "total_pages": page_count,
                "page_size": page_size,
                "journal_mode": journal_mode,
                "cache_size_pages": cache_size
            },
            "size_explanation": {
                "note": "SQLite allocates space in pages (4KB minimum). Empty tables show 4096 bytes due to page allocation.",
                "accuracy": "Sizes marked 'estimated' use intelligent calculation. Actual sizes come from SQLite's dbstat.",
                "efficiency": "Space efficiency shows how much of allocated space contains actual data vs overhead.",
                "fts_overhead": "FTS5 tables provide full-text search but require additional storage (typically 30-50% of original data)."
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "created_by": current_user.uuid,
            "username": current_user.username
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database stats error: {str(e)}")

@router.get("/database/all-tables")
async def get_all_database_tables(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get complete list of all database tables including FTS and internal tables."""
    try:
        # Get all tables from sqlite_master
        all_tables_query = text("""
            SELECT name, type, sql 
            FROM sqlite_master 
            WHERE type = 'table' 
            ORDER BY 
                CASE 
                    WHEN name LIKE 'fts_%' THEN 2
                    WHEN name LIKE 'sqlite_%' THEN 3
                    ELSE 1
                END,
                name
        """)
        
        result = await db.execute(all_tables_query)
        all_tables = []
        
        # Application tables (main user data)
        application_tables = [
            "users", "sessions", "recovery_keys", "notes", "documents", "todos", 
            "projects", "diary_entries", "diary_media", "diary_daily_metadata",
            "archive_folders", "archive_items", "tags", "links", 
            "note_tags", "document_tags", "todo_tags",
            "diary_entry_tags", "archive_item_tags", "archive_folder_tags"
        ]
        
        for row in result:
            table_name = row[0]
            table_type = row[1]
            table_sql = row[2]
            
            # Categorize tables
            if table_name in application_tables:
                category = "Application Data"
            elif table_name.startswith('fts_'):
                category = "Full-Text Search (FTS5)"
            elif table_name.startswith('sqlite_'):
                category = "SQLite System"
            else:
                category = "Other/Unknown"
            
            all_tables.append({
                "name": table_name,
                "type": table_type,
                "category": category,
                "sql": table_sql[:100] + "..." if table_sql and len(table_sql) > 100 else table_sql,
                "is_application_table": table_name in application_tables
            })
        
        # Group by category for summary
        by_category = {}
        for table in all_tables:
            category = table["category"]
            if category not in by_category:
                by_category[category] = []
            by_category[category].append(table["name"])
        
        return {
            "total_tables": len(all_tables),
            "tables": all_tables,
            "by_category": by_category,
            "explanation": {
                "application_tables": f"{len([t for t in all_tables if t['is_application_table']])} tables contain your actual data",
                "fts_tables": f"{len([t for t in all_tables if t['category'] == 'Full-Text Search (FTS5)'])} tables are SQLite FTS5 search indexes (auto-generated)",
                "system_tables": f"{len([t for t in all_tables if t['category'] == 'SQLite System'])} tables are SQLite internal tables",
                "why_37_tables": "SQLite automatically creates multiple internal tables for FTS5 full-text search functionality. Each searchable table gets 5+ FTS tables (config, data, docsize, idx). These are not shown in the main interface as they're implementation details."
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting all tables: {str(e)}")

@router.get("/performance/database-metrics")
async def get_performance_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get database performance metrics and query timings."""
    try:
        import time
        start_time = time.time()
        
        # Test query performance
        query_timings = {}
        
        # Simple count query timing
        simple_start = time.time()
        await db.execute(select(func.count()).select_from(User))
        query_timings["simple_count"] = round((time.time() - simple_start) * 1000, 2)
        
        # Complex join query timing
        complex_start = time.time()
        await db.execute(
            select(func.count()).select_from(Note)
            .join(User, Note.created_by == User.uuid)
            .where(User.uuid == current_user.uuid)
        )
        query_timings["complex_join"] = round((time.time() - complex_start) * 1000, 2)
        
        # Get database performance stats
        stats_queries = {
            "page_count": "PRAGMA page_count",
            "page_size": "PRAGMA page_size", 
            "cache_size": "PRAGMA cache_size",
            "journal_mode": "PRAGMA journal_mode",
            "synchronous": "PRAGMA synchronous",
            "temp_store": "PRAGMA temp_store"
        }
        
        db_stats = {}
        for stat_name, query in stats_queries.items():
            try:
                result = await db.execute(text(query))
                db_stats[stat_name] = result.scalar()
            except Exception as e:
                db_stats[stat_name] = f"Error: {str(e)}"
        
        total_time = round((time.time() - start_time) * 1000, 2)
        
        return {
            "query_timings_ms": query_timings,
            "database_configuration": db_stats,
            "total_execution_time_ms": total_time,
            "performance_score": "good" if total_time < 100 else "slow" if total_time < 500 else "critical",
            "recommendations": [
                "Query performance is optimal" if query_timings["complex_join"] < 10 else "Consider adding indexes for better performance",
                "Database configuration is standard" if db_stats.get("cache_size") else "Consider tuning cache size"
            ],
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Performance metrics error: {str(e)}")

@router.get("/validation/data-integrity")
async def validate_data_integrity(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Perform comprehensive data integrity validation checks."""
    try:
        validation_results = {
            "checks_performed": [],
            "issues_found": [],
            "warnings": [],
            "passed_checks": []
        }
        
        # Check 1: Foreign key constraints
        try:
            # Check for orphaned notes
            orphaned_notes = await db.execute(
                select(func.count()).select_from(Note)
                .outerjoin(User, Note.created_by == User.uuid)
                .where(User.uuid.is_(None))
            )
            orphaned_count = orphaned_notes.scalar()
            
            validation_results["checks_performed"].append("Foreign key integrity (notes -> users)")
            if orphaned_count > 0:
                validation_results["issues_found"].append(f"Found {orphaned_count} orphaned notes without valid user references")
            else:
                validation_results["passed_checks"].append("All notes have valid user references")
                
        except Exception as e:
            validation_results["warnings"].append(f"Could not check note foreign keys: {str(e)}")
        
        # Check 2: Data consistency  
        try:
            # Check for notes with invalid dates
            invalid_dates = await db.execute(
                select(func.count()).select_from(Note)
                .where(Note.created_at > func.now())
            )
            future_notes = invalid_dates.scalar()
            
            validation_results["checks_performed"].append("Date consistency validation")
            if future_notes > 0:
                validation_results["issues_found"].append(f"Found {future_notes} notes with future creation dates")
            else:
                validation_results["passed_checks"].append("All note dates are valid")
                
        except Exception as e:
            validation_results["warnings"].append(f"Could not validate dates: {str(e)}")
            
        # Check 3: Text field validation
        try:
            # Check for notes with null/empty required fields
            invalid_notes = await db.execute(
                select(func.count()).select_from(Note)
                .where(Note.title.is_(None) | (Note.title == ''))
            )
            empty_titles = invalid_notes.scalar()
            
            validation_results["checks_performed"].append("Required field validation")
            if empty_titles > 0:
                validation_results["warnings"].append(f"Found {empty_titles} notes with empty titles")
            else:
                validation_results["passed_checks"].append("All notes have valid titles")
                
        except Exception as e:
            validation_results["warnings"].append(f"Could not validate text fields: {str(e)}")
        
        # Check 4: Database integrity check
        try:
            integrity_result = await db.execute(text("PRAGMA integrity_check"))
            integrity_status = integrity_result.scalar()
            
            validation_results["checks_performed"].append("SQLite integrity check")
            if integrity_status == "ok":
                validation_results["passed_checks"].append("SQLite database integrity is valid")
            else:
                validation_results["issues_found"].append(f"SQLite integrity check failed: {integrity_status}")
                
        except Exception as e:
            validation_results["warnings"].append(f"Could not run integrity check: {str(e)}")
            
        # Overall status
        has_issues = len(validation_results["issues_found"]) > 0
        has_warnings = len(validation_results["warnings"]) > 0
        
        return {
            "validation_results": validation_results,
            "overall_status": "critical" if has_issues else "warning" if has_warnings else "passed",
            "summary": {
                "total_checks": len(validation_results["checks_performed"]),
                "passed": len(validation_results["passed_checks"]),
                "issues": len(validation_results["issues_found"]),
                "warnings": len(validation_results["warnings"])
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Data integrity validation error: {str(e)}")

@router.get("/monitoring/resource-usage")
async def get_resource_usage(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Monitor system resource usage and database connections."""
    try:
        import psutil
        import os
        
        # Get process info
        process = psutil.Process(os.getpid())
        
        # Memory usage
        memory_info = process.memory_info()
        memory_usage = {
            "rss_mb": round(memory_info.rss / 1024 / 1024, 2),
            "vms_mb": round(memory_info.vms / 1024 / 1024, 2),
            "percent": round(process.memory_percent(), 2)
        }
        
        # CPU usage
        cpu_usage = {
            "percent": round(process.cpu_percent(), 2),
            "num_threads": process.num_threads()
        }
        
        # Database statistics
        db_stats = {}
        try:
            # Get database connection info
            stats_queries = {
                "cache_hit_ratio": "PRAGMA cache_spill",
                "page_cache_size": "PRAGMA cache_size",
                "mmap_size": "PRAGMA mmap_size",
                "busy_timeout": "PRAGMA busy_timeout"
            }
            
            for stat, query in stats_queries.items():
                try:
                    result = await db.execute(text(query))
                    db_stats[stat] = result.scalar()
                except:
                    db_stats[stat] = "unavailable"
                    
        except Exception as e:
            db_stats["error"] = str(e)
        
        # System resources
        system_usage = {
            "cpu_count": psutil.cpu_count(),
            "memory_total_mb": round(psutil.virtual_memory().total / 1024 / 1024, 2),
            "memory_available_mb": round(psutil.virtual_memory().available / 1024 / 1024, 2),
            "disk_usage_percent": round(psutil.disk_usage('/').percent, 2)
        }
        
        return {
            "process_memory": memory_usage,
            "process_cpu": cpu_usage, 
            "database_stats": db_stats,
            "system_resources": system_usage,
            "recommendations": [
                "Memory usage is normal" if memory_usage["rss_mb"] < 500 else "High memory usage detected",
                "CPU usage is optimal" if cpu_usage["percent"] < 50 else "High CPU usage detected",
                "Disk space is sufficient" if system_usage["disk_usage_percent"] < 90 else "Disk space is running low"
            ],
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except ImportError:
        # Fallback if psutil is not available
        return {
            "error": "psutil not available - install with: pip install psutil",
            "basic_info": {
                "process_id": os.getpid(),
                "available": False
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Resource monitoring error: {str(e)}")

@router.get("/database/sample-rows")
async def get_sample_rows(
    table: str = Query(..., description="Table name to sample"),
    limit: int = Query(5, ge=1, le=20, description="Number of rows to fetch"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sample rows from specified table for debugging."""
    
    try:
        # Handle different table types
        if table == "users":
            # Special case: users table (no created_by filtering, show current user only)
            query = select(User).where(User.uuid == current_user.uuid).limit(1)
            result = await db.execute(query)
            rows = result.scalars().all()
            
        elif table in ["sessions", "recovery_keys"]:
            # System tables - use raw SQL for flexibility
            if table not in {"sessions", "recovery_keys"}:
                raise HTTPException(status_code=400, detail="Unsupported table")
            table_query = text(f"SELECT * FROM {table} WHERE created_by = :created_by LIMIT :limit")
            result = await db.execute(table_query, {"created_by": current_user.uuid, "limit": limit})
            rows = result.fetchall()
            
            # Convert to dict format
            columns = result.keys()
            sample_data = []
            for row in rows:
                row_dict = dict(zip(columns, row))
                # Handle datetime strings
                for key, value in row_dict.items():
                    if isinstance(value, str) and ('_at' in key or 'created' in key or 'expires' in key):
                        try:
                            # Try to parse and reformat datetime
                            row_dict[key] = value
                        except:
                            pass
                sample_data.append(row_dict)
            
            return {
                "table": table,
                "row_count": len(sample_data),
                "sample_rows": sample_data,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            
        elif table in ["note_tags", "document_tags", "todo_tags", "diary_entry_tags", "archive_item_tags", "archive_folder_tags"]:
            # Junction tables - use raw SQL since they don't have direct models
            if table == "note_tags":
                junction_query = text("""
                    SELECT nt.*, n.title as note_title, t.name as tag_name 
                    FROM note_tags nt 
                    JOIN notes n ON nt.note_uuid = n.uuid 
                    JOIN tags t ON nt.tag_uuid = t.uuid 
                    WHERE n.created_by = :created_by 
                    LIMIT :limit
                """)
            elif table == "document_tags":
                junction_query = text("""
                    SELECT dt.*, d.title as document_title, t.name as tag_name 
                    FROM document_tags dt 
                    JOIN documents d ON dt.document_uuid = d.uuid 
                    JOIN tags t ON dt.tag_uuid = t.uuid 
                    WHERE d.created_by = :created_by 
                    LIMIT :limit
                """)
            elif table == "todo_tags":
                junction_query = text("""
                    SELECT tt.*, td.title as todo_title, t.name as tag_name 
                    FROM todo_tags tt 
                    JOIN todos td ON tt.todo_uuid = td.uuid 
                    JOIN tags t ON tt.tag_uuid = t.uuid 
                    WHERE td.created_by = :created_by 
                    LIMIT :limit
                """)
            elif table == "diary_entry_tags":
                junction_query = text("""
                    SELECT det.*, de.title as diary_title, t.name as tag_name
                    FROM diary_entry_tags det
                    JOIN diary_entries de ON det.diary_entry_uuid = de.uuid
                    JOIN tags t ON det.tag_uuid = t.uuid
                    WHERE de.created_by = :created_by
                    LIMIT :limit
                """)
            elif table == "archive_item_tags":
                junction_query = text("""
                    SELECT ait.*, ai.name as archive_item_name, t.name as tag_name
                    FROM archive_item_tags ait
                    JOIN archive_items ai ON ait.item_uuid = ai.uuid
                    JOIN tags t ON ait.tag_uuid = t.uuid
                    WHERE ai.created_by = :created_by
                    LIMIT :limit
                """)
            elif table == "archive_folder_tags":
                junction_query = text("""
                    SELECT aft.*, af.name as archive_folder_name, t.name as tag_name
                    FROM archive_folder_tags aft
                    JOIN archive_folders af ON aft.archive_folder_uuid = af.uuid
                    JOIN tags t ON aft.tag_uuid = t.uuid
                    WHERE af.created_by = :created_by
                    LIMIT :limit
                """)
            
            result = await db.execute(junction_query, {"created_by": current_user.uuid, "limit": limit})
            rows = result.fetchall()
            
            columns = result.keys()
            sample_data = []
            for row in rows:
                row_dict = dict(zip(columns, row))
                sample_data.append(row_dict)
            
            return {
                "table": table,
                "row_count": len(sample_data),
                "sample_rows": sample_data,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            
        else:
            # Standard tables with models
            table_models = {
                "notes": Note,
                "documents": Document,
                "todos": Todo,
                "projects": Project,
                "diary_entries": DiaryEntry,
                "diary_files": DiaryFile,
                "archive_folders": ArchiveFolder,
                "archive_items": ArchiveItem,
                "tags": Tag
            }
            
            if table not in table_models:
                raise HTTPException(status_code=400, detail=f"Unsupported table. Available: {list(table_models.keys()) + ['users', 'sessions', 'recovery_keys', 'note_tags', 'document_tags', 'todo_tags', 'archive_tags']}")
            
            model = table_models[table]
            
            # Build query with user filtering
            if table == "diary_media":
                # DiaryFile doesn't have created_by, need to join with DiaryEntry
                query = select(model).join(DiaryEntry, DiaryEntry.uuid == model.diary_entry_uuid).where(DiaryEntry.created_by == current_user.uuid).limit(limit)
            else:
                # For other tables, filter by current user
                query = select(model).where(model.created_by == current_user.uuid).limit(limit)
            
            result = await db.execute(query)
            rows = result.scalars().all()
        
        # Convert to dictionaries for JSON response (for model-based tables)
        if table not in ["sessions", "recovery_keys"] and not table.endswith("_tags"):
            sample_data = []
            for row in rows:
                row_dict = {}
                for column in row.__table__.columns:
                    value = getattr(row, column.name)
                    # Handle datetime objects
                    if isinstance(value, datetime):
                        value = value.isoformat()
                    # Handle JSON fields
                    elif column.name.endswith('_json') and isinstance(value, str):
                        try:
                            value = json.loads(value)
                        except:
                            pass
                    row_dict[column.name] = value
                sample_data.append(row_dict)
        
        return {
            "table": table,
            "row_count": len(sample_data),
            "sample_rows": sample_data,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching sample rows: {str(e)}")

@router.get("/database/table-schema")
async def get_table_schema(
    table: str = Query(..., description="Table name to inspect"),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed schema information for a specific table including size information."""
    try:
        # Validate table exists to avoid injection
        valid = await db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name = :n"), {"n": table})
        if not valid.scalar():
            raise HTTPException(status_code=400, detail="Invalid table name")

        # Get table info using SQLite PRAGMA
        schema_result = await db.execute(text(f"PRAGMA table_info([{table}])"))
        columns = []

        for row in schema_result:
            columns.append({
                "column_id": row[0],
                "name": row[1],
                "type": row[2],
                "not_null": bool(row[3]),
                "default_value": row[4],
                "primary_key": bool(row[5])
            })

        # Get indexes for the table
        indexes_result = await db.execute(text(f"PRAGMA index_list([{table}])"))
        indexes = []
        
        for row in indexes_result:
            index_name = row[1]
            # Get index details
            index_info_result = await db.execute(text(f"PRAGMA index_info([{index_name}])"))
            index_columns = []
            for info_row in index_info_result:
                index_columns.append(info_row[2])  # Column name
            
            indexes.append({
                "name": index_name,
                "unique": bool(row[2]),
                "columns": index_columns
            })
        
        # Get table size information
        table_size_info = {}
        try:
            # Get table page count and size
            size_query = text(f"""
                SELECT
                    COUNT(*) as page_count,
                    (SELECT page_size FROM PRAGMA_PAGE_SIZE()) as page_size
                FROM PRAGMA_PAGE_LIST('{table}')
            """)
            size_result = await db.execute(size_query)
            size_row = size_result.fetchone()
            
            if size_row and size_row[0] and size_row[1]:
                table_size_bytes = size_row[0] * size_row[1]
                table_size_info = {
                    "size_bytes": table_size_bytes,
                    "size_mb": round(table_size_bytes / (1024 * 1024), 3),
                    "page_count": size_row[0],
                    "page_size": size_row[1]
                }
            else:
                table_size_info = {"error": "Could not determine table size"}
        except Exception as size_error:
            table_size_info = {"error": f"Size calculation failed: {str(size_error)}"}
        
        # Get row count
        try:
            count_result = await db.execute(text(f"SELECT COUNT(*) FROM [{table}]"))
            row_count = count_result.scalar() or 0
        except Exception:
            row_count = 0
        
        return {
            "table": table,
            "columns": columns,
            "indexes": indexes,
            "column_count": len(columns),
            "row_count": row_count,
            "size_info": table_size_info,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting table schema: {str(e)}")

@router.post("/diary/test-encryption")
async def test_diary_encryption(
    password: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test diary encryption by verifying password and showing decryption capabilities."""
    try:
        # Get a sample diary entry
        query = select(DiaryEntry).where(DiaryEntry.created_by == current_user.uuid).limit(1)
        result = await db.execute(query)
        sample_entry = result.scalar_one_or_none()
        
        if not sample_entry:
            return {
                "status": "no_entries",
                "message": "No diary entries found for testing",
                "encryption_test": False,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Get user's encryption settings (stored in settings_json)
        try:
            settings = json.loads(current_user.settings_json) if current_user.settings_json else {}
            diary_settings = settings.get('diary', {})
            stored_password_hash = diary_settings.get('password_hash')
            
            if not stored_password_hash:
                return {
                    "status": "no_encryption",
                    "message": "No diary encryption password found in user settings",
                    "encryption_test": False,
                    "timestamp": datetime.now(NEPAL_TZ).isoformat()
                }
            
            # Verify password
            password_valid = verify_password(password, stored_password_hash)
            
            if not password_valid:
                return {
                    "status": "invalid_password",
                    "message": "Provided password does not match stored diary encryption password",
                    "encryption_test": False,
                    "timestamp": datetime.now(NEPAL_TZ).isoformat()
                }
            
            # Return entry metadata and encryption details
            entry_data = {
                "uuid": sample_entry.uuid,
                "date": sample_entry.date.isoformat(),
                "title": sample_entry.title,
                "mood": sample_entry.mood,
                "created_at": sample_entry.created_at.isoformat(),
                "updated_at": sample_entry.updated_at.isoformat(),
                "is_template": sample_entry.is_template,
                "encryption_details": {
                    "has_encryption_iv": bool(sample_entry.encryption_iv),
                    "has_encryption_tag": bool(sample_entry.encryption_tag),
                    "iv_length": len(sample_entry.encryption_iv) if sample_entry.encryption_iv else 0,
                    "tag_length": len(sample_entry.encryption_tag) if sample_entry.encryption_tag else 0
                }
            }
            # Include file-based storage info (new schema)
            entry_data["content_length"] = sample_entry.content_length
            entry_data["content_file_path"] = sample_entry.content_file_path
            entry_data["file_hash"] = sample_entry.file_hash
            
            # Get media count for this entry
            media_query = select(func.count()).select_from(DiaryFile).where(
                DiaryFile.diary_entry_uuid == sample_entry.uuid
            )
            media_result = await db.execute(media_query)
            media_count = media_result.scalar()
            
            return {
                "status": "success",
                "message": "Password verified successfully",
                "encryption_test": True,
                "sample_entry": entry_data,
                "media_count": media_count,
                "encryption_status": "operational",
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Error during encryption test: {str(e)}",
                "encryption_test": False,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diary encryption test error: {str(e)}")

@router.post("/files/sanity-check")
async def file_sanity_check(
    filename: str = Form("pkms_test_file.txt"),
    verbose: bool = Form(False),
    current_user: User = Depends(get_current_user)
):
    """Test file system operations: create, write, read, and delete with detailed logging."""
    import os
    import time
    from pathlib import Path
    
    # Use temp_uploads directory
    temp_dir = Path("PKMS_Data/temp_uploads")
    temp_dir.mkdir(parents=True, exist_ok=True)
    file_path = temp_dir / filename
    
    results = {
        "filename": filename,
        "file_path": str(file_path),
        "operations": {},
        "messages": [],
        "overall_status": "unknown",
        "verbose": verbose,
        "timestamp": datetime.now(NEPAL_TZ).isoformat()
    }
    
    def add_message(msg: str):
        """Add timestamped message to results."""
        timestamped_msg = f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] {msg}"
        results["messages"].append(timestamped_msg)
        if verbose:
            logger.info(f"File Test: {timestamped_msg}")
    
    test_content = f"PKMS File System Test\nUser: {current_user.username}\nTimestamp: {datetime.now(NEPAL_TZ).isoformat()}\nTest Data: {'A' * 100}"
    
    try:
        add_message(f"FILE: Ensuring directory exists: {temp_dir}")
        add_message(f"INFO: Preparing to test file: {filename}")
        add_message(f"STATS: Test content size: {len(test_content.encode('utf-8'))} bytes")
        
        # Test: Create and Write
        add_message("ACTION: Starting CREATE/WRITE operation...")
        start_time = time.perf_counter()
        
        # Check if file already exists
        if file_path.exists():
            add_message(f"WARNING: File already exists, will overwrite")
        
        file_path.write_text(test_content, encoding='utf-8')
        write_time = (time.perf_counter() - start_time) * 1000
        
        results["operations"]["write"] = {
            "status": "success",
            "time_ms": round(write_time, 3),
            "bytes_written": len(test_content.encode('utf-8'))
        }
        add_message(f"SUCCESS: WRITE successful: {len(test_content.encode('utf-8'))} bytes written in {write_time:.2f}ms")
        
        # Test: Read
        add_message("READ: Starting READ operation...")
        start_time = time.perf_counter()
        read_content = file_path.read_text(encoding='utf-8')
        read_time = (time.perf_counter() - start_time) * 1000
        
        content_matches = read_content == test_content
        results["operations"]["read"] = {
            "status": "success" if content_matches else "error",
            "time_ms": round(read_time, 3),
            "bytes_read": len(read_content.encode('utf-8')),
            "content_matches": content_matches
        }
        
        if content_matches:
            add_message(f"SUCCESS: READ successful: {len(read_content.encode('utf-8'))} bytes read in {read_time:.2f}ms, content verified")
        else:
            add_message(f"ERROR: READ failed: Content mismatch (expected {len(test_content)} chars, got {len(read_content)} chars)")
        
        # Test: File exists and size
        add_message("INFO: Checking file STAT information...")
        file_exists = file_path.exists()
        if file_exists:
            file_stat = file_path.stat()
            file_size = file_stat.st_size
            file_mtime = file_stat.st_mtime
            add_message(f"STATS: File stats: size={file_size} bytes, modified={datetime.fromtimestamp(file_mtime).strftime('%H:%M:%S')}")
        else:
            file_size = 0
            add_message("ERROR: File does not exist for stat check")
            
        results["operations"]["stat"] = {
            "status": "success" if file_exists else "error",
            "file_exists": file_exists,
            "file_size_bytes": file_size
        }
        
        # Test: Delete
        add_message("DELETED: Starting DELETE operation...")
        start_time = time.perf_counter()
        if file_path.exists():
            file_path.unlink()
            add_message("DELETE: File deletion attempted")
        else:
            add_message("WARNING: File not found for deletion")
            
        delete_time = (time.perf_counter() - start_time) * 1000
        
        file_deleted = not file_path.exists()
        results["operations"]["delete"] = {
            "status": "success" if file_deleted else "error",
            "time_ms": round(delete_time, 3),
            "file_deleted": file_deleted
        }
        
        if file_deleted:
            add_message(f"SUCCESS: DELETE successful: file removed in {delete_time:.2f}ms")
        else:
            add_message(f"ERROR: DELETE failed: file still exists after {delete_time:.2f}ms")
        
        # Overall status and summary
        all_success = all(op.get("status") == "success" for op in results["operations"].values())
        results["overall_status"] = "success" if all_success else "partial_failure"
        
        # Performance summary
        total_time = sum(op.get("time_ms", 0) for op in results["operations"].values())
        avg_time = total_time / len(results["operations"]) if results["operations"] else 0
        
        results["performance_summary"] = {
            "total_time_ms": round(total_time, 3),
            "average_operation_ms": round(avg_time, 3),
            "performance_rating": "fast" if total_time < 100 else "slow" if total_time < 500 else "very_slow"
        }
        
        if all_success:
            add_message(f"COMPLETED: ALL OPERATIONS SUCCESSFUL - Total time: {total_time:.2f}ms (Rating: {results['performance_summary']['performance_rating']})")
        else:
            failed_ops = [op for op, data in results["operations"].items() if data.get("status") != "success"]
            add_message(f"WARNING: PARTIAL SUCCESS - Failed operations: {', '.join(failed_ops)}")
        
    except Exception as e:
        results["overall_status"] = "error"
        results["error"] = str(e)
        add_message(f"CRITICAL: CRITICAL ERROR: {str(e)}")
        
        # Clean up file if it exists
        try:
            if file_path.exists():
                file_path.unlink()
                add_message("CLEANUP: Cleanup: Removed test file after error")
        except Exception as cleanup_error:
            add_message(f"WARNING: Cleanup failed: {str(cleanup_error)}")
    
    add_message(f"INFO: Test completed with status: {results['overall_status']}")
    return results

def generate_test_identifier():
    """Generate a unique test identifier to avoid conflicts with user data"""
    return f"CRUD_TEST_{uuid.uuid4().hex[:8]}_{random.randint(10000, 99999)}"

def generate_random_password():
    """Generate a complex random password for test data"""
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(random.choice(chars) for _ in range(32))

async def _test_notes_crud(db: AsyncSession, user: User, cleanup_list: list, verbose: bool):
    """Test Notes CRUD operations with safe test data."""
    operations = {}
    test_id = generate_test_identifier()
    
    def add_operation(op_name: str, success: bool, data: dict = None, error: str = None):
        operations[op_name] = {
            "status": "success" if success else "error",
            "data": data,
            "error": error,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        if verbose:
            status_icon = "SUCCESS:" if success else "ERROR:"
            logger.info(f"Notes CRUD {op_name}: {status_icon} {'Success' if success else error}")
    
    note = None
    
    # Test Create - Using proper Note schema
    try:
        from ..models.note import Note

        note_data = {
            "title": f"TEST_NOTE_{test_id}",
            "content": f"Test content for CRUD testing - ID: {test_id}",
            "description": f"CRUD test note {test_id}",
            "is_archived": False,
            "created_by": user.uuid
        }
        
        note = Note(**note_data)
        db.add(note)
        await db.flush()
        await db.refresh(note)
        
        cleanup_list.append(("note", note.uuid))
        add_operation("create", True, {
            "note_uuid": note.uuid,
            "title": note.title,
            "test_id": test_id
        })
    except Exception as e:
        add_operation("create", False, error=str(e))
    
    # Test Read
    if note:
        try:
            fetched_note = await db.get(Note, note.uuid)
            if fetched_note and fetched_note.title == note.title and test_id in fetched_note.content:
                add_operation("read", True, {
                    "verified_title": fetched_note.title, 
                    "verified_uuid": fetched_note.uuid,
                    "contains_test_id": test_id in fetched_note.content
                })
            else:
                add_operation("read", False, error="Note not found or test data mismatch")
        except Exception as e:
            add_operation("read", False, error=str(e))
    else:
        add_operation("read", False, error="Cannot test read - note creation failed")
    
    # Test Update
    if note:
        try:
            new_test_password = generate_random_password()
            updated_title = f"UPDATED_TEST_NOTE_{test_id}"
            updated_content = f"Updated test content - ID: {test_id} - New Password: {new_test_password}"
            
            note.title = updated_title
            note.content = updated_content
            await db.flush()
            await db.refresh(note)
            
            if note.title == updated_title and new_test_password in note.content:
                add_operation("update", True, {
                    "new_title": updated_title,
                    "content_length": len(updated_content),
                    "contains_new_password": new_test_password in note.content
                })
            else:
                add_operation("update", False, error="Note update verification failed")
        except Exception as e:
            add_operation("update", False, error=str(e))
    else:
        add_operation("update", False, error="Cannot test update - note creation failed")
    
    # Test Delete
    if note:
        try:
            note_uuid = note.uuid
            note_title = note.title
            await db.delete(note)
            await db.flush()
            
            # Verify deletion
            deleted_note = await db.get(Note, note_uuid)
            if deleted_note is None:
                add_operation("delete", True, {
                    "deleted_note_uuid": note_uuid, 
                    "deleted_title": note_title,
                    "test_id": test_id
                })
                # Remove from cleanup list since we successfully deleted it
                cleanup_list[:] = [item for item in cleanup_list if not (item[0] == "note" and item[1] == note_uuid)]
            else:
                add_operation("delete", False, error="Note still exists after deletion attempt")
        except Exception as e:
            add_operation("delete", False, error=str(e))
    else:
        add_operation("delete", False, error="Cannot test delete - note creation failed")
    
    # Calculate results
    successful_operations = [op for op in operations.values() if op.get("status") == "success"]
    total_operations = len(operations)
    
    return {
        "module": "notes",
        "status": "success" if len(successful_operations) == total_operations else "partial" if successful_operations else "failed",
        "operations": operations,
        "test_note_uuid": note.uuid if note else None,
        "test_identifier": test_id,
        "operations_summary": {
            "total": total_operations,
            "passed": len(successful_operations),
            "failed": total_operations - len(successful_operations)
        }
    }

async def _test_documents_crud(db: AsyncSession, user: User, cleanup_list: list, verbose: bool):
    """Test Documents CRUD operations with safe test data."""
    operations = {}
    test_id = generate_test_identifier()
    
    def add_operation(op_name: str, success: bool, data: dict = None, error: str = None):
        operations[op_name] = {
            "status": "success" if success else "error",
            "data": data,
            "error": error,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        if verbose:
            status_icon = "SUCCESS:" if success else "ERROR:"
            logger.info(f"Documents CRUD {op_name}: {status_icon} {'Success' if success else error}")
    
    document = None
    
    # Test Create - Using proper Document schema
    try:
        from ..models.document import Document
        test_password = generate_random_password()
        
        doc_data = {
            "title": f"TEST_DOC_{test_id}",
            "filename": f"TEST_DOC_{test_id}.txt",
            "original_name": f"Original_Test_Document_{test_id}.txt",
            "file_path": f"/test_storage/crud_test_{test_id}.txt",
            "file_size": 1024,
            "mime_type": "text/plain",
            "description": f"Test document content for CRUD testing - ID: {test_id}",
            "is_archived": False,
            "created_by": user.uuid
        }
        
        document = Document(**doc_data)
        db.add(document)
        await db.flush()
        await db.refresh(document)
        
        cleanup_list.append(("document", document.uuid))
        add_operation("create", True, {
            "doc_uuid": document.uuid,
            "filename": document.filename,
            "test_id": test_id
        })
    except Exception as e:
        add_operation("create", False, error=str(e))
    
    # Test Read
    if document:
        try:
            fetched_doc = await db.get(Document, document.uuid)
            if fetched_doc and test_id in fetched_doc.filename and test_id in (fetched_doc.description or ""):
                add_operation("read", True, {
                    "verified_filename": fetched_doc.filename,
                    "verified_uuid": fetched_doc.uuid,
                    "contains_test_id": test_id in (fetched_doc.description or "")
                })
            else:
                add_operation("read", False, error="Document not found or test data mismatch")
        except Exception as e:
            add_operation("read", False, error=str(e))
    else:
        add_operation("read", False, error="Cannot test read - document creation failed")
    
    # Test Update
    if document:
        try:
            new_test_password = generate_random_password()
            new_filename = f"UPDATED_TEST_DOC_{test_id}.txt"
            new_extracted_text = f"Updated test content - ID: {test_id} - New Password: {new_test_password}"
            
            document.filename = new_filename
            document.description = new_extracted_text
            await db.flush()
            await db.refresh(document)

            if document.filename == new_filename and new_test_password in (document.description or ""):
                add_operation("update", True, {
                    "new_filename": new_filename,
                    "new_content_length": len(new_extracted_text),
                    "contains_new_password": new_test_password in (document.description or "")
                })
            else:
                add_operation("update", False, error="Document update verification failed")
        except Exception as e:
            add_operation("update", False, error=str(e))
    else:
        add_operation("update", False, error="Cannot test update - document creation failed")
    
    # Test Delete
    if document:
        try:
            doc_uuid = document.uuid
            doc_filename = document.filename
            await db.delete(document)
            await db.flush()
            
            # Verify deletion
            deleted_doc = await db.get(Document, doc_uuid)
            if deleted_doc is None:
                add_operation("delete", True, {
                    "deleted_doc_uuid": doc_uuid,
                    "deleted_filename": doc_filename,
                    "test_id": test_id
                })
                # Remove from cleanup list
                cleanup_list[:] = [item for item in cleanup_list if not (item[0] == "document" and item[1] == doc_uuid)]
            else:
                add_operation("delete", False, error="Document still exists after deletion attempt")
        except Exception as e:
            add_operation("delete", False, error=str(e))
    else:
        add_operation("delete", False, error="Cannot test delete - document creation failed")
    
    # Calculate results
    successful_operations = [op for op in operations.values() if op.get("status") == "success"]
    total_operations = len(operations)
    
    return {
        "module": "documents",
        "status": "success" if len(successful_operations) == total_operations else "partial" if successful_operations else "failed",
        "operations": operations,
        "test_doc_uuid": document.uuid if document else None,
        "test_identifier": test_id,
        "operations_summary": {
            "total": total_operations,
            "passed": len(successful_operations),
            "failed": total_operations - len(successful_operations)
        }
    }

async def _test_todos_crud(db: AsyncSession, user: User, cleanup_list: list, verbose: bool):
    """Test Todos CRUD operations with safe test data."""
    operations = {}
    test_id = generate_test_identifier()
    
    def add_operation(op_name: str, success: bool, data: dict = None, error: str = None):
        operations[op_name] = {
            "status": "success" if success else "error",
            "data": data,
            "error": error,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        if verbose:
            status_icon = "SUCCESS:" if success else "ERROR:"
            logger.info(f"Todos CRUD {op_name}: {status_icon} {'Success' if success else error}")
    
    todo = None
    
    # Test Create - Using proper Todo schema
    try:
        from ..models.todo import Todo, TodoStatus
        from ..models.enums import TaskPriority
        test_password = generate_random_password()
        
        todo_data = {
            "title": f"TEST_TODO_{test_id}",
            "description": f"Test todo for CRUD testing - ID: {test_id} - Password: {test_password}",
            "priority": TaskPriority.MEDIUM,
            "status": TodoStatus.PENDING,
            "created_by": user.uuid
        }
        
        todo = Todo(**todo_data)
        db.add(todo)
        await db.flush()
        await db.refresh(todo)
        
        cleanup_list.append(("todo", todo.uuid))
        add_operation("create", True, {
            "todo_uuid": todo.uuid,
            "title": todo.title,
            "priority": todo.priority,
            "test_id": test_id
        })
    except Exception as e:
        add_operation("create", False, error=str(e))
    
    # Test Read
    if todo:
        try:
            fetched_todo = await db.get(Todo, todo.uuid)
            if fetched_todo and test_id in fetched_todo.title and test_id in fetched_todo.description:
                add_operation("read", True, {
                    "verified_title": fetched_todo.title,
                    "verified_uuid": fetched_todo.uuid,
                    "verified_status": fetched_todo.status,
                    "contains_test_id": test_id in fetched_todo.description
                })
            else:
                add_operation("read", False, error="Todo not found or test data mismatch")
        except Exception as e:
            add_operation("read", False, error=str(e))
    else:
        add_operation("read", False, error="Cannot test read - todo creation failed")
    
    # Test Update
    if todo:
        try:
            new_test_password = generate_random_password()
            updated_title = f"UPDATED_TEST_TODO_{test_id}"
            updated_description = f"Updated test todo - ID: {test_id} - New Password: {new_test_password}"
            
            todo.title = updated_title
            todo.description = updated_description
            todo.status = TodoStatus.DONE
            todo.priority = TaskPriority.HIGH
            todo.completed_at = datetime.now(NEPAL_TZ)
            await db.flush()
            await db.refresh(todo)
            
            if (todo.title == updated_title and 
                todo.status == TodoStatus.DONE and 
                new_test_password in todo.description):
                add_operation("update", True, {
                    "new_title": updated_title,
                    "new_status": todo.status,
                    "new_priority": todo.priority,
                    "completed_at": todo.completed_at.isoformat() if todo.completed_at else None,
                    "contains_new_password": new_test_password in todo.description
                })
            else:
                add_operation("update", False, error="Todo update verification failed")
        except Exception as e:
            add_operation("update", False, error=str(e))
    else:
        add_operation("update", False, error="Cannot test update - todo creation failed")
    
    # Test Delete
    if todo:
        try:
            todo_uuid = todo.uuid
            todo_title = todo.title
            await db.delete(todo)
            await db.flush()
            
            # Verify deletion
            deleted_todo = await db.get(Todo, todo_uuid)
            if deleted_todo is None:
                add_operation("delete", True, {
                    "deleted_todo_uuid": todo_uuid,
                    "deleted_title": todo_title,
                    "test_id": test_id
                })
                # Remove from cleanup list
                cleanup_list[:] = [item for item in cleanup_list if not (item[0] == "todo" and item[1] == todo_uuid)]
            else:
                add_operation("delete", False, error="Todo still exists after deletion attempt")
        except Exception as e:
            add_operation("delete", False, error=str(e))
    else:
        add_operation("delete", False, error="Cannot test delete - todo creation failed")
    
    # Calculate results
    successful_operations = [op for op in operations.values() if op.get("status") == "success"]
    total_operations = len(operations)
    
    return {
        "module": "todos",
        "status": "success" if len(successful_operations) == total_operations else "partial" if successful_operations else "failed",
        "operations": operations,
        "test_todo_uuid": todo.uuid if todo else None,
        "test_identifier": test_id,
        "operations_summary": {
            "total": total_operations,
            "passed": len(successful_operations),
            "failed": total_operations - len(successful_operations)
        }
    }

async def _test_archive_crud(db: AsyncSession, user: User, cleanup_list: list, verbose: bool):
    """Test Archive CRUD operations with safe test data."""
    operations = {}
    test_id = generate_test_identifier()
    
    def add_operation(op_name: str, success: bool, data: dict = None, error: str = None):
        operations[op_name] = {
            "status": "success" if success else "error",
            "data": data,
            "error": error,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        if verbose:
            status_icon = "SUCCESS:" if success else "ERROR:"
            logger.info(f"Archive CRUD {op_name}: {status_icon} {'Success' if success else error}")
    
    folder = None
    item = None
    
    # Test Create Folder - Using proper ArchiveFolder schema
    try:
        from ..models.archive import ArchiveFolder, ArchiveItem
        test_password = generate_random_password()
        
        # Generate folder path using same logic as folder creation endpoint
        folder_name = f"TEST_FOLDER_{test_id}"
        folder_path = f"/{folder_name}"  # Root folder for testing
        
        folder_data = {
            "name": folder_name,
            "description": f"Test folder for CRUD testing - ID: {test_id} - Password: {test_password}",
            "created_by": user.uuid
        }
        
        folder = ArchiveFolder(**folder_data)
        db.add(folder)
        await db.flush()
        await db.refresh(folder)
        
        cleanup_list.append(("archive_folder", folder.uuid))
        add_operation("create_folder", True, {
            "folder_uuid": folder.uuid,
            "folder_name": folder.name,
            "test_id": test_id
        })
    except Exception as e:
        add_operation("create_folder", False, error=str(e))
    
    # Test Create Item - Using proper ArchiveItem schema
    if folder:
        try:
            item_test_password = generate_random_password()
            
            item_data = {
                "name": f"TEST_ITEM_{test_id}",
                "description": f"Test item for CRUD testing - ID: {test_id} - Password: {item_test_password}",
                "folder_uuid": folder.uuid,
                "original_filename": f"test_file_{test_id}.txt",
                "stored_filename": f"stored_test_file_{test_id}.txt",
                "file_path": f"/test_storage/archive_crud/{test_id}/test_file.txt",
                "mime_type": "text/plain",
                "file_size": 2048,
                "metadata_json": f'{{"test_id": "{test_id}", "test_password": "{item_test_password}", "test_type": "ARCHIVE_CRUD"}}',
                "created_by": user.uuid
            }
            
            item = ArchiveItem(**item_data)
            db.add(item)
            await db.flush()
            await db.refresh(item)
            
            cleanup_list.append(("archive_item", item.uuid))
            add_operation("create_item", True, {
                "item_uuid": item.uuid,
                "item_name": item.name,
                "original_filename": item.original_filename,
                "test_id": test_id
            })
        except Exception as e:
            add_operation("create_item", False, error=str(e))
    else:
        add_operation("create_item", False, error="Cannot create item - folder creation failed")
    
    # Test Read operations
    if folder and item:
        try:
            fetched_folder = await db.get(ArchiveFolder, folder.uuid)
            fetched_item = await db.get(ArchiveItem, item.uuid)
            
            if (fetched_folder and test_id in fetched_folder.name and
                fetched_item and test_id in fetched_item.name):
                add_operation("read", True, {
                    "verified_folder": fetched_folder.name,
                    "verified_item": fetched_item.name,
                    "folder_item_relationship": fetched_item.folder_uuid == fetched_folder.uuid
                })
            else:
                add_operation("read", False, error="Archive data not found or test data mismatch")
        except Exception as e:
            add_operation("read", False, error=str(e))
    else:
        add_operation("read", False, error="Cannot test read - folder or item creation failed")
    
    # Test Update operations
    if folder and item:
        try:
            new_test_password = generate_random_password()
            
            # Update folder
            folder.name = f"UPDATED_TEST_FOLDER_{test_id}"
            folder.description = f"Updated test folder - ID: {test_id} - New Password: {new_test_password}"
            
            # Update item
            item.name = f"UPDATED_TEST_ITEM_{test_id}"
            item.extracted_text = f"Updated test content - ID: {test_id} - New Password: {new_test_password}"
            
            await db.flush()
            await db.refresh(folder)
            await db.refresh(item)
            
            if (new_test_password in folder.description and 
                new_test_password in item.extracted_text):
                add_operation("update", True, {
                    "updated_folder_name": folder.name,
                    "updated_item_name": item.name,
                    "contains_new_password": new_test_password in item.extracted_text
                })
            else:
                add_operation("update", False, error="Archive update verification failed")
        except Exception as e:
            add_operation("update", False, error=str(e))
    else:
        add_operation("update", False, error="Cannot test update - folder or item creation failed")
    
    # Test Delete operations
    delete_success = True
    if item:
        try:
            item_uuid = item.uuid
            item_name = item.name
            await db.delete(item)
            await db.flush()
            
            deleted_item = await db.get(ArchiveItem, item_uuid)
            if deleted_item is None:
                cleanup_list[:] = [i for i in cleanup_list if not (i[0] == "archive_item" and i[1] == item_uuid)]
            else:
                delete_success = False
        except Exception as e:
            delete_success = False
    
    if folder:
        try:
            folder_uuid = folder.uuid
            folder_name = folder.name
            await db.delete(folder)
            await db.flush()
            
            deleted_folder = await db.get(ArchiveFolder, folder_uuid)
            if deleted_folder is None and delete_success:
                add_operation("delete", True, {
                    "deleted_folder_uuid": folder_uuid,
                    "deleted_item_uuid": item.uuid if item else None,
                    "test_id": test_id
                })
                cleanup_list[:] = [i for i in cleanup_list if not (i[0] == "archive_folder" and i[1] == folder_uuid)]
            else:
                add_operation("delete", False, error="Archive folder still exists after deletion or item deletion failed")
        except Exception as e:
            add_operation("delete", False, error=str(e))
    else:
        add_operation("delete", False, error="Cannot test delete - folder creation failed")
    
    # Calculate results
    successful_operations = [op for op in operations.values() if op.get("status") == "success"]
    total_operations = len(operations)
    
    return {
        "module": "archive",
        "status": "success" if len(successful_operations) == total_operations else "partial" if successful_operations else "failed",
        "operations": operations,
        "test_folder_uuid": folder.uuid if folder else None,
        "test_item_uuid": item.uuid if item else None,
        "test_identifier": test_id,
        "operations_summary": {
            "total": total_operations,
            "passed": len(successful_operations),
            "failed": total_operations - len(successful_operations)
        }
    }

async def _cleanup_test_data(db: AsyncSession, cleanup_list: list, verbose: bool):
    """Clean up test data created during CRUD testing."""
    cleaned_count = 0
    for item_type, item_id in cleanup_list:
        try:
            if item_type == "note":
                from ..models.note import Note
                note = await db.get(Note, item_id)
                if note:
                    await db.delete(note)
                    cleaned_count += 1
            elif item_type == "document":
                from ..models.document import Document
                doc = await db.get(Document, item_id)
                if doc:
                    await db.delete(doc)
                    cleaned_count += 1
            elif item_type == "todo":
                from ..models.todo import Todo
                todo = await db.get(Todo, item_id)
                if todo:
                    await db.delete(todo)
                    cleaned_count += 1
            elif item_type == "archive_item":
                from ..models.archive import ArchiveItem
                item = await db.get(ArchiveItem, item_id)
                if item:
                    await db.delete(item)
                    cleaned_count += 1
            elif item_type == "archive_folder":
                from ..models.archive import ArchiveFolder
                folder = await db.get(ArchiveFolder, item_id)
                if folder:
                    await db.delete(folder)
                    cleaned_count += 1
        except Exception as e:
            if verbose:
                logger.warning(f"Cleanup failed for item {item_id} of type {item_type}: {e}")
            pass  # Continue cleanup even if some items fail

    try:
        await db.commit()
    except Exception as e:
        if verbose:
            logger.warning(f"Final DB commit failed during cleanup: {e}")
        pass
    
    return {
        "status": "success",
        "cleaned_count": cleaned_count,
        "note": "Cleanup completed. Some items might have failed to delete."
    }

@router.get("/system/health-detailed")
async def get_detailed_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed system health information including database connectivity."""
    try:
        health_info = {
            "database": {},
            "user_session": {},
            "system_info": {},
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
        # Test database connectivity
        try:
            test_query = await db.execute(text("SELECT 1 as test"))
            test_result = test_query.scalar()
            health_info["database"]["connectivity"] = "operational" if test_result == 1 else "failed"
        except Exception as e:
            health_info["database"]["connectivity"] = f"error: {str(e)}"
        
        # Get database version info
        try:
            version_query = await db.execute(text("SELECT sqlite_version()"))
            db_version = version_query.scalar()
            health_info["database"]["version"] = db_version
        except Exception as e:
            health_info["database"]["version"] = f"error: {str(e)}"
        
        # Check user session info
        health_info["user_session"] = {
            "created_by": current_user.uuid,
            "username": current_user.username,
            "is_first_login": current_user.is_first_login,
            "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
            "account_created": current_user.created_at.isoformat()
        }
        
        # Get system table counts
        try:
            tables_query = await db.execute(text("""
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            """))
            tables = [row[0] for row in tables_query]
            health_info["system_info"]["table_count"] = len(tables)
            health_info["system_info"]["tables"] = tables
        except Exception as e:
            health_info["system_info"]["table_error"] = str(e)
        
        return health_info
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check error: {str(e)}")

@router.get("/console-commands")
async def get_console_commands():
    """Get comprehensive console commands for debugging and troubleshooting."""
    return {
        "frontend_browser": {
            "title": "Frontend Browser Console Commands",
            "description": "JavaScript commands to run in browser DevTools console",
            "commands": {
                "auth_status": {
                    "description": "Check current authentication status and token details",
                    "command": """// Check authentication status
const token = localStorage.getItem('pkms_token');
if (token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiresAt = new Date(payload.exp * 1000);
    const now = new Date();
    const remainingMs = expiresAt - now;
    console.log('AUTH: Auth Status:', {
      hasToken: true,
      expiresAt: expiresAt.toISOString(),
      remainingTime: `${Math.floor(remainingMs / 1000)}s`,
      isExpired: remainingMs < 0,
      payload: payload
    });
  } catch (e) {
    console.log('ERROR: Token parse error:', e);
  }
} else {
  console.log('WARNING: No authentication token found');
}"""
                },
                "storage_analysis": {
                    "description": "Analyze all browser storage usage",
                    "command": """// Analyze browser storage
const storageAnalysis = {
  localStorage: {},
  sessionStorage: {},
  totalSize: 0
};

// Analyze localStorage
for (let key in localStorage) {
  if (localStorage.hasOwnProperty(key)) {
    const value = localStorage[key];
    const size = new Blob([value]).size;
    storageAnalysis.localStorage[key] = {
      size: `${size} bytes`,
      preview: value.substring(0, 100) + (value.length > 100 ? '...' : '')
    };
    storageAnalysis.totalSize += size;
  }
}

// Analyze sessionStorage
for (let key in sessionStorage) {
  if (sessionStorage.hasOwnProperty(key)) {
    const value = sessionStorage[key];
    const size = new Blob([value]).size;
    storageAnalysis.sessionStorage[key] = {
      size: `${size} bytes`,
      preview: value.substring(0, 100) + (value.length > 100 ? '...' : '')
    };
    storageAnalysis.totalSize += size;
  }
}

storageAnalysis.totalSize = `${storageAnalysis.totalSize} bytes (${(storageAnalysis.totalSize/1024).toFixed(2)} KB)`;
console.log('STORAGE: Storage Analysis:', storageAnalysis);"""
                },
                "api_connectivity": {
                    "description": "Test API connectivity and response times",
                    "command": """// Test API connectivity
const testEndpoints = [
  '/health',
  '/api/v1/testing/health',
  '/api/v1/testing/database/stats',
  '/api/v1/testing/performance/database-metrics'
];

const token = localStorage.getItem('pkms_token');
const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

Promise.all(testEndpoints.map(async (endpoint) => {
  const startTime = Date.now();
  try {
    const response = await fetch(`http://localhost:8000${endpoint}`, { headers });
    const responseTime = Date.now() - startTime;
    return {
      endpoint,
      status: response.status,
      ok: response.ok,
      responseTime: `${responseTime}ms`,
      size: response.headers.get('content-length') || 'unknown'
    };
  } catch (error) {
    return {
      endpoint,
      error: error.message,
      responseTime: `${Date.now() - startTime}ms`
    };
  }
})).then(results => {
  console.log('NETWORK: API Connectivity Test:', results);
});"""
                },
                "error_log_export": {
                    "description": "Export browser console errors and warnings",
                    "command": """// Capture and export console errors
const originalError = console.error;
const originalWarn = console.warn;
const errorLog = [];

console.error = function(...args) {
  errorLog.push({
    type: 'error',
    timestamp: new Date().toISOString(),
    message: args.join(' '),
    stack: new Error().stack
  });
  originalError.apply(console, args);
};

console.warn = function(...args) {
  errorLog.push({
    type: 'warning',
    timestamp: new Date().toISOString(),
    message: args.join(' ')
  });
  originalWarn.apply(console, args);
};

// Export function
window.exportErrorLog = () => {
  const blob = new Blob([JSON.stringify(errorLog, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pkms-error-log-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

console.log('INFO: Error logging enabled. Call exportErrorLog() to download log.');"""
                },
                "performance_monitor": {
                    "description": "Monitor frontend performance metrics",
                    "command": """// Performance monitoring
const performanceData = {
  navigation: performance.getEntriesByType('navigation')[0],
  resources: performance.getEntriesByType('resource').slice(-10),
  memory: performance.memory ? {
    used: `${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
    total: `${(performance.memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
    limit: `${(performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`
  } : 'Not available',
  timing: {
    domContentLoaded: `${performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd}ms`,
    loadComplete: `${performance.getEntriesByType('navigation')[0].loadEventEnd}ms`
  }
};
console.log('PERFORMANCE: Performance Data:', performanceData);"""
                },
                "clear_all_data": {
                    "description": "Clear all PKMS application data (DANGER!)",
                    "command": """// DANGER: Clear all application data
if (confirm('WARNING: This will clear ALL PKMS data. Are you sure?')) {
  localStorage.clear();
  sessionStorage.clear();
  
  // Clear cookies
  document.cookie.split(";").forEach(c => {
    document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
  });
  
  console.log('CLEANUP: All browser data cleared. Reload the page.');
} else {
  console.log('ERROR: Data clear cancelled.');
}"""
                }
            }
        },
        "backend_cli": {
            "title": "Backend CLI Commands",
            "description": "Commands to run in terminal from backend directory",
            "commands": {
                "test_endpoints": {
                    "description": "Test all new testing endpoints",
                    "command": """# Test new testing endpoints
cd pkms-backend

# Get auth token first (replace with your credentials)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"admin123"}' | \\
  python3 -c "import sys, json; print(json.load(sys.stdin)['access_token'])")

# Test file system
curl -X POST http://localhost:8000/api/v1/testing/files/sanity-check \\
  -H "Authorization: Bearer $TOKEN" \\
  -F "filename=test_file.txt"

# Test CRUD operations
curl -X POST http://localhost:8000/api/v1/testing/crud/full-test \\
  -H "Authorization: Bearer $TOKEN"

# Test performance metrics
curl -X GET http://localhost:8000/api/v1/testing/performance/database-metrics \\
  -H "Authorization: Bearer $TOKEN"

# Test data integrity
curl -X GET http://localhost:8000/api/v1/testing/validation/data-integrity \\
  -H "Authorization: Bearer $TOKEN"

# Test resource monitoring
curl -X GET http://localhost:8000/api/v1/testing/monitoring/resource-usage \\
  -H "Authorization: Bearer $TOKEN\""""
                },
                "database_deep_dive": {
                    "description": "Deep database analysis and repair",
                    "command": """# Database deep analysis
cd pkms-backend

# Database integrity check
python3 -c "
import sqlite3
conn = sqlite3.connect('data/pkm_metadata.db')
result = conn.execute('PRAGMA integrity_check').fetchone()
print(f'DB Integrity: {result[0]}')

# Table analysis
tables = conn.execute('SELECT name FROM sqlite_master WHERE type=\"table\"').fetchall()
print(f'Total tables: {len(tables)}')

for table_name, in tables:
    try:
        count = conn.execute(f'SELECT COUNT(*) FROM {table_name}').fetchone()[0]
        print(f'{table_name}: {count} rows')
    except Exception as e:
        print(f'{table_name}: ERROR - {e}')

conn.close()
"

# Database optimization
python3 -c "
import sqlite3
conn = sqlite3.connect('data/pkm_metadata.db')
print('Running VACUUM...')
conn.execute('VACUUM')
print('Running ANALYZE...')
conn.execute('ANALYZE')
print('Database optimized')
conn.close()
\""""
                },
                "log_analysis": {
                    "description": "Analyze container logs for errors",
                    "command": """# Analyze container logs
docker-compose logs pkms-backend --tail=100 | grep -E "(ERROR|WARN|CRITICAL|Exception|Traceback)"

# Live log monitoring
docker-compose logs -f pkms-backend | grep --line-buffered -E "(ERROR|WARN|CRITICAL)"

# Log statistics
docker-compose logs pkms-backend --tail=1000 | awk '{print $3}' | sort | uniq -c | sort -rn"""
                },
                "performance_profiling": {
                    "description": "Profile backend performance",
                    "command": """# Performance profiling
cd pkms-backend

# Profile with cProfile
python3 -m cProfile -s cumulative -m uvicorn main:app --host 0.0.0.0 --port 8001

# Memory profiling (install memory_profiler first)
# pip install memory_profiler psutil
python3 -m memory_profiler main.py

# Simple load test
for i in {1..10}; do
  time curl -s http://localhost:8000/health > /dev/null
done"""
                },
                "dependency_audit": {
                    "description": "Audit dependencies and security",
                    "command": """# Security and dependency audit
cd pkms-backend

# Check for security vulnerabilities
pip-audit

# List outdated packages
pip list --outdated

# Generate dependency tree
pipdeptree

# Check requirements
pip check"""
                }
            }
        },
        "docker_ops": {
            "title": "Docker Operations & Debugging",
            "description": "Docker container management and debugging commands",
            "commands": {
                "container_health": {
                    "description": "Check container health and resource usage",
                    "command": """# Container health check
docker-compose ps

# Resource usage
docker stats pkms-backend pkms-frontend --no-stream

# Container details
docker inspect pkms-backend | jq '.[]|{State:.State, Mounts:.Mounts, NetworkSettings:.NetworkSettings.Ports}'

# Volume information
docker volume ls
docker-compose exec pkms-backend df -h"""
                },
                "network_debugging": {
                    "description": "Debug network connectivity between containers",
                    "command": """# Network debugging
docker network ls
docker network inspect pkms_default

# Test connectivity
docker-compose exec pkms-frontend ping pkms-backend
docker-compose exec pkms-backend ping pkms-frontend

# Port verification
netstat -tulpn | grep -E ":8000|:3000"
ss -tulpn | grep -E ":8000|:3000\""""
                },
                "volume_permissions": {
                    "description": "Check and fix volume permissions",
                    "command": """# Volume permissions check
docker-compose exec pkms-backend ls -la PKMS_Data/
docker-compose exec pkms-backend ls -la data/

# Fix permissions if needed
docker-compose exec pkms-backend chmod -R 755 PKMS_Data/
docker-compose exec pkms-backend chmod -R 755 data/

# Check disk usage
docker-compose exec pkms-backend du -sh PKMS_Data/*
docker system df"""
                },
                "rebuild_and_debug": {
                    "description": "Complete rebuild with debugging",
                    "command": """# Complete rebuild with debugging
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d

# Follow logs during startup
docker-compose logs -f pkms-backend

# Test after startup
sleep 10
curl -v http://localhost:8000/health"""
                }
            }
        },
        "database_maintenance": {
            "title": "Database Maintenance & Recovery",
            "description": "Database maintenance, backup, and recovery operations",
            "commands": {
                "backup_database": {
                    "description": "Create database backup",
                    "command": """# Create database backup
cd pkms-backend
mkdir -p backups
cp data/pkm_metadata.db backups/pkm_metadata_$(date +%Y%m%d_%H%M%S).db

# Verify backup
sqlite3 backups/pkm_metadata_*.db "PRAGMA integrity_check;"

# Compress backup
gzip backups/pkm_metadata_*.db"""
                },
                "schema_export": {
                    "description": "Export database schema",
                    "command": """# Export database schema
cd pkms-backend
sqlite3 data/pkm_metadata.db ".schema" > schema_export.sql

# Export with data
sqlite3 data/pkm_metadata.db ".dump" > full_export.sql

# Compare schemas
sqlite3 data/pkm_metadata.db ".schema --indent" | sort > current_schema.sql"""
                },
                "data_recovery": {
                    "description": "Data recovery and repair procedures",
                    "command": """# Data recovery procedures
cd pkms-backend

# Check for corruption
sqlite3 data/pkm_metadata.db "PRAGMA integrity_check;"

# Attempt repair
sqlite3 data/pkm_metadata.db ".recover" | sqlite3 recovered.db

# Manual recovery
sqlite3 data/pkm_metadata.db ".mode insert" ".output recovery.sql" "SELECT * FROM users;"

# Foreign key check
sqlite3 data/pkm_metadata.db "PRAGMA foreign_key_check;\"
"""
                }
            }
        },
        "troubleshooting": {
            "title": "Advanced Troubleshooting",
            "description": "Comprehensive troubleshooting commands for common issues",
            "commands": {
                "auth_debugging": {
                    "description": "Debug authentication issues",
                    "command": """# Authentication debugging
cd pkms-backend

# Test login endpoint
curl -v -X POST http://localhost:8000/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"admin123"}'

# Decode JWT token (replace TOKEN with actual token)
echo "TOKEN_HERE" | cut -d. -f2 | base64 -d | jq .

# Check user sessions
python3 -c "
import sqlite3
conn = sqlite3.connect('data/pkm_metadata.db')
sessions = conn.execute('SELECT id, created_by, created_at, expires_at FROM sessions ORDER BY created_at DESC LIMIT 10').fetchall()
print('Recent sessions:')
for session in sessions:
    print(f'Session {session[0]}: User {session[1]}, Created: {session[2]}, Expires: {session[3]}')
conn.close()
\""""
                },
                "cors_debugging": {
                    "description": "Debug CORS and network issues",
                    "command": """# CORS and network debugging
# Test CORS headers
curl -v -H "Origin: http://localhost:3000" \\
  -H "Access-Control-Request-Method: POST" \\
  -H "Access-Control-Request-Headers: Authorization,Content-Type" \\
  -X OPTIONS http://localhost:8000/api/v1/testing/health

# Test from different origins
curl -v -H "Origin: http://localhost:5173" http://localhost:8000/health

# Check backend CORS configuration
grep -r "CORSMiddleware" pkms-backend/"""
                },
                "memory_leaks": {
                    "description": "Debug memory leaks and performance issues",
                    "command": """# Memory leak debugging
# Monitor memory usage over time
while true; do
  docker stats pkms-backend --no-stream --format "table {{.MemUsage}}\\t{{.CPUPerc}}\\t{{.Container}}"
  sleep 30
done

# Python memory profiling
docker-compose exec pkms-backend python3 -c "
import psutil
import os
process = psutil.Process(os.getpid())
print(f'Memory: {process.memory_info().rss / 1024 / 1024:.2f} MB')
print(f'CPU: {process.cpu_percent()}%')
print(f'Threads: {process.num_threads()}')
\""""
                },
                "database_locks": {
                    "description": "Debug database locks and connection issues",
                    "command": """# Database lock debugging
cd pkms-backend

# Check for database locks
lsof data/pkm_metadata.db

# SQLite lock debugging
python3 -c "
import sqlite3
import time
try:
    conn = sqlite3.connect('data/pkm_metadata.db', timeout=1.0)
    conn.execute('BEGIN IMMEDIATE;')
    print('Database accessible')
    conn.rollback()
    conn.close()
except sqlite3.OperationalError as e:
    print(f'Database lock detected: {e}')
\""""
                },
                "api_endpoint_test": {
                    "description": "Test all API endpoints systematically",
                    "command": """# Comprehensive API endpoint testing
#!/bin/bash
BASE_URL="http://localhost:8000"

# Get auth token
TOKEN=$(curl -s -X POST $BASE_URL/api/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"username":"admin","password":"admin123"}' | \\
  jq -r '.access_token')

echo "Testing with token: ${TOKEN:0:20}..."

# Test endpoints
ENDPOINTS=(
  "GET:/health"
  "GET:/api/v1/testing/health"
  "GET:/api/v1/testing/database/stats"
  "GET:/api/v1/testing/performance/database-metrics"
  "GET:/api/v1/testing/validation/data-integrity"
  "GET:/api/v1/testing/monitoring/resource-usage"
  "GET:/api/v1/testing/database/all-tables"
)

for endpoint in "${ENDPOINTS[@]}"; do
  method=$(echo $endpoint | cut -d: -f1)
  path=$(echo $endpoint | cut -d: -f2)
  echo "Testing $method $path"
  curl -s -X $method "$BASE_URL$path" \\
    -H "Authorization: Bearer $TOKEN" | jq . > /dev/null
  echo "Status: $?"
done"""
                }
            }
        }
    } 

# ---------------------------------------------------------------------------
# Compatibility aliases (added 2025-07-08 +05:45)
# These routes keep older frontend TestingService working after path refactor.
# ---------------------------------------------------------------------------

# (Removed duplicate; use the single public unauthenticated /health defined below)


@router.get("/health/detailed")
async def detailed_health_alias(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Alias that forwards to the new /system/health-detailed endpoint."""
    return await get_detailed_health(current_user=current_user, db=db)


@router.post("/diary/encryption-test")
async def diary_encryption_alias(
    password: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Alias that forwards to the new /diary/test-encryption endpoint."""
    return await test_diary_encryption(password=password, current_user=current_user, db=db) 

# Individual CRUD operation endpoints for granular testing
@router.post("/crud/notes/create")
async def test_notes_create(
    title: str = Form("Test Note"),
    content: str = Form("Test content"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test creating a new note."""
    try:
        from ..models.note import Note
        note = Note(
            title=f"{title} - {datetime.now().strftime('%H:%M:%S')}",
            content=content,
            created_by=current_user.uuid
        )
        db.add(note)
        await db.flush()
        await db.refresh(note)
        await db.commit()
        
        return {
            "status": "success",
            "note_uuid": note.uuid,
            "title": note.title,
            "message": "Note created successfully"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Failed to create note"
        }

@router.post("/crud/documents/create")
async def test_documents_create(
    filename: str = Form("test_document.txt"),
    content_type: str = Form("text/plain"),
    file_size: int = Form(1024),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test creating a new document."""
    try:
        from ..models.document import Document
        document = Document(
            title=f"Test {filename}",
            filename=f"{filename}_{datetime.now().strftime('%H%M%S')}",
            original_name=filename,
            file_path=f"/temp/{filename}",
            file_size=file_size,
            mime_type=content_type,
            created_by=current_user.uuid
        )
        db.add(document)
        await db.flush()
        await db.refresh(document)
        await db.commit()
        
        return {
            "status": "success",
            "document_uuid": document.uuid,
            "filename": document.filename,
            "message": "Document created successfully"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Failed to create document"
        }

@router.post("/crud/todos/create")
async def test_todos_create(
    title: str = Form("Test Todo"),
    description: str = Form("Test description"),
    priority: str = Form("medium"),  # low, medium, high, urgent
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Test creating a new todo."""
    try:
        from ..models.todo import Todo
        from ..models.enums import TodoStatus, TaskPriority
        todo = Todo(
            title=f"{title} - {datetime.now().strftime('%H:%M:%S')}",
            description=description,
            priority=TaskPriority(priority),
            status=TodoStatus.PENDING,
            created_by=current_user.uuid
        )
        db.add(todo)
        await db.flush()
        await db.refresh(todo)
        await db.commit()
        
        return {
            "status": "success",
            "todo_uuid": todo.uuid,
            "title": todo.title,
            "message": "Todo created successfully"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Failed to create todo"
        }

@router.delete("/crud/cleanup/{item_type}/{item_id}")
async def cleanup_test_item(
    item_type: str,
    item_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a specific test item for cleanup."""
    try:
        deleted = False
        
        if item_type == "note":
            from ..models.note import Note
            item = await db.get(Note, item_id)
            if item and item.created_by == current_user.uuid:
                await db.delete(item)
                deleted = True
        elif item_type == "document":
            from ..models.document import Document
            item = await db.get(Document, item_id)
            if item and item.created_by == current_user.uuid:
                await db.delete(item)
                deleted = True
        elif item_type == "todo":
            from ..models.todo import Todo
            item = await db.get(Todo, item_id)
            if item and item.created_by == current_user.uuid:
                await db.delete(item)
                deleted = True
        
        if deleted:
            await db.commit()
            return {
                "status": "success",
                "message": f"{item_type.title()} {item_id} deleted successfully"
            }
        else:
            return {
                "status": "error",
                "message": f"{item_type.title()} {item_id} not found or not owned by user"
            }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": f"Failed to delete {item_type} {item_id}"
        }

@router.get("/database/fts-tables")
async def get_fts_table_details(
    table_name: Optional[str] = Query(None, description="Specific FTS table to examine"),
    sample_limit: int = Query(5, ge=1, le=20, description="Number of sample rows"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed information about FTS5 tables including samples and structure."""
    try:
        # Get all FTS5 tables
        fts_tables_query = text("""
            SELECT name, sql FROM sqlite_master 
            WHERE type = 'table' AND name LIKE 'fts_%'
            ORDER BY name
        """)
        fts_result = await db.execute(fts_tables_query)
        
        fts_groups = {
            "notes": {"tables": [], "description": "Full-text search for notes content"},
            "documents": {"tables": [], "description": "Full-text search for document content"},
            "diary": {"tables": [], "description": "Full-text search for diary entries (metadata only - content is encrypted)"},
            "archive": {"tables": [], "description": "Full-text search for archive items"},
            "global": {"tables": [], "description": "Global search across all modules"}
        }
        
        all_fts_tables = []
        
        for row in fts_result:
            table_name_db = row[0]
            table_sql = row[1]
            
            # Categorize FTS tables
            if "notes" in table_name_db:
                category = "notes"
            elif "documents" in table_name_db:
                category = "documents"
            elif "diary" in table_name_db:
                category = "diary"
            elif "archive" in table_name_db:
                category = "archive"
            else:
                category = "global"
            
            # Determine table purpose
            if "_content" in table_name_db:
                purpose = "Main FTS content table (searchable data)"
                table_type = "content"
            elif "_data" in table_name_db:
                purpose = "FTS index data (inverted index)"
                table_type = "data"
            elif "_idx" in table_name_db:
                purpose = "FTS index metadata"
                table_type = "idx"
            elif "_config" in table_name_db:
                purpose = "FTS configuration settings"
                table_type = "config"
            elif "_docsize" in table_name_db:
                purpose = "Document size tracking for ranking"
                table_type = "docsize"
            else:
                purpose = "FTS auxiliary table"
                table_type = "other"
            
            # Get table info
            try:
                count_query = text(f"SELECT count(*) FROM [{table_name_db}]")
                count_result = await db.execute(count_query)
                row_count = count_result.scalar() or 0
                
                # Get size info
                try:
                    dbstat_query = text("""
                        SELECT sum(pgsize) AS size_bytes, count(*) AS page_count
                        FROM dbstat WHERE name = :table_name
                    """)
                    dbstat_result = await db.execute(dbstat_query, {"table_name": table_name_db})
                    dbstat_row = dbstat_result.fetchone()
                    
                    if dbstat_row and dbstat_row[0]:
                        size_bytes = int(dbstat_row[0])
                        page_count = int(dbstat_row[1])
                    else:
                        size_bytes = row_count * 64  # Estimate
                        page_count = max(1, size_bytes // 4096)
                except:
                    size_bytes = row_count * 64
                    page_count = max(1, size_bytes // 4096)
                
            except Exception as e:
                row_count = 0
                size_bytes = 4096
                page_count = 1
            
            table_info = {
                "name": table_name_db,
                "category": category,
                "type": table_type,
                "purpose": purpose,
                "row_count": row_count,
                "size_bytes": size_bytes,
                "size_kb": round(size_bytes / 1024, 2),
                "page_count": page_count,
                "sql": table_sql
            }
            
            fts_groups[category]["tables"].append(table_info)
            all_fts_tables.append(table_info)
        
        # If specific table requested, get sample data
        sample_data = None
        if table_name and table_name in [t["name"] for t in all_fts_tables]:
            try:
                # Get table schema first
                schema_query = text(f"PRAGMA table_info([{table_name}])")
                schema_result = await db.execute(schema_query)
                columns = [row[1] for row in schema_result.fetchall()]  # Column names
                
                if columns:
                    # Get sample data
                    sample_query = text(f"SELECT * FROM [{table_name}] LIMIT :limit")
                    sample_result = await db.execute(sample_query, {"limit": sample_limit})
                    rows = sample_result.fetchall()
                    
                    sample_data = {
                        "table_name": table_name,
                        "columns": columns,
                        "rows": [
                            {columns[i]: (str(row[i])[:200] + "..." if row[i] and len(str(row[i])) > 200 else row[i]) 
                             for i in range(len(columns))}
                            for row in rows
                        ],
                        "total_columns": len(columns),
                        "sample_count": len(rows),
                        "note": f"Showing first {len(rows)} rows of {table_name}"
                    }
                else:
                    sample_data = {"error": "Could not retrieve table schema"}
                    
            except Exception as e:
                sample_data = {"error": f"Could not retrieve sample data: {str(e)}"}
        
        # Add FTS5 explanation
        fts_explanation = {
            "what_is_fts5": "FTS5 is SQLite's full-text search extension that creates inverted indexes for fast text searching.",
            "why_multiple_tables": "Each FTS5 virtual table creates several real tables: _content (searchable text), _data (inverted index), _config (settings), _docsize (document sizes for ranking), and _idx (index metadata).",
            "storage_overhead": "FTS5 typically uses 30-50% additional storage compared to original data for fast search capabilities.",
            "performance_benefit": "Enables sub-second full-text search across large document collections using advanced algorithms like BM25 ranking.",
            "automatic_maintenance": "SQLite automatically maintains these tables when you insert, update, or delete documents."
        }
        
        return {
            "fts_groups": fts_groups,
            "all_fts_tables": all_fts_tables,
            "total_fts_tables": len(all_fts_tables),
            "sample_data": sample_data,
            "fts_explanation": fts_explanation,
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "requested_table": table_name,
            "sample_limit": sample_limit
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting FTS table details: {str(e)}")

@router.get("/database/diary-tables")
async def get_diary_table_details(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed information about diary tables, showing structure while respecting encryption."""
    try:
        from ..models.diary import DiaryEntry, DiaryFile, DiaryDailyMetadata
        
        # Get diary entries table info with new fields
        entries_query = text("""
            SELECT COUNT(*) as total_entries,
                   COUNT(CASE WHEN title IS NOT NULL AND title != '' THEN 1 END) as entries_with_titles,
                   COUNT(CASE WHEN mood IS NOT NULL THEN 1 END) as entries_with_mood,
                   COUNT(CASE WHEN weather_code IS NOT NULL THEN 1 END) as entries_with_weather,
                   COUNT(CASE WHEN location IS NOT NULL AND location != '' THEN 1 END) as entries_with_location,
                   COUNT(CASE WHEN is_template = 1 THEN 1 END) as template_entries,
                   COUNT(CASE WHEN from_template_id IS NOT NULL THEN 1 END) as entries_from_templates,
                   COUNT(CASE WHEN EXISTS (
                        SELECT 1 FROM diary_daily_metadata dm
                        WHERE dm.created_by = diary_entries.created_by
                        AND DATE(dm.date) = DATE(diary_entries.date)
                    ) THEN 1 END) as entries_with_daily_metadata,  -- Updated to use natural date relationship
                   MIN(date) as earliest_entry,
                   MAX(date) as latest_entry,
                   COUNT(DISTINCT strftime('%Y-%m', date)) as months_with_entries,
                   COUNT(DISTINCT date) as unique_dates,
                   AVG(CASE WHEN mood IS NOT NULL THEN mood END) as avg_mood,
                   AVG(CASE WHEN content_length IS NOT NULL THEN content_length END) as avg_content_length,
                   SUM(content_length) as total_content_length
            FROM diary_entries 
            WHERE created_by = :created_by
        """)
        entries_result = await db.execute(entries_query, {"created_by": current_user.uuid})
        entries_stats = entries_result.fetchone()
        
        # Get media table info
        media_query = text("""
            SELECT COUNT(*) as total_media,
                   COUNT(DISTINCT m.diary_entry_uuid) as entries_with_media,
                   COUNT(CASE WHEN file_type = 'photo' THEN 1 END) as photos,
                   COUNT(CASE WHEN file_type = 'voice' THEN 1 END) as voice_recordings,
                   COUNT(CASE WHEN file_type = 'video' THEN 1 END) as videos,
                   SUM(file_size) as total_media_size,
                   AVG(file_size) as avg_media_size
            FROM diary_media m
            JOIN diary_entries e ON e.uuid = m.diary_entry_uuid
            WHERE e.created_by = :created_by
        """)
        media_result = await db.execute(media_query, {"created_by": current_user.uuid})
        media_stats = media_result.fetchone()
        
        # Get daily metadata table info
        daily_metadata_query = text("""
            SELECT COUNT(*) as total_snapshots,
                   COUNT(DISTINCT date) as unique_dates,
                   COUNT(CASE WHEN nepali_date IS NOT NULL THEN 1 END) as snapshots_with_nepali_date,
                   MIN(date) as earliest_snapshot,
                   MAX(date) as latest_snapshot,
                   COUNT(DISTINCT strftime('%Y-%m', date)) as months_with_snapshots
            FROM diary_daily_metadata
            WHERE created_by = :created_by
        """)
        daily_metadata_result = await db.execute(daily_metadata_query, {"created_by": current_user.uuid})
        daily_metadata_stats = daily_metadata_result.fetchone()
        
        # Get sample entries (structure only, no decryption)
        sample_query = text("""
            SELECT uuid, date, title, mood, weather_code, location, is_template,
                   from_template_id, content_length, created_at,
                   LENGTH(content_file_path) as content_file_path_length,
                   encryption_iv, file_hash
            FROM diary_entries
            WHERE created_by = :created_by
            ORDER BY created_at DESC
            LIMIT :limit
        """)
        sample_result = await db.execute(sample_query, {"created_by": current_user.uuid, "limit": 5})
        sample_entries = []
        
        weather_labels = {0: "Clear", 1: "Partly Cloudy", 2: "Cloudy", 3: "Rain", 4: "Storm", 5: "Snow", 6: "Scorching Sun"}
        
        for m in sample_result.mappings():
            sample_entries.append({
                "uuid": m["uuid"],
                "date": str(m["date"]),
                "title": m["title"] or "[No Title]",
                "mood": m["mood"],
                "weather_code": m["weather_code"],
                "weather_label": weather_labels.get(m["weather_code"], "Unknown") if m["weather_code"] is not None else None,
                "location": m["location"],
                "is_template": bool(m["is_template"]),
                "from_template_id": m["from_template_id"],
                "content_length": m["content_length"],
                "created_at": str(m["created_at"]),
                "content_file_info": {
                    "has_file_path": (m["content_file_path_length"] or 0) > 0,
                    "path_length": m["content_file_path_length"]
                },
                "encryption_metadata": {
                    "has_iv": m["encryption_iv"] is not None,
                    "has_file_hash": m["file_hash"] is not None
                }
            })
        
        # Get sample media entries
        sample_media_query = text("""
            SELECT m.uuid, m.diary_entry_uuid, m.mime_type, m.file_size, m.file_type,
                   m.created_at,
                   LENGTH(m.filename) as filename_length,
                   LENGTH(m.file_path) as filepath_length
            FROM diary_media m
            JOIN diary_entries e ON e.uuid = m.diary_entry_uuid
            WHERE e.created_by = :created_by
            ORDER BY created_at DESC
            LIMIT 3
        """)
        sample_media_result = await db.execute(sample_media_query, {"created_by": current_user.uuid})
        sample_media = []
        
        for row in sample_media_result:
            sample_media.append({
                "uuid": row[0],
                "diary_entry_uuid": row[1],
                "mime_type": row[2],
                "size_mb": round((row[3] or 0) / (1024 * 1024), 2),
                "file_type": row[4],
                "created_at": str(row[5]),
                "file_path_lengths": {
                    "filename_length": row[6],
                    "filepath_length": row[7]
                }
            })
        
        # Check for FTS tables related to diary
        fts_diary_query = text("""
            SELECT name, sql FROM sqlite_master 
            WHERE type = 'table' AND name LIKE 'fts_%diary%'
            ORDER BY name
        """)
        fts_result = await db.execute(fts_diary_query)
        fts_tables = [{"name": row[0], "sql": row[1]} for row in fts_result]
        
        return {
            "diary_entries": {
                "total_entries": entries_stats[0] if entries_stats else 0,
                "entries_with_titles": entries_stats[1] if entries_stats else 0,
                "entries_with_mood": entries_stats[2] if entries_stats else 0,
                "entries_with_weather": entries_stats[3] if entries_stats else 0,
                "entries_with_location": entries_stats[4] if entries_stats else 0,
                "template_entries": entries_stats[5] if entries_stats else 0,
                "entries_from_templates": entries_stats[6] if entries_stats else 0,
                "entries_with_daily_metadata": entries_stats[7] if entries_stats else 0,
                "date_range": {
                    "earliest": str(entries_stats[8]) if entries_stats and entries_stats[8] else None,
                    "latest": str(entries_stats[9]) if entries_stats and entries_stats[9] else None
                },
                "months_with_entries": entries_stats[10] if entries_stats else 0,
                "unique_dates": entries_stats[11] if entries_stats else 0,
                "average_mood": round(entries_stats[12], 2) if entries_stats and entries_stats[12] else None,
                "average_content_length": round(entries_stats[13], 2) if entries_stats and entries_stats[13] else None,
                "total_content_length": entries_stats[14] if entries_stats else 0
            },
            "diary_daily_metadata": {
                "total_snapshots": daily_metadata_stats[0] if daily_metadata_stats else 0,
                "unique_dates": daily_metadata_stats[1] if daily_metadata_stats else 0,
                "snapshots_with_nepali_date": daily_metadata_stats[2] if daily_metadata_stats else 0,
                "date_range": {
                    "earliest": str(daily_metadata_stats[3]) if daily_metadata_stats and daily_metadata_stats[3] else None,
                    "latest": str(daily_metadata_stats[4]) if daily_metadata_stats and daily_metadata_stats[4] else None
                },
                "months_with_snapshots": daily_metadata_stats[5] if daily_metadata_stats else 0
            },
            "diary_media": {
                "total_media": media_stats[0] if media_stats else 0,
                "entries_with_media": media_stats[1] if media_stats else 0,
                "media_breakdown": {
                    "photos": media_stats[2] if media_stats else 0,
                    "voice_recordings": media_stats[3] if media_stats else 0,
                    "videos": media_stats[4] if media_stats else 0
                },
                "storage": {
                    "total_size_mb": round(media_stats[5] / (1024 * 1024), 2) if media_stats and media_stats[5] else 0,
                    "average_size_mb": round(media_stats[6] / (1024 * 1024), 2) if media_stats and media_stats[6] else 0
                },
                "media_with_duration": media_stats[7] if media_stats else 0
            },
            "sample_entries": sample_entries,
            "sample_media": sample_media,
            "fts_tables": fts_tables,
            "encryption_note": {
                "content_security": "Entry content is client-side encrypted and cannot be viewed in backend testing",
                "observable_data": "We can see metadata, structure, dates, moods, and file counts but not actual content",
                "privacy_preserved": "This ensures your diary remains private even during system testing"
            },
            "table_structure": {
                "diary_entries_columns": ["uuid","title","date","mood","weather_code","location","media_count","content_length","content_file_path","file_hash","encryption_iv","encryption_tag","is_favorite","is_template","from_template_id","created_by","created_at","updated_at","is_deleted"],
                "diary_media_columns": ["uuid","diary_entry_uuid","filename","file_path","mime_type","file_size","file_type","description","display_order","created_at","updated_at","is_deleted"],
                "diary_daily_metadata_columns": ["uuid","created_by","date","nepali_date","day_of_week","metrics_json","created_at","updated_at"]
            },
            "weather_code_mapping": {
                "0": "Clear",
                "1": "Partly Cloudy",
                "2": "Cloudy",
                "3": "Rain",
                "4": "Storm",
                "5": "Snow",
                "6": "Scorching Sun"
            },
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing diary tables: {str(e)}")

@router.get("/auth/session-status")
async def get_session_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current session status and timing information for testing session extension."""
    try:
        from ..models.user import Session
        from datetime import datetime, timedelta
from app.config import nepal_now
        
        # Get current user's active session
        session_result = await db.execute(
            select(Session)
            .where(Session.created_by == current_user.uuid)
            .where(Session.expires_at > nepal_now())
            .order_by(Session.expires_at.desc())
            .limit(1)
        )
        session = session_result.scalar_one_or_none()
        
        if not session:
            return {
                "status": "no_active_session",
                "message": "No active session found",
                "created_by": current_user.uuid,
                "timestamp": nepal_now().isoformat()
            }
        
        now = nepal_now()
        time_until_expiry = session.expires_at - now
        time_since_created = now - session.created_at
        time_since_activity = now - session.last_activity if session.last_activity else None
        
        # Calculate if session was recently extended (within last 10 seconds)
        recently_extended = False
        if session.last_activity:
            seconds_since_activity = (now - session.last_activity).total_seconds()
            recently_extended = seconds_since_activity < 10
        
        return {
            "status": "active_session",
            "session_info": {
                "session_token": session.session_token[:8] + "...",  # Only show first 8 chars for security
                "created_at": session.created_at.isoformat(),
                "expires_at": session.expires_at.isoformat(),
                "last_activity": session.last_activity.isoformat() if session.last_activity else None,
                "ip_address": session.ip_address,
            },
            "timing_analysis": {
                "time_until_expiry_hours": round(time_until_expiry.total_seconds() / 3600, 2),
                "time_since_created_hours": round(time_since_created.total_seconds() / 3600, 2),
                "time_since_activity_seconds": round(time_since_activity.total_seconds(), 2) if time_since_activity else None,
                "recently_extended": recently_extended,
                "extension_working": recently_extended  # This should be True if session extension is working
            },
            "session_health": {
                "is_valid": time_until_expiry.total_seconds() > 0,
                "expires_in_hours": round(time_until_expiry.total_seconds() / 3600, 2),
                "extension_behavior": "Sessions should extend by 7 days on each API call",
                "test_result": "PASS" if recently_extended else "MIGHT_NEED_INVESTIGATION"
            },
            "user_info": {
                "created_by": current_user.uuid,
                "username": current_user.username,
                "is_active": current_user.is_active
            },
            "timestamp": now.isoformat(),
            "note": "Call this endpoint twice in quick succession to verify session extension is working"
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "message": "Failed to analyze session status",
            "timestamp": nepal_now().isoformat()
        }

@router.get("/health")
async def basic_health_check():
    """Basic health check without authentication requirement."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(NEPAL_TZ).isoformat(),
        "message": "Testing router is accessible"
    }

@router.get("/auth-debug")
async def auth_debug_check():
    """Debug authentication status without requiring authentication."""
    return {
        "status": "accessible",
        "message": "This endpoint is accessible without authentication",
        "timestamp": datetime.now(NEPAL_TZ).isoformat(),
        "note": "Use this to test if the testing router is working"
    }

@router.get("/check-users")
async def check_users_debug(db: AsyncSession = Depends(get_db)):
    """Debug endpoint to check if there are users in the database."""
    try:
        result = await db.execute(select(func.count()).select_from(User))
        user_count = result.scalar()
        
        if user_count > 0:
            # Get first user for debugging
            user_result = await db.execute(select(User).limit(1))
            first_user = user_result.scalar_one_or_none()
            
            return {
                "status": "users_found",
                "user_count": user_count,
                "first_user": {
                    "uuid": first_user.uuid,
                    "username": first_user.username,
                    "created_at": first_user.created_at.isoformat() if first_user.created_at else None
                } if first_user else None,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        else:
            return {
                "status": "no_users",
                "user_count": 0,
                "message": "No users found in database. Please create a user account first.",
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
            
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

@router.post("/crud/full-test")
async def full_crud_test(
    modules: str = Form("notes,documents,todos,archive"),
    cleanup: bool = Form(True),
    verbose: bool = Form(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Comprehensive CRUD testing across selected modules with safe test data and unique identifiers."""
    
    # Parse modules list
    available_modules = ["notes", "documents", "todos", "archive"]
    selected_modules = [m.strip() for m in modules.split(",") if m.strip() in available_modules]
    
    if not selected_modules:
        raise HTTPException(status_code=400, detail=f"No valid modules selected. Available: {', '.join(available_modules)}")
    
    results = {
        "modules_tested": [],
        "selected_modules": selected_modules,
        "cleanup_enabled": cleanup,
        "verbose": verbose,
        "overall_status": "unknown",
        "test_summary": {},
        "global_messages": [],
        "timestamp": datetime.now(NEPAL_TZ).isoformat()
    }
    
    def add_global_message(msg: str):
        """Add timestamped global message."""
        timestamped_msg = f"[{datetime.now().strftime('%H:%M:%S.%f')[:-3]}] {msg}"
        results["global_messages"].append(timestamped_msg)
        if verbose:
            logger.info(f"CRUD Test: {timestamped_msg}")
    
    test_data_cleanup = []  # Track created items for cleanup
    
    try:
        add_global_message(f"STARTING: Starting CRUD tests for modules: {', '.join(selected_modules)}")
        add_global_message(f"CLEANUP: Cleanup after tests: {'enabled' if cleanup else 'disabled'}")
        
        # Test each selected module
        if "notes" in selected_modules:
            add_global_message("INFO: Testing Notes module...")
            note_results = await _test_notes_crud(db, current_user, test_data_cleanup, verbose)
            results["modules_tested"].append("notes")
            results["test_summary"]["notes"] = note_results
            add_global_message(f"INFO: Notes testing completed: {note_results.get('status', 'unknown')}")
        
        if "documents" in selected_modules:
            add_global_message("DOCUMENT: Testing Documents module...")
            doc_results = await _test_documents_crud(db, current_user, test_data_cleanup, verbose)
            results["modules_tested"].append("documents")
            results["test_summary"]["documents"] = doc_results
            add_global_message(f"DOCUMENT: Documents testing completed: {doc_results.get('status', 'unknown')}")
        
        if "todos" in selected_modules:
            add_global_message("SUCCESS: Testing Todos module...")
            todo_results = await _test_todos_crud(db, current_user, test_data_cleanup, verbose)
            results["modules_tested"].append("todos")
            results["test_summary"]["todos"] = todo_results
            add_global_message(f"SUCCESS: Todos testing completed: {todo_results.get('status', 'unknown')}")
        
        if "archive" in selected_modules:
            add_global_message("FILE: Testing Archive module...")
            archive_results = await _test_archive_crud(db, current_user, test_data_cleanup, verbose)
            results["modules_tested"].append("archive")
            results["test_summary"]["archive"] = archive_results
            add_global_message(f"FILE: Archive testing completed: {archive_results.get('status', 'unknown')}")
        
        # Calculate overall status - Count all individual operations, not just modules
        all_tests = []
        for module_results in results["test_summary"].values():
            all_tests.extend(module_results.get("operations", {}).values())
        
        passed_tests = sum(1 for test in all_tests if test.get("status") == "success")
        total_tests = len(all_tests)
        
        if passed_tests == total_tests:
            results["overall_status"] = "all_passed"
            add_global_message(f"COMPLETED: ALL TESTS PASSED: {passed_tests}/{total_tests}")
        elif passed_tests > total_tests * 0.8:
            results["overall_status"] = "mostly_passed"
            add_global_message(f"WARNING: MOSTLY PASSED: {passed_tests}/{total_tests} (warning threshold)")
        elif passed_tests > 0:
            results["overall_status"] = "partial_failure"
            add_global_message(f"ERROR: PARTIAL FAILURE: {passed_tests}/{total_tests}")
        else:
            results["overall_status"] = "failed"
            add_global_message(f"CRITICAL: ALL TESTS FAILED: {passed_tests}/{total_tests}")
        
        results["test_counts"] = {
            "total_tests": total_tests,
            "passed": passed_tests,
            "failed": total_tests - passed_tests,
            "success_rate": round((passed_tests / total_tests) * 100, 1) if total_tests > 0 else 0
        }
        
        # Cleanup phase
        if cleanup:
            add_global_message(f"CLEANUP: Starting cleanup of {len(test_data_cleanup)} test items...")
            cleanup_results = await _cleanup_test_data(db, test_data_cleanup, verbose)
            results["cleanup_performed"] = True
            results["cleanup_summary"] = cleanup_results
            add_global_message(f"CLEANUP: Cleanup completed: {cleanup_results.get('cleaned_count', 0)} items removed")
        else:
            add_global_message(f"WARNING: Cleanup skipped - {len(test_data_cleanup)} test items remain in database")
            results["cleanup_performed"] = False
            results["cleanup_summary"] = {
                "status": "skipped",
                "items_left": len(test_data_cleanup),
                "note": "Test data remains in database - manual cleanup may be required"
            }
        
    except Exception as e:
        results["overall_status"] = "error"
        results["error"] = str(e)
        add_global_message(f"CRITICAL: CRITICAL ERROR: {str(e)}")
        
        # Emergency cleanup if enabled
        if cleanup and test_data_cleanup:
            try:
                add_global_message("WARNING: Attempting emergency cleanup...")
                await _cleanup_test_data(db, test_data_cleanup, verbose)
                add_global_message("WARNING: Emergency cleanup completed")
            except Exception as cleanup_error:
                add_global_message(f"WARNING: Emergency cleanup failed: {str(cleanup_error)}")
    
    add_global_message(f"INFO: CRUD testing completed with overall status: {results['overall_status']}")
    return results

@router.post("/database/diary-migration")
async def run_diary_migration(
    backup: bool = Form(True, description="Create database backup before migration"),
    force: bool = Form(False, description="Force migration even if already applied"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Run the diary schema migration to convert from blob-based to file-based storage."""
    
    migration_log = []
    
    def log_message(msg: str, level: str = "info"):
        timestamped_msg = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
        migration_log.append({"timestamp": datetime.now(NEPAL_TZ).isoformat(), "level": level, "message": msg})
        logger.info(f"Migration: {timestamped_msg}")
    
    try:
        from pathlib import Path
        import sys
        
        # Add scripts directory to path
        scripts_dir = Path(__file__).parent.parent.parent / "scripts"
        sys.path.insert(0, str(scripts_dir))
        
        from migrate_diary_schema import DiaryMigration
        
        log_message("STARTING: Starting diary schema migration from web interface", "info")
        log_message(f"Settings: backup={backup}, force={force}", "info")
        
        # Create migration instance
        migration = DiaryMigration(backup=backup, force=force)
        
        # Check current schema first
        log_message("SEARCH: Checking current database schema...", "info")
        result = await db.execute(text("PRAGMA table_info(users)"))
        user_columns = [row[1] for row in result.fetchall()]
        
        if 'diary_password_hash' in user_columns and not force:
            log_message("WARNING: Migration appears to already be applied!", "warning")
            return {
                "status": "already_applied", 
                "message": "Migration appears to already be applied. Use force=true to run anyway.",
                "log": migration_log,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }
        
        # Create backup if requested
        if backup:
            log_message("STORAGE: Creating database backup...", "info")
            try:
                data_dir = get_data_dir()
                backup_dir = data_dir / "backups"
                backup_dir.mkdir(exist_ok=True)
                
                migration_id = datetime.now(NEPAL_TZ).strftime("%Y%m%d_%H%M%S")
                backup_name = f"pkm_metadata_backup_diary_migration_{migration_id}.db"
                backup_path = backup_dir / backup_name
                
                await db.execute(text(f"VACUUM INTO '{backup_path}'"))
                log_message(f"SUCCESS: Backup created: {backup_name}", "info")
                
            except Exception as e:
                log_message(f"ERROR: Backup creation failed: {str(e)}", "error")
                raise
        
        # Apply schema changes
        log_message("FIXED: Applying schema changes...", "info")
        
        # Add new columns to users table
        try:
            await db.execute(text("ALTER TABLE users ADD COLUMN diary_password_hash TEXT;"))
            log_message("  SUCCESS: Added diary_password_hash column to users table", "info")
        except Exception as e:
            if "duplicate column name" not in str(e).lower():
                raise
            log_message("  INFO: diary_password_hash column already exists", "info")
        
        try:
            await db.execute(text("ALTER TABLE users ADD COLUMN diary_password_hint TEXT;"))
            log_message("  SUCCESS: Added diary_password_hint column to users table", "info")
        except Exception as e:
            if "duplicate column name" not in str(e).lower():
                raise
            log_message("  INFO: diary_password_hint column already exists", "info")
        
        # Add new columns to diary_entries table
        new_columns = [
            ("content_file_path", "TEXT"),
            ("file_hash", "TEXT"),
            ("day_of_week", "INTEGER"),
            ("media_count", "INTEGER DEFAULT 0")
        ]
        
        for col_name, col_type in new_columns:
            try:
                await db.execute(text(f"ALTER TABLE diary_entries ADD COLUMN {col_name} {col_type};"))
                log_message(f"  SUCCESS: Added {col_name} column to diary_entries table", "info")
            except Exception as e:
                if "duplicate column name" not in str(e).lower():
                    raise
                log_message(f"  INFO: {col_name} column already exists", "info")
        
        # Update day_of_week for existing entries
        log_message("DATE: Calculating day_of_week for existing entries...", "info")
        result = await db.execute(text("SELECT id, date FROM diary_entries WHERE day_of_week IS NULL"))
        entries = result.fetchall()
        
        for entry_id, entry_date in entries:
            if entry_date:
                try:
                    if isinstance(entry_date, str):
                        parsed_date = datetime.fromisoformat(entry_date.replace('Z', '+00:00')).date()
                    else:
                        parsed_date = entry_date.date() if hasattr(entry_date, 'date') else entry_date
                    
                    day_of_week = parsed_date.weekday()  # 0=Monday, 6=Sunday
                    
                    await db.execute(text("UPDATE diary_entries SET day_of_week = :dow WHERE id = :id"), 
                                   {"dow": day_of_week, "id": entry_id})
                except Exception as e:
                    log_message(f"  WARNING: Failed to update day_of_week for entry {entry_id}: {e}", "warning")
        
        # Update media_count for existing entries
        log_message("MEDIA: Calculating media_count for existing entries...", "info")
        await db.execute(text("""
            UPDATE diary_entries
            SET media_count = (
                SELECT COUNT(*)
                FROM diary_media
                WHERE diary_media.diary_entry_uuid = diary_entries.uuid
            )
            WHERE media_count IS NULL OR media_count = 0
        """))
        
        # Migrate existing diary data to files
        log_message("MIGRATION: No legacy data migration needed - using current file-based storage", "info")
        
        # Get entries that still have encrypted_blob but no content_file_path
        # Prefer uuid where present; fall back to legacy id
        # Note: encrypted_blob may exist only on legacy rows.
        result = await db.execute(text("""
            SELECT
                COALESCE(uuid, CAST(id AS TEXT)) AS entry_key,
                encrypted_blob, encryption_iv, encryption_tag, date
            FROM diary_entries
            WHERE encrypted_blob IS NOT NULL
              AND (content_file_path IS NULL OR content_file_path = '')
        """))
        entries_to_migrate = result.fetchall()
        
        log_message(f"  SEARCH: Found {len(entries_to_migrate)} entries to migrate", "info")
        
        if entries_to_migrate:
            # Create directory structure
            from app.utils.diary_encryption import write_encrypted_file, compute_sha256
            
            secure_dir = get_data_dir() / "secure" / "entries" / "text"
            secure_dir.mkdir(parents=True, exist_ok=True)
            
            migrated_count = 0
            for entry in entries_to_migrate:
                entry_key, encrypted_blob, iv, tag, entry_date = entry
                
                try:
                    # Parse date for filename
                    if isinstance(entry_date, str):
                        parsed_date = datetime.fromisoformat(entry_date.replace('Z', '+00:00')).date()
                    else:
                        parsed_date = entry_date.date() if hasattr(entry_date, 'date') else entry_date
                    
                    # Generate readable filename
                    date_str = parsed_date.strftime("%Y-%m-%d")
                    filename = f"{date_str}_diary_{entry_key}.dat"
                    file_path = secure_dir / filename
                    
                    # Write encrypted data to file using the new format
                    file_info = write_encrypted_file(
                        dest_path=file_path,
                        iv_b64=iv,
                        encrypted_blob_b64=encrypted_blob,
                        original_extension=""  # Empty for diary text
                    )
                    
                    # Calculate file hash
                    file_hash = compute_sha256(file_path)
                    
                    # Update database record
                    await db.execute(text("""
                        UPDATE diary_entries 
                        SET content_file_path = :path, file_hash = :hash
                        WHERE id = :id
                    """), {
                        "path": str(file_path),
                        "hash": file_hash,
                        "id": entry_id
                    })
                    
                    migrated_count += 1
                    
                    if migrated_count % 5 == 0:
                        log_message(f"  INFO: Migrated {migrated_count}/{len(entries_to_migrate)} entries...", "info")
                        
                except Exception as e:
                    log_message(f"  WARNING: Failed to migrate entry {entry_id}: {e}", "warning")
                    continue
            
            log_message(f"SUCCESS: Successfully migrated {migrated_count} diary entries", "info")
        
        await db.commit()
        
        # Verify migration
        log_message("SEARCH: Verifying migration...", "info")
        
        # Check if all required columns exist
        result = await db.execute(text("PRAGMA table_info(users)"))
        user_columns = [row[1] for row in result.fetchall()]
        
        required_user_columns = ['diary_password_hash', 'diary_password_hint']
        for col in required_user_columns:
            if col not in user_columns:
                raise Exception(f"Required column {col} not found in users table")
        
        result = await db.execute(text("PRAGMA table_info(diary_entries)"))
        diary_columns = [row[1] for row in result.fetchall()]
        
        required_diary_columns = ['content_file_path', 'file_hash', 'day_of_week', 'media_count']
        for col in required_diary_columns:
            if col not in diary_columns:
                raise Exception(f"Required column {col} not found in diary_entries table")
        
        log_message("SUCCESS: Schema verification passed", "info")
        
        # Check data integrity
        result = await db.execute(text("""
            SELECT COUNT(*) FROM diary_entries 
            WHERE content_file_path IS NOT NULL AND file_hash IS NOT NULL
        """))
        migrated_entries = result.scalar()
        
        result = await db.execute(text("SELECT COUNT(*) FROM diary_entries"))
        total_entries = result.scalar()
        
        log_message(f"STATS: {migrated_entries}/{total_entries} entries have file-based storage", "info")
        log_message("COMPLETED: Migration completed successfully!", "info")
        log_message("STARTING: Diary module is now using file-based encryption!", "info")
        
        return {
            "status": "success",
            "message": "Diary schema migration completed successfully",
            "migration_stats": {
                "total_entries": total_entries,
                "migrated_entries": migrated_entries,
                "backup_created": backup
            },
            "log": migration_log,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }
        
    except Exception as e:
        log_message(f"ERROR: Migration failed: {str(e)}", "error")
        await db.rollback()
        
        return {
            "status": "error",
            "message": f"Migration failed: {str(e)}",
            "log": migration_log,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

# ==============================================================================
# Helper functions for CRUD testing
# ==============================================================================