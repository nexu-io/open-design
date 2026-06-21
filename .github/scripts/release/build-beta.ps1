param(
  [ValidateSet("win")]
  [string]$Platform = "win",
  [ValidateSet("hosted", "self-hosted")]
  [string]$Lane = "self-hosted",
  [string]$Namespace = "release-beta-win",
  [string]$Root = "",
  [string]$ReleaseVersion = "",
  [string]$MetadataUrl = "https://releases.open-design.ai/beta/latest/metadata.json",
  [ValidateSet("skip", "core", "full")]
  [string]$SmokeMode = "full",
  [ValidateSet("all", "dir", "nsis", "zip")]
  [string]$Target = "all",
  [ValidateSet("off", "on")]
  [string]$SignMode = "off"
)

$ErrorActionPreference = "Stop"
$scriptStartedAt = Get-Date
$script:timings = @()
$script:failureMessage = $null
$script:node24Version = $null
$script:pnpmVersion = $null
$script:pnpmInstallFingerprint = $null
$script:pnpmInstallInputs = 0
$script:pnpmInstallReuse = $false
$script:pnpmInstallReuseReason = $null
$script:requestedWindowsSigningEnabled = $false

if ($Platform -ne "win") {
  throw "build-beta.ps1 currently supports win only"
}

$workspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$fnm = "C:\Users\runner\.cargo\bin\fnm.exe"
$cargo = "C:\Users\runner\.cargo\bin\cargo.exe"
$makensis = "C:\Program Files (x86)\NSIS\makensis.exe"
$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
$winSigningThumbprint = "8617C437D6CCE5A61758C27E684BF5CADC5AC0A7"

. (Join-Path $PSScriptRoot "windows-signing.ps1")

function Require-File([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Name is required at $Path"
  }
}

function Get-Sha256Text([string]$Value) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    return -join ($sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Value)) | ForEach-Object {
      $_.ToString("x2")
    })
  } finally {
    $sha256.Dispose()
  }
}

function Format-Duration([int64]$Milliseconds) {
  if ($Milliseconds -ge 60000) {
    return "$([Math]::Round($Milliseconds / 60000, 1))m"
  }
  return "$([Math]::Round($Milliseconds / 1000, 1))s"
}

function Get-NextBetaFixtureVersion([string]$Version) {
  $match = [System.Text.RegularExpressions.Regex]::Match($Version, '^(?<base>\d+\.\d+\.\d+)-beta\.(?<number>\d+)$')
  if (-not $match.Success) {
    throw "release-beta-s full smoke requires a beta version like x.y.z-beta.N; got $Version"
  }
  return "$($match.Groups['base'].Value)-beta.$([int]$match.Groups['number'].Value + 1)"
}

function Measure-Step([string]$Name, [scriptblock]$Script) {
  Write-Host "##[group]$Name"
  $started = Get-Date
  try {
    $result = & $Script
    $durationMs = [int64]((Get-Date) - $started).TotalMilliseconds
    $script:timings += [ordered]@{
      step = $Name
      status = "success"
      durationMs = $durationMs
    }
    Write-Host "[$Name] success in $(Format-Duration $durationMs)"
    return $result
  } catch {
    $durationMs = [int64]((Get-Date) - $started).TotalMilliseconds
    $script:timings += [ordered]@{
      step = $Name
      status = "failed"
      durationMs = $durationMs
      error = $_.Exception.Message
    }
    $script:failureMessage = $_.Exception.Message
    Write-Host "[$Name] failed in $(Format-Duration $durationMs)"
    throw
  } finally {
    Write-Host "##[endgroup]"
  }
}

function Quote-CmdArgument([string]$Value) {
  if ([string]::IsNullOrEmpty($Value)) {
    return '""'
  }

  if ($Value -notmatch '[\s"&|<>^()]') {
    return $Value
  }

  return '"' + ($Value -replace '"', '\"') + '"'
}

function New-CmdCommandLine([string[]]$Arguments) {
  return ($Arguments | ForEach-Object { Quote-CmdArgument $_ }) -join " "
}

function Set-EnvDefault([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace([string][System.Environment]::GetEnvironmentVariable($Name, "Process"))) {
    [System.Environment]::SetEnvironmentVariable($Name, $Value, "Process")
  }
}

function Set-WindowsDownloadMirrorDefaults {
  Set-EnvDefault "npm_config_registry" "https://registry.npmmirror.com"
  Set-EnvDefault "npm_config_disturl" "https://npmmirror.com/mirrors/node"
  Set-EnvDefault "npm_config_electron_mirror" "https://npmmirror.com/mirrors/electron/"
  Set-EnvDefault "npm_config_electron_builder_binaries_mirror" "https://npmmirror.com/mirrors/electron-builder-binaries/"
  Set-EnvDefault "npm_config_better_sqlite3_binary_host_mirror" "https://npmmirror.com/mirrors/better-sqlite3"
}

function Invoke-Node24([string[]]$Arguments, [string]$WorkingDirectory = $workspaceRoot) {
  Push-Location -LiteralPath $WorkingDirectory
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = "Continue"
      $commandLine = New-CmdCommandLine $Arguments
      & $fnm exec --using=24 -- cmd.exe /d /s /c $commandLine
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($LASTEXITCODE -ne 0) {
      throw "fnm exec failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Invoke-ToolsPackWinBuild([string[]]$Arguments) {
  $stderrPath = Join-Path $platformRoot "tools-pack-win-build.stderr.log"
  Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue

  $commandLine = New-CmdCommandLine $Arguments
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = "Continue"
    $stdout = & $fnm exec --using=24 -- cmd.exe /d /s /c $commandLine 2> $stderrPath
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  $exitCode = $LASTEXITCODE
  $stderr = Get-Content -LiteralPath $stderrPath -Raw -ErrorAction SilentlyContinue

  if (-not [string]::IsNullOrWhiteSpace($stderr)) {
    Write-Host ($stderr.TrimEnd())
  }

  return [ordered]@{
    exitCode = $exitCode
    stderr = $stderr
    stdoutLines = @($stdout | ForEach-Object { $_.ToString() })
  }
}

function Invoke-ToolsPackWinBuildChecked(
  [string[]]$Arguments,
  [string]$OutputRoot,
  [string]$JsonPath,
  [string]$FailurePrefix
) {
  $buildResult = Invoke-ToolsPackWinBuild -Arguments $Arguments
  if ($buildResult.exitCode -eq 0) {
    return $buildResult
  }

  throw "$FailurePrefix failed with exit code $($buildResult.exitCode)"
}

function Read-GitHubOutput([string]$Path) {
  $outputs = @{}
  foreach ($line in Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue) {
    $index = $line.IndexOf("=")
    if ($index -le 0) { continue }
    $outputs[$line.Substring(0, $index)] = $line.Substring($index + 1)
  }
  return $outputs
}

function Get-WorkspaceInstallTrackedFiles {
  $patterns = @(
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "apps/*/package.json",
    "packages/*/package.json",
    "tools/*/package.json"
  )
  $files = @(
    git -C $workspaceRoot ls-files -- @patterns |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_.Length -gt 0 } |
      Sort-Object -Unique
  )
  if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed while collecting workspace install inputs"
  }
  return $files
}

function Get-WorkspaceInstallState {
  $files = Get-WorkspaceInstallTrackedFiles
  $entries = @(
    foreach ($relativePath in $files) {
      $absolutePath = Join-Path $workspaceRoot $relativePath
      if (-not (Test-Path -LiteralPath $absolutePath)) {
        throw "workspace install input missing: $absolutePath"
      }
      $item = Get-Item -LiteralPath $absolutePath
      [ordered]@{
        path = $relativePath.Replace("\", "/")
        sha256 = (Get-FileHash -LiteralPath $absolutePath -Algorithm SHA256).Hash.ToLowerInvariant()
        size = $item.Length
      }
    }
  )
  $fingerprintInput = [ordered]@{
    files = $entries
    node24Version = $script:node24Version
    pnpmVersion = $script:pnpmVersion
  }
  return [ordered]@{
    files = $entries
    fingerprint = Get-Sha256Text (($fingerprintInput | ConvertTo-Json -Depth 6 -Compress))
    inputs = $entries.Count
    node24Version = $script:node24Version
    pnpmVersion = $script:pnpmVersion
  }
}

function Test-WorkspaceInstallReusable {
  $stampPath = Join-Path $platformRoot "workspace-install-state.json"
  if (-not (Test-Path -LiteralPath $stampPath)) {
    return [ordered]@{
      reusable = $false
      reason = "install stamp missing"
      stampPath = $stampPath
      state = $null
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot "node_modules\.pnpm"))) {
    return [ordered]@{
      reusable = $false
      reason = "node_modules/.pnpm missing"
      stampPath = $stampPath
      state = $null
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot "tools\pack\dist\index.mjs"))) {
    return [ordered]@{
      reusable = $false
      reason = "tools-pack dist missing"
      stampPath = $stampPath
      state = $null
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot "tools\pack\dist\metadata.json"))) {
    return [ordered]@{
      reusable = $false
      reason = "tools-pack metadata missing"
      stampPath = $stampPath
      state = $null
    }
  }
  $state = Get-WorkspaceInstallState
  $stamp = Read-JsonFile $stampPath
  if ($stamp -eq $null) {
    return [ordered]@{
      reusable = $false
      reason = "install stamp unreadable"
      stampPath = $stampPath
      state = $state
    }
  }
  if ([string]$stamp.fingerprint -ne $state.fingerprint) {
    return [ordered]@{
      reusable = $false
      reason = "install fingerprint changed"
      stampPath = $stampPath
      state = $state
    }
  }

  try {
    Invoke-Node24 -Arguments @(
      "node",
      "--experimental-strip-types",
      ".\packages\metatool\src\cli.ts",
      "check",
      ".\tools\pack"
    )
    Invoke-Node24 -Arguments @("pnpm.cmd", "exec", "tsx", "--version")
  } catch {
    return [ordered]@{
      reusable = $false
      reason = "workspace install probe failed"
      stampPath = $stampPath
      state = $state
    }
  }

  return [ordered]@{
    reusable = $true
    reason = "workspace install state unchanged"
    stampPath = $stampPath
    state = $state
  }
}

function Write-WorkspaceInstallState([hashtable]$State, [string]$StampPath) {
  $payload = [ordered]@{
    fingerprint = $State.fingerprint
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    inputs = $State.inputs
    node24Version = $State.node24Version
    pnpmVersion = $State.pnpmVersion
  }
  $payload | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $StampPath -Encoding utf8
}

function Repair-ElectronDist {
  $electronVersion = "41.3.0"
  $electronRoot = Join-Path $workspaceRoot "node_modules\.pnpm\electron@$electronVersion\node_modules\electron"
  $dist = Join-Path $electronRoot "dist"
  $electronExe = Join-Path $dist "electron.exe"
  if (Test-Path -LiteralPath $electronExe) {
    return
  }

  $cacheRoot = Join-Path $env:LOCALAPPDATA "electron\Cache"
  $zip = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter "electron-v$electronVersion-win32-x64.zip" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($zip -eq $null) {
    $previousForceNoCache = $env:force_no_cache
    try {
      $env:force_no_cache = "true"
      Invoke-Node24 -Arguments @("node", (Join-Path $electronRoot "install.js"))
    } finally {
      $env:force_no_cache = $previousForceNoCache
    }
    $zip = Get-ChildItem -LiteralPath $cacheRoot -Recurse -Filter "electron-v$electronVersion-win32-x64.zip" -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
  }

  if ($zip -eq $null) {
    throw "Electron cache zip not found for $electronVersion under $cacheRoot"
  }

  $resolvedDist = (Resolve-Path -LiteralPath $dist -ErrorAction SilentlyContinue)
  if ($resolvedDist -ne $null -and -not $resolvedDist.Path.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to repair Electron dist outside workspace: $($resolvedDist.Path)"
  }

  Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  tar.exe -xf $zip.FullName -C $dist
  Require-File $electronExe "electron.exe"
}

function Read-BuildJson {
  if (-not (Test-Path -LiteralPath $buildJsonPath)) {
    return $null
  }
  return Read-JsonFile $buildJsonPath
}

function Read-JsonFile([string]$Path) {
  return Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json
}

function Get-SmokeSummary {
  if ([string]::IsNullOrWhiteSpace($env:OD_PACKAGED_E2E_REPORT_DIR)) {
    return $null
  }
  $summaryJsonPath = Join-Path $env:OD_PACKAGED_E2E_REPORT_DIR "summary.json"
  if (-not (Test-Path -LiteralPath $summaryJsonPath)) {
    return $null
  }
  return Read-JsonFile $summaryJsonPath
}

function Get-ArtifactSummary {
  $build = Read-BuildJson
  if ($build -eq $null) {
    return $null
  }
  return [ordered]@{
    installerPath = $build.installerPath
    installerBytes = $build.sizeReport.installerBytes
    latestYmlPath = $build.latestYmlPath
    outputRoot = $build.outputRoot
    outputRootBytes = $build.sizeReport.outputRootBytes
    portableZipPath = $build.portableZipPath
    portableZipBytes = $build.sizeReport.portableZipBytes
  }
}

function Get-CacheSummary {
  $build = Read-BuildJson
  if ($build -eq $null -or $build.cacheReport -eq $null -or $build.cacheReport.entries -eq $null) {
    return @()
  }
  return @($build.cacheReport.entries | ForEach-Object {
    [ordered]@{
      nodeId = $_.nodeId
      status = $_.status
      durationMs = $_.durationMs
      reason = $_.reason
      materialized = @($_.materialized | ForEach-Object {
        [ordered]@{
          from = $_.from
          to = $_.to
          durationMs = $_.durationMs
          skipped = $_.skipped
        }
      })
    }
  })
}

function Get-BuildSegments {
  $build = Read-BuildJson
  if ($build -eq $null -or $build.segments -eq $null) {
    return @()
  }
  return @($build.segments | ForEach-Object {
    [ordered]@{
      phase = $_.phase
      durationMs = $_.durationMs
      details = $_.details
    }
  })
}

function Write-IndexAndSummary([string]$Status) {
  $durationMs = [int64]((Get-Date) - $scriptStartedAt).TotalMilliseconds
  $artifactSummary = Get-ArtifactSummary
  $cacheSummary = Get-CacheSummary
  $buildSegments = Get-BuildSegments
  $smokeSummary = Get-SmokeSummary
  $index = [ordered]@{
    channel = "beta"
    lane = $Lane
    namespace = $Namespace
    pnpmInstallFingerprint = $script:pnpmInstallFingerprint
    pnpmInstallInputs = $script:pnpmInstallInputs
    pnpmInstallReuse = $script:pnpmInstallReuse
    pnpmInstallReuseReason = $script:pnpmInstallReuseReason
    platform = $Platform
    target = $Target
    signed = $script:windowsSigningEnabled
    signingRequested = $script:requestedWindowsSigningEnabled
    releaseVersion = $ReleaseVersion
    status = $Status
    failure = $script:failureMessage
    commit = $env:GITHUB_SHA
    branch = $env:GITHUB_REF_NAME
    root = $Root
    toolsPackDir = $toolsPackDir
    cacheDir = $cacheDir
    buildJsonPath = $buildJsonPath
    reportDir = $env:OD_PACKAGED_E2E_REPORT_DIR
    smokeMode = $SmokeMode
    smoke = $smokeSummary
    artifacts = $artifactSummary
    cache = $cacheSummary
    buildSegments = $buildSegments
    timings = $script:timings
    durationMs = $durationMs
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  }

  New-Item -ItemType Directory -Force -Path $indexDir | Out-Null
  $index | ConvertTo-Json -Depth 8 | Set-Content -Path $indexPath -Encoding utf8

  $summary = @(
    "## beta release build",
    "",
    "- status: ``$Status``",
    "- platform: ``$Platform``",
    "- target: ``$Target``",
    "- signed: ``$script:windowsSigningEnabled``",
    "- signingRequested: ``$script:requestedWindowsSigningEnabled``",
    "- lane: ``$Lane``",
    "- namespace: ``$Namespace``",
    "- pnpmInstallReuse: ``$script:pnpmInstallReuse``",
    "- releaseVersion: ``$ReleaseVersion``",
    "- smokeMode: ``$SmokeMode``",
    "- duration: ``$(Format-Duration $durationMs)``",
    "- index: ``$indexPath``",
    "- reportDir: ``$($env:OD_PACKAGED_E2E_REPORT_DIR)``"
  )

  if ($script:failureMessage -ne $null) {
    $summary += "- failure: ``$script:failureMessage``"
  }
  if ($script:pnpmInstallReuseReason -ne $null) {
    $summary += "- pnpmInstallReuseReason: ``$script:pnpmInstallReuseReason``"
  }

  if ($artifactSummary -ne $null) {
    $summary += ""
    $summary += "### Artifacts"
    if ($artifactSummary.installerPath -ne $null) {
      $summary += "- installer: ``$($artifactSummary.installerPath)``"
    }
    if ($artifactSummary.portableZipPath -ne $null) {
      $summary += "- portableZip: ``$($artifactSummary.portableZipPath)``"
    }
  }

  if ($script:timings.Count -gt 0) {
    $summary += ""
    $summary += "### Timings"
    foreach ($timing in $script:timings) {
      $summary += "- $($timing.step): ``$(Format-Duration $timing.durationMs)`` $($timing.status)"
    }
  }

  if ($cacheSummary.Count -gt 0) {
    $summary += ""
    $summary += "### Tools-Pack Cache"
    foreach ($entry in $cacheSummary) {
      $summary += "- $($entry.nodeId): ``$($entry.status)`` ``$(Format-Duration $entry.durationMs)``"
      $slowMaterialized = @($entry.materialized | Sort-Object durationMs -Descending | Select-Object -First 5)
      foreach ($materialized in $slowMaterialized) {
        $mode = if ($materialized.skipped) { "reuse" } else { "copy" }
        $summary += "  - materialize $($materialized.from): ``$(Format-Duration $materialized.durationMs)`` $mode"
      }
    }
  }

  if ($buildSegments.Count -gt 0) {
    $summary += ""
    $summary += "### Build Segments"
    foreach ($segment in @($buildSegments | Sort-Object durationMs -Descending | Select-Object -First 12)) {
      $detailText = ""
      if ($segment.details -ne $null -and $segment.details.outputBytes -ne $null) {
        $detailText = " output=$([Math]::Round($segment.details.outputBytes / 1MB, 1))MiB"
      }
      if ($segment.details -ne $null -and $segment.details.files -ne $null) {
        $detailText = " files=$($segment.details.files) dirs=$($segment.details.directories) bytes=$([Math]::Round($segment.details.bytes / 1MB, 1))MiB maxPath=$($segment.details.maxPathLength)"
      }
      $summary += "- $($segment.phase): ``$(Format-Duration $segment.durationMs)``$detailText"
    }
  }

  if ($smokeSummary -ne $null -and $smokeSummary.timings -ne $null) {
    $summary += ""
    $summary += "### Smoke Segments"
    foreach ($timing in @($smokeSummary.timings | Sort-Object durationMs -Descending | Select-Object -First 16)) {
      $summary += "- $($timing.step): ``$(Format-Duration $timing.durationMs)``"
    }
  }

  $summary | Set-Content -Path $summaryPath -Encoding utf8
  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_STEP_SUMMARY)) {
    $summary | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8
  }
}

if ([string]::IsNullOrWhiteSpace($Root)) {
  if ($Lane -eq "self-hosted") {
    $Root = "C:\.tmp\runner\od-beta"
  } else {
    $Root = Join-Path $env:RUNNER_TEMP "od-beta"
  }
}

$platformRoot = Join-Path $Root $Platform
$toolsPackDir = Join-Path $platformRoot "tools-pack"
$updateFixtureToolsPackDir = Join-Path $platformRoot "tools-pack-update-fixture"
$cacheDir = Join-Path $platformRoot "tools-pack-cache"
$reportDir = Join-Path $platformRoot "release-report"
$indexDir = Join-Path $platformRoot "index"
$buildJsonPath = Join-Path $platformRoot "windows-tools-pack-build.json"
$indexPath = Join-Path $indexDir "index.json"
$summaryPath = Join-Path $platformRoot "summary.md"
$metadataOutputPath = Join-Path $platformRoot "metadata.outputs"

New-Item -ItemType Directory -Force -Path $platformRoot, $toolsPackDir, $updateFixtureToolsPackDir, $cacheDir, $reportDir, $indexDir | Out-Null
Remove-Item -LiteralPath $buildJsonPath -Force -ErrorAction SilentlyContinue
$script:windowsSigningEnabled = $false
$env:OD_PACKAGED_E2E_REPORT_DIR = Join-Path $reportDir "win"
$env:OD_PACKAGED_E2E_TOOLS_PACK_DIR = $toolsPackDir
Set-WindowsDownloadMirrorDefaults

try {
  Measure-Step "toolchain" {
    Require-File $fnm "fnm"
    Require-File $cargo "cargo"
    Require-File $makensis "makensis"
    git --version
    git lfs version
    $script:node24Version = (& $fnm exec --using=24 -- node --version | Select-Object -Last 1).Trim()
    Write-Host $script:node24Version
    $script:pnpmVersion = (& $fnm exec --using=24 -- pnpm.cmd --version | Select-Object -Last 1).Trim()
    Write-Host $script:pnpmVersion
    & $cargo --version
    & $makensis /VERSION
  }

  Measure-Step "windows signing capability" {
    $signingProbe = Read-WindowsSigningProbeFromEnvironment
    if ($signingProbe -eq $null) {
      $signingProbe = Get-WindowsSigningProbe -SignMode $SignMode -Thumbprint $winSigningThumbprint -SignToolPath $signtool
    }

    $script:requestedWindowsSigningEnabled = [bool]$signingProbe.requested
    $script:windowsSigningEnabled = [bool]$signingProbe.enabled
    if ($script:windowsSigningEnabled) {
      $env:OD_WIN_SIGN_CERT_SHA1 = [string]$signingProbe.thumbprint
      $env:OD_WIN_SIGNTOOL_PATH = [string]$signingProbe.signToolPath
      $env:OD_WIN_SIGN_TIMESTAMP_URL = "http://timestamp.digicert.com"
      Write-Host "Windows signing enabled with certificate $($signingProbe.thumbprint)"
    } elseif (-not [string]::IsNullOrWhiteSpace([string]$signingProbe.reason)) {
      Write-Host "Windows signing disabled: $($signingProbe.reason)"
    }
  }

  Measure-Step "pnpm install" {
    $reuse = Test-WorkspaceInstallReusable
    if ($reuse.state -ne $null) {
      $script:pnpmInstallFingerprint = $reuse.state.fingerprint
      $script:pnpmInstallInputs = $reuse.state.inputs
    }
    if ($reuse.reusable) {
      $script:pnpmInstallReuse = $true
      $script:pnpmInstallReuseReason = [string]$reuse.reason
      Write-Host "Skipping pnpm install: $($reuse.reason)"
      return
    }

    $script:pnpmInstallReuse = $false
    $script:pnpmInstallReuseReason = [string]$reuse.reason
    Write-Host "Running pnpm install: $($reuse.reason)"
    Invoke-Node24 -Arguments @("pnpm.cmd", "install", "--frozen-lockfile", "--prefer-offline")
    $state = if ($reuse.state -ne $null) { $reuse.state } else { Get-WorkspaceInstallState }
    $script:pnpmInstallFingerprint = $state.fingerprint
    $script:pnpmInstallInputs = $state.inputs
    Write-WorkspaceInstallState -State $state -StampPath $reuse.stampPath
  }

  Measure-Step "tools-pack build" {
    Invoke-Node24 -Arguments @("pnpm.cmd", "--filter", "@open-design/tools-pack", "build")
  }

  Measure-Step "electron dist repair" {
    Repair-ElectronDist
  }

  if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
    Measure-Step "resolve beta metadata" {
      git fetch --force --depth=1 origin "+refs/tags/open-design-v*:refs/tags/open-design-v*"

      $previousMetadataUrl = $env:OPEN_DESIGN_BETA_METADATA_URL
      $previousGitHubOutput = $env:GITHUB_OUTPUT
      try {
        $env:OPEN_DESIGN_BETA_METADATA_URL = $MetadataUrl
        $env:GITHUB_OUTPUT = $metadataOutputPath
        Remove-Item -LiteralPath $metadataOutputPath -Force -ErrorAction SilentlyContinue
        Invoke-Node24 -Arguments @("node", "--experimental-strip-types", ".\scripts\release-beta.ts")
        $metadata = Read-GitHubOutput $metadataOutputPath
        $script:ReleaseVersion = [string]$metadata["beta_version"]
      } finally {
        $env:OPEN_DESIGN_BETA_METADATA_URL = $previousMetadataUrl
        $env:GITHUB_OUTPUT = $previousGitHubOutput
      }
    }
    $ReleaseVersion = $script:ReleaseVersion
  }

  if ([string]::IsNullOrWhiteSpace($ReleaseVersion)) {
    throw "failed to resolve beta release version"
  }

  $outputNamespaceRoot = Join-Path $toolsPackDir "out\win\namespaces\$Namespace"
  $runtimeNamespaceRoot = Join-Path $toolsPackDir "runtime\win\namespaces\$Namespace"
  Measure-Step "pre-clean runtime root" {
    Remove-Item -LiteralPath $runtimeNamespaceRoot -Recurse -Force -ErrorAction SilentlyContinue
  }

  $buildArgsUnsigned = @(
    "pnpm.cmd", "exec", "tools-pack", "win", "build",
    "--dir", $toolsPackDir,
    "--cache-dir", $cacheDir,
    "--namespace", $Namespace,
    "--portable",
    "--app-version", $ReleaseVersion,
    "--to", $Target,
    "--json"
  )
  $buildArgs = @($buildArgsUnsigned)
  if ($script:windowsSigningEnabled) {
    $buildArgs += "--signed"
  }

  Measure-Step "tools-pack win build" {
    $buildResult = Invoke-ToolsPackWinBuildChecked `
      -Arguments $buildArgs `
      -OutputRoot $outputNamespaceRoot `
      -JsonPath $buildJsonPath `
      -FailurePrefix "tools-pack win build"
    $buildResult.stdoutLines | Set-Content -Path $buildJsonPath -Encoding utf8
  }

  $localUpdateArtifactPath = $null
  $localUpdateVersion = $null
  $externalUpdateMetadataUrl = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL
  $externalUpdateArtifactPath = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH
  $externalUpdateVersion = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION
  $hasExternalUpdateMetadata = -not [string]::IsNullOrWhiteSpace($externalUpdateMetadataUrl)
  $hasExternalUpdateArtifactPair = -not [string]::IsNullOrWhiteSpace($externalUpdateArtifactPath) -and -not [string]::IsNullOrWhiteSpace($externalUpdateVersion)
  if ($SmokeMode -eq "full" -and -not $hasExternalUpdateMetadata -and -not $hasExternalUpdateArtifactPair) {
    $updateFixtureVersion = Get-NextBetaFixtureVersion $ReleaseVersion
    $updateFixtureBuildJsonPath = Join-Path $platformRoot "windows-tools-pack-update-build.json"
    Remove-Item -LiteralPath $updateFixtureBuildJsonPath -Force -ErrorAction SilentlyContinue
    $updateBuildArgsUnsigned = @(
      "pnpm.cmd", "exec", "tools-pack", "win", "build",
      "--dir", $updateFixtureToolsPackDir,
      "--cache-dir", $cacheDir,
      "--namespace", $Namespace,
      "--app-version", $updateFixtureVersion,
      "--to", "nsis",
      "--json"
    )
    $updateBuildArgs = @($updateBuildArgsUnsigned)
    if ($script:windowsSigningEnabled) {
      $updateBuildArgs += "--signed"
    }

    Measure-Step "tools-pack win build update fixture" {
      $updateBuildResult = Invoke-ToolsPackWinBuildChecked `
        -Arguments $updateBuildArgs `
        -OutputRoot (Join-Path $updateFixtureToolsPackDir "out\win\namespaces\$Namespace") `
        -JsonPath $updateFixtureBuildJsonPath `
        -FailurePrefix "tools-pack win build update fixture"
      $updateBuildResult.stdoutLines | Set-Content -Path $updateFixtureBuildJsonPath -Encoding utf8
      $updateBuild = Get-Content -LiteralPath $updateFixtureBuildJsonPath -Raw | ConvertFrom-Json
      $localUpdateArtifactPath = [string]$updateBuild.installerPath
      if ([string]::IsNullOrWhiteSpace($localUpdateArtifactPath)) {
        throw "tools-pack win build update fixture did not report installerPath"
      }
      $localUpdateVersion = $updateFixtureVersion
    }
  } elseif ($SmokeMode -eq "full") {
    Write-Host "Skipping local Windows update fixture build because external update metadata or installer inputs are set"
  }

  $env:OD_PACKAGED_E2E_BUILD_JSON_PATH = $buildJsonPath
  $env:OD_PACKAGED_E2E_WIN = "1"
  $env:OD_PACKAGED_E2E_WIN_SMOKE_PROFILE = $SmokeMode
  $env:OD_PACKAGED_E2E_NAMESPACE = $Namespace
  $env:OD_PACKAGED_E2E_RELEASE_CHANNEL = "beta"
  $env:OD_PACKAGED_E2E_RELEASE_VERSION = $ReleaseVersion
  if ([string]::IsNullOrWhiteSpace($localUpdateArtifactPath)) {
    if (-not $hasExternalUpdateArtifactPair) {
      Remove-Item Env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH -ErrorAction SilentlyContinue
    }
  } else {
    $env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH = $localUpdateArtifactPath
  }
  if ([string]::IsNullOrWhiteSpace($localUpdateVersion)) {
    if (-not $hasExternalUpdateArtifactPair -and -not $hasExternalUpdateMetadata) {
      Remove-Item Env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION -ErrorAction SilentlyContinue
    }
  } else {
    $env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION = $localUpdateVersion
  }
  if ($SmokeMode -eq "full" -and -not [string]::IsNullOrWhiteSpace($localUpdateArtifactPath)) {
    $env:OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH = (Join-Path $platformRoot "windows-tools-pack-update-build.json")
  } else {
    Remove-Item Env:OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH -ErrorAction SilentlyContinue
  }

  if ($SmokeMode -eq "skip") {
    Write-Host "Skipping Windows packaged runtime smoke: smoke mode skip"
  } else {
    Measure-Step "release smoke win" {
      Remove-Item -LiteralPath $env:OD_PACKAGED_E2E_REPORT_DIR -Recurse -Force -ErrorAction SilentlyContinue
      Invoke-Node24 -Arguments @("pnpm.cmd", "exec", "tsx", "scripts/release-smoke.ts", "win", "specs/win.spec.ts") -WorkingDirectory (Join-Path $workspaceRoot "e2e")
    }
  }

  Measure-Step "write index" {
    Write-IndexAndSummary "success"
  }
  Write-IndexAndSummary "success"

  Write-Host "beta build index: $indexPath"
} catch {
  if ($script:failureMessage -eq $null) {
    $script:failureMessage = $_.Exception.Message
  }
  try {
    Write-IndexAndSummary "failed"
  } catch {
    Write-Warning "failed to write release-beta-s index: $($_.Exception.Message)"
  }
  throw
}
