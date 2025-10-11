"""
Todo and Project Management Router for PKMS
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete, func
from app.schemas.todo import TodoCreate, TodoUpdate, TodoResponse, ProjectCreate, ProjectResponse, ProjectBadge
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from sqlalchemy.orm import selectinload
import logging

logger = logging.getLogger(__name__)

from app.database import get_db
from app.models.todo import Todo, Project
from app.models.tag import Tag
from app.models.user import User
from app.models.associations import todo_projects
from app.auth.dependencies import get_current_user

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
        select(func.count(Todo.id)).where(Todo.user_id == current_user.id)
    )).scalar() or 0

    # Counts by status
    status_counts = (await db.execute(
        select(Todo.status, func.count(Todo.id))
        .where(Todo.user_id == current_user.id)
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
        status_stats[status] = count

    archived_count = (await db.execute(
        select(func.count(Todo.id)).where(and_(
            Todo.user_id == current_user.id,
            Todo.is_archived.is_(True)
        ))
    )).scalar() or 0

    # Overdue: due_date set, in the past, not done, not archived
    from datetime import date as _date_cls
    now_date = _date_cls.today()
    overdue_count = (await db.execute(
        select(func.count(Todo.id)).where(and_(
            Todo.user_id == current_user.id,
            Todo.status != 'done',
            Todo.is_archived.is_(False),
            Todo.due_date.is_not(None),
            Todo.due_date < now_date
        ))
    )).scalar() or 0

    # By priority
    by_priority_rows = (await db.execute(
        select(Todo.priority, func.count(Todo.id))
        .where(Todo.user_id == current_user.id)
        .group_by(Todo.priority)
    )).all()
    by_priority = {int(priority): int(count) for priority, count in by_priority_rows}

    # Projects summary
    total_projects = (await db.execute(
        select(func.count(Project.id)).where(Project.user_id == current_user.id)
    )).scalar() or 0

    archived_projects = (await db.execute(
        select(func.count(Project.id)).where(and_(
            Project.user_id == current_user.id,
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


        
from sqlalchemy.orm import selectinload

# --- Helper Functions ---

async def _handle_todo_tags(db: AsyncSession, todo: Todo, tag_names: List[str], user_id: int):
    """Synchronise todo.tag_objs with the provided tag names."""
    if not tag_names:
        todo.tag_objs = []
        await db.commit()
        await db.refresh(todo)
        return

    clean_names = {t.strip() for t in tag_names if t and t.strip()}

    # Fetch existing tags for this user and module type
    existing_tags = (
        await db.execute(
            select(Tag).where(and_(
                Tag.user_id == user_id, 
                Tag.name.in_(clean_names),
                Tag.module_type == "todos"
            ))
        )
    ).scalars().all()
    existing_map = {t.name: t for t in existing_tags}

    tag_objs: List[Tag] = []
    for name in clean_names:
        tag_obj = existing_map.get(name)
        if not tag_obj:
            tag_obj = Tag(
                name=name, 
                user_id=user_id,
                module_type="todos",
                usage_count=1,
                color="#ef4444"  # Red color for todo tags
            )
            db.add(tag_obj)
            await db.flush()
        else:
            # Increment usage count for existing tag
            tag_obj.usage_count += 1
        tag_objs.append(tag_obj)

    todo.tag_objs = tag_objs
    await db.commit()
    await db.refresh(todo)


async def _get_project_counts(db: AsyncSession, project_id: int) -> tuple[int, int]:
    """Get todo count and completed count for a project."""
    total_count = (await db.execute(
        select(func.count(Todo.id)).where(Todo.project_id == project_id)
    )).scalar() or 0
    
    completed_count = (await db.execute(
        select(func.count(Todo.id)).where(and_(
            Todo.project_id == project_id,
            Todo.is_completed.is_(True)
        ))
    )).scalar() or 0
    
    return total_count, completed_count


async def _handle_todo_projects(db: AsyncSession, todo: Todo, project_ids: List[int], user_id: int):
    """Link todo to projects via junction table.
    
    Verifies user owns all requested projects before linking.
    """
    # SECURITY: Verify user owns all requested projects before clearing existing links
    if project_ids:
        result = await db.execute(
            select(Project.id).where(
                and_(
                    Project.id.in_(project_ids),
                    Project.user_id == user_id
                )
            )
        )
        owned_project_ids = {row[0] for row in result.fetchall()}
        
        # Check if any requested project IDs are not owned by user
        invalid_ids = set(project_ids) - owned_project_ids
        if invalid_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have access to project(s): {', '.join(map(str, invalid_ids))}"
            )
    
    # Clear existing project links (only after validation)
    await db.execute(
        delete(todo_projects).where(todo_projects.c.todo_id == todo.id)
    )
    
    # Add new project links (now verified)
    if project_ids:
        for project_id in project_ids:
            await db.execute(
                todo_projects.insert().values(
                    todo_id=todo.id,
                    project_id=project_id,
                    project_name_snapshot=None  # Will be set on project deletion
                )
            )

async def _build_todo_project_badges(db: AsyncSession, todo_id: int, is_exclusive: bool) -> List[ProjectBadge]:
    """Build project badges from junction table (live projects and deleted snapshots)."""
    # Query junction table for this todo
    result = await db.execute(
        select(
            todo_projects.c.project_id,
            todo_projects.c.project_name_snapshot
        ).where(todo_projects.c.todo_id == todo_id)
    )
    
    badges = []
    for row in result:
        project_id = row.project_id
        snapshot_name = row.project_name_snapshot
        
        if project_id is not None:
            # Live project - fetch current details
            project_result = await db.execute(
                select(Project).where(Project.id == project_id)
            )
            project = project_result.scalar_one_or_none()
            if project:
                badges.append(ProjectBadge(
                    id=project.id,
                    name=project.name,
                    color=project.color,
                    is_exclusive=is_exclusive,
                    is_deleted=False
                ))
        else:
            # Deleted project - use snapshot
            if snapshot_name:
                badges.append(ProjectBadge(
                    id=None,
                    name=snapshot_name,
                    color="#6c757d",  # Gray for deleted projects
                    is_exclusive=False,  # Was linked (survived deletion)
                    is_deleted=True
                ))
    
    return badges

def _convert_todo_to_response(todo: Todo, project_badges: Optional[List[ProjectBadge]] = None) -> TodoResponse:
    """Convert Todo model to TodoResponse with relational tags."""
    badges = project_badges or []
    return TodoResponse(
        id=todo.id,
        uuid=getattr(todo, 'uuid', None),
        title=todo.title,
        description=todo.description,
        status=todo.status,
        is_completed=todo.is_completed,
        is_archived=todo.is_archived,
        is_favorite=todo.is_favorite,
        is_exclusive_mode=todo.is_exclusive_mode,
        priority=todo.priority,
        project_id=todo.project_id,  # Legacy
        project_name=todo.project.name if todo.project else None,  # Legacy
        order_index=todo.order_index,
        parent_id=todo.parent_id,
        subtasks=[_convert_todo_to_response(subtask, []) for subtask in (todo.subtasks or [])] if hasattr(todo, 'subtasks') and todo.subtasks else [],
        start_date=todo.start_date,
        due_date=todo.due_date,
        completed_at=todo.completed_at,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
        tags=[t.name for t in todo.tag_objs] if todo.tag_objs else [],
        projects=badges
    )

async def _handle_project_tags(db: AsyncSession, project: Project, tag_names: List[str], user_id: int):
    """Synchronise project.tag_objs with the provided tag names."""
    if tag_names is None:
        return
    if not tag_names:
        project.tag_objs = []
        await db.commit()
        await db.refresh(project)
        return

    clean_names = {t.strip() for t in tag_names if t and t.strip()}

    # Fetch existing tags for this user and module type
    existing_tags = (
        await db.execute(
            select(Tag).where(and_(
                Tag.user_id == user_id, 
                Tag.name.in_(clean_names),
                Tag.module_type == "todos"
            ))
        )
    ).scalars().all()
    existing_map = {t.name: t for t in existing_tags}

    tag_objs: List[Tag] = []
    for name in clean_names:
        tag_obj = existing_map.get(name)
        if not tag_obj:
            tag_obj = Tag(
                name=name, 
                user_id=user_id,
                module_type="todos",
                usage_count=1,
                color="#3498db"  # Blue color for project tags
            )
            db.add(tag_obj)
            await db.flush()
        else:
            # Increment usage count for existing tag
            tag_obj.usage_count += 1
        tag_objs.append(tag_obj)

    project.tag_objs = tag_objs
    await db.commit()
    await db.refresh(project)


def _convert_project_to_response(project: Project, todo_count: int = 0, completed_count: int = 0) -> ProjectResponse:
    """Convert Project model to ProjectResponse with todo counts."""
    return ProjectResponse(
        id=project.id,
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
            project_id=todo_data.project_id,  # Legacy
            user_id=current_user.id,
            is_archived=todo_data.is_archived or False
        )
        db.add(todo)
        await db.flush()

        if todo_data.tags:
            await _handle_todo_tags(db, todo, todo_data.tags, current_user.id)

        # Handle projects
        if todo_data.project_ids:
            await _handle_todo_projects(db, todo, todo_data.project_ids, current_user.id)

        await db.commit()

        # Reload todo with tags and project to avoid lazy loading issues in response conversion
        result = await db.execute(
            select(Todo).options(
                selectinload(Todo.tag_objs),
                selectinload(Todo.project)
            ).where(
                Todo.id == todo.id
            )
        )
        todo_with_tags = result.scalar_one()
        
        # Build project badges
        project_badges = await _build_todo_project_badges(db, todo_with_tags.id, todo_with_tags.is_exclusive_mode)
        
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
    is_completed: Optional[bool] = None,
    status: Optional[str] = None,  # New status filter
    is_archived: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    project_id: Optional[int] = None,
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
        selectinload(Todo.project)
    ).where(
        and_(
            Todo.user_id == current_user.id,
            Todo.is_exclusive_mode == False,  # Only show linked (non-exclusive) items
            Todo.parent_id.is_(None)  # Never list subtasks standalone
        )
    )

    if is_completed is not None:
        query = query.where(Todo.is_completed == is_completed)
    if status is not None:
        query = query.where(Todo.status == status)
    if is_archived is not None:
        query = query.where(Todo.is_archived == is_archived)
    if is_favorite is not None:
        query = query.where(Todo.is_favorite == is_favorite)
    if project_id:
        query = query.where(Todo.project_id == project_id)
    if priority:
        query = query.where(Todo.priority == priority)  # Direct integer comparison
    if due_date:
        query = query.where(Todo.due_date == due_date)
    if tag:
        query = query.join(Todo.tag_objs).where(Tag.name == tag)
    
    # Only get top-level todos; when include_subtasks, we will populate children below
    # Order by order_index first (for Kanban), then priority, then creation date
    result = await db.execute(query.order_by(Todo.order_index, Todo.priority.desc(), Todo.created_at.desc()))
    todos = result.scalars().unique().all()
    
    if include_subtasks:
        # SECURITY: Fix N+1 query problem with batch loading
        todo_ids = [todo.id for todo in todos]
        
        # Single query to load all subtasks for all todos
        subtasks_result = await db.execute(
            select(Todo).options(
                selectinload(Todo.tag_objs),
                selectinload(Todo.project)
            ).where(and_(
                Todo.parent_id.in_(todo_ids),
                Todo.user_id == current_user.id
            )).order_by(Todo.parent_id, Todo.order_index)
        )
        all_subtasks = subtasks_result.scalars().all()
        
        # Group subtasks by parent_id
        subtasks_by_parent = {}
        for subtask in all_subtasks:
            if subtask.parent_id not in subtasks_by_parent:
                subtasks_by_parent[subtask.parent_id] = []
            subtasks_by_parent[subtask.parent_id].append(subtask)
        
        # Assign subtasks to their parents
        todos_with_subtasks = []
        for todo in todos:
            todo.subtasks = subtasks_by_parent.get(todo.id, [])
            todos_with_subtasks.append(todo)
        
        # Build responses with project badges
        responses = []
        for t in todos_with_subtasks:
            project_badges = await _build_todo_project_badges(db, t.id, t.is_exclusive_mode)
            responses.append(_convert_todo_to_response(t, project_badges))
        return responses
    else:
        # Build responses with project badges
        responses = []
        for t in todos:
            project_badges = await _build_todo_project_badges(db, t.id, t.is_exclusive_mode)
            responses.append(_convert_todo_to_response(t, project_badges))
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
    project = Project(**payload, user_id=current_user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    if tags:
        await _handle_project_tags(db, project, tags, current_user.id)
    return _convert_project_to_response(project, 0, 0)  # New project has 0 todos

@router.get("/projects/", response_model=List[ProjectResponse])
@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = None,
    tag: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).options(selectinload(Project.tag_objs)).where(Project.user_id == current_user.id)
    if archived is not None:
        query = query.where(Project.is_archived == archived)
    if tag:
        query = query.join(Project.tag_objs).where(Tag.name == tag)
    result = await db.execute(query)
    rows = result.scalars().unique().all()
    
    # Calculate counts for each project
    projects_with_counts = []
    for project in rows:
        todo_count, completed_count = await _get_project_counts(db, project.id)
        projects_with_counts.append(_convert_project_to_response(project, todo_count, completed_count))
    
    return projects_with_counts

@router.get("/projects/{project_uuid}", response_model=ProjectResponse)
async def get_project(
    project_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.uuid == project_uuid, Project.user_id == current_user.id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    todo_count, completed_count = await _get_project_counts(db, project.id)
    return _convert_project_to_response(project, todo_count, completed_count)

@router.put("/projects/{project_uuid}", response_model=ProjectResponse)
async def update_project(
    project_uuid: str,
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.uuid == project_uuid, Project.user_id == current_user.id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    update_payload = project_data.model_dump()
    tags = update_payload.pop("tags", None)
    for key, value in update_payload.items():
        setattr(project, key, value)
    
    await db.commit()
    await db.refresh(project)
    if tags is not None:
        await _handle_project_tags(db, project, tags, current_user.id)
    
    todo_count, completed_count = await _get_project_counts(db, project.id)
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
    from app.models.associations import note_projects, document_projects, todo_projects
    from app.models.note import Note
    from app.models.document import Document
    from sqlalchemy import update, delete as sql_delete
    
    result = await db.execute(
        select(Project).where(and_(Project.uuid == project_uuid, Project.user_id == current_user.id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Step 1: Snapshot project name in all junction records BEFORE deletion
    # This preserves the project name for linked (non-exclusive) items
    await db.execute(
        update(note_projects)
        .where(note_projects.c.project_id == project.id)
        .values(project_name_snapshot=project.name)
    )
    
    await db.execute(
        update(document_projects)
        .where(document_projects.c.project_id == project.id)
        .values(project_name_snapshot=project.name)
    )
    
    await db.execute(
        update(todo_projects)
        .where(todo_projects.c.project_id == project.id)
        .values(project_name_snapshot=project.name)
    )
    
    # Step 2: Hard delete exclusive items
    # Get exclusive notes linked to this project
    exclusive_note_ids = await db.execute(
        select(Note.id)
        .join(note_projects, Note.id == note_projects.c.note_id)
        .where(
            note_projects.c.project_id == project.id,
            Note.is_exclusive_mode == True
        )
    )
    for note_id in exclusive_note_ids.scalars():
        await db.execute(sql_delete(Note).where(Note.id == note_id))
    
    # Get exclusive documents linked to this project
    exclusive_doc_ids = await db.execute(
        select(Document.id)
        .join(document_projects, Document.id == document_projects.c.document_id)
        .where(
            document_projects.c.project_id == project.id,
            Document.is_exclusive_mode == True
        )
    )
    for doc_id in exclusive_doc_ids.scalars():
        await db.execute(sql_delete(Document).where(Document.id == doc_id))
    
    # Get exclusive todos linked to this project
    exclusive_todo_ids = await db.execute(
        select(Todo.id)
        .join(todo_projects, Todo.id == todo_projects.c.todo_id)
        .where(
            todo_projects.c.project_id == project.id,
            Todo.is_exclusive_mode == True
        )
    )
    for todo_id in exclusive_todo_ids.scalars():
        await db.execute(sql_delete(Todo).where(Todo.id == todo_id))
    
    # Step 3: Delete project (SET NULL will set project_id=NULL in junction tables)
    # Linked items (is_exclusive_mode=False) survive with project_name_snapshot
    await db.delete(project)
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
            selectinload(Todo.project)
        ).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, todo.id, todo.is_exclusive_mode)
    
    return _convert_todo_to_response(todo, project_badges)

@router.put("/{todo_uuid}", response_model=TodoResponse)
async def update_todo(
    todo_uuid: str,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    update_data = todo_data.model_dump(exclude_unset=True)
    
    if "tags" in update_data:
        await _handle_todo_tags(db, todo, update_data.pop("tags"), current_user.id)

    # Handle projects if provided
    if "project_ids" in update_data:
        await _handle_todo_projects(db, todo, update_data.pop("project_ids"), current_user.id)

    for key, value in update_data.items():
        setattr(todo, key, value)
        
    # SECURITY: Ensure data integrity between status and is_completed fields
    if todo_data.status is not None:
        # Validate status first
        valid_statuses = ['pending', 'in_progress', 'blocked', 'done', 'cancelled']
        if todo_data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        todo.status = todo_data.status
        todo.is_completed = (todo_data.status == 'done')
        
        # Handle completed_at timestamp with timezone awareness
        if todo_data.status == 'done' and not todo.completed_at:
            from datetime import datetime, timezone
            todo.completed_at = datetime.now(timezone.utc)
        elif todo_data.status != 'done':
            todo.completed_at = None
    elif todo_data.is_completed is not None:
        # Legacy support: if is_completed is set, update status accordingly
        if todo_data.is_completed:
            todo.status = 'done'
            todo.is_completed = True
            if not todo.completed_at:
                from datetime import datetime, timezone
                todo.completed_at = datetime.now(timezone.utc)
        else:
            todo.status = 'pending'
            todo.is_completed = False
            todo.completed_at = None

    await db.commit()
    
    # Reload todo with tags and project to avoid lazy loading issues in response conversion
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.project)
        ).where(
            Todo.id == todo.id
        )
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, todo_with_tags.id, todo_with_tags.is_exclusive_mode)
    
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
            selectinload(Todo.project)
        ).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    todo.is_archived = archive
    await db.commit()
    await db.refresh(todo)
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, todo.id, todo.is_exclusive_mode)
    
    return _convert_todo_to_response(todo, project_badges)

@router.delete("/{todo_uuid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    await db.delete(todo)
    await db.commit()

@router.patch("/{todo_uuid}/status", response_model=TodoResponse)
async def update_todo_status(
    todo_uuid: str,
    status: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update todo status and sync is_completed field."""
    result = await db.execute(
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
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
    todo.is_completed = (status == 'done')
    
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
            selectinload(Todo.project)
        ).where(Todo.id == todo.id)
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, todo_with_tags.id, todo_with_tags.is_exclusive_mode)
    
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
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
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
            selectinload(Todo.project)
        ).where(Todo.id == todo.id)
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, todo_with_tags.id, todo_with_tags.is_exclusive_mode)
    
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
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
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
        parent_id=parent_todo.id,
        project_id=parent_todo.project_id,  # Inherit project from parent
        user_id=current_user.id
    )
    
    db.add(subtask)
    await db.commit()
    await db.refresh(subtask)
    
    # Reload with tags and project for response
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.project)
        ).where(Todo.id == subtask.id)
    )
    subtask_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, subtask_with_tags.id, subtask_with_tags.is_exclusive_mode)
    
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
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    parent_todo = parent_result.scalar_one_or_none()
    if not parent_todo:
        raise HTTPException(status_code=404, detail="Parent todo not found")
    
    # Get subtasks
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.project)
        ).where(and_(
            Todo.parent_id == parent_todo.id,
            Todo.user_id == current_user.id
        )).order_by(Todo.order_index)
    )
    subtasks = result.scalars().all()
    
    # Build project badges for each subtask
    responses = []
    for subtask in subtasks:
        project_badges = await _build_todo_project_badges(db, subtask.id, subtask.is_exclusive_mode)
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
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    
    # If moving to a new parent, verify it exists and belongs to user
    if parent_uuid is not None:
        parent_result = await db.execute(
            select(Todo).where(and_(Todo.uuid == parent_uuid, Todo.user_id == current_user.id))
        )
        parent_todo = parent_result.scalar_one_or_none()
        if not parent_todo:
            raise HTTPException(status_code=404, detail="New parent todo not found")
        
        # Prevent circular references
        if parent_todo.id == todo.id:
            raise HTTPException(status_code=400, detail="Cannot make todo a subtask of itself")
        
        # SECURITY: Check for circular reference with depth limit to prevent DoS
        current_parent = parent_todo.id
        depth = 0
        max_depth = 50 # Prevent unbounded recursion
        
        while current_parent and depth < max_depth:
            if current_parent == todo.id:
                raise HTTPException(status_code=400, detail="Cannot create circular reference")
            parent_check = await db.execute(
                select(Todo.parent_id).where(Todo.id == current_parent)
            )
            current_parent = parent_check.scalar_one_or_none()
            depth += 1
        
        if depth >= max_depth:
            raise HTTPException(status_code=400, detail="Todo hierarchy too deep")
    
    # Update parent_id
    todo.parent_id = parent_todo.id if parent_uuid is not None else None
    
    # If moving to a new parent, inherit project
    if parent_uuid is not None:
        todo.project_id = parent_todo.project_id
    
    await db.commit()
    await db.refresh(todo)
    
    # Reload with tags and project for response
    result = await db.execute(
        select(Todo).options(
            selectinload(Todo.tag_objs),
            selectinload(Todo.project)
        ).where(Todo.id == todo.id)
    )
    todo_with_tags = result.scalar_one()
    
    # Build project badges
    project_badges = await _build_todo_project_badges(db, todo_with_tags.id, todo_with_tags.is_exclusive_mode)
    
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
        select(Todo).where(and_(Todo.uuid == todo_uuid, Todo.user_id == current_user.id))
    )
    parent_todo = parent_result.scalar_one_or_none()
    if not parent_todo:
        raise HTTPException(status_code=404, detail="Parent todo not found")
    
    # Update order_index for each subtask
    for index, subtask_uuid in enumerate(subtask_uuids):
        subtask_result = await db.execute(
            select(Todo).where(and_(
                Todo.uuid == subtask_uuid,
                Todo.parent_id == parent_todo.id,
                Todo.user_id == current_user.id
            ))
        )
        subtask = subtask_result.scalar_one_or_none()
        if subtask:
            subtask.order_index = index
    
    await db.commit()
    return {"status": "success", "message": "Subtasks reordered successfully"}