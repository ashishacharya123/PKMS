"""
Todos Router - Complete Todo Module Implementation
Handles task management, project organization, priorities, and completion tracking
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, case
from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any
from datetime import datetime, date, timedelta
import json

from app.database import get_db
from app.models.todo import Todo, Project, todo_tags
from app.models.tag import Tag
from app.models.user import User
from app.auth.dependencies import get_current_user

router = APIRouter()

# Enums for todo status and priority
TODO_STATUSES = ["pending", "in_progress", "completed", "cancelled"]
TODO_PRIORITIES = [1, 2, 3]  # 1=Low, 2=Medium, 3=High

class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    color: str = Field(default="#2196F3", pattern=r'^#[0-9A-Fa-f]{6}$')

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    is_archived: Optional[bool] = None

class ProjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    todo_count: int
    completed_count: int
    
    class Config:
        from_attributes = True

class TodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    project_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: int = Field(default=1, ge=1, le=3)
    tags: Optional[List[str]] = Field(default=[], max_items=20)
    is_recurring: bool = Field(default=False)
    recurrence_pattern: Optional[str] = Field(None, max_length=100)

class TodoUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    project_id: Optional[int] = None
    due_date: Optional[date] = None
    priority: Optional[int] = Field(None, ge=1, le=3)
    status: Optional[str] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_recurring: Optional[bool] = None
    recurrence_pattern: Optional[str] = Field(None, max_length=100)
    
    @validator('status')
    def validate_status(cls, v):
        if v is not None and v not in TODO_STATUSES:
            raise ValueError(f'Status must be one of: {TODO_STATUSES}')
        return v

class TodoResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    project_id: Optional[int]
    project_name: Optional[str]
    due_date: Optional[date]
    priority: int
    status: str
    completed_at: Optional[datetime]
    is_recurring: bool
    recurrence_pattern: Optional[str]
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    days_until_due: Optional[int]
    
    class Config:
        from_attributes = True

class TodoSummary(BaseModel):
    id: int
    title: str
    project_name: Optional[str]
    due_date: Optional[date]
    priority: int
    status: str
    created_at: datetime
    tags: List[str]
    days_until_due: Optional[int]
    
    class Config:
        from_attributes = True

class TodoStats(BaseModel):
    total: int
    pending: int
    in_progress: int
    completed: int
    cancelled: int
    overdue: int
    due_today: int
    due_this_week: int

# Project endpoints
@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new project"""
    
    project = Project(
        name=project_data.name,
        description=project_data.description,
        color=project_data.color,
        user_id=current_user.id
    )
    
    db.add(project)
    await db.commit()
    await db.refresh(project)
    
    return await _get_project_with_stats(db, project.id, current_user.id)

@router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(
    archived: Optional[bool] = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List all projects with todo counts"""
    
    query = select(Project).where(Project.user_id == current_user.id)
    
    if archived is not None:
        query = query.where(Project.is_archived == archived)
    
    query = query.order_by(Project.updated_at.desc())
    
    result = await db.execute(query)
    projects = result.scalars().all()
    
    # Get projects with stats
    project_responses = []
    for project in projects:
        project_response = await _get_project_with_stats(db, project.id, current_user.id)
        project_responses.append(project_response)
    
    return project_responses

@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific project with statistics"""
    
    result = await db.execute(
        select(Project).where(
            and_(Project.id == project_id, Project.user_id == current_user.id)
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return await _get_project_with_stats(db, project_id, current_user.id)

@router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a project"""
    
    result = await db.execute(
        select(Project).where(
            and_(Project.id == project_id, Project.user_id == current_user.id)
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update fields
    update_data = project_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    
    project.updated_at = datetime.utcnow()
    await db.commit()
    
    return await _get_project_with_stats(db, project_id, current_user.id)

@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a project (todos will be unassigned)"""
    
    result = await db.execute(
        select(Project).where(
            and_(Project.id == project_id, Project.user_id == current_user.id)
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Unassign todos from this project
    await db.execute(
        select(Todo).where(Todo.project_id == project_id).update({"project_id": None})
    )
    
    await db.delete(project)
    await db.commit()
    
    return {"message": "Project deleted successfully"}

# Todo endpoints
@router.post("/", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new todo"""
    
    # Validate project if provided
    if todo_data.project_id:
        result = await db.execute(
            select(Project).where(
                and_(Project.id == todo_data.project_id, Project.user_id == current_user.id)
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project not found"
            )
    
    todo = Todo(
        title=todo_data.title,
        description=todo_data.description,
        project_id=todo_data.project_id,
        due_date=todo_data.due_date,
        priority=todo_data.priority,
        is_recurring=todo_data.is_recurring,
        recurrence_pattern=todo_data.recurrence_pattern,
        user_id=current_user.id
    )
    
    db.add(todo)
    await db.flush()
    
    # Handle tags
    await _handle_todo_tags(db, todo, todo_data.tags, current_user.id)
    
    await db.commit()
    await db.refresh(todo)
    
    return await _get_todo_with_relations(db, todo.id, current_user.id)

@router.get("/{todo_id}", response_model=TodoResponse)
async def get_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific todo"""
    
    result = await db.execute(
        select(Todo).where(
            and_(Todo.id == todo_id, Todo.user_id == current_user.id)
        )
    )
    todo = result.scalar_one_or_none()
    
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found"
        )
    
    return await _get_todo_with_relations(db, todo_id, current_user.id)

@router.put("/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int,
    todo_data: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a todo"""
    
    result = await db.execute(
        select(Todo).where(
            and_(Todo.id == todo_id, Todo.user_id == current_user.id)
        )
    )
    todo = result.scalar_one_or_none()
    
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found"
        )
    
    # Validate project if provided
    if todo_data.project_id:
        result = await db.execute(
            select(Project).where(
                and_(Project.id == todo_data.project_id, Project.user_id == current_user.id)
            )
        )
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project not found"
            )
    
    # Update fields
    update_data = todo_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        if field == "tags":
            continue  # Handle separately
        setattr(todo, field, value)
    
    # Handle status change to completed
    if todo_data.status == "completed" and todo.status != "completed":
        todo.completed_at = datetime.utcnow()
    elif todo_data.status and todo_data.status != "completed":
        todo.completed_at = None
    
    # Handle tags if provided
    if todo_data.tags is not None:
        await _handle_todo_tags(db, todo, todo_data.tags, current_user.id)
    
    todo.updated_at = datetime.utcnow()
    await db.commit()
    
    return await _get_todo_with_relations(db, todo_id, current_user.id)

@router.post("/{todo_id}/complete", response_model=TodoResponse)
async def complete_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a todo as completed"""
    
    result = await db.execute(
        select(Todo).where(
            and_(Todo.id == todo_id, Todo.user_id == current_user.id)
        )
    )
    todo = result.scalar_one_or_none()
    
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found"
        )
    
    todo.status = "completed"
    todo.completed_at = datetime.utcnow()
    todo.updated_at = datetime.utcnow()
    
    # Handle recurring todos
    if todo.is_recurring and todo.recurrence_pattern:
        await _create_recurring_todo(db, todo, current_user.id)
    
    await db.commit()
    
    return await _get_todo_with_relations(db, todo_id, current_user.id)

@router.delete("/{todo_id}")
async def delete_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a todo"""
    
    result = await db.execute(
        select(Todo).where(
            and_(Todo.id == todo_id, Todo.user_id == current_user.id)
        )
    )
    todo = result.scalar_one_or_none()
    
    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found"
        )
    
    await db.delete(todo)
    await db.commit()
    
    return {"message": "Todo deleted successfully"}

@router.get("/", response_model=List[TodoSummary])
async def list_todos(
    status: Optional[str] = Query(None),
    priority: Optional[int] = Query(None, ge=1, le=3),
    project_id: Optional[int] = Query(None),
    due_date: Optional[date] = Query(None),
    overdue: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List todos with filtering and search"""
    
    query = select(Todo).where(Todo.user_id == current_user.id)
    
    # Apply filters
    if status:
        if status not in TODO_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {TODO_STATUSES}"
            )
        query = query.where(Todo.status == status)
    
    if priority:
        query = query.where(Todo.priority == priority)
    
    if project_id:
        query = query.where(Todo.project_id == project_id)
    
    if due_date:
        query = query.where(Todo.due_date == due_date)
    
    if overdue:
        today = date.today()
        query = query.where(
            and_(
                Todo.due_date < today,
                Todo.status.in_(["pending", "in_progress"])
            )
        )
    
    # Tag filter
    if tag:
        query = query.join(todo_tags).join(Tag).where(Tag.name == tag)
    
    # Search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                Todo.title.ilike(search_term),
                Todo.description.ilike(search_term)
            )
        )
    
    # Order and pagination
    query = query.order_by(
        case(
            (Todo.status == "pending", 1),
            (Todo.status == "in_progress", 2),
            (Todo.status == "completed", 3),
            (Todo.status == "cancelled", 4),
            else_=5
        ),
        Todo.priority.desc(),
        Todo.due_date.asc().nullslast(),
        Todo.created_at.desc()
    ).offset(offset).limit(limit)
    
    result = await db.execute(query)
    todos = result.scalars().all()
    
    # Convert to summaries with project names and tags
    summaries = []
    for todo in todos:
        # Get project name
        project_name = None
        if todo.project_id:
            project_result = await db.execute(
                select(Project.name).where(Project.id == todo.project_id)
            )
            project_name = project_result.scalar_one_or_none()
        
        # Get tags
        tag_result = await db.execute(
            select(Tag.name).join(todo_tags).where(todo_tags.c.todo_id == todo.id)
        )
        todo_tags_list = [row[0] for row in tag_result.fetchall()]
        
        # Calculate days until due
        days_until_due = None
        if todo.due_date:
            days_until_due = (todo.due_date - date.today()).days
        
        summaries.append(TodoSummary(
            id=todo.id,
            title=todo.title,
            project_name=project_name,
            due_date=todo.due_date,
            priority=todo.priority,
            status=todo.status,
            created_at=todo.created_at,
            tags=todo_tags_list,
            days_until_due=days_until_due
        ))
    
    return summaries

@router.get("/stats/overview", response_model=TodoStats)
async def get_todo_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get todo statistics overview"""
    
    # Get status counts
    status_result = await db.execute(
        select(Todo.status, func.count(Todo.id))
        .where(Todo.user_id == current_user.id)
        .group_by(Todo.status)
    )
    status_counts = dict(status_result.fetchall())
    
    # Get total count
    total_result = await db.execute(
        select(func.count(Todo.id)).where(Todo.user_id == current_user.id)
    )
    total = total_result.scalar() or 0
    
    # Get overdue count
    today = date.today()
    overdue_result = await db.execute(
        select(func.count(Todo.id)).where(
            and_(
                Todo.user_id == current_user.id,
                Todo.due_date < today,
                Todo.status.in_(["pending", "in_progress"])
            )
        )
    )
    overdue = overdue_result.scalar() or 0
    
    # Get due today count
    due_today_result = await db.execute(
        select(func.count(Todo.id)).where(
            and_(
                Todo.user_id == current_user.id,
                Todo.due_date == today,
                Todo.status.in_(["pending", "in_progress"])
            )
        )
    )
    due_today = due_today_result.scalar() or 0
    
    # Get due this week count
    week_end = today + timedelta(days=7)
    due_this_week_result = await db.execute(
        select(func.count(Todo.id)).where(
            and_(
                Todo.user_id == current_user.id,
                Todo.due_date.between(today, week_end),
                Todo.status.in_(["pending", "in_progress"])
            )
        )
    )
    due_this_week = due_this_week_result.scalar() or 0
    
    return TodoStats(
        total=total,
        pending=status_counts.get("pending", 0),
        in_progress=status_counts.get("in_progress", 0),
        completed=status_counts.get("completed", 0),
        cancelled=status_counts.get("cancelled", 0),
        overdue=overdue,
        due_today=due_today,
        due_this_week=due_this_week
    )

# Helper functions
async def _handle_todo_tags(db: AsyncSession, todo: Todo, tag_names: List[str], user_id: int):
    """Handle tag assignment for a todo"""
    
    # Clear existing tags
    await db.execute(
        todo_tags.delete().where(todo_tags.c.todo_id == todo.id)
    )
    
    for tag_name in tag_names:
        if not tag_name.strip():
            continue
            
        tag_name = tag_name.strip().lower()
        
        # Get or create tag
        result = await db.execute(
            select(Tag).where(
                and_(Tag.name == tag_name, Tag.module_type == "todos", Tag.user_id == user_id)
            )
        )
        tag = result.scalar_one_or_none()
        
        if not tag:
            tag = Tag(
                name=tag_name,
                module_type="todos",
                user_id=user_id
            )
            db.add(tag)
            await db.flush()
        
        # Associate with todo
        await db.execute(
            todo_tags.insert().values(todo_id=todo.id, tag_id=tag.id)
        )

async def _get_project_with_stats(db: AsyncSession, project_id: int, user_id: int) -> ProjectResponse:
    """Get project with todo statistics"""
    
    # Get project
    result = await db.execute(
        select(Project).where(and_(Project.id == project_id, Project.user_id == user_id))
    )
    project = result.scalar_one()
    
    # Get todo counts
    todo_count_result = await db.execute(
        select(func.count(Todo.id)).where(Todo.project_id == project_id)
    )
    todo_count = todo_count_result.scalar() or 0
    
    completed_count_result = await db.execute(
        select(func.count(Todo.id)).where(
            and_(Todo.project_id == project_id, Todo.status == "completed")
        )
    )
    completed_count = completed_count_result.scalar() or 0
    
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        color=project.color,
        is_archived=project.is_archived,
        created_at=project.created_at,
        updated_at=project.updated_at,
        todo_count=todo_count,
        completed_count=completed_count
    )

async def _get_todo_with_relations(db: AsyncSession, todo_id: int, user_id: int) -> TodoResponse:
    """Get todo with all related data (project, tags)"""
    
    # Get todo
    result = await db.execute(
        select(Todo).where(and_(Todo.id == todo_id, Todo.user_id == user_id))
    )
    todo = result.scalar_one()
    
    # Get project name
    project_name = None
    if todo.project_id:
        project_result = await db.execute(
            select(Project.name).where(Project.id == todo.project_id)
        )
        project_name = project_result.scalar_one_or_none()
    
    # Get tags
    tag_result = await db.execute(
        select(Tag.name).join(todo_tags).where(todo_tags.c.todo_id == todo_id)
    )
    tags = [row[0] for row in tag_result.fetchall()]
    
    # Calculate days until due
    days_until_due = None
    if todo.due_date:
        days_until_due = (todo.due_date - date.today()).days
    
    return TodoResponse(
        id=todo.id,
        title=todo.title,
        description=todo.description,
        project_id=todo.project_id,
        project_name=project_name,
        due_date=todo.due_date,
        priority=todo.priority,
        status=todo.status,
        completed_at=todo.completed_at,
        is_recurring=todo.is_recurring,
        recurrence_pattern=todo.recurrence_pattern,
        created_at=todo.created_at,
        updated_at=todo.updated_at,
        tags=tags,
        days_until_due=days_until_due
    )

async def _create_recurring_todo(db: AsyncSession, completed_todo: Todo, user_id: int):
    """Create next instance of a recurring todo"""
    
    if not completed_todo.recurrence_pattern:
        return
    
    # Simple recurrence patterns: "daily", "weekly", "monthly"
    next_due_date = completed_todo.due_date
    if not next_due_date:
        next_due_date = date.today()
    
    if completed_todo.recurrence_pattern == "daily":
        next_due_date += timedelta(days=1)
    elif completed_todo.recurrence_pattern == "weekly":
        next_due_date += timedelta(weeks=1)
    elif completed_todo.recurrence_pattern == "monthly":
        # Simple monthly - same day next month
        if next_due_date.month == 12:
            next_due_date = next_due_date.replace(year=next_due_date.year + 1, month=1)
        else:
            next_due_date = next_due_date.replace(month=next_due_date.month + 1)
    
    # Create new todo
    new_todo = Todo(
        title=completed_todo.title,
        description=completed_todo.description,
        project_id=completed_todo.project_id,
        due_date=next_due_date,
        priority=completed_todo.priority,
        status="pending",
        is_recurring=True,
        recurrence_pattern=completed_todo.recurrence_pattern,
        user_id=user_id
    )
    
    db.add(new_todo)
    await db.flush()
    
    # Copy tags from original todo
    tag_result = await db.execute(
        select(todo_tags.c.tag_id).where(todo_tags.c.todo_id == completed_todo.id)
    )
    tag_ids = [row[0] for row in tag_result.fetchall()]
    
    for tag_id in tag_ids:
        await db.execute(
            todo_tags.insert().values(todo_id=new_todo.id, tag_id=tag_id)
        ) 