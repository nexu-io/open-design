param(
  [string]$ManifestRoot = "",
  [string]$ChannelPrefix = "beta",
  [switch]$Publish
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "publish-beta-common.ps1")

$channel = Assert-SafePrefix $ChannelPrefix
if ([string]::IsNullOrWhiteSpace($ManifestRoot)) {
  $ManifestRoot = Join-Path $env:RUNNER_TEMP "release-platform-manifests"
}
if (-not (Test-Path -LiteralPath $ManifestRoot)) {
  throw "platform manifest root not found: $ManifestRoot"
}

$platformDefs = @(
  [ordered]@{ key = "win"; label = "Windows x64"; enabled = $true }
)

$platforms = [ordered]@{}
$expectedPlatforms = @()
$readyPlatforms = @()
$failedPlatforms = @()
$releaseVersion = ""
$signed = $false
$githubInfo = $null
$assetVersionSuffix = ""

foreach ($def in $platformDefs) {
  if (-not $def.enabled) {
    continue
  }

  $expectedPlatforms += $def.key
  $manifestPath = Join-Path $ManifestRoot "$($def.key).json"
  if (-not (Test-Path -LiteralPath $manifestPath)) {
    $platforms[$def.key] = [ordered]@{
      enabled = $true
      label = $def.label
      status = "missing"
    }
    $failedPlatforms += $def.key
    continue
  }

  $manifest = Read-JsonFile $manifestPath
  $platforms[$def.key] = $manifest
  $readyPlatforms += $def.key
  if ([string]::IsNullOrWhiteSpace($releaseVersion)) {
    $releaseVersion = [string]$manifest.releaseVersion
    $signed = [bool]$manifest.signed
    $assetVersionSuffix = if ($signed) { ".signed" } else { ".unsigned" }
    $githubInfo = $manifest.github
  } elseif ($releaseVersion -ne [string]$manifest.releaseVersion) {
    throw "manifest releaseVersion mismatch: expected $releaseVersion but got $($manifest.releaseVersion)"
  }
}

if ([string]::IsNullOrWhiteSpace($releaseVersion)) {
  throw "no published platform manifests found under $ManifestRoot"
}

$versionParts = Get-BetaVersionParts $releaseVersion
$publicOrigin = Get-PublicOrigin
$versionPrefix = "$channel/versions/$releaseVersion$assetVersionSuffix"
$latestPrefix = "$channel/latest"
$releaseState = if ($readyPlatforms.Count -eq $expectedPlatforms.Count) { "complete" } elseif ($readyPlatforms.Count -gt 0) { "partial" } else { "failed" }
$latestMetadataUpdated = $releaseState -eq "complete"
$reportUrl = "$publicOrigin/$versionPrefix/report/"
$stateSource = Optional-Env "STATE_SOURCE"
if ([string]::IsNullOrWhiteSpace($stateSource)) {
  $stateSource = if ([string]::IsNullOrWhiteSpace($env:GITHUB_RUN_ID)) { "beta local publish" } else { "$($env:GITHUB_WORKFLOW) workflow_dispatch input" }
}

$metadata = [ordered]@{
  assetVersionSuffix = $assetVersionSuffix
  baseVersion = $versionParts.baseVersion
  betaNumber = $versionParts.betaNumber
  betaVersion = $releaseVersion
  channel = "beta"
  expectedPlatforms = $expectedPlatforms
  failedPlatforms = $failedPlatforms
  generatedAt = [DateTime]::UtcNow.ToString("o")
  github = if ($null -eq $githubInfo) { Get-GitHubReleaseInfo } else { $githubInfo }
  platforms = $platforms
  readyPlatforms = $readyPlatforms
  releaseState = $releaseState
  signed = $signed
  stateSource = $stateSource
  storage = [ordered]@{
    latestMetadataUrl = "$publicOrigin/$latestPrefix/metadata.json"
    latestMetadataUpdated = $latestMetadataUpdated
    latestPrefix = $latestPrefix
    publicOrigin = $publicOrigin
    report = [ordered]@{
      type = "directory"
      url = $reportUrl
    }
    reportUrl = $reportUrl
    reportZipUrl = $null
    versionMetadataUrl = "$publicOrigin/$versionPrefix/metadata.json"
    versionPrefix = $versionPrefix
  }
  version = 1
}

$metadataPath = Join-Path $ManifestRoot "metadata.json"
Write-JsonFile -Path $metadataPath -Value $metadata -Depth 10
New-Item -ItemType Directory -Force -Path (Join-Path $env:RUNNER_TEMP "release-metadata") | Out-Null
Write-JsonFile -Path (Join-Path $env:RUNNER_TEMP "release-metadata\metadata.json") -Value $metadata -Depth 10

Set-GitHubOutput "latest_metadata_updated" $latestMetadataUpdated
Set-GitHubOutput "metadata_url" $metadata.storage.latestMetadataUrl
Set-GitHubOutput "release_state" $releaseState
Set-GitHubOutput "report_url" $metadata.storage.reportUrl
Set-GitHubOutput "version_metadata_url" $metadata.storage.versionMetadataUrl
Set-GitHubOutput "version_prefix" $versionPrefix

if (-not $Publish) {
  Write-Host "dry-run only; pass -Publish to upload beta metadata"
  exit 0
}

$storageSession = $null
try {
  $storageSession = Open-BetaStorageSession -StageRoot $ManifestRoot
  Publish-StorageFile -Session $storageSession -Path $metadataPath -ObjectKey "$versionPrefix/metadata.json" -CacheControl "public, max-age=31536000, immutable"
  if ($latestMetadataUpdated) {
    Publish-StorageFile -Session $storageSession -Path $metadataPath -ObjectKey "$latestPrefix/metadata.json" -CacheControl "public, max-age=60, must-revalidate"
  } else {
    Write-Host "left $($metadata.storage.latestMetadataUrl) unchanged because releaseState=$releaseState"
  }

  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_STEP_SUMMARY)) {
    @(
      ""
      "## beta metadata publish"
      ""
      "- releaseVersion: ``$releaseVersion``"
      "- releaseState: ``$releaseState``"
      "- latestMetadataUpdated: ``$latestMetadataUpdated``"
      "- metadataUrl: ``$($metadata.storage.latestMetadataUrl)``"
    ) | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8
  }
} finally {
  Close-BetaStorageSession -Session $storageSession
}
