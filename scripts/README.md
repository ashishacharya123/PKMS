# PKMS Utility Scripts

This directory contains various utility scripts for PKMS development and maintenance.

## Database Scripts

### Python Scripts
- **`reset_user.py`** - Reset user data and authentication settings
- **`test_db.py`** - Test database connectivity and basic operations
- **`delete_test_user.py`** - Delete test user accounts for cleanup
- **`debug_auth.py`** - Debug authentication issues and token validation

### Batch Scripts (Windows)
- **`backup_db.bat`** - Create database backups with timestamp
- **`restore_db.bat`** - Restore database from backup file
- **`list_backups.bat`** - List available database backup files

## Encryption Scripts
- **`decrypt_pkms_file.py`** - Standalone utility to decrypt PKMS .dat files
  - Supports both diary text and media files
  - Uses same encryption standards as the main application

## Usage Notes

- Most Python scripts assume they're run from the project root directory
- Batch scripts are Windows-specific; use corresponding shell scripts on Linux/Mac
- Always backup your database before running any reset/modification scripts
- The decrypt script requires the same password used to encrypt the files

## Security
- Scripts that handle authentication should only be used in development
- Never commit real passwords or sensitive data to these scripts
- The decrypt script is safe for production use when handling your own files 