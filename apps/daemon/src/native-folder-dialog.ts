export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function hardLinuxFolderDialogFailure(error: unknown, stderrText: string): string | null {
  const code = errorCode(error);
  if (code === 'ENOENT') return 'zenity is not installed';
  if (/cannot open display/i.test(stderrText)) return stderrText;
  if (/no such file or directory/i.test(stderrText) && /zenity/i.test(stderrText)) return stderrText;
  return null;
}

const WINDOWS_FOLDER_DIALOG_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms;',
  '$owner = New-Object System.Windows.Forms.Form;',
  "$owner.Text = 'OpenDesign';",
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

function isTimeout(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { killed?: unknown }).killed === true,
  );
}

function throwFolderDialogFailure(error: unknown, stderrText: string, tool: string): never {
  if (errorCode(error) === 'ENOENT') {
    throw new Error(`Could not open folder picker: ${tool} is not available`);
  }
  if (isTimeout(error)) {
    throw new Error('Could not open folder picker: the dialog timed out');
  }
  throw new Error(`Could not open folder picker: ${stderrText || errorMessage(error)}`);
}

// PowerShell exits 0 with empty stdout when the user cancels, so any error here
// is a real failure (missing binary, policy block, timeout), not a cancel.
export function parseWindowsFolderDialogResult(
  error: unknown,
  stdout: string,
  stderr: string,
): string | null {
  if (error) throwFolderDialogFailure(error, stderr.trim(), 'powershell.exe');

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

// `osascript` exits 1 with "User canceled. (-128)" on cancel; anything else is a failure.
export function parseMacFolderDialogResult(
  error: unknown,
  stdout: string,
  stderr: string,
): string | null {
  if (error) {
    const stderrText = stderr.trim();
    if (!isTimeout(error) && errorCode(error) !== 'ENOENT' && /user canceled|\(-128\)/i.test(stderrText)) {
      return null;
    }
    throwFolderDialogFailure(error, stderrText, 'osascript');
  }

  const selectedPath = stdout.trim().replace(/\/$/, '');
  return selectedPath.length > 0 ? selectedPath : null;
}

export function parseLinuxFolderDialogResult(error: unknown, stdout: string, stderr: string): string | null {
  if (error) {
    const stderrText = stderr.trim();
    const code = errorCode(error);
    const hardFailure = hardLinuxFolderDialogFailure(error, stderrText);
    if (hardFailure) {
      throw new Error(`Could not open folder picker: ${hardFailure}`);
    }
    if (code === 1) return null;
    throw new Error(`Could not open folder picker: ${stderrText || errorMessage(error)}`);
  }

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}
