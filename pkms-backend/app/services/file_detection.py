"""
File Type Detection Service
Provides accurate file type detection using multiple methods as alternatives to python-magic
"""

import logging
import mimetypes
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import asyncio

logger = logging.getLogger(__name__)

class FileTypeDetectionService:
    """Service for detecting file types using multiple detection methods"""
    
    def __init__(self):
        self.magika_available = False
        self.pyfsig_available = False
        self._initialize_detectors()
    
    def _initialize_detectors(self):
        """Initialize available file type detectors"""
        
        # Try to initialize Magika (AI-powered detector)
        try:
            from magika import Magika
            self.magika = Magika()
            self.magika_available = True
            logger.info("SUCCESS: Magika AI file detector initialized")
        except ImportError:
            logger.info("WARNING: Magika not available - install with: pip install magika")
        except Exception as e:
            logger.warning(f"WARNING: Failed to initialize Magika: {e}")
        
        # Try to initialize pyfsig (magic bytes detector)
        try:
            import pyfsig
            self.pyfsig = pyfsig
            self.pyfsig_available = True
            logger.info("SUCCESS: pyfsig magic bytes detector initialized")
        except ImportError:
            logger.info("WARNING: pyfsig not available - install with: pip install pyfsig")
        except Exception as e:
            logger.warning(f"WARNING: Failed to initialize pyfsig: {e}")
        
        if not self.magika_available and not self.pyfsig_available:
            logger.warning("WARNING: No advanced file detectors available - using basic mimetypes only")
    
    async def detect_file_type(self, file_path: Path, file_content: Optional[bytes] = None) -> Dict[str, Any]:
        """
        Detect file type using multiple methods
        
        Args:
            file_path: Path to the file
            file_content: Optional file content bytes (for better detection)
            
        Returns:
            Dict containing file type information
        """
        
        results = {
            "mime_type": "application/octet-stream",
            "file_type": "unknown",
            "confidence": "low",
            "detection_method": "fallback",
            "is_text": False,
            "extensions": [],
            "description": "Unknown file type"
        }
        
        try:
            # Method 1: Try Magika (highest accuracy)
            if self.magika_available:
                magika_result = await self._detect_with_magika(file_path, file_content)
                if magika_result["confidence"] != "low":
                    return magika_result
                results.update(magika_result)
            
            # Method 2: Try pyfsig (magic bytes)
            if self.pyfsig_available:
                pyfsig_result = await self._detect_with_pyfsig(file_path, file_content)
                if pyfsig_result["confidence"] != "low":
                    return pyfsig_result
                if results["confidence"] == "low":
                    results.update(pyfsig_result)
            
            # Method 3: Try filetype (content-based, secure) - NEW
            filetype_result = await self._detect_with_filetype(file_path)
            if filetype_result["confidence"] != "low":
                return filetype_result
            if results["confidence"] == "low":
                results.update(filetype_result)
            
            # Method 4: Fallback to mimetypes (extension-based only)
            mimetypes_result = await self._detect_with_mimetypes(file_path)
            if results["confidence"] == "low":
                results.update(mimetypes_result)
            
            return results
            
        except Exception as e:
            logger.error(f"ERROR: File type detection failed for {file_path}: {e}")
            return results
    
    async def _detect_with_magika(self, file_path: Path, file_content: Optional[bytes] = None) -> Dict[str, Any]:
        """Detect file type using Magika AI"""
        
        try:
            if file_content:
                # Use bytes detection for better accuracy
                result = await asyncio.to_thread(self.magika.identify_bytes, file_content)
            else:
                # Use file path detection
                result = await asyncio.to_thread(self.magika.identify_path, str(file_path))
            
            if result.ok:
                output = result.output
                score = result.score
                
                # Determine confidence based on score
                if score >= 0.9:
                    confidence = "very_high"
                elif score >= 0.7:
                    confidence = "high"
                elif score >= 0.5:
                    confidence = "medium"
                else:
                    confidence = "low"
                
                return {
                    "mime_type": output.mime_type,
                    "file_type": output.label,
                    "confidence": confidence,
                    "detection_method": "magika_ai",
                    "is_text": output.is_text,
                    "extensions": output.extensions,
                    "description": output.description,
                    "score": float(score) if score else 0.0
                }
            
        except Exception as e:
            logger.warning(f"WARNING: Magika detection failed: {e}")
        
        return {
            "confidence": "low",
            "detection_method": "magika_failed"
        }
    
    async def _detect_with_pyfsig(self, file_path: Path, file_content: Optional[bytes] = None) -> Dict[str, Any]:
        """Detect file type using pyfsig magic bytes"""
        
        try:
            if file_content:
                # Use header detection
                matches = await asyncio.to_thread(self.pyfsig.find_matches_for_file_header, header=file_content[:32])
            else:
                # Use file path detection
                matches = await asyncio.to_thread(self.pyfsig.find_matches_for_file_path, file_path=str(file_path))
            
            if matches:
                # Take the first match (usually most accurate)
                match = matches[0]
                
                # Get MIME type from extension
                mime_type = mimetypes.guess_type(f"file.{match['file_extension']}")[0]
                if not mime_type:
                    mime_type = "application/octet-stream"
                
                # Determine if it's a text file
                is_text = mime_type.startswith('text/') or match['file_extension'] in [
                    'txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'c', 'cpp', 'h'
                ]
                
                return {
                    "mime_type": mime_type,
                    "file_type": match['file_extension'],
                    "confidence": "high" if len(matches) == 1 else "medium",
                    "detection_method": "pyfsig_magic",
                    "is_text": is_text,
                    "extensions": [match['file_extension']],
                    "description": f"{match['file_extension'].upper()} file",
                    "magic_matches": len(matches)
                }
                
        except Exception as e:
            logger.warning(f"WARNING: pyfsig detection failed: {e}")
        
        return {
            "confidence": "low",
            "detection_method": "pyfsig_failed"
        }
    
    async def _detect_with_filetype(self, file_path: Path) -> Dict[str, Any]:
        """Detect file type using filetype library (content-based, secure)"""
        try:
            import filetype
            kind = filetype.guess(str(file_path))
            
            if kind:
                return {
                    "mime_type": kind.mime,
                    "file_type": kind.extension,
                    "confidence": "high",
                    "detection_method": "filetype",
                    "is_text": kind.mime.startswith('text/'),
                    "extensions": [kind.extension],
                    "description": f"{kind.mime} ({kind.extension})"
                }
        except ImportError:
            logger.debug("filetype library not available")
        except Exception as e:
            logger.warning(f"filetype detection failed: {e}")
        
        return {
            "mime_type": "application/octet-stream",
            "file_type": "unknown",
            "confidence": "low",
            "detection_method": "filetype_failed",
            "is_text": False,
            "extensions": [],
            "description": "Unknown file type"
        }
    
    async def _detect_with_mimetypes(self, file_path: Path) -> Dict[str, Any]:
        """Detect file type using Python's built-in mimetypes"""
        
        try:
            mime_type, encoding = mimetypes.guess_type(str(file_path))
            
            if mime_type:
                # Extract file extension
                extension = file_path.suffix.lstrip('.')
                
                # Determine if it's a text file
                is_text = mime_type.startswith('text/') or extension in [
                    'txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'py', 'c', 'cpp', 'h'
                ]
                
                return {
                    "mime_type": mime_type,
                    "file_type": extension or "unknown",
                    "confidence": "medium" if extension else "low",
                    "detection_method": "mimetypes",
                    "is_text": is_text,
                    "extensions": [extension] if extension else [],
                    "description": f"{mime_type} ({extension})" if extension else mime_type,
                    "encoding": encoding
                }
        
        except Exception as e:
            logger.warning(f"WARNING: mimetypes detection failed: {e}")
        
        return {
            "mime_type": "application/octet-stream",
            "file_type": "unknown",
            "confidence": "low",
            "detection_method": "fallback",
            "is_text": False,
            "extensions": [],
            "description": "Unknown file type"
        }
    
    def get_detector_status(self) -> Dict[str, bool]:
        """Get status of available detectors"""
        return {
            "magika_available": self.magika_available,
            "pyfsig_available": self.pyfsig_available,
            "mimetypes_available": True  # Always available
        }
    
    async def bulk_detect(self, file_paths: list[Path], max_concurrent: int = 5) -> Dict[str, Dict[str, Any]]:
        """
        Detect file types for multiple files concurrently
        
        Args:
            file_paths: List of file paths to analyze
            max_concurrent: Maximum number of concurrent detections
            
        Returns:
            Dict mapping file paths to detection results
        """
        
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def detect_single(file_path: Path) -> Tuple[str, Dict[str, Any]]:
            async with semaphore:
                result = await self.detect_file_type(file_path)
                return str(file_path), result
        
        tasks = [detect_single(path) for path in file_paths]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        detection_results = {}
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"ERROR: Bulk detection error: {result}")
                continue
            
            path, detection = result
            detection_results[path] = detection
        
        return detection_results
    
    def get_recommended_extension(self, mime_type: str) -> Optional[str]:
        """Get recommended file extension for a given MIME type"""
        
        # Common MIME type to extension mappings
        mime_to_ext = {
            'text/plain': 'txt',
            'text/html': 'html',
            'text/css': 'css',
            'text/javascript': 'js',
            'application/json': 'json',
            'application/xml': 'xml',
            'application/pdf': 'pdf',
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav',
            'video/mp4': 'mp4',
            'video/webm': 'webm',
            'application/zip': 'zip',
            'application/x-rar': 'rar',
            'application/x-7z-compressed': '7z'
        }
        
        return mime_to_ext.get(mime_type)

# Create global instance
file_detector = FileTypeDetectionService() 