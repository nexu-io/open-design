param(
  [ValidateSet("off", "on")]
  [string]$SignMode = "off"
)

$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "windows-signing.ps1")

function Set-GitHubOutput([string]$Name, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($env:GITHUB_OUTPUT) -or [string]::IsNullOrWhiteSpace($Name)) {
    return
  }
  "$Name=$Value" | Add-Content -Path $env:GITHUB_OUTPUT -Encoding utf8
}

$probe = Get-WindowsSigningProbe -SignMode $SignMode

Set-GitHubOutput "certificate_found" $(if ($probe.certificateFound) { "true" } else { "false" })
Set-GitHubOutput "enabled" $(if ($probe.enabled) { "true" } else { "false" })
Set-GitHubOutput "mode" ([string]$probe.mode)
Set-GitHubOutput "probed" "true"
Set-GitHubOutput "reason" ([string]$probe.reason)
Set-GitHubOutput "requested" $(if ($probe.requested) { "true" } else { "false" })
Set-GitHubOutput "signtool_found" $(if ($probe.signToolFound) { "true" } else { "false" })
Set-GitHubOutput "signtool_path" ([string]$probe.signToolPath)
Set-GitHubOutput "thumbprint" ([string]$probe.thumbprint)

Write-Host "windows signing probe:"
Write-Host "- mode: $($probe.mode)"
Write-Host "- requested: $($probe.requested)"
Write-Host "- enabled: $($probe.enabled)"
Write-Host "- certificateFound: $($probe.certificateFound)"
Write-Host "- signToolFound: $($probe.signToolFound)"
if (-not [string]::IsNullOrWhiteSpace([string]$probe.signToolPath)) {
  Write-Host "- signToolPath: $($probe.signToolPath)"
}
if (-not [string]::IsNullOrWhiteSpace([string]$probe.reason)) {
  Write-Host "- reason: $($probe.reason)"
}
