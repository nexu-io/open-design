param(
  [string]$IndexPath = "",
  [string]$ManifestRoot = "",
  [string]$ChannelPrefix = "beta",
  [string]$Platform = "win",
  [switch]$Publish,
  [switch]$Probe,
  [switch]$ProbeOnly
)

$ErrorActionPreference = "Stop"

$publishPlatformScript = Join-Path $PSScriptRoot "publish-platform.ps1"
$publishMetadataScript = Join-Path $PSScriptRoot "publish-beta-metadata.ps1"

& $publishPlatformScript `
  -IndexPath $IndexPath `
  -ChannelPrefix $ChannelPrefix `
  -Platform $Platform `
  -Publish:$Publish `
  -Probe:$Probe `
  -ProbeOnly:$ProbeOnly
if ($LASTEXITCODE -ne 0 -or $ProbeOnly) {
  exit $LASTEXITCODE
}

if ([string]::IsNullOrWhiteSpace($ManifestRoot)) {
  if ([string]::IsNullOrWhiteSpace($IndexPath)) {
    $IndexPath = "C:\.tmp\runner\od-beta\win\index\index.json"
  }
  $resolvedIndexPath = Resolve-Path -LiteralPath $IndexPath
  $platformRoot = Split-Path -Parent (Split-Path -Parent $resolvedIndexPath.Path)
  $ManifestRoot = Join-Path $platformRoot "publish\manifests"
}

& $publishMetadataScript `
  -ManifestRoot $ManifestRoot `
  -ChannelPrefix $ChannelPrefix `
  -Publish:$Publish
exit $LASTEXITCODE
