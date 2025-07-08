# 🐳 PKMS Docker Development Setup

## 🎯 **Recommended Approach: Docker for Backend + Local Frontend**

### **Why This Approach?**
- **Backend isolation**: No Python dependency conflicts
- **Frontend flexibility**: Keep React development fast and responsive
- **Easy deployment**: Same environment everywhere
- **Simple management**: One command to start/stop backend
- **Version compatibility**: Docker ensures Python 3.11 + SQLAlchemy 2.0.31 compatibility

## 📋 **Setup Options**

### **Option 1: Docker Backend + Local Frontend (RECOMMENDED)**
```
Backend: Docker container (FastAPI + SQLite)
Frontend: Local development (React + Vite)
Desktop: Tauri wrapper
```

### **Option 2: Full Docker Stack**
```
Backend: Docker container
Frontend: Docker container  
Desktop: Tauri wrapper
```

### **Option 3: Keep Current Setup**
```
Backend: Local Python environment
Frontend: Local Node.js environment
Desktop: Tauri wrapper
```

## ⚡ **Python Version Compatibility (Updated 2025-01-19)**

### **Current Setup (Working)**
- **Docker Container**: Python 3.11-slim ✅
- **SQLAlchemy**: 2.0.31 ✅
- **Compatibility**: Perfect match (Python 3.11-3.12 supported)

### **Local Python Considerations**
- **Your System**: Python 3.13.1 (newer than SQLAlchemy 2.0.31 supports)
- **SQLAlchemy 2.0.31**: Requires Python 3.11-3.12 only
- **Recommendation**: Use Docker for backend (no local Python version changes needed)

### **Version Matrix**
| Component | Version | Status | Notes |
|-----------|---------|--------|-------|
| Docker Python | 3.11-slim | ✅ Perfect | Recommended approach |
| SQLAlchemy | 2.0.31 | ✅ Latest | Supports Python 3.11-3.12 |
| Local Python | 3.13.1 | ⚠️ Too new | Use Docker instead |
| Node.js | Latest | ✅ Good | For frontend development |

## 🚀 **Quick Docker Setup (Option 1 - Recommended)**

### **1. Verify Docker Installation**
```bash
# Check Docker version
docker --version
docker-compose --version

# If not installed, download from:
# https://www.docker.com/products/docker-desktop/
```

### **2. Start Development Environment**
```bash
# Start backend in Docker (from project root)
docker-compose up -d

# Verify backend is running
curl http://localhost:8000/health

# Start frontend locally
cd pkms-frontend
npm install
npm run dev
```

### **3. Verify System Status**
```bash
# Check running containers
docker ps

# Expected output:
# pkms-backend (port 8000)
# pkms-redis (port 6379)

# Test API endpoints
curl http://localhost:8000/api/v1/notes/
# Should return: 403 Forbidden (auth required) - not 405 Method Not Allowed
```

## 📁 **Docker Configuration Files**

### **Backend Dockerfile**
```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Expose port
EXPOSE 8000

# Start application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

### **Docker Compose (Current Working Configuration)**
```yaml
version: '3.8'

services:
  pkms-backend:
    build: ./pkms-backend
    ports:
      - "8000:8000"
    volumes:
      - ./PKMS_Data:/app/data
      - ./pkms-backend:/app
    environment:
      - DATABASE_URL=sqlite+aiosqlite:///app/data/pkm_metadata.db
    restart: unless-stopped

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

## 🔄 **Migration Steps**

### **Step 1: Verify Current Setup**
```bash
# Check if containers are running
docker ps

# If not running, start them
docker-compose up -d

# Check logs
docker-compose logs pkms-backend
```

### **Step 2: Test API Functionality**
```bash
# Health check
curl http://localhost:8000/health

# Notes endpoint (should return 403, not 405)
curl -X GET http://localhost:8000/api/v1/notes/

# Todos endpoint (should also return 403)
curl -X GET http://localhost:8000/api/v1/todos/
```

### **Step 3: Update Development Workflow**
```bash
# Start backend (always use Docker)
docker-compose up -d

# Start frontend (local development)
cd pkms-frontend
npm run dev

# View backend logs
docker-compose logs -f pkms-backend

# Restart backend after code changes
docker-compose restart pkms-backend
```

## ✅ **Benefits of Docker Approach**

### **For Development**
- **Consistent environment**: Python 3.11 + SQLAlchemy 2.0.31 always works
- **Easy cleanup**: `docker-compose down` removes everything
- **No conflicts**: Isolated Python environment
- **Fast setup**: New team members can start in minutes
- **Version safety**: No need to downgrade local Python

### **For Deployment**
- **Production ready**: Same container can be deployed
- **Easy scaling**: Can run multiple instances
- **Backup friendly**: Data volumes are easy to backup

### **For Management**
- **Version control**: Docker files in git
- **Reproducible**: Exact same environment every time
- **Rollback**: Easy to switch between versions

## 🚨 **Recent Fixes (2025-01-19)**

### **SQLAlchemy 2.0.31 Upgrade**
- **Status**: ✅ Complete and working
- **Compatibility**: Python 3.11 (Docker) ✅
- **Database**: Updated to async SQLAlchemy 2.0 syntax
- **Result**: No compatibility issues

### **Route Order Fix**
- **Problem**: Notes API returning 405 Method Not Allowed
- **Cause**: FastAPI route matching order issue
- **Fix**: Reordered routes in `notes.py`
- **Result**: All endpoints now return correct HTTP status codes

## 🎯 **Current Recommendation**

**Stick with Docker Backend + Local Frontend**

**Why?**
1. **No Python version hassles**: Docker handles Python 3.11 compatibility
2. **SQLAlchemy 2.0.31 works perfectly**: No downgrades needed
3. **Frontend speed**: Local React development is faster
4. **Easy management**: One command to start backend
5. **Future-proof**: Easy to containerize frontend later

**Next Steps:**
1. ✅ **Docker setup is working** - no changes needed
2. ✅ **API endpoints fixed** - routes now work correctly
3. Continue with frontend development using local Node.js

## 📚 **Additional Resources**

- **Docker Documentation**: https://docs.docker.com/
- **Docker Compose Guide**: https://docs.docker.com/compose/
- **FastAPI with Docker**: https://fastapi.tiangolo.com/deployment/docker/
- **SQLAlchemy 2.0 Documentation**: https://docs.sqlalchemy.org/en/20/

**AI Attribution**: Documentation updated by **Claude Sonnet 4** via Cursor, January 2025. 