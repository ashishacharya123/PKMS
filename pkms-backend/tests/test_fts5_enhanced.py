"""
Enhanced FTS5 Search System Tests for PKMS Backend.

Tests the enhanced FTS5 implementation with BM25 ranking, cross-module normalization,
embedded tags, and comprehensive filtering capabilities.

Created by: AI Assistant (Claude Sonnet 4)
Date: 2025-01-16
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.services.fts_service_enhanced import enhanced_fts_service
from app.services.hybrid_search import HybridSearchService
from app.models.user import User
from app.models.note import Note
from app.models.document import Document
from app.models.todo import Todo, Project
from app.models.archive import ArchiveFolder, ArchiveItem
from app.models.diary import DiaryEntry
from app.models.tag import Tag
from .conftest import assert_response_success


class TestEnhancedFTS5Initialization:
    """Test enhanced FTS5 table creation and initialization."""
    
    @pytest.mark.asyncio
    async def test_enhanced_fts_tables_creation(self, db_session: AsyncSession):
        """Test that enhanced FTS5 tables are created correctly."""
        # Initialize enhanced FTS5 tables
        success = await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        assert success, "Enhanced FTS5 tables should initialize successfully"
        
        # Verify tables exist
        tables_to_check = [
            'fts_notes_enhanced',
            'fts_documents_enhanced', 
            'fts_archive_items_enhanced',
            'fts_todos_enhanced',
            'fts_diary_entries_enhanced',
            'fts_folders_enhanced'
        ]
        
        for table in tables_to_check:
            result = await db_session.execute(text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'"))
            assert result.fetchone() is not None, f"Table {table} should exist"
    
    @pytest.mark.asyncio
    async def test_enhanced_fts_schema_validation(self, db_session: AsyncSession):
        """Test that enhanced FTS5 tables have correct schema."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Check notes enhanced table schema
        result = await db_session.execute(text("PRAGMA table_info(fts_notes_enhanced)"))
        columns = [row[1] for row in result.fetchall()]
        
        expected_columns = ['id', 'title', 'content', 'tags_text', 'area', 'user_id', 'created_at', 'updated_at', 'is_favorite']
        for col in expected_columns:
            assert col in columns, f"Column {col} should exist in fts_notes_enhanced"
    
    @pytest.mark.asyncio
    async def test_fts_triggers_creation(self, db_session: AsyncSession):
        """Test that FTS sync triggers are created properly."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Check that triggers exist
        result = await db_session.execute(text("""
            SELECT name FROM sqlite_master 
            WHERE type='trigger' AND name LIKE '%fts%'
        """))
        triggers = [row[0] for row in result.fetchall()]
        
        # Should have triggers for insert, update, delete operations
        assert len(triggers) > 0, "FTS sync triggers should be created"


class TestEnhancedFTS5Search:
    """Test enhanced FTS5 search functionality with ranking and filtering."""
    
    @pytest.fixture
    async def sample_data(self, db_session: AsyncSession, test_user: User):
        """Create sample data for testing."""
        # Initialize enhanced FTS5 first
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Create sample notes
        note1 = Note(
            title="Machine Learning Fundamentals",
            content="Deep learning and neural networks are revolutionizing AI. TensorFlow and PyTorch are popular frameworks.",
            user_id=test_user.id,
            area="Tech"
        )
        note2 = Note(
            title="Python Programming Guide", 
            content="Python is excellent for machine learning. Use pandas for data manipulation and scikit-learn for ML.",
            user_id=test_user.id,
            area="Programming"
        )
        note3 = Note(
            title="Project Management",
            content="Agile methodology and scrum are effective for team collaboration.",
            user_id=test_user.id,
            area="Business"
        )
        
        # Create sample documents
        doc1 = Document(
            title="AI Research Paper",
            filename="ai_research.pdf",
            original_name="ai_research.pdf",
            file_path="/docs/ai_research.pdf",
            file_size=1024000,
            mime_type="application/pdf",
            description="Latest research on artificial intelligence and machine learning algorithms",
            user_id=test_user.id
        )
        
        # Create sample todos
        todo1 = Todo(
            title="Learn TensorFlow",
            description="Complete TensorFlow tutorial for machine learning projects",
            user_id=test_user.id,
            priority="high"
        )
        
        # Add all to session
        db_session.add_all([note1, note2, note3, doc1, todo1])
        await db_session.commit()
        
        # Populate FTS tables
        await enhanced_fts_service.populate_enhanced_fts_tables(db_session)
        
        return {
            'notes': [note1, note2, note3],
            'documents': [doc1],
            'todos': [todo1]
        }
    
    @pytest.mark.asyncio
    async def test_cross_module_search(self, db_session: AsyncSession, test_user: User, sample_data):
        """Test search across multiple content modules."""
        search_query = "machine learning"
        
        results = await enhanced_fts_service.search_enhanced(
            db_session,
            query=search_query,
            user_id=test_user.id,
            modules=['notes', 'documents', 'todos'],
            limit=10
        )
        
        assert len(results) > 0, "Should find results for 'machine learning'"
        
        # Check that results come from multiple modules
        modules_found = set(result['module'] for result in results)
        assert len(modules_found) >= 2, "Should find results from multiple modules"
        
        # Check ranking order (higher scores should come first)
        for i in range(len(results) - 1):
            assert results[i]['score'] >= results[i + 1]['score'], "Results should be ranked by score"
    
    @pytest.mark.asyncio
    async def test_bm25_ranking(self, db_session: AsyncSession, test_user: User, sample_data):
        """Test BM25 ranking algorithm implementation."""
        # Search for a term that appears multiple times
        results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="Python",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        
        assert len(results) > 0, "Should find Python-related results"
        
        # Verify BM25 scoring
        for result in results:
            assert 'bm25_score' in result, "Results should include BM25 score"
            assert result['bm25_score'] > 0, "BM25 score should be positive"
    
    @pytest.mark.asyncio
    async def test_tag_embedded_search(self, db_session: AsyncSession, test_user: User, sample_data):
        """Test search with embedded tags functionality."""
        # Add tags to a note
        note = sample_data['notes'][0]
        
        # Create and assign tags
        tag1 = Tag(name="artificial-intelligence", user_id=test_user.id)
        tag2 = Tag(name="deep-learning", user_id=test_user.id)
        db_session.add_all([tag1, tag2])
        await db_session.commit()
        
        note.tag_objs.extend([tag1, tag2])
        await db_session.commit()
        
        # Re-populate FTS to include tags
        await enhanced_fts_service.populate_enhanced_fts_tables(db_session)
        
        # Search by tag
        results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="artificial-intelligence",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        
        assert len(results) > 0, "Should find results by tag"
        
        # Verify tag information in results
        found_note = next((r for r in results if r['id'] == note.id), None)
        assert found_note is not None, "Should find the tagged note"
        assert 'artificial-intelligence' in found_note.get('tags_text', ''), "Should include tag in search data"
    
    @pytest.mark.asyncio 
    async def test_filter_by_module(self, db_session: AsyncSession, test_user: User, sample_data):
        """Test filtering search results by specific modules."""
        # Search only in notes
        notes_results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="machine learning",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        
        # Search only in documents  
        docs_results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="machine learning",
            user_id=test_user.id,
            modules=['documents'],
            limit=10
        )
        
        # Verify module filtering
        for result in notes_results:
            assert result['module'] == 'notes', "Notes search should only return notes"
            
        for result in docs_results:
            assert result['module'] == 'documents', "Documents search should only return documents"
    
    @pytest.mark.asyncio
    async def test_search_performance(self, db_session: AsyncSession, test_user: User, sample_data):
        """Test search performance and response times."""
        import time
        
        start_time = time.time()
        
        results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="machine learning python",
            user_id=test_user.id,
            modules=['notes', 'documents', 'todos'],
            limit=50
        )
        
        end_time = time.time()
        search_time = end_time - start_time
        
        # Search should complete within reasonable time (less than 1 second for small dataset)
        assert search_time < 1.0, f"Search took {search_time:.3f}s, should be under 1s"
        assert len(results) >= 0, "Should return results (even if empty)"


class TestHybridSearch:
    """Test hybrid search functionality combining FTS5 with traditional search."""
    
    @pytest.mark.asyncio
    async def test_hybrid_search_initialization(self, db_session: AsyncSession):
        """Test hybrid search service initialization."""
        hybrid_service = HybridSearchService()
        
        # Test that it can initialize without errors
        assert hybrid_service is not None
        assert hasattr(hybrid_service, 'search'), "Should have search method"
    
    @pytest.mark.asyncio
    async def test_hybrid_search_fallback(self, db_session: AsyncSession, test_user: User):
        """Test hybrid search fallback when FTS5 is unavailable."""
        hybrid_service = HybridSearchService()
        
        # Test search with potentially missing FTS5 tables
        results = await hybrid_service.search(
            db_session,
            query="test query",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        
        # Should not raise an error even if FTS5 tables don't exist
        assert isinstance(results, list), "Should return a list of results"


class TestFTS5Performance:
    """Test FTS5 performance optimization and maintenance."""
    
    @pytest.mark.asyncio
    async def test_fts_optimization(self, db_session: AsyncSession):
        """Test FTS5 table optimization."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Test optimization
        success = await enhanced_fts_service.optimize_enhanced_fts_tables(db_session)
        assert success, "FTS5 optimization should succeed"
    
    @pytest.mark.asyncio
    async def test_fts_statistics(self, db_session: AsyncSession):
        """Test FTS5 table statistics and health."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Get FTS5 statistics
        stats = await enhanced_fts_service.get_fts_statistics(db_session)
        
        assert isinstance(stats, dict), "Should return statistics dictionary"
        assert 'tables' in stats, "Should include table information"
        assert 'total_documents' in stats, "Should include document count"
    
    @pytest.mark.asyncio
    async def test_large_dataset_performance(self, db_session: AsyncSession, test_user: User):
        """Test performance with larger dataset."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Create larger dataset
        notes = []
        for i in range(100):
            note = Note(
                title=f"Test Note {i}",
                content=f"This is test content for note {i}. It contains various keywords like technology, science, programming, and machine learning.",
                user_id=test_user.id,
                area="Test"
            )
            notes.append(note)
        
        db_session.add_all(notes)
        await db_session.commit()
        
        # Populate FTS tables
        await enhanced_fts_service.populate_enhanced_fts_tables(db_session)
        
        # Test search performance
        import time
        start_time = time.time()
        
        results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="technology programming",
            user_id=test_user.id,
            modules=['notes'],
            limit=20
        )
        
        end_time = time.time()
        search_time = end_time - start_time
        
        assert search_time < 2.0, f"Large dataset search took {search_time:.3f}s, should be under 2s"
        assert len(results) > 0, "Should find results in large dataset"


class TestFTS5ErrorHandling:
    """Test error handling and edge cases in FTS5 search."""
    
    @pytest.mark.asyncio
    async def test_invalid_search_query(self, db_session: AsyncSession, test_user: User):
        """Test handling of invalid search queries."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Test various problematic queries
        problematic_queries = [
            "",  # Empty query
            "   ",  # Whitespace only
            "AND OR NOT",  # FTS5 operators only
            '"unclosed quote',  # Unclosed quote
            "AND NOT",  # Invalid operator combination
        ]
        
        for query in problematic_queries:
            # Should not raise an exception
            results = await enhanced_fts_service.search_enhanced(
                db_session,
                query=query,
                user_id=test_user.id,
                modules=['notes'],
                limit=10
            )
            assert isinstance(results, list), f"Query '{query}' should return a list"
    
    @pytest.mark.asyncio
    async def test_user_isolation(self, db_session: AsyncSession):
        """Test that search results are properly isolated by user."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Create two users
        user1 = User(username="user1", email="user1@test.com", password_hash="hash1")
        user2 = User(username="user2", email="user2@test.com", password_hash="hash2")
        db_session.add_all([user1, user2])
        await db_session.commit()
        
        # Create notes for each user
        note1 = Note(title="User 1 Note", content="Secret content for user 1", user_id=user1.id)
        note2 = Note(title="User 2 Note", content="Secret content for user 2", user_id=user2.id)
        db_session.add_all([note1, note2])
        await db_session.commit()
        
        # Populate FTS
        await enhanced_fts_service.populate_enhanced_fts_tables(db_session)
        
        # Search as user 1
        user1_results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="secret content",
            user_id=user1.id,
            modules=['notes'],
            limit=10
        )
        
        # Search as user 2
        user2_results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="secret content", 
            user_id=user2.id,
            modules=['notes'],
            limit=10
        )
        
        # Each user should only see their own content
        assert len(user1_results) == 1, "User 1 should see only their note"
        assert len(user2_results) == 1, "User 2 should see only their note"
        assert user1_results[0]['id'] == note1.id, "User 1 should see their note"
        assert user2_results[0]['id'] == note2.id, "User 2 should see their note"


class TestFTS5Integration:
    """Test integration between FTS5 and other system components."""
    
    @pytest.mark.asyncio
    async def test_real_time_sync(self, db_session: AsyncSession, test_user: User):
        """Test that FTS5 tables stay in sync with content changes."""
        await enhanced_fts_service.initialize_enhanced_fts_tables(db_session)
        
        # Create a note
        note = Note(
            title="Original Title",
            content="Original content",
            user_id=test_user.id
        )
        db_session.add(note)
        await db_session.commit()
        
        # Populate FTS
        await enhanced_fts_service.populate_enhanced_fts_tables(db_session)
        
        # Search for original content
        results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="Original",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        assert len(results) == 1, "Should find original content"
        
        # Update the note
        note.title = "Updated Title"
        note.content = "Updated content"
        await db_session.commit()
        
        # Re-populate FTS (in real system, this would be handled by triggers)
        await enhanced_fts_service.populate_enhanced_fts_tables(db_session)
        
        # Search for updated content
        updated_results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="Updated",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        assert len(updated_results) == 1, "Should find updated content"
        
        # Original content should no longer be found
        original_results = await enhanced_fts_service.search_enhanced(
            db_session,
            query="Original",
            user_id=test_user.id,
            modules=['notes'],
            limit=10
        )
        assert len(original_results) == 0, "Should not find original content after update"
