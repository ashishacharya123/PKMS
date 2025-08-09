import sqlite3
import os

DB_PATH = "/app/data/pkm_metadata.db"

def print_notes_schema():
    if not os.path.exists(DB_PATH):
        print(f"Database file not found at {DB_PATH}")
        return
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    print("Schema for 'notes' table:")
    try:
        cur.execute("PRAGMA table_info(notes);")
        columns = cur.fetchall()
        if not columns:
            print("No columns found. Table may not exist.")
        for col in columns:
            print(f"- {col[1]} ({col[2]})")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    print_notes_schema() 