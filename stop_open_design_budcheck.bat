@echo off
setlocal

cd /d "%~dp0"
set "OD_NAMESPACE=budcheck-design"

where corepack >nul 2>&1
if errorlevel 1 (
  echo [ERROR] corepack was not found in PATH.
  pause
  exit /b 1
)

echo [INFO] Stopping Open Design runtime for namespace %OD_NAMESPACE%...
call corepack pnpm exec tools-dev stop web --namespace %OD_NAMESPACE%
set "EXIT_CODE=%ERRORLEVEL%"

if "%EXIT_CODE%"=="0" (
  echo [INFO] Open Design stopped.
) else (
  echo [WARN] tools-dev returned exit code %EXIT_CODE%.
)

endlocal & exit /b %EXIT_CODE%
