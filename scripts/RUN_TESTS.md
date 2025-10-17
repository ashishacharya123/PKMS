# Running Backend Tests (PKMS)

You can run the backend pytest suites locally via PowerShell or cmd using provided scripts.

## Prerequisites
- Python virtualenv created in `pkms-backend/venv`
- Install dev dependencies:
  ```powershell
  pkms-backend/venv/Scripts/python -m pip install -r pkms-backend/requirements-dev.txt
  ```

## Run All Backend Tests
- PowerShell:
  ```powershell
  scripts/run-backend-tests.ps1
  ```
- cmd:
  ```bat
  scripts\run-backend-tests.bat
  ```

## Run Specific Test Files
- PowerShell pattern (relative to `pkms-backend/tests`):
  ```powershell
  scripts/run-backend-tests.ps1 test_search_unified.py
  scripts/run-backend-tests.ps1 "test_chunk_commit.py"
  ```
- cmd:
  ```bat
  scripts\run-backend-tests.bat test_search_unified.py
  scripts\run-backend-tests.bat test_chunk_commit.py
  ```

## Run Selective Tests
For more granular test selection, use pytest's `-k` option with expressions. File paths are relative to `pkms-backend/tests`.

Examples:
- Run tests matching pattern:
  ```powershell
  pkms-backend/venv/Scripts/python -m pytest -q -k "unified and not slow"
  ```
- Run specific test function:
  ```powershell
  pkms-backend/venv/Scripts/python -m pytest -q -k "test_unified_search"
  ```
- Run tests with "search" in name (note quoting for patterns with spaces):
  ```powershell
  pkms-backend/venv/Scripts/python -m pytest -q -k "search"
  ```

## Notable Test Suites
- `tests/test_search_unified.py`: Unified FTS search (item_types, has_attachments, order, offset/limit)
- `tests/test_chunk_commit.py`: Chunk commit with real temp files; asserts DB row + file move + FTS persisted
- `tests/test_todos_aggregates.py`: Project aggregates (total/completed) via grouped query
- `tests/test_legacy_guards.py`: Guards against legacy fields and patterns

## Notes
- The in-memory test DB bootstraps an FTS5 table (`fts_content`) for search tests.
- Chunk commit tests create temporary files under `pkms-backend/PKMS_Data/temp_uploads`.
- These tests run outside the app UI; they validate API and persistence layers directly.
