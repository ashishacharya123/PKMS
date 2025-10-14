import sqlite3
import sys
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: python verify_backup.py <backup_filename>")
    sys.exit(1)

backup_file = f"PKMS_Data/backups/{sys.argv[1]}"

if not Path(backup_file).exists():
    print(f"[ERROR] Backup file not found: {backup_file}")
    sys.exit(1)

try:
    conn = sqlite3.connect(backup_file)
    cursor = conn.cursor()
    
    # Get table count
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [t[0] for t in cursor.fetchall()]
    
    # Get user count
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    
    # Get database size
    file_size_mb = Path(backup_file).stat().st_size / (1024 * 1024)
    
    print("[SUCCESS] Backup Verification Complete")
    print(f"  Backup file: {sys.argv[1]}")
    print(f"  File size: {file_size_mb:.2f} MB")
    print(f"  Tables: {len(tables)}")
    print(f"  Users: {user_count}")
    print(f"  Key tables present: ", end="")
    
    key_tables = ['users', 'diary_entries', 'diary_daily_metadata', 'notes', 'documents']
    present = [t for t in key_tables if t in tables]
    print(', '.join(present))
    
    conn.close()
    
except Exception as e:
    print(f"[ERROR] Backup verification failed: {e}")
    sys.exit(1)

