// @vitest-environment node

import { mkdir,rm,stat,writeFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';

import { describe,expect,test } from 'vitest';

import {
	hasPackagedSmokeLane
} from '@/vitest/packaged-smoke-contract';
import { WIN_PACKAGED_SMOKE_SCENARIOS } from '@/vitest/packaged-smoke-plan-win';
import { shouldRunPackagedWinSmoke,winProtocolDebugCase } from './lib/context.js';


import type { WinInstallResult,WinUninstallResult } from './lib/index.js';
import { assertWindowsInviteProtocolRegistration,assertWindowsInviteProtocolRemoved,assertWorkingWinInstallerOverwriteLog,deleteWindowsInviteProtocolRegistration,execFileAsync,fileExists,installIdentity,nativeRuntimeNamespaceRoot,portableNsisLogPath,readInstalledWindowsShellVersion,readRegisteredWindowsShellVersion,readWindowsInviteProtocolCommand,resolveLocalUpdateFixture,runDirectInstaller,runHiddenWindowsExecutable,runToolsPackJson,runToolsPackJsonForVersion,smokeLanes,updateFixture,updateScenario,verifyCoreOnly,waitForWindowsNativeUninstall,writeWindowsInviteProtocolCommand } from './lib/index.js';

const winDescribe = shouldRunPackagedWinSmoke && hasPackagedSmokeLane(smokeLanes, 'shell') && winProtocolDebugCase === 'off' ? describe : describe.skip;

winDescribe("packaged windows native install boundaries", () => {
const nativeInstallBoundariesTest = !verifyCoreOnly && updateFixture === 'tools-serve' ? test : test.skip;
  nativeInstallBoundariesTest(WIN_PACKAGED_SMOKE_SCENARIOS.nativeInstallBoundaries.title, async () => {
    const baseVersion = updateScenario.expectedInstalledShellVersion;
    const update = await resolveLocalUpdateFixture();
    const fakeProtocolCommand = '"C:\\Other Vendor\\Other Design.exe" "%1"';
    const dataMarkerPath = join(nativeRuntimeNamespaceRoot, 'data', 'native-installer-boundary.json');
    const cacheMarkerPath = join(nativeRuntimeNamespaceRoot, 'cache', 'native-installer-boundary.tmp');
    let installed = false;

    try {
      await runToolsPackJson<WinUninstallResult>('uninstall', ['--remove-product-user-data']).catch(() => null);
      await deleteWindowsInviteProtocolRegistration().catch(() => undefined);
      const install = await runToolsPackJson<WinInstallResult>('install');
      installed = true;
      const basePackageVersion = await readInstalledWindowsShellVersion(install.installDir);
      expect(basePackageVersion).toBe(baseVersion);

      await rm(install.desktopShortcutPath, { force: true });
      await mkdir(dirname(dataMarkerPath), { recursive: true });
      await mkdir(dirname(cacheMarkerPath), { recursive: true });
      await writeFile(dataMarkerPath, 'preserve product data\n', 'utf8');
      await writeFile(cacheMarkerPath, 'remove cache data\n', 'utf8');

      const rollbackFault = await runDirectInstaller(
        update.installerPath,
        install.installDir,
        portableNsisLogPath,
        ['/ODTESTFAULTAFTERTREECOMMIT'],
      );
      expect(rollbackFault.code).toBe(86);
      expect(rollbackFault.nsisLogTail).toContain('test-only installer fault injected=after-install-tree-commit');
      expect(rollbackFault.nsisLogTail).toContain('install transaction rollback restored previous install');
      expect(await readInstalledWindowsShellVersion(install.installDir)).toBe(baseVersion);
      expect(await readRegisteredWindowsShellVersion(baseVersion)).toBe(baseVersion);
      expect(await fileExists(install.desktopShortcutPath)).toBe(false);
      expect(await fileExists(dataMarkerPath)).toBe(true);

      const integrationFault = await runDirectInstaller(
        update.installerPath,
        install.installDir,
        portableNsisLogPath,
        ['/ODTESTFAULTBEFOREINTEGRATION'],
      );
      expect(integrationFault.code).toBe(87);
      expect(integrationFault.nsisLogTail).toContain('test-only installer fault injected=before-post-commit-integration');
      expect(await readInstalledWindowsShellVersion(install.installDir)).toBe(update.targetVersion);
      expect(await readRegisteredWindowsShellVersion(baseVersion)).toBe(baseVersion);
      expect(await fileExists(install.desktopShortcutPath)).toBe(false);
      expect(await fileExists(dataMarkerPath)).toBe(true);

      const repair = await runDirectInstaller(update.installerPath, install.installDir, portableNsisLogPath);
      expect(repair.code).toBe(0);
      assertWorkingWinInstallerOverwriteLog(repair.nsisLogTail);
      expect(await readRegisteredWindowsShellVersion(update.targetVersion)).toBe(update.targetVersion);
      expect(await fileExists(install.desktopShortcutPath)).toBe(false);
      expect(await fileExists(install.startMenuShortcutPath)).toBe(true);
      await assertWindowsInviteProtocolRegistration(install.installDir);

      const sevenZipExe = join(install.installDir, 'resources', 'open-design', 'bin', '7z.exe');
      const sevenZipDll = join(install.installDir, 'resources', 'open-design', 'bin', '7z.dll');
      expect((await stat(sevenZipExe)).isFile()).toBe(true);
      expect((await stat(sevenZipDll)).isFile()).toBe(true);
      const sevenZipInfo = await execFileAsync(sevenZipExe, ['i']);
      expect(`${sevenZipInfo.stdout}\n${sevenZipInfo.stderr}`).toMatch(/7-Zip/i);

      await writeWindowsInviteProtocolCommand(fakeProtocolCommand);
      const defaultUninstall = await runToolsPackJsonForVersion<WinUninstallResult>('uninstall', update.targetVersion);
      installed = false;
      expect(defaultUninstall.residueObservation?.installedExeExists).toBe(false);
      expect(defaultUninstall.residueObservation?.registryResidues ?? []).toEqual([]);
      expect(await fileExists(install.desktopShortcutPath)).toBe(false);
      expect(await fileExists(install.startMenuShortcutPath)).toBe(false);
      expect(await fileExists(cacheMarkerPath)).toBe(false);
      expect(await fileExists(dataMarkerPath)).toBe(true);
      expect(await readWindowsInviteProtocolCommand()).toBe(fakeProtocolCommand);

      const reinstall = await runDirectInstaller(update.installerPath, install.installDir, portableNsisLogPath);
      expect(reinstall.code).toBe(0);
      installed = true;
      expect(await fileExists(dataMarkerPath)).toBe(true);
      expect(await fileExists(install.desktopShortcutPath)).toBe(true);
      await assertWindowsInviteProtocolRegistration(install.installDir);

      const explicitUninstall = await runHiddenWindowsExecutable(
        join(install.installDir, `Uninstall ${installIdentity.displayName}.exe`),
        ['/S', '/ODREMOVELOCALDATA=1'],
      );
      expect(explicitUninstall).toBe(0);
      await waitForWindowsNativeUninstall({
        installDir: install.installDir,
        startMenuShortcutPath: install.startMenuShortcutPath,
        userDesktopShortcutPath: install.desktopShortcutPath,
      });
      installed = false;
      expect(await fileExists(nativeRuntimeNamespaceRoot)).toBe(false);
      await assertWindowsInviteProtocolRemoved();
    } finally {
      if (installed) {
        await runToolsPackJsonForVersion<WinUninstallResult>(
          'uninstall',
          update.targetVersion,
          ['--remove-product-user-data'],
        ).catch(() => undefined);
      }
      await deleteWindowsInviteProtocolRegistration().catch(() => undefined);
      await rm(nativeRuntimeNamespaceRoot, { force: true, recursive: true }).catch(() => undefined);
    }
  }, 300_000);
});
