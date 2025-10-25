# Todo System - Complete Implementation Guide

## Feature Matrix

| Feature | Status | Frontend Files | Backend Files | Endpoints |
|---------|--------|---------------|---------------|-----------|
| Basic CRUD | ✅ Working | todosService.ts | todos.py, todo_crud_service.py | POST/GET/PUT/DELETE /todos |
| Subtasks | ⚠️ Partial | SubtaskList.tsx, todosService.ts | todos.py (model only) | Missing dedicated endpoints |
| Dependencies | ✅ Working | TodoDependencyManager.tsx | todo_dependency_service.py | GET/POST/DELETE /todos/{uuid}/dependencies |
| Reordering | ✅ Working | todosService.ts | todos.py | PATCH /todos/{uuid}/reorder |
| Kanban View | ✅ Working | KanbanBoard.tsx | todos.py | GET /todos |
| Timeline View | ✅ Working | TimelineView.tsx | todos.py | GET /todos |
| Calendar View | ✅ Working | CalendarView.tsx | todos.py | GET /todos |

---

## 1. Basic CRUD Operations

### ✅ Create Todo
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 29-46
- Function: `createTodo(todoData: TodoCreate): Promise<Todo>`
- JSON Body (camelCase): `{ title, description, status, priority, dueDate, projectUuids, areProjectsExclusive }`

**Backend**: `pkms-backend/app/routers/todos.py` Line 28-45
- Endpoint: `POST /todos`
- Service: `todo_crud_service.py` Line 43-99

### ✅ Get Todo
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 48-51
- Function: `getTodo(todoUuid: string): Promise<Todo>`

**Backend**: `pkms-backend/app/routers/todos.py` Line 78-95
- Endpoint: `GET /todos/{todo_uuid}`
- Returns: `TodoResponse` with subtasks, blockedByTodos, blockingTodos

### ✅ Update Todo
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 53-57
- Function: `updateTodo(todoUuid: string, todoData: TodoUpdate): Promise<Todo>`
- JSON Body (camelCase): `{ title, description, priority, dueDate, tags }`

**Backend**: `pkms-backend/app/routers/todos.py` Line 98-116
- Endpoint: `PUT /todos/{todo_uuid}`

### ✅ Delete Todo (Soft)
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 136-139
- Function: `deleteTodo(todoUuid: string): Promise<void>`

**Backend**: `pkms-backend/app/routers/todos.py` Line 118-136
- Endpoint: `DELETE /todos/{todo_uuid}`
- Sets `is_deleted = True` (soft delete)

### ✅ List Todos
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 85-107
- Function: `getTodos(params: TodoListParams): Promise<TodoSummary[]>`
- URL Params (snake_case): `status, priority, project_id, is_archived, is_favorite, start_date, end_date, search, sort_by, sort_order, page, limit`

**Backend**: `pkms-backend/app/routers/todos.py` Line 47-76
- Endpoint: `GET /todos`
- URL Params (snake_case): `todo_status, priority, project_uuid, is_favorite, is_archived, due_date_from, due_date_to, search, limit, offset`

---

## 2. Subtasks

### ⚠️ Create Subtask (Workaround)
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 312-318
- Function: `createSubtask(parentUuid: string, subtaskData): Promise<Todo>`
- **Current**: Calls `POST /todos` with `parentUuid` in JSON body (camelCase)
- **Ideal**: Should call `POST /todos/{parentUuid}/subtasks` (MISSING)

**Backend**: Uses main create endpoint
- Endpoint: `POST /todos`
- JSON Body accepts `parentUuid` (camelCase, converted to `parent_uuid`)

### ⚠️ Get Subtasks (Workaround)
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 320-324
- Function: `getSubtasks(parentUuid: string): Promise<Todo[]>`
- **Current**: Calls `GET /todos?limit=100`, filters client-side
- **Ideal**: Should call `GET /todos/{parentUuid}/subtasks` (MISSING)

### ⚠️ Move Subtask (Workaround)
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 326-332
- Function: `moveSubtask(subtaskUuid: string, newParentUuid: string | null): Promise<Todo>`
- **Current**: Calls `PUT /todos/{subtaskUuid}` with `parentUuid` in JSON body (camelCase)
- **Ideal**: Should call `PATCH /todos/{subtaskUuid}/move` (MISSING)

### ✅ Reorder Subtasks (Working)
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 334-341
- Function: `reorderSubtasks(parentUuid: string, subtaskUuids: string[]): Promise<void>`
- Calls: `PATCH /todos/{parentUuid}/subtasks/reorder`
- JSON Body (camelCase): `{ subtaskUuids: string[] }`

**Backend**: `pkms-backend/app/routers/todos.py` Line 433-492
- Endpoint: `PATCH /todos/{parent_uuid}/subtasks/reorder`
- Uses `todos.order_index` field for subtask ordering
- Validates parent ownership and subtask relationships

### ✅ Subtask UI
**Component**: `pkms-frontend/src/components/todos/SubtaskList.tsx`
- Collapsible list with progress indicator (Line 80)
- Drag-and-drop reordering (Lines 33-65)
- Inline actions: checkbox, edit, delete (Lines 113-166)
- Priority badges (Lines 130-141)

**Used By**:
- `TodoCard.tsx` Line 207
- `TodosLayout.tsx` Line 167
- `KanbanBoard.tsx` Line 439

---

## 3. Dependencies/Blocking

### ✅ Add Dependency
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 248-251
- Function: `addDependency(todoUuid: string, blockerUuid: string): Promise<void>`

**Backend**: `pkms-backend/app/routers/todos.py` Line 349-370
- Endpoint: `POST /todos/{todo_uuid}/dependencies/{blocker_uuid}`
- Service: `todo_dependency_service.py`

### ✅ Remove Dependency
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 256-259
- Function: `removeDependency(todoUuid: string, blockerUuid: string): Promise<void>`

**Backend**: `pkms-backend/app/routers/todos.py` Line 372-391
- Endpoint: `DELETE /todos/{todo_uuid}/dependencies/{blocker_uuid}`

### ✅ Get Blocking Todos
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 264-267
- Function: `getBlockingTodos(todoUuid: string): Promise<BlockingTodoSummary[]>`
- Returns: Todos blocked by this one

**Backend**: `pkms-backend/app/routers/todos.py` Line 393-410
- Endpoint: `GET /todos/{todo_uuid}/blocking`
- JSON Response (camelCase): `{ blocking_todos: [...] }` → `{ blockingTodos: [...] }`

### ✅ Get Blocked By Todos
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 272-275
- Function: `getBlockedByTodos(todoUuid: string): Promise<BlockingTodoSummary[]>`
- Returns: Todos blocking this one

**Backend**: `pkms-backend/app/routers/todos.py` Line 413-430
- Endpoint: `GET /todos/{todo_uuid}/blocked-by`
- JSON Response (camelCase): `{ blocked_by_todos: [...] }` → `{ blockedByTodos: [...] }`

### ✅ Dependency Manager UI
**Component**: `pkms-frontend/src/components/todos/TodoDependencyManager.tsx`
- Full UI for managing dependencies (295 lines)
- Add/remove blockers (Lines 72-96)
- Visual display of blocking relationships (Lines 165-222)

**Display in Card**: `TodoCard.tsx` Lines 172-188
- Shows "Blocked by X todos" badge
- Shows "Blocking Y todos" badge

---

## 4. Status Management

### ✅ Update Status
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 125-129
- Function: `updateTodoStatus(todoUuid: string, status: TodoStatus): Promise<Todo>`
- URL Param (snake_case): `status={status}`

**Backend**: `pkms-backend/app/routers/todos.py` Line 138-156
- Endpoint: `PATCH /todos/{todo_uuid}/status?status={status}`
- URL Param (snake_case): `status`

### ✅ Complete Todo
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 115-119
- Function: `completeTodo(todoUuid: string): Promise<Todo>`

**Backend**: `pkms-backend/app/routers/todos.py` Line 158-176
- Endpoint: `POST /todos/{todo_uuid}/complete`

**Status Enum**: PENDING, IN_PROGRESS, BLOCKED, DONE, CANCELLED

---

## 5. Reordering

### ✅ Reorder Todo
**Frontend**: `pkms-frontend/src/services/todosService.ts` Line 130-134
- Function: `reorderTodo(todoUuid: string, orderIndex: number): Promise<Todo>`
- URL Param (snake_case): `order_index={index}`

**Backend**: `pkms-backend/app/routers/todos.py`
- Endpoint: `PATCH /todos/{todo_uuid}/reorder?order_index={index}`
- URL Param (snake_case): `order_index`

---

## 6. Workflow Endpoints

### ✅ Get Overdue Todos
**Backend**: `pkms-backend/app/routers/todos.py` Line 178-195
- Endpoint: `GET /todos/workflow/overdue?days_overdue={days}`
- URL Param (snake_case): `days_overdue`

### ✅ Get Upcoming Todos
**Backend**: `pkms-backend/app/routers/todos.py` Line 197-214
- Endpoint: `GET /todos/workflow/upcoming?days_ahead={days}`
- URL Param (snake_case): `days_ahead`

### ✅ Get High Priority Todos
**Backend**: `pkms-backend/app/routers/todos.py` Line 216-232
- Endpoint: `GET /todos/workflow/high-priority`

### ✅ Completion Analytics
**Backend**: `pkms-backend/app/routers/todos.py` Line 234-251
- Endpoint: `GET /todos/workflow/analytics/completion?days={days}`
- URL Param (snake_case): `days`

---

## 7. Views

### ✅ List View
**Component**: `pkms-frontend/src/components/todos/TodoList.tsx`
- Renders todos in list format
- Pagination support

### ✅ Kanban Board
**Component**: `pkms-frontend/src/components/todos/KanbanBoard.tsx`
- Drag-and-drop between status lanes
- Status lanes: PENDING, IN_PROGRESS, BLOCKED, DONE
- Subtask support (Lines 437-456)

### ✅ Calendar View
**Component**: `pkms-frontend/src/components/todos/CalendarView.tsx`
- Shows todos by due date
- Month/week/day views

### ✅ Timeline View
**Component**: `pkms-frontend/src/components/todos/TimelineView.tsx`
- Gantt-style timeline
- Shows start_date to due_date

---

## Schema Reference

### Todo Model (Backend)
**File**: `pkms-backend/app/models/todo.py`

Fields:
- `uuid` (PK)
- `title`, `description`
- `status` (TodoStatus enum)
- `priority` (TaskPriority enum: LOW, MEDIUM, HIGH, URGENT)
- `parent_uuid` (FK to todos.uuid) - For subtasks
- `created_by`, `created_at`, `updated_at`
- `is_archived`, `is_favorite`, `is_deleted`
- `due_date`, `start_date`
- `type` (TASK, CHECKLIST, SUBTASK)

Relationships:
- `subtasks = relationship("Todo", backref="parent")` (Line 98)
- `blocked_by` via `todo_dependencies` table
- `blocking` via `todo_dependencies` table

### TodoResponse Schema (Backend)
**File**: `pkms-backend/app/schemas/todo.py`

Includes all model fields PLUS:
- `subtasks: List[TodoResponse]` (nested)
- `blockedByTodos: List[BlockingTodoSummary]`
- `blockingTodos: List[BlockingTodoSummary]`
- `projectUuid`, `projectName` (if linked)
- `tags: List[str]`

**Naming Convention**: Backend uses CamelCaseModel, converts snake_case to camelCase in JSON

---

## Missing Features

### ✅ Soft Delete (Fixed)
- Uses soft delete (`is_deleted = True`) - **FIXED**
- No permanent deletion endpoint
- Soft-deleted todos stay in database forever
- **TODO**: Add preflight checks for dependencies and project associations
- **TODO**: Add file cleanup for associated documents

### ✅ Subtask Sort Order (Fixed)
- Uses `todos.order_index` field for subtask ordering - **FIXED**
- Backend endpoint: `PATCH /todos/{parentUuid}/subtasks/reorder`
- Drag-drop UI works with backend

---

## Common Pitfalls

1. **URL Params**: Always snake_case (e.g., `due_date_from`, `is_archived`)
2. **JSON Body**: Always camelCase (e.g., `dueDate`, `isArchived`)
3. **Subtask Endpoints**: Don't exist yet, use workarounds
4. **Priority**: Always included in responses, no separate fetch needed
5. **Soft Delete**: Deleted todos stay in database, filtered by `is_deleted.is_(False)`

