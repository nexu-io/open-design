import { describe, expect, it } from 'vitest';
import {
  buildWindowsFolderDialogCommand,
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
    expect(script).toContain('$dialog.ShowNewFolderButton = $false;');
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
});
