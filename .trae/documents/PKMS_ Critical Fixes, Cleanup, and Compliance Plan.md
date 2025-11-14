## Goal
Deliver 10 precise improvements with exact files/lines, copy‑paste code, and simple verification steps.

## 1) Sanitize HTML in Unified Search
- Where: `pkms-frontend/src/components/search/UnifiedSearch.tsx:166`
- Issue: uses `dangerouslySetInnerHTML` with untrusted HTML.
- Fix:
```ts
import DOMPurify from 'dompurify'
const safeHtml = DOMPurify.sanitize(htmlContent, { ALLOWED_TAGS: ['mark','strong'], ALLOWED_ATTR: ['style'] })
<div dangerouslySetInnerHTML={{ __html: safeHtml }} />
```
- Verify: `npm run dev` → search for `<img src=x onerror=alert(1)>` → no alert.

## 2) Use camelCase in todos body
- Where: `pkms-frontend/src/services/todosService.ts:344`
- Issue: sends `subtask_uuids` (snake_case) in JSON body; bodies must be camelCase.
- Fix:
```ts
await api.patch(`/todos/${todoUuid}/subtasks`, { subtaskUuids: ids })
```
- Verify: update a todo’s subtasks in UI; request body key should be `subtaskUuids`.

## 3) Sanitize keyboard preview HTML
- Where: `pkms-frontend/src/services/keyboardShortcuts.ts:243`
- Issue: sets `innerHTML` with a TODO to make safe.
- Fix:
```ts
import DOMPurify from 'dompurify'
content.innerHTML = DOMPurify.sanitize(html)
```
- Verify: paste HTML with `<script>` or `onerror` into the preview → nothing executes.

## 4) Replace noisy logs with project logger
- Where (example): `pkms-frontend/src/pages/DashboardPage.tsx:285,301,307`
- Issue: direct `console.log` without env guards.
- Fix:
```ts
import { logger } from '@/utils/logger'
logger.info('Loading dashboard widgets', data)
```
- Verify: `npm run lint` passes; logs are structured and respect env.

## 5) Type getNoteIcon properly
- Where: `pkms-frontend/src/pages/NotesPage.tsx:56`
- Issue: `note: any` loses type safety.
- Fix:
```ts
import type { Note } from '@/types/note'
const getNoteIcon = (note: Note): string => { /* existing logic */ }
```
- Verify: `tsc --noEmit` passes; consumers see typed hints.

## 6) Add typed normalizers (cut "any[]" repeats)
- Where (examples): `pkms-frontend/src/services/unifiedFileService.ts:98,108,129,147,169,488`; `templateService.ts:46,82`
- Issue: repeated `(response.data as any[])` and manual mapping.
- Fix (new util): `pkms-frontend/src/utils/normalizers.ts`
```ts
export type Todo = { uuid: string; title: string; status: string }
export const normalizeTodos = (rows: unknown[]): Todo[] => {
  return (rows as any[]).map(r => ({ uuid: r.uuid, title: r.title, status: r.status }))
}
```
- Use generics in services:
```ts
const res = await api.get<Todo[]>('/todos')
const todos = normalizeTodos(res.data)
```
- Verify: `tsc --noEmit` and `npm run lint` pass; fewer `any` casts.

## 7) Use Vite env correctly
- Where: `pkms-frontend/src/services/BaseService.ts:97,107,117,142,152,162`
- Issue: Vite apps should prefer `import.meta.env.MODE` over `process.env.NODE_ENV`.
- Fix:
```ts
if (import.meta.env.MODE === 'development') { /* dev-only behavior */ }
```
- Verify: run dev and build, confirm branch logic still works.

## 8) Narrow exception handling in todos router
- Where (example group): `pkms-backend/app/routers/todos.py:168,187,205,224,242,260,318,343,364,384,404,465`
- Issue: broad `except Exception:` hides real errors.
- Fix (pattern):
```py
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
try:
    ...
except SQLAlchemyError as e:
    logger.exception("DB error")
    raise HTTPException(status_code=500, detail="Database error")
```
- Verify: trigger a DB failure; API should return 500 with logged details.

## 9) Use logging in delete_user script
- Where: `pkms-backend/scripts/delete_user.py:88,92,98,148,180,188,199,206–248`
- Issue: lots of `print(...)` in a script; use `logging` for consistency.
- Fix:
```py
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logger.info("Deleting user %s", user_id)
```
- Verify: run script; see timestamped log lines instead of bare prints.

## 10) Avoid silent pass in file locks
- Where: `pkms-backend/app/services/file_locks.py:33,54,64,80`
- Issue: `pass` in error/control paths makes bugs invisible.
- Fix (pattern):
```py
try:
    ...
except SomeLockError as e:
    logger.warning("Lock issue: %s", e)
    raise
```
- Verify: simulate lock errors; observe warnings and proper exception flow.

## Final Checks
- Frontend: `npm run lint`, `tsc --noEmit`, `npm run test`, manual UI checks.
- Backend: set up `ruff` or `flake8 + mypy`; run; hit endpoints and scripts.

Approve this and I will implement each fix with verifications.