Param(
  [string]$Pattern = ""
)

Write-Host "Running PKMS backend tests..." -ForegroundColor Cyan

$root = Split-Path -Parent $PSCommandPath
$repo = Resolve-Path (Join-Path $root "..")
Set-Location $repo

if (-not (Test-Path "pkms-backend/venv/ScriptS/python.exe")) {
  # Fallback to typical path
}

if ($Pattern -ne "") {
  powershell -Command "cd pkms-backend; venv\Scripts\python -m pytest -q tests/$Pattern"
} else {
  powershell -Command "cd pkms-backend; venv\Scripts\python -m pytest -q"
}

if ($LASTEXITCODE -eq 0) {
  Write-Host "✅ All tests passed" -ForegroundColor Green
} else {
  Write-Host "❌ Some tests failed (exit $LASTEXITCODE)" -ForegroundColor Red
  exit $LASTEXITCODE
}


