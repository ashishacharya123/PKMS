"""
Cross-platform file locking utilities for async operations
"""

import asyncio
import aiofiles
from pathlib import Path
from typing import Optional
import fcntl
import os
import time


class AsyncFileLock:
    """Cross-platform file locking for async operations"""

    def __init__(self, file_path: Path):
        self.file_path = file_path
        self._lock_file = None

    async def __aenter__(self):
        """Acquire lock"""
        self._lock_file = self.file_path.with_suffix('.lock')
        try:
            # Create lock file
            self._lock_file.touch(exist_ok=True)

            # Try to get exclusive lock (Unix)
            if os.name != 'nt':
                try:
                    fd = self._lock_file.open('r')
                    fcntl.flock(fd.fileno(), fcntl.LOCK_EX)
                    self._lock_fd = fd
                except (OSError, AttributeError):
                    pass  # Fallback to simple file-based locking

            # Simple lock mechanism for all platforms
            max_attempts = 100
            for attempt in range(max_attempts):
                try:
                    # Try to create lock marker
                    lock_marker = self._lock_file.with_suffix('.lock.marker')
                    if not lock_marker.exists():
                        lock_marker.write_text(f"{os.getpid()}:{attempt}")
                        return self
                    # Check if lock is stale (PID no longer exists)
                    try:
                        pid = int(lock_marker.read_text().split(':')[0])
                        os.kill(pid, 0)  # Check if process exists
                    except (OSError, ValueError):
                        lock_marker.unlink()  # Stale lock, remove it
                        continue

                    await asyncio.sleep(0.01)  # Wait 10ms
                except Exception:
                    pass

            raise Exception(f"Could not acquire lock on {self.file_path}")

        except Exception as e:
            if self._lock_file:
                try:
                    self._lock_file.unlink(missing_ok=True)
                except:
                    pass
            raise e

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Release lock"""
        try:
            # Close file descriptor if using fcntl
            if hasattr(self, '_lock_fd'):
                self._lock_fd.close()

            # Remove lock files
            if self._lock_file:
                self._lock_file.unlink(missing_ok=True)
            lock_marker = self._lock_file.with_suffix('.lock.marker')
            lock_marker.unlink(missing_ok=True)
        except Exception:
            pass  # Cleanup best effort


async def save_file_safely(file_path: Path, content: bytes):
    """Save file with cross-platform locking"""
    async with AsyncFileLock(file_path):
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(content)


async def read_file_safely(file_path: Path) -> bytes:
    """Read file with cross-platform locking"""
    async with AsyncFileLock(file_path):
        async with aiofiles.open(file_path, 'rb') as f:
            return await f.read()


async def move_file_safely(source_path: Path, dest_path: Path):
    """Move file with cross-platform locking"""
    async with AsyncFileLock(source_path):
        async with AsyncFileLock(dest_path):
            # Use shutil.move for cross-platform compatibility
            import shutil
            shutil.move(str(source_path), str(dest_path))
