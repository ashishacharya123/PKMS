# Archive Module Implementation Plan

## 📁 Overview
The Archive module provides hierarchical folder/file organization for PKMS, similar to a traditional file system with smart tagging and search capabilities.

## 🏗️ Backend Implementation

### Database Models ✅ COMPLETED
- `ArchiveFolder`: Hierarchical folder structure
- `ArchiveItem`: Files within folders
- Relationships with User and Tag models

### API Router (TO BE IMPLEMENTED)
Location: `pkms-backend/app/routers/archive.py`

#### Required Endpoints:

**Folder Management:**
- `POST /api/v1/archive/folders` - Create folder
- `GET /api/v1/archive/folders` - List folders (tree structure)
- `GET /api/v1/archive/folders/{uuid}` - Get folder details
- `PUT /api/v1/archive/folders/{uuid}` - Update folder
- `DELETE /api/v1/archive/folders/{uuid}` - Delete folder
- `POST /api/v1/archive/folders/{uuid}/move` - Move folder

**File Management:**
- `POST /api/v1/archive/folders/{folder_uuid}/upload` - Upload file to folder
- `GET /api/v1/archive/items/{uuid}` - Get file details
- `PUT /api/v1/archive/items/{uuid}` - Update file metadata
- `DELETE /api/v1/archive/items/{uuid}` - Delete file
- `GET /api/v1/archive/items/{uuid}/download` - Download file
- `POST /api/v1/archive/items/{uuid}/move` - Move file between folders

**Search & Navigation:**
- `GET /api/v1/archive/search` - Search files across all folders
- `GET /api/v1/archive/folders/{uuid}/items` - List files in folder
- `GET /api/v1/archive/breadcrumb/{uuid}` - Get folder path

### AI Integration ✅ COMPLETED
- Smart tagging for archive content
- Content categorization (datasets, configs, backups)
- Text extraction and analysis

## 🎨 Frontend Implementation

### Required Components

**Archive Page Structure:**
The Archive page has been completely redesigned using Mantine's `<AppShell>` to provide a modern, two-column layout.

- **`AppShell.Navbar` (Left Sidebar):**
  - Contains a new, persistent `FolderTreeView` component.
  - This tree view displays the entire folder hierarchy, is expandable, and highlights the currently selected folder. It provides the primary navigation method.

- **`AppShell.Main` (Main Content Area):**
  - Displays the content of the currently selected folder, including lists of subfolders and items.
  - Contains the header with breadcrumbs, action buttons (Create Folder, Upload), view/sort controls, and filters.
  - Also serves as the area where forms for creating/editing folders and uploading files are rendered.

```
/archive
├── AppShell
│   ├── Navbar (Sidebar)
│   │   └── FolderTreeView (interactive folder hierarchy)
│   └── Main (Content Area)
│       ├── Header (Breadcrumbs, Actions, Filters)
│       ├── FolderContent (Subfolders & Items Grid/List)
│       └── Forms (Create/Edit Folder, Upload)
```

### Service Layer
Location: `pkms-frontend/src/services/archiveService.ts`

**Required Functions:**
- Folder CRUD operations
- File upload/download
- Search functionality
- Move operations

### State Management
Location: `pkms-frontend/src/stores/archiveStore.ts`

**State Structure:**
```typescript
interface ArchiveState {
  folders: ArchiveFolder[];
  currentFolder: ArchiveFolder | null;
  files: ArchiveItem[];
  selectedItems: string[];
  isLoading: boolean;
  uploadProgress: number;
}
```

### Navigation Integration
Update `Navigation.tsx` to change "Documents" to "Archive" or add both modules.

## 🔧 Implementation Steps

### Phase 1: Backend API
1. Create `app/routers/archive.py`
2. Implement folder management endpoints
3. Implement file management endpoints
4. Add search functionality
5. Test API endpoints

### Phase 2: Frontend Services
1. Create `archiveService.ts`
2. Create `archiveStore.ts`
3. Update navigation
4. Create basic Archive page

### Phase 3: UI Components
1. Folder tree component
2. File grid/list component
3. Upload interface
4. Search functionality
5. Move/organize features

### Phase 4: Advanced Features
1. Drag & drop organization
2. Bulk operations
3. Advanced search filters
4. Keyboard shortcuts

## 📊 Technical Considerations

### File Storage
- Store files in organized folder structure on disk
- Maintain folder hierarchy in database
- Generate thumbnails for supported file types
- Extract text content for search

### Performance
- Lazy load folder tree for large hierarchies
- Paginate file listings
- Cache folder structures
- Optimize search queries

### Security
- Validate folder paths to prevent directory traversal
- Check user permissions on all operations
- Sanitize file names and folder names
- Limit upload sizes and file types

## 🎯 Success Criteria

### Functional Requirements
- ✅ Users can create nested folders
- ✅ Users can upload files to specific folders
- ✅ Users can search across all archive content
- ✅ Users can move files and folders
- ✅ Smart tagging works for archive content

### Non-Functional Requirements
- ✅ Fast folder navigation (<200ms)
- ✅ Efficient file uploads with progress
- ✅ Responsive UI for mobile/desktop
- ✅ Proper error handling and feedback

## 🔗 Integration Points

### With Existing Modules
- **Tags**: Shared tagging system
- **Search**: Global search includes archive
- **AI Service**: Smart tagging for uploaded files
- **Navigation**: Archive accessible from main nav

### File Processing Pipeline
1. File upload → Storage
2. Text extraction → AI analysis
3. Smart tag generation → Database
4. Thumbnail generation (if applicable)
5. Search index update

## 📝 Notes
- Archive is separate from Documents module
- Focus on hierarchical organization
- Maintain backward compatibility
- Consider future archive/export features 