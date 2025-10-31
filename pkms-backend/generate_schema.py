

from sqlalchemy import create_engine
from app.models.base import Base
from app.models import *

# Reflect the models into a MetaData object
metadata = Base.metadata

# I am not creating a real database, just an in-memory one to generate the schema
engine = create_engine('sqlite:///:memory:')

# Generate the SQL for all tables
def to_sql(metadata_obj):
    from sqlalchemy.schema import CreateTable
    sql = []
    for table in metadata_obj.sorted_tables:
        sql.append(str(CreateTable(table).compile(engine)).strip() + ";")
    return "\n\n".join(sql)

# Get the SQL and output it
schema_sql = to_sql(metadata)
# Output schema to stdout for piping to files
import sys
sys.stdout.write(schema_sql)

