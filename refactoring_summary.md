### What Was Done:

1.  **Centralized Enums**: All status and type enums (`ProjectStatus`, `TodoStatus`, `UploadStatus`, `ChunkUploadStatus`, `ModuleType`) were consolidated into a single, new file: `app/models/enums.py`. All related files (models, routers, services, schemas) were refactored to import from this central location.
2.  **Data Integrity Enforcement**:
    *   Made `created_at` and `updated_at` timestamps non-nullable across all data models.
    *   Ensured all `status` columns are non-nullable.
3.  **Consistent Deletion Logic**:
    *   Refactored the `Project` and `Todo` deletion logic from a permanent **hard-delete** to a **soft-delete** (by setting the `is_deleted` flag). This makes the behavior consistent and preserves data history.
4.  **Robust Querying**:
    *   Updated all relevant queries (e.g., in `dashboard.py` and `todos.py`) to correctly filter out soft-deleted and archived items, ensuring lists and statistics are accurate.
5.  **Standardized Project Status**:
    *   Changed the default "active" status for Projects to `IS_RUNNING` for better clarity and consistency.
6.  **Documentation and Schema Sync**:
    *   Updated `ARCHITECTURAL_RULES.md` to include new rules for nullability and centralized enums.
    *   Synchronized the `tables_schema.sql` file to be in sync with all the data model changes.
7.  **Test Suite Fixes**: Corrected numerous `ImportError` issues in the test suite that were preventing it from running.

### What May Have Broken:

1.  **Frontend UI**: Any part of the frontend that relies on the exact string values for statuses will be broken. Specifically, the change of the project status from `"active"` to `"is_running"` is a **breaking API change** that will require a corresponding update in the UI code.
2.  **Outdated Tests**: While we fixed the errors that prevented the test suite from running, there are still two problematic test files (`test_runner.py` and `test_metadata_extraction.py`) that have errors and need to be fixed or removed. Other tests may also be logically outdated even if they run.
3.  **Unimplemented Features**: The `download_folder` functionality remains a `TODO` and has not been implemented.
