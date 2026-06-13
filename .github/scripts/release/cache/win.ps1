$ErrorActionPreference = "Stop"

$cacheRoot = if ([string]::IsNullOrWhiteSpace($env:CACHE_ROOT)) {
  Join-Path $env:RUNNER_TEMP "tools-pack-cache"
} else {
  $env:CACHE_ROOT
}
if (!(Test-Path $cacheRoot)) {
  "tools-pack cache root does not exist; nothing to prune"
  exit 0
}

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue (Join-Path $cacheRoot "locks")

$maxBytes = if ([string]::IsNullOrWhiteSpace($env:TOOLS_PACK_CACHE_MAX_BYTES)) {
  24GB
} else {
  [int64]$env:TOOLS_PACK_CACHE_MAX_BYTES
}
$keepPerNode = if ([string]::IsNullOrWhiteSpace($env:TOOLS_PACK_CACHE_KEEP_PER_NODE)) {
  5
} else {
  [int]$env:TOOLS_PACK_CACHE_KEEP_PER_NODE
}
$entryRoot = Join-Path $cacheRoot "entries"
if (!(Test-Path $entryRoot)) {
  "tools-pack cache entries root does not exist; nothing to prune"
  exit 0
}

$priorityByNode = @{
  "win.workspace-build" = 0
  "win.electron-builder-dir" = 1
  "win.nsis-payload-base" = 2
  "win.packaged-app" = 3
  "win.nsis-installer" = 4
  "win.nsis-payload-overlay" = 5
  "win.resource-tree" = 6
  "win.workspace-tarballs" = 7
  "win.portable-zip" = 8
}

$entries = @(Get-ChildItem -Path $entryRoot -Directory -Recurse |
  Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
  ForEach-Object {
    $size = (Get-ChildItem -Path $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    if ($null -eq $size) {
      $size = 0
    }
    $node = Split-Path (Split-Path $_.FullName -Parent) -Leaf
    $priority = $priorityByNode[$node]
    if ($null -eq $priority) {
      $priority = 100
    }
    [pscustomobject]@{
      Path = $_.FullName
      Node = $node
      Priority = [int]$priority
      Size = [int64]$size
      LastWriteTimeUtc = $_.LastWriteTimeUtc
    }
  })

$rankByPath = @{}
$entries | Group-Object Node | ForEach-Object {
  $rank = 0
  $_.Group | Sort-Object @{ Expression = "LastWriteTimeUtc"; Descending = $true } | ForEach-Object {
    $rank += 1
    $rankByPath[$_.Path] = $rank
  }
}

$sortByProtectedRank = @{ Expression = { if ([int]$rankByPath[$_.Path] -le $keepPerNode) { 0 } else { 1 } } }
$sortByLastWrite = @{ Expression = "LastWriteTimeUtc"; Descending = $true }
$entries = $entries |
  Sort-Object $sortByProtectedRank, Priority, $sortByLastWrite

$keptBytes = 0L
$removedBytes = 0L
$removedCount = 0
foreach ($entry in $entries) {
  if (($keptBytes + $entry.Size) -le $maxBytes) {
    $keptBytes += $entry.Size
    continue
  }
  Remove-Item -Recurse -Force -LiteralPath $entry.Path
  $removedBytes += $entry.Size
  $removedCount += 1
}

"keptBytes=$keptBytes removedBytes=$removedBytes removedCount=$removedCount maxBytes=$maxBytes keepPerNode=$keepPerNode"
