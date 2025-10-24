"""
Response Compression Middleware
Optimizes API responses with gzip compression using Starlette's GZipMiddleware.
"""
from starlette.middleware.gzip import GZipMiddleware as CompressionMiddleware

# Public alias for consistency with other middlewares
compression_middleware = CompressionMiddleware
