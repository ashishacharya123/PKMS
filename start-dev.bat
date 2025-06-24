@echo off
REM PKMS Development Environment Starter (Windows)
REM This script starts the PKMS backend in Docker

echo 🚀 Starting PKMS Development Environment...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Create data directory if it doesn't exist
if not exist "PKMS_Data" mkdir PKMS_Data

REM Start the backend services
echo 📦 Starting PKMS Backend...
docker-compose up -d pkms-backend

REM Wait for backend to be ready
echo ⏳ Waiting for backend to be ready...
timeout /t 5 /nobreak >nul

REM Check if backend is healthy
curl -f http://localhost:8000/health >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Backend might still be starting up...
    echo 📊 Check logs with: docker-compose logs -f pkms-backend
) else (
    echo ✅ Backend is running at http://localhost:8000
    echo 📊 Health check: http://localhost:8000/health
    echo 📚 API docs: http://localhost:8000/docs
)

echo.
echo 🎯 Next steps:
echo 1. Start frontend: cd pkms-frontend ^&^& npm run dev
echo 2. View backend logs: docker-compose logs -f pkms-backend
echo 3. Stop services: docker-compose down
echo 4. Restart backend: docker-compose restart pkms-backend
echo.
echo 🔗 Services:
echo - Backend API: http://localhost:8000
echo - API Documentation: http://localhost:8000/docs
echo - Health Check: http://localhost:8000/health
echo.
pause 