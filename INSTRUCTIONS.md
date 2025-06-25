# PKMS Implementation Instructions

## Overview
This document contains implementation notes and instructions for PKMS (Personal Knowledge Management System) features.

## 📁 Archive Module Implementation

### What is the Archive Module?
The Archive module provides a **hierarchical folder/file structure** similar to a traditional file system. Unlike the Documents module which is flat, Archive allows for:
- **Nested folders and subfolders** (unlimited depth)
- **Organized file storage** with proper folder hierarchy
- **File management** within folder contexts
- **Smart tagging** and search across the hierarchy

### Database Schema
- **`ArchiveFolder`**: Hierarchical folder structure with parent-child relationships
- **`ArchiveItem`**: Files stored within folders
- **Relationships**: User → Folders → Items, with Tag support

### Key Features
- ✅ **Hierarchical organization** (folders/subfolders)
- ✅ **File storage** with metadata and text extraction
- ✅ **Smart tagging** via AI service
- ✅ **Version tracking** and favorites
- ✅ **Search capabilities** across folder hierarchy
- ✅ **Thumbnail generation** for supported file types

### Frontend Requirements
The Archive module needs:
- **Folder tree component** for navigation
- **File upload** with folder selection
- **Drag & drop** for file organization
- **Breadcrumb navigation** for current path
- **Grid/list view** for files
- **Search within folders** or globally

---

## 🧠 AI Service Implementation

### Current Features (Active)
The AI service provides smart tagging and content analysis using lightweight transformers:

- **Smart Content Tagging**: Automatic tag generation based on content
- **Sentiment Analysis**: Mood detection for diary entries
- **Content Categorization**: Work, personal, education, etc.
- **Text Summarization**: Brief summaries of long content
- **Semantic Similarity**: Find related content across modules

### Models Used (Currently Installed)
- `facebook/bart-large-mnli` - Zero-shot classification
- `cardiffnlp/twitter-roberta-base-sentiment-latest` - Sentiment analysis
- `facebook/bart-large-cnn` - Text summarization
- `all-MiniLM-L6-v2` - Semantic similarity

### Docker Image Size Impact
- **Base PKMS**: 525MB
- **With AI**: ~1.2GB (+700MB)
- **Current features work** without PyTorch

### Module-Specific Tagging
The AI service provides specialized tagging for:
- **Notes**: Topic-based tags (research, ideas, meeting-notes)
- **Documents**: Content-type tags (reports, contracts, invoices)
- **Diary**: Emotion and activity tags (grateful, workout, travel)
- **Archive**: Data-type tags (datasets, configs, backups)

---

## 🔮 Optional Q&A Feature (Not Implemented)

### Future Enhancement: Question Answering
If advanced Q&A capabilities are needed:

#### Installation Steps
```bash
# Install additional dependencies
pip install torch==2.1.0 transformers[torch]

# Update requirements.txt to include:
# torch==2.1.0
```

#### Model Information
- **Model**: `google/flan-t5-small`
- **Size**: ~300MB download
- **Total Docker Impact**: +1.1GB (PyTorch + model)
- **Capability**: Answer questions about archive content

#### Implementation Location
- Extend `app/services/ai_service.py`
- Add T5 model loading and Q&A functionality
- Create new API endpoints for Q&A queries

#### Usage Examples
```python
# Example Q&A functionality
answer = await ai_service.answer_question(
    question="What are the main points in my project proposal?",
    context=archive_content
)
```

---

## 📋 Implementation Status

### ✅ Completed
- [x] Archive module database models
- [x] AI service with smart tagging
- [x] Backend API structure
- [x] Requirements optimization
- [x] Docker configuration

### ⏸️ Pending (Frontend)
- [ ] Archive module frontend components
- [ ] Archive API router implementation
- [ ] Archive service integration
- [ ] Archive store (Zustand) implementation
- [ ] UI components for folder navigation

### 🔮 Optional (Future)
- [ ] Q&A functionality with T5 model
- [ ] Chat interface for knowledge base
- [ ] Advanced semantic search
- [ ] Content recommendation engine

---

## 🚀 Next Steps

### Immediate Tasks
1. **Create Archive Router** (`app/routers/archive.py`)
2. **Build Frontend Components**:
   - Archive page with folder tree
   - File upload interface
   - Search functionality
3. **Create Archive Service** (`src/services/archiveService.ts`)
4. **Create Archive Store** (`src/stores/archiveStore.ts`)

### Development Priority
1. Archive backend API (router)
2. Archive frontend basic functionality
3. File upload and folder management
4. Search and filtering
5. Optional: Q&A features (if needed)

---

## 📝 Notes
- Archive module designed for **organized document storage**
- AI features are **CPU-only** and lightweight
- Q&A capabilities are **optional** and require additional setup
- Focus on core functionality before advanced features 