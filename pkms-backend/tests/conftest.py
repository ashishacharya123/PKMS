"""
Pytest configuration and shared fixtures for PKMS backend tests.

This module provides common fixtures, test database setup, and authentication utilities
that are used across multiple test modules.
"""

import pytest
import asyncio
from typing import AsyncGenerator, Generator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.database import Base, get_db
from app.models.user import User
from app.auth.security import hash_password, create_access_token
from app.config import get_settings

# Test database URL (in-memory SQLite)
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        poolclass=StaticPool,
        connect_args={"check_same_thread": False}
    )
    
    # Create all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    # Drop all tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    
    await engine.dispose()

@pytest.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    
    async with async_session() as session:
        yield session
        await session.rollback()

@pytest.fixture
def override_get_db(db_session: AsyncSession):
    """Override the get_db dependency for testing."""
    async def _override_get_db():
        yield db_session
    return _override_get_db

@pytest.fixture
def test_client(override_get_db) -> TestClient:
    """Create test client with overridden database dependency."""
    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()

@pytest.fixture
async def async_client(override_get_db) -> AsyncGenerator[AsyncClient, None]:
    """Create async test client."""
    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()

@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a test user in the database."""
    user = User(
        username="testuser",
        email="test@example.com",
        password_hash=hash_password("TestPassword123!"),
        is_active=True,
        is_first_login=False
    )
    
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    return user

@pytest.fixture
async def test_user_first_login(db_session: AsyncSession) -> User:
    """Create a test user that hasn't completed setup."""
    user = User(
        username="newuser",
        email="new@example.com", 
        password_hash=hash_password("NewPassword123!"),
        is_active=True,
        is_first_login=True
    )
    
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    
    return user

@pytest.fixture
def test_access_token(test_user: User) -> str:
    """Create a valid access token for testing."""
    return create_access_token(data={"sub": str(test_user.id)})

@pytest.fixture
def auth_headers(test_access_token: str) -> dict:
    """Create authorization headers for API requests."""
    return {"Authorization": f"Bearer {test_access_token}"}

@pytest.fixture
def test_settings():
    """Get test-specific settings."""
    settings = get_settings()
    settings.environment = "testing"
    return settings

# Utility functions for tests
def assert_token_valid(token: str) -> bool:
    """Assert that a JWT token is valid and well-formed."""
    try:
        parts = token.split('.')
        assert len(parts) == 3, "JWT token should have 3 parts"
        
        import base64
        import json
        
        # Decode payload (add padding if needed)
        payload = parts[1]
        payload += '=' * (4 - len(payload) % 4)
        decoded = base64.b64decode(payload)
        data = json.loads(decoded)
        
        assert 'sub' in data, "Token should contain 'sub' claim"
        assert 'exp' in data, "Token should contain 'exp' claim"
        
        return True
    except Exception as e:
        pytest.fail(f"Invalid JWT token: {e}")

def assert_response_success(response, expected_status: int = 200):
    """Assert that an API response is successful."""
    assert response.status_code == expected_status, f"Expected {expected_status}, got {response.status_code}: {response.text}"

def assert_response_error(response, expected_status: int, expected_detail: str = None):
    """Assert that an API response contains expected error."""
    assert response.status_code == expected_status, f"Expected {expected_status}, got {response.status_code}"
    
    if expected_detail:
        data = response.json()
        assert 'detail' in data, "Error response should contain 'detail' field"
        assert expected_detail.lower() in data['detail'].lower(), f"Expected error detail containing '{expected_detail}'" 