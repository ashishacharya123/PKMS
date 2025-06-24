# 🧠 PKMS - Personal Knowledge Management System

A **local-first**, **offline-capable** personal knowledge management system that combines note-taking, document management, task tracking, and encrypted journaling.

## ✨ Features

- **📝 Notes**: Markdown notes with bidirectional linking and file attachments
- **📄 Documents**: PDF, DOCX, and image management with full-text search
- **✅ Todos**: Task management with projects, due dates, and priorities
- **🔒 Diary**: Encrypted daily journal with voice recordings and photos
- **🔍 Unified Search**: Search across all content types (except encrypted diary)
- **🔗 Cross-linking**: Link between notes, documents, and todos
- **💾 Local Storage**: Everything stored locally in organized folders
- **🔐 Security**: Client-side encryption for sensitive diary content

## 🏗️ Architecture

- **Frontend**: React 18 + TypeScript + Vite + Mantine UI
- **Backend**: FastAPI + Python 3.11 + SQLite
- **Desktop**: Tauri wrapper for native OS integration
- **Storage**: SQLite database + organized file system
- **Security**: AES-256-GCM encryption for diary content

## 🚀 Quick Start

### Prerequisites
- **Docker Desktop** (for backend)
- **Node.js 18+** (for frontend)
- **Git**

### 1. Clone the Repository
```bash
git clone <repository-url>
cd PKMS
```

### 2. Start the Backend
```bash
docker-compose up -d
```

### 3. Start the Frontend
```bash
cd pkms-frontend
npm install --legacy-peer-deps
npm run dev
```

### 4. Access the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## 📁 Project Structure

```
PKMS/
├── pkms-backend/          # FastAPI backend
│   ├── main.py           # Application entry point
│   ├── requirements.txt  # Python dependencies
│   └── Dockerfile        # Docker configuration
├── pkms-frontend/        # React frontend
│   ├── src/              # Source code
│   ├── package.json      # Node.js dependencies
│   └── vite.config.ts    # Vite configuration
├── PKMS_Data/            # User data (auto-created)
│   ├── assets/           # Document storage
│   ├── secure/           # Encrypted diary content
│   └── backups/          # Backup storage
├── docker-compose.yml    # Docker orchestration
└── how_to_run.md         # Detailed setup guide
```

## 🔒 Security Features

- **Client-side encryption** for diary content
- **Secure session management** with auto-logout
- **Password recovery** with security questions
- **No cloud dependencies** - completely offline
- **Vulnerability-free dependencies** - all packages updated to latest secure versions

## 🛠️ Development

### Backend Development
```bash
# View logs
docker-compose logs -f pkms-backend

# Restart services
docker-compose restart

# Rebuild after changes
docker-compose up -d --build
```

### Frontend Development
```bash
cd pkms-frontend
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

## 📚 Documentation

- **[Setup Guide](how_to_run.md)** - Detailed installation and running instructions
- **[Implementation Plan](Implementation.txt)** - Complete development roadmap
- **[System Requirements](SYSTEM_REQUIREMENTS.txt)** - Software prerequisites
- **[Docker Setup](DOCKER_SETUP.md)** - Docker configuration details

## 🎯 Current Status

✅ **Phase 1 Complete**: Core infrastructure and development environment
🔄 **Phase 2**: Authentication and database implementation (in progress)

## 🤝 Contributing

This is a personal project, but suggestions and feedback are welcome!

## 📄 License

This project is for personal use. All rights reserved.

---

**Built with ❤️ for personal knowledge management** 