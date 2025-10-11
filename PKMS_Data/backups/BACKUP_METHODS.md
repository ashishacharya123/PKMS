# PKMS Backup Methods - Detailed Guide

## 📋 Available Backup Methods

PKMS provides three different backup methods, each optimized for different scenarios:

## 1. 🎯 Checkpoint Method (Recommended)

### How It Works
1. **WAL Checkpoint**: Forces SQLite to write all pending changes from WAL to main database
2. **Main DB Backup**: Copies the consolidated main database file
3. **Verification**: Ensures all recent changes are included

### Advantages
- ✅ **Guaranteed completeness** - no data loss
- ✅ **Industry standard** - follows SQLite best practices
- ✅ **Fast execution** - checkpoint is milliseconds
- ✅ **Reliable** - works in all scenarios

### When to Use
- **Regular backups** (daily/weekly)
- **Before major changes** (updates, migrations)
- **Before system maintenance**
- **General purpose** - works for everything

### File Naming
```
pkm_metadata_backup_YYYYMMDD_HHMMSS.db
```

## 2. 🔧 VACUUM Method

### How It Works
1. **Database Optimization**: Rebuilds database with optimal structure
2. **Defragmentation**: Removes unused space and reorganizes data
3. **WAL Consolidation**: Automatically includes all WAL data
4. **Clean Copy**: Creates fresh, optimized database file

### Advantages
- ✅ **Smaller file size** - removes fragmentation
- ✅ **Better performance** - optimized structure
- ✅ **Complete data** - includes all WAL changes
- ✅ **Clean state** - fresh database structure

### When to Use
- **Periodic optimization** (monthly)
- **Before migration** to new PC
- **Performance issues** - slow database
- **Storage optimization** - reduce backup size

### File Naming
```
pkm_metadata_vacuum_YYYYMMDD_HHMMSS.db
```

## 3. 📦 All Files Method

### How It Works
1. **Complete Snapshot**: Backs up main DB + WAL + SHM files
2. **Transaction Preservation**: Includes active transactions
3. **Exact State**: Captures database in exact current state
4. **Multiple Files**: Creates separate files for each component

### Advantages
- ✅ **Exact state capture** - includes active transactions
- ✅ **No data loss** - even mid-transaction changes
- ✅ **Complete snapshot** - everything as-is
- ✅ **Emergency recovery** - works in all scenarios

### When to Use
- **Emergency backups** - system instability
- **System migration** - complete state transfer
- **Debugging** - preserve exact state
- **Critical operations** - before risky changes

### File Naming
```
pkm_metadata_full_YYYYMMDD_HHMMSS.db
pkm_metadata_full_YYYYMMDD_HHMMSS.db-wal
pkm_metadata_full_YYYYMMDD_HHMMSS.db-shm
```

## 🔄 WAL (Write-Ahead Log) Explained

### What is WAL?
- **Write-Ahead Logging**: SQLite's method for handling concurrent access
- **Performance**: Allows multiple readers while one writer
- **Safety**: Changes are logged before being written to main DB
- **Recovery**: Can recover from crashes using WAL data

### WAL Files
- **Main DB**: `pkm_metadata.db` - contains committed data
- **WAL File**: `pkm_metadata.db-wal` - contains recent changes
- **SHM File**: `pkm_metadata.db-shm` - shared memory for coordination

### Why Checkpoint Matters
- **Data Safety**: WAL contains recent changes not yet in main DB
- **Backup Completeness**: Without checkpoint, backup might miss recent data
- **Automatic Process**: SQLite checkpoints automatically, but manual ensures completeness

## 📊 Backup Comparison

| Method | Speed | Size | Completeness | Use Case |
|--------|-------|------|--------------|----------|
| **Checkpoint** | ⚡ Fast | Medium | ✅ Complete | Regular backups |
| **VACUUM** | 🐌 Slower | Small | ✅ Complete | Optimization |
| **All Files** | ⚡ Fast | Large | ✅ Complete | Emergency |

## 🛠️ Technical Details

### Checkpoint Process
```sql
PRAGMA wal_checkpoint(FULL);  -- Force checkpoint
-- Then copy main database file
```

### VACUUM Process
```sql
VACUUM INTO '/path/to/backup.db';  -- Create optimized copy
```

### File Copy Process
```bash
cp pkm_metadata.db backup.db
cp pkm_metadata.db-wal backup.db-wal
cp pkm_metadata.db-shm backup.db-shm
```

## ⚠️ Important Notes

### Backup Limitations
- **Database only** - does not backup user files (documents, images)
- **Diary content** - encrypted files stored separately
- **Archive data** - stored in separate location
- **Configuration** - some settings may need manual backup

### File Locations
- **Backup files**: `PKMS_Data/backups/`
- **User files**: `PKMS_Data/assets/`
- **Diary content**: `PKMS_Data/diary/`
- **Archive data**: `PKMS_Data/archive/`

### Best Practices
1. **Regular backups** - use checkpoint method daily/weekly
2. **Before changes** - backup before updates or migrations
3. **Multiple methods** - use different methods for different needs
4. **Test restores** - periodically test restore process
5. **Store safely** - keep backups in secure location

## 🔍 Verification

### Check Backup Integrity
```bash
# List backup files
list_backups.bat

# Check file sizes (should be reasonable)
dir PKMS_Data\backups\*.db

# Verify backup contains data
# (Restore to test database and check content)
```

### Backup Health Check
- ✅ **File exists** and is not empty
- ✅ **Reasonable size** (not 0 bytes, not suspiciously large)
- ✅ **Recent timestamp** (if doing regular backups)
- ✅ **Multiple backups** (don't rely on single backup)

---

**Remember**: The best backup is the one you can restore from! Test your restore process regularly.
