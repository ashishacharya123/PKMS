import sqlite3, shutil, datetime, os
from pathlib import Path
from pkms-backend.app.config import NEPAL_TZ

db_path = Path('PKMS_Data/pkm_metadata.db')
if not db_path.exists():
    raise SystemExit(f'Database not found: {db_path}')
backup_path = db_path.with_name(db_path.stem + '_' + datetime.datetime.now(NEPAL_TZ).strftime('%Y%m%d_%H%M%S') + '.bak')
shutil.copy(db_path, backup_path)
print('Backup created at', backup_path)
conn = sqlite3.connect(db_path)
conn.execute('PRAGMA foreign_keys = ON;')
cur = conn.cursor()
for table in ('sessions','recovery_keys','users'):
    cur.execute(f'DELETE FROM {table};')
conn.commit()
remaining = cur.execute('SELECT COUNT(*) FROM users;').fetchone()[0]
conn.close()
print('Remaining users after deletion:', remaining)
