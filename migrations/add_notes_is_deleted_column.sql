-- Add is_deleted column to notes table for soft delete functionality
-- This enables proper soft delete behavior for notes

-- Add the is_deleted column with default FALSE
ALTER TABLE notes ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE NOT NULL;

-- Create index for performance on deleted note queries
CREATE INDEX IF NOT EXISTS idx_notes_is_deleted ON notes(is_deleted);

-- Create composite index for user + deleted queries (optimizes list queries)
CREATE INDEX IF NOT EXISTS idx_notes_user_deleted ON notes(created_by, is_deleted);

-- Add comment to explain the column
COMMENT ON COLUMN notes.is_deleted IS 'Soft delete flag - TRUE means the note is marked as deleted and should not appear in normal queries';