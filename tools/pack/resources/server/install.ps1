# Open Design native server bootstrap for Windows PowerShell 5+.
# Release placement, smoke checks, and current-pointer updates are owned by the
# bundled installer\install-core.mjs. This script only selects Node, verifies
# archives, extracts the payload into a temporary directory, and hands off.

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$NodeVersion = "24.14.1"
$NodeDistBaseUrl = "https://nodejs.org/dist/v$NodeVersion"
$DefaultReleaseBaseUrl = "https://releases.open-design.ai/server"
$TempRoot = $null
$TempPhysicalRoot = $null
$TempDrive = $null
$TempDriveOwnerToken = $null

function Write-InstallerLog {
  param([Parameter(Mandatory = $true)][string]$Message)
  Write-Host "open-design: $Message"
}

function Get-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Default
  )
  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $Default
  }
  return $value
}

function ConvertTo-Boolean {
  param([AllowEmptyString()][string]$Value)
  switch (($Value.Trim()).ToLowerInvariant()) {
    "" { return $false }
    "0" { return $false }
    "false" { return $false }
    "no" { return $false }
    "off" { return $false }
    "1" { return $true }
    "true" { return $true }
    "yes" { return $true }
    "on" { return $true }
    default {
      throw "OPEN_DESIGN_FORCE_PRIVATE_NODE must be 1/0, true/false, yes/no, or on/off"
    }
  }
}

function Normalize-Sha256 {
  param([Parameter(Mandatory = $true)][string]$Value)
  $normalized = $Value.Trim().ToLowerInvariant()
  if ($normalized -notmatch "^[0-9a-f]{64}$") {
    throw "invalid SHA-256 value (expected 64 hexadecimal characters)"
  }
  return $normalized
}

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)
  # Use .NET SHA-256 so bootstrap works even when Windows PowerShell module
  # autoload is unavailable (common under non-interactive CI shells that
  # inherit a stripped PSModulePath).
  $stream = $null
  $hasher = $null
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $hashBytes = $hasher.ComputeHash($stream)
    return (
      [System.BitConverter]::ToString($hashBytes) -replace "-", ""
    ).ToLowerInvariant()
  } finally {
    if ($null -ne $hasher) {
      $hasher.Dispose()
    }
    if ($null -ne $stream) {
      $stream.Dispose()
    }
  }
}

function Assert-FileSha256 {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Expected
  )
  $expectedNormalized = Normalize-Sha256 $Expected
  $actual = Get-FileSha256 $Path
  if ($actual -cne $expectedNormalized) {
    throw "SHA-256 mismatch for $([IO.Path]::GetFileName($Path)) (expected $expectedNormalized, got $actual)"
  }
  return $actual
}

function Invoke-Download {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [Parameter(Mandatory = $true)][string]$Destination
  )
  Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination
}

function New-InstallerTempRoot {
  $ownerToken = [Guid]::NewGuid().ToString("N")
  $ownerMarker = ".odsi-owner-$ownerToken"
  $physicalRoot = Join-Path ([IO.Path]::GetTempPath()) (
    "odsi-" + [Guid]::NewGuid().ToString("N")
  )
  New-Item -ItemType Directory -Path $physicalRoot | Out-Null
  Set-Content -LiteralPath (Join-Path $physicalRoot $ownerMarker) `
    -Value $ownerToken -Encoding ASCII -NoNewline

  $subst = Join-Path $env:SystemRoot "System32\subst.exe"
  if (-not (Test-Path -LiteralPath $subst -PathType Leaf)) {
    Remove-Item -LiteralPath $physicalRoot -Recurse -Force -ErrorAction SilentlyContinue
    throw "Windows subst.exe is required to create a short extraction path"
  }

  foreach ($letter in @(
    "Z", "Y", "X", "W", "V", "U", "T", "S", "R", "Q", "P", "O",
    "N", "M", "L", "K", "J", "I", "H", "G", "F", "E", "D"
  )) {
    $drive = "${letter}:"
    & $subst $drive $physicalRoot 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      continue
    }
    $mappedMarker = Join-Path ($drive + "\") $ownerMarker
    $mappedOwner = ""
    if (Test-Path -LiteralPath $mappedMarker -PathType Leaf) {
      $mappedOwner = (Get-Content -LiteralPath $mappedMarker -Raw).Trim()
    }
    if ($mappedOwner -ceq $ownerToken) {
      $script:TempPhysicalRoot = $physicalRoot
      $script:TempDrive = $drive
      $script:TempDriveOwnerToken = $ownerToken
      return ($drive + "\")
    }
  }

  Remove-Item -LiteralPath $physicalRoot -Recurse -Force -ErrorAction SilentlyContinue
  throw "could not reserve a short temporary drive for archive extraction"
}

function Get-NamedChecksum {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$FileName
  )
  $values = @()
  foreach ($line in Get-Content -LiteralPath $Path) {
    $match = [regex]::Match($line, "^([0-9A-Fa-f]{64})\s+\*?(.+?)\s*$")
    if ($match.Success -and $match.Groups[2].Value -ceq $FileName) {
      $values += $match.Groups[1].Value
    }
  }
  if ($values.Count -ne 1) {
    throw "SHA256SUMS does not contain exactly one entry for $FileName"
  }
  return (Normalize-Sha256 $values[0])
}

function Get-SingleValue {
  param([Parameter(Mandatory = $true)][string]$Path)
  $values = @(
    Get-Content -LiteralPath $Path |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_.Length -gt 0 }
  )
  if ($values.Count -ne 1) {
    throw "$Path must contain exactly one non-empty line"
  }
  return $values[0]
}

function Normalize-Version {
  param([Parameter(Mandatory = $true)][string]$Value)
  $normalized = $Value.Trim()
  if ($normalized -match "^[vV](.+)$") {
    $normalized = $Matches[1]
  }
  if (
    $normalized -notmatch "^[A-Za-z0-9][A-Za-z0-9._+-]*$" -or
    $normalized.Contains("..")
  ) {
    throw "invalid release version: $Value"
  }
  return $normalized
}

function Format-NodeProbeText {
  param([AllowEmptyString()][string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    return "<empty>"
  }
  $singleLine = [regex]::Replace($Value.Trim(), "[\x00-\x1f]+", " ")
  if ($singleLine.Length -gt 240) {
    return ($singleLine.Substring(0, 240) + "...")
  }
  return $singleLine
}

function Invoke-NodeProbe {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$Arguments
  )

  # Windows PowerShell 5's legacy native-argument marshalling does not preserve
  # embedded quotes reliably. Keep the controlled probe arguments quote-free
  # and use ProcessStartInfo so exit code, stdout, and stderr stay observable.
  $process = $null
  try {
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.Arguments = $Arguments
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [System.Diagnostics.Process]::Start($startInfo)
    if ($null -eq $process) {
      throw "Process.Start returned no process"
    }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $exitCode = $process.ExitCode
    $stdout = $stdoutTask.GetAwaiter().GetResult().Trim()
    $stderr = $stderrTask.GetAwaiter().GetResult().Trim()
    return [PSCustomObject]@{
      Succeeded = $exitCode -eq 0
      Started = $true
      ExitCode = $exitCode
      StandardOutput = $stdout
      StandardError = $stderr
      StartError = ""
    }
  } catch {
    return [PSCustomObject]@{
      Succeeded = $false
      Started = $false
      ExitCode = $null
      StandardOutput = ""
      StandardError = ""
      StartError = $_.Exception.Message
    }
  } finally {
    if ($null -ne $process) {
      $process.Dispose()
    }
  }
}

function Format-NodeProbeFailure {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)]$Probe
  )
  if (-not $Probe.Started) {
    return "$Name probe could not start: $(Format-NodeProbeText $Probe.StartError)"
  }
  $stdout = Format-NodeProbeText $Probe.StandardOutput
  $stderr = Format-NodeProbeText $Probe.StandardError
  return "$Name probe exited with code $($Probe.ExitCode) (stdout: $stdout; stderr: $stderr)"
}

function Get-NodeIdentity {
  param([Parameter(Mandatory = $true)][string]$NodePath)
  if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    return [PSCustomObject]@{
      IsRunnable = $false
      Version = ""
      Platform = ""
      Architecture = ""
      Detail = "executable does not exist: $NodePath"
    }
  }

  $versionProbe = Invoke-NodeProbe $NodePath "--version"
  if (-not $versionProbe.Succeeded) {
    return [PSCustomObject]@{
      IsRunnable = $false
      Version = ""
      Platform = ""
      Architecture = ""
      Detail = Format-NodeProbeFailure "version" $versionProbe
    }
  }
  $version = $versionProbe.StandardOutput.Trim()
  if ($version.StartsWith("v", [System.StringComparison]::OrdinalIgnoreCase)) {
    $version = $version.Substring(1)
  }
  if ([string]::IsNullOrWhiteSpace($version)) {
    return [PSCustomObject]@{
      IsRunnable = $false
      Version = ""
      Platform = ""
      Architecture = ""
      Detail = "version probe returned empty output"
    }
  }

  $platformProbe = Invoke-NodeProbe $NodePath "-p process.platform"
  if (-not $platformProbe.Succeeded) {
    return [PSCustomObject]@{
      IsRunnable = $false
      Version = $version
      Platform = ""
      Architecture = ""
      Detail = Format-NodeProbeFailure "platform" $platformProbe
    }
  }
  $platform = $platformProbe.StandardOutput.Trim()

  $architectureProbe = Invoke-NodeProbe $NodePath "-p process.arch"
  if (-not $architectureProbe.Succeeded) {
    return [PSCustomObject]@{
      IsRunnable = $false
      Version = $version
      Platform = $platform
      Architecture = ""
      Detail = Format-NodeProbeFailure "architecture" $architectureProbe
    }
  }
  $architecture = $architectureProbe.StandardOutput.Trim()

  return [PSCustomObject]@{
    IsRunnable = $true
    Version = $version
    Platform = $platform
    Architecture = $architecture
    Detail = (
      "reported version $(Format-NodeProbeText $version), " +
      "platform $(Format-NodeProbeText $platform), " +
      "architecture $(Format-NodeProbeText $architecture)"
    )
  }
}

function Test-CompatibleNode {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$Architecture
  )
  $identity = Get-NodeIdentity $NodePath
  if (-not $identity.IsRunnable) {
    return $false
  }
  $versionParts = $identity.Version.Split([char]".")
  if ($versionParts.Count -eq 0) {
    return $false
  }
  return (
    $versionParts[0] -ceq "24" -and
    $identity.Platform -ceq "win32" -and
    $identity.Architecture -ceq $Architecture
  )
}

function Test-PinnedNodeIdentity {
  param(
    [Parameter(Mandatory = $true)]$Identity,
    [Parameter(Mandatory = $true)][string]$Architecture
  )
  return (
    $Identity.IsRunnable -and
    $Identity.Version -ceq $NodeVersion -and
    $Identity.Platform -ceq "win32" -and
    $Identity.Architecture -ceq $Architecture
  )
}

function Test-PinnedNode {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$Architecture
  )
  $identity = Get-NodeIdentity $NodePath
  return (Test-PinnedNodeIdentity $identity $Architecture)
}

function Expand-CheckedZip {
  param(
    [Parameter(Mandatory = $true)][string]$Archive,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][string]$ExpectedTop,
    [Parameter(Mandatory = $true)][bool]$RejectLinks
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
  try {
    if ($zip.Entries.Count -eq 0) {
      throw "archive is empty: $([IO.Path]::GetFileName($Archive))"
    }
    $seen = @{}
    $sawExpectedTop = $false
    $destinationPrefix = (
      [IO.Path]::GetFullPath($Destination)
    ).TrimEnd([char]92) + "\"
    foreach ($entry in $zip.Entries) {
      $entryName = $entry.FullName
      if ([string]::IsNullOrEmpty($entryName)) {
        throw "archive contains an empty path"
      }
      if ($entryName.IndexOf([char]92) -ge 0) {
        throw "archive contains a path with a backslash: $entryName"
      }
      if ($entryName -match "[\x00-\x1f]" -or $entryName -match "^[A-Za-z]:" -or $entryName.StartsWith("/")) {
        throw "archive contains an unsafe path: $entryName"
      }

      $trimmedName = $entryName.TrimEnd([char]"/")
      if (
        $trimmedName -cne $ExpectedTop -and
        -not $trimmedName.StartsWith("$ExpectedTop/", [System.StringComparison]::Ordinal)
      ) {
        throw "archive contains a path outside ${ExpectedTop}: $entryName"
      }
      $sawExpectedTop = $true

      $segments = $trimmedName.Split([char]"/")
      foreach ($segment in $segments) {
        if (
          [string]::IsNullOrEmpty($segment) -or
          $segment -ceq "." -or
          $segment -ceq ".." -or
          $segment -match '[<>:"|?*]' -or
          $segment.Length -gt 255 -or
          $segment.EndsWith(".") -or
          $segment.EndsWith(" ") -or
          $segment -match "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$"
        ) {
          throw "archive contains an unsafe path: $entryName"
        }
      }

      $collisionKey = $trimmedName.ToLowerInvariant()
      if ($seen.ContainsKey($collisionKey)) {
        throw "archive contains duplicate or case-colliding paths: $entryName"
      }
      $seen[$collisionKey] = $true

      if ($RejectLinks) {
        $unixType = (($entry.ExternalAttributes -shr 16) -band 0xF000)
        $dosAttributes = ($entry.ExternalAttributes -band 0xFFFF)
        if ($unixType -eq 0xA000 -or ($dosAttributes -band 0x0400) -ne 0) {
          throw "application archive contains a symbolic link or reparse point: $entryName"
        }
      }

      # Windows PowerShell 5 uses .NET Framework here, whose ZIP extraction
      # still observes legacy MAX_PATH limits. The installer maps its writable
      # temp directory to a short drive with subst.exe; keep a conservative
      # ceiling so future resource names fail clearly instead of half-extracting.
      $destinationEntry = $destinationPrefix + $entryName.Replace([char]47, [char]92)
      if ($destinationEntry.Length -gt 240) {
        throw "archive path is too long for Windows PowerShell 5 extraction: $entryName"
      }
    }
    if (-not $sawExpectedTop) {
      throw "archive does not contain $ExpectedTop"
    }
  } finally {
    $zip.Dispose()
  }

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  [IO.Compression.ZipFile]::ExtractToDirectory($Archive, $Destination)
}

function Get-OfficialNodeSha256 {
  param([Parameter(Mandatory = $true)][string]$Architecture)
  # Pinned from https://nodejs.org/dist/v24.14.1/SHASUMS256.txt.
  switch ($Architecture) {
    "arm64" {
      return "a7b7c68490e4a8cde1921fe5a0cfb3001d53f9c839e416903e4f28e727b62f60"
    }
    "x64" {
      return "6e50ce5498c0cebc20fd39ab3ff5df836ed2f8a31aa093cecad8497cff126d70"
    }
    default {
      throw "no private Node build is pinned for win32-$Architecture"
    }
  }
}

function Test-PrivateNodeRuntime {
  param(
    [Parameter(Mandatory = $true)][string]$RuntimeRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedSha,
    [Parameter(Mandatory = $true)][string]$Architecture
  )
  $marker = Join-Path $RuntimeRoot ".archive-sha256"
  $node = Join-Path $RuntimeRoot "node.exe"
  if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) {
    return $false
  }
  $recorded = (Get-Content -LiteralPath $marker -Raw).Trim().ToLowerInvariant()
  return (
    $recorded -ceq $ExpectedSha -and
    (Test-PinnedNode $node $Architecture)
  )
}

function Install-PrivateNode {
  param(
    [Parameter(Mandatory = $true)][string]$Architecture,
    [Parameter(Mandatory = $true)][string]$InstallRoot
  )

  $nodeArchiveName = "node-v$NodeVersion-win-$Architecture.zip"
  $nodeArchiveTop = "node-v$NodeVersion-win-$Architecture"
  $expectedSha = Get-OfficialNodeSha256 $Architecture
  if (-not [string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_NODE_ARCHIVE_SHA256)) {
    $expectedSha = Normalize-Sha256 $env:OPEN_DESIGN_NODE_ARCHIVE_SHA256
  }

  $nodeRuntime = Join-Path $InstallRoot "runtime\node-v$NodeVersion-win32-$Architecture"
  if (Test-PrivateNodeRuntime $nodeRuntime $expectedSha $Architecture) {
    Write-InstallerLog "using installed private Node v$NodeVersion"
    return (Join-Path $nodeRuntime "node.exe")
  }
  if (Test-Path -LiteralPath $nodeRuntime) {
    throw "private Node runtime exists but is incomplete or has different bytes: $nodeRuntime"
  }

  $nodeArchive = Join-Path $TempRoot "node.zip"
  if (-not [string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_NODE_ARCHIVE)) {
    if (-not (Test-Path -LiteralPath $env:OPEN_DESIGN_NODE_ARCHIVE -PathType Leaf)) {
      throw "OPEN_DESIGN_NODE_ARCHIVE is not a file: $env:OPEN_DESIGN_NODE_ARCHIVE"
    }
    if ([string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_NODE_ARCHIVE_SHA256)) {
      throw "OPEN_DESIGN_NODE_ARCHIVE_SHA256 is required with OPEN_DESIGN_NODE_ARCHIVE"
    }
    Copy-Item -LiteralPath (Resolve-Path -LiteralPath $env:OPEN_DESIGN_NODE_ARCHIVE).Path `
      -Destination $nodeArchive
    Write-InstallerLog "using local private Node archive"
  } else {
    Write-InstallerLog "downloading private Node v$NodeVersion for win32-$Architecture"
    Invoke-Download "$NodeDistBaseUrl/$nodeArchiveName" $nodeArchive
  }

  [void](Assert-FileSha256 $nodeArchive $expectedSha)
  $nodeExtractRoot = Join-Path $TempRoot "n"
  # Official Windows Node ZIPs contain ordinary files; reject reparse entries
  # for both official and caller-provided archives.
  Expand-CheckedZip $nodeArchive $nodeExtractRoot $nodeArchiveTop $true
  $nodeSource = Join-Path $nodeExtractRoot $nodeArchiveTop
  $sourceNode = Join-Path $nodeSource "node.exe"
  $sourceIdentity = Get-NodeIdentity $sourceNode
  if (-not (Test-PinnedNodeIdentity $sourceIdentity $Architecture)) {
    throw (
      "private Node archive failed executable validation " +
      "(expected $NodeVersion win32-$Architecture; $($sourceIdentity.Detail))"
    )
  }

  $publishPrivateNode = @'
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const [source, destination, expectedSha, expectedVersion] = process.argv.slice(2);
const parent = path.dirname(destination);
const stage = path.join(
  parent,
  `.${path.basename(destination)}.staging-${process.pid}-${crypto.randomUUID()}`,
);
const nodePath = (root) => path.join(
  root,
  process.platform === "win32" ? "node.exe" : "bin/node",
);
const isValid = (root) => {
  try {
    if (
      fs.readFileSync(path.join(root, ".archive-sha256"), "utf8").trim() !==
      expectedSha
    ) return false;
    const probe = childProcess.spawnSync(
      nodePath(root),
      ["-p", "process.versions.node"],
      { encoding: "utf8", windowsHide: true },
    );
    return probe.status === 0 && probe.stdout.trim() === expectedVersion;
  } catch {
    return false;
  }
};
fs.mkdirSync(parent, { recursive: true });
try {
  fs.cpSync(source, stage, { recursive: true, verbatimSymlinks: true });
  if (process.platform !== "win32") fs.chmodSync(nodePath(stage), 0o755);
  fs.writeFileSync(
    path.join(stage, ".archive-sha256"),
    `${expectedSha}\n`,
    { encoding: "ascii", mode: 0o644 },
  );
  if (!isValid(stage)) throw new Error("staged private Node runtime failed validation");
  try {
    fs.renameSync(stage, destination);
  } catch (error) {
    if (!isValid(destination)) throw error;
  }
} finally {
  fs.rmSync(stage, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
}
'@
  $publishPrivateNodePath = Join-Path $TempRoot "publish-private-node.cjs"
  Set-Content -LiteralPath $publishPrivateNodePath `
    -Value $publishPrivateNode -Encoding ASCII
  & $sourceNode $publishPrivateNodePath `
    $nodeSource $nodeRuntime $expectedSha $NodeVersion
  if ($LASTEXITCODE -ne 0) {
    throw "could not atomically publish the private Node runtime: $nodeRuntime"
  }
  if (-not (Test-PrivateNodeRuntime $nodeRuntime $expectedSha $Architecture)) {
    throw "installed private Node runtime failed validation"
  }

  Write-InstallerLog "installed private Node v$NodeVersion under the Open Design install root"
  return (Join-Path $nodeRuntime "node.exe")
}

try {
  if ($PSVersionTable.PSVersion.Major -lt 5) {
    throw "install.ps1 requires Windows PowerShell 5 or newer"
  }
  if ($env:OS -cne "Windows_NT") {
    throw "install.ps1 supports Windows only; use install.sh on macOS or Linux"
  }

  $rawArchitecture = $env:PROCESSOR_ARCHITEW6432
  if ([string]::IsNullOrWhiteSpace($rawArchitecture)) {
    $rawArchitecture = $env:PROCESSOR_ARCHITECTURE
  }
  if ([string]::IsNullOrWhiteSpace($rawArchitecture)) {
    throw "could not detect the Windows architecture"
  }
  switch ($rawArchitecture.ToUpperInvariant()) {
    "AMD64" { $Architecture = "x64" }
    "X86_64" { $Architecture = "x64" }
    "ARM64" { $Architecture = "arm64" }
    default { throw "unsupported Windows architecture: $rawArchitecture" }
  }

  if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $defaultInstallRoot = Join-Path $HOME ".open-design"
    $defaultBinDir = Join-Path $HOME ".local\bin"
  } else {
    $defaultInstallRoot = Join-Path $env:LOCALAPPDATA "Open Design\server"
    $defaultBinDir = Join-Path $env:LOCALAPPDATA "Open Design\bin"
  }
  $InstallRoot = Get-EnvironmentValue "OPEN_DESIGN_HOME" $defaultInstallRoot
  $BinDir = Get-EnvironmentValue "OPEN_DESIGN_BIN_DIR" $defaultBinDir
  $ReleaseBaseUrl = (
    Get-EnvironmentValue "OPEN_DESIGN_RELEASE_BASE_URL" $DefaultReleaseBaseUrl
  ).TrimEnd([char]"/")
  if ([string]::IsNullOrWhiteSpace($ReleaseBaseUrl)) {
    throw "OPEN_DESIGN_RELEASE_BASE_URL cannot be empty"
  }

  try {
    [Net.ServicePointManager]::SecurityProtocol =
      [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  } catch {
    # Modern PowerShell already negotiates an appropriate TLS version.
  }

  $TempRoot = New-InstallerTempRoot

  $Version = Get-EnvironmentValue "OPEN_DESIGN_VERSION" "latest"
  if (-not [string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_ARCHIVE) -and $Version -ceq "latest") {
    $localName = [IO.Path]::GetFileName($env:OPEN_DESIGN_ARCHIVE)
    $suffix = "-win32-$Architecture.zip"
    $pattern = "^open-design-server-(.+)" + [regex]::Escape($suffix) + "$"
    if ($localName -notmatch $pattern) {
      throw "cannot infer a version from local archive name: $localName"
    }
    $Version = $Matches[1]
  } elseif ($Version -ceq "latest") {
    Write-InstallerLog "resolving the latest server version"
    $versionFile = Join-Path $TempRoot "VERSION"
    Invoke-Download "$ReleaseBaseUrl/latest/VERSION" $versionFile
    $Version = Get-SingleValue $versionFile
  }
  $Version = Normalize-Version $Version

  $topName = "open-design-server-$Version-win32-$Architecture"
  $archiveName = "$topName.zip"
  $archiveFile = Join-Path $TempRoot "server.zip"

  if (-not [string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_ARCHIVE)) {
    if (-not (Test-Path -LiteralPath $env:OPEN_DESIGN_ARCHIVE -PathType Leaf)) {
      throw "OPEN_DESIGN_ARCHIVE is not a file: $env:OPEN_DESIGN_ARCHIVE"
    }
    if ([string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_ARCHIVE_SHA256)) {
      throw "OPEN_DESIGN_ARCHIVE_SHA256 is required with OPEN_DESIGN_ARCHIVE"
    }
    $localArchive = (Resolve-Path -LiteralPath $env:OPEN_DESIGN_ARCHIVE).Path
    Copy-Item -LiteralPath $localArchive -Destination $archiveFile
    $expectedArchiveSha = Normalize-Sha256 $env:OPEN_DESIGN_ARCHIVE_SHA256
    Write-InstallerLog "using local server archive $localArchive"
  } else {
    if (-not [string]::IsNullOrWhiteSpace($env:OPEN_DESIGN_ARCHIVE_SHA256)) {
      $expectedArchiveSha = Normalize-Sha256 $env:OPEN_DESIGN_ARCHIVE_SHA256
    } else {
      Write-InstallerLog "downloading checksum metadata for Open Design $Version"
      $sumsFile = Join-Path $TempRoot "SHA256SUMS"
      Invoke-Download "$ReleaseBaseUrl/v$Version/SHA256SUMS" $sumsFile
      $expectedArchiveSha = Get-NamedChecksum $sumsFile $archiveName
    }
    Write-InstallerLog "downloading Open Design $Version for win32-$Architecture"
    Invoke-Download "$ReleaseBaseUrl/v$Version/$archiveName" $archiveFile
  }

  $archiveSha = Assert-FileSha256 $archiveFile $expectedArchiveSha
  Write-InstallerLog "server archive SHA-256 verified"

  $selectedNode = $null
  $forcePrivate = ConvertTo-Boolean (
    Get-EnvironmentValue "OPEN_DESIGN_FORCE_PRIVATE_NODE" "0"
  )
  if (-not $forcePrivate) {
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if (
      $null -ne $nodeCommand -and
      (Test-CompatibleNode $nodeCommand.Path $Architecture)
    ) {
      $selectedNode = $nodeCommand.Path
      $systemNodeVersion = (& $selectedNode --version).Trim()
      Write-InstallerLog "using compatible system Node ($systemNodeVersion)"
    }
  }
  if ($null -eq $selectedNode) {
    $selectedNode = Install-PrivateNode $Architecture $InstallRoot
  }

  $payloadExtractRoot = Join-Path $TempRoot "p"
  Expand-CheckedZip $archiveFile $payloadExtractRoot $topName $true
  $payloadRoot = Join-Path $payloadExtractRoot $topName
  $installCore = Join-Path $payloadRoot "installer\install-core.mjs"
  if (-not (Test-Path -LiteralPath $payloadRoot -PathType Container)) {
    throw "archive is missing payload root $topName"
  }
  if (-not (Test-Path -LiteralPath $installCore -PathType Leaf)) {
    throw "archive is missing installer\install-core.mjs"
  }
  $coreItem = Get-Item -LiteralPath $installCore
  if (($coreItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "installer\install-core.mjs cannot be a reparse point"
  }

  Write-InstallerLog "installing Open Design $Version"
  & $selectedNode $installCore install `
    --payload-root $payloadRoot `
    --install-root $InstallRoot `
    --bin-dir $BinDir `
    --archive-sha256 $archiveSha `
    --node-bin $selectedNode
  if ($LASTEXITCODE -ne 0) {
    throw "installer core failed with exit code $LASTEXITCODE"
  }

  $normalizedBinDir = [IO.Path]::GetFullPath($BinDir).TrimEnd([char]92)
  $binOnPath = $false
  $processPath = $env:PATH
  if ($null -eq $processPath) {
    $processPath = ""
  }
  foreach ($pathEntry in ($processPath -split ";")) {
    if (-not [string]::IsNullOrWhiteSpace($pathEntry)) {
      try {
        if (
          [IO.Path]::GetFullPath($pathEntry).TrimEnd([char]92) -ieq
          $normalizedBinDir
        ) {
          $binOnPath = $true
          break
        }
      } catch {
        # Ignore malformed unrelated PATH entries while reporting install state.
      }
    }
  }
  if ($binOnPath) {
    Write-InstallerLog "installed; run open-design daemon start --serve-web"
  } else {
    Write-InstallerLog "installed launcher directory is not on PATH: $BinDir"
    Write-Host "  Add that directory to your user PATH and open a new terminal."
    Write-Host "  Or run now: & `"$BinDir\open-design.cmd`" daemon start --serve-web"
  }
} catch {
  [Console]::Error.WriteLine("open-design: error: $($_.Exception.Message)")
  exit 1
} finally {
  $ownsTempDrive = $false
  $tempDriveReleased = $null -eq $TempDrive
  if ($null -ne $TempDrive) {
    $ownerMarker = Join-Path $TempRoot ".odsi-owner-$TempDriveOwnerToken"
    if (Test-Path -LiteralPath $ownerMarker -PathType Leaf) {
      $mappedOwner = Get-Content -LiteralPath $ownerMarker -Raw -ErrorAction SilentlyContinue
      if ($null -ne $mappedOwner) {
        $ownsTempDrive = $mappedOwner.Trim() -ceq $TempDriveOwnerToken
      }
    }
  }
  if ($ownsTempDrive) {
    Get-ChildItem -LiteralPath $TempRoot -Force -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    $subst = Join-Path $env:SystemRoot "System32\subst.exe"
    if (Test-Path -LiteralPath $subst -PathType Leaf) {
      & $subst $TempDrive /D 2>$null | Out-Null
      $tempDriveReleased = $LASTEXITCODE -eq 0
    }
  }
  if (
    $tempDriveReleased -and
    $null -ne $TempPhysicalRoot -and
    (Test-Path -LiteralPath $TempPhysicalRoot)
  ) {
    Remove-Item -LiteralPath $TempPhysicalRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
