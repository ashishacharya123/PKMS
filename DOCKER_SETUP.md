# 🐳 PKMS Docker Development Setup

## 🎯 **Recommended Approach: Docker for Backend + Local Frontend**

### **Why This Approach?**
- **Backend isolation**: No Python dependency conflicts
- **Frontend flexibility**: Keep React development fast and responsive
- **Easy deployment**: Same environment everywhere
- **Simple management**: One command to start/stop backend

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

## 🚀 **Quick Docker Setup (Option 1 - Recommended)**

### **1. Install Docker Desktop**
- Download from: https://www.docker.com/products/docker-desktop/
- Install and start Docker Desktop
- Verify: `docker --version`

### **2. Create Docker Backend**
```bash
# Create backend Dockerfile
cd pkms-backend
# (Dockerfile will be created below)
```

### **3. Start Development**
```bash
# Start backend in Docker
docker-compose up -d

# Start frontend locally
cd pkms-frontend
npm install
npm run dev
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

### **Docker Compose**
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
      - DATABASE_URL=sqlite:///app/data/pkm_metadata.db
    restart: unless-stopped

  # Optional: Add Redis for caching
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

### **Step 1: Install Docker**
```bash
# Windows: Download Docker Desktop
# macOS: Download Docker Desktop  
# Linux: sudo apt install docker.io docker-compose
```

### **Step 2: Create Docker Files**
```bash
# Create Dockerfile in pkms-backend/
# Create docker-compose.yml in root/
```

### **Step 3: Update Development Workflow**
```bash
# Start backend
docker-compose up -d

# Start frontend (local)
cd pkms-frontend
npm run dev

# View logs
docker-compose logs -f pkms-backend
```

## ✅ **Benefits of Docker Approach**

### **For Development**
- **Consistent environment**: Same setup across all machines
- **Easy cleanup**: `docker-compose down` removes everything
- **No conflicts**: Isolated Python environment
- **Fast setup**: New team members can start in minutes

### **For Deployment**
- **Production ready**: Same container can be deployed
- **Easy scaling**: Can run multiple instances
- **Backup friendly**: Data volumes are easy to backup

### **For Management**
- **Version control**: Docker files in git
- **Reproducible**: Exact same environment every time
- **Rollback**: Easy to switch between versions

## 🎯 **Recommendation**

**Go with Option 1: Docker Backend + Local Frontend**

**Why?**
1. **Backend isolation**: No Python dependency issues
2. **Frontend speed**: Local React development is faster
3. **Easy management**: One command to start backend
4. **Future-proof**: Easy to containerize frontend later

**Next Steps:**
1. Install Docker Desktop
2. Create Docker configuration files
3. Update development workflow
4. Continue with Phase 2 implementation

Would you like me to create the Docker configuration files and update the setup? 