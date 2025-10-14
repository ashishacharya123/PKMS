# PKMS Restore Guide - Step by Step

## 🚨 Before You Start

### ⚠️ Important Warnings
- **Restore REPLACES current database** - all current data will be lost
- **Backup current state** - create a backup before restoring if possible
- **Stop active users** - ensure no one is using PKMS during restore
- **Verify backup file** - make sure your backup file is valid and complete

### 📋 Prerequisites
- ✅ **Docker installed** and running
- ✅ **Backup file exists** in `PKMS_Data/backups/` folder
- ✅ **Administrator access** (for Windows scripts)
- ✅ **PKMS stopped** (Docker containers down)

## 🔄 Restore Methods

## Method 1: Web Interface (Inside App) - Recommended for Regular Use

### When to Use
- ✅ You can login to PKMS
- ✅ You want a user-friendly interface
- ✅ You need to see backup details before restoring

### Steps
1. **Start PKMS** (if not already running)
   ```bash
   docker-compose up -d
   ```

2. **Login to PKMS**
   - Open browser to `http://localhost:3000`
   - Login with your credentials

3. **Navigate to Backup & Restore**
   - Go to **Settings** → **Backup & Restore**
   - Or go directly to backup section

4. **Select Backup to Restore**
   - View list of available backups
   - Check backup details (size, date, method)
   - Select the backup you want to restore

5. **Confirm Restore**
   - Read the warning message carefully
   - Check the confirmation box
   - Click **Restore**

6. **Wait for Completion**
   - Restore process will show progress
   - Wait for success message
   - Refresh the page if needed

7. **Verify Restore**
   - Check your data is restored correctly
   - Test login with your credentials
   - Verify diary content (if applicable)

## Method 2: Command Line Scripts (Outside App) - Recommended for Emergency

### When to Use
- ❌ You cannot login to PKMS
- ❌ Web interface is not accessible
- ✅ You need emergency recovery
- ✅ You're migrating to new PC

### Windows Users

#### Option A: Interactive Restore (Recommended)
```bash
# Navigate to backups folder
cd PKMS_Data\backups

# Run interactive restore script
restore_db.bat
```

The script will:
1. **List all available backups**
2. **Ask you to select one**
3. **Show backup details**
4. **Ask for confirmation**
5. **Stop Docker services**
6. **Restore the database**
7. **Start Docker services**
8. **Report success/failure**

#### Option B: Direct Restore
```bash
# Specify backup file directly
restore_db.bat pkm_metadata_backup_20250109_123456.db
```

### Linux/Mac Users
```bash
# Navigate to backups folder
cd PKMS_Data/backups

# Run restore script
./restore_db.sh
```

## Method 3: Manual Docker Commands

### When to Use
- ❌ Scripts don't work
- ✅ You're comfortable with Docker commands
- ✅ You need more control over the process

### Steps
1. **Stop Docker services**
   ```bash
   docker-compose down
   ```

2. **Copy backup to container**
   ```bash
   # Windows
   docker-compose cp PKMS_Data/backups/your_backup.db pkms-backend:/app/data/pkm_metadata.db
   
   # Linux/Mac
   docker-compose cp PKMS_Data/backups/your_backup.db pkms-backend:/app/data/pkm_metadata.db
   ```

3. **Start Docker services**
   ```bash
   docker-compose up -d
   ```

4. **Verify restore**
   - Check if PKMS is accessible
   - Login and verify data

## 📋 Step-by-Step Restore Process

### Step 1: Preparation
```bash
# 1. List available backups
list_backups.bat

# 2. Check backup file details
dir PKMS_Data\backups\*.db

# 3. Stop PKMS (if running)
docker-compose down
```

### Step 2: Select Backup
- **Check backup date** - choose most recent or specific date
- **Check backup size** - should be reasonable (not 0 bytes)
- **Check backup method** - checkpoint is most reliable
- **Verify backup integrity** - file should not be corrupted

### Step 3: Execute Restore
```bash
# Interactive restore (recommended)
restore_db.bat

# Or direct restore
restore_db.bat your_backup_file.db
```

### Step 4: Verification
```bash
# 1. Start PKMS
docker-compose up -d

# 2. Wait for startup (30-60 seconds)
# Check logs: docker-compose logs -f

# 3. Open browser to http://localhost:3000

# 4. Login with your credentials

# 5. Verify data:
#    - Check notes, documents, todos
#    - Test diary unlock (if applicable)
#    - Verify project structures
#    - Check user accounts
```

## 🔍 Troubleshooting Restore Issues

### Problem: "Backup file not found"
**Solution:**
```bash
# Check if file exists
dir PKMS_Data\backups\your_backup_file.db

# List all backups
list_backups.bat

# Check file permissions
```

### Problem: "Docker command failed"
**Solution:**
```bash
# Check Docker is running
docker --version
docker-compose --version

# Check Docker daemon
docker ps

# Restart Docker if needed
```

### Problem: "Permission denied"
**Solution:**
```bash
# Run as Administrator (Windows)
# Right-click Command Prompt → "Run as administrator"

# Check file permissions (Linux/Mac)
ls -la PKMS_Data/backups/
chmod +x restore_db.sh
```

### Problem: "Database corrupted after restore"
**Solution:**
```bash
# Try different backup file
restore_db.bat older_backup_file.db

# Check backup file integrity
# Try VACUUM method backup if available

# Contact support with error details
```

### Problem: "Cannot login after restore"
**Solution:**
```bash
# Check if user accounts were restored
# Try different backup file with user data

# Check if password is correct
# Verify backup includes user accounts
```

## ✅ Post-Restore Checklist

### Data Verification
- [ ] **User accounts** - can login with existing credentials
- [ ] **Notes** - all notes are present and accessible
- [ ] **Documents** - document list shows correctly
- [ ] **Todos** - todo items and projects are restored
- [ ] **Diary** - can unlock diary with same password
- [ ] **Projects** - project structures are intact
- [ ] **Tags** - tags are working correctly
- [ ] **Search** - search functionality works

### System Verification
- [ ] **PKMS starts** without errors
- [ ] **Web interface** loads correctly
- [ ] **Database connections** work
- [ ] **File uploads** work (if applicable)
- [ ] **Backup system** still functions

### Performance Check
- [ ] **Response times** are reasonable
- [ ] **Search speed** is acceptable
- [ ] **No error messages** in logs
- [ ] **Memory usage** is normal

## 🚨 Emergency Recovery

### If Everything Fails
1. **Try different backup file**
2. **Check backup file integrity**
3. **Verify Docker installation**
4. **Check system resources**
5. **Contact support** with error details

### Recovery Commands
```bash
# Check Docker status
docker-compose ps

# Check logs
docker-compose logs pkms-backend

# Check backup files
dir PKMS_Data\backups\*.db

# Manual database copy
docker-compose cp PKMS_Data/backups/backup.db pkms-backend:/app/data/pkm_metadata.db
```

## 📞 Getting Help

### Before Contacting Support
1. **Check this guide** for common solutions
2. **Try different backup files**
3. **Verify Docker is working**
4. **Check system resources**
5. **Document error messages**

### Information to Provide
- **Operating system** (Windows/Linux/Mac)
- **Docker version**
- **Backup file name and size**
- **Error messages** (exact text)
- **Steps you tried**
- **PKMS version** (if known)

---

**Remember**: Always test your restore process before you need it! Regular restore testing ensures your backups work when you need them most.
