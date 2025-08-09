import sqlite3

DB_PATH = "PKMS_Data/pkm_metadata.db"

def fix_note_tags_table():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    print("Dropping old note_tags table if exists...")
    cur.execute("DROP TABLE IF EXISTS note_tags;")
    print("Creating new note_tags table with note_uuid and tag_uuid...")
    cur.execute("""
    CREATE TABLE note_tags (
        note_uuid VARCHAR(36) NOT NULL,
        tag_uuid VARCHAR(36) NOT NULL,
        PRIMARY KEY (note_uuid, tag_uuid),
        FOREIGN KEY(note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
        FOREIGN KEY(tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
    );
    """)
    conn.commit()
    print("note_tags table recreated successfully.")
    conn.close()

if __name__ == "__main__":
    fix_note_tags_table() 