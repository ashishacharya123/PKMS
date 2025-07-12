# TODO: Refactor and Improvements

## Current Status
This document tracks refactoring tasks and improvements needed for the PKMS system.

## Completed Refactoring

### 1. Database Schema Normalization ✅
- **Issue**: Links table had comma-separated tags instead of proper many-to-many relationships
- **Solution**: Created `link_tags` association table and migration script
- **Status**: ✅ Complete

### 2. FTS5 Search Implementation ✅
- **Issue**: Inconsistent search implementations across modules
- **Solution**: Centralized FTS5 service with proper table initialization
- **Status**: ✅ Complete

### 3. Timezone Consistency ✅
- **Issue**: Mixed timezone usage across the application
- **Solution**: Standardized on Nepal timezone with `nepal_now()` function
- **Status**: ✅ Complete

## Pending Refactoring Tasks

### 1. Naming Convention Standardization (High Priority)
**Issue**: Mixed naming conventions (snake_case vs camelCase) across models and API responses

**Files Affected**:
- `pkms-backend/app/models/` - All model files
- `pkms-frontend/src/types/` - TypeScript interfaces
- `pkms-backend/app/routers/` - API response models

**Solution**:
- [ ] **Backend**: Standardize all Pydantic models to use snake_case for consistency with Python conventions
- [ ] **Frontend**: Update TypeScript interfaces to match backend snake_case naming
- [ ] **Database**: Ensure all column names use snake_case
- [ ] **API Responses**: Standardize all response fields to snake_case

**Example Fix**:
```python
# BEFORE (Inconsistent)
class ArchiveItem(BaseModel):
    uuid: str
    originalFilename: str  # camelCase
    file_size: int        # snake_case

# AFTER (Consistent)
class ArchiveItem(BaseModel):
    uuid: str
    original_filename: str  # snake_case
    file_size: int         # snake_case
```

### 2. FTS5 Search Logic Consolidation (High Priority)
**Issue**: Duplicate FTS5 search logic across multiple routers

**Files Affected**:
- `pkms-backend/app/routers/search.py:413-460`
- `pkms-backend/app/routers/archive.py` - Multiple FTS5 implementations
- `pkms-backend/app/routers/diary.py` - FTS5 search logic
- `pkms-backend/app/routers/documents.py` - FTS5 search logic

**Solution**:
- [ ] **Extract Common FTS5 Logic**: Create shared FTS5 search utilities in `app/services/fts_service.py`
- [ ] **Standardize Query Preparation**: Create common query sanitization and preparation functions
- [ ] **Unify Error Handling**: Standardize FTS5 error handling across all modules
- [ ] **Performance Optimization**: Add caching for frequently used FTS5 queries

**Example Consolidation**:
```python
# Create in fts_service.py
class FTS5SearchService:
    async def search_with_ranking(self, table_name: str, query: str, user_id: int, **filters):
        """Common FTS5 search with ranking and filtering"""
        # Standardized implementation
        pass
    
    def prepare_fts_query(self, query: str) -> str:
        """Standardized query preparation"""
        pass
```

### 3. Schema Mismatch Resolution (High Priority)
**Issue**: Frontend TypeScript interfaces don't match backend Pydantic models exactly

**Files Affected**:
- `pkms-frontend/src/types/archive.ts`
- `pkms-frontend/src/types/` - All type definition files
- `pkms-backend/app/routers/` - Pydantic response models

**Solution**:
- [ ] **Audit All Interfaces**: Compare every TypeScript interface with corresponding Pydantic model
- [ ] **Align Field Names**: Ensure exact field name matching between frontend and backend
- [ ] **Type Consistency**: Ensure data types match (string vs number, optional vs required)
- [ ] **Add Missing Fields**: Add any missing fields in frontend interfaces
- [ ] **Remove Obsolete Fields**: Remove fields that no longer exist in backend

**Example Fix**:
```typescript
// BEFORE (Mismatched)
export interface ArchiveItem {
  uuid: string;
  originalFilename: string;  // camelCase, should be snake_case
  extracted_text?: string;   // Missing in backend response
}

// AFTER (Aligned)
export interface ArchiveItem {
  uuid: string;
  original_filename: string;  // snake_case, matches backend
  // extracted_text removed - not in backend response
}
```

### 4. Missing API Endpoints (Medium Priority)
**Issue**: Some CRUD operations missing for certain entities

**Analysis Needed**:
- [ ] **Audit All Modules**: Review each module (notes, documents, todos, diary, archive) for missing CRUD operations
- [ ] **Identify Gaps**: Document which endpoints are missing (e.g., bulk operations, batch updates)
- [ ] **Prioritize Implementation**: Determine which missing endpoints are actually needed
- [ ] **Document Decisions**: Explain why certain endpoints are intentionally not implemented

**Potential Missing Endpoints**:
- [ ] Bulk delete operations for multiple items
- [ ] Batch update operations for multiple items
- [ ] Advanced filtering endpoints
- [ ] Export/import endpoints for data migration

### 5. Inconsistent Response Formats (Medium Priority)
**Issue**: Different response structures across endpoints

**Files Affected**:
- `pkms-backend/app/routers/` - All router files
- Response models in each router

**Solution**:
- [ ] **Standardize Success Responses**: Create common success response format
- [ ] **Standardize Error Responses**: Create common error response format
- [ ] **Add Response Metadata**: Include pagination info, timestamps, etc. consistently
- [ ] **Create Response Wrappers**: Implement response wrapper classes

**Example Standardization**:
```python
# Common response format
class StandardResponse(BaseModel):
    success: bool
    data: Any
    message: Optional[str] = None
    timestamp: datetime
    pagination: Optional[Dict] = None

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: Optional[Dict] = None
    timestamp: datetime
```

### 6. Service Layer Organization (Medium Priority)
**Issue**: Services are scattered across different directories

**Current Structure**:
- `app/services/` - Some services
- `app/routers/` - Business logic mixed with routing
- `app/utils/` - Utility functions

**Solution**:
- [ ] **Consolidate Services**: Move all business logic to `app/services/` directory
- [ ] **Create Service Categories**: Organize services by domain (auth, search, file, etc.)
- [ ] **Extract Business Logic**: Move business logic from routers to services
- [ ] **Update Imports**: Update all imports to use new service structure

**Proposed Structure**:
```
app/services/
├── auth/
│   ├── auth_service.py
│   └── session_service.py
├── search/
│   ├── fts_service.py
│   └── fuzzy_service.py
├── file/
│   ├── file_service.py
│   └── upload_service.py
└── data/
    ├── backup_service.py
    └── migration_service.py
```

### 7. Database Transactions for Search Operations (Low Priority)
**Issue**: Search operations don't use explicit database transactions

**Files Affected**:
- `pkms-backend/app/routers/search.py`
- `pkms-backend/app/services/fts_service.py`
- All search endpoints

**Solution**:
- [ ] **Add Transaction Context**: Wrap search operations in database transactions
- [ ] **Handle Concurrent Searches**: Ensure search operations don't interfere with each other
- [ ] **Add Read-Only Transactions**: Use read-only transactions for search operations
- [ ] **Optimize Transaction Scope**: Keep transactions as short as possible

**Example Implementation**:
```python
async def search_with_transaction(db: AsyncSession, query: str):
    async with db.begin():
        # Search operations here
        result = await perform_search(db, query)
        return result
```

### 8. CORS Configuration to Environment Variables (Low Priority)
**Issue**: CORS configuration is hardcoded in main.py

**Files Affected**:
- `pkms-backend/main.py`
- `pkms-backend/app/config.py`

**Solution**:
- [ ] **Move CORS to Config**: Add CORS settings to Settings class in config.py
- [ ] **Environment Variables**: Make CORS origins configurable via environment variables
- [ ] **Development vs Production**: Different CORS settings for different environments
- [ ] **Security Hardening**: Restrict CORS origins in production

**Example Implementation**:
```python
# In config.py
class Settings(BaseSettings):
    cors_origins: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173"
    ]
    cors_allow_credentials: bool = True
    cors_allow_methods: List[str] = ["*"]
    cors_allow_headers: List[str] = ["*"]

# In main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)
```

## Implementation Priority

### Phase 1 (Critical - Must Fix)
1. **Naming Convention Standardization** - Affects data consistency
2. **FTS5 Search Logic Consolidation** - Reduces code duplication
3. **Schema Mismatch Resolution** - Prevents runtime errors

### Phase 2 (Important - Should Fix)
4. **Missing API Endpoints** - Improves functionality
5. **Inconsistent Response Formats** - Improves API consistency
6. **Service Layer Organization** - Improves code maintainability

### Phase 3 (Nice to Have)
7. **Database Transactions for Search** - Improves performance
8. **CORS Configuration** - Improves security and flexibility

## Testing Strategy

For each refactoring task:
- [ ] **Unit Tests**: Test individual functions and classes
- [ ] **Integration Tests**: Test API endpoints
- [ ] **Frontend Tests**: Test TypeScript interfaces and API calls
- [ ] **End-to-End Tests**: Test complete user workflows
- [ ] **Performance Tests**: Ensure no performance regression

## Documentation Updates

For each completed refactoring:
- [ ] **Update API Documentation**: Update OpenAPI/Swagger docs
- [ ] **Update TypeScript Types**: Update frontend type definitions
- [ ] **Update README**: Document any breaking changes
- [ ] **Update Migration Guide**: Document migration steps for existing data

## Risk Assessment

### High Risk
- **Schema Mismatch Resolution**: Could break existing frontend functionality
- **Naming Convention Changes**: Could affect existing API consumers

### Medium Risk
- **FTS5 Consolidation**: Could affect search performance or functionality
- **Service Layer Reorganization**: Could introduce bugs during refactoring

### Low Risk
- **CORS Configuration**: Mostly configuration changes
- **Database Transactions**: Performance improvement, low risk of breaking changes

## Success Criteria

Each refactoring task is considered complete when:
- [ ] All tests pass
- [ ] No breaking changes for existing functionality
- [ ] Performance is maintained or improved
- [ ] Code is more maintainable and consistent
- [ ] Documentation is updated
- [ ] Code review is completed 