# PKMS File Management Architecture Documentation

**AI Agent**: Claude Sonnet 4.5  
**Date**: October 22, 2024  
**Purpose**: Complete architecture reference for file upload, download, chunking, caching, encryption, and associations

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Current Architecture Components](#current-architecture-components)
3. [File Upload Flow](#file-upload-flow)
4. [Association Tables & Relationships](#association-tables--relationships)
5. [Chunk Upload System](#chunk-upload-system)
6. [Download & Caching](#download--caching)
7. [Encryption (Diary-Specific)](#encryption-diary-specific)
8. [Frontend Components](#frontend-components)
9. [Critical Issues Identified](#critical-issues-identified)
10. [Planned Refactoring](#planned-refactoring)

---

## 1. System Overview

PKMS uses a **unified file management system** that supports multiple modules:

- **Documents**: General file storage with hash-based deduplication
- **Diary**: Encrypted file storage (frontend encrypts before upload)
- **Notes**: File attachments via new `note_documents` junction table
- **Projects**: Polymorphic file associations via `Project_Items` table
- **Todos**: File attachments via `Project_Items` table

### Core Principles
1. **Exclusivity on the Link**: `is_exclusive` flag moved from Documents to association tables
2. **Hash-Based Deduplication**: SHA-256 hashes prevent duplicate file storage
3. **Polymorphic Project Items**: Single table for Notes, Documents, and Todos in projects
4. **Diary Encryption**: Frontend encrypts files before upload to backend

---

## 2. Current Architecture Components

### Backend Services

#### File Upload Services
- **`unified_upload_service.py`**: Main upload orchestrator
  - Handles chunk assembly and metadata storage
  - Calls module-specific commit functions
  - **MISSING**: `/chunk` endpoint in router (CRITICAL BUG)

- **`chunk_service.py`**: Chunk management
  - `ChunkManager` class for chunk storage and assembly
  - `save_chunk()`, `assemble_file()`, `get_progress()`
  - **STATUS**: Complete but endpoint not exposed

- **`unified_download_service.py`**: Download orchestrator
  - Handles file retrieval and streaming
  - Module-specific download logic

#### Document Services
- **`document_crud_service.py`**: Document CRUD operations
  - `commit_document_upload()`: Creates document records
  - `delete_document()`: Handles deletion logic
  - **NEEDS**: Hash calculation and exclusivity logic

- **`diary_document_service.py`**: Diary-specific document handling
  - Links documents to diary entries
  - **NEEDS**: Update to use association-level exclusivity

#### Association Services
- **`archive_item_service.py`**: Archive document associations
- **`diary_metadata_service.py`**: Diary document metadata
- **MISSING**: `note_document_service.py` (needs creation)

### Database Models

#### Core Tables
- **`Documents`**: File metadata storage
  - **CURRENT**: `is_project_exclusive`, `is_diary_exclusive` (to be removed)
  - **NEEDS**: `file_hash` column for deduplication

- **`Notes`**: Note content
  - **CURRENT**: Has `files` relationship via `NoteFile` (to be removed)
  - **NEEDS**: `documents` relationship via `note_documents`

- **`Diaries`**: Diary entries
  - **CURRENT**: Uses `document_diary` association
  - **NEEDS**: Update to use `is_exclusive` on association

- **`Projects`**: Project management
  - **CURRENT**: Has `documents` relationship
  - **NEEDS**: Migrate to `Project_Items` polymorphic table

#### Association Tables (Current)
- **`document_diary`**: Links documents to diary entries
- **`document_projects`**: Links documents to projects
- **`todo_dependencies`**: Todo dependency relationships (KEEP)
- **`note_files`**: Note file attachments (REMOVE)

#### Association Tables (New)
- **`note_documents`**: Links documents to notes with exclusivity
- **`Project_Items`**: Polymorphic table for Notes, Documents, Todos in projects

---

## 3. File Upload Flow

### Current Upload Process

1. **Frontend Initiation**
   - User selects file in module (Diary/Notes/Projects)
   - `coreUploadService.ts` handles chunked upload
   - **DIARY**: `diaryCryptoService.encryptFile()` encrypts before upload

2. **Chunk Upload**
   - Frontend POSTs to `/api/v1/upload/chunk` (MISSING ENDPOINT!)
   - Chunks stored via `chunk_service.py`
   - Progress tracked in `chunk_manager`

3. **File Assembly**
   - `chunk_manager.assemble_file()` combines chunks
   - Calls `unified_upload_service.commit_upload()`

4. **Module-Specific Commit**
   - **Documents**: `document_crud_service.commit_document_upload()`
   - **Diary**: `diary_document_service.link_documents_to_diary_entry()`
   - **Notes**: (Currently via `NoteFile`, needs `note_documents`)

### Planned Upload Flow

1. **Hash Calculation**
   - Calculate SHA-256 hash of uploaded file
   - Check for existing document with same hash
   - Handle duplicate detection logic

2. **Exclusivity Logic**
   - **Diary**: Always `is_exclusive=True` (encrypted, private)
   - **Notes**: User choice via checkbox
   - **Projects**: User choice via `Project_Items`
   - **Standalone**: Never exclusive

3. **Association Creation**
   - Create document record (if new)
   - Create association with appropriate `is_exclusive` flag
   - Handle orphan cleanup for non-exclusive documents

---

## 4. Association Tables & Relationships

### Current Association Structure

```sql
-- Current (to be updated)
document_diary (document_uuid, diary_uuid, sort_order)
document_projects (document_uuid, project_uuid, sort_order)
note_files (note_uuid, file_path, file_name) -- TO REMOVE
```

### New Association Structure

```sql
-- Updated with exclusivity
document_diary (document_uuid, diary_uuid, sort_order, is_exclusive)
document_projects (document_uuid, project_uuid, sort_order, is_exclusive)

-- New junction table
note_documents (note_uuid, document_uuid, sort_order, is_exclusive)

-- Polymorphic project items
Project_Items (project_uuid, item_type, item_uuid, sort_order, is_exclusive)
-- item_type: 'Note', 'Document', 'Todo'
```

### Relationship Mapping

- **Notes ↔ Documents**: `note_documents` junction table
- **Diary ↔ Documents**: `document_diary` (updated with exclusivity)
- **Projects ↔ Items**: `Project_Items` (polymorphic for Notes, Documents, Todos)
- **Todos ↔ Dependencies**: `todo_dependencies` (unchanged, different purpose)

---

## 5. Chunk Upload System

### Backend Components

#### `chunk_service.py`
```python
class ChunkManager:
    async def save_chunk(file_id, chunk_number, chunk_data, metadata)
    async def assemble_file(file_id) -> str  # Returns file path
    async def get_progress(file_id) -> dict
    async def cleanup_chunks(file_id)
```

#### `unified_upload_service.py`
```python
async def commit_upload(file_id, module, metadata):
    # 1. Get assembled file path from chunk_manager
    # 2. Calculate file hash
    # 3. Call module-specific commit function
    # 4. Handle duplicate detection
```

### Frontend Components

#### `coreUploadService.ts`
```typescript
class CoreUploadService {
    async uploadFile(file, options): Promise<string>
    async uploadChunk(fileId, chunkNumber, chunk, metadata): Promise<void>
    async getUploadStatus(fileId): Promise<UploadStatus>
}
```

### Critical Issue: Missing Endpoint

**PROBLEM**: Frontend calls `POST /api/v1/upload/chunk` but this endpoint doesn't exist!

**SOLUTION**: Add to `unified_uploads.py`:
```python
@router.post("/chunk")
async def upload_chunk(
    file: UploadFile = File(...),
    metadata: str = Form(...)
):
    # Extract metadata JSON
    # Call chunk_manager.save_chunk()
    # Auto-trigger assembly when complete
    # Return progress status
```

---

## 6. Download & Caching

### Download Flow

1. **Request Initiation**
   - Frontend calls module-specific download endpoint
   - Backend validates permissions and file existence

2. **File Retrieval**
   - `unified_download_service.py` orchestrates download
   - Module-specific services handle file access

3. **Streaming Response**
   - File streamed to client with appropriate headers
   - Caching headers set for browser caching

### Caching Strategy

- **Browser Caching**: ETags and Last-Modified headers
- **Server Caching**: File metadata cached in memory
- **Diary Files**: Decryption happens on-demand (no server-side cache)

---

## 7. Encryption (Diary-Specific)

### Frontend Encryption

#### `diaryCryptoService.ts`
```typescript
class DiaryCryptoService {
    async encryptFile(file: File, userKey: string): Promise<File>
    async decryptFile(encryptedFile: File, userKey: string): Promise<File>
    generateUserKey(): string
}
```

### Encryption Flow

1. **User Uploads File to Diary**
   - Frontend encrypts file with user's key
   - Creates `.dat` file with encrypted content
   - Uploads encrypted file to backend

2. **Backend Storage**
   - Stores encrypted file as-is
   - No server-side decryption
   - Hash calculated on encrypted file (allows deduplication)

3. **Download & Decryption**
   - Backend streams encrypted file
   - Frontend decrypts with user's key
   - Original file restored client-side

### Security Considerations

- **Key Management**: User keys never sent to server
- **Hash Deduplication**: Works on encrypted files
- **Exclusivity**: Diary files always exclusive (private to user)

---

## 8. Frontend Components

### File Management Components

#### `FileSection.tsx`
- Unified file upload interface
- Handles drag-and-drop
- Shows upload progress
- Module-specific upload logic

#### `FileList.tsx`
- Displays attached files
- Handles file operations (download, delete, reorder)
- Shows exclusivity status

#### `FileView.tsx`
- File preview and metadata
- Download functionality
- Association management

### Service Integration

#### `diaryService.ts`
```typescript
async uploadFile(diaryUuid, file): Promise<void> {
    // 1. Encrypt file with diaryCryptoService
    // 2. Upload via coreUploadService
    // 3. Commit with is_exclusive=true
}
```

#### `noteService.ts` (to be created)
```typescript
async uploadFileToNote(noteUuid, file, isExclusive): Promise<void>
async linkDocumentsToNote(noteUuid, documentUuids, isExclusive[]): Promise<void>
async unlinkDocumentFromNote(noteUuid, documentUuid): Promise<void>
```

---

## 9. Critical Issues Identified

### 1. Missing Chunk Upload Endpoint (CRITICAL)
- **Issue**: Frontend calls `/upload/chunk` but endpoint doesn't exist
- **Impact**: File uploads fail silently
- **Fix**: Add endpoint to `unified_uploads.py`

### 2. No Hash-Based Deduplication
- **Issue**: Documents table lacks `file_hash` column
- **Impact**: Duplicate files stored multiple times
- **Fix**: Add hash column and deduplication logic

### 3. Exclusivity Logic in Wrong Place
- **Issue**: `is_exclusive` flags on Documents table
- **Impact**: Can't have same file exclusive to multiple items
- **Fix**: Move to association tables

### 4. Missing Note Document Support
- **Issue**: No `note_documents` junction table
- **Impact**: Notes can't attach documents properly
- **Fix**: Create junction table and service

### 5. No Polymorphic Project Items
- **Issue**: Projects only support documents, not notes/todos
- **Impact**: Limited project functionality
- **Fix**: Create `Project_Items` polymorphic table

---

## 10. Planned Refactoring

### Phase 0: Critical Fixes
1. Add missing chunk upload endpoint
2. Verify router registration

### Phase 1: Database Schema
1. Update Documents model (add hash, remove exclusivity)
2. Create note_documents junction table
3. Add exclusivity to existing associations
4. Create Project_Items polymorphic table
5. Remove NoteFile model

### Phase 2: Service Layer
1. Create document exclusivity service
2. Create document hash service
3. Update upload service with hash calculation
4. Create note document service

### Phase 3: Upload Flow
1. Update document CRUD with hash logic
2. Update diary document service
3. Implement orphan cleanup

### Phase 4: Deletion Logic
1. Update document deletion with exclusivity checks
2. Update parent deletion to trigger orphan cleanup

### Phase 5: Queries & Dashboards
1. Update document dashboard with CTE queries
2. Create polymorphic project items queries

### Phase 6: API Updates
1. Update document schemas
2. Create note document endpoints
3. Update existing endpoints

### Phase 7: Frontend Integration
1. Update diary upload service
2. Create note upload service
3. Update document service
4. Update type definitions

### Phase 8: Cleanup
1. Remove old NoteFile system
2. Update model imports
3. Update documentation

---

## Implementation Notes

### Hash Calculation
- Use SHA-256 for file hashing
- Calculate on uploaded file BEFORE database record creation
- For diary files: Hash the ENCRYPTED .dat file

### Exclusivity Rules
1. **Diary files**: ALWAYS `is_exclusive=True` (encrypted, private)
2. **Note files**: User choice (checkbox: "Make exclusive to this note")
3. **Project files**: User choice (checkbox: "Make exclusive to this project")
4. **Standalone documents**: NEVER exclusive (always public)

### Error Handling
- "This file already exists and is exclusively owned by another item"
- "You can link this existing file (non-exclusive) or upload a new copy"
- "Cannot delete document: It is exclusively attached to [Note/Diary/Project]"

### Performance Considerations
- Use CTE queries for exclusivity checks (efficient in SQLite)
- Batch load associations to avoid N+1 queries
- Cache exclusivity status for frequently accessed documents

---

**End of Documentation**