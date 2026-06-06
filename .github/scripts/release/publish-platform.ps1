param(
  [string]$IndexPath = "",
  [string]$ChannelPrefix = "beta",
  [string]$Platform = "win",
  [switch]$Publish,
  [switch]$Probe,
  [switch]$ProbeOnly
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "publish-beta-common.ps1")

if ($Platform -ne "win") {
  throw "publish-platform.ps1 currently supports win only"
}

$channel = Assert-SafePrefix $ChannelPrefix
if ([string]::IsNullOrWhiteSpace($IndexPath)) {
  $IndexPath = "C:\.tmp\runner\od-beta\win\index\index.json"
}
if (-not (Test-Path -LiteralPath $IndexPath)) {
  throw "release index not found: $IndexPath"
}

$index = Read-JsonFile $IndexPath
if ($index.channel -ne "beta") { throw "release index channel must be beta; got $($index.channel)" }
if ($index.platform -ne "win") { throw "release index platform must be win; got $($index.platform)" }
if ($index.status -ne "success") { throw "release index status must be success; got $($index.status)" }

$releaseVersion = [string]$index.releaseVersion
if ([string]::IsNullOrWhiteSpace($releaseVersion)) {
  throw "release index missing releaseVersion"
}

$root = if ([string]::IsNullOrWhiteSpace([string]$index.root)) {
  Split-Path -Parent (Split-Path -Parent $IndexPath)
} else {
  [string]$index.root
}
$platformRoot = Join-Path $root "win"
$stageRoot = Join-Path $platformRoot "publish"
$releaseDir = Join-Path $stageRoot "release-assets"
$manifestDir = Join-Path $stageRoot "manifests"
New-Item -ItemType Directory -Force -Path $releaseDir, $manifestDir | Out-Null

$signed = [bool]$index.signed
$assetSuffix = if ($signed) { ".signed" } else { ".unsigned" }
$publicOrigin = Get-PublicOrigin
$versionPrefix = "$channel/versions/$releaseVersion$assetSuffix"
$latestPrefix = "$channel/latest"
$installerName = "open-design-$releaseVersion$assetSuffix-win-x64-setup.exe"
$portableZipName = "open-design-$releaseVersion$assetSuffix-win-x64-portable.zip"
$installer = Copy-Artifact ([string]$index.artifacts.installerPath) $installerName $releaseDir
$portableZip = $null
if (-not [string]::IsNullOrWhiteSpace([string]$index.artifacts.portableZipPath)) {
  $portableZip = Copy-Artifact ([string]$index.artifacts.portableZipPath) $portableZipName $releaseDir
}

$installerBytes = [System.IO.File]::ReadAllBytes($installer.path)
$installerSha512 = [System.Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash($installerBytes))
$releaseDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
Write-Utf8File -Path (Join-Path $releaseDir "latest.yml") -Content @(
  "version: `"$releaseVersion`""
  "files:"
  "  - url: `"$publicOrigin/$versionPrefix/$installerName`""
  "    sha512: `"$installerSha512`""
  "    size: $($installer.size)"
  "path: `"$publicOrigin/$versionPrefix/$installerName`""
  "sha512: `"$installerSha512`""
  "releaseDate: `"$releaseDate`""
  "releaseNotes: `"Open Design beta $releaseVersion$assetSuffix`""
)

$artifacts = [ordered]@{
  installer = [ordered]@{
    contentType = Get-ContentType $installerName
    name = $installerName
    objectKey = "$versionPrefix/$installerName"
    sha256 = $installer.sha256
    sha256ObjectKey = "$versionPrefix/$installerName.sha256"
    sha256Url = "$publicOrigin/$versionPrefix/$installerName.sha256"
    size = $installer.size
    url = "$publicOrigin/$versionPrefix/$installerName"
  }
}
if ($portableZip -ne $null) {
  $artifacts.portableZip = [ordered]@{
    contentType = Get-ContentType $portableZipName
    name = $portableZipName
    objectKey = "$versionPrefix/$portableZipName"
    sha256 = $portableZip.sha256
    sha256ObjectKey = "$versionPrefix/$portableZipName.sha256"
    sha256Url = "$publicOrigin/$versionPrefix/$portableZipName.sha256"
    size = $portableZip.size
    url = "$publicOrigin/$versionPrefix/$portableZipName"
  }
}

$storageSession = $null
try {
  if ($Publish) {
    $storageSession = Open-BetaStorageSession -StageRoot $stageRoot
    if ($Probe) {
      Invoke-BetaStorageProbe -Session $storageSession -ChannelPrefix $channel -StageRoot $stageRoot
    }
  } elseif ($Probe) {
    throw "-Probe requires -Publish"
  }

  if ($ProbeOnly) {
    if (-not $Probe) {
      throw "-ProbeOnly requires -Probe"
    }
    Write-Host "probe-only mode; platform assets were not staged"
    exit 0
  }

  $githubInfo = Get-GitHubReleaseInfo -FallbackBranch ([string]$index.branch) -FallbackCommit ([string]$index.commit)
  $reportDirectory = "win"
  $reportRoot = if ([string]::IsNullOrWhiteSpace([string]$index.reportDir)) {
    Join-Path $platformRoot "release-report\$reportDirectory"
  } else {
    [string]$index.reportDir
  }
  $report = Publish-ReleaseReport -Session $storageSession -ReportRoot $reportRoot -ReportDirectory $reportDirectory -VersionPrefix $versionPrefix -PublicOrigin $publicOrigin
  $versionManifestUrl = "$publicOrigin/$versionPrefix/platforms/win.json"
  $latestManifestUrl = "$publicOrigin/$latestPrefix/platforms/win.json"
  $manifest = [ordered]@{
    arch = "x64"
    artifacts = $artifacts
    channel = "beta"
    enabled = $true
    feed = [ordered]@{
      latestObjectKey = "$latestPrefix/latest.yml"
      latestUrl = "$publicOrigin/$latestPrefix/latest.yml"
      name = "latest.yml"
      objectKey = "$versionPrefix/latest.yml"
      url = "$publicOrigin/$versionPrefix/latest.yml"
    }
    generatedAt = [DateTime]::UtcNow.ToString("o")
    github = $githubInfo
    label = "Windows x64"
    platform = "win"
    platformKey = "win"
    report = $report
    releaseVersion = $releaseVersion
    r2 = [ordered]@{
      latestManifestUrl = $latestManifestUrl
      latestPrefix = $latestPrefix
      publicOrigin = $publicOrigin
      versionManifestUrl = $versionManifestUrl
      versionPrefix = $versionPrefix
    }
    signed = $signed
    status = "published"
    storage = [ordered]@{
      latestManifestUrl = $latestManifestUrl
      latestPrefix = $latestPrefix
      publicOrigin = $publicOrigin
      versionManifestUrl = $versionManifestUrl
      versionPrefix = $versionPrefix
    }
    s3 = [ordered]@{
      latestManifestObjectKey = "$latestPrefix/platforms/win.json"
      latestPrefix = $latestPrefix
      versionManifestObjectKey = "$versionPrefix/platforms/win.json"
      versionPrefix = $versionPrefix
    }
    version = 1
  }
  $manifestPath = Join-Path $manifestDir "win.json"
  Write-JsonFile -Path $manifestPath -Value $manifest -Depth 8

  $publishIndex = [ordered]@{
    artifacts = $artifacts
    channel = "beta"
    generatedAt = [DateTime]::UtcNow.ToString("o")
    manifestPath = $manifestPath
    platform = "win"
    releaseVersion = $releaseVersion
    report = $report
    signed = $signed
    target = $index.target
    versionPrefix = $versionPrefix
  }
  Write-JsonFile -Path (Join-Path $manifestDir "index.json") -Value $publishIndex -Depth 8

  $uploads = @(
    @{ path = $installer.path; key = "$versionPrefix/$installerName"; cache = "public, max-age=31536000, immutable" },
    @{ path = "$($installer.path).sha256"; key = "$versionPrefix/$installerName.sha256"; cache = "public, max-age=31536000, immutable" },
    @{ path = (Join-Path $releaseDir "latest.yml"); key = "$versionPrefix/latest.yml"; cache = "public, max-age=31536000, immutable" },
    @{ path = (Join-Path $releaseDir "latest.yml"); key = "$latestPrefix/latest.yml"; cache = "public, max-age=60, must-revalidate" },
    @{ path = $manifestPath; key = "$versionPrefix/platforms/win.json"; cache = "public, max-age=31536000, immutable" },
    @{ path = $manifestPath; key = "$latestPrefix/platforms/win.json"; cache = "public, max-age=60, must-revalidate" }
  )
  if ($portableZip -ne $null) {
    $uploads += @{ path = $portableZip.path; key = "$versionPrefix/$portableZipName"; cache = "public, max-age=31536000, immutable" }
    $uploads += @{ path = "$($portableZip.path).sha256"; key = "$versionPrefix/$portableZipName.sha256"; cache = "public, max-age=31536000, immutable" }
  }

  Write-Host "release-beta platform publish plan:"
  Write-Host "- channelPrefix: $channel"
  Write-Host "- releaseVersion: $releaseVersion"
  Write-Host "- signed: $signed"
  Write-Host "- platformManifestUrl: $versionManifestUrl"
  if ($report -ne $null) {
    Write-Host "- reportUrl: $($report.url)"
  }
  foreach ($upload in $uploads) {
    $size = (Get-Item -LiteralPath $upload.path).Length
    Write-Host "- $($upload.key) ($size bytes)"
  }

  Set-GitHubOutput "feed_url" "$publicOrigin/$latestPrefix/latest.yml"
  Set-GitHubOutput "platform_manifest_path" $manifestPath
  Set-GitHubOutput "platform_manifest_url" $versionManifestUrl
  Set-GitHubOutput "platform_latest_manifest_url" $latestManifestUrl
  Set-GitHubOutput "release_version" $releaseVersion
  if ($report -ne $null) {
    Set-GitHubOutput "report_url" $report.url
  }
  foreach ($artifactKey in @("installer", "portableZip")) {
    $artifact = $artifacts[$artifactKey]
    if ($null -ne $artifact) {
      Set-GitHubOutput "${artifactKey}_url" $artifact.url
    }
  }

  if (-not $Publish) {
    Write-Host "dry-run only; pass -Publish to upload platform assets"
    exit 0
  }

  foreach ($upload in $uploads) {
    Publish-StorageFile -Session $storageSession -Path ([string]$upload.path) -ObjectKey ([string]$upload.key) -CacheControl ([string]$upload.cache)
  }

  if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_STEP_SUMMARY)) {
    @(
      ""
      "## beta platform publish"
      ""
      "- channelPrefix: ``$channel``"
      "- releaseVersion: ``$releaseVersion``"
      "- signed: ``$signed``"
      "- platformManifestUrl: ``$versionManifestUrl``"
      "- uploadedObjects: ``$($uploads.Count)``"
    ) | Add-Content -Path $env:GITHUB_STEP_SUMMARY -Encoding utf8
  }
} finally {
  Close-BetaStorageSession -Session $storageSession
}
