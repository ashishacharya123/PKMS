# PKMS Backup & Restore Documentation

## 📁 Overview

This folder contains all backup files and restore utilities for the PKMS (Personal Knowledge Management System). The backup system provides multiple methods to create and restore database backups, ensuring your data is always safe.

## 🗂️ Folder Structure

```text
PKMS_Data/backups/
├── README.md                           # This documentation
├── BACKUP_METHODS.md                   # Detailed backup methods
├── RESTORE_GUIDE.md                    # Step-by-step restore guide
├── MIGRATION_GUIDE.md                  # PC migration instructions
├── TROUBLESHOOTING.md                  # Common issues and solutions
├── restore_db.bat                      # Windows restore script
├── restore_db.sh                       # Linux/Mac restore script
├── list_backups.bat                    # List available backups
├── create_backup.bat                   # Create backup script
└── *.db                               # Backup database files
```

## 🚀 Quick Start

### Create a Backup
```bash
# Using the web interface (recommended)
# Go to Settings → Backup & Restore → Create Backup

# Or using command line
create_backup.bat
```

### List Available Backups
```bash
list_backups.bat
```

### Restore from Backup
```bash
# Interactive restore (recommended)
restore_db.bat

# Or specify backup file directly
restore_db.bat pkm_metadata_backup_20250109_123456.db
```

## 📋 Backup Methods

### 1. Checkpoint Method (Recommended)
- **What it does**: Checkpoints WAL (Write-Ahead Log) then backs up main database
- **Advantages**: Guarantees all recent changes are included
- **Use case**: Regular backups, before major changes

### 2. VACUUM Method
- **What it does**: Creates optimized, defragmented database copy
- **Advantages**: Smaller file size, better performance
- **Use case**: Periodic optimization, before migration

### 3. All Files Method
- **What it does**: Backs up main DB + WAL + SHM files
- **Advantages**: Complete snapshot including active transactions
- **Use case**: Emergency backups, system migration

## 🔄 Restore Options

### Option 1: Web Interface (Inside App)
- **Requirements**: Must be able to login to PKMS
- **Steps**: Settings → Backup & Restore → Select Backup → Restore
- **Best for**: Regular restore operations

### Option 2: Command Line Scripts (Outside App)
- **Requirements**: Docker access, backup file available
- **Steps**: Run `restore_db.bat` and follow prompts
- **Best for**: Emergency recovery, migration, when login fails

## 🛡️ Data Safety

### What's Backed Up
- ✅ **User accounts and authentication**
- ✅ **Notes, documents, todos**
- ✅ **Project structures and tags**
- ✅ **Search indexes**
- ✅ **Application settings**

### What's NOT Backed Up (Stored Separately)
- 📁 **Documents and files** (stored in `PKMS_Data/assets/`)
- 🔐 **Encrypted diary content** (stored in `PKMS_Data/diary/`)
- 🖼️ **Diary media files** (stored in `PKMS_Data/diary_media/`)
- 📦 **Archive data** (stored in `PKMS_Data/archive/`)

### Encryption & Security
- 🔐 **Diary content is encrypted** with your password
- 🔑 **Same password = same decryption** on any PC
- 🛡️ **No keys stored in backup files** - only derived from password
- 🔒 **Backup files are not encrypted** - store securely if needed

## 📞 Support

If you encounter issues:
1. Check `TROUBLESHOOTING.md` for common solutions
2. Verify your backup file exists and is not corrupted
3. Ensure Docker is running and accessible
4. Check file permissions in the backups folder

## 🔄 Migration Between PCs

See `MIGRATION_GUIDE.md` for detailed instructions on moving your PKMS installation to a new computer.

---

**Last Updated**: January 2025  
**PKMS Version**: 1.0.0
