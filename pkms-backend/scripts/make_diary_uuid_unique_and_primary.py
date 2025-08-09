import sqlite3

DB_PATH = '/app/data/pkm_metadata.db'

def migrate_to_uuid_primary(table, fk_table=None, fk_col=None):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    # 1. Rename old table
    cur.execute(f"ALTER TABLE {table} RENAME TO {table}_old")
    # 2. Create new table with uuid as primary key
    if table == 'diary_entries':
        cur.execute('''
            CREATE TABLE diary_entries (
                uuid VARCHAR(36) PRIMARY KEY NOT NULL UNIQUE,
                title VARCHAR(255) NOT NULL,
                day_of_week SMALLINT NOT NULL,
                media_count INTEGER NOT NULL DEFAULT 0,
                content_file_path VARCHAR(500) NOT NULL,
                file_hash VARCHAR(64) NOT NULL,
                mood INTEGER,
                location VARCHAR(255),
                is_favorite BOOLEAN DEFAULT 0,
                user_id INTEGER NOT NULL,
                date DATETIME NOT NULL,
                nepali_date VARCHAR(20),
                encryption_iv VARCHAR(32),
                encryption_tag VARCHAR(32),
                metadata_json TEXT DEFAULT '{}',
                is_template BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )''')
    elif table == 'diary_media':
        cur.execute('''
            CREATE TABLE diary_media (
                uuid VARCHAR(36) PRIMARY KEY NOT NULL UNIQUE,
                diary_entry_uuid VARCHAR(36) NOT NULL,
                user_id INTEGER NOT NULL,
                filename VARCHAR(255) NOT NULL,
                original_name VARCHAR(255) NOT NULL,
                file_path VARCHAR(500) NOT NULL,
                file_size BIGINT NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                media_type VARCHAR(20) NOT NULL,
                caption TEXT,
                is_encrypted BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )''')
    # 3. Copy data (skip if empty)
    try:
        if table == 'diary_entries':
            cur.execute(f"INSERT INTO diary_entries SELECT uuid, title, day_of_week, media_count, content_file_path, file_hash, mood, location, is_favorite, user_id, date, nepali_date, encryption_iv, encryption_tag, metadata_json, is_template, created_at, updated_at FROM {table}_old")
        elif table == 'diary_media':
            cur.execute(f"INSERT INTO diary_media SELECT uuid, diary_entry_id as diary_entry_uuid, user_id, filename, original_name, file_path, file_size, mime_type, media_type, caption, is_encrypted, created_at FROM {table}_old")
    except Exception as e:
        print(f"No data to migrate for {table}: {e}")
    # 4. Drop old table
    cur.execute(f"DROP TABLE {table}_old")
    con.commit()
    con.close()
    print(f"Migrated {table} to uuid primary key.")

if __name__ == '__main__':
    migrate_to_uuid_primary('diary_entries')
    migrate_to_uuid_primary('diary_media')
    print("UUID primary key migration complete.") 