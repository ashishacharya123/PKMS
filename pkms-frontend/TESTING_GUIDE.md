# PKMS Frontend Testing Guide

## Overview

This guide covers the comprehensive testing infrastructure for the PKMS frontend application. We use **Vitest** as our test runner with **React Testing Library** for component testing and **MSW (Mock Service Worker)** for API mocking.

## Testing Stack

- **Vitest**: Fast test runner with built-in TypeScript support
- **React Testing Library**: Component testing utilities
- **MSW**: API mocking for realistic testing
- **jsdom**: DOM environment for browser-like testing
- **@testing-library/jest-dom**: Custom matchers for DOM testing

## Test Structure

```
src/
├── test/                    # Test configuration and utilities
│   ├── setup.ts            # Global test setup
│   ├── server.ts           # MSW server configuration
│   ├── testUtils.tsx       # Custom render utilities and mocks
│   └── utils.tsx           # Additional test utilities
├── components/
│   └── __tests__/          # Component tests
│       ├── common/         # Common component tests
│       ├── todos/          # Todo component tests
│       └── ...
├── stores/
│   └── __tests__/          # Store tests
├── services/
│   └── __tests__/          # Service tests
└── pages/
    └── __tests__/          # Page component tests
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests once (CI mode)
npm run test:run

# Run tests with coverage
npm run test:coverage

# Run tests with UI
npm run test:ui

# Run tests for CI
npm run test:ci
```

### Running Specific Tests

```bash
# Run tests for a specific file
npm test TodoCard.test.tsx

# Run tests matching a pattern
npm test -- --grep "TodoCard"

# Run tests in a specific directory
npm test src/components/__tests__/
```

## Test Categories

### 1. Component Tests

Test individual React components in isolation.

**Example: TodoCard.test.tsx**
```typescript
import { render, screen, fireEvent } from '../../test/testUtils';
import { TodoCard } from '../todos/TodoCard';

describe('TodoCard', () => {
  it('renders todo information correctly', () => {
    render(<TodoCard todo={mockTodo} {...mockHandlers} />);
    expect(screen.getByText('Test Todo')).toBeInTheDocument();
  });
});
```

**What to test:**
- Component rendering
- User interactions (clicks, form submissions)
- Props handling
- State changes
- Event callbacks
- Accessibility features

### 2. Store Tests

Test Zustand store logic and state management.

**Example: todosStore.test.ts**
```typescript
import { renderHook, act } from '@testing-library/react';
import { useTodosStore } from '../todosStore';

describe('todosStore', () => {
  it('loads todos successfully', async () => {
    const { result } = renderHook(() => useTodosStore());
    
    await act(async () => {
      await result.current.loadTodos();
    });
    
    expect(result.current.todos).toEqual(mockTodos);
  });
});
```

**What to test:**
- State updates
- Async operations
- Error handling
- Store actions
- State persistence

### 3. Service Tests

Test API service functions and data transformations.

**Example: todosService.test.ts**
```typescript
import { todosService } from '../todosService';

describe('todosService', () => {
  it('fetches todos from API', async () => {
    const todos = await todosService.getAll();
    expect(todos).toHaveLength(1);
    expect(todos[0].title).toBe('Test Todo');
  });
});
```

**What to test:**
- API calls
- Data transformation
- Error handling
- Request/response handling

### 4. Page Tests

Test complete page components with their interactions.

**Example: TodosPageNew.test.tsx**
```typescript
import { render, screen, fireEvent } from '../../test/testUtils';
import { TodosPageNew } from '../TodosPageNew';

describe('TodosPageNew', () => {
  it('renders page with todos', () => {
    render(<TodosPageNew />);
    expect(screen.getByText('Todos')).toBeInTheDocument();
  });
});
```

**What to test:**
- Page rendering
- Component integration
- User workflows
- Navigation
- Data loading states

## Testing Utilities

### Custom Render Function

Use `renderWithProviders` for components that need context providers:

```typescript
import { renderWithProviders } from '../../test/testUtils';

test('renders with providers', () => {
  renderWithProviders(<MyComponent />);
  // Test your component
});
```

### Mock Data

Use predefined mock data from `testUtils.tsx`:

```typescript
import { mockTodo, mockProject, mockUser } from '../../test/testUtils';

test('uses mock data', () => {
  render(<TodoCard todo={mockTodo} />);
  expect(screen.getByText(mockTodo.title)).toBeInTheDocument();
});
```

### MSW Handlers

API calls are automatically mocked using MSW. Add new handlers in `server.ts`:

```typescript
http.get('/api/v1/new-endpoint', () => {
  return HttpResponse.json({ data: 'mock response' });
}),
```

## Best Practices

### 1. Test Structure

Follow the **Arrange-Act-Assert** pattern:

```typescript
it('should do something', () => {
  // Arrange
  const mockData = { title: 'Test' };
  
  // Act
  render(<Component data={mockData} />);
  fireEvent.click(screen.getByText('Button'));
  
  // Assert
  expect(screen.getByText('Expected Result')).toBeInTheDocument();
});
```

### 2. Test Naming

Use descriptive test names:

```typescript
// Good
it('displays error message when API call fails')

// Bad
it('works')
```

### 3. Mock External Dependencies

Mock all external dependencies:

```typescript
// Mock services
vi.mock('../../services/todosService', () => ({
  todosService: {
    getAll: vi.fn()
  }
}));

// Mock hooks
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser })
}));
```

### 4. Test User Interactions

Focus on user behavior, not implementation details:

```typescript
// Good - tests user interaction
fireEvent.click(screen.getByText('Submit'));

// Bad - tests implementation
fireEvent.click(component.querySelector('button'));
```

### 5. Async Testing

Handle async operations properly:

```typescript
it('handles async operation', async () => {
  render(<AsyncComponent />);
  
  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

## Coverage Goals

- **Statements**: 70%
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%

## Common Test Patterns

### Testing Forms

```typescript
it('submits form with correct data', async () => {
  const onSubmit = vi.fn();
  render(<TodoForm onSubmit={onSubmit} />);
  
  fireEvent.change(screen.getByLabelText('Title'), {
    target: { value: 'New Todo' }
  });
  fireEvent.click(screen.getByText('Submit'));
  
  expect(onSubmit).toHaveBeenCalledWith({
    title: 'New Todo'
  });
});
```

### Testing Error States

```typescript
it('displays error when operation fails', () => {
  const errorStore = { ...mockStore, error: 'Test error' };
  useTodosStore.mockReturnValue(errorStore);
  
  render(<TodosPage />);
  
  expect(screen.getByText('Test error')).toBeInTheDocument();
});
```

### Testing Loading States

```typescript
it('shows loading indicator', () => {
  const loadingStore = { ...mockStore, isLoading: true };
  useTodosStore.mockReturnValue(loadingStore);
  
  render(<TodosPage />);
  
  expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
});
```

## Debugging Tests

### 1. Use screen.debug()

```typescript
it('debugs component', () => {
  render(<MyComponent />);
  screen.debug(); // Prints DOM structure
});
```

### 2. Use getByTestId for stable selectors

```typescript
// Component
<div data-testid="todo-list">...</div>

// Test
expect(screen.getByTestId('todo-list')).toBeInTheDocument();
```

### 3. Use waitFor for async operations

```typescript
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});
```

## Continuous Integration

Tests run automatically on:
- Pull requests
- Main branch pushes
- Scheduled runs

The CI pipeline:
1. Installs dependencies
2. Runs linting
3. Runs type checking
4. Runs tests with coverage
5. Reports results

## Troubleshooting

### Common Issues

1. **MSW not intercepting requests**
   - Check server setup in `setup.ts`
   - Verify handlers in `server.ts`

2. **Async tests timing out**
   - Use `waitFor` for async operations
   - Increase timeout if needed

3. **Mock not working**
   - Ensure mock is defined before import
   - Check mock implementation

4. **Coverage not accurate**
   - Check coverage exclusions in `vitest.config.ts`
   - Verify test file patterns

### Getting Help

- Check existing tests for patterns
- Review Vitest documentation
- Check React Testing Library docs
- Ask team for assistance

## Future Improvements

- [ ] Add visual regression testing
- [ ] Add E2E tests with Playwright
- [ ] Add performance testing
- [ ] Add accessibility testing automation
- [ ] Add test data factories
- [ ] Add integration tests for complex workflows