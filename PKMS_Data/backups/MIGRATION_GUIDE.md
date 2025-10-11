# PKMS Migration Guide - Moving to New PC

## 🎯 Overview

This guide covers migrating your PKMS installation from one computer to another, including all your data, encrypted diary content, and user accounts.

## 📋 What Gets Migrated

### ✅ Database Content (via Backup/Restore)
- **User accounts and authentication**
- **Notes, documents, todos**
- **Project structures and tags**
- **Search indexes**
- **Application settings**

### ✅ User Files (via Folder Copy)
- **Documents and images** (`PKMS_Data/assets/`)
- **Encrypted diary content** (`PKMS_Data/diary/`)
- **Diary media files** (`PKMS_Data/diary_media/`)
- **Archive data** (`PKMS_Data/archive/`)
- **Export files** (`PKMS_Data/exports/`)

### ✅ Configuration
- **Backup files** (`PKMS_Data/backups/`)
- **Docker configuration** (if using Docker)

## 🔄 Migration Methods

## Method 1: Complete Folder Migration (Recommended)

### When to Use
- ✅ **Same operating system** (Windows to Windows)
- ✅ **Same Docker setup**
- ✅ **Complete migration** - everything in one go

### Steps

#### On Old PC
1. **Create final backup**
   ```bash
   # Using web interface
   # Go to Settings → Backup & Restore → Create Backup
   
   # Or using command line
   cd PKMS_Data\backups
   create_backup.bat
   ```

2. **Stop PKMS**
   ```bash
   docker-compose down
   ```

3. **Copy entire PKMS_Data folder**
   ```bash
   # Windows
   xcopy PKMS_Data C:\Backup\PKMS_Data /E /I /H /Y
   
   # Or use file explorer to copy the folder
   ```

4. **Transfer to new PC**
   - **USB drive**: Copy folder to USB, then to new PC
   - **Network**: Share folder over network
   - **Cloud**: Upload to cloud storage (be careful with sensitive data)

#### On New PC
1. **Install prerequisites**
   ```bash
   # Install Docker Desktop
   # Download PKMS source code
   # Install Git (if needed)
   ```

2. **Restore PKMS_Data folder**
   ```bash
   # Copy from backup location to new PC
   # Place in same location as old PC
   ```

3. **Start PKMS**
   ```bash
   docker-compose up -d
   ```

4. **Verify migration**
   - Open browser to `http://localhost:3000`
   - Login with your existing credentials
   - Check all your data is present
   - Test diary unlock with same password

## Method 2: Database + Files Migration

### When to Use
- ✅ **Different operating system** (Windows to Linux)
- ✅ **Different Docker setup**
- ✅ **Selective migration** - only specific data

### Steps

#### On Old PC
1. **Create database backup**
   ```bash
   cd PKMS_Data\backups
   create_backup.bat
   ```

2. **Copy user files**
   ```bash
   # Copy specific folders you need
   xcopy PKMS_Data\assets C:\Backup\assets /E /I /H /Y
   xcopy PKMS_Data\diary C:\Backup\diary /E /I /H /Y
   xcopy PKMS_Data\diary_media C:\Backup\diary_media /E /I /H /Y
   ```

3. **Transfer files to new PC**

#### On New PC
1. **Install PKMS** (fresh installation)
   ```bash
   # Follow normal installation process
   git clone <pkms-repo>
   cd PKMS
   docker-compose up -d
   ```

2. **Restore database**
   ```bash
   cd PKMS_Data\backups
   restore_db.bat your_backup_file.db
   ```

3. **Restore user files**
   ```bash
   # Copy files to new PKMS_Data folder
   cp -r /backup/assets PKMS_Data/
   cp -r /backup/diary PKMS_Data/
   cp -r /backup/diary_media PKMS_Data/
   ```

4. **Verify migration**

## Method 3: Cloud Migration

### When to Use
- ✅ **Remote migration** - different locations
- ✅ **Backup to cloud** - additional safety
- ⚠️ **Security consideration** - encrypted data only

### Steps

#### On Old PC
1. **Create encrypted backup**
   ```bash
   # Create backup
   create_backup.bat
   
   # Compress and encrypt (optional)
   # Use 7-Zip or similar with password protection
   ```

2. **Upload to cloud**
   - **Google Drive, Dropbox, OneDrive**
   - **Use strong password** for compressed file
   - **Consider encryption** for sensitive data

#### On New PC
1. **Download from cloud**
2. **Extract files** (if compressed)
3. **Follow Method 1 or 2** above

## 🔐 Security Considerations

### Encrypted Diary Content
- **Password-based encryption** - only you can decrypt
- **Same password = same decryption** - works on any PC
- **No keys stored in files** - only derived from password
- **Safe to transfer** - encrypted data is secure

### User Accounts
- **Password hashes** - stored in database
- **Same passwords work** - on new PC
- **Session tokens** - will be regenerated
- **No sensitive data** - in plain text

### Backup Files
- **Database backups** - contain user data
- **Store securely** - if keeping long-term
- **Consider encryption** - for cloud storage
- **Delete after migration** - if no longer needed

## 🛠️ Troubleshooting Migration

### Problem: "Cannot login after migration"
**Solutions:**
```bash
# 1. Check if user accounts were restored
# Try different backup file

# 2. Verify password is correct
# Check if you're using the right password

# 3. Check database integrity
# Restore from different backup file
```

### Problem: "Diary content not accessible"
**Solutions:**
```bash
# 1. Check diary folder was copied
dir PKMS_Data\diary

# 2. Verify file permissions
# Ensure files are readable

# 3. Check encryption key derivation
# Same password should work
```

### Problem: "Documents not showing"
**Solutions:**
```bash
# 1. Check assets folder was copied
dir PKMS_Data\assets

# 2. Verify file permissions
# Ensure files are accessible

# 3. Check database references
# Restore database backup
```

### Problem: "Docker issues on new PC"
**Solutions:**
```bash
# 1. Check Docker installation
docker --version
docker-compose --version

# 2. Check system requirements
# Ensure sufficient RAM and disk space

# 3. Check port conflicts
# Ensure ports 3000 and 8000 are free
```

## 📋 Migration Checklist

### Before Migration
- [ ] **Create final backup** of database
- [ ] **Stop PKMS** on old PC
- [ ] **Copy PKMS_Data folder** to backup location
- [ ] **Verify backup integrity** - check file sizes
- [ ] **Note your passwords** - especially diary password
- [ ] **Document any custom settings**

### During Migration
- [ ] **Install prerequisites** on new PC
- [ ] **Copy PKMS_Data folder** to new location
- [ ] **Start PKMS** on new PC
- [ ] **Wait for startup** (30-60 seconds)

### After Migration
- [ ] **Test login** with existing credentials
- [ ] **Verify notes and documents** are present
- [ ] **Test diary unlock** with same password
- [ ] **Check todos and projects** are intact
- [ ] **Test search functionality**
- [ ] **Verify file uploads** work
- [ ] **Check backup system** still functions

### Cleanup (Optional)
- [ ] **Delete old installation** (if no longer needed)
- [ ] **Clean up backup files** (if no longer needed)
- [ ] **Update bookmarks** to new PC
- [ ] **Test restore process** on new PC

## 🚀 Performance Optimization

### After Migration
1. **Create new backup** - establish backup routine on new PC
2. **Test restore process** - ensure backups work
3. **Optimize database** - run VACUUM method backup
4. **Check system resources** - ensure adequate RAM/disk space
5. **Update configurations** - adjust settings for new PC

### New PC Setup
```bash
# 1. Create optimized backup
create_backup.bat vacuum

# 2. Test restore process
restore_db.bat your_new_backup.db

# 3. Set up regular backups
# Schedule daily/weekly backups

# 4. Monitor performance
# Check response times and resource usage
```

## 📞 Getting Help

### If Migration Fails
1. **Check this guide** for common solutions
2. **Verify all files** were copied correctly
3. **Try different backup file** if available
4. **Check system requirements** on new PC
5. **Contact support** with detailed error information

### Information to Provide
- **Source and target operating systems**
- **Migration method used**
- **Error messages** (exact text)
- **File sizes** of copied data
- **Docker versions** on both PCs
- **Steps you followed**

---

**Remember**: Test your migration process before you need it! Practice migrations ensure smooth transitions when you actually need to move.
