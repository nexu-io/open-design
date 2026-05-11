import { execFile } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import type { ToolPackConfig } from "../config.js";
import { winResources } from "../resources.js";
import { PRODUCT_NAME } from "./constants.js";
import { pathExists } from "./fs.js";
import { resolveWinInstallIdentity } from "./identity.js";
import { readPackagedVersion } from "./manifest.js";
import { ensureNsisPersianLanguageAlias } from "./nsis.js";
import { sanitizeNamespace } from "./paths.js";
import type { WinBuiltAppManifest, WinPaths } from "./types.js";

const execFileAsync = promisify(execFile);

const NSIS_LANGUAGES = [
  { macro: "LANG_ENGLISH", name: "English" },
  { macro: "LANG_SIMPCHINESE", name: "SimpChinese" },
  { macro: "LANG_TRADCHINESE", name: "TradChinese" },
  { macro: "LANG_PORTUGUESEBR", name: "PortugueseBR" },
  { macro: "LANG_RUSSIAN", name: "Russian" },
  { macro: "LANG_PERSIAN", name: "Persian" },
] as const;

function escapeNsisString(value: string): string {
  return value.replace(/\$/g, "$$").replace(/"/g, '$\\"').replace(/\r?\n/g, "$\\r$\\n");
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

async function writeInstallerScript(config: ToolPackConfig, paths: WinPaths): Promise<void> {
  const identity = resolveWinInstallIdentity(config);
  const productName = escapeNsisString(identity.displayName);
  const exeName = escapeNsisString(identity.exeName);
  const uninstallerName = escapeNsisString(identity.uninstallerName);
  const shortcutName = escapeNsisString(identity.shortcutName);
  const registryKey = escapeNsisString(identity.registryKey);
  const appPathsKey = escapeNsisString(identity.appPathsKey);
  const namespace = escapeNsisString(config.namespace);
  const localDataRoot = `$APPDATA\\${escapeNsisString(PRODUCT_NAME)}\\namespaces\\${escapeNsisString(sanitizeNamespace(config.namespace))}`;
  const nsisLogPath = escapeNsisString(paths.nsisLogPath);
  const runningInstancesScriptPath = join(dirname(paths.installerScriptPath), "running-instances.ps1");

  await mkdir(dirname(paths.installerScriptPath), { recursive: true });
  await writeFile(runningInstancesScriptPath, createRunningInstancesScript(), "utf8");
  const script = `Unicode true
ManifestDPIAware true
RequestExecutionLevel user

!ifndef OUTPUT_EXE
  !error "OUTPUT_EXE define is required"
!endif
!ifndef PAYLOAD_7Z
  !error "PAYLOAD_7Z define is required"
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
Var RemoveLocalDataCheckbox
Var RemoveDesktopShortcutState
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
  StrCpy $RemoveLocalDataState 0
FunctionEnd

Function DetectRunningInstances
  Push $0
  Push $1
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\running-instances.ps1" "\${RUNNING_INSTANCES_PS1}"
  nsExec::ExecToStack 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\running-instances.ps1" detect "$RunningInstancesInstallRoot" "$ExistingInstallLocation"'
  Pop $0
  Pop $1
  \${If} $0 == "0"
    StrCpy $RunningInstancesOutput $1
  \${Else}
    StrCpy $RunningInstancesOutput "__detection_failed__"
    Push "running instance detection failed exit=$0 output=$1"
    Call LogInstallerEvent
  \${EndIf}
  Pop $1
  Pop $0
FunctionEnd

Function CloseRunningInstances
  Push $0
  Push $1
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\running-instances.ps1" "\${RUNNING_INSTANCES_PS1}"
  nsExec::ExecToStack 'powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\\running-instances.ps1" close "$RunningInstancesInstallRoot" "$ExistingInstallLocation"'
  Pop $0
  Pop $1
  Push "running instances close exit=$0 output=$1"
  Call LogInstallerEvent
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
    Push "$(ExistingInstallSilentOverwrite)"
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

  \${NSD_CreateCheckbox} 0 18u 100% 12u "$(RemoveLocalData)"
  Pop $RemoveLocalDataCheckbox

  nsDialogs::Show
done:
FunctionEnd

Function un.UninstallOptionsPageLeave
  StrCpy $RemoveDesktopShortcutState "\${BST_CHECKED}"
  StrCpy $RemoveLocalDataState 0
  IfSilent done
  \${NSD_GetState} $RemoveDesktopShortcutCheckbox $RemoveDesktopShortcutState
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
  File "/oname=$PLUGINSDIR\\payload.7z" "\${PAYLOAD_7Z}"
  File "/oname=$PLUGINSDIR\\7z.exe" "\${SEVEN_Z_EXE}"
  File "/oname=$PLUGINSDIR\\7z.dll" "\${SEVEN_Z_DLL}"

  CreateDirectory "$INSTDIR"
  Push "payload extraction start"
  Call LogInstallerEvent
  nsExec::ExecToLog '"$PLUGINSDIR\\7z.exe" x -y "$PLUGINSDIR\\payload.7z" "-o$INSTDIR"'
  Pop $0
  Push "payload extraction exit=$0"
  Call LogInstallerEvent
  \${If} $0 != "0"
    DetailPrint "7z extraction failed with exit code $0"
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
  WriteRegStr HKCU "${registryKey}" "DisplayName" "${productName} \${APP_VERSION}"
  WriteRegStr HKCU "${registryKey}" "DisplayVersion" "\${APP_VERSION}"
  WriteRegStr HKCU "${registryKey}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${registryKey}" "UninstallString" '"$INSTDIR\\${uninstallerName}" /currentuser'
  WriteRegStr HKCU "${registryKey}" "QuietUninstallString" '"$INSTDIR\\${uninstallerName}" /currentuser /S'
  WriteRegStr HKCU "${registryKey}" "DisplayIcon" "$INSTDIR\\${exeName},0"
  WriteRegStr HKCU "${appPathsKey}" "" "$INSTDIR\\${exeName}"
  Push "event=registry_after_write key=${registryKey} appPathsKey=${appPathsKey}"
  Call LogInstallerEvent
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

export async function buildCustomWinNsisInstaller(
  config: ToolPackConfig,
  paths: WinPaths,
  builtApp: WinBuiltAppManifest,
): Promise<void> {
  if (process.platform !== "win32") throw new Error("Windows installer build must run on Windows");
  const makensisCommand = await resolveMakensisCommand(config);
  const packagedVersion = await readPackagedVersion(config);
  await ensureNsisPersianLanguageAlias(config);

  await mkdir(dirname(paths.installerPayloadPath), { recursive: true });
  await mkdir(dirname(paths.setupPath), { recursive: true });
  await rm(paths.installerPayloadPath, { force: true });
  await rm(paths.setupPath, { force: true });
  await execFileAsync(winResources.sevenZipExe, ["a", "-t7z", "-mx=1", "-ms=off", paths.installerPayloadPath, ".\\*"], {
    cwd: builtApp.unpackedRoot,
    windowsHide: true,
  });
  await stat(paths.installerPayloadPath);
  await writeInstallerScript(config, paths);
  await execFileAsync(makensisCommand, [
    "/V2",
    `/DAPP_VERSION=${packagedVersion}`,
    `/DOUTPUT_EXE=${paths.setupPath}`,
    `/DPAYLOAD_7Z=${paths.installerPayloadPath}`,
    `/DSEVEN_Z_EXE=${winResources.sevenZipExe}`,
    `/DSEVEN_Z_DLL=${winResources.sevenZipDll}`,
    `/DAPP_ICON=${paths.winIconPath}`,
    `/DRUNNING_INSTANCES_PS1=${join(dirname(paths.installerScriptPath), "running-instances.ps1")}`,
    paths.installerScriptPath,
  ], {
    cwd: dirname(paths.installerScriptPath),
    windowsHide: true,
  });
  await stat(paths.setupPath);
}
