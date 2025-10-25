"""
Enhanced Database Testing and Diagnostics Router for PKMS Backend

Provides comprehensive database testing endpoints including:
- Schema analysis with all recent changes
- Association table statistics
- FTS5 table analysis
- Data integrity validation
- Migration status checking
- Performance metrics
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, select, inspect
from typing import Dict, List, Any, Optional
from datetime import datetime
import json
import time
import logging
import os
from pathlib import Path

# Set up logger
logger = logging.getLogger(__name__)

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo
from app.models.project import Project
from app.models.diary import DiaryEntry, DiaryDailyMetadata
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import Tag
from app.models.associations import (
    note_documents, document_diary, todo_dependencies, project_items
)

from app.config import NEPAL_TZ, get_data_dir
from app.schemas.testing import DatabaseStatsResponse, TableSchemaResponse, SampleRowsResponse, FtsTablesDataResponse

router = APIRouter(prefix="/testing/database", tags=["testing-database-enhanced"])


@router.get("/comprehensive-stats", response_model=DatabaseStatsResponse)
async def get_comprehensive_database_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive database statistics including all recent changes."""
    try:
        start_time = time.time()
        stats = {}
        
        # Core tables with user filtering
        core_tables = [
            ("users", User, False),  # No user filtering for users table
            ("notes", Note, True),
            ("documents", Document, True),
            ("todos", Todo, True),
            ("projects", Project, True),
            ("diary_entries", DiaryEntry, True),
            ("diary_daily_metadata", DiaryDailyMetadata, True),
            ("archive_folders", ArchiveFolder, True),
            ("archive_items", ArchiveItem, True),
            ("tags", Tag, True)
        ]
        
        # Association tables (no user filtering needed)
        association_tables = [
            ("note_documents", note_documents),
            ("document_diary", document_diary),
            ("todo_dependencies", todo_dependencies),
            ("project_items", project_items)
        ]
        
        # Get counts for core tables
        for table_name, model, filter_by_user in core_tables:
            try:
                if filter_by_user:
                    result = await db.execute(
                        select(func.count()).select_from(model).where(model.created_by == current_user.uuid)
                    )
                else:
                    result = await db.execute(select(func.count()).select_from(model))
                count = result.scalar()
                stats[f"{table_name}_count"] = count
                
                # Get size information
                await _get_table_size_info(db, table_name, stats)
                
            except Exception as e:
                logger.exception("Error getting stats for %s", table_name)
                stats[f"{table_name}_count"] = 0
                stats[f"{table_name}_size_bytes"] = 0
                stats[f"{table_name}_size_kb"] = 0
        
        # Get counts for association tables
        for table_name, table in association_tables:
            try:
                result = await db.execute(select(func.count()).select_from(table))
                count = result.scalar()
                stats[f"{table_name}_count"] = count
                
                # Get size information
                await _get_table_size_info(db, table_name, stats)
                
            except Exception as e:
                logger.exception("Error getting stats for %s", table_name)
                stats[f"{table_name}_count"] = 0
                stats[f"{table_name}_size_bytes"] = 0
                stats[f"{table_name}_size_kb"] = 0
        
        # FTS5 table analysis
        await _analyze_fts_tables(db, stats)
        
        # Database file information
        await _get_database_file_info(stats)
        
        # SQLite performance metrics
        await _get_sqlite_metrics(db, stats)
        
        # Data integrity checks
        await _check_data_integrity(db, current_user.uuid, stats)
        
        # Migration status
        await _check_migration_status(db, stats)
        
        # Calculate total time
        processing_time = time.time() - start_time
        stats["processing_time_seconds"] = round(processing_time, 3)
        
        return DatabaseStatsResponse(
            status="success",
            statistics=stats,
            userUuid=current_user.uuid,
            timestamp=datetime.now(NEPAL_TZ).isoformat()
        )
        
    except Exception as e:
        logger.exception("Error getting comprehensive database stats")
        raise HTTPException(status_code=500, detail=f"Failed to get database statistics: {e!s}") from e


async def _get_table_size_info(db: AsyncSession, table_name: str, stats: dict[str, Any]) -> None:
    """Get detailed size information for a table."""
    try:
        # Get row count
        count_query = text(f"SELECT COUNT(*) FROM {table_name}")
        count_result = await db.execute(count_query)
        row_count = count_result.scalar()
        
        # Estimate size based on row count and average row size
        estimated_size = row_count * 200  # Rough estimate: 200 bytes per row
        stats[f"{table_name}_estimated_size_bytes"] = estimated_size
        stats[f"{table_name}_estimated_size_kb"] = round(estimated_size / 1024, 2)
        stats[f"{table_name}_estimated_size_mb"] = round(estimated_size / (1024 * 1024), 2)
        
    except Exception as e:
        logger.warning(f"Could not get size info for {table_name}: {type(e).__name__}")
        stats[f"{table_name}_estimated_size_bytes"] = 0
        stats[f"{table_name}_estimated_size_kb"] = 0
        stats[f"{table_name}_estimated_size_mb"] = 0


async def _analyze_fts_tables(db: AsyncSession, stats: dict[str, Any]) -> None:
    """Analyze FTS5 tables and their performance."""
    try:
        # Get all FTS tables
        fts_query = text("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND sql LIKE '%USING fts5%'
        """)
        fts_result = await db.execute(fts_query)
        fts_tables = [row[0] for row in fts_result.fetchall()]
        
        stats["fts_tables_count"] = len(fts_tables)
        stats["fts_tables_list"] = fts_tables
        
        # Analyze each FTS table
        for fts_table in fts_tables:
            try:
                # Get FTS table info
                info_query = text(f"SELECT * FROM {fts_table}_data LIMIT 1")
                await db.execute(info_query)
                stats[f"{fts_table}_has_data"] = True
            except:
                stats[f"{fts_table}_has_data"] = False
                
    except Exception as e:
        logger.warning(f"Could not analyze FTS tables: {type(e).__name__}")
        stats["fts_tables_count"] = 0
        stats["fts_tables_list"] = []


async def _get_database_file_info(stats: dict[str, Any]) -> None:
    """Get database file size and location information."""
    try:
        db_path = get_data_dir() / "pkm_metadata.db"
        if db_path.exists():
            file_size = os.path.getsize(db_path)
            stats["database_file_size_bytes"] = file_size
            stats["database_file_size_kb"] = round(file_size / 1024, 2)
            stats["database_file_size_mb"] = round(file_size / (1024 * 1024), 2)
            stats["database_file_path"] = str(db_path)
        else:
            stats["database_file_size_bytes"] = 0
            stats["database_file_size_kb"] = 0
            stats["database_file_size_mb"] = 0
            stats["database_file_path"] = "Not found"
    except Exception as e:
        logger.warning(f"Could not get database file info: {type(e).__name__}")
        stats["database_file_size_bytes"] = 0


async def _get_sqlite_metrics(db: AsyncSession, stats: dict[str, Any]) -> None:
    """Get SQLite performance metrics."""
    try:
        # Page count and size
        page_count_query = text("PRAGMA page_count()")
        page_count_result = await db.execute(page_count_query)
        page_count = page_count_result.scalar()
        
        page_size_query = text("PRAGMA page_size()")
        page_size_result = await db.execute(page_size_query)
        page_size = page_size_result.scalar()
        
        stats["sqlite_page_count"] = page_count
        stats["sqlite_page_size"] = page_size
        stats["calculated_db_size_bytes"] = page_count * page_size
        stats["calculated_db_size_kb"] = round((page_count * page_size) / 1024, 2)
        stats["calculated_db_size_mb"] = round((page_count * page_size) / (1024 * 1024), 2)
        
        # Journal mode
        journal_query = text("PRAGMA journal_mode")
        journal_result = await db.execute(journal_query)
        stats["journal_mode"] = journal_result.scalar()
        
        # WAL checkpoint info
        try:
            wal_query = text("PRAGMA wal_checkpoint(PASSIVE)")
            wal_result = await db.execute(wal_query)
            wal_info = wal_result.fetchone()
            if wal_info:
                stats["wal_checkpoint_info"] = {
                    "pages": wal_info[0],
                    "wal_size_bytes": wal_info[1],
                    "checkpointed_frames": wal_info[2]
                }
        except:
            stats["wal_checkpoint_info"] = {}
            
    except Exception as e:
        logger.warning(f"Could not get SQLite metrics: {type(e).__name__}")


async def _check_data_integrity(db: AsyncSession, user_uuid: str, stats: dict[str, Any]) -> None:
    """Check data integrity and consistency."""
    try:
        integrity_checks = {}
        
        # Check for orphaned records
        orphaned_checks = [
            ("notes_without_user", "SELECT COUNT(*) FROM notes WHERE created_by = :uid AND created_by NOT IN (SELECT uuid FROM users)"),
            ("documents_without_user", "SELECT COUNT(*) FROM documents WHERE created_by = :uid AND created_by NOT IN (SELECT uuid FROM users)"),
            ("todos_without_user", "SELECT COUNT(*) FROM todos WHERE created_by = :uid AND created_by NOT IN (SELECT uuid FROM users)"),
            ("projects_without_user", "SELECT COUNT(*) FROM projects WHERE created_by = :uid AND created_by NOT IN (SELECT uuid FROM users)")
        ]
        
        for check_name, query in orphaned_checks:
            try:
                result = await db.execute(text(query), {"uid": user_uuid})
                count = result.scalar()
                integrity_checks[check_name] = count
            except:
                integrity_checks[check_name] = -1
        
        # Check association table integrity
        association_checks = [
            ("note_documents_integrity", "SELECT COUNT(*) FROM note_documents WHERE note_uuid NOT IN (SELECT uuid FROM notes) OR document_uuid NOT IN (SELECT uuid FROM documents)"),
            ("document_diary_integrity", "SELECT COUNT(*) FROM document_diary WHERE document_uuid NOT IN (SELECT uuid FROM documents) OR diary_entry_uuid NOT IN (SELECT uuid FROM diary_entries)"),
            ("project_items_integrity", "SELECT COUNT(*) FROM project_items WHERE project_uuid NOT IN (SELECT uuid FROM projects)")
        ]
        
        for check_name, query in association_checks:
            try:
                result = await db.execute(text(query))
                count = result.scalar()
                integrity_checks[check_name] = count
            except:
                integrity_checks[check_name] = -1
        
        stats["integrity_checks"] = integrity_checks
        
    except Exception as e:
        logger.warning(f"Could not perform integrity checks: {type(e).__name__}")
        stats["integrity_checks"] = {}


async def _check_migration_status(db: AsyncSession, stats: dict[str, Any]) -> None:
    """Check migration status and schema version."""
    try:
        # Check if migration table exists
        migration_table_query = text("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='alembic_version'
        """)
        migration_result = await db.execute(migration_table_query)
        migration_table_exists = migration_result.fetchone() is not None
        
        stats["migration_table_exists"] = migration_table_exists
        
        if migration_table_exists:
            # Get current migration version
            version_query = text("SELECT version_num FROM alembic_version")
            version_result = await db.execute(version_query)
            version = version_result.scalar()
            stats["current_migration_version"] = version
        else:
            stats["current_migration_version"] = "No migration table"
            
    except Exception as e:
        logger.warning(f"Could not check migration status: {type(e).__name__}")
        stats["migration_table_exists"] = False
        stats["current_migration_version"] = "Unknown"


@router.get("/table-analysis/{table_name}", response_model=TableSchemaResponse)
async def get_detailed_table_analysis(
    table_name: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed analysis of a specific table."""
    try:
        # Validate table name exists to prevent SQL injection
        validation_query = text("SELECT name FROM sqlite_master WHERE type='table' AND name = :table_name")
        validation_result = await db.execute(validation_query, {"table_name": table_name})
        if not validation_result.fetchone():
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
        
        # Get table schema
        schema_query = text(f"PRAGMA table_info({table_name})")
        schema_result = await db.execute(schema_query)
        columns = schema_result.fetchall()
        
        # Get row count
        count_query = text(f"SELECT COUNT(*) FROM {table_name}")
        count_result = await db.execute(count_query)
        row_count = count_result.scalar()
        
        # Get size information
        size_info = await _get_detailed_table_size(db, table_name)
        
        # Format columns
        formatted_columns = []
        for col in columns:
            formatted_columns.append({
                "columnId": col[0],
                "name": col[1],
                "type": col[2],
                "notNull": bool(col[3]),
                "defaultValue": col[4],
                "primaryKey": bool(col[5])
            })
        
        return TableSchemaResponse(
            table=table_name,
            columnCount=len(columns),
            columns=formatted_columns,
            rowCount=row_count,
            sizeInfo=size_info,
            timestamp=datetime.now(NEPAL_TZ).isoformat()
        )
        
    except Exception as e:
        logger.exception("Error analyzing table %s", table_name)
        raise HTTPException(status_code=500, detail=f"Failed to analyze table: {e!s}") from e


async def _get_detailed_table_size(db: AsyncSession, table_name: str) -> dict[str, Any]:
    """Get detailed size information for a table."""
    try:
        # Get row count
        count_query = text(f"SELECT COUNT(*) FROM {table_name}")
        count_result = await db.execute(count_query)
        row_count = count_result.scalar()
        
        # Estimate size
        estimated_size = row_count * 200  # Rough estimate
        
        return {
            "sizeBytes": estimated_size,
            "sizeMb": round(estimated_size / (1024 * 1024), 2),
            "pageCount": 0,  # Would need more complex calculation
            "pageSize": 4096,  # Default SQLite page size
            "error": None
        }
        
    except Exception as e:
        return {
            "sizeBytes": 0,
            "sizeMb": 0,
            "pageCount": 0,
            "pageSize": 0,
            "error": str(e)
        }


@router.get("/fts-analysis", response_model=FtsTablesDataResponse)
async def get_fts_analysis(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive FTS5 table analysis."""
    try:
        # Get all FTS tables
        fts_query = text("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND sql LIKE '%USING fts5%'
        """)
        fts_result = await db.execute(fts_query)
        fts_tables = [row[0] for row in fts_result.fetchall()]
        
        # Group FTS tables by module
        fts_groups = {
            "search": {
                "tables": [t for t in fts_tables if "search" in t.lower()],
                "description": "Full-text search tables for content indexing"
            },
            "notes": {
                "tables": [t for t in fts_tables if "note" in t.lower()],
                "description": "Note content search tables"
            },
            "documents": {
                "tables": [t for t in fts_tables if "document" in t.lower()],
                "description": "Document content search tables"
            }
        }
        
        # Get sample data from FTS tables
        sample_data = {}
        for fts_table in fts_tables:
            try:
                sample_query = text(f"SELECT * FROM {fts_table} LIMIT 3")
                sample_result = await db.execute(sample_query)
                sample_rows = sample_result.fetchall()
                sample_data[fts_table] = [dict(row._mapping) for row in sample_rows]
            except:
                sample_data[fts_table] = []
        
        return FtsTablesDataResponse(
            ftsGroups=fts_groups,
            allFtsTables=fts_tables,
            totalFtsTables=len(fts_tables),
            sampleData=sample_data,
            ftsExplanation={
                "whatIsFts5": "FTS5 is SQLite's full-text search engine for fast content searching",
                "whyMultipleTables": "Different content types need separate FTS tables for optimal performance",
                "storageOverhead": "FTS tables add ~30-50% storage overhead for search capabilities",
                "performanceBenefit": "FTS5 provides sub-second search across millions of records",
                "automaticMaintenance": "SQLite automatically maintains FTS indexes during INSERT/UPDATE/DELETE"
            }
        )
        
    except Exception as e:
        logger.exception("Error analyzing FTS tables")
        raise HTTPException(status_code=500, detail=f"Failed to analyze FTS tables: {e!s}") from e


@router.get("/sample-data/{table_name}", response_model=SampleRowsResponse)
async def get_table_sample_data(
    table_name: str,
    limit: int = Query(5, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sample data from a table."""
    try:
        # Validate table name exists to prevent SQL injection
        validation_query = text("SELECT name FROM sqlite_master WHERE type='table' AND name = :table_name")
        validation_result = await db.execute(validation_query, {"table_name": table_name})
        if not validation_result.fetchone():
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
        
        # Get row count
        count_query = text(f"SELECT COUNT(*) FROM {table_name}")
        count_result = await db.execute(count_query)
        row_count = count_result.scalar()
        
        # Get sample rows
        sample_query = text(f"SELECT * FROM {table_name} LIMIT {limit}")
        sample_result = await db.execute(sample_query)
        sample_rows = sample_result.fetchall()
        
        # Convert to dictionaries
        formatted_rows = [dict(row._mapping) for row in sample_rows]
        
        return SampleRowsResponse(
            table=table_name,
            rowCount=row_count,
            sampleRows=formatted_rows,
            timestamp=datetime.now(NEPAL_TZ).isoformat()
        )
        
    except Exception as e:
        logger.exception("Error getting sample data from %s", table_name)
        raise HTTPException(status_code=500, detail=f"Failed to get sample data: {e!s}") from e
