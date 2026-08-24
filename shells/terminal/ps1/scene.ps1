param(
  [Parameter(Mandatory = $true)][string]$Request,
  [Parameter(Mandatory = $true)][string]$Receipt
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
function Fail([string]$Message) { throw "terminal scene: $Message" }
function Digest([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Size([string]$Path) { return (Get-Item -LiteralPath $Path).Length }
$requestValue = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
if ($requestValue.schemaVersion -ne 1) { Fail "unsupported scene request schema" }
if ($requestValue.operation -ne "terminal.scene.build") { Fail "invalid scene request operation" }
$Target = [string]$requestValue.target
if ($Target -ne "win32-x64") { Fail "PowerShell scene only supports win32-x64" }
$ShellVersion = [string]$requestValue.shellVersion
$NodeVersion = [string]$requestValue.node.version
$NodeArchive = [string]$requestValue.node.archiveFile
$NodeArchiveSha256 = [string]$requestValue.node.archiveSha256
$Closure = [string]$requestValue.closureArtifactFile
$Standalone = [string]$requestValue.standaloneDirectory
$Scene = [string]$requestValue.sceneDirectory
if ($ShellVersion -notmatch '^\d+\.\d+\.\d+$') { Fail "invalid Shell version" }
if ($NodeArchiveSha256 -notmatch '^[a-f0-9]{64}$') { Fail "invalid Node archive digest" }
$terminalSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$nodeLock = Get-Content (Join-Path $terminalSource "node-lock.json") -Raw | ConvertFrom-Json
$lockedProperty = $nodeLock.targets.PSObject.Properties[$Target]
$locked = if ($null -eq $lockedProperty) { $null } else { $lockedProperty.Value }
if (-not $locked) { Fail "Node lock does not support $Target" }
if ($NodeVersion -ne $nodeLock.version) { Fail "official Node version differs from lock" }
if ([IO.Path]::GetFileName($NodeArchive) -ne $locked.archive) { Fail "official Node archive name differs from lock" }
if ($NodeArchiveSha256 -ne $locked.sha256) { Fail "official Node archive digest differs from lock" }
if ((Digest $NodeArchive) -ne $NodeArchiveSha256) { Fail "official Node archive digest mismatch" }
if (-not (Test-Path -LiteralPath (Join-Path $Standalone "index.mjs") -PathType Leaf)) { Fail "Standalone build artifact missing" }
$sceneParent = Split-Path -Parent ([IO.Path]::GetFullPath($Scene))
[IO.Directory]::CreateDirectory($sceneParent) | Out-Null
[IO.Directory]::CreateDirectory((Split-Path -Parent ([IO.Path]::GetFullPath($Receipt)))) | Out-Null
$stage = Join-Path $sceneParent (".terminal-scene-" + [Guid]::NewGuid().ToString("N"))
$extract = Join-Path $sceneParent (".terminal-node-" + [Guid]::NewGuid().ToString("N"))
try {
  [IO.Directory]::CreateDirectory($stage) | Out-Null
  Expand-Archive -LiteralPath $NodeArchive -DestinationPath $extract
  $roots = @(Get-ChildItem -LiteralPath $extract -Directory)
  if ($roots.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $roots[0].FullName "node.exe") -PathType Leaf)) { Fail "official Node archive layout is invalid" }
  $observedVersion = (& (Join-Path $roots[0].FullName "node.exe") --version).Trim()
  if ($observedVersion -ne "v$NodeVersion") { Fail "official Node version mismatch" }
  [IO.Directory]::CreateDirectory((Join-Path $stage "carrier")) | Out-Null
  Move-Item -LiteralPath $roots[0].FullName -Destination (Join-Path $stage "carrier/node")
  foreach ($directory in @("runtime/standalone", "seed", "sh", "ps1", "contract")) { [IO.Directory]::CreateDirectory((Join-Path $stage $directory)) | Out-Null }
  Copy-Item -LiteralPath (Join-Path $Standalone "index.mjs") -Destination (Join-Path $stage "runtime/standalone/index.mjs")
  Copy-Item -LiteralPath $Closure -Destination (Join-Path $stage "seed/closure.mjs")
  Copy-Item -LiteralPath (Join-Path $terminalSource "runtime/fossil.mjs") -Destination (Join-Path $stage "runtime/fossil.mjs")
  Copy-Item -LiteralPath (Join-Path $terminalSource "runtime/fixture-lifecycle.mjs") -Destination (Join-Path $stage "runtime/fixture-lifecycle.mjs")
  Get-ChildItem -LiteralPath (Join-Path $terminalSource "sh") -File | Where-Object Name -In @("terminal.sh", "install.sh") | Copy-Item -Destination (Join-Path $stage "sh")
  Get-ChildItem -LiteralPath (Join-Path $terminalSource "ps1") -File | Where-Object Name -In @("terminal.ps1", "install.ps1") | Copy-Item -Destination (Join-Path $stage "ps1")
  Get-ChildItem -LiteralPath (Join-Path $terminalSource "contract") -Filter "*.json" | Copy-Item -Destination (Join-Path $stage "contract")
  $nodeSha = Digest (Join-Path $stage "carrier/node/node.exe")
  $fossilSha = Digest (Join-Path $stage "runtime/fossil.mjs")
  $fixtureLifecycleSha = Digest (Join-Path $stage "runtime/fixture-lifecycle.mjs")
  $standaloneSha = Digest (Join-Path $stage "runtime/standalone/index.mjs")
  $closureSha = Digest (Join-Path $stage "seed/closure.mjs")
  $lock = @("schema=1", "target=$Target", "shell_version=$ShellVersion", "node_version=$NodeVersion", "node_executable=carrier/node/node.exe", "node_sha256=$nodeSha", "fossil_entrypoint=runtime/fossil.mjs") -join "`n"
  [IO.File]::WriteAllText((Join-Path $stage "carrier.lock"), "$lock`n", [Text.UTF8Encoding]::new($false))
  $sceneManifest = [ordered]@{
    closure = [ordered]@{ file = "seed/closure.mjs"; sha256 = $closureSha; size = Size (Join-Path $stage "seed/closure.mjs") }
    fixtureLifecycle = [ordered]@{ entrypoint = "runtime/fixture-lifecycle.mjs"; sha256 = $fixtureLifecycleSha }
    fossil = [ordered]@{ entrypoint = "runtime/fossil.mjs"; sha256 = $fossilSha }
    node = [ordered]@{ archiveSha256 = $NodeArchiveSha256; executable = "carrier/node/node.exe"; executableSha256 = $nodeSha; version = $NodeVersion }
    schemaVersion = 1; shellVersion = $ShellVersion
    standalone = [ordered]@{ entrypoint = "runtime/standalone/index.mjs"; sha256 = $standaloneSha }
    target = $Target
  }
  [IO.File]::WriteAllText((Join-Path $stage "scene.json"), (($sceneManifest | ConvertTo-Json -Compress -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
  $sceneSha = Digest (Join-Path $stage "scene.json")
  if (Test-Path -LiteralPath $Scene) { Fail "scene destination already exists" }
  Move-Item -LiteralPath $stage -Destination $Scene
  $receiptValue = [ordered]@{ operation = "terminal.scene.build"; products = @([ordered]@{ name = "scene.json"; sha256 = $sceneSha; size = Size (Join-Path $Scene "scene.json") }); sceneDirectory = [IO.Path]::GetFullPath($Scene); sceneManifestSha256 = $sceneSha; schemaVersion = 1; target = $Target }
  [IO.File]::WriteAllText($Receipt, (($receiptValue | ConvertTo-Json -Compress -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $extract -Recurse -Force -ErrorAction SilentlyContinue
}
