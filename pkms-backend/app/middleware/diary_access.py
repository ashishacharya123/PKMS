"""
Diary Access Control Middleware

Ensures that diary entries can only be searched from within the diary module
for enhanced privacy and security.
"""

import logging
from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Optional, Callable, Awaitable
from urllib.parse import parse_qs

logger = logging.getLogger(__name__)

class DiaryAccessMiddleware:
    """Middleware to control diary access in search operations"""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        # Check if this is a search request that might include diary
        if self.is_search_request(request):
            try:
                await self.validate_diary_access(request)
            except HTTPException as exc:
                response = JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail}
                )
                await response(scope, receive, send)
                return

        await self.app(scope, receive, send)

    def is_search_request(self, request: Request) -> bool:
        """Check if this is a search request"""
        return (
            request.url.path.startswith("/api/v1/search/") and
            "GET" == request.method
        )

    async def validate_diary_access(self, request: Request):
        """Validate that diary search is only accessed from diary module"""

        # Parse query parameters
        query_params = parse_qs(request.url.query)

        # Check if diary is included in modules
        modules = query_params.get('modules', [])
        if isinstance(modules, list) and len(modules) > 0:
            modules = modules[0].split(',')
        else:
            modules = []

        # Check if diary content types are requested
        content_types = query_params.get('content_types', [])
        if isinstance(content_types, list) and len(content_types) > 0:
            content_types = content_types[0].split(',')

        # Check if diary is explicitly included
        include_diary = (
            'diary' in modules or
            'diary' in content_types or
            query_params.get('exclude_diary', ['true'])[0].lower() == 'false'
        )

        if include_diary:
            # SECURITY: Check session token/cookie instead of fakeable headers
            session_token = request.cookies.get('pkms_refresh')
            if not session_token:
                logger.warning("🚫 Diary search attempt without valid session")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required for diary search"
                )

            # Verify session exists and is valid
            from app.database import get_db
            from app.models.user import Session
            from sqlalchemy import select
            from datetime import datetime
            
            async with get_db() as db:
                result = await db.execute(select(Session).where(Session.session_token == session_token))
                session = result.scalar_one_or_none()
                if not session or session.expires_at < datetime.now():
                    logger.warning("🚫 Diary search attempt with expired session")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Session expired"
                    )

                # Check if user has unlocked diary
                from app.routers.diary import _get_diary_password_from_session
                if not await _get_diary_password_from_session(session.user_id):
                    logger.warning(f"🚫 Diary search attempt without unlocked diary for user {session.user_id}")
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Diary must be unlocked to search"
                    )

            # Verify session exists and is valid
            from app.database import get_db
            from app.models.user import Session
            from sqlalchemy import select
            from datetime import datetime
            
            async with get_db() as db:
                result = await db.execute(select(Session).where(Session.session_token == session_token))
                session = result.scalar_one_or_none()
                if not session or session.expires_at < datetime.now():
                    logger.warning("🚫 Diary search attempt with expired session")
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Session expired"
                    )

                # Check if user has unlocked diary
                from app.routers.diary import _get_diary_password_from_session
                if not await _get_diary_password_from_session(session.user_id):
                    logger.warning(f"🚫 Diary search attempt without unlocked diary for user {session.user_id}")
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Diary must be unlocked to search"
                    )

        # Note: Removing 'diary' from local lists doesn't affect the original request
        # This filtering should be handled at the service layer, not in middleware


# Legacy middleware function removed - functionality consolidated into DiaryAccessMiddleware class