[CmdletBinding()]
param(
  [string]$HostName = "api-seller.ozon.ru",
  [int[]]$Ports = @(443, 4201, 4202, 4203, 4204, 4205, 4206),
  [int]$TimeoutMs = 5000,
  [switch]$SkipTls,
  [switch]$PlanOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-Result {
  param(
    [int]$Port,
    [string]$Status,
    [string]$Stage,
    [string]$Detail
  )

  [pscustomobject]@{
    Host   = $HostName
    Port   = $Port
    Status = $Status
    Stage  = $Stage
    Detail = $Detail
  }
}

function Test-OzonApiPort {
  param(
    [int]$Port
  )

  $client = [System.Net.Sockets.TcpClient]::new()

  try {
    $connect = $client.BeginConnect($HostName, $Port, $null, $null)

    if (-not $connect.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      $client.Close()
      return New-Result -Port $Port -Status "TIMEOUT" -Stage "TCP" -Detail "TCP connect timed out after ${TimeoutMs}ms"
    }

    try {
      $client.EndConnect($connect)
    } catch [System.Net.Sockets.SocketException] {
      $socketError = $_.Exception.SocketErrorCode.ToString()
      if ($socketError -eq "ConnectionRefused") {
        return New-Result -Port $Port -Status "REFUSED" -Stage "TCP" -Detail "TCP connection refused"
      }
      if ($socketError -eq "TimedOut") {
        return New-Result -Port $Port -Status "TIMEOUT" -Stage "TCP" -Detail "TCP connect timed out"
      }
      return New-Result -Port $Port -Status "ERROR" -Stage "TCP" -Detail $socketError
    }

    if ($SkipTls) {
      return New-Result -Port $Port -Status "OK" -Stage "TCP" -Detail "TCP connect succeeded; TLS skipped"
    }

    $stream = $client.GetStream()
    $stream.ReadTimeout = $TimeoutMs
    $stream.WriteTimeout = $TimeoutMs
    $ssl = [System.Net.Security.SslStream]::new($stream, $false)

    try {
      $tls = $ssl.BeginAuthenticateAsClient($HostName, $null, $null)

      if (-not $tls.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
        return New-Result -Port $Port -Status "TIMEOUT" -Stage "TLS" -Detail "TLS handshake timed out after ${TimeoutMs}ms"
      }

      $ssl.EndAuthenticateAsClient($tls)
      return New-Result -Port $Port -Status "OK" -Stage "TLS" -Detail "TCP and TLS handshake succeeded"
    } catch {
      return New-Result -Port $Port -Status "TLS_FAIL" -Stage "TLS" -Detail $_.Exception.Message
    } finally {
      if ($null -ne $ssl) {
        $ssl.Dispose()
      }
    }
  } catch {
    return New-Result -Port $Port -Status "ERROR" -Stage "GENERAL" -Detail $_.Exception.Message
  } finally {
    $client.Dispose()
  }
}

$uniquePorts = $Ports | Sort-Object -Unique

if ($PlanOnly) {
  Write-Host "Plan only: no network calls will be made."
  Write-Host "Host: $HostName"
  Write-Host "Timeout: ${TimeoutMs}ms"
  Write-Host "TLS handshake: $(-not $SkipTls)"
  Write-Host "Ports: $($uniquePorts -join ', ')"
  exit 0
}

$results = foreach ($port in $uniquePorts) {
  Test-OzonApiPort -Port $port
}

$results | Format-Table -AutoSize

if ($results.Status -contains "TIMEOUT") {
  exit 2
}

if (($results | Where-Object { $_.Status -ne "OK" }).Count -gt 0) {
  exit 1
}

exit 0
