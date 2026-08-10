type InstallerLogMarker = {
  label: string;
  pattern: RegExp;
};

const WORKING_OVERWRITE_MARKERS: InstallerLogMarker[] = [
  {
    label: 'existing installation is recognized',
    pattern: /existing installation found; silent install will overwrite it/,
  },
  {
    label: 'existing shortcut state is captured',
    pattern: /install transaction captured existing=1 desktopShortcut=[01]/,
  },
  {
    label: 'base payload extraction succeeds',
    pattern: /payload base extraction exit=0/,
  },
  {
    label: 'overlay payload extraction succeeds',
    pattern: /payload overlay extraction exit=0/,
  },
  {
    label: 'staging directory exists after extraction',
    pattern: /event=install_staging_after_extract .* exists=1/,
  },
  {
    label: 'staged executable exists after extraction',
    pattern: /event=staged_exe_after_extract .* exists=1/,
  },
  {
    label: 'previous install is quarantined',
    pattern: /event=install_dir_after_quarantine .* exists=1/,
  },
  {
    label: 'staged install is committed',
    pattern: /event=install_dir_after_commit .* exists=1/,
  },
  {
    label: 'launcher runtime sync succeeds',
    pattern: /launcher runtime sync exit=0/,
  },
  {
    label: 'launcher runtime pointer is written',
    pattern: /event=launcher_runtime_after_write path=\S+/,
  },
  {
    label: 'install transaction commits',
    pattern: /install transaction committed/,
  },
  {
    label: 'install section completes',
    pattern: /install section done/,
  },
];

export function missingWorkingWinInstallerOverwriteMarkers(lines: string[]): string[] {
  const log = lines.join('\n');
  let offset = 0;
  const missing: string[] = [];

  for (const marker of WORKING_OVERWRITE_MARKERS) {
    const match = marker.pattern.exec(log.slice(offset));
    if (match == null) {
      missing.push(marker.label);
      continue;
    }
    offset += match.index + match[0].length;
  }

  return missing;
}
