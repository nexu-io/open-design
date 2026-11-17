$ErrorActionPreference = "Stop"
$cacheRoot = if ([string]::IsNullOrWhiteSpace($env:CACHE_ROOT)) {
  Join-Path $env:RUNNER_TEMP "tools-pack-cache"
} else {
  $env:CACHE_ROOT
}
node "$PSScriptRoot/windows.ts" $cacheRoot
if ($LASTEXITCODE -ne 0) { throw "Windows cache pruning failed" }
