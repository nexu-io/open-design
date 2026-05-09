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

$maxBytes = 6GB
$entryRoot = Join-Path $cacheRoot "entries"
if (!(Test-Path $entryRoot)) {
  "tools-pack cache entries root does not exist; nothing to prune"
  exit 0
}

$discardedBytes = 0L
$discardedCount = 0
$packagedAppRoot = Join-Path $entryRoot "win.packaged-app"
if (Test-Path $packagedAppRoot) {
  $packagedAppEntries = Get-ChildItem -Path $packagedAppRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") }
  foreach ($entry in $packagedAppEntries) {
    $size = (Get-ChildItem -Path $entry.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    Remove-Item -Recurse -Force -LiteralPath $entry.FullName
    $discardedBytes += [int64]($size ?? 0)
    $discardedCount += 1
  }
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $packagedAppRoot
}

$priorityByNode = @{
  "win.electron-builder-dir" = 0
  "win.workspace-build" = 1
  "win.resource-tree" = 2
  "win.workspace-tarballs" = 3
}

$entries = Get-ChildItem -Path $entryRoot -Directory -Recurse |
  Where-Object { Test-Path (Join-Path $_.FullName "manifest.json") } |
  ForEach-Object {
    $size = (Get-ChildItem -Path $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
      Measure-Object -Property Length -Sum).Sum
    $node = Split-Path (Split-Path $_.FullName -Parent) -Leaf
    [pscustomobject]@{
      Path = $_.FullName
      Node = $node
      Priority = [int]($priorityByNode[$node] ?? 100)
      Size = [int64]($size ?? 0)
      LastWriteTimeUtc = $_.LastWriteTimeUtc
    }
  } |
  Sort-Object Priority, @{ Expression = "LastWriteTimeUtc"; Descending = $true }

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

"keptBytes=$keptBytes removedBytes=$removedBytes removedCount=$removedCount discardedBytes=$discardedBytes discardedCount=$discardedCount maxBytes=$maxBytes"
