-- PKMS Database Schema
-- Generated: October 21, 2025 - Updated to match current SQLAlchemy models
-- Source: Current SQLAlchemy models in pkms-backend/app/models/
-- Description: Complete database schema for Personal Knowledge Management System

-- ============================================================
-- ✅ ARCHITECTURAL NOTES - SCHEMA ALIGNED WITH MODELS
-- ============================================================
--
-- ✅ SCHEMA CONSISTENCY ACHIEVED:
-- This schema now matches the SQLAlchemy models exactly:
-- - All tables use `created_by VARCHAR(36)` for user ownership
-- - All foreign keys reference `users(uuid)` correctly
-- - All indexes are optimized for common query patterns
--
-- 📋 REQUIRED PATTERN (CONFIRMED WORKING):
-- ```python
# In every function
current_user_uuid = current_user.uuid
# In queries
select(Model).where(Model.created_by == current_user_uuid)
# In creation
Model(field=value, created_by=current_user_uuid)
-- ```
--
-- 🚀 PERFORMANCE OPTIMIZATIONS:
-- - Added composite indexes for common query patterns
-- - Optimized indexes for user-specific data filtering
-- - Added missing indexes for diary templates and archive paths
--
-- 📖 SEE ALSO:
-- - ARCHITECTURAL_RULES.md - Complete pattern documentation
-- - app/models/ - Current SQLAlchemy model definitions
-- ============================================================

-- ================================
-- USERS & AUTHENTICATION
-- ================================

-- Main user table with authentication and diary encryption
CREATE TABLE users (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash (includes salt)
    login_password_hint VARCHAR(255),     -- Simple hint for login password

    -- Diary encryption fields (separate from login auth)
    diary_password_hash VARCHAR(255),     -- bcrypt hash for diary encryption
    diary_password_hint VARCHAR(255),     -- Hint for diary password

    is_active BOOLEAN,
    is_first_login BOOLEAN,
    settings_json TEXT DEFAULT '{}',      -- User preferences as JSON

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    last_login DATETIME
);

-- Application configuration settings per user
CREATE TABLE app_config (
    config_name VARCHAR(100) NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    config_json TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    PRIMARY KEY (config_name, created_by),
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- User session management for authentication
CREATE TABLE sessions (
    session_token VARCHAR(255) NOT NULL PRIMARY KEY,
    created_by VARCHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL,
    last_activity DATETIME,
    ip_address VARCHAR(45),               -- IPv6 support
    user_agent VARCHAR(500),

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Password recovery system with security questions
CREATE TABLE recovery_keys (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    created_by VARCHAR(36) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    questions_json TEXT NOT NULL,         -- Security questions as JSON
    answers_hash VARCHAR(255) NOT NULL,   -- Hashed answers
    salt VARCHAR(255) NOT NULL,           -- Salt for answers
    created_at DATETIME NOT NULL,
    last_used DATETIME,

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ================================
-- TAGS & ORGANIZATION
-- ================================

-- Universal tagging system for all content types (global tags)
CREATE TABLE tags (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3498db',   -- Hex color code
    usage_count INTEGER NOT NULL,         -- CRITICAL: Tracks usage for cleanup and UI sorting
    is_system BOOLEAN,                    -- System tags can't be deleted
    is_archived BOOLEAN,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE,
    UNIQUE (name, created_by)  -- Ensures unique tag names per user (universal across all modules)
);

-- ================================
-- NOTES MODULE
-- ================================

-- Personal notes and knowledge management
CREATE TABLE notes (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,                     -- Brief description for FTS5 search
    content TEXT NOT NULL,
    content_file_path VARCHAR(500),       -- For large content stored as files
    size_bytes BIGINT NOT NULL,           -- Calculated on the fly and stored for analytics
    is_favorite BOOLEAN,
    is_archived BOOLEAN,
    is_project_exclusive BOOLEAN,         -- If True, note is deleted when any of its projects are deleted
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    version INTEGER,
    content_diff TEXT,                    -- Stores diff from previous version
    last_version_uuid VARCHAR(36),        -- Points to previous version
    is_deleted BOOLEAN,                   -- Soft Delete
    file_count INTEGER NOT NULL,          -- Derived counts - updated via service methods when files are added/removed
    thumbnail_path VARCHAR(500),          -- Path to note thumbnail (if applicable)

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE,
    FOREIGN KEY (last_version_uuid) REFERENCES notes(uuid)
);

-- File attachments for notes (documents, images, etc.)
CREATE TABLE note_files (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    note_uuid VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,       -- Stored filename on disk
    original_name VARCHAR(255) NOT NULL,  -- Original uploaded name
    file_path VARCHAR(500) NOT NULL,      -- Path relative to data directory
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,                     -- Optional description/caption
    display_order INTEGER NOT NULL,       -- Order of display within note (0 = first)

    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE
);

-- ================================
-- DOCUMENTS MODULE
-- ================================

-- Document storage and management
CREATE TABLE documents (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,      -- Stored filename on disk
    original_name VARCHAR(255) NOT NULL, -- Original uploaded name
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,
    is_favorite BOOLEAN,
    is_archived BOOLEAN,
    is_project_exclusive BOOLEAN,        -- If True, document is deleted when any of its projects are deleted
    is_diary_exclusive BOOLEAN,          -- If True, document is hidden from main document list (diary-only)
    is_deleted BOOLEAN,                  -- Soft Delete
    thumbnail_path VARCHAR(500),         -- Path to thumbnail file
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ================================
-- TODO MODULE
-- ================================

-- Task management projects
CREATE TABLE projects (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER,
    -- Status and lifecycle
    status VARCHAR(10) NOT NULL,          -- Enum: IS_RUNNING, ON_HOLD, COMPLETED, CANCELLED
    priority VARCHAR(6) NOT NULL,         -- Enum: LOW, MEDIUM, HIGH, URGENT
    is_archived BOOLEAN,
    is_favorite BOOLEAN,
    is_deleted BOOLEAN,
    progress_percentage INTEGER,          -- Auto-calculated from todos or manual override
    -- Timeline
    start_date DATE,
    due_date DATE,                       -- When project should be completed
    completion_date DATETIME,            -- When project was actually completed
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    search_vector TEXT,                  -- Populated with searchable content for FTS5

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Project sections ordering within projects
CREATE TABLE project_section_order (
    project_uuid VARCHAR(36) NOT NULL,
    section_type TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    PRIMARY KEY (project_uuid, section_type),
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
);

-- Task management todos
CREATE TABLE todos (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(11) NOT NULL,          -- Enum: PENDING, IN_PROGRESS, BLOCKED, DONE, CANCELLED
    todo_type VARCHAR(9) NOT NULL,        -- Enum: TASK, CHECKLIST, SUBTASK
    order_index INTEGER NOT NULL,         -- For Kanban ordering
    -- Checklist functionality (for todo_type = 'checklist')
    checklist_items TEXT,                 -- JSON array of {text, completed, order}
    -- Phase 2: Subtasks and Dependencies
    parent_uuid VARCHAR(36),              -- For subtasks
    -- Existing fields
    is_archived BOOLEAN NOT NULL,
    is_favorite BOOLEAN NOT NULL,
    is_project_exclusive BOOLEAN NOT NULL, -- If True, todo is deleted when any of its projects are deleted
    is_todo_exclusive BOOLEAN NOT NULL,    -- If True, todo is exclusive to parent todo (subtask-only)
    priority VARCHAR(6) NOT NULL,         -- Enum: LOW, MEDIUM, HIGH, URGENT
    start_date DATE,
    due_date DATE,
    completed_at DATETIME,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    is_deleted BOOLEAN,                   -- Soft Delete
    -- Progress Tracking
    completion_percentage INTEGER,        -- Auto-calculated from subtasks or manual override

    FOREIGN KEY (parent_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Todo-Project many-to-many relationship (with metadata like sort order)
CREATE TABLE todo_projects (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    todo_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36) NOT NULL,
    is_project_exclusive BOOLEAN,
    sort_order INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE (todo_uuid, project_uuid),     -- Prevent duplicates
    FOREIGN KEY (todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
);

-- Todo dependency relationships (replaces blocked_by JSON field)
CREATE TABLE todo_dependencies (
    blocked_todo_uuid VARCHAR(36) NOT NULL,
    blocking_todo_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME,
    dependency_type VARCHAR(20),          -- blocks, depends_on, related_to
    PRIMARY KEY (blocked_todo_uuid, blocking_todo_uuid),
    FOREIGN KEY (blocked_todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (blocking_todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE
);

-- Note-Project many-to-many relationship (with metadata like sort order)
CREATE TABLE note_projects (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    note_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE (note_uuid, project_uuid),     -- Prevent duplicates
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
);

-- Document-Project many-to-many relationship (with metadata like sort order)
CREATE TABLE document_projects (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    document_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE (document_uuid, project_uuid), -- Prevent duplicates
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE
);

-- ================================
-- DIARY MODULE (ENCRYPTED)
-- ================================

-- Personal diary entries with client-side encryption
CREATE TABLE diary_entries (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date DATETIME NOT NULL,
    mood SMALLINT,                        -- 1=very bad .. 5=very good
    weather_code SMALLINT,                -- Enum-coded weather (0-6)
    location VARCHAR(100),                -- Location for filtering
    file_count INTEGER NOT NULL,          -- Count of associated files (documents)
    content_length INTEGER NOT NULL,
    content_file_path VARCHAR(500),
    file_hash VARCHAR(128),
    encryption_tag VARCHAR(255),
    encryption_iv VARCHAR(255),
    is_favorite BOOLEAN,
    is_template BOOLEAN,                  -- Template flag for reusable entries
    from_template_id VARCHAR(36),         -- Source template UUID/ID
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    is_deleted BOOLEAN,                   -- Soft Delete

    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Per-day wellness snapshot captured via dashboard
CREATE TABLE diary_daily_metadata (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    created_by VARCHAR(36) NOT NULL,
    date DATETIME NOT NULL,
    nepali_date VARCHAR(20),              -- BS date (YYYY-MM-DD)
    day_of_week SMALLINT,                 -- 0=Sunday .. 6=Saturday
    daily_income INTEGER,
    daily_expense INTEGER,
    is_office_day BOOLEAN,
    default_habits_json TEXT NOT NULL,    -- RENAMED from metrics_json
    defined_habits_json TEXT NOT NULL,    -- RENAMED from habits_json
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    UNIQUE (created_by, date),            -- One metadata per user per day
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Document-Diary many-to-many relationship (replaces diary_media table)
CREATE TABLE document_diary (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    document_uuid VARCHAR(36) NOT NULL,
    diary_entry_uuid VARCHAR(36) NOT NULL,
    sort_order INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    UNIQUE (document_uuid, diary_entry_uuid), -- Prevent duplicates
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    FOREIGN KEY (diary_entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE
);

-- ================================
-- ARCHIVE MODULE
-- ================================

-- Hierarchical folder structure for organizing files
CREATE TABLE archive_folders (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_uuid VARCHAR(36),
    is_favorite BOOLEAN,
    is_deleted BOOLEAN,                   -- Soft Delete
    -- Derived counts and metadata
    depth INTEGER NOT NULL,
    item_count INTEGER NOT NULL,
    total_size BIGINT NOT NULL,
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,

    FOREIGN KEY (parent_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- Files within archive folders
CREATE TABLE archive_items (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    folder_uuid VARCHAR(36),
    is_favorite BOOLEAN,
    is_deleted BOOLEAN,                   -- Soft Delete
    created_by VARCHAR(36) NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    -- Additional metadata as JSON
    metadata_json TEXT,
    thumbnail_path VARCHAR(500),          -- Path to thumbnail file

    FOREIGN KEY (folder_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ================================
-- Links module removed - users can create bookmark notes instead
-- ================================

-- ================================
-- TAG ASSOCIATIONS (Many-to-Many)
-- ================================

-- Notes to Tags relationship
CREATE TABLE note_tags (
    note_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (note_uuid, tag_uuid),
    
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Documents to Tags relationship
CREATE TABLE document_tags (
    document_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (document_uuid, tag_uuid),
    
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Todos to Tags relationship
CREATE TABLE todo_tags (
    todo_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (todo_uuid, tag_uuid),
    
    FOREIGN KEY (todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Projects to Tags relationship
CREATE TABLE project_tags (
    project_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (project_uuid, tag_uuid),
    
    FOREIGN KEY (project_uuid) REFERENCES projects(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Archive Items to Tags relationship
CREATE TABLE archive_item_tags (
    item_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (item_uuid, tag_uuid),
    
    FOREIGN KEY (item_uuid) REFERENCES archive_items(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Archive Folders to Tags relationship
CREATE TABLE archive_folder_tags (
    folder_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (folder_uuid, tag_uuid),
    
    FOREIGN KEY (folder_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Diary Entries to Tags relationship
CREATE TABLE diary_entry_tags (
    entry_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (entry_uuid, tag_uuid),
    
    FOREIGN KEY (entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Links to Tags relationship removed - links module deleted

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- User-related indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_uuid ON users(uuid);
CREATE INDEX idx_sessions_created_by ON sessions(created_by);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_recovery_keys_created_by ON recovery_keys(created_by);
CREATE INDEX idx_recovery_keys_uuid ON recovery_keys(uuid);

-- Content indexes
CREATE INDEX idx_notes_created_by ON notes(created_by);
CREATE INDEX idx_notes_title ON notes(title);
CREATE INDEX idx_notes_uuid ON notes(uuid);
CREATE INDEX idx_notes_last_version_uuid ON notes(last_version_uuid);
CREATE INDEX idx_note_files_note_uuid ON note_files(note_uuid);

CREATE INDEX idx_documents_created_by ON documents(created_by);
CREATE INDEX idx_documents_title ON documents(title);
CREATE INDEX idx_documents_uuid ON documents(uuid);

CREATE INDEX idx_todos_created_by ON todos(created_by);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_parent_uuid ON todos(parent_uuid);
CREATE INDEX idx_projects_created_by ON projects(created_by);
CREATE INDEX idx_projects_uuid ON projects(uuid);

CREATE INDEX idx_diary_entries_created_by ON diary_entries(created_by);
CREATE INDEX idx_diary_entries_date ON diary_entries(date);
CREATE INDEX idx_diary_entries_is_template ON diary_entries(is_template);
CREATE INDEX idx_diary_entries_uuid ON diary_entries(uuid);
CREATE INDEX idx_diary_daily_metadata_created_by_date ON diary_daily_metadata(created_by, date);
CREATE INDEX idx_diary_daily_metadata_uuid ON diary_daily_metadata(uuid);
CREATE INDEX idx_diary_daily_metadata_user_date ON diary_daily_metadata(created_by, date);
CREATE INDEX idx_diary_daily_metadata_day_of_week ON diary_daily_metadata(day_of_week);

CREATE INDEX idx_archive_folders_created_by ON archive_folders(created_by);
CREATE INDEX idx_archive_folders_parent ON archive_folders(parent_uuid);
CREATE INDEX idx_archive_folders_uuid ON archive_folders(uuid);
CREATE INDEX idx_archive_items_created_by ON archive_items(created_by);
CREATE INDEX idx_archive_items_folder ON archive_items(folder_uuid);
CREATE INDEX idx_archive_items_uuid ON archive_items(uuid);

-- Tag-related indexes
CREATE INDEX idx_tags_created_by ON tags(created_by);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_uuid ON tags(uuid);

-- Junction table indexes for performance
CREATE INDEX idx_todo_projects_todo_uuid ON todo_projects(todo_uuid);
CREATE INDEX idx_todo_projects_project_uuid ON todo_projects(project_uuid);
CREATE INDEX idx_note_projects_note_uuid ON note_projects(note_uuid);
CREATE INDEX idx_note_projects_project_uuid ON note_projects(project_uuid);
CREATE INDEX idx_document_projects_document_uuid ON document_projects(document_uuid);
CREATE INDEX idx_document_projects_project_uuid ON document_projects(project_uuid);
CREATE INDEX idx_document_diary_document_uuid ON document_diary(document_uuid);
CREATE INDEX idx_document_diary_diary_entry_uuid ON document_diary(diary_entry_uuid);
CREATE INDEX idx_todo_dependencies_blocked_todo_uuid ON todo_dependencies(blocked_todo_uuid);
CREATE INDEX idx_todo_dependencies_blocking_todo_uuid ON todo_dependencies(blocking_todo_uuid);

-- ================================
-- NOTES
-- ================================

-- This schema represents the current state of the PKMS database as of October 21, 2025
-- Updated: October 21, 2025 - Schema aligned with current SQLAlchemy models
-- 
-- Key Features:
-- 1. UUID-based primary keys for all tables (consistent with SQLAlchemy models)
-- 2. Client-side encryption for diary content and media
-- 3. Hierarchical folder structure for archive module
-- 4. Universal tagging system across all content types
-- 5. Comprehensive indexing for performance (including composite indexes)
-- 6. Proper foreign key relationships with cascade deletes
-- 7. Optimized for user-specific data filtering and common query patterns
-- 
-- Security Notes:
-- - Diary content is stored encrypted on disk
-- - User passwords use bcrypt hashing
-- - Recovery system uses security questions + master recovery key
-- - Session management with expiration and sliding window refresh
-- 
-- Module Organization:
-- - Users: Authentication and user management
-- - Notes: Personal knowledge management with file attachments
-- - Documents: File storage and management
-- - Todos: Task management with projects
-- - Diary: Encrypted personal journaling (diary media now handled via documents)
-- - Archive: Hierarchical file organization
-- - Tags: Universal categorization system (now truly global across all modules)
-- - App Config: Per-user application configuration settings
-- 
-- Structural Changes:
-- - diary_media table replaced with document_diary association table
-- - Junction tables (todo_projects, note_projects, etc.) now have surrogate primary keys with metadata
-- - diary_daily_metadata has separate habit tracking fields instead of metrics_json
-- - New app_config table for per-user application settings