param(
  [Parameter(Mandatory = $true)][string]$Request,
  [Parameter(Mandatory = $true)][string]$Receipt
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0
function Fail([string]$Message) { throw "terminal distribution: $Message" }
function Digest([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Size([string]$Path) { return (Get-Item -LiteralPath $Path).Length }
$requestValue = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
if ($requestValue.schemaVersion -ne 1) { Fail "unsupported distribution request schema" }
if ($requestValue.operation -ne "terminal.distribution.build") { Fail "invalid distribution request operation" }
$Target = [string]$requestValue.target
if ($Target -ne "win32-x64") { Fail "PowerShell distribution only supports win32-x64" }
$Scene = [string]$requestValue.sceneDirectory
$SceneSha256 = [string]$requestValue.sceneManifestSha256
$ReleaseDocuments = [string]$requestValue.releaseDocumentsDirectory
$Trust = [string]$requestValue.trustFile
$ReleaseChannel = [string]$requestValue.release.channel
$ReleaseVersion = [string]$requestValue.release.releaseVersion
$ReleaseCommit = [string]$requestValue.release.sourceCommit
$ReleasePublishedAt = [string]$requestValue.release.publishedAt
$ReleaseArtifactBaseUrl = [string]$requestValue.release.artifactBaseUrl
$Output = [string]$requestValue.outputDirectory
if ($ReleaseChannel -eq "local" -or $ReleaseChannel -notmatch '^[a-z0-9]{1,12}$') { Fail "invalid exact release channel" }
if ($ReleaseVersion -notmatch ('^\d+\.\d+\.\d+-' + [Regex]::Escape($ReleaseChannel) + '\.\d+$')) { Fail "release version does not belong to channel" }
if ($SceneSha256 -notmatch '^[a-f0-9]{64}$') { Fail "invalid scene manifest digest" }
if ($ReleaseCommit -notmatch '^[a-f0-9]{40}$') { Fail "invalid release source commit" }
$parsedPublishedAt = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse($ReleasePublishedAt, [ref]$parsedPublishedAt)) { Fail "invalid release publication time" }
$parsedArtifactBaseUrl = $null
if (-not [Uri]::TryCreate($ReleaseArtifactBaseUrl, [UriKind]::Absolute, [ref]$parsedArtifactBaseUrl) -or $parsedArtifactBaseUrl.Scheme -notin @("http", "https")) { Fail "release artifact base URL must use HTTP(S)" }
if ((Digest (Join-Path $Scene "scene.json")) -ne $SceneSha256) { Fail "scene manifest digest mismatch" }
if (-not (Test-Path -LiteralPath (Join-Path $ReleaseDocuments "content-metadata.json") -PathType Leaf)) { Fail "release document missing: content-metadata.json" }
if (-not (Test-Path -LiteralPath $Trust -PathType Leaf)) { Fail "trust document missing" }
$contentMetadata = Get-Content -LiteralPath (Join-Path $ReleaseDocuments "content-metadata.json") -Raw | ConvertFrom-Json
if ([string]$contentMetadata.metadata.channel -ne $ReleaseChannel) { Fail "content metadata channel differs from release request" }
if ([string]$contentMetadata.metadata.releaseVersion -ne $ReleaseVersion) { Fail "content metadata version differs from release request" }
if ([string]$contentMetadata.metadata.sourceCommit -ne $ReleaseCommit) { Fail "content metadata commit differs from release request" }
if ([string]$contentMetadata.metadata.publishedAt -ne $ReleasePublishedAt) { Fail "content metadata publication time differs from release request" }
[IO.Directory]::CreateDirectory($Output) | Out-Null
[IO.Directory]::CreateDirectory((Split-Path -Parent ([IO.Path]::GetFullPath($Receipt)))) | Out-Null
$stage = Join-Path ([IO.Path]::GetTempPath()) ("nexu-terminal-distribution-" + [Guid]::NewGuid().ToString("N"))
$root = Join-Path $stage "nexu-terminal"
try {
  [IO.Directory]::CreateDirectory($root) | Out-Null
  Get-ChildItem -LiteralPath $Scene -Force | Copy-Item -Destination $root -Recurse -Force
  [IO.Directory]::CreateDirectory((Join-Path $root "release")) | Out-Null
  [IO.Directory]::CreateDirectory((Join-Path $root "trust")) | Out-Null
  Copy-Item -LiteralPath (Join-Path $ReleaseDocuments "content-metadata.json") -Destination (Join-Path $root "release/content-metadata.json")
  Copy-Item -LiteralPath $Trust -Destination (Join-Path $root "trust/keys.json")
  $contractFiles = @()
  foreach ($contract in Get-ChildItem -LiteralPath (Join-Path $root "contract") -Filter "*.schema.json" | Sort-Object Name) {
    $contractFiles += [ordered]@{ file = "contract/$($contract.Name)"; sha256 = Digest $contract.FullName }
  }
  if ($contractFiles.Count -eq 0) { Fail "contract bundle is empty" }
  $contractIndexPath = Join-Path $root "contract/index.json"
  [IO.File]::WriteAllText($contractIndexPath, (([ordered]@{ files = $contractFiles; schemaVersion = 1 } | ConvertTo-Json -Compress -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
  $lock = @{}
  foreach ($line in [IO.File]::ReadAllLines((Join-Path $root "carrier.lock"))) {
    $parts = $line.Split(@('='), 2)
    if ($parts.Count -eq 2) { $lock[$parts[0]] = $parts[1] }
  }
  $sceneManifest = Get-Content -LiteralPath (Join-Path $root "scene.json") -Raw | ConvertFrom-Json
  $manifest = [ordered]@{
    capabilities = [ordered]@{ contentUpdater = "standalone-v4"; sharedInstance = "sidecar-v1"; shellUpdater = "sidecar-v1" }
    carrierLock = [ordered]@{ file = "carrier.lock"; sha256 = Digest (Join-Path $root "carrier.lock") }
    contracts = [ordered]@{ file = "contract/index.json"; sha256 = Digest $contractIndexPath }
    fixtureLifecycle = [ordered]@{ entrypoint = "runtime/fixture-lifecycle.mjs"; sha256 = Digest (Join-Path $root "runtime/fixture-lifecycle.mjs") }
    fixtureShellUpdater = [ordered]@{ entrypoint = "runtime/fixture-shell-updater.mjs"; sha256 = Digest (Join-Path $root "runtime/fixture-shell-updater.mjs") }
    fossil = [ordered]@{ entrypoint = "runtime/fossil.mjs"; sha256 = Digest (Join-Path $root "runtime/fossil.mjs") }
    releaseDocuments = [ordered]@{
      content = [ordered]@{ file = "release/content-metadata.json"; sha256 = Digest (Join-Path $root "release/content-metadata.json") }
    }
    runtime = [ordered]@{ executable = $lock.node_executable; name = "node"; sha256 = $lock.node_sha256; version = $lock.node_version }
    runtimeModules = [ordered]@{ file = "runtime/modules.json"; sha256 = Digest (Join-Path $root "runtime/modules.json") }
    schemaVersion = 1
    seed = [ordered]@{
      closure = [ordered]@{ file = "seed/closure.mjs"; sha256 = Digest (Join-Path $root "seed/closure.mjs") }
      standaloneLauncher = [ordered]@{ file = "runtime/standalone/index.mjs"; sha256 = Digest (Join-Path $root "runtime/standalone/index.mjs") }
    }
    shell = [ordered]@{ buildHash = [string]$sceneManifest.shellBuildHash; type = "terminal"; version = $lock.shell_version }
    shellFiles = [ordered]@{
      ps1 = [ordered]@{
        install = [ordered]@{ file = "ps1/install.ps1"; sha256 = Digest (Join-Path $root "ps1/install.ps1") }
        terminal = [ordered]@{ file = "ps1/terminal.ps1"; sha256 = Digest (Join-Path $root "ps1/terminal.ps1") }
      }
      sh = [ordered]@{
        install = [ordered]@{ file = "sh/install.sh"; sha256 = Digest (Join-Path $root "sh/install.sh") }
        terminal = [ordered]@{ file = "sh/terminal.sh"; sha256 = Digest (Join-Path $root "sh/terminal.sh") }
      }
    }
    sidecarBootstrap = [ordered]@{ entrypoint = "runtime/sidecar-bootstrap.mjs"; sha256 = Digest (Join-Path $root "runtime/sidecar-bootstrap.mjs") }
    sidecarHost = [ordered]@{ entrypoint = "runtime/sidecar-host.mjs"; sha256 = Digest (Join-Path $root "runtime/sidecar-host.mjs") }
    standalone = [ordered]@{ entrypoint = "runtime/standalone/index.mjs"; sha256 = Digest (Join-Path $root "runtime/standalone/index.mjs") }
    target = $Target
    trust = [ordered]@{ file = "trust/keys.json"; sha256 = Digest (Join-Path $root "trust/keys.json") }
  }
  $manifestPath = Join-Path $root "install-manifest.json"
  [IO.File]::WriteAllText($manifestPath, (($manifest | ConvertTo-Json -Compress -Depth 8) + "`n"), [Text.UTF8Encoding]::new($false))
  $manifestSha = Digest $manifestPath
  [IO.File]::WriteAllText((Join-Path $root "install-manifest.sha256"), "$manifestSha  install-manifest.json`n", [Text.UTF8Encoding]::new($false))
  $archive = Join-Path $Output "nexu-terminal-$Target-$ReleaseVersion.zip"
  Compress-Archive -LiteralPath $root -DestinationPath $archive
  $receiptValue = [ordered]@{ archive = [ordered]@{ file = [IO.Path]::GetFullPath($archive); mediaType = "application/zip"; sha256 = Digest $archive; size = Size $archive }; manifestSha256 = $manifestSha; operation = "terminal.distribution.build"; schemaVersion = 1; target = $Target }
  [IO.File]::WriteAllText($Receipt, (($receiptValue | ConvertTo-Json -Compress -Depth 5) + "`n"), [Text.UTF8Encoding]::new($false))
} finally {
  Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
}
