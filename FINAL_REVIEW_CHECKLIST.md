# Final Review Checklist - Critical Areas Requiring Attention

**Branch:** `fix/final-fixes`  
**Status:** Pre-Production Review  
**Created:** 2025-10-31  
**AI Agent:** Auto (GPT-5)

## Overview
This checklist identifies critical areas that require thorough review before production deployment. These are areas where subtle bugs, race conditions, or architectural inconsistencies could impact stability and user experience.

---

## 1. Hook Architecture & Patterns

### useDataLoader
- [ ] Verify generic type safety across all usages
- [ ] Validate correct dependency arrays in useEffect/useCallback
- [ ] Review closure-based state management for stale closure issues
- [ ] Check memory leaks: ensure proper cleanup in useEffect return functions
- [ ] Validate error propagation to ErrorState components
- [ ] Test refetch triggers after mutations (create/update/delete operations)

### useErrorHandler
- [ ] Confirm proper error boundary integration
- [ ] Verify user-friendly error message generation
- [ ] Check error logging accuracy with user context
- [ ] Validate error state cleanup on recovery

### useForm
- [ ] Review form validation logic
- [ ] Verify form state persistence across navigation
- [ ] Check reset/clear functionality
- [ ] Validate async submission handling

### useModal
- [ ] Verify modal lifecycle management
- [ ] Check URL parameter cleanup on modal close
- [ ] Review timer cleanup (setTimeout/setInterval)
- [ ] Validate modal state reset on unmount
- [ ] Check memory leaks from event listeners

**Files to Review:**
- `pkms-frontend/src/hooks/useDataLoader.ts`
- `pkms-frontend/src/hooks/useErrorHandler.ts`
- `pkms-frontend/src/hooks/useForm.ts`
- `pkms-frontend/src/hooks/useModal.ts`
- All pages using these hooks (NotesPage, ProjectsPage, DocumentsPage, etc.)

---

## 2. Error-Handling Decorator

### handle_api_errors (async/sync)
- [ ] Verify proper exception propagation (no swallowed exceptions)
- [ ] Validate logging accuracy with user context extraction
- [ ] Review rollback behavior in service layer transactions
- [ ] Check decorator application consistency across all routers
- [ ] Verify error response format consistency
- [ ] Test error handling for network failures vs. API errors

**Files to Review:**
- `pkms-backend/app/decorators/error_handler.py`
- All router files using `@handle_api_errors`
- Service layer error handling

---

## 3. Optimistic UUID Flows

### reserve_note / reserve_diary_entry / reserve_project
- [ ] Verify atomic DB operations (no partial states)
- [ ] Validate proper discard/cleanup on user cancel
- [ ] Check handling of concurrent reserve requests (race conditions)
- [ ] Review client-side UUID collision handling
- [ ] Verify timeout/expiration of reserved UUIDs
- [ ] Test cleanup of orphaned reservations

**Files to Review:**
- `pkms-backend/app/services/entity_reserve_service.py`
- Frontend UUID reservation logic
- Cleanup jobs/scheduled tasks

---

## 4. BaseCRUDService Generic Implementation

### Type Safety
- [ ] Review parameterized generics across all services
- [ ] Validate type inference in derived services
- [ ] Check response schema conversions (CamelCaseModel)
- [ ] Verify proper type constraints

### Soft-Delete Filtering
- [ ] Validate soft-delete logic in query filters
- [ ] Check include_deleted parameter handling
- [ ] Review cascade delete behavior
- [ ] Verify restoration logic

### Relationship Loading
- [ ] Review eager loading strategies (tag_objs, etc.)
- [ ] Check N+1 query prevention
- [ ] Validate relationship serialization
- [ ] Test performance with large datasets

**Files to Review:**
- `pkms-backend/app/services/BaseCRUDService.py`
- All services extending BaseCRUDService
- Response schema definitions

---

## 5. Page Refactors to Data-Loader + Modal Patterns

### Refetch Triggers
- [ ] Verify post-mutation refetch (create/update/delete)
- [ ] Check cache invalidation triggers
- [ ] Validate optimistic updates vs. server sync
- [ ] Test concurrent mutation handling

### Modal Lifecycle
- [ ] Verify URL parameter cleanup on modal close
- [ ] Check timer cleanup (setTimeout/setInterval)
- [ ] Review modal state persistence
- [ ] Validate navigation handling with open modals

### Error Propagation
- [ ] Verify error propagation to ErrorState components
- [ ] Check error display and retry functionality
- [ ] Validate error recovery flows

### Dependency Arrays
- [ ] Review useCallback dependency arrays (no missing deps)
- [ ] Check useEffect dependency arrays
- [ ] Verify useMemo dependencies
- [ ] Test for stale closure issues

**Files to Review:**
- `pkms-frontend/src/pages/NotesPage.tsx`
- `pkms-frontend/src/pages/ProjectsPage.tsx`
- `pkms-frontend/src/pages/DocumentsPage.tsx`
- `pkms-frontend/src/pages/TodosPage.tsx`
- All refactored pages

---

## 6. ContentViewerPage & ContentViewer Generics

### Item-to-Content Mapping
- [ ] Verify flexibility across note/diary/document contexts
- [ ] Check content transformation logic
- [ ] Validate file attachment handling
- [ ] Review preview generation

### File Transformation
- [ ] Verify correct file transformation across contexts
- [ ] Check MIME type handling
- [ ] Validate thumbnail generation
- [ ] Review encryption/decryption flows (diary)

**Files to Review:**
- `pkms-frontend/src/components/common/ContentViewer.tsx`
- `pkms-frontend/src/components/common/ContentViewerPage.tsx`
- File transformation utilities

---

## 7. Field Naming Migrations

### Backend → Frontend Consistency
- [ ] Search for missed references: `todo_count` → `todoCount`
- [ ] Search for missed references: `weather_code` → `weatherCode`
- [ ] Search for missed references: `is_template` → `isTemplate`
- [ ] Verify API contract consistency (snake_case ↔ camelCase)
- [ ] Check database column names vs. API response fields
- [ ] Validate frontend type definitions match backend schemas

**Search Patterns:**
```bash
# Backend
grep -r "todo_count\|completed_count" pkms-backend/
grep -r "weather_code" pkms-backend/
grep -r "is_template" pkms-backend/

# Frontend
grep -r "todo_count\|completed_count" pkms-frontend/
grep -r "weather_code" pkms-frontend/
grep -r "is_template" pkms-frontend/
```

**Files to Review:**
- All backend schemas (CamelCaseModel conversions)
- All frontend type definitions
- API response contracts

---

## 8. Nullable Note.content Schema Change

### Migration Strategy
- [ ] Verify migration handles existing NULL content gracefully
- [ ] Check preview extraction fallbacks (empty string handling)
- [ ] Validate content-file vs. DB content logic coherence
- [ ] Review note creation/update flows with NULL content
- [ ] Test note display with NULL/missing content
- [ ] Verify search indexing with NULL content

**Files to Review:**
- `pkms-backend/app/models/note.py`
- `pkms-backend/app/services/note_service.py`
- `pkms-frontend/src/services/notesService.ts`
- Note preview/display components

---

## 9. Diary Timezone Normalization

### Timezone-Aware DateTime Conversions
- [ ] Verify auth.py `expires_at` timezone handling
- [ ] Check useDateTime cache timezone consistency
- [ ] Validate cache invalidation on timezone changes
- [ ] Review handling of None/naive datetimes
- [ ] Test diary entry creation with different timezones
- [ ] Verify calendar display with timezone offsets

**Files to Review:**
- `pkms-backend/app/routers/auth.py` (expires_at)
- `pkms-frontend/src/hooks/useDateTime.ts`
- `pkms-frontend/src/utils/nepaliDateCache.ts`
- Diary entry creation/display logic

---

## Testing Recommendations

### Integration Tests
- [ ] Test UUID reservation with concurrent requests
- [ ] Test soft-delete restoration flows
- [ ] Test modal cleanup on navigation
- [ ] Test error recovery flows

### Performance Tests
- [ ] Test BaseCRUDService with large datasets
- [ ] Test eager loading performance
- [ ] Test cache invalidation performance
- [ ] Test diary timezone conversion performance

### Edge Cases
- [ ] Test NULL content handling in notes
- [ ] Test expired UUID reservations
- [ ] Test concurrent mutations
- [ ] Test network failure recovery

---

## Review Priority

### Critical (Must Fix Before Production)
1. Hook architecture memory leaks
2. Error-handling decorator exception propagation
3. UUID reservation race conditions
4. Timezone normalization inconsistencies

### High (Should Fix Soon)
5. Field naming migration completeness
6. BaseCRUDService type safety
7. Modal lifecycle cleanup
8. Nullable Note.content migration

### Medium (Nice to Have)
9. ContentViewer generics flexibility
10. Page refactor dependency arrays
11. Performance optimizations

---

## Review Assignment

- [ ] **Backend Team:** Error decorator, UUID flows, BaseCRUDService, field migrations
- [ ] **Frontend Team:** Hook patterns, modal lifecycle, ContentViewer, page refactors
- [ ] **Full-Stack:** Timezone normalization, nullable content, API contracts

---

## Sign-Off

- [ ] All critical items reviewed and validated
- [ ] High priority items addressed
- [ ] Integration tests passing
- [ ] Performance benchmarks met
- [ ] Ready for production deployment

**Reviewer:** _________________  
**Date:** _________________  
**Notes:** _________________

