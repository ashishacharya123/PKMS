import sqlite3, textwrap
conn = sqlite3.connect("PKMS_Data/pkm_metadata.db")
rows = conn.execute("""
    SELECT name, sql
      FROM sqlite_master
     WHERE type = 'trigger'
       AND name LIKE 'notes_fts%'
""").fetchall()
print(textwrap.indent("\n".join(f"{n}\n{sql}\n" for n, sql in rows), "• "))
conn.close()
