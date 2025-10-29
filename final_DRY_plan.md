# Final Complete DRY Refactoring Plan
**AI Agent: Claude Sonnet 4.5**  
**Date: October 29, 2025**

## Overview

This plan combines two critical initiatives:
- **Phase A**: Production-Perfect UX Hardening (6 files, 0 new files, ~34 fixes)
- **Phase B**: Comprehensive DRY Refactoring (10 phases, ~1,500 lines eliminated)

**Total Impact:**
- Immediate production fixes: Zero bugs, complete button states, notifications
- Long-term DRY reduction: ~1,500 lines eliminated (60% in affected areas)
- New reusable code: ~600 lines
- Net reduction: ~900 lines + production-grade UX

---

# PHASE A: Production-Perfect UX Hardening (Days 1-2)

## Policy
- **No new files** in Phase A
- Only edit existing files
- Use already-present abstractions
- Production-grade: complete button states, notifications, error handling

## Files to Edit (6 total)
1. `pkms-frontend/src/pages/DiaryViewPage.tsx`
2. `pkms-frontend/src/services/notesService.ts`
3. `pkms-frontend/src/services/diaryService.ts`
4. `pkms-frontend/src/pages/DashboardPage.tsx`
5. `pkms-frontend/src/components/file/UnifiedFileList.tsx` (verify only)
6. `DRY_refactoring.md` (append with AI agent name)

---

## A1: DiaryViewPage - Complete Field Validation + Button States

### File: `pkms-frontend/src/pages/DiaryViewPage.tsx`

#### All Required Imports
```typescript
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Container, Alert, Button, Group } from '@mantine/core';
import { useDataLoader } from '../hooks/useDataLoader';
import { diaryService } from '../services/diaryService';
import { useDiaryStore } from '../stores/diaryStore';
import { transformDiaryFiles } from '../utils/fileTransformers';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { ContentViewer } from '../components/common/ContentViewer';
import { IconRestore } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
```

#### State Management
```typescript
const [isRestoring, setIsRestoring] = useState(false);
const [isDeleting, setIsDeleting] = useState(false);
```

#### Encrypted Field Validation (in useDataLoader)
```typescript
// Resolve snake_case/camelCase
const blob = rawEntry.encryptedBlob ?? rawEntry.encrypted_blob;
const iv = rawEntry.encryptionIv ?? rawEntry.encryption_iv;

// Type validation
if (typeof blob !== 'string' || typeof iv !== 'string') {
  throw new Error('Invalid encrypted content: encryption data must be strings');
}

// Empty check
if (!blob || !iv) {
  throw new Error('Invalid encrypted content: missing encryption data');
}

// Decrypt with try/catch
let decryptedContent: string;
try {
  decryptedContent = await diaryService.decryptContent(blob, iv, store.encryptionKey!);
} catch (decryptError) {
  throw new Error('Failed to decrypt diary entry. Please check your diary password.');
}

return {
  ...rawEntry,
  content: decryptedContent
};
```

#### handleDelete with Complete UX
```typescript
const handleDelete = async () => {
  if (isDeleting) return; // Concurrency guard

  // Use Mantine modal for consistent UX
  const confirmed = await new Promise<boolean>((resolve) => {
    modals.openConfirmModal({
      title: 'Delete Diary Entry',
      children: (
        <div>
          <p>Are you sure you want to delete this diary entry?</p>
          <p>This can be restored later.</p>
        </div>
      ),
      labels: { confirm: 'Delete Entry', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;

  try {
    setIsDeleting(true);
    await diaryService.deleteEntry(id!);

    notifications.show({
      title: 'Success',
      message: 'Diary entry deleted',
      color: 'green',
      autoClose: 3000
    });

    navigate('/diary');
  } catch (error) {
    console.error('Failed to delete diary entry:', error);
    notifications.show({
      title: 'Error',
      message: 'Failed to delete diary entry. Please try again.',
      color: 'red',
      autoClose: 5000
    });
  } finally {
    setIsDeleting(false);
  }
};
```

#### handleRestore with Complete UX
```typescript
const handleRestore = async () => {
  if (isRestoring) return; // Concurrency guard

  try {
    setIsRestoring(true);
    await diaryService.restoreEntry(id!);
    await refetch();

    notifications.show({
      title: 'Success',
      message: 'Diary entry restored successfully',
      color: 'green',
      autoClose: 3000
    });
  } catch (error) {
    console.error('Failed to restore diary entry:', error);
    notifications.show({
      title: 'Error',
      message: 'Failed to restore diary entry. Please try again.',
      color: 'red',
      autoClose: 5000
    });
  } finally {
    setIsRestoring(false);
  }
};
```

#### Clean ContentViewer Props
```typescript
const viewerProps = {
  title: diaryEntry.title || 'Untitled Entry',
  content: diaryEntry.content || '',
  mood: diaryEntry.mood,  // No redundant mapping
  weatherCode: diaryEntry.weatherCode ?? diaryEntry.weather_code,
  location: diaryEntry.location,
  date: diaryEntry.date,
  tags: diaryEntry.tags || [],
  createdAt: diaryEntry.created_at || diaryEntry.createdAt,
  updatedAt: diaryEntry.updated_at || diaryEntry.updatedAt,
  files: diaryFiles || [],
  module: 'diary' as const,
  entityId: diaryEntry.uuid,
  showDiaryFields: true,
  showProjects: false,
  enableDragDrop: false,
  onFilesUpdate: () => {},
  onEdit: handleEdit,
  onBack: handleBack,
  onDelete: diaryEntry.is_deleted ? undefined : handleDelete,
};
```

#### Page-Level Restore Button
```typescript
{diaryEntry.is_deleted && (
  <Group justify="center" mb="md">
    <Button
      leftSection={<IconRestore size={16} />}
      onClick={handleRestore}
      variant="light"
      color="green"
      loading={isRestoring}
      disabled={isRestoring}
      size="sm"
    >
      Restore Entry
    </Button>
  </Group>
)}
```

---

## A2: NotesService - Ultimate Payload Hygiene

### File: `pkms-frontend/src/services/notesService.ts`

#### Complete Imports
```typescript
import { BaseService } from './BaseService';
import { notesCache } from './unifiedCacheService';
import logger from '../utils/logger';

// Type-only imports for better performance
import type { Note, NoteCreate, NoteUpdate } from '../types/note';
import type { Tag, TagResponse, CreateTagRequest } from '../types/tag';
```

#### createNote with Robust UUID Extraction
```typescript
async createNote(noteData: any) {
  try {
    const result = await this.apiPost('/notes', noteData);

    // Constrained UUID extraction (only expected response shapes)
    const id = result?.uuid || result?.note?.uuid;

    if (id) {
      this.invalidateCache(`note:${id}`);
      this.invalidateCache('notes:list');
      logger.info?.(`Successfully created note with ID: ${id}`);

      return {
        ...result,
        uuid: id  // Ensure consistent UUID response
      };
    } else {
      logger.error?.('Note created but no UUID found in expected response shapes:', result);
      logger.error?.('Expected: result.uuid or result.note.uuid');
      throw new Error('Note creation successful but unable to retrieve UUID');
    }
  } catch (error) {
    logger.error?.(`Failed to create note:`, error);
    throw new Error('Failed to create note. Please try again.');
  }
}
```

#### updateNote with Ultimate Payload Hygiene
```typescript
async updateNote(id: string, updates: any) {
  try {
    // Ultimate payload sanitization
    const cleanUpdates = { ...updates };

    // Remove all camelCase variations when snake_case exists
    const conflictingFields = ['isArchived', 'isFavorite', 'isTemplate', 'createdAt', 'updatedAt'];
    conflictingFields.forEach(field => {
      const snakeCase = field.replace(/([A-Z])/g, '_$1').toLowerCase();
      if (cleanUpdates[field] !== undefined && cleanUpdates[snakeCase] !== undefined) {
        delete cleanUpdates[field];
        logger.debug?.(`Removed conflicting field: ${field}, keeping ${snakeCase}`);
      }
    });

    // Convert camelCase to snake_case when only camelCase provided
    if (cleanUpdates.isArchived !== undefined && cleanUpdates.is_archived === undefined) {
      cleanUpdates.is_archived = cleanUpdates.isArchived;
      logger.debug?.(`Converted isArchived to is_archived for backend compatibility`);
    }

    if (cleanUpdates.isFavorite !== undefined && cleanUpdates.is_favorite === undefined) {
      cleanUpdates.is_favorite = cleanUpdates.isFavorite;
    }

    if (cleanUpdates.isTemplate !== undefined && cleanUpdates.is_template === undefined) {
      cleanUpdates.is_template = cleanUpdates.isTemplate;
    }

    const result = await this.apiPut(`/notes/${id}`, cleanUpdates);
    this.invalidateCache(`note:${id}`);

    logger.info?.(`Successfully updated note: ${id}`);
    return result;
  } catch (error) {
    logger.error?.(`Failed to update note ${id}:`, error);
    throw new Error('Failed to update note. Please try again.');
  }
}
```

#### toggleArchive - Only Snake Case
```typescript
async toggleArchive(id: string, isArchived: boolean) {
  try {
    const result = await this.apiPut(`/notes/${id}`, { is_archived: isArchived });
    this.invalidateCache(`note:${id}`);

    if (result?.error || result?.detail) {
      logger.warn?.('Archive update completed but backend returned warning:', result);
    }

    logger.info?.(`Successfully toggled archive status for note ${id}: ${isArchived}`);
    return result;
  } catch (error) {
    logger.error?.(`Failed to toggle archive for note ${id}:`, error);
    throw new Error('Failed to update archive status. Please try again.');
  }
}
```

#### searchNotes with Input Validation
```typescript
async searchNotes(query: string) {
  try {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.apiGet('/notes/search', { params: { q: query.trim() } });
  } catch (error) {
    logger.error?.(`Failed to search notes with query "${query}":`, error);
    throw new Error('Failed to search notes. Please try again.');
  }
}
```

---

## A3: DashboardPage - Normalized Timeline + Auto-Refresh

### File: `pkms-frontend/src/pages/DashboardPage.tsx`

#### Complete Imports
```typescript
import { useState } from 'react';
import { Container, Group, Button, Badge } from '@mantine/core';
import { IconRefresh, IconDashboard } from '@tabler/icons-react';
import { useDataLoader } from '../hooks/useDataLoader';
import { dashboardService } from '../services/dashboardService';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
```

#### Type Definitions
```typescript
type DashboardStats = Awaited<ReturnType<typeof dashboardService.getMainDashboardData>>;
type QuickStats = Awaited<ReturnType<typeof dashboardService.getQuickStats>>;
type TimelineItem = Awaited<ReturnType<typeof dashboardService.getRecentActivityTimeline>> extends (infer A)[] ? A : any;
type TimelineArray = TimelineItem[];

interface DashboardData {
  mainStats: DashboardStats;
  quickStats: QuickStats;
  timeline: TimelineArray;
}
```

#### Data Loading with Timeline Normalization
```typescript
const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

const { data: dashboardData, loading, error, refetch } = useDataLoader(async () => {
  const [mainStats, quickStats, timeline] = await Promise.all([
    dashboardService.getMainDashboardData(),
    dashboardService.getQuickStats(),
    dashboardService.getRecentActivityTimeline(7, 10)
  ]);

  setLastRefresh(new Date());
  
  return {
    mainStats,
    quickStats,
    timeline: (Array.isArray(timeline) ? timeline : timeline?.items || []) as TimelineArray
  };
}, { dependencies: [] });

const handleRefresh = async () => {
  await refetch();
  setLastRefresh(new Date());
};
```

#### Enhanced Header with Refresh Controls
```typescript
<Group justify="space-between" mb="lg">
  <Group>
    <IconDashboard size={24} />
    <h2>Dashboard</h2>
  </Group>

  <Group>
    <Badge variant="light" color="gray" size="sm">
      Last updated: {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </Badge>
    <Button
      variant="light"
      size="sm"
      leftSection={<IconRefresh size={16} />}
      onClick={handleRefresh}
      loading={loading}
    >
      Refresh
    </Button>
  </Group>
</Group>
```

#### Stats Grid Layout
```typescript
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
  <div>
    <p><strong>Notes:</strong> {dashboardData.mainStats?.notes?.total || 0}</p>
    <p><small>Recent: {dashboardData.mainStats?.notes?.recent || 0}</small></p>
  </div>
  <div>
    <p><strong>Documents:</strong> {dashboardData.mainStats?.documents?.total || 0}</p>
    <p><small>Recent: {dashboardData.mainStats?.documents?.recent || 0}</small></p>
  </div>
  <div>
    <p><strong>Tasks:</strong> {dashboardData.mainStats?.todos?.total || 0}</p>
    <p><small>Pending: {dashboardData.mainStats?.todos?.pending || 0}</small></p>
  </div>
  <div>
    <p><strong>Projects:</strong> {dashboardData.mainStats?.projects?.total || 0}</p>
    <p><small>Active: {dashboardData.mainStats?.projects?.active || 0}</small></p>
  </div>
</div>
```

#### Timeline Preview
```typescript
{dashboardData.timeline.length > 0 && (
  <div style={{
    border: '1px solid #e1e5e9',
    borderRadius: '8px',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    marginTop: '1rem'
  }}>
    {dashboardData.timeline.slice(0, 3).map((item, index) => (
      <div key={index} style={{
        padding: '0.5rem 0',
        borderBottom: index < 2 ? '1px solid #e1e5e9' : 'none'
      }}>
        <small style={{ color: '#666' }}>
          {item.timestamp || item.date || 'No date'}
        </small>
        <div>{item.title || item.description || 'No description'}</div>
      </div>
    ))}
  </div>
)}
```

---

## A4: DiaryService - Consistent baseUrl + restoreEntry

### File: `pkms-frontend/src/services/diaryService.ts`

#### Complete Imports
```typescript
import { apiService } from './api';
import logger from '../utils/logger';
```

#### Ensure baseUrl in Constructor
```typescript
export class DiaryService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/diary';  // Explicit baseUrl
  }
```

#### Add restoreEntry Method
```typescript
async restoreEntry(uuid: string): Promise<void> {
  try {
    await apiService.post(`${this.baseUrl}/entries/${uuid}/restore`);
    logger.info?.(`Restored diary entry: ${uuid}`);
  } catch (error) {
    logger.error?.(`Failed to restore diary entry ${uuid}:`, error);
    throw error;
  }
}
```

#### Verify deleteEntry Uses baseUrl
```typescript
async deleteEntry(uuid: string): Promise<void> {
  try {
    await apiService.delete(`${this.baseUrl}/entries/${uuid}`);
    logger.info?.(`Deleted diary entry: ${uuid}`);
  } catch (error) {
    logger.error?.(`Failed to delete diary entry ${uuid}:`, error);
    throw error;
  }
}
```

---

## A5: UnifiedFileList - Verify Security

### File: `pkms-frontend/src/components/file/UnifiedFileList.tsx`

**Verify (no changes needed if present):**
- Line ~246: `window.open(downloadUrl, '_blank', 'noopener,noreferrer');`
- Image viewer: `imageUrl={imageUrl || unifiedFileService.getDownloadUrl(selectedImage)}`

---

## A6: Documentation Update

### File: `DRY_refactoring.md`

Append to existing file:

```markdown
## Production Implementation - Phase A (Claude Sonnet 4.5 - October 29, 2025)

### Changes Applied

**DiaryViewPage.tsx:**
- Complete encrypted field validation: resolve snake_case/camelCase, validate types (must be strings), check for empty values
- Decrypt with proper error handling: generic user message, detailed logging
- Concurrency guards: `isDeleting`, `isRestoring` states prevent double-clicks
- Button states: `loading={isDeleting}`, `disabled={isDeleting}` on all async actions
- Notifications: success (green, 3s autoClose), errors (red, 5s autoClose)
- Pre-confirmation: Mantine `modals.openConfirmModal` for delete action
- Clean prop mapping: no redundant `mood: mood`, handle `weatherCode ?? weather_code`
- Page-level Restore button: only visible when `is_deleted === true`

**NotesService.ts:**
- Ultimate payload hygiene: remove camelCase when snake_case exists (isArchived/is_archived conflicts)
- Convert camelCase to snake_case when only camelCase provided
- Constrained UUID extraction: 2 expected response shapes (result.uuid || result.note.uuid)
- `toggleArchive`: only send `{ is_archived: isArchived }` (no camelCase)
- Enhanced error handling: all methods have try/catch with logger.error and user-friendly messages
- Input validation: `searchNotes` returns `[]` for empty queries

**DashboardPage.tsx:**
- Normalized timeline to array: `(Array.isArray(timeline) ? timeline : timeline?.items || []) as TimelineArray`
- Type-safe definitions: explicit `DashboardStats`, `QuickStats`, `TimelineArray` types
- Auto-refresh UX: track `lastRefresh` timestamp, show in badge
- Refresh button: manual refresh with loading state
- Enhanced grid layout: responsive stats cards
- Timeline preview: show first 3 items with proper styling

**DiaryService.ts:**
- Added `restoreEntry(uuid)` method with consistent `${this.baseUrl}` usage
- Ensured `deleteEntry` uses `${this.baseUrl}` consistently
- All methods have proper logging and error handling

### Removed Functionality
None (this batch focused on hardening existing features)

### Impact - Phase A
- ✅ Zero double-click bugs (all async actions have concurrency guards)
- ✅ Zero field conflict bugs (payload sanitization removes all camelCase/snake_case conflicts)
- ✅ Zero timeline type errors (explicit normalization to array)
- ✅ Production-grade UX (loading states, notifications, confirmations, auto-refresh)
- ✅ Complete button states (loading/disabled on all async actions)
- ✅ Enhanced error recovery (comprehensive error handling with user-friendly messages)
```

---

# PHASE B: Comprehensive DRY Refactoring (Days 3-10)

## Overview
Eliminate ~1,500 lines of duplicate code through 10 major refactoring patterns.

---

## B1: Backend Error Handling Decorator (Day 3 - High Priority)

### Create Files
- `pkms-backend/app/decorators/__init__.py`
- `pkms-backend/app/decorators/error_handler.py`

### Implementation
```python
from functools import wraps
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)

def handle_api_errors(operation_name: str):
    """Decorator for standardizing API route error handling"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except HTTPException:
                raise
            except Exception as e:
                # Extract user from kwargs or function signature
                user = kwargs.get('current_user')
                user_uuid = user.uuid if user else 'unknown'
                logger.exception(f"Error {operation_name} for user {user_uuid}")
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to {operation_name}"
                ) from e
        return wrapper
    return decorator
```

### Migration
Apply to all routers:
- `pkms-backend/app/routers/notes.py` (15+ endpoints)
- `pkms-backend/app/routers/diary.py` (20+ endpoints)
- `pkms-backend/app/routers/documents.py` (10+ endpoints)
- `pkms-backend/app/routers/todos.py` (12+ endpoints)
- `pkms-backend/app/routers/projects.py` (10+ endpoints)
- `pkms-backend/app/routers/archive.py` (8+ endpoints)
- `pkms-backend/app/routers/search.py` (3+ endpoints)
- `pkms-backend/app/routers/tags.py` (2+ endpoints)

**Impact:** ~400 lines eliminated

---

## B2: Frontend File Transformation Utilities (Day 3 - Quick Win)

### Create File
`pkms-frontend/src/utils/fileTransformers.ts`

### Implementation
```typescript
import { UnifiedFileItem } from '../services/unifiedFileService';

export function transformFilesToUnifiedItems(
  files: any[],
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects',
  entityId: string,
  options: {
    isEncrypted?: boolean;
    defaultMediaType?: 'document' | 'image' | 'video' | 'audio';
  } = {}
): UnifiedFileItem[] {
  const { isEncrypted = false, defaultMediaType = 'document' } = options;
  
  return files.map(file => ({
    uuid: file.uuid,
    filename: file.filename,
    originalName: file.originalName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    description: file.description,
    createdAt: file.createdAt,
    mediaType: file.mediaType || defaultMediaType,
    isEncrypted,
    module,
    entityId
  }));
}

export const transformDiaryFiles = (files: any[], entryId: string, encrypted = true) =>
  transformFilesToUnifiedItems(files, 'diary', entryId, { isEncrypted: encrypted });

export const transformNoteFiles = (files: any[], noteId: string) =>
  transformFilesToUnifiedItems(files, 'notes', noteId);

export const transformDocumentFiles = (files: any[], folderId: string) =>
  transformFilesToUnifiedItems(files, 'documents', folderId);
```

### Migration
Update file transformations in:
- `pkms-frontend/src/pages/NoteViewPage.tsx`
- `pkms-frontend/src/pages/DiaryViewPage.tsx`
- `pkms-frontend/src/pages/NoteEditorPage.tsx`
- `pkms-frontend/src/pages/DocumentsPage.tsx`
- 4+ more files

**Impact:** ~100 lines eliminated

---

## B3: Frontend Custom Hooks (Days 4-5)

### Create Files
- `pkms-frontend/src/hooks/useDataLoader.ts`
- `pkms-frontend/src/hooks/useErrorHandler.ts`
- `pkms-frontend/src/hooks/useForm.ts`
- `pkms-frontend/src/hooks/useModal.ts`

### useDataLoader Implementation
```typescript
import { useState, useEffect, useCallback } from 'react';

export function useDataLoader<T>(
  loadFn: () => Promise<T>,
  options: {
    dependencies?: any[];
    onSuccess?: (data: T) => void;
    onError?: (error: Error) => void;
  } = {}
) {
  const { dependencies = [], onSuccess, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadFn();
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      onError?.(err as Error);
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, loading, error, refetch: loadData };
}
```

### useErrorHandler Implementation
```typescript
import { useCallback } from 'react';
import { notifications } from '@mantine/notifications';

export function useErrorHandler() {
  const handleError = useCallback((error: unknown, context: string) => {
    console.error(`${context}:`, error);
    notifications.show({
      title: 'Error',
      message: `Failed to ${context.toLowerCase()}`,
      color: 'red'
    });
  }, []);

  return { handleError };
}
```

### useForm Implementation
```typescript
import { useState, useCallback } from 'react';

export function useForm<T>(
  initialData: T,
  submitFn: (data: T) => Promise<void>
) {
  const [formData, setFormData] = useState(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrors({});

    try {
      await submitFn(formData);
    } catch (error) {
      if (error instanceof ValidationError) {
        setErrors(error.errors);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, submitFn]);

  return {
    formData,
    setFormData,
    isSubmitting,
    errors,
    handleSubmit
  };
}
```

### useModal Implementation
```typescript
import { useState, useCallback } from 'react';

export function useModal<T>() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);

  const openModal = useCallback((item?: T) => {
    setSelectedItem(item || null);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setSelectedItem(null);
  }, []);

  return {
    isOpen,
    selectedItem,
    openModal,
    closeModal
  };
}
```

### Migration
Update 12+ components to use hooks

**Impact:** ~500 lines eliminated

---

## B4: Frontend Shared Components (Day 5)

### Create Files
- `pkms-frontend/src/components/common/LoadingState.tsx`
- `pkms-frontend/src/components/common/ErrorState.tsx`

### LoadingState Implementation
```typescript
import { Center, Loader } from '@mantine/core';

interface LoadingStateProps {
  message?: string;
  height?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function LoadingState({ message, height = 400, size = "lg" }: LoadingStateProps) {
  return (
    <Center style={{ height }}>
      {message ? (
        <div style={{ textAlign: 'center' }}>
          <Loader size={size} />
          <p style={{ marginTop: '1rem' }}>{message}</p>
        </div>
      ) : (
        <Loader size={size} />
      )}
    </Center>
  );
}
```

### ErrorState Implementation
```typescript
import { Center, Stack, Text, Button } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  height?: number;
}

export function ErrorState({ message, onRetry, height = 400 }: ErrorStateProps) {
  return (
    <Center style={{ height }}>
      <Stack align="center" gap="md">
        <Text c="dimmed">{message}</Text>
        {onRetry && (
          <Button onClick={onRetry} leftSection={<IconRefresh size={16} />}>
            Retry
          </Button>
        )}
      </Stack>
    </Center>
  );
}
```

### Migration
Update 20+ components

**Impact:** ~100 lines eliminated

---

## B5: Frontend Service Migration to Existing BaseService (Day 6)

### Note: BaseService Already Exists
The `pkms-frontend/src/services/BaseService.ts` already exists and is in production use. Instead of creating a new one, we'll migrate services to use the existing pattern.

### Current BaseService Pattern
The existing BaseService provides:
- `getCachedData()` method for caching
- `invalidateCache()` method for cache invalidation
- `apiGet()`, `apiPost()`, `apiPut()`, `apiDelete()` methods
- Consistent error handling

### Migration Strategy
Migrate services to extend existing BaseService:
- `notesService.ts` (already partially migrated in Phase A)
- `diaryService.ts` (add BaseService pattern)
- `documentsService.ts`
- `todosService.ts`
- `projectsService.ts`
- `dashboardService.ts`

### Implementation Pattern
```typescript
import { BaseService } from './BaseService';
import { notesCache } from './unifiedCacheService';

export class NotesService extends BaseService {
  constructor() {
    super(notesCache); // Use existing cache
  }

  async getNote(id: string) {
    return this.getCachedData(
      `note:${id}`,
      () => this.apiGet(`/notes/${id}`),
      {} as any,
      { ttl: 300000, tags: ['note'] }
    );
  }
}
```

**Impact:** ~300 lines eliminated through standardization

---

## B6: Backend BaseCRUDService (Days 7-8)

### Create File
`pkms-backend/app/services/base_crud_service.py`

### Implementation
```python
from abc import ABC, abstractmethod
from typing import TypeVar, Generic, Type, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException
from datetime import datetime
from app.config.settings import NEPAL_TZ

T = TypeVar('T')

class BaseCRUDService(Generic[T], ABC):
    @abstractmethod
    def get_model_class(self) -> Type[T]:
        pass

    @abstractmethod
    def get_response_schema(self, item: T, **kwargs) -> Any:
        pass

    async def get_by_uuid(self, db: AsyncSession, user_uuid: str, item_uuid: str) -> T:
        model_class = self.get_model_class()
        result = await db.execute(
            select(model_class).where(
                and_(
                    model_class.uuid == item_uuid,
                    model_class.created_by == user_uuid,
                    model_class.is_deleted == False
                )
            )
        )
        item = result.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail=f"{model_class.__name__} not found")
        return item

    async def soft_delete(self, db: AsyncSession, user_uuid: str, item_uuid: str):
        item = await self.get_by_uuid(db, user_uuid, item_uuid)
        item.is_deleted = True
        item.updated_at = datetime.now(NEPAL_TZ)
        await db.commit()
```

### Migration
Migrate CRUD services:
- `note_crud_service.py`
- `diary_crud_service.py`
- `todo_crud_service.py`
- `project_crud_service.py`
- `document_crud_service.py`

**Impact:** ~400 lines eliminated

---

## B7: Backend Content Document Service (Day 8)

### Create File
`pkms-backend/app/services/content_document_service.py`

### Implementation
```python
import logging
import base64
import hashlib
import uuid as uuid_lib
import aiofiles
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

class ContentDocumentService:
    @staticmethod
    async def create_content_document(
        db: AsyncSession,
        item_uuid: str,
        user_uuid: str,
        content_blob: str,
        module: str,
        options: dict = None
    ) -> str:
        """Create content document for any module"""
        # Centralized document creation logic
        pass
    
    @staticmethod
    async def update_content_document(
        db: AsyncSession,
        document_uuid: str,
        content_blob: str,
        options: dict = None
    ) -> None:
        """Update existing content document"""
        pass
```

### Migration
Refactor diary_crud_service

**Impact:** ~200 lines eliminated

---

## B8: Frontend Generic ContentViewerPage (Day 9)

### Create File
`pkms-frontend/src/components/common/ContentViewerPage.tsx`

### Implementation
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { useDataLoader } from '../../hooks/useDataLoader';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';
import { ContentViewer, ContentViewerProps } from './ContentViewer';
import { UnifiedFileItem } from '../../services/unifiedFileService';

export interface ContentViewerPageConfig<T> {
  service: {
    getItem: (id: string) => Promise<T>;
    getItemFiles: (id: string) => Promise<any[]>;
    toggleArchive?: (id: string, archived: boolean) => Promise<T>;
  };
  itemToContentProps: (item: T, files: UnifiedFileItem[]) => ContentViewerProps;
  editPath: (id: string) => string;
  listPath: string;
  module: 'notes' | 'diary' | 'documents' | 'archive' | 'projects';
  itemTypeName: string;
  fileTransformOptions?: {
    isEncrypted?: boolean;
    defaultMediaType?: 'document' | 'image' | 'video';
  };
}

export function ContentViewerPage<T>({
  id,
  config
}: {
  id: string;
  config: ContentViewerPageConfig<T>;
}) {
  const navigate = useNavigate();

  const { data: item, loading, error, refetch } = useDataLoader(
    () => config.service.getItem(id),
    { dependencies: [id] }
  );

  const { data: files } = useDataLoader(
    async () => {
      const rawFiles = await config.service.getItemFiles(id);
      return transformFilesToUnifiedItems(
        rawFiles,
        config.module,
        id,
        config.fileTransformOptions
      );
    },
    { dependencies: [id] }
  );

  if (loading && !item) {
    return <LoadingState message={`Loading ${config.itemTypeName.toLowerCase()}...`} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={refetch} />;
  }

  if (!item) {
    return <ErrorState message={`${config.itemTypeName} not found`} onRetry={refetch} />;
  }

  const viewerProps = config.itemToContentProps(item, files || []);

  return (
    <Container size="lg" py="md">
      <ContentViewer
        {...viewerProps}
        onEdit={() => navigate(config.editPath(id))}
        onBack={() => navigate(config.listPath)}
      />
    </Container>
  );
}
```

### Migration
Refactor:
- `NoteViewPage.tsx`
- `DiaryViewPage.tsx` (after Phase A)

**Impact:** ~200 lines eliminated

---

## B9: Update Index Files (Day 10)

### Files to Update
- `pkms-frontend/src/hooks/index.ts`
- `pkms-frontend/src/components/common/index.ts`
- `pkms-frontend/src/utils/index.ts`
- `pkms-backend/app/decorators/__init__.py`

Export all new utilities

---

## B10: Comprehensive Testing (Day 10)

### Unit Tests
- Test each hook individually
- Test file transformers
- Test BaseService caching
- Test error decorator

### Integration Tests
- Test migrated components
- Test migrated services
- Test end-to-end workflows

### Manual Testing
- Notes CRUD
- Diary CRUD
- Dashboard loading
- File uploads
- Archive/restore flows

---

# Implementation Checklist

## Phase A: Production-Perfect UX (Days 1-2)
- [ ] A1: DiaryViewPage - field validation, button states, notifications
- [ ] A2: NotesService - payload hygiene, UUID extraction
- [ ] A3: DashboardPage - timeline normalization, auto-refresh
- [ ] A4: DiaryService - restoreEntry, baseUrl consistency
- [ ] A5: UnifiedFileList - verify security fixes
- [ ] A6: DRY_refactoring.md - append Phase A documentation

## Phase B: Comprehensive DRY (Days 3-10)
- [ ] B1: Backend error decorator + migrate 50+ endpoints
- [ ] B2: File transformation utilities + migrate 8+ files
- [ ] B3: Frontend hooks (useDataLoader, useErrorHandler, useForm, useModal)
- [ ] B4: Shared components (LoadingState, ErrorState)
- [ ] B5: Frontend BaseService + migrate 6 services
- [ ] B6: Backend BaseCRUDService + migrate 5 services
- [ ] B7: Backend ContentDocumentService
- [ ] B8: Generic ContentViewerPage + migrate view pages
- [ ] B9: Update index files
- [ ] B10: Comprehensive testing

---

# Expected Final Outcomes

## Code Metrics
- **Phase A Impact:** 0 new files, ~34 production fixes
- **Phase B Impact:** ~1,500 lines eliminated, ~600 new reusable lines
- **Net Reduction:** ~900 lines (41% in affected areas)

## Quality Improvements
- Production-grade UX (loading, errors, notifications, concurrency)
- Zero button double-click bugs
- Zero field conflict bugs
- Standardized error handling (50+ endpoints)
- Consistent data loading (20+ components)
- Type-safe generic implementations

## Maintenance Benefits
- Single source of truth for common patterns
- Easier to add error tracking
- Simpler to add new modules
- Faster developer onboarding
- Reduced bug surface area

---

**End of Plan**

