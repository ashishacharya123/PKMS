"""
Chunk Upload Service
Handles chunked file uploads with progress tracking and error handling
"""

import asyncio
import aiofiles
from pathlib import Path
from typing import Dict, Optional, BinaryIO
import logging
import shutil
import hashlib
from datetime import datetime, timedelta

from app.config import settings, get_data_dir

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
    
    async def start(self):
        """Start the cleanup task"""
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())
    
    async def stop(self):
        """Stop the cleanup task"""
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
    
    async def save_chunk(self, file_id: str, chunk_number: int, chunk_data: BinaryIO, filename: str, total_chunks: int, total_size: int) -> Dict:
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
                    'status': 'uploading',
                    'started_at': datetime.utcnow(),
                    'last_update': datetime.utcnow(),
                    'chunk_hashes': {}
                }
            
            upload = self.uploads[file_id]
            
            # Validate chunk number
            if chunk_number >= total_chunks:
                raise ValueError(f"Invalid chunk number {chunk_number}, total chunks: {total_chunks}")
            
            # Create chunk directory
            chunk_dir = Path(get_data_dir()) / "temp_uploads" / file_id
            chunk_dir.mkdir(parents=True, exist_ok=True)
            
            # Save chunk with hash verification
            chunk_path = chunk_dir / f"chunk_{chunk_number}"
            chunk_data_bytes = chunk_data.read()
            chunk_hash = hashlib.sha256(chunk_data_bytes).hexdigest()
            
            async with aiofiles.open(chunk_path, 'wb') as f:
                await f.write(chunk_data_bytes)
            
            # Update tracking
            upload['received_chunks'].add(chunk_number)
            upload['bytes_received'] += len(chunk_data_bytes)
            upload['last_update'] = datetime.utcnow()
            upload['chunk_hashes'][chunk_number] = chunk_hash
            
            # Check if upload is complete
            if len(upload['received_chunks']) == total_chunks:
                upload['status'] = 'assembling'
            
            return {
                'file_id': file_id,
                'filename': filename,
                'bytes_uploaded': upload['bytes_received'],
                'total_size': total_size,
                'status': upload['status'],
                'progress': len(upload['received_chunks']) / total_chunks * 100
            }
            
        except Exception as e:
            logger.error(f"Error saving chunk {chunk_number} for file {file_id}: {str(e)}")
            self.uploads[file_id]['status'] = 'error'
            raise
    
    async def assemble_file(self, file_id: str) -> Optional[Path]:
        """Assemble chunks into final file with verification"""
        async with self.assembly_semaphore:
            try:
                upload = self.uploads.get(file_id)
                if not upload:
                    raise ValueError(f"No upload found for file_id: {file_id}")
                
                if upload['status'] != 'assembling':
                    raise ValueError(f"Upload not ready for assembly, status: {upload['status']}")
                
                chunk_dir = Path(get_data_dir()) / "temp_uploads" / file_id
                output_path = Path(get_data_dir()) / "temp_uploads" / f"complete_{file_id}_{upload['filename']}"
                
                # Assemble chunks with verification
                async with aiofiles.open(output_path, 'wb') as outfile:
                    for chunk_num in range(upload['total_chunks']):
                        chunk_path = chunk_dir / f"chunk_{chunk_num}"
                        if not chunk_path.exists():
                            raise ValueError(f"Missing chunk {chunk_num}")
                        
                        # Verify chunk hash
                        async with aiofiles.open(chunk_path, 'rb') as chunk_file:
                            chunk_data = await chunk_file.read()
                            chunk_hash = hashlib.sha256(chunk_data).hexdigest()
                            if chunk_hash != upload['chunk_hashes'].get(chunk_num):
                                raise ValueError(f"Chunk {chunk_num} hash mismatch")
                            
                            await outfile.write(chunk_data)
                
                # Verify final file size
                if output_path.stat().st_size != upload['total_size']:
                    raise ValueError("Assembled file size mismatch")
                
                # Update status
                upload['status'] = 'completed'
                
                # Clean up chunks
                shutil.rmtree(chunk_dir)
                
                return output_path
                
            except Exception as e:
                logger.error(f"Error assembling file {file_id}: {str(e)}")
                if file_id in self.uploads:
                    self.uploads[file_id]['status'] = 'error'
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
            'progress': len(upload['received_chunks']) / upload['total_chunks'] * 100 if upload['total_chunks'] > 0 else 0
        }
    
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
        now = datetime.utcnow()
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
                
                logger.info(f"Cleaned up expired upload {file_id}")
            except Exception as e:
                logger.error(f"Error cleaning up upload {file_id}: {str(e)}")

# Global instance
chunk_manager = ChunkUploadManager() 