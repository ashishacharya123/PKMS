"""
Dashboard router for PKMS backend
Provides aggregated statistics and overview data for the dashboard
"""

from datetime import datetime, timedelta
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, and_

from app.database import get_db
from app.config import NEPAL_TZ
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo, Project
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveFolder, ArchiveItem
from pydantic import BaseModel

router = APIRouter()

class DashboardStats(BaseModel):
    """Dashboard statistics model"""
    notes: Dict[str, int]
    documents: Dict[str, int] 
    todos: Dict[str, int]
    diary: Dict[str, int]
    archive: Dict[str, int]
    last_updated: datetime

class ModuleActivity(BaseModel):
    """Recent activity across modules"""
    recent_notes: int
    recent_documents: int
    recent_todos: int
    recent_diary_entries: int
    recent_archive_items: int

class QuickStats(BaseModel):
    """Quick overview statistics"""
    total_items: int
    active_projects: int
    overdue_todos: int
    current_diary_streak: int
    storage_used_mb: float

@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get aggregated statistics for all modules in a single request
    This is optimized for fast dashboard loading
    """
    try:
        user_id = current_user.id
        
        # Define time range for "recent" items (last 7 days)
        recent_cutoff = datetime.now(NEPAL_TZ) - timedelta(days=7)
        
        # Notes Statistics
        notes_total = await db.scalar(
            select(func.count(Note.id)).where(
                and_(Note.user_id == user_id, Note.is_archived == False)
            )
        )
        notes_recent = await db.scalar(
            select(func.count(Note.id)).where(
                and_(
                    Note.user_id == user_id,
                    Note.is_archived == False,
                    Note.created_at >= recent_cutoff
                )
            )
        )
        
        # Documents Statistics  
        docs_total = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(Document.user_id == user_id, Document.is_archived == False)
            )
        )
        docs_recent = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(
                    Document.user_id == user_id,
                    Document.is_archived == False,
                    Document.created_at >= recent_cutoff
                )
            )
        )
        
        # Todos Statistics
        todos_total = await db.scalar(
            select(func.count(Todo.id)).where(Todo.user_id == user_id)
        )
        todos_pending = await db.scalar(
            select(func.count(Todo.id)).where(
                and_(Todo.user_id == user_id, Todo.is_completed == False)
            )
        )
        todos_completed = await db.scalar(
            select(func.count(Todo.id)).where(
                and_(Todo.user_id == user_id, Todo.is_completed == True)
            )
        )
        todos_overdue = await db.scalar(
            select(func.count(Todo.id)).where(
                and_(
                    Todo.user_id == user_id,
                    Todo.is_completed == False,
                    Todo.due_date < datetime.now(NEPAL_TZ)
                )
            )
        )
        
        # Diary Statistics
        diary_total = await db.scalar(
            select(func.count(DiaryEntry.id)).where(DiaryEntry.user_id == user_id)
        )
        
        # Calculate diary streak (consecutive days with entries)
        diary_streak = await _calculate_diary_streak(db, user_id)
        
        # Archive Statistics
        archive_folders = await db.scalar(
            select(func.count(ArchiveFolder.uuid)).where(
                and_(ArchiveFolder.user_id == user_id, ArchiveFolder.is_archived == False)
            )
        )
        archive_items = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                and_(ArchiveItem.user_id == user_id, ArchiveItem.is_archived == False)
            )
        )
        
        return DashboardStats(
            notes={
                "total": notes_total or 0,
                "recent": notes_recent or 0
            },
            documents={
                "total": docs_total or 0, 
                "recent": docs_recent or 0
            },
            todos={
                "total": todos_total or 0,
                "pending": todos_pending or 0,
                "completed": todos_completed or 0,
                "overdue": todos_overdue or 0
            },
            diary={
                "entries": diary_total or 0,
                "streak": diary_streak
            },
            archive={
                "folders": archive_folders or 0,
                "items": archive_items or 0
            },
            last_updated=datetime.now(NEPAL_TZ)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load dashboard statistics: {str(e)}"
        )

@router.get("/activity", response_model=ModuleActivity)
async def get_recent_activity(
    days: int = 7,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get recent activity across all modules"""
    try:
        user_id = current_user.id
        cutoff = datetime.now(NEPAL_TZ) - timedelta(days=days)
        
        # Get recent activity counts
        recent_notes = await db.scalar(
            select(func.count(Note.id)).where(
                and_(Note.user_id == user_id, Note.created_at >= cutoff)
            )
        )
        recent_documents = await db.scalar(
            select(func.count(Document.uuid)).where(
                and_(Document.user_id == user_id, Document.created_at >= cutoff)
            )
        )
        recent_todos = await db.scalar(
            select(func.count(Todo.id)).where(
                and_(Todo.user_id == user_id, Todo.created_at >= cutoff)
            )
        )
        recent_diary = await db.scalar(
            select(func.count(DiaryEntry.id)).where(
                and_(DiaryEntry.user_id == user_id, DiaryEntry.created_at >= cutoff)
            )
        )
        recent_archive = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(
                and_(ArchiveItem.user_id == user_id, ArchiveItem.created_at >= cutoff)
            )
        )
        
        return ModuleActivity(
            recent_notes=recent_notes or 0,
            recent_documents=recent_documents or 0,
            recent_todos=recent_todos or 0,
            recent_diary_entries=recent_diary or 0,
            recent_archive_items=recent_archive or 0
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load activity data: {str(e)}"
        )

@router.get("/quick-stats", response_model=QuickStats)
async def get_quick_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get quick overview statistics for dashboard widgets"""
    try:
        user_id = current_user.id
        
        # Total items across all modules
        notes_count = await db.scalar(
            select(func.count(Note.id)).where(Note.user_id == user_id)
        )
        docs_count = await db.scalar(
            select(func.count(Document.uuid)).where(Document.user_id == user_id)
        )
        todos_count = await db.scalar(
            select(func.count(Todo.id)).where(Todo.user_id == user_id)
        )
        diary_count = await db.scalar(
            select(func.count(DiaryEntry.id)).where(DiaryEntry.user_id == user_id)
        )
        archive_count = await db.scalar(
            select(func.count(ArchiveItem.uuid)).where(ArchiveItem.user_id == user_id)
        )
        
        total_items = (notes_count or 0) + (docs_count or 0) + (todos_count or 0) + (diary_count or 0) + (archive_count or 0)
        
        # Active projects
        active_projects = await db.scalar(
            select(func.count(Project.id)).where(
                and_(Project.user_id == user_id, Project.is_archived == False)
            )
        )
        
        # Overdue todos
        overdue_todos = await db.scalar(
            select(func.count(Todo.id)).where(
                and_(
                    Todo.user_id == user_id,
                    Todo.is_completed == False,
                    Todo.due_date < datetime.now(NEPAL_TZ)
                )
            )
        )
        
        # Diary streak
        diary_streak = await _calculate_diary_streak(db, user_id)
        
        # Storage used (approximate from file sizes)
        storage_result = await db.scalar(
            select(func.sum(Document.size_bytes)).where(Document.user_id == user_id)
        )
        archive_storage_result = await db.scalar(
            select(func.sum(ArchiveItem.file_size)).where(ArchiveItem.user_id == user_id)
        )
        
        total_storage_bytes = (storage_result or 0) + (archive_storage_result or 0)
        storage_mb = total_storage_bytes / (1024 * 1024)  # Convert to MB
        
        return QuickStats(
            total_items=total_items,
            active_projects=active_projects or 0,
            overdue_todos=overdue_todos or 0,
            current_diary_streak=diary_streak,
            storage_used_mb=round(storage_mb, 2)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load quick statistics: {str(e)}"
        )

async def _calculate_diary_streak(db: AsyncSession, user_id: int) -> int:
    """Calculate the current consecutive diary writing streak"""
    try:
        # Get the most recent diary entries ordered by date descending
        result = await db.execute(
            select(DiaryEntry.date)
            .where(DiaryEntry.user_id == user_id)
            .order_by(DiaryEntry.date.desc())
            .limit(365)  # Look at most recent year
        )
        dates = [row[0] for row in result.fetchall()]
        
        if not dates:
            return 0
        
        # Check if there's an entry for today or yesterday
        today = datetime.now(NEPAL_TZ).date()
        yesterday = today - timedelta(days=1)
        
        # Start counting from today or yesterday
        if dates[0] == today:
            streak_start = today
        elif dates[0] == yesterday:
            streak_start = yesterday
        else:
            return 0  # No recent entries
        
        # Count consecutive days
        streak = 0
        current_date = streak_start
        
        for date in dates:
            if date == current_date:
                streak += 1
                current_date -= timedelta(days=1)
            elif date < current_date:
                # Gap found, streak ends
                break
        
        return streak
        
    except Exception:
        return 0 