# DRY Refactoring – Plan, Progress, and Decisions

This document tracks the comprehensive DRY refactoring across PKMS. It captures the goals, decisions, and incremental progress so far.

## Goals
- Eliminate duplicated patterns across frontend and backend
- Standardize error handling, data loading, CRUD logic, and file transformations
- Improve maintainability and reduce code size ~40–60% in affected areas

## Scope (10 Patterns)
1) Frontend custom hooks
- useDataLoader, useErrorHandler, useForm, useModal

2) Frontend shared components
- LoadingState, ErrorState

3) Frontend BaseService
- Cache-first helpers, API helpers, cache invalidation

4) Backend API error decorator
- @handle_api_errors for consistent logging and responses

5) Backend BaseCRUDService
- Generic CRUD with soft-delete and search hooks

6) Frontend file transformers
- transformFilesToUnifiedItems + module helpers

7) Backend content document service
- Unified encrypted/unencrypted content management

8) Generic ContentViewerPage (frontend)
- Consolidate NoteViewPage/DiaryViewPage patterns

9) Service migrations (frontend)
- Adopt BaseService in dashboard/notes/diary/todos/etc.

10) Router and page migrations
- Apply decorators, hooks, shared components across modules

## What’s Implemented (batch 1)
- Frontend
  - hooks: useDataLoader, useErrorHandler, useForm, useModal
  - components: LoadingState, ErrorState
  - services: BaseService
  - utils: fileTransformers (transformFilesToUnifiedItems, transformDiaryFiles, transformNoteFiles, transformDocumentFiles)
  - migrations:
    - NoteEditorPage.tsx → uses transformNoteFiles
    - DiaryViewPage.tsx → uses transformDiaryFiles

- Backend
  - decorators/error_handler.py → @handle_api_errors
  - services/base_crud_service.py → generic CRUD base
  - services/content_document_service.py → unified content doc management
  - migrations:
    - routers/notes.py → endpoints annotated with @handle_api_errors; removed duplicate try/except in places where safe

## Next Steps (batch 2)
- Apply @handle_api_errors to remaining routers (diary, documents, todos, projects, archive)
- Replace ad-hoc loaders with useDataLoader and LoadingState/ErrorState across pages/components
- Begin BaseService adoption in frontend services (dashboard, notes, diary)
- Introduce ContentViewerPage and refactor NoteViewPage/DiaryViewPage to it
- Consider refactoring diary content-doc flows to content_document_service where applicable

## Progress Update (batch 2)
- Frontend
  - Added `components/common/ContentViewerPage.tsx` and migrated `NoteViewPage.tsx` to use it
  - Replaced dashboard loading skeleton block with `LoadingState` and added `ErrorState` import scaffolding
  - Unified file URL for `UnifiedFileList` image viewer with `unifiedFileService.getDownloadUrl`
  - DiaryViewPage: swapped ad-hoc loading/error UI for `LoadingState`/`ErrorState` (kept decryption inline)
  - ProjectsPage: added `LoadingState`/`ErrorState` for initial load; preserved existing UI & logic

- Backend
  - Applied `@handle_api_errors` to key `diary.py` CRUD endpoints (create, list, list_deleted, get_by_date, get_by_id, update, delete, restore, hard_delete)
  - Applied `@handle_api_errors` to `documents.py` endpoints (commit upload, list, list_deleted, get, update, delete, restore, hard delete, download)
  - Applied `@handle_api_errors` to `todos.py` endpoints (create, list, list_deleted, get, update, delete, restore, hard delete, status, complete)
  - Applied `@handle_api_errors` to `projects.py` endpoints (reserve, create, list, list_deleted, get, update, delete, restore, hard delete, duplicate, summaries, items, reorder)
  - Applied `@handle_api_errors` to `archive.py` endpoints (folders CRUD, items CRUD, search, upload/commit, downloads)
  - Applied `@handle_api_errors` to `search.py` (unified search, reindex) and `tags.py` (autocomplete)

## Design Notes
- Decorator preserves existing HTTPException semantics; only standardizes unexpected exceptions
- BaseCRUDService aims for minimal intrusion; services can override or extend where needed
- File transformers centralize mapping to UnifiedFileItem for consistency and future evolution

## Risk & Rollback
- Router decorator: low risk; change is additive and preserves HTTPException flow
- CRUD base: medium risk; migrate service-by-service with tests
- UI hook migrations: medium risk; migrate page-by-page and verify visually

## Changelog (by GPT-5)
- Added: src/hooks (4), src/components/common/LoadingState, ErrorState
- Added: src/services/BaseService.ts, src/utils/fileTransformers.ts
- Added: app/decorators/error_handler.py, app/services/base_crud_service.py, app/services/content_document_service.py
- Updated: pkms-frontend/src/pages/NoteEditorPage.tsx → transformNoteFiles
- Updated: pkms-frontend/src/pages/DiaryViewPage.tsx → transformDiaryFiles
- Updated: pkms-backend/app/routers/notes.py → apply @handle_api_errors

## Appendix: Critical Usage Examples
Backend decorator usage:
```python
from app.decorators.error_handler import handle_api_errors

@router.post("/")
@handle_api_errors("create note")
async def create_note(note_data: NoteCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
  return await note_crud_service.create_note(db, current_user.uuid, note_data)
```

File transformers:
```ts
import { transformNoteFiles } from '../utils/fileTransformers';
const files = await notesService.getNoteFiles(id);
setNoteFiles(transformNoteFiles(files, id));
```
