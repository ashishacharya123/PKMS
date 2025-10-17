"""
Todo and Project Management Router for PKMS
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete, func, case
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse, ProjectCreate, ProjectResponse, ProjectBadge
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from sqlalchemy.orm import selectinload
import logging
from pathlib import Path

from app.config import get_file_storage_dir

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.todo import Todo, TodoStatus
from app.models.project import Project
from app.models.tag import Tag
from app.models.user import User
from app.models.associations import todo_projects
from app.models.tag_associations import todo_tags, project_tags
from app.auth.dependencies import get_current_user
from app.services.tag_service import tag_service
from app.services.project_service import project_service
from app.services.search_service import search_service

# Priority constants for validation
VALID_PRIORITIES = [1, 2, 3, 4]  # 1=low, 2=medium, 3=high, 4=urgent


router = APIRouter()

# --- Stats Endpoints (placed before dynamic ID routes to avoid path conflicts) ---

@router.get("/stats/overview")
async def todos_stats_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Return high-level statistics for the current user's todos and projects."""
    # Total counts
    total_todos = (await db.execute(
        select(func.count(Todo.uuid)).where(Todo.created_by == current_user.uuid)
    )).scalar() or 0

    # Counts by status
    status_counts = (await db.execute(
        select(Todo.status, func.count(Todo.uuid))
        .where(Todo.created_by == current_user.uuid)
        .group_by(Todo.status)
    )).all()
    
    # Convert to dictionary with default values
    status_stats = {
        'pending': 0,
        'in_progress': 0,
        'blocked': 0,
        'done': 0,
        'cancelled': 0
    }
    for status, count in status_counts:
        key = getattr(status, "value", status)
        status_stats[key] = int(count)

    archived_count = (await db.execute(
        select(func.count(Todo.uuid)).where(and_(
            Todo.created_by == current_user.uuid,
            Todo.is_archived.is_(True)
        ))
    )).scalar() or 0

    # Overdue: due_date set, in the past, not done, not archived
    from datetime import date as _date_cls
    now_date = _date_cls.today()
    overdue_count = (await db.execute(
        select(func.count(Todo.uuid)).where(and_(
            Todo.created_by == current_user.uuid,
            Todo.status != 'done',
            Todo.is_archived.is_(False),
            Todo.due_date.is_not(None),
            Todo.due_date < now_date
        ))
    )).scalar() or 0

    # By priority
    by_priority_rows = (await db.execute(
        select(Todo.priority, func.count(Todo.uuid))
        .where(Todo.created_by == current_user.uuid)
        .group_by(Todo.priority)
    )).all()
    by_priority = {int(priority): int(count) for priority, count in by_priority_rows}

    # Projects summary
    total_projects = (await db.execute(
        select(func.count(Project.uuid)).where(Project.created_by == current_user.uuid)
    )).scalar() or 0

    archived_projects = (await db.execute(
        select(func.count(Project.uuid)).where(and_(
            Project.created_by == current_user.uuid,
            Project.is_archived.is_(True)
        ))
    )).scalar() or 0

    return {
        "status": "success",
        "todos": {
            "total": total_todos,
            "pending": status_stats['pending'],
            "in_progress": status_stats['in_progress'],
            "blocked": status_stats['blocked'],
            "done": status_stats['done'],
            "cancelled": status_stats['cancelled'],
            "archived": archived_count,
            "overdue": overdue_count,
            "by_priority": by_priority,
        },
        "projects": {
            "total": total_projects,
            "archived": archived_projects,
            "active": max(total_projects - archived_projects, 0),
        }
    }



# --- Helper Functions ---



async def _get_project_counts(db: AsyncSession, project_uuid: str) -> tuple[int, int]:
    """Get todo count and completed count for a project."""
    # Count todos via junction table
    total_count = (await db.execute(
        select(func.count(todo_projects.c.todo_uuid)).where(todo_projects.c.project_uuid == project_uuid)
    )).scalar() or 0
    
    completed_count = (await db.execute(
        select(func.count(todo_projects.c.todo_uuid))
        .join(Todo, Todo.uuid == todo_projects.c.todo_uuid)
        .where(and_(
            todo_projects.c.project_uuid == project_uuid,
            Todo.status == 'done'
        ))
    )).scalar() or 0
    
    return total_count, completed_count


def _convert_todo_to_response(todo: Todo, project_badges: Optional[List[ProjectBadge]] = None) -> TodoResponse:
    """Convert Todo model to TodoResponse with relational tags."""
    badges = project_badges or []
    return TodoResponse(
        uuid=todo.uuid,
        title=todo.title,
        description=todo.description,
        status=todo.status,
        is_archived=todo.is_archived,
        is_favorite=todo.is_favorite,
        is_exclusive_mode=todo.is_exclusive_mode,
        priority=todo.priority,
        # Project info now comes from junction table via project_service.build_badges
        order_index=todo.order_index,
        parent_uuid=todo.parent_uuid,
        subtasks=[_convert_todo_to_response(subtask, []) for subtask in (todo.subtasks or [])] if hasattr(todo, 'subtasks') and todo.subtasks else [],
        start_date=todo.start_date,
        due_date=todo.due_date,
        completed_at=todo.completed_at,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
        tags=[t.name for t in todo.tag_objs] if todo.tag_objs else [],
        projects=badges
    )



def _convert_project_to_response(project: Project, todo_count: int = 0, completed_count: int = 0) -> ProjectResponse:
    """Convert Project model to ProjectResponse with todo counts."""
    return ProjectResponse(
        uuid=project.uuid,
        name=project.name,
        description=project.description,
        color=project.color,
        is_archived=project.is_archived,
        tags=[t.name for t in project.tag_objs] if project.tag_objs else [],
        todo_count=todo_count,
        completed_count=completed_count
    )

# --- Todo Endpoints ---

@router.post("/", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new todo with tags and projects."""
    try:
        # SECURITY: Validate all input fields to prevent DoS and data corruption
        from app.utils.security import sanitize_text_input
        
        # Validate title length and content
        if not todo_data.title or len(todo_data.title.strip()) == 0:
            raise HTTPException(status_code=400, detail="Title is required")
        sanitized_title = sanitize_text_input(todo_data.title, 200)
        
        # Validate description length
        sanitized_description = sanitize_text_input(todo_data.description or "", 10000)
        
        # Validate priority
        if todo_data.priority not in VALID_PRIORITIES:
            raise HTTPException(status_code=400, detail=f"Invalid priority. Must be one of: {VALID_PRIORITIES}")
        
        # Validate status
        valid_statuses = ['pending', 'in_progress', 'blocked', 'done', 'cancelled']
        if todo_data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        todo = Todo(
            title=sanitized_title,
            description=sanitized_description,
            priority=todo_data.priority,
            status=todo_data.status,
            order_index=todo_data.order_index,
            start_date=todo_data.start_date,
            due_date=todo_data.due_date,
            is_exclusive_mode=todo_data.is_exclusive_mode or False,
            created_by=current_user.uuid,
            is_archived=todo_data.is_archived or False,
        )
        db.add(todo)
        await db.flush()

        if todo_data.tags:
            await tag_service.handle_tags(db, todo, todo_data.tags, current_user.uuid, "todos", todo_tags)

        # Handle projects
        if todo_data.project_ids:
            await project_service.handle_associations(db, todo, todo_data.project_ids, current_user.uuid, todo_projects, "todo_uuid")

        await db.commit()

        # Reload todo with tags and project to avoid lazy loading issues in response conversion
        result = await db.execute(
            select(Todo).options(
                selectinload(Todo.tag_objs),
                selectinload(Todo.projects)
            ).where(
                Todo.uuid == todo.uuid
            )
        )
        todo_with_tags = result.scalar_one()
        
        # Build project badges
        # Index in search and persist
        await search_service.index_item(db, todo_with_tags, 'todo')
        await db.commit()
        
        # Build project badges
        project_badges = await project_service.build_badges(db, todo_with_tags.uuid, todo_with_tags.is_exclusive_mode, todo_projects, "todo_uuid")
        
        return _convert_todo_to_response(todo_with_tags, project_badges)
    except Exception as e:
        await db.rollback()
        logger.exception("Error creating todo")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create todo: {str(e)}"
        )


@router.get("/", response_model=List[TodoResponse])
async def list_todos(
    status: Optional[str] = None,
    is_archived: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    priority: Optional[int] = None,
    due_date: Optional[date] = None,
    tag: Optional[str] = None,
    include_subtasks: Optional[bool] = True,  # New parameter to include subtasks
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List todos with filtering.
    
    Exclusive mode filtering:
    - Items with is_exclusive_mode=True are HIDDEN from main list (only in project dashboards)
    - Items with is_exclusive_mode=False are ALWAYS shown (linked mode)
    """
    query = select(Todo).options(
        selectinload(Todo.tag_objs),
        selectinload(Todo.projects)
    ).where(
        and_(
            Todo.created_by == current_user.uuid,
            Todo.is_exclusive_mode.is_(False),  # Only show linked (non-exclusive) items
            Todo.parent_uuid.is_(None)  # Never list subtasks standalone
        )
    )

    if status is not None:
        query = query.where(Todo.status == status)
    if is_archived is not None:
        query = query.where(Todo.is_archived == is_archived)
    if is_favorite is not None:
        query = query.where(Todo.is_favorite == is_favorite)
    if priority:
        query = query.where(Todo.priority == priority)  # Direct integer comparison
    if due_date:
        query = query.where(Todo.due_date == due_date)
    if tag:
        query = query.join(Todo.tag_objs).where(Tag.name == tag)
    
    # Only get top-level todos; when include_subtasks, we will populate children below
    # Order by order_index first (for Kanban), then priority, then creation date
    result = await db.execute(
        query.order_by(Todo.is_favorite.desc(), Todo.order_index, Todo.priority.desc(), Todo.created_at.desc())
    )
    todos = result.scalars().unique().all()
    
    if include_subtasks:
        # SECURITY: Fix N+1 query problem with batch loading
        todo_uuids = [todo.uuid for todo in todos]
        
        # Single query to load all subtasks for all todos
        subtasks_result = await db.execute(
            select(Todo).options(
                selectinload(Todo.tag_objs),
                selectinload(Todo.projects)
            ).where(and_(
                Todo.parent_uuid.in_(todo_uuids),
                Todo.created_by == current_user.uuid
            )).order_by(Todo.parent_uuid, Todo.order_index)
        )
        all_subtasks = subtasks_result.scalars().all()
        
        # Group subtasks by parent_uuid
        subtasks_by_parent = {}
        for subtask in all_subtasks:
            if subtask.parent_uuid not in subtasks_by_parent:
                subtasks_by_parent[subtask.parent_uuid] = []
            subtasks_by_parent[subtask.parent_uuid].append(subtask)
        
        # Assign subtasks to their parents
        todos_with_subtasks = []
        for todo in todos:
            todo.subtasks = subtasks_by_parent.get(todo.uuid, [])
            todos_with_subtasks.append(todo)
        
        # Build responses with project badges
        responses = []
        for todo in todos_with_subtasks:
            project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
            responses.append(_convert_todo_to_response(todo, project_badges))
        return responses
    else:
        # Build responses with project badges
        responses = []
        for todo in todos:
            project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
            responses.append(_convert_todo_to_response(todo, project_badges))
        return responses

# --- Project Endpoints (place before dynamic /{todo_id} routes to avoid conflicts) ---

@router.post("/projects/", response_model=ProjectResponse)
@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    payload = project_data.model_dump()
    tags = payload.pop("tags", []) or []
    
    # SECURITY: Validate color code to prevent XSS injection
    import re
    color = payload.get("color", "#3498db")
    if not re.match(r'^#[0-9a-fA-F]{6}$', color):
        raise HTTPException(status_code=400, detail="Invalid color format. Must be a valid hex color (e.g., #3498db)")
    
    payload["color"] = color
    project = Project(**payload, created_by=current_user.uuid)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    if tags:
        await tag_service.handle_tags(db, project, tags, current_user.uuid, "projects", project_tags)
    
    # Index in search and persist
    await search_service.index_item(db, project, 'project')
    await db.commit()
    
    return _convert_project_to_response(project, 0, 0)  # New project has 0 todos

@router.get("/projects/", response_model=List[ProjectResponse])
@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = None,
    tag: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).options(selectinload(Project.tag_objs)).where(Project.created_by == current_user.uuid)
    if archived is not None:
        query = query.where(Project.is_archived == archived)
    if tag:
        query = query.join(Project.tag_objs).where(Tag.name == tag)
    result = await db.execute(query)
    rows = result.scalars().unique().all()

    # Batch calculate counts for all projects in one query
    if not rows:
        return []
    project_uuids = [p.uuid for p in rows]

    counts_stmt = (
        select(
            todo_projects.c.project_uuid,
            func.count(Todo.uuid).label("total"),
            func.sum(case((Todo.status == TodoStatus.DONE, 1), else_=0)).label("completed")
        )
        .join(Todo, Todo.uuid == todo_projects.c.todo_uuid)
        .where(and_(todo_projects.c.project_uuid.in_(project_uuids), Todo.created_by == current_user.uuid))
        .group_by(todo_projects.c.project_uuid)
    )
    counts_result = await db.execute(counts_stmt)
    counts_map = {r.project_uuid: (r.total or 0, r.completed or 0) for r in counts_result}

    # Build responses from batch counts
    projects_with_counts = []
    for project in rows:
        total, completed = counts_map.get(project.uuid, (0, 0))
        projects_with_counts.append(_convert_project_to_response(project, total, completed))

    return projects_with_counts

@router.get("/projects/{project_uuid}", response_model=ProjectResponse)
async def get_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.uuid == project_uuid, Project.created_by == current_user.uuid))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    todo_count, completed_count = await _get_project_counts(db, project.uuid)
    return _convert_project_to_response(project, todo_count, completed_count)

@router.put("/projects/{project_uuid}", response_model=ProjectResponse)
async def update_project(
    project_uuid: str,
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.uuid == project_uuid, Project.created_by == current_user.uuid))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_payload = project_data.model_dump()
    tags = update_payload.pop("tags", None)
    
    # Validate color format if provided
    if "color" in update_payload:
        import re
        if not re.match(r'^#[0-9a-fA-F]{6}$', update_payload["color"] or ""):
            raise HTTPException(status_code=400, detail="Invalid color format. Must be a valid hex color (e.g., #3498db)")
    
    for key, value in update_payload.items():
        setattr(project, key, value)
    
    await db.commit()
    await db.refresh(project)
    if tags is not None:
        await tag_service.handle_tags(db, project, tags, current_user.uuid, "projects", project_tags)
    
    # Index in search and persist
    await search_service.index_item(db, project, 'project')
    await db.commit()
    
    todo_count, completed_count = await _get_project_counts(db, project.uuid)
    return _convert_project_to_response(project, todo_count, completed_count)

@router.delete("/projects/{project_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a project with multi-project support:
    - Snapshots project name in junction tables for linked items (preserved as 'deleted_ProjectName')
    - Hard deletes exclusive items (items with is_exclusive_mode=True)
    - Removes project (SET NULL in junction tables preserves linked items)
    """
    await project_service.delete_project(db, project_uuid, current_user.uuid)
    await db.commit()

@router.get("/{todo_uuid}", response_model=TodoResponse)
async def get_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo, project_badges)

@router.put("/{todo_uuid}", response_model=TodoResponse)
async def update_todo(
    todo_uuid: str,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    update_data = todo_data.model_dump(exclude_unset=True)
    
    if "tags" in update_data:
        await tag_service.handle_tags(db, todo, update_data.pop("tags"), current_user.uuid, "todos", todo_tags)

    # Handle projects if provided
    if "project_ids" in update_data:
        await project_service.handle_associations(db, todo, update_data.pop("project_ids"), current_user.uuid, todo_projects, "todo_uuid")

    for key, value in update_data.items():
        setattr(todo, key, value)
    
        
    # SECURITY: Ensure data integrity for status field
    if todo_data.status is not None:
        # Validate status first
        valid_statuses = ['pending', 'in_progress', 'blocked', 'done', 'cancelled']
        if todo_data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        
        todo.status = todo_data.status
        # Handle completed_at timestamp with timezone awareness
        if todo_data.status == 'done' and not todo.completed_at:
            from datetime import datetime, timezone
            todo.completed_at = datetime.now(timezone.utc)
        elif todo_data.status != 'done':
            todo.completed_at = None

    await db.commit()
    
    # Reload todo with tags and project to avoid lazy loading issues in response conversion
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(
            Todo.uuid == todo.uuid
        )
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    # Index in search and persist
    await search_service.index_item(db, todo_with_tags, 'todo')
    await db.commit()
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo_with_tags.uuid, todo_with_tags.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo_with_tags, project_badges)

@router.patch("/{todo_uuid}/archive", response_model=TodoResponse)
async def archive_todo(
    todo_uuid: str,
    archive: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    todo.is_archived = archive
    await db.commit()
    await db.refresh(todo)
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo.uuid, todo.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo, project_badges)

@router.delete("/{todo_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).options(selectinload(Todo.tag_objs)).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Decrement tag usage counts BEFORE deleting todo
    await tag_service.decrement_tags_on_delete(db, todo)

    # Remove from search index BEFORE deleting todo
    await search_service.remove_item(db, todo_uuid)
    
    await db.delete(todo)
    await db.commit()

@router.patch("/{todo_uuid}/status", response_model=TodoResponse)
async def update_todo_status(
    todo_uuid: str,
    status: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update todo status."""
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Validate status
    valid_statuses = ['pending', 'in_progress', 'blocked', 'done', 'cancelled']
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
    
    # Update status
    todo.status = status
    
    # SECURITY: Handle completed_at timestamp with timezone awareness
    if status == 'done' and not todo.completed_at:
        from datetime import datetime, timezone
        todo.completed_at = datetime.now(timezone.utc)  # Use timezone-aware datetime
    elif status != 'done':
        todo.completed_at = None
    
    await db.commit()
    await db.refresh(todo)
    
    # Reload with tags and project for response
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(Todo.uuid == todo.uuid)
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo_with_tags.uuid, todo_with_tags.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo_with_tags, project_badges)


@router.patch("/{todo_uuid}/reorder", response_model=TodoResponse)
async def reorder_todo(
    todo_uuid: str,
    order_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update todo order index for Kanban board positioning."""
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    todo.order_index = order_index
    await db.commit()
    await db.refresh(todo)
    
    # Reload with tags and project for response
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(Todo.uuid == todo.uuid)
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo_with_tags.uuid, todo_with_tags.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo_with_tags, project_badges)


@router.post("/{todo_uuid}/complete", response_model=TodoResponse)
async def complete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark todo as completed (legacy endpoint - now sets status to 'done')."""
    return await update_todo_status(todo_uuid, "done", current_user, db)

# --- End Project Endpoints ---

# --- Subtask Management Endpoints ---

@router.post("/{todo_uuid}/subtasks", response_model=TodoResponse)
async def create_subtask(
    todo_uuid: str,
    subtask_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a subtask for the specified todo."""
    # Verify parent todo exists and belongs to user
    parent_result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    parent_todo = parent_result.scalar_one_or_none()
    if not parent_todo:
        raise HTTPException(status_code=404, detail="Parent todo not found")
    
    # Create subtask
    subtask = Todo(
        title=subtask_data.title,
        description=subtask_data.description,
        status=subtask_data.status or "pending",
        priority=subtask_data.priority or 2,
        order_index=subtask_data.order_index or 0,
        start_date=subtask_data.start_date,
        due_date=subtask_data.due_date,
        parent_uuid=parent_todo.uuid,
        # Projects will be inherited via project associations
        created_by=current_user.uuid,
    )
    
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    
    # Index in search and persist
    await search_service.index_item(db, subtask, 'todo')
    await db.commit()

    # Reload with tags and project for response
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(Todo.uuid == subtask.uuid)
    )
    subtask_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await project_service.build_badges(db, subtask_with_tags.uuid, subtask_with_tags.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(subtask_with_tags, project_badges)


@router.get("/{todo_uuid}/subtasks", response_model=List[TodoResponse])
async def get_subtasks(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all subtasks for the specified todo."""
    # Verify parent todo exists and belongs to user
    parent_result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    parent_todo = parent_result.scalar_one_or_none()
    if not parent_todo:
        raise HTTPException(status_code=404, detail="Parent todo not found")
    
    # Get subtasks
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(and_(
            Todo.parent_uuid == parent_todo.uuid,
            Todo.created_by == current_user.uuid
        )).order_by(Todo.order_index)
    )
    subtasks = result.scalars().all()
    
    # Build project badges for each subtask
    responses = []
    for subtask in subtasks:
        project_badges = await project_service.build_badges(db, subtask.uuid, subtask.is_exclusive_mode, todo_projects, "todo_uuid")
        responses.append(_convert_todo_to_response(subtask, project_badges))
    
    return responses


@router.patch("/{todo_uuid}/move", response_model=TodoResponse)
async def move_subtask(
    todo_uuid: str,
    parent_uuid: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Move a subtask to a different parent or make it a top-level todo."""
    # Verify todo exists and belongs to user
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # If moving to a new parent, verify it exists and belongs to user
    if parent_uuid is not None:
        parent_result = await db.execute(
            select(Todo).where(and_(Todo.uuid == parent_uuid, Todo.created_by == current_user.uuid))
        )
        parent_todo = parent_result.scalar_one_or_none()
        if not parent_todo:
            raise HTTPException(status_code=404, detail="New parent todo not found")
        
        # Prevent circular references
        if parent_todo.uuid == todo.uuid:
            raise HTTPException(status_code=400, detail="Cannot make todo a subtask of itself")
        
        # SECURITY: Check for circular reference with depth limit to prevent DoS
        current_parent = parent_todo.uuid
        depth = 0
        max_depth = 50 # Prevent unbounded recursion
        
        while current_parent and depth < max_depth:
            if current_parent == todo.uuid:
                raise HTTPException(status_code=400, detail="Cannot create circular reference")
            parent_check = await db.execute(
                select(Todo.parent_uuid).where(Todo.uuid == current_parent)
            )
            current_parent = parent_check.scalar_one_or_none()
            depth += 1
        
        if depth >= max_depth:
            raise HTTPException(status_code=400, detail="Todo hierarchy too deep")
    
    # Update parent_id
    todo.parent_uuid = parent_todo.uuid if parent_uuid is not None else None
    
    # If moving to a new parent, inherit project associations
    if parent_uuid is not None:
        # Get parent's project associations and copy them to the subtask
        parent_projects_result = await db.execute(
            select(todo_projects.c.project_uuid).where(todo_projects.c.todo_uuid == parent_todo.uuid)
        )
        parent_project_uuids = [row[0] for row in parent_projects_result.fetchall()]
        
        if parent_project_uuids:
            await project_service.handle_associations(db, todo, parent_project_uuids, current_user.uuid, todo_projects, "todo_uuid")
    
    await db.commit()
    await db.refresh(todo)
    
    # Reload with tags and project for response
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.projects)
        ).where(Todo.uuid == todo.uuid)
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await project_service.build_badges(db, todo_with_tags.uuid, todo_with_tags.is_exclusive_mode, todo_projects, "todo_uuid")
    
    return _convert_todo_to_response(todo_with_tags, project_badges)


@router.patch("/{todo_uuid}/subtasks/reorder")
async def reorder_subtasks(
    todo_uuid: str,
    subtask_uuids: List[str],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Reorder subtasks for the specified todo."""
    # Verify parent todo exists and belongs to user
    parent_result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.created_by == current_user.uuid))
    )
    parent_todo = parent_result.scalar_one_or_none()
    if not parent_todo:
        raise HTTPException(status_code=404, detail="Parent todo not found")
    
    # Update order_index for each subtask
    for index, subtask_uuid in enumerate(subtask_uuids):
        subtask_result = await db.execute(
            select(Todo).where(and_(
                Todo.uuid == subtask_uuid,
                Todo.parent_uuid == parent_todo.uuid,
                Todo.created_by == current_user.uuid
            ))
        )
        subtask = subtask_result.scalar_one_or_none()
        if subtask:
            subtask.order_index = index
    
    await db.commit()
    return {"status": "success", "message": "Subtasks reordered successfully"}