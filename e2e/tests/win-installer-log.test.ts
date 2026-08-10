import { describe, expect, it } from 'vitest';

import { missingWorkingWinInstallerOverwriteMarkers } from '@/vitest/win-installer-log';

describe('working Windows installer overwrite log contract', () => {
  it('accepts the stage, switch, and launcher-runtime sync lifecycle', () => {
    const lines = [
      'existing installation found; silent install will overwrite it',
      'install transaction captured existing=1 desktopShortcut=0',
      'payload base extraction exit=0',
      'payload overlay extraction exit=0',
      'event=install_staging_after_extract target=C:\\Open Design.__od_staging exists=1',
      'event=staged_exe_after_extract target=C:\\Open Design.__od_staging\\Open Design.exe exists=1',
      'event=install_dir_after_quarantine target=C:\\Open Design.__od_backup exists=1',
      'event=install_dir_after_commit target=C:\\Open Design exists=1',
      'launcher runtime sync exit=0',
      'event=launcher_runtime_after_write path=C:\\launcher\\runtime.json',
      'install transaction committed',
      'install section done',
    ];

    expect(missingWorkingWinInstallerOverwriteMarkers(lines)).toEqual([]);
  });

  it('reports lifecycle gaps when a direct-remove overwrite log is supplied', () => {
    const lines = [
      'existing installation found; silent install will overwrite it',
      'event=install_dir_before_remove target=C:\\Open Design exists=1',
      'install dir remove exit=0',
      'event=install_dir_after_remove target=C:\\Open Design exists=0',
    ];

    expect(missingWorkingWinInstallerOverwriteMarkers(lines)).toEqual([
      'existing shortcut state is captured',
      'base payload extraction succeeds',
      'overlay payload extraction succeeds',
      'staging directory exists after extraction',
      'staged executable exists after extraction',
      'previous install is quarantined',
      'staged install is committed',
      'launcher runtime sync succeeds',
      'launcher runtime pointer is written',
      'install transaction commits',
      'install section completes',
    ]);
  });
});
