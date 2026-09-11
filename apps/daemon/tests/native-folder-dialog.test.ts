import { describe, expect, it } from 'vitest';
import {
  buildMacZcodeAppDialogCommand,
  buildWindowsFolderDialogCommand,
  parseLinuxFolderDialogResult,
  parseFolderDialogStdout,
  parseZcodeAppDialogStdout,
  supportsNativeZcodeAppDialog,
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

  it('parses a selected folder path from stdout', () => {
    expect(parseFolderDialogStdout(null, 'C:\\Users\\Ada\\Project\r\n')).toBe('C:\\Users\\Ada\\Project');
  });

  it('builds the macOS ZCode.app package picker command', () => {
    const command = buildMacZcodeAppDialogCommand();

    expect(command.command).toBe('osascript');
    expect(command.args).toContain('-e');
    expect(command.args.join(' ')).toContain('choose file');
    expect(command.args.join(' ')).toContain('of type {"app"}');
  });

  it('supports the ZCode.app package picker only on macOS', () => {
    expect(supportsNativeZcodeAppDialog('darwin')).toBe(true);
    expect(supportsNativeZcodeAppDialog('linux')).toBe(false);
    expect(supportsNativeZcodeAppDialog('win32')).toBe(false);
  });

  it('parses app package paths without a trailing slash', () => {
    expect(parseZcodeAppDialogStdout(null, '/Applications/ZCode.app/\n')).toBe(
      '/Applications/ZCode.app',
    );
  });

  it('returns null when the dialog is cancelled', () => {
    expect(parseFolderDialogStdout(null, '\r\n')).toBeNull();
  });

  it('returns null when the native dialog command fails', () => {
    expect(parseFolderDialogStdout(new Error('cancelled'), 'C:\\Users\\Ada\\Project\r\n')).toBeNull();
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

  it('returns null when the ZCode.app picker is cancelled', () => {
    const error = Object.assign(new Error('User canceled.'), { code: 1 });

    expect(parseZcodeAppDialogStdout(error, '')).toBeNull();
  });

  it('throws when the ZCode.app picker command fails', () => {
    const error = Object.assign(new Error('osascript timed out'), { code: null });

    expect(() => parseZcodeAppDialogStdout(error, '')).toThrow(
      'ZCode.app picker failed: osascript timed out',
    );
  });
});
