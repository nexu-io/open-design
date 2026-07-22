import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { createLauncherRuntimeSyncPowerShellScript } from "../src/win/custom-installer.js";
import { resolveWinInstallIdentity } from "../src/win/identity.js";

const execFileAsync = promisify(execFile);

describe("resolveWinInstallIdentity", () => {
  it("keeps the default namespace on the canonical Windows display name", () => {
    expect(resolveWinInstallIdentity({ namespace: "default" })).toMatchObject({
      displayName: "Open Design",
      shortcutName: "Open Design.lnk",
      uninstallerName: "Uninstall Open Design.exe",
    });
  });

  it("uses the canonical Windows display name for stable release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-stable-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design.exe",
      displayName: "Open Design",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-stable-win",
      shortcutName: "Open Design.lnk",
      uninstallerName: "Uninstall Open Design.exe",
    });
  });

  it("uses first-class beta display identity for beta release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-beta-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design Beta.exe",
      displayName: "Open Design Beta",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-beta-win",
      shortcutName: "Open Design Beta.lnk",
      uninstallerName: "Uninstall Open Design Beta.exe",
    });
  });

  it("keeps non-release beta-like namespaces isolated from the real beta channel identity", () => {
    expect(resolveWinInstallIdentity({ namespace: "beta-local-flow" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design beta-local-flow.exe",
      displayName: "Open Design beta-local-flow",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-beta-local-flow",
      shortcutName: "Open Design beta-local-flow.lnk",
      uninstallerName: "Uninstall Open Design beta-local-flow.exe",
    });
  });

  it("uses first-class preview display identity for preview release namespaces", () => {
    expect(resolveWinInstallIdentity({ namespace: "release-preview-win" })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design Preview.exe",
      displayName: "Open Design Preview",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-preview-win",
      shortcutName: "Open Design Preview.lnk",
      uninstallerName: "Uninstall Open Design Preview.exe",
    });
  });

  it("uses first-class prerelease display identity for prerelease release versions and namespaces", () => {
    expect(resolveWinInstallIdentity({
      appVersion: "0.8.0-prerelease.2",
      namespace: "release-stable-win",
    })).toMatchObject({
      appPathsKey: "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Open Design Prerelease.exe",
      displayName: "Open Design Prerelease",
      registryKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Open Design-release-stable-win",
      shortcutName: "Open Design Prerelease.lnk",
      uninstallerName: "Uninstall Open Design Prerelease.exe",
    });
    expect(resolveWinInstallIdentity({ namespace: "release-prerelease-win" })).toMatchObject({
      displayName: "Open Design Prerelease",
      shortcutName: "Open Design Prerelease.lnk",
    });
  });

  it("keeps the registry DisplayName free of the package version", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain('WriteRegStr HKCU "${registryKey}" "DisplayName" "${productName}"');
    expect(source).not.toContain('"DisplayName" "${productName} \\${APP_VERSION}"');
  });

  it("stages a complete replacement before publishing the stable launcher", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    const initialization = source.slice(source.indexOf("Function .onInit"), source.indexOf("Function RunningInstancesPage"));
    const guard = source.slice(source.indexOf("Function GuardRunningInstancesBeforeInstall"), source.indexOf("Function DirectoryPageLeave"));
    const transaction = source.slice(source.indexOf("Function PrepareInstallTransaction"), source.indexOf("Function un.UninstallOptionsPage"));
    const recordTarget = source.slice(source.indexOf("Function RecordFreshInstallTargetState"), source.indexOf("Function InspectEmptyInstallDirBackup"));
    const emptyTarget = source.slice(source.indexOf("Function QuarantineEmptyFreshInstallDir"), source.indexOf("Function CommitInstallDir"));
    const committedCleanup = source.slice(source.indexOf("Function CleanupCommittedInstallTransaction"), source.indexOf("Function CleanupInstallTransaction"));
    const install = source.slice(source.indexOf('Section "Install"'), source.indexOf("SectionEnd", source.indexOf('Section "Install"')));
    const commitIndex = install.indexOf("Call CommitInstallDir");
    const preCommit = install.slice(0, commitIndex);
    const postCommit = install.slice(commitIndex);

    expect(initialization).not.toContain("Call CloseRunningInstances");
    expect(source).not.toContain("$ExistingInstallLocation");
    expect(initialization).toContain('IfFileExists "$INSTDIR\\\\${exeName}" existing_install no_existing_install');
    expect(guard).toContain('StrCpy $RunningInstancesInstallRoot "$INSTDIR"');
    expect(guard.indexOf("Call CloseRunningInstances")).toBeLessThan(guard.lastIndexOf("Call DetectRunningInstances"));
    expect(initialization).toContain('ReadRegStr $RegisteredInstallLocation HKCU "${registryKey}" "InstallLocation"');
    expect(guard).toContain("Call GuardRegisteredInstallInstances");
    expect(guard).toContain("Call CleanupAfterLauncherRestore");
    expect(source).toContain("Function InspectInstallDir");
    expect(source).toContain('FindFirst $0 $1 "$INSTDIR\\\\*"');
    expect(install.split("Call InspectInstallDir").length - 1).toBe(2);
    expect(install).not.toContain('IfFileExists "$INSTDIR\\\\*.*"');
    expect(install.split('IfFileExists "$INSTDIR\\\\${exeName}"').length - 1).toBe(2);

    expect(source).toContain('GetTempFileName $InstallTransactionRoot "$0"');
    expect(source).toContain('CreateDirectory "$InstallTransactionRoot"');
    expect(source).not.toContain("GetTempFileName $InstallLauncherBackup");
    expect(source).toContain('StrCpy $InstallLauncherBackup "$InstallTransactionRoot\\\\launcher"');
    expect(source).toContain('StrCpy $InstallDirBackup "$InstallTransactionRoot\\\\previous"');
    expect(source).toContain('StrCpy $InstallReplacementDir "$InstallTransactionRoot\\\\replacement"');
    expect(source).toContain('StrCpy $EmptyInstallDirBackup "$InstallTransactionRoot\\\\empty-target"');
    expect(source).not.toContain("$FailedInstallDir");
    expect(source).toContain('Rename "$InstallLauncherBackup" "$InstallDirBackup\\\\${exeName}"');
    expect(source).toContain('Rename "$INSTDIR" "$InstallDirBackup"');
    expect(source).toContain('Rename "$InstallDirBackup" "$INSTDIR"');
    expect(source).toContain('Rename "$InstallReplacementDir" "$INSTDIR"');
    expect(transaction).not.toContain('RMDir "$INSTDIR"');
    expect(transaction).not.toContain('RMDir /r "$INSTDIR"');
    expect(source).toContain('\\${GetParent} "$INSTDIR" $0');
    expect(source).toContain('\\${GetRoot} "$0" $1');
    expect(source).not.toContain("$EmptyInstallDirRemoved");
    expect(emptyTarget).toContain('Rename "$INSTDIR" "$EmptyInstallDirBackup"');
    expect(emptyTarget).toContain('Rename "$EmptyInstallDirBackup" "$INSTDIR"');
    expect(emptyTarget).not.toContain('CreateDirectory "$INSTDIR"');
    expect(recordTarget).toContain('\\${GetFileAttributes} "$INSTDIR" "DIRECTORY"');
    expect(recordTarget).toContain('\\${GetFileAttributes} "$INSTDIR" "REPARSE_POINT"');
    expect(recordTarget).toContain('StrCpy $FreshInstallTargetWasEmpty "1"');
    expect(emptyTarget).toContain('$FreshInstallTargetWasEmpty != "1"');
    expect(emptyTarget).toContain("Call InspectEmptyInstallDirBackup");
    expect(emptyTarget).toContain("fresh install target changed while it was quarantined");
    expect(emptyTarget.split('\\${GetFileAttributes} "$EmptyInstallDirBackup"').length - 1).toBe(2);
    expect(committedCleanup).toContain('RMDir "$EmptyInstallDirBackup"');
    expect(committedCleanup).toContain("committed install cleanup preserved a changed empty target");
    expect(committedCleanup.split('\\${GetFileAttributes} "$EmptyInstallDirBackup"').length - 1).toBe(2);

    expect(install.indexOf('File "/oname=$PLUGINSDIR\\\\payload-base.7z"')).toBeLessThan(
      install.indexOf("Call GuardRunningInstancesBeforeInstall"),
    );
    expect(install.indexOf("Call GuardRunningInstancesBeforeInstall")).toBeLessThan(
      install.indexOf("Call QuarantineInstallDir"),
    );
    expect(install.indexOf("Call RecordFreshInstallTargetState")).toBeLessThan(
      install.indexOf("Call PrepareInstallTransaction"),
    );
    expect(install.indexOf("Call QuarantineEmptyFreshInstallDir")).toBeLessThan(
      install.indexOf('CreateDirectory "$InstallReplacementDir"'),
    );
    expect(preCommit).toContain('"-o$InstallReplacementDir"');
    expect(preCommit).not.toContain('"-o$INSTDIR"');
    expect(preCommit).toContain('WriteUninstaller "$InstallReplacementDir\\\\${uninstallerName}"');
    expect(preCommit.indexOf("payload overlay extraction start")).toBeLessThan(
      preCommit.indexOf('WriteUninstaller "$InstallReplacementDir\\\\${uninstallerName}"'),
    );
    expect(postCommit).not.toContain("Call RollbackFailedInstall");
    expect(postCommit.indexOf("Call CommitInstallDir")).toBeLessThan(postCommit.indexOf('SetOutPath "$INSTDIR"'));
    expect(transaction).toContain("failed fresh install staging removed; target restored unchanged");
    expect(transaction).toContain("fresh install target changed before staging");
    expect(transaction).toContain("target reappeared; previous install preserved");
    expect(transaction).toContain("replacement commit blocked by a recreated target");
    expect(transaction).toContain("Call RestoreEmptyFreshInstallDir");
    expect(transaction).toContain("launcher restore incomplete; transaction preserved");
    expect(transaction).not.toContain('rmdir /s /q "\\\\\\\\?\\\\$INSTDIR"');
  });

  it("syncs launcher runtime metadata after a successful Windows install", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    const latePublish = source.slice(source.lastIndexOf("registry_failed:"), source.indexOf('Push "install section done"'));
    expect(source).toContain("Function SyncLauncherRuntime");
    expect(source).toContain("sync-launcher-runtime.ps1");
    expect(source).toContain("-CleanupPath");
    expect(source).toContain("current-bound-package");
    expect(source).toContain("older-than-bound-package");
    expect(source).toContain("[System.IO.File]::WriteAllText($CleanupPath");
    expect(source).toContain('Push "event=launcher_runtime_after_write path=${escapedRuntimePath}"');
    expect(source).toContain('$LauncherRuntimeSyncFailed "1"');
    expect(source).toContain("IfErrors registry_failed registry_written");
    expect(source).toContain("Call CleanupCommittedInstallTransaction");
    expect(latePublish).not.toContain("Call RollbackFailedInstall");
    expect(latePublish).toContain('Abort "$(InstallFinalizeFailed)"');
    expect(source.indexOf('Push "event=registry_after_write key=${registryKey} appPathsKey=${appPathsKey}"')).toBeLessThan(
      source.indexOf("Call SyncLauncherRuntime"),
    );
    expect(source.indexOf("Call SyncLauncherRuntime")).toBeLessThan(source.indexOf('Push "install section done"'));
    expect(source.indexOf("Call SyncLauncherRuntime")).toBeLessThan(source.lastIndexOf("Call CleanupCommittedInstallTransaction"));
  });

  it.skipIf(process.platform !== "win32")("writes cleanup metadata when installer runtime sync supersedes an older runtime", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-pack-launcher-sync-"));
    const runtimePath = join(root, "launcher", "channels", "beta", "namespaces", "cf", "runtime.json");
    const attemptsPath = join(root, "launcher", "channels", "beta", "namespaces", "cf", "state", "attempt.json");
    const cleanupPath = join(root, "launcher", "channels", "beta", "namespaces", "cf", "state", "cleanup.json");
    const scriptPath = join(root, "sync-launcher-runtime.ps1");

    try {
      await mkdir(join(root, "launcher", "channels", "beta", "namespaces", "cf", "state"), { recursive: true });
      await writeFile(
        runtimePath,
        `${JSON.stringify({
          active: { generation: 1, version: "0.10.2-beta.9" },
          channel: "beta",
          lastSuccessful: { generation: 0, version: "0.10.1-beta.1" },
          namespace: "cf",
          schemaVersion: 1,
        })}\n`,
        "utf8",
      );
      await writeFile(
        attemptsPath,
        `${JSON.stringify({
          channel: "beta",
          generation: 1,
          namespace: "cf",
          schemaVersion: 1,
          version: "0.10.2-beta.9",
        })}\n`,
        "utf8",
      );
      await writeFile(scriptPath, createLauncherRuntimeSyncPowerShellScript(), "utf8");

      await execFileAsync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-RuntimePath",
        runtimePath,
        "-AttemptsPath",
        attemptsPath,
        "-CleanupPath",
        cleanupPath,
        "-Channel",
        "beta",
        "-Namespace",
        "cf",
        "-Version",
        "0.10.2-beta.10",
      ], { windowsHide: true });

      expect(JSON.parse(await readFile(runtimePath, "utf8"))).toMatchObject({
        active: { generation: 0, version: "0.10.2-beta.10" },
        channel: "beta",
        lastSuccessful: { generation: 0, version: "0.10.2-beta.10" },
        namespace: "cf",
        schemaVersion: 1,
      });
      await expect(access(attemptsPath)).rejects.toThrow();
      expect(JSON.parse(await readFile(cleanupPath, "utf8"))).toMatchObject({
        channel: "beta",
        currentVersion: "0.10.2-beta.10",
        namespace: "cf",
        version: 1,
        versions: expect.arrayContaining([
          expect.objectContaining({ reason: "older-than-bound-package", state: "deprecated", version: "0.10.2-beta.9" }),
          expect.objectContaining({ reason: "older-than-bound-package", state: "deprecated", version: "0.10.1-beta.1" }),
          expect.objectContaining({ reason: "current-bound-package", state: "retained", version: "0.10.2-beta.10" }),
        ]),
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("keeps installer diagnostic log events ASCII-only for silent overwrite", async () => {
    const source = await readFile(new URL("../src/win/custom-installer.ts", import.meta.url), "utf8");
    expect(source).toContain('Push "existing installation found; silent install will overwrite it"');
    expect(source).not.toContain('Push "$(ExistingInstallSilentOverwrite)"');
  });
});
