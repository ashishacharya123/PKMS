# PKMS Database Migration Plan

## 🚨 CRITICAL MIGRATION REQUIRED

### Current State vs Target State

**Current SQLAlchemy Models** (what's actually implemented):
```python
# All models use this pattern
created_by = Column(String(36), ForeignKey("users.uuid", ondelete="CASCADE"), nullable=False, index=True)
```

**Current Database Schema** (what exists in SQL):
```sql
-- All tables use this pattern
user_id INTEGER NOT NULL,
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
```

**The Mismatch**: Models expect UUID strings, but database has integer foreign keys.

## 🎯 Migration Strategy

### Phase 1: Database Schema Update
**File**: `tables_schema.sql`

1. **Users Table** - Already correct (uses integer PK)
2. **All Content Tables** - Need migration:
   ```sql
   -- OLD
   user_id INTEGER NOT NULL,
   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

   -- NEW
   created_by VARCHAR(36) NOT NULL,
   FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
   ```

### Phase 2: Affected Tables
All content tables need migration:

| Table | Current Field | Target Field | Foreign Key Target |
|-------|---------------|--------------|-------------------|
| tags | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| notes | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| note_files | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| documents | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| projects | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| todos | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| diary_entries | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| diary_daily_metadata | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| diary_media | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| archive_folders | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| archive_items | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |
| links | `user_id INTEGER` | `created_by VARCHAR(36)` | `users.uuid` |

### Phase 3: Index Updates
All indexes need to be updated:

```sql
-- OLD
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_tags_user_id ON tags(user_id);

-- NEW
CREATE INDEX idx_notes_created_by ON notes(created_by);
CREATE INDEX idx_tags_created_by ON tags(created_by);
```

## 🔄 Migration Script Template

```sql
-- Migration Script: user_id -> created_by
-- Date: 2025-10-17
-- Purpose: Convert integer user_id to UUID created_by

-- Step 1: Add new columns
ALTER TABLE tags ADD COLUMN created_by VARCHAR(36);
ALTER TABLE notes ADD COLUMN created_by VARCHAR(36);
-- ... repeat for all tables

-- Step 2: Migrate data (assuming UUID column exists in users table)
UPDATE tags SET created_by = (SELECT uuid FROM users WHERE users.id = tags.user_id);
UPDATE notes SET created_by = (SELECT uuid FROM users WHERE users.id = notes.user_id);
-- ... repeat for all tables

-- Step 3: Update foreign key constraints
ALTER TABLE tags DROP CONSTRAINT tags_user_id_fkey;
ALTER TABLE tags ADD CONSTRAINT tags_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE;
-- ... repeat for all tables

-- Step 4: Drop old columns
ALTER TABLE tags DROP COLUMN user_id;
ALTER TABLE notes DROP COLUMN user_id;
-- ... repeat for all tables

-- Step 5: Update indexes
DROP INDEX idx_tags_user_id;
CREATE INDEX idx_tags_created_by ON tags(created_by);
-- ... repeat for all indexes
```

## ⚠️ Migration Risks

1. **Data Loss Risk**: If UUID mapping is incorrect
2. **Downtime Required**: Database will be unavailable during migration
3. **Application Impact**: Must deploy with both schemas supported during transition
4. **Rollback Complexity**: Reversing migration is complex

## 📋 Pre-Migration Checklist

- [ ] Backup current database
- [ ] Verify all user UUID values exist
- [ ] Test migration on staging environment
- [ ] Prepare rollback script
- [ ] Schedule maintenance window
- [ ] Update all application code to handle both schemas temporarily

## 🎯 Benefits After Migration

1. **Consistency**: Models and schema match perfectly
2. **UUID Security**: No sequential user ID guessing
3. **Distributed Ready**: UUIDs work across multiple databases
4. **Future-Proof**: Better for distributed systems

## 📚 Related Documentation

- `ARCHITECTURAL_RULES.md` - Pattern documentation
- `tables_schema.sql` - Current schema (needs update)
- `app/models/` - Current SQLAlchemy models

---

**Status**: Ready for implementation
**Priority**: High - Critical for production stability
**Impact**: Application will fail without proper migration