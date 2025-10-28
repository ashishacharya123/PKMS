"""
PKMS Backend Services Module

PURPOSE: This directory contains all business logic services for PKMS backend.
Services are organized by domain and handle CRUD operations, business rules,
and complex workflows separate from the FastAPI router layer.

CREATED: December 2024
ARCHITECTURE: Service-oriented architecture with async/await patterns
FRAMEWORK: SQLAlchemy + FastAPI with dependency injection

This module serves as:
1. Business logic layer - Contains all application business rules
2. Data access abstraction - Hides database complexity from routers
3. Service composition - Complex operations built from smaller services
4. Transaction management - Ensures data consistency across operations

─── SERVICE ORGANIZATION BY DOMAIN ──────────────────────────────────────────────
• ── Archive & File Management Services
├── archive_folder_service.py
│   PURPOSE: Hierarchical folder operations with user isolation
│   KEY FEATURES: Tree building, breadcrumb generation, bulk operations
│   FUNCTIONS:
│     - create_folder(): Create folders with validation and stats tracking
│     - get_folder_tree(): Build hierarchical tree structure for UI
│     - delete_folder(): Delete with force option and cascade handling
│     - bulk_move_folders(): Move multiple folders atomically
│     - update_folder_stats(): Recalculate item counts and sizes
│     - get_folder_breadcrumb(): Generate navigation breadcrumb paths
│   IMPORTS NEEDED:
│     from app.services.archive_folder_service import archive_folder_service
│     result = await archive_folder_service.create_folder(db, user_uuid, folder_data)
│   DEPENDENCIES:
│     - ArchiveFolder model (database)
│     - archive_path_service (for path operations)
│     - SQLAlchemy async sessions for transactions
│   PERFORMANCE:
│     - Uses P1-optimized path service (single query instead of N+1)
│     - Implements efficient bulk operations for large folder structures
│
├── archive_item_service.py
│   PURPOSE: File operations with security validation and metadata handling
│   KEY FEATURES: Secure uploads, thumbnail generation, duplicate detection
│   FUNCTIONS:
│     - upload_files(): Multi-file upload with chunked progress tracking
│     - commit_upload(): Finalize chunked uploads with metadata extraction
│     - create_item(): Create archive item with validation and stats update
│     - update_item(): Update metadata with folder stats recalculation
│     - delete_item(): Delete with file cleanup and stats updates
│     - generate_thumbnails(): Create preview images for supported formats
│   IMPORTS NEEDED:
│     from app.services.archive_item_service import archive_item_service
│     result = await archive_item_service.upload_files(db, user_uuid, files, folder_uuid)
│   DEPENDENCIES:
│     - ArchiveItem model (database)
│     - file_validation_service (P2 security feature)
│     - chunk_service (for large file handling)
│     - thumbnail_service (for image previews)
│   SECURITY:
│     - Uses FileValidationService for MIME type checking
│     - Implements user-isolated storage paths
│     - Validates filenames and prevents path traversal attacks
│
├── archive_path_service.py
│   PURPOSE: High-performance path generation and folder hierarchy operations
│   KEY FEATURES: Single-query path resolution, cycle detection, validation
│   FUNCTIONS:
│     - get_filesystem_path(): Build UUID-based paths for file storage
│     - get_display_path(): Build human-readable breadcrumb paths for UI
│     - get_folder_breadcrumb(): Generate navigation breadcrumb lists
│     - _get_all_folders_map(): Fetch all folders in single query (P1 fix)
│     - validate_folder_name(): Security checks and sanitization
│     - validate_folder_name_uniqueness(): Prevent duplicate folder names
│   IMPORTS NEEDED:
│     from app.services.archive_path_service import archive_path_service
│     path = await archive_path_service.get_filesystem_path(folder_uuid, db, user_uuid)
│   DEPENDENCIES:
│     - ArchiveFolder model (database)
│     - Built-in SQLAlchemy for database operations
│   PERFORMANCE CRITICAL:
│     - Fixed N+1 query bug using batch queries
│     - Reduces folder path queries from O(depth) to O(1)
│     - Critical for deep folder structures performance
│
├── file_validation_service.py (NEW - P2 SECURITY FIX)
│   PURPOSE: Comprehensive file upload security validation
│   KEY FEATURES: MIME type enforcement, content scanning, size limits
│   FUNCTIONS:
│     - validate_file(): Complete security validation for uploaded files
│   IMPORTS NEEDED:
│     from app.services.file_validation import file_validation_service
│     await file_validation_service.validate_file(upload_file)
│   DEPENDENCIES:
│     - FileTypeDetectionService (existing MIME type detection)
│     - Built-in security patterns for dangerous content
│   SECURITY FEATURES:
│     - MIME type whitelist enforcement
│     - Dangerous content pattern scanning (<script>, <?php, etc.)
│     - File size limits to prevent DOS attacks
│     - Filename validation to prevent path traversal
│
├── file_detection.py (EXISTING - ENHANCED BY P2)
│   PURPOSE: Advanced file type detection using multiple methods
│   KEY FEATURES: AI-powered detection, magic bytes analysis, fallback options
│   FUNCTIONS:
│     - detect_file_type(): Multi-method file type detection with confidence scoring
│     - bulk_detect(): Batch detection for multiple files
│     - get_detector_status(): Check availability of detection libraries
│   IMPORTS NEEDED:
│     from app.services.file_detection import file_detector
│     detected_type = await file_detector.detect_file_type(file_path)
│   DEPENDENCIES:
│     - Magika (Google AI file type detector) - highest accuracy
│     - pyfsig (magic bytes analysis) - good fallback
│     - filetype (content-based) - secure alternative
│     - mimetypes (extension-based) - basic fallback
│   DETECTION METHODS:
│     1. Magika AI: Best accuracy, confidence scoring
│     2. pyfsig: Magic byte pattern matching
│     3. filetype: Content-based detection
│     4. mimetypes: Extension-based fallback
│
└── unified_upload_service.py (ENHANCED - P2 USER ISOLATION FIX)
│   PURPOSE: Atomic file operations across all modules with user isolation
│   KEY FEATURES: Chunked uploads, user-specific paths, transaction safety
│   FUNCTIONS:
│     - commit_upload(): Atomic file finalization with metadata extraction
│     - _generate_paths(): Create user-isolated storage paths (P2 security fix)
│     - _locate_assembled_file(): Find and validate chunked uploads
│     - _update_folder_metadata(): Update folder statistics after operations
│   IMPORTS NEEDED:
│     from app.services.unified_upload_service import unified_upload_service
│     result = await unified_upload_service.commit_upload(db, upload_id, metadata)
│   DEPENDENCIES:
│     - All other services (composed from smaller services)
│     - Chunk service for large file handling
│     - User isolation helpers for security
│   SECURITY IMPROVEMENTS (P2):
│     - User-specific storage: assets/{module}/{user_uuid}/
│     - Path traversal validation in final path checks
│     - Uses optimized path service (P1 fix) for performance
│     - Integrated file validation for all uploads

• ── Document Management Services
├── document_crud_service.py
│   PURPOSE: Document CRUD operations with project association and search
│   KEY FEATURES: Full-text search, metadata extraction, project linking
│   FUNCTIONS:
│     - create_document(): Document creation with metadata and indexing
│     - update_document(): Update with FTS reindexing
│     - search_documents(): Full-text search with ranking
│     - link_to_project(): Associate with project items
│   IMPORTS NEEDED:
│     from app.services.document_crud_service import document_crud_service
│     docs = await document_crud_service.search_documents(db, query, user_uuid)
│   DEPENDENCIES:
│     - Document model (database with FTS)
│     - document_hash_service (for duplicate detection)
│     - search_service (for unified search)
│   SEARCH FEATURES:
│     - Full-text search with FTS5
│     - Advanced filtering by date, type, tags
│     - Result ranking and relevance scoring
│
├── document_hash_service.py
│   PURPOSE: Document deduplication using content-based hashing
│   KEY FEATURES: SHA-256 hashing, duplicate detection, storage optimization
│   FUNCTIONS:
│     - calculate_document_hash(): Generate SHA-256 for content
│     - find_duplicates(): Locate existing documents with same content
│     - update_hash_references(): Update hash references on deletion
│   IMPORTS NEEDED:
│     from app.services.document_hash_service import document_hash_service
│     hash_val = await document_hash_service.calculate_document_hash(content)
│   DEPENDENCIES:
│     - hashlib (built-in SHA-256)
│     - Document model for hash storage
│   PERFORMANCE:
│     - Prevents storage duplication
│     - Fast hash-based lookup for duplicates
│
└── note_document_service.py
│   PURPOSE: Document-note association management
│   KEY FEATURES: Many-to-many linking, metadata inheritance
│   FUNCTIONS:
│     - link_document_to_note(): Associate document with note
│     - unlink_document_from_note(): Remove association
│     - get_note_documents(): Get all documents for a note
│   IMPORTS NEEDED:
│     from app.services.note_document_service import note_document_service
│     await note_document_service.link_document_to_note(db, note_uuid, doc_uuid)
│   DEPENDENCIES:
│     - Note-Document association table
│     - Document and Note CRUD services

• ── Note & Todo Management Services
├── note_crud_service.py
│   PURPOSE: Note CRUD operations with rich content and project association
│   KEY FEATURES: Rich text support, large note handling, project linking
│   FUNCTIONS:
│     - create_note(): Note creation with content parsing and project linking
│     - update_note(): Update with content size optimization
│     - get_note_with_relations(): Get note with all associated data
│     - _write_note_content_to_file(): Handle large notes with file storage
│   IMPORTS NEEDED:
│     from app.services.note_crud_service import note_crud_service
│     note = await note_crud_service.create_note(db, note_data, user_uuid)
│   DEPENDENCIES:
│     - Note model with polymorphic project_items association
│     - Project service for association management
│   LARGE NOTE OPTIMIZATION:
│     - Notes >60KB stored as files to reduce database size
│     - Automatic content file path management
│
├── todo_crud_service.py
│   PURPOSE: Todo/item management with workflow and dependency support
│   KEY FEATURES: Status workflows, dependencies, due date tracking
│   FUNCTIONS:
│     - create_todo(): Create with project association and dependency linking
│     - update_todo_status(): Update with workflow validation
│     - get_todo_dependencies(): Get dependency graph for a todo
│     - calculate_todo_statistics(): Generate completion metrics
│   IMPORTS NEEDED:
│     from app.services.todo_crud_service import todo_crud_service
│     todo = await todo_crud_service.create_todo(db, todo_data, user_uuid)
│   DEPENDENCIES:
│     - Todo model with polymorphic project_items
│     - todo_workflow_service for status management
│   WORKFLOW FEATURES:
│     - Status-based workflows (pending → in-progress → done)
│     - Dependency validation and circular detection
│     - Automatic status updates based on dependencies
│
├── todo_workflow_service.py
│   PURPOSE: Todo workflow and dependency management engine
│   KEY FEATURES: Status transitions, dependency resolution, automation
│   FUNCTIONS:
│     - can_transition_to(): Validate workflow transition rules
│     - update_dependent_todos(): Auto-update dependent items
│     - get_workflow_graph(): Build dependency graph for visualization
│   IMPORTS NEEDED:
│     from app.services.todo_workflow_service import todo_workflow_service
│     can_update = await todo_workflow_service.can_transition_to(todo, new_status)
│   WORKFLOW RULES:
│     - In-progress → Done only if all dependencies complete
│     - Blocked → Pending only if blockers resolved
│     - Custom status transitions per workflow configuration

• ── Project Management Services
├── project_service.py (REFACTORED - UNIFIED)
│   PURPOSE: Unified project management with polymorphic associations
│   KEY FEATURES: Multi-item association, statistics, member management
│   FUNCTIONS:
│     - create_project(): Create with initial statistics calculation
│     - get_project_items(): Unified retrieval of all associated items
│     - handle_polymorphic_associations(): Link notes, todos, documents
│     - reorder_project_items(): Unified item reordering across types
│     - calculate_project_statistics(): Generate comprehensive project metrics
│   IMPORTS NEEDED:
│     from app.services.project_service import project_service
│     items = await project_service.get_project_items(db, project_uuid, user_uuid)
│   DEPENDENCIES:
│     - Project model (database)
│     - Polymorphic project_items table (unified associations)
│     - All CRUD services (composed)
│   POLYMORPHIC ARCHITECTURE:
│     - Single table for all project-item associations
│     - Type-based routing for appropriate CRUD service
│     - Unified statistics and search across item types
│
└── association_counter_service.py
│   PURPOSE: Cross-module association counting and statistics
│   KEY FEATURES: Link metrics, association validation, analytics
│   FUNCTIONS:
│     - get_item_link_count(): Get total associations for any item type
│     - get_document_link_count(): Count document associations
│     - get_note_link_count(): Count note associations
│     - get_todo_link_count(): Count todo associations
│     - get_project_link_count(): Count project children
│   IMPORTS NEEDED:
│     from app.services.association_counter_service import association_counter_service
│     count = await association_counter_service.get_item_link_count(db, item_type, item_uuid)
│   USAGE:
│     - Orphan detection for deletion lifecycle
│     - Cross-module relationship validation
│     - Data migration and cleanup operations

• ── User Data & Diary Services
├── diary_crud_service.py
│   PURPOSE: Personal diary/journal management with mood and habit tracking
│   KEY FEATURES: Encrypted entries, mood analytics, habit integration
│   FUNCTIONS:
│     - create_diary_entry(): Create with encryption and mood processing
│     - search_diary_entries(): Full-text search with mood filters
│     - get_habit_analytics(): Generate habit streak and consistency metrics
│   IMPORTS NEEDED:
│     from app.services.diary_crud_service import diary_crud_service
│     entry = await diary_crud_service.create_diary_entry(db, entry_data, user_uuid)
│   DEPENDENCIES:
│     - DiaryEntry model with encrypted content
│     - diary_crypto_service for client-side encryption
│     - Habit tracking integration
│   SECURITY:
│     - Client-side encryption before server storage
│     - User-controlled security questions for recovery
│
├── diary_metadata_service.py
│   PURPOSE: Diary metadata management and user preferences
│   KEY FEATURES: User settings, theme preferences, backup metadata
│   FUNCTIONS:
│     - get_user_preferences(): Retrieve diary user preferences
│     - update_user_preferences(): Store user settings
│     - get_diary_statistics(): Generate entry statistics
│   IMPORTS NEEDED:
│     from app.services.diary_metadata_service import diary_metadata_service
│     prefs = await diary_metadata_service.get_user_preferences(db, user_uuid)
│
├── diary_document_service.py
│   PURPOSE: Diary-document linking for personal file organization
│   KEY FEATURES: Personal file organization, metadata inheritance
│   FUNCTIONS:
│     - attach_document_to_diary(): Link document to diary entry
│     - get_diary_documents(): Get all documents for diary entries
│   IMPORTS NEEDED:
│     from app.services.diary_document_service import diary_document_service
│     await diary_document_service.attach_document_to_diary(db, doc_uuid, entry_uuid)
│   DEPENDENCIES:
│     - Document-Diary association table
│     - Document CRUD service for file operations

• ── Analytics & Performance Services
├── dashboard_service.py
│   PURPOSE: Dashboard analytics and overview data generation
│   KEY FEATURES: Usage statistics, activity tracking, performance metrics
│   FUNCTIONS:
│     - get_dashboard_analytics(): Generate comprehensive dashboard data
│     - calculate_storage_breakdown(): Analyze storage usage by type
│     - get_recent_activity(): Track recent user actions
│   IMPORTS NEEDED:
│     from app.services.dashboard_service import dashboard_service
│     analytics = await dashboard_service.get_dashboard_analytics(db, user_uuid)
│   DEPENDENCIES:
│     - All other services (aggregated data source)
│     - Statistical calculations and aggregations
│
├── search_service.py
│   PURPOSE: Unified search across all content types with FTS
│   KEY FEATURES: Cross-module search, relevance ranking, advanced filtering
│   FUNCTIONS:
│     - unified_search(): Search across notes, documents, todos, diary
│     - get_search_suggestions(): Generate auto-complete suggestions
│     - rank_search_results(): Order results by relevance and recency
│   IMPORTS NEEDED:
│     from app.services.search_service import search_service
│     results = await search_service.unified_search(db, query, user_uuid, filters)
│   SEARCH PERFORMANCE:
│     - FTS5 indexing for fast full-text search
│     - Cached search results for repeated queries
│     - Parallel search across multiple content types

• ── Utility & Supporting Services
│
├── analytics_config_service.py
│   PURPOSE: Analytics configuration and metric definitions
│   KEY FEATURES: Custom metrics, tracking rules, data retention
│   FUNCTIONS:
│     - get_analytics_config(): Retrieve analytics configuration
│     - update_metric_definitions(): Define custom metrics
│     - cleanup_old_analytics(): Remove data past retention period
│   IMPORTS NEEDED:
│     from app.services.analytics_config_service import analytics_config_service
│     config = await analytics_config_service.get_analytics_config(db, user_uuid)
│
├── chunk_service.py
│   PURPOSE: Large file handling with chunked uploads and resume capability
│   KEY FEATURES: Chunked uploads, progress tracking, resume support
│   FUNCTIONS:
│     - init_chunk_upload(): Initialize chunked upload session
│     - upload_chunk(): Handle individual chunk with validation
│     - complete_chunk_upload(): Assemble chunks into final file
│   IMPORTS NEEDED:
│     from app.services.chunk_service import chunk_manager
│     upload_id = await chunk_manager.init_chunk_upload(file_metadata)
│   CHUNK UPLOAD FEATURES:
│     - Resumable uploads after interruption
│     - Progress tracking for large files
│     - Parallel chunk processing for performance
│     - Integrity validation with checksums

─── SERVICE COMPOSITION PATTERNS ──────────────────────────────────────────────
1. DEPENDENCY INJECTION:
   Services accept database sessions and dependencies via function parameters
   No global state, clean dependency management

2. ASYNC PATTERNS:
   All service methods are async/await for non-blocking operations
   Proper transaction management with explicit begin/commit/rollback

3. ERROR HANDLING:
   Consistent error handling with HTTPException for API layer
   Service-level logging with structured error messages

4. BUSINESS LOGIC SEPARATION:
   Services contain business rules, routers handle HTTP concerns
   Clear separation of concerns for maintainability

5. PERFORMANCE OPTIMIZATION:
   - P1: Single-query path operations (archive_path_service)
   - P2: User file isolation and security validation
   - Batch operations for bulk data changes
   - Efficient caching strategies

─── IMPORT USAGE EXAMPLES ──────────────────────────────────────────────
# Archive Operations
from app.services.archive_folder_service import archive_folder_service
from app.services.archive_item_service import archive_item_service

# Create folder with atomic operations
folder = await archive_folder_service.create_folder(db, user_uuid, folder_data)

# Upload files with security validation
files = await archive_item_service.upload_files(db, user_uuid, files, folder_uuid)

# Document Operations
from app.services.document_crud_service import document_crud_service

# Search documents with full-text search
docs = await document_crud_service.search_documents(db, query, filters, user_uuid)

# Project Operations
from app.services.project_service import project_service

# Get unified project items
items = await project_service.get_project_items(db, project_uuid, user_uuid)

# Unified Search
from app.services.search_service import search_service

# Cross-module search
results = await search_service.unified_search(db, query, user_uuid, search_filters)

─── MAINTENANCE & DEVELOPMENT NOTES ──────────────────────────────────────────────
TODO: Service Cleanup Tasks
- Remove deprecated/unused service files
- Standardize error handling across all services
- Add comprehensive service-level unit tests
- Implement service metrics and performance monitoring
- Add request tracing for debugging

TODO: Performance Optimizations
- Add Redis caching for frequently accessed data
- Implement database connection pooling optimizations
- Add bulk operation APIs for better performance
- Optimize search indexing and query performance

TODO: Security Enhancements
- Add rate limiting to service operations
- Implement audit logging for sensitive operations
- Add input validation and sanitization at service level
- Enhance user isolation and permission checking

This module provides the complete business logic foundation for the PKMS application.
Each service should maintain clean interfaces, proper error handling, and follow the
established patterns for consistency and maintainability.
"""

# Make all services available for easier imports
from . import (
    # Archive & File Management
    archive_folder_service,
    archive_item_service,
    archive_path_service,
    file_validation,
    file_detection,
    unified_upload_service,

    # Document Management
    document_crud_service,
    document_hash_service,
    note_document_service,

    # Note & Todo Management
    note_crud_service,
    todo_crud_service,
    todo_workflow_service,

    # Project Management
    project_service,

    # User Data & Diary
    diary_crud_service,
    diary_metadata_service,
    diary_document_service,

    # Analytics & Performance
    dashboard_service,
    search_service,

    # Utility & Supporting
    chunk_service,
)

__all__ = [
    # Archive & File Management
    'archive_folder_service',
    'archive_item_service',
    'archive_path_service',
    'file_validation',
    'file_detection',
    'unified_upload_service',

    # Document Management
    'document_crud_service',
    'document_hash_service',
    'note_document_service',

    # Note & Todo Management
    'note_crud_service',
    'todo_crud_service',
    'todo_workflow_service',

    # Project Management
    'project_service',

    # User Data & Diary
    'diary_crud_service',
    'diary_metadata_service',
    'diary_document_service',

    # Analytics & Performance
    'dashboard_service',
    'search_service',

    # Utility & Supporting
    'chunk_service',
] 