# Project Integration Guide
**Date:** 2025-10-10 02:30:00 +05:45

---

## 🎯 How Projects Work with Documents & Todos

Projects act as **organizational containers** that can have both todos and documents associated with them.

---

## 📊 Database Schema

### Project Model
```python
class Project(Base):
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(7), default="#3498db")
    is_archived = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    
    # Relationships
    todos = relationship("Todo", back_populates="project", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
```

### Todo Model
```python
class Todo(Base):
    # ... other fields
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    
    # Relationship
    project = relationship("Project", back_populates="todos")
```

### Document Model
```python
class Document(Base):
    # ... other fields
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    
    # Relationship
    project = relationship("Project", back_populates="documents")
```

---

## 🔄 Two Ways to Link Items to Projects

### Method 1: **Assign During Creation** (Current Implementation)

#### For Todos:
```typescript
// TodosPage.tsx - Creating a new todo
const [todoForm, setTodoForm] = useState({
  title: '',
  description: '',
  project_id: null as number | null,  // ← Select project during creation
  // ... other fields
});
```

#### For Documents:
```typescript
// TodosPage.tsx - Uploading document to project
await documentsService.uploadDocument(
  file,
  tags,
  onProgress,
  selectedProjectIdForUpload  // ← Pass project_id parameter
);
```

**In DocumentsPage.tsx:**
- Currently **NO** project selector during upload
- Documents are uploaded with `project_id = null` (unassigned)
- Users must manually assign project **after** upload (edit document)

### Method 2: **Navigate to Project Dashboard** (Partially Implemented)

```
Projects Page → Click Project → Project Dashboard
                                     ↓
                        - View project todos
                        - View project documents
                        - Upload document to THIS project
                        - Create todo in THIS project
```

**Files:**
- `pkms-frontend/src/pages/ProjectDashboardPage.tsx` (exists)
- `pkms-frontend/src/pages/ProjectsPage.tsx` (list of projects)

---

## 📝 Current Implementation Status

### ✅ What Works:

1. **Todos Page:**
   - ✅ Can select project when creating todo
   - ✅ Can filter todos by project
   - ✅ Can upload document to project from Todos page (modal)

2. **Documents Page:**
   - ✅ Can filter documents by project (`showProjectOnly`)
   - ✅ Document model has `project_id` field
   - ⚠️ **NO project selector during upload** (always uploads as unassigned)

3. **Projects Page:**
   - ✅ List all projects
   - ✅ Navigate to Project Dashboard
   - ✅ View project-specific todos and documents

### ❌ What's Missing:

1. **Documents Page Upload:**
   - ❌ No "Assign to Project" dropdown in upload modal
   - ❌ No way to set `project_id` during document upload

2. **Project Dashboard:**
   - ⚠️ Need to verify if document upload from dashboard sets `project_id`
   - ⚠️ Need to check if todos created from dashboard auto-assign project

---

## 🎨 Recommended UX Flow

### Option A: **Context-Aware Upload** (Best UX)

**Scenario 1: Upload from Documents Page**
```
Documents Page → Click Upload
                    ↓
             Upload Modal with:
             - File picker
             - Tags input
             - **NEW:** Project dropdown (optional)
                        ↓
                    Upload Document
                        ↓
           Document stored with project_id
```

**Scenario 2: Upload from Project Dashboard**
```
Project Dashboard → Click Upload
                        ↓
                  Upload Modal
                  (Project pre-selected, can't change)
                        ↓
                 Document stored with this project_id
```

### Option B: **Two-Step Assignment** (Current)

```
Documents Page → Upload Document (no project)
                      ↓
              Document in "Unassigned"
                      ↓
        User manually edits → Assign Project
```

**Pros:** Simple upload flow
**Cons:** Extra step, documents start unassigned

---

## 🔧 How to Add Project Selector to Documents Upload

### Frontend Changes Needed:

**1. Update DocumentsPage.tsx:**

```typescript
// Add state for project selection
const [uploadProjectId, setUploadProjectId] = useState<number | null>(null);
const projects = useProjectsStore(state => state.projects);

// In upload modal:
<Select
  label="Assign to Project (Optional)"
  placeholder="Select a project..."
  data={projects.map(p => ({ value: String(p.id), label: p.name }))}
  value={uploadProjectId ? String(uploadProjectId) : null}
  onChange={(value) => setUploadProjectId(value ? parseInt(value) : null)}
  clearable
/>

// In handleUpload:
await uploadDocument(uploadFile, uploadTags, uploadProjectId);
```

**2. Update documentsStore.ts:**

```typescript
uploadDocument: async (file: File, tags: string[] = [], projectId?: number) => {
  // ...
  const document = await documentsService.uploadDocument(
    file, 
    tags, 
    (progress) => set({ uploadProgress: progress }),
    projectId  // Pass project_id
  );
  // ...
}
```

**3. documentsService.ts is already ready!**

```typescript
async uploadDocument(
  file: File, 
  tags: string[] = [],
  onProgress?: (progress: number) => void,
  projectId?: number  // ← Already supports this!
): Promise<Document> {
  // ... upload logic with projectId
}
```

---

## 🔍 How Filtering Works

### Documents Filtering:

```typescript
// Frontend sends:
{
  project_id: 5,           // Show ONLY documents in project 5
  project_only: true,      // Show ONLY documents WITH any project
  // (removed: unassigned_only - was causing bugs)
}

// Backend filters:
if (project_id is not None):
    query.where(Document.project_id == project_id)
elif (project_only):
    query.where(Document.project_id.is_not(None))
```

**Default View (no filters):** Shows ALL documents (with and without projects)

### Todos Filtering:

```typescript
// Similar logic:
{
  project_id: 5,           // Show ONLY todos in project 5
  status: 'in_progress',   // + other filters
}
```

---

## 📦 Benefits of Project Integration

1. **Organization:** Group related todos and documents together
2. **Context:** See all project materials in one place
3. **Filtering:** Quickly view project-specific items
4. **Relationships:** `ondelete="SET NULL"` - if project deleted, items become unassigned (not deleted)

---

## ⚠️ Current Bug (FIXED in Entry #100)

**Problem:** Uploaded documents weren't appearing because of backwards filter logic:

```typescript
// WRONG (before fix):
unassigned_only: (!state.showProjectOnly)  
// When showProjectOnly=false, set unassigned_only=true
// This ONLY showed unassigned docs, hiding newly uploaded ones!

// CORRECT (after fix):
project_only: state.showProjectOnly || undefined
// When showProjectOnly=false, send nothing → show ALL docs
```

---

## 🎯 Recommended Next Steps

### Priority 1: Add Project Selector to Documents Upload

**Why:** Allows users to assign documents to projects during upload (better UX)

**Changes:**
1. Add project dropdown to DocumentsPage upload modal
2. Pass `projectId` parameter through the chain
3. Backend already supports this!

### Priority 2: Verify Project Dashboard Upload

**Check if:**
- Uploading from Project Dashboard auto-sets project_id
- Creating todos from Project Dashboard auto-assigns project

### Priority 3: Add "Assign to Project" Bulk Action

**For documents/todos:**
- Select multiple items
- Bulk action → "Assign to Project"
- Choose project from dropdown
- Update all `project_id` fields

---

## 🔗 Related Files

**Frontend:**
- `pkms-frontend/src/pages/DocumentsPage.tsx` - Document management
- `pkms-frontend/src/pages/TodosPage.tsx` - Todo management (has project upload)
- `pkms-frontend/src/pages/ProjectsPage.tsx` - Project list
- `pkms-frontend/src/pages/ProjectDashboardPage.tsx` - Single project view
- `pkms-frontend/src/stores/documentsStore.ts` - Document state
- `pkms-frontend/src/services/documentsService.ts` - Document API calls

**Backend:**
- `pkms-backend/app/models/document.py` - Document model
- `pkms-backend/app/models/todo.py` - Todo & Project models
- `pkms-backend/app/routers/documents.py` - Document endpoints
- `pkms-backend/app/routers/todos.py` - Todo/Project endpoints

---

## 💡 Summary

**Current State:**
- ✅ Database relationships are set up correctly
- ✅ Todos can be assigned to projects during creation
- ✅ Documents **can** be uploaded with project_id (backend supports it)
- ❌ Documents Page doesn't have UI for project selection during upload
- ✅ Filtering by project works for both documents and todos

**To fully integrate:**
Add a **Project dropdown** to the Documents upload modal (3 small changes needed, backend is ready!)


