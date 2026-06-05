$ErrorActionPreference = "Stop"

function Format-TableCell {
  param([object]$Value)
  if ($null -eq $Value) {
    return ""
  }
  return ([string]$Value).Replace("|", "\|").Replace("`r", " ").Replace("`n", " ")
}

function Format-CodeCell {
  param([object]$Value)
  $text = (Format-TableCell $Value).Replace('`', "'")
  return ('`{0}`' -f $text)
}

function Add-SummaryLine {
  param([string]$Line = "")
  if ([string]::IsNullOrWhiteSpace($summaryPath)) {
    return
  }
  $Line | Add-Content -Path $summaryPath
}

function Invoke-ReportNode {
  param([string[]]$Arguments)

  $fnm = "C:\Users\runner\.cargo\bin\fnm.exe"
  if (Test-Path -LiteralPath $fnm) {
    & $fnm exec --using=24 -- node @Arguments
  } else {
    & node @Arguments
  }
  if ($LASTEXITCODE -ne 0) {
    throw "node report command failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

function Write-ReportZip {
  param(
    [string]$ReportRoot,
    [string]$ZipPath
  )

  New-Item -ItemType Directory -Force -Path $ReportRoot, (Split-Path -Parent $ZipPath) | Out-Null
  Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
  $items = @(Get-ChildItem -LiteralPath $ReportRoot -Force | Select-Object -ExpandProperty FullName)
  if ($items.Count -eq 0) {
    throw "cannot create release report zip from empty directory: $ReportRoot"
  }
  Compress-Archive -LiteralPath $items -DestinationPath $ZipPath -CompressionLevel Optimal -Force
  Write-Host "wrote release report zip: $ZipPath"
}

$summaryPath = $env:GITHUB_STEP_SUMMARY
$summaryTitle = if ([string]::IsNullOrWhiteSpace($env:SUMMARY_TITLE)) { "Windows tools-pack build" } else { $env:SUMMARY_TITLE }
$buildJsonPath = if ([string]::IsNullOrWhiteSpace($env:BUILD_JSON_PATH)) {
  Join-Path $env:RUNNER_TEMP "windows-tools-pack-build.json"
} else {
  $env:BUILD_JSON_PATH
}
$indexPath = if ([string]::IsNullOrWhiteSpace($env:INDEX_PATH)) {
  "C:\.tmp\runner\od-beta\win\index\index.json"
} else {
  $env:INDEX_PATH
}
$reportRoot = if ([string]::IsNullOrWhiteSpace($env:REPORT_ROOT)) {
  if (Test-Path -LiteralPath $indexPath) {
    $index = Get-Content -Raw -Path $indexPath | ConvertFrom-Json
    if (![string]::IsNullOrWhiteSpace([string]$index.reportDir)) {
      [string]$index.reportDir
    } else {
      Join-Path $env:RUNNER_TEMP "release-report\win"
    }
  } else {
    Join-Path $env:RUNNER_TEMP "release-report\win"
  }
} else {
  $env:REPORT_ROOT
}
$reportZipPath = if ([string]::IsNullOrWhiteSpace($env:REPORT_ZIP_PATH)) {
  Join-Path (Split-Path -Parent $reportRoot) "win-report.zip"
} else {
  $env:REPORT_ZIP_PATH
}

if (!(Test-Path $buildJsonPath)) {
  Add-SummaryLine "### $summaryTitle"
  Add-SummaryLine
  Add-SummaryLine "Build JSON was not found at ``$buildJsonPath``."
} else {
  $build = Get-Content -Raw -Path $buildJsonPath | ConvertFrom-Json
  Add-SummaryLine "### $summaryTitle"
  Add-SummaryLine
  Add-SummaryLine "| Phase | Duration |"
  Add-SummaryLine "| --- | ---: |"
  foreach ($timing in $build.timings) {
    $seconds = [math]::Round(([double]$timing.durationMs) / 1000, 1)
    Add-SummaryLine ('| {0} | {1}s |' -f (Format-CodeCell $timing.phase), $seconds)
  }

  Add-SummaryLine
  Add-SummaryLine "| Cache node | Status | Reason | Duration |"
  Add-SummaryLine "| --- | --- | --- | ---: |"
  foreach ($entry in $build.cacheReport.entries) {
    $seconds = [math]::Round(([double]$entry.durationMs) / 1000, 1)
    Add-SummaryLine ('| {0} | {1} | {2} | {3}s |' -f (Format-CodeCell $entry.nodeId), (Format-CodeCell $entry.status), (Format-TableCell $entry.reason), $seconds)
  }

  $cacheRoot = if ([string]::IsNullOrWhiteSpace($env:CACHE_ROOT)) {
    Join-Path $env:RUNNER_TEMP "tools-pack-cache"
  } else {
    $env:CACHE_ROOT
  }
  $entryRoot = Join-Path $cacheRoot "entries"
  if (Test-Path $entryRoot) {
    $entries = Get-ChildItem -Path $entryRoot -Directory -Recurse |
      Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
      ForEach-Object {
        $size = (Get-ChildItem -Path $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
          Measure-Object -Property Length -Sum).Sum
        $entrySize = if ($null -eq $size) { 0 } else { [int64]$size }
        [pscustomobject]@{
          Node = Split-Path (Split-Path $_.FullName -Parent) -Leaf
          Size = $entrySize
        }
      } |
      Group-Object Node |
      ForEach-Object {
        $nodeSize = ($_.Group | Measure-Object -Property Size -Sum).Sum
        $totalSize = if ($null -eq $nodeSize) { 0 } else { [int64]$nodeSize }
        [pscustomobject]@{
          Node = $_.Name
          Count = $_.Count
          Size = $totalSize
        }
      } |
      Sort-Object Size -Descending

    Add-SummaryLine
    Add-SummaryLine "| Saved cache node | Entries | Size |"
    Add-SummaryLine "| --- | ---: | ---: |"
    foreach ($entry in $entries) {
      $mb = [math]::Round(([double]$entry.Size) / 1MB, 1)
      Add-SummaryLine ('| {0} | {1} | {2} MB |' -f (Format-CodeCell $entry.Node), $entry.Count, $mb)
    }
  }
}

$previousReportPlatform = $env:REPORT_PLATFORM
$previousReportRoot = $env:REPORT_ROOT
$previousReportZipPath = $env:REPORT_ZIP_PATH
$previousBuildJsonPath = $env:BUILD_JSON_PATH
$previousIndexPath = $env:INDEX_PATH
try {
  $env:REPORT_PLATFORM = "win"
  $env:REPORT_ROOT = $reportRoot
  $env:REPORT_ZIP_PATH = $reportZipPath
  $env:BUILD_JSON_PATH = $buildJsonPath
  $env:INDEX_PATH = $indexPath
  Invoke-ReportNode @("--experimental-strip-types", (Join-Path $PSScriptRoot "report-json.ts"))
} finally {
  $env:REPORT_PLATFORM = $previousReportPlatform
  $env:REPORT_ROOT = $previousReportRoot
  $env:REPORT_ZIP_PATH = $previousReportZipPath
  $env:BUILD_JSON_PATH = $previousBuildJsonPath
  $env:INDEX_PATH = $previousIndexPath
}

Write-ReportZip -ReportRoot $reportRoot -ZipPath $reportZipPath
