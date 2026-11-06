@echo off
setlocal
set "motion_root=%~dp0.."
cd /d "%motion_root%"
"%motion_root%\runtime\node\node.exe" --experimental-strip-types --import ./bootstrap.mjs "%motion_root%\mcp.ts"
exit /b %errorlevel%
