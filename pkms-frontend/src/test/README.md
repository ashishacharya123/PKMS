# Frontend Testing Guide

This directory contains the testing infrastructure for the PKMS frontend application.

## 🏗️ Testing Structure

```
src/test/
├── setup.ts          # Test setup and configuration
├── server.ts          # Mock Service Worker (MSW) server
├── utils.tsx          # Testing utilities and helpers
└── README.md         # This file
```

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests
```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui
```

## 📁 Test Organization

### Component Tests
- **Location**: `src/components/__tests__/`
- **Pattern**: `ComponentName.test.tsx`
- **Focus**: Component behavior, user interactions, rendering

### Service Tests
- **Location**: `src/services/__tests__/`
- **Pattern**: `serviceName.test.ts`
- **Focus**: API calls, data transformation, error handling

### Utility Tests
- **Location**: `src/utils/__tests__/`
- **Pattern**: `utilityName.test.ts`
- **Focus**: Pure functions, data validation, encryption

### Hook Tests
- **Location**: `src/hooks/__tests__/`
- **Pattern**: `hookName.test.ts`
- **Focus**: State management, side effects, custom logic

## 🛠️ Testing Utilities

### Custom Render Function
```typescript
import { render } from '../test/utils';

// Automatically wraps components with providers
render(<MyComponent />);
```

### Mock Data
```typescript
import { mockDiaryEntry, mockUser, mockHabitData } from '../test/utils';

// Use pre-configured mock data
const entry = mockDiaryEntry;
```

### MSW Server
```typescript
import { server } from '../test/server';

// Mock API responses
server.use(
  http.get('/api/v1/diary/entries', () => {
    return HttpResponse.json({ entries: [] });
  })
);
```

## 🎯 Testing Best Practices

### 1. Component Testing
- Test user interactions (clicks, form submissions)
- Test conditional rendering
- Test error states and loading states
- Test accessibility features

### 2. Service Testing
- Mock external dependencies
- Test success and error scenarios
- Test data transformation
- Test retry logic

### 3. Utility Testing
- Test edge cases
- Test input validation
- Test encryption/decryption
- Test date conversions

### 4. Integration Testing
- Test component + service interactions
- Test routing and navigation
- Test state management
- Test API integration

## 📊 Coverage Goals

- **Overall Coverage**: 80%+
- **Components**: 85%+
- **Services**: 90%+
- **Utilities**: 95%+

## 🔧 Configuration

### Vitest Config
- **File**: `vitest.config.ts`
- **Environment**: jsdom
- **Setup**: `src/test/setup.ts`
- **Coverage**: v8 provider

### Test Setup
- **MSW**: Mock API responses
- **Providers**: React Query, Mantine, Notifications
- **Cleanup**: Automatic after each test

## 🚨 Common Issues

### 1. Import Errors
```typescript
// ❌ Wrong
import { render } from '@testing-library/react';

// ✅ Correct
import { render } from '../test/utils';
```

### 2. Provider Issues
```typescript
// ❌ Wrong - Missing providers
render(<Component />);

// ✅ Correct - Uses custom render with providers
render(<Component />);
```

### 3. Async Testing
```typescript
// ❌ Wrong
expect(screen.getByText('Loading')).toBeInTheDocument();

// ✅ Correct
await waitFor(() => {
  expect(screen.getByText('Content')).toBeInTheDocument();
});
```

## 📝 Example Tests

### Component Test
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../test/utils';
import { Button } from '../Button';

describe('Button', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

### Service Test
```typescript
import { describe, it, expect, vi } from 'vitest';
import { diaryService } from '../diaryService';

describe('diaryService', () => {
  it('should create diary entry', async () => {
    const mockResponse = { uuid: 'test-uuid' };
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const result = await diaryService.createEntry({
      title: 'Test',
      content: 'Content'
    });

    expect(result).toEqual(mockResponse);
  });
});
```

## 🎉 Running Tests

```bash
# Quick test run
npm run test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# Interactive UI
npm run test:ui
```

## 📚 Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [MSW Documentation](https://mswjs.io/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)

---

**Happy Testing! 🧪✨**
