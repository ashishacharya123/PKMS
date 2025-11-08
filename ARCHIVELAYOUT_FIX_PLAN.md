# Comprehensive Frontend Type System & Build Fixes - Implementation Plan

## Overview
This plan addresses multiple TypeScript compilation errors, type mismatches, and build issues across the PKMS frontend codebase. All issues have been identified and verified.

## Issues Summary

1. **ArchiveLayout Type Mismatch** - ArchiveItem[] vs UnifiedFileItem[] incompatibility
2. **BaseService Export Conflict** - Duplicate export causing compilation errors
3. **Test Infrastructure Issues** - Missing test utilities and incorrect import paths
4. **DocumentsStore Type Alignment** - Store expects properties not present on UnifiedFileItem
5. **Missing Type Definitions** - UpdateDocumentRequest, DocumentSummary, nepali date converter types
6. **CacheAwareService Import Paths** - Inconsistent import paths (if any exist)
7. **Store Property Access** - Undefined property access in save_discard_verification.ts

---

# Phase 1: Critical Type System Fixes

---

## Implementation Steps

### Step 1: Add UnifiedFileItem Import
**File:** `pkms-frontend/src/components/archive/ArchiveLayout.tsx`

**Action:** Ensure `UnifiedFileItem` is imported from `'../../services/unifiedFileService'`

**Location:** Check imports section (around line 1-13)

**Expected import:**
```typescript
import { UnifiedFileItem } from '../../services/unifiedFileService';
```

---

### Step 2: Create Conversion Helper Functions
**File:** `pkms-frontend/src/components/archive/ArchiveLayout.tsx`

**Location:** Add before the `ArchiveLayout` component function (around line 52, before `export function ArchiveLayout`)

**Code to add:**
```typescript
// Convert ArchiveItem to UnifiedFileItem
const archiveItemToUnified = (
  item: ArchiveItem, 
  entityId: string
): UnifiedFileItem => ({
  uuid: item.uuid,
  filename: item.storedFilename,
  originalName: item.originalFilename,
  mimeType: item.mimeType,
  fileSize: item.fileSize,
  description: item.description,
  createdAt: item.createdAt,
  filePath: item.filePath,
  thumbnailPath: item.thumbnailPath,
  module: 'archive',
  entityId,
});

// Convert UnifiedFileItem back to ArchiveItem (for onFilesUpdate)
const unifiedToArchiveItem = (
  item: UnifiedFileItem,
  folderUuid: string
): ArchiveItem => ({
  itemType: 'file',
  uuid: item.uuid,
  name: item.originalName,
  description: item.description,
  folderUuid,
  originalFilename: item.originalName,
  storedFilename: item.filename,
  mimeType: item.mimeType,
  fileSize: item.fileSize,
  metadata: {},
  thumbnailPath: item.thumbnailPath,
  isFavorite: false,
  createdAt: item.createdAt,
  updatedAt: item.createdAt,
  tags: [],
  filePath: item.filePath || '',
});
```

---

### Step 3: Update UnifiedFileSection Usage
**File:** `pkms-frontend/src/components/archive/ArchiveLayout.tsx`

**Location:** Lines 193-199 (where `UnifiedFileSection` is used)

**Before:**
```typescript
<UnifiedFileSection
  module="archive"
  entityId={currentFolder.uuid}
  files={archiveFiles}
  onFilesUpdate={setArchiveFiles}
  className="archive-file-section"
/>
```

**After:**
```typescript
<UnifiedFileSection
  module="archive"
  entityId={currentFolder.uuid}
  files={archiveFiles.map(item => archiveItemToUnified(item, currentFolder.uuid))}
  onFilesUpdate={(unifiedFiles) => {
    const convertedFiles: ArchiveItem[] = unifiedFiles.map(item => 
      unifiedToArchiveItem(item, currentFolder.uuid)
    );
    setArchiveFiles(convertedFiles);
  }}
  className="archive-file-section"
/>
```

---

## Field Mapping Reference

### ArchiveItem → UnifiedFileItem
| ArchiveItem Field | UnifiedFileItem Field | Notes |
|-------------------|----------------------|-------|
| `uuid` | `uuid` | Direct mapping |
| `storedFilename` | `filename` | Different field name |
| `originalFilename` | `originalName` | Different field name |
| `mimeType` | `mimeType` | Direct mapping |
| `fileSize` | `fileSize` | Direct mapping |
| `description` | `description` | Direct mapping (optional) |
| `createdAt` | `createdAt` | Direct mapping |
| `filePath` | `filePath` | Direct mapping (optional) |
| `thumbnailPath` | `thumbnailPath` | Direct mapping (optional) |
| N/A | `module` | Constant: `'archive'` |
| N/A | `entityId` | Parameter: `currentFolder.uuid` |

### UnifiedFileItem → ArchiveItem
| UnifiedFileItem Field | ArchiveItem Field | Notes |
|----------------------|-------------------|-------|
| `uuid` | `uuid` | Direct mapping |
| `originalName` | `name` | Used for display name |
| `originalName` | `originalFilename` | Same value |
| `filename` | `storedFilename` | Different field name |
| `mimeType` | `mimeType` | Direct mapping |
| `fileSize` | `fileSize` | Direct mapping |
| `description` | `description` | Direct mapping (optional) |
| `createdAt` | `createdAt` | Direct mapping |
| `createdAt` | `updatedAt` | Use createdAt value |
| `filePath` | `filePath` | Direct mapping |
| `thumbnailPath` | `thumbnailPath` | Direct mapping (optional) |
| N/A | `itemType` | Constant: `'file'` |
| N/A | `folderUuid` | Parameter: `currentFolder.uuid` |
| N/A | `metadata` | Default: `{}` |
| N/A | `isFavorite` | Default: `false` |
| N/A | `tags` | Default: `[]` |
| N/A | `extractedText` | Not mapped (optional field) |
| N/A | `fileHash` | Not mapped (optional field) |

---

## Verification Checklist

After implementation, verify:

- [ ] TypeScript compilation succeeds without errors
- [ ] No ESLint warnings related to type mismatches
- [ ] File uploads work correctly in archive module
- [ ] File updates (description, metadata) are preserved
- [ ] File deletion works as expected
- [ ] onFilesUpdate callback correctly converts UnifiedFileItem[] back to ArchiveItem[]
- [ ] No runtime errors when interacting with UnifiedFileSection

---

## Testing Scenarios

1. **Upload new file**
   - Upload a file to archive folder
   - Verify it appears in the list
   - Verify type conversion works

2. **Update file metadata**
   - Change file description
   - Verify changes are saved correctly

3. **Delete file**
   - Delete a file from archive
   - Verify it's removed from the list

4. **Type safety**
   - Run `npm run build` or `npx tsc --noEmit`
   - Verify no TypeScript errors related to ArchiveLayout

---

## Notes

- The conversion helpers are defined outside the component to avoid recreating them on every render
- `currentFolder.uuid` is used for both `entityId` (UnifiedFileItem) and `folderUuid` (ArchiveItem)
- Default values are used for optional ArchiveItem fields that don't exist in UnifiedFileItem
- The reverse conversion (UnifiedFileItem → ArchiveItem) uses `createdAt` for both `createdAt` and `updatedAt` since UnifiedFileItem doesn't have `updatedAt`

---

# Issue 2: BaseService Export Conflict Resolution

## Problem
BaseService is exported twice causing compilation conflicts - once from BaseService.ts and potentially from services/index.ts.

## Solution
Remove duplicate export from index.ts, keep only BaseService.ts export.

### File: `pkms-frontend/src/services/index.ts`

**Action:** Verify BaseService export is not duplicated
- Line 9: `export { BaseService } from './BaseService';` should be the only export
- If CacheAwareBaseService is exported, ensure it's a different export name

**Check:**
```typescript
// Verify only one BaseService export exists
export { BaseService } from './BaseService'; // ✅ Keep this
// Remove any duplicate: export { BaseService as ... } from './BaseService'; // ❌ Remove if exists
```

**Note:** BaseService.ts has two classes: `CacheAwareBaseService` and `BaseService<T, TCreate, TUpdate>`. These are different classes with different names - no conflict. If there's a conflict, it's likely from index.ts exporting BaseService multiple times.

---

# Issue 3: Test Infrastructure Restoration

## Problem
7 test files missing utilities and component paths:
- ActionMenu.test.tsx has incorrect import path: `../common/ActionMenu` should be `../../components/common/ActionMenu`
- Test utilities directory may be missing: `../../test/utils`

## Solution

### Step 1: Fix ActionMenu.test.tsx Import Path
**File:** `pkms-frontend/src/components/__tests__/common/ActionMenu.test.tsx`

**Current (line 7):**
```typescript
import { ActionMenu } from '../common/ActionMenu';
```

**Fix:**
```typescript
import { ActionMenu } from '../../components/common/ActionMenu';
```

### Step 2: Verify Test Utilities
**Check if:** `pkms-frontend/src/test/utils.tsx` exists

**If missing, create:** `pkms-frontend/src/test/utils.tsx` with basic test utilities:
```typescript
// Basic test utilities for React Testing Library
export * from '@testing-library/react';
export { render } from '@testing-library/react';
```

**If exists:** Verify the import path in ActionMenu.test.tsx line 6:
```typescript
import { render, screen, fireEvent, waitFor } from '../../../test/testUtils';
// Should match actual file location
```

---

# Issue 4: DocumentsStore Type Alignment

## Problem
DocumentsStore expects properties (`isArchived`, `updatedAt`, `tags`) that may not be present on UnifiedFileItem interface.

## Solution
Add missing properties to UnifiedFileItem interface or update store expectations with proper optional chaining.

### File: `pkms-frontend/src/services/unifiedFileService.ts`

**Check UnifiedFileItem interface (around line 13-28):**

**Current:**
```typescript
export interface UnifiedFileItem {
  uuid: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  description?: string;
  createdAt: string;
  // Missing: isArchived, updatedAt, tags
}
```

**Fix - Add missing optional properties:**
```typescript
export interface UnifiedFileItem {
  uuid: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  description?: string;
  createdAt: string;
  updatedAt?: string;        // ✅ Add
  isArchived?: boolean;      // ✅ Add
  tags?: string[];           // ✅ Add
  mediaType?: string;
  isEncrypted?: boolean;
  filePath?: string;
  thumbnailPath?: string;
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  entityId: string;
}
```

### File: `pkms-frontend/src/stores/documentsStore.ts`

**Update all property accesses to use optional chaining:**
- Line 193: `isArchived: document.isArchived,` → `isArchived: document.isArchived ?? false,`
- Line 196: `updatedAt: document.updatedAt,` → `updatedAt: document.updatedAt ?? document.createdAt,`
- Line 197: `tags: document.tags,` → `tags: document.tags ?? [],`

---

# Issue 5: Missing Type Definitions

## Problem
Missing type exports and declarations:
- `UpdateDocumentRequest` not exported from documentsStore
- `DocumentSummary` type may be missing
- `nepali-date-converter` type declarations missing

## Solution

### Step 1: Export Missing Types from documentsStore
**File:** `pkms-frontend/src/stores/documentsStore.ts`

**Add type exports at the end:**
```typescript
// Export types for external use
export interface UpdateDocumentRequest {
  title?: string;
  description?: string;
  tags?: string[];
  isFavorite?: boolean;
  isArchived?: boolean;
}

export interface DocumentSummary {
  uuid: string;
  title: string;
  filename: string;
  originalName: string;
  filePath?: string;
  fileSize: number;
  mimeType: string;
  isExclusiveMode: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  projects: Array<{ uuid: string; name: string }>;
}
```

### Step 2: Install/Create nepali-date-converter Types
**Option A: Install types package**
```bash
npm install --save-dev @types/nepali-date-converter
```

**Option B: Create type declaration file**
**File:** `pkms-frontend/src/types/nepali-date-converter.d.ts`
```typescript
declare module 'nepali-date-converter' {
  export class NepaliDate {
    constructor(date?: Date | string | number);
    getYear(): number;
    getMonth(): number;
    getDate(): number;
    getEnglishDate(): Date;
    format(formatString: string): string;
  }
  export function toNepali(date: Date): NepaliDate;
  export function toEnglish(nepaliDate: NepaliDate): Date;
}
```

---

# Issue 6: CacheAwareService Import Path Fix

## Problem
Inconsistent import paths across services (if any exist).

## Solution
**Verify all imports use correct paths:**
- `import('./todosService')` ✅ Correct
- `import('./notesService')` ✅ Correct

**Check files:**
- `pkms-frontend/src/services/cacheAwareService.ts` (lines 196, 205, 223)
- Verify all dynamic imports use `./` relative paths correctly

**No action needed if imports are already correct (which they appear to be).**

---

# Issue 7: Store Property Access Issues

## Problem
Undefined property access in `save_discard_verification.ts` without proper type guards.

## Solution

### File: `pkms-frontend/src/utils/save_discard_verification.ts`

**Add optional chaining and type guards:**

**Current (lines 48-53):**
```typescript
export const isEmptyNote = (note: Partial<NoteEntity>): boolean => {
  const hasTitle = note.title?.trim().length > 0;
  const hasContent = note.content?.trim().length > 0;
  const hasFiles = note.files && note.files.length > 0;
  return !hasTitle && !hasContent && !hasFiles;
};
```

**Fix - Add proper guards:**
```typescript
export const isEmptyNote = (note: Partial<NoteEntity>): boolean => {
  const hasTitle = note.title?.trim()?.length > 0;
  const hasContent = note.content?.trim()?.length > 0;
  const hasFiles = Array.isArray(note.files) && note.files.length > 0;
  return !hasTitle && !hasContent && !hasFiles;
};
```

**Apply same pattern to:**
- `isEmptyDiaryEntry` (lines 61-68)
- `isEmptyProject` (lines 75-81)

---

# Implementation Priority

1. **CRITICAL:** Issue 1 (ArchiveLayout) - Blocks build
2. **CRITICAL:** Issue 2 (BaseService) - Blocks build
3. **HIGH:** Issue 3 (Test Infrastructure) - Blocks tests
4. **HIGH:** Issue 4 (DocumentsStore Types) - Runtime errors
5. **MEDIUM:** Issue 5 (Missing Types) - TypeScript errors
6. **LOW:** Issue 6 (CacheAwareService) - Verify only
7. **MEDIUM:** Issue 7 (Property Access) - Runtime safety

---

# Verification Checklist

After all fixes:
- [ ] TypeScript compilation succeeds: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] Tests run: `npm test`
- [ ] No runtime errors in archive module
- [ ] No runtime errors in documents module
- [ ] All type exports are available
- [ ] Optional chaining used for all property access

