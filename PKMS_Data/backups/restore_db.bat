@echo off
setlocal enabledelayedexpansion

echo ========================================
echo PKMS Database Restore Script
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

:: Function to list available backups
:list_backups
echo 📋 Available backup files:
echo.
set backup_count=0
if exist "*.db" (
    for %%f in (*.db) do (
        set /a backup_count+=1
        set backup_file[!backup_count!]=%%f
        
        :: Get file size
        for %%s in ("%%f") do set file_size=%%~zs
        
        :: Get file date
        for %%d in ("%%f") do set file_date=%%~td
        
        :: Calculate size in MB
        set /a size_mb=!file_size!/1024/1024
        
        echo [!backup_count!] %%f
        echo    Size: !size_mb! MB
        echo    Date: !file_date!
        echo.
    )
) else (
    echo ❌ No backup files found in current directory
    echo.
    echo Please ensure backup files (.db) are in this folder:
    echo %CD%
    pause
    exit /b 1
)

if %backup_count%==0 (
    echo ❌ No valid backup files found
    pause
    exit /b 1
)

:: Get user selection
echo ========================================
echo Select backup file to restore:
echo ========================================
echo.
set /p selection="Enter backup number (1-%backup_count%) or 'q' to quit: "

if /i "%selection%"=="q" (
    echo Restore cancelled.
    pause
    exit /b 0
)

:: Validate selection
if "%selection%"=="" (
    echo ❌ Invalid selection. Please try again.
    echo.
    goto list_backups
)

:: Check if selection is a number
echo %selection% | findstr /r "^[0-9][0-9]*$" >nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Invalid selection. Please enter a number.
    echo.
    goto list_backups
)

:: Check if selection is in valid range
if %selection% LSS 1 (
    echo ❌ Invalid selection. Please enter a number between 1 and %backup_count%.
    echo.
    goto list_backups
)
if %selection% GTR %backup_count% (
    echo ❌ Invalid selection. Please enter a number between 1 and %backup_count%.
    echo.
    goto list_backups
)

:: Get selected backup file
set selected_backup=!backup_file[%selection%]!

echo.
echo ✅ Selected backup: %selected_backup%
echo.

:: Get file details
for %%s in ("%selected_backup%") do set file_size=%%~zs
for %%d in ("%selected_backup%") do set file_date=%%~td
set /a size_mb=!file_size!/1024/1024

echo 📊 Backup Details:
echo    File: %selected_backup%
echo    Size: !size_mb! MB
echo    Date: !file_date!
echo.

:: Confirm restore
echo ⚠️  WARNING: This will replace the current database with the backup!
echo    All current data will be LOST and replaced with backup data.
echo.
set /p confirm="Are you sure you want to continue? (y/N): "

if /i not "%confirm%"=="y" (
    echo Restore cancelled.
    pause
    exit /b 0
)

echo.
echo 🔄 Starting restore process...
echo.

:: Stop Docker services
echo [1/4] Stopping Docker services...
docker-compose down
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to stop Docker services
    echo Error code: %ERRORLEVEL%
    pause
    exit /b 1
)
echo ✅ Docker services stopped

:: Wait a moment for services to fully stop
timeout /t 3 /nobreak >nul

:: Restore database from backup
echo.
echo [2/4] Restoring database from backup...
echo    Source: %selected_backup%
echo    Target: /app/data/pkm_metadata.db

docker-compose cp "%selected_backup%" pkms-backend:/app/data/pkm_metadata.db
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to restore database from backup
    echo Error code: %ERRORLEVEL%
    echo.
    echo Trying to start Docker services anyway...
    docker-compose up -d
    pause
    exit /b 1
)
echo ✅ Database restored successfully

:: Wait a moment for file to be written
timeout /t 2 /nobreak >nul

:: Start Docker services
echo.
echo [3/4] Starting Docker services...
docker-compose up -d
if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to start Docker services
    echo Error code: %ERRORLEVEL%
    echo.
    echo Database was restored but services failed to start.
    echo Please check Docker logs: docker-compose logs
    pause
    exit /b 1
)
echo ✅ Docker services started

:: Wait for services to be ready
echo.
echo [4/4] Waiting for services to be ready...
echo    This may take 30-60 seconds...
timeout /t 30 /nobreak >nul

:: Check if services are running
echo.
echo 🔍 Checking service status...
docker-compose ps
if %ERRORLEVEL% NEQ 0 (
    echo ⚠️  Warning: Could not check service status
    echo Please check manually: docker-compose ps
)

echo.
echo ========================================
echo ✅ RESTORE COMPLETED SUCCESSFULLY!
echo ========================================
echo.
echo 📋 Summary:
echo    Backup file: %selected_backup%
echo    File size: !size_mb! MB
echo    Restore time: %time%
echo.
echo 🌐 Next steps:
echo    1. Open browser to http://localhost:3000
echo    2. Login with your existing credentials
echo    3. Verify your data is restored correctly
echo    4. Test diary unlock (if applicable)
echo.
echo ⚠️  Important notes:
echo    - All active sessions may need to be refreshed
echo    - If you cannot login, try a different backup file
echo    - Check the troubleshooting guide if you have issues
echo.
echo 📚 For help, see: TROUBLESHOOTING.md
echo.

:: Ask if user wants to open browser
set /p open_browser="Open PKMS in browser now? (y/N): "
if /i "%open_browser%"=="y" (
    start http://localhost:3000
)

echo.
echo Restore completed at %date% %time%
echo ========================================
pause
