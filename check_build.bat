@echo off
echo Building frontend...
cd pkms-frontend
call npm run build 2>&1 | findstr /C:"Found" /C:"error TS"
cd ..

