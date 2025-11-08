# Fix BaseService Duplicate Export

**Author:** Auto (GPT-5)  
**Date:** 2025-10-31  
**Status:** Planning

## Problem
Two `BaseService` classes exist in the same file with the same name, causing the second to shadow the first:
1. **Cache-based BaseService** (lines 9-71): Takes `cache` in constructor, provides caching + low-level API methods
2. **CRUD BaseService** (lines 81-150): Takes `baseUrl` in constructor, provides high-level CRUD operations

## Detailed Usage Analysis

### Cache-based BaseService Usage
**Services:**
- `ProjectsService` (pkms-frontend/src/services/projectsService.ts:73)
- `DocumentsService` (pkms-frontend/src/services/documentsService.ts:60)

**Methods Used:**
- `getCachedData()` - 6 calls in ProjectsService, 5 calls in DocumentsService
- `apiGet()` - 8 calls total (used with custom endpoints)
- `apiPost()` - 4 calls total (custom endpoints like `/projects/{uuid}/items/documents/link`)
- `apiPut()` - 3 calls total
- `apiDelete()` - 2 calls total
- `invalidateCache()` - 11 calls total

**Pattern:** Needs flexible endpoint construction, caching wrapper, custom routes beyond baseUrl

### CRUD BaseService Usage
**Services:**
- `NotesService` (pkms-frontend/src/services/notesService.ts:96)
- `TagsService` (pkms-frontend/src/services/tagsService.ts:10)

**Methods Used:**
- `create()` - 2 calls (NotesService, TagsService)
- `getById()` - 1 call (NotesService)
- `getAll()` - 2 calls (TagsService)
- `update()` - 2 calls (NotesService, TagsService)
- `delete()` - 2 calls (NotesService, TagsService)
- `search()` - 1 call (TagsService)

**Pattern:** Standard REST CRUD operations with fixed baseUrl

## Decision: Keep Separate (NOT Merge)

### Why Separation is Better:
1. **Different Constructor Signatures:**
   - Cache-based: `constructor(cache: any)` 
   - CRUD: `constructor(baseUrl: string)`
   - Merging would require complex optional params or factory pattern

2. **Different Architectural Patterns:**
   - Cache-based: Flexible endpoints, custom routes, caching-first approach
   - CRUD: Standard REST patterns, baseUrl-based, simpler abstraction

3. **Different Use Cases:**
   - Cache-based: Complex services with custom endpoints (Projects, Documents)
   - CRUD: Simple services following standard patterns (Notes, Tags)

4. **Merging Would Add Complexity:**
   - Optional caching would complicate CRUD service
   - Optional baseUrl would complicate cache service
   - Both services would need to handle unused features

## Solution: Rename and Clean Up

### Step 1: Rename Cache-based BaseService
- Rename `BaseService` (line 9) → `CacheAwareBaseService`
- Update imports in:
  - `projectsService.ts`
  - `documentsService.ts`

### Step 2: Keep CRUD as BaseService
- Keep generic `BaseService<T, TCreate, TUpdate>` as `BaseService`
- No changes needed for:
  - `notesService.ts`
  - `tagsService.ts`

### Step 3: Clean Up Duplicates
- Remove duplicate `import { apiService }` on line 79
- Move comment block (lines 73-77) to proper location
- Update export in `services/index.ts` if needed

## Files to Modify

### Primary Changes:
1. **pkms-frontend/src/services/BaseService.ts**
   - Rename first class to `CacheAwareBaseService`
   - Remove duplicate import on line 79
   - Move/organize comments

2. **pkms-frontend/src/services/projectsService.ts**
   - Update import: `import { CacheAwareBaseService }`
   - Update extends: `extends CacheAwareBaseService`

3. **pkms-frontend/src/services/documentsService.ts**
   - Update import: `import { CacheAwareBaseService }`
   - Update extends: `extends CacheAwareBaseService`

### Verification:
4. **pkms-frontend/src/services/notesService.ts** - Should work unchanged
5. **pkms-frontend/src/services/tagsService.ts** - Should work unchanged
6. **pkms-frontend/src/services/index.ts** - Check exports

## Implementation Steps

1. ✅ Rename cache-based class in BaseService.ts
2. ✅ Remove duplicate import in BaseService.ts
3. ✅ Update projectsService.ts import and extends
4. ✅ Update documentsService.ts import and extends
5. ✅ Verify no compilation errors
6. ✅ Test that all services still work correctly

## Alternative Considered: Merge
If we wanted to merge (NOT RECOMMENDED):
- Create unified constructor: `constructor(cache?: any, baseUrl?: string)`
- Make all methods optional/enhanced
- Result: More complex, harder to maintain, violates single responsibility

**Recommendation: Keep separate for cleaner architecture**

