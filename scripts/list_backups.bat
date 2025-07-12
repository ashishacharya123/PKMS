@echo off
echo ========================================
echo PKMS Database Backups
echo ========================================

if not exist "PKMS_Data\backups" (
    echo No backup directory found.
    echo Run backup_db.bat to create your first backup.
    pause
    exit /b 0
)

if exist "PKMS_Data\backups\*.db" (
    echo Available database backups:
    echo.
    for %%f in ("PKMS_Data\backups\*.db") do (
        echo Filename: %%~nxf
        echo Size:     %%~zf bytes
        echo Modified: %%~tf
        echo.
    )
) else (
    echo No backup files found in PKMS_Data\backups\
    echo Run backup_db.bat to create your first backup.
)

echo ========================================
pause 