@echo off
setlocal

set "OD_ROOT=%~dp0"

rem Windows cannot create pnpm workspace links through a UNC current directory.
rem Use one stable drive mapping when the repository is reached through tsclient;
rem local-drive checkouts on the older PC continue to use their native path.
if "%OD_ROOT:~0,2%"=="\\" (
  if exist "%USERPROFILE%\OpenDesignRuntime\open-design-local.cmd" (
    call "%USERPROFILE%\OpenDesignRuntime\open-design-local.cmd" %*
    exit /b %ERRORLEVEL%
  )
  net use O: \\tsclient\D /persistent:no >nul 2>nul
  if errorlevel 1 (
    echo Unable to map the shared D drive to O: for Open Design.
    exit /b 1
  )
  set "OD_ROOT=O:\full-stack\P Projects\Open Design\"
)

set "OD_CODEX_DEPS=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies"
set "OD_NODE=%OD_CODEX_DEPS%\node\bin\node.exe"
set "OD_PNPM=%OD_CODEX_DEPS%\node\node_modules\pnpm\bin\pnpm.cjs"
set "PATH=%OD_CODEX_DEPS%\bin\override;%OD_CODEX_DEPS%\bin\fallback;%OD_CODEX_DEPS%\node\bin;%PATH%"

if not exist "%OD_NODE%" set "OD_NODE=node"
if not exist "%OD_PNPM%" set "OD_PNPM=%OD_ROOT%.tmp\pnpm10\node_modules\pnpm\bin\pnpm.cjs"

if /i "%OD_NODE%"=="node" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Open Design requires Node 24. Neither the bundled Codex runtime nor system Node was found.
    exit /b 1
  )
) else if not exist "%OD_NODE%" (
  echo Open Design requires Node 24. The bundled Codex Node runtime was not found:
  echo   %OD_NODE%
  exit /b 1
)

if not exist "%OD_PNPM%" (
  echo The bundled Codex pnpm installation was not found:
  echo   %OD_PNPM%
  exit /b 1
)

if not exist "%OD_ROOT%node_modules\.bin\tools-dev.CMD" (
  echo Preparing Open Design dependencies for this PC...
  pushd "%OD_ROOT%" || exit /b 1
  "%OD_NODE%" "%OD_PNPM%" install
  if errorlevel 1 exit /b %errorlevel%
  popd
)

pushd "%OD_ROOT%" || exit /b 1

if "%~1"=="" (
  "%OD_NODE%" "%OD_PNPM%" tools-dev start web --daemon-port 7456 --web-port 7457
  if errorlevel 1 exit /b %errorlevel%
  echo Open Design is available at http://127.0.0.1:7457
  exit /b 0
)

"%OD_NODE%" "%OD_PNPM%" tools-dev %*
