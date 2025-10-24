"""
Archive Path Service
Handles path generation, validation, and hierarchy traversal for archive system
"""

import re
import os
from pathlib import Path
from typing import Optional, List, Dict, Any, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
import logging

from app.models.archive import ArchiveFolder

logger = logging.getLogger(__name__)


class ArchivePathService:
    """Service for handling archive path operations and validation"""
    
    def __init__(self):
        # Path security patterns
        self.DANGEROUS_PATTERNS = [
            r'\.\.',  # Path traversal
            r'/',     # Absolute paths
            r'\\',    # Windows absolute paths
            r'[<>:"|?*]',  # Invalid filename characters
            r'[\x00-\x1f]',  # Control characters
        ]
        
        # Maximum path lengths
        self.MAX_FOLDER_NAME_LENGTH = 255
        self.MAX_PATH_DEPTH = 10
        self.MAX_TOTAL_PATH_LENGTH = 1000
    
    async def _get_all_folders_map(
        self,
        db: AsyncSession,
        created_by: str
    ) -> Dict[str, ArchiveFolder]:
        """
        Fetch all folders for user in a single query and return as UUID->Folder map.
        This enables O(1) lookups for path traversal without additional queries.
        """
        result = await db.execute(
            select(ArchiveFolder).where(
                and_(
                    ArchiveFolder.created_by == created_by,
                    ArchiveFolder.is_deleted == False
                )
            )
        )
        folders = result.scalars().all()
        return {folder.uuid: folder for folder in folders}
    
    async def get_filesystem_path(
        self, 
        folder_uuid: str, 
        db: AsyncSession, 
        created_by: Optional[str] = None
    ) -> str:
        """Build UUID-based path for actual file storage (OPTIMIZED)"""
        if not folder_uuid:
            return "/"
        
        # OPTIMIZATION: Fetch all folders once
        folder_map = await self._get_all_folders_map(db, created_by)
        
        folder = folder_map.get(folder_uuid)
        if not folder:
            return "/"
        
        # Build path by traversing in-memory map
        path_parts = [folder.uuid]
        current_parent = folder.parent_uuid
        visited: Set[str] = {folder.uuid}
        
        while current_parent:
            if current_parent in visited:
                logger.error(f"Cycle detected in folder hierarchy: {current_parent}")
                break
            visited.add(current_parent)
            
            parent_folder = folder_map.get(current_parent)
            if not parent_folder:
                break
                
            path_parts.insert(0, parent_folder.uuid)
            current_parent = parent_folder.parent_uuid
        
        return "/" + "/".join(path_parts) + "/"
    
    async def get_display_path(
        self, 
        folder_uuid: str, 
        db: AsyncSession, 
        created_by: Optional[str] = None
    ) -> str:
        """Build name-based path for user display (OPTIMIZED)"""
        if not folder_uuid:
            return "/"
        
        # OPTIMIZATION: Fetch all folders once
        folder_map = await self._get_all_folders_map(db, created_by)
        
        folder = folder_map.get(folder_uuid)
        if not folder:
            return "/"
        
        # Build path by traversing in-memory map
        path_parts = [folder.name]
        current_parent = folder.parent_uuid
        visited: Set[str] = {folder.uuid}
        
        while current_parent:
            if current_parent in visited:
                logger.error(f"Cycle detected in folder hierarchy: {current_parent}")
                break
            visited.add(current_parent)
            
            parent_folder = folder_map.get(current_parent)
            if not parent_folder:
                break
                
            path_parts.insert(0, parent_folder.name)
            current_parent = parent_folder.parent_uuid
        
        return "/" + "/".join(path_parts) + "/"
    
    def validate_folder_name(self, name: str) -> Dict[str, Any]:
        """Validate folder name for security and constraints"""
        errors = []
        
        # Check if empty
        if not name or not name.strip():
            errors.append("Folder name cannot be empty")
            return {"valid": False, "errors": errors}
        
        name = name.strip()
        
        # Check length
        if len(name) > self.MAX_FOLDER_NAME_LENGTH:
            errors.append(f"Folder name too long (max {self.MAX_FOLDER_NAME_LENGTH} characters)")
        
        # Check for dangerous patterns
        for pattern in self.DANGEROUS_PATTERNS:
            if re.search(pattern, name):
                errors.append(f"Folder name contains invalid characters: {pattern}")
        
        # Check for reserved names
        reserved_names = {
            'CON', 'PRN', 'AUX', 'NUL',
            'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
            'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
        }
        if name.upper() in reserved_names:
            errors.append(f"Folder name '{name}' is reserved")
        
        # Check for trailing dots or spaces (Windows issue)
        if name.endswith('.') or name.endswith(' '):
            errors.append("Folder name cannot end with dot or space")
        
        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "sanitized_name": name if len(errors) == 0 else None
        }
    
    async def validate_folder_name_uniqueness(
        self, 
        name: str, 
        parent_uuid: Optional[str], 
        db: AsyncSession, 
        created_by: str,
        exclude_uuid: Optional[str] = None
    ) -> bool:
        """Check if folder name is unique within parent folder"""
        cond = and_(
            ArchiveFolder.name == name,
            ArchiveFolder.parent_uuid == parent_uuid,
            ArchiveFolder.created_by == created_by,
            ArchiveFolder.is_deleted == False
        )
        
        if exclude_uuid:
            cond = and_(cond, ArchiveFolder.uuid != exclude_uuid)
        
        result = await db.execute(select(ArchiveFolder).where(cond))
        existing_folder = result.scalar_one_or_none()
        
        return existing_folder is None
    
    async def build_hierarchy(
        self, 
        db: AsyncSession, 
        created_by: str, 
        parent_uuid: Optional[str] = None,
        max_depth: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Build folder hierarchy tree structure - OPTIMIZED to avoid N+1 queries"""
        # BATCH LOAD: Get ALL folders for the user in a single query
        cond = and_(
            ArchiveFolder.created_by == created_by,
            ArchiveFolder.is_deleted == False
        )
        
        # If max_depth is specified, limit the depth
        if max_depth is not None:
            cond = and_(cond, ArchiveFolder.depth <= max_depth)
        
        result = await db.execute(select(ArchiveFolder).where(cond).order_by(ArchiveFolder.depth, ArchiveFolder.name))
        all_folders = result.scalars().all()
        
        # Build folder lookup map
        folder_map = {folder.uuid: folder for folder in all_folders}
        
        # Build children map (parent_uuid -> list of children)
        children_map = {}
        for folder in all_folders:
            if folder.parent_uuid not in children_map:
                children_map[folder.parent_uuid] = []
            children_map[folder.parent_uuid].append(folder)
        
        def build_folder_data(folder):
            """Build folder data with children"""
            folder_data = {
                "uuid": folder.uuid,
                "name": folder.name,
                "description": folder.description,
                "parent_uuid": folder.parent_uuid,
                "is_favorite": folder.is_favorite,
                "depth": folder.depth,
                "item_count": folder.item_count,
                "total_size": folder.total_size,
                "created_at": folder.created_at,
                "updated_at": folder.updated_at,
                "children": []
            }
            
            # Add children if they exist
            if folder.uuid in children_map:
                folder_data["children"] = [
                    build_folder_data(child) 
                    for child in children_map[folder.uuid]
                ]
            
            return folder_data
        
        # Build hierarchy starting from the requested parent
        if parent_uuid is not None:
            # Return children of the specified parent
            root_folders = children_map.get(parent_uuid, [])
        else:
            # Return root folders (no parent)
            root_folders = children_map.get(None, [])
        
        return [build_folder_data(folder) for folder in root_folders]
    
    async def detect_cycle(
        self, 
        folder_uuid: str, 
        new_parent_uuid: Optional[str], 
        db: AsyncSession, 
        created_by: str
    ) -> bool:
        """Detect if moving folder would create a cycle"""
        if not new_parent_uuid:
            return False  # Moving to root, no cycle possible
        
        if folder_uuid == new_parent_uuid:
            return True  # Direct self-reference
        
        # Check if new_parent is a descendant of folder_uuid
        current_parent = new_parent_uuid
        visited: Set[str] = {folder_uuid}
        
        while current_parent:
            if current_parent in visited:
                return True  # Cycle detected
            
            visited.add(current_parent)
            
            # Get parent folder
            result = await db.execute(
                select(ArchiveFolder).where(
                    and_(
                        ArchiveFolder.uuid == current_parent,
                        ArchiveFolder.created_by == created_by,
                        ArchiveFolder.is_deleted == False
                    )
                )
            )
            parent_folder = result.scalar_one_or_none()
            
            if not parent_folder:
                break
            
            current_parent = parent_folder.parent_uuid
        
        return False
    
    def sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for safe storage"""
        if not filename:
            return "unnamed_file"
        
        # Remove path separators and dangerous characters
        for pattern in self.DANGEROUS_PATTERNS:
            filename = re.sub(pattern, '_', filename)
        
        # Remove leading/trailing dots and spaces
        filename = filename.strip('. ')
        
        # Ensure it's not empty after sanitization
        if not filename:
            return "unnamed_file"
        
        # Truncate if too long
        if len(filename) > self.MAX_FOLDER_NAME_LENGTH:
            name, ext = os.path.splitext(filename)
            max_name_length = self.MAX_FOLDER_NAME_LENGTH - len(ext)
            filename = name[:max_name_length] + ext
        
        return filename
    
    async def get_folder_breadcrumb(
        self, 
        folder_uuid: str, 
        db: AsyncSession, 
        created_by: str
    ) -> List[Dict[str, str]]:
        """Get breadcrumb path for folder navigation (OPTIMIZED)"""
        if not folder_uuid:
            return []
        
        # OPTIMIZATION: Fetch all folders once
        folder_map = await self._get_all_folders_map(db, created_by)
        
        breadcrumb = []
        current_uuid = folder_uuid
        visited: Set[str] = set()
        
        while current_uuid:
            if current_uuid in visited:
                logger.error(f"Cycle detected in breadcrumb generation: {current_uuid}")
                break
            
            visited.add(current_uuid)
            folder = folder_map.get(current_uuid)
            
            if not folder:
                break
            
            breadcrumb.insert(0, {
                "uuid": folder.uuid,
                "name": folder.name
            })
            
            current_uuid = folder.parent_uuid
        
        return breadcrumb


# Global instance
archive_path_service = ArchivePathService()
