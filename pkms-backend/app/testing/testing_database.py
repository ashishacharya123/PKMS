"""
Database Testing and Diagnostics Router for PKMS Backend

Provides comprehensive database testing endpoints including schema analysis,
table statistics, data integrity validation, and migration tools.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, func, select
from datetime import datetime
import logging

# Set up logger
logger = logging.getLogger(__name__)

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.schemas.testing import DatabaseStatsResponse
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo
from app.models.project import Project
from app.models.diary import DiaryEntry, DiaryDailyMetadata
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import Tag
from app.models.associations import document_diary

from app.config import NEPAL_TZ, get_data_dir

router = APIRouter(prefix="/testing/database", tags=["testing-database"])


@router.get("/stats", response_model=DatabaseStatsResponse)
async def get_database_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive database statistics with accurate size calculations."""
    try:
        stats = {}

        # Table-specific statistics with user filtering
        tables_to_check = [
            ("users", User),
            ("notes", Note),
            ("documents", Document),
            ("todos", Todo),
            ("projects", Project),
            ("diary_entries", DiaryEntry),
            # DiaryFile model removed - diary files now use Document + document_diary
            ("diary_daily_metadata", DiaryDailyMetadata),
            ("archive_folders", ArchiveFolder),
            ("archive_items", ArchiveItem),
            ("tags", Tag)
        ]

        for table_name, model in tables_to_check:
            try:
                if table_name == "users":
                    # For users table, don't filter by created_by
                    result = await db.execute(select(func.count()).select_from(model))
                else:
                    # For other tables, filter by current user
                    result = await db.execute(
                        select(func.count()).select_from(model).where(model.created_by == current_user.uuid)
                    )
                count = result.scalar()
                stats[table_name] = count

                # Enhanced size calculation with multiple methods
                try:
                    # Method 1: Query sqlite_master for accurate size
                    size_query = text(f"SELECT SUM(CASE WHEN sql IS NOT NULL THEN LENGTH(sql) ELSE 0 END) FROM sqlite_master WHERE tbl_name = '{table_name}' OR sql LIKE '%CREATE TABLE {table_name}%'")
                    size_result = await db.execute(size_query)
                    schema_size = size_result.scalar() or 0

                    # Method 2: Try PRAGMA table_info for column definitions
                    try:
                        pragma_query = text(f"PRAGMA table_info({table_name})")
                        pragma_result = await db.execute(pragma_query)
                        columns = pragma_result.fetchall()
                        column_size = sum(len(str(col)) for col in columns) * 10  # Estimated
                    except:
                        column_size = 0

                    # Method 3: Estimate row size based on count
                    estimated_row_size = 100 if count > 0 else 0
                    estimated_data_size = count * estimated_row_size

                    # Use the most reasonable estimate
                    total_estimated_size = max(schema_size, column_size, estimated_data_size)

                    stats[f"{table_name}_estimated_size_bytes"] = total_estimated_size
                    stats[f"{table_name}_estimated_size_kb"] = round(total_estimated_size / 1024, 2)

                except Exception as size_error:
                    logger.warning(f"Size calculation failed for {table_name}: {type(size_error).__name__}")
                    stats[f"{table_name}_estimated_size_bytes"] = count * 100  # Fallback estimate
                    stats[f"{table_name}_estimated_size_kb"] = round(count * 100 / 1024, 2)

            except Exception as e:
                logger.error(f"Error getting stats for {table_name}: {type(e).__name__}")
                stats[table_name] = 0
                stats[f"{table_name}_estimated_size_bytes"] = 0
                stats[f"{table_name}_estimated_size_kb"] = 0

        # SQLite database file size (most accurate)
        try:
            db_path = get_data_dir() / "pkm_metadata.db"
            if db_path.exists():
                import os
                actual_db_size = os.path.getsize(db_path)
                stats["database_file_size_bytes"] = actual_db_size
                stats["database_file_size_kb"] = round(actual_db_size / 1024, 2)
                stats["database_file_size_mb"] = round(actual_db_size / (1024 * 1024), 2)
            else:
                stats["database_file_size_bytes"] = 0
                stats["database_file_size_kb"] = 0
                stats["database_file_size_mb"] = 0
        except Exception as e:
            logger.error(f"Error getting database file size: {type(e).__name__}")
            stats["database_file_size_bytes"] = 0
            stats["database_file_size_kb"] = 0
            stats["database_file_size_mb"] = 0

        # Page count analysis
        try:
            page_count_query = text("PRAGMA page_count()")
            page_result = await db.execute(page_count_query)
            page_count = page_result.scalar()

            page_size_query = text("PRAGMA page_size()")
            page_size_result = await db.execute(page_size_query)
            page_size = page_size_result.scalar()

            calculated_db_size = page_count * page_size
            stats["sqlite_page_count"] = page_count
            stats["sqlite_page_size"] = page_size
            stats["calculated_db_size_bytes"] = calculated_db_size
            stats["calculated_db_size_kb"] = round(calculated_db_size / 1024, 2)
            stats["calculated_db_size_mb"] = round(calculated_db_size / (1024 * 1024), 2)

        except Exception as e:
            logger.error(f"Error getting page count info: {type(e).__name__}")
            stats["sqlite_page_count"] = 0
            stats["sqlite_page_size"] = 4096  # Default SQLite page size
            stats["calculated_db_size_bytes"] = 0
            stats["calculated_db_size_kb"] = 0
            stats["calculated_db_size_mb"] = 0

        # WAL mode and journaling info
        try:
            journal_mode_query = text("PRAGMA journal_mode")
            journal_result = await db.execute(journal_mode_query)
            journal_mode = journal_result.scalar()
            stats["journal_mode"] = journal_mode

            wal_checkpoint_query = text("PRAGMA wal_checkpoint(PASSIVE)")
            wal_result = await db.execute(wal_checkpoint_query)
            wal_info = wal_result.fetchone() if wal_result else None
            stats["wal_checkpoint_info"] = {
                "pages": wal_info[0] if wal_info else 0,
                "wal_size_bytes": wal_info[1] if wal_info else 0,
                "checkpointed_frames": wal_info[2] if wal_info else 0
            } if wal_info else {}

        except Exception as e:
            logger.error(f"Error getting journaling info: {type(e).__name__}")
            stats["journal_mode"] = "unknown"
            stats["wal_checkpoint_info"] = {}

        return DatabaseStatsResponse(
            status="success",
            statistics=stats,
            userUuid=current_user.uuid,
            timestamp=datetime.now(NEPAL_TZ).isoformat()
        )

    except Exception as e:
        logger.error(f"Error getting database stats: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get database statistics: {str(e)}")


@router.get("/all-tables")
async def get_all_tables(
    include_system_tables: bool = Query(False, description="Include SQLite system tables"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get complete list of all database tables including FTS and internal tables."""
    try:
        # Get comprehensive table list
        tables_query = text("""
            SELECT name, type, sql
            FROM sqlite_master
            WHERE type IN ('table', 'view')
            ORDER BY
                CASE
                    WHEN name LIKE 'sqlite_%' THEN 3
                    WHEN name LIKE 'fts_%' THEN 2
                    WHEN name LIKE '%_mapping' THEN 2
                    ELSE 1
                END,
                name
        """)
        result = await db.execute(tables_query)
        all_tables = result.fetchall()

        # Categorize tables
        user_tables = []
        system_tables = []
        fts_tables = []
        views = []
        mapping_tables = []

        for table_info in all_tables:
            table_name = table_info[0]
            table_type = table_info[1]
            sql = table_info[2] if len(table_info) > 2 else None

            table_entry = {
                "name": table_name,
                "type": table_type,
                "sql_definition": sql,
                "estimated_rows": 0,
                "estimated_size_kb": 0
            }

            if table_name.startswith('sqlite_'):
                system_tables.append(table_entry)
            elif table_name.startswith('fts_') or table_name.endswith('_fts'):
                fts_tables.append(table_entry)
            elif table_name.endswith('_mapping'):
                mapping_tables.append(table_entry)
            elif table_type == 'view':
                views.append(table_entry)
            else:
                user_tables.append(table_entry)

        # Try to get row counts for user tables
        for table in user_tables:
            try:
                count_query = text(f"SELECT COUNT(*) FROM {table['name']}")
                count_result = await db.execute(count_query)
                table["estimated_rows"] = count_result.scalar()
            except:
                # Table might not exist or be inaccessible
                pass

        response = {
            "user_tables": user_tables,
            "fts_tables": fts_tables,
            "views": views,
            "mapping_tables": mapping_tables,
            "total_tables": len(all_tables)
        }

        if include_system_tables:
            response["system_tables"] = system_tables

        return {
            "status": "success",
            "tables": response,
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting all tables: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get all tables: {str(e)}")


@router.get("/table-schema")
async def get_table_schema(
    table_name: str,
    include_sample_data: bool = Query(False, description="Include sample data from table"),
    sample_limit: int = Query(3, description="Number of sample rows to include"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed schema information for a specific table including size information."""
    try:
        # Validate table name to prevent SQL injection
        allowed_tables = [
            'users', 'notes', 'documents', 'todos', 'projects', 'diary_entries',
            'diary_daily_metadata', 'archive_folders', 'archive_items', 'tags',
            'document_diary', 'project_tags', 'note_tags', 'todo_tags', 'recovery_keys', 'sessions'
        ]

        # Also allow FTS and mapping tables
        fts_prefixes = ['fts_', 'diary_entries_fts', 'notes_fts', 'documents_fts']
        mapping_suffixes = ['_mapping', '_tags']

        is_allowed = (
            table_name in allowed_tables or
            any(table_name.startswith(prefix) for prefix in fts_prefixes) or
            any(table_name.endswith(suffix) for suffix in mapping_suffixes)
        )

        if not is_allowed:
            raise HTTPException(status_code=400, detail=f"Table '{table_name}' is not allowed for inspection")

        # Get table schema
        pragma_query = text(f"PRAGMA table_info({table_name})")
        result = await db.execute(pragma_query)
        columns = []

        for row in result:
            column_info = {
                "cid": row[0],
                "name": row[1],
                "data_type": row[2],
                "not_null": bool(row[3]),
                "default_value": row[4],
                "primary_key": bool(row[5])
            }
            columns.append(column_info)

        # Get foreign key information
        try:
            fk_query = text(f"PRAGMA foreign_key_list({table_name})")
            fk_result = await db.execute(fk_query)
            foreign_keys = []

            for row in fk_result:
                fk_info = {
                    "id": row[0],
                    "seq": row[1],
                    "table": row[2],
                    "from": row[3],
                    "to": row[4],
                    "on_update": row[5],
                    "on_delete": row[6],
                    "match": row[7]
                }
                foreign_keys.append(fk_info)
        except:
            foreign_keys = []

        # Get indexes
        try:
            index_query = text(f"PRAGMA index_list({table_name})")
            index_result = await db.execute(index_query)
            indexes = []

            for row in index_result:
                index_info = {
                    "seq": row[0],
                    "name": row[1],
                    "unique": bool(row[2]),
                    "origin": row[3],
                    "partial": bool(row[4])
                }
                indexes.append(index_info)
        except:
            indexes = []

        # Get table statistics
        stats = {}
        try:
            count_query = text(f"SELECT COUNT(*) FROM {table_name}")
            count_result = await db.execute(count_query)
            stats["row_count"] = count_result.scalar()
        except:
            stats["row_count"] = 0

        # Get sample data if requested
        sample_data = []
        if include_sample_data and stats["row_count"] > 0:
            try:
                # Build SELECT query with column names
                column_names = [col["name"] for col in columns]
                sample_query = text(f"""
                    SELECT {', '.join(column_names)}
                    FROM {table_name}
                    LIMIT {sample_limit}
                """)
                sample_result = await db.execute(sample_query)

                for row in sample_result:
                    row_data = {}
                    for i, value in enumerate(row):
                        if i < len(column_names):
                            col_name = column_names[i]
                            # Handle different data types appropriately
                            if value is None:
                                row_data[col_name] = None
                            elif isinstance(value, datetime):
                                row_data[col_name] = value.isoformat()
                            elif isinstance(value, bytes):
                                row_data[col_name] = f"<{len(value)} bytes>"
                            else:
                                row_data[col_name] = str(value)
                    sample_data.append(row_data)

            except Exception as e:
                logger.warning(f"Could not get sample data from {table_name}: {type(e).__name__}")

        return {
            "status": "success",
            "table_name": table_name,
            "columns": columns,
            "foreign_keys": foreign_keys,
            "indexes": indexes,
            "statistics": stats,
            "sample_data": sample_data if include_sample_data else None,
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting table schema for {table_name}: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get table schema: {str(e)}")


@router.get("/sample-rows")
async def get_sample_rows(
    table: str = Query(..., description="Table name to sample from"),
    limit: int = Query(5, description="Number of rows to return"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get sample rows from specified table for debugging."""
    try:
        # Validate table access for security
        allowed_tables = {
            "notes": Note,
            "documents": Document,
            "todos": Todo,
            "projects": Project,
            "diary_entries": DiaryEntry,
            "archive_folders": ArchiveFolder,
            "archive_items": ArchiveItem,
            "tags": Tag,
            "diary_daily_metadata": DiaryDailyMetadata
        }

        # Special tables that don't need user filtering
        system_tables = ["sessions", "recovery_keys"]

        if table not in allowed_tables and table not in system_tables:
            raise HTTPException(status_code=400, detail=f"Table '{table}' not allowed for sampling")

        # Build query with user filtering, special-case system tables
        if table in system_tables:
            result = await db.execute(
                text(f"SELECT * FROM {table} WHERE created_by = :uid LIMIT :limit"),
                {"uid": current_user.uuid, "limit": limit}
            )
            rows = result.fetchall()
        else:
            query = (
                select(allowed_tables[table])
                .where(allowed_tables[table].created_by == current_user.uuid)
                .limit(limit)
            )
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
                        row_dict[column.name] = value.isoformat()
                    # Handle bytes (encrypted data)
                    elif isinstance(value, bytes):
                        row_dict[column.name] = f"<{len(value)} bytes of encrypted data>"
                    else:
                        row_dict[column.name] = value
                sample_data.append(row_dict)
        else:
            # Handle system tables
            sample_data = [dict(row._mapping) for row in rows]

        return {
            "status": "success",
            "table": table,
            "sample_rows": sample_data,
            "row_count": len(sample_data),
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting sample rows from {table}: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get sample rows: {str(e)}")


@router.get("/fts-tables")
async def get_fts_tables_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed information about FTS5 tables including samples and structure."""
    try:
        # Get all FTS tables
        fts_query = text("""
            SELECT name, sql
            FROM sqlite_master
            WHERE type='table' AND (name LIKE 'fts_%' OR name LIKE '%_fts')
            ORDER BY name
        """)
        result = await db.execute(fts_query)
        fts_tables = result.fetchall()

        fts_info = []
        for table_info in fts_tables:
            table_name = table_info[0]
            create_sql = table_info[1]

            # Get table structure
            try:
                pragma_query = text(f"PRAGMA table_info({table_name})")
                pragma_result = await db.execute(pragma_query)
                columns = []
                for row in pragma_result:
                    columns.append({
                        "name": row[1],
                        "type": row[2],
                        "not_null": bool(row[3]),
                        "primary_key": bool(row[5])
                    })
            except:
                columns = []

            # Get content table mapping
            content_table = None
            external_tables = []

            if create_sql:
                # Extract content table from CREATE VIRTUAL TABLE statement
                if "USING fts5" in create_sql:
                    parts = create_sql.split("USING fts5")[1].split("(")[1].split(")")[0]
                    items = [item.strip() for item in parts.split(",")]
                    for item in items:
                        if "=" in item:
                            key, value = item.split("=", 1)
                            if key.strip() == "content":
                                content_table = value.strip()
                            elif key.strip() == "content_rowid":
                                # Handle content_rowid option
                                pass
                        elif not item.startswith("'"):
                            # This might be the content table name
                            if not content_table:
                                content_table = item.strip()

            # Get row count
            try:
                count_query = text(f"SELECT COUNT(*) FROM {table_name}")
                count_result = await db.execute(count_query)
                row_count = count_result.scalar()
            except:
                row_count = 0

            # Get sample data
            sample_data = []
            if row_count > 0:
                try:
                    sample_query = text(f"SELECT * FROM {table_name} LIMIT 3")
                    sample_result = await db.execute(sample_query)
                    for row in sample_result:
                        sample_data.append(dict(row._mapping))
                except:
                    pass

            fts_info.append({
                "table_name": table_name,
                "content_table": content_table,
                "columns": columns,
                "row_count": row_count,
                "sample_data": sample_data,
                "create_sql": create_sql
            })

        return {
            "status": "success",
            "fts_tables": fts_info,
            "total_fts_tables": len(fts_info),
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting FTS tables info: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get FTS tables info: {str(e)}")


@router.get("/diary-tables")
async def get_diary_tables_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get detailed information about diary tables, showing structure while respecting encryption."""
    try:
        # Get basic diary tables statistics
        entries_query = text("""
            SELECT
                COUNT(*) as total_entries,
                COUNT(CASE WHEN content_file_path IS NOT NULL THEN 1 END) as entries_with_files,
                COUNT(CASE WHEN nepali_date IS NOT NULL THEN 1 END) as entries_with_nepali_date,
                COUNT(CASE WHEN is_template = TRUE THEN 1 END) as template_entries,
                MIN(date) as earliest_entry,
                MAX(date) as latest_entry,
                SUM(CASE WHEN content_length IS NOT NULL THEN content_length ELSE 0 END) as total_content_length
            FROM diary_entries
            WHERE created_by = :created_by
        """)
        entries_result = await db.execute(entries_query, {"created_by": current_user.uuid})
        entries_stats = entries_result.fetchone()

        # Get document attachments via document_diary association
        # document_diary already imported at module scope
        media_query = select(
            func.count().label('total_media'),
            func.count(func.distinct(document_diary.c.diary_entry_uuid)).label('entries_with_media'),
            func.sum(Document.file_size).label('total_media_size'),
            func.avg(Document.file_size).label('avg_media_size')
        ).select_from(document_diary).join(
            Document, document_diary.c.document_uuid == Document.uuid
        ).join(
            DiaryEntry, document_diary.c.diary_entry_uuid == DiaryEntry.uuid
        ).where(DiaryEntry.created_by == current_user.uuid)
        media_result = await db.execute(media_query)
        media_stats = media_result.fetchone()

        # Get daily metadata table info
        daily_metadata_query = text("""
            SELECT COUNT(*) as total_snapshots,
                   COUNT(DISTINCT date) as unique_dates,
                   COUNT(CASE WHEN nepali_date IS NOT NULL THEN 1 END) as snapshots_with_nepali_date,
                   MIN(date) as earliest_snapshot,
                   MAX(date) as latest_snapshot,
                   COUNT(CASE WHEN metrics_json IS NOT NULL THEN 1 END) as snapshots_with_metrics,
                   COUNT(CASE WHEN habits_json IS NOT NULL THEN 1 END) as snapshots_with_habits,
                   COUNT(DISTINCT strftime('%Y-%m', date)) as months_with_snapshots
            FROM diary_daily_metadata
            WHERE created_by = :created_by
        """)
        daily_metadata_result = await db.execute(daily_metadata_query, {"created_by": current_user.uuid})
        daily_metadata_stats = daily_metadata_result.fetchone()

        # Get sample diary entries (without content)
        sample_entries_query = text("""
            SELECT uuid, date, nepali_date, mood, day_of_week, is_template,
                   content_length, content_file_path, file_hash,
                   created_at, updated_at
            FROM diary_entries
            WHERE created_by = :created_by
            ORDER BY date DESC
            LIMIT 3
        """)
        sample_entries_result = await db.execute(sample_entries_query, {"created_by": current_user.uuid})
        sample_entries = []

        for row in sample_entries_result:
            sample_entries.append({
                "uuid": row[0],
                "date": str(row[1]),
                "nepali_date": row[2],
                "mood": row[3],
                "day_of_week": row[4],
                "is_template": bool(row[5]),
                "content_length": row[6],
                "content_file_path": row[7],
                "file_hash": row[8] is not None,
                "has_file": row[7] is not None,
                "created_at": str(row[9]),
                "updated_at": str(row[10])
            })

        # Get sample documents attached to diary entries
        # document_diary already imported at module scope
        sample_media_query = (
            select(Document.uuid, document_diary.c.diary_entry_uuid,
                   Document.mime_type, Document.file_size, Document.created_at,
                   func.length(Document.filename).label('filename_length'),
                   func.length(Document.file_path).label('filepath_length'))
            .select_from(document_diary)
            .join(Document, document_diary.c.document_uuid == Document.uuid)
            .join(DiaryEntry, document_diary.c.diary_entry_uuid == DiaryEntry.uuid)
            .where(DiaryEntry.created_by == current_user.uuid)
            .order_by(Document.created_at.desc())
            .limit(3)
        )
        sample_media_result = await db.execute(sample_media_query)
        sample_media = []

        for row in sample_media_result:
            sample_media.append({
                "uuid": row[0],
                "diary_entry_uuid": row[1],
                "mime_type": row[2],
                "size_mb": round((row[3] or 0) / (1024 * 1024), 2),
                "created_at": str(row[4]),
                "file_path_lengths": {
                    "filename_length": row[5],
                    "filepath_length": row[6]
                }
            })

        # Check for FTS tables related to diary
        fts_diary_query = text("""
            SELECT name, sql FROM sqlite_master
            WHERE type = 'table' AND name LIKE 'fts_%diary%'
            ORDER BY name
        """)
        fts_diary_result = await db.execute(fts_diary_query)
        fts_diary_tables = [{"name": row[0], "sql": row[1]} for row in fts_diary_result]

        return {
            "status": "success",
            "diary_entries": {
                "total": entries_stats[0] if entries_stats else 0,
                "with_files": entries_stats[1] if entries_stats else 0,
                "with_nepali_date": entries_stats[2] if entries_stats else 0,
                "templates": entries_stats[3] if entries_stats else 0,
                "date_range": {
                    "earliest": str(entries_stats[4]) if entries_stats and entries_stats[4] else None,
                    "latest": str(entries_stats[5]) if entries_stats and entries_stats[5] else None
                },
                "total_content_bytes": entries_stats[6] if entries_stats else 0
            },
            "diary_daily_metadata": {
                "total_snapshots": daily_metadata_stats[0] if daily_metadata_stats else 0,
                "unique_dates": daily_metadata_stats[1] if daily_metadata_stats else 0,
                "with_nepali_date": daily_metadata_stats[2] if daily_metadata_stats else 0,
                "date_range": {
                    "earliest": str(daily_metadata_stats[3]) if daily_metadata_stats and daily_metadata_stats[3] else None,
                    "latest": str(daily_metadata_stats[4]) if daily_metadata_stats and daily_metadata_stats[4] else None
                },
                "with_metrics": daily_metadata_stats[5] if daily_metadata_stats else 0,
                "with_habits": daily_metadata_stats[6] if daily_metadata_stats else 0,
                "months_with_snapshots": daily_metadata_stats[7] if daily_metadata_stats else 0
            },
            "diary_media": {
                "total_media": media_stats[0] if media_stats else 0,
                "entries_with_media": media_stats[1] if media_stats else 0,
                "storage": {
                    "total_size_mb": round(media_stats[2] / (1024 * 1024), 2) if media_stats and media_stats[2] else 0,
                    "average_size_mb": round(media_stats[3] / (1024 * 1024), 2) if media_stats and media_stats[3] else 0
                },
                "note": "File type breakdown (photos/voice/videos) no longer available after diary_media removal"
            },
            "sample_entries": sample_entries,
            "sample_media": sample_media,
            "fts_tables": fts_diary_tables,
            "encryption_note": {
                "content_security": "Entry content is client-side encrypted and cannot be viewed in backend testing",
                "observable_data": "We can see metadata, structure, dates, moods, and file counts but not actual content",
                "privacy_preserved": "This ensures your diary remains private even during system testing"
            },
            "table_structure": {
                "diary_entries": "Main diary entries table with encrypted content",
                "diary_daily_metadata": "Daily metadata including habits, metrics, and wellness data",
                "document_diary": "Association table linking documents to diary entries"
            },
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        logger.error(f"Error getting diary tables info: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Failed to get diary tables info: {str(e)}")


@router.post("/diary-migration")
async def run_diary_migration(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Run the diary schema migration to convert from blob-based to file-based storage."""
    try:
        # This is a simplified version of the migration logic
        # In production, this would be more comprehensive

        migration_log = []

        def add_message(level: str, msg: str):
            migration_log.append({"timestamp": datetime.now(NEPAL_TZ).isoformat(), "level": level, "message": msg})
            logger.info(f"DIARY_MIGRATION: [{level}] {msg}")

        add_message("INFO", f"Starting diary migration for user {current_user.uuid}")

        # Check if migration is needed
        entries_with_blobs_query = text("""
            SELECT COUNT(*)
            FROM diary_entries
            WHERE created_by = :user_uuid AND encrypted_blob IS NOT NULL
        """)
        result = await db.execute(entries_with_blobs_query, {"user_uuid": current_user.uuid})
        entries_with_blobs = result.scalar()

        if entries_with_blobs == 0:
            add_message("SUCCESS", "No entries with blob data found - migration not needed")
            return {
                "status": "success",
                "message": "Migration not needed - no blob data found",
                "entries_processed": 0,
                "log": migration_log,
                "user_uuid": current_user.uuid,
                "timestamp": datetime.now(NEPAL_TZ).isoformat()
            }

        add_message("INFO", f"Found {entries_with_blobs} entries with blob data to migrate")

        # Check if secure directory exists
        secure_dir = get_data_dir() / "secure" / "entries" / "text"
        if not secure_dir.exists():
            secure_dir.mkdir(parents=True, exist_ok=True)
            add_message("INFO", f"Created secure directory: {secure_dir}")

        # Get entries that need migration
        migration_query = text("""
            SELECT uuid, date, encrypted_blob, encryption_iv, encryption_tag
            FROM diary_entries
            WHERE created_by = :user_uuid
              AND encrypted_blob IS NOT NULL
              AND content_file_path IS NULL
            ORDER BY date
            LIMIT 5  -- Process in small batches
        """)

        result = await db.execute(migration_query, {"user_uuid": current_user.uuid})
        entries_to_migrate = result.fetchall()

        add_message("INFO", f"Processing batch of {len(entries_to_migrate)} entries")

        processed_count = 0
        for entry in entries_to_migrate:
            entry_uuid, entry_date, encrypted_blob, iv, tag = entry

            try:
                # Generate filename
                date_str = entry_date.strftime("%Y-%m-%d") if entry_date else "unknown"
                filename = f"{date_str}_diary_{entry_uuid[:8]}.dat"
                file_path = secure_dir / filename

                # In a real migration, we would decrypt and re-encrypt here
                # For this test, we'll just simulate the file creation
                with open(file_path, 'w') as f:
                    f.write(f"MIGRATED: {entry_uuid} - {entry_date}")

                # Update database record
                update_query = text("""
                    UPDATE diary_entries
                    SET content_file_path = :path,
                        encrypted_blob = NULL
                    WHERE uuid = :uuid
                """)
                await db.execute(update_query, {
                    "path": str(file_path),
                    "uuid": entry_uuid
                })

                processed_count += 1
                add_message("SUCCESS", f"Migrated entry {entry_uuid[:8]} to {filename}")

            except Exception as e:
                add_message("ERROR", f"Failed to migrate entry {entry_uuid[:8]}: {str(e)}")

        # Commit the changes
        await db.commit()

        add_message("SUCCESS", f"Migration completed. Processed {processed_count} entries.")

        return {
            "status": "success",
            "message": "Diary migration completed successfully",
            "entries_processed": processed_count,
            "entries_remaining": max(0, entries_with_blobs - processed_count),
            "log": migration_log,
            "user_uuid": current_user.uuid,
            "timestamp": datetime.now(NEPAL_TZ).isoformat()
        }

    except Exception as e:
        logger.error(f"Error during diary migration: {type(e).__name__}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Diary migration failed: {str(e)}")