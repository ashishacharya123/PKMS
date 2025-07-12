# PKMS Testing & Debugging Guide

## Overview
This guide covers the comprehensive testing infrastructure for PKMS, including the enhanced frontend testing interface, backend CLI tools, and debugging strategies.

## 🎯 Enhanced Frontend Testing Interface

### Access Method
1. Log into PKMS application
2. Click on user dropdown menu (top right)
3. Select "Testing & Debug"
4. Full-screen testing modal will open

### Interface Features
- **Full-screen modal** with comprehensive testing tabs
- **Real-time logging** with timestamp tracking
- **Grouped table schemas** organized by modules
- **Detailed results** with copy/export capabilities
- **Verbose encryption testing** with step-by-step analysis

## 📋 Testing Tabs Overview

### 1. Authentication Testing Tab 🔐

#### Features
- **Comprehensive Auth Tests**: Multi-step authentication flow analysis
- **Real-time Timeline Logging**: Step-by-step authentication process tracking
- **Token Validation**: JWT structure, payload, and expiry verification
- **API Connectivity Testing**: Backend health, CORS, and endpoint verification
- **Visual Status Indicators**: Color-coded results for each component

#### Usage
1. Click "Run Comprehensive Auth Tests"
2. Monitor real-time logs in timeline format
3. Review test results summary with visual indicators
4. Copy full results for troubleshooting

#### What It Tests
- JWT token presence and validity
- Token expiry status
- Backend connectivity and health
- CORS configuration
- Authenticated endpoint accessibility
- Authentication race conditions

### 2. Database Testing Tab 🗄️

#### Features
- **Database Overview**: Size, table counts, and user information
- **Grouped Table Navigation**: Tables organized by functional modules
- **Sample Data Inspector**: Configurable row fetching (1-20 rows)
- **Complete Schema Drawer**: Detailed column information with constraints
- **Real-time Statistics**: Live table counts and database metrics

#### Table Groups
1. **Core System** (Blue) - User management and authentication
   - `users`, `sessions`, `recovery_keys`
2. **Content Modules** (Green) - Main content and task management
   - `notes`, `documents`, `todos`, `projects`
3. **Diary & Privacy** (Orange) - Encrypted diary system
   - `diary_entries`, `diary_media`
4. **Archive System** (Purple) - Hierarchical file organization
   - `archive_folders`, `archive_items`
5. **Organization** (Cyan) - Tags and cross-references
   - `tags`, `links`, `note_tags`, `document_tags`, etc.

#### Usage
1. **Load Database Stats**: Get comprehensive database overview
2. **Select Table Group**: Choose from organized categories
3. **Pick Specific Table**: Select table from group
4. **Set Row Limit**: Configure sample size (1-20 rows)
5. **Load Sample Rows**: Fetch and display sample data
6. **View All Schemas**: Open detailed schema drawer

### 3. Diary Encryption Testing Tab 🔒

#### Features
- **Password Verification**: Test diary encryption passwords
- **Verbose Logging**: Detailed step-by-step process tracking
- **Sample Entry Analysis**: Decrypt and display diary data
- **Encryption Metrics**: Blob size, IV length, tag analysis
- **Media File Verification**: Count associated media files
- **Metadata Display**: Show diary entry metadata

#### Usage
1. Enter your diary encryption password
2. Click "Test Encryption"
3. Monitor verbose logs for each step:
   - 🔍 Starting encryption test
   - 🔐 Validating password
   - ✅ Password validation successful
   - 📖 Sample entry retrieved and decrypted
   - 📅 Entry date and details
   - 🔒 Encryption details and metrics
4. Review detailed encryption information and sample entry

### 4. System Health Tab 📊

#### Features
- **Database Connectivity**: SQLite version and connection status
- **User Session Info**: Account details and session data
- **System Metrics**: Table counts and system information
- **Performance Indicators**: Response times and health checks

#### Usage
1. Click "Load System Health"
2. Review database connectivity status
3. Check user session information
4. Verify system metrics

### 5. Console Commands Tab 💻

#### Features
- **Frontend Browser Commands**: JavaScript debugging and localStorage management
- **Backend CLI Commands**: Pytest, database operations, and health checks
- **Docker Commands**: Container management and debugging
- **Copy-to-Clipboard**: One-click command copying
- **Organized Categories**: Commands grouped by purpose

#### Command Categories
1. **Frontend Browser Console**
2. **Backend CLI Testing**
3. **Docker Operations**
4. **Database Management**

## 🔧 Backend Testing Endpoints

### Authentication Required
All testing endpoints require valid JWT authentication.

### Available Endpoints

#### Database Testing
```
GET /api/v1/testing/database/stats
Response: {
  "table_counts": {"notes": 5, "documents": 3, ...},
  "database_size_bytes": 1048576,
  "database_size_mb": 1.0,
  "user_id": 1,
  "username": "admin",
  "timestamp": "2025-01-19T21:15:00Z"
}

GET /api/v1/testing/database/sample-rows?table=notes&limit=5
Response: {
  "table": "notes",
  "row_count": 5,
  "sample_rows": [...],
  "timestamp": "2025-01-19T21:15:00Z"
}

GET /api/v1/testing/database/table-schema?table=notes
Response: {
  "table": "notes",
  "column_count": 8,
  "columns": [
    {
      "column_id": 0,
      "name": "id",
      "type": "INTEGER",
      "not_null": true,
      "primary_key": true
    },
    ...
  ],
  "timestamp": "2025-01-19T21:15:00Z"
}
```

#### Diary Encryption Testing
```
POST /api/v1/testing/diary/encryption-test
Body: {
  "password": "your_diary_password"
}
Response: {
  "status": "success",
  "message": "Encryption test completed successfully",
  "encryption_test": true,
  "sample_entry": {
    "id": 1,
    "date": "2025-01-19",
    "title": "Sample Entry",
    "mood": "happy",
    "encryption_details": {
      "encrypted_blob_length": 256,
      "iv_length": 16,
      "tag_length": 16
    },
    "metadata": {}
  },
  "media_count": 2,
  "timestamp": "2025-01-19T21:15:00Z"
}
```

#### System Health
```
GET /api/v1/testing/health
Response: {
  "status": "healthy",
  "database": {"connectivity": "operational"},
  "timestamp": "2025-01-19T21:15:00Z"
}

GET /api/v1/testing/health/detailed
Response: {
  "status": "healthy",
  "database": {
    "connectivity": "operational",
    "version": "3.45.1",
    "table_count": 12
  },
  "user_session": {
    "user_id": 1,
    "username": "admin",
    "account_created": "2025-01-15T10:00:00Z"
  },
  "system_info": {
    "table_count": 12,
    "tables": ["notes", "documents", ...]
  },
  "timestamp": "2025-01-19T21:15:00Z"
}
```

## 💻 Console Commands Reference

### Frontend Browser Console Commands

#### Authentication Testing
```javascript
// Check authentication status
const authStatus = JSON.parse(localStorage.getItem('auth_user') || '{}');
console.log('Auth Status:', authStatus);

// Decode JWT token
const token = localStorage.getItem('jwt_token');
if (token) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  console.log('Token Payload:', payload);
  console.log('Expires:', new Date(payload.exp * 1000));
  console.log('Current Time:', new Date());
  console.log('Is Expired:', Date.now() > payload.exp * 1000);
}

// Test token validity
fetch('http://localhost:8000/api/v1/notes', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('jwt_token')}` }
})
.then(r => console.log('Auth Test Status:', r.status))
.catch(e => console.error('Auth Test Error:', e));
```

#### Data Management
```javascript
// View all localStorage data
console.table(Object.fromEntries(
  Object.entries(localStorage).map(([k,v]) => {
    try { return [k, JSON.parse(v)]; }
    catch { return [k, v]; }
  })
));

// Clear authentication data
['jwt_token', 'auth_user'].forEach(key => localStorage.removeItem(key));
console.log('Authentication data cleared');

// Export all data for backup
const backup = Object.fromEntries(Object.entries(localStorage));
console.log('Backup Data:', JSON.stringify(backup, null, 2));

// Clear all application data
localStorage.clear();
sessionStorage.clear();
console.log('All storage cleared');
```

#### API Testing
```javascript
// Test backend connectivity
fetch('http://localhost:8000/health')
  .then(r => r.json())
  .then(data => console.log('Backend Health:', data))
  .catch(e => console.error('Backend Error:', e));

// Test CORS configuration
fetch('http://localhost:8000/api/v1/testing/database/stats', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
    'Content-Type': 'application/json'
  }
})
.then(r => r.json())
.then(data => console.log('CORS Test:', data))
.catch(e => console.error('CORS Error:', e));
```

### Backend CLI Commands

#### Pytest Testing
```bash
# Navigate to backend directory
cd pkms-backend

# Run all tests with verbose output
python -m pytest tests/ -v

# Run tests with coverage
python -m pytest tests/ -v --cov=app --cov-report=html

# Run specific test files
python -m pytest tests/test_auth.py -v
python -m pytest tests/test_auth.py::test_race_condition_scenario -v

# Run tests with detailed output and no capture
python -m pytest tests/ -v -s --tb=long

# Generate coverage report in terminal
python -m pytest --cov=app --cov-report=term-missing

# Run tests matching pattern
python -m pytest tests/ -k "authentication" -v
python -m pytest tests/ -k "database" -v
```

#### Database Operations
```bash
# Check database file existence and size
cd pkms-backend
ls -la data/pkm_metadata.db
du -h data/pkm_metadata.db

# Database integrity check
python -c "
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    result = conn.execute(text('PRAGMA integrity_check')).fetchone()
    print('Database Integrity:', result[0])
"

# List all tables
python -c "
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    tables = conn.execute(text('SELECT name FROM sqlite_master WHERE type=\"table\"')).fetchall()
    print('Tables:', [t[0] for t in tables])
"

# Get table row counts
python -c "
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    tables = ['notes', 'documents', 'todos', 'diary_entries', 'users']
    for table in tables:
        try:
            count = conn.execute(text(f'SELECT COUNT(*) FROM {table}')).scalar()
            print(f'{table}: {count} rows')
        except Exception as e:
            print(f'{table}: Error - {e}')
"

# Database vacuum and optimization
python -c "
from app.database import engine
from sqlalchemy import text
with engine.connect() as conn:
    conn.execute(text('VACUUM'))
    conn.execute(text('ANALYZE'))
    print('Database vacuumed and analyzed')
"
```

#### Health Checks
```bash
# Backend health check
curl -X GET http://localhost:8000/health

# Testing endpoint health
curl -X GET http://localhost:8000/api/v1/testing/health

# Authentication test with login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Database stats (requires valid JWT token)
curl -X GET http://localhost:8000/api/v1/testing/database/stats \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"

# Test diary encryption (requires auth)
curl -X POST http://localhost:8000/api/v1/testing/diary/encryption-test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"password":"your_diary_password"}'
```

#### Advanced Testing Script
```bash
# Run comprehensive testing script
cd pkms-backend
python scripts/test_runner.py

# Run with specific options
python scripts/test_runner.py --verbose --auth-only

# Generate detailed report
python scripts/test_runner.py --generate-report --output-file test_results.json
```

### Docker Debugging Commands

#### Container Management
```bash
# View running containers
docker-compose ps

# Check container logs
docker-compose logs pkms-backend
docker-compose logs pkms-frontend
docker-compose logs --tail=50 pkms-backend

# Interactive container access
docker-compose exec pkms-backend bash
docker-compose exec pkms-frontend sh

# Restart specific services
docker-compose restart pkms-backend
docker-compose restart pkms-frontend

# Rebuild and restart
docker-compose down
docker-compose up --build -d
```

#### Database Access
```bash
# Access SQLite database directly
docker-compose exec pkms-backend sqlite3 data/pkm_metadata.db

# SQLite commands inside container
docker-compose exec pkms-backend sqlite3 data/pkm_metadata.db ".tables"
docker-compose exec pkms-backend sqlite3 data/pkm_metadata.db ".schema notes"
docker-compose exec pkms-backend sqlite3 data/pkm_metadata.db "SELECT COUNT(*) FROM notes;"
```

#### Network and Performance
```bash
# Check container resource usage
docker stats pkms-backend pkms-frontend

# Test network connectivity between containers
docker-compose exec pkms-frontend ping pkms-backend
docker-compose exec pkms-frontend wget -qO- http://pkms-backend:8000/health

# Port verification
netstat -tulpn | grep :8000  # Backend port
netstat -tulpn | grep :3000  # Frontend port

# Container inspection
docker inspect pkms-backend
docker inspect pkms-frontend
```

## 🔍 Troubleshooting Scenarios

### Authentication Issues

#### Problem: 403 Forbidden Errors
**Symptoms**: API calls return 403 status, user appears logged in
**Solution Steps**:
1. Open Testing Interface → Authentication Tab
2. Run comprehensive auth tests
3. Check token validity and expiry in logs
4. If token expired, re-login
5. If race condition detected, check AuthGuard implementation

#### Problem: Race Condition in Authentication
**Symptoms**: Intermittent authentication failures, empty API responses
**Solution Steps**:
1. Check authentication logs for race condition warnings
2. Verify AuthGuard waits for authentication completion
3. Test with authentication race condition scenarios in backend tests

### Database Issues

#### Problem: Database Connection Errors
**Symptoms**: Cannot connect to database, SQLite errors
**Solution Steps**:
1. Check database file existence: `ls -la pkms-backend/data/pkm_metadata.db`
2. Verify file permissions
3. Run database integrity check
4. Check container volume mounts

#### Problem: Schema Mismatches
**Symptoms**: Column not found errors, model mismatches
**Solution Steps**:
1. Use Testing Interface → Database Tab → View All Schemas
2. Compare with model definitions
3. Run database migrations if needed
4. Check for missing foreign key constraints

### Diary Encryption Issues

#### Problem: Cannot Decrypt Diary Entries
**Symptoms**: Encryption test fails, password errors
**Solution Steps**:
1. Use Testing Interface → Diary Encryption Tab
2. Test with known diary password
3. Check encryption logs for specific failure points
4. Verify encryption key storage and retrieval

### Performance Issues

#### Problem: Slow API Responses
**Symptoms**: Long loading times, timeout errors
**Solution Steps**:
1. Check System Health tab for performance metrics
2. Monitor Docker container resource usage
3. Run database vacuum and analyze
4. Check network connectivity between containers

## 📊 Testing Best Practices

### Pre-Testing Checklist
- [ ] Docker containers running (`docker-compose ps`)
- [ ] Backend health check passes (`curl http://localhost:8000/health`)
- [ ] Authentication status verified
- [ ] Database connectivity confirmed

### Regular Testing Routine
1. **Daily**: Quick authentication and health checks
2. **Weekly**: Full database schema verification
3. **After Changes**: Comprehensive testing suite
4. **Before Deployment**: All test categories with coverage

### Emergency Debugging
1. **Immediate**: Check Testing Interface for quick diagnosis
2. **System State**: Export logs and test results
3. **Data Backup**: Export localStorage and database
4. **Reset**: Clear data and restart containers if needed

## 🚀 Performance Monitoring

### Frontend Performance
- Monitor authentication race conditions
- Check localStorage usage and cleanup
- Verify API request patterns
- Test component rendering performance

### Backend Performance
- Database query optimization
- Connection pooling efficiency
- Memory usage monitoring
- Response time analysis

### System-wide Health
- Container resource usage
- Network latency between services
- Database file size growth
- Error rate tracking

This comprehensive testing infrastructure ensures robust application development and provides detailed debugging capabilities for both development and production troubleshooting. 

# 🆕 Enhanced Testing Features (Latest Updates)

## 🔐 Token Remaining Time Display

### What It Does
Shows exact seconds remaining until JWT token expires in the Authentication tab.

### How to Use
1. Go to Testing Interface → Authentication Tab
2. Run "Run Comprehensive Auth Tests"
3. Look for blue text showing "1234s remaining" below token status
4. Automatically calculated from JWT token expiry

### Technical Details
- Parses JWT token expiry from payload
- Calculates difference from current time
- Updates in real-time during testing
- Displayed as "XXXs remaining" in blue color

## 📊 Individual Table Sizes Feature

### What It Does
Shows both row counts and storage sizes for each database table.

### How to Use
1. Go to Testing Interface → Database Tab
2. Click "Load Database Stats"
3. View enhanced table list with both:
   - Blue badge: Row count (e.g., "156 rows")
   - Green badge: Storage size (e.g., "2.3 MB")

### Technical Implementation
- Uses SQLite `PRAGMA page_count` and `PRAGMA page_size`
- Calculates accurate storage usage per table
- Shows both bytes and MB for easy reading
- Updates in real-time when loading stats

### Example Display
```
notes: [156 rows] [2.3 MB]
documents: [45 rows] [15.7 MB]
diary_entries: [28 rows] [1.1 MB]
```

## 🗂️ 37 Tables Explanation Feature

### What It Does
Explains why your PKMS database has 37 tables and categorizes them for easy understanding.

### How to Access
1. Go to Testing Interface → Database Tab
2. Click "Explain 37 Tables" button
3. Modal opens with complete breakdown

### Table Categories Explained

#### 1. Application Data Tables (~17 tables)
**Your actual data** - These store your content and settings
- `users` - User accounts and authentication
- `notes` - Your notes and content
- `documents` - Uploaded files and attachments
- `todos` - Tasks and projects
- `diary_entries` - Encrypted diary entries
- `archive_folders` - Archive organization
- `tags` - Content organization tags
- And more...

#### 2. Full-Text Search (FTS5) Tables (~20 tables)
**SQLite search indexes** - Automatically created for fast searching
- For each searchable table, SQLite creates 5+ internal tables
- Examples: `notes_fts`, `notes_fts_data`, `notes_fts_idx`, etc.
- These enable lightning-fast text search across your content
- Managed automatically by SQLite

#### 3. SQLite System Tables (~3 tables)
**Database system tables** - Internal SQLite management
- `sqlite_master` - Database schema information
- `sqlite_sequence` - Auto-increment counters
- Internal SQLite housekeeping tables

### Why So Many Tables?
The 37 tables exist because:
1. **Application needs** (17 tables for your actual data)
2. **Search performance** (20 FTS5 tables for fast searching)
3. **System management** (3 SQLite system tables)

This is normal and indicates a well-structured database with powerful search capabilities!

## 🚀 Advanced Testing Features

### 6️⃣ New Advanced Tab
The Advanced tab provides enterprise-level testing and monitoring capabilities:

## A. Performance Monitoring 📈

### What It Tests
- Database query performance
- SQLite configuration optimization
- System response times
- Performance scoring and recommendations

### How to Use
1. Go to Testing Interface → Advanced Tab
2. Click "Run Performance Tests"
3. Review detailed performance analysis:

### Performance Metrics Analyzed
- **Simple Query Timing**: Basic COUNT queries across tables
- **Complex Query Timing**: JOIN operations and aggregations
- **Database Configuration**: PRAGMA settings analysis
- **Performance Score**: Overall system rating (Good/Slow/Critical)

### Example Results
```
Performance Test Results:
✅ Simple Query Performance: 0.003s (GOOD)
⚠️  Complex Query Performance: 0.156s (SLOW)
✅ Database Configuration: Optimized
🎯 Overall Score: 85/100 (GOOD)

Recommendations:
- Consider adding index on frequently queried columns
- Current cache size is optimal
- Journal mode (WAL) is properly configured
```

### What Each Metric Means
- **Simple Queries**: Basic operations like COUNT(*)
- **Complex Queries**: JOINs between multiple tables
- **Cache Size**: SQLite memory cache configuration
- **Journal Mode**: Database transaction handling method

## B. Data Integrity Validation 🔍

### What It Tests
- Foreign key relationships
- Date field consistency
- Required field validation
- Database corruption checks

### How to Use
1. Go to Testing Interface → Advanced Tab
2. Click "Run Data Integrity Tests"
3. Review comprehensive validation results

### Validation Categories

#### 1. Foreign Key Integrity
**Tests**: Orphaned records and broken relationships
```
Foreign Key Validation:
✅ notes → users: All references valid
✅ diary_entries → users: All references valid
✅ documents → users: All references valid
```

#### 2. Date Consistency
**Tests**: Logical date field validation
```
Date Consistency Check:
✅ Created dates before updated dates
✅ No future timestamps beyond reasonable limits
✅ Date format consistency across tables
```

#### 3. Required Fields
**Tests**: Critical fields properly populated
```
Required Field Validation:
✅ All users have usernames
✅ All notes have titles or content
✅ All timestamps properly set
```

#### 4. SQLite Integrity
**Tests**: Database file corruption
```
SQLite Integrity Check:
✅ Database structure integrity: OK
✅ No page corruption detected
✅ Index consistency validated
```

### Result Interpretation
- **✅ PASS**: No issues found
- **⚠️ WARNING**: Minor issues that don't affect functionality
- **❌ CRITICAL**: Issues requiring immediate attention

## C. Resource Monitoring 💻

### What It Monitors
- Process memory usage (RSS, VMS)
- CPU utilization and thread count
- System resources (total/available memory)
- Database connection statistics

### How to Use
1. Go to Testing Interface → Advanced Tab
2. Click "Run Resource Monitoring"
3. Review real-time system metrics

### Metrics Explained

#### Process Memory
- **RSS (Resident Set Size)**: Physical memory currently used
- **VMS (Virtual Memory Size)**: Total virtual memory used
- **Memory %**: Percentage of system memory used

#### CPU Usage
- **CPU %**: Current CPU usage percentage
- **Threads**: Number of active threads
- **Process ID**: System process identifier

#### System Resources
- **Total Memory**: Total system RAM
- **Available Memory**: Currently available RAM
- **Memory Usage %**: System-wide memory utilization
- **CPU Cores**: Number of processor cores

### Example Results
```
Resource Monitoring Results:

Process Memory:
  RSS: 45.2 MB (Physical memory)
  VMS: 178.3 MB (Virtual memory)
  Memory %: 2.1% of system

CPU Usage:
  CPU %: 0.8%
  Threads: 12
  Process ID: 1234

System Resources:
  Total Memory: 16.0 GB
  Available: 12.3 GB (77%)
  CPU Cores: 8

Database Statistics:
  Active Connections: 1
  Cache Hit Ratio: 94.2%

Recommendations:
✅ Memory usage is optimal
✅ CPU usage is low
✅ System resources available
```

### When to Be Concerned
- **Memory %** > 50%: Consider memory optimization
- **CPU %** > 80%: Investigate performance bottlenecks
- **Available Memory** < 20%: System may be under stress

## D. All Tables Analysis 📋

### What It Shows
Complete breakdown of all 37 database tables with categorization and explanations.

### How to Use
1. Go to Testing Interface → Advanced Tab
2. Click "Analyze All Tables"
3. View comprehensive table breakdown

### Analysis Features

#### Complete Table Discovery
- **Application Tables**: Your actual data (users, notes, etc.)
- **FTS5 Search Tables**: Full-text search indexes
- **System Tables**: SQLite internal management

#### Visual Statistics
```
Database Table Analysis:

Application Data: 17 tables
├── Core System (3): users, sessions, recovery_keys
├── Content (8): notes, documents, todos, projects, tags, etc.
├── Diary (3): diary_entries, diary_media, diary_settings
└── Archive (3): archive_folders, archive_items, archive_tags

Full-Text Search (FTS5): 20 tables
├── notes_fts (5 tables): Main search + 4 internal
├── documents_fts (5 tables): Document search + 4 internal
├── diary_fts (5 tables): Diary search + 4 internal
└── archive_fts (5 tables): Archive search + 4 internal

SQLite System: 3 tables
├── sqlite_master: Schema information
├── sqlite_sequence: Auto-increment tracking
└── Internal housekeeping tables
```

#### Educational Information
- **Why FTS5 creates multiple tables**: Search optimization
- **Purpose of each table category**: Functional explanation
- **Normal vs concerning table counts**: What's expected

## 🔧 Using Advanced Features Together

### Comprehensive System Analysis
1. **Start with Performance**: Check if system is running optimally
2. **Validate Data Integrity**: Ensure data consistency
3. **Monitor Resources**: Check system health
4. **Analyze Table Structure**: Understand database organization

### Troubleshooting Workflow
1. **Performance Issues**: Run Performance Monitoring → Check recommendations
2. **Data Problems**: Run Data Integrity → Fix any CRITICAL issues
3. **System Slowness**: Check Resource Monitoring → Identify bottlenecks
4. **Database Questions**: Use All Tables Analysis → Understand structure

### Regular Health Checks
- **Daily**: Quick performance and resource monitoring
- **Weekly**: Full data integrity validation
- **Monthly**: Complete table analysis and cleanup
- **After Updates**: Comprehensive validation of all systems

## 📊 API Endpoints for Advanced Features

### Performance Testing
```bash
GET /api/v1/testing/performance/database-metrics
Authorization: Bearer YOUR_TOKEN

Response:
{
  "simple_query_time": 0.003,
  "complex_query_time": 0.156,
  "database_config": {
    "cache_size": 2000,
    "journal_mode": "WAL",
    "synchronous": "NORMAL"
  },
  "performance_score": 85,
  "recommendations": [
    "Query performance is good",
    "Consider index optimization for complex queries"
  ]
}
```

### Data Integrity Validation
```bash
GET /api/v1/testing/validation/data-integrity
Authorization: Bearer YOUR_TOKEN

Response:
{
  "foreign_key_integrity": {
    "status": "pass",
    "details": "All foreign key relationships valid"
  },
  "date_consistency": {
    "status": "pass", 
    "details": "All dates logically consistent"
  },
  "required_fields": {
    "status": "warning",
    "details": "3 notes missing titles"
  },
  "sqlite_integrity": {
    "status": "pass",
    "details": "ok"
  }
}
```

### Resource Monitoring
```bash
GET /api/v1/testing/monitoring/resource-usage
Authorization: Bearer YOUR_TOKEN

Response:
{
  "process_memory": {
    "rss_mb": 45.2,
    "vms_mb": 178.3,
    "memory_percent": 2.1
  },
  "cpu_usage": {
    "cpu_percent": 0.8,
    "num_threads": 12
  },
  "system_resources": {
    "total_memory_gb": 16.0,
    "available_memory_gb": 12.3,
    "cpu_cores": 8
  },
  "recommendations": [
    "Memory usage optimal",
    "CPU usage low", 
    "System resources available"
  ]
}
```

### All Tables Analysis
```bash
GET /api/v1/testing/database/all-tables
Authorization: Bearer YOUR_TOKEN

Response:
{
  "total_tables": 37,
  "categories": {
    "application_data": {
      "count": 17,
      "tables": ["users", "notes", "documents", ...]
    },
    "fts5_search": {
      "count": 20, 
      "tables": ["notes_fts", "notes_fts_data", ...]
    },
    "sqlite_system": {
      "count": 3,
      "tables": ["sqlite_master", "sqlite_sequence", ...]
    }
  },
  "explanation": "Complete table breakdown with categories"
}
```

## 🎯 Best Practices for Enhanced Testing

### Development Workflow
1. **Before coding**: Check current performance baseline
2. **During development**: Monitor resource usage
3. **After changes**: Validate data integrity
4. **Before deployment**: Full comprehensive testing

### Performance Optimization
- Use performance monitoring to identify bottlenecks
- Follow recommendations for database optimization
- Monitor resource usage during development
- Regular table analysis for understanding growth

### Data Quality Maintenance
- Weekly data integrity validation
- Address WARNING level issues proactively
- Monitor foreign key relationships
- Validate date consistency after bulk operations

This enhanced testing infrastructure provides enterprise-level monitoring and validation capabilities, ensuring your PKMS system runs optimally and maintains data integrity across all operations. 