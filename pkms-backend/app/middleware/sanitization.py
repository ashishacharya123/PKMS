"""Query parameter sanitisation middleware for PKMS

Any incoming HTTP request has its query-string values passed through the
`sanitize_search_query` / `sanitize_text_input` helpers.  If sanitisation
would alter the value or an injection pattern is detected we immediately
return **400 Bad Request** to stop the request early.

This provides a defence-in-depth guard in addition to field-level Pydantic
validators used throughout the routers.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette import status

from app.utils.security import sanitize_search_query, sanitize_text_input
import logging

logger = logging.getLogger(__name__)

TEXT_PARAMS = {
    "q", "query", "search", "tag", "name", "title", "description"
}

class SanitizationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Validate / sanitise all query parameters.
        for key, value in request.query_params.multi_items():
            try:
                if key in TEXT_PARAMS:
                    sanitized = sanitize_search_query(value) if key in {"q", "query", "search"} else sanitize_text_input(value)
                    if sanitized != value:
                        logger.warning("Blocked request due to unsanitised param %s=%s", key, value)
                        return JSONResponse(
                            {
                                "detail": f"Invalid characters detected in query parameter '{key}'."
                            },
                            status_code=status.HTTP_400_BAD_REQUEST,
                        )
            except Exception:
                logger.warning("Blocked request due to sanitisation failure on %s=%s", key, value)
                return JSONResponse(
                    {"detail": f"Invalid query parameter '{key}'."},
                    status_code=status.HTTP_400_BAD_REQUEST,
                )

        # Continue to next handler
        response = await call_next(request)
        return response 