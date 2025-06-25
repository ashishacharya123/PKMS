"""
Archive Router for hierarchical folder/file management
"""

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func, desc
from typing import List, Optional, Dict, Any
from datetime import datetime
from pathlib import Path
import json
import uuid as uuid_lib
import shutil
import aiofiles
import mimetypes

from app.database import get_db
from app.auth.dependencies import get_current_user
from app.models.user import User
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.tag import Tag
from app.config import get_data_dir
from app.services.ai_service import analyze_content, is_ai_enabled

router = APIRouter(prefix="/archive", tags=["archive"])

# Pydantic models
from pydantic import BaseModel, Field, validator

class FolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    parent_uuid: Optional[str] = None

    @validator('name')
    def validate_name(cls, v):
        if not v.strip():
            raise ValueError('Folder name cannot be empty')
        # Prevent filesystem-unsafe characters
        unsafe_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
        if any(char in v for char in unsafe_chars):
            raise ValueError('Folder name contains invalid characters')
        return v.strip()

class FolderUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    is_archived: Optional[bool] = None

    @validator('name')
    def validate_name(cls, v):
        if v is not None:
            if not v.strip():
                raise ValueError('Folder name cannot be empty')
            unsafe_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
            if any(char in v for char in unsafe_chars):
                raise ValueError('Folder name contains invalid characters')
        return v.strip() if v else v

class ItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    folder_uuid: Optional[str] = None
    tags: Optional[List[str]] = Field(None, max_items=20)
    is_archived: Optional[bool] = None
    is_favorite: Optional[bool] = None

class FolderResponse(BaseModel):
    uuid: str
    name: str
    description: Optional[str]
    parent_uuid: Optional[str]
    path: str
    is_archived: bool
    created_at: datetime
    updated_at: datetime
    item_count: int
    subfolder_count: int
    total_size: int

    class Config:
        from_attributes = True

class ItemResponse(BaseModel):
    uuid: str
    name: str
    description: Optional[str]
    folder_uuid: str
    original_filename: str
    stored_filename: str
    mime_type: str
    file_size: int
    extracted_text: Optional[str]
    metadata: Dict[str, Any]
    thumbnail_path: Optional[str]
    is_archived: bool
    is_favorite: bool
    version: str
    created_at: datetime
    updated_at: datetime
    tags: List[str]

    class Config:
        from_attributes = True

class ItemSummary(BaseModel):
    uuid: str
    name: str
    folder_uuid: str
    original_filename: str
    mime_type: str
    file_size: int
    is_archived: bool
    is_favorite: bool
    created_at: datetime
    updated_at: datetime
    tags: List[str]
    preview: str

    class Config:
        from_attributes = True

class FolderTree(BaseModel):
    folder: FolderResponse
    children: List['FolderTree']
    items: List[ItemSummary]

# Folder Management Endpoints

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    folder_data: FolderCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new archive folder"""
    
    # Verify parent folder exists and belongs to user if specified
    parent_path = ""
    if folder_data.parent_uuid:
        parent_result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == folder_data.parent_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        parent_folder = parent_result.scalar_one_or_none()
        if not parent_folder:
            raise HTTPException(status_code=404, detail="Parent folder not found")
        parent_path = parent_folder.path
    
    # Check for duplicate folder names in the same parent
    existing_result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.name == folder_data.name,
                ArchiveFolder.parent_uuid == folder_data.parent_uuid,
                ArchiveFolder.user_id == current_user.id
            )
        )
    )
    if existing_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400, 
            detail="A folder with this name already exists in this location"
        )
    
    # Create folder
    folder = ArchiveFolder(
        name=folder_data.name,
        description=folder_data.description,
        parent_uuid=folder_data.parent_uuid,
        path=f"{parent_path}/{folder_data.name}" if parent_path else folder_data.name,
        user_id=current_user.id
    )
    
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    
    return await _get_folder_with_stats(db, folder.uuid, current_user.id)

@router.get("/folders", response_model=List[FolderResponse])
async def list_folders(
    parent_uuid: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List folders with optional filtering"""
    
    query = select(ArchiveFolder).where(ArchiveFolder.user_id == current_user.id)
    
    # Filter by parent
    if parent_uuid:
        query = query.where(ArchiveFolder.parent_uuid == parent_uuid)
    else:
        query = query.where(ArchiveFolder.parent_uuid.is_(None))
    
    # Filter by archived status
    if not archived:
        query = query.where(ArchiveFolder.is_archived == False)
    
    # Search filter
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                ArchiveFolder.name.ilike(search_term),
                ArchiveFolder.description.ilike(search_term)
            )
        )
    
    query = query.order_by(ArchiveFolder.name)
    
    result = await db.execute(query)
    folders = result.scalars().all()
    
    # Get stats for each folder
    folder_responses = []
    for folder in folders:
        folder_response = await _get_folder_with_stats(db, folder.uuid, current_user.id)
        folder_responses.append(folder_response)
    
    return folder_responses

@router.get("/folders/tree", response_model=List[FolderTree])
async def get_folder_tree(
    root_uuid: Optional[str] = Query(None),
    archived: Optional[bool] = Query(False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get hierarchical folder tree structure"""
    
    async def build_tree(parent_uuid: Optional[str]) -> List[FolderTree]:
        # Get folders
        folder_query = select(ArchiveFolder).where(
            and_(
                ArchiveFolder.user_id == current_user.id,
                ArchiveFolder.parent_uuid == parent_uuid
            )
        )
        
        if not archived:
            folder_query = folder_query.where(ArchiveFolder.is_archived == False)
        
        folder_result = await db.execute(folder_query.order_by(ArchiveFolder.name))
        folders = folder_result.scalars().all()
        
        tree = []
        for folder in folders:
            # Get folder stats
            folder_response = await _get_folder_with_stats(db, folder.uuid, current_user.id)
            
            # Get items in this folder
            items_query = select(ArchiveItem).where(
                and_(
                    ArchiveItem.folder_uuid == folder.uuid,
                    ArchiveItem.user_id == current_user.id
                )
            )
            
            if not archived:
                items_query = items_query.where(ArchiveItem.is_archived == False)
            
            items_result = await db.execute(items_query.order_by(ArchiveItem.name))
            items = items_result.scalars().all()
            
            item_summaries = []
            for item in items:
                item_summary = await _get_item_summary(db, item.uuid, current_user.id)
                item_summaries.append(item_summary)
            
            # Recursively build children
            children = await build_tree(folder.uuid)
            
            tree.append(FolderTree(
                folder=folder_response,
                children=children,
                items=item_summaries
            ))
        
        return tree
    
    return await build_tree(root_uuid)

@router.get("/folders/{folder_uuid}", response_model=FolderResponse)
async def get_folder(
    folder_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get folder details"""
    return await _get_folder_with_stats(db, folder_uuid, current_user.id)

@router.put("/folders/{folder_uuid}", response_model=FolderResponse)
async def update_folder(
    folder_uuid: str,
    folder_data: FolderUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update folder"""
    
    # Get folder
    result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.uuid == folder_uuid,
                ArchiveFolder.user_id == current_user.id
            )
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check for duplicate names if name is being changed
    if folder_data.name and folder_data.name != folder.name:
        existing_result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.name == folder_data.name,
                    ArchiveFolder.parent_uuid == folder.parent_uuid,
                    ArchiveFolder.user_id == current_user.id,
                    ArchiveFolder.uuid != folder_uuid
                )
            )
        )
        if existing_result.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail="A folder with this name already exists in this location"
            )
    
    # Update folder
    if folder_data.name:
        folder.name = folder_data.name
        # Update path
        if folder.parent_uuid:
            parent_result = await db.execute(
                select(ArchiveFolder).where(ArchiveFolder.uuid == folder.parent_uuid)
            )
            parent = parent_result.scalar_one()
            folder.path = f"{parent.path}/{folder.name}"
        else:
            folder.path = folder.name
    
    if folder_data.description is not None:
        folder.description = folder_data.description
    
    if folder_data.is_archived is not None:
        folder.is_archived = folder_data.is_archived
    
    folder.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(folder)
    
    return await _get_folder_with_stats(db, folder.uuid, current_user.id)

@router.delete("/folders/{folder_uuid}")
async def delete_folder(
    folder_uuid: str,
    force: bool = Query(False, description="Force delete non-empty folder"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete folder"""
    
    # Get folder
    result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.uuid == folder_uuid,
                ArchiveFolder.user_id == current_user.id
            )
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check if folder is empty unless force delete
    if not force:
        # Check for subfolders
        subfolder_result = await db.execute(
            select(func.count(ArchiveFolder.uuid)).where(
                ArchiveFolder.parent_uuid == folder_uuid
            )
        )
        subfolder_count = subfolder_result.scalar()
        
        # Check for items
        item_result = await db.execute(
            select(func.count(ArchiveItem.uuid)).where(
                ArchiveItem.folder_uuid == folder_uuid
            )
        )
        item_count = item_result.scalar()
        
        if subfolder_count > 0 or item_count > 0:
            raise HTTPException(
                status_code=400,
                detail="Folder is not empty. Use force=true to delete non-empty folder."
            )
    
    # Delete folder (cascade will handle children and items)
    await db.delete(folder)
    await db.commit()
    
    return {"message": "Folder deleted successfully"}

# Item Management Endpoints

@router.post("/folders/{folder_uuid}/items", response_model=ItemResponse)
async def upload_item(
    folder_uuid: str,
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),  # JSON string of tag list
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload item to folder"""
    
    # Verify folder exists and belongs to user
    folder_result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.uuid == folder_uuid,
                ArchiveFolder.user_id == current_user.id
            )
        )
    )
    folder = folder_result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Parse tags
    tag_list = []
    if tags:
        try:
            tag_list = json.loads(tags)
        except json.JSONDecodeError:
            tag_list = [tag.strip() for tag in tags.split(',') if tag.strip()]
    
    # Create storage directory
    storage_dir = get_data_dir() / "archive" / folder_uuid
    storage_dir.mkdir(parents=True, exist_ok=True)
    
    # Generate unique filename
    file_uuid = str(uuid_lib.uuid4())
    file_extension = Path(file.filename).suffix
    stored_filename = f"{file_uuid}{file_extension}"
    file_path = storage_dir / stored_filename
    
    # Save file
    try:
        async with aiofiles.open(file_path, 'wb') as f:
            content = await file.read()
            await f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
    
    # Get file info
    file_size = len(content)
    mime_type = mimetypes.guess_type(file.filename)[0] or 'application/octet-stream'
    
    # Extract text content for search
    extracted_text = await _extract_text_from_file(file_path, mime_type)
    
    # Generate metadata
    metadata = await _extract_metadata(file_path, mime_type, file.filename)
    
    # AI analysis for smart tagging
    ai_tags = []
    if is_ai_enabled() and extracted_text:
        try:
            analysis = await analyze_content(extracted_text, "archive")
            ai_tags = analysis.get("tags", [])
        except Exception as e:
            print(f"AI analysis failed: {e}")
    
    # Combine tags
    all_tags = list(set(tag_list + ai_tags))
    
    # Create item
    item = ArchiveItem(
        name=name or Path(file.filename).stem,
        description=description,
        folder_uuid=folder_uuid,
        original_filename=file.filename,
        stored_filename=stored_filename,
        file_path=str(file_path),
        mime_type=mime_type,
        file_size=file_size,
        extracted_text=extracted_text,
        metadata_json=json.dumps(metadata),
        user_id=current_user.id
    )
    
    db.add(item)
    await db.commit()
    await db.refresh(item)
    
    # Handle tags
    if all_tags:
        await _handle_item_tags(db, item, all_tags, current_user.id)
    
    return await _get_item_with_relations(db, item.uuid, current_user.id)

@router.get("/folders/{folder_uuid}/items", response_model=List[ItemSummary])
async def list_folder_items(
    folder_uuid: str,
    archived: Optional[bool] = Query(False),
    search: Optional[str] = Query(None),
    mime_type: Optional[str] = Query(None),
    tag: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List items in folder"""
    
    # Verify folder access
    folder_result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.uuid == folder_uuid,
                ArchiveFolder.user_id == current_user.id
            )
        )
    )
    if not folder_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Build query
    query = select(ArchiveItem).where(
        and_(
            ArchiveItem.folder_uuid == folder_uuid,
            ArchiveItem.user_id == current_user.id
        )
    )
    
    # Filters
    if not archived:
        query = query.where(ArchiveItem.is_archived == False)
    
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                ArchiveItem.name.ilike(search_term),
                ArchiveItem.original_filename.ilike(search_term),
                ArchiveItem.extracted_text.ilike(search_term)
            )
        )
    
    if mime_type:
        if mime_type.endswith('/'):
            query = query.where(ArchiveItem.mime_type.like(f"{mime_type}%"))
        else:
            query = query.where(ArchiveItem.mime_type == mime_type)
    
    if tag:
        # Join with tags to filter by tag
        query = query.join(ArchiveItem.tags).where(Tag.name == tag)
    
    # Pagination and ordering
    query = query.order_by(desc(ArchiveItem.updated_at)).offset(offset).limit(limit)
    
    result = await db.execute(query)
    items = result.scalars().all()
    
    # Convert to summaries
    summaries = []
    for item in items:
        summary = await _get_item_summary(db, item.uuid, current_user.id)
        summaries.append(summary)
    
    return summaries

@router.get("/items/{item_uuid}", response_model=ItemResponse)
async def get_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get item details"""
    return await _get_item_with_relations(db, item_uuid, current_user.id)

@router.put("/items/{item_uuid}", response_model=ItemResponse)
async def update_item(
    item_uuid: str,
    item_data: ItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update item"""
    
    # Get item
    result = await db.execute(
        select(ArchiveItem).where(
            and_(
                ArchiveItem.uuid == item_uuid,
                ArchiveItem.user_id == current_user.id
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Update fields
    if item_data.name:
        item.name = item_data.name
    
    if item_data.description is not None:
        item.description = item_data.description
    
    if item_data.folder_uuid:
        # Verify new folder exists and belongs to user
        folder_result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.uuid == item_data.folder_uuid,
                    ArchiveFolder.user_id == current_user.id
                )
            )
        )
        if not folder_result.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Target folder not found")
        item.folder_uuid = item_data.folder_uuid
    
    if item_data.is_archived is not None:
        item.is_archived = item_data.is_archived
    
    if item_data.is_favorite is not None:
        item.is_favorite = item_data.is_favorite
    
    item.updated_at = datetime.utcnow()
    
    # Handle tags
    if item_data.tags is not None:
        await _handle_item_tags(db, item, item_data.tags, current_user.id)
    
    await db.commit()
    await db.refresh(item)
    
    return await _get_item_with_relations(db, item.uuid, current_user.id)

@router.delete("/items/{item_uuid}")
async def delete_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete item"""
    
    # Get item
    result = await db.execute(
        select(ArchiveItem).where(
            and_(
                ArchiveItem.uuid == item_uuid,
                ArchiveItem.user_id == current_user.id
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Delete file
    file_path = Path(item.file_path)
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as e:
            print(f"Failed to delete file {file_path}: {e}")
    
    # Delete item
    await db.delete(item)
    await db.commit()
    
    return {"message": "Item deleted successfully"}

@router.get("/items/{item_uuid}/download")
async def download_item(
    item_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Download item file"""
    
    # Get item
    result = await db.execute(
        select(ArchiveItem).where(
            and_(
                ArchiveItem.uuid == item_uuid,
                ArchiveItem.user_id == current_user.id
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    file_path = Path(item.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=str(file_path),
        filename=item.original_filename,
        media_type=item.mime_type
    )

# Search Endpoints

@router.get("/search")
async def search_archive(
    query: str = Query(..., min_length=1),
    folder_uuid: Optional[str] = Query(None),
    mime_type: Optional[str] = Query(None),
    limit: int = Query(20, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Search across archive items"""
    
    search_term = f"%{query}%"
    
    # Build query
    item_query = select(ArchiveItem).where(
        and_(
            ArchiveItem.user_id == current_user.id,
            or_(
                ArchiveItem.name.ilike(search_term),
                ArchiveItem.original_filename.ilike(search_term),
                ArchiveItem.extracted_text.ilike(search_term)
            )
        )
    )
    
    # Filters
    if folder_uuid:
        item_query = item_query.where(ArchiveItem.folder_uuid == folder_uuid)
    
    if mime_type:
        if mime_type.endswith('/'):
            item_query = item_query.where(ArchiveItem.mime_type.like(f"{mime_type}%"))
        else:
            item_query = item_query.where(ArchiveItem.mime_type == mime_type)
    
    item_query = item_query.order_by(desc(ArchiveItem.updated_at)).limit(limit)
    
    result = await db.execute(item_query)
    items = result.scalars().all()
    
    # Convert to search results
    search_results = []
    for item in items:
        highlight = ""
        if item.extracted_text:
            # Simple highlighting - find query in text
            text_lower = item.extracted_text.lower()
            query_lower = query.lower()
            start_idx = text_lower.find(query_lower)
            if start_idx != -1:
                start = max(0, start_idx - 50)
                end = min(len(item.extracted_text), start_idx + len(query) + 50)
                highlight = item.extracted_text[start:end]
        
        search_results.append({
            "uuid": item.uuid,
            "name": item.name,
            "original_filename": item.original_filename,
            "mime_type": item.mime_type,
            "highlight": highlight or item.name,
            "folder_uuid": item.folder_uuid,
            "created_at": item.created_at
        })
    
    return {"results": search_results, "total": len(search_results)}

# Helper functions

async def _get_folder_with_stats(db: AsyncSession, folder_uuid: str, user_id: int) -> FolderResponse:
    """Get folder with statistics"""
    
    # Get folder
    result = await db.execute(
        select(ArchiveFolder).where(
            and_(
                ArchiveFolder.uuid == folder_uuid,
                ArchiveFolder.user_id == user_id
            )
        )
    )
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Get item count and total size
    item_stats = await db.execute(
        select(
            func.count(ArchiveItem.uuid),
            func.coalesce(func.sum(ArchiveItem.file_size), 0)
        ).where(
            and_(
                ArchiveItem.folder_uuid == folder_uuid,
                ArchiveItem.user_id == user_id
            )
        )
    )
    item_count, total_size = item_stats.one()
    
    # Get subfolder count
    subfolder_result = await db.execute(
        select(func.count(ArchiveFolder.uuid)).where(
            and_(
                ArchiveFolder.parent_uuid == folder_uuid,
                ArchiveFolder.user_id == user_id
            )
        )
    )
    subfolder_count = subfolder_result.scalar()
    
    return FolderResponse(
        uuid=folder.uuid,
        name=folder.name,
        description=folder.description,
        parent_uuid=folder.parent_uuid,
        path=folder.path,
        is_archived=folder.is_archived,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        item_count=item_count,
        subfolder_count=subfolder_count,
        total_size=total_size
    )

async def _get_item_with_relations(db: AsyncSession, item_uuid: str, user_id: int) -> ItemResponse:
    """Get item with tags and relations"""
    
    # Get item
    result = await db.execute(
        select(ArchiveItem).where(
            and_(
                ArchiveItem.uuid == item_uuid,
                ArchiveItem.user_id == user_id
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Get tags
    tag_result = await db.execute(
        select(Tag.name).join(ArchiveItem.tags).where(ArchiveItem.uuid == item_uuid)
    )
    tags = [tag[0] for tag in tag_result.all()]
    
    return ItemResponse(
        uuid=item.uuid,
        name=item.name,
        description=item.description,
        folder_uuid=item.folder_uuid,
        original_filename=item.original_filename,
        stored_filename=item.stored_filename,
        mime_type=item.mime_type,
        file_size=item.file_size,
        extracted_text=item.extracted_text,
        metadata=item.metadata,
        thumbnail_path=item.thumbnail_path,
        is_archived=item.is_archived,
        is_favorite=item.is_favorite,
        version=item.version,
        created_at=item.created_at,
        updated_at=item.updated_at,
        tags=tags
    )

async def _get_item_summary(db: AsyncSession, item_uuid: str, user_id: int) -> ItemSummary:
    """Get item summary"""
    
    # Get item
    result = await db.execute(
        select(ArchiveItem).where(
            and_(
                ArchiveItem.uuid == item_uuid,
                ArchiveItem.user_id == user_id
            )
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Get tags
    tag_result = await db.execute(
        select(Tag.name).join(ArchiveItem.tags).where(ArchiveItem.uuid == item_uuid)
    )
    tags = [tag[0] for tag in tag_result.all()]
    
    # Generate preview
    preview = item.extracted_text[:200] + "..." if item.extracted_text and len(item.extracted_text) > 200 else item.extracted_text or ""
    
    return ItemSummary(
        uuid=item.uuid,
        name=item.name,
        folder_uuid=item.folder_uuid,
        original_filename=item.original_filename,
        mime_type=item.mime_type,
        file_size=item.file_size,
        is_archived=item.is_archived,
        is_favorite=item.is_favorite,
        created_at=item.created_at,
        updated_at=item.updated_at,
        tags=tags,
        preview=preview
    )

async def _handle_item_tags(db: AsyncSession, item: ArchiveItem, tag_names: List[str], user_id: int):
    """Handle item tags"""
    
    # Clear existing tags
    item.tags.clear()
    
    # Add new tags
    for tag_name in tag_names:
        if not tag_name.strip():
            continue
        
        # Get or create tag
        tag_result = await db.execute(
            select(Tag).where(
                and_(
                    Tag.name == tag_name.strip(),
                    Tag.module_type == "archive",
                    Tag.user_id == user_id
                )
            )
        )
        tag = tag_result.scalar_one_or_none()
        
        if not tag:
            tag = Tag(
                name=tag_name.strip(),
                module_type="archive",
                user_id=user_id
            )
            db.add(tag)
        
        item.tags.append(tag)
    
    await db.commit()

# Import document processing functions from documents router
async def _extract_text_from_file(file_path: Path, mime_type: str) -> Optional[str]:
    """Extract text content from file for search indexing"""
    # This would be similar to the document router implementation
    # For now, return None - implement based on your needs
    return None

async def _extract_metadata(file_path: Path, mime_type: str, original_name: str) -> Dict[str, Any]:
    """Extract metadata from file"""
    # Basic metadata
    metadata = {
        "original_name": original_name,
        "mime_type": mime_type,
        "size": file_path.stat().st_size
    }
    
    # Add more metadata based on file type
    if mime_type.startswith('image/'):
        # Could add image dimensions, EXIF data, etc.
        pass
    elif mime_type == 'application/pdf':
        # Could add page count, PDF metadata, etc.
        pass
    
    return metadata 