@echo off
setlocal

set "OD_ROOT=%~dp0"
set "OD_NODE=C:\Users\jvale\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
set "OD_PNPM=%OD_ROOT%.tmp\pnpm10\node_modules\pnpm\bin\pnpm.cjs"
set "PATH=%OD_ROOT%.tmp\pnpm10\node_modules\.bin;C:\Users\jvale\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;%PATH%"

if not exist "%OD_NODE%" (
  echo Open Design requires Node 24. The bundled Codex Node runtime was not found:
  echo   %OD_NODE%
  exit /b 1
)

if not exist "%OD_PNPM%" (
  echo Open Design's local pnpm 10.33.2 installation was not found:
  echo   %OD_PNPM%
  exit /b 1
)

cd /d "%OD_ROOT%"

if "%~1"=="" (
  "%OD_NODE%" "%OD_PNPM%" tools-dev start web --daemon-port 7456 --web-port 7457
  if errorlevel 1 exit /b %errorlevel%
  echo Open Design is available at http://127.0.0.1:7457
  exit /b 0
)

"%OD_NODE%" "%OD_PNPM%" tools-dev %*
