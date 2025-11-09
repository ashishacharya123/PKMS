# Phase 1: Critical TypeScript Errors - Detailed Fix Plan

**Date**: 2025-11-09 (Nepal Time: UTC+5:45)
**Total Critical Errors**: ~70 errors
**Estimated Time**: 2-3 hours
**Risk Level**: Low (focused fixes, no breaking changes)

---

## Table of Contents

1. [TS2339: Property Doesn't Exist](#ts2339-property-doesnt-exist) - 20 critical errors
2. [TS2345: Argument Type Mismatch](#ts2345-argument-type-mismatch) - 15 critical errors
3. [TS2554: Wrong Argument Count](#ts2554-wrong-argument-count) - 11 errors
4. [TS2740: Missing Properties](#ts2740-missing-properties) - 8 errors
5. [TS18048: Possibly Undefined](#ts18048-possibly-undefined) - 12 errors
6. [TS2551: Property Name Typo](#ts2551-property-name-typo) - 6 errors

---

## Implementation Order

### Quick Wins First (30 minutes)
1. Fix property name typos (TS2551) - 6 errors
2. Fix undefined checks (TS18048) - 12 errors
3. Fix ProjectsPage.tsx issues - 4 errors

### Core Fixes (1 hour)
4. Fix missing properties in mock data (TS2740) - 8 errors
5. Fix service method argument mismatches (TS2554) - 11 errors
6. Fix TodoForm property access (TS2339) - 10 errors

### Type System Fixes (30 minutes)
7. Fix type mismatches (TS2345) - 15 errors
8. Fix remaining property access issues (TS2339) - 10 errors

---

## TS2551: Property Name Typo (6 errors)

### Priority: 🔴 CRITICAL - Simple typos, easy fixes

### 1. HistoricalEntries.tsx - weather_label → weatherLabel

**File**: `pkms-frontend/src/components/diary/HistoricalEntries.tsx`
**Lines**: 197, 199, 222

**Error**:
```
Property 'weather_label' does not exist. Did you mean 'weatherLabel'?
Property 'content_length' does not exist. Did you mean 'contentLength'?
```

**Current Code** (lines 197-222):
```typescript
{entry.weather_label && (...)}  // Line 197
{entry.weather_label}            // Line 199
{entry.content_length || 0} characters // Line 222
```

**Fix**:
```typescript
{entry.weatherLabel && (...)}  // Line 197
{entry.weatherLabel}            // Line 199
{entry.contentLength || 0} characters // Line 222
```

**Why**: Backend uses camelCase, not snake_case for these fields.

---

### 2. DiaryMainTab.tsx - created_at → createdAt

**File**: `pkms-frontend/src/components/diary/DiaryMainTab.tsx`
**Lines**: 195, 196

**Error**:
```
Property 'created_at' does not exist. Did you mean 'createdAt'?
```

**Current Code**:
```typescript
const sortedEntries = entries.sort((a, b) => 
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
);
```

**Fix**:
```typescript
const sortedEntries = entries.sort((a, b) => 
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
);
```

---

### 3. ActivityTimeline.tsx - weather_code → weatherCode

**File**: `pkms-frontend/src/components/dashboard/ActivityTimeline.tsx`
**Lines**: 278, 280

**Error**:
```
Property 'weatherCode' does not exist. Did you mean 'weather_code'?
```

**Current Code**:
```typescript
const weather = metadata.weatherCode;
```

**Fix**:
```typescript
const weather = metadata.weather_code;
```

**Note**: In this case, backend uses snake_case for metadata fields!

---

## TS18048: Possibly Undefined (12 errors)

### Priority: 🔴 CRITICAL - Prevents runtime errors

### 4. ProjectsPage.tsx - Add undefined checks

**File**: `pkms-frontend/src/pages/ProjectsPage.tsx`
**Lines**: 349, 466, 474

**Error**:
```
'project.completedCount' is possibly 'undefined'
'project.todoCount' is possibly 'undefined'
```

**Current Code** (line 347-350):
```typescript
const getCompletionPercentage = (project: Project) => {
  if (project.todoCount === 0) return 0;
  return Math.round((project.completedCount / project.todoCount) * 100);
};
```

**Fix**:
```typescript
const getCompletionPercentage = (project: Project) => {
  // Add undefined checks
  const todoCount = project.todoCount ?? 0;
  const completedCount = project.completedCount ?? 0;
  
  if (todoCount === 0) return 0;
  return Math.round((completedCount / todoCount) * 100);
};
```

**Usage in JSX** (lines 466, 474):
```typescript
// Before
<Text size="xl" fw={700} c="green">{project.completedCount}</Text>
<Text size="xl" fw={700} c="blue">{project.todoCount}</Text>

// After
<Text size="xl" fw={700} c="green">{project.completedCount ?? 0}</Text>
<Text size="xl" fw={700} c="blue">{project.todoCount ?? 0}</Text>
```

---

### 5. DocumentsPage.tsx - Add tags undefined checks

**File**: `pkms-frontend/src/pages/DocumentsPage.tsx`
**Lines**: 640, 645, 646, 682, 687, 688, 689

**Error**:
```
'document.tags' is possibly 'undefined'
```

**Current Code** (line 640):
```typescript
tags: document.tags.filter(t => !document.tags.includes(t)),
```

**Fix Option 1 - Defensive (Recommended)**:
```typescript
tags: (document.tags ?? []).filter(t => !(document.tags ?? []).includes(t)),
```

**Fix Option 2 - Early return**:
```typescript
// At the start of the function
if (!document.tags) {
  notifications.show({ title: 'Error', message: 'Document has no tags', color: 'red' });
  return;
}

// Then use document.tags safely
tags: document.tags.filter(t => !document.tags.includes(t)),
```

**Apply similar fixes to all affected lines** (682, 687, 688, 689)

---

### 6. documentsStore.ts - Add tags check

**File**: `pkms-frontend/src/stores/documentsStore.ts`
**Line**: 215

**Current Code**:
```typescript
const docWithTags = { ...doc, tags: document.tags.filter(...) };
```

**Fix**:
```typescript
const docWithTags = { ...doc, tags: (document.tags ?? []).filter(...) };
```

---

## TS2339: Property Doesn't Exist (20 critical errors)

### Priority: 🔴 CRITICAL - Core functionality

### 7. PermanentDeleteDialog.tsx - Add uuid to item type

**File**: `pkms-frontend/src/components/common/PermanentDeleteDialog.tsx`
**Lines**: 136, 154

**Error**:
```
Property 'uuid' does not exist on type '{ type: string; title: string; }'
```

**Root Cause**: Type definition missing `uuid`

**Current Type** (check file for exact location):
```typescript
type DeleteItem = {
  type: string;
  title: string;
};
```

**Fix**:
```typescript
type DeleteItem = {
  type: string;
  title: string;
  uuid: string;  // ADD THIS
};
```

**OR** if type is imported, update the import source.

---

### 8. TodoForm.tsx - Remove non-existent properties

**File**: `pkms-frontend/src/components/todos/TodoForm.tsx`
**Lines**: 94, 95, 187, 198, 216

**Error**:
```
Property 'completionPercentage' does not exist on type 'Partial<Todo>'
Property 'type' does not exist on type 'Partial<Todo>'
Property 'isExclusiveMode' does not exist on type 'Partial<Todo>'
```

**Analysis**: These properties don't exist in the Todo type definition.

**Fix Line 94-95** (completionPercentage):
```typescript
// Before
const [completionPercentage, setCompletionPercentage] = useState<number>(
  initialData?.completionPercentage || 0
);

// After - Remove completionPercentage, it's not part of Todo type
// OR if needed, calculate from subtasks:
const completionPercentage = useMemo(() => {
  if (!subtasks.length) return 0;
  const completed = subtasks.filter(s => s.completed).length;
  return Math.round((completed / subtasks.length) * 100);
}, [subtasks]);
```

**Fix Line 187** (type):
```typescript
// Before
if (formData.type === 'checklist') {
  // ...
}

// After - Remove type check, use subtasks.length instead:
if (subtasks.length > 0) {
  // Has checklist items
}
```

**Fix Line 216** (isExclusiveMode):
```typescript
// Before
isExclusiveMode: formData.isExclusiveMode

// After - Use isExclusive instead (if that exists), or remove:
// Check Todo type definition first to see correct property name
```

---

### 9. KanbanBoard.tsx - Remove type and completionPercentage

**File**: `pkms-frontend/src/components/todos/KanbanBoard.tsx`
**Lines**: 306, 311, 312, 315, 357, 361, 364, 366, 374, 378, 391, 393

**Error**:
```
Property 'type' does not exist on type 'Todo'
Property 'completionPercentage' does not exist on type 'Todo'
Property 'checklistItems' does not exist on type 'Todo'
```

**Fix Strategy**: Replace with subtasks-based calculations

**Line 306** (type check):
```typescript
// Before
if (todo.type === 'checklist') {

// After
if (todo.subtasks && todo.subtasks.length > 0) {
```

**Lines 357-366** (completionPercentage):
```typescript
// Before
const percentage = todo.completionPercentage || 0;

// After
const percentage = useMemo(() => {
  if (!todo.subtasks || todo.subtasks.length === 0) return 0;
  const completed = todo.subtasks.filter(s => s.completed).length;
  return Math.round((completed / todo.subtasks.length) * 100);
}, [todo.subtasks]);
```

**Lines 374-393** (checklistItems):
```typescript
// Before
todo.checklistItems?.length

// After
todo.subtasks?.length
```

---

### 10. TodoCard.tsx - Fix completionPercentage

**File**: `pkms-frontend/src/components/todos/TodoCard.tsx`
**Lines**: 191, 195, 198, 200

**Same fix as KanbanBoard**: Calculate from subtasks

```typescript
// Add this calculation at component top:
const completionPercentage = useMemo(() => {
  if (!todo.subtasks || todo.subtasks.length === 0) return 0;
  const completed = todo.subtasks.filter((s: any) => s.completed).length;
  return Math.round((completed / todo.subtasks.length) * 100);
}, [todo.subtasks]);

// Then use it in JSX (no changes needed to usage)
```

---

### 11. SubtaskList.tsx - Use uuid instead of id

**File**: `pkms-frontend/src/components/todos/SubtaskList.tsx`
**Line**: 97

**Error**:
```
Property 'id' does not exist on type 'TodoSummary'
```

**Fix**:
```typescript
// Before
key={`subtask-${parentTodo.id}-${index}`}

// After
key={`subtask-${parentTodo.uuid}-${index}`}
```

---

### 12. NotesPage.tsx - Remove note_type property

**File**: `pkms-frontend/src/pages/NotesPage.tsx`
**Lines**: 532, 533, 536

**Error**:
```
Property 'note_type' does not exist on type 'NoteSummary'
```

**Fix**: Remove note_type checks (appears to be old/deprecated feature)

```typescript
// Before (line 532-536)
const noteTypeIcon = note.note_type === 'journal' ? 
  <IconBook size={16} /> : 
  <IconNote size={16} />;

// After - Remove note_type, just use Note icon:
const noteTypeIcon = <IconNote size={16} />;

// OR if note types are still needed, check for a different property
```

---

### 13. NotesPage.tsx - Fix location.pathname access

**File**: `pkms-frontend/src/pages/NotesPage.tsx`
**Line**: 89

**Error**:
```
Property 'pathname' does not exist on type '{ state?: { highlightNoteId?: number } }'
```

**Current Code**:
```typescript
const location = useLocation();
// Later...
if (location.pathname === '/notes') {
```

**Fix**: Import correct location type from react-router-dom

```typescript
// At top of file
import { useLocation, Location } from 'react-router-dom';

// The useLocation hook returns the full Location object, code is correct
// This might be a type definition issue. Check if this is actually an error or false positive.

// If real error, cast the type:
const location = useLocation() as Location;
```

---

### 14. ArchivePage.tsx - Add itemType to ArchiveSelectedItem

**File**: `pkms-frontend/src/pages/ArchivePage.tsx`
**Lines**: 241, 276

**Error**:
```
Property 'itemType' does not exist on type 'ArchiveSelectedItem'
```

**Fix**: Check type definition and add missing property

```typescript
// Find ArchiveSelectedItem type definition
interface ArchiveSelectedItem {
  uuid: string;
  title: string;
  itemType: string;  // ADD THIS
}
```

---

### 15. DashboardPage.tsx - Remove non-existent service methods

**File**: `pkms-frontend/src/pages/DashboardPage.tsx`
**Lines**: 476, 494

**Error**:
```
Property 'calculateCompletionPercentage' does not exist on type 'DashboardService'
Property 'getStreakStatus' does not exist on type 'DashboardService'
```

**Fix**: Implement these locally or remove calls

```typescript
// Line 476 - Replace service call with local calculation
// Before
const percentage = dashboardService.calculateCompletionPercentage(project);

// After
const percentage = project.todoCount > 0 
  ? Math.round((project.completedCount / project.todoCount) * 100) 
  : 0;

// Line 494 - Replace or remove
// Before
const streak = await dashboardService.getStreakStatus();

// After - Either implement locally or remove if not critical
```

---

### 16. DiaryMainTab.tsx - Remove content property access

**File**: `pkms-frontend/src/components/diary/DiaryMainTab.tsx`
**Lines**: 189, 689, 691

**Error**:
```
Property 'content' does not exist on type 'DiaryEntrySummary'
```

**Fix**: DiaryEntrySummary doesn't include full content (by design for performance)

```typescript
// Line 189 - Remove content length check
// Before
if (entry.content && entry.content.length > 100) {

// After - Use contentLength if it exists, or remove check:
if (entry.contentLength && entry.contentLength > 100) {

// Lines 689, 691 - Don't access content in summary view
// Remove or replace with contentLength or preview
```

---

### 17. DocumentsPage.tsx - Fix projects property access

**File**: `pkms-frontend/src/pages/DocumentsPage.tsx`
**Lines**: 639, 681, 787

**Error**:
```
Property 'projects' does not exist on type 'UnifiedFileItem'
Property 'projectIds' does not exist on type 'FileMetadata'
Property 'isExclusive' does not exist on type 'FileMetadata'
```

**Fix**: Add proper type checks or update type definitions

```typescript
// Line 639 - Safe access
// Before
const projectIds = document.projects?.map(p => p.id) || [];

// After
const projectIds = ('projects' in document && document.projects) 
  ? document.projects.map(p => p.uuid) 
  : [];

// Line 787 - Add properties to FileMetadata type or use type assertion
// Check FileMetadata type definition and add:
interface FileMetadata {
  // ... existing properties
  projectIds?: string[];
  isExclusive?: boolean;
}
```

---

### 18. ProjectDashboardPage.tsx - Fix ExclusiveItem type

**File**: `pkms-frontend/src/pages/ProjectDashboardPage.tsx`
**Lines**: 749, 757, 782, 985, 1011

**Error**:
```
Property 'uuid' does not exist on type 'ExclusiveItem'
Property 'description' does not exist on type BaseItem
```

**Fix**: Update type definitions

```typescript
// Find ExclusiveItem type
type ExclusiveItem = NoteSummary | UnifiedFileItem | TodoSummary;

// Add type guard to access properties safely:
function hasDescription(item: any): item is { description?: string } {
  return 'description' in item;
}

// Then use:
{hasDescription(item) && item.description && (
  <Text size="xs" c="dimmed" lineClamp={2}>{item.description}</Text>
)}
```

---

### 19. SettingsPage.tsx - Remove non-existent auth methods

**File**: `pkms-frontend/src/pages/SettingsPage.tsx`
**Lines**: 39, 44, 77

**Error**:
```
Property 'updateProfile' does not exist on type 'AuthState & AuthActions'
Property 'fullName' does not exist on type 'User'
```

**Fix**: Check auth store for correct method names

```typescript
// Line 39 - Check useAuthStore for correct update method
// Might be updateUser or setUser instead
const { user, updateUser } = useAuthStore();

// Lines 44, 77 - fullName might be different
// Check User type - might be:
user.full_name  // snake_case
user.displayName  // or different name
```

---

### 20. BaseService.ts - Add missing response schemas

**File**: `pkms-frontend/src/services/BaseService.ts`
**Lines**: 94, 104, 114, 138, 149, 159

**Error**:
```
Property 'NoteSummaryResponseSchema' does not exist on type 'typeof ResponseValidator'
Property 'TodoResponseSchema' does not exist on type 'typeof ResponseValidator'
```

**Fix**: Add missing schemas to ResponseValidator or remove validation

```typescript
// Option 1: Add to validation.ts
export const NoteSummaryResponseSchema = z.object({
  // ... define schema
});

export const TodoResponseSchema = z.object({
  // ... define schema
});

// Option 2: Remove validation for these endpoints (if not critical)
// Replace:
return ResponseValidator.NoteSummaryResponseSchema.parse(response.data);

// With:
return response.data as NoteSummary[];
```

---

## TS2345: Argument Type Mismatch (15 critical errors)

### Priority: 🔴 CRITICAL - Function calls fail

### 21. TodosPage.tsx - Fix createTodo argument

**File**: `pkms-frontend/src/pages/TodosPage.tsx`
**Line**: 412

**Error**:
```
Argument type mismatch - 'projectIds' property doesn't exist
```

**Current Code**:
```typescript
await todosService.createTodo({
  title: formData.title,
  description: formData.description,
  status: formData.status,
  priority: formData.priority,
  projectIds: formData.projectIds,  // WRONG - should be 'projects'
  tags: formData.tags,
});
```

**Fix**: Use correct property name

```typescript
await todosService.createTodo({
  title: formData.title,
  description: formData.description,
  status: formData.status,
  priority: formData.priority,
  projects: formData.projects,  // Changed from projectIds
  tags: formData.tags,
} as CreateTodoRequest);
```

---

### 22. TodoForm.tsx - Fix property access in formData

**File**: `pkms-frontend/src/components/todos/TodoForm.tsx`
**Lines**: 188, 199, 211, 213, 217

**Error**:
```
Argument '"type"' is not assignable to parameter 'keyof Todo'
Argument '"completionPercentage"' is not assignable to parameter 'keyof Todo'
Argument '"projectIds"' is not assignable to parameter 'keyof Todo'
```

**Fix**: Remove invalid properties from formData handling

```typescript
// Line 188 - Remove type handling
// Delete this entire section if type doesn't exist

// Line 199 - Remove completionPercentage
// Delete this section

// Line 217 - Change projectIds to projects
// Before
setFormData('projectIds', selectedProjects);

// After
setFormData('projects', selectedProjects);
```

---

### 23. ContentViewerPage.tsx - Fix module type

**File**: `pkms-frontend/src/components/common/ContentViewerPage.tsx`
**Line**: 41

**Error**:
```
Type '"todos"' is not assignable to parameter type (excludes "todos")
```

**Fix**: Add "todos" to allowed module types or use correct type

```typescript
// Check the function signature expecting this
// If todos should be allowed, update the type:
type AllowedModules = 'notes' | 'documents' | 'projects' | 'diary' | 'archive' | 'todos';

// Or remove todos if it shouldn't be there
```

---

### 24. NotesPage.tsx - Add null checks for string arguments

**File**: `pkms-frontend/src/pages/NotesPage.tsx`
**Lines**: 463, 503, 557, 636, 640

**Error**:
```
Argument of type 'string | undefined' is not assignable to parameter of type 'string'
```

**Fix**: Add null coalescing or early returns

```typescript
// Option 1: Null coalescing
await noteService.doSomething(noteId ?? '');

// Option 2: Early return (better)
if (!noteId) {
  notifications.show({ title: 'Error', message: 'Note ID is required', color: 'red' });
  return;
}
await noteService.doSomething(noteId);
```

---

### 25. DiaryEntryModal.tsx - Fix payload type

**File**: `pkms-frontend/src/components/diary/DiaryEntryModal.tsx`
**Line**: 117

**Error**:
```
Missing properties: encryptedBlob, encryptionIv
```

**Analysis**: Creating payload without encryption fields

**Fix**: Add encryption before creating payload

```typescript
// Before
await diaryService.createEntry({
  title,
  content,
  tags,
  mood,
  weatherCode,
  location,
  date
});

// After
// Encrypt content first
const { encryptedBlob, encryptionIv } = await encryptContent(content);

await diaryService.createEntry({
  title,
  content: '', // Clear content  
  encryptedBlob,
  encryptionIv,
  tags,
  mood,
  weatherCode,
  location,
  date
});
```

---

## TS2554: Wrong Argument Count (11 errors)

### Priority: 🔴 CRITICAL - Function calls crash

### 26. ArchivePage.tsx - Fix service method calls

**File**: `pkms-frontend/src/pages/ArchivePage.tsx`
**Lines**: 183, 204, 219, 255, 289, 324

**Error**:
```
Expected 1 arguments, but got 0
Expected 1-2 arguments, but got 3
```

**Fix**: Check service method signatures and provide correct arguments

```typescript
// Line 183 - Add required argument
// Before
await archiveService.someMethod();

// After
await archiveService.someMethod(archiveId);

// Similar fixes for other lines - check each service method signature
```

---

### 27. ModuleDashboard.tsx - Fix refetch call

**File**: `pkms-frontend/src/components/dashboard/ModuleDashboard.tsx`
**Line**: 71

**Error**:
```
Expected 0 arguments, but got 1
```

**Fix**:
```typescript
// Before
refetch(true);

// After
refetch();
```

---

### 28. SettingsPage.tsx - Fix updateSettings call

**File**: `pkms-frontend/src/pages/SettingsPage.tsx`
**Line**: 111

**Error**:
```
Expected 1 arguments, but got 2
```

**Fix**: Check updateSettings signature

```typescript
// Before
await updateSettings(key, value);

// After
await updateSettings({ [key]: value });
```

---

### 29. documentsStore.ts - Fix uploadFile call

**File**: `pkms-frontend/src/stores/documentsStore.ts`
**Line**: 188

**Error**:
```
Expected 3-4 arguments, but got 5
```

**Fix**: Remove extra argument or combine parameters

```typescript
// Before
await documentService.uploadFile(file, tags, projectIds, isExclusive, metadata);

// After
await documentService.uploadFile(file, {
  tags,
  projectIds,
  isExclusive,
  ...metadata
});
```

---

## TS2740: Missing Properties (8 errors)

### Priority: 🟡 MEDIUM - Mock data issues

### 30. ProjectSelector.tsx - Fix mock project data

**File**: `pkms-frontend/src/components/common/ProjectSelector.tsx`
**Lines**: 54, 70, 86

**Error**:
```
Missing properties: sortOrder, documentCount, noteCount, tagCount, and 3 more
```

**Fix**: Add all required properties to mock data

```typescript
// Before
const mockProject = {
  uuid: '1',
  name: 'Test Project',
  description: 'Test',
  status: ProjectStatus.IS_RUNNING,
  // ... some properties
};

// After
const mockProject: ProjectSummary = {
  uuid: '1',
  name: 'Test Project',
  description: 'Test',
  status: ProjectStatus.IS_RUNNING,
  priority: TaskPriority.HIGH,
  dueDate: '2024-12-31',
  progressPercentage: 0,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  isFavorite: false,
  sortOrder: 0,           // ADD
  documentCount: 0,       // ADD
  noteCount: 0,           // ADD
  tagCount: 0,            // ADD
  todoCount: 0,           // ADD
  completedCount: 0,      // ADD
  createdAt: new Date().toISOString(),  // ADD
  updatedAt: new Date().toISOString(),  // ADD
  createdBy: 'system',    // ADD
};
```

---

## Testing Checklist

After implementing fixes:

### Phase 1 - Critical Fixes
- [ ] Run `npx tsc --noEmit` - should reduce from 679 to ~609 errors (~70 fixed)
- [ ] Test Projects page loads and displays correctly
- [ ] Test Todo creation and editing
- [ ] Test Documents page with tags
- [ ] Test Diary entries display

### Phase 2 - Functionality
- [ ] Test all modified service calls work correctly
- [ ] Test note creation/editing  
- [ ] Test archive operations
- [ ] Test project dashboard

### Phase 3 - Regression
- [ ] No new console errors
- [ ] All existing features still work
- [ ] Navigation works correctly

---

## Implementation Strategy

### Step 1: Property Name Fixes (15 minutes)
Fix all TS2551 errors - simple find/replace operations

### Step 2: Undefined Checks (20 minutes)
Add null coalescing and undefined checks - safe defensive coding

### Step 3: Remove Invalid Properties (30 minutes)
Clean up properties that don't exist in types

### Step 4: Fix Service Calls (30 minutes)
Correct argument counts and types for service methods

### Step 5: Fix Mock Data (20 minutes)
Add missing properties to test/mock data

### Step 6: Test Everything (30 minutes)
Run through testing checklist

---

## Rollback Plan

Each fix is isolated - if any section causes issues:

1. **Revert the specific file** using git:
   ```bash
   git checkout HEAD -- path/to/problem/file.tsx
   ```

2. **Document the issue** for later investigation

3. **Continue with other fixes** - they're independent

---

## Success Criteria

- ✅ Reduce TypeScript errors from 679 to ~609 (~70 errors fixed)
- ✅ No runtime errors introduced
- ✅ All existing functionality works
- ✅ Core pages (Projects, Todos, Documents, Diary) work correctly
- ✅ Service calls execute without type errors

---

## Files to Modify (Summary)

### High Priority (Core Functionality)
1. `ProjectsPage.tsx` - undefined checks, type fixes
2. `TodosPage.tsx` - service call argument fixes
3. `TodoForm.tsx` - remove invalid properties
4. `KanbanBoard.tsx` - replace completionPercentage with calculated value
5. `TodoCard.tsx` - same as KanbanBoard
6. `DocumentsPage.tsx` - tags undefined checks

### Medium Priority (Features)
7. `HistoricalEntries.tsx` - property name fixes
8. `DiaryMainTab.tsx` - property name and access fixes
9. `NotesPage.tsx` - remove note_type, fix location
10. `ArchivePage.tsx` - argument count fixes
11. `DashboardPage.tsx` - remove non-existent methods

### Low Priority (Mocks/Tests)
12. `ProjectSelector.tsx` - fix mock data
13. `PermanentDeleteDialog.tsx` - add missing type property
14. `BaseService.ts` - add response schemas or remove validation

---

## Next Steps After Phase 1

Once Phase 1 is complete:
1. Run TypeScript compiler to verify error count reduction
2. Update `done_till_now.txt` with progress
3. Create Phase 2 plan (Type Safety - ~85 errors)
4. Decide whether to continue or pause

---

**Remember**: These are REAL errors that can cause runtime bugs. Fixing them improves code quality and prevents user-facing issues. Take your time, test thoroughly, and don't rush! 🚀

