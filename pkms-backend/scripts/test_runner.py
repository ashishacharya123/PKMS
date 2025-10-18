#!/usr/bin/env python3
"""
PKMS Backend Test Runner
CLI utility for running tests, health checks, and validations.

Usage:
    python scripts/test_runner.py [command] [options]

Commands:
    health      - Run health checks
    auth        - Test authentication system
    database    - Validate database connections and schema
    api         - Test API endpoints
    full        - Run comprehensive test suite
    coverage    - Run tests with coverage report
"""

import asyncio
import argparse
import sys
import time
from typing import Dict, List, Any
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import requests
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.config import get_settings
from app.database import Base
from app.auth.security import create_access_token, verify_token


class Colors:
    """ANSI color codes for terminal output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    MAGENTA = '\033[95m'
    CYAN = '\033[96m'
    WHITE = '\033[97m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'
    END = '\033[0m'


def print_header(title: str):
    """Print a formatted header."""
    print(f"\n{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{title.center(60)}{Colors.END}")
    print(f"{Colors.BOLD}{Colors.BLUE}{'='*60}{Colors.END}\n")


def print_success(message: str):
    """Print a success message."""
    print(f"{Colors.GREEN}[+]{Colors.END} {message}")


def print_error(message: str):
    """Print an error message."""
    print(f"{Colors.RED}[-]{Colors.END} {message}")


def print_warning(message: str):
    """Print a warning message."""
    print(f"{Colors.YELLOW}[!]{Colors.END} {message}")


def print_info(message: str):
    """Print an info message."""
    print(f"{Colors.CYAN}[i]{Colors.END} {message}")


class HealthChecker:
    """Health check utilities."""
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = f"http://localhost:{self.settings.PORT}"
    
    def check_server_running(self) -> bool:
        """Check if the backend server is running."""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False
    
    async def check_database_connection(self) -> bool:
        """Check database connectivity."""
        try:
            engine = create_async_engine(self.settings.DATABASE_URL)
            async with engine.begin() as conn:
                result = await conn.execute(text("SELECT 1"))
                await engine.dispose()
                return True
        except Exception as e:
            print_error(f"Database connection failed: {e}")
            return False
    
    def check_environment_vars(self) -> Dict[str, bool]:
        """Check required environment variables."""
        required_vars = {
            'DATABASE_URL': bool(self.settings.DATABASE_URL),
            'SECRET_KEY': bool(self.settings.SECRET_KEY),
            'CORS_ORIGINS': bool(self.settings.CORS_ORIGINS),
        }
        return required_vars
    
    async def run_health_checks(self) -> Dict[str, bool]:
        """Run all health checks."""
        print_header("PKMS Backend Health Checks")
        
        results = {}
        
        # Server status
        print_info("Checking server status...")
        server_running = self.check_server_running()
        if server_running:
            print_success("Backend server is running")
        else:
            print_error("Backend server is not responding")
        results['server'] = server_running
        
        # Database connectivity
        print_info("Checking database connection...")
        db_connected = await self.check_database_connection()
        if db_connected:
            print_success("Database connection successful")
        else:
            print_error("Database connection failed")
        results['database'] = db_connected
        
        # Environment variables
        print_info("Checking environment configuration...")
        env_vars = self.check_environment_vars()
        for var, status in env_vars.items():
            if status:
                print_success(f"{var} is configured")
            else:
                print_error(f"{var} is missing or empty")
        results['environment'] = all(env_vars.values())
        
        return results


class AuthTester:
    """Authentication system testing utilities."""
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = f"http://localhost:{self.settings.PORT}"
    
    def test_token_creation(self) -> bool:
        """Test JWT token creation and validation."""
        try:
            # Create token
            token = create_access_token(data={"sub": "test_user"})
            
            # Verify token
            payload = verify_token(token)
            return payload is not None and payload.get("sub") == "test_user"
        except Exception as e:
            print_error(f"Token creation/validation failed: {e}")
            return False
    
    def test_auth_endpoints(self) -> Dict[str, bool]:
        """Test authentication endpoints."""
        results = {}
        
        # Test login endpoint accessibility
        try:
            response = requests.post(
                f"{self.base_url}/api/v1/auth/login",
                json={"username": "test", "password": "test"},
                timeout=5
            )
            # We expect 400 or 401 for invalid credentials, not connection errors
            results['login_endpoint'] = response.status_code in [400, 401, 422]
        except requests.RequestException as e:
            print_error(f"Login endpoint test failed: {e}")
            results['login_endpoint'] = False
        
        return results
    
    async def run_auth_tests(self) -> Dict[str, bool]:
        """Run authentication tests."""
        print_header("Authentication System Tests")
        
        results = {}
        
        # Token functionality
        print_info("Testing JWT token creation and validation...")
        token_test = self.test_token_creation()
        if token_test:
            print_success("JWT token system working correctly")
        else:
            print_error("JWT token system has issues")
        results['jwt_tokens'] = token_test
        
        # Auth endpoints
        print_info("Testing authentication endpoints...")
        endpoint_tests = self.test_auth_endpoints()
        for endpoint, status in endpoint_tests.items():
            if status:
                print_success(f"{endpoint} is accessible")
            else:
                print_error(f"{endpoint} is not accessible")
        results.update(endpoint_tests)
        
        return results


class APITester:
    """API endpoint testing utilities."""
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = f"http://localhost:{self.settings.PORT}"
    
    def test_health_endpoint(self) -> bool:
        """Test health check endpoint."""
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            return response.status_code == 200
        except requests.RequestException:
            return False
    
    def test_cors_headers(self) -> bool:
        """Test CORS configuration."""
        try:
            response = requests.options(
                f"{self.base_url}/api/v1/notes/",
                headers={'Origin': 'http://localhost:3000'},
                timeout=5
            )
            return 'access-control-allow-origin' in response.headers
        except requests.RequestException:
            return False
    
    async def run_api_tests(self) -> Dict[str, bool]:
        """Run API endpoint tests."""
        print_header("API Endpoint Tests")
        
        results = {}
        
        # Health endpoint
        print_info("Testing health endpoint...")
        health_test = self.test_health_endpoint()
        if health_test:
            print_success("Health endpoint responding correctly")
        else:
            print_error("Health endpoint not responding")
        results['health_endpoint'] = health_test
        
        # CORS configuration
        print_info("Testing CORS configuration...")
        cors_test = self.test_cors_headers()
        if cors_test:
            print_success("CORS headers configured correctly")
        else:
            print_warning("CORS headers may not be configured properly")
        results['cors_configuration'] = cors_test
        
        return results


class TestRunner:
    """Main test runner class."""
    
    def __init__(self):
        self.health_checker = HealthChecker()
        self.auth_tester = AuthTester()
        self.api_tester = APITester()
    
    async def run_full_suite(self) -> Dict[str, Any]:
        """Run comprehensive test suite."""
        print_header("PKMS Comprehensive Test Suite")
        start_time = time.time()
        
        all_results = {}
        
        # Health checks
        health_results = await self.health_checker.run_health_checks()
        all_results['health'] = health_results
        
        # Authentication tests
        auth_results = await self.auth_tester.run_auth_tests()
        all_results['auth'] = auth_results
        
        # API tests
        api_results = await self.api_tester.run_api_tests()
        all_results['api'] = api_results
        
        # Summary
        end_time = time.time()
        self.print_summary(all_results, end_time - start_time)
        
        return all_results
    
    def print_summary(self, results: Dict[str, Any], duration: float):
        """Print test summary."""
        print_header("Test Summary")
        
        total_tests = 0
        passed_tests = 0
        
        for category, tests in results.items():
            if isinstance(tests, dict):
                category_total = len(tests)
                category_passed = sum(1 for result in tests.values() if result)
                total_tests += category_total
                passed_tests += category_passed
                
                print(f"{Colors.BOLD}{category.upper()}:{Colors.END} {category_passed}/{category_total} passed")
        
        print(f"\n{Colors.BOLD}OVERALL:{Colors.END} {passed_tests}/{total_tests} tests passed")
        print(f"{Colors.BOLD}DURATION:{Colors.END} {duration:.2f} seconds")
        
        if passed_tests == total_tests:
            print(f"\n{Colors.GREEN}{Colors.BOLD}[+] All tests passed!{Colors.END}")
        else:
            print(f"\n{Colors.YELLOW}{Colors.BOLD}[!] Some tests failed. Check output above.{Colors.END}")
    
    def run_pytest_with_coverage(self):
        """Run pytest with coverage reporting."""
        print_header("Running Tests with Coverage")
        
        # Run pytest with coverage
        exit_code = pytest.main([
            "tests/",
            "--cov=app",
            "--cov-report=html",
            "--cov-report=term-missing",
            "--verbose"
        ])
        
        if exit_code == 0:
            print_success("All pytest tests passed!")
            print_info("Coverage report generated in htmlcov/index.html")
        else:
            print_error("Some pytest tests failed")
        
        return exit_code == 0


async def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="PKMS Backend Test Runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument(
        'command',
        choices=['health', 'auth', 'database', 'api', 'full', 'coverage'],
        help='Test command to run'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output'
    )
    
    args = parser.parse_args()
    
    runner = TestRunner()
    
    try:
        if args.command == 'health':
            await runner.health_checker.run_health_checks()
        elif args.command == 'auth':
            await runner.auth_tester.run_auth_tests()
        elif args.command == 'database':
            result = await runner.health_checker.check_database_connection()
            if result:
                print_success("Database connection successful")
            else:
                print_error("Database connection failed")
        elif args.command == 'api':
            await runner.api_tester.run_api_tests()
        elif args.command == 'full':
            await runner.run_full_suite()
        elif args.command == 'coverage':
            runner.run_pytest_with_coverage()
    
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Test execution interrupted by user{Colors.END}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test execution failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 