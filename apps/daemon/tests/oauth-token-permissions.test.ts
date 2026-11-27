import fs from 'node:fs';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearToken, getToken, setToken, type StoredMcpToken } from '../src/mcp-tokens.js';
import { clearXAIToken, getXAIToken, setXAIToken } from '../src/integrations/xai-tokens.js';

const token = {
  accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', tokenType: 'Bearer', savedAt: 1,
};
const stores = [
  {
    name: 'MCP', file: 'mcp-tokens.json',
    set: (root: string, value: StoredMcpToken) => setToken(root, 'example', value),
    get: (root: string) => getToken(root, 'example'),
    clear: (root: string) => clearToken(root, 'example'),
  },
  { name: 'xAI', file: 'xai-tokens.json', set: setXAIToken, get: getXAIToken, clear: clearXAIToken },
];

describe.skipIf(process.platform === 'win32')('OAuth token temporary file permissions', () => {
  let dataDir: string;
  let previousMask: number;
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-oauth-permissions-'));
    previousMask = process.umask(0o022);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    syncBuiltinESMExports();
    process.umask(previousMask);
    await rm(dataDir, { recursive: true, force: true });
  });

  it.each(stores)('$name protects token contents before the first rename', async (store) => {
    const rename = fs.promises.rename;
    let mode: number | undefined;
    vi.spyOn(fs.promises, 'rename').mockImplementationOnce(async (source, target) => {
      mode = (await stat(source)).mode & 0o777;
      await rename(source, target);
    });
    syncBuiltinESMExports();
    await store.set(dataDir, token);
    expect(mode).toBe(0o600);
    expect(await store.get(dataDir)).toEqual(token);
  });

  it.each(stores)('$name uses private temporary files for overwrite and clear', async (store) => {
    await store.set(dataDir, token);
    const rename = fs.promises.rename;
    const modes: number[] = [];
    vi.spyOn(fs.promises, 'rename').mockImplementation(async (source, target) => {
      modes.push((await stat(source)).mode & 0o777);
      await rename(source, target);
    });
    syncBuiltinESMExports();
    await store.set(dataDir, { ...token, accessToken: 'rotated' });
    await store.clear(dataDir);
    expect(modes).toEqual([0o600, 0o600]);
    expect(await store.get(dataDir)).toBeNull();
  });

  it.each(stores)('$name leaves only a private token copy if rename fails', async (store) => {
    vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(
      Object.assign(new Error('simulated rename failure'), { code: 'EIO' }),
    );
    syncBuiltinESMExports();
    await expect(store.set(dataDir, token)).rejects.toMatchObject({ code: 'EIO' });
    const files = await readdir(dataDir);
    expect(files).toHaveLength(1);
    const temporary = files[0];
    if (!temporary) throw new Error('missing temporary token file');
    expect(temporary.startsWith(`${store.file}.`) && temporary.endsWith('.tmp')).toBe(true);
    expect((await stat(path.join(dataDir, temporary))).mode & 0o777).toBe(0o600);
  });
});
