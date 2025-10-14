# 📋 Subtask Feature - User Guide

## ✨ What's New: Hierarchical Task Management!

You can now create **subtasks** (child tasks) under any todo! This allows you to break down complex tasks into smaller, manageable pieces.

---

## 🎯 How to Use Subtasks

### 1. **Creating a Subtask**

There are **2 ways** to create a subtask:

#### Method 1: Via Todo Menu (Recommended)
1. Click the **⋮ (three dots)** menu on any todo
2. Select **"Add Subtask"**
3. Fill in the subtask details in the modal
4. The subtask will automatically be linked to the parent

#### Method 2: Via Subtask List
1. Look below any todo card
2. You'll see a **"Subtasks (0/0)"** section
3. Click the **"+ Add Subtask"** button
4. Fill in the details

### 2. **Viewing Subtasks**

- Subtasks appear **indented below** their parent todo
- They show in a collapsible list with:
  - ✅ Checkbox to mark complete
  - 📋 Subtask title
  - 🏷️ Priority badge (if set)
  - 📅 Due date (if set)
  - ✏️ Edit button
  - 🗑️ Delete button

- The subtask counter shows: **"Subtasks (completed/total)"**
  - Example: `Subtasks (2/5)` means 2 out of 5 subtasks are done

### 3. **Completing Subtasks**

- Click the **checkbox** next to any subtask
- Completed subtasks show:
  - ~~Strikethrough text~~
  - Faded appearance
  - Gray background

### 4. **Editing Subtasks**

1. Click the **✏️ Edit** icon on the subtask
2. The todo edit modal opens
3. Make your changes
4. Save

### 5. **Deleting Subtasks**

1. Click the **🗑️ Delete** icon on the subtask
2. Confirm deletion
3. Subtask is removed

### 6. **Expanding/Collapsing**

- Click the **▼/▶ chevron** icon next to "Subtasks" to expand/collapse the list
- This helps keep your todo list clean when you have many subtasks

---

## 💡 Example Use Case

**Parent Todo**: "Build PKMS App" 📦

**Subtasks**:
- ✅ Setup backend (Done)
- ✅ Create frontend (Done)
- ⏳ Implement subtask feature (In Progress)
- 📝 Write documentation (Pending)
- 🧪 Test everything (Pending)

---

## 🔧 Technical Details

### Backend Support:
- `POST /api/v1/todos/{todo_id}/subtasks` - Create subtask
- `GET /api/v1/todos/{todo_id}/subtasks` - Get all subtasks
- `PATCH /api/v1/todos/{subtask_id}/move` - Move subtask to different parent
- `PATCH /api/v1/todos/{todo_id}/subtasks/reorder` - Reorder subtasks

### Frontend Components:
- `SubtaskList.tsx` - Displays and manages subtasks
- Integrated into `TodosPage.tsx`
- Handlers for create, edit, delete, and complete

### Database Schema:
- `parent_id` field links subtasks to parent todos
- `subtasks` array in responses for nested display
- `order_index` for future drag-and-drop ordering

---

## 🎨 Visual Hierarchy

```
📋 Parent Todo (Build App)
  ├── ✅ Subtask 1 (Setup backend) - Done
  ├── ✅ Subtask 2 (Create frontend) - Done
  ├── ⏳ Subtask 3 (Add features) - In Progress
  └── 📝 Subtask 4 (Documentation) - Pending
```

---

## 🚀 Future Enhancements (Planned)

- 🖱️ **Drag-and-drop reordering** within subtasks
- 🔄 **Move subtasks** between different parent todos
- 📊 **Progress bars** showing subtask completion %
- ⏱️ **Time tracking** for subtasks
- 📌 **Nested subtasks** (subtasks of subtasks)

---

## 🐛 Troubleshooting

### Q: I don't see the "Add Subtask" option
**A**: Make sure you're using the updated frontend. The option appears in the todo menu (⋮)

### Q: Subtasks don't show up
**A**: Click the expand chevron (▼) next to "Subtasks" to reveal the list

### Q: How deep can subtasks go?
**A**: Currently, only 1 level (parent → subtask). Multi-level nesting may come in future updates.

### Q: Can I convert a regular todo into a subtask?
**A**: Yes! Edit the todo and set its `parent_id` (this feature UI will be added soon)

---

## ✅ Deployment Checklist

- [x] Backend endpoints ready
- [x] Frontend component created
- [x] Handlers implemented
- [x] UI integrated
- [x] Documentation complete
- [ ] User testing (YOUR TURN!)

---

**Enjoy organized, hierarchical task management!** 🎉

---

**Created by**: Claude (AI Agent)  
**Date**: January 10, 2025  
**Feature**: Subtask Management System

