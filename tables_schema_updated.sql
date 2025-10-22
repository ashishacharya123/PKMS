-- PKMS Database Schema - Updated for File Management Refactoring
-- Generated: October 22, 2024
-- AI Agent: Claude Sonnet 4.5

-- ==============================================
-- CORE TABLES
-- ==============================================

-- Users table
CREATE TABLE users (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

-- Sessions table
CREATE TABLE sessions (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    user_uuid VARCHAR(36) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Recovery keys table
CREATE TABLE recovery_keys (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    user_uuid VARCHAR(36) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    hint VARCHAR(255),
    created_at DATETIME NOT NULL,
    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ==============================================
-- DOCUMENT MANAGEMENT (UPDATED)
-- ==============================================

-- Documents table (updated with file_hash, removed exclusivity flags)
CREATE TABLE documents (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    file_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash for deduplication
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    thumbnail_path VARCHAR(500),
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Indexes for documents
CREATE INDEX ix_doc_user_archived ON documents(created_by, is_archived);
CREATE INDEX ix_doc_user_deleted ON documents(created_by, is_deleted);
CREATE INDEX ix_doc_user_created_desc ON documents(created_by, created_at);
CREATE INDEX ix_doc_user_favorite ON documents(created_by, is_favorite);
CREATE INDEX ix_doc_mime_type ON documents(mime_type, created_by);
CREATE INDEX ix_doc_file_hash ON documents(file_hash);  -- Fast duplicate detection

-- ==============================================
-- NOTES (UPDATED)
-- ==============================================

-- Notes table (updated relationships)
CREATE TABLE notes (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    content_file_path VARCHAR(500),
    size_bytes BIGINT DEFAULT 0,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_project_exclusive BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1,
    content_diff TEXT,
    last_version_uuid VARCHAR(36),
    file_count INTEGER DEFAULT 0,  -- Count of associated documents
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ==============================================
-- PROJECTS
-- ==============================================

-- Projects table
CREATE TABLE projects (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'IS_RUNNING',
    priority VARCHAR(10) DEFAULT 'MEDIUM',
    is_archived BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    progress_percentage INTEGER DEFAULT 0,
    start_date DATE,
    due_date DATE,
    completion_date DATETIME,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ==============================================
-- TODOS
-- ==============================================

-- Todos table
CREATE TABLE todos (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    task VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'PENDING',
    priority VARCHAR(10) DEFAULT 'MEDIUM',
    due_date DATETIME,
    completed_at DATETIME,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ==============================================
-- DIARY
-- ==============================================

-- Diary entries table
CREATE TABLE diary_entries (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date DATETIME NOT NULL,
    mood SMALLINT,
    weather_code SMALLINT,
    location VARCHAR(100),
    file_count INTEGER DEFAULT 0,
    content_length INTEGER DEFAULT 0,
    content_file_path VARCHAR(500),
    file_hash VARCHAR(128),
    encryption_tag VARCHAR(255),
    encryption_iv VARCHAR(255),
    is_favorite BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Diary daily metadata table
CREATE TABLE diary_daily_metadata (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    user_uuid VARCHAR(36) NOT NULL,
    date DATE NOT NULL,
    nepali_date VARCHAR(20),
    weather_code SMALLINT,
    mood_rating SMALLINT,
    energy_level SMALLINT,
    sleep_hours DECIMAL(3,1),
    exercise_minutes INTEGER,
    water_intake_glasses INTEGER,
    stress_level SMALLINT,
    productivity_rating SMALLINT,
    notes TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (user_uuid) REFERENCES users(uuid) ON DELETE CASCADE,
    UNIQUE(user_uuid, date)
);

-- ==============================================
-- ARCHIVE
-- ==============================================

-- Archive folders table
CREATE TABLE archive_folders (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_uuid VARCHAR(36),
    sort_order INTEGER DEFAULT 0,
    item_count INTEGER DEFAULT 0,
    total_size BIGINT DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (parent_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Archive items table
CREATE TABLE archive_items (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    folder_uuid VARCHAR(36),
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100),
    upload_status VARCHAR(20) DEFAULT 'COMPLETED',
    is_deleted BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (folder_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ==============================================
-- TAGS
-- ==============================================

-- Tags table
CREATE TABLE tags (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) DEFAULT '#3B82F6',
    description TEXT,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE,
    UNIQUE(name, created_by)
);

-- ==============================================
-- ASSOCIATION TABLES (UPDATED)
-- ==============================================

-- Note-Document associations (NEW)
CREATE TABLE note_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_uuid VARCHAR(36) NOT NULL,
    document_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_exclusive BOOLEAN DEFAULT FALSE,  -- Exclusivity on the link
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    UNIQUE(note_uuid, document_uuid)
);

-- Indexes for note_documents
CREATE INDEX ix_notedoc_note_order ON note_documents(note_uuid, sort_order);

-- Document-Diary associations (UPDATED)
CREATE TABLE document_diary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_uuid VARCHAR(36) NOT NULL,
    diary_entry_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_exclusive BOOLEAN DEFAULT TRUE,  -- Diary files always exclusive
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    FOREIGN KEY (diary_entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE,
    UNIQUE(document_uuid, diary_entry_uuid)
);

-- Indexes for document_diary
CREATE INDEX ix_docdiary_entry_order ON document_diary(diary_entry_uuid, sort_order);

-- Polymorphic Project Items (NEW - replaces document_projects)
CREATE TABLE project_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_uuid VARCHAR(36) NOT NULL,
    item_type VARCHAR(20) NOT NULL,  -- 'Note', 'Document', 'Todo'
    item_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_exclusive BOOLEAN DEFAULT FALSE,  -- Exclusivity on the link
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE,
    UNIQUE(project_uuid, item_type, item_uuid)
);

-- Indexes for project_items
CREATE INDEX ix_projitems_project_order ON project_items(project_uuid, sort_order);
CREATE INDEX ix_projitems_type_uuid ON project_items(item_type, item_uuid);

-- Note-Project associations
CREATE TABLE note_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_exclusive BOOLEAN DEFAULT FALSE,  -- Exclusivity on the link
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE,
    UNIQUE(note_uuid, project_uuid)
);

-- Todo-Project associations
CREATE TABLE todo_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_exclusive BOOLEAN DEFAULT FALSE,  -- Exclusivity on the link
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE,
    UNIQUE(todo_uuid, project_uuid)
);

-- Todo dependencies
CREATE TABLE todo_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_uuid VARCHAR(36) NOT NULL,
    depends_on_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (depends_on_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    UNIQUE(todo_uuid, depends_on_uuid)
);

-- ==============================================
-- TAG ASSOCIATIONS
-- ==============================================

-- Note tags
CREATE TABLE note_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE,
    UNIQUE(note_uuid, tag_uuid)
);

-- Document tags
CREATE TABLE document_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE,
    UNIQUE(document_uuid, tag_uuid)
);

-- Todo tags
CREATE TABLE todo_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE,
    UNIQUE(todo_uuid, tag_uuid)
);

-- Diary entry tags
CREATE TABLE diary_entry_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    diary_entry_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (diary_entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE,
    UNIQUE(diary_entry_uuid, tag_uuid)
);

-- Archive item tags
CREATE TABLE archive_item_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_item_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (archive_item_uuid) REFERENCES archive_items(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE,
    UNIQUE(archive_item_uuid, tag_uuid)
);

-- Archive folder tags
CREATE TABLE archive_folder_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_folder_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    FOREIGN KEY (archive_folder_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE,
    UNIQUE(archive_folder_uuid, tag_uuid)
);

-- ==============================================
-- CONFIGURATION
-- ==============================================

-- App configuration table
CREATE TABLE app_config (
    key VARCHAR(100) NOT NULL PRIMARY KEY,
    value TEXT,
    description TEXT,
    updated_at DATETIME NOT NULL
);

-- ==============================================
-- REMOVED TABLES
-- ==============================================

-- REMOVED: note_files table (replaced with note_documents)
-- REMOVED: document_projects table (replaced with project_items)
-- REMOVED: NoteFile model (replaced with Document + note_documents)

-- ==============================================
-- KEY CHANGES FROM PREVIOUS SCHEMA
-- ==============================================

-- 1. Documents table:
--    - Added file_hash column for deduplication
--    - Removed is_project_exclusive and is_diary_exclusive columns
--    - Added file_hash index

-- 2. New association tables:
--    - note_documents: Links notes to documents with exclusivity
--    - project_items: Polymorphic table for Notes, Documents, Todos

-- 3. Updated association tables:
--    - document_diary: Added is_exclusive column
--    - note_projects: Added is_exclusive column
--    - todo_projects: Added is_exclusive column

-- 4. Removed tables:
--    - note_files: Replaced with note_documents
--    - document_projects: Replaced with project_items

-- 5. Indexing improvements:
--    - Added file_hash index for fast duplicate detection
--    - Added sort_order indexes for association tables
--    - Added item_type index for polymorphic queries
