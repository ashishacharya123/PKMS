from .auth import router as auth_router
from .notes import router as notes_router
from .documents import router as documents_router
from .todos import router as todos_router
from .diary import router as diary_router
from .archive import router as archive_router
from .dashboard import router as dashboard_router
from .search import router as search_router
from .backup import router as backup_router
from .tags import router as tags_router
from .testing import router as testing_router

routers = [
    auth_router,
    notes_router,
    documents_router,
    todos_router,
    diary_router,
    archive_router,
    dashboard_router,
    search_router,
    backup_router,
    tags_router,
    testing_router,
] 