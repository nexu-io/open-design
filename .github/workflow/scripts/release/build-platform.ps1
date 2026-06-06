param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("win_x64")]
  [string]$ReleaseTarget,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseNamespace,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseVersion,
  [Parameter(Mandatory = $true)]
  [ValidateSet("skip", "core", "full")]
  [string]$SmokeMode,
  [Parameter(Mandatory = $true)]
  [ValidateSet("all", "dir", "nsis", "zip")]
  [string]$BuildTarget,
  [Parameter(Mandatory = $true)]
  [ValidateSet("off", "on")]
  [string]$SignMode,
  [Parameter(Mandatory = $true)]
  [string]$WorkRoot,
  [Parameter(Mandatory = $true)]
  [string]$ToolsPackDir,
  [Parameter(Mandatory = $true)]
  [string]$CacheDir,
  [Parameter(Mandatory = $true)]
  [string]$BuildJsonPath,
  [Parameter(Mandatory = $true)]
  [string]$IndexPath,
  [Parameter(Mandatory = $true)]
  [string]$ReportRoot,
  [Parameter(Mandatory = $true)]
  [string]$OutputsPath
)

$ErrorActionPreference = "Stop"
$startedAt = Get-Date
$timings = @()
$failureMessage = $null

function Format-Duration([int64]$Milliseconds) {
  if ($Milliseconds -ge 60000) {
    return "$([Math]::Round($Milliseconds / 60000, 1))m"
  }
  return "$([Math]::Round($Milliseconds / 1000, 1))s"
}

function Measure-Step([string]$Name, [scriptblock]$Script) {
  Write-Host "##[group]$Name"
  $started = Get-Date
  try {
    $result = & $Script
    $durationMs = [int64]((Get-Date) - $started).TotalMilliseconds
    $script:timings += [ordered]@{ step = $Name; status = "success"; durationMs = $durationMs }
    Write-Host "[$Name] success in $(Format-Duration $durationMs)"
    return $result
  } catch {
    $durationMs = [int64]((Get-Date) - $started).TotalMilliseconds
    $script:timings += [ordered]@{ step = $Name; status = "failed"; durationMs = $durationMs; error = $_.Exception.Message }
    $script:failureMessage = $_.Exception.Message
    Write-Host "[$Name] failed in $(Format-Duration $durationMs)"
    throw
  } finally {
    Write-Host "##[endgroup]"
  }
}

function Write-JsonFile([string]$Path, [object]$Value, [int]$Depth = 10) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  $Value | ConvertTo-Json -Depth $Depth | Set-Content -LiteralPath $Path -Encoding utf8
}

function Read-BuildJson {
  if (-not (Test-Path -LiteralPath $BuildJsonPath)) {
    return $null
  }
  return Get-Content -LiteralPath $BuildJsonPath -Raw -Encoding utf8 | ConvertFrom-Json
}

function Get-SmokeSummary {
  $summaryJsonPath = Join-Path $ReportRoot "summary.json"
  if (-not (Test-Path -LiteralPath $summaryJsonPath)) {
    return $null
  }
  return Get-Content -LiteralPath $summaryJsonPath -Raw -Encoding utf8 | ConvertFrom-Json
}

function Write-Index([string]$Status) {
  $durationMs = [int64]((Get-Date) - $startedAt).TotalMilliseconds
  $build = Read-BuildJson
  $artifacts = $null
  if ($build -ne $null) {
    $artifacts = [ordered]@{
      installerPath = $build.installerPath
      latestYmlPath = $build.latestYmlPath
      outputRoot = $build.outputRoot
      portableZipPath = $build.portableZipPath
    }
  }
  $index = [ordered]@{
    artifacts = $artifacts
    branch = $env:RELEASE_BRANCH
    buildJsonPath = $BuildJsonPath
    cacheDir = $CacheDir
    channel = "beta"
    commit = $env:RELEASE_COMMIT
    durationMs = $durationMs
    failure = $script:failureMessage
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    namespace = $ReleaseNamespace
    platform = "win"
    releaseTarget = $ReleaseTarget
    releaseVersion = $ReleaseVersion
    reportDir = $ReportRoot
    signed = $SignMode -eq "on"
    smoke = Get-SmokeSummary
    smokeMode = $SmokeMode
    status = $Status
    target = $BuildTarget
    timings = $script:timings
    toolsPackDir = $ToolsPackDir
  }
  Write-JsonFile -Path $IndexPath -Value $index -Depth 10
  Write-JsonFile -Path $OutputsPath -Value ([ordered]@{
    build_json_path = $BuildJsonPath
    index_path = $IndexPath
    release_target = $ReleaseTarget
    release_version = $ReleaseVersion
  }) -Depth 5
}

function Invoke-CommandChecked([string[]]$Arguments, [string]$WorkingDirectory = (Get-Location).Path) {
  Push-Location -LiteralPath $WorkingDirectory
  try {
    & $Arguments[0] @($Arguments | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
      throw "command failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

New-Item -ItemType Directory -Force -Path $WorkRoot, $ToolsPackDir, $CacheDir, $ReportRoot, (Split-Path -Parent $BuildJsonPath), (Split-Path -Parent $IndexPath), (Split-Path -Parent $OutputsPath) | Out-Null
Remove-Item -LiteralPath $BuildJsonPath -Force -ErrorAction SilentlyContinue

try {
  $buildArgs = @(
    "pnpm.cmd", "exec", "tools-pack", "win", "build",
    "--dir", $ToolsPackDir,
    "--cache-dir", $CacheDir,
    "--namespace", $ReleaseNamespace,
    "--portable",
    "--app-version", $ReleaseVersion,
    "--to", $BuildTarget,
    "--json"
  )
  if ($SignMode -eq "on") {
    $buildArgs += "--signed"
  }

  Measure-Step "tools-pack win build" {
    $buildOutput = & $buildArgs[0] @($buildArgs | Select-Object -Skip 1)
    if ($LASTEXITCODE -ne 0) {
      throw "tools-pack win build failed with exit code $LASTEXITCODE"
    }
    $buildOutput | Set-Content -LiteralPath $BuildJsonPath -Encoding utf8
  }

  $localUpdateArtifactPath = $null
  $localUpdateVersion = $null
  $externalUpdateMetadataUrl = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL
  $externalUpdateArtifactPath = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH
  $externalUpdateVersion = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION
  $hasExternalUpdateMetadata = -not [string]::IsNullOrWhiteSpace($externalUpdateMetadataUrl)
  $hasExternalUpdateArtifactPair = -not [string]::IsNullOrWhiteSpace($externalUpdateArtifactPath) -and -not [string]::IsNullOrWhiteSpace($externalUpdateVersion)

  if ($SmokeMode -eq "full" -and -not $hasExternalUpdateMetadata -and -not $hasExternalUpdateArtifactPair) {
    $match = [System.Text.RegularExpressions.Regex]::Match($ReleaseVersion, '^(?<base>\d+\.\d+\.\d+)-beta\.(?<number>\d+)$')
    if (-not $match.Success) {
      throw "full Windows smoke requires a beta version like x.y.z-beta.N; got $ReleaseVersion"
    }
    $localUpdateVersion = "$($match.Groups['base'].Value)-beta.$([int]$match.Groups['number'].Value + 1)"
    $fixtureDir = Join-Path $WorkRoot "tools-pack-update-fixture"
    $fixtureJsonPath = Join-Path $WorkRoot "windows-tools-pack-update-build.json"
    $updateArgs = @(
      "pnpm.cmd", "exec", "tools-pack", "win", "build",
      "--dir", $fixtureDir,
      "--cache-dir", $CacheDir,
      "--namespace", $ReleaseNamespace,
      "--app-version", $localUpdateVersion,
      "--to", "nsis",
      "--json"
    )
    if ($SignMode -eq "on") {
      $updateArgs += "--signed"
    }
    Measure-Step "tools-pack win build update fixture" {
      $updateOutput = & $updateArgs[0] @($updateArgs | Select-Object -Skip 1)
      if ($LASTEXITCODE -ne 0) {
        throw "tools-pack win update fixture build failed with exit code $LASTEXITCODE"
      }
      $updateOutput | Set-Content -LiteralPath $fixtureJsonPath -Encoding utf8
      $updateBuild = Get-Content -LiteralPath $fixtureJsonPath -Raw | ConvertFrom-Json
      $localUpdateArtifactPath = [string]$updateBuild.installerPath
      if ([string]::IsNullOrWhiteSpace($localUpdateArtifactPath)) {
        throw "tools-pack win build update fixture did not report installerPath"
      }
    }
  }

  if ($SmokeMode -eq "skip") {
    Write-Host "Skipping Windows packaged runtime smoke: smoke mode skip"
  } else {
    $previous = @{
      OD_PACKAGED_E2E_BUILD_JSON_PATH = $env:OD_PACKAGED_E2E_BUILD_JSON_PATH
      OD_PACKAGED_E2E_WIN = $env:OD_PACKAGED_E2E_WIN
      OD_PACKAGED_E2E_WIN_SMOKE_PROFILE = $env:OD_PACKAGED_E2E_WIN_SMOKE_PROFILE
      OD_PACKAGED_E2E_NAMESPACE = $env:OD_PACKAGED_E2E_NAMESPACE
      OD_PACKAGED_E2E_RELEASE_CHANNEL = $env:OD_PACKAGED_E2E_RELEASE_CHANNEL
      OD_PACKAGED_E2E_RELEASE_VERSION = $env:OD_PACKAGED_E2E_RELEASE_VERSION
      OD_PACKAGED_E2E_REPORT_DIR = $env:OD_PACKAGED_E2E_REPORT_DIR
      OD_PACKAGED_E2E_TOOLS_PACK_DIR = $env:OD_PACKAGED_E2E_TOOLS_PACK_DIR
      OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH = $env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH
      OD_PACKAGED_E2E_WIN_UPDATE_VERSION = $env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION
      OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH = $env:OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH
    }
    try {
      $env:OD_PACKAGED_E2E_BUILD_JSON_PATH = $BuildJsonPath
      $env:OD_PACKAGED_E2E_WIN = "1"
      $env:OD_PACKAGED_E2E_WIN_SMOKE_PROFILE = $SmokeMode
      $env:OD_PACKAGED_E2E_NAMESPACE = $ReleaseNamespace
      $env:OD_PACKAGED_E2E_RELEASE_CHANNEL = "beta"
      $env:OD_PACKAGED_E2E_RELEASE_VERSION = $ReleaseVersion
      $env:OD_PACKAGED_E2E_REPORT_DIR = $ReportRoot
      $env:OD_PACKAGED_E2E_TOOLS_PACK_DIR = $ToolsPackDir
      if (-not [string]::IsNullOrWhiteSpace($localUpdateArtifactPath)) {
        $env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH = $localUpdateArtifactPath
        $env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION = $localUpdateVersion
        $env:OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH = Join-Path $WorkRoot "windows-tools-pack-update-build.json"
      }
      Measure-Step "release smoke win" {
        Remove-Item -LiteralPath $ReportRoot -Recurse -Force -ErrorAction SilentlyContinue
        Invoke-CommandChecked -Arguments @("pnpm.cmd", "exec", "tsx", "scripts/release-smoke.ts", "win", "specs/win.spec.ts") -WorkingDirectory (Join-Path (Get-Location).Path "e2e")
      }
    } finally {
      foreach ($key in $previous.Keys) {
        if ([string]::IsNullOrWhiteSpace([string]$previous[$key])) {
          Remove-Item "Env:$key" -ErrorAction SilentlyContinue
        } else {
          [Environment]::SetEnvironmentVariable($key, [string]$previous[$key], "Process")
        }
      }
    }
  }

  Write-Index "success"
  Write-Host "beta build index: $IndexPath"
} catch {
  if ($script:failureMessage -eq $null) {
    $script:failureMessage = $_.Exception.Message
  }
  try {
    Write-Index "failed"
  } catch {
    Write-Warning "failed to write beta build index: $($_.Exception.Message)"
  }
  throw
}
