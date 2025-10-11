@echo off
setlocal enabledelayedexpansion

echo ========================================
echo PKMS Backup Files List
echo ========================================
echo.

:: Check if we're in the right directory
if not exist "*.db" (
    echo ❌ No backup files found in current directory
    echo.
    echo Current directory: %CD%
    echo Expected location: PKMS\PKMS_Data\backups\
    echo.
    echo Please ensure backup files (.db) are in this folder
    pause
    exit /b 1
)

echo 📋 Available backup files:
echo.

set backup_count=0
set total_size=0

:: List all backup files with details
for %%f in (*.db) do (
    set /a backup_count+=1
    
    :: Get file details
    for %%s in ("%%f") do set file_size=%%~zs
    for %%d in ("%%f") do set file_date=%%~td
    for %%t in ("%%f") do set file_time=%%~tt
    
    :: Calculate size in MB
    set /a size_mb=!file_size!/1024/1024
    set /a total_size+=!file_size!
    
    :: Determine backup method from filename
    set backup_method=Unknown
    echo %%f | findstr /i "backup" >nul && set backup_method=Checkpoint
    echo %%f | findstr /i "vacuum" >nul && set backup_method=VACUUM
    echo %%f | findstr /i "full" >nul && set backup_method=All Files
    
    :: Check if file is recent (within 7 days)
    set is_recent=No
    for /f "tokens=1-3 delims=/" %%a in ("!file_date!") do (
        set file_month=%%a
        set file_day=%%b
        set file_year=%%c
    )
    
    echo [!backup_count!] %%f
    echo    Method: !backup_method!
    echo    Size: !size_mb! MB
    echo    Date: !file_date!
    echo    Time: !file_time!
    echo.
)

:: Calculate total size in MB
set /a total_size_mb=!total_size!/1024/1024

echo ========================================
echo 📊 Summary:
echo    Total backups: %backup_count%
echo    Total size: !total_size_mb! MB
echo    Location: %CD%
echo ========================================
echo.

:: Show usage instructions
echo 💡 Usage:
echo    To restore a backup, run: restore_db.bat
echo    To create a backup, run: create_backup.bat
echo.

:: Check for very old backups
set old_backup_count=0
for %%f in (*.db) do (
    :: Check if file is older than 30 days (simplified check)
    for %%d in ("%%f") do (
        set file_date=%%~td
        echo !file_date! | findstr /r "2024\|2023\|2022\|2021\|2020" >nul && set /a old_backup_count+=1
    )
)

if %old_backup_count% GTR 0 (
    echo ⚠️  Note: %old_backup_count% backup(s) appear to be older than 1 year
    echo    Consider cleaning up old backups to save disk space
    echo.
)

:: Check disk space
echo 💾 Disk space information:
for /f "tokens=3" %%a in ('dir /-c ^| find "bytes free"') do set free_space=%%a
set /a free_space_mb=!free_space!/1024/1024
echo    Free space: !free_space_mb! MB
echo.

if !free_space_mb! LSS 1000 (
    echo ⚠️  Warning: Low disk space detected
    echo    Consider cleaning up old backups
    echo.
)

echo Press any key to continue...
pause >nul
