// Regression test for plugin upload-zip temp directory leak (issue #2726).
//
// The upload-zip handler must clean up its staging directory when
// extractPluginZipToFolder throws (malformed zip). Previously the catch
// block sent a 400 without calling fs.rm, leaving orphaned
// od-plugin-zip-* directories in os.tmpdir().
//
// Tests hit the real /api/plugins/upload-zip route so a future regression
// in server.ts is caught directly.

import type http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import os from 'node:os';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

let baseUrl: string;
let server: http.Server;

beforeAll(async () => {
  const started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  baseUrl = started.url;
  server = started.server;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function zipDirsInTmp(): Promise<string[]> {
  const entries = await readdir(os.tmpdir());
  return entries.filter((e) => e.startsWith('od-plugin-zip-'));
}

describe('plugin upload-zip temp cleanup', () => {
  it('cleans up stagedFolder when extraction fails (malformed zip)', async () => {
    const before = new Set(await zipDirsInTmp());

    const form = new FormData();
    form.append('file', new Blob([Buffer.from('not a valid zip')]), 'bad.zip');

    const res = await fetch(`${baseUrl}/api/plugins/upload-zip`, {
      method: 'POST',
      body: form,
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; message: string };
    expect(body.ok).toBe(false);

    const leaked = (await zipDirsInTmp()).filter((d) => !before.has(d));
    expect(leaked).toHaveLength(0);
  });

  it('returns 400 when no file is attached', async () => {
    const form = new FormData();
    const res = await fetch(`${baseUrl}/api/plugins/upload-zip`, {
      method: 'POST',
      body: form,
    });
    expect(res.status).toBe(400);
  });
});
