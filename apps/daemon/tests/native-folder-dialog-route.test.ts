import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerNativeFolderDialogRoute } from '../src/routes/native-folder-dialog.js';

async function start(options: { localBrowser?: boolean; defaultDetection?: boolean; originAllowed?: boolean; open?: () => Promise<string | null> } = {}) {
  const app = express();
  const open = vi.fn(options.open ?? (async () => '/work/designs'));
  registerNativeFolderDialogRoute(app, {
    http: { isLocalSameOrigin: () => options.originAllowed ?? true, resolvedPortRef: { current: 7456 } },
    nativeDialogs: { openNativeFolderDialog: open },
    ...(options.defaultDetection ? {} : { isLocalBrowserRequest: () => options.localBrowser ?? true }),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  return { url: `http://127.0.0.1:${address.port}`, open, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

describe('native folder dialog route', () => {
  const servers: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); });

  it('returns remote fallback without opening a host dialog', async () => {
    const server = await start({ localBrowser: false }); servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_FOLDER_DIALOG_REMOTE', fallback: 'server-directory-picker' });
    expect(server.open).not.toHaveBeenCalled();
  });

  it('preserves local selection and cancellation', async () => {
    const selected = await start(); const cancelled = await start({ open: async () => null }); servers.push(selected, cancelled);
    expect(await (await fetch(`${selected.url}/api/dialog/open-folder`, { method: 'POST' })).json()).toEqual({ path: '/work/designs' });
    expect(await (await fetch(`${cancelled.url}/api/dialog/open-folder`, { method: 'POST' })).json()).toEqual({ path: null });
  });

  it('returns native-unavailable fallback when opening fails', async () => {
    const server = await start({ open: async () => { throw new Error('Failed to open display'); } }); servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE', fallback: 'server-directory-picker' });
  });
  it('recognizes a real loopback browser without a detection override', async () => {
    const server = await start({ defaultDetection: true }); servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST', headers: { Origin: server.url } });
    expect(response.status).toBe(200);
    expect(server.open).toHaveBeenCalledOnce();
  });
  it('does not open a native dialog for a proxied LAN origin', async () => {
    const server = await start({ defaultDetection: true }); servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST', headers: { Origin: 'http://10.0.0.10:43210' } });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_FOLDER_DIALOG_REMOTE' });
    expect(server.open).not.toHaveBeenCalled();
  });
  it('rejects untrusted origins without invoking the native picker or suggesting fallback', async () => {
    const server = await start({ originAllowed: false }); servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'cross-origin request rejected' });
    expect(server.open).not.toHaveBeenCalled();
  });
});
