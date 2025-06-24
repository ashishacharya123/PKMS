#!/bin/bash

# PKMS Development Environment Starter
# This script starts the PKMS backend in Docker and provides helpful commands

echo "🚀 Starting PKMS Development Environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p PKMS_Data

# Start the backend services
echo "📦 Starting PKMS Backend..."
docker-compose up -d pkms-backend

# Wait for backend to be ready
echo "⏳ Waiting for backend to be ready..."
sleep 5

# Check if backend is healthy
if curl -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Backend is running at http://localhost:8000"
    echo "📊 Health check: http://localhost:8000/health"
    echo "📚 API docs: http://localhost:8000/docs"
else
    echo "⚠️  Backend might still be starting up..."
    echo "📊 Check logs with: docker-compose logs -f pkms-backend"
fi

echo ""
echo "🎯 Next steps:"
echo "1. Start frontend: cd pkms-frontend && npm run dev"
echo "2. View backend logs: docker-compose logs -f pkms-backend"
echo "3. Stop services: docker-compose down"
echo "4. Restart backend: docker-compose restart pkms-backend"
echo ""
echo "🔗 Services:"
echo "- Backend API: http://localhost:8000"
echo "- API Documentation: http://localhost:8000/docs"
echo "- Health Check: http://localhost:8000/health" 