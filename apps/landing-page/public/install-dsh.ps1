param(
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$NodeVersion = '24.19.0'
$DshVersion = '0.1.0-rc.6'
$PnpmVersion = '11.7.0'

function Fail([string]$Message) {
  throw "DeepSeek Harness installer: $Message"
}

function First-Line([string]$Command, [string[]]$Arguments) {
  try {
    return ((& $Command @Arguments 2>$null | Select-Object -First 1) -as [string]).Trim()
  } catch {
    return ''
  }
}

function Test-NodeVersion([string]$Version) {
  $clean = $Version.TrimStart('v')
  $parsed = $null
  if (-not [version]::TryParse($clean, [ref]$parsed)) { return $false }
  return (($parsed.Major -eq 22 -and $parsed.Minor -ge 19) -or $parsed.Major -ge 24)
}

if (-not $HOME) { Fail 'HOME is not set.' }

$LocalData = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\Local' }
$InstallRoot = if ($env:OD_DSH_INSTALL_ROOT) { $env:OD_DSH_INSTALL_ROOT } else { Join-Path $LocalData 'OpenDesign\toolchains\dsh' }
$BinDir = if ($env:OD_DSH_INSTALL_BIN_DIR) { $env:OD_DSH_INSTALL_BIN_DIR } else { Join-Path $HOME '.local\bin' }
$Launcher = Join-Path $BinDir 'dsh.cmd'
$DistBase = if ($env:OD_DSH_INSTALL_DIST_BASE) { $env:OD_DSH_INSTALL_DIST_BASE.TrimEnd('/') } else { "https://nodejs.org/dist/v$NodeVersion" }
$RuntimeTarget = Join-Path $InstallRoot "runtime-dsh-$DshVersion"

$Architecture = if ($env:OD_DSH_INSTALL_PLATFORM) {
  $env:OD_DSH_INSTALL_PLATFORM
} elseif ($env:PROCESSOR_ARCHITECTURE -match 'ARM64') {
  'win-arm64'
} elseif ($env:PROCESSOR_ARCHITECTURE -match 'AMD64|x86_64') {
  'win-x64'
} else {
  Fail "unsupported CPU architecture: $env:PROCESSOR_ARCHITECTURE"
}
if ($Architecture -notin @('win-x64', 'win-arm64')) { Fail "unsupported platform: $Architecture" }

$NodeTarget = Join-Path $InstallRoot "node-v$NodeVersion-$Architecture"
$ManagedBin = Join-Path $RuntimeTarget 'node_modules\.bin'

function Write-ManagedLauncher([string]$NodeDir, [string]$RuntimeBin) {
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $body = @"
@echo off
set "PATH=$RuntimeBin;$NodeDir;%PATH%"
call "$RuntimeBin\dsh.cmd" %*
exit /b %ERRORLEVEL%
"@
  Set-Content -LiteralPath $Launcher -Value $body -Encoding ascii
}

function Write-ExistingLauncher([string]$NodePath, [string]$DshPath, [string]$PnpmPath) {
  $nodeDir = Split-Path -Parent $NodePath
  $dshDir = Split-Path -Parent $DshPath
  $pnpmDir = Split-Path -Parent $PnpmPath
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  $body = @"
@echo off
set "PATH=$pnpmDir;$nodeDir;$dshDir;%PATH%"
call "$DshPath" %*
exit /b %ERRORLEVEL%
"@
  Set-Content -LiteralPath $Launcher -Value $body -Encoding ascii
}

function Finish([string]$Label) {
  Write-Host "DeepSeek Harness $DshVersion is ready ($Label)."
  Write-Host "Command: $Launcher"
  Write-Host 'OpenDesign can discover this command without editing your PATH.'
  if (-not $NoLaunch) {
    Write-Host 'Starting dsh web. Configure your API key in Settings -> Models; press Ctrl+C to stop.'
    & $Launcher web
    exit $LASTEXITCODE
  }
}

$ManagedNode = Join-Path $NodeTarget 'node.exe'
$ManagedDsh = Join-Path $ManagedBin 'dsh.cmd'
$ManagedPnpm = Join-Path $ManagedBin 'pnpm.cmd'
if ((Test-Path -LiteralPath $Launcher) -and (Test-Path -LiteralPath $ManagedNode) -and (Test-Path -LiteralPath $ManagedDsh) -and (Test-Path -LiteralPath $ManagedPnpm)) {
  $previousPath = $env:PATH
  $env:PATH = "$ManagedBin;$NodeTarget;$env:PATH"
  $installedDsh = First-Line $Launcher @('--version')
  $installedNode = First-Line $ManagedNode @('--version')
  $installedPnpm = First-Line $ManagedNode @('-e', 'console.log(require(process.argv[1]).version)', (Join-Path $RuntimeTarget 'node_modules\pnpm\package.json'))
  $env:PATH = $previousPath
  if ($installedDsh -eq $DshVersion -and (Test-NodeVersion $installedNode) -and $installedPnpm -eq $PnpmVersion) {
    Write-Host "DeepSeek Harness $DshVersion is already installed."
    Finish 'managed toolchain'
    exit 0
  }
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$dshCommand = Get-Command dsh.cmd,dsh.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$pnpmCommand = Get-Command pnpm.cmd,pnpm.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeCommand -and $dshCommand -and $pnpmCommand -and $dshCommand.Source -ne $Launcher) {
  $existingNode = First-Line $nodeCommand.Source @('--version')
  $existingDsh = First-Line $dshCommand.Source @('--version')
  $existingPnpm = First-Line $pnpmCommand.Source @('--version')
  if ((Test-NodeVersion $existingNode) -and $existingDsh -eq $DshVersion -and $existingPnpm -eq $PnpmVersion) {
    Write-ExistingLauncher $nodeCommand.Source $dshCommand.Source $pnpmCommand.Source
    Finish 'existing Node, dsh, and pnpm'
    exit 0
  }
}

New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
$TempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("od-dsh-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TempRoot | Out-Null
try {
  $archiveName = "node-v$NodeVersion-$Architecture.zip"
  $archive = Join-Path $TempRoot $archiveName
  $checksums = Join-Path $TempRoot 'SHASUMS256.txt'
  $managedNodeVersion = if (Test-Path -LiteralPath $ManagedNode) { First-Line $ManagedNode @('--version') } else { '' }
  if ((Test-Path -LiteralPath (Join-Path $NodeTarget 'npm.cmd')) -and (Test-NodeVersion $managedNodeVersion)) {
    Write-Host "Using the verified managed Node.js $managedNodeVersion already on this machine."
  } else {
    Write-Host "Downloading official Node.js v$NodeVersion for $Architecture..."
    Invoke-WebRequest -UseBasicParsing -Uri "$DistBase/SHASUMS256.txt" -OutFile $checksums
    Invoke-WebRequest -UseBasicParsing -Uri "$DistBase/$archiveName" -OutFile $archive

    $checksumLine = Get-Content -LiteralPath $checksums | Where-Object { $_ -match "^[0-9a-fA-F]{64}\s+$([regex]::Escape($archiveName))$" } | Select-Object -First 1
    if (-not $checksumLine) { Fail "checksum entry missing for $archiveName." }
    $expected = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { Fail "checksum verification failed for $archiveName." }
    Write-Host 'Node.js checksum verified.'

    Expand-Archive -LiteralPath $archive -DestinationPath $TempRoot
    $extracted = Join-Path $TempRoot "node-v$NodeVersion-$Architecture"
    if (-not (Test-Path -LiteralPath (Join-Path $extracted 'node.exe'))) { Fail 'the Node.js archive did not contain node.exe.' }
    if (-not (Test-Path -LiteralPath (Join-Path $extracted 'npm.cmd'))) { Fail 'the Node.js archive did not contain npm.cmd.' }
    if (Test-Path -LiteralPath $NodeTarget) { Move-Item -LiteralPath $NodeTarget -Destination "$NodeTarget.incomplete.$PID" }
    Move-Item -LiteralPath $extracted -Destination $NodeTarget
  }

  $runtimeStaging = Join-Path $InstallRoot ".runtime-dsh-$DshVersion.$PID"
  New-Item -ItemType Directory -Force -Path $runtimeStaging | Out-Null
  Write-Host "Installing dsh $DshVersion and pnpm $PnpmVersion in OpenDesign's user toolchain..."
  & (Join-Path $NodeTarget 'npm.cmd') install --prefix $runtimeStaging --no-save --no-package-lock --omit=dev "@deepseek-ai/dsh@$DshVersion" "pnpm@$PnpmVersion"
  if ($LASTEXITCODE -ne 0) { Fail "npm install exited with code $LASTEXITCODE." }

  $stagingBin = Join-Path $runtimeStaging 'node_modules\.bin'
  $stagingDsh = Join-Path $stagingBin 'dsh.cmd'
  $stagingPnpm = Join-Path $stagingBin 'pnpm.cmd'
  if (-not (Test-Path -LiteralPath $stagingDsh)) { Fail 'npm completed without creating dsh.cmd.' }
  if (-not (Test-Path -LiteralPath $stagingPnpm)) { Fail 'npm completed without creating pnpm.cmd.' }
  $env:PATH = "$stagingBin;$NodeTarget;$env:PATH"
  $verifiedDsh = First-Line $stagingDsh @('--version')
  $verifiedPnpm = First-Line $ManagedNode @('-e', 'console.log(require(process.argv[1]).version)', (Join-Path $runtimeStaging 'node_modules\pnpm\package.json'))
  if ($verifiedDsh -ne $DshVersion) { Fail "installed dsh reported '$verifiedDsh', expected '$DshVersion'." }
  if ($verifiedPnpm -ne $PnpmVersion) { Fail "installed pnpm reported '$verifiedPnpm', expected '$PnpmVersion'." }

  if (Test-Path -LiteralPath $RuntimeTarget) { Move-Item -LiteralPath $RuntimeTarget -Destination "$RuntimeTarget.previous.$PID" }
  Move-Item -LiteralPath $runtimeStaging -Destination $RuntimeTarget
  Write-ManagedLauncher $NodeTarget $ManagedBin
} finally {
  if (Test-Path -LiteralPath $TempRoot) { Remove-Item -LiteralPath $TempRoot -Recurse -Force }
}

Finish 'managed Node.js toolchain'
