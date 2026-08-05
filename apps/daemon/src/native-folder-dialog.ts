export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

export interface NativeFolderDialogExecFile {
  (
    command: string,
    args: string[],
    options: { timeout: number },
    callback: (error: Error | null, stdout: string | Buffer) => void,
  ): unknown;
}

const WINDOWS_FOLDER_DIALOG_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$owner = New-Object System.Windows.Forms.Form;',
  "$owner.Text = 'Open Design';",
  '$owner.TopMost = $true;',
  '$owner.ShowInTaskbar = $true;',
  "$owner.StartPosition = 'CenterScreen';",
  '$owner.Width = 1;',
  '$owner.Height = 1;',
  '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;',
  "$dialog.Description = 'Select a code folder to link';",
  '$dialog.ShowNewFolderButton = $true;',
  'try {',
  '  if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.SelectedPath }',
  '} finally {',
  '  $owner.Dispose();',
  '}',
].join(' ');

export function buildWindowsFolderDialogCommand(): NativeFolderDialogCommand {
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-Sta', '-Command', WINDOWS_FOLDER_DIALOG_SCRIPT],
  };
}

export function parseFolderDialogStdout(error: unknown, stdout: string): string | null {
  if (error) {
    return null;
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

export function openNativeFolderDialog(
  execFile: NativeFolderDialogExecFile,
  platform: NodeJS.Platform = process.platform,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (platform === 'darwin') {
      execFile(
        'osascript',
        ['-e', 'POSIX path of (choose folder with prompt "Select a code folder to link")'],
        { timeout: 120_000 },
        (error, stdout) => {
          if (error) return resolve(null);
          const selectedPath = String(stdout).trim().replace(/\/$/u, '');
          resolve(selectedPath || null);
        },
      );
    } else if (platform === 'linux') {
      execFile(
        'zenity',
        ['--file-selection', '--directory', '--title=Select a code folder to link'],
        { timeout: 120_000 },
        (error, stdout) => {
          if (error) return resolve(null);
          const selectedPath = String(stdout).trim();
          resolve(selectedPath || null);
        },
      );
    } else if (platform === 'win32') {
      const command = buildWindowsFolderDialogCommand();
      execFile(command.command, command.args, { timeout: 120_000 }, (error, stdout) => {
        resolve(parseFolderDialogStdout(error, String(stdout)));
      });
    } else {
      resolve(null);
    }
  });
}
