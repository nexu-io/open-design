param(
  [string]$Root,
  [Parameter(Mandatory = $true)][string]$Channel,
  [Parameter(Mandatory = $true)][string]$Namespace,
  [ValidateSet("probe", "start", "heartbeat", "release", "stop", "status", "prepare-update", "apply-update", "apply-update-force", "shell-update-status", "shell-update-check", "shell-update-download", "shell-update-install", "shell-update-later", "shell-update-force", "shell-update-confirm", "shell-update-abandon")][string]$Operation = "start",
  [string]$AttachmentId,
  [string]$AttachmentCapability,
  [string]$StoreRoot,
  [string]$ChannelHeadUrl,
  [ValidateSet("observe", "authorize-silent", "authorize-user", "revoke-silent")][string]$ActivationPolicy,
  [string]$Result,
  [string]$Feedback
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Fail([string]$Message) { throw "terminal: $Message" }
function Emit-Feedback([string]$Phase, [string]$State) {
  if (-not $Feedback) { return }
  $parent = Split-Path -Parent ([IO.Path]::GetFullPath($Feedback))
  [IO.Directory]::CreateDirectory($parent) | Out-Null
  $event = [ordered]@{ phase = $Phase; schemaVersion = 1; source = "shell"; state = $State }
  [IO.File]::AppendAllText($Feedback, (($event | ConvertTo-Json -Compress) + "`n"), [Text.UTF8Encoding]::new($false))
}
function Read-Lock([string]$Path) {
  $values = @{}
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -notmatch '^([a-z0-9_]+)=([A-Za-z0-9._/-]+)$') { Fail "invalid carrier.lock line: $line" }
    if ($values.ContainsKey($Matches[1])) { Fail "duplicate carrier.lock key: $($Matches[1])" }
    $values[$Matches[1]] = $Matches[2]
  }
  return $values
}

if (-not $Root) { $Root = Join-Path $PSScriptRoot ".." }
$Root = [IO.Path]::GetFullPath($Root)
if ($Channel -eq "local" -or $Channel -notmatch '^[a-z0-9]{1,12}$') { Fail "invalid exact channel" }
if ($Namespace -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$') { Fail "invalid namespace" }
if ($AttachmentId -and $AttachmentId -notmatch '^[A-Za-z0-9._-]{1,128}$') { Fail "invalid attachment id" }
if ($AttachmentCapability -and $AttachmentCapability -notmatch '^[a-f0-9]{64}$') { Fail "invalid attachment capability" }
if ($Operation -eq "prepare-update" -and -not $ActivationPolicy) { Fail "prepare-update requires an explicit activation policy" }

$lockPath = Join-Path $Root "carrier.lock"
$manifestPath = Join-Path $Root "install-manifest.json"
$manifestDigestPath = Join-Path $Root "install-manifest.sha256"
if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) { Fail "carrier.lock not found" }
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { Fail "install-manifest.json not found" }
if (-not (Test-Path -LiteralPath $manifestDigestPath -PathType Leaf)) { Fail "install-manifest.sha256 not found" }
$lock = Read-Lock $lockPath
foreach ($key in @("target", "shell_version", "node_version", "node_executable", "node_sha256", "fossil_entrypoint")) {
  if (-not $lock.ContainsKey($key)) { Fail "carrier.lock lacks $key" }
}
if ($lock.target -notin @("darwin-arm64", "darwin-x64", "win32-x64")) { Fail "unsupported carrier target" }
if ($lock.shell_version -notmatch '^\d+\.\d+\.\d+$' -or $lock.node_version -notmatch '^\d+\.\d+\.\d+$') { Fail "invalid carrier version" }
if ($lock.node_executable -notmatch '^carrier/node/' -or "/$($lock.node_executable)/" -match '/\.\./') { Fail "Node executable escaped carrier root" }
if ($lock.fossil_entrypoint -ne "runtime/fossil.mjs") { Fail "invalid fossil entrypoint" }
if ($lock.node_sha256 -notmatch '^[a-f0-9]{64}$') { Fail "invalid Node digest" }
Emit-Feedback "node-verification" "begin"
$nodePath = [IO.Path]::GetFullPath((Join-Path $Root $lock.node_executable))
$fossilPath = [IO.Path]::GetFullPath((Join-Path $Root $lock.fossil_entrypoint))
$rootPrefix = $Root.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $nodePath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not $fossilPath.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { Fail "carrier path escaped install root" }
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { Fail "verified Node executable is unavailable" }
if (-not (Test-Path -LiteralPath $fossilPath -PathType Leaf)) { Fail "fossil adapter is unavailable" }
$nodeDigest = (Get-FileHash -LiteralPath $nodePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($nodeDigest -ne $lock.node_sha256) { Fail "installed Node digest mismatch" }
$observedVersion = (& $nodePath --version).Trim()
if ($observedVersion -ne "v$($lock.node_version)") { Fail "installed Node version mismatch" }
Emit-Feedback "node-verification" "complete"
$manifestDigest = ([IO.File]::ReadAllText($manifestDigestPath).Trim() -split '\s+')[0].ToLowerInvariant()
if ($manifestDigest -notmatch '^[a-f0-9]{64}$') { Fail "invalid manifest digest" }
if ((Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifestDigest) { Fail "installed manifest digest mismatch" }

$exchangeRoot = Join-Path ([IO.Path]::GetTempPath()) ("nexu-terminal-" + [Guid]::NewGuid().ToString("N"))
[IO.Directory]::CreateDirectory($exchangeRoot) | Out-Null
$fossilExitCode = 0
try {
  $resolutionPath = Join-Path $exchangeRoot "carrier-resolution.json"
  $requestPath = Join-Path $exchangeRoot "fossil-request.json"
  if (-not $Result) { $Result = Join-Path $exchangeRoot "fossil-result.json" }
  $resolution = [ordered]@{
    installRoot = $Root
    manifestFile = $manifestPath
    runtime = [ordered]@{ digest = $nodeDigest; executablePath = $nodePath; name = "node"; version = $lock.node_version }
    schemaVersion = 1
    shell = [ordered]@{ digest = $manifestDigest; type = "terminal"; version = $lock.shell_version }
    target = $lock.target
  }
  [IO.File]::WriteAllText($resolutionPath, (($resolution | ConvertTo-Json -Compress -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
  $request = [ordered]@{
    carrierResolutionFile = $resolutionPath
    channel = $Channel
    namespace = $Namespace
    operation = $Operation
    schemaVersion = 1
  }
  if ($AttachmentId) { $request.attachmentId = $AttachmentId }
  if ($AttachmentCapability) { $request.attachmentCapability = $AttachmentCapability }
  if ($StoreRoot) { $request.storeRoot = [IO.Path]::GetFullPath($StoreRoot) }
  if ($ChannelHeadUrl) { $request.channelHeadUrl = $ChannelHeadUrl }
  if ($ActivationPolicy) { $request.activationPolicy = $ActivationPolicy }
  if ($Operation -in @("prepare-update", "apply-update", "apply-update-force")) { $request.updateProtocolVersion = 3 }
  if ($Feedback) { $request.feedbackFile = [IO.Path]::GetFullPath($Feedback) }
  [IO.File]::WriteAllText($requestPath, (($request | ConvertTo-Json -Compress -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
  $env:OD_TERMINAL_FOSSIL_REQUEST_V1 = $requestPath
  $env:OD_TERMINAL_FOSSIL_RESULT_V1 = $Result
  & $nodePath $fossilPath
  $fossilExitCode = $LASTEXITCODE
  if (-not (Test-Path -LiteralPath $Result -PathType Leaf)) { Fail "fossil produced no result" }
  if ($Result -like "$exchangeRoot*") { [Console]::Out.Write([IO.File]::ReadAllText($Result)) } else { Write-Output $Result }
} finally {
  Remove-Item -LiteralPath $exchangeRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item Env:OD_TERMINAL_FOSSIL_REQUEST_V1 -ErrorAction SilentlyContinue
  Remove-Item Env:OD_TERMINAL_FOSSIL_RESULT_V1 -ErrorAction SilentlyContinue
}
if ($fossilExitCode -ne 0) { exit $fossilExitCode }
