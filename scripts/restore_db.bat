@echo off
echo ========================================
echo PKMS Database Restore Script
echo ========================================

:: Check if backup file was provided as argument
if "%1"=="" (
    echo Usage: restore_db.bat [backup_filename]
    echo.
    echo Available backups:
    if exist "PKMS_Data\backups\*.db" (
        dir "PKMS_Data\backups\*.db" /b
    ) else (
        echo No backup files found in PKMS_Data\backups\
    )
    echo.
    pause
    exit /b 1
)

set backup_file=%1

:: Check if backup file exists
if not exist "PKMS_Data\backups\%backup_file%" (
    echo ❌ Backup file not found: PKMS_Data\backups\%backup_file%
    echo.
    echo Available backups:
    if exist "PKMS_Data\backups\*.db" (
        dir "PKMS_Data\backups\*.db" /b
    ) else (
        echo No backup files found in PKMS_Data\backups\
    )
    pause
    exit /b 1
)

echo.
echo ⚠️  WARNING: This will replace the current database with the backup!
echo Backup file: %backup_file%
echo.
set /p confirm="Are you sure you want to continue? (y/N): "

if /i not "%confirm%"=="y" (
    echo Restore cancelled.
    pause
    exit /b 0
)

:: Stop Docker services
echo.
echo Stopping Docker services...
docker compose down

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Failed to stop Docker services
    pause
    exit /b 1
)

:: Restore database from backup
echo.
echo Restoring database from backup...
:: Note: Copy to Docker volume at /app/data/pkm_metadata.db
docker compose cp PKMS_Data/backups/%backup_file% pkms-backend:/app/data/pkm_metadata.db

if %ERRORLEVEL% EQU 0 (
    echo ✅ Database restored successfully from: %backup_file%
) else (
    echo ❌ Restore failed! Error code: %ERRORLEVEL%
    pause
    exit /b 1
)

:: Restart Docker services
echo.
echo Starting Docker services...
docker compose up -d

if %ERRORLEVEL% EQU 0 (
    echo ✅ Docker services started successfully
    echo.
    echo Database has been restored from backup: %backup_file%
) else (
    echo ❌ Failed to start Docker services
)

echo ========================================
echo Restore completed at %time%
echo ========================================
pause 