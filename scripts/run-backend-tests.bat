@echo off
setlocal

cd /d %~dp0\..

if "%1"=="" (
  pushd pkms-backend
  venv\Scripts\python -m pytest -q
  set CODE=%ERRORLEVEL%
  popd
) else (
  pushd pkms-backend
  venv\Scripts\python -m pytest -q tests\%1
  set CODE=%ERRORLEVEL%
  popd
)

if %CODE% EQU 0 (
  echo All tests passed
) else (
  echo Some tests failed (exit %CODE%)
  exit /b %CODE%
)

endlocal
