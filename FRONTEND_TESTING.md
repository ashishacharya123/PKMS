# Frontend Testing Documentation

This document outlines the frontend testing strategy and provides a roadmap for implementing comprehensive tests for the PKMS frontend application.

## 🎯 Current Status

**Testing Infrastructure**: ✅ Available
- Vitest configured in `package.json`
- TypeScript for type safety
- ESLint with React app rules

**Actual Tests**: ❌ None Implemented
- No unit tests exist
- No integration tests exist
- No E2E tests exist

## 📋 Proposed Testing Structure

### 1. Unit Testing with Vitest
```
pkms-frontend/src/
├── components/
│   └── __tests__/
│       ├── common/
│       │   ├── Button.test.tsx
│       │   ├── Input.test.tsx
│       │   └── Modal.test.tsx
│       ├── diary/
│       │   ├── DiaryPage.test.tsx
│       │   ├── DiaryEntry.test.tsx
│       │   └── UnifiedHabitTracker.test.tsx
│       ├── habits/
│       │   ├── HabitTracker.test.tsx
│       │   └── HabitAnalytics.test.tsx
│       ├── documents/
│       │   ├── DocumentList.test.tsx
│       │   └── FileUpload.test.tsx
│       └── todos/
│           ├── TodoList.test.tsx
│           └── TodoItem.test.tsx
├── services/
│   └── __tests__/
│       ├── diaryService.test.ts
│       ├── apiClient.test.ts
│       └── habitService.test.ts
├── hooks/
│   └── __tests__/
│       ├── useDiary.test.ts
│       ├── useHabits.test.ts
│       └── useAuth.test.ts
├── utils/
│   └── __tests__/
│       ├── encryption.test.ts
│       ├── dateUtils.test.ts
│       └── nepaliDate.test.ts
└── stores/
    └── __tests__/
        ├── authStore.test.ts
        └── diaryStore.test.ts
```

### 2. Component Testing Focus Areas

#### Critical Components to Test First

1. **DiaryPage** (`src/pages/DiaryPage.tsx`)
   - Diary entry creation/editing flows
   - Client-side encryption handling
   - Nepali date conversion
   - File attachment functionality

2. **UnifiedHabitTracker** (`src/components/diary/UnifiedHabitTracker.tsx`)
   - Habit CRUD operations
   - Tab switching between daily stats and my habits
   - Analytics display
   - Form validation

3. **FileUpload Component**
   - Drag and drop functionality
   - File type validation
   - Progress tracking
   - Error handling

4. **Encryption Utilities**
   - Client-side encryption/decryption
   - Password validation
   - Data integrity checks

### 3. Integration Testing Areas

1. **API Integration**
   - diaryService API calls
   - Error handling and retries
   - Data transformation

2. **State Management**
   - Zustand store updates
   - React Query cache management
   - Cross-component state sharing

3. **Routing**
   - Navigation flows
   - Protected routes
   - Parameter passing

### 4. E2E Testing with Playwright (Recommended)

```typescript
// tests/e2e/diary-workflow.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Diary Workflow', () => {
  test('should create, edit, and delete diary entry', async ({ page }) => {
    // Login flow
    await page.goto('/login');
    await page.fill('[data-testid=username]', 'testuser');
    await page.fill('[data-testid=password]', 'testpass');
    await page.click('[data-testid=login-button]');

    // Navigate to diary
    await page.click('[data-testid=diary-nav]');
    await expect(page).toHaveURL('/diary');

    // Create entry
    await page.click('[data-testid=new-entry-button]');
    await page.fill('[data-testid=entry-title]', 'Test Entry');
    await page.fill('[data-testid=entry-content]', 'Test content');
    await page.click('[data-testid=save-entry]');

    // Verify entry appears
    await expect(page.locator('[data-testid=entry-list]')).toContainText('Test Entry');

    // Edit entry
    await page.click('[data-testid=edit-entry]');
    await page.fill('[data-testid=entry-content]', 'Updated content');
    await page.click('[data-testid=save-entry]');

    // Delete entry
    await page.click('[data-testid=delete-entry]');
    await page.click('[data-testid=confirm-delete]');

    // Verify entry is gone
    await expect(page.locator('[data-testid=entry-list]')).not.toContainText('Test Entry');
  });
});
```

## 🛠️ Setup Requirements

### 1. Vitest Configuration
Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 2. Test Setup File
Create `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from './server';

// Setup MSW server
beforeAll(() => server.listen());
afterEach(() => {
  cleanup();
});
afterAll(() => server.close());
```

### 3. Mock Service Worker
Create `src/test/server.ts`:
```typescript
import { setupServer } from 'msw/node';
import { rest } from 'msw';

export const server = setupServer(
  // Mock API endpoints here
  rest.get('/api/v1/user/profile', (req, res, ctx) => {
    return res(
      ctx.json({
        uuid: 'test-user-uuid',
        username: 'testuser',
        email: 'test@example.com'
      })
    );
  }),

  // Add more mock endpoints as needed
);
```

## 📝 Example Test Implementations

### Basic Component Test
```typescript
// src/components/__tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    await userEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Service Test
```typescript
// src/services/__tests__/diaryService.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { diaryService } from '../diaryService';

describe('diaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create diary entry', async () => {
    const mockResponse = { uuid: 'test-uuid', title: 'Test Entry' };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await diaryService.createEntry({
      title: 'Test Entry',
      content: 'Test content'
    });

    expect(result).toEqual(mockResponse);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/diary/entries'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        })
      })
    );
  });
});
```

## 🎯 Testing Priorities

### Phase 1: Critical Components (Week 1-2)
1. **Diary encryption utilities** - Most critical functionality
2. **DiaryPage component** - Main user workflow
3. **diaryService API** - Backend integration
4. **Date utilities** - Nepali date conversion

### Phase 2: Core Features (Week 3-4)
1. **UnifiedHabitTracker** - New feature
2. **File upload components** - File management
3. **Authentication flows** - User access
4. **Navigation components** - App structure

### Phase 3: Supporting Features (Week 5-6)
1. **Todo management** - Secondary features
2. **Document management** - File handling
3. **Settings and preferences** - Configuration
4. **Error boundaries** - Error handling

### Phase 4: Advanced Testing (Week 7-8)
1. **E2E workflows** - Complete user journeys
2. **Performance testing** - Load and speed
3. **Accessibility testing** - WCAG compliance
4. **Visual regression testing** - UI consistency

## 🔧 Development Workflow

### Running Tests
```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test -- --watch

# Run tests with coverage
npm run test -- --coverage

# Run specific test file
npm run test src/components/__tests__/DiaryPage.test.tsx
```

### CI/CD Integration
```yaml
# .github/workflows/frontend-tests.yml
name: Frontend Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test -- --coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## 📊 Success Metrics

### Coverage Targets
- **Overall Coverage**: 80%+
- **Components**: 85%+
- **Services**: 90%+
- **Utilities**: 95%+

### Quality Gates
- All tests must pass in CI
- No new code without tests
- Coverage must not decrease
- Critical paths must have E2E tests

## 🚀 Next Steps

1. **Immediate** (This week):
   - Set up Vitest configuration
   - Create first basic component test
   - Set up mock service worker

2. **Short-term** (Next 2 weeks):
   - Test diary encryption utilities
   - Test DiaryPage component
   - Test diaryService integration

3. **Medium-term** (Next month):
   - Comprehensive component testing
   - Integration testing
   - Set up E2E testing framework

4. **Long-term** (Next quarter):
   - Full test suite implementation
   - Performance testing
   - Accessibility testing

---

**Note**: This is a living document. Update as testing infrastructure evolves and new requirements emerge.

**Last Updated**: 2025-01-21
**Status**: Ready for Implementation