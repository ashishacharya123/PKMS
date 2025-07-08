"""
Chunk Assembly Service
Handles assembling uploaded chunks into complete files with validation
"""

import asyncio
import aiofiles
from pathlib import Path
import hashlib
import logging
from typing import Dict, Optional, List
import json
import shutil
from datetime import datetime, timedelta

from app.config import settings, get_data_dir

logger = logging.getLogger(__name__)

class ChunkAssemblyService:
    """Service for assembling and validating chunked file uploads"""
    
    def __init__(self):
        self.temp_dir = Path(get_data_dir()) / "temp_uploads"
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.assemblies: Dict[str, Dict] = {}
        self.cleanup_task = None
        self._initialized = False

    async def initialize(self):
        """Initialize the service with async tasks"""
        if not self._initialized:
            try:
                self.cleanup_task = asyncio.create_task(self._cleanup_old_files())
                self._initialized = True
                logger.info("Chunk assembly service initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize chunk assembly service: {e}")

    async def _cleanup_old_files(self):
        """Periodically clean up old temporary files"""
        while True:
            try:
                now = datetime.now()
                for path in self.temp_dir.glob("*"):
                    if path.is_file():
                        mtime = datetime.fromtimestamp(path.stat().st_mtime)
                        if now - mtime > timedelta(hours=24):
                            path.unlink()
                            logger.info(f"Cleaned up old temp file: {path}")
            except Exception as e:
                logger.error(f"Error during temp file cleanup: {e}")
            
            await asyncio.sleep(3600)  # Check every hour

    def get_chunk_path(self, file_id: str, chunk_number: int) -> Path:
        """Get path for a specific chunk file"""
        return self.temp_dir / f"{file_id}_{chunk_number:05d}.chunk"

    def get_assembly_path(self, file_id: str) -> Path:
        """Get path for the assembled file"""
        return self.temp_dir / f"{file_id}_complete"

    async def save_chunk(self, file_id: str, chunk_number: int, chunk_data: bytes) -> bool:
        """Save a single chunk to temporary storage"""
        try:
            chunk_path = self.get_chunk_path(file_id, chunk_number)
            async with aiofiles.open(chunk_path, 'wb') as f:
                await f.write(chunk_data)
            return True
        except Exception as e:
            logger.error(f"Error saving chunk {chunk_number} for {file_id}: {e}")
            return False

    async def assemble_file(self, file_id: str, total_chunks: int, target_path: Path) -> bool:
        """
        Assemble chunks into final file
        Returns True if successful, False otherwise
        """
        try:
            assembly_path = self.get_assembly_path(file_id)
            
            # Check if we have all chunks
            chunks = []
            for i in range(total_chunks):
                chunk_path = self.get_chunk_path(file_id, i)
                if not chunk_path.exists():
                    logger.error(f"Missing chunk {i} for {file_id}")
                    return False
                chunks.append(chunk_path)

            # Assemble chunks in order
            async with aiofiles.open(assembly_path, 'wb') as outfile:
                for chunk_path in chunks:
                    async with aiofiles.open(chunk_path, 'rb') as chunk:
                        while True:
                            data = await chunk.read(8192)
                            if not data:
                                break
                            await outfile.write(data)
                    chunk_path.unlink()  # Delete chunk after use

            # Move assembled file to target location
            target_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(assembly_path), str(target_path))
            
            return True

        except Exception as e:
            logger.error(f"Error assembling file {file_id}: {e}")
            # Cleanup any temporary files
            self.cleanup_assembly(file_id)
            return False

    def cleanup_assembly(self, file_id: str):
        """Clean up all temporary files for an assembly"""
        try:
            # Remove all chunk files
            for chunk_file in self.temp_dir.glob(f"{file_id}_*.chunk"):
                chunk_file.unlink()
            
            # Remove assembly file if it exists
            assembly_path = self.get_assembly_path(file_id)
            if assembly_path.exists():
                assembly_path.unlink()

        except Exception as e:
            logger.error(f"Error cleaning up assembly {file_id}: {e}")

    async def validate_chunk(self, file_id: str, chunk_number: int, chunk_size: int) -> bool:
        """Validate a chunk's size and existence"""
        try:
            chunk_path = self.get_chunk_path(file_id, chunk_number)
            if not chunk_path.exists():
                return False
            
            actual_size = chunk_path.stat().st_size
            return actual_size == chunk_size

        except Exception as e:
            logger.error(f"Error validating chunk {chunk_number} for {file_id}: {e}")
            return False

# Create a global instance
chunk_assembly_service = ChunkAssemblyService() 