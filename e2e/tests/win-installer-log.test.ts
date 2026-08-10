import { describe, expect, it } from 'vitest';

import { missingWorkingWinInstallerOverwriteMarkers } from '@/vitest/win-installer-log';

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
