#!/bin/bash

# PKMS Full Development Environment Starter
# This script starts both backend and frontend automatically

echo "🚀 Starting PKMS Full Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if Node.js is available
if ! command -v node > /dev/null 2>&1; then
    echo "❌ Node.js is not installed or not in PATH."
    exit 1
fi

# Stop any existing services first
echo "🛑 Stopping any existing services..."
docker-compose down 2>/dev/null
echo "✅ Existing services stopped"

# Create data directory if it doesn't exist
mkdir -p PKMS_Data

# Start the backend services fresh
echo "📦 Starting PKMS Backend (fresh start)..."
docker-compose up -d pkms-backend

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
sleep 10

# Check if backend is healthy with retries
echo "🔍 Checking backend health..."
backend_ready=false
for i in {1..5}; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend is running at http://localhost:8000"
        backend_ready=true
        break
    fi
    echo "⏳ Attempt $i/5 - Waiting for backend..."
    sleep 3
done

if [ "$backend_ready" != true ]; then
    echo "⚠️  Backend might still be starting up..."
    echo "📊 Check logs with: docker-compose logs -f pkms-backend"
fi

# Check if frontend dependencies are installed
echo "🔍 Checking frontend dependencies..."
if [ ! -d "pkms-frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd pkms-frontend
    npm install --legacy-peer-deps
    if [ $? -ne 0 ]; then
        echo "❌ Frontend dependency installation failed."
        exit 1
    fi
    cd ..
    echo "✅ Frontend dependencies installed"
else
    echo "✅ Frontend dependencies already installed"
fi

# Start the frontend in background
echo "🌐 Starting PKMS Frontend..."
cd pkms-frontend

# Check if running in a terminal that supports background processes
if [ -t 1 ]; then
    # Running in interactive terminal
    echo "💡 Starting frontend in background..."
    npm run dev > ../frontend.log 2>&1 &
    FRONTEND_PID=$!
    cd ..
    
    echo ""
    echo "🎉 PKMS Development Environment Started!"
    echo ""
    echo "🔗 Services:"
    echo "- Backend API: http://localhost:8000"
    echo "- Frontend App: http://localhost:3000 (starting...)"
    echo "- API Documentation: http://localhost:8000/docs"
    echo "- Health Check: http://localhost:8000/health"
    echo ""
    echo "📋 Useful commands:"
    echo "- View backend logs: docker-compose logs -f pkms-backend"
    echo "- View frontend logs: tail -f frontend.log"
    echo "- Stop all services: docker-compose down && kill $FRONTEND_PID"
    echo "- Restart backend: docker-compose restart pkms-backend"
    echo ""
    echo "💡 Tips:"
    echo "- Frontend is starting in background (PID: $FRONTEND_PID)"
    echo "- Wait a moment for frontend to compile and start"
    echo "- Press Ctrl+C to stop this script (frontend will continue running)"
    echo "- Use 'kill $FRONTEND_PID' to stop frontend manually"
    echo ""
    
    # Wait for user input
    read -p "Press Enter to view frontend logs (Ctrl+C to exit)..."
    tail -f frontend.log
else
    # Running in non-interactive mode
    echo "Starting frontend..."
    npm run dev
fi 