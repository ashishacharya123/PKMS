@echo off
REM PKMS Full Development Environment Starter (Windows)
REM This script starts both backend and frontend automatically

echo 🚀 Starting PKMS Full Development Environment...

REM Check if Docker is running
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

REM Check if Node.js is available
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed or not in PATH.
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
        goto backend_ready
    )
    echo ⏳ Attempt %%x/5 - Waiting for backend...
    timeout /t 3 /nobreak >nul
)

echo ⚠️  Backend might still be starting up...
echo 📊 Check logs with: docker-compose logs -f pkms-backend

:backend_ready
REM Check if frontend dependencies are installed
echo 🔍 Checking frontend dependencies...
if not exist "pkms-frontend\node_modules" (
    echo 📦 Installing frontend dependencies...
    cd pkms-frontend
    npm install --legacy-peer-deps
    if errorlevel 1 (
        echo ❌ Frontend dependency installation failed.
        pause
        exit /b 1
    )
    cd ..
    echo ✅ Frontend dependencies installed
) else (
    echo ✅ Frontend dependencies already installed
)

REM Start the frontend
echo 🌐 Starting PKMS Frontend...
cd pkms-frontend
start "PKMS Frontend" cmd /k "npm run dev"
cd ..

echo.
echo 🎉 PKMS Development Environment Started!
echo.
echo 🔗 Services:
echo - Backend API: http://localhost:8000
echo - Frontend App: http://localhost:3000 (starting...)
echo - API Documentation: http://localhost:8000/docs
echo - Health Check: http://localhost:8000/health
echo.
echo 📋 Useful commands:
echo - View backend logs: docker-compose logs -f pkms-backend
echo - Stop all services: docker-compose down
echo - Restart backend: docker-compose restart pkms-backend
echo - Rebuild backend: docker-compose up -d --build pkms-backend
echo.
echo 💡 Tips:
echo - Frontend will open in a new window
echo - Wait a moment for frontend to compile and start
echo - Both services will run until you close their windows
echo.
pause 