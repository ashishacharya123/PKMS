"""
Thumbnail Generation Service
Creates and manages thumbnails for images and documents
"""

from pathlib import Path
from typing import Optional, Dict
from PIL import Image
import logging

# Note: Pillow is now included in both requirements.txt and requirements-slim.txt
# for full thumbnail generation support. Compatible with python:3.11-slim base image.

logger = logging.getLogger(__name__)

class ThumbnailService:
    """Service for generating and managing thumbnails"""
    
    def __init__(self):
        self.thumbnail_sizes = {
            'small': (150, 150),    # List view thumbnails
            'medium': (300, 300),   # Detail view thumbnails
            'large': (600, 600)     # Full preview thumbnails
        }
        self.supported_image_types = {
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
            'image/webp', 'image/bmp', 'image/tiff'
        }
        self.supported_document_types = set()  # No document thumbnails - UI will show file type icons
    
    async def generate_thumbnail(
        self, 
        file_path: Path, 
        output_dir: Path,
        size: str = 'medium',
        force_regenerate: bool = False
    ) -> Optional[Path]:
        """
        Generate thumbnail for a file
        
        Args:
            file_path: Path to the original file
            output_dir: Directory to save thumbnail
            size: Thumbnail size ('small', 'medium', 'large')
            force_regenerate: Force regeneration even if thumbnail exists
            
        Returns:
            Path to generated thumbnail or None if failed
        """
        try:
            if not file_path.exists():
                logger.error(f"File not found: {file_path}")
                return None
            
            # Check if file type is supported
            mime_type = self._get_mime_type(file_path)
            if not self._is_supported_type(mime_type):
                logger.warning(f"Unsupported file type for thumbnail: {mime_type}")
                return None
            
            # Create output directory
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate consistent thumbnail filename
            # Format: {original_filename}_{size}.jpg (always .jpg for consistency)
            file_hash = await self._get_file_hash(file_path)
            thumbnail_name = f"{file_hash}_{size}.jpg"
            thumbnail_path = output_dir / thumbnail_name
            
            # Check if thumbnail already exists
            if thumbnail_path.exists() and not force_regenerate:
                logger.info(f"Thumbnail already exists: {thumbnail_path}")
                return thumbnail_path
            
            # Generate thumbnail based on file type
            if mime_type in self.supported_image_types:
                return await self._generate_image_thumbnail(file_path, thumbnail_path, size)
            else:
                # For documents (PDF, Word, etc.), no thumbnails - UI will show file type icons
                logger.info(f"Skipping thumbnail generation for document type: {mime_type}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to generate thumbnail for {file_path}: {e}")
            return None
    
    async def _generate_image_thumbnail(
        self, 
        file_path: Path, 
        thumbnail_path: Path, 
        size: str
    ) -> Optional[Path]:
        """Generate thumbnail for image files"""
        try:
            # Get thumbnail dimensions
            max_width, max_height = self.thumbnail_sizes[size]
            
            # Open and process image
            with Image.open(file_path) as img:
                # Convert to RGB if necessary
                if img.mode in ('RGBA', 'LA', 'P'):
                    img = img.convert('RGB')
                
                # Create thumbnail maintaining aspect ratio
                img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
                
                # Create a square thumbnail with white background
                thumbnail = Image.new('RGB', (max_width, max_height), 'white')
                
                # Calculate position to center the image
                x = (max_width - img.width) // 2
                y = (max_height - img.height) // 2
                thumbnail.paste(img, (x, y))
                
                # Save thumbnail with optimized JPEG settings
                thumbnail.save(thumbnail_path, 'JPEG', quality=75, optimize=True, progressive=True)
                
            logger.info(f"Generated image thumbnail: {thumbnail_path}")
            return thumbnail_path
            
        except Exception as e:
            logger.error(f"Failed to generate image thumbnail: {e}")
            return None
    
    # Document thumbnail generation removed - UI will show file type icons for documents
    # PDFs, Word docs, etc. will use file type icons instead of generated thumbnails
    
    def _get_mime_type(self, file_path: Path) -> str:
        """Get MIME type for file"""
        import mimetypes
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return mime_type or 'application/octet-stream'
    
    def _is_supported_type(self, mime_type: str) -> bool:
        """Check if file type is supported for thumbnail generation"""
        return (mime_type in self.supported_image_types or 
                mime_type in self.supported_document_types)
    
    async def _get_file_hash(self, file_path: Path) -> str:
        """Generate consistent hash for file to avoid duplicate thumbnails"""
        import hashlib
        import asyncio

        # Use file path + modification time for consistent hash
        # This ensures same file = same hash, even if moved
        stat_result = await asyncio.to_thread(file_path.stat)
        file_info = f"{file_path.name}_{stat_result.st_mtime}"
        return hashlib.md5(file_info.encode()).hexdigest()[:12]  # 12 chars is enough
    
    async def generate_all_sizes(self, file_path: Path, output_dir: Path) -> Dict[str, Optional[Path]]:
        """Generate thumbnails for all sizes"""
        results = {}
        
        for size in self.thumbnail_sizes.keys():
            results[size] = await self.generate_thumbnail(file_path, output_dir, size)
        
        return results
    
    async def cleanup_thumbnails(self, file_path: Path, thumbnail_dir: Path):
        """Clean up thumbnails when original file is deleted"""
        try:
            file_hash = await self._get_file_hash(file_path)
            
            for size in self.thumbnail_sizes.keys():
                thumbnail_name = f"{file_hash}_{size}.jpg"
                thumbnail_path = thumbnail_dir / thumbnail_name
                
                if thumbnail_path.exists():
                    thumbnail_path.unlink()
                    logger.info(f"Cleaned up thumbnail: {thumbnail_path}")
                    
        except Exception as e:
            logger.error(f"Failed to cleanup thumbnails for {file_path}: {e}")
    
    async def get_thumbnail_path(self, file_path: Path, thumbnail_dir: Path, size: str = 'medium') -> Optional[Path]:
        """Get path to existing thumbnail"""
        file_hash = await self._get_file_hash(file_path)
        thumbnail_name = f"{file_hash}_{size}.jpg"
        thumbnail_path = thumbnail_dir / thumbnail_name
        
        return thumbnail_path if thumbnail_path.exists() else None

# Global thumbnail service
thumbnail_service = ThumbnailService()
