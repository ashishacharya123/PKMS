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
- **Pattern**: Use `current_user.uuid` directly in queries (consistently applied throughout codebase)
- **Query**: `Model.created_by == current_user.uuid`
- **Creation**: `Model(field=value, created_by=current_user.uuid)`
- **RATIONALE**: Using `current_user.uuid` directly maintains consistency across the codebase and simplifies the code pattern

### 2. Database Field Names
- **ALWAYS**: `created_by` for user ownership
- **NEVER**: `user_uuid` - doesn't exist in models
- **NEVER**: `user_id` - doesn't exist in models

### 3. Import Statements
- **Verify**: Import from correct model files
- **Example**: `from app.models.project import Project`
- **Never**: `from app.models.todo import Project`

### 4. Character Encoding
- **ONLY**: ASCII characters in production code and logs
- **NEVER**: Unicode characters in strings/logs
- **ALLOWED**: Unicode in documentation and comments (emojis, symbols)

### 5. Variable Naming & Code Readability
- **ALWAYS**: Use descriptive, intuitive variable names
- **PREFER**: `status, count` over `s, count` for clarity
- **AVOID**: Single-letter abbreviations unless in appropriate contexts
- **APPROPRIATE**: Simple loop counters (`for i in range(n)`), mathematical variables (`m, s, n`), dictionary comprehensions (`k, v`)
- **EXAMPLE**: `for status, count in status_counts:` not `for s, count in status_counts:`

### 6. Enum Usage - Type Safety
- **ALWAYS**: Use enum values instead of string literals for comparisons
- **NEVER**: Compare against hardcoded strings like `'done'`, `'pending'`, `'active'`
- **PREFER**: `Todo.status == TodoStatus.DONE` over `Todo.status == 'done'`
- **BENEFITS**: Type safety, IDE autocomplete, refactoring safety, prevents typos
- **EXAMPLE**: `if status == TodoStatus.DONE:` not `if status == 'done':`

### 7. UUID Primary Keys - No Integer IDs
- **ALWAYS**: Use UUID as primary key for all tables
- **NEVER**: Use integer `id` columns as primary keys
- **PREFER**: `uuid VARCHAR(36) PRIMARY KEY` over `id INTEGER PRIMARY KEY`
- **BENEFITS**: Globally unique, no sequence conflicts, better for distributed systems, security through obscurity
- **EXAMPLE**: `uuid = Column(String(36), primary_key=True, default=lambda: str(uuid4()))`
- **MIGRATION**: Remove all `id` columns and foreign key references to `id` fields
- **FOREIGN KEYS**: Always reference `uuid` fields, never `id` fields

### 8. Field Nullability
- **CRITICAL**: The following fields must **NEVER** be null:
    - `uuid` (Primary Key)
    - `created_by` (Ownership Foreign Key)
    - `title` (Or other primary content/naming fields)
    - `status` (Or other enum/state fields)
- **TIMESTAMPS**: If a table has `created_at` or `updated_at` columns, they must be defined as non-nullable (`NOT NULL`) with a server-side default. Upon creation, `updated_at` must be set to the same value as `created_at`.

### 9. Status Naming Conventions
- **ALWAYS**: Use `IS_RUNNING` for the status of an active or ongoing item, such as a project.
- **PREFER**: Consistent status names across different modules where the meaning is the same.

### 10. Centralized Enum Definitions
- **ALWAYS**: Define all shared enumerations (Enums) in the central `app/models/enums.py` file.
- **NEVER**: Define enums within the model or router file where they are used.
- **RATIONALE**: Centralizing enums prevents circular dependencies, reduces code duplication, and makes the different states of the application easier to understand and manage.
- **EXAMPLE**:
  - **Correct**: `from app.models.enums import ProjectStatus`
  - **Incorrect**: `from app.models.project import ProjectStatus`

### 11. SQLAlchemy Query Patterns
- **ALWAYS**: Use `and_()` explicitly when combining multiple conditions in SQLAlchemy queries
- **PATTERN**: `where(and_(condition1, condition2, condition3))` not `where(condition1, condition2, condition3)`
- **RATIONALE**: Explicit `and_()` usage maintains consistency across the codebase and improves readability for complex queries
- **EXAMPLE**: 
  ```python
  # Correct
  where(and_(
      Model.created_by == current_user.uuid,
      func.date(Model.created_at) >= start_date,
      func.date(Model.created_at) <= end_date,
  ))
  
  # Avoid
  where(
      Model.created_by == current_user.uuid,
      func.date(Model.created_at) >= start_date,
      func.date(Model.created_at) <= end_date,
  )
  ```

### 12. Import Organization
- **ORDER**: Standard library imports → Third-party imports → Local application imports
- **PATTERN**: Use blank line to separate each import group
- **RATIONALE**: Consistent organization improves readability and maintainability
- **EXAMPLE**:
  ```python
  # Standard library
  import json
  import logging
  import os
  from datetime import datetime, date, timedelta
  
  # Third-party
  from fastapi import APIRouter, Depends, HTTPException
  from sqlalchemy.ext.asyncio import AsyncSession
  from sqlalchemy import select, and_, func
  
  # Local application
  from app.database import get_db
  from app.models.diary import DiaryEntry
  from app.auth.dependencies import get_current_user
  ```

### 13. Error Handling and Logging
- **PATTERN**: Use try/except blocks with specific exception handling
- **LOGGING**: Use appropriate log levels (info, warning, error, exception)
- **ERRORS**: Always raise HTTPException for API errors with proper status codes
- **LOGGING CONTEXT**: Include relevant context in log messages (user IDs, operation names)
- **RATIONALE**: Consistent error handling and logging improves debugging and monitoring
- **EXAMPLE**:
  ```python
  try:
      logger.info(f"Creating diary entry for user {current_user.uuid}")
      # ... operation ...
  except ValueError as e:
      logger.warning(f"Data validation error for user {current_user.uuid}: {type(e).__name__}")
      raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
  except Exception as e:
      logger.error(f"Unexpected error creating diary entry for user {current_user.uuid}: {type(e).__name__}")
      raise HTTPException(status_code=500, detail="Internal server error")
  ```

### 14. Function Naming Conventions
- **BACKEND**: Use descriptive names following FastAPI/Python conventions
- **GET operations**: `get_`, `get_all_`, `search_`
- **CREATE operations**: `create_`, `add_`
- **UPDATE operations**: `update_`, `modify_`
- **DELETE operations**: `delete_`, `remove_`
- **VALIDATION**: `validate_`, `check_`
- **UTILITY**: Descriptive names that indicate the function purpose
- **RATIONALE**: Consistent naming improves code discoverability and understanding
- **EXAMPLE**: `get_diary_entries_by_date`, `create_project`, `update_todo_status`, `validate_user_input`

### 15. API Schema Definition Pattern
- **ALWAYS**: Use `CamelCaseModel` as the base class for all Pydantic schema models
- **PURPOSE**: `CamelCaseModel` provides automatic conversion from Python snake_case to JSON camelCase
- **CONFIGURATION**: Includes `alias_generator=to_camel`, `populate_by_name=True`, and `from_attributes=True`
- **RATIONALE**: Ensures consistent API responses with camelCase field names while maintaining Python snake_case conventions internally
- **EXAMPLE**:
  ```python
  # Definition
  class CamelCaseModel(BaseModel):
      model_config = ConfigDict(
          alias_generator=to_camel,
          populate_by_name=True,
          from_attributes=True
      )
  
  # Usage
  class ProjectCreate(CamelCaseModel):
      project_name: str
      description: Optional[str] = None
      is_active: bool = True
  
  # Python field: project_name -> JSON field: projectName
  ```

### 16. Async Programming Patterns
- **ALWAYS**: Use `async def` for FastAPI endpoints and database operations
- **THREAD SAFETY**: Use `asyncio.Lock()` instead of threading locks for async-safe shared resources
- **CONCURRENCY**: Use `asyncio.gather()` for executing multiple async operations simultaneously
- **BACKGROUND TASKS**: Use `asyncio.create_task()` for non-blocking background operations
- **NON-BLOCKING DELAYS**: Use `asyncio.sleep()` instead of `time.sleep()` to avoid blocking
- **BLOCKING I/O**: Use `asyncio.to_thread()` for blocking filesystem operations in async functions
- **REDIS CONNECTIONS**: Use `aclose()` instead of deprecated `close()` for Redis connections
- **RATIONALE**: Proper async patterns prevent blocking, ensure thread safety, and improve application performance
- **EXAMPLES**:
  ```python
  import asyncio
  from sqlalchemy.ext.asyncio import AsyncSession
  
  # Thread safety with async lock
  shared_resource_lock = asyncio.Lock()
  
  async def critical_section():
      async with shared_resource_lock:
          # Safe access to shared resource
          pass
  
  # Concurrent operations
  async def process_multiple_files(file_paths):
      tasks = [detect_file_type(path) for path in file_paths]
      results = await asyncio.gather(*tasks, return_exceptions=True)
      return results
  
  # Background task
  async def start_background_cleanup():
      asyncio.create_task(cleanup_expired_sessions())
  
  # Non-blocking delay
  async def delayed_operation():
      await asyncio.sleep(60)  # Non-blocking wait
  
  # Blocking I/O in async function
  def sync_file_operation(file_path):
      # Synchronous file operations
      return file_path.exists()
  
  async def async_file_operation(file_path):
      return await asyncio.to_thread(sync_file_operation, file_path)
  ```

### 17. Atomic Operations Pattern
- **ALWAYS**: Perform database operations before filesystem operations
- **CONSISTENCY**: Delete files only AFTER successful database commit
- **ROLLBACK**: If database operation fails, filesystem operations should not occur
- **ORDER**: Query exclusive items BEFORE nulling foreign keys in junction tables
- **RATIONALE**: Prevents orphaned files and database records, ensures data consistency
- **EXAMPLES**:
  ```python
  # CORRECT: DB first, then filesystem
  await db.delete(item)
  await db.commit()
  # Only delete files after successful commit
  if file_path.exists():
      file_path.unlink()
  
  # WRONG: Filesystem first, then DB
  file_path.unlink()  # File deleted
  await db.delete(item)  # DB operation fails - orphaned file!
  ```

### 18. Enum Type Safety Pattern
- **ALWAYS**: Convert string inputs to enum instances before comparison
- **VALIDATION**: Use try/except with ValueError for enum conversion
- **COMPARISONS**: Compare enum instances, not strings against enums
- **ASSIGNMENT**: Assign enum instances to model fields, not string values
- **RATIONALE**: Prevents logic errors, ensures type safety, enables IDE support
- **EXAMPLES**:
  ```python
  # CORRECT: Convert string to enum first
  try:
      status_enum = TodoStatus(status_string)
  except ValueError:
      raise HTTPException(status_code=400, detail="Invalid status")
  
  if status_enum == TodoStatus.DONE:
      # Logic executes correctly
      pass
  
  # WRONG: String vs enum comparison
  if status_string == TodoStatus.DONE:  # Never true!
      # Logic never executes
      pass
  ```

### 19. Date/DateTime Comparison Pattern
- **ALWAYS**: Compare Date columns with date objects, DateTime columns with datetime objects
- **TIMEZONE**: Use timezone-aware datetime objects for comparisons
- **CONVERSION**: Use `.date()` to convert datetime to date for Date column comparisons
- **RATIONALE**: Prevents SQLAlchemy compilation errors and incorrect query results
- **EXAMPLES**:
  ```python
  # CORRECT: Date column vs date object
  where(Todo.due_date < datetime.now(NEPAL_TZ).date())
  
  # CORRECT: DateTime column vs datetime object
  where(Todo.created_at < datetime.now(NEPAL_TZ))
  
  # WRONG: Date column vs datetime object
  where(Todo.due_date < datetime.now(NEPAL_TZ))  # Type mismatch!
  ```

### 20. JSON Response Pattern
- **ALWAYS**: Return JSON-serializable objects from API endpoints
- **ENUMS**: Convert enums to primitive values before JSON serialization
- **RESPONSES**: Use dict objects instead of raw enum instances
- **RATIONALE**: Prevents JSON serialization errors and ensures consistent API responses
- **EXAMPLES**:
  ```python
  # CORRECT: Return dict with enum value
  return {"status": status_enum.value}
  
  # CORRECT: Use JSONResponse with dict
  return JSONResponse({"status": status_enum.value})
  
  # WRONG: Return raw enum
  return JSONResponse(status_enum)  # Serialization error!
  ```

### 21. Priority Enum Pattern
- **ALWAYS**: Use `TaskPriority` enum instead of integer priorities
- **CONSISTENCY**: Apply to all modules that use priority (Todos, Projects, Subtasks)
- **NO BACKWARD COMPATIBILITY**: This is a new application - no legacy data to migrate
- **VALIDATION**: Use enum validation in Pydantic schemas with string conversion
- **RATIONALE**: Type safety, consistency across modules, prevents magic numbers
- **EXAMPLES**:
  ```python
  # CORRECT: Use TaskPriority enum
  priority = TaskPriority.HIGH
  todo.priority = TaskPriority.MEDIUM
  project.priority = TaskPriority.URGENT
  
  # CORRECT: String conversion
  priority = TaskPriority("high")  # Converts string to enum
  
  # WRONG: Magic numbers or unclear values
  priority = 3  # What does 3 mean?
  todo.priority = "medium"  # Should use enum
  ```

### 22. New Application Development Pattern
- **NO LEGACY CODE**: This is a greenfield application - no backward compatibility needed
- **CLEAN IMPLEMENTATION**: Implement features correctly from the start
- **NO MIGRATION SCRIPTS**: No need for data migration scripts
- **MODERN PATTERNS**: Use current best practices without legacy constraints
- **RATIONALE**: Building from scratch allows for optimal architecture without technical debt

### 23. File Creation and Modification Pattern
- **ALWAYS CHECK FIRST**: Before creating any new file, check if it already exists
- **NEVER OVERRIDE**: Never overwrite existing files without explicit user permission
- **READ BEFORE WRITE**: Always read existing file content before making changes
- **BACKUP STRATEGY**: Create backups before major modifications
- **RATIONALE**: Prevents data loss and maintains existing functionality
- **EXAMPLES**:
  ```python
  # CORRECT: Check first
  if not os.path.exists("file.py"):
      create_new_file()
  else:
      read_existing_file()
      modify_existing_file()
  
  # WRONG: Blind creation
  create_file()  # May overwrite existing!
  ```

### 24. Frontend Caching Architecture Pattern
- **LOCAL-FIRST APPROACH**: Frontend caching is primary, backend caching is secondary
- **CHROMIUM OPTIMIZATION**: Leverage IndexedDB, Service Workers, and Cache API for Chromium-based browsers
- **UNIFIED CACHE SERVICE**: Use centralized caching system with memory + IndexedDB persistence
- **CACHE TAGS**: Use tags for easy invalidation by module or data type
- **PERFORMANCE MONITORING**: Log cache hits/misses with response times for debugging
- **OFFLINE CAPABILITY**: Cache enables offline functionality for local-first PKMS
- **RATIONALE**: Local-first approach provides instant responses, offline capability, and better UX
- **EXAMPLES**:
  ```typescript
  // CORRECT: Unified cache with tags
  const cached = await dashboardCache.get('main_dashboard');
  if (cached) {
    console.log('🎯 CACHE HIT: Main dashboard data - INSTANT response!');
    return cached;
  }
  
  const data = await fetch('/api/v1/dashboard/stats');
  await dashboardCache.set('main_dashboard', data, 120000, ['dashboard', 'stats']);
  
  // CORRECT: Pattern invalidation
  await dashboardCache.invalidatePattern('dashboard');
  
  // CORRECT: Tag-based invalidation
  await dashboardCache.invalidateByTags(['stats', 'analytics']);
  ```

### 25. Cache Invalidation Strategy Pattern
- **MODULE-BASED INVALIDATION**: Invalidate cache when data changes in specific modules
- **TAG-BASED INVALIDATION**: Use tags to invalidate related data across modules
- **PATTERN INVALIDATION**: Use key patterns for bulk invalidation
- **GRACEFUL DEGRADATION**: Return default values when cache fails, don't break the UI
- **CACHE STATISTICS**: Monitor hit rates and performance for optimization
- **RATIONALE**: Proper invalidation ensures data consistency while maintaining performance
- **EXAMPLES**:
  ```typescript
  // CORRECT: Module-specific invalidation
  async createTodo(todoData) {
    const result = await api.createTodo(todoData);
    await todosCache.invalidatePattern('todos');
    await dashboardCache.invalidateByTags(['stats']);
    return result;
  }
  
  // CORRECT: Cross-module invalidation
  async updateProject(projectData) {
    const result = await api.updateProject(projectData);
    await projectsCache.invalidatePattern('projects');
    await dashboardCache.invalidateByTags(['stats', 'projects']);
    return result;
  }
  ```

### 26. Service Architecture Pattern
- **SINGLE RESPONSIBILITY**: Each service handles one module's data operations
- **CACHE INTEGRATION**: All services use unified cache system
- **ERROR HANDLING**: Graceful fallbacks with default values
- **PERFORMANCE LOGGING**: Log all cache operations with timing
- **TYPE SAFETY**: Use TypeScript interfaces for all data structures
- **RATIONALE**: Consistent service patterns improve maintainability and performance
- **EXAMPLES**:
  ```typescript
  // CORRECT: Service with cache integration
  class TodosService {
    async getTodos(): Promise<TodoItem[]> {
      const cached = await todosCache.get('todos_list');
      if (cached) {
        console.log('🎯 CACHE HIT: Todos list - INSTANT response!');
        return cached;
      }
      
      console.log('❌ CACHE MISS: Todos list - fetching from backend');
      const data = await fetch('/api/v1/todos');
      await todosCache.set('todos_list', data, 180000, ['todos', 'list']);
      return data;
    }
  }
  ```

## 📋 MODEL FIELD VERIFICATION

### User Ownership Pattern
| Model | User Field | ✅ Correct | ❌ Wrong |
|-------|------------|-----------|----------|
| Note | `created_by` | `Note.created_by == current_user.uuid` | `Note.user_uuid` |
| Document | `created_by` | `Document.created_by == current_user.uuid` | `Document.user_uuid` |
| Todo | `created_by` | `Todo.created_by == current_user.uuid` | `Todo.user_uuid` |
| Project | `created_by` | `Project.created_by == current_user.uuid` | `Project.user_uuid` |
| DiaryEntry | `created_by` | `DiaryEntry.created_by == current_user.uuid` | `DiaryEntry.user_uuid` |
| DiaryMedia | `created_by` | `DiaryMedia.created_by == current_user.uuid` | `DiaryMedia.user_uuid` |
| ArchiveFolder | `created_by` | `ArchiveFolder.created_by == current_user.uuid` | `ArchiveFolder.user_uuid` |
| ArchiveItem | `created_by` | `ArchiveItem.created_by == current_user.uuid` | `ArchiveItem.user_uuid` |
| Tag | `created_by` | `Tag.created_by == current_user.uuid` | `Tag.user_uuid` |
| Link | `created_by` | `Link.created_by == current_user.uuid` | `Link.user_uuid` |

### Primary Key Pattern
| Model | Primary Key | ✅ Correct | ❌ Wrong |
|-------|-------------|-----------|----------|
| All Models | `uuid` | `uuid = Column(String(36), primary_key=True)` | `id = Column(Integer, primary_key=True)` |
| Foreign Keys | Reference `uuid` | `ForeignKey("users.uuid")` | `ForeignKey("users.id")` |
| Queries | Use `uuid` | `select(Model).where(Model.uuid == item_uuid)` | `select(Model).where(Model.id == item_id)` |

## 🗄️ DATABASE SCHEMA

### Current Status: UUID-ONLY ARCHITECTURE ✅
- **Models**: Use `uuid VARCHAR(36) PRIMARY KEY` for all tables
- **Schema**: Aligned with UUID-only pattern, no integer IDs
- **Foreign Keys**: All reference `uuid` fields, never `id` fields
- **Benefits**: Globally unique identifiers, no sequence conflicts, better security

### UUID Implementation Pattern
```sql
-- ✅ CORRECT: UUID primary key
CREATE TABLE todos (
    uuid VARCHAR(36) PRIMARY KEY,
    created_by VARCHAR(36) NOT NULL,
    FOREIGN KEY (created_by) REFERENCES users(uuid) ON DELETE CASCADE
);

-- ❌ WRONG: Integer primary key
CREATE TABLE todos (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

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

## 🚀 RECENT ARCHITECTURAL IMPROVEMENTS

### FileCommitConsistencyService
- **Renamed**: `FileManagementService` → `FileCommitConsistencyService` for clarity
- **Purpose**: Ensures atomic file operations and database consistency across all modules
- **Coverage**: Now used by Documents, Notes, Diary, and Archive modules
- **Benefits**: Prevents orphaned files, ensures data consistency, reduces code duplication

### Atomic Operations Enforcement
- **Archive**: Fixed force-delete to delete files AFTER successful DB commit
- **Project Service**: Fixed exclusive item deletion order to query BEFORE nulling foreign keys
- **Pattern**: All file operations now follow DB-first, filesystem-second pattern

### Enum Type Safety
- **Todos**: Fixed string vs enum comparisons in status handling
- **Dashboard**: Fixed date vs datetime comparisons in overdue todo queries
- **Validation**: Added proper enum conversion with error handling

### Import Organization
- **Centralized**: All enums imported from `app.models.enums`
- **Fixed**: Circular dependencies and incorrect import paths
- **Type Safety**: Proper type annotations for SQLAlchemy Table and ModuleType

### Async Programming
- **File Operations**: Moved blocking I/O to thread pool using `asyncio.to_thread()`
- **Redis**: Updated to use `aclose()` instead of deprecated `close()`
- **Performance**: Eliminated event loop blocking in file operations

---

**Last Updated**: 2025-01-27
**Status**: PRODUCTION READY (with clean database reinitialization required)
**Architectural Health**: SIGNIFICANTLY IMPROVED ✅