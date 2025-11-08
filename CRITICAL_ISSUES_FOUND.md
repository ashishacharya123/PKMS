# Critical Issues Found - Test Results

**Date:** 2025-10-31  
**Reviewer:** Auto (GPT-5)  
**Status:** ⚠️ **ISSUES FOUND - ACTION REQUIRED**

---

## 🔴 CRITICAL ISSUES

### 1. useDataLoader Hook - Invalid Dependency Array (CRITICAL BUG)

**File:** `pkms-frontend/src/hooks/useDataLoader.ts:43`

**Issue:**
```typescript
// ❌ WRONG - spreads dependencies array contents into dependency array
useCallback(async () => {
  // ...
}, [loadFn, onSuccess, onError, ...dependencies]);  // BUG HERE!
```

**Problem:**
- Spreading `...dependencies` adds individual items from the array to the dependency array
- This causes React to recreate the callback when ANY item in dependencies changes
- More importantly, if `dependencies` itself changes (new array reference), the callback won't update
- This breaks React's dependency tracking and can cause stale closures

**Fix:**
```typescript
// ✅ CORRECT - use dependencies array as-is
useCallback(async () => {
  // ...
}, [loadFn, onSuccess, onError, ...(dependencies || [])]);
```

Or better:
```typescript
const deps = [loadFn, onSuccess, onError, ...(dependencies || [])];
const loadData = useCallback(async () => {
  // ...
}, deps);
```

**Impact:** Medium-High - Can cause stale data, missed updates, infinite loops

---

### 2. Legacy Field References Still Present (HIGH PRIORITY)

**Backend Files (19 files found):**
- `pkms-backend/app/routers/notes.py`
- `pkms-backend/app/services/diary_crud_service.py`
- `pkms-backend/app/routers/diary.py`
- `pkms-backend/app/services/project_service.py`
- `pkms-backend/app/services/note_crud_service.py`
- `pkms-backend/app/models/note.py` - `is_template` (this is OK, it's the model)
- And 13 more files...

**Frontend Files (7 files found):**
- `pkms-frontend/src/services/dashboardService.ts`
- `pkms-frontend/src/services/templateService.ts`
- `pkms-frontend/src/utils/save_discard_verification.ts`
- And 4 more...

**Issue:**
- Legacy snake_case fields (`todo_count`, `completed_count`, `weather_code`, `is_template`) still referenced
- Some are OK (like model columns), but service/router layer should use camelCase via schemas
- Frontend may have direct references bypassing type conversions

**Action Required:**
```bash
# Search for remaining references
grep -r "todo_count\|completed_count" pkms-backend/app/services/
grep -r "todo_count\|completed_count" pkms-frontend/src/
grep -r "weather_code" pkms-backend/app/routers/
```

**Impact:** Medium - May cause runtime errors if backend returns snake_case but frontend expects camelCase

---

## 🟡 MEDIUM PRIORITY ISSUES

### 3. UUID Reservation Service - Found ✅

**Location:** `pkms-backend/app/services/project_service.py:43`

**Status:** EXISTS
- ✅ `reserve_project()` method found (line 43-50)
- ✅ Creates placeholder project with empty name
- ✅ Commits immediately and returns UUID
- ⚠️ **Potential Issue:** No cleanup/rollback mechanism if user cancels
- ⚠️ **Potential Issue:** No timeout/expiration for reserved projects

**Action Required:**
- Check for `reserve_note` and `reserve_diary_entry` implementations
- Verify cleanup logic for cancelled reservations
- Consider adding timeout/expiration mechanism

**Impact:** Medium - Orphaned placeholder projects may accumulate

---

### 4. Note.content Nullable - Migration Status Unknown

**File:** `pkms-backend/app/models/note.py:24`

**Status:**
```python
content = Column(Text, nullable=True)  # ✅ Model allows NULL
```

**Issue:**
- Model correctly allows NULL
- Need to verify:
  - Frontend handles NULL content gracefully
  - Preview extraction has fallback
  - Search indexing works with NULL content
  - Migration handled existing NULL records

**Action Required:**
- Check frontend note display components for NULL handling
- Verify preview generation with NULL content
- Test search with notes that have NULL content

**Impact:** Medium - Could cause UI errors or missing search results

---

## ✅ VERIFIED AS CORRECT

### 1. Error Handler Decorator ✅

**File:** `pkms-backend/app/decorators/error_handler.py`

**Status:** CORRECT
- ✅ Proper exception propagation with `from e` (line 51, 79)
- ✅ HTTPException re-raised as-is (lines 29-31, 66-67)
- ✅ User context extraction works (lines 34-45, 69-74)
- ✅ Logging includes user UUID
- ✅ No exceptions swallowed

---

### 2. Timezone Normalization ✅

**File:** `pkms-backend/app/routers/auth.py`

**Status:** CORRECT
- ✅ Uses `datetime.now(NEPAL_TZ)` consistently (24 occurrences)
- ✅ Handles None timezone (lines 296-297, 563-564)
- ✅ Normalizes naive datetimes (lines 296-297)
- ✅ All expires_at comparisons are timezone-aware

---

### 3. useModal Hook ✅

**File:** `pkms-frontend/src/hooks/useModal.ts`

**Status:** MOSTLY CORRECT
- ✅ Proper cleanup on close (sets state to null)
- ✅ Callbacks are memoized with useCallback
- ⚠️ **Minor:** No URL parameter cleanup logic in hook itself
  - This should be handled by components using the hook
  - Consider adding optional URL sync feature

---

### 4. BaseCRUDService - Needs Type Safety Review

**Status:** NOT FULLY TESTED
- File not read in this review
- Should verify generic type parameters
- Check response schema conversions

**Action Required:**
- Read and test BaseCRUDService implementation
- Verify generic type inference
- Test CamelCaseModel conversions

---

## 📋 RECOMMENDATIONS

### Immediate Actions (Before Production):
1. **FIX useDataLoader dependency array bug** (Critical)
2. **Audit and fix legacy field references** (High Priority)
3. **Test NULL content handling in notes** (Medium Priority)

### Short-term (Next Sprint):
4. **Locate or document UUID reservation service** (If feature exists)
5. **Add URL parameter cleanup to useModal** (Nice to have)
6. **Review BaseCRUDService type safety** (Architecture review)

### Testing Required:
- [ ] Test useDataLoader with changing dependencies
- [ ] Test note display with NULL content
- [ ] Test search with NULL content notes
- [ ] Integration test: concurrent UUID reservations (if feature exists)
- [ ] Test modal cleanup on navigation

---

## 🔍 FILES TO REVIEW NEXT

1. `pkms-backend/app/services/BaseCRUDService.py` - Type safety review
2. Frontend note display components - NULL content handling
3. UUID reservation implementation - Locate or remove references
4. Legacy field audit - Complete migration

---

**Next Steps:**
1. Fix critical useDataLoader bug immediately
2. Run comprehensive legacy field audit
3. Test NULL content scenarios
4. Review BaseCRUDService implementation

