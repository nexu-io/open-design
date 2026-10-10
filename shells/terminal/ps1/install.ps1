param(
  [string]$Source = (Join-Path $PSScriptRoot ".."),
  [Parameter(Mandatory = $true)][string]$Root,
  [Parameter(Mandatory = $true)][string]$Channel,
  [Parameter(Mandatory = $true)][string]$Namespace
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Fail([string]$Message) { throw "terminal install: $Message" }
$Source = [IO.Path]::GetFullPath($Source)
$Root = [IO.Path]::GetFullPath($Root)
$manifest = Join-Path $Source "install-manifest.json"
$digestFile = Join-Path $Source "install-manifest.sha256"
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { Fail "source manifest missing" }
$expected = (([IO.File]::ReadAllText($digestFile).Trim() -split '\s+')[0]).ToLowerInvariant()
if ((Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { Fail "source manifest digest mismatch" }
$parent = Split-Path -Parent $Root
[IO.Directory]::CreateDirectory($parent) | Out-Null
$stage = Join-Path $parent (".terminal-install-" + [Guid]::NewGuid().ToString("N"))
$previous = Join-Path $parent (".terminal-previous-" + [Guid]::NewGuid().ToString("N"))
try {
  [IO.Directory]::CreateDirectory($stage) | Out-Null
  Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $stage -Recurse -Force
  & (Join-Path $stage "ps1/terminal.ps1") -Root $stage -Channel $Channel -Namespace $Namespace -Operation probe | Out-Null
  if (Test-Path -LiteralPath $Root) { Move-Item -LiteralPath $Root -Destination $previous }
  try { Move-Item -LiteralPath $stage -Destination $Root }
  catch {
    if (Test-Path -LiteralPath $previous) { Move-Item -LiteralPath $previous -Destination $Root }
    throw
  }
  if (Test-Path -LiteralPath $previous) { Remove-Item -LiteralPath $previous -Recurse -Force }
} finally {
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
}
& (Join-Path $Root "ps1/terminal.ps1") -Root $Root -Channel $Channel -Namespace $Namespace -Operation probe
