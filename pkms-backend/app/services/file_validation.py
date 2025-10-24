"""
File Validation Service
Validates uploaded files for security and compliance
Uses existing FileTypeDetectionService for MIME type detection
"""

import logging
from pathlib import Path
from fastapi import UploadFile, HTTPException
from app.services.file_detection import FileTypeDetectionService

logger = logging.getLogger(__name__)

class FileValidationService:
    """
    Validates uploaded files for:
    - MIME type whitelist compliance
    - File size limits
    - Dangerous content patterns
    - Filename security
    """
    
    # Whitelist of allowed MIME types
    ALLOWED_MIME_TYPES = {
        # Images
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        # Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        # Text
        'text/plain', 'text/csv', 'text/markdown', 'text/html',
        # Archives
        'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
        # Media
        'audio/mpeg', 'audio/wav', 'audio/ogg',
        'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo'
    }
    
    # Dangerous byte patterns to check in file content
    DANGEROUS_PATTERNS = [
        b'<script', b'javascript:', b'onclick=', b'onerror=',
        b'<?php', b'<%', b'#!/bin/bash', b'#!/bin/sh',
        b'eval(', b'exec(', b'system('
    ]
    
    def __init__(self):
        self.file_detector = FileTypeDetectionService()
    
    async def validate_file(
        self, 
        file: UploadFile, 
        max_size_mb: int = 50,
        allow_executable: bool = False
    ) -> dict:
        """
        Validate uploaded file comprehensively.
        
        Returns:
            Dict with validation results and detected metadata
        
        Raises:
            HTTPException: If validation fails
        """
        # 1. File size check
        max_bytes = max_size_mb * 1024 * 1024
        if file.size and file.size > max_bytes:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large: {file.size} bytes (max {max_size_mb}MB)"
            )
        
        # 2. Filename validation
        if not file.filename or len(file.filename) > 255:
            raise HTTPException(
                status_code=400, 
                detail="Invalid filename or filename too long"
            )
        
        # Path traversal check in filename
        if '..' in file.filename or '/' in file.filename or '\\' in file.filename:
            raise HTTPException(
                status_code=400, 
                detail=f"Filename contains invalid characters: {file.filename}"
            )
        
        # 3. Read file sample for content inspection
        content_sample = await file.read(8192)  # Read first 8KB
        await file.seek(0)  # Reset file pointer
        
        # 4. Use existing FileTypeDetectionService for MIME detection
        # (This is more reliable than trusting client-provided content_type)
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            tmp.write(content_sample)
            tmp.flush()
            tmp_path = Path(tmp.name)
        
        try:
            detection_result = await self.file_detector.detect_file_type(file_path=tmp_path)
            detected_mime = detection_result["mime_type"]
        finally:
            tmp_path.unlink()  # Clean up temp file
        
        # 5. MIME type whitelist check
        if detected_mime not in self.ALLOWED_MIME_TYPES:
            logger.warning(
                f"Blocked file upload: {file.filename} "
                f"(detected MIME: {detected_mime}, claimed: {file.content_type})"
            )
            raise HTTPException(
                status_code=400, 
                detail=f"File type not allowed: {detected_mime}"
            )
        
        # 6. Dangerous content check
        content_lower = content_sample.lower()
        for pattern in self.DANGEROUS_PATTERNS:
            if pattern in content_lower:
                logger.error(
                    f"Blocked dangerous pattern '{pattern}' in file: {file.filename}"
                )
                raise HTTPException(
                    status_code=400, 
                    detail="Potentially malicious content detected in file"
                )
        
        # 7. Executable check (unless explicitly allowed)
        if not allow_executable and detected_mime in [
            'application/x-executable',
            'application/x-sharedlib',
            'application/x-msdos-program'
        ]:
            raise HTTPException(
                status_code=400, 
                detail="Executable files are not allowed"
            )
        
        return {
            "valid": True,
            "filename": file.filename,
            "detected_mime_type": detected_mime,
            "claimed_mime_type": file.content_type,
            "size": file.size
        }

# Global instance
file_validation_service = FileValidationService()
