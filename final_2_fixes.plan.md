<!-- Plan Mode Header -->
# Final 2 Fixes - Production Readiness

## Overview
Fix 13 additional critical errors for production readiness. These issues affect search indexing, data integrity, security, and type safety across the application. All fixes follow ARCHITECTURAL_RULES.md patterns and maintain consistency with the virgin database approach.

**Legacy Comments Removal:** Yes - continuing cleanup from first batch. All stale comments, dead code, and non-functional references will be removed and documented in DEVELOPMENTAL_COMMENTS.md.

## Priority Classification
- **🔥 Critical (Security/Runtime)**: Issues 4, 5, 11 - Will cause runtime crashes or security vulnerabilities
- **⚠️ High (Data Integrity)**: Issues 1, 2, 6, 7, 8 - Incorrect data/statistics shown to users
- **📊 Medium (Type Safety/Code Quality)**: Issues 3, 9, 10, 12, 13 - Compilation errors and maintainability

## Issues to Fix

### 1. Backend: Search Service - Don't Index Soft-Deleted Rows ⚠️
**File:** `pkms-backend/app/services/search_service.py`

**Problem:** 
- FTS indexing includes soft-deleted items (lines 346-396)
- Bloats search index and causes stale search results
- Users can accidentally find deleted content

**Solution:** 
Add `is_deleted.is_(False)` filter to 7 bulk indexing queries:
```python
# Example for Notes
notes_result = await db.execute(
    select(Note)
    .options(selectinload(Note.tag_objs))
    .where(Note.created_by == created_by, Note.is_deleted.is_(False))
)
```

Apply to: Notes, Documents, Todos, Projects, DiaryEntries, ArchiveFolders, ArchiveItems

**Line 50-56:** Add skip check in individual indexing:
```python
try:
    # Skip soft-deleted items
    if getattr(item, 'is_deleted', False):
        return
    # ... rest of indexing logic
```

**Line 141-145:** Update docstring to remove caching references (caching was removed).

**Impact:** Cleaner FTS index, faster searches, no stale deleted content in results

### 2. Backend: Search Service - Fix Diary Attachments (Non-Existent Field) ⚠️
**Files:** 
- `pkms-backend/app/services/search_service.py` (lines 263-271)
- `pkms-backend/app/routers/advanced_fuzzy.py` (lines 138, 301)

**Problem:** 
- References non-existent `DiaryEntry.media` relationship (should be `documents`)
- References non-existent `entry.media_count` attribute (should be `file_count`)
- Will cause runtime `AttributeError`

**Solution:**
```python
# search_service.py line 263-271
entry_with_docs = await db.execute(
    select(DiaryEntry)
    .options(selectinload(DiaryEntry.documents))  # ← Change from .media
    .where(DiaryEntry.uuid == item.uuid)
)
entry = entry_with_docs.scalar_one_or_none()
if entry and entry.documents:  # ← Change from .media
    attachments.extend([d.filename for d in entry.documents if d.filename])

# Check for attachments
return getattr(item, 'file_count', 0) > 0  # ← Change from media_count
```

**advanced_fuzzy.py lines 138 & 301:** Change `entry.media_count` to `entry.file_count`

**Impact:** Prevents runtime crashes, correct attachment counts in search results

### 3. Backend: Testing Database - Fix Exception Handling 📊
**File:** `pkms-backend/app/testing/testing_database_enhanced.py` (lines 92-96, 108-112)

**Problem:** 
- Overly broad `except Exception` masks programming errors
- Catches `KeyboardInterrupt`, `SystemExit`, making debugging harder
- No exception context preserved

**Solution:**
```python
# Add import at top
from sqlalchemy.exc import SQLAlchemyError

# Lines 92-96 and 108-112
except (SQLAlchemyError, ValueError, AttributeError) as e:
    logger.exception("Error getting stats for %s", table_name)
    stats[f"{table_name}_count"] = 0
```

**Impact:** Better debugging, doesn't mask critical exceptions, cleaner error logs

### 4. Backend: Tag Sync Service - Fix Todo ID Type Mismatch 🔥
**File:** `pkms-backend/app/services/tag_sync_service.py` (lines 91-116)

**Problem:** 
- Function signature: `sync_todo_tags(db: AsyncSession, todo_id: int)`
- But `Todo.uuid` is `VARCHAR(36)` (string), not integer
- Query `Todo.uuid == todo_id` will NEVER match, causing silent failures
- Tags won't sync for todos

**Solution:**
```python
async def sync_todo_tags(db: AsyncSession, todo_uuid: str) -> bool:  # ← Change int to str
    """Sync tags_text field for a single todo based on associated tags."""
    try:
        result = await db.execute(
            select(Todo).options(selectinload(Todo.tag_objs))
            .where(Todo.uuid == todo_uuid)  # ← Change todo_id to todo_uuid
        )
        todo = result.scalar_one_or_none()
        if not todo:
            logger.warning(f"Todo {todo_uuid} not found for tag sync")  # ← Update log
            return False

        # ... rest of function

        logger.debug(f"Synced tags_text for todo {todo_uuid}: {tags_text}")  # ← Update log
        return True

    except Exception as e:
        logger.error(f"Failed to sync tags_text for todo {todo_uuid}: {e}")  # ← Update log
        return False
```

**Impact:** Tag syncing will actually work for todos, fixing major functionality bug

### 5. Backend: Diary Session Service - Fix Key Zeroization (Security) 🔥
**File:** `pkms-backend/app/services/diary_session_service.py` (lines 85-97, 117-135, 172-185)

**Problem:** 
- Encryption keys stored as `bytes` (immutable in Python)
- Key wiping via `key[i] = 0` has no effect on immutable objects
- Sensitive key material remains in memory after "wiping"
- Security vulnerability for encrypted diary data

**Solution:**
```python
# Line 85-97: Change return type
def derive_encryption_key(password: str, salt: bytes | None = None) -> tuple[bytearray, bytes]:
    """Derive encryption key from password using PBKDF2."""
    if salt is None:
        salt = os.urandom(16)
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key_bytes = kdf.derive(password.encode("utf-8"))
    return bytearray(key_bytes), salt  # ← Return bytearray, not bytes
```

**Lines 117-135:** Update session storage to handle `bytearray`
**Lines 172-185:** Update session retrieval to return `bytearray`

**Impact:** Proper memory wiping, improved security for diary encryption keys

### 6. Backend: Habit Data Service - Filter Soft-Deleted Items from Stats ⚠️
**File:** `pkms-backend/app/services/habit_data_service.py`

**Problem:** 
- Statistics queries include soft-deleted and archived items
- Dashboard shows inflated counts (includes deleted/archived content)
- Users see incorrect productivity metrics
- Affects 7 different count queries (lines 433-503)

**Solution:** Add filters to all count queries:

**Lines 433-441 (Notes):**
```python
select(func.count(Note.uuid)).where(
    and_(
        Note.created_by == user_uuid,
        Note.is_deleted.is_(False),  # ← Add
        func.date(Note.created_at) >= start_date,
        func.date(Note.created_at) <= end_date,
    )
)
```

**Lines 444-451 (Documents):**
```python
select(func.count(Document.uuid)).where(
    and_(
        Document.created_by == user_uuid,
        Document.is_deleted.is_(False),  # ← Add
        Document.is_archived.is_(False),  # ← Add
        func.date(Document.created_at) >= start_date,
        func.date(Document.created_at) <= end_date,
    )
)
```

Apply similar filters to:
- **Lines 453-462:** Todos
- **Lines 464-472:** DiaryEntries  
- **Lines 474-482:** ArchiveItems
- **Lines 484-492:** Projects
- **Lines 494-503:** Additional counts

**Impact:** Accurate productivity statistics, correct dashboard counts

### 7. Backend: Habit Data Service - Fix Calendar Data Filters
**File:** `pkms-backend/app/services/habit_data_service.py` (lines 288-304, 306-321)

**Problem:** Calendar data includes deleted documents/entries.

**Solution:** Add soft-delete filters to both subquery and main query for diary and document calendar data.

### 8. Backend: Habit Data Service - Fix Response Shape
**File:** `pkms-backend/app/services/habit_data_service.py` (lines 238-248)

**Problem:** Response shape inconsistency - flattened fields instead of nested `metrics` dict.

**Solution:** Restructure response to match schema with proper `metrics` nesting and correct field names.

### 9. Backend: Dashboard Router - Fix Documentation
**File:** `pkms-backend/app/routers/dashboard.py` (lines 62-73)

**Problem:** Docstring says 7 days but default is 3 days.

**Solution:** Update docstring to match actual default value.

### 10. Backend: Dashboard Router - Fix Exception Handling
**File:** `pkms-backend/app/routers/dashboard.py` (lines 55-59, 76-81, 95-101, 124-128)

**Problem:** F-string logging and missing exception chaining.

**Solution:**
- Use parameterized logging (`%s` instead of f-strings)
- Add `raise ... from e` for proper exception chaining
- Apply to all dashboard handlers

### 11. Backend: Dashboard Router - Remove Non-Existent Method Calls 🔥
**Files:** 
- `pkms-backend/app/routers/dashboard.py` (lines 25-41, 173)
- `pkms-backend/app/routers/diary.py` (line 776)

**Problem:** 
- 3 calls to non-existent `dashboard_service.invalidate_user_cache()` method
- Method doesn't exist anywhere in codebase (verified)
- Will cause `AttributeError` at runtime
- Breaks dashboard refresh and diary operations

**Solution:** Remove all calls:
```python
# dashboard.py lines 25-41
# REMOVE THIS BLOCK:
# dashboard_service.invalidate_user_cache(current_user.uuid)

# dashboard.py line 173
# REMOVE THIS CALL:
# await dashboard_service.invalidate_user_cache(current_user.uuid)

# diary.py line 776
# REMOVE THIS CALL:
# await dashboard_service.invalidate_user_cache(current_user.uuid)
```

**Note:** If cache invalidation is needed, implement the method properly or use alternative cache strategy.

**Impact:** Prevents runtime crashes in dashboard and diary operations

### 12. Frontend: Todos Service - Fix Export Endpoint
**File:** `pkms-frontend/src/services/todosService.ts` (lines 155-157)

**Problem:** References non-existent export endpoint with wrong parameter type (number vs UUID).

**Solution:** Either remove the function or implement proper backend endpoint with UUID parameter.

### 13. Frontend: Dashboard Page - Fix Type Import
**File:** `pkms-frontend/src/pages/DashboardPage.tsx` (lines 157-159)

**Problem:** `Project` type not imported, causing TypeScript compilation errors.

**Solution:** Import correct `Project` type and remove unused `LegacyProject`.

## Implementation Order

### Phase 1: Critical Fixes (Do First) 🔥
1. **Issue 11** - Remove non-existent method calls (prevents runtime crashes)
2. **Issue 4** - Fix todo ID type mismatch (fixes tag syncing)
3. **Issue 5** - Fix key zeroization (security vulnerability)

### Phase 2: Data Integrity ⚠️
4. **Issue 1** - Filter soft-deleted from search index
5. **Issue 2** - Fix diary attachments field references
6. **Issue 6** - Filter soft-deleted from habit statistics
7. **Issue 7** - Fix calendar data filters
8. **Issue 8** - Fix habit response shape

### Phase 3: Code Quality & Type Safety 📊
9. **Issue 3** - Fix exception handling
10. **Issue 9** - Fix documentation mismatch
11. **Issue 10** - Fix exception chaining patterns
12. **Issue 12** - Fix/remove export endpoint
13. **Issue 13** - Fix TypeScript type import

## Files to Modify

**Backend (8 files):**
1. `pkms-backend/app/services/search_service.py` - Issues 1, 2
2. `pkms-backend/app/routers/advanced_fuzzy.py` - Issue 2
3. `pkms-backend/app/testing/testing_database_enhanced.py` - Issue 3
4. `pkms-backend/app/services/tag_sync_service.py` - Issue 4
5. `pkms-backend/app/services/diary_session_service.py` - Issue 5
6. `pkms-backend/app/services/habit_data_service.py` - Issues 6, 7, 8
7. `pkms-backend/app/routers/dashboard.py` - Issues 9, 10, 11
8. `pkms-backend/app/routers/diary.py` - Issue 11

**Frontend (2 files):**
9. `pkms-frontend/src/services/todosService.ts` - Issue 12
10. `pkms-frontend/src/pages/DashboardPage.tsx` - Issue 13

## Documentation Updates
- Update `ERROR_FIX_DOCUMENTATION.md` with all 13 fixes
- Update `DEVELOPMENTAL_COMMENTS.md` with removed/changed functionality
- AI Agent: Claude Sonnet 4.5
- Date: 2025-01-27

## Architectural Compliance
All fixes follow:
- ✅ ARCHITECTURAL_RULES.md Rule #11 (SQLAlchemy Query Patterns with `and_()`)
- ✅ SoftDeleteMixin usage patterns (`is_deleted.is_(False)`)
- ✅ Proper exception handling and chaining (`raise ... from e`)
- ✅ Type safety and consistency (UUID strings, not integers)
- ✅ Security best practices (mutable keys for zeroization)
- ✅ Performance optimization (cleaner FTS index)
- ✅ Virgin database approach (no migration scripts needed)

## Testing Checklist
After implementation, verify:
- [ ] Search doesn't return deleted items
- [ ] Diary attachments load correctly
- [ ] Todo tag syncing works
- [ ] Dashboard statistics are accurate
- [ ] Calendar data is correct
- [ ] No runtime errors from missing methods
- [ ] TypeScript compiles without errors
- [ ] All linter errors resolved

## Additional Improvements (Based on Review)

### 1. Cross-Reference Validation
Before implementing fixes, validate no other similar issues exist:
```bash
# Check for other media_count references
grep -r "media_count" pkms-backend/app/

# Check for other .media references (exclude multimedia)
grep -r "\.media" pkms-backend/app/ | grep -v "multimedia"

# Check for other todo_id vs todo_uuid mismatches
grep -r "todo_id.*int" pkms-backend/app/
```

### 2. Security Enhancement (Issue 5)
Add key zeroization validation:
```python
def _validate_key_wipe(key_buf: bytearray) -> bool:
    """Verify key material was properly zeroized."""
    return all(b == 0 for b in key_buf)

# In secure wipe function
if isinstance(key_buf, (bytearray, memoryview)):
    key_buf[:] = b"\x00" * len(key_buf)
    if not _validate_key_wipe(key_buf):
        logger.warning("Key zeroization may have failed")
```

### 3. Soft-Delete Pattern Standardization
Create helper function for consistency:
```python
# In shared_utilities_service.py or base.py
def add_soft_delete_filter(query, model_alias=None):
    """Add standard soft-delete filter to query."""
    model = model_alias or query.column_descriptions[0]['type']
    return query.where(model.is_deleted.is_(False))
```

### 4. Frontend Error Handling (Issue 12)
Instead of removing export endpoint, add graceful handling:
```typescript
async exportTodo(todoUuid: string, format: 'pdf' | 'markdown' | 'txt' = 'pdf'): Promise<void> {
  try {
    const response = await fetch(`${this.baseUrl}/${todoUuid}/export?format=${format}`);
    if (response.status === 404) {
      console.warn('Export functionality not yet implemented');
      return;
    }
    // Handle successful export when implemented
  } catch (error) {
    console.warn('Export endpoint not available:', error);
  }
}
```

### 5. FTS Index Optimization (Issue 1)
Add index optimization after cleanup:
```python
async def optimize_fts_index(db: AsyncSession):
    """Optimize FTS index after soft-delete cleanup."""
    await db.execute(text("INSERT INTO search_index(search_index) VALUES('optimize')"))
    await db.commit()
```

## Documentation Updates (Enhanced)

### Update DEVELOPMENTAL_COMMENTS.md
Add architectural decision log:
```markdown
## Architectural Decisions Made (2025-01-27 - Final 2 Fixes)

### Soft-Delete Pattern Standardization
**Decision:** Implemented consistent `is_deleted.is_(False)` filtering across all services
**Reasoning:** Prevents data pollution in search index, statistics, and dashboard
**Files Affected:** search_service.py, habit_data_service.py, shared_utilities_service.py
**Pattern:** Always use `Model.is_deleted.is_(False)` in queries for active records

### UUID Parameter Consistency
**Decision:** Standardized on UUID strings (VARCHAR(36)) for all todo operations
**Reasoning:** Matches database schema, prevents silent query failures
**Impact:** tag_sync_service.py parameter types and query logic
**Breaking Change:** None - internal fix, no API changes

### Encryption Key Security
**Decision:** Use bytearray for encryption keys instead of bytes
**Reasoning:** Allows proper memory zeroization for security
**Impact:** diary_session_service.py key storage and handling
**Security Benefit:** Sensitive key material can be wiped from memory

### Non-Existent Method Cleanup
**Decision:** Remove all calls to dashboard_service.invalidate_user_cache()
**Reasoning:** Method doesn't exist, causing runtime AttributeError
**Future:** If cache invalidation needed, implement properly or use alternative
**Files Cleaned:** dashboard.py, diary.py
```

## To-dos
- [ ] Run cross-reference validation checks (grep commands)
- [ ] Fix search service soft-delete filtering (Issue 1)
- [ ] Fix diary attachments field references (Issue 2)
- [ ] Fix testing database exception handling (Issue 3)
- [ ] Fix todo ID type mismatch (Issue 4)
- [ ] Fix encryption key zeroization with validation (Issue 5)
- [ ] Filter soft-deleted items from habit stats (Issue 6)
- [ ] Fix calendar data filters (Issue 7)
- [ ] Fix habit response shape (Issue 8)
- [ ] Fix dashboard documentation mismatch (Issue 9)
- [ ] Fix dashboard exception chaining (Issue 10)
- [ ] Remove non-existent method calls (Issue 11)
- [ ] Add graceful error handling for export endpoint (Issue 12)
- [ ] Fix TypeScript type import (Issue 13)
- [ ] Add FTS index optimization function
- [ ] Create soft-delete helper function
- [ ] Update ERROR_FIX_DOCUMENTATION.md with architectural decisions
- [ ] Update DEVELOPMENTAL_COMMENTS.md with decision log
