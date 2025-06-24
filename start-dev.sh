#!/bin/bash

# PKMS Development Environment Starter
# This script stops existing services and starts the PKMS environment fresh

echo "🚀 Starting PKMS Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
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
for i in {1..5}; do
    if curl -f http://localhost:8000/health > /dev/null 2>&1; then
        echo "✅ Backend is running at http://localhost:8000"
        echo "📊 Health check: http://localhost:8000/health"
        echo "📚 API docs: http://localhost:8000/docs"
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

echo ""
echo "🎯 To start the frontend:"
echo "   cd pkms-frontend"
echo "   npm install --legacy-peer-deps"
echo "   npm run dev"
echo ""
echo "📋 Other useful commands:"
echo "- View backend logs: docker-compose logs -f pkms-backend"
echo "- Stop all services: docker-compose down"
echo "- Restart backend: docker-compose restart pkms-backend"
echo "- Rebuild backend: docker-compose up -d --build pkms-backend"
echo ""
echo "🔗 Services:"
echo "- Backend API: http://localhost:8000"
echo "- Frontend (after starting): http://localhost:3000"
echo "- API Documentation: http://localhost:8000/docs"
echo "- Health Check: http://localhost:8000/health"
echo ""
echo "💡 Tip: Open a new terminal window to start the frontend" 