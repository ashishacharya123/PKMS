@echo off
setlocal enabledelayedexpansion

echo ========================================
echo PKMS Database Backup Script
echo ========================================
echo.

:: Check if Docker is available
docker --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker is not installed or not in PATH
    echo Please install Docker Desktop and try again
    pause
    exit /b 1
)

:: Check if docker-compose is available
docker-compose --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Docker Compose is not available
    echo Please ensure Docker Compose is installed
    pause
    exit /b 1
)

:: Check if we're in the right directory
if not exist "..\..\docker-compose.yml" (
    echo ❌ docker-compose.yml not found
    echo Please run this script from PKMS_Data\backups\ folder
    echo Expected location: PKMS\PKMS_Data\backups\
    pause
    exit /b 1
)

:: Check if PKMS is running
docker-compose ps | findstr "Up" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ PKMS is not running
    echo Please start PKMS first: docker-compose up -d
    pause
    exit /b 1
)

echo ✅ PKMS is running
echo.

:: Show backup method options
echo 📋 Available backup methods:
echo.
echo This script will create a single-file backup by:
echo    - Merging all database changes into one file
echo    - Creating a complete snapshot backup
echo    - Saving it with timestamp in current directory
echo.

:: Get confirmation
echo ⚠️  This will create a new backup
echo    The backup will be saved in the current directory
echo.
set /p confirm="Continue with backup? (y/N): "

if /i not "%confirm%"=="y" (
    echo Backup cancelled.
    pause
    exit /b 0
)

echo.
echo 🔄 Starting backup process...
echo.

:: Get current timestamp for backup filename
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%%MM%%DD%_%HH%%Min%%Sec%"

set backup_filename=pkm_metadata_backup_%timestamp%.db

echo [1/3] Merging database changes...
echo    Running PRAGMA wal_checkpoint(FULL) to merge WAL file...

:: Merge all changes into main database file
docker-compose exec -T pkms-backend sqlite3 /app/data/pkm_metadata.db "PRAGMA wal_checkpoint(FULL);"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to merge database changes
    echo Error code: %ERRORLEVEL%
    pause
    exit /b 1
)

echo [2/3] Creating optimized backup...
echo    Running VACUUM INTO to create compacted backup...

:: Create optimized backup using VACUUM INTO
docker-compose exec -T pkms-backend sqlite3 /app/data/pkm_metadata.db "VACUUM INTO '/tmp/pkm_metadata_backup_%timestamp%.db';"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to create optimized backup
    echo Error code: %ERRORLEVEL%
    pause
    exit /b 1
)

echo [3/3] Copying backup file...
echo    Creating: %backup_filename%

:: Copy the optimized backup file from container
docker-compose cp pkms-backend:/tmp/pkm_metadata_backup_%timestamp%.db "%backup_filename%"
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to create backup
    echo Error code: %ERRORLEVEL%
    echo.
    echo This script provides a basic backup method.
    echo For full backup functionality, use the web interface:
    echo 1. Open http://localhost:3000
    echo 2. Go to Settings → Backup & Restore
    echo 3. Create backup using the web interface
    pause
    exit /b 1
)

:: Get file size
for %%s in ("%backup_filename%") do set file_size=%%~zs
set /a size_mb=!file_size!/1024/1024

:: Clean up temporary file in container
docker-compose exec -T pkms-backend rm -f /tmp/pkm_metadata_backup_%timestamp%.db

echo ✅ Backup created successfully
echo.

echo ========================================
echo ✅ BACKUP COMPLETED SUCCESSFULLY!
echo ========================================
echo.
echo 📋 Summary:
echo    Method: Merged Single-File Backup
echo    File: %backup_filename%
echo    Size: !size_mb! MB
echo    Time: %time%
echo.
echo 📁 Location: %CD%
echo.

:: Show next steps
echo 💡 Next steps:
echo    1. Verify backup file exists and has reasonable size
echo    2. Test restore process: restore_db.bat
echo    3. Consider setting up regular backups
echo.

:: Show warning about method limitations
echo ⚠️  Important notes:
echo    - This is a basic backup method
echo    - For full functionality, use the web interface
echo    - WAL checkpoint is not performed (may miss recent changes)
echo    - For production use, use the web interface backup
echo.

:: Ask if user wants to list backups
set /p list_backups="List all backup files now? (y/N): "
if /i "%list_backups%"=="y" (
    echo.
    call list_backups.bat
)

echo.
echo Backup completed at %date% %time%
echo ========================================
pause
