$ErrorActionPreference = "SilentlyContinue"

$repoRoot = "C:\Users\aeden\Documents\Codex\2026-04-29\https-github-com-nexu-io-open"
$pnpmCmd = "C:\Program Files\nodejs\pnpm.cmd"

Set-Location $repoRoot

Write-Host "Stopping tools-dev services..."
& $pnpmCmd tools-dev stop | Out-Host

$existing = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Stopping web process on port 3000..."
  $existing | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Open Design stopped."
