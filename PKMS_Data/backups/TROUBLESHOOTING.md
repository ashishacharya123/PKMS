# PKMS Backup & Restore Troubleshooting

## 🚨 Common Issues and Solutions

## Backup Issues

### Problem: "Backup creation failed"
**Symptoms:**
- Error message when creating backup
- Backup file not created
- Process hangs or times out

**Solutions:**
```bash
# 1. Check Docker is running
docker-compose ps

# 2. Check disk space
df -h  # Linux/Mac
dir C:\  # Windows

# 3. Check file permissions
ls -la PKMS_Data/backups/  # Linux/Mac
dir PKMS_Data\backups\  # Windows

# 4. Try different backup method
# Use VACUUM instead of checkpoint
# Use all_files instead of checkpoint

# 5. Check database integrity
docker-compose logs pkms-backend
```

### Problem: "Backup file is 0 bytes"
**Symptoms:**
- Backup file exists but is empty
- File size shows 0 bytes
- Restore fails with "corrupted database"

**Solutions:**
```bash
# 1. Check backup creation logs
docker-compose logs pkms-backend

# 2. Verify database is not corrupted
# Try accessing PKMS web interface

# 3. Try different backup method
# Use VACUUM method instead

# 4. Check file system permissions
# Ensure write access to backups folder

# 5. Restart Docker services
docker-compose down
docker-compose up -d
```

### Problem: "Backup file too large"
**Symptoms:**
- Backup file is unexpectedly large
- Disk space issues
- Slow backup creation

**Solutions:**
```bash
# 1. Use VACUUM method for smaller files
# VACUUM creates optimized, defragmented backup

# 2. Check for database bloat
# Large databases may need optimization

# 3. Clean up old backups
# Delete unnecessary backup files

# 4. Check for large user files
# Documents and images are stored separately
```

## Restore Issues

### Problem: "Backup file not found"
**Symptoms:**
- Error: "Backup file not found"
- Script cannot locate backup file
- File path issues

**Solutions:**
```bash
# 1. Check file exists
dir PKMS_Data\backups\your_backup_file.db  # Windows
ls -la PKMS_Data/backups/your_backup_file.db  # Linux/Mac

# 2. List all available backups
list_backups.bat  # Windows
./list_backups.sh  # Linux/Mac

# 3. Check file permissions
# Ensure file is readable

# 4. Verify file name spelling
# Copy-paste exact filename

# 5. Check file extension
# Should be .db file
```

### Problem: "Docker command failed"
**Symptoms:**
- Error: "Docker command failed"
- Restore script fails
- Docker access issues

**Solutions:**
```bash
# 1. Check Docker is running
docker --version
docker-compose --version

# 2. Check Docker daemon
docker ps

# 3. Restart Docker services
# Restart Docker Desktop (Windows/Mac)
# sudo systemctl restart docker (Linux)

# 4. Check Docker permissions
# Ensure user has Docker access

# 5. Try manual Docker commands
docker-compose down
docker-compose cp PKMS_Data/backups/backup.db pkms-backend:/app/data/pkm_metadata.db
docker-compose up -d
```

### Problem: "Database corrupted after restore"
**Symptoms:**
- PKMS won't start after restore
- Error messages about database corruption
- Cannot login to PKMS

**Solutions:**
```bash
# 1. Try different backup file
restore_db.bat older_backup_file.db

# 2. Check backup file integrity
# Verify backup file is not corrupted

# 3. Try VACUUM method backup
# VACUUM creates cleaner database

# 4. Check Docker logs
docker-compose logs pkms-backend

# 5. Verify restore process
# Check if file was copied correctly
```

### Problem: "Cannot login after restore"
**Symptoms:**
- Login fails with correct password
- User accounts not found
- Authentication errors

**Solutions:**
```bash
# 1. Check if user accounts were restored
# Try different backup file with user data

# 2. Verify password is correct
# Check if you're using the right password

# 3. Check database integrity
# Restore from different backup file

# 4. Check authentication database
# Verify auth.db was restored

# 5. Try creating new user account
# If old accounts are corrupted
```

## Migration Issues

### Problem: "Files not accessible after migration"
**Symptoms:**
- Documents not showing
- Diary content not accessible
- File upload errors

**Solutions:**
```bash
# 1. Check file permissions
ls -la PKMS_Data/assets/  # Linux/Mac
dir PKMS_Data\assets\  # Windows

# 2. Verify files were copied
# Check if all files are present

# 3. Check file ownership
# Ensure files are owned by correct user

# 4. Restart Docker services
docker-compose down
docker-compose up -d

# 5. Check Docker volume mounts
# Verify volume mappings are correct
```

### Problem: "Diary content not decrypting"
**Symptoms:**
- Diary unlock fails
- Encrypted content not accessible
- Password not working

**Solutions:**
```bash
# 1. Verify password is correct
# Check if you're using the right password

# 2. Check diary folder was copied
dir PKMS_Data\diary\  # Windows
ls -la PKMS_Data/diary/  # Linux/Mac

# 3. Check file permissions
# Ensure diary files are readable

# 4. Verify encryption key derivation
# Same password should work on any PC

# 5. Check database references
# Ensure diary entries are in database
```

## System Issues

### Problem: "Port already in use"
**Symptoms:**
- Error: "Port 3000 already in use"
- PKMS won't start
- Port conflict errors

**Solutions:**
```bash
# 1. Check what's using the port
netstat -ano | findstr :3000  # Windows
lsof -i :3000  # Linux/Mac

# 2. Stop conflicting services
# Stop other applications using port 3000

# 3. Change PKMS ports
# Edit docker-compose.yml to use different ports

# 4. Restart system
# Sometimes needed to free up ports

# 5. Check for zombie processes
# Kill any hanging processes
```

### Problem: "Insufficient disk space"
**Symptoms:**
- Backup creation fails
- Restore fails
- Disk space errors

**Solutions:**
```bash
# 1. Check disk space
df -h  # Linux/Mac
dir C:\  # Windows

# 2. Clean up old backups
# Delete unnecessary backup files

# 3. Clean up Docker images
docker system prune -a

# 4. Move data to larger drive
# If possible, move PKMS_Data to larger drive

# 5. Use external storage
# Store backups on external drive
```

### Problem: "Memory issues"
**Symptoms:**
- PKMS runs slowly
- Out of memory errors
- System becomes unresponsive

**Solutions:**
```bash
# 1. Check system memory
free -h  # Linux/Mac
# Task Manager on Windows

# 2. Increase Docker memory limits
# Edit Docker Desktop settings

# 3. Close other applications
# Free up system memory

# 4. Restart system
# Clear memory leaks

# 5. Optimize database
# Use VACUUM method backup
```

## Performance Issues

### Problem: "Slow backup creation"
**Symptoms:**
- Backup takes too long
- System becomes slow during backup
- Timeout errors

**Solutions:**
```bash
# 1. Use checkpoint method
# Fastest backup method

# 2. Close other applications
# Free up system resources

# 3. Check disk performance
# Ensure disk is not fragmented

# 4. Use SSD storage
# Faster than traditional hard drives

# 5. Schedule backups during off-hours
# When system is less busy
```

### Problem: "Slow restore process"
**Symptoms:**
- Restore takes too long
- System becomes unresponsive
- Timeout errors

**Solutions:**
```bash
# 1. Use smaller backup files
# VACUUM method creates smaller files

# 2. Close other applications
# Free up system resources

# 3. Check disk performance
# Ensure disk is not fragmented

# 4. Use SSD storage
# Faster than traditional hard drives

# 5. Restart system before restore
# Clear memory and processes
```

## Emergency Recovery

### Problem: "Complete system failure"
**Symptoms:**
- PKMS won't start
- Database completely corrupted
- All restore attempts fail

**Solutions:**
```bash
# 1. Try oldest backup file
# May be more stable

# 2. Check backup file integrity
# Verify files are not corrupted

# 3. Try manual database repair
# Use SQLite tools if available

# 4. Contact support
# Provide detailed error information

# 5. Consider fresh installation
# If all else fails, start over
```

### Problem: "Lost all backups"
**Symptoms:**
- No backup files found
- Backup folder is empty
- All backups deleted

**Solutions:**
```bash
# 1. Check other locations
# Look for backup files elsewhere

# 2. Check recycle bin
# Files may have been deleted

# 3. Use file recovery tools
# Try to recover deleted files

# 4. Check cloud storage
# If backups were uploaded

# 5. Contact support
# May have additional recovery options
```

## 📞 Getting Help

### Before Contacting Support
1. **Check this guide** for your specific issue
2. **Try suggested solutions** in order
3. **Document error messages** exactly
4. **Note your system details** (OS, Docker version, etc.)
5. **Try different backup files** if available

### Information to Provide
- **Operating system** and version
- **Docker version** and installation method
- **PKMS version** (if known)
- **Exact error messages** (copy-paste)
- **Steps you tried** and their results
- **System resources** (RAM, disk space)
- **Backup file details** (size, date, method)

### Emergency Contact
If you have critical data loss and need immediate help:
1. **Stop all operations** - don't make changes
2. **Document everything** - take screenshots
3. **Contact support immediately** - provide all details
4. **Don't delete anything** - keep all files

---

**Remember**: Most issues can be resolved by following this guide. Take your time and try solutions in order. When in doubt, contact support rather than making changes that could cause more problems.
