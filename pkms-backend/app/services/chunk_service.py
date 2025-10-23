"""
Chunk Upload Service
Handles chunked file uploads with progress tracking and error handling

WARNING: ARCHITECTURAL LIMITATION WARNING
=====================================

This ChunkUploadManager uses in-memory state management (self.uploads dictionary)
and is designed for SINGLE-PROCESS deployments only.

CRITICAL: NOT SAFE FOR MULTI-WORKER DEPLOYMENTS
- If deployed with multiple workers (e.g., gunicorn -w 4), chunks will be
  distributed across different processes, causing data loss and assembly failures
- File-based state persistence will be corrupted by concurrent writes
- Race conditions will occur during chunk assembly

CURRENT DEPLOYMENT: Single-process uvicorn (safe)
FUTURE SCALING: Multi-worker deployment requires Redis refactoring

For multi-worker deployments, refactor to use Redis for shared state management.
See: https://redis.io/docs/data-types/hashes/ for implementation guidance.
"""

import asyncio
import aiofiles
import json
from pathlib import Path
from typing import Dict, Optional, BinaryIO
import logging
import shutil
import zlib
from datetime import datetime, timedelta

from app.config import settings, get_data_dir, NEPAL_TZ
from app.models.enums import ChunkUploadStatus

# File size validation
from app.services.file_size_service import file_size_service

logger = logging.getLogger(__name__)

# Constants
CHUNK_SIZE = 1024 * 1024  # 1MB chunks
CLEANUP_INTERVAL = 3600  # 1 hour
MAX_CHUNK_AGE = 24  # hours
CONCURRENT_ASSEMBLIES = 3


class ChunkUploadManager:
    """Manages chunked file uploads with progress tracking"""
    
    def __init__(self):
        self.uploads: Dict[str, Dict] = {}
        self.assembly_semaphore = asyncio.Semaphore(CONCURRENT_ASSEMBLIES)
        self.cleanup_task = None
        self.state_file = Path(get_data_dir()) / "chunk_upload_state.json"
    
    async def start(self):
        """Start the cleanup task and load persisted state"""
        await self._load_state_from_file()
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())
    
    async def stop(self):
        """Stop the cleanup task and save state"""
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
        await self._save_state_to_file()
    
    async def _save_state_to_file(self):
        """Save upload state to file for persistence across restarts"""
        try:
            # Convert sets to lists for JSON serialization
            serializable_uploads = {}
            for file_id, upload in self.uploads.items():
                serializable_upload = upload.copy()
                if 'received_chunks' in serializable_upload:
                    serializable_upload['received_chunks'] = list(serializable_upload['received_chunks'])
                # Convert datetime to string
                if 'last_update' in serializable_upload and serializable_upload['last_update']:
                    serializable_upload['last_update'] = serializable_upload['last_update'].isoformat()
                # Convert Enum to primitive
                if isinstance(serializable_upload.get('status'), ChunkUploadStatus):
                    serializable_upload['status'] = serializable_upload['status'].value
                serializable_uploads[file_id] = serializable_upload
            
            async with aiofiles.open(self.state_file, 'w') as f:
                await f.write(json.dumps(serializable_uploads, indent=2))
            logger.debug(f"Saved upload state to {self.state_file}")
        except Exception as e:
            logger.error(f"Failed to save upload state: {e}")
    
    async def _load_state_from_file(self):
        """Load upload state from file on startup"""
        try:
            if not self.state_file.exists():
                logger.debug("No existing upload state file found")
                return
            
            async with aiofiles.open(self.state_file, 'r') as f:
                content = await f.read()
                if not content.strip():
                    logger.debug("Upload state file is empty")
                    return
                
                serializable_uploads = json.loads(content)
                
                # Convert back to proper types
                for file_id, upload in serializable_uploads.items():
                    if 'received_chunks' in upload:
                        upload['received_chunks'] = set(upload['received_chunks'])
                    # Convert string back to datetime
                    if 'last_update' in upload and upload['last_update']:
                        upload['last_update'] = datetime.fromisoformat(upload['last_update'])
                    # Convert status string back to Enum
                    if isinstance(upload.get('status'), str):
                        try:
                            upload['status'] = ChunkUploadStatus(upload['status'])
                        except Exception:
                            upload['status'] = ChunkUploadStatus.ERROR
                    self.uploads[file_id] = upload
                
                logger.info(f"Loaded {len(self.uploads)} upload states from {self.state_file}")
        except Exception as e:
            logger.error(f"Failed to load upload state: {e}")
            # Continue with empty state if loading fails
    
    async def save_chunk(self, file_id: str, chunk_number: int, chunk_data: BinaryIO, filename: str, total_chunks: int, total_size: int, created_by: str) -> Dict:
        """Save a chunk to disk and update progress"""
        try:
            # Initialize upload tracking if not exists
            if file_id not in self.uploads:
                self.uploads[file_id] = {
                    'filename': filename,
                    'total_chunks': total_chunks,
                    'received_chunks': set(),
                    'total_size': total_size,
                    'bytes_received': 0,
                    'status': ChunkUploadStatus.UPLOADING,
                    'started_at': datetime.now(NEPAL_TZ),
                    'last_update': datetime.now(NEPAL_TZ),
                    'chunk_hashes': {},
                    'created_by': created_by
                }
            
            upload = self.uploads[file_id]
            
            # Validate chunk number
            if chunk_number < 0 or chunk_number >= total_chunks:
                raise ValueError(f"Invalid chunk number {chunk_number}, total chunks: {total_chunks}")
            
            # Create chunk directory
            chunk_dir = Path(get_data_dir()) / "temp_uploads" / file_id
            chunk_dir.mkdir(parents=True, exist_ok=True)
            
            # Save chunk with lightweight checksum verification (CRC32)
            chunk_path = chunk_dir / f"chunk_{chunk_number}"
            chunk_data_bytes = chunk_data.read()
            chunk_hash = zlib.crc32(chunk_data_bytes) & 0xFFFFFFFF
            
            async with aiofiles.open(chunk_path, 'wb') as f:
                await f.write(chunk_data_bytes)
            
            # Update tracking
            upload['received_chunks'].add(chunk_number)
            upload['bytes_received'] += len(chunk_data_bytes)
            upload['last_update'] = datetime.now(NEPAL_TZ)
            upload['chunk_hashes'][chunk_number] = chunk_hash
            
            # Check if upload is complete
            if len(upload['received_chunks']) == total_chunks:
                upload['status'] = ChunkUploadStatus.ASSEMBLING
            
            # Save state after important changes
            await self._save_state_to_file()
            
            return {
                'file_id': file_id,
                'filename': filename,
                'bytes_uploaded': upload['bytes_received'],
                'total_size': total_size,
                'status': upload['status'],
                'progress': len(upload['received_chunks']) / total_chunks * 100 if total_chunks > 0 else 0
            }
            
        except Exception as e:
            logger.error(f"Error saving chunk {chunk_number} for file {file_id}: {str(e)}")
            # Safely update status only if file_id exists in uploads
            if file_id in self.uploads:
                self.uploads[file_id]['status'] = ChunkUploadStatus.ERROR
            raise
    
    async def assemble_file(self, file_id: str) -> Optional[Path]:
        """Assemble chunks into final file with verification"""
        async with self.assembly_semaphore:
            try:
                upload = self.uploads.get(file_id)
                if not upload:
                    raise ValueError(f"No upload found for file_id: {file_id}")
                
                if upload['status'] != ChunkUploadStatus.ASSEMBLING:
                    raise ValueError(f"Upload not ready for assembly, status: {upload['status']}")
                
                chunk_dir = Path(get_data_dir()) / "temp_uploads" / file_id
                output_path = Path(get_data_dir()) / "temp_uploads" / f"complete_{file_id}_{upload['filename']}"
                
                # SECURITY: Validate total file size before reading chunks into memory
                # This prevents large files from crashing the server
                if upload['total_size'] > file_size_service.get_size_limit():
                    raise ValueError(
                        f"File too large: {file_size_service.format_file_size(upload['total_size'])} "
                        f"(max: {file_size_service.get_size_limit_mb()}MB)"
                    )
                
                # Assemble chunks with verification
                async with aiofiles.open(output_path, 'wb') as outfile:
                    for chunk_num in range(upload['total_chunks']):
                        chunk_path = chunk_dir / f"chunk_{chunk_num}"
                        if not chunk_path.exists():
                            raise ValueError(f"Missing chunk {chunk_num}")
                        
                        # Verify chunk checksum
                        async with aiofiles.open(chunk_path, 'rb') as chunk_file:
                            chunk_data = await chunk_file.read()
                            chunk_hash = zlib.crc32(chunk_data) & 0xFFFFFFFF
                            if chunk_hash != upload['chunk_hashes'].get(chunk_num):
                                raise ValueError(f"Chunk {chunk_num} hash mismatch")
                            
                            await outfile.write(chunk_data)
                
                # Verify final file size
                if output_path.stat().st_size != upload['total_size']:
                    raise ValueError("Assembled file size mismatch")
                
                # Update status
                upload['status'] = ChunkUploadStatus.COMPLETED
                
                # Save state after completion
                await self._save_state_to_file()
                
                # Clean up chunks with robust Windows file locking handling
                try:
                    shutil.rmtree(chunk_dir)
                except (PermissionError, OSError) as e:
                    # Windows file locking issue - try alternative cleanup
                    logger.warning(f"Failed to remove chunk directory {chunk_dir}: {e}")
                    try:
                        # Try to remove files individually
                        for file_path in chunk_dir.rglob('*'):
                            if file_path.is_file():
                                try:
                                    file_path.unlink()
                                except (PermissionError, OSError):
                                    # File is locked, mark for later cleanup
                                    logger.warning(f"Could not remove locked file: {file_path}")
                        # Try to remove empty directories
                        try:
                            chunk_dir.rmdir()
                        except OSError:
                            pass  # Directory not empty, will be cleaned up later
                    except Exception as cleanup_error:
                        logger.error(f"Chunk cleanup failed completely: {cleanup_error}")
                        # Don't fail the operation, just log the issue
                
                return output_path
                
            except Exception as e:
                logger.error(f"Error assembling file {file_id}: {str(e)}")
                if file_id in self.uploads:
                    self.uploads[file_id]['status'] = ChunkUploadStatus.FAILED
                    self.uploads[file_id]['error'] = str(e)
                    # Save state after failure
                    await self._save_state_to_file()
                raise
    
    async def get_upload_status(self, file_id: str) -> Optional[Dict]:
        """Get current upload status"""
        upload = self.uploads.get(file_id)
        if not upload:
            return None
            
        return {
            'file_id': file_id,
            'filename': upload['filename'],
            'bytes_uploaded': upload['bytes_received'],
            'total_size': upload['total_size'],
            'status': upload['status'],
            'progress': len(upload['received_chunks']) / upload['total_chunks'] * 100 if upload['total_chunks'] > 0 else 0,
            'created_by': upload.get('created_by')
        }
    
    async def cleanup_upload(self, file_id: str) -> bool:
        """Clean up a specific upload and its files"""
        if file_id not in self.uploads:
            return False
            
        try:
            # Clean up files
            chunk_dir = Path(get_data_dir()) / "temp_uploads" / file_id
            if chunk_dir.exists():
                shutil.rmtree(chunk_dir)
            
            # Remove from tracking
            del self.uploads[file_id]
            
            # Save state after cleanup
            await self._save_state_to_file()
            
            logger.info(f"Cleaned up upload {file_id}")
            return True
        except Exception as e:
            logger.error(f"Error cleaning up upload {file_id}: {str(e)}")
            return False
    
    async def _cleanup_loop(self):
        """Periodically clean up expired uploads"""
        while True:
            try:
                await asyncio.sleep(CLEANUP_INTERVAL)
                await self._cleanup_expired_uploads()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {str(e)}")
    
    async def _cleanup_expired_uploads(self):
        """Clean up expired uploads and their files"""
        now = datetime.now(NEPAL_TZ)
        expired_ids = []
        
        for file_id, upload in self.uploads.items():
            if now - upload['last_update'] > timedelta(hours=MAX_CHUNK_AGE):
                expired_ids.append(file_id)
        
        for file_id in expired_ids:
            try:
                # Clean up files
                chunk_dir = Path(get_data_dir()) / "temp_uploads" / file_id
                if chunk_dir.exists():
                    shutil.rmtree(chunk_dir)
                
                # Remove from tracking
                del self.uploads[file_id]
                
                # Save state after cleanup
                await self._save_state_to_file()
                
                logger.info(f"Cleaned up expired upload {file_id}")
            except Exception as e:
                logger.error(f"Error cleaning up upload {file_id}: {str(e)}")

# Global instance
chunk_manager = ChunkUploadManager() 