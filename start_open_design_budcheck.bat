@echo off
setlocal

cd /d "%~dp0"

set "OD_NAMESPACE=budcheck-design"
set "OD_WEB_PORT=5175"
set "OD_DAEMON_PORT=7457"

echo [INFO] Starting Open Design in parallel with Bud Check...
echo [INFO] Bud Check uses:        http://127.0.0.1:3000 and http://127.0.0.1:8000
echo [INFO] Open Design will use:  http://127.0.0.1:%OD_WEB_PORT% and http://127.0.0.1:%OD_DAEMON_PORT%
echo.

where corepack >nul 2>&1
if errorlevel 1 (
  echo [ERROR] corepack was not found in PATH.
  echo [ERROR] Install Node.js 24.x and ensure corepack is available, then try again.
  pause
  exit /b 1
)

call corepack pnpm exec tools-dev stop web --namespace %OD_NAMESPACE% >nul 2>&1

echo [INFO] Launching Open Design web runtime...
echo [INFO] Web:    http://127.0.0.1:%OD_WEB_PORT%/
echo [INFO] Daemon: http://127.0.0.1:%OD_DAEMON_PORT%/
echo [INFO] Press Ctrl+C in this window to stop Open Design.
echo.

call corepack pnpm exec tools-dev run web --namespace %OD_NAMESPACE% --daemon-port %OD_DAEMON_PORT% --web-port %OD_WEB_PORT%
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Open Design failed to start.
  echo [HINT] Check whether port %OD_WEB_PORT% or %OD_DAEMON_PORT% is already busy.
  pause
)

endlocal & exit /b %EXIT_CODE%
