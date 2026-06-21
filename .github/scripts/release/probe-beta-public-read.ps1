param(
  [string]$MetadataUrl = ""
)

$ErrorActionPreference = "Stop"

function Resolve-MetadataUrl {
  if (-not [string]::IsNullOrWhiteSpace($MetadataUrl)) {
    return $MetadataUrl
  }
  if (-not [string]::IsNullOrWhiteSpace($env:PUBLISHED_METADATA_URL)) {
    return $env:PUBLISHED_METADATA_URL
  }
  throw "published metadata URL is required"
}

function Get-RequiredWebResponse([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) {
    throw "missing required public URL"
  }
  return Invoke-WebRequest -UseBasicParsing -Uri $Url -Method Get
}

function Parse-JsonBody([string]$Body) {
  if ([string]::IsNullOrWhiteSpace($Body)) {
    throw "response body is empty"
  }
  $objectStart = $Body.IndexOf('{')
  $arrayStart = $Body.IndexOf('[')
  if ($objectStart -lt 0 -and $arrayStart -lt 0) {
    throw "response body does not look like JSON"
  }
  if ($objectStart -ge 0 -and $arrayStart -ge 0) {
    $start = [Math]::Min($objectStart, $arrayStart)
  } elseif ($objectStart -ge 0) {
    $start = $objectStart
  } else {
    $start = $arrayStart
  }
  return ($Body.Substring($start) | ConvertFrom-Json)
}

function Assert-PublicRangeReadable([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) {
    throw "missing installer URL for public-read probe"
  }
  & curl.exe --ssl-no-revoke --fail --silent --show-error --location --range 0-0 --output NUL $Url
  if ($LASTEXITCODE -ne 0) {
    throw "public artifact probe failed for $Url"
  }
}

$resolvedMetadataUrl = Resolve-MetadataUrl
$metadataResponse = Get-RequiredWebResponse $resolvedMetadataUrl
$metadata = Parse-JsonBody $metadataResponse.Content
$win = $metadata.platforms.win
if ($null -eq $win) {
  throw "published metadata is missing platforms.win"
}

$metadataLinks = if ($null -ne $metadata.storage) { $metadata.storage } else { $metadata.r2 }
$platformLinks = if ($null -ne $win.storage) { $win.storage } else { $win.r2 }

$smallUrls = @(
  [string]$resolvedMetadataUrl,
  [string]$metadataLinks.versionMetadataUrl,
  [string]$win.feed.latestUrl,
  [string]$platformLinks.latestManifestUrl,
  [string]$platformLinks.versionManifestUrl,
  [string]$win.artifacts.installer.sha256Url
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique

foreach ($url in $smallUrls) {
  $response = Get-RequiredWebResponse $url
  Write-Host "public ok: $url ($($response.StatusCode))"
}

Assert-PublicRangeReadable ([string]$win.artifacts.installer.url)
Write-Host "public ok: $($win.artifacts.installer.url) (range GET)"
