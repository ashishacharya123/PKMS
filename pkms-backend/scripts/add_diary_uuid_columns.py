import sqlite3

DB_PATH = '/app/data/pkm_metadata.db'

def add_uuid_column_and_index(table):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    # Check if uuid column exists
    cur.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cur.fetchall()]
    if 'uuid' not in columns:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN uuid VARCHAR(36) NOT NULL DEFAULT ''")
        print(f"Added uuid column to {table}.")
    else:
        print(f"uuid column already exists in {table}.")
    # Add index if not exists
    cur.execute(f"PRAGMA index_list({table})")
    indexes = [row[1] for row in cur.fetchall()]
    idx_name = f"idx_{table}_uuid"
    if idx_name not in indexes:
        cur.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}(uuid)")
        print(f"Created index {idx_name} on {table}.")
    else:
        print(f"Index {idx_name} already exists on {table}.")
    con.commit()
    con.close()

if __name__ == '__main__':
    add_uuid_column_and_index('diary_entries')
    add_uuid_column_and_index('diary_media')
    print("UUID column and index migration complete.") 