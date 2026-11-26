import { describe, expect, it } from 'vitest';
import {
  buildWindowsFolderDialogCommand,
  parseLinuxFolderDialogResult,
  parseMacFolderDialogResult,
  parseWindowsFolderDialogResult,
} from '../src/native-folder-dialog.js';

function dialogError(message: string, code: string | number): Error & { code: string | number } {
  const err = new Error(message) as Error & { code: string | number };
  err.code = code;
  return err;
}

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

  it('parses a selected Windows folder path from stdout', () => {
    expect(parseWindowsFolderDialogResult(null, 'C:\\Users\\Ada\\Project\r\n', '')).toBe('C:\\Users\\Ada\\Project');
  });

  it('returns null when the Windows dialog is cancelled (exit 0, empty stdout)', () => {
    expect(parseWindowsFolderDialogResult(null, '\r\n', '')).toBeNull();
  });

  it('throws when powershell.exe is missing', () => {
    const err = dialogError('spawn powershell.exe ENOENT', 'ENOENT');

    expect(() => parseWindowsFolderDialogResult(err, '', '')).toThrow(
      'Could not open folder picker: powershell.exe is not available',
    );
  });

  it('throws with stderr when the Windows dialog command fails', () => {
    const err = dialogError('Command failed: powershell.exe', 1);

    expect(() => parseWindowsFolderDialogResult(err, '', 'Add-Type : blocked by policy\n')).toThrow(
      'Could not open folder picker: Add-Type : blocked by policy',
    );
  });

  it('throws a timeout error when the Windows dialog is killed', () => {
    const err = Object.assign(dialogError('Command failed: powershell.exe', 1), { killed: true });

    expect(() => parseWindowsFolderDialogResult(err, '', '')).toThrow(
      'Could not open folder picker: the dialog timed out',
    );
  });

  it('parses a selected macOS folder path and strips the trailing slash', () => {
    expect(parseMacFolderDialogResult(null, '/Users/ada/project/\n', '')).toBe('/Users/ada/project');
  });

  it('keeps macOS cancel quiet', () => {
    const err = dialogError('Command failed: osascript', 1);

    expect(parseMacFolderDialogResult(err, '', '0:46: execution error: User canceled. (-128)\n')).toBeNull();
  });

  it('throws for macOS osascript failures that are not a cancel', () => {
    const missing = dialogError('spawn osascript ENOENT', 'ENOENT');
    const failed = dialogError('Command failed: osascript', 1);

    expect(() => parseMacFolderDialogResult(missing, '', '')).toThrow(
      'Could not open folder picker: osascript is not available',
    );
    expect(() => parseMacFolderDialogResult(failed, '', 'execution error: Not authorized (-1743)')).toThrow(
      'Could not open folder picker: execution error: Not authorized (-1743)',
    );
  });

  it('parses a selected Linux folder path from stdout', () => {
    expect(parseLinuxFolderDialogResult(null, '/home/ada/project\n', '')).toBe('/home/ada/project');
  });

  it('keeps Linux cancel quiet even when zenity emits GTK warnings on stderr', () => {
    const err = dialogError('Command failed: zenity', 1);

    expect(parseLinuxFolderDialogResult(err, '', '(zenity:123): Gtk-WARNING **: Theme parsing error\n')).toBeNull();
  });

  it('throws for Linux folder picker display failures', () => {
    const err = dialogError('Command failed: zenity', 1);

    expect(() => parseLinuxFolderDialogResult(err, '', 'Gtk-WARNING **: cannot open display: :99')).toThrow(
      'Could not open folder picker: Gtk-WARNING **: cannot open display: :99',
    );
  });

  it('throws a stable message when zenity is missing', () => {
    const err = dialogError('spawn zenity ENOENT', 'ENOENT');

    expect(() => parseLinuxFolderDialogResult(err, '', '')).toThrow(
      'Could not open folder picker: zenity is not installed',
    );
  });
});
