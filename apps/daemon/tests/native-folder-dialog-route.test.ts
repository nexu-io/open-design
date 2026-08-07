import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerNativeFolderDialogRoute } from '../src/routes/native-folder-dialog.js';

async function start(options: {
  sameOrigin?: boolean;
  localBrowser?: boolean;
  useDefaultClassifier?: boolean;
  open?: () => Promise<string | null>;
} = {}) {
  const app = express();
  const open = vi.fn(options.open ?? (async () => '/work/designs'));
  registerNativeFolderDialogRoute(app, {
    http: {
      isLocalSameOrigin: () => options.sameOrigin ?? true,
      resolvedPortRef: { current: 7456 },
    },
    nativeDialogs: { openNativeFolderDialog: open },
    ...(options.useDefaultClassifier
      ? {}
      : { isLocalBrowserRequest: () => options.localBrowser ?? true }),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing test port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    open,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('native folder dialog route', () => {
  const servers: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.close()));
    vi.restoreAllMocks();
  });

  it('keeps cross-origin requests generic and never opens a dialog', async () => {
    const server = await start({ sameOrigin: false, localBrowser: false });
    servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'cross-origin request rejected' });
    expect(server.open).not.toHaveBeenCalled();
  });

  it('returns a discriminated server-picker fallback for a remote browser', async () => {
    const server = await start({ localBrowser: false });
    servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'NATIVE_FOLDER_DIALOG_REMOTE',
      message: 'Native folder picker is unavailable to a remote browser',
      fallback: 'server-directory-picker',
    });
    expect(server.open).not.toHaveBeenCalled();
  });

  it('keeps the native dialog for a loopback browser origin', async () => {
    const server = await start({ useDefaultClassifier: true });
    servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, {
      method: 'POST',
      headers: { Origin: server.url },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ path: '/work/designs' });
    expect(server.open).toHaveBeenCalledTimes(1);
  });

  it('treats an allowlisted reverse-proxy origin as remote even when peer and Host are loopback', async () => {
    const server = await start({ useDefaultClassifier: true });
    servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, {
      method: 'POST',
      headers: {
        Host: '127.0.0.1:7456',
        Origin: 'https://design.example.com',
      },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      code: 'NATIVE_FOLDER_DIALOG_REMOTE',
      fallback: 'server-directory-picker',
    });
    expect(server.open).not.toHaveBeenCalled();
  });

  it('preserves local selection and cancellation', async () => {
    const selected = await start();
    const cancelled = await start({ open: async () => null });
    servers.push(selected, cancelled);
    const selectedResponse = await fetch(`${selected.url}/api/dialog/open-folder`, { method: 'POST' });
    const cancelledResponse = await fetch(`${cancelled.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(selectedResponse.status).toBe(200);
    expect(await selectedResponse.json()).toEqual({ path: '/work/designs' });
    expect(cancelledResponse.status).toBe(200);
    expect(await cancelledResponse.json()).toEqual({ path: null });
  });

  it('returns a discriminated fallback when the host dialog cannot execute', async () => {
    const server = await start({ open: async () => { throw new Error('cannot open display'); } });
    servers.push(server);
    const response = await fetch(`${server.url}/api/dialog/open-folder`, { method: 'POST' });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'NATIVE_FOLDER_DIALOG_UNAVAILABLE',
      message: 'Could not open folder picker: cannot open display',
      fallback: 'server-directory-picker',
    });
  });
});
