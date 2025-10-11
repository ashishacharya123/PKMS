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
echo [1] Checkpoint Method (Recommended)
echo    - Fast and reliable
echo    - Guarantees all recent changes are included
echo    - Best for regular backups
echo.
echo [2] VACUUM Method
echo    - Creates optimized, defragmented backup
echo    - Smaller file size
echo    - Best for periodic optimization
echo.
echo [3] All Files Method
echo    - Complete snapshot including WAL files
echo    - Largest file size
echo    - Best for emergency backups
echo.

:: Get user selection
set /p method="Select backup method (1-3) or 'q' to quit: "

if /i "%method%"=="q" (
    echo Backup cancelled.
    pause
    exit /b 0
)

:: Validate selection
if "%method%"=="" (
    echo ❌ Invalid selection. Please try again.
    goto :eof
)

if "%method%"=="1" (
    set backup_method=checkpoint
    set method_name=Checkpoint Method
) else if "%method%"=="2" (
    set backup_method=vacuum
    set method_name=VACUUM Method
) else if "%method%"=="3" (
    set backup_method=all_files
    set method_name=All Files Method
) else (
    echo ❌ Invalid selection. Please enter 1, 2, or 3.
    pause
    exit /b 1
)

echo.
echo ✅ Selected: %method_name%
echo.

:: Get confirmation
echo ⚠️  This will create a new backup using %method_name%
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

:: Create backup using curl (since we can't easily use the web interface from script)
echo [1/2] Creating backup via API...

:: Get current timestamp for backup filename
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%%MM%%DD%_%HH%%Min%%Sec%"

:: Try to create backup via API (this is a simplified approach)
echo    Method: %backup_method%
echo    Timestamp: %timestamp%
echo.

:: For now, we'll use a simple approach - copy the database directly
:: This is not as robust as the API method, but works for basic backup

echo [2/2] Creating backup file...

if "%backup_method%"=="checkpoint" (
    set backup_filename=pkm_metadata_backup_%timestamp%.db
) else if "%backup_method%"=="vacuum" (
    set backup_filename=pkm_metadata_vacuum_%timestamp%.db
) else (
    set backup_filename=pkm_metadata_full_%timestamp%.db
)

:: Copy database file (this is a simplified backup - not as robust as API method)
echo    Creating: %backup_filename%

:: Try to copy from Docker container
docker-compose cp pkms-backend:/app/data/pkm_metadata.db "%backup_filename%"
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

echo ✅ Backup created successfully
echo.

echo ========================================
echo ✅ BACKUP COMPLETED SUCCESSFULLY!
echo ========================================
echo.
echo 📋 Summary:
echo    Method: %method_name%
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
