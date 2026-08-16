@echo off
setlocal

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo DeepSeek Harness installer: Windows PowerShell is required. 1>&2
  exit /b 1
)

set "OD_DSH_PS1=%TEMP%\open-design-install-dsh-%RANDOM%-%RANDOM%.ps1"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing 'https://open-design.ai/install-dsh.ps1?version=1' -OutFile $env:OD_DSH_PS1"
if errorlevel 1 (
  echo DeepSeek Harness installer: could not download install-dsh.ps1. 1>&2
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%OD_DSH_PS1%" %*
set "OD_DSH_EXIT=%ERRORLEVEL%"
del /q "%OD_DSH_PS1%" >nul 2>nul
exit /b %OD_DSH_EXIT%
