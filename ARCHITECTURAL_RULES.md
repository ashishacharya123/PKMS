# PKMS Architectural Rules

## 🏗️ SYSTEM ARCHITECTURE

### Single-Process Design
- **Current Deployment**: Single-process uvicorn server
- **Database**: SQLite (single-writer design)
- **Chunk Uploads**: In-memory state management (single-process only)
- **Scaling Limitation**: Multi-worker deployment requires refactoring

⚠️ **IMPORTANT**: This system is designed for single-process deployment. 
Scaling to multiple workers will require:
- Redis refactoring for chunk upload state management
- Database migration from SQLite to PostgreSQL/MySQL
- Shared state management for all in-memory components

## 🔥 CRITICAL RULES - NEVER VIOLATE

### 1. User Reference Pattern
- **Pattern**: `current_user_uuid = current_user.uuid` at function start
- **Query**: `Model.created_by == current_user_uuid`
- **Creation**: `Model(field=value, created_by=current_user_uuid)`

### 2. Database Field Names
- **ALWAYS**: `created_by` for user ownership
- **NEVER**: `user_uuid` - doesn't exist in models
- **NEVER**: `user_id` - doesn't exist in models

### 3. Import Statements
- **Verify**: Import from correct model files
- **Example**: `from app.models.project import Project`
- **Never**: `from app.models.todo import Project`

### 4. Character Encoding
- **ONLY**: ASCII characters in code
- **NEVER**: Unicode characters in strings/logs

### 5. Variable Naming & Code Readability
- **ALWAYS**: Use descriptive, intuitive variable names
- **PREFER**: `status, count` over `s, count` for clarity
- **AVOID**: Single-letter abbreviations unless in appropriate contexts
- **APPROPRIATE**: Simple loop counters (`for i in range(n)`), mathematical variables (`m, s, n`), dictionary comprehensions (`k, v`)
- **EXAMPLE**: `for status, count in status_counts:` not `for s, count in status_counts:`

## 📋 MODEL FIELD VERIFICATION

| Model | User Field | ✅ Correct | ❌ Wrong |
|-------|------------|-----------|----------|
| Note | `created_by` | `Note.created_by == current_user_uuid` | `Note.user_uuid` |
| Document | `created_by` | `Document.created_by == current_user_uuid` | `Document.user_uuid` |
| Todo | `created_by` | `Todo.created_by == current_user_uuid` | `Todo.user_uuid` |
| Project | `created_by` | `Project.created_by == current_user_uuid` | `Project.user_uuid` |
| DiaryEntry | `created_by` | `DiaryEntry.created_by == current_user_uuid` | `DiaryEntry.user_uuid` |
| DiaryMedia | `created_by` | `DiaryMedia.created_by == current_user_uuid` | `DiaryMedia.user_uuid` |
| ArchiveFolder | `created_by` | `ArchiveFolder.created_by == current_user_uuid` | `ArchiveFolder.user_uuid` |
| ArchiveItem | `created_by` | `ArchiveItem.created_by == current_user_uuid` | `ArchiveItem.user_uuid` |
| Tag | `created_by` | `Tag.created_by == current_user_uuid` | `Tag.user_uuid` |
| Link | `created_by` | `Link.created_by == current_user_uuid` | `Link.user_uuid` |

## 🗄️ DATABASE SCHEMA

### Current Status: MODELS vs SCHEMA MISMATCH
- **Models**: Use `created_by VARCHAR(36)` with `users.uuid` foreign key
- **Schema**: Shows `user_id INTEGER` with `users.id` foreign key
- **Solution**: Fresh database reinitialization (no production data)

### Database Reinitialization Required
- **Reason**: Schema and models don't match
- **Impact**: Must recreate database fresh
- **Advantage**: Clean slate, no migration complexity

## 🛡️ SECURITY PATTERNS

### 1. Input Validation
- Always sanitize user inputs
- Use provided sanitization functions
- Never trust raw input

### 2. Ownership Verification
- Always verify with `created_by` field
- Use dependency injection for current user
- Never trust user input for ownership

### 3. File Path Security
- Validate against allowed directories
- Use proper path resolution
- Prevent directory traversal attacks

## 🔍 CODE REVIEW CHECKLIST

- [ ] User references use `current_user_uuid` pattern
- [ ] All queries use `Model.created_by == current_user_uuid`
- [ ] No `user_uuid` or `user_id` field references
- [ ] Imports are from correct model files
- [ ] No Unicode characters in code
- [ ] Variable names are descriptive and intuitive
- [ ] Input sanitization applied
- [ ] Ownership verification present
- [ ] File path validation implemented

## ⚠️ CONSEQUENCES

Violating these rules will cause:
- **Runtime failures** during application startup
- **SQLAlchemy errors** for non-existent columns
- **Import errors** preventing app loading
- **Security vulnerabilities** from improper ownership checks
- **Production downtime** and user impact

---

**Last Updated**: 2025-10-17
**Status**: PRODUCTION READY (with clean database reinitialization required)