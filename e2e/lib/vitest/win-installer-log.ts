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
    label: 'install directory exists before removal',
    pattern: /event=install_dir_before_remove .* exists=1/,
  },
  {
    label: 'install directory removal succeeds',
    pattern: /install dir remove exit=0/,
  },
  {
    label: 'install directory is absent after removal',
    pattern: /event=install_dir_after_remove .* exists=0/,
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
    label: 'install directory exists after extraction',
    pattern: /event=install_dir_after_extract .* exists=1/,
  },
  {
    label: 'installed executable exists after extraction',
    pattern: /event=installed_exe_after_extract .* exists=1/,
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
