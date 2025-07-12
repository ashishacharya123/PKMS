from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict, Any, Optional
from datetime import datetime
from rapidfuzz import process, fuzz
from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.todo import Todo, Project
from app.models.note import Note
from app.models.document import Document
from app.models.diary import DiaryEntry
from app.models.archive import ArchiveItem, ArchiveFolder
from app.models.tag import Tag
import json

router = APIRouter(tags=["advanced-fuzzy-search"])

@router.get("/advanced-fuzzy-search")
async def advanced_fuzzy_search(
    query: str = Query(..., min_length=2),
    limit: int = Query(30, ge=1, le=100),
    modules: str = Query(None, description="Comma-separated list of modules to search (todo,project,note,document,diary,archive)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> List[Dict[str, Any]]:
    """
    Perform a slow, typo-tolerant fuzzy search across selected user content modules.
    Returns a flat, relevance-ranked list with summary fields.
    """
    results = []
    user_id = current_user.id
    # Parse modules param
    allowed_modules = {"todo", "project", "note", "document", "diary", "archive"}
    if modules:
        selected_modules = set(m.strip().lower() for m in modules.split(",") if m.strip()) & allowed_modules
        if not selected_modules:
            selected_modules = allowed_modules
    else:
        selected_modules = allowed_modules
    # --- TODOS & PROJECTS ---
    if "todo" in selected_modules:
        todo_rows = (await db.execute(select(Todo).where(Todo.user_id == user_id))).scalars().all()
        project_map = {p.id: p for p in (await db.execute(select(Project).where(Project.user_id == user_id))).scalars().all()}
        for todo in todo_rows:
            project = project_map.get(todo.project_id)
            todo_tags = [t.name for t in getattr(todo, 'tag_objs', [])] if hasattr(todo, 'tag_objs') else []
            search_blob = f"{todo.title or ''} {todo.description or ''} {' '.join(todo_tags)} {project.name if project else ''}"
            score = fuzz.token_set_ratio(query, search_blob)
            results.append({
                "type": "todo",
                "title": todo.title,
                "tags": todo_tags,
                "description": todo.description,
                "module": "todo",
                "created_at": todo.created_at,
                "media_count": None,
                "type_info": f"{project.name if project else ''}: {todo.title}",
                "score": score
            })
    if "project" in selected_modules:
        project_map = {p.id: p for p in (await db.execute(select(Project).where(Project.user_id == user_id))).scalars().all()}
        for project in project_map.values():
            project_tags = [t.name for t in getattr(project, 'tag_objs', [])] if hasattr(project, 'tag_objs') else []
            search_blob = f"{project.name or ''} {project.description or ''} {' '.join(project_tags)}"
            score = fuzz.token_set_ratio(query, search_blob)
            results.append({
                "type": "project",
                "title": project.name,
                "tags": project_tags,
                "description": project.description,
                "module": "project",
                "created_at": project.created_at,
                "media_count": None,
                "type_info": project.name,
                "score": score
            })
    # --- NOTES ---
    if "note" in selected_modules:
        note_rows = (await db.execute(select(Note).where(Note.user_id == user_id))).scalars().all()
        for note in note_rows:
            note_tags = [t.name for t in getattr(note, 'tag_objs', [])] if hasattr(note, 'tag_objs') else []
            search_blob = f"{note.title or ''} {note.content or ''} {' '.join(note_tags)}"
            score = fuzz.token_set_ratio(query, search_blob)
            results.append({
                "type": "note",
                "title": note.title,
                "tags": note_tags,
                "description": None,
                "module": "note",
                "created_at": note.created_at,
                "media_count": None,
                "type_info": note.title,
                "score": score
            })
    # --- DOCUMENTS ---
    if "document" in selected_modules:
        doc_rows = (await db.execute(select(Document).where(Document.user_id == user_id))).scalars().all()
        for doc in doc_rows:
            doc_tags = [t.name for t in getattr(doc, 'tag_objs', [])] if hasattr(doc, 'tag_objs') else []
            search_blob = f"{doc.title or ''} {doc.original_name or ''} {doc.description or ''} {' '.join(doc_tags)}"
            score = fuzz.token_set_ratio(query, search_blob)
            results.append({
                "type": "document",
                "title": doc.title or doc.original_name,
                "tags": doc_tags,
                "description": doc.description,
                "module": "document",
                "created_at": doc.created_at,
                "media_count": None,
                "type_info": doc.title or doc.original_name,
                "score": score
            })
    # --- DIARY ---
    if "diary" in selected_modules:
        diary_rows = (await db.execute(select(DiaryEntry).where(DiaryEntry.user_id == user_id))).scalars().all()
        for entry in diary_rows:
            diary_tags = [t.name for t in getattr(entry, 'tag_objs', [])] if hasattr(entry, 'tag_objs') else []
            meta = json.loads(entry.metadata_json) if entry.metadata_json else {}
            meta_flat = ' '.join([str(v) for v in meta.values()])
            search_blob = f"{entry.title or ''} {' '.join(diary_tags)} {meta_flat} {entry.date}"
            score = fuzz.token_set_ratio(query, search_blob)
            results.append({
                "type": "diary",
                "title": entry.title,
                "tags": diary_tags,
                "description": None,
                "module": "diary",
                "created_at": entry.created_at,
                "media_count": entry.media_count if hasattr(entry, 'media_count') else None,
                "type_info": entry.title,
                "score": score
            })
    # --- ARCHIVE ---
    if "archive" in selected_modules:
        archive_rows = (await db.execute(select(ArchiveItem).where(ArchiveItem.user_id == user_id))).scalars().all()
        for item in archive_rows:
            archive_tags = [t.name for t in getattr(item, 'tag_objs', [])] if hasattr(item, 'tag_objs') else []
            meta = json.loads(item.metadata_json) if item.metadata_json else {}
            meta_flat = ' '.join([str(v) for v in meta.values()])
            search_blob = f"{item.name or ''} {item.original_filename or ''} {item.description or ''} {' '.join(archive_tags)} {meta_flat}"
            score = fuzz.token_set_ratio(query, search_blob)
            results.append({
                "type": "archive",
                "title": item.name,
                "tags": archive_tags,
                "description": item.description,
                "module": "archive",
                "created_at": item.created_at,
                "media_count": None,
                "type_info": item.name,
                "score": score
            })
    # Sort by score descending, return top N
    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:limit] 