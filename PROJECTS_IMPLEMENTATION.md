# Project System - Complete Implementation Guide

## Feature Matrix

| Feature | Status | Frontend Files | Backend Files | Endpoints |
|---------|--------|---------------|---------------|-----------|
| Basic CRUD | ✅ Working | todosService.ts, projectApi.ts | projects.py, project_service.py | POST/GET/PUT/DELETE /projects |
| Item Linking | ✅ Working | projectApi.ts | projects.py | POST /projects/{uuid}/items/{type}/link |
| Exclusive Files | ✅ Working | projectApi.ts, FileSection.tsx | project_service.py | Handled via is_exclusive flag |
| Delete Preflight | ✅ Working | projectApi.ts | delete_preflight.py | GET /delete-preflight/{type}/{uuid} |
| Soft Delete | ✅ Working | todosService.ts | project_service.py | DELETE /projects/{uuid} |
| Hard Delete | ❌ Missing | N/A | N/A | N/A |

---

## 1. Basic CRUD Operations

### ✅ Create Project
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 59-62
- Function: `createProject(projectData): Promise<Project>`
- JSON Body (camelCase): `{ name, description, priority, tags, startDate, dueDate }`

**Backend**: `pkms-backend/app/routers/projects.py` Line 29-48
- Endpoint: `POST /projects`
- Service: `project_service.py` Line 34-82

### ✅ Get Project
**Backend**: `pkms-backend/app/routers/projects.py` Line 71-88
- Endpoint: `GET /projects/{project_uuid}`
- Returns: Project with todo counts, tags

### ✅ Update Project
**Backend**: `pkms-backend/app/routers/projects.py` Line 90-108
- Endpoint: `PUT /projects/{project_uuid}`
- JSON Body (camelCase): `{ name, description, priority, tags }`

### ✅ Delete Project (Soft)
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 70-73
- Function: `deleteProject(projectUuid: string): Promise<void>`

**Backend**: `pkms-backend/app/routers/projects.py` Line 110-127
- Endpoint: `DELETE /projects/{project_uuid}`
- Service: `project_service.py` Line 192-265

### ✅ List Projects
**Backend**: `pkms-backend/app/routers/projects.py` Line 51-68
- Endpoint: `GET /projects?archived={bool}&tag={name}`
- URL Params (snake_case): `archived`, `tag`
- Filters by `is_deleted.is_(False)` automatically
- Service: `project_service.py` Line 84-119

---

## 2. Project Items (Polymorphic Association)

### Database Table: project_items
**File**: `pkms-backend/app/models/associations.py` Lines 59-76

Fields:
- `project_uuid` (FK to projects)
- `item_type` ('Document', 'Note', 'Todo')
- `item_uuid` (polymorphic, no FK)
- `sort_order` (for ordering items)
- `is_exclusive` (boolean) - Item belongs ONLY to this project
- `created_at`, `updated_at`

Constraints:
- UniqueConstraint: `(project_uuid, item_type, item_uuid)` - Prevents duplicate links
- Index: `(project_uuid, sort_order)`
- Index: `(item_type, item_uuid)`

### ✅ Link Items to Project
**Frontend**: `pkms-frontend/src/services/projectApi.ts` Line 64-91
- Function: `linkDocuments(projectUuid, documentUuids, areItemsExclusive): Promise<void>`
- Includes preflight check if exclusive (Lines 70-84)
- JSON Body (camelCase): `{ documentUuids: string[], areItemsExclusive: boolean }`

**Backend**: `pkms-backend/app/routers/projects.py` Line 277-298
- Endpoint: `POST /projects/{project_uuid}/items/{item_type}/link`
- URL Param: `item_type` (documents, notes, todos)
- JSON Body (camelCase): `{ documentUuids, areItemsExclusive }`
- Service: `project_service.py` Line 397-475

### ✅ Unlink Item from Project
**Frontend**: `pkms-frontend/src/services/projectApi.ts` Line 96-104
- Function: `unlinkDocument(projectUuid, documentUuid): Promise<void>`
- JSON Body (camelCase): `{ documentUuid: string }`

**Backend**: `pkms-backend/app/routers/projects.py` Line 301-319
- Endpoint: `POST /projects/{project_uuid}/items/{item_type}/unlink`
- JSON Body (camelCase): `{ documentUuid }`
- Service: `project_service.py` Line 477-525

### ✅ Reorder Items
**Frontend**: `pkms-frontend/src/services/projectApi.ts` Line 44-59
- Function: `reorderDocuments(projectUuid, documentUuids, ifUnmodifiedSince): Promise<void>`
- JSON Body (camelCase): `{ documentUuids: string[] }`

**Backend**: `pkms-backend/app/routers/projects.py` Line 256-274
- Endpoint: `PATCH /projects/{project_uuid}/items/{item_type}/reorder`
- JSON Body (camelCase): `{ documentUuids }`
- Service: `project_service.py` Line 349-395

### ✅ Get Project Items
**Backend**: `pkms-backend/app/routers/projects.py` Line 129-146
- Endpoint: `GET /projects/{project_uuid}/items?item_type={type}`
- URL Param (snake_case): `item_type` (documents, notes, todos)
- Service: `project_service.py` Line 270-348

---

## 3. Exclusive Files System

### What is Exclusive?
- `is_exclusive = True` means item belongs ONLY to this project
- When project deleted, exclusive items are deleted
- Non-exclusive items can be shared across projects

### Rules:
1. Item CAN be linked to multiple projects (non-exclusive)
2. Item CANNOT be exclusive to multiple projects (UniqueConstraint prevents this)
3. If exclusive to Project A, can't link to Project B

### Example Scenarios:
- Doc A → Project 1 (exclusive): Can't link to Project 2
- Doc B → Project 1 (non-exclusive): Can also link to Project 2 (non-exclusive)
- Doc C → Project 1 + Project 2 (both non-exclusive): Shared between projects

### ✅ Delete Preflight Check
**Frontend**: `pkms-frontend/src/services/projectApi.ts` Lines 122-130
- Function: `getDeletePreflight(itemType, itemUuid): Promise<DeletePreflightResponse>`
- Returns: `{ canDelete, linkCount, linkedItems, warningMessage }`

**Backend**: `pkms-backend/app/routers/delete_preflight.py` Lines 27-57
- Endpoint: `GET /delete-preflight/{item_type}/{item_uuid}/delete-preflight`
- URL Params: `item_type` (document, note, todo, note_file, diary_file)
- Service: `link_count_service.py`

**Used By**:
- `projectApi.ts` Line 72: Before linking exclusive documents
- `diaryService.ts` Line 338: Before linking to diary
- `FileSection.tsx` Line 121: When making files exclusive

---

## 4. Project Deletion

### ✅ Soft Delete (Current Implementation)
**Service**: `pkms-backend/app/services/project_service.py` Lines 192-265

**Step 1**: Get project (Lines 194-205)
- Verify exists and user owns it
- Check not already deleted

**Step 2**: Get exclusive items (Lines 207-217)
```python
SELECT item_type, item_uuid FROM project_items
WHERE project_uuid = ? AND is_exclusive = True
```

**Step 3**: Soft delete project (Lines 219-221)
```python
project.is_deleted = True
```

**Step 4**: Soft delete exclusive items (Lines 223-256)
For each exclusive item:
- **Note**: Set `is_deleted = True`, delete physical file (Lines 225-241)
- **Document**: Set `is_deleted = True` (Lines 242-248)
- **Todo**: Set `is_deleted = True` (Lines 249-255)

**Step 5**: Commit and cleanup (Lines 257-263)
- Remove from search index
- Invalidate dashboard cache

**Result**:
- Project hidden from lists (filtered by `is_deleted.is_(False)`)
- Exclusive items hidden from their lists
- Non-exclusive items still visible
- Physical note files deleted from filesystem
- Database records remain (soft delete)

### ❌ Hard Delete (Not Implemented)
**What's Missing**:
- No permanent deletion endpoint
- No cleanup of soft-deleted items
- No link count checking during deletion

**What SHOULD Happen**:
1. Check link count for each item
2. If item has other links: Keep it, remove association only
3. If item is orphan (zero links): Permanently delete
4. Delete physical files
5. Delete database records

**Recommendation**: Add `DELETE /projects/{project_uuid}/hard` endpoint

---

## 5. Data Flow Examples

### Linking Document (Exclusive):
1. User clicks "Link Document" with exclusive checkbox
2. Frontend calls `projectApi.linkDocuments(projectUuid, [docUuid], true)`
3. **Preflight Check** (Line 72):
   - Calls `getDeletePreflight('document', docUuid)`
   - If `linkCount > 0`: Show warning
   - User confirms or cancels
4. If confirmed: `POST /projects/{uuid}/items/documents/link`
   - JSON Body (camelCase): `{ documentUuids: [...], areItemsExclusive: true }`
5. Backend inserts into `project_items` with `is_exclusive = True`
6. Document now belongs ONLY to this project

### Deleting Project:
1. User clicks "Delete Project"
2. Frontend calls `deleteProject(projectUuid)`
3. Backend `DELETE /projects/{uuid}`:
   - Queries exclusive items
   - Sets `project.is_deleted = True`
   - Sets each exclusive item `is_deleted = True`
   - Deletes physical files for notes
4. Project and exclusive items hidden everywhere
5. Non-exclusive items remain visible

---

## Schema Reference

### Project Model
**File**: `pkms-backend/app/models/project.py`

Fields:
- `uuid` (PK)
- `name`, `description`
- `created_by`, `created_at`, `updated_at`
- `is_archived`, `is_favorite`, `is_deleted`
- `priority`, `progress_percentage`
- `start_date`, `due_date`
- `sort_order`

### project_items Table
**File**: `pkms-backend/app/models/associations.py` Lines 59-76

See "Project Items" section above for full schema.

---

## Common Pitfalls

1. **Exclusive Confusion**: Exclusive means "ONLY this project", not "important"
2. **Soft Delete**: Deleted items stay in database, just hidden
3. **Link Count**: Always check before making exclusive
4. **Non-Exclusive**: Can be shared, won't be deleted with project
5. **Hard Delete**: Doesn't exist yet, only soft delete
6. **URL Params**: snake_case (e.g., `item_type`, `project_uuid`)
7. **JSON Body**: camelCase (e.g., `documentUuids`, `areItemsExclusive`)

