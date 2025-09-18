"""
Search Router for PKMS
Provides unified search across all content types using enhanced FTS5
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
import logging

from ..database import get_db
from ..models.user import User
from ..auth.dependencies import get_current_user
from ..services.fts_service_enhanced import enhanced_fts_service
from ..services.tag_sync_service import tag_sync_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/unified")
async def unified_search(
    query: str = Query(..., description="Search query string"),
    module_filter: Optional[str] = Query(None, description="Filter by module (notes, documents, todos, diary, archive)"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of results"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """
    Unified search across all content types using enhanced FTS5
    
    This endpoint provides:
    - Full-text search across all content (title, content, description, tags)
    - Proper BM25 ranking for relevance
    - Cross-module score normalization
    - Tag-based search support
    - Module filtering
    """
    try:
        if not query.strip():
            return {
                "results": [],
                "total": 0,
                "query": query,
                "search_type": "enhanced_fts5"
            }
        
        # Perform enhanced FTS5 search
        results = await enhanced_fts_service.search_enhanced(
            db=db,
            query=query.strip(),
            user_id=user.id,
            module_filter=module_filter,
            limit=limit
        )
        
        # Format results for frontend
        formatted_results = []
        for result in results:
            formatted_result = {
                "id": result.get("id") or result.get("uuid"),
                "type": result.get("type", "unknown"),
                "module": result.get("module", "unknown"),
                "title": result.get("title") or result.get("name", ""),
                "content": result.get("content", ""),
                "description": result.get("description", ""),
                "tags": result.get("tags_text", "").split() if result.get("tags_text") else [],
                "score": result.get("normalized_score", 0),
                "created_at": result.get("created_at"),
                "updated_at": result.get("updated_at")
            }
            
            # Add module-specific fields
            if result.get("module") == "notes":
                formatted_result["area"] = result.get("area")
                formatted_result["is_favorite"] = result.get("is_favorite")
            elif result.get("module") == "documents":
                formatted_result["filename"] = result.get("filename")
                formatted_result["mime_type"] = result.get("mime_type")
                formatted_result["file_size"] = result.get("file_size")
            elif result.get("module") == "todos":
                formatted_result["status"] = result.get("status")
                formatted_result["priority"] = result.get("priority")
            elif result.get("module") == "diary":
                formatted_result["mood"] = result.get("mood")
                formatted_result["weather"] = result.get("weather")
                formatted_result["location"] = result.get("location")
            elif result.get("module") == "archive":
                formatted_result["original_filename"] = result.get("original_filename")
                formatted_result["folder_uuid"] = result.get("folder_uuid")
            
            formatted_results.append(formatted_result)
        
        logger.info(f"🔍 Enhanced search completed: '{query}' - {len(formatted_results)} results for user {user.id}")
        
        return {
            "results": formatted_results,
            "total": len(formatted_results),
            "query": query,
            "search_type": "enhanced_fts5",
            "module_filter": module_filter,
            "fts5_status": "enhanced" if enhanced_fts_service.tables_initialized else "not_initialized"
        }
        
    except Exception as e:
        logger.error(f"❌ Enhanced search failed: {e}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/fts5/status")
async def get_fts5_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Get enhanced FTS5 service status and statistics"""
    try:
        if not enhanced_fts_service.tables_initialized:
            return {
                "status": "not_initialized",
                "message": "Enhanced FTS5 tables not initialized",
                "tables": {}
            }
        
        # Get FTS5 statistics
        stats = await enhanced_fts_service.get_enhanced_fts_stats(db)
        
        return {
            "status": "enhanced",
            "message": "Enhanced FTS5 service is running",
            "tables": stats,
            "features": [
                "BM25 ranking",
                "Cross-module search",
                "Tag embedding",
                "Proper score normalization",
                "Automatic synchronization"
            ]
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to get FTS5 status: {e}")
        return {
            "status": "error",
            "message": f"Failed to get FTS5 status: {str(e)}",
            "tables": {}
        }


@router.post("/fts5/sync")
async def sync_fts5_tables(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Manually synchronize FTS5 tables with main tables"""
    try:
        if not enhanced_fts_service.tables_initialized:
            return {
                "status": "error",
                "message": "Enhanced FTS5 tables not initialized"
            }
        
        # Sync all tags_text columns
        tags_synced = await tag_sync_service.sync_all_tags(db)
        
        # Populate FTS5 tables
        fts_populated = await enhanced_fts_service.populate_enhanced_fts_tables(db)
        
        # Optimize FTS5 tables
        fts_optimized = await enhanced_fts_service.optimize_enhanced_fts_tables(db)
        
        return {
            "status": "success",
            "message": "FTS5 tables synchronized successfully",
            "details": {
                "tags_synced": tags_synced,
                "fts_populated": fts_populated,
                "fts_optimized": fts_optimized
            }
        }
        
    except Exception as e:
        logger.error(f"❌ Failed to sync FTS5 tables: {e}")
        raise HTTPException(status_code=500, detail=f"FTS5 sync failed: {str(e)}")


@router.post("/fts5/optimize")
async def optimize_fts5_tables(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Optimize enhanced FTS5 tables for better performance"""
    try:
        if not enhanced_fts_service.tables_initialized:
            return {
                "status": "error",
                "message": "Enhanced FTS5 tables not initialized"
            }
        
        # Optimize FTS5 tables
        optimized = await enhanced_fts_service.optimize_enhanced_fts_tables(db)
        
        if optimized:
            return {
                "status": "success",
                "message": "FTS5 tables optimized successfully"
            }
        else:
            return {
                "status": "error",
                "message": "Failed to optimize FTS5 tables"
            }
        
    except Exception as e:
        logger.error(f"❌ Failed to optimize FTS5 tables: {e}")
        raise HTTPException(status_code=500, detail=f"FTS5 optimization failed: {str(e)}")


@router.get("/modules")
async def get_search_modules(
    user: User = Depends(get_current_user)
) -> Dict[str, Any]:
    """Get available search modules and their capabilities"""
    return {
        "modules": {
            "notes": {
                "name": "Notes",
                "searchable_fields": ["title", "content", "tags", "area"],
                "features": ["Full-text search", "Tag search", "Area filtering"]
            },
            "documents": {
                "name": "Documents",
                "searchable_fields": ["title", "filename", "description", "tags"],
                "features": ["File name search", "Content search", "Tag search"]
            },
            "todos": {
                "name": "Todos & Projects",
                "searchable_fields": ["title", "description", "tags", "status", "priority"],
                "features": ["Task search", "Project search", "Status filtering"]
            },
            "diary": {
                "name": "Diary Entries",
                "searchable_fields": ["title", "content", "tags", "mood", "weather", "location"],
                "features": ["Journal search", "Mood tracking", "Location search"]
            },
            "archive": {
                "name": "Archive",
                "searchable_fields": ["name", "description", "filename", "tags", "metadata"],
                "features": ["File search", "Metadata search", "Tag search"]
            }
        },
        "search_features": [
            "Enhanced FTS5 with BM25 ranking",
            "Cross-module search",
            "Tag embedding and search",
            "Proper score normalization",
            "Automatic synchronization",
            "Performance optimization"
        ]
    } 