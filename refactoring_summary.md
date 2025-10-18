# Refactoring Summary - What Remains To Do

## ✅ Backend: 100% Complete

All backend model refactoring is complete and verified. Backend is ready for production.

---

## 🎯 Frontend Updates Required (Next Branch)

**Note: Frontend changes will be implemented in the next branch to avoid conflicts with current development.**

### 1. TypeScript Interface Updates

#### **Notes Interface** (`pkms-frontend/src/types/notes.ts` or similar)
- [ ] Remove `noteType` field
- [ ] Add `description: string | null` field
- [ ] In NoteFile interface: Change `isArchived` to `isDeleted`

#### **Documents Interface** (`pkms-frontend/src/types/documents.ts`)
- [ ] Remove `uploadStatus` field
- [ ] Note: Upload status only shown during active uploads, not persisted in DB

#### **Todos Interface** (`pkms-frontend/src/types/todos.ts`)
- [ ] Rename `estimateMinutes` to `estimateDays`
- [ ] Keep `actualMinutes: number | null` as is

#### **Projects Interface** (`pkms-frontend/src/types/projects.ts`)
- [ ] Remove `color` field
- [ ] Remove `icon` field
- [ ] Add `dueDate: string | null` (ISO date string)
- [ ] Add `completionDate: string | null` (ISO datetime string)

#### **Tags Interface** (`pkms-frontend/src/types/tags.ts`)
- [ ] Remove `moduleType` field
- [ ] Tags are now global across all modules

#### **Diary Interfaces** (`pkms-frontend/src/types/diary.ts`)
- [ ] DiaryEntry: Remove `isArchived` field
- [ ] DiaryEntry: Remove `dailyMetadataId` field
- [ ] DiaryDailyMetadata: Verify `dayOfWeek: number | null` exists
- [ ] DiaryMedia: Rename `caption` to `description`
- [ ] DiaryMedia: Remove `isEncrypted` field

---

### 2. UI Component Updates

#### **Tag Components**
- [ ] Remove module type filter from tag selection dropdown
- [ ] Update tag autocomplete to work globally (no module filtering)
- [ ] Update UI to show that tags can be used across notes, todos, documents, diary, etc.

#### **Project Components**
- [ ] Remove color picker UI element
- [ ] Remove icon selector UI element
- [ ] Add due date picker component
- [ ] Add completion date display/picker (for marking project complete)
- [ ] Update project creation/edit forms

#### **Todo Components**
- [ ] Change estimate input label from "Minutes" to "Days"
- [ ] Update input validation (typically 1-30 days range)
- [ ] Update todo creation/edit forms
- [ ] Optional: Show conversion hint (e.g., "5 days ≈ 40 hours")

#### **Diary Components**
- [ ] Remove "Archive" button/toggle (only "Delete" remains)
- [ ] Update metadata fetching logic (use date matching instead of dailyMetadataId)
- [ ] Change media form field label from "Caption" to "Description"
- [ ] Update diary media upload forms

---

### 3. Service Layer Updates

#### **Tag Services**
- [ ] Remove moduleType parameter from tag creation API calls
- [ ] Update tag autocomplete service to not filter by module
- [ ] Verify tag CRUD operations work without module separation

#### **Project Services**
- [ ] Remove color/icon from project creation payloads
- [ ] Add dueDate and completionDate to project creation/update payloads
- [ ] Update project response handling

#### **Todo Services**
- [ ] Update estimate field from estimateMinutes to estimateDays in API calls
- [ ] Update todo creation/update payloads

#### **Diary Services**
- [ ] Remove isArchived from diary entry filters
- [ ] Remove dailyMetadataId from diary entry creation
- [ ] Update media upload to use description instead of caption

---

### 4. Testing & Validation

- [ ] Test all CRUD operations for each module
- [ ] Verify tag autocomplete works globally across all modules
- [ ] Test project creation without color/icon
- [ ] Test todo estimation with days instead of minutes
- [ ] Test diary entry creation without archived flag
- [ ] Verify all soft delete operations work correctly
- [ ] Test frontend builds successfully with updated types

---

## 🗄️ Database Reset Required

Since there are no users or data yet:
1. Drop existing database
2. Restart backend to auto-create tables from SQLAlchemy models
3. Test with fresh data

---

## 📋 Key Architectural Changes to Remember

1. **Global Tags**: Tags now work across ALL modules (notes, docs, todos, diary, projects)
2. **No Project Colors**: Projects no longer have visual customization (color/icon removed)
3. **Days for Estimates**: Todo estimates are now in days (more intuitive than minutes)
4. **Consistent Soft Delete**: All modules use `isDeleted` flag consistently
5. **Diary Simplified**: Diary entries use date-based metadata relationship (no FK)

---

## 🎯 Priority Order

**Phase 1 (Critical):**
1. Update all TypeScript interfaces first
2. Fix compilation errors

**Phase 2 (High Priority):**
3. Update tag components (affects all modules)
4. Update project components (color/icon removal)
5. Update todo components (estimate days)

**Phase 3 (Medium Priority):**
6. Update diary components
7. Update service layer calls
8. Test all modules

**Phase 4 (Final):**
9. Full integration testing
10. UI/UX polish for new fields (due dates, etc.)
