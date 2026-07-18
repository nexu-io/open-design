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
$ReleaseChannel = [string]$env:RELEASE_CHANNEL
if ([string]::IsNullOrWhiteSpace($ReleaseChannel)) {
  throw "RELEASE_CHANNEL is required"
}

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
      payloadPath = $build.payloadPath
      portableZipPath = $build.portableZipPath
    }
  }
  $index = [ordered]@{
    artifacts = $artifacts
    branch = $env:RELEASE_BRANCH
    buildJsonPath = $BuildJsonPath
    cacheDir = $CacheDir
    channel = $ReleaseChannel
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

function Convert-ArchiveRelativePath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "archive relative path must not be empty"
  }
  if ([System.IO.Path]::IsPathRooted($Value) -or $Value.Contains("..")) {
    throw "unsafe archive relative path: $Value"
  }
  return $Value.Replace("/", [System.IO.Path]::DirectorySeparatorChar).Replace("\", [System.IO.Path]::DirectorySeparatorChar)
}

function Test-JsonString([object]$Value, [string]$Name, [string]$Expected) {
  $actual = [string]$Value
  if ($actual -ne $Expected) {
    throw "launcher payload manifest $Name expected '$Expected' but got '$actual'"
  }
}

function Validate-WinLauncherPayloadArchive([string]$PayloadPath, [string]$ExpectedVersion, [string]$Label) {
  if ([string]::IsNullOrWhiteSpace($PayloadPath) -or -not (Test-Path -LiteralPath $PayloadPath)) {
    throw "expected launcher payload path for $Label not found at $PayloadPath"
  }

  $sevenZipExe = Join-Path (Get-Location).Path "tools\pack\resources\win\7zip\7z.exe"
  if (-not (Test-Path -LiteralPath $sevenZipExe)) {
    throw "bundled 7z.exe not found at $sevenZipExe"
  }

  $extractRoot = Join-Path $WorkRoot "validate-launcher-payload-$Label"
  Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  try {
    & $sevenZipExe x $PayloadPath "-o$extractRoot" -y | Write-Host
    if ($LASTEXITCODE -ne 0) {
      throw "launcher payload extraction failed with exit code $LASTEXITCODE for $PayloadPath"
    }

    $manifestPath = Join-Path $extractRoot "manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath)) {
      throw "launcher payload manifest not found after extraction: $manifestPath"
    }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8 | ConvertFrom-Json
    Test-JsonString $manifest.schemaVersion "schemaVersion" "1"
    Test-JsonString $manifest.channel "channel" $ReleaseChannel
    Test-JsonString $manifest.namespace "namespace" $ReleaseNamespace
    Test-JsonString $manifest.version "version" $ExpectedVersion
    Test-JsonString $manifest.platform "platform" "win32"
    Test-JsonString $manifest.payloadRoot "payloadRoot" "payload"
    Test-JsonString $manifest.entry.cwd "entry.cwd" "payload"
    Test-JsonString $manifest.entry.executable "entry.executable" "payload/Open Design.exe"

    $entryPath = Join-Path $extractRoot (Convert-ArchiveRelativePath "payload/Open Design.exe")
    if (-not (Test-Path -LiteralPath $entryPath)) {
      throw "launcher payload entry executable not found after extraction: $entryPath"
    }
    $configPath = Join-Path $extractRoot (Convert-ArchiveRelativePath "payload/resources/open-design-config.json")
    if (-not (Test-Path -LiteralPath $configPath)) {
      throw "launcher payload packaged config not found after extraction: $configPath"
    }
  } finally {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Resolve-LocalUpdateVersion([string]$Channel, [string]$Version) {
  if ($Channel -eq "stable") {
    $stableMatch = [System.Text.RegularExpressions.Regex]::Match($Version, "^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$")
    if (-not $stableMatch.Success) {
      throw "full Windows stable smoke requires stable version x.y.z; got $Version"
    }
    return "{0}.{1}.{2}" -f $stableMatch.Groups['major'].Value, $stableMatch.Groups['minor'].Value, ([int]$stableMatch.Groups['patch'].Value + 1)
  }

  $releaseChannelPattern = [System.Text.RegularExpressions.Regex]::Escape($Channel)
  $match = [System.Text.RegularExpressions.Regex]::Match($Version, "^(?<base>\d+\.\d+\.\d+)-$releaseChannelPattern\.(?<number>\d+)$")
  if (-not $match.Success) {
    throw "full Windows smoke requires a counted version like x.y.z-$Channel.N; got $Version"
  }
  return "{0}-{1}.{2}" -f $match.Groups['base'].Value, $Channel, ([int]$match.Groups['number'].Value + 1)
}

New-Item -ItemType Directory -Force -Path $WorkRoot, $ToolsPackDir, $CacheDir, $ReportRoot, (Split-Path -Parent $BuildJsonPath), (Split-Path -Parent $IndexPath), (Split-Path -Parent $OutputsPath) | Out-Null
Remove-Item -LiteralPath $BuildJsonPath -Force -ErrorAction SilentlyContinue

try {
  Measure-Step "clean tools-pack win namespace" {
    Invoke-CommandChecked -Arguments @(
      "pnpm.cmd", "exec", "tools-pack", "win", "cleanup",
      "--dir", $ToolsPackDir,
      "--namespace", $ReleaseNamespace,
      "--json"
    )
  }

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
  Measure-Step "validate launcher payload artifact" {
    $build = Read-BuildJson
    if ($build -eq $null) {
      throw "build json missing before launcher payload validation: $BuildJsonPath"
    }
    Validate-WinLauncherPayloadArchive -PayloadPath ([string]$build.payloadPath) -ExpectedVersion $ReleaseVersion -Label "primary"
  }

  $localUpdateArtifactPath = $null
  $localUpdateVersion = $null
  $externalUpdateMetadataUrl = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_METADATA_URL
  $externalUpdateArtifactPath = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH
  $externalUpdateVersion = [string]$env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION
  $hasExternalUpdateMetadata = -not [string]::IsNullOrWhiteSpace($externalUpdateMetadataUrl)
  $hasExternalUpdateArtifactPair = -not [string]::IsNullOrWhiteSpace($externalUpdateArtifactPath) -and -not [string]::IsNullOrWhiteSpace($externalUpdateVersion)

  if ($SmokeMode -eq "full" -and -not $hasExternalUpdateMetadata -and -not $hasExternalUpdateArtifactPair) {
    $localUpdateVersion = Resolve-LocalUpdateVersion -Channel $ReleaseChannel -Version $ReleaseVersion
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
    Measure-Step "validate launcher payload update fixture" {
      $updateBuild = Get-Content -LiteralPath $fixtureJsonPath -Raw | ConvertFrom-Json
      Validate-WinLauncherPayloadArchive -PayloadPath ([string]$updateBuild.payloadPath) -ExpectedVersion $localUpdateVersion -Label "update-fixture"
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
      OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE = $env:OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE
      OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH = $env:OD_PACKAGED_E2E_WIN_UPDATE_ARTIFACT_PATH
      OD_PACKAGED_E2E_WIN_UPDATE_VERSION = $env:OD_PACKAGED_E2E_WIN_UPDATE_VERSION
      OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH = $env:OD_PACKAGED_E2E_WIN_UPDATE_BUILD_JSON_PATH
    }
    try {
      $env:OD_PACKAGED_E2E_BUILD_JSON_PATH = $BuildJsonPath
      $env:OD_PACKAGED_E2E_WIN = "1"
      $env:OD_PACKAGED_E2E_WIN_SMOKE_PROFILE = $SmokeMode
      $env:OD_PACKAGED_E2E_NAMESPACE = $ReleaseNamespace
      $env:OD_PACKAGED_E2E_RELEASE_CHANNEL = $ReleaseChannel
      $env:OD_PACKAGED_E2E_RELEASE_VERSION = $ReleaseVersion
      $env:OD_PACKAGED_E2E_REPORT_DIR = $ReportRoot
      $env:OD_PACKAGED_E2E_TOOLS_PACK_DIR = $ToolsPackDir
      if (-not [string]::IsNullOrWhiteSpace($localUpdateArtifactPath)) {
        $env:OD_PACKAGED_E2E_WIN_UPDATE_FIXTURE = "tools-serve"
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
  Write-Host "$ReleaseChannel build index: $IndexPath"
} catch {
  if ($script:failureMessage -eq $null) {
    $script:failureMessage = $_.Exception.Message
  }
  try {
    Write-Index "failed"
  } catch {
    Write-Warning "failed to write $ReleaseChannel build index: $($_.Exception.Message)"
  }
  throw
}
