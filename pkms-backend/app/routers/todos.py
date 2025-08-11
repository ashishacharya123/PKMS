"""
Todo and Project Management Router for PKMS
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete, func
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.todo import Todo, Project
from app.models.tag import Tag
from app.models.user import User
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

    completed_count = (await db.execute(
        select(func.count(Todo.id)).where(and_(
            Todo.user_id == current_user.id,
            Todo.is_completed.is_(True)
        ))
    )).scalar() or 0

    archived_count = (await db.execute(
        select(func.count(Todo.id)).where(and_(
            Todo.user_id == current_user.id,
            Todo.is_archived.is_(True)
        ))
    )).scalar() or 0

    pending_count = max(total_todos - completed_count, 0)

    # Overdue: due_date set, in the past, not completed, not archived
    now_utc = datetime.utcnow()
    overdue_count = (await db.execute(
        select(func.count(Todo.id)).where(and_(
            Todo.user_id == current_user.id,
            Todo.is_completed.is_(False),
            Todo.is_archived.is_(False),
            Todo.due_date.is_not(None),
            Todo.due_date < now_utc
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
            "completed": completed_count,
            "pending": pending_count,
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

# --- Pydantic Models ---

class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1)
    description: Optional[str] = None
    project_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: int = 2  # 1=low, 2=medium, 3=high, 4=urgent
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    is_archived: Optional[bool] = False
    
    @validator('priority')
    def validate_priority(cls, v):
        if v not in VALID_PRIORITIES:
            raise ValueError('Priority must be 1 (low), 2 (medium), 3 (high), or 4 (urgent)')
        return v

class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1)
    description: Optional[str] = None
    is_completed: Optional[bool] = None
    project_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Optional[int] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None
    
    @validator('priority')
    def validate_priority(cls, v):
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError('Priority must be 1 (low), 2 (medium), 3 (high), or 4 (urgent)')
        return v

class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    is_completed: bool
    is_archived: bool
    is_favorite: bool
    priority: int  # 1=low, 2=medium, 3=high, 4=urgent
    project_id: Optional[int]
    project_name: Optional[str]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    tags: List[str]

    class Config:
        from_attributes = True

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: Optional[str]
    is_archived: bool

    class Config:
        from_attributes = True
        
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

def _convert_todo_to_response(todo: Todo) -> TodoResponse:
    """Convert Todo model to TodoResponse with relational tags."""
    return TodoResponse(
        id=todo.id,
        title=todo.title,
        description=todo.description,
        is_completed=todo.is_completed,
        is_archived=todo.is_archived,
        is_favorite=todo.is_favorite,
        priority=todo.priority,  # Direct integer use - no conversion needed
        project_id=todo.project_id,
        project_name=todo.project.name if todo.project else None,
        due_date=todo.due_date,
        completed_at=todo.completed_at,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
        tags=[t.name for t in todo.tag_objs] if todo.tag_objs else []
    )

# --- Todo Endpoints ---

@router.post("/", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    todo = Todo(
        title=todo_data.title,
        description=todo_data.description,
        priority=todo_data.priority,  # Direct integer use - no conversion needed
        due_date=todo_data.due_date,
        project_id=todo_data.project_id,
        user_id=current_user.id,
        is_archived=todo_data.is_archived or False
    )
    db.add(todo)
    await db.commit()
    await db.refresh(todo)

    if todo_data.tags:
        await _handle_todo_tags(db, todo, todo_data.tags, current_user.id)

    # Reload todo with tags to avoid lazy loading issues in response conversion
    result = await db.execute(
        select(Todo).options(selectinload(Todo.tag_objs)).where(
            Todo.id == todo.id
        )
    )
    todo_with_tags = result.scalar_one()
    
    return _convert_todo_to_response(todo_with_tags)


@router.get("/", response_model=List[TodoResponse])
async def list_todos(
    is_completed: Optional[bool] = None,
    is_archived: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    project_id: Optional[int] = None,
    priority: Optional[int] = None,
    due_date: Optional[date] = None,
    tag: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Todo).options(selectinload(Todo.tag_objs)).where(Todo.user_id == current_user.id)

    if is_completed is not None:
        query = query.where(Todo.is_completed == is_completed)
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
        
    result = await db.execute(query.order_by(Todo.priority.desc(), Todo.created_at.desc()))  # Sort by priority first (urgent=4, high=3, medium=2, low=1)
    todos = result.scalars().unique().all()
    return [_convert_todo_to_response(t) for t in todos]

# --- Project Endpoints (place before dynamic /{todo_id} routes to avoid conflicts) ---

@router.post("/projects/", response_model=ProjectResponse)
@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = Project(**project_data.model_dump(), user_id=current_user.id)
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project

@router.get("/projects/", response_model=List[ProjectResponse])
@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where(Project.user_id == current_user.id)
    if archived is not None:
        query = query.where(Project.is_archived == archived)
    result = await db.execute(query)
    return result.scalars().all()

@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.id == project_id, Project.user_id == current_user.id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project

@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.id == project_id, Project.user_id == current_user.id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    for key, value in project_data.model_dump().items():
        setattr(project, key, value)
    
    await db.commit()
    await db.refresh(project)
    return project

@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project).where(and_(Project.id == project_id, Project.user_id == current_user.id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Check if project has associated todos
    result = await db.execute(select(Todo).where(Todo.project_id == project_id))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Cannot delete project with associated todos")
        
    await db.delete(project)
    await db.commit()

@router.get("/{todo_id}", response_model=TodoResponse)
async def get_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).options(selectinload(Todo.tag_objs)).where(and_(Todo.id == todo_id, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return _convert_todo_to_response(todo)

@router.put("/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).where(and_(Todo.id == todo_id, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    update_data = todo_data.model_dump(exclude_unset=True)
    
    if "tags" in update_data:
        await _handle_todo_tags(db, todo, update_data.pop("tags"), current_user.id)

    for key, value in update_data.items():
        setattr(todo, key, value)
        
    if todo_data.is_completed and not todo.completed_at:
        todo.completed_at = datetime.utcnow()
    elif not todo_data.is_completed:
        todo.completed_at = None

    await db.commit()
    
    # Reload todo with tags to avoid lazy loading issues in response conversion
    result = await db.execute(
        select(Todo).options(selectinload(Todo.tag_objs)).where(
            Todo.id == todo.id
        )
    )
    todo_with_tags = result.scalar_one()
    
    return _convert_todo_to_response(todo_with_tags)

@router.patch("/{todo_id}/archive", response_model=TodoResponse)
async def archive_todo(
    todo_id: int,
    archive: bool = True,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).options(selectinload(Todo.tag_objs)).where(and_(Todo.id == todo_id, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    todo.is_archived = archive
    await db.commit()
    await db.refresh(todo)
    return _convert_todo_to_response(todo)

@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).where(and_(Todo.id == todo_id, Todo.user_id == current_user.id))
    )
    todo = result.scalar_one_or_none()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    await db.delete(todo)
    await db.commit()

# --- End Project Endpoints ---