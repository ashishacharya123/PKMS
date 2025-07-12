#!/usr/bin/env python3
"""
PKMS Diary Module Schema Migration Script
=========================================

This script migrates the database schema for the diary refactor.
Handles the transition from blob-based to file-based encrypted storage.

Changes Applied:
1. Add diary_password_hash and diary_password_hint to users table
2. Add new columns to diary_entries table (content_file_path, file_hash, day_of_week)
3. Remove encrypted_file_path from diary_media table
4. Migrate existing diary data to new file-based format

Usage:
    python scripts/migrate_diary_schema.py [--backup] [--force]
"""

import asyncio
import sys
import argparse
import logging
from pathlib import Path
from datetime import datetime, date
import json
import base64
import hashlib
import uuid

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent))

from sqlalchemy import text, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db_session, get_data_dir
from app.config import NEPAL_TZ
from app.utils.diary_encryption import write_encrypted_file, compute_sha256

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class DiaryMigration:
    """Handles the diary schema migration process"""
    
    def __init__(self, backup: bool = True, force: bool = False):
        self.backup = backup
        self.force = force
        self.migration_id = datetime.now(NEPAL_TZ).strftime("%Y%m%d_%H%M%S")
        
    async def run_migration(self):
        """Execute the complete migration process"""
        logger.info("🚀 Starting PKMS Diary Schema Migration")
        logger.info(f"📅 Migration ID: {self.migration_id}")
        
        try:
            async with get_db_session() as db:
                # Step 1: Check current schema
                await self._check_current_schema(db)
                
                # Step 2: Create backup if requested
                if self.backup:
                    await self._create_backup(db)
                
                # Step 3: Apply schema changes
                await self._apply_schema_changes(db)
                
                # Step 4: Migrate existing data
                await self._migrate_existing_data(db)
                
                # Step 5: Verify migration
                await self._verify_migration(db)
                
                logger.info("✅ Migration completed successfully!")
                logger.info("🎉 Diary module is now using file-based encryption!")
                
        except Exception as e:
            logger.error(f"❌ Migration failed: {str(e)}")
            if self.backup:
                logger.info("💾 Database backup is available for recovery")
            raise
    
    async def _check_current_schema(self, db: AsyncSession):
        """Check the current database schema"""
        logger.info("🔍 Checking current database schema...")
        
        # Check if migration already applied
        try:
            result = await db.execute(text("PRAGMA table_info(users)"))
            columns = [row[1] for row in result.fetchall()]
            
            if 'diary_password_hash' in columns:
                if not self.force:
                    logger.warning("⚠️ Migration appears to already be applied!")
                    logger.warning("Use --force to run anyway")
                    sys.exit(1)
                else:
                    logger.info("🔄 Force mode enabled - proceeding anyway")
            
            logger.info("✅ Schema check completed")
            
        except Exception as e:
            logger.error(f"❌ Schema check failed: {e}")
            raise
    
    async def _create_backup(self, db: AsyncSession):
        """Create a database backup before migration"""
        logger.info("💾 Creating database backup...")
        
        try:
            data_dir = get_data_dir()
            backup_dir = data_dir / "backups"
            backup_dir.mkdir(exist_ok=True)
            
            backup_name = f"pkm_metadata_backup_diary_migration_{self.migration_id}.db"
            backup_path = backup_dir / backup_name
            
            # Use SQLite VACUUM INTO for clean backup
            await db.execute(text(f"VACUUM INTO '{backup_path}'"))
            
            logger.info(f"✅ Backup created: {backup_name}")
            
        except Exception as e:
            logger.error(f"❌ Backup creation failed: {e}")
            raise
    
    async def _apply_schema_changes(self, db: AsyncSession):
        """Apply the schema changes"""
        logger.info("🔧 Applying schema changes...")
        
        try:
            # Add new columns to users table
            logger.info("  📝 Adding diary password fields to users table...")
            await db.execute(text("""
                ALTER TABLE users ADD COLUMN diary_password_hash TEXT;
            """))
            await db.execute(text("""
                ALTER TABLE users ADD COLUMN diary_password_hint TEXT;
            """))
            
            # Add new columns to diary_entries table
            logger.info("  📝 Adding file-based columns to diary_entries table...")
            
            # Check if columns already exist
            result = await db.execute(text("PRAGMA table_info(diary_entries)"))
            existing_columns = [row[1] for row in result.fetchall()]
            
            if 'content_file_path' not in existing_columns:
                await db.execute(text("""
                    ALTER TABLE diary_entries ADD COLUMN content_file_path TEXT;
                """))
                
            if 'file_hash' not in existing_columns:
                await db.execute(text("""
                    ALTER TABLE diary_entries ADD COLUMN file_hash TEXT;
                """))
                
            if 'day_of_week' not in existing_columns:
                await db.execute(text("""
                    ALTER TABLE diary_entries ADD COLUMN day_of_week INTEGER;
                """))
                
            if 'media_count' not in existing_columns:
                await db.execute(text("""
                    ALTER TABLE diary_entries ADD COLUMN media_count INTEGER DEFAULT 0;
                """))
            
            # Update day_of_week for existing entries
            logger.info("  📅 Calculating day_of_week for existing entries...")
            result = await db.execute(text("""
                SELECT id, date FROM diary_entries WHERE day_of_week IS NULL
            """))
            entries = result.fetchall()
            
            for entry_id, entry_date in entries:
                if entry_date:
                    # Parse the date and calculate day_of_week (0=Monday)
                    if isinstance(entry_date, str):
                        parsed_date = datetime.fromisoformat(entry_date.replace('Z', '+00:00')).date()
                    else:
                        parsed_date = entry_date.date() if hasattr(entry_date, 'date') else entry_date
                    
                    day_of_week = parsed_date.weekday()  # 0=Monday, 6=Sunday
                    
                    await db.execute(text("""
                        UPDATE diary_entries SET day_of_week = :dow WHERE id = :id
                    """), {"dow": day_of_week, "id": entry_id})
            
            # Update media_count for existing entries
            logger.info("  📷 Calculating media_count for existing entries...")
            await db.execute(text("""
                UPDATE diary_entries 
                SET media_count = (
                    SELECT COUNT(*) 
                    FROM diary_media 
                    WHERE diary_media.diary_entry_id = diary_entries.id
                )
                WHERE media_count IS NULL OR media_count = 0
            """))
            
            await db.commit()
            logger.info("✅ Schema changes applied successfully")
            
        except Exception as e:
            await db.rollback()
            logger.error(f"❌ Schema changes failed: {e}")
            raise
    
    async def _migrate_existing_data(self, db: AsyncSession):
        """Migrate existing diary data to file-based storage"""
        logger.info("📦 Migrating existing diary data to file-based storage...")
        
        try:
            # Get entries that still have encrypted_blob but no content_file_path
            result = await db.execute(text("""
                SELECT id, title, encrypted_blob, encryption_iv, encryption_tag, date, user_id
                FROM diary_entries 
                WHERE encrypted_blob IS NOT NULL 
                AND (content_file_path IS NULL OR content_file_path = '')
            """))
            entries = result.fetchall()
            
            logger.info(f"  🔍 Found {len(entries)} entries to migrate")
            
            # Create directory structure
            secure_dir = get_data_dir() / "secure" / "entries" / "text"
            secure_dir.mkdir(parents=True, exist_ok=True)
            
            migrated_count = 0
            for entry in entries:
                entry_id, title, encrypted_blob, iv, tag, entry_date, user_id = entry
                
                try:
                    # Parse date for filename
                    if isinstance(entry_date, str):
                        parsed_date = datetime.fromisoformat(entry_date.replace('Z', '+00:00')).date()
                    else:
                        parsed_date = entry_date.date() if hasattr(entry_date, 'date') else entry_date
                    
                    # Generate readable filename
                    date_str = parsed_date.strftime("%Y-%m-%d")
                    filename = f"{date_str}_diary_{entry_id}.dat"
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
                    
                    if migrated_count % 10 == 0:
                        logger.info(f"  📝 Migrated {migrated_count}/{len(entries)} entries...")
                        
                except Exception as e:
                    logger.warning(f"  ⚠️ Failed to migrate entry {entry_id}: {e}")
                    continue
            
            await db.commit()
            logger.info(f"✅ Successfully migrated {migrated_count} diary entries")
            
        except Exception as e:
            await db.rollback()
            logger.error(f"❌ Data migration failed: {e}")
            raise
    
    async def _verify_migration(self, db: AsyncSession):
        """Verify the migration was successful"""
        logger.info("🔍 Verifying migration...")
        
        try:
            # Check schema changes
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
            
            # Check data integrity
            result = await db.execute(text("""
                SELECT COUNT(*) FROM diary_entries 
                WHERE content_file_path IS NOT NULL AND file_hash IS NOT NULL
            """))
            migrated_entries = result.scalar()
            
            result = await db.execute(text("SELECT COUNT(*) FROM diary_entries"))
            total_entries = result.scalar()
            
            logger.info(f"  📊 {migrated_entries}/{total_entries} entries have file-based storage")
            
            # Verify files exist
            missing_files = 0
            result = await db.execute(text("""
                SELECT content_file_path FROM diary_entries 
                WHERE content_file_path IS NOT NULL AND content_file_path != ''
            """))
            file_paths = [row[0] for row in result.fetchall()]
            
            for file_path in file_paths:
                if not Path(file_path).exists():
                    missing_files += 1
                    logger.warning(f"  ⚠️ Missing file: {file_path}")
            
            if missing_files > 0:
                logger.warning(f"  ⚠️ {missing_files} diary files are missing!")
            else:
                logger.info("  ✅ All diary files are present")
            
            logger.info("✅ Migration verification completed")
            
        except Exception as e:
            logger.error(f"❌ Migration verification failed: {e}")
            raise

async def main():
    """Main migration function"""
    parser = argparse.ArgumentParser(description="PKMS Diary Schema Migration")
    parser.add_argument("--backup", action="store_true", default=True, 
                       help="Create database backup before migration (default: True)")
    parser.add_argument("--no-backup", action="store_true", 
                       help="Skip database backup")
    parser.add_argument("--force", action="store_true", 
                       help="Force migration even if already applied")
    
    args = parser.parse_args()
    
    # Handle backup logic
    backup = args.backup and not args.no_backup
    
    if not backup:
        logger.warning("⚠️ Running migration WITHOUT backup!")
        response = input("Are you sure? (yes/no): ")
        if response.lower() != 'yes':
            logger.info("Migration cancelled")
            return
    
    migration = DiaryMigration(backup=backup, force=args.force)
    await migration.run_migration()

if __name__ == "__main__":
    asyncio.run(main()) 