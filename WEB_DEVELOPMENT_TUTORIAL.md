# 🌐 Complete Web Development Tutorial: PKMS Project

## 📚 What You'll Learn
- Docker containerization
- FastAPI backend development
- React frontend development
- REST API concepts
- Modern web architecture
- Security best practices
- **Authentication & Database Implementation** ✅

---

## 🏗️ Our Architecture Overview

```
User → React App (Frontend) → FastAPI Server (Backend) → SQLite Database
```

**Why This Architecture?**
- **Separation of Concerns**: Frontend and backend are separate
- **Scalability**: Can scale independently
- **Technology Flexibility**: Different tools for different jobs
- **Development Speed**: Teams can work simultaneously

---

## 🐳 Docker Explained

### What is Docker?
Docker packages applications and dependencies into containers. Think of it like a shipping container for software!

### Why Docker?
- **Consistency**: Same environment everywhere
- **Isolation**: No conflicts between projects
- **Portability**: Works on any machine
- **Easy Deployment**: Same container runs everywhere

### Our Docker Setup

#### Backend Dockerfile (`pkms-backend/Dockerfile`):
```dockerfile
FROM python:3.11-slim          # Start with Python base image
WORKDIR /app                   # Set working directory
COPY requirements.txt .        # Copy dependencies
RUN pip install -r requirements.txt  # Install Python packages
COPY . .                       # Copy our code
EXPOSE 8000                    # Expose port
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

#### Docker Compose (`docker-compose.yml`):
```yaml
services:
  pkms-backend:
    build: ./pkms-backend
    ports:
      - "8000:8000"              # Map host port to container port
    volumes:
      - ./PKMS_Data:/app/data    # Share data folder
      - ./pkms-backend:/app      # Share code for development
    environment:
      - DATABASE_URL=sqlite:///app/data/pkm_metadata.db
```

### Docker Commands:
```bash
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker-compose logs -f        # View logs
docker-compose ps             # List containers
docker-compose restart        # Restart services
```

---

## ⚡ FastAPI Backend Explained

### What is FastAPI?
FastAPI is a modern, fast web framework for building APIs with Python.

### Why FastAPI?
- **Fast**: One of the fastest Python frameworks
- **Easy**: Automatic API documentation
- **Modern**: Built for async programming
- **Type-safe**: Uses Python type hints

### Our FastAPI Application

#### Main App (`pkms-backend/main.py`):
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="PKMS API", version="1.0.0")

# Allow frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/")
async def root():
    return {"message": "PKMS Backend API"}
```

### FastAPI Concepts

#### 1. **Async/Await**
```python
# Synchronous (blocks until complete)
def get_user_sync(user_id: int):
    user = database.get_user(user_id)  # Blocks here
    return user

# Asynchronous (doesn't block)
async def get_user_async(user_id: int):
    user = await database.get_user(user_id)  # Doesn't block
    return user
```

#### 2. **Path Operations**
```python
@app.get("/users/{user_id}")      # GET request
@app.post("/users/")              # POST request
@app.put("/users/{user_id}")      # PUT request
@app.delete("/users/{user_id}")   # DELETE request
```

#### 3. **Request/Response Models**
```python
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str

@app.post("/users/", response_model=UserResponse)
async def create_user(user: UserCreate):
    # FastAPI validates input and output automatically
    return {"id": 1, "username": user.username, "email": user.email}
```

### Database Integration (SQLAlchemy) ✅ IMPLEMENTED

#### Database Models:
```python
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    salt = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
```

#### Database Operations:
```python
from sqlalchemy.orm import Session

def create_user(db: Session, user: UserCreate):
    db_user = User(
        username=user.username,
        email=user.email,
        password_hash=hash_password(user.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user
```

---

## ⚛️ React Frontend Explained

### What is React?
React is a JavaScript library for building user interfaces using components.

### Why React?
- **Component-based**: Reusable UI pieces
- **Virtual DOM**: Efficient updates
- **Large ecosystem**: Many libraries
- **Popular**: Great community

### Our React Application

#### Main App (`pkms-frontend/src/App.tsx`):
```tsx
import { Container, Title, Text, Card } from '@mantine/core';

function App() {
  return (
    <Container size="lg" py="xl">
      <Title order={1}>🧠 PKMS</Title>
      <Text>Personal Knowledge Management System</Text>
      
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Title order={2}>🎉 Setup Complete!</Title>
        <Text>Your PKMS development environment is ready.</Text>
      </Card>
    </Container>
  );
}

export default App;
```

### React Concepts

#### 1. **Components**
```tsx
function Welcome(props) {
  return <h1>Hello, {props.name}!</h1>;
}

// Using the component
<Welcome name="John" />
```

#### 2. **State Management**
```tsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}
```

#### 3. **API Communication**
```tsx
import { useState, useEffect } from 'react';

function NotesList() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/v1/notes/')
      .then(response => response.json())
      .then(data => {
        setNotes(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading notes...</div>;

  return (
    <div>
      {notes.map(note => (
        <div key={note.id}>
          <h3>{note.title}</h3>
          <p>{note.content}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔗 REST API Concepts

### What is REST?
REST is an architectural style for designing web services using standard HTTP methods.

### HTTP Methods

| Method | Purpose | Example |
|--------|---------|---------|
| GET | Retrieve data | `GET /api/notes` |
| POST | Create new data | `POST /api/notes` |
| PUT | Update entire resource | `PUT /api/notes/123` |
| PATCH | Update partial resource | `PATCH /api/notes/123` |
| DELETE | Remove data | `DELETE /api/notes/123` |

### RESTful URL Design

#### Good Examples:
```
GET    /api/notes          # Get all notes
GET    /api/notes/123      # Get specific note
POST   /api/notes          # Create new note
PUT    /api/notes/123      # Update note
DELETE /api/notes/123      # Delete note
```

#### Bad Examples:
```
GET    /api/getNotes
POST   /api/createNote
GET    /api/note?id=123
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Authentication required |
| 404 | Not Found | Resource doesn't exist |
| 500 | Internal Server Error | Server error |

### Example API Endpoints

```python
@app.get("/api/notes/")
async def get_notes(skip: int = 0, limit: int = 100):
    return {"notes": notes[skip:skip + limit]}

@app.get("/api/notes/{note_id}")
async def get_note(note_id: int):
    note = find_note(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return note

@app.post("/api/notes/")
async def create_note(note: NoteCreate):
    new_note = create_note_in_db(note)
    return new_note

@app.put("/api/notes/{note_id}")
async def update_note(note_id: int, note: NoteUpdate):
    updated_note = update_note_in_db(note_id, note)
    if not updated_note:
        raise HTTPException(status_code=404, detail="Note not found")
    return updated_note

@app.delete("/api/notes/{note_id}")
async def delete_note(note_id: int):
    success = delete_note_from_db(note_id)
    if not success:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"message": "Note deleted"}
```

---

## 📦 Package Dependencies Explained

### Backend Dependencies (`pkms-backend/requirements.txt`)

#### Core Framework:
```txt
fastapi>=0.104.0          # Web framework
uvicorn[standard]>=0.24.0 # ASGI server
```

#### Database:
```txt
sqlalchemy[asyncio]>=2.0.0  # ORM for database operations
alembic>=1.13.0            # Database migrations
aiosqlite>=0.19.0          # Async SQLite driver
```

#### Security:
```txt
passlib[bcrypt]>=1.7.4     # Password hashing
python-jose[cryptography]>=3.3.0  # JWT tokens
cryptography>=42.0.0       # Encryption/decryption
```

#### File Handling:
```txt
aiofiles>=23.2.0           # Async file operations
python-multipart>=0.0.6    # File upload handling
```

#### Document Processing:
```txt
PyMuPDF>=1.23.0            # PDF processing
python-docx>=1.1.0         # Word document processing
Pillow>=10.1.0             # Image processing
```

### Frontend Dependencies (`pkms-frontend/package.json`)

#### Core React:
```json
{
  "react": "^18.2.0",           // React library
  "react-dom": "^18.2.0",       // React DOM rendering
  "react-router-dom": "^6.8.0"  // Client-side routing
}
```

#### UI Framework:
```json
{
  "@mantine/core": "^7.0.0",           // UI component library
  "@mantine/hooks": "^7.0.0",          // Custom React hooks
  "@mantine/form": "^7.0.0",           // Form handling
  "@mantine/notifications": "^7.0.0",  // Toast notifications
  "@tabler/icons-react": "^2.47.0"     // Icon library
}
```

#### State Management:
```json
{
  "zustand": "^4.4.0"  // Lightweight state management
}
```

#### Specialized Libraries:
```json
{
  "@uiw/react-md-editor": "^3.6.0",  // Markdown editor
  "react-pdf": "^9.2.1",             // PDF viewer
  "date-fns": "^3.0.0",              // Date utilities
  "axios": "^1.6.0"                  // HTTP client
}
```

---

## 🔄 Development Workflow

### 1. **Starting Development**
```bash
# Start backend (Docker)
docker-compose up -d

# Start frontend (local)
cd pkms-frontend
npm run dev
```

### 2. **Making Changes**

#### Backend Changes:
1. Edit files in `pkms-backend/`
2. Docker automatically reloads (--reload flag)
3. Check logs: `docker-compose logs -f pkms-backend`

#### Frontend Changes:
1. Edit files in `pkms-frontend/src/`
2. Vite automatically reloads
3. Changes appear immediately in browser

### 3. **Testing API Endpoints**
```bash
# Test health endpoint
curl http://localhost:8000/health

# Test with data
curl -X POST http://localhost:8000/api/notes/ \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Note","content":"Hello World"}'
```

### 4. **Viewing API Documentation**
- Open: http://localhost:8000/docs
- Interactive Swagger UI
- Test endpoints directly in browser

---

## 🔒 Security Concepts ✅ IMPLEMENTED

### 1. **Authentication vs Authorization**

#### Authentication (Who are you?):
```python
@app.post("/auth/login")
async def login(username: str, password: str):
    user = verify_user(username, password)
    if user:
        token = create_jwt_token(user.id)
        return {"token": token}
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")
```

#### Authorization (What can you do?):
```python
@app.get("/api/notes/")
async def get_notes(current_user: User = Depends(get_current_user)):
    # Only authenticated users can access
    return get_user_notes(current_user.id)
```

### 2. **Password Security** ✅ IMPLEMENTED
```python
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str, salt: str) -> str:
    salted_password = password + salt
    return pwd_context.hash(salted_password)

def verify_password(plain_password: str, hashed_password: str, salt: str) -> bool:
    salted_password = plain_password + salt
    return pwd_context.verify(salted_password, hashed_password)
```

### 3. **JWT Tokens** ✅ IMPLEMENTED
```python
from jose import JWTError, jwt

SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=30)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
```

### 4. **CORS (Cross-Origin Resource Sharing)**
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🚀 Next Steps & Learning Path

### ✅ **Phase 2: Authentication & Database (COMPLETED)**

#### 1. **Database Implementation** ✅
```python
# ✅ Database models created
# ✅ SQLAlchemy async setup implemented
# ✅ Migration system ready
```

#### 2. **Authentication System** ✅
```python
# ✅ User registration/login implemented
# ✅ Password hashing with bcrypt
# ✅ Session management with JWT
# ✅ Password recovery system
```

#### 3. **Basic CRUD Operations** 🔄
```python
# Create, Read, Update, Delete for all modules
# API endpoints for each operation
# Frontend forms and lists
```

### 🔄 **Phase 3: Frontend Authentication & Core Modules (IN PROGRESS)**

#### 1. **Frontend Authentication**
```typescript
// Login/setup screens with Mantine UI
// Password recovery flow
// Session management and auto-logout
// Authentication state management with Zustand
```

#### 2. **API Integration**
```typescript
// API service layer with axios
// Authentication interceptors
// Error handling and user feedback
```

#### 3. **Core Module Implementation**
```python
# Notes module CRUD operations
# Documents module with file upload/download
# Todos module with project management
# Search functionality with SQLite FTS5
```

### Learning Resources

#### Docker:
- [Docker Official Tutorial](https://docs.docker.com/get-started/)
- [Docker Compose Tutorial](https://docs.docker.com/compose/)

#### FastAPI:
- [FastAPI Official Tutorial](https://fastapi.tiangolo.com/tutorial/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)

#### React:
- [React Official Tutorial](https://react.dev/learn)
- [React Hooks Documentation](https://react.dev/reference/react)

#### General Web Development:
- [MDN Web Docs](https://developer.mozilla.org/)
- [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)

### Practice Projects

#### Beginner:
1. **Todo App**: Basic CRUD operations
2. **Weather App**: API integration
3. **Blog System**: User authentication

#### Intermediate:
1. **E-commerce**: Complex data relationships
2. **Social Media**: Real-time features
3. **File Manager**: File upload/download

---

## 🔗 Useful Commands Reference

### Docker Commands:
```bash
docker-compose up -d          # Start services
docker-compose down           # Stop services
docker-compose logs -f        # View logs
docker-compose ps             # List containers
docker-compose restart        # Restart services
```

### Development Commands:
```bash
# Backend
cd pkms-backend
python main.py

# Frontend
cd pkms-frontend
npm run dev
npm run build
npm run preview
```

### Testing Commands:
```bash
# Backend tests
cd pkms-backend
pytest

# Frontend tests
cd pkms-frontend
npm test

# API testing
curl http://localhost:8000/health
```

---

## 🎓 Key Takeaways

### 1. **Architecture Understanding**
- Frontend (React) handles user interface
- Backend (FastAPI) handles business logic and data
- Database (SQLite) stores persistent data
- Docker provides consistent environments

### 2. **API Design**
- RESTful principles for clean API design
- HTTP methods for different operations
- Status codes for proper error handling
- JSON for data exchange

### 3. **Security Best Practices** ✅ IMPLEMENTED
- ✅ Always hash passwords (bcrypt with salt)
- ✅ Use JWT tokens for authentication
- ✅ Validate all inputs
- ✅ Implement proper CORS policies
- ✅ Session management with auto-logout
- ✅ Password recovery system

### 4. **Development Workflow**
- Use version control (Git)
- Write tests for your code
- Document your APIs
- Follow coding standards

### 5. **Learning Strategy**
- Start with small projects
- Build incrementally
- Practice regularly
- Read documentation
- Join developer communities

---

## 📞 Getting Help

### When You're Stuck:
1. **Read the error message carefully**
2. **Check the logs**: `docker-compose logs -f pkms-backend`
3. **Search online**: Stack Overflow, GitHub Issues
4. **Check documentation**: Official docs are usually the best
5. **Ask in communities**: Reddit, Discord, forums

### Common Issues:
- **Port already in use**: Change port or stop other services
- **Permission denied**: Check file permissions
- **Module not found**: Install missing dependencies
- **CORS errors**: Check CORS configuration
- **Database errors**: Check database connection and schema

---

**🎉 Congratulations! You now have a solid foundation in modern web development with Docker, FastAPI, and React. The authentication system is complete and ready for frontend integration. Keep building, keep learning, and enjoy your coding journey!** 