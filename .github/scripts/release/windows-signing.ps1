function Resolve-WindowsSignToolPath([string]$PreferredPath = "") {
  $candidates = @()
  foreach ($value in @(
    $PreferredPath,
    [Environment]::GetEnvironmentVariable("OD_WIN_SIGNTOOL_PATH"),
    "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe"
  )) {
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $candidates += $value
    }
  }

  $command = Get-Command signtool.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -ne $null -and -not [string]::IsNullOrWhiteSpace($command.Source)) {
    $candidates += $command.Source
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return ""
}

function ConvertTo-Boolean([string]$Value, [bool]$Default = $false) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Default
  }

  switch ($Value.Trim().ToLowerInvariant()) {
    "1" { return $true }
    "true" { return $true }
    "yes" { return $true }
    "on" { return $true }
    "0" { return $false }
    "false" { return $false }
    "no" { return $false }
    "off" { return $false }
    default { return $Default }
  }
}

function Get-WindowsSigningProbe {
  param(
    [ValidateSet("off", "on")]
    [string]$SignMode = "off",
    [string]$Thumbprint = "8617C437D6CCE5A61758C27E684BF5CADC5AC0A7",
    [string]$SignToolPath = ""
  )

  $requested = $SignMode -ne "off"
  $reasonParts = @()

  $cert = $null
  if ($requested) {
    $cert = Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
      Where-Object { $_.Thumbprint -eq $Thumbprint -and $_.HasPrivateKey } |
      Select-Object -First 1
    if ($cert -eq $null) {
      $reasonParts += "certificate with private key not found: $Thumbprint"
    }
  }

  $resolvedSignTool = ""
  if ($requested) {
    $resolvedSignTool = Resolve-WindowsSignToolPath -PreferredPath $SignToolPath
    if ([string]::IsNullOrWhiteSpace($resolvedSignTool)) {
      $reasonParts += "signtool.exe not found"
    }
  }

  $enabled = $requested -and $cert -ne $null -and -not [string]::IsNullOrWhiteSpace($resolvedSignTool)
  $reason = switch ($SignMode) {
    "off" { "sign mode off" }
    default {
      if ($enabled) {
        "signing capability available"
      } else {
        $reasonParts -join "; "
      }
    }
  }

  if ($SignMode -eq "on" -and -not $enabled) {
    throw "Windows signing required but unavailable: $reason"
  }

  return [ordered]@{
    certificateFound = $cert -ne $null
    enabled = $enabled
    mode = $SignMode
    reason = $reason
    requested = $requested
    signToolFound = -not [string]::IsNullOrWhiteSpace($resolvedSignTool)
    signToolPath = $resolvedSignTool
    thumbprint = $Thumbprint
  }
}

function Read-WindowsSigningProbeFromEnvironment {
  $probed = [Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_PROBED")
  if (-not (ConvertTo-Boolean $probed)) {
    return $null
  }

  return [ordered]@{
    certificateFound = ConvertTo-Boolean ([Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_CERTIFICATE_FOUND"))
    enabled = ConvertTo-Boolean ([Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_ENABLED"))
    mode = [Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_MODE")
    reason = [Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_REASON")
    requested = ConvertTo-Boolean ([Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_REQUESTED"))
    signToolFound = ConvertTo-Boolean ([Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNING_SIGNTOOL_FOUND"))
    signToolPath = [Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGNTOOL_PATH")
    thumbprint = [Environment]::GetEnvironmentVariable("OD_BETA_WINDOWS_SIGN_CERT_SHA1")
  }
}
