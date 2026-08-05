import { describe, expect, it } from 'vitest';
import {
  buildWindowsFolderDialogCommand,
  openNativeFolderDialog,
  parseFolderDialogStdout,
} from '../src/native-folder-dialog.js';

describe('native folder dialog helpers', () => {
  it('builds the Windows folder picker command with STA mode', () => {
    const command = buildWindowsFolderDialogCommand();

    expect(command.command).toBe('powershell.exe');
    expect(command.args).toContain('-NoProfile');
    expect(command.args).toContain('-Sta');
    expect(command.args).toContain('-Command');
  });

  it('creates a topmost owner form for the Windows dialog', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toContain('$owner = New-Object System.Windows.Forms.Form;');
    expect(script).toContain('$owner.TopMost = $true;');
    expect(script).toContain('$owner.ShowInTaskbar = $true;');
    expect(script).toContain("$owner.StartPosition = 'CenterScreen';");
  });

  it('passes the owner form into the Windows folder picker', () => {
    const script = buildWindowsFolderDialogCommand().args[3] ?? '';

    expect(script).toContain('$dialog = New-Object System.Windows.Forms.FolderBrowserDialog;');
    expect(script).toContain('$dialog.ShowNewFolderButton = $true;');
    expect(script).toContain('$dialog.ShowDialog($owner)');
    expect(script).toContain('$owner.Dispose();');
  });

  it('parses a selected folder path from stdout', () => {
    expect(parseFolderDialogStdout(null, 'C:\\Users\\Ada\\Project\r\n')).toBe('C:\\Users\\Ada\\Project');
  });

  it('returns null when the dialog is cancelled', () => {
    expect(parseFolderDialogStdout(null, '\r\n')).toBeNull();
  });

  it('returns null when the native dialog command fails', () => {
    expect(parseFolderDialogStdout(new Error('cancelled'), 'C:\\Users\\Ada\\Project\r\n')).toBeNull();
  });

  it('dispatches the Linux picker and returns its selected path', async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const selected = await openNativeFolderDialog((command, args, _options, callback) => {
      calls.push({ command, args });
      callback(null, '/tmp/project\n');
    }, 'linux');

    expect(selected).toBe('/tmp/project');
    expect(calls).toEqual([{
      command: 'zenity',
      args: ['--file-selection', '--directory', '--title=Select a code folder to link'],
    }]);
  });

  it('dispatches the macOS picker and strips its trailing separator', async () => {
    const selected = await openNativeFolderDialog((_command, _args, _options, callback) => {
      callback(null, '/Users/Ada/Project/\n');
    }, 'darwin');

    expect(selected).toBe('/Users/Ada/Project');
  });

  it('returns null for unsupported platforms and failed pickers', async () => {
    const unsupported = await openNativeFolderDialog(() => {
      throw new Error('runner should not be called');
    }, 'freebsd');
    const failed = await openNativeFolderDialog((_command, _args, _options, callback) => {
      callback(new Error('cancelled'), '/tmp/project\n');
    }, 'linux');

    expect(unsupported).toBeNull();
    expect(failed).toBeNull();
  });
});
