import { describe, expect, it } from 'vitest';

import { missingWorkingWinInstallerOverwriteMarkers, winInstallerRuntimeSyncPhase } from '@/vitest/win-installer-log';

describe('working Windows installer overwrite log contract', () => {
  it('accepts the current remove, extract, and launcher-runtime sync lifecycle', () => {
    const lines = [
      'existing installation found; silent install will overwrite it',
      'event=install_dir_before_remove target=C:\\Open Design exists=1',
      'install dir remove exit=0',
      'event=install_dir_after_remove target=C:\\Open Design exists=0',
      'payload base extraction exit=0',
      'payload overlay extraction exit=0',
      'event=install_dir_after_extract target=C:\\Open Design exists=1',
      'event=installed_exe_after_extract target=C:\\Open Design\\Open Design.exe exists=1',
      'launcher runtime sync exit=0',
      'event=launcher_runtime_after_write path=C:\\launcher\\runtime.json',
      'install section done',
    ];

    expect(missingWorkingWinInstallerOverwriteMarkers(lines)).toEqual([]);
  });

  it('accepts portable overwrite logs with runtime reconciliation deferred to startup', () => {
    const lines = [
      'existing installation found; silent install will overwrite it',
      'event=install_dir_before_remove target=C:/app exists=1',
      'install dir remove exit=0',
      'event=install_dir_after_remove target=C:/app exists=0',
      'payload base extraction exit=0',
      'payload overlay extraction exit=0',
      'event=install_dir_after_extract target=C:/app exists=1',
      'event=installed_exe_after_extract target=C:/app/app.exe exists=1',
      'install section done',
    ];
    expect(missingWorkingWinInstallerOverwriteMarkers(lines, 'startup')).toEqual([]);
    expect(missingWorkingWinInstallerOverwriteMarkers(lines, 'installer')).toEqual([
      'launcher runtime sync succeeds',
      'launcher runtime pointer is written',
    ]);
    expect(missingWorkingWinInstallerOverwriteMarkers(
      lines.filter((line) => !line.startsWith('payload overlay')),
      'startup',
    )).toEqual(['overlay payload extraction succeeds']);
  });

  it('reports lifecycle gaps without requiring the reverted transactional markers', () => {
    const lines = [
      'existing installation found; silent install will overwrite it',
      'event=install_dir_after_quarantine target=C:\\Open Design.back exists=1',
      'event=install_dir_after_commit target=C:\\Open Design exists=1',
      'install transaction cleanup exit=0',
    ];

    expect(missingWorkingWinInstallerOverwriteMarkers(lines)).toEqual([
      'install directory exists before removal',
      'install directory removal succeeds',
      'install directory is absent after removal',
      'base payload extraction succeeds',
      'overlay payload extraction succeeds',
      'install directory exists after extraction',
      'installed executable exists after extraction',
      'launcher runtime sync succeeds',
      'launcher runtime pointer is written',
      'install section completes',
    ]);
  });
});

describe('installed Windows runtime reconciliation phase', () => {
  const identity = { namespace: 'fixture', appVersion: '1.2.3' };
  it('uses the freshly installed config to distinguish portable and bound installers', () => {
    expect(winInstallerRuntimeSyncPhase(identity)).toBe('startup');
    expect(winInstallerRuntimeSyncPhase({ ...identity, namespaceBaseRoot: 'C:/runtime' })).toBe('installer');
  });
  it('rejects missing identities and malformed roots instead of relaxing the log contract', () => {
    for (const config of [null, {}, { ...identity, namespaceBaseRoot: null }, { ...identity, namespaceBaseRoot: '' }]) {
      expect(() => winInstallerRuntimeSyncPhase(config)).toThrow();
    }
  });
});
