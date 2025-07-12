#!/usr/bin/env python3
"""
Reset User Script - Provides fresh start for PKMS
"""

import sqlite3
import shutil
import os
import datetime
from pathlib import Path
from pkms-backend.app.config import NEPAL_TZ

# ---------------------------------------------------------------------------
# PKMS USER RESET UTILITY - Enhanced Version
# ---------------------------------------------------------------------------
# This helper removes *all* user accounts from the main SQLite database so the
# application returns to its "first-time setup" state.  It performs the
# following steps:
#   1. Creates a timestamp-stamped backup copy of pkm_metadata.db
#   2. Temporarily disables triggers to avoid schema mismatch errors
#   3. Enables PRAGMA foreign_keys so ON DELETE CASCADE constraints fire
#   4. DELETEs every row in the users table (which cascades to sessions,
#      recovery_keys, diary_entries, etc.)
#   5. Re-enables triggers
#   6. Prints before/after table counts for verification.
#
# **IMPORTANT**: This completely wipes all user data and returns PKMS to
# first-time setup state. Use only when you want to start completely fresh.
# ---------------------------------------------------------------------------

def main():
    print("🔄 PKMS User Database Reset")
    print("=" * 50)
    
    # Database path
    db_path = Path("PKMS_Data/pkm_metadata.db")
    if not db_path.exists():
        print(f"❌ Database not found: {db_path}")
        print("Make sure you're running this from the PKMS root directory.")
        return
    
    # Create timestamped backup
    timestamp = datetime.datetime.now(NEPAL_TZ).strftime("%Y%m%d_%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}_backup_{timestamp}.db")
    
    try:
        shutil.copy(db_path, backup_path)
        print(f"✅ Backup created: {backup_path}")
    except Exception as e:
        print(f"❌ Failed to create backup: {e}")
        return
    
    # Connect and perform reset
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        
        # Get before counts
        print("\n📊 BEFORE DELETION:")
        tables_to_check = ['users', 'sessions', 'recovery_keys', 'notes', 'documents', 'todos', 'diary_entries', 'archive_folders', 'archive_items']
        before_counts = {}
        for table in tables_to_check:
            try:
                count = conn.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]
                before_counts[table] = count
                print(f"  {table}: {count} records")
            except sqlite3.Error as e:
                print(f"  {table}: Error checking ({e})")
                before_counts[table] = "ERROR"
        
        # CRITICAL: Disable triggers to prevent schema mismatch errors
        print(f"\n🔧 Temporarily disabling triggers...")
        conn.execute("PRAGMA recursive_triggers = OFF;")
        trigger_names = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='trigger';").fetchall()]
        for trigger_name in trigger_names:
            conn.execute(f"DROP TRIGGER IF EXISTS {trigger_name};")
        print(f"   Disabled {len(trigger_names)} triggers")
        
        # Perform the deletion with CASCADE
        print(f"\n🗑️  Deleting all users (CASCADE will remove related data)...")
        deleted_users = conn.execute("DELETE FROM users;").rowcount
        conn.commit()
        print(f"   Deleted {deleted_users} user(s)")
        
        # Get after counts
        print(f"\n📊 AFTER DELETION:")
        for table in tables_to_check:
            try:
                count = conn.execute(f"SELECT COUNT(*) FROM {table};").fetchone()[0]
                print(f"  {table}: {count} records")
            except sqlite3.Error as e:
                print(f"  {table}: Error checking ({e})")
        
        print(f"\n✅ User reset completed successfully!")
        print(f"📂 Database backup: {backup_path}")
        print(f"\n⚠️  NOTE: Triggers were disabled during reset. Backend restart will recreate them.")
        print(f"🚀 Next steps:")
        print(f"   1. Start backend: docker compose up -d")
        print(f"   2. Visit http://localhost:3000 for fresh setup")
        
    except sqlite3.Error as e:
        print(f"❌ Database error: {e}")
        print(f"🔄 You can restore from backup: {backup_path}")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        print(f"🔄 You can restore from backup: {backup_path}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main() 