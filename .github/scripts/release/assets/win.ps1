$ErrorActionPreference = "Stop"

foreach ($name in @("CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN", "RELEASE_CHANNEL", "RELEASE_VERSION", "RUNNER_TEMP", "TOOLS_PACK_NAMESPACE")) {
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
    throw "$name is required"
  }
}

$assetSuffix = if ($null -eq $env:WINDOWS_ASSET_SUFFIX) { "" } else { $env:WINDOWS_ASSET_SUFFIX }
$versionPathSuffix = if ($null -eq $env:ASSET_VERSION_SUFFIX) { "" } else { $env:ASSET_VERSION_SUFFIX }
$includeZip = if ([string]::IsNullOrWhiteSpace($env:WINDOWS_INCLUDE_ZIP)) { $true } else { $env:WINDOWS_INCLUDE_ZIP -ne "false" }
$releaseDir = Join-Path $env:RUNNER_TEMP "release-assets"
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

$builderDir = Join-Path $env:RUNNER_TEMP "tools-pack/out/win/namespaces/${env:TOOLS_PACK_NAMESPACE}/builder"
$sourceInstaller = Join-Path $builderDir "Open Design-${env:TOOLS_PACK_NAMESPACE}-setup.exe"
$sourceZip = Join-Path $builderDir "Open Design-${env:TOOLS_PACK_NAMESPACE}-portable.zip"
if (!(Test-Path $sourceInstaller)) {
  throw "expected installer not found at $sourceInstaller"
}
if ($includeZip -and !(Test-Path $sourceZip)) {
  throw "expected portable zip not found at $sourceZip (build with --to all or --to zip, or set WINDOWS_INCLUDE_ZIP=false to skip)"
}

$versionedInstaller = "open-design-${env:RELEASE_VERSION}$assetSuffix-win-x64-setup.exe"
$versionedZip = "open-design-${env:RELEASE_VERSION}$assetSuffix-win-x64-portable.zip"
$installerChecksumFile = "$versionedInstaller.sha256"
$zipChecksumFile = "$versionedZip.sha256"

Copy-Item $sourceInstaller (Join-Path $releaseDir $versionedInstaller)
$installerPath = Join-Path $releaseDir $versionedInstaller
$installerHash = (Get-FileHash -Path $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$installerHash  $versionedInstaller" | Set-Content -Path (Join-Path $releaseDir $installerChecksumFile)

if ($includeZip) {
  Copy-Item $sourceZip (Join-Path $releaseDir $versionedZip)
  $zipPath = Join-Path $releaseDir $versionedZip
  $zipHash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  "$zipHash  $versionedZip" | Set-Content -Path (Join-Path $releaseDir $zipChecksumFile)
}

$installerBytes = [System.IO.File]::ReadAllBytes($installerPath)
$installerSha512 = [System.Convert]::ToBase64String([System.Security.Cryptography.SHA512]::Create().ComputeHash($installerBytes))
$installerSize = (Get-Item $installerPath).Length
$publicOrigin = ($env:CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN).TrimEnd("/")
$versionPrefix = if ([string]::IsNullOrWhiteSpace($env:RELEASE_VERSION_PREFIX)) {
  "${env:RELEASE_CHANNEL}/versions/${env:RELEASE_VERSION}$versionPathSuffix"
} else {
  $env:RELEASE_VERSION_PREFIX
}
$installerUrl = "$publicOrigin/$versionPrefix/$versionedInstaller"
$releaseDate = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
$releaseNotes = if ([string]::IsNullOrWhiteSpace($env:RELEASE_NOTES)) {
  "Open Design ${env:RELEASE_VERSION}$assetSuffix"
} else {
  $env:RELEASE_NOTES
}
# latest.yml is the electron-updater auto-update feed; it only references the
# NSIS installer because the portable zip is a manual-download convenience and
# is not consumed by the in-app updater.
@(
  "version: `"${env:RELEASE_VERSION}`""
  'files:'
  "  - url: `"$installerUrl`""
  "    sha512: `"$installerSha512`""
  "    size: $installerSize"
  "path: `"$installerUrl`""
  "sha512: `"$installerSha512`""
  "releaseDate: `"$releaseDate`""
  "releaseNotes: `"$releaseNotes`""
) | Set-Content -Path (Join-Path $releaseDir "latest.yml")
