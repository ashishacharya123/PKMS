@echo off
echo ========================================
echo PKMS Database Backup Script
echo ========================================

:: Get current date and time for backup filename
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do if not "%%I"=="" set datetime=%%I
set backup_name=pkm_metadata_backup_%datetime:~0,8%_%datetime:~8,6%.db

echo Creating backup: %backup_name%

:: Create backup directory if it doesn't exist
if not exist "PKMS_Data\backups" mkdir "PKMS_Data\backups"

:: Copy database from Docker volume to local backup
docker run --rm -v pkms_db_data:/source -v "%cd%/PKMS_Data/backups":/backup alpine sh -c "cp /source/pkm_metadata.db /backup/%backup_name%"

if %ERRORLEVEL% EQU 0 (
    echo ✅ Backup created successfully: PKMS_Data\backups\%backup_name%
    echo Database size: 
    dir "PKMS_Data\backups\%backup_name%" | find "%backup_name%"
) else (
    echo ❌ Backup failed! Error code: %ERRORLEVEL%
    exit /b 1
)

echo ========================================
echo Backup completed at %time%
echo ========================================
pause 