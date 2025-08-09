-- PKMS Database Schema
-- Last Updated: 2025-07-16
-- Generated from SQLAlchemy models

CREATE TABLE users (
    id INTEGER NOT NULL, 
    username VARCHAR(50) NOT NULL, 
    email VARCHAR(100), 
    password_hash VARCHAR(255) NOT NULL, 
    login_password_hint VARCHAR(255), 
    diary_password_hash VARCHAR(255), 
    diary_password_hint VARCHAR(255), 
    is_active BOOLEAN, 
    is_first_login BOOLEAN, 
    settings_json TEXT, 
    created_at DATETIME, 
    updated_at DATETIME, 
    last_login DATETIME, 
    PRIMARY KEY (id), 
    UNIQUE (email), 
    UNIQUE (username)
);

CREATE TABLE archive_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL, 
    description TEXT, 
    path VARCHAR(1000) NOT NULL, 
    parent_uuid VARCHAR(36), 
    user_id INTEGER NOT NULL, 
    created_at DATETIME, 
    updated_at DATETIME, 
    FOREIGN KEY(parent_uuid) REFERENCES archive_folders (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE diary_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL, 
    day_of_week SMALLINT NOT NULL, 
    media_count INTEGER NOT NULL DEFAULT 0, 
    content_file_path VARCHAR(500) NOT NULL, 
    file_hash VARCHAR(64) NOT NULL, 
    mood INTEGER, 
    location VARCHAR(255), 
    is_favorite BOOLEAN DEFAULT 0, 
    user_id INTEGER NOT NULL, 
    "date" DATETIME NOT NULL, 
    nepali_date VARCHAR(20), 
    encryption_iv VARCHAR(32), 
    encryption_tag VARCHAR(32), 
    metadata_json TEXT DEFAULT '{}', 
    is_template BOOLEAN DEFAULT 0, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE documents (
    uuid VARCHAR(36) PRIMARY KEY NOT NULL,
    original_name VARCHAR(255) NOT NULL, 
    title VARCHAR(255) NOT NULL, 
    filename VARCHAR(255) NOT NULL, 
    file_path VARCHAR(500) NOT NULL, 
    file_size INTEGER NOT NULL, 
    mime_type VARCHAR(100) NOT NULL, 
    description TEXT, 
    user_id INTEGER NOT NULL, 
    is_favorite BOOLEAN DEFAULT 0, 
    is_archived BOOLEAN DEFAULT 0, 
    archive_item_uuid VARCHAR(36), 
    upload_status VARCHAR(20), 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(2000) NOT NULL,
    description TEXT,
    user_id INTEGER NOT NULL,
    is_favorite BOOLEAN DEFAULT 0,
    is_archived BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL, 
    content TEXT NOT NULL, 
    file_count INTEGER NOT NULL DEFAULT 0, 
    user_id INTEGER NOT NULL, 
    is_favorite BOOLEAN DEFAULT 0, 
    is_archived BOOLEAN DEFAULT 0, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE projects (
    uuid VARCHAR(36) PRIMARY KEY NOT NULL,
    name VARCHAR(255) NOT NULL, 
    description TEXT, 
    color VARCHAR(7), 
    is_archived BOOLEAN DEFAULT 0, 
    user_id INTEGER NOT NULL, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE recovery_keys (
    id INTEGER NOT NULL, 
    user_id INTEGER NOT NULL, 
    key_hash VARCHAR(255) NOT NULL, 
    questions_json TEXT NOT NULL, 
    answers_hash VARCHAR(255) NOT NULL, 
    salt VARCHAR(255) NOT NULL, 
    created_at DATETIME, 
    last_used DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE sessions (
    session_token VARCHAR(255) NOT NULL, 
    user_id INTEGER NOT NULL, 
    expires_at DATETIME NOT NULL, 
    created_at DATETIME, 
    last_activity DATETIME, 
    ip_address VARCHAR(45), 
    user_agent VARCHAR(500), 
    PRIMARY KEY (session_token), 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL, 
    description TEXT, 
    color VARCHAR(7), 
    module_type VARCHAR(20), 
    user_id INTEGER NOT NULL, 
    is_system BOOLEAN DEFAULT 0, 
    usage_count INTEGER DEFAULT 0, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE archive_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL, 
    description TEXT, 
    folder_uuid VARCHAR(36) NOT NULL, 
    original_filename VARCHAR(255) NOT NULL, 
    stored_filename VARCHAR(255) NOT NULL, 
    file_path VARCHAR(1000) NOT NULL, 
    file_size BIGINT NOT NULL, 
    mime_type VARCHAR(100) NOT NULL, 
    thumbnail_path VARCHAR(1000), 
    metadata_json TEXT, 
    user_id INTEGER NOT NULL, 
    is_favorite BOOLEAN, 
    version VARCHAR(50), 
    created_at DATETIME, 
    updated_at DATETIME, 
    FOREIGN KEY(folder_uuid) REFERENCES archive_folders (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE diary_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    diary_entry_uuid VARCHAR(36) NOT NULL, 
    user_id INTEGER NOT NULL, 
    filename VARCHAR(255) NOT NULL, 
    original_name VARCHAR(255) NOT NULL, 
    file_path VARCHAR(500) NOT NULL, 
    file_size BIGINT NOT NULL, 
    mime_type VARCHAR(100) NOT NULL, 
    media_type VARCHAR(20) NOT NULL, 
    caption TEXT, 
    is_encrypted BOOLEAN, 
    created_at DATETIME, 
    FOREIGN KEY(diary_entry_uuid) REFERENCES diary_entries (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE note_files (
    id INTEGER NOT NULL, 
    note_id INTEGER NOT NULL, 
    user_id INTEGER NOT NULL, 
    filename VARCHAR(255) NOT NULL, 
    original_name VARCHAR(255) NOT NULL, 
    file_path VARCHAR(500) NOT NULL, 
    file_size BIGINT NOT NULL, 
    mime_type VARCHAR(100) NOT NULL, 
    description TEXT, 
    created_at DATETIME, 
    PRIMARY KEY (id), 
    FOREIGN KEY(note_id) REFERENCES notes (id) ON DELETE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE diary_tags (
    diary_entry_uuid VARCHAR(36) NOT NULL, 
    tag_uuid VARCHAR(36) NOT NULL, 
    PRIMARY KEY (diary_entry_uuid, tag_uuid), 
    FOREIGN KEY(diary_entry_uuid) REFERENCES diary_entries (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(tag_uuid) REFERENCES tags (uuid) ON DELETE CASCADE
);

CREATE TABLE document_tags (
    document_uuid VARCHAR(36) NOT NULL, 
    tag_uuid VARCHAR(36) NOT NULL, 
    PRIMARY KEY (document_uuid, tag_uuid), 
    FOREIGN KEY(document_uuid) REFERENCES documents (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(tag_uuid) REFERENCES tags (uuid) ON DELETE CASCADE
);

CREATE TABLE link_tags (
    link_uuid VARCHAR(36) NOT NULL, 
    tag_uuid VARCHAR(36) NOT NULL, 
    PRIMARY KEY (link_uuid, tag_uuid), 
    FOREIGN KEY(link_uuid) REFERENCES links (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(tag_uuid) REFERENCES tags (uuid) ON DELETE CASCADE
);

CREATE TABLE note_tags (
    note_uuid VARCHAR(36) NOT NULL, 
    tag_uuid VARCHAR(36) NOT NULL, 
    PRIMARY KEY (note_uuid, tag_uuid), 
    FOREIGN KEY(note_uuid) REFERENCES notes (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(tag_uuid) REFERENCES tags (uuid) ON DELETE CASCADE
);

CREATE TABLE todos (
    uuid VARCHAR(36) PRIMARY KEY NOT NULL,
    title VARCHAR(255) NOT NULL, 
    description TEXT, 
    is_completed BOOLEAN DEFAULT 0, 
    is_archived BOOLEAN DEFAULT 0, 
    priority INTEGER DEFAULT 0, 
    user_id INTEGER NOT NULL, 
    project_uuid VARCHAR(36), 
    due_date DATETIME, 
    completed_at DATETIME, 
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    FOREIGN KEY(project_uuid) REFERENCES projects (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE archive_tags (
    item_uuid VARCHAR(36) NOT NULL, 
    tag_uuid VARCHAR(36) NOT NULL, 
    PRIMARY KEY (item_uuid, tag_uuid), 
    FOREIGN KEY(item_uuid) REFERENCES archive_items (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(tag_uuid) REFERENCES tags (uuid) ON DELETE CASCADE
);

CREATE TABLE todo_tags (
    todo_uuid VARCHAR(36) NOT NULL, 
    tag_uuid VARCHAR(36) NOT NULL, 
    PRIMARY KEY (todo_uuid, tag_uuid), 
    FOREIGN KEY(todo_uuid) REFERENCES todos (uuid) ON DELETE CASCADE, 
    FOREIGN KEY(tag_uuid) REFERENCES tags (uuid) ON DELETE CASCADE
);