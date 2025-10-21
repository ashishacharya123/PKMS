"""
Router for testing and debugging purposes.
"""

from fastapi import APIRouter
from datetime import datetime
from app.config import NEPAL_TZ

router = APIRouter()

@router.get("/test-todos")
async def test_todos():
    try:
        from app.database import get_db_session
        from app.models.todo import Todo
        from sqlalchemy import select
        
        async with get_db_session() as db:
            # Just test if we can query todos without errors
            result = await db.execute(select(Todo).limit(1))
            todo_count = result.scalars().all()
            
            return {
                "message": "Todos endpoint test successful",
                "timestamp": datetime.now(NEPAL_TZ).isoformat(),
                "todo_count": len(todo_count),
                "database_accessible": True
            }
    except Exception as e:
        return {
            "message": "Todos endpoint test failed",
            "timestamp": datetime.now(NEPAL_TZ).isoformat(),
            "error": str(e),
            "database_accessible": False
        }
