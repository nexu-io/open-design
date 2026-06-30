<#
.SYNOPSIS
  Lock pnpm to the version pinned in package.json#packageManager.
  Run this after cloning and before any pnpm install / pnpm tools-dev command.

  This repo requires pnpm >=10.33.2 <11.
  On Windows, bare `pnpm` may drift to 11.x via npm global updates.
  This script ensures the correct version is activated via Corepack.
  All commands in this repo should be prefixed with `corepack pnpm`, not bare `pnpm`.
#>

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pkg = Get-Content -Raw -Path (Join-Path $scriptDir '..\package.json') | ConvertFrom-Json
$required = $pkg.packageManager.Split('@')[1]

Write-Host "Activating pnpm@${required} via corepack..."
corepack prepare "pnpm@$required" --activate

Write-Host "Verifying with corepack pnpm..."
$current = & corepack pnpm --version 2>$null

if ($current -ne $required) {
    Write-Error "Expected pnpm $required, got $current"
    exit 1
}

Write-Host "corepack pnpm $current is active — use 'corepack pnpm' for all commands in this repo"
