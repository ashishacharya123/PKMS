# 🚀 PKMS Quick Start Guide

## 📋 **Prerequisites**
- ✅ **Docker Desktop** installed and running
- ✅ **Node.js 18+** installed
- ✅ **Git** installed

## 🎯 **Startup Options**

### **Option 1: Full Auto Start (Recommended)**
Starts both backend and frontend automatically:

**Windows:**
```bash
.\start-full-dev.bat
```

**Linux/macOS:**
```bash
./start-full-dev.sh
```

### **Option 2: Manual Start (Separate Terminals)**
Start backend and frontend in separate terminals:

**Terminal 1 - Backend:**
```bash
.\start-dev.bat        # Windows
./start-dev.sh         # Linux/macOS
```

**Terminal 2 - Frontend:**
```bash
cd pkms-frontend
npm install --legacy-peer-deps
npm run dev
```

### **Option 3: Command Line**
Direct command line startup:

```bash
# Stop existing services
docker-compose down

# Start backend
docker-compose up -d pkms-backend

# Start frontend (in separate terminal)
cd pkms-frontend && npm run dev
```

## 🔗 **Service URLs**
- **Frontend App**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## 🛠️ **Useful Commands**

### **Development Commands**
```bash
# View backend logs
docker-compose logs -f pkms-backend

# Restart backend
docker-compose restart pkms-backend

# Rebuild backend
docker-compose up -d --build pkms-backend

# Stop all services
docker-compose down

# Check service status
docker-compose ps
```

### **Frontend Commands**
```bash
# Install dependencies
npm install --legacy-peer-deps

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔧 **Troubleshooting**

### **Common Issues & Solutions**

#### **"Docker is not running"**
- Start Docker Desktop
- Wait for Docker to fully initialize
- Verify with: `docker info`

#### **"Port already in use"**
- Stop existing services: `docker-compose down`
- Kill any processes using ports 3000 or 8000
- Restart with fresh script

#### **"Frontend dependencies missing"**
```bash
cd pkms-frontend
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

#### **"Backend health check failing"**
- Check Docker logs: `docker-compose logs -f pkms-backend`
- Wait longer for backend startup (can take 30+ seconds)
- Ensure PKMS_Data directory exists

#### **"Blank dashboard page"**
- ✅ **Fixed!** Dashboard now shows with mock data
- If still blank, check browser console for errors
- Ensure both backend and frontend are running

#### **"PowerShell execution policy"**
If batch files don't run in PowerShell:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## 📊 **Service Status Check**

### **Backend Health**
```bash
curl http://localhost:8000/health
# Should return: {"status": "healthy"}
```

### **Frontend Status**
- Open http://localhost:3000
- Should show PKMS login/setup page

### **Docker Status**
```bash
docker-compose ps
# Should show pkms-backend as running
```

## 🎯 **Development Workflow**

1. **Start Development Environment**
   ```bash
   .\start-full-dev.bat    # Windows
   ./start-full-dev.sh     # Linux/macOS
   ```

2. **Access Application**
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/docs

3. **Make Changes**
   - Frontend changes auto-reload
   - Backend changes require container restart

4. **Stop Development**
   ```bash
   docker-compose down
   # Close frontend terminal/window
   ```

## 📝 **Recent Fixes Applied**

✅ **Dashboard Blank Page Issue**: Fixed with robust error handling and mock data
✅ **NotesPage Implementation**: Complete notes management interface
✅ **Startup Scripts Enhancement**: Clean restart with better error handling
✅ **Service Conflicts**: Automatic cleanup before starting fresh
✅ **PowerShell Compatibility**: Proper Windows script execution
✅ **Frontend Dependencies**: Clear installation instructions

## 🎉 **Ready to Develop!**

Your PKMS development environment is now fully configured with:
- ✅ Enhanced startup scripts
- ✅ Robust error handling
- ✅ Clear troubleshooting guide
- ✅ Multiple startup options
- ✅ Fixed dashboard and navigation

**Happy coding! 🚀** 