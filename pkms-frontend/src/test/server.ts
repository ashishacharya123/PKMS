import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(
  // Auth endpoints
  http.get('/api/v1/user/profile', () => {
    return HttpResponse.json({
      uuid: 'test-user-uuid',
      username: 'testuser',
      email: 'test@example.com',
      fullName: 'Test User'
    });
  }),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as any;
    return HttpResponse.json({
      access_token: 'test-token',
      user: {
        uuid: 'test-user-uuid',
        username: body.username,
        email: 'test@example.com'
      }
    });
  }),

  // Notes endpoints
  http.get('/api/v1/notes', () => {
    return HttpResponse.json([
      {
        uuid: 'test-note-1',
        title: 'Test Note',
        content: 'Test content',
        is_favorite: false,
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]);
  }),

  http.post('/api/v1/notes', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      uuid: 'new-note-uuid',
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }),

  // Documents endpoints
  http.get('/api/v1/documents', () => {
    return HttpResponse.json([
      {
        uuid: 'test-doc-1',
        title: 'Test Document',
        original_name: 'test.txt',
        mime_type: 'text/plain',
        file_size: 1024,
        is_archived: false,
        created_at: new Date().toISOString()
      }
    ]);
  }),

  // Todos endpoints
  http.get('/api/v1/todos', () => {
    return HttpResponse.json([
      {
        uuid: 'test-todo-1',
        title: 'Test Todo',
        description: 'Test description',
        status: 'pending',
        priority: 'medium',
        type: 'task',
        start_date: null,
        due_date: null,
        completion_percentage: 0,
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        projects: []
      }
    ]);
  }),

  http.post('/api/v1/todos', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      uuid: 'new-todo-uuid',
      ...body,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }),

  // Projects endpoints
  http.get('/api/v1/projects', () => {
    return HttpResponse.json([
      {
        uuid: 'test-project-1',
        name: 'Test Project',
        description: 'Test project description',
        status: 'is_running',
        priority: 'medium',
        due_date: null,
        completion_date: null,
        progress_percentage: 0,
        todo_count: 0,
        completed_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]);
  }),

  // Diary endpoints
  http.get('/api/v1/diary/entries', () => {
    return HttpResponse.json([
      {
        uuid: 'test-entry-1',
        title: 'Test Entry 1',
        date: '2024-01-21',
        mood: 5,
        content_available: true,
        created_at: new Date().toISOString()
      }
    ]);
  }),

  http.post('/api/v1/diary/entries', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      uuid: 'new-entry-uuid',
      ...body,
      created_at: new Date().toISOString()
    });
  }),

  // Archive endpoints
  http.get('/api/v1/archive/folders', () => {
    return HttpResponse.json([
      {
        uuid: 'test-folder-1',
        name: 'Test Folder',
        created_at: new Date().toISOString()
      }
    ]);
  }),

  http.get('/api/v1/archive/items', () => {
    return HttpResponse.json([
      {
        uuid: 'test-item-1',
        title: 'Test Archive Item',
        module_type: 'notes',
        created_at: new Date().toISOString()
      }
    ]);
  }),

  // Tags endpoints
  http.get('/api/v1/tags', () => {
    return HttpResponse.json([
      {
        uuid: 'test-tag-1',
        name: 'Test Tag',
        created_at: new Date().toISOString()
      }
    ]);
  }),

  http.post('/api/v1/tags', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      uuid: 'new-tag-uuid',
      ...body,
      created_at: new Date().toISOString()
    });
  }),

  // Search endpoints
  http.get('/api/v1/search/fts5', () => {
    return HttpResponse.json({
      results: [
        {
          uuid: 'search-result-1',
          title: 'Search Result',
          module_type: 'notes',
          content: 'Search result content',
          relevance_score: 0.95
        }
      ],
      total: 1
    });
  }),

  http.get('/api/v1/fuzzy-search-light', () => {
    return HttpResponse.json({
      results: [
        {
          uuid: 'fuzzy-result-1',
          title: 'Fuzzy Result',
          module_type: 'todos',
          content: 'Fuzzy search result',
          relevance_score: 0.85
        }
      ],
      total: 1
    });
  }),

  // Dashboard endpoints
  http.get('/api/v1/dashboard/stats', () => {
    return HttpResponse.json({
      notes_count: 10,
      todos_count: 5,
      documents_count: 3,
      projects_count: 2,
      recent_activity: []
    });
  }),

  // Backup endpoints
  http.post('/api/v1/backup/create', () => {
    return HttpResponse.json({
      success: true,
      backup_path: '/backups/backup-2024-01-21.db'
    });
  }),

  http.get('/api/v1/backup/list', () => {
    return HttpResponse.json([
      '/backups/backup-2024-01-21.db',
      '/backups/backup-2024-01-20.db'
    ]);
  }),

  // Catch-all for unmatched requests
  http.all('*', ({ request }) => {
    console.warn(`Unhandled ${request.method} request to ${request.url}`);
    return HttpResponse.json({ error: 'Not found' }, { status: 404 });
  })
);
