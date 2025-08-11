"""
Hybrid Search Service
Combines FTS5 and fuzzy search for optimal performance and accuracy
"""

import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import date
import asyncio
from rapidfuzz import fuzz

from .fts_service_enhanced import enhanced_fts_service

logger = logging.getLogger(__name__)

class HybridSearchService:
    """Service that combines FTS5 and fuzzy search for best results"""

    def __init__(self):
        self.min_query_length = 2
        self.fts_candidate_limit = 100  # Get top candidates from FTS5
        self.fuzzy_threshold = 60  # Minimum fuzzy match score
        self.fuzzy_rerank_threshold = 20  # Re-rank if FTS5 returns fewer than this

    async def hybrid_search(self, db: AsyncSession, query: str, user_id: int,
                           modules: Optional[List[str]] = None,
                           include_tags: Optional[List[str]] = None,
                           exclude_tags: Optional[List[str]] = None,
                           date_from: Optional[date] = None,
                           date_to: Optional[date] = None,
                           favorites_only: bool = False,
                           include_archived: bool = True,
                           use_fuzzy: bool = True,
                           fuzzy_threshold: Optional[int] = None,
                           sort_by: str = "relevance",
                           sort_order: str = "desc",
                           limit: int = 50,
                           offset: int = 0) -> Dict[str, Any]:
        """
        Hybrid search: Fast FTS5 for candidates + optional fuzzy re-ranking
        """
        
        if len(query.strip()) < self.min_query_length:
            return {"results": [], "total": 0, "search_method": "none", "reason": "Query too short"}

        # Step 1: Fast FTS5 search for candidates
        logger.info(f"🔍 Starting hybrid search for: '{query}'")
        
        fts_results = await enhanced_fts_service.enhanced_search_all(
            db=db,
            query=query,
            user_id=user_id,
            modules=modules,
            include_tags=include_tags,
            exclude_tags=exclude_tags,
            date_from=date_from,
            date_to=date_to,
            favorites_only=favorites_only,
            include_archived=include_archived,
            sort_by=sort_by,
            sort_order=sort_order,
            limit=self.fts_candidate_limit,  # Get more candidates for fuzzy re-ranking
            offset=0  # Always start from 0 for candidates
        )
        
        fts_candidates = fts_results.get("results", [])
        
        # Step 2: Decide whether to apply fuzzy re-ranking
        search_method = "fts5_only"
        final_results = fts_candidates
        
        if use_fuzzy and len(fts_candidates) < self.fuzzy_rerank_threshold:
            # Few FTS5 results, enhance with fuzzy search
            logger.info(f"🧠 Applying fuzzy re-ranking ({len(fts_candidates)} FTS5 candidates)")
            
            fuzzy_enhanced_results = await self._apply_fuzzy_reranking(
                candidates=fts_candidates,
                query=query,
                fuzzy_threshold=fuzzy_threshold or self.fuzzy_threshold
            )
            
            final_results = fuzzy_enhanced_results
            search_method = "hybrid_fts5_fuzzy"
        
        elif use_fuzzy and len(fts_candidates) >= self.fuzzy_rerank_threshold:
            # Good FTS5 results, light fuzzy enhancement for top candidates
            logger.info(f"⚡ Light fuzzy enhancement for top FTS5 results")
            
            # Take top 20 candidates for fuzzy re-ranking
            top_candidates = fts_candidates[:20]
            fuzzy_enhanced_top = await self._apply_fuzzy_reranking(
                candidates=top_candidates,
                query=query,
                fuzzy_threshold=fuzzy_threshold or self.fuzzy_threshold
            )
            
            # Combine enhanced top with remaining FTS5 results
            remaining_candidates = fts_candidates[20:]
            final_results = fuzzy_enhanced_top + remaining_candidates
            search_method = "fts5_with_fuzzy_boost"
        
        # Step 3: Apply final sorting and pagination
        total_results = len(final_results)
        
        # Re-sort all results if fuzzy was applied
        if "fuzzy" in search_method:
            final_results = self._apply_final_sorting(final_results, sort_by, sort_order)
        
        # Apply pagination
        paginated_results = final_results[offset:offset + limit]
        
        return {
            "results": paginated_results,
            "total": total_results,
            "fts_candidates": len(fts_candidates),
            "search_method": search_method,
            "modules_searched": fts_results.get("modules_searched", []),
            "query": query,
            "applied_fuzzy": "fuzzy" in search_method
        }

    async def _apply_fuzzy_reranking(self, candidates: List[Dict[str, Any]], query: str, 
                                   fuzzy_threshold: int) -> List[Dict[str, Any]]:
        """Apply fuzzy re-ranking to candidates"""
        
        if not candidates:
            return candidates
        
        query_lower = query.lower()
        fuzzy_scored_results = []
        
        for result in candidates:
            # Calculate fuzzy scores for different fields
            fuzzy_scores = []
            
            # Title/name fuzzy matching
            title = result.get('title') or result.get('name', '')
            if title:
                title_score = fuzz.token_set_ratio(query_lower, title.lower())
                fuzzy_scores.append(('title', title_score, 1.5))  # Higher weight for title
            
            # Content/description fuzzy matching
            content = result.get('content') or result.get('description', '')
            if content:
                content_score = fuzz.token_set_ratio(query_lower, content.lower()[:500])  # Limit content length
                fuzzy_scores.append(('content', content_score, 1.0))
            
            # Tags fuzzy matching
            tags = result.get('tags', [])
            if tags:
                tags_text = ' '.join(tags)
                tags_score = fuzz.token_set_ratio(query_lower, tags_text.lower())
                fuzzy_scores.append(('tags', tags_score, 1.2))  # Higher weight for tags
            
            # Filename fuzzy matching (for documents/archive)
            filename = result.get('filename') or result.get('original_filename', '')
            if filename:
                filename_score = fuzz.token_set_ratio(query_lower, filename.lower())
                fuzzy_scores.append(('filename', filename_score, 1.3))
            
            # Calculate weighted fuzzy score
            if fuzzy_scores:
                total_weighted_score = sum(score * weight for _, score, weight in fuzzy_scores)
                total_weight = sum(weight for _, _, weight in fuzzy_scores)
                weighted_fuzzy_score = total_weighted_score / total_weight
            else:
                weighted_fuzzy_score = 0
            
            # Only include results above fuzzy threshold
            if weighted_fuzzy_score >= fuzzy_threshold:
                # Combine FTS5 relevance with fuzzy score
                fts_relevance = result.get('relevance_score', 0.5)
                combined_score = (fts_relevance * 0.4) + (weighted_fuzzy_score / 100.0 * 0.6)
                
                result['fuzzy_score'] = weighted_fuzzy_score
                result['combined_score'] = combined_score
                result['fuzzy_details'] = {field: score for field, score, _ in fuzzy_scores}
                
                fuzzy_scored_results.append(result)
        
        # Sort by combined score
        fuzzy_scored_results.sort(key=lambda x: x['combined_score'], reverse=True)
        
        logger.info(f"🧠 Fuzzy re-ranking: {len(candidates)} → {len(fuzzy_scored_results)} results (threshold: {fuzzy_threshold})")
        
        return fuzzy_scored_results

    def _apply_final_sorting(self, results: List[Dict[str, Any]], sort_by: str, sort_order: str) -> List[Dict[str, Any]]:
        """Apply final sorting to hybrid results"""
        
        reverse = sort_order.lower() == 'desc'
        
        if sort_by == 'relevance':
            # Use combined_score if available, otherwise relevance_score
            return sorted(results, key=lambda x: x.get('combined_score', x.get('relevance_score', 0)), reverse=reverse)
        elif sort_by == 'date':
            return sorted(results, key=lambda x: x.get('created_at', ''), reverse=reverse)
        elif sort_by == 'title':
            return sorted(results, key=lambda x: (x.get('title') or x.get('name', '')).lower(), reverse=reverse)
        elif sort_by == 'module':
            return sorted(results, key=lambda x: x.get('module', ''), reverse=reverse)
        elif sort_by == 'fuzzy_score':
            return sorted(results, key=lambda x: x.get('fuzzy_score', 0), reverse=reverse)
        else:
            # Default to relevance
            return sorted(results, key=lambda x: x.get('combined_score', x.get('relevance_score', 0)), reverse=True)

    async def pure_fuzzy_search(self, db: AsyncSession, query: str, user_id: int,
                               modules: Optional[List[str]] = None,
                               fuzzy_threshold: Optional[int] = None,
                               limit: int = 50,
                               offset: int = 0) -> Dict[str, Any]:
        """
        Pure fuzzy search without FTS5 pre-filtering
        Useful when you want maximum recall with typos/partial matches
        """
        
        if len(query.strip()) < self.min_query_length:
            return {"results": [], "total": 0, "search_method": "none", "reason": "Query too short"}
        
        # Get a larger candidate set from FTS5 with relaxed matching
        relaxed_query = ' OR '.join(query.split())  # OR instead of AND
        
        fts_results = await enhanced_fts_service.enhanced_search_all(
            db=db,
            query=relaxed_query,
            user_id=user_id,
            modules=modules,
            limit=200,  # Larger candidate pool
            offset=0
        )
        
        candidates = fts_results.get("results", [])
        
        # Apply aggressive fuzzy matching
        fuzzy_results = await self._apply_fuzzy_reranking(
            candidates=candidates,
            query=query,
            fuzzy_threshold=fuzzy_threshold or (self.fuzzy_threshold - 10)  # Lower threshold
        )
        
        # Apply pagination
        total_results = len(fuzzy_results)
        paginated_results = fuzzy_results[offset:offset + limit]
        
        return {
            "results": paginated_results,
            "total": total_results,
            "fts_candidates": len(candidates),
            "search_method": "pure_fuzzy",
            "modules_searched": fts_results.get("modules_searched", []),
            "query": query,
            "applied_fuzzy": True
        }

    async def search_suggestions(self, db: AsyncSession, partial_query: str, user_id: int,
                                limit: int = 10) -> List[str]:
        """Generate search suggestions based on partial query"""
        
        if len(partial_query.strip()) < 2:
            return []
        
        # Get recent titles/names that might match
        fts_results = await enhanced_fts_service.enhanced_search_all(
            db=db,
            query=partial_query + "*",  # Prefix matching
            user_id=user_id,
            limit=20
        )
        
        suggestions = set()
        
        for result in fts_results.get("results", []):
            title = result.get('title') or result.get('name', '')
            if title and partial_query.lower() in title.lower():
                suggestions.add(title)
            
            # Add tag suggestions
            tags = result.get('tags', [])
            for tag in tags:
                if partial_query.lower() in tag.lower():
                    suggestions.add(tag)
        
        return sorted(list(suggestions))[:limit]

# Create global instance
hybrid_search_service = HybridSearchService()
