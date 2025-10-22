"""
Response Compression Middleware
Optimizes API responses with gzip compression
"""

import gzip
import json
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import StreamingResponse
import logging

logger = logging.getLogger(__name__)

class CompressionMiddleware:
    """Middleware for response compression to reduce bandwidth usage"""
    
    MIN_SIZE = 1024  # Only compress responses larger than 1KB
    COMPRESSION_LEVEL = 6  # Balanced compression level
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        request = Request(scope, receive)
        
        # Check if client accepts gzip
        accept_encoding = request.headers.get("accept-encoding", "")
        if "gzip" not in accept_encoding:
            await self.app(scope, receive, send)
            return
        
        # Create a custom send function to intercept responses
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                # Add compression headers
                headers = list(message.get("headers", []))
                headers.append((b"content-encoding", b"gzip"))
                headers.append((b"vary", b"accept-encoding"))
                message["headers"] = headers
            await send(message)
        
        await self.app(scope, receive, send_wrapper)
    
    def compress_response(self, content: bytes) -> bytes:
        """Compress response content with gzip"""
        if len(content) < self.MIN_SIZE:
            return content
        
        try:
            compressed = gzip.compress(content, compresslevel=self.COMPRESSION_LEVEL)
            # Only use compression if it actually reduces size
            if len(compressed) < len(content):
                return compressed
            return content
        except Exception as e:
            logger.error(f"Compression failed: {e}")
            return content
    
    def should_compress(self, content_type: str) -> bool:
        """Determine if content should be compressed based on type"""
        compressible_types = [
            "application/json",
            "application/xml",
            "text/html",
            "text/css",
            "text/javascript",
            "text/plain",
            "application/javascript",
            "application/x-javascript"
        ]
        
        return any(ct in content_type.lower() for ct in compressible_types)

# Compression middleware instance
compression_middleware = CompressionMiddleware
