@echo off
REM PKMS Development Environment Starter (Windows)
REM This script stops existing services and starts the PKMS environment fresh

echo 🚀 Starting PKMS Development Environment...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Stop any existing services first
echo 🛑 Stopping any existing services...
docker-compose down 2>nul
echo ✅ Existing services stopped

REM Create data directory if it doesn't exist
if not exist "PKMS_Data" mkdir PKMS_Data

REM Start the backend services fresh
echo 📦 Starting PKMS Backend (fresh start)...
docker-compose up -d pkms-backend

REM Wait for backend to be ready
echo ⏳ Waiting for backend to be ready...
timeout /t 10 /nobreak >nul

REM Check if backend is healthy
echo 🔍 Checking backend health...
for /l %%x in (1, 1, 5) do (
    curl -f http://localhost:8000/health >nul 2>&1
    if not errorlevel 1 (
        echo ✅ Backend is running at http://localhost:8000
        echo 📊 Health check: http://localhost:8000/health
        echo 📚 API docs: http://localhost:8000/docs
        goto backend_ready
    )
    echo ⏳ Attempt %%x/5 - Waiting for backend...
    timeout /t 3 /nobreak >nul
)

echo ⚠️  Backend might still be starting up...
echo 📊 Check logs with: docker-compose logs -f pkms-backend

:backend_ready
echo.
echo 🎯 To start the frontend:
echo    cd pkms-frontend
echo    npm install --legacy-peer-deps
echo    npm run dev
echo.
echo 📋 Other useful commands:
echo - View backend logs: docker-compose logs -f pkms-backend
echo - Stop all services: docker-compose down
echo - Restart backend: docker-compose restart pkms-backend
echo - Rebuild backend: docker-compose up -d --build pkms-backend
echo.
echo 🔗 Services:
echo - Backend API: http://localhost:8000
echo - Frontend (after starting): http://localhost:3000
echo - API Documentation: http://localhost:8000/docs
echo - Health Check: http://localhost:8000/health
echo.
echo 💡 Tip: Open a new terminal window to start the frontend
echo.
pause 