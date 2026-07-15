import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { resolveToolPackLauncherLayout } from "../launcher-layout.js";
import { winResources } from "../resources.js";
import { PRODUCT_NAME } from "./constants.js";
import { pathExists } from "./fs.js";
import { resolveWinInstallIdentity } from "./identity.js";
import { readPackagedVersion } from "./manifest.js";
import { ensureNsisPersianLanguageAlias } from "./nsis.js";
import { sanitizeNamespace } from "./paths.js";
import { signAndVerifyWinFile } from "./sign.js";
import type { WinBuiltAppManifest, WinPackTiming, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

const NSIS_LANGUAGES = [
  { macro: "LANG_ENGLISH", name: "English" },
  { macro: "LANG_SIMPCHINESE", name: "SimpChinese" },
  { macro: "LANG_TRADCHINESE", name: "TradChinese" },
  { macro: "LANG_PORTUGUESEBR", name: "PortugueseBR" },
  { macro: "LANG_RUSSIAN", name: "Russian" },
  { macro: "LANG_PERSIAN", name: "Persian" },
] as const;

const WIN_NSIS_OVERLAY_RELATIVE_PATHS = [
  `${PRODUCT_NAME}.exe`,
  "resources/app/package.json",
  "resources/open-design-config.json",
] as const;

export const WIN_PAYLOAD_SEVEN_Z_CREATE_ARGS = ["-t7z", "-m0=LZMA2", "-mx=1", "-mf=off"] as const;
const WIN_NSIS_PAYLOAD_SEVEN_Z_TIMEOUT_MS = 300_000;

function escapeNsisString(value: string): string {
  return value.replace(/\$/g, "$$").replace(/"/g, '$\\"').replace(/\r?\n/g, "$\\r$\\n");
}

function normalizeArchivePath(relativePath: string): string {
  return relativePath.split("/").join("\\");
}

export function resolveWinNsisOverlayRequiredPaths(): string[][] {
  return WIN_NSIS_OVERLAY_RELATIVE_PATHS.map((relativePath) => [relativePath]);
}

export async function hashWinNsisBasePayloadInputs(builtApp: WinBuiltAppManifest): Promise<string> {
  const excluded = new Set(WIN_NSIS_OVERLAY_RELATIVE_PATHS.map((entry) => entry.split("/").join("\\")));
  const hash = createHash("sha256");

  async function visit(current: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = join(current, entry.name);
      const relativePath = relative(builtApp.unpackedRoot, child).split("/").join("\\");
      if (excluded.has(relativePath)) continue;
      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}\n`);
        await visit(child);
        continue;
      }
      if (entry.isFile()) {
        hash.update(`file:${relativePath}\n`);
        hash.update(await readFile(child));
      }
    }
  }

  hash.update("win-nsis-payload-base-inputs:v1\n");
  await visit(builtApp.unpackedRoot);
  return hash.digest("hex");
}

function createNsisLanguageInserts(): string {
  return NSIS_LANGUAGES.map((language) => `!insertmacro MUI_LANGUAGE "${language.name}"`).join("\n");
}

function createNsisLangString(
  key: string,
  english: string,
  translations: Partial<Record<(typeof NSIS_LANGUAGES)[number]["macro"], string>> = {},
): string {
  return NSIS_LANGUAGES
    .map((language) => {
      const value = translations[language.macro] ?? english;
      return `LangString ${key} \${${language.macro}} "${escapeNsisString(value)}"`;
    })
    .join("\n");
}

function createLauncherRuntimeSyncScript(
  config: ToolPackConfig,
  runtimePath: string,
  attemptsPath: string,
  cleanupPath: string,
  helperScriptPath: string,
): string {
  if (config.portable) {
    return `
Function SyncLauncherRuntime
FunctionEnd
`;
  }
  const helperFileName = escapeNsisString(helperScriptPath.split(/[\\/]/).at(-1) ?? "sync-launcher-runtime.ps1");
  const escapedRuntimePath = escapeNsisString(runtimePath);
  const escapedAttemptsPath = escapeNsisString(attemptsPath);
  const escapedCleanupPath = escapeNsisString(cleanupPath);
  const escapedChannel = escapeNsisString(resolveToolPackLauncherLayout(config).channel);
  const escapedNamespace = escapeNsisString(config.namespace);

  return `
Function SyncLauncherRuntime
  Push $0
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\${helperFileName}" "${escapeNsisString(helperScriptPath)}"
  nsExec::ExecToLog 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\${helperFileName}" -RuntimePath "${escapedRuntimePath}" -AttemptsPath "${escapedAttemptsPath}" -CleanupPath "${escapedCleanupPath}" -Channel "${escapedChannel}" -Namespace "${escapedNamespace}" -Version "\${APP_VERSION}"'
  Pop $0
  Push "launcher runtime sync exit=$0"
  Call LogInstallerEvent
  \${If} $0 != "0"
    DetailPrint "launcher runtime sync failed with exit code $0"
    Abort
  \${EndIf}
  Push "event=launcher_runtime_after_write path=${escapedRuntimePath}"
  Call LogInstallerEvent
  Pop $0
FunctionEnd
`;
}

export function createLauncherRuntimeSyncPowerShellScript(): string {
  return `param(
  [Parameter(Mandatory = $true)][string]$RuntimePath,
  [Parameter(Mandatory = $true)][string]$AttemptsPath,
  [Parameter(Mandatory = $true)][string]$CleanupPath,
  [Parameter(Mandatory = $true)][string]$Channel,
  [Parameter(Mandatory = $true)][string]$Namespace,
  [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = "Stop"

function Parse-ComparableLauncherVersion {
  param([Parameter(Mandatory = $true)][string]$Value)
  $cleaned = ($Value.Trim() -replace '^v', '') -split '\\+', 2 | Select-Object -First 1
  $nightly = [regex]::Match($cleaned, '^(\\d+)\\.(\\d+)\\.(\\d+)\\.nightly\\.(\\d+)$', 'IgnoreCase')
  if ($nightly.Success) {
    return [pscustomobject]@{
      "Nums" = @([int]$nightly.Groups[1].Value, [int]$nightly.Groups[2].Value, [int]$nightly.Groups[3].Value)
      "Pre" = @('nightly', $nightly.Groups[4].Value)
    }
  }

  $separator = $cleaned.IndexOf('-')
  $core = if ($separator -lt 0) { $cleaned } else { $cleaned.Substring(0, $separator) }
  $pre = if ($separator -lt 0) { @() } else { $cleaned.Substring($separator + 1).Split('.') }
  $parts = $core.Split('.')
  $nums = @()
  for ($index = 0; $index -lt 3; $index += 1) {
    $part = if ($index -lt $parts.Count) { $parts[$index] } else { '' }
    if ($part -match '^\\d+$') { $nums += [int]$part } else { $nums += 0 }
  }
  return [pscustomobject]@{ "Nums" = @($nums); "Pre" = @($pre) }
}

function Compare-LauncherIdentifier {
  param([Parameter(Mandatory = $true)][string]$Left, [Parameter(Mandatory = $true)][string]$Right)
  $leftIsNumber = $Left -match '^\\d+$'
  $rightIsNumber = $Right -match '^\\d+$'
  if ($leftIsNumber -and $rightIsNumber) { return [Math]::Sign(([int]$Left) - ([int]$Right)) }
  if ($leftIsNumber) { return -1 }
  if ($rightIsNumber) { return 1 }
  return [Math]::Sign([string]::Compare($Left, $Right, [StringComparison]::Ordinal))
}

function Compare-LauncherVersions {
  param([Parameter(Mandatory = $true)][string]$Left, [Parameter(Mandatory = $true)][string]$Right)
  $leftParsed = Parse-ComparableLauncherVersion $Left
  $rightParsed = Parse-ComparableLauncherVersion $Right
  for ($index = 0; $index -lt 3; $index += 1) {
    $delta = $leftParsed.Nums[$index] - $rightParsed.Nums[$index]
    if ($delta -ne 0) { return [Math]::Sign($delta) }
  }
  if ($leftParsed.Pre.Count -eq 0 -and $rightParsed.Pre.Count -eq 0) { return 0 }
  if ($leftParsed.Pre.Count -eq 0) { return 1 }
  if ($rightParsed.Pre.Count -eq 0) { return -1 }
  $max = [Math]::Max($leftParsed.Pre.Count, $rightParsed.Pre.Count)
  for ($index = 0; $index -lt $max; $index += 1) {
    if ($index -ge $leftParsed.Pre.Count) { return -1 }
    if ($index -ge $rightParsed.Pre.Count) { return 1 }
    $delta = Compare-LauncherIdentifier ([string]$leftParsed.Pre[$index]) ([string]$rightParsed.Pre[$index])
    if ($delta -ne 0) { return $delta }
  }
  return 0
}

function New-CleanupEntry {
  param(
    [Parameter(Mandatory = $true)][string]$EntryVersion,
    [Parameter(Mandatory = $true)][int]$EntryGeneration,
    [Parameter(Mandatory = $true)][string]$EntryReason,
    [Parameter(Mandatory = $true)][string]$EntryState,
    [Parameter(Mandatory = $true)][string]$UpdatedAt
  )
  $entry = New-Object PSObject
  $entry | Add-Member -NotePropertyName "generation" -NotePropertyValue $EntryGeneration
  $entry | Add-Member -NotePropertyName "reason" -NotePropertyValue $EntryReason
  $entry | Add-Member -NotePropertyName "state" -NotePropertyValue $EntryState
  $entry | Add-Member -NotePropertyName "updatedAt" -NotePropertyValue $UpdatedAt
  $entry | Add-Member -NotePropertyName "version" -NotePropertyValue $EntryVersion
  return $entry
}

function Get-PointerGeneration {
  param($Pointer)
  if ($null -eq $Pointer -or $null -eq $Pointer.generation) { return 0 }
  try {
    $generation = [int]$Pointer.generation
    if ($generation -lt 0) { return 0 }
    return $generation
  } catch {
    return 0
  }
}

$previousRuntime = $null
if (Test-Path -LiteralPath $RuntimePath) {
  try {
    $previousRuntime = Get-Content -LiteralPath $RuntimePath -Raw | ConvertFrom-Json
  } catch {
    $previousRuntime = $null
  }
}

$updatedAt = (Get-Date).ToUniversalTime().ToString("o")
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$pointer = [ordered]@{ "generation" = 0; "version" = $Version }
$runtime = [ordered]@{
  "active" = $pointer
  "channel" = $Channel
  "lastSuccessful" = $pointer
  "namespace" = $Namespace
  "schemaVersion" = 1
  "updatedAt" = $updatedAt
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $RuntimePath) | Out-Null
[System.IO.File]::WriteAllText($RuntimePath, (($runtime | ConvertTo-Json -Depth 8) + [Environment]::NewLine), $utf8NoBom)
Remove-Item -LiteralPath $AttemptsPath -Force -ErrorAction SilentlyContinue

if ($null -ne $previousRuntime) {
  $deprecatedByVersion = @{}
  foreach ($pointerCandidate in @($previousRuntime.active, $previousRuntime.lastSuccessful)) {
    if ($null -eq $pointerCandidate -or [string]::IsNullOrWhiteSpace([string]$pointerCandidate.version)) { continue }
    $candidateVersion = [string]$pointerCandidate.version
    if ((Compare-LauncherVersions $candidateVersion $Version) -ge 0) { continue }
    $generation = Get-PointerGeneration $pointerCandidate
    if ($deprecatedByVersion.ContainsKey($candidateVersion)) {
      $existing = $deprecatedByVersion[$candidateVersion]
      if ($generation -gt [int]$existing.generation) {
        $deprecatedByVersion[$candidateVersion] = New-CleanupEntry $candidateVersion $generation 'older-than-bound-package' 'deprecated' $updatedAt
      }
    } else {
      $deprecatedByVersion[$candidateVersion] = New-CleanupEntry $candidateVersion $generation 'older-than-bound-package' 'deprecated' $updatedAt
    }
  }

  if ($deprecatedByVersion.Count -gt 0) {
    $versions = @()
    $versions += @($deprecatedByVersion.Values | Sort-Object -Property version)
    $versions += New-CleanupEntry $Version 0 'current-bound-package' 'retained' $updatedAt
    $cleanup = [ordered]@{
      "channel" = $Channel
      "currentVersion" = $Version
      "namespace" = $Namespace
      "updatedAt" = $updatedAt
      "version" = 1
      "versions" = $versions
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $CleanupPath) | Out-Null
    [System.IO.File]::WriteAllText($CleanupPath, (($cleanup | ConvertTo-Json -Depth 8) + [Environment]::NewLine), $utf8NoBom)
  }
}
`;
}

async function findFirstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

async function findElectronBuilderMakensis(config: ToolPackConfig): Promise<string | null> {
  const cacheRoots = [
    process.env.ELECTRON_BUILDER_CACHE,
    process.env.LOCALAPPDATA == null ? undefined : join(process.env.LOCALAPPDATA, "electron-builder", "Cache"),
    process.env.APPDATA == null ? undefined : join(process.env.APPDATA, "electron-builder", "Cache"),
    join(config.workspaceRoot, "node_modules", ".cache", "electron-builder"),
  ].filter((entry): entry is string => entry != null && entry.length > 0);
  for (const cacheRoot of cacheRoots) {
    const direct = await findFirstExistingPath([
      join(cacheRoot, "nsis", "nsis-3.0.4.1-nsis-3.0.4.1", "makensis.exe"),
      join(cacheRoot, "nsis", "nsis-3.0.4.1-nsis-3.0.4.1", "Bin", "makensis.exe"),
    ]);
    if (direct != null) return direct;
  }
  return null;
}

async function resolveMakensisCommand(config: ToolPackConfig): Promise<string> {
  const cached = await findElectronBuilderMakensis(config);
  if (cached != null) return cached;
  const candidates = [
    "makensis.exe",
    "makensis",
    "C:\\Program Files (x86)\\NSIS\\makensis.exe",
    "C:\\Program Files\\NSIS\\makensis.exe",
  ];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["/VERSION"], { windowsHide: true });
      return candidate;
    } catch {
      // Keep probing known locations.
    }
  }
  throw new Error("makensis is required to build the Windows installer; install NSIS or populate the electron-builder NSIS cache");
}

function createRunningInstancesScript(): string {
  return `param(
  [ValidateSet("detect", "close")]
  [string]$Action,
  [string]$Install,
  [string]$Registered
)

$ErrorActionPreference = "Stop"

$roots = @($Install, $Registered) |
  Where-Object { $_ } |
  ForEach-Object {
    $root = $_.TrimEnd([char]92).ToLowerInvariant()
    [pscustomobject]@{ Exact = $root; Prefix = ($root + [char]92) }
  } |
  Select-Object -Unique Exact, Prefix

$matches = Get-CimInstance Win32_Process | Where-Object {
  $matched = $false
  $exe = $_.ExecutablePath
  if ($null -ne $exe) {
    $exe = $exe.ToLowerInvariant()
    foreach ($root in $roots) {
      if ($root.Exact -and (($exe -eq $root.Exact) -or $exe.StartsWith($root.Prefix))) {
        $matched = $true
        break
      }
    }
  } else {
    $cmd = $_.CommandLine
    if ($null -ne $cmd) {
      $cmdLc = $cmd.ToLowerInvariant()
      foreach ($root in $roots) {
        if ($root.Prefix -and $cmdLc.Contains($root.Prefix)) {
          $matched = $true
          break
        }
      }
    }
  }
  $matched
}

$ids = @($matches | ForEach-Object { $_.ProcessId })
if ($Action -eq "close") {
  foreach ($id in $ids) {
    try { [void][System.Diagnostics.Process]::GetProcessById($id).CloseMainWindow() } catch {}
  }
  Start-Sleep -Milliseconds 1500
  foreach ($id in $ids) {
    try {
      $p = [System.Diagnostics.Process]::GetProcessById($id)
      if (-not $p.HasExited) {
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
  foreach ($id in $ids) {
    try {
      $p = [System.Diagnostics.Process]::GetProcessById($id)
      if (-not $p.HasExited) {
        [void]$p.WaitForExit(5000)
      }
    } catch {}
  }
}

if ($ids) {
  $matches | ForEach-Object { [string]$_.ProcessId + [char]32 + $_.Name }
}
`;
}

async function writeInstallerScript(config: ToolPackConfig, paths: WinPaths, packagedVersion: string): Promise<void> {
  const identity = resolveWinInstallIdentity(config);
  const launcher = resolveToolPackLauncherLayout(config);
  const productName = escapeNsisString(identity.displayName);
  const exeName = escapeNsisString(identity.exeName);
  const uninstallerName = escapeNsisString(identity.uninstallerName);
  const shortcutName = escapeNsisString(identity.shortcutName);
  const registryKey = escapeNsisString(identity.registryKey);
  const appPathsKey = escapeNsisString(identity.appPathsKey);
  const namespace = escapeNsisString(config.namespace);
  const localDataRoot = `$APPDATA\\${escapeNsisString(PRODUCT_NAME)}\\namespaces\\${escapeNsisString(sanitizeNamespace(config.namespace))}`;
  const localCacheRoot = `${localDataRoot}\\cache`;
  const localUpdateDownloadsRoot = `${localDataRoot}\\updates\\downloads`;
  const localUpdateReleasesRoot = `${localDataRoot}\\updates\\releases`;
  const localUpdateStagingRoot = `${localDataRoot}\\updates\\staging`;
  const nsisLogPath = escapeNsisString(paths.nsisLogPath);
  const runningInstancesScriptPath = join(dirname(paths.installerScriptPath), "running-instances.ps1");
  const launcherRuntimeSyncScriptPath = join(dirname(paths.installerScriptPath), "sync-launcher-runtime.ps1");

  await mkdir(dirname(paths.installerScriptPath), { recursive: true });
  await writeFile(runningInstancesScriptPath, createRunningInstancesScript(), "utf8");
  await writeFile(launcherRuntimeSyncScriptPath, createLauncherRuntimeSyncPowerShellScript(), "utf8");
  const script = `Unicode true
ManifestDPIAware true
RequestExecutionLevel user

!ifndef OUTPUT_EXE
  !error "OUTPUT_EXE define is required"
!endif
!ifndef PAYLOAD_BASE_7Z
  !error "PAYLOAD_BASE_7Z define is required"
!endif
!ifndef PAYLOAD_OVERLAY_7Z
  !error "PAYLOAD_OVERLAY_7Z define is required"
!endif
!ifndef SEVEN_Z_EXE
  !error "SEVEN_Z_EXE define is required"
!endif
!ifndef SEVEN_Z_DLL
  !error "SEVEN_Z_DLL define is required"
!endif
!ifndef APP_ICON
  !error "APP_ICON define is required"
!endif
!ifndef APP_VERSION
  !error "APP_VERSION define is required"
!endif
!ifndef RUNNING_INSTANCES_PS1
  !error "RUNNING_INSTANCES_PS1 define is required"
!endif

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

Name "${productName}"
OutFile "\${OUTPUT_EXE}"
InstallDir "$LOCALAPPDATA\\Programs\\${productName}"
InstallDirRegKey HKCU "${registryKey}" "InstallLocation"
Icon "\${APP_ICON}"
UninstallIcon "\${APP_ICON}"
ShowInstDetails show
ShowUninstDetails hide

!define MUI_ABORTWARNING
!define MUI_ICON "\${APP_ICON}"
!define MUI_UNICON "\${APP_ICON}"
Page custom RunningInstancesPage RunningInstancesPageLeave
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryPageLeave
!insertmacro MUI_PAGE_DIRECTORY
!undef MUI_PAGE_CUSTOMFUNCTION_LEAVE
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\${exeName}"
!define MUI_FINISHPAGE_RUN_TEXT "$(LaunchApp)"
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(CreateDesktopShortcut)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
UninstPage custom un.UninstallOptionsPage un.UninstallOptionsPageLeave
!insertmacro MUI_UNPAGE_INSTFILES
${createNsisLanguageInserts()}

${createNsisLangString("CreateDesktopShortcut", "Create desktop shortcut", { LANG_SIMPCHINESE: "创建桌面快捷方式" })}
${createNsisLangString("LaunchApp", `Launch ${productName}`, { LANG_SIMPCHINESE: `启动 ${productName}` })}
${createNsisLangString("RemoveDesktopShortcut", "Remove desktop shortcut", { LANG_SIMPCHINESE: "删除桌面快捷方式" })}
${createNsisLangString("RemoveCacheData", "Delete downloaded update and cache files", { LANG_SIMPCHINESE: "删除已下载的更新和缓存文件" })}
${createNsisLangString("RemoveLocalData", "Delete local data for this installation", { LANG_SIMPCHINESE: "删除此安装的本地数据" })}
${createNsisLangString("UninstallOptionsTitle", "Uninstall options", { LANG_SIMPCHINESE: "卸载选项" })}
${createNsisLangString("UninstallOptionsSubtitle", "Choose which local items to remove.", { LANG_SIMPCHINESE: "选择要删除的本地项目。" })}
${createNsisLangString("RunningInstancesTitle", `${productName} is still running`, { LANG_SIMPCHINESE: `${productName} 仍在运行` })}
${createNsisLangString("RunningInstancesSubtitle", "Close it before continuing installation.", { LANG_SIMPCHINESE: "继续安装前需要关闭它。" })}
${createNsisLangString("RunningInstancesMessage", `${productName} must be closed before installation can continue.`, { LANG_SIMPCHINESE: `继续安装前需要关闭 ${productName}。` })}
${createNsisLangString("CloseAndContinue", "Close and continue", { LANG_SIMPCHINESE: "关闭并继续" })}
${createNsisLangString("RunningInstancesCloseFailed", `${productName} could not be closed. Close it manually, then try again.`, { LANG_SIMPCHINESE: `无法关闭 ${productName}。请手动关闭后重试。` })}
${createNsisLangString("RunningInstancesSilentAbort", `${productName} is still running. Close it before running the installer silently.`, { LANG_SIMPCHINESE: `${productName} 仍在运行。请先关闭它，再运行静默安装。` })}
${createNsisLangString("ExistingInstallMessage", `${productName} is already installed in the selected folder. Choose OK to overwrite it, or Cancel to stop installation.`, { LANG_SIMPCHINESE: `所选文件夹中已经安装了 ${productName}。选择确定覆盖，或取消安装。` })}
${createNsisLangString("ExistingInstallSilentOverwrite", "Existing installation found; silent install will overwrite it.", { LANG_SIMPCHINESE: "发现已有安装；静默安装将覆盖它。" })}

Var RemoveDesktopShortcutCheckbox
Var RemoveCacheDataCheckbox
Var RemoveLocalDataCheckbox
Var RemoveDesktopShortcutState
Var RemoveCacheDataState
Var RemoveLocalDataState
Var RunningInstancesOutput
Var ExistingInstallLocation
Var RunningInstancesInstallRoot
Var LE
Var LT
Var LX

!macro LOG_PATH_STATE EVENT TARGET
  StrCpy $LE "\${EVENT}"
  StrCpy $LT "\${TARGET}"
  Call LogPathState
!macroend

!macro UN_LOG_PATH_STATE EVENT TARGET
  StrCpy $LE "\${EVENT}"
  StrCpy $LT "\${TARGET}"
  Call un.LogPathState
!macroend

Function LogInstallerEvent
  Exch $0
  Push $1
  CreateDirectory "${escapeNsisString(dirname(paths.nsisLogPath))}"
  FileOpen $1 "${nsisLogPath}" a
  IfErrors done
  FileSeek $1 0 END
  FileWrite $1 "$0$\\r$\\n"
  FileClose $1
done:
  Pop $1
  Pop $0
FunctionEnd

Function LogPathState
  StrCpy $LX 0
  IfFileExists "$LT" 0 check_dir
  StrCpy $LX 1
  Goto write
check_dir:
  IfFileExists "$LT\\*.*" 0 write
  StrCpy $LX 1
write:
  Push "event=$LE target=$LT exists=$LX"
  Call LogInstallerEvent
FunctionEnd

${createLauncherRuntimeSyncScript(
  config,
  launcher.paths.runtimePath,
  launcher.paths.attemptsPath,
  launcher.paths.cleanupPath,
  launcherRuntimeSyncScriptPath,
)}

Function un.LogInstallerEvent
  Exch $0
  Push $1
  CreateDirectory "${escapeNsisString(dirname(paths.nsisLogPath))}"
  FileOpen $1 "${nsisLogPath}" a
  IfErrors done
  FileSeek $1 0 END
  FileWrite $1 "$0$\\r$\\n"
  FileClose $1
done:
  Pop $1
  Pop $0
FunctionEnd

Function un.LogPathState
  StrCpy $LX 0
  IfFileExists "$LT" 0 check_dir
  StrCpy $LX 1
  Goto write
check_dir:
  IfFileExists "$LT\\*.*" 0 write
  StrCpy $LX 1
write:
  Push "event=$LE target=$LT exists=$LX"
  Call un.LogInstallerEvent
FunctionEnd

Function un.onInit
  StrCpy $RemoveDesktopShortcutState "\${BST_CHECKED}"
  StrCpy $RemoveCacheDataState "\${BST_CHECKED}"
  StrCpy $RemoveLocalDataState 0
FunctionEnd

Function DetectRunningInstances
  Push $0
  Push $1
  Push $2
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\running-instances.ps1" "\${RUNNING_INSTANCES_PS1}"

  ; Try pwsh.exe first (PowerShell 7)
  nsExec::ExecToStack 'pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\running-instances.ps1" detect "$RunningInstancesInstallRoot" "$ExistingInstallLocation"'
  Pop $0
  Pop $1

  \${If} $0 == "0"
    ; pwsh.exe succeeded
    StrCpy $RunningInstancesOutput $1
    Goto done
  \${EndIf}

  ; pwsh.exe failed, try powershell.exe (Windows PowerShell 5.1)
  Push "pwsh.exe failed exit=$0, trying powershell.exe"
  Call LogInstallerEvent

  nsExec::ExecToStack 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\running-instances.ps1" detect "$RunningInstancesInstallRoot" "$ExistingInstallLocation"'
  Pop $0
  Pop $1

  \${If} $0 == "0"
    ; powershell.exe succeeded
    StrCpy $RunningInstancesOutput $1
    Goto done
  \${EndIf}

  ; Both failed
  StrCpy $RunningInstancesOutput "__detection_failed__"
  Push "running instance detection failed: both pwsh.exe and powershell.exe failed, last exit=$0 output=$1"
  Call LogInstallerEvent

done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function CloseRunningInstances
  Push $0
  Push $1
  Push $2
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\running-instances.ps1" "\${RUNNING_INSTANCES_PS1}"

  ; Try pwsh.exe first (PowerShell 7)
  nsExec::ExecToStack 'pwsh.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\running-instances.ps1" close "$RunningInstancesInstallRoot" "$ExistingInstallLocation"'
  Pop $0
  Pop $1

  \${If} $0 == "0"
    ; pwsh.exe succeeded
    Push "running instances close via pwsh.exe exit=$0 output=$1"
    Call LogInstallerEvent
    Goto done
  \${EndIf}

  ; pwsh.exe failed, try powershell.exe (Windows PowerShell 5.1)
  Push "pwsh.exe failed exit=$0, trying powershell.exe"
  Call LogInstallerEvent

  nsExec::ExecToStack 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\running-instances.ps1" close "$RunningInstancesInstallRoot" "$ExistingInstallLocation"'
  Pop $0
  Pop $1

  \${If} $0 == "0"
    ; powershell.exe succeeded
    Push "running instances close via powershell.exe exit=$0 output=$1"
    Call LogInstallerEvent
    Goto done
  \${EndIf}

  ; Both failed
  Push "running instances close failed: both pwsh.exe and powershell.exe failed, last exit=$0 output=$1"
  Call LogInstallerEvent

done:
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

Function .onInit
  SetShellVarContext current
  ReadRegStr $ExistingInstallLocation HKCU "${registryKey}" "InstallLocation"
  StrCpy $RunningInstancesInstallRoot ""
  \${If} $ExistingInstallLocation != ""
    IfFileExists "$ExistingInstallLocation\\${exeName}" valid_existing_location invalid_existing_location
invalid_existing_location:
    Push "ignoring registered install location without expected exe: $ExistingInstallLocation"
    Call LogInstallerEvent
    StrCpy $ExistingInstallLocation ""
valid_existing_location:
  \${EndIf}

  IfSilent silent_check no_existing_install
silent_check:
  IfFileExists "$INSTDIR\\${exeName}" 0 silent_detect_running_instances
  StrCpy $RunningInstancesInstallRoot "$INSTDIR"
silent_detect_running_instances:
  Call DetectRunningInstances
  \${If} $RunningInstancesOutput != ""
    Push "running instances detected before silent install: $RunningInstancesOutput"
    Call LogInstallerEvent
    Call CloseRunningInstances
    Call DetectRunningInstances
    \${If} $RunningInstancesOutput != ""
      Push "install aborted: running instances still detected before silent install: $RunningInstancesOutput"
      Call LogInstallerEvent
      Abort "$(RunningInstancesSilentAbort)"
    \${EndIf}
  \${EndIf}

  IfFileExists "$INSTDIR\\${exeName}" existing_install no_existing_install
existing_install:
  IfSilent 0 no_existing_install
    Push "existing installation found; silent install will overwrite it"
    Call LogInstallerEvent
    Goto no_existing_install

cancel_install:
  Push "install cancelled before file changes"
  Call LogInstallerEvent
  Abort

no_existing_install:
FunctionEnd

Function RunningInstancesPage
  IfSilent done
  StrCpy $RunningInstancesInstallRoot ""
  Call DetectRunningInstances
  \${If} $RunningInstancesOutput == ""
    Abort
  \${EndIf}
  Push "running instances detected before install: $RunningInstancesOutput"
  Call LogInstallerEvent

  !insertmacro MUI_HEADER_TEXT "$(RunningInstancesTitle)" "$(RunningInstancesSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  \${If} $0 == error
    Abort
  \${EndIf}

  \${NSD_CreateLabel} 0 0 100% 36u "$(RunningInstancesMessage)"
  Pop $0

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 \${WM_SETTEXT} 0 "STR:$(CloseAndContinue)"
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 0

  nsDialogs::Show
done:
FunctionEnd

Function RunningInstancesPageLeave
  StrCpy $RunningInstancesInstallRoot ""
  Call CloseRunningInstances
  Call DetectRunningInstances
  \${If} $RunningInstancesOutput != ""
    Push "running instances still detected after close: $RunningInstancesOutput"
    Call LogInstallerEvent
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(RunningInstancesCloseFailed)"
    Abort
  \${EndIf}
FunctionEnd

Function GuardRunningInstancesBeforeInstall
  StrCpy $RunningInstancesInstallRoot ""
  IfFileExists "$INSTDIR\\${exeName}" 0 detect_running_instances
  StrCpy $RunningInstancesInstallRoot "$INSTDIR"
detect_running_instances:
  Call DetectRunningInstances
  \${If} $RunningInstancesOutput == ""
    Return
  \${EndIf}

  Push "running instances detected at install section: $RunningInstancesOutput"
  Call LogInstallerEvent
  Call CloseRunningInstances
  Call DetectRunningInstances
  \${If} $RunningInstancesOutput != ""
    Push "install aborted: running instances still detected before file changes: $RunningInstancesOutput"
    Call LogInstallerEvent
    Abort "$(RunningInstancesCloseFailed)"
  \${EndIf}
FunctionEnd

Function DirectoryPageLeave
  IfSilent done
  IfFileExists "$INSTDIR\\${exeName}" existing_install done
existing_install:
  MessageBox MB_OKCANCEL|MB_ICONQUESTION "$(ExistingInstallMessage)$\\r$\\n$\\r$\\n$INSTDIR" IDOK done IDCANCEL cancel_install
cancel_install:
  Push "install cancelled at existing install confirmation"
  Call LogInstallerEvent
  Abort
done:
FunctionEnd

Function CreateDesktopShortcut
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  !insertmacro LOG_PATH_STATE "desktop_shortcut_before_create" "$DESKTOP\\${shortcutName}"
  CreateShortCut "$DESKTOP\\${shortcutName}" "$INSTDIR\\${exeName}" "" "$INSTDIR\\${exeName}" 0
  !insertmacro LOG_PATH_STATE "desktop_shortcut_after_create" "$DESKTOP\\${shortcutName}"
FunctionEnd

Function RemoveInstallDir
  !insertmacro LOG_PATH_STATE "install_dir_before_remove" "$INSTDIR"
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "$INSTDIR" rmdir /s /q "\\\\?\\$INSTDIR"'
  Pop $0
  Push "install dir remove exit=$0"
  Call LogInstallerEvent
  Pop $0
  !insertmacro LOG_PATH_STATE "install_dir_after_remove" "$INSTDIR"
FunctionEnd

Function un.UninstallOptionsPage
  IfSilent done
  !insertmacro MUI_HEADER_TEXT "$(UninstallOptionsTitle)" "$(UninstallOptionsSubtitle)"
  nsDialogs::Create 1018
  Pop $0
  \${If} $0 == error
    Abort
  \${EndIf}

  \${NSD_CreateCheckbox} 0 0 100% 12u "$(RemoveDesktopShortcut)"
  Pop $RemoveDesktopShortcutCheckbox
  \${NSD_Check} $RemoveDesktopShortcutCheckbox

  \${NSD_CreateCheckbox} 0 18u 100% 12u "$(RemoveCacheData)"
  Pop $RemoveCacheDataCheckbox
  \${NSD_Check} $RemoveCacheDataCheckbox

  \${NSD_CreateCheckbox} 0 36u 100% 12u "$(RemoveLocalData)"
  Pop $RemoveLocalDataCheckbox

  nsDialogs::Show
done:
FunctionEnd

Function un.UninstallOptionsPageLeave
  StrCpy $RemoveDesktopShortcutState "\${BST_CHECKED}"
  StrCpy $RemoveCacheDataState "\${BST_CHECKED}"
  StrCpy $RemoveLocalDataState 0
  IfSilent done
  \${NSD_GetState} $RemoveDesktopShortcutCheckbox $RemoveDesktopShortcutState
  \${NSD_GetState} $RemoveCacheDataCheckbox $RemoveCacheDataState
  \${NSD_GetState} $RemoveLocalDataCheckbox $RemoveLocalDataState
done:
FunctionEnd

Function un.RemoveInstallDirContents
  !insertmacro UN_LOG_PATH_STATE "install_dir_before_remove" "$INSTDIR"
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "$INSTDIR" rmdir /s /q "\\\\?\\$INSTDIR"'
  Pop $0
  Push "install dir fast remove exit=$0"
  Call un.LogInstallerEvent
  Pop $0
  !insertmacro UN_LOG_PATH_STATE "install_dir_after_remove" "$INSTDIR"
FunctionEnd

Function un.RemoveLocalDataRoot
  !insertmacro UN_LOG_PATH_STATE "local_data_before_remove" "${localDataRoot}"
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "${localDataRoot}" rmdir /s /q "\\\\?\\${localDataRoot}"'
  Pop $0
  Push "local data remove exit=$0"
  Call un.LogInstallerEvent
  Pop $0
  !insertmacro UN_LOG_PATH_STATE "local_data_after_remove" "${localDataRoot}"
FunctionEnd

Function un.RemoveCacheDataRoots
  !insertmacro UN_LOG_PATH_STATE "cache_root_before_remove" "${localCacheRoot}"
  !insertmacro UN_LOG_PATH_STATE "update_downloads_before_remove" "${localUpdateDownloadsRoot}"
  !insertmacro UN_LOG_PATH_STATE "update_releases_before_remove" "${localUpdateReleasesRoot}"
  !insertmacro UN_LOG_PATH_STATE "update_staging_before_remove" "${localUpdateStagingRoot}"
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "${localCacheRoot}" rmdir /s /q "\\\\?\\${localCacheRoot}"'
  Pop $0
  Push "cache root remove exit=$0"
  Call un.LogInstallerEvent
  Pop $0
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "${localUpdateDownloadsRoot}" rmdir /s /q "\\\\?\\${localUpdateDownloadsRoot}"'
  Pop $0
  Push "update downloads remove exit=$0"
  Call un.LogInstallerEvent
  Pop $0
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "${localUpdateReleasesRoot}" rmdir /s /q "\\\\?\\${localUpdateReleasesRoot}"'
  Pop $0
  Push "update releases remove exit=$0"
  Call un.LogInstallerEvent
  Pop $0
  Push $0
  nsExec::ExecToLog 'cmd.exe /d /s /c if exist "${localUpdateStagingRoot}" rmdir /s /q "\\\\?\\${localUpdateStagingRoot}"'
  Pop $0
  Push "update staging remove exit=$0"
  Call un.LogInstallerEvent
  Pop $0
  !insertmacro UN_LOG_PATH_STATE "cache_root_after_remove" "${localCacheRoot}"
  !insertmacro UN_LOG_PATH_STATE "update_downloads_after_remove" "${localUpdateDownloadsRoot}"
  !insertmacro UN_LOG_PATH_STATE "update_releases_after_remove" "${localUpdateReleasesRoot}"
  !insertmacro UN_LOG_PATH_STATE "update_staging_after_remove" "${localUpdateStagingRoot}"
FunctionEnd

Section "Install"
  SetShellVarContext current
  Push "install section start"
  Call LogInstallerEvent
  Call GuardRunningInstancesBeforeInstall
  !insertmacro LOG_PATH_STATE "install_dir_before_install" "$INSTDIR"
  !insertmacro LOG_PATH_STATE "installed_exe_before_install" "$INSTDIR\\${exeName}"

  IfFileExists "$INSTDIR\\${exeName}" 0 prepare_install_dir
  Call RemoveInstallDir

prepare_install_dir:
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "/oname=$PLUGINSDIR\\payload-base.7z" "\${PAYLOAD_BASE_7Z}"
  File "/oname=$PLUGINSDIR\\payload-overlay.7z" "\${PAYLOAD_OVERLAY_7Z}"
  File "/oname=$PLUGINSDIR\\7z.exe" "\${SEVEN_Z_EXE}"
  File "/oname=$PLUGINSDIR\\7z.dll" "\${SEVEN_Z_DLL}"

  CreateDirectory "$INSTDIR"
  Push "payload base extraction start"
  Call LogInstallerEvent
  nsExec::ExecToLog '"$PLUGINSDIR\\7z.exe" x -y "$PLUGINSDIR\\payload-base.7z" "-o$INSTDIR"'
  Pop $0
  Push "payload base extraction exit=$0"
  Call LogInstallerEvent
  \${If} $0 != "0"
    DetailPrint "base payload extraction failed with exit code $0"
    Abort
  \${EndIf}

  Push "payload overlay extraction start"
  Call LogInstallerEvent
  nsExec::ExecToLog '"$PLUGINSDIR\\7z.exe" x -y "$PLUGINSDIR\\payload-overlay.7z" "-o$INSTDIR"'
  Pop $0
  Push "payload overlay extraction exit=$0"
  Call LogInstallerEvent
  \${If} $0 != "0"
    DetailPrint "overlay payload extraction failed with exit code $0"
    Abort
  \${EndIf}

  !insertmacro LOG_PATH_STATE "install_dir_after_extract" "$INSTDIR"
  !insertmacro LOG_PATH_STATE "installed_exe_after_extract" "$INSTDIR\\${exeName}"
  WriteUninstaller "$INSTDIR\\${uninstallerName}"
  !insertmacro LOG_PATH_STATE "uninstaller_after_write" "$INSTDIR\\${uninstallerName}"
  SetOutPath "$INSTDIR"
  IfSilent 0 skip_silent_desktop_shortcut
  !insertmacro LOG_PATH_STATE "desktop_shortcut_before_create" "$DESKTOP\\${shortcutName}"
  CreateShortCut "$DESKTOP\\${shortcutName}" "$INSTDIR\\${exeName}" "" "$INSTDIR\\${exeName}" 0
  !insertmacro LOG_PATH_STATE "desktop_shortcut_after_create" "$DESKTOP\\${shortcutName}"
skip_silent_desktop_shortcut:
  !insertmacro LOG_PATH_STATE "start_menu_shortcut_before_create" "$SMPROGRAMS\\${shortcutName}"
  CreateShortCut "$SMPROGRAMS\\${shortcutName}" "$INSTDIR\\${exeName}" "" "$INSTDIR\\${exeName}" 0
  !insertmacro LOG_PATH_STATE "start_menu_shortcut_after_create" "$SMPROGRAMS\\${shortcutName}"
  WriteRegStr HKCU "${registryKey}" "DisplayName" "${productName}"
  WriteRegStr HKCU "${registryKey}" "DisplayVersion" "\${APP_VERSION}"
  WriteRegStr HKCU "${registryKey}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${registryKey}" "UninstallString" '"$INSTDIR\\${uninstallerName}" /currentuser'
  WriteRegStr HKCU "${registryKey}" "QuietUninstallString" '"$INSTDIR\\${uninstallerName}" /currentuser /S'
  WriteRegStr HKCU "${registryKey}" "DisplayIcon" "$INSTDIR\\${exeName},0"
  WriteRegStr HKCU "${appPathsKey}" "" "$INSTDIR\\${exeName}"
  Push "event=registry_after_write key=${registryKey} appPathsKey=${appPathsKey}"
  Call LogInstallerEvent
  Call SyncLauncherRuntime
  Push "install section done"
  Call LogInstallerEvent
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Push "uninstall section start"
  Call un.LogInstallerEvent
  IfSilent delete_desktop_shortcut check_desktop_shortcut_state
check_desktop_shortcut_state:
  \${If} $RemoveDesktopShortcutState == \${BST_CHECKED}
    Delete "$DESKTOP\\${shortcutName}"
  \${EndIf}
  Goto after_desktop_shortcut
delete_desktop_shortcut:
  Delete "$DESKTOP\\${shortcutName}"
after_desktop_shortcut:
  !insertmacro UN_LOG_PATH_STATE "desktop_shortcut_after_delete" "$DESKTOP\\${shortcutName}"
  Delete "$SMPROGRAMS\\${shortcutName}"
  !insertmacro UN_LOG_PATH_STATE "start_menu_shortcut_after_delete" "$SMPROGRAMS\\${shortcutName}"
  DeleteRegKey HKCU "${registryKey}"
  DeleteRegKey HKCU "${appPathsKey}"
  Push "event=registry_after_delete key=${registryKey} appPathsKey=${appPathsKey}"
  Call un.LogInstallerEvent
  \${If} $RemoveCacheDataState == \${BST_CHECKED}
    Call un.RemoveCacheDataRoots
  \${EndIf}
  \${If} $RemoveLocalDataState == \${BST_CHECKED}
    Call un.RemoveLocalDataRoot
  \${EndIf}
  Call un.RemoveInstallDirContents
  Delete "$INSTDIR\\${uninstallerName}"
  RMDir "$INSTDIR"
  !insertmacro UN_LOG_PATH_STATE "install_dir_after_final_rmdir" "$INSTDIR"
  Push "uninstall section done"
  Call un.LogInstallerEvent
SectionEnd
`;
  await writeFile(paths.installerScriptPath, `\uFEFF${script}`, "utf8");
}

function assertWinInstallerBuildPlatform(): void {
  if (process.platform !== "win32") throw new Error("Windows installer build must run on Windows");
}

function logWinInstallerProgress(message: string, fields: Record<string, unknown> = {}): void {
  const suffix = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  process.stderr.write(`[tools-pack win] ${message}${suffix.length === 0 ? "" : ` ${suffix}`}\n`);
}

function createWinNsisTimingHelpers() {
  const timings: WinPackTiming[] = [];
  const runSegment = async <T>(
    phase: string,
    task: () => Promise<T>,
    details: Record<string, unknown> = {},
  ): Promise<T> => {
    const startedAt = Date.now();
    logWinInstallerProgress("segment:start", { phase });
    try {
      const result = await task();
      logWinInstallerProgress("segment:done", { durationMs: Date.now() - startedAt, phase });
      return result;
    } catch (error) {
      logWinInstallerProgress("segment:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      throw error;
    } finally {
      timings.push({ details, durationMs: Date.now() - startedAt, phase });
    }
  };
  const runExecSegment = async (
    phase: string,
    command: string,
    args: string[],
    options: { cwd: string; outputPath?: string; timeoutMs?: number },
  ): Promise<void> => {
    const startedAt = Date.now();
    const details: Record<string, unknown> = {
      args,
      command,
      cwd: options.cwd,
    };
    logWinInstallerProgress("segment:start", { phase });
    try {
      const result = await execFileAsync(command, args, {
        cwd: options.cwd,
        timeout: options.timeoutMs,
        windowsHide: true,
      });
      details.stdoutBytes = result.stdout.length;
      details.stderrBytes = result.stderr.length;
      details.stdoutTail = result.stdout.slice(-2000);
      details.stderrTail = result.stderr.slice(-2000);
      if (options.outputPath != null) {
        details.outputBytes = (await stat(options.outputPath)).size;
        details.outputPath = options.outputPath;
      }
      logWinInstallerProgress("segment:done", { durationMs: Date.now() - startedAt, phase });
      timings.push({ details, durationMs: Date.now() - startedAt, phase });
    } catch (error) {
      const failure = error as { code?: unknown; killed?: unknown; signal?: unknown; stderr?: unknown; stdout?: unknown };
      details.code = failure.code;
      details.killed = failure.killed;
      details.signal = failure.signal;
      details.stdoutTail = typeof failure.stdout === "string" ? failure.stdout.slice(-2000) : undefined;
      details.stderrTail = typeof failure.stderr === "string" ? failure.stderr.slice(-2000) : undefined;
      if (options.outputPath != null && await pathExists(options.outputPath)) {
        details.outputBytes = (await stat(options.outputPath)).size;
        details.outputPath = options.outputPath;
      }
      logWinInstallerProgress("segment:failed", {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        phase,
      });
      timings.push({ details, durationMs: Date.now() - startedAt, phase });
      throw error;
    }
  };
  return { runExecSegment, runSegment, timings };
}

async function buildWinNsisPayloadArchive(
  builtApp: WinBuiltAppManifest,
  outputPath: string,
  phasePrefix: string,
  archiveArgs: string[],
): Promise<WinPackTiming[]> {
  assertWinInstallerBuildPlatform();
  const { runExecSegment, runSegment, timings } = createWinNsisTimingHelpers();

  await runSegment(`${phasePrefix}:prepare`, async () => {
    await mkdir(dirname(outputPath), { recursive: true });
    await rm(outputPath, { force: true });
  });
  const payloadSnapshotDetails: Record<string, unknown> = {};
  await runSegment(`${phasePrefix}:input-snapshot`, async () => {
    Object.assign(payloadSnapshotDetails, await collectPathSnapshot(builtApp.unpackedRoot));
  }, payloadSnapshotDetails);
  await runSegment(phasePrefix, async () => {
    await runExecSegment(
      `${phasePrefix}:process`,
      winResources.sevenZipExe,
      archiveArgs,
      { cwd: builtApp.unpackedRoot, outputPath, timeoutMs: WIN_NSIS_PAYLOAD_SEVEN_Z_TIMEOUT_MS },
    );
  });
  return timings;
}

async function stageWinNsisOverlayPayload(builtApp: WinBuiltAppManifest, stageRoot: string): Promise<void> {
  await rm(stageRoot, { force: true, recursive: true });
  await mkdir(stageRoot, { recursive: true });
  for (const relativePath of WIN_NSIS_OVERLAY_RELATIVE_PATHS) {
    const sourcePath = join(builtApp.unpackedRoot, ...relativePath.split("/"));
    const targetPath = join(stageRoot, ...relativePath.split("/"));
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, { recursive: true });
  }
}

export async function buildWinNsisBasePayload(
  paths: WinPaths,
  builtApp: WinBuiltAppManifest,
): Promise<WinPackTiming[]> {
  return buildWinNsisPayloadArchive(
    builtApp,
    paths.installerBasePayloadPath,
    "nsis:payload-base-7z",
    [
      "a",
      ...WIN_PAYLOAD_SEVEN_Z_CREATE_ARGS,
      paths.installerBasePayloadPath,
      ".\\*",
      ...WIN_NSIS_OVERLAY_RELATIVE_PATHS.map((relativePath) => `-x!${normalizeArchivePath(relativePath)}`),
    ],
  );
}

export async function buildWinNsisOverlayPayload(
  paths: WinPaths,
  builtApp: WinBuiltAppManifest,
): Promise<WinPackTiming[]> {
  assertWinInstallerBuildPlatform();
  const { runExecSegment, runSegment, timings } = createWinNsisTimingHelpers();
  const stageRoot = join(dirname(paths.installerOverlayPayloadPath), "payload-overlay-stage");

  await runSegment("nsis:payload-overlay-7z:prepare", async () => {
    await mkdir(dirname(paths.installerOverlayPayloadPath), { recursive: true });
    await rm(paths.installerOverlayPayloadPath, { force: true });
  });
  const payloadSnapshotDetails: Record<string, unknown> = {};
  await runSegment("nsis:payload-overlay-7z:input-snapshot", async () => {
    Object.assign(payloadSnapshotDetails, await collectPathSnapshot(builtApp.unpackedRoot));
  }, payloadSnapshotDetails);
  try {
    await runSegment("nsis:payload-overlay-7z:stage", async () => {
      await stageWinNsisOverlayPayload(builtApp, stageRoot);
    });
    await runSegment("nsis:payload-overlay-7z", async () => {
      await runExecSegment(
        "nsis:payload-overlay-7z:process",
        winResources.sevenZipExe,
        [
          "a",
          ...WIN_PAYLOAD_SEVEN_Z_CREATE_ARGS,
          paths.installerOverlayPayloadPath,
          ".\\*",
        ],
        { cwd: stageRoot, outputPath: paths.installerOverlayPayloadPath, timeoutMs: WIN_NSIS_PAYLOAD_SEVEN_Z_TIMEOUT_MS },
      );
    });
  } finally {
    await rm(stageRoot, { force: true, recursive: true });
  }
  return timings;
}

export async function buildCustomWinNsisInstaller(
  config: ToolPackConfig,
  paths: WinPaths,
): Promise<WinPackTiming[]> {
  assertWinInstallerBuildPlatform();
  const { runExecSegment, runSegment, timings } = createWinNsisTimingHelpers();
  const makensisCommand = await runSegment("nsis:resolve-makensis", async () => resolveMakensisCommand(config));
  const packagedVersion = await runSegment("nsis:read-version", async () => readPackagedVersion(config));
  await runSegment("nsis:ensure-persian-language", async () => {
    await ensureNsisPersianLanguageAlias(config);
  });

  await runSegment("nsis:prepare", async () => {
    await mkdir(dirname(paths.setupPath), { recursive: true });
    await rm(paths.setupPath, { force: true });
  });
  await runSegment("nsis:write-script", async () => {
    await writeInstallerScript(config, paths, packagedVersion);
  });
  await runSegment("nsis:makensis", async () => {
    await runExecSegment(
      "nsis:makensis:process",
      makensisCommand,
      [
        "/V2",
        `/DAPP_VERSION=${packagedVersion}`,
        `/DOUTPUT_EXE=${paths.setupPath}`,
        `/DPAYLOAD_BASE_7Z=${paths.installerBasePayloadPath}`,
        `/DPAYLOAD_OVERLAY_7Z=${paths.installerOverlayPayloadPath}`,
        `/DSEVEN_Z_EXE=${winResources.sevenZipExe}`,
        `/DSEVEN_Z_DLL=${winResources.sevenZipDll}`,
        `/DAPP_ICON=${paths.winIconPath}`,
        `/DRUNNING_INSTANCES_PS1=${join(dirname(paths.installerScriptPath), "running-instances.ps1")}`,
        paths.installerScriptPath,
      ],
      { cwd: dirname(paths.installerScriptPath), outputPath: paths.setupPath },
    );
  });
  if (config.signed) {
    const signingDetails: Record<string, unknown> = {};
    await runSegment("windows-sign:setup-exe", async () => {
      Object.assign(signingDetails, await signAndVerifyWinFile(paths.setupPath));
    }, signingDetails);
  }
  await runSegment("nsis:stat", async () => {
    await stat(paths.setupPath);
  });
  return timings;
}

async function collectPathSnapshot(root: string): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  let bytes = 0;
  let directories = 0;
  let files = 0;
  let maxPathLength = root.length;
  const errors: string[] = [];

  async function visit(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
      directories += 1;
      if (current.length > maxPathLength) maxPathLength = current.length;
    } catch (error) {
      if (errors.length < 8) errors.push(error instanceof Error ? error.message : String(error));
      return;
    }

    for (const entry of entries) {
      const child = join(current, entry.name);
      if (child.length > maxPathLength) maxPathLength = child.length;
      if (entry.isDirectory()) {
        await visit(child);
        continue;
      }
      files += 1;
      try {
        bytes += (await stat(child)).size;
      } catch (error) {
        if (errors.length < 8) errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  await visit(root);
  return {
    bytes,
    directories,
    durationMs: Date.now() - startedAt,
    errors,
    files,
    maxPathLength,
    root,
  };
}
