## Overview
- Goal: make the app safer, cleaner, and compliant with architectural rules.
- What you’ll do: fix security issues, enforce JSON body camelCase, replace noisy logs, improve types, clean unused files, and add tests.
- How to work: follow each phase in order. After every change, run the checks.

## Prerequisites
1. Install frontend deps
   - In `pkms-frontend`: `npm install`
2. Install backend deps (dev)
   - In `pkms-backend`: create venv and install `requirements-dev.txt`
     - Windows PowerShell: `python -m venv .venv` → `.venv\Scripts\Activate.ps1` → `pip install -r requirements-dev.txt`
3. Recommended editors/tools
   - VS Code with ESLint, Prettier, Python, Ruff (if added), and PyLance.

## Phase 1: Fix Security (Sanitize HTML)
1. Search for `dangerouslySetInnerHTML` in the frontend.
   - Focus files:
     - `pkms-frontend/src/components/search/UnifiedSearch.tsx:166`
     - `pkms-frontend/src/pages/FuzzySearchPage.tsx:37–43, 527, 542` (already sanitized)
     - `pkms-frontend/src/services/keyboardShortcuts.ts:243` (uses `innerHTML`)
2. Implement sanitization in `UnifiedSearch.tsx`.
   - Add DOMPurify and allow only simple tags.
   - Snippet:
     ```ts
     import DOMPurify from 'dompurify'
     const safeHtml = DOMPurify.sanitize(htmlContent, { ALLOWED_TAGS: ['mark','strong'], ALLOWED_ATTR: ['style'] })
     <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
     ```
3. Make keyboard preview safe in `keyboardShortcuts.ts:243`.
   - Snippet:
     ```ts
     import DOMPurify from 'dompurify'
     content.innerHTML = DOMPurify.sanitize(html)
     ```
4. Verify
   - Run: `npm run dev`
   - Try typing HTML like `<img src=x onerror=alert(1)>` in search; it should not execute anything.

## Phase 2: Enforce JSON Body camelCase (Rule Compliance)
1. Find snake_case keys in request bodies.
   - Example violation:
     - `pkms-frontend/src/services/todosService.ts:344` uses `subtask_uuids`
2. Fix to camelCase for bodies, keep snake_case for query params.
   - Snippet:
     ```ts
     await api.patch(`/todos/${todoUuid}/subtasks`, { subtaskUuids: ids })
     ```
3. Backend aliasing check (informational)
   - Ensure Pydantic models accept camelCase via aliases (e.g., `CamelCaseModel`). If not present, align schemas later.
4. Verify
   - Use the UI where subtasks are updated; confirm it still works.

## Phase 3: Replace `console.log` with Project Logger
1. Use the environment-aware logger.
   - Logger file: `pkms-frontend/src/utils/logger.ts:8–13, 40–56`
2. Replace direct logs in pages/services.
   - Example refs: `NotesPage.tsx:80,82,88`, `DiaryPage.tsx:109,156,212`, `DashboardPage.tsx:285,301,307`, `TodosPage.tsx:70,72,85`, `services/dashboardService.ts` multiple lines.
3. Snippet
   ```ts
   import { logger } from '@/utils/logger'
   logger.info('message', data)
   ```
4. Alternative (quick guard)
   ```ts
   if (import.meta.env.MODE === 'development') console.log('message')
   ```
5. Verify
   - Run ESLint: `npm run lint`

## Phase 4: Improve Types & Reduce Duplication
1. Replace `any` types with domain types.
   - Example: `pkms-frontend/src/pages/NotesPage.tsx:56`
   - Snippet:
     ```ts
     import type { Note } from '@/types/note'
     const getNoteIcon = (note: Note): string => { /* logic */ }
     ```
2. Create typed normalizers to avoid repeating `response.data as any[]`.
   - Typical repeated sites: `unifiedFileService.ts:98,108,129,147,169,488`, `templateService.ts:46,82`
   - Example normalizer utility (new file `src/utils/normalizers.ts`):
     ```ts
     export type Todo = { uuid: string; title: string; status: string }
     export const normalizeTodos = (rows: unknown[]): Todo[] => {
       return (rows as any[]).map(r => ({ uuid: r.uuid, title: r.title, status: r.status }))
     }
     ```
3. Use generics in API helpers.
   - Snippet:
     ```ts
     const res = await api.get<Todo[]>('/todos')
     const todos = normalizeTodos(res.data)
     ```
4. Verify
   - Type-check: `npm run typecheck` (or `tsc --noEmit`)

## Phase 5: Backend Logging & Exceptions
1. Replace `print` with `logging` in scripts.
   - Files: `pkms-backend/scripts/delete_user.py`, `pkms-backend/scripts/test_runner.py`
   - Snippet:
     ```py
     import logging
     logging.basicConfig(level=logging.INFO)
     logger = logging.getLogger(__name__)
     logger.info("Deleting user %s", user_id)
     ```
2. Narrow broad exception handlers.
   - Examples: `app/routers/todos.py:168,187,205,224,242,260,318,343,364,384,404,465`, `app/routers/auth.py:337,701`, `app/services/search_service.py:103,133,276,313,368,386`
   - Snippet:
     ```py
     from sqlalchemy.exc import SQLAlchemyError
     from fastapi import HTTPException
     try:
         ...
     except SQLAlchemyError as e:
         logger.exception("DB error")
         raise HTTPException(status_code=500, detail="Database error")
     ```
3. Remove silent `pass` in error paths; log or handle.
   - Examples: `app/services/note_crud_service.py:42`, `app/services/todo_crud_service.py:38`, `app/services/unified_download_service.py:87`
4. Verify
   - Run script, observe logs; hit endpoints that previously swallowed errors; now they respond with clear messages.

## Phase 6: Python Linting (Add Configs)
1. If Ruff is preferred, add `pyproject.toml` with Ruff and mypy.
   - Snippet (config content):
     ```toml
     [tool.ruff]
     line-length = 100
     select = ["E","W","F","B","I","UP"]
     ignore = ["E501"]

     [tool.mypy]
     python_version = "3.11"
     warn_unused_ignores = true
     disallow_untyped_defs = true
     no_implicit_optional = true
     ```
2. Or add `setup.cfg` for flake8+mypy.
   - Snippet:
     ```ini
     [flake8]
     max-line-length = 100
     select = E,W,F,B

     [mypy]
     python_version = 3.11
     disallow_untyped_defs = True
     ```
3. Verify
   - Run: `ruff check pkms-backend` or `flake8 pkms-backend` and `mypy pkms-backend`

## Phase 7: Remove Dead Code
1. Delete legacy files not imported by routes.
   - `pkms-frontend/src/pages/DiaryPage_old.tsx`
   - `pkms-frontend/src/pages/TodosPageNew.tsx`
   - `pkms-frontend/src/__tests__/TodosPageNew.test.tsx`
2. Verify
   - Run app; confirm no compile errors and pages work.

## Phase 8: Tests (Unit + E2E)
1. Frontend unit test for sanitization (Vitest).
   - New test `src/__tests__/UnifiedSearch.sanitize.test.tsx`:
     ```ts
     import { render } from '@testing-library/react'
     import DOMPurify from 'dompurify'
     const html = '<img src=x onerror=alert(1)>'
     const safe = DOMPurify.sanitize(html)
     expect(safe).not.toMatch(/onerror|<script/)
     ```
2. Service casing test.
   - Assert request body keys are camelCase.
   - Example:
     ```ts
     const body = { subtaskUuids: ['a','b'] }
     expect(Object.keys(body)).toEqual(['subtaskUuids'])
     ```
3. E2E smoke for search and todos (Playwright or Cypress).
   - Visit pages, perform a search with risky input, and ensure no alerts.
4. Verify
   - Run: `npm run test`

## Phase 9: CI Guardrails
1. Frontend scripts
   - Add `lint`, `typecheck`, `test` scripts if missing; ensure `scripts.lint` is present.
2. Backend checks
   - Wire `ruff` or `flake8` and `mypy` into CI.
3. Optional pre-commit
   - Add hooks: `eslint`, `prettier`, `ruff`, `mypy`.

## Phase 10: Performance & Hygiene
1. Modularize `TodosPage` into subcomponents and hooks.
   - Extract list item, filters, bulk actions into separate components.
   - Use `React.memo`, `useMemo`, and stable keys like `item.uuid`.
2. Verify
   - Navigate and interact; confirm snappy UI and no extra re-renders.

## What To Check After Each Phase
- Frontend: `npm run lint`, `npm run test`, `npm run dev` and manual click-through.
- Backend: run linters (`ruff` or `flake8`), run scripts, and hit endpoints.
- Security: try injecting `<script>` or `onerror` attributes; they must be sanitized.

## Priority Order (Do These First)
1. Sanitize HTML in `UnifiedSearch.tsx` and `keyboardShortcuts.ts`.
2. Fix `subtask_uuids` to `subtaskUuids` in `todosService.ts:344`.
3. Replace `console.log` with `logger` across pages/services.
4. Narrow Python `except Exception` and remove `pass` in error paths.

## Deliverables (What Will Be Changed)
- Frontend: secure search rendering, camelCase bodies, typed normalizers, cleaner logs.
- Backend: consistent logging, specific exception handling, lint configs.
- Tests: unit tests for sanitization and casing; optional E2E smoke.
- Cleanup: unused pages/tests removed.

## Ready-To-Use Code Snippets (Copy/Paste)
- DOMPurify usage:
  ```ts
  import DOMPurify from 'dompurify'
  const safeHtml = DOMPurify.sanitize(htmlContent, { ALLOWED_TAGS: ['mark','strong'], ALLOWED_ATTR: ['style'] })
  <div dangerouslySetInnerHTML={{ __html: safeHtml }} />
  ```
- Keyboard preview:
  ```ts
  import DOMPurify from 'dompurify'
  content.innerHTML = DOMPurify.sanitize(html)
  ```
- CamelCase body:
  ```ts
  await api.patch(`/todos/${todoUuid}/subtasks`, { subtaskUuids: ids })
  ```
- Logger:
  ```ts
  import { logger } from '@/utils/logger'
  logger.info('message', data)
  ```
- Python logging:
  ```py
  import logging
  logging.basicConfig(level=logging.INFO)
  logger = logging.getLogger(__name__)
  logger.info("Deleting user %s", user_id)
  ```
- Python exception handling:
  ```py
  from sqlalchemy.exc import SQLAlchemyError
  from fastapi import HTTPException
  try:
      ...
  except SQLAlchemyError as e:
      logger.exception("DB error")
      raise HTTPException(status_code=500, detail="Database error")
  ```

If you approve, I’ll start implementing this plan phase by phase and verify each step with linting, tests, and manual checks.