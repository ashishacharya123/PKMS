# PKMS Complete API Consistency & Build Error Resolution Plan

## Critical Path Corrections

**File Path Fixes:**
- ❌ `pkms-backend/app/schemas/notes.py` → ✅ `pkms-backend/app/schemas/note.py` (singular)
- ❌ `pkms-backend/app/schemas/todos.py` → ✅ `pkms-backend/app/schemas/todo.py` (singular)
- ❌ `pkms-backend/app/schemas/documents.py` → ✅ `pkms-backend/app/schemas/document.py` (singular)

**Base Class Fix:**
- ❌ `BaseModel` → ✅ `CamelCaseModel` (all response schemas use CamelCaseModel)

**Field Name Corrections:**
- NoteResponse uses `title`, not `name`
- All schemas use snake_case fields that get converted to camelCase via CamelCaseModel

---

## Phase 1: Backend Response Schema Updates

### 1. Archive Module Schemas

**File: `pkms-backend/app/schemas/archive.py`**

Add `created_by: str` to both response schemas:

```python
class FolderResponse(CamelCaseModel):
    uuid: str
    name: str
    description: Optional[str]
    parent_uuid: Optional[str]
    path: str
    display_path: Optional[str] = None
    filesystem_path: Optional[str] = None
    depth: int
    created_at: datetime
    updated_at: datetime
    item_count: int
    subfolder_count: int
    total_size: int
    item_type: str = Field("folder", alias="itemType")
    created_by: str  # ✅ ADD THIS

class ItemResponse(CamelCaseModel):
    uuid: str
    name: str
    description: Optional[str]
    folder_uuid: str
    original_filename: str
    stored_filename: str
    file_path: str
    mime_type: str
    file_size: int
    metadata: Dict[str, Any]
    thumbnail_path: Optional[str]
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    item_type: str = Field("file", alias="itemType")
    created_by: str  # ✅ ADD THIS
```

**File: `pkms-backend/app/services/archive_folder_service.py`**

Update FolderResponse construction at line ~156-169:
```python
response = FolderResponse(
    uuid=folder.uuid,
    name=folder.name,
    description=folder.description,
    parent_uuid=folder.parent_uuid,
    is_favorite=folder.is_favorite,
    depth=folder.depth,
    path=path,
    subfolder_count=sub_counts.get(folder.uuid, 0),
    item_count=stats["item_count"],
    total_size=stats["total_size"],
    created_at=folder.created_at,
    updated_at=folder.updated_at,
    created_by=folder.created_by  # ✅ ADD THIS
)
```

Update FolderResponse construction at line ~344-357:
```python
return FolderResponse(
    uuid=folder.uuid,
    name=folder.name,
    description=folder.description,
    parent_uuid=folder.parent_uuid,
    is_favorite=folder.is_favorite,
    depth=folder.depth,
    path=path,
    subfolder_count=sub_counts.get(folder.uuid, 0),
    item_count=stats["item_count"],
    total_size=stats["total_size"],
    created_at=folder.created_at,
    updated_at=folder.updated_at,
    created_by=folder.created_by  # ✅ ADD THIS
)
```

**File: `pkms-backend/app/services/archive_item_service.py`**
- ✅ No manual updates needed - uses `ItemResponse.model_validate(item)` which auto-includes `created_by` once schema has it

### 2. Notes Module Schema

**File: `pkms-backend/app/schemas/note.py`** (NOT `notes.py`)

Add `created_by` to NoteResponse:

```python
class NoteResponse(CamelCaseModel):
    uuid: str
    title: str  # Note: Uses 'title', not 'name'
    content: Optional[str]
    contentFilePath: Optional[str] = Field(alias="content_file_path")
    fileCount: int = Field(alias="file_count")
    thumbnailPath: Optional[str] = Field(alias="thumbnail_path")
    isFavorite: bool = Field(alias="is_favorite")
    isArchived: bool = Field(alias="is_archived")
    isTemplate: bool = Field(alias="is_template")
    fromTemplateId: Optional[str] = Field(alias="from_template_id")
    createdAt: datetime = Field(alias="created_at")
    updatedAt: datetime = Field(alias="updated_at")
    tags: list[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this note belongs to")
    createdBy: str = Field(alias="created_by")  # ✅ ADD THIS
```

**File: `pkms-backend/app/services/note_crud_service.py`**

Update `_convert_note_to_response()` method (line ~649):

```python
return NoteResponse(
    uuid=note.uuid,
    title=note.title,
    content=note.content or "",
    contentFilePath=note.content_file_path,
    file_count=note.file_count,
    thumbnail_path=note.thumbnail_path,
    is_favorite=note.is_favorite,
    is_archived=note.is_archived,
    is_template=note.is_template,
    from_template_id=note.from_template_id,
    tags=[tag.name for tag in note.tag_objs],
    projects=badges,
    created_at=note.created_at,
    updated_at=note.updated_at,
    created_by=note.created_by  # ✅ ADD THIS
)
```

### 3. Todos Module Schema

**File: `pkms-backend/app/schemas/todo.py`** (NOT `todos.py`)

Add `created_by` to TodoResponse:

```python
class TodoResponse(CamelCaseModel):
    uuid: str
    title: str  # Note: Uses 'title', not 'name'
    description: Optional[str]
    status: TodoStatus
    is_archived: bool
    is_favorite: bool
    priority: TaskPriority
    project_uuid: Optional[str]
    project_name: Optional[str]
    order_index: int = 0
    parent_uuid: Optional[str] = None
    subtasks: List['TodoResponse'] = Field(default_factory=list)
    start_date: Optional[date]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    projects: List[ProjectBadge] = Field(default_factory=list, description="Projects this todo belongs to")
    blocking_todos: Optional[List[BlockingTodoSummary]] = Field(default=None, description="Todos I'm blocking")
    blocked_by_todos: Optional[List[BlockingTodoSummary]] = Field(default=None, description="Todos blocking me")
    blocker_count: Optional[int] = None
    created_by: str  # ✅ ADD THIS (will be converted to createdBy via CamelCaseModel)
```

**File: `pkms-backend/app/services/todo_crud_service.py`**

Update `_convert_todo_to_response()` method (line ~756):

```python
return TodoResponse(
    uuid=todo.uuid,
    title=todo.title,
    description=todo.description,
    status=todo.status,
    priority=todo.priority,
    is_archived=todo.is_archived,
    is_favorite=todo.is_favorite,
    start_date=todo.start_date,
    due_date=todo.due_date,
    created_at=todo.created_at,
    updated_at=todo.updated_at,
    completed_at=todo.completed_at,
    tags=[t.name for t in todo.tag_objs] if todo.tag_objs else [],
    projects=badges,
    blocking_todos=blocking_list if blocking_list else None,
    blocked_by_todos=blocked_list if blocked_list else None,
    blocker_count=len([b for b in blocked_list if not b.get('is_completed', False)]),
    created_by=todo.created_by  # ✅ ADD THIS
)
```

### 4. Documents Module Schema

**File: `pkms-backend/app/schemas/document.py`** (NOT `documents.py`)

Add `created_by` to DocumentResponse:

```python
class DocumentResponse(CamelCaseModel):
    uuid: str
    title: str  # Note: Uses 'title', not 'name'
    description: Optional[str] = None
    original_name: str
    filename: str
    file_path: str
    file_size: int
    mime_type: str
    is_favorite: bool
    is_archived: bool
    is_encrypted: Optional[bool] = Field(default=False, description="Whether the file is encrypted")
    is_deleted: bool
    thumbnail_path: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    tags: list[str]
    projects: list[ProjectBadge] = Field(default_factory=list, description="Projects this document belongs to")
    created_by: str  # ✅ ADD THIS (will be converted to createdBy via CamelCaseModel)
```

**File: `pkms-backend/app/services/document_crud_service.py`**

Update `_convert_doc_to_response()` method (line ~520) - Add missing fields:

```python
return DocumentResponse(
    uuid=doc.uuid,
    title=doc.title,
    original_name=doc.original_name,
    filename=doc.filename,
    file_path=doc.file_path,
    file_size=doc.file_size,
    mime_type=doc.mime_type,
    description=doc.description,
    is_favorite=doc.is_favorite,
    is_archived=doc.is_archived,
    is_deleted=doc.is_deleted,
    is_encrypted=doc.is_encrypted,  # ✅ ADD MISSING FIELD
    thumbnail_path=doc.thumbnail_path,  # ✅ ADD MISSING FIELD
    created_at=doc.created_at,
    updated_at=doc.updated_at,
    tags=[t.name for t in doc.tag_objs] if doc.tag_objs else [],
    projects=project_badges or [],
    created_by=doc.created_by  # ✅ ADD THIS
)
```

**Note: Skipping NoteDocumentService**
- ❌ Dead code: Never imported by any router
- ❌ Not used: Note files handled by `note_crud_service.get_note_files()` directly
- ✅ Action: Skip `note_document_service.py` - focus on active code only

---

## Phase 2: Frontend Interface Updates

### 5. BaseItem Interface Verification

**File: `pkms-frontend/src/types/common.ts`**
- ✅ Already has `createdBy: string` - verify no changes needed

### 6. Archive Interfaces Update

**File: `pkms-frontend/src/types/archive.ts`**

**CRITICAL**: `ArchiveFolder` and `ArchiveItem` currently do NOT extend `BaseItem`. They need to be updated:

```typescript
// BEFORE (current state - standalone interfaces):
export interface ArchiveFolder {
  itemType: 'folder';
  uuid: string;
  name: string;
  // ... missing createdBy field
}

// AFTER (should extend BaseItem):
export interface ArchiveFolder extends BaseItem {
  itemType: 'folder';
  // Remove duplicate fields that are now inherited from BaseItem:
  // - uuid (inherited)
  // - name (inherited)
  // - description (inherited)
  // - isFavorite (inherited)
  // - createdAt (inherited)
  // - updatedAt (inherited)
  // - tags (inherited)
  // - createdBy (inherited) ✅ Now available
  
  // Keep only ArchiveFolder-specific fields:
  parentUuid?: string;
  path: string;
  itemCount: number;
  subfolderCount: number;
  totalSize: number;
  depth: number;
}

export interface ArchiveItem extends BaseItem {
  itemType: 'file';
  // Remove duplicate fields that are now inherited from BaseItem:
  // - uuid, name, description, isFavorite, createdAt, updatedAt, tags, createdBy
  
  // Keep only ArchiveItem-specific fields:
  folderUuid: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  extractedText?: string;
  metadata: Record<string, any>;
  thumbnailPath?: string;
  filePath: string;
  fileHash?: string;
}
```

**Import BaseItem at top of file:**
```typescript
import { BaseItem } from './common';
```

### 7. Update ArchiveLayout Type Conversion

**File: `pkms-frontend/src/components/archive/ArchiveLayout.tsx`**

Fix UnifiedFileSection usage (line ~196):
```typescript
files={archiveFiles.map(item => ({
  uuid: item.uuid,
  filename: item.storedFilename,
  originalName: item.originalFilename,
  mimeType: item.mimeType,
  fileSize: item.fileSize,
  description: item.description,
  createdAt: item.createdAt,
  filePath: item.filePath,
  thumbnailPath: item.thumbnailPath,
  module: 'archive' as const,
  entityId: currentFolder.uuid,
}))}
```

onFilesUpdate callback (preserve backend createdBy):
```typescript
onFilesUpdate={(unifiedFiles) => {
  const convertedFiles: ArchiveItem[] = unifiedFiles.map(file => {
    // Find original item to preserve createdBy from backend
    const originalItem = archiveFiles.find(item => item.uuid === file.uuid);

    // If item exists, preserve createdBy from backend response
    if (originalItem) {
      return {
        ...originalItem, // ✅ Preserves createdBy from backend
        // Update only changed fields
        name: file.originalName,
        description: file.description ?? originalItem.description,
        isFavorite: file.isFavorite ?? originalItem.isFavorite,
        tags: file.tags ?? originalItem.tags,
        filePath: file.filePath ?? originalItem.filePath,
        thumbnailPath: file.thumbnailPath ?? originalItem.thumbnailPath,
      };
    }

    // New item - createdBy will be in backend response after creation
    return {
      itemType: 'file' as const,
      uuid: file.uuid,
      name: file.originalName,
      description: file.description,
      folderUuid: currentFolder.uuid,
      originalFilename: file.originalName,
      storedFilename: file.filename,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      metadata: {},
      thumbnailPath: file.thumbnailPath,
      isFavorite: file.isFavorite ?? false,
      createdAt: file.createdAt,
      updatedAt: file.createdAt,
      tags: file.tags || [],
      filePath: file.filePath || '',
      fileHash: undefined,
      createdBy: '', // Temporary: Backend response will have it after item creation
    };
  });
  setArchiveFiles(convertedFiles);
}}
```

Fix ModuleLayout usage:

**Line ~231 (folders mapping)** - Add createdBy to mapping:
```typescript
items={folders.map(folder => ({
  ...folder, // ✅ Spread includes createdBy once interfaces extend BaseItem
  id: folder.uuid,
  itemType: 'folder' as const,
  mimeType: 'folder',
  // createdAt, updatedAt, name already in folder object
  fileSize: 0,
  tags: folder.tags || []
})) as BaseItem[]}
```

**Line ~271 (items display)** - Items should already have createdBy from backend:
```typescript
items={items} // ✅ Should already have createdBy from API response once backend schema updated
```

**CRITICAL NOTE**: After interfaces extend BaseItem, the mapping at line 231 may need adjustment to avoid field duplication. The spread operator `...folder` will include all BaseItem fields automatically.

### 8. Remove Store Fallbacks

**Files to update:**
- `pkms-frontend/src/stores/archiveStore.ts`
- `pkms-frontend/src/stores/notesStore.ts`
- `pkms-frontend/src/stores/todosStore.ts`
- `pkms-frontend/src/stores/documentsStore.ts`

Remove all `createdBy || 'system'` fallbacks - use `createdBy` directly from API responses:

```typescript
// Before:
createdBy: folder.createdBy || 'system',

// After:
createdBy: folder.createdBy, // ✅ Real data from API
```

---

## Phase 3: Other Critical Build Fixes

### 9. BaseService Export Verification

**File: `pkms-frontend/src/services/index.ts`**
- ✅ Verify only one `export { BaseService }` exists (line 9)
- Two classes in BaseService.ts (`CacheAwareBaseService` and `BaseService`) are separate - no conflict

### 10. Test Infrastructure Fixes

**File: `pkms-frontend/src/components/__tests__/common/ActionMenu.test.tsx`**
- Fix import path: `../common/ActionMenu` → `../../components/common/ActionMenu`

**File: `pkms-frontend/src/test/utils.tsx`**
- Create if missing with basic test utilities

### 11. DocumentsStore Type Alignment

**File: `pkms-frontend/src/services/unifiedFileService.ts`**

Add missing optional properties to `UnifiedFileItem`:
```typescript
export interface UnifiedFileItem {
  // ... existing fields ...
  updatedAt?: string;
  isArchived?: boolean;
  tags?: string[];
}
```

**File: `pkms-frontend/src/stores/documentsStore.ts`**
- Add optional chaining for property access
- Export `UpdateDocumentRequest` and `DocumentSummary` interfaces

### 12. Missing Type Definitions

**File: `pkms-frontend/src/types/nepali-date-converter.d.ts`**
- Create if missing with proper type declarations

### 13. Store Property Access Safety

**File: `pkms-frontend/src/utils/save_discard_verification.ts`**

Add optional chaining and Array.isArray() checks:
```typescript
const hasTitle = note.title?.trim()?.length > 0;
const hasFiles = Array.isArray(note.files) && note.files.length > 0;
```

### 14. CacheAwareService Import Verification

**File: `pkms-frontend/src/services/cacheAwareService.ts`**
- Verify dynamic imports use correct paths (`./todosService`, `./notesService`)

---

## Implementation Priority & Order

### Phase 1: Backend Schema Updates (Critical)
1. 🔥 CRITICAL: Archive schemas (FolderResponse, ItemResponse) in `archive.py`
2. 🔥 CRITICAL: Archive service updates (2 FolderResponse constructions in `archive_folder_service.py`)
3. 🔥 CRITICAL: Notes schema (NoteResponse) in `note.py` and service update
4. 🔥 CRITICAL: Todos schema (TodoResponse) in `todo.py` and service update
5. 🔥 CRITICAL: Documents schema (DocumentResponse) in `document.py` and service update

### Phase 2: Frontend Interface Updates (After Backend)
6. 🔥 CRITICAL: Verify BaseItem interface already has createdBy ✅
7. 🔥 CRITICAL: Update ArchiveFolder and ArchiveItem to extend BaseItem (currently standalone)
8. 🔥 CRITICAL: Fix ArchiveLayout usage (type conversion, preserve createdBy)
9. 🔥 CRITICAL: Update all stores (remove fallbacks in archive, notes, todos, documents)

### Phase 3: Other Build Fixes
10. 🔥 CRITICAL: BaseService export verification (likely no issue)
11. ⚠️ HIGH: Test infrastructure fixes
12. ⚠️ HIGH: DocumentsStore type alignment
13. 🔸 MEDIUM: Missing type definitions
14. 🔸 MEDIUM: Property access safety
15. 🔹 LOW: CacheAwareService verification

---

## Verification Checklist

After implementation:
- ✅ All 4 active response schemas include `created_by` field (Archive, Notes, Todos, Documents)
- ✅ All 7+ active service constructions populate `created_by` in responses
- ✅ DocumentResponse includes all required fields (description, thumbnail_path, is_encrypted, created_by)
- ✅ Skipped dead code: NoteDocumentService (not used by any router)
- ✅ ArchiveFolder and ArchiveItem extend `BaseItem` (fixes inheritance)
- ✅ All frontend interfaces properly have `createdBy` field
- ✅ No more 'system' fallbacks in stores (archive, notes, todos, documents)
- ✅ ArchiveLayout preserves `createdBy` from backend responses
- ✅ UnifiedFileSection receives properly mapped UnifiedFileItem[]
- ✅ ModuleLayout receives properly typed BaseItem[]
- ✅ TypeScript compilation succeeds: `npx tsc --noEmit`
- ✅ Build completes successfully: `npm run build`
- ✅ All modules have consistent API contracts
- ✅ Complete type safety across the entire system

---

## Benefits

✅ Universal type safety - All modules have consistent createdBy  
✅ No frontend fallbacks - Real data from all APIs  
✅ Proper inheritance - All interfaces can extend BaseItem  
✅ Consistent contracts - Same response pattern across modules  
✅ Future-proof - Easy to extend and maintain  
✅ Data integrity - No more placeholder values  
✅ Clean architecture - Proper separation of concerns

