$ErrorActionPreference = "Stop"

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Require-Env([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "$Name is required"
  }
  return $value
}

function Optional-Env([string]$Name, [string]$Fallback = "") {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Fallback
  }
  return $value
}

function Get-PublicOrigin {
  $value = Optional-Env "S3_PUBLIC_ORIGIN"
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "S3_PUBLIC_ORIGIN is required; refuse to derive public metadata URLs from the private S3 endpoint"
  }
  return $value.TrimEnd("/")
}

function Set-GitHubOutput([string]$Name, [object]$Value) {
  if ([string]::IsNullOrWhiteSpace($Name) -or $null -eq $Value) {
    return
  }
  if ([string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT)) {
    return
  }
  "$Name=$Value" | Add-Content -Path $env:GITHUB_OUTPUT -Encoding utf8
}

function Get-BetaVersionParts([string]$Version) {
  if ($Version -notmatch '^(?<base>\d+\.\d+\.\d+)-beta\.(?<number>\d+)$') {
    throw "release version must match x.y.z-beta.N; got $Version"
  }
  return [ordered]@{
    baseVersion = $Matches.base
    betaNumber = [int]$Matches.number
  }
}

function Normalize-ObjectKey([string]$Value) {
  return ($Value -replace "\\", "/").Trim("/")
}

function Assert-SafePrefix([string]$Value) {
  $prefix = Normalize-ObjectKey $Value
  if ([string]::IsNullOrWhiteSpace($prefix) -or $prefix -eq "." -or $prefix -eq "/") {
    throw "channel prefix must not be empty or bucket root"
  }
  if ($prefix.Contains("..") -or $prefix.StartsWith("/") -or $prefix.StartsWith("~")) {
    throw "unsafe channel prefix: $Value"
  }
  return $prefix
}

function Get-ContentType([string]$Name) {
  if ($Name.EndsWith(".dmg", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/x-apple-diskimage" }
  if ($Name.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/zip" }
  if ($Name.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/vnd.microsoft.portable-executable" }
  if ($Name.EndsWith(".AppImage", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/octet-stream" }
  if ($Name.EndsWith(".sha256", [System.StringComparison]::OrdinalIgnoreCase)) { return "text/plain; charset=utf-8" }
  if ($Name.EndsWith(".yml", [System.StringComparison]::OrdinalIgnoreCase) -or $Name.EndsWith(".yaml", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/x-yaml; charset=utf-8" }
  if ($Name.EndsWith(".json", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/json; charset=utf-8" }
  if ($Name.EndsWith(".html", [System.StringComparison]::OrdinalIgnoreCase)) { return "text/html; charset=utf-8" }
  if ($Name.EndsWith(".log", [System.StringComparison]::OrdinalIgnoreCase) -or $Name.EndsWith(".txt", [System.StringComparison]::OrdinalIgnoreCase)) { return "text/plain; charset=utf-8" }
  if ($Name.EndsWith(".png", [System.StringComparison]::OrdinalIgnoreCase)) { return "image/png" }
  if ($Name.EndsWith(".xml", [System.StringComparison]::OrdinalIgnoreCase)) { return "application/xml; charset=utf-8" }
  return "application/octet-stream"
}

function Write-Utf8File([string]$Path, [object]$Content) {
  $parent = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
  }

  if ($Content -is [System.Array]) {
    $text = ($Content | ForEach-Object { [string]$_ }) -join "`n"
    if ($text.Length -gt 0) {
      $text += "`n"
    }
  } else {
    $text = [string]$Content
  }

  [System.IO.File]::WriteAllText($Path, $text, $script:Utf8NoBom)
}

function Write-JsonFile([string]$Path, [object]$Value, [int]$Depth = 10) {
  Write-Utf8File -Path $Path -Content (($Value | ConvertTo-Json -Depth $Depth) + "`n")
}

function Read-JsonFile([string]$Path) {
  return Get-Content -LiteralPath $Path -Raw -Encoding utf8 | ConvertFrom-Json
}

function Copy-Artifact([string]$Source, [string]$Name, [string]$ReleaseDir) {
  if ([string]::IsNullOrWhiteSpace($Source) -or -not (Test-Path -LiteralPath $Source)) {
    throw "expected artifact not found: $Source"
  }
  $target = Join-Path $ReleaseDir $Name
  New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null
  Copy-Item -LiteralPath $Source -Destination $target -Force
  $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Utf8File -Path (Join-Path $ReleaseDir "$Name.sha256") -Content "$hash  $Name"
  return [ordered]@{
    name = $Name
    path = $target
    sha256 = $hash
    size = (Get-Item -LiteralPath $target).Length
  }
}

function Invoke-Mc([string[]]$Arguments) {
  & mc @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "mc failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
  }
}

function Open-BetaStorageSession([string]$StageRoot) {
  $session = [ordered]@{
    accessKey = Require-Env "S3_ACCESS_KEY_ID"
    alias = "od-release-$([Guid]::NewGuid().ToString('N'))"
    bucket = Require-Env "S3_BUCKET"
    configDir = Join-Path $StageRoot "mc-config"
    endpoint = Require-Env "S3_ENDPOINT"
    publicOrigin = Get-PublicOrigin
    secretKey = Require-Env "S3_SECRET_ACCESS_KEY"
  }

  New-Item -ItemType Directory -Force -Path $session.configDir | Out-Null
  Invoke-Mc @("--config-dir", $session.configDir, "alias", "set", $session.alias, $session.endpoint, $session.accessKey, $session.secretKey, "--api", "S3v4")
  Invoke-Mc @("--config-dir", $session.configDir, "stat", "$($session.alias)/$($session.bucket)")
  return $session
}

function Close-BetaStorageSession([object]$Session) {
  if ($null -eq $Session) {
    return
  }
  & mc --config-dir $Session.configDir alias remove $Session.alias *> $null
  Remove-Item -LiteralPath $Session.configDir -Recurse -Force -ErrorAction SilentlyContinue
}

function Publish-StorageFile([object]$Session, [string]$Path, [string]$ObjectKey, [string]$CacheControl, [string]$ContentType = "") {
  if ([string]::IsNullOrWhiteSpace($ContentType)) {
    $ContentType = Get-ContentType ([System.IO.Path]::GetFileName($Path))
  }
  Invoke-Mc @("--config-dir", $Session.configDir, "cp", "--attr", "Content-Type=$ContentType;Cache-Control=$CacheControl", $Path, "$($Session.alias)/$($Session.bucket)/$ObjectKey")
}

function Invoke-BetaStorageProbe([object]$Session, [string]$ChannelPrefix, [string]$StageRoot) {
  $probeRunId = if ([string]::IsNullOrWhiteSpace($env:GITHUB_RUN_ID)) { "local" } else { $env:GITHUB_RUN_ID }
  $probeKey = "$ChannelPrefix/.probe/$probeRunId-$([Guid]::NewGuid().ToString('N')).json"
  $probePath = Join-Path $StageRoot "probe.json"
  Write-JsonFile -Path $probePath -Value ([ordered]@{
    generatedAt = [DateTime]::UtcNow.ToString("o")
    key = $probeKey
    purpose = "beta publish probe"
  }) -Depth 4
  Publish-StorageFile -Session $Session -Path $probePath -ObjectKey $probeKey -CacheControl "no-store" -ContentType "application/json; charset=utf-8"
  Invoke-Mc @("--config-dir", $Session.configDir, "stat", "$($Session.alias)/$($Session.bucket)/$probeKey")
  Invoke-Mc @("--config-dir", $Session.configDir, "rm", "$($Session.alias)/$($Session.bucket)/$probeKey")
  Write-Host "probe ok: $probeKey"
}

function Get-GitHubReleaseInfo([string]$FallbackBranch = "", [string]$FallbackCommit = "") {
  return [ordered]@{
    branch = if ([string]::IsNullOrWhiteSpace($env:GITHUB_REF_NAME)) { $FallbackBranch } else { $env:GITHUB_REF_NAME }
    commit = if ([string]::IsNullOrWhiteSpace($env:GITHUB_SHA)) { $FallbackCommit } else { $env:GITHUB_SHA }
    repository = $env:GITHUB_REPOSITORY
    runAttempt = if ([string]::IsNullOrWhiteSpace($env:GITHUB_RUN_ATTEMPT)) { 0 } else { [int]$env:GITHUB_RUN_ATTEMPT }
    runId = if ([string]::IsNullOrWhiteSpace($env:GITHUB_RUN_ID)) { 0 } else { [int64]$env:GITHUB_RUN_ID }
    workflow = $env:GITHUB_WORKFLOW
  }
}

function Get-RelativeFilePath([string]$Root, [string]$Path) {
  $fullRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd("\", "/")
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if (-not $fullPath.StartsWith($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "path is outside root: $Path"
  }
  return ($fullPath.Substring($fullRoot.Length).TrimStart("\", "/") -replace "\\", "/")
}

function Get-DirectoryFiles([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) {
    return @()
  }
  return @(Get-ChildItem -LiteralPath $Path -Recurse -File | Sort-Object FullName | Select-Object -ExpandProperty FullName)
}

function Publish-ReleaseReport(
  [object]$Session,
  [string]$ReportRoot,
  [string]$ReportDirectory,
  [string]$VersionPrefix,
  [string]$PublicOrigin
) {
  $files = Get-DirectoryFiles -Path $ReportRoot
  if ($files.Count -eq 0) {
    return $null
  }

  $reportPrefix = "$VersionPrefix/report/$ReportDirectory"
  $reportZipPath = Optional-Env "REPORT_ZIP_PATH" (Join-Path (Split-Path -Parent $ReportRoot) "$ReportDirectory-report.zip")
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $reportZipPath) | Out-Null
  Remove-Item -LiteralPath $reportZipPath -Force -ErrorAction SilentlyContinue
  $reportItems = @(Get-ChildItem -LiteralPath $ReportRoot -Force | Select-Object -ExpandProperty FullName)
  if ($reportItems.Count -eq 0) {
    throw "cannot create release report zip from empty directory: $ReportRoot"
  }
  Compress-Archive -LiteralPath $reportItems -DestinationPath $reportZipPath -CompressionLevel Optimal -Force
  if ($null -ne $Session) {
    foreach ($file in $files) {
      $relativePath = Get-RelativeFilePath -Root $ReportRoot -Path $file
      Publish-StorageFile -Session $Session -Path $file -ObjectKey "$reportPrefix/$relativePath" -CacheControl "public, max-age=31536000, immutable"
    }
    Publish-StorageFile -Session $Session -Path $reportZipPath -ObjectKey "$reportPrefix/report.zip" -CacheControl "public, max-age=31536000, immutable" -ContentType "application/zip"
  }

  $reportJsonPath = Join-Path $ReportRoot "report.json"
  $reportJson = $null
  if (Test-Path -LiteralPath $reportJsonPath) {
    $reportJson = [ordered]@{
      contentType = "application/json; charset=utf-8"
      name = "report.json"
      size = (Get-Item -LiteralPath $reportJsonPath).Length
      url = "$PublicOrigin/$reportPrefix/report.json"
    }
  }
  $zip = [ordered]@{
    contentType = "application/zip"
    name = "report.zip"
    size = (Get-Item -LiteralPath $reportZipPath).Length
    url = "$PublicOrigin/$reportPrefix/report.zip"
  }

  return [ordered]@{
    fileCount = $files.Count
    json = $reportJson
    jsonUrl = if ($reportJson -eq $null) { $null } else { $reportJson.url }
    type = "directory"
    url = "$PublicOrigin/$reportPrefix/"
    zip = $zip
    zipUrl = $zip.url
  }
}
