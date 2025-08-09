import sqlite3
import os

db_path = '/app/data/pkm_metadata.db'

if not os.path.exists(db_path):
    print(f'ERROR: Database file not found at {db_path}')
    exit(1)

con = sqlite3.connect(db_path)
cur = con.cursor()

try:
    # Add the column if it doesn't exist
    cur.execute("PRAGMA table_info(diary_entries)")
    columns = [row[1] for row in cur.fetchall()]
    if 'nepali_date' not in columns:
        cur.execute("ALTER TABLE diary_entries ADD COLUMN nepali_date VARCHAR(20)")
        print('Added nepali_date column.')
    else:
        print('nepali_date column already exists.')

    # Add the index if it doesn't exist
    cur.execute("PRAGMA index_list('diary_entries')")
    indexes = [row[1] for row in cur.fetchall()]
    if 'idx_diary_entries_nepali_date' not in indexes:
        cur.execute("CREATE INDEX idx_diary_entries_nepali_date ON diary_entries(nepali_date)")
        print('Created index on nepali_date.')
    else:
        print('Index on nepali_date already exists.')

    con.commit()
    print('Migration complete.')
except Exception as e:
    print(f'ERROR: {e}')
finally:
    con.close() 