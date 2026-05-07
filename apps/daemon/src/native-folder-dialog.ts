export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
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
  '$dialog.ShowNewFolderButton = $false;',
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
