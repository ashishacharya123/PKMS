-- PKMS Database Schema
-- Generated: January 28, 2025
-- Source: Current SQLAlchemy models in pkms-backend/app/models/
-- Description: Complete database schema for Personal Knowledge Management System

-- ================================
-- USERS & AUTHENTICATION
-- ================================

-- Main user table with authentication and diary encryption
CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt hash (includes salt)
    login_password_hint VARCHAR(255),     -- Simple hint for login password
    
    -- Diary encryption fields (separate from login auth)
    diary_password_hash VARCHAR(255),     -- bcrypt hash for diary encryption
    diary_password_hint VARCHAR(255),     -- Hint for diary password
    
    is_active BOOLEAN DEFAULT TRUE,
    is_first_login BOOLEAN DEFAULT TRUE,
    settings_json TEXT DEFAULT '{}',      -- User preferences as JSON
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- User session management for authentication
CREATE TABLE sessions (
    session_token VARCHAR(255) NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),               -- IPv6 support
    user_agent VARCHAR(500),
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Password recovery system with security questions
CREATE TABLE recovery_keys (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    questions_json TEXT NOT NULL,         -- Security questions as JSON
    answers_hash VARCHAR(255) NOT NULL,   -- Hashed answers
    salt VARCHAR(255) NOT NULL,           -- Salt for answers
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- TAGS & ORGANIZATION
-- ================================

-- Universal tagging system for all content types
CREATE TABLE tags (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6c757d',   -- Hex color code
    module_type VARCHAR(20) DEFAULT 'general',  -- notes, documents, todos, diary, archive, general
    user_id INTEGER NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,      -- System tags vs user tags
    usage_count INTEGER DEFAULT 0,       -- Track tag usage frequency
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- NOTES MODULE
-- ================================

-- Personal notes and knowledge management
CREATE TABLE notes (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    file_count INTEGER DEFAULT 0 NOT NULL,  -- Count of attached files
    user_id INTEGER NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- File attachments for notes (documents, images, etc.)
CREATE TABLE note_files (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    note_uuid VARCHAR(36) NOT NULL,
    user_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,       -- Stored filename on disk
    original_name VARCHAR(255) NOT NULL,  -- Original uploaded name
    file_path VARCHAR(500) NOT NULL,      -- Path relative to data directory
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,                     -- Optional description/caption
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (note_uuid) REFERENCES notes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- DOCUMENTS MODULE
-- ================================

-- Document storage and management
CREATE TABLE documents (
    id INTEGER NOT NULL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL, -- Original name uploaded by user
    title VARCHAR(255) NOT NULL,
    filename VARCHAR(255) NOT NULL,      -- Stored filename on disk
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    upload_status VARCHAR(20) DEFAULT 'completed',  -- pending, processing, completed, failed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- TODO MODULE
-- ================================

-- Task management projects
CREATE TABLE projects (
    id INTEGER NOT NULL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3498db',   -- Hex color code
    is_archived BOOLEAN DEFAULT FALSE,
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Task management todos
CREATE TABLE todos (
    id INTEGER NOT NULL PRIMARY KEY,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_completed BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 2,          -- 1=low, 2=medium, 3=high, 4=urgent
    user_id INTEGER NOT NULL,
    project_id INTEGER,
    due_date DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ================================
-- DIARY MODULE (ENCRYPTED)
-- ================================

-- Personal diary entries with client-side encryption
CREATE TABLE diary_entries (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    day_of_week SMALLINT NOT NULL,        -- 0=Sunday .. 6=Saturday
    media_count INTEGER DEFAULT 0 NOT NULL,
    content_file_path VARCHAR(500) NOT NULL,  -- Path to encrypted .dat file
    file_hash VARCHAR(128) NOT NULL,      -- SHA-256 of encrypted file for integrity
    mood SMALLINT,                        -- 1=very bad .. 5=very good
    weather_code SMALLINT,                -- 0 clear .. 6 scorching sun
    location VARCHAR(100),                -- Location for filtering
    content_length INTEGER DEFAULT 0 NOT NULL, -- Plaintext character count
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    is_template BOOLEAN DEFAULT FALSE,
    from_template_id VARCHAR(36),         -- Template UUID reference
    user_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    encryption_iv VARCHAR(255),           -- AES-GCM IV (base64)
    encryption_tag VARCHAR(255),          -- AES-GCM auth tag (base64)
    file_hash_algorithm VARCHAR(32) DEFAULT 'sha256',
    content_file_version INTEGER DEFAULT 1,
    daily_metadata_id INTEGER,            -- FK into diary_daily_metadata
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (daily_metadata_id) REFERENCES diary_daily_metadata(id) ON DELETE SET NULL
);

-- Per-day wellness snapshot captured via dashboard
CREATE TABLE diary_daily_metadata (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date DATETIME NOT NULL,
    nepali_date VARCHAR(20),              -- BS date (YYYY-MM-DD)
    metrics_json TEXT NOT NULL DEFAULT '{}', -- Wellness metrics JSON
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (user_id, date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Encrypted media attachments for diary entries
CREATE TABLE diary_media (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    diary_entry_uuid VARCHAR(36) NOT NULL,
    user_id INTEGER NOT NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,      -- Points to encrypted .dat file
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    media_type VARCHAR(20) NOT NULL,      -- photo, video, voice
    caption TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (diary_entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- ARCHIVE MODULE
-- ================================

-- Hierarchical folder structure for organizing files
CREATE TABLE archive_folders (
    uuid VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    path VARCHAR(1000) NOT NULL,         -- Full path for hierarchy
    parent_uuid VARCHAR(36),
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (parent_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Files within archive folders
CREATE TABLE archive_items (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    folder_uuid VARCHAR(36) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    thumbnail_path VARCHAR(1000),
    metadata_json TEXT DEFAULT '{}',      -- Additional metadata as JSON
    user_id INTEGER NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    version VARCHAR(50) DEFAULT '1.0',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (folder_uuid) REFERENCES archive_folders(uuid) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================
-- LINKS MODULE
-- ================================

-- URL bookmarks and web resources
CREATE TABLE links (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(2000) NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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

-- Archive Items to Tags relationship
CREATE TABLE archive_tags (
    item_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (item_uuid, tag_uuid),
    
    FOREIGN KEY (item_uuid) REFERENCES archive_items(uuid) ON DELETE CASCADE,
    FOREIGN KEY (tag_uuid) REFERENCES tags(uuid) ON DELETE CASCADE
);

-- Diary Entries to Tags relationship
CREATE TABLE diary_tags (
    diary_entry_uuid VARCHAR(36) NOT NULL,
    tag_uuid VARCHAR(36) NOT NULL,
    PRIMARY KEY (diary_entry_uuid, tag_uuid),
    
    FOREIGN KEY (diary_entry_uuid) REFERENCES diary_entries(uuid) ON DELETE CASCADE,
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
-- INDEXES FOR PERFORMANCE
-- ================================

-- User-related indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_recovery_keys_user_id ON recovery_keys(user_id);

-- Content indexes
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_title ON notes(title);
CREATE INDEX idx_notes_uuid ON notes(uuid);
CREATE INDEX idx_note_files_note_uuid ON note_files(note_uuid);
CREATE INDEX idx_note_files_user_id ON note_files(user_id);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_title ON documents(title);
CREATE INDEX idx_documents_uuid ON documents(uuid);

CREATE INDEX idx_todos_user_id ON todos(user_id);
CREATE INDEX idx_todos_is_completed ON todos(is_completed);
CREATE INDEX idx_todos_is_archived ON todos(is_archived);
CREATE INDEX idx_projects_user_id ON projects(user_id);

CREATE INDEX idx_diary_entries_user_id ON diary_entries(user_id);
CREATE INDEX idx_diary_entries_date ON diary_entries(date);
CREATE INDEX idx_diary_entries_day_of_week ON diary_entries(day_of_week);
-- Nepali date is now stored in diary_daily_metadata
-- CREATE INDEX idx_diary_entries_nepali_date ON diary_entries(nepali_date);
CREATE INDEX idx_diary_daily_metadata_nepali_date ON diary_daily_metadata(nepali_date);
CREATE INDEX idx_diary_media_diary_entry_uuid ON diary_media(diary_entry_uuid);

CREATE INDEX idx_archive_folders_user_id ON archive_folders(user_id);
CREATE INDEX idx_archive_folders_parent_uuid ON archive_folders(parent_uuid);
CREATE INDEX idx_archive_items_user_id ON archive_items(user_id);
CREATE INDEX idx_archive_items_folder_uuid ON archive_items(folder_uuid);
CREATE INDEX idx_archive_items_mime_type ON archive_items(mime_type);

CREATE INDEX idx_links_user_id ON links(user_id);

-- Tag-related indexes
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_tags_name ON tags(name);
CREATE INDEX idx_tags_module_type ON tags(module_type);
CREATE INDEX idx_tags_uuid ON tags(uuid);

-- ================================
-- NOTES
-- ================================

-- This schema represents the current state of the PKMS database as of January 28, 2025
-- 
-- Key Features:
-- 1. UUID-based primary keys for most content (with integer fallback for some tables)
-- 2. Client-side encryption for diary content and media
-- 3. Hierarchical folder structure for archive module
-- 4. Universal tagging system across all content types
-- 5. Comprehensive indexing for performance
-- 6. Proper foreign key relationships with cascade deletes
-- 
-- Security Notes:
-- - Diary content is stored encrypted on disk
-- - User passwords use bcrypt hashing
-- - Recovery system uses security questions + master recovery key
-- - Session management with expiration and sliding window refresh
-- 
-- Module Organization:
-- - Notes: Personal knowledge management with file attachments
-- - Documents: File storage and management
-- - Todos: Task management with projects
-- - Diary: Encrypted personal journaling with media
-- - Archive: Hierarchical file organization
-- - Links: URL bookmarks and web resources
-- - Tags: Universal categorization system
