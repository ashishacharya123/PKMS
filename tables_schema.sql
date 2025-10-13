-- ================================
-- PKMS DATABASE SCHEMA
-- ================================
-- Complete database schema for Personal Knowledge Management System
-- Updated with UUID primary keys, new columns, and improved relationships
-- Generated: 2024

-- ================================
-- USER MANAGEMENT
-- ================================

-- Users table
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    login_password_hint VARCHAR(255),
    
    -- Diary encryption fields
    diary_password_hash VARCHAR(255),
    diary_password_hint VARCHAR(255),
    
    is_active BOOLEAN DEFAULT TRUE,
    is_first_login BOOLEAN DEFAULT TRUE,
    settings_json TEXT DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- User sessions for authentication
CREATE TABLE sessions (
    session_token VARCHAR(255) NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Recovery keys for password reset with security questions
CREATE TABLE recovery_keys (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    questions_json TEXT NOT NULL,  -- Security questions as JSON
    answers_hash VARCHAR(255) NOT NULL,  -- Hashed answers
    salt VARCHAR(255) NOT NULL,  -- Salt for answers
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- NOTES MODULE
-- ================================

-- Personal notes and knowledge management
CREATE TABLE notes (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    size_bytes BIGINT DEFAULT 0 NOT NULL,  -- Size of content in bytes for storage tracking
    file_count INTEGER DEFAULT 0 NOT NULL,
    user_id INTEGER NOT NULL,
    
    -- Audit trail
    created_by INTEGER NOT NULL,
    
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_exclusive_mode BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- FTS5 Search Support
    
    -- Classification
    note_type VARCHAR(50) DEFAULT 'general',
    
    -- Lightweight Versioning (diff-based)
    version INTEGER DEFAULT 1,
    content_diff TEXT,
    last_version_uuid VARCHAR(36),
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (last_version_uuid) REFERENCES notes(uuid)
);

-- File attachments for notes
CREATE TABLE note_files (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    note_uuid VARCHAR(36) NOT NULL,
    user_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- DOCUMENTS MODULE
-- ================================

-- Document storage and management
CREATE TABLE documents (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    original_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    
    -- Audit trail
    created_by INTEGER NOT NULL,
    
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_exclusive_mode BOOLEAN DEFAULT FALSE,
    archive_item_uuid VARCHAR(36),
    upload_status VARCHAR(20) DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- FTS5 Search Support
    tags_text TEXT DEFAULT '',
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id)
);

-- ================================
-- TODO MODULE
-- ================================

-- Task management projects
CREATE TABLE projects (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3498db',
    is_archived BOOLEAN DEFAULT FALSE,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- FTS5 Search Support
    tags_text TEXT DEFAULT '',
    
    -- Project Lifecycle
    status VARCHAR(20) DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    progress_percentage INTEGER DEFAULT 0,
    
    -- UI/UX
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    is_favorite BOOLEAN DEFAULT FALSE,
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id)
);

-- Task management todos
CREATE TABLE todos (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    todo_type VARCHAR(20) NOT NULL DEFAULT 'task',  -- task, checklist, subtask
    order_index INTEGER DEFAULT 0 NOT NULL,
    
    -- Checklist functionality (for todo_type = 'checklist')
    checklist_items TEXT,  -- JSON array of {text, completed, order}
    
    -- Subtasks and Dependencies
    parent_id INTEGER,
    
    -- Time Tracking
    estimate_minutes INTEGER,
    actual_minutes INTEGER,
    
    -- Status flags
    is_archived BOOLEAN DEFAULT FALSE,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_exclusive_mode BOOLEAN DEFAULT FALSE,
    
    -- Priority and dates
    priority INTEGER DEFAULT 2,
    start_date DATE,
    due_date DATE,
    completed_at DATETIME,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign keys
    user_id INTEGER NOT NULL,
    
    -- Audit trail
    created_by INTEGER NOT NULL,
    
    -- FTS5 Search Support
    tags_text TEXT DEFAULT '',
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    -- Progress Tracking
    completion_percentage INTEGER DEFAULT 0,
    
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES todos(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ================================
-- DIARY MODULE (ENCRYPTED)
-- ================================

-- Personal diary entries with client-side encryption
CREATE TABLE diary_entries (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    date DATETIME NOT NULL,
    mood SMALLINT,
    weather_code SMALLINT,
    location VARCHAR(100),
    day_of_week SMALLINT,
    media_count INTEGER DEFAULT 0 NOT NULL,
    content_length INTEGER DEFAULT 0 NOT NULL,
    content_file_path VARCHAR(500),
    file_hash VARCHAR(128),
    encryption_tag VARCHAR(255),
    encryption_iv VARCHAR(255),
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    from_template_id VARCHAR(36) DEFAULT '0',
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional metadata
    daily_metadata_id INTEGER,
    
    -- FTS5 Search Support
    tags_text TEXT DEFAULT '',
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id)
);

-- Daily metadata for diary entries
CREATE TABLE diary_daily_metadata (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    weather_summary TEXT,
    mood_summary TEXT,
    activity_summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Media attachments for diary entries
CREATE TABLE diary_media (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    diary_entry_uuid VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    media_type VARCHAR(20) NOT NULL,
    caption TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    FOREIGN KEY (diary_entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id)
);

-- ================================
-- ARCHIVE MODULE
-- ================================

-- Archive folders for organizing archived content
CREATE TABLE archive_folders (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    parent_uuid VARCHAR(36),
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (parent_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Archive items (archived documents, notes, etc.)
CREATE TABLE archive_items (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    original_type VARCHAR(50) NOT NULL,
    original_uuid VARCHAR(36) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    folder_uuid VARCHAR(36),
    user_id INTEGER NOT NULL,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (folder_uuid) REFERENCES archive_folders(uuid) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- LINKS MODULE
-- ================================

-- Web bookmarks and URLs
CREATE TABLE links (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(2000) NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    -- FTS5 Search Support
    tags_text TEXT DEFAULT '',
    
    -- Soft Delete
    is_deleted BOOLEAN DEFAULT FALSE,
    
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (deleted_by) REFERENCES users(id)
);

-- ================================
-- TAGS SYSTEM
-- ================================

-- Tags for organizing content
CREATE TABLE tags (
    id INTEGER NOT NULL AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3498db',
    usage_count INTEGER DEFAULT 0 NOT NULL,
    module_type VARCHAR(50) NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(name, user_id, module_type)
);

-- ================================
-- TAG ASSOCIATIONS
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

-- Links to Tags relationship
CREATE TABLE link_tags (
    link_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (link_uuid, tag_uuid),
    
    FOREIGN KEY (link_uuid) REFERENCES links(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- ================================
-- PROJECT ASSOCIATIONS (Many-to-Many)
-- ================================

-- Notes to Projects relationship
CREATE TABLE note_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36),
    is_exclusive BOOLEAN DEFAULT FALSE,
    project_name_snapshot VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    UNIQUE(note_uuid, project_uuid)
);

-- Documents to Projects relationship
CREATE TABLE document_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36),
    is_exclusive BOOLEAN DEFAULT FALSE,
    project_name_snapshot VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (document_uuid) REFERENCES documents(uuid) ON DELETE CASCADE,
    UNIQUE(document_uuid, project_uuid)
);

-- Todos to Projects relationship
CREATE TABLE todo_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    todo_uuid VARCHAR(36) NOT NULL,
    project_uuid VARCHAR(36),
    is_exclusive BOOLEAN DEFAULT FALSE,
    project_name_snapshot VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    UNIQUE(todo_uuid, project_uuid)
);

-- ================================
-- TODO DEPENDENCIES
-- ================================

-- Todo Dependencies (replaces blocked_by JSON field)
-- Represents: blocked_todo depends on blocking_todo (blocking_todo blocks blocked_todo)
CREATE TABLE todo_dependencies (
    blocked_todo_uuid VARCHAR(36) NOT NULL,
    blocking_todo_uuid VARCHAR(36) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dependency_type VARCHAR(20) DEFAULT 'blocks',
    PRIMARY KEY (blocked_todo_uuid, blocking_todo_uuid),
    
    FOREIGN KEY (blocked_todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE,
    FOREIGN KEY (blocking_todo_uuid) REFERENCES todos(uuid) ON DELETE CASCADE
);

-- ================================
-- INDEXES FOR PERFORMANCE
-- ================================

-- User indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_recovery_keys_user_id ON recovery_keys(user_id);
CREATE INDEX idx_recovery_keys_expires_at ON recovery_keys(expires_at);

-- Notes indexes
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_title ON notes(title);
CREATE INDEX idx_notes_is_favorite ON notes(is_favorite);
CREATE INDEX idx_notes_is_archived ON notes(is_archived);
CREATE INDEX idx_notes_note_type ON notes(note_type);
CREATE INDEX idx_note_files_note_uuid ON note_files(note_uuid);
CREATE INDEX idx_note_files_user_id ON note_files(user_id);

-- Documents indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_title ON documents(title);
CREATE INDEX idx_documents_is_favorite ON documents(is_favorite);
CREATE INDEX idx_documents_is_archived ON documents(is_archived);
CREATE INDEX idx_documents_upload_status ON documents(upload_status);

-- Projects indexes
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_name ON projects(name);
CREATE INDEX idx_projects_is_archived ON projects(is_archived);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_is_favorite ON projects(is_favorite);

-- Todos indexes
CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_title ON todos(title);
CREATE INDEX idx_todos_status ON todos(status);
CREATE INDEX idx_todos_parent_id ON todos(parent_id);
CREATE INDEX idx_todos_is_archived ON todos(is_archived);
CREATE INDEX idx_todos_is_favorite ON todos(is_favorite);
CREATE INDEX idx_todos_priority ON todos(priority);
CREATE INDEX idx_todos_due_date ON todos(due_date);

-- Diary indexes
CREATE INDEX idx_diary_entries_user_id ON diary_entries(user_id);
CREATE INDEX idx_diary_entries_date ON diary_entries(date);
CREATE INDEX idx_diary_entries_mood ON diary_entries(mood);
CREATE INDEX idx_diary_entries_weather_code ON diary_entries(weather_code);
CREATE INDEX idx_diary_entries_is_favorite ON diary_entries(is_favorite);
CREATE INDEX idx_diary_entries_is_archived ON diary_entries(is_archived);
CREATE INDEX idx_diary_daily_metadata_user_id ON diary_daily_metadata(user_id);
CREATE INDEX idx_diary_daily_metadata_date ON diary_daily_metadata(date);
CREATE INDEX idx_diary_media_diary_entry_uuid ON diary_media(diary_entry_uuid);
CREATE INDEX idx_diary_media_user_id ON diary_media(user_id);
CREATE INDEX idx_diary_media_media_type ON diary_media(media_type);

-- Archive indexes
CREATE INDEX idx_archive_folders_user_id ON archive_folders(user_id);
CREATE INDEX idx_archive_folders_parent_uuid ON archive_folders(parent_uuid);
CREATE INDEX idx_archive_items_user_id ON archive_items(user_id);
CREATE INDEX idx_archive_items_folder_uuid ON archive_items(folder_uuid);
CREATE INDEX idx_archive_items_original_type ON archive_items(original_type);

-- Links indexes
CREATE INDEX idx_links_user_id ON links(user_id);
CREATE INDEX idx_links_title ON links(title);
CREATE INDEX idx_links_is_favorite ON links(is_favorite);
CREATE INDEX idx_links_is_archived ON links(is_archived);

-- Tags indexes
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_module_type ON tags(module_type);
CREATE INDEX idx_tags_usage_count ON tags(usage_count);
CREATE INDEX idx_tags_is_system ON tags(is_system);
CREATE INDEX idx_tags_is_archived ON tags(is_archived);

-- ================================
-- UNIFIED FULL-TEXT SEARCH (FTS5)
-- ================================

-- Single unified FTS table for all searchable content
CREATE VIRTUAL TABLE IF NOT EXISTS fts_content USING fts5(
    item_uuid UNINDEXED,   -- UUID of the original item
    item_type UNINDEXED,   -- 'note', 'todo', 'document', 'project', 'diary', 'link', 'archive'
    user_uuid UNINDEXED,   -- To scope searches by user
    title,                 -- Title/name from any item
    description,           -- Description (not full content)
    tags,                  -- Space-separated list of tags
    attachments,           -- Space-separated attachment filenames
    date_text,             -- e.g., "2025 October Friday" for date context
    tokenize='porter unicode61'
);





-- ================================
-- SCHEMA COMPLETE
-- ================================