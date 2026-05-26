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
  $text = (Format-TableCell $Value).Replace("`", "'")
  return ('`{0}`' -f $text)
}

function Add-SummaryLine {
  param([string]$Line = "")
  $Line | Add-Content -Path $summaryPath
}

$summaryPath = $env:GITHUB_STEP_SUMMARY
$summaryTitle = if ([string]::IsNullOrWhiteSpace($env:SUMMARY_TITLE)) { "Windows tools-pack build" } else { $env:SUMMARY_TITLE }
$buildJsonPath = if ([string]::IsNullOrWhiteSpace($env:BUILD_JSON_PATH)) {
  Join-Path $env:RUNNER_TEMP "windows-tools-pack-build.json"
} else {
  $env:BUILD_JSON_PATH
}

if (!(Test-Path $buildJsonPath)) {
  Add-SummaryLine "### $summaryTitle"
  Add-SummaryLine
  Add-SummaryLine "Build JSON was not found at ``$buildJsonPath``."
  exit 0
}

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
      [pscustomobject]@{
        Node = Split-Path (Split-Path $_.FullName -Parent) -Leaf
        Size = [int64]($size ?? 0)
      }
    } |
    Group-Object Node |
    ForEach-Object {
      [pscustomobject]@{
        Node = $_.Name
        Count = $_.Count
        Size = [int64](($_.Group | Measure-Object -Property Size -Sum).Sum ?? 0)
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
