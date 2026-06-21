import http from 'node:http';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerMediaRoutes } from '../src/routes/media.js';
import {
  buildWindowsFolderDialogCommand,
  classifyNativeFolderDialogResult,
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

  it('classifies macOS user cancellation as cancelled', () => {
    expect(
      classifyNativeFolderDialogResult('darwin', new Error('execution error'), '', 'User canceled. (-128)'),
    ).toEqual({ ok: false, reason: 'cancelled' });
  });

  it('classifies an empty zenity exit code 1 as cancelled', () => {
    const error = Object.assign(new Error('Command failed'), { code: 1 });

    expect(classifyNativeFolderDialogResult('linux', error, '', '')).toEqual({
      ok: false,
      reason: 'cancelled',
    });
  });

  it('preserves zenity diagnostics for an exit code 1 failure', () => {
    const error = Object.assign(new Error('Command failed'), { code: 1 });

    expect(classifyNativeFolderDialogResult('linux', error, '', 'cannot open display\n')).toEqual({
      ok: false,
      reason: 'exec-failed',
      detail: 'cannot open display',
    });
  });

  it('prefers Windows stderr for an exec failure detail', () => {
    expect(
      classifyNativeFolderDialogResult(
        'win32',
        new Error('PowerShell failed'),
        '',
        'specific PowerShell failure\r\n',
      ),
    ).toEqual({
      ok: false,
      reason: 'exec-failed',
      detail: 'specific PowerShell failure',
    });
  });
});

describe('native folder dialog route', () => {
  it('returns structured exec failure details', async () => {
    const app = express();
    const resolvedPortRef = { current: 0 };
    registerMediaRoutes(app, {
      db: {},
      design: {},
      http: {
        isLocalSameOrigin: () => true,
        requireLocalDaemonRequest: () => true,
        resolvedPortRef,
        sendApiError: () => undefined,
      },
      paths: {},
      ids: {},
      auth: {},
      media: {},
      appConfig: {},
      orbit: {},
      nativeDialogs: {
        openNativeFolderDialog: async () => ({
          ok: false,
          reason: 'exec-failed',
          detail: 'cannot open display',
        }),
      },
      projectStore: {},
      projectFiles: {},
      conversations: {},
      research: {},
    } as any);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('expected TCP test server address');
    }
    resolvedPortRef.current = address.port;

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/dialog/open-folder`, {
        method: 'POST',
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({
        path: null,
        error: 'exec-failed',
        detail: 'cannot open display',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
