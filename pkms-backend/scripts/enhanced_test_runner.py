#!/usr/bin/env python3
"""
Enhanced PKMS Test Runner with Modern Features

A comprehensive test runner for PKMS backend that includes:
- FTS5 enhanced search testing
- Model validation testing  
- Archive system testing
- Performance benchmarking
- Coverage reporting with HTML output
- Parallel test execution
- Detailed test metrics and reporting

Created by: AI Assistant (Claude Sonnet 4)
Date: 2025-01-16
"""

import asyncio
import argparse
import sys
import time
import subprocess
import json
import shutil
from typing import Dict, List, Any, Optional
from pathlib import Path
from datetime import datetime
import multiprocessing

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import requests
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from app.config import get_settings
from app.database import Base


class Colors:
    """Enhanced ANSI color codes for beautiful terminal output."""
    # Basic colors
    BLACK = '\033[30m'
    RED = '\033[31m'
    GREEN = '\033[32m'
    YELLOW = '\033[33m'
    BLUE = '\033[34m'
    MAGENTA = '\033[35m'
    CYAN = '\033[36m'
    WHITE = '\033[37m'
    
    # Bright colors
    BRIGHT_BLACK = '\033[90m'
    BRIGHT_RED = '\033[91m'
    BRIGHT_GREEN = '\033[92m'
    BRIGHT_YELLOW = '\033[93m'
    BRIGHT_BLUE = '\033[94m'
    BRIGHT_MAGENTA = '\033[95m'
    BRIGHT_CYAN = '\033[96m'
    BRIGHT_WHITE = '\033[97m'
    
    # Styles
    BOLD = '\033[1m'
    DIM = '\033[2m'
    ITALIC = '\033[3m'
    UNDERLINE = '\033[4m'
    BLINK = '\033[5m'
    REVERSE = '\033[7m'
    STRIKETHROUGH = '\033[9m'
    
    # Reset
    RESET = '\033[0m'
    END = '\033[0m'
    
    # Background colors
    BG_BLACK = '\033[40m'
    BG_RED = '\033[41m'
    BG_GREEN = '\033[42m'
    BG_YELLOW = '\033[43m'
    BG_BLUE = '\033[44m'
    BG_MAGENTA = '\033[45m'
    BG_CYAN = '\033[46m'
    BG_WHITE = '\033[47m'


def print_banner(title: str, emoji: str = "🧪"):
    """Print a beautiful banner for sections."""
    width = 80
    print(f"\n{Colors.BRIGHT_CYAN}{'='*width}{Colors.RESET}")
    print(f"{Colors.BRIGHT_CYAN}║{Colors.RESET}{Colors.BOLD}{Colors.BRIGHT_WHITE}{emoji} {title.center(width-6)}{Colors.RESET}{Colors.BRIGHT_CYAN}║{Colors.RESET}")
    print(f"{Colors.BRIGHT_CYAN}{'='*width}{Colors.RESET}\n")


def print_section(title: str, emoji: str = "📋"):
    """Print a section header."""
    print(f"\n{Colors.BRIGHT_BLUE}{Colors.BOLD}{emoji} {title}{Colors.RESET}")
    print(f"{Colors.BRIGHT_BLUE}{'-' * (len(title) + 3)}{Colors.RESET}")


def print_success(message: str, emoji: str = "✅"):
    """Print a success message."""
    print(f"{Colors.BRIGHT_GREEN}{emoji} {message}{Colors.RESET}")


def print_error(message: str, emoji: str = "❌"):
    """Print an error message."""
    print(f"{Colors.BRIGHT_RED}{emoji} {message}{Colors.RESET}")


def print_warning(message: str, emoji: str = "⚠️"):
    """Print a warning message."""
    print(f"{Colors.BRIGHT_YELLOW}{emoji} {message}{Colors.RESET}")


def print_info(message: str, emoji: str = "ℹ️"):
    """Print an info message."""
    print(f"{Colors.BRIGHT_CYAN}{emoji} {message}{Colors.RESET}")


def print_metric(label: str, value: Any, unit: str = "", emoji: str = "📊"):
    """Print a metric in a formatted way."""
    print(f"{Colors.BRIGHT_MAGENTA}{emoji} {label}:{Colors.RESET} {Colors.BOLD}{value}{unit}{Colors.RESET}")


class EnhancedTestRunner:
    """Enhanced test runner with modern features and beautiful output."""
    
    def __init__(self):
        self.settings = get_settings()
        self.base_url = f"http://localhost:{self.settings.PORT}"
        self.test_results = {}
        self.start_time = None
        self.cpu_count = multiprocessing.cpu_count()
        
    def run_command(self, command: List[str], capture_output: bool = True) -> subprocess.CompletedProcess:
        """Run a command and return the result."""
        try:
            result = subprocess.run(
                command,
                capture_output=capture_output,
                text=True,
                cwd=Path(__file__).parent.parent
            )
            return result
        except FileNotFoundError as e:
            print_error(f"Command not found: {' '.join(command)}")
            print_error(f"Error: {e}")
            sys.exit(1)
    
    def check_dependencies(self) -> bool:
        """Check that all required dependencies are available."""
        print_section("Dependency Check", "🔍")
        
        dependencies = [
            ("pytest", "pytest --version"),
            ("coverage", "coverage --version"),
            ("python", "python --version"),
        ]
        
        all_good = True
        for name, command in dependencies:
            try:
                result = self.run_command(command.split())
                if result.returncode == 0:
                    version = result.stdout.strip().split('\n')[0]
                    print_success(f"{name}: {version}")
                else:
                    print_error(f"{name}: Not available or failed")
                    all_good = False
            except Exception as e:
                print_error(f"{name}: Error checking - {e}")
                all_good = False
        
        return all_good
    
    def check_server_health(self) -> bool:
        """Check if the backend server is running and healthy."""
        print_section("Server Health Check", "🏥")
        
        try:
            response = requests.get(f"{self.base_url}/health", timeout=5)
            if response.status_code == 200:
                print_success(f"Backend server is healthy (HTTP {response.status_code})")
                print_metric("Response time", f"{response.elapsed.total_seconds():.3f}", "s", "⚡")
                return True
            else:
                print_warning(f"Backend server returned HTTP {response.status_code}")
                return False
        except requests.RequestException as e:
            print_error(f"Backend server is not responding: {e}")
            print_info("Make sure the backend is running with: python main.py")
            return False
    
    async def check_database_connectivity(self) -> bool:
        """Check database connectivity."""
        print_section("Database Connectivity", "🗄️")
        
        try:
            engine = create_async_engine(self.settings.DATABASE_URL)
            async with engine.begin() as conn:
                result = await conn.execute(text("SELECT 1"))
                row = result.fetchone()
                await engine.dispose()
                
                if row and row[0] == 1:
                    print_success("Database connection successful")
                    print_metric("Database URL", self.settings.DATABASE_URL.split('://')[0] + "://...", "", "🔗")
                    return True
                else:
                    print_error("Database query returned unexpected result")
                    return False
                    
        except Exception as e:
            print_error(f"Database connection failed: {e}")
            return False
    
    async def run_fts5_tests(self) -> Dict[str, Any]:
        """Run FTS5 enhanced search tests."""
        print_section("FTS5 Enhanced Search Tests", "🔍")
        
        start_time = time.time()
        
        # Run FTS5 specific tests
        result = self.run_command([
            "python", "-m", "pytest", 
            "tests/test_fts5_enhanced.py",
            "-v",
            "--tb=short",
            "--disable-warnings"
        ])
        
        end_time = time.time()
        duration = end_time - start_time
        
        test_results = {
            "exit_code": result.returncode,
            "duration": duration,
            "output": result.stdout,
            "errors": result.stderr
        }
        
        if result.returncode == 0:
            print_success(f"FTS5 tests passed")
            print_metric("Duration", f"{duration:.2f}", "s", "⏱️")
        else:
            print_error(f"FTS5 tests failed (exit code: {result.returncode})")
            if result.stderr:
                print(f"{Colors.RED}{result.stderr}{Colors.RESET}")
        
        return test_results
    
    async def run_model_tests(self) -> Dict[str, Any]:
        """Run database model tests."""
        print_section("Database Model Tests", "🏗️")
        
        start_time = time.time()
        
        # Run model specific tests
        result = self.run_command([
            "python", "-m", "pytest", 
            "tests/test_models.py",
            "-v",
            "--tb=short",
            "--disable-warnings"
        ])
        
        end_time = time.time()
        duration = end_time - start_time
        
        test_results = {
            "exit_code": result.returncode,
            "duration": duration,
            "output": result.stdout,
            "errors": result.stderr
        }
        
        if result.returncode == 0:
            print_success(f"Model tests passed")
            print_metric("Duration", f"{duration:.2f}", "s", "⏱️")
        else:
            print_error(f"Model tests failed (exit code: {result.returncode})")
            if result.stderr:
                print(f"{Colors.RED}{result.stderr}{Colors.RESET}")
        
        return test_results
    
    async def run_archive_tests(self) -> Dict[str, Any]:
        """Run archive system tests."""
        print_section("Archive System Tests", "📦")
        
        start_time = time.time()
        
        # Run archive specific tests
        result = self.run_command([
            "python", "-m", "pytest", 
            "tests/test_archive_system.py",
            "-v",
            "--tb=short",
            "--disable-warnings"
        ])
        
        end_time = time.time()
        duration = end_time - start_time
        
        test_results = {
            "exit_code": result.returncode,
            "duration": duration,
            "output": result.stdout,
            "errors": result.stderr
        }
        
        if result.returncode == 0:
            print_success(f"Archive tests passed")
            print_metric("Duration", f"{duration:.2f}", "s", "⏱️")
        else:
            print_error(f"Archive tests failed (exit code: {result.returncode})")
            if result.stderr:
                print(f"{Colors.RED}{result.stderr}{Colors.RESET}")
        
        return test_results
    
    def run_coverage_tests(self) -> Dict[str, Any]:
        """Run all tests with coverage reporting."""
        print_section("Coverage Analysis", "📊")
        
        start_time = time.time()
        
        # Run tests with coverage
        result = self.run_command([
            "python", "-m", "pytest",
            "tests/",
            "--cov=app",
            "--cov-report=html",
            "--cov-report=term-missing",
            "--cov-report=json",
            "-v",
            "--tb=short",
            f"-n{min(self.cpu_count, 4)}",  # Parallel execution
            "--disable-warnings"
        ])
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Parse coverage results
        coverage_data = {}
        try:
            coverage_json_path = Path("coverage.json")
            if coverage_json_path.exists():
                with open(coverage_json_path, 'r') as f:
                    coverage_data = json.load(f)
        except Exception as e:
            print_warning(f"Could not parse coverage data: {e}")
        
        test_results = {
            "exit_code": result.returncode,
            "duration": duration,
            "output": result.stdout,
            "errors": result.stderr,
            "coverage_data": coverage_data
        }
        
        if result.returncode == 0:
            print_success(f"Coverage tests completed")
            print_metric("Duration", f"{duration:.2f}", "s", "⏱️")
            
            # Display coverage summary
            if 'totals' in coverage_data:
                total_coverage = coverage_data['totals'].get('percent_covered', 0)
                print_metric("Coverage", f"{total_coverage:.1f}", "%", "📈")
                
                if total_coverage >= 80:
                    print_success(f"Excellent coverage! ({total_coverage:.1f}%)")
                elif total_coverage >= 60:
                    print_warning(f"Good coverage ({total_coverage:.1f}%), aim for 80%+")
                else:
                    print_error(f"Low coverage ({total_coverage:.1f}%), needs improvement")
            
            print_info("HTML coverage report generated in htmlcov/index.html")
        else:
            print_error(f"Coverage tests failed (exit code: {result.returncode})")
            if result.stderr:
                print(f"{Colors.RED}{result.stderr}{Colors.RESET}")
        
        return test_results
    
    def run_performance_benchmark(self) -> Dict[str, Any]:
        """Run performance benchmarks."""
        print_section("Performance Benchmark", "🚀")
        
        start_time = time.time()
        
        # Run performance tests
        result = self.run_command([
            "python", "-m", "pytest",
            "tests/",
            "-k", "performance",
            "--benchmark-only",
            "--benchmark-sort=mean",
            "--benchmark-json=benchmark_results.json",
            "-v"
        ])
        
        end_time = time.time()
        duration = end_time - start_time
        
        # Parse benchmark results
        benchmark_data = {}
        try:
            benchmark_json_path = Path("benchmark_results.json")
            if benchmark_json_path.exists():
                with open(benchmark_json_path, 'r') as f:
                    benchmark_data = json.load(f)
        except Exception as e:
            print_warning(f"Could not parse benchmark data: {e}")
        
        test_results = {
            "exit_code": result.returncode,
            "duration": duration,
            "output": result.stdout,
            "errors": result.stderr,
            "benchmark_data": benchmark_data
        }
        
        if result.returncode == 0:
            print_success(f"Performance benchmarks completed")
            print_metric("Duration", f"{duration:.2f}", "s", "⏱️")
        else:
            print_warning(f"Performance benchmarks not available or failed")
        
        return test_results
    
    def run_security_tests(self) -> Dict[str, Any]:
        """Run security-focused tests."""
        print_section("Security Tests", "🔒")
        
        start_time = time.time()
        
        # Run security tests
        result = self.run_command([
            "python", "-m", "pytest",
            "tests/",
            "-k", "security or auth or encryption or permission",
            "-v",
            "--tb=short",
            "--disable-warnings"
        ])
        
        end_time = time.time()
        duration = end_time - start_time
        
        test_results = {
            "exit_code": result.returncode,
            "duration": duration,
            "output": result.stdout,
            "errors": result.stderr
        }
        
        if result.returncode == 0:
            print_success(f"Security tests passed")
            print_metric("Duration", f"{duration:.2f}", "s", "⏱️")
        else:
            print_error(f"Security tests failed - CRITICAL!")
            if result.stderr:
                print(f"{Colors.RED}{result.stderr}{Colors.RESET}")
        
        return test_results
    
    def generate_test_report(self) -> None:
        """Generate a comprehensive test report."""
        print_section("Test Report Generation", "📄")
        
        total_duration = time.time() - self.start_time
        
        # Create report
        report = {
            "timestamp": datetime.now().isoformat(),
            "total_duration": total_duration,
            "system_info": {
                "python_version": sys.version,
                "cpu_count": self.cpu_count,
                "platform": sys.platform
            },
            "test_results": self.test_results
        }
        
        # Save JSON report
        report_path = Path("test_report.json")
        with open(report_path, 'w') as f:
            json.dump(report, f, indent=2)
        
        print_success(f"Test report saved to {report_path}")
        
        # Generate HTML report
        html_report = self.generate_html_report(report)
        html_path = Path("test_report.html")
        with open(html_path, 'w') as f:
            f.write(html_report)
        
        print_success(f"HTML test report saved to {html_path}")
    
    def generate_html_report(self, report: Dict[str, Any]) -> str:
        """Generate HTML test report."""
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PKMS Test Report</title>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
        h1 {{ color: #2c3e50; text-align: center; margin-bottom: 30px; }}
        .summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }}
        .metric {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }}
        .metric h3 {{ margin: 0; font-size: 1.2em; }}
        .metric .value {{ font-size: 2em; font-weight: bold; margin: 10px 0; }}
        .test-section {{ margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #007bff; }}
        .test-section h2 {{ color: #495057; margin-top: 0; }}
        .status-passed {{ color: #28a745; font-weight: bold; }}
        .status-failed {{ color: #dc3545; font-weight: bold; }}
        .status-warning {{ color: #ffc107; font-weight: bold; }}
        pre {{ background: #f1f3f4; padding: 15px; border-radius: 4px; overflow-x: auto; }}
        .footer {{ text-align: center; margin-top: 40px; color: #6c757d; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 PKMS Enhanced Test Report</h1>
        
        <div class="summary">
            <div class="metric">
                <h3>⏱️ Total Duration</h3>
                <div class="value">{report['total_duration']:.2f}s</div>
            </div>
            <div class="metric">
                <h3>🧪 Test Suites</h3>
                <div class="value">{len(report['test_results'])}</div>
            </div>
            <div class="metric">
                <h3>🖥️ CPU Cores</h3>
                <div class="value">{report['system_info']['cpu_count']}</div>
            </div>
            <div class="metric">
                <h3>📅 Generated</h3>
                <div class="value" style="font-size: 1em;">{datetime.fromisoformat(report['timestamp']).strftime('%Y-%m-%d %H:%M')}</div>
            </div>
        </div>
        
        <div class="test-results">
        """
        
        for test_name, results in report['test_results'].items():
            status_class = "status-passed" if results['exit_code'] == 0 else "status-failed"
            status_text = "PASSED" if results['exit_code'] == 0 else "FAILED"
            
            html += f"""
            <div class="test-section">
                <h2>{test_name.replace('_', ' ').title()}</h2>
                <p><strong>Status:</strong> <span class="{status_class}">{status_text}</span></p>
                <p><strong>Duration:</strong> {results['duration']:.2f}s</p>
                <p><strong>Exit Code:</strong> {results['exit_code']}</p>
            </div>
            """
        
        html += """
        </div>
        
        <div class="footer">
            <p>Generated by PKMS Enhanced Test Runner v2.1 🚀</p>
            <p>AI Assistant (Claude Sonnet 4) • 2025-01-16</p>
        </div>
    </div>
</body>
</html>
        """
        
        return html
    
    async def run_comprehensive_tests(self) -> Dict[str, Any]:
        """Run comprehensive test suite."""
        print_banner("PKMS Enhanced Test Suite", "🧪")
        
        self.start_time = time.time()
        
        # Pre-flight checks
        if not self.check_dependencies():
            print_error("Dependency check failed. Please install missing dependencies.")
            return {"error": "Dependencies missing"}
        
        # Check database connectivity
        if not await self.check_database_connectivity():
            print_error("Database connectivity check failed.")
            return {"error": "Database not accessible"}
        
        # Run individual test suites
        print_section("Running Test Suites", "🚀")
        
        # FTS5 Enhanced Tests
        self.test_results["fts5_enhanced"] = await self.run_fts5_tests()
        
        # Model Tests
        self.test_results["models"] = await self.run_model_tests()
        
        # Archive System Tests
        self.test_results["archive_system"] = await self.run_archive_tests()
        
        # Security Tests
        self.test_results["security"] = self.run_security_tests()
        
        # Coverage Tests
        self.test_results["coverage"] = self.run_coverage_tests()
        
        # Performance Benchmarks
        self.test_results["performance"] = self.run_performance_benchmark()
        
        # Generate comprehensive report
        self.generate_test_report()
        
        # Summary
        self.print_test_summary()
        
        return self.test_results
    
    def print_test_summary(self) -> None:
        """Print a beautiful test summary."""
        print_banner("Test Summary", "📊")
        
        total_duration = time.time() - self.start_time
        passed_suites = sum(1 for results in self.test_results.values() if results.get('exit_code') == 0)
        total_suites = len(self.test_results)
        
        print_metric("Total Duration", f"{total_duration:.2f}", "s", "⏱️")
        print_metric("Test Suites", f"{passed_suites}/{total_suites}", "", "🧪")
        print_metric("Success Rate", f"{(passed_suites/total_suites*100) if total_suites > 0 else 0:.1f}", "%", "📈")
        
        print("\n" + Colors.BOLD + "Suite Results:" + Colors.RESET)
        for suite_name, results in self.test_results.items():
            duration = results.get('duration', 0)
            if results.get('exit_code') == 0:
                print_success(f"{suite_name.replace('_', ' ').title()}: {duration:.2f}s")
            else:
                print_error(f"{suite_name.replace('_', ' ').title()}: {duration:.2f}s")
        
        if passed_suites == total_suites:
            print(f"\n{Colors.BRIGHT_GREEN}{Colors.BOLD}🎉 ALL TESTS PASSED! 🎉{Colors.RESET}")
            print(f"{Colors.BRIGHT_GREEN}Your PKMS backend is working perfectly!{Colors.RESET}")
        else:
            print(f"\n{Colors.BRIGHT_YELLOW}{Colors.BOLD}⚠️  SOME TESTS FAILED ⚠️{Colors.RESET}")
            print(f"{Colors.BRIGHT_YELLOW}Please check the failed test suites above.{Colors.RESET}")


async def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Enhanced PKMS Test Runner v2.1",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python enhanced_test_runner.py full              # Run comprehensive test suite
  python enhanced_test_runner.py fts5              # Run only FTS5 tests  
  python enhanced_test_runner.py models            # Run only model tests
  python enhanced_test_runner.py coverage          # Run coverage analysis
  python enhanced_test_runner.py performance       # Run performance benchmarks
  python enhanced_test_runner.py security          # Run security tests
        """
    )
    
    parser.add_argument(
        'command',
        choices=['full', 'fts5', 'models', 'archive', 'coverage', 'performance', 'security'],
        help='Test command to run'
    )
    
    parser.add_argument(
        '--no-server-check',
        action='store_true',
        help='Skip backend server health check'
    )
    
    parser.add_argument(
        '--verbose', '-v',
        action='store_true',
        help='Verbose output'
    )
    
    args = parser.parse_args()
    
    runner = EnhancedTestRunner()
    
    try:
        if args.command == 'full':
            await runner.run_comprehensive_tests()
        elif args.command == 'fts5':
            print_banner("FTS5 Enhanced Tests", "🔍")
            await runner.run_fts5_tests()
        elif args.command == 'models':
            print_banner("Database Model Tests", "🏗️")
            await runner.run_model_tests()
        elif args.command == 'archive':
            print_banner("Archive System Tests", "📦")
            await runner.run_archive_tests()
        elif args.command == 'coverage':
            print_banner("Coverage Analysis", "📊")
            runner.run_coverage_tests()
        elif args.command == 'performance':
            print_banner("Performance Benchmarks", "🚀")
            runner.run_performance_benchmark()
        elif args.command == 'security':
            print_banner("Security Tests", "🔒")
            runner.run_security_tests()
    
    except KeyboardInterrupt:
        print(f"\n{Colors.BRIGHT_YELLOW}🛑 Test execution interrupted by user{Colors.RESET}")
        sys.exit(1)
    except Exception as e:
        print_error(f"Test execution failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
