#!/usr/bin/env python3
"""
List Users Script - Display all users in PKMS database
"""

import sqlite3
import os
from pathlib import Path
from datetime import datetime

# ---------------------------------------------------------------------------
# PKMS USER LIST UTILITY
# ---------------------------------------------------------------------------
# This script displays all registered users in the PKMS database along with
# their key information such as:
#   - User ID, Username, Email
#   - Creation date
#   - Associated data counts (notes, documents, diary entries, etc.)
#   - Session status
#
# Usage: python scripts/list_users.py
# ---------------------------------------------------------------------------

def main():
    print("PKMS User List")
    print("=" * 80)
    
    # Database path - check both locations
    # NOTE: In Docker, the database is at /app/data/pkm_metadata.db (Docker volume)
    #       In local development, it's at PKMS_Data/pkm_metadata.db
    db_paths = [
        Path("pkms-backend/data/pkm_metadata.db"),  # Docker volume mounted locally
        Path("PKMS_Data/pkm_metadata.db"),  # Local development
        Path("pkms-backend/PKMS_Data/pkms.db"),  # Legacy path
    ]
    
    db_path = None
    for path in db_paths:
        if path.exists():
            db_path = path
            break
    
    if not db_path:
        print(f"[ERROR] Database not found in any of these locations:")
        for path in db_paths:
            print(f"   - {path}")
        print("\nMake sure you're running this from the PKMS root directory.")
        print("Or the backend might not be initialized yet.")
        return
    
    print(f"[INFO] Database: {db_path}")
    print()
    
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row  # Enable column access by name
        cursor = conn.cursor()
        
        # Get total user count
        cursor.execute("SELECT COUNT(*) FROM users")
        total_users = cursor.fetchone()[0]
        
        if total_users == 0:
            print("[INFO] No users found in database.")
            print("       PKMS is in fresh state - ready for first-time setup.")
            return
        
        print(f"[STATS] Total Users: {total_users}")
        print()
        
        # Get detailed user information
        cursor.execute("""
            SELECT 
                id, 
                username, 
                email, 
                is_active,
                created_at,
                updated_at,
                last_login
            FROM users 
            ORDER BY created_at DESC
        """)
        
        users = cursor.fetchall()
        
        for idx, user in enumerate(users, 1):
            print(f"User #{idx}")
            print("-" * 80)
            print(f"  ID:           {user['id']}")
            print(f"  Username:     {user['username']}")
            print(f"  Email:        {user['email']}")
            print(f"  Active:       {'[YES]' if user['is_active'] else '[NO]'}")
            print(f"  Created:      {user['created_at']}")
            print(f"  Updated:      {user['updated_at']}")
            print(f"  Last Login:   {user['last_login'] or 'Never'}")
            
            # Get associated data counts for this user
            user_id = user['id']
            
            # Count tables with error handling
            counts = {}
            tables_to_count = [
                ('notes', 'Notes'),
                ('documents', 'Documents'),
                ('todos', 'Todos'),
                ('projects', 'Projects'),
                ('diary_entries', 'Diary Entries'),
                ('diary_daily_metadata', 'Daily Wellness Snapshots'),
                ('archive_folders', 'Archive Folders'),
                ('archive_items', 'Archive Items'),
                ('tags', 'Tags'),
            ]
            
            for table_name, display_name in tables_to_count:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table_name} WHERE user_id = ?", (user_id,))
                    count = cursor.fetchone()[0]
                    counts[display_name] = count
                except sqlite3.OperationalError:
                    # Table might not exist yet
                    counts[display_name] = 'N/A'
            
            # Check active sessions
            try:
                cursor.execute("""
                    SELECT COUNT(*) FROM sessions 
                    WHERE user_id = ? 
                    AND datetime(expires_at) > datetime('now')
                """, (user_id,))
                active_sessions = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                active_sessions = 'N/A'
            
            print(f"\n  [DATA] Summary:")
            for display_name, count in counts.items():
                if count != 'N/A' and count > 0:
                    print(f"     {display_name}: {count}")
            
            if active_sessions != 'N/A':
                print(f"     Active Sessions: {active_sessions}")
            
            print()
        
        # Show database file size
        db_size_mb = os.path.getsize(db_path) / (1024 * 1024)
        print(f"[STORAGE] Database Size: {db_size_mb:.2f} MB")
        
        # Show table list
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name NOT LIKE 'sqlite_%'
            ORDER BY name
        """)
        tables = [row[0] for row in cursor.fetchall()]
        print(f"[TABLES] Total Tables: {len(tables)}")
        
        # FTS tables
        fts_tables = [t for t in tables if t.startswith('fts_')]
        if fts_tables:
            print(f"[SEARCH] FTS5 Search Tables: {len(fts_tables)}")
        
        print()
        print("[SUCCESS] User list retrieved successfully!")
        
    except sqlite3.Error as e:
        print(f"[ERROR] Database error: {e}")
    except Exception as e:
        print(f"[ERROR] Unexpected error: {e}")
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    main()

