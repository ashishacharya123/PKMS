import sqlite3
import uuid

DB_PATH = '/app/data/pkm_metadata.db'

def backfill_uuids(table, id_col='id'):
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()
    # Find rows with missing or empty uuid
    cur.execute(f"SELECT {id_col} FROM {table} WHERE uuid IS NULL OR uuid = ''")
    rows = cur.fetchall()
    updated = 0
    for (row_id,) in rows:
        new_uuid = str(uuid.uuid4())
        cur.execute(f"UPDATE {table} SET uuid = ? WHERE {id_col} = ?", (new_uuid, row_id))
        updated += 1
    con.commit()
    con.close()
    print(f"{table}: {updated} rows updated with new UUIDs.")

if __name__ == '__main__':
    backfill_uuids('diary_entries')
    backfill_uuids('diary_media')
    print("Backfill complete.") 