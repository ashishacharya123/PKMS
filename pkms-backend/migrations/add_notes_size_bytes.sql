-- Migration: Add size_bytes column to notes table
-- Date: 2025-10-13
-- Description: Track note content size for storage breakdown dashboard

-- Add size_bytes column
ALTER TABLE notes ADD COLUMN size_bytes BIGINT DEFAULT 0 NOT NULL;

-- Backfill existing notes with content size
-- (SQLite uses LENGTH() for UTF-8 byte length)
UPDATE notes SET size_bytes = LENGTH(content);

-- Create index for storage queries (optional, useful for aggregations)
CREATE INDEX IF NOT EXISTS idx_notes_size_bytes ON notes(size_bytes);

