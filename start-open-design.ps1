$ErrorActionPreference = "Stop"

$repoRoot = "C:\Users\aeden\Documents\Codex\2026-04-29\https-github-com-nexu-io-open"
$webDir = Join-Path $repoRoot "apps\web"
$pnpmCmd = "C:\Program Files\nodejs\pnpm.cmd"
$nodeVersion = "24.7.0"

Set-Location $repoRoot

Write-Host "Using Node $nodeVersion..."
nvm use $nodeVersion | Out-Host

Write-Host "Starting daemon..."
& $pnpmCmd tools-dev start daemon | Out-Host

$statusOutput = & $pnpmCmd tools-dev status | Out-String
$daemonUrl = [regex]::Match($statusOutput, 'http://127\.0\.0\.1:(\d+)').Value
if (-not $daemonUrl) {
  throw "Unable to detect daemon URL from tools-dev status."
}
$daemonPort = [regex]::Match($daemonUrl, ':(\d+)$').Groups[1].Value

Write-Host "Daemon URL: $daemonUrl"
Write-Host "Restarting web dev server on localhost:3000..."

$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  $existing | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

$env:OD_PORT = $daemonPort
Start-Process -FilePath $pnpmCmd -ArgumentList "dev" -WorkingDirectory $webDir

Start-Sleep -Seconds 6
$listening = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
  Write-Warning "Web server not detected on port 3000 yet. Check terminal logs in apps/web."
} else {
  Write-Host "Open Design is running:"
  Write-Host "- Daemon: $daemonUrl"
  Write-Host "- Web:    http://localhost:3000"
}
