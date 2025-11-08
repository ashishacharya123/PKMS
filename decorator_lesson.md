# Python Decorators: The @handle_api_errors Pattern

## 🎯 Overview

This lesson explains **Python decorators** using our PKMS project's `@handle_api_errors` decorator as a practical example. Decorators are a powerful Python feature that allows you to modify or enhance functions and methods without changing their source code.

**`★ Insight ─────────────────────────────────────`**
Decorators are essentially "functions that wrap other functions" - they allow you to add behavior before, after, or instead of the original function execution. In PKMS, we use decorators to eliminate code duplication and ensure consistent error handling across 80+ API endpoints.
`─────────────────────────────────────────────────`**

## 🔍 What are Decorators?

### Basic Definition
A decorator is a function that takes another function as input and returns a new function. The syntax `@decorator_name` is just syntactic sugar for:

```python
@decorator_name
def my_function():
    pass

# This is equivalent to:
def my_function():
    pass
my_function = decorator_name(my_function)
```

### Why Use Decorators?
1. **DRY Principle**: Don't Repeat Yourself - eliminate duplicate code
2. **Cross-cutting Concerns**: Add behavior that applies to multiple functions (logging, error handling, authentication)
3. **Cleaner Code**: Separate business logic from infrastructure concerns
4. **Consistency**: Ensure all similar operations behave the same way

## 🚀 Real PKMS Example: @handle_api_errors

Let's examine our actual PKMS decorator implementation:

### The Problem We Solved
Before our refactoring, every API endpoint looked like this:

```python
# OLD CODE - Before decorator (lots of repetition!)
@router.post("/notes")
async def create_note(note_data: NoteCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        # Business logic here
        result = await note_crud_service.create_note(db, current_user.uuid, note_data)
        return result
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except ValueError as e:
        logger.error(f"Validation error creating note for user {current_user.uuid}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        logger.exception(f"Unexpected error creating note for user {current_user.uuid}")
        raise HTTPException(status_code=500, detail="Failed to create note")

@router.post("/todos")
async def create_todo(todo_data: TodoCreate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        # Business logic here
        result = await todo_crud_service.create_todo(db, current_user.uuid, todo_data)
        return result
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except ValueError as e:
        logger.error(f"Validation error creating todo for user {current_user.uuid}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid input: {str(e)}")
    except Exception as e:
        logger.exception(f"Unexpected error creating todo for user {current_user.uuid}")
        raise HTTPException(status_code=500, detail="Failed to create todo")
```

### The Solution: Our Decorator

**File**: `pkms-backend/app/decorators/error_handler.py`

```python
from functools import wraps
from fastapi import HTTPException, status
import logging

logger = logging.getLogger(__name__)

def handle_api_errors(operation_name: str):
    """
    Decorator for standardizing API route error handling

    Args:
        operation_name: Human-readable name for logging (e.g., "creating note", "updating todo")

    Returns:
        Decorated function with consistent error handling
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                # Execute the original function
                return await func(*args, **kwargs)
            except HTTPException:
                # Re-raise HTTP exceptions unchanged (let them bubble up)
                raise
            except Exception as e:
                # Handle unexpected exceptions consistently
                # Extract user from kwargs or function signature
                user = kwargs.get('current_user')
                user_uuid = user.uuid if user else 'unknown'

                # Log the error with context
                logger.exception(f"Error {operation_name} for user {user_uuid}")

                # Return standardized error response
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to {operation_name}"
                ) from e
        return wrapper
    return decorator
```

### How We Use It in PKMS

**File**: `pkms-backend/app/routers/notes.py`

```python
from app.decorators.error_handler import handle_api_errors

@router.post("/notes", response_model=NoteResponse)
@handle_api_errors("creating note")  # ← This is our decorator!
async def create_note(
    note_data: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new note with content processing
    """
    # Clean business logic - no error handling boilerplate!
    return await note_crud_service.create_note(db, current_user.uuid, note_data)

@router.get("/notes/{note_uuid}", response_model=NoteResponse)
@handle_api_errors("getting note")
async def get_note(
    note_uuid: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get single note with all related data
    """
    # Clean business logic - no error handling boilerplate!
    return await note_crud_service.get_note_with_relations(db, note_uuid, current_user.uuid)

@router.put("/notes/{note_uuid}", response_model=NoteResponse)
@handle_api_errors("updating note")
async def update_note(
    note_uuid: str,
    update_data: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update note with content processing
    """
    # Clean business logic - no error handling boilerplate!
    return await note_crud_service.update_note(db, current_user.uuid, note_uuid, update_data)
```

## 🔍 How It Works - Step by Step

### 1. Function Definition
```python
def handle_api_errors(operation_name: str):
    # This function will be our decorator factory
```

### 2. Decorator Factory
```python
def decorator(func):
    # This function receives the actual function to be decorated
    # and returns the wrapped function
```

### 3. Wrapper Function
```python
@wraps(func)
async def wrapper(*args, **kwargs):
    # This function replaces the original function call
    # It can add behavior before/after the original function
```

### 4. Execution Flow
1. **Before**: Logger sets up context
2. **Original**: `await func(*args, **kwargs)` runs the business logic
3. **After**: Error handling and cleanup occur

## 📊 Impact Analysis

### Before Decorator
- **Lines per endpoint**: ~15-20 lines of error handling
- **Total for 80 endpoints**: ~1,200-1,600 lines
- **Maintenance**: High - change error handling in 80 places
- **Consistency Risk**: Low - easy to miss inconsistencies

### After Decorator
- **Lines per endpoint**: ~2-3 lines (just the decorator annotation)
- **Total for 80 endpoints**: ~160-240 lines
- **Maintenance**: Low - change error handling in 1 place
- **Consistency**: High - guaranteed consistent behavior

**Savings**: ~1,000+ lines eliminated! 🎉

## 🛠️ Advanced Decorator Concepts

### 1. Decorators with Parameters
```python
@handle_api_errors("creating note")  # Parameter passed to decorator
async def create_note(...):
    pass
```

### 2. Function Metadata Preservation
```python
@wraps(func)  # Preserves function name, docstring, etc.
async def wrapper(*args, **kwargs):
    # wrapper.__name__ == "create_note"
    # wrapper.__doc__ == "Create a new note..."
```

### 3. Accessing Function Information
```python
# Inside wrapper, you can access:
print(func.__name__)     # "create_note"
print(func.__doc__)      # The original docstring
print(func.__module__)    # "app.routers.notes"
```

## 🎯 Best Practices for Decorators

### 1. Always Use @wraps
```python
# GOOD - Preserves function metadata
@wraps(func)
def wrapper(*args, **kwargs):
    return func(*args, **kwargs)

# BAD - Loses function metadata
def wrapper(*args, **kwargs):
    return func(*args, **kwargs)
```

### 2. Keep Decorators Focused
```python
# GOOD - Single responsibility
@handle_api_errors
def create_note(...):
    pass

# BAD - Multiple responsibilities in one decorator
@handle_api_errors @log_requests @authenticate @validate_input
def create_note(...):
    pass
```

### 3. Handle Expected Exceptions
```python
# GOOD - Let expected exceptions bubble up
try:
    return await func(*args, **kwargs)
except HTTPException:
    raise  # Let FastAPI handle HTTP exceptions
except ValueError:
    # Handle validation errors
    raise HTTPException(status_code=400, detail="Invalid input")
```

## 🔬 Real-World Decorator Patterns

### 1. Logging Decorator
```python
def log_execution(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        logger.info(f"Starting {func.__name__}")
        result = func(*args, **kwargs)
        logger.info(f"Completed {func.__name__}")
        return result
    return wrapper
```

### 2. Timing Decorator
```python
import time

def time_execution(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        logger.info(f"{func.__name__} took {end_time - start_time:.2f} seconds")
        return result
    return wrapper
```

### 3. Cache Decorator
```python
def cache_result(ttl: int = 300):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache_key = f"{func.__name__}:{hash(str(args))}"
            # Check cache...
            result = func(*args, **kwargs)
            # Store in cache...
            return result
        return wrapper
    return decorator
```

## 🎓 When to Use Decorators

### ✅ Perfect Use Cases
- **Cross-cutting concerns**: Logging, error handling, authentication, caching
- **API standardization**: Consistent response formats, error handling patterns
- **Code deduplication**: Same error handling in multiple places
- **Aspect-oriented programming**: Separating infrastructure from business logic

### ❌ Avoid Using When
- **Business logic specific**: Don't hide business rules in decorators
- **Heavy computations**: Don't do expensive work in decorators
- **Complex parameter validation**: Use Pydantic models instead
- **Debugging issues**: Don't make debugging harder by hiding logic

## 🏆 PKMS Success Story

Our `@handle_api_errors` decorator demonstrates perfect decorator usage:

1. **Problem Solved**: Eliminated ~1,000+ lines of duplicate error handling code
2. **Consistency Achieved**: All 80+ API endpoints now handle errors identically
3. **Maintenance Improved**: Change error handling once, applies everywhere
4. **Code Quality**: Business logic is now clean and focused
5. **Production Ready**: Robust error handling with proper logging

**This is exactly what decorators were designed for!** 🎯

---

## 📚 Further Learning

- **Python Decorators Tutorial**: https://realpython.com/primer-on-python-decorators/
- **FastAPI Dependencies**: https://fastapi.tiangolo.com/tutorial/dependencies/
- **Type Hints with Decorators**: https://docs.python.org/3/library/typing.html#typing-callable-decorators

**Remember**: Decorators are just syntactic sugar for higher-order functions. Understanding them as "functions that wrap other functions" makes the concept much clearer!