"""
PKMS Backend Routers Module

PURPOSE: This directory contains all FastAPI routers for PKMS backend.
Routers define HTTP endpoints, handle request/response, and delegate business
logic to services layer. They are the interface between HTTP clients and
business logic services.

CREATED: December 2024
ARCHITECTURE: RESTful API with dependency injection and middleware integration
FRAMEWORK: FastAPI + Pydantic schemas + SQLAlchemy async patterns

This module serves as:
1. HTTP Interface Layer - Defines all REST endpoints for client applications
2. Request/Response Handling - Manages HTTP status codes, validation, and serialization
3. Authentication & Authorization - Protects endpoints with user authentication
4. API Documentation - Auto-generates OpenAPI/Swagger documentation
5. Middleware Integration - Uses auth, cors, rate limiting, and security middleware

─── ROUTER ORGANIZATION BY MODULE ───────────────────────────────────────────
• ── Core System Routers
├── auth.py
│   PURPOSE: Authentication and authorization endpoints
│   KEY FEATURES: User login, registration, session management, security setup
│   ENDPOINTS:
│     - POST /auth/register: User registration with validation
│     - POST /auth/login: User authentication with session creation
│     - POST /auth/logout: Session termination and cleanup
│     - POST /auth/refresh: Session token refresh
│     - GET /auth/me: Current user profile information
│     - POST /auth/setup-security: Security questions for account recovery
│     - POST /auth/recover: Account recovery with security answers
│     - POST /auth/change-password: Password change with current verification
│   MIDDLEWARE:
│     - JWT token management for session persistence
│     - Rate limiting on authentication endpoints
│     - Password strength validation and hashing
│   SECURITY:
│     - Bcrypt password hashing with salt
│     - JWT tokens with expiration
│     - Security question encryption for recovery
│   IMPORTS NEEDED:
│     from app.routers.auth import auth_router
│     app.include_router(auth_router, prefix="/api/v1/auth")
│
├── archive.py
│   PURPOSE: File and folder management system with hierarchical organization
│   KEY FEATURES: Upload, download, folder operations, search, metadata
│   ENDPOINTS:
│     - GET /archive/folders: List folders with pagination and search
│     - POST /archive/folders: Create new folders with validation
│     - PUT /archive/folders/{uuid}: Update folder metadata
│     - DELETE /archive/folders/{uuid}: Delete folders with force option
│     - GET /archive/folders/tree: Hierarchical tree structure
│     - POST /archive/upload: Multi-file upload with chunked progress
│     - POST /archive/upload/commit: Finalize chunked uploads
│     - GET /archive/items: List items in folder with filters
│     - PUT /archive/items/{uuid}: Update item metadata
│     - DELETE /archive/items/{uuid}: Delete items with file cleanup
│     - GET /archive/items/{uuid}/download: File download with streaming
│     - POST /archive/bulk-move: Bulk move items between folders
│   MIDDLEWARE:
│     - User authentication protection
│     - File validation integration (P2 security enhancement)
│     - Request size limits for upload prevention
│   SECURITY:
│     - User file isolation in storage paths
│     - File type validation with MIME whitelist
│     - Path traversal attack prevention
│     - Transaction atomicity (P0 fix)
│   PERFORMANCE:
│     - P1 optimized path generation (single query)
│     - Chunked uploads for large files
│     - Efficient folder tree loading with lazy loading
│   IMPORTS NEEDED:
│     from app.routers.archive import archive_router
│     app.include_router(archive_router, prefix="/api/v1/archive")
│
├── documents.py
│   PURPOSE: Document management with search and project association
│   KEY FEATURES: Document CRUD, full-text search, metadata extraction
│   ENDPOINTS:
│     - GET /documents: List documents with pagination and search
│     - POST /documents: Create document with metadata and indexing
│     - PUT /documents/{uuid}: Update document content and metadata
│     - DELETE /documents/{uuid}: Delete document with cleanup
│     - GET /documents/{uuid}/download: Download document with streaming
│     - GET /documents/search: Full-text search with FTS
│     - POST /documents/{uuid}/link-to-project: Associate with projects
│     - POST /documents/{uuid}/unlink-from-project: Remove project association
│   MIDDLEWARE:
│     - Document indexing for fast search performance
│     - Duplicate detection using content hashing
│   SEARCH:
│     - FTS5 integration for fast full-text search
│     - Advanced filtering by date, type, tags
│   IMPORTS NEEDED:
│     from app.routers.documents import documents_router
│     app.include_router(documents_router, prefix="/api/v1/documents")
│
├── notes.py
│   PURPOSE: Note management with rich content and project association
│   KEY FEATURES: Rich text notes, tagging, project linking, search
│   ENDPOINTS:
│     - GET /notes: List notes with pagination and filtering
│     - POST /notes: Create note with content parsing and project linking
│     - PUT /notes/{uuid}: Update note content and metadata
│     - DELETE /notes/{uuid}: Delete note with cleanup
│     - GET /notes/{uuid}: Get note with all relations
│     - GET /notes/search: Search notes with content matching
│     - POST /notes/{uuid}/link-to-project: Associate with projects
│     - POST /notes/{uuid}/unlink-from-project: Remove project association
│     - GET /notes/{uuid}/content: Get rich text content for editing
│   FEATURES:
│     - Rich text content with Markdown support
│     - Automatic project association handling
│     - Content size optimization for large notes
│   IMPORTS NEEDED:
│     from app.routers.notes import notes_router
│     app.include_router(notes_router, prefix="/api/v1/notes")
│
├── projects.py
│   PURPOSE: Project management with polymorphic item associations
│   KEY FEATURES: Unified project dashboard, item statistics, member management
│   ENDPOINTS:
│     - GET /projects: List projects with pagination and search
│     - POST /projects: Create project with statistics initialization
│     - PUT /projects/{uuid}: Update project metadata and settings
│     - DELETE /projects/{uuid}: Delete project with cleanup
│     - GET /projects/{uuid}: Get project with all associated items
│     - GET /projects/{uuid}/items: Unified retrieval of all project items
│     - POST /projects/{uuid}/reorder-items: Reorder items across all types
│     - POST /projects/{uuid}/link-item: Link note/todo/document to project
│     - POST /projects/{uuid}/unlink-item: Remove item association from project
│     - GET /projects/{uuid}/analytics: Comprehensive project statistics
│   POLYMORPHISM:
│     - Single project_items table for all associations
│     - Type-based routing to appropriate CRUD service
│     - Unified statistics and search across item types
│   IMPORTS NEEDED:
│     from app.routers.projects import projects_router
│     app.include_router(projects_router, prefix="/api/v1/projects")
│
├── todos.py
│   PURPOSE: Task management with workflow and dependency support
│   KEY FEATURES: Todo CRUD, dependency management, status workflows
│   ENDPOINTS:
│     - GET /todos: List todos with filtering and pagination
│     - POST /todos: Create todo with project association and dependencies
│     - PUT /todos/{uuid}: Update todo metadata and status
│     - DELETE /todos/{uuid}: Delete todo with cleanup
│     - GET /todos/{uuid}: Get todo with all dependencies
│     - POST /todos/{uuid}/add-dependency: Add dependency relationship
│     - POST /todos/{uuid}/remove-dependency: Remove dependency relationship
│     - POST /todos/{uuid}/update-status: Workflow-based status updates
│     - GET /todos/analytics: Todo completion statistics and trends
│   WORKFLOWS:
│     - Status transitions with dependency validation
│     - Automatic status updates based on dependencies
│     - Custom workflow rules per project configuration
│   IMPORTS NEEDED:
│     from app.routers.todos import todos_router
│     app.include_router(todos_router, prefix="/api/v1/todos")
│
├── diary.py
│   PURPOSE: Personal diary with mood tracking, habits, and encryption
│   KEY FEATURES: Daily entries, mood analytics, habit integration
│   ENDPOINTS:
│     - GET /diary/entries: List diary entries with pagination and filters
│     - POST /diary/entries: Create encrypted diary entry with mood
│     - PUT /diary/entries/{uuid}: Update diary entry with mood
│     - DELETE /diary/entries/{uuid}: Delete diary entry with cleanup
│     - GET /diary/entries/{uuid}: Get specific diary entry
│     - GET /diary/moods: List available mood options
│     - GET /diary/habits: List habit tracking data
│     - POST /diary/habits: Record habit completion
│     - GET /diary/analytics: Mood and habit analytics
│     - POST /diary/search: Search diary entries by content and date
│     - GET /diary/export: Export diary data with encryption
│     - POST /diary/import: Import diary data with decryption
│   SECURITY:
│     - Client-side encryption before server transmission
│     - User-controlled security questions for recovery
│     - Encrypted diary storage in database
│   IMPORTS NEEDED:
│     from app.routers.diary import diary_router
│     app.include_router(diary_router, prefix="/api/v1/diary")
│
├── dashboard.py
│   PURPOSE: Analytics and overview data for user dashboard
│   KEY FEATURES: Usage statistics, activity tracking, performance metrics
│   ENDPOINTS:
│     - GET /dashboard/overview: Complete dashboard statistics
│     - GET /dashboard/storage: Storage usage breakdown by type
│     - GET /dashboard/recent: Recent user activity and changes
│     - GET /dashboard/analytics: Advanced analytics and trends
│     - GET /dashboard/favorites: User's favorited items
│     - GET /dashboard/performance: System performance and health metrics
│   AGGREGATION:
│     - Data from all modules (notes, documents, todos, projects)
│     - Real-time activity tracking
│     - Historical trends and patterns
│   IMPORTS NEEDED:
│     from app.routers.dashboard import dashboard_router
│     app.include_router(dashboard_router, prefix="/api/v1/dashboard")
│
├── backup.py
│   PURPOSE: Data backup and restore functionality
│   KEY FEATURES: Create backups, restore from backup, encryption
│   ENDPOINTS:
│     - POST /backup/create: Create encrypted backup of user data
│     - GET /backup/list: List available backups with metadata
│     - POST /backup/restore: Restore data from encrypted backup
│     - GET /backup/{uuid}/download: Download backup file
│     - DELETE /backup/{uuid}: Delete backup file
│   SECURITY:
│     - Encrypted backup files with user keys
│     - Backup validation and integrity checking
│   IMPORTS NEEDED:
│     from app.routers.backup import backup_router
│     app.include_router(backup_router, prefix="/api/v1/backup")
│
├── unified_uploads.py
│   PURPOSE: Chunked file upload system with resume capability
│   KEY FEATURES: Large file handling, progress tracking, resume support
│   ENDPOINTS:
│     - POST /uploads/init: Initialize chunked upload session
│     - POST /uploads/chunk: Upload individual chunk with validation
│     - GET /uploads/progress: Get upload progress and status
│     - POST /uploads/complete: Finalize upload and assemble file
│     - DELETE /uploads/{session_id}: Cancel upload session
│     - GET /uploads/resume: List resumable uploads
│   PERFORMANCE:
│     - Chunked uploads for files of any size
│     - Progress tracking with real-time updates
│     - Resume capability after interruptions
│     - Parallel processing for performance
│   IMPORTS NEEDED:
│     from app.routers.unified_uploads import uploads_router
│     app.include_router(uploads_router, prefix="/api/v1/uploads")
│
├── advanced_fuzzy.py
│   PURPOSE: Advanced fuzzy search across all content types
│   KEY FEATURES: Typo-tolerant search, relevance ranking, suggestions
│   ENDPOINTS:
│     - GET /fuzzy/search: Fuzzy search with typo tolerance
│     - GET /fuzzy/suggest: Auto-complete suggestions
│     - GET /fuzzy/did-you-mean: Alternative search suggestions
│   ALGORITHMS:
│     - Levenshtein distance for string similarity
│     - N-gram matching for partial matches
│     - Relevance scoring with recency and usage
│   IMPORTS NEEDED:
│     from app.routers.advanced_fuzzy import fuzzy_router
│     app.include_router(fuzzy_router, prefix="/api/v1/fuzzy")
│
└── deletion_impact.py
│   PURPOSE: Deletion impact analysis and safety recommendations
│   KEY FEATURES: Impact analysis, safety warnings, orphan detection
│   ENDPOINTS:
│     - GET /analyze/{item_type}/{item_uuid}: Analyze deletion impact
│   SAFETY:
│     - Prevents accidental data loss
│     - Shows detailed impact before destructive operations
│     - Identifies orphaned and preserved items
│   IMPORTS NEEDED:
│     from app.routers.deletion_impact import deletion_impact_router
│     app.include_router(deletion_impact_router, prefix="/api/v1/deletion-impact")

─── ROUTER DEVELOPMENT PATTERNS ───────────────────────────────────────
1. DEPENDENCY INJECTION:
   Routers receive dependencies via FastAPI Depends()
   Clean separation from business logic in services

2. ASYNC PATTERNS:
   All endpoint handlers are async functions
   Proper async database session management
   Non-blocking operations throughout

3. PYDANTIC SCHEMAS:
   Request/response models for automatic validation
   Auto-generates OpenAPI documentation
   Type safety for API contracts

4. ERROR HANDLING:
   Consistent HTTPException patterns
   Proper HTTP status codes
   Structured error responses

5. MIDDLEWARE INTEGRATION:
   Authentication middleware for protected routes
   CORS handling for cross-origin requests
   Rate limiting for API abuse prevention
   Request logging and monitoring

6. SECURITY:
   User authentication and authorization
   Input validation and sanitization
   File upload security with validation
   User data isolation and access control
   Rate limiting on sensitive operations

─── IMPORT USAGE EXAMPLES ───────────────────────────────────────────
# Basic router inclusion in main app
from app.routers import (
    auth_router,
    archive_router,
    documents_router,
    notes_router,
    projects_router,
    todos_router,
    diary_router,
    dashboard_router,
    backup_router,
    uploads_router,
    fuzzy_router,
    preflight_router
)

# Include all routers with API versioning
app.include_router(auth_router, prefix="/api/v1/auth")
app.include_router(archive_router, prefix="/api/v1/archive")

# Custom router with dependencies
from app.routers.projects import projects_router
from app.dependencies import get_current_user, get_db

@app.post("/custom-endpoint")
async def custom_endpoint(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Custom endpoint with injected dependencies
    result = await some_service.do_something(db, current_user.uuid, request_data)
    return {"result": result}

─── API DOCUMENTATION ───────────────────────────────────────────
Auto-generated OpenAPI documentation available at:
- /docs (Swagger UI)
- /openapi.json (OpenAPI specification)
- /redoc (ReDoc documentation)

Each router automatically documents:
- Endpoint paths and HTTP methods
- Request/response schemas
- Authentication requirements
- Rate limiting and security rules

─── PERFORMANCE & SECURITY NOTES ───────────────────────────────────
PERFORMANCE:
- Database connection pooling for concurrent requests
- Async database operations throughout
- Efficient query patterns (see P1 optimizations)
- Response caching for static data
- Lazy loading for large datasets

SECURITY:
- All protected routes require authentication
- Input validation using Pydantic schemas
- SQL injection prevention via SQLAlchemy ORM
- File upload validation and size limits
- User data isolation in storage paths
- Rate limiting on sensitive operations
- Request logging and audit trails

This router module provides complete REST API interface for PKMS applications.
Each router follows FastAPI best practices for performance, security,
and maintainability.
"""

# Import all routers for easier app initialization
from . import (
    # Core System
    auth_router,
    archive_router,
    backup_router,

    # Content Management
    documents_router,
    notes_router,
    projects_router,
    todos_router,
    diary_router,
    unified_uploads_router,

    # Analytics & Search
    dashboard_router,
    advanced_fuzzy_router,

    # Safety & Utilities
    deletion_impact_router,
)

__all__ = [
    # Core System
    'auth_router',
    'archive_router',
    'backup_router',

    # Content Management
    'documents_router',
    'notes_router',
    'projects_router',
    'todos_router',
    'diary_router',
    'unified_uploads_router',

    # Analytics & Search
    'dashboard_router',
    'advanced_fuzzy_router',

    # Safety & Utilities
    'deletion_impact_router',
] 