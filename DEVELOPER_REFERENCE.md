# 🛠️ Developer Reference Guide

## 📁 File Structure Overview

```
pkms-frontend/src/
├── components/
│   ├── common/           # Reusable components
│   │   ├── ActionMenu.tsx
│   │   ├── DateRangePicker.tsx
│   │   ├── LoadingSkeleton.tsx
│   │   ├── TagSelector.tsx
│   │   ├── ProjectSelector.tsx
│   │   └── ViewModeLayouts.tsx
│   ├── file/             # File handling components
│   │   ├── FileUploadModal.tsx      ✅ NEW - Modal wrapper
│   │   ├── FileUploadZone.tsx       ✅ NEW - Drag & drop zone
│   │   ├── AudioRecorderModal.tsx   ✅ NEW - Audio recording
│   │   ├── FileSection.tsx          ✅ UPDATED - Uses new components
│   │   ├── FileList.tsx             ✅ EXISTING - File display
│   │   └── FileUpload_unused.tsx    ❌ LEGACY - Marked unused
│   ├── search/           # Search components
│   │   ├── UnifiedSearchEmbedded.tsx ✅ NEW - Reusable search
│   │   ├── SearchTypeToggle.tsx     ✅ NEW - FTS5/Fuzzy toggle
│   │   └── UnifiedSearch.tsx        ✅ UPDATED - Uses SearchTypeToggle
│   └── calendar/
│       └── UnifiedCalendar_unused.tsx ❌ LEGACY - Marked unused
├── services/
│   ├── BaseService.ts               ✅ NEW - DRY CRUD operations
│   ├── notesService.ts              ✅ UPDATED - Extends BaseService
│   ├── todosService.ts              ✅ UPDATED - Uses enums
│   ├── documentsService.ts          ✅ UPDATED - Uses enums
│   └── tagsService.ts               ✅ NEW - Global tag operations
├── types/
│   ├── enums.ts                     ✅ NEW - Centralized enums
│   ├── common.ts                    ✅ NEW - Base interfaces
│   ├── note.ts                      ✅ NEW - Note interfaces
│   ├── todo.ts                      ✅ NEW - Todo interfaces
│   ├── project.ts                   ✅ NEW - Project interfaces
│   ├── document.ts                  ✅ NEW - Document interfaces
│   └── tag.ts                       ✅ NEW - Tag interfaces
├── utils/
│   ├── nepaliConstants.ts           ✅ NEW - Shared Nepali constants
│   ├── nepaliDateCache.ts           ✅ NEW - Date caching system
│   └── dragAndDrop.ts               ✅ EXISTING - Drag & drop utilities
└── theme/
    └── colors.ts                    ✅ NEW - Status/priority colors
```

## 🔧 Tool Call Syntax Reference

### File Operations (USE THESE TOOLS, NOT CLI!)
```typescript
// ✅ CORRECT: Use file operations tools
read_file(target_file: "path/to/file.tsx")
write(file_path: "path/to/newfile.tsx", contents: "content")
search_replace(file_path: "path/to/file.tsx", old_string: "old", new_string: "new")
delete_file(target_file: "path/to/file.tsx")

// ❌ WRONG: Don't use CLI commands
// run_terminal_cmd(command: "move file.tsx newfile.tsx")
```

### Search Operations (USE THESE TOOLS!)
```typescript
// ✅ CORRECT: Use search tools
grep(pattern: "import.*ComponentName", path: "pkms-frontend/src")
codebase_search(query: "How does ComponentName work?", target_directories: ["src/components"])
list_dir(target_directory: "pkms-frontend/src/components")

// ❌ WRONG: Don't use CLI grep
// run_terminal_cmd(command: "grep -r ComponentName")
```

### File Renaming Strategy
```typescript
// 1. Read the old file
const oldContent = read_file(target_file: "oldfile.tsx")

// 2. Write to new file name
write(file_path: "newfile.tsx", contents: oldContent)

// 3. Delete old file
delete_file(target_file: "oldfile.tsx")
```

## 🎯 Current Component Usage

### File Upload System
- **FileUploadModal** - Main file upload interface
- **FileUploadZone** - Drag & drop functionality  
- **AudioRecorderModal** - Voice note recording
- **FileSection** - Container that uses all above components

### Action Menus
- **ActionMenu** - Replaces all individual Menu implementations
- Used in: NotesPage, TodosPage, DocumentsPage, ProjectsPage

### Loading States
- **LoadingSkeleton** - Replaces generic loading divs
- Used in: ViewModeLayouts, all page components

### Search System
- **UnifiedSearchEmbedded** - Reusable search component
- **SearchTypeToggle** - FTS5/Fuzzy/Advanced Fuzzy selection
- Used in: NotesPage, TodosPage, DiaryPage

### Security & Session Management
- **SessionTimeoutWarning** - Auto-lock diary after 10 minutes of inactivity
- **Enhanced lockSession** - Clears all diary cache, entries, and Nepali date cache
- **Cache Management** - Prevents unnecessary data retention in memory

## 🚫 Legacy Files (Marked as _unused)
- `FileUpload_unused.tsx` - Old Lucide-based file upload
- `UnifiedCalendar_unused.tsx` - Unused calendar component
- `MoodStatsWidget_unused.tsx` - Deleted mood widget
- `MoodTrendChart_unused.tsx` - Deleted mood chart
- `HabitAnalytics_unused.tsx` - Old analytics component (replaced by ComprehensiveHabitTracker)
- `DiaryPage_unused.tsx` - Old diary page (replaced by DiaryPageEnhanced)
- `AdvancedAnalytics_unused.tsx` - Unused analytics component
- `WellnessBadges_unused.tsx` - Unused wellness badges
- `SessionTimeoutWarning.tsx` - ✅ RESTORED - Critical security component for diary session management

## ✅ Integration Status

### Completed Integrations
- ✅ BaseService → notesService, todosService, documentsService
- ✅ LoadingSkeleton → ViewModeLayouts, all pages
- ✅ ActionMenu → NotesPage, TodosPage, DocumentsPage, ProjectsPage
- ✅ FileUploadModal → FileSection (replaces legacy FileUpload)
- ✅ AudioRecorderModal → FileSection, DiaryPage
- ✅ UnifiedSearchEmbedded → NotesPage, TodosPage, DiaryPage
- ✅ SearchTypeToggle → UnifiedSearch
- ✅ Component Replacement → HabitAnalytics (ComprehensiveHabitTracker), DiaryPage (DiaryPageEnhanced)
- ✅ Index.ts Exports → diary/, file/, todos/, projects/ directories

### Pending Integrations
- 🔄 DateRangePicker → Todo forms, Project forms
- 🔄 FileUploadModal → Other modules (diary, documents)
- 🔄 Update imports to use new component names

## 🎨 Component Architecture

### DRY Principles Applied
1. **BaseService** - Generic CRUD operations
2. **ActionMenu** - Reusable action buttons
3. **LoadingSkeleton** - Consistent loading states
4. **UnifiedSearchEmbedded** - Shared search interface
5. **FileUploadModal** - Unified file upload experience

### Enum System
- All status/priority values use centralized enums
- Consistent with backend `app/models/enums.py`
- Type-safe across all components

### Nepali Date System
- `nepaliDateCache` - 20-item LRU cache
- Pre-caches dashboard dates (past 7 + today + next 3)
- Provides both sortable and display formats
- Includes day of week in Nepali

## 🔍 Quick Debugging

### Find Component Usage
```bash
# Find where component is imported
grep -r "import.*ComponentName" pkms-frontend/src/

# Find where component is used
grep -r "<ComponentName" pkms-frontend/src/ --include="*.tsx"
```

### Check for Unused Files
```bash
# Find files that might be unused
find pkms-frontend/src -name "*.tsx" -exec grep -L "import\|export" {} \;
```

### Linting Issues
```bash
# Check specific file
npm run lint pkms-frontend/src/pages/NotesPage.tsx

# Check all files
npm run lint
```

## 📝 Next Steps Priority

1. **Complete ActionMenu integration** in remaining pages
2. **Integrate DateRangePicker** in forms
3. **Apply FileUploadModal** to other modules
4. **Add drag-and-drop** functionality
5. **Update remaining services** to extend BaseService
6. **Clean up remaining legacy files**

---

*Last Updated: Current session*
*AI Agent: Claude Sonnet 4*
