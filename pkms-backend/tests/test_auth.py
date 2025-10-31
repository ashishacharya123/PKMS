"""
Authentication system tests for PKMS backend.

Tests cover JWT token generation, validation, user authentication,
session management, and race condition scenarios.
"""

import pytest
import time
from datetime import timedelta
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.auth.security import verify_token, create_access_token
from app.models.user import User
from .conftest import assert_token_valid, assert_response_success, assert_response_error


class TestJWTAuthentication:
    """Test JWT token generation and validation."""
    
    def test_create_access_token(self):
        """Test JWT token creation."""
        created_by = "123"
        token = create_access_token(data={"sub": created_by})
        
        assert_token_valid(token)
        
        # Verify token payload
        payload = verify_token(token)
        assert payload is not None
        assert payload["sub"] == created_by
        assert "exp" in payload
    
    def test_token_expiration(self):
        """Test token expiration handling."""
        # Create token with short expiration
        token = create_access_token(
            data={"sub": "123"}, 
            expires_delta=timedelta(seconds=1)
        )
        
        # Token should be valid immediately
        payload = verify_token(token)
        assert payload is not None
        
        # Wait for expiration
        time.sleep(2)
        
        # Token should be expired
        payload = verify_token(token)
        assert payload is None
    
    def test_invalid_token_format(self):
        """Test handling of malformed tokens."""
        invalid_tokens = [
            "",
            "invalid.token",
            "invalid.token.format.too.many.parts",
            "Bearer token",
            None
        ]
        
        for token in invalid_tokens:
            payload = verify_token(token)
            assert payload is None


class TestUserAuthentication:
    """Test user login and authentication endpoints."""
    
    def test_user_setup_success(self, test_client: TestClient):
        """Test successful user setup."""
        user_data = {
            "username": "newuser",
            "password": "SecurePassword123!",
            "email": "new@example.com"
        }
        
        response = test_client.post("/api/v1/auth/setup", json=user_data)
        assert_response_success(response, 200)
        
        data = response.json()
        assert data["username"] == user_data["username"]
        assert data["is_first_login"] is True
        assert_token_valid(data["access_token"])
    
    def test_user_setup_weak_password(self, test_client: TestClient):
        """Test user setup with weak password."""
        user_data = {
            "username": "newuser",
            "password": "weak",
            "email": "new@example.com"
        }
        
        response = test_client.post("/api/v1/auth/setup", json=user_data)
        assert_response_error(response, 422)
    
    def test_login_success(self, test_client: TestClient, test_user: User):
        """Test successful user login."""
        login_data = {
            "username": test_user.username,
            "password": "TestPassword123!"
        }
        
        response = test_client.post("/api/v1/auth/login", json=login_data)
        assert_response_success(response, 200)
        
        data = response.json()
        assert data["username"] == test_user.username
        assert data["created_by"] == test_user.uuid
        assert_token_valid(data["access_token"])
    
    def test_login_invalid_credentials(self, test_client: TestClient, test_user: User):
        """Test login with invalid credentials."""
        login_data = {
            "username": test_user.username,
            "password": "WrongPassword"
        }
        
        response = test_client.post("/api/v1/auth/login", json=login_data)
        assert_response_error(response, 401, "Invalid credentials")
    
    def test_login_nonexistent_user(self, test_client: TestClient):
        """Test login with non-existent user."""
        login_data = {
            "username": "nonexistent",
            "password": "AnyPassword123!"
        }
        
        response = test_client.post("/api/v1/auth/login", json=login_data)
        assert_response_error(response, 401, "Invalid credentials")


class TestProtectedEndpoints:
    """Test authentication on protected endpoints."""
    
    def test_protected_endpoint_without_token(self, test_client: TestClient):
        """Test accessing protected endpoint without token."""
        response = test_client.get("/api/v1/auth/me")
        assert_response_error(response, 401, "Not authenticated")
    
    def test_protected_endpoint_with_invalid_token(self, test_client: TestClient):
        """Test protected endpoint with invalid token."""
        headers = {"Authorization": "Bearer invalid_token"}
        response = test_client.get("/api/v1/auth/me", headers=headers)
        assert_response_error(response, 401, "Invalid token")
    
    def test_protected_endpoint_with_valid_token(self, test_client: TestClient, auth_headers: dict):
        """Test protected endpoint with valid token."""
        response = test_client.get("/api/v1/auth/me", headers=auth_headers)
        assert_response_success(response, 200)
        
        data = response.json()
        assert "username" in data
        assert "id" in data


class TestAuthenticationRaceCondition:
    """Test scenarios that could cause authentication race conditions."""
    
    def test_rapid_successive_requests(self, test_client: TestClient, auth_headers: dict):
        """Test rapid successive API requests (race condition simulation)."""
        # Simulate the race condition scenario where multiple requests
        # are made immediately after authentication
        
        endpoints = [
            "/api/v1/auth/me",
            "/api/v1/notes/",
            "/api/v1/documents/",
            "/api/v1/todos/",
            "/api/v1/dashboard/stats"
        ]
        
        # Make rapid successive requests
        responses = []
        for endpoint in endpoints:
            response = test_client.get(endpoint, headers=auth_headers)
            responses.append((endpoint, response))
        
        # All requests should succeed (no 403 errors)
        for endpoint, response in responses:
            if endpoint == "/api/v1/auth/me":
                assert_response_success(response, 200)
            else:
                # Other endpoints might return different status codes
                # but should not return 403 (authentication error)
                assert response.status_code != 403, f"Endpoint {endpoint} returned 403 (authentication error)"
    
    def test_token_validation_consistency(self, test_client: TestClient):
        """Test that token validation is consistent across requests."""
        # Create user and get token
        user_data = {
            "username": "consistencytest",
            "password": "TestPassword123!",
            "email": "consistency@example.com"
        }
        
        setup_response = test_client.post("/api/v1/auth/setup", json=user_data)
        assert_response_success(setup_response, 200)
        
        token = setup_response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Make multiple requests with the same token
        for i in range(10):
            response = test_client.get("/api/v1/auth/me", headers=headers)
            assert_response_success(response, 200)
            
            # Verify response consistency
            data = response.json()
            assert data["username"] == user_data["username"]
    
    @pytest.mark.asyncio
    async def test_concurrent_authentication(self, async_client: AsyncClient):
        """Test concurrent authentication requests."""
        import asyncio
        
        user_data = {
            "username": "concurrenttest",
            "password": "TestPassword123!",
            "email": "concurrent@example.com"
        }
        
        # Setup user first
        setup_response = await async_client.post("/api/v1/auth/setup", json=user_data)
        assert setup_response.status_code == 200
        
        # Create multiple concurrent login requests
        login_data = {
            "username": user_data["username"],
            "password": user_data["password"]
        }
        
        async def make_login_request():
            return await async_client.post("/api/v1/auth/login", json=login_data)
        
        # Execute concurrent requests
        tasks = [make_login_request() for _ in range(5)]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        
        # All requests should succeed
        for response in responses:
            assert not isinstance(response, Exception), f"Request failed with exception: {response}"
            assert response.status_code == 200
            assert_token_valid(response.json()["access_token"])


class TestTokenLifecycle:
    """Test token lifecycle and session management."""
    
    def test_token_refresh(self, test_client: TestClient, test_user: User):
        """Test token refresh functionality."""
        # Login to get initial token
        login_data = {
            "username": test_user.username,
            "password": "TestPassword123!"
        }
        
        response = test_client.post("/api/v1/auth/login", json=login_data)
        assert_response_success(response, 200)
        
        # Check if refresh token is set in cookies
        assert "pkms_refresh" in response.cookies
    
    def test_logout(self, test_client: TestClient, auth_headers: dict):
        """Test user logout."""
        response = test_client.post("/api/v1/auth/logout", headers=auth_headers)
        assert_response_success(response, 200)
    
    def test_expired_token_handling(self, test_client: TestClient):
        """Test handling of expired tokens."""
        # Create an expired token
        expired_token = create_access_token(
            data={"sub": "123"},
            expires_delta=timedelta(seconds=-1)  # Already expired
        )
        
        headers = {"Authorization": f"Bearer {expired_token}"}
        response = test_client.get("/api/v1/auth/me", headers=headers)
        assert_response_error(response, 401, "token expired")


class TestAuthenticationDebugging:
    """Test authentication debugging utilities."""
    
    def test_token_validation_utility(self):
        """Test the token validation utility function."""
        # Valid token
        valid_token = create_access_token(data={"sub": "123"})
        assert assert_token_valid(valid_token) is True
        
        # Invalid tokens should raise assertion errors
        with pytest.raises(AssertionError):
            assert_token_valid("invalid.token")
        
        with pytest.raises(AssertionError):
            assert_token_valid("")
    
    def test_authentication_status_check(self, test_client: TestClient, test_user: User):
        """Test comprehensive authentication status check."""
        # This test simulates the debugging script we created
        
        # 1. Check login works
        login_data = {
            "username": test_user.username,
            "password": "TestPassword123!"
        }
        
        login_response = test_client.post("/api/v1/auth/login", json=login_data)
        assert_response_success(login_response, 200)
        
        token = login_response.json()["access_token"]
        
        # 2. Verify token structure
        assert_token_valid(token)
        
        # 3. Test protected endpoint access
        headers = {"Authorization": f"Bearer {token}"}
        me_response = test_client.get("/api/v1/auth/me", headers=headers)
        assert_response_success(me_response, 200)
        
        # 4. Test multiple API endpoints
        test_endpoints = [
            "/api/v1/auth/me",
            "/api/v1/dashboard/stats"
        ]
        
        for endpoint in test_endpoints:
            response = test_client.get(endpoint, headers=headers)
            # Should not get 403 authentication errors
            assert response.status_code != 403, f"Authentication failed for {endpoint}" 