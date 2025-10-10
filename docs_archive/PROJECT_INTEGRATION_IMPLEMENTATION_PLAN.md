# Project Integration - Complete Implementation Plan
**Date:** 2025-10-10 02:35:00 +05:45

---

## 🎯 Vision Summary

**Two-Mode Project Integration:**
1. **Linked Mode:** Standalone items with project reference (visible everywhere, survives deletion)
2. **Owned Mode:** Project-exclusive items (visible only in project, deleted with project)

**Applies to:** Notes, Documents, Todos

---

## 📊 Database Schema Changes

### Current State:

```python
# Document & Todo already have:
project_id = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)

# Note model - NEEDS project_id:
# (currently no project relationship)
```

### Required Changes:

#### 1. Add to Notes Model (`pkms-backend/app/models/note.py`):

```python
class Note(Base):
    # ... existing fields ...
    
    # NEW FIELDS:
    project_id = Column(
        Integer, 
        ForeignKey("projects.id", ondelete="SET NULL"),  # Linked mode
        nullable=True, 
        index=True
    )
    is_project_exclusive = Column(
        Boolean, 
        default=False, 
        index=True,
        comment="If True, note belongs exclusively to project (not shown in main Notes page)"
    )
    
    # Relationship
    project = relationship("Project", back_populates="notes")
```

#### 2. Update Projects Model (`pkms-backend/app/models/todo.py`):

```python
class Project(Base):
    # ... existing fields ...
    
    # NEW: Add notes relationship
    notes = relationship("Note", back_populates="project")
```

#### 3. Update Documents Model:

```python
class Document(Base):
    # ... existing fields ...
    project_id = Column(...)  # ✅ Already exists
    
    # NEW FIELD:
    is_project_exclusive = Column(
        Boolean, 
        default=False, 
        index=True,
        comment="If True, document belongs exclusively to project"
    )
```

#### 4. Update Todos Model:

```python
class Todo(Base):
    # ... existing fields ...
    project_id = Column(...)  # ✅ Already exists
    
    # NEW FIELD:
    is_project_exclusive = Column(
        Boolean, 
        default=False, 
        index=True,
        comment="If True, todo belongs exclusively to project"
    )
```

---

## 🔄 Migration Strategy

### Alembic Migration File:

```python
"""Add project integration with exclusive mode

Revision ID: xxxx
"""
from alembic import op
import sqlalchemy as sa

def upgrade():
    # 1. Add project_id to notes
    op.add_column('notes', 
        sa.Column('project_id', sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        'fk_notes_project_id', 'notes', 'projects',
        ['project_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('ix_notes_project_id', 'notes', ['project_id'])
    
    # 2. Add is_project_exclusive to notes
    op.add_column('notes',
        sa.Column('is_project_exclusive', sa.Boolean(), 
                  server_default='false', nullable=False)
    )
    op.create_index('ix_notes_is_project_exclusive', 'notes', ['is_project_exclusive'])
    
    # 3. Add is_project_exclusive to documents
    op.add_column('documents',
        sa.Column('is_project_exclusive', sa.Boolean(), 
                  server_default='false', nullable=False)
    )
    op.create_index('ix_documents_is_project_exclusive', 'documents', ['is_project_exclusive'])
    
    # 4. Add is_project_exclusive to todos
    op.add_column('todos',
        sa.Column('is_project_exclusive', sa.Boolean(), 
                  server_default='false', nullable=False)
    )
    op.create_index('ix_todos_is_project_exclusive', 'todos', ['is_project_exclusive'])

def downgrade():
    # Remove in reverse order
    op.drop_index('ix_todos_is_project_exclusive', 'todos')
    op.drop_column('todos', 'is_project_exclusive')
    
    op.drop_index('ix_documents_is_project_exclusive', 'documents')
    op.drop_column('documents', 'is_project_exclusive')
    
    op.drop_index('ix_notes_is_project_exclusive', 'notes')
    op.drop_column('notes', 'is_project_exclusive')
    
    op.drop_index('ix_notes_project_id', 'notes')
    op.drop_constraint('fk_notes_project_id', 'notes', type_='foreignkey')
    op.drop_column('notes', 'project_id')
```

---

## 🔧 Backend Logic Changes

### Filtering Logic

#### Main Module Pages (Notes/Documents/Todos):
```python
# Show items where is_project_exclusive = False OR is NULL
# Exclude project-exclusive items

@router.get("/notes")
async def list_notes(...):
    query = select(Note).where(
        Note.user_id == current_user.id,
        or_(
            Note.is_project_exclusive == False,
            Note.is_project_exclusive.is_(None)  # For backward compatibility
        )
    )
    # ... rest of query
```

#### Project View Page:
```python
# Show ALL items with this project_id (both modes)

@router.get("/projects/{project_id}/items")
async def get_project_items(project_id: int, ...):
    # Get project-exclusive items
    exclusive_notes = await db.execute(
        select(Note).where(
            Note.project_id == project_id,
            Note.is_project_exclusive == True
        )
    )
    
    # Get linked (non-exclusive) items
    linked_notes = await db.execute(
        select(Note).where(
            Note.project_id == project_id,
            or_(
                Note.is_project_exclusive == False,
                Note.is_project_exclusive.is_(None)
            )
        )
    )
    
    # Same for documents and todos
    # Return combined results with metadata indicating mode
```

### Deletion Cascades

**Two approaches for project-exclusive items:**

#### Option A: Database CASCADE (Recommended)

```python
# Change foreign key for exclusive items dynamically
# Create two separate foreign keys:

class Note(Base):
    project_id_linked = Column(
        Integer, 
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True
    )
    project_id_exclusive = Column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True
    )
    
    @hybrid_property
    def project_id(self):
        return self.project_id_exclusive or self.project_id_linked
```

#### Option B: Application-Level DELETE (Simpler)

```python
# In project deletion endpoint
@router.delete("/projects/{project_id}")
async def delete_project(project_id: int, ...):
    # 1. Delete project-exclusive items manually
    await db.execute(
        delete(Note).where(
            Note.project_id == project_id,
            Note.is_project_exclusive == True
        )
    )
    await db.execute(
        delete(Document).where(...)
    )
    await db.execute(
        delete(Todo).where(...)
    )
    
    # 2. Delete project (will SET NULL for linked items)
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()
```

**Recommendation:** Use Option B (simpler, more explicit)

---

## 🎨 Frontend UI Changes

### 1. Create/Edit Modals - Add Project Integration Section

#### Notes Editor (`NoteEditorPage.tsx`):

```tsx
<Stack gap="md">
  <Divider label="Project Integration" />
  
  <Select
    label="Link to Project (Optional)"
    placeholder="Select a project..."
    data={projects.map(p => ({ value: String(p.id), label: p.name }))}
    value={note.projectId ? String(note.projectId) : null}
    onChange={(value) => setNote({...note, projectId: value ? parseInt(value) : null})}
    clearable
  />
  
  {note.projectId && (
    <Checkbox
      label="Project-Exclusive (Only visible in project view)"
      description="If checked, this note will ONLY appear in the project dashboard, not in main Notes page"
      checked={note.isProjectExclusive}
      onChange={(e) => setNote({...note, isProjectExclusive: e.currentTarget.checked})}
    />
  )}
  
  {note.isProjectExclusive && (
    <Alert color="orange" icon={<IconAlertTriangle />}>
      <Text size="sm">
        This note will be <strong>deleted</strong> if the project is deleted.
      </Text>
    </Alert>
  )}
</Stack>
```

#### Similar for Documents & Todos

### 2. Project View Page (`ProjectDashboardPage.tsx`)

```tsx
export function ProjectDashboardPage() {
  const { projectId } = useParams();
  const [activeTab, setActiveTab] = useState<'overview' | 'notes' | 'documents' | 'todos'>('overview');
  
  const [projectNotes, setProjectNotes] = useState<{
    exclusive: Note[],  // Only in project
    linked: Note[]      // Also in main notes
  }>();
  
  // Similar for documents and todos
  
  return (
    <Container>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="notes">Notes ({exclusiveCount + linkedCount})</Tabs.Tab>
          <Tabs.Tab value="documents">Documents</Tabs.Tab>
          <Tabs.Tab value="todos">Todos</Tabs.Tab>
        </Tabs.List>
        
        <Tabs.Panel value="notes">
          <Stack>
            {/* Project-Exclusive Notes */}
            <Accordion defaultValue="exclusive">
              <Accordion.Item value="exclusive">
                <Accordion.Control>
                  <Group>
                    <IconLock size={16} />
                    <Text>Project-Exclusive Notes ({exclusiveCount})</Text>
                    <Badge size="xs" color="orange">Only here</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <NotesList notes={projectNotes.exclusive} />
                  <Button onClick={createExclusiveNote}>
                    <IconPlus size={16} /> New Project Note
                  </Button>
                </Accordion.Panel>
              </Accordion.Item>
              
              {/* Linked Notes */}
              <Accordion.Item value="linked">
                <Accordion.Control>
                  <Group>
                    <IconLink size={16} />
                    <Text>Linked Notes ({linkedCount})</Text>
                    <Badge size="xs" color="blue">Also in Notes page</Badge>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <NotesList notes={projectNotes.linked} />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Tabs.Panel>
        
        {/* Similar for documents and todos tabs */}
      </Tabs>
    </Container>
  );
}
```

### 3. Visual Indicators in Main Pages

#### Notes/Documents/Todos Lists:

```tsx
<Card>
  <Group justify="space-between">
    <Title>{item.title}</Title>
    
    {item.projectId && (
      <Badge color={item.isProjectExclusive ? "orange" : "blue"}>
        <Group gap={4}>
          {item.isProjectExclusive ? <IconLock size={12} /> : <IconLink size={12} />}
          {projectName}
        </Group>
      </Badge>
    )}
  </Group>
</Card>
```

---

## 📋 API Endpoints to Create/Update

### New Endpoints:

```python
# 1. Get all project items (notes, documents, todos)
GET /api/v1/projects/{project_id}/items
Response: {
  notes: { exclusive: [...], linked: [...] },
  documents: { exclusive: [...], linked: [...] },
  todos: { exclusive: [...], linked: [...] }
}

# 2. Create project-exclusive note
POST /api/v1/projects/{project_id}/notes
Body: { title, content, is_project_exclusive: true }

# 3. Convert existing item to project-exclusive
PATCH /api/v1/notes/{note_id}/project-mode
Body: { project_id: 5, is_project_exclusive: true }
```

### Update Existing Endpoints:

```python
# Notes list - exclude project-exclusive
GET /api/v1/notes
# Add filter: .where(Note.is_project_exclusive != True)

# Note create/update - add new fields
POST/PUT /api/v1/notes/{id}
Body: {
  ...existing fields,
  project_id: number | null,
  is_project_exclusive: boolean
}
```

---

## 🗂️ Implementation Phases

### Phase 1: Database Foundation (2-3 hours)
1. ✅ Create migration file
2. ✅ Update Note model (add project_id, is_project_exclusive)
3. ✅ Update Document model (add is_project_exclusive)
4. ✅ Update Todo model (add is_project_exclusive)
5. ✅ Update Project model (add notes relationship)
6. ✅ Run migration
7. ✅ Test database changes

### Phase 2: Backend Logic (3-4 hours)
1. ✅ Update Notes router filtering (exclude exclusive from main list)
2. ✅ Update Documents router filtering
3. ✅ Update Todos router filtering
4. ✅ Create project items endpoint (`/projects/{id}/items`)
5. ✅ Update project delete logic (cascade exclusive items)
6. ✅ Update schemas (add new fields)
7. ✅ Test all endpoints

### Phase 3: Frontend Types & Services (2 hours)
1. ✅ Update TypeScript interfaces (Note, Document, Todo)
2. ✅ Update API services (notesService, documentsService, todosService)
3. ✅ Create projectService.getProjectItems()
4. ✅ Update stores (notesStore, documentsStore, todosStore)

### Phase 4: UI - Main Pages (3-4 hours)
1. ✅ Add project selector to Notes editor
2. ✅ Add project selector to Documents upload modal
3. ✅ Add project selector to Todos create modal
4. ✅ Add exclusive checkbox when project selected
5. ✅ Add visual badges for project-linked items
6. ✅ Add warning alerts for exclusive mode

### Phase 5: UI - Project Dashboard (4-5 hours)
1. ✅ Create tabbed interface (Overview, Notes, Documents, Todos)
2. ✅ Implement accordion sections (Exclusive vs Linked)
3. ✅ Add "Create Project Note/Doc/Todo" buttons
4. ✅ Implement filtering and display
5. ✅ Add quick actions (convert mode, unlink, delete)

### Phase 6: Polish & Testing (2-3 hours)
1. ✅ Test project deletion (exclusive items deleted, linked items unlinked)
2. ✅ Test visibility (exclusive hidden from main pages)
3. ✅ Test mode conversion (linked ↔ exclusive)
4. ✅ Add loading states
5. ✅ Add error handling
6. ✅ Update documentation

---

## 🎯 Key User Workflows

### Workflow 1: Create Project-Exclusive Note

```
Project Dashboard → Notes Tab → "New Project Note"
                                      ↓
                          Note Editor (project pre-selected)
                          is_project_exclusive = true (default)
                                      ↓
                                Save Note
                                      ↓
                    Note appears ONLY in this project
                    NOT in main Notes page
```

### Workflow 2: Link Existing Note to Project

```
Notes Page → Edit Note → Project Section
                              ↓
                   Select Project from dropdown
                   Keep is_project_exclusive = false
                              ↓
                          Save Note
                              ↓
              Note appears in BOTH places:
              - Main Notes page (with project badge)
              - Project Dashboard (in "Linked" section)
```

### Workflow 3: Convert Linked → Exclusive

```
Notes Page → Note with project badge → Edit
                              ↓
                Check "Project-Exclusive"
                              ↓
                    Save (with confirmation)
                              ↓
              Note now ONLY in project dashboard
              Removed from main Notes page
```

### Workflow 4: Delete Project

```
Projects Page → Delete Project → Confirm
                                    ↓
                System performs:
                1. DELETE all exclusive items (cascade)
                2. SET NULL on linked items (unlink)
                                    ↓
              Results:
              - Exclusive items: DELETED
              - Linked items: Survive, become unassigned
```

---

## 🔍 Edge Cases & Considerations

### 1. **Orphaned Exclusive Items**
- **Scenario:** is_project_exclusive=true but project_id=null
- **Solution:** Validation prevents this. If exclusive, project_id is REQUIRED
  ```python
  @validates('is_project_exclusive')
  def validate_exclusive(self, key, value):
      if value and not self.project_id:
          raise ValueError("Exclusive items must have project_id")
      return value
  ```

### 2. **Unlinking Exclusive Items**
- **Scenario:** User tries to remove project from exclusive item
- **Solution:** Modal asks: "Convert to standalone or delete?"
  - Standalone: set is_project_exclusive=false, keep project_id=null
  - Delete: remove item

### 3. **Search Results**
- **Scenario:** Global search finds exclusive item
- **Solution:** 
  - Option A: Include in results with badge "Project: XYZ (Exclusive)"
  - Option B: Exclude from global search, only searchable within project

### 4. **Permissions** (Future)
- **Scenario:** Shared projects with different access levels
- **Solution:** Check permissions on project before showing exclusive items

---

## 📊 Database Query Examples

### Get all items for a project:

```python
async def get_project_items(project_id: int, user_id: int, db: AsyncSession):
    # Notes
    notes_query = select(Note).where(
        Note.user_id == user_id,
        Note.project_id == project_id
    )
    notes = (await db.execute(notes_query)).scalars().all()
    
    # Split into exclusive and linked
    exclusive_notes = [n for n in notes if n.is_project_exclusive]
    linked_notes = [n for n in notes if not n.is_project_exclusive]
    
    # Same for documents and todos...
    
    return {
        "notes": {"exclusive": exclusive_notes, "linked": linked_notes},
        "documents": {...},
        "todos": {...}
    }
```

### Get main page items (excluding exclusive):

```python
async def list_notes(user_id: int, db: AsyncSession):
    query = select(Note).where(
        Note.user_id == user_id,
        or_(
            Note.is_project_exclusive == False,
            Note.is_project_exclusive.is_(None)
        )
    ).order_by(Note.updated_at.desc())
    
    return (await db.execute(query)).scalars().all()
```

---

## 📝 TypeScript Interface Updates

```typescript
// pkms-frontend/src/types/note.ts
export interface Note {
  id: number;
  uuid: string;
  title: string;
  content: string;
  // ... existing fields
  
  // NEW:
  projectId: number | null;
  isProjectExclusive: boolean;
  project?: {  // Populated when needed
    id: number;
    name: string;
    color: string;
  };
}

// Similar updates for Document and Todo interfaces
```

---

## 🚀 Estimated Total Time

- **Phase 1 (Database):** 2-3 hours
- **Phase 2 (Backend):** 3-4 hours
- **Phase 3 (Services):** 2 hours
- **Phase 4 (Main UIs):** 3-4 hours
- **Phase 5 (Project Dashboard):** 4-5 hours
- **Phase 6 (Testing):** 2-3 hours

**Total:** ~16-21 hours of development

---

## ✅ Success Criteria

1. ✅ Can create project-exclusive notes/documents/todos
2. ✅ Exclusive items ONLY visible in project dashboard
3. ✅ Linked items visible in both places
4. ✅ Deleting project deletes exclusive items, unlinks others
5. ✅ Clear visual distinction between modes
6. ✅ Can convert between modes
7. ✅ No breaking changes to existing data
8. ✅ All filtering works correctly

---

## 🎯 Next Steps

**Want me to start implementation?**

I can begin with:
1. **Phase 1:** Create the database migration
2. **Phase 2:** Update models
3. **Phase 3:** Update backend routers

Let me know if you want to proceed, or if you'd like to adjust the plan first!


