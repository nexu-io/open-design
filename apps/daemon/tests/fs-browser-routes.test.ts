import express from 'express';
import { existsSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import fs, { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerFsBrowserRoutes } from '../src/routes/fs-browser.js';

interface TestAppOptions {
  roots?: string[];
  getRoots?: () => Promise<string[]>;
  cwd?: string;
  homedir?: string;
  sameOrigin?: boolean;
}

interface TestApp {
  baseUrl: string;
  close(): Promise<void>;
  isLocalSameOrigin: ReturnType<typeof vi.fn>;
  getResolvedPort: ReturnType<typeof vi.fn>;
}

async function jsonOf<T = any>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createApp(options: TestAppOptions = {}): Promise<TestApp> {
  const app = express();
  app.use(express.json());

  const isLocalSameOrigin = vi.fn(() => options.sameOrigin ?? true);
  const getResolvedPort = vi.fn(() => 7456);

  registerFsBrowserRoutes(app, {
    roots: options.roots,
    getRoots: options.getRoots,
    cwd: options.cwd ?? process.cwd(),
    homedir: options.homedir ?? os.homedir(),
    http: {
      isLocalSameOrigin,
      getResolvedPort,
      sendApiError: (
        res: express.Response,
        status: number,
        code: string,
        message: string,
      ) => res.status(status).json({ error: code, message }),
    },
  } as any);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve test server port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
    isLocalSameOrigin,
    getResolvedPort,
  };
}

describe('fs browser routes', () => {
  let tempDirs: string[] = [];
  let apps: TestApp[] = [];

  afterEach(async () => {
    await Promise.all(apps.map((app) => app.close()));
    apps = [];
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs = [];
    vi.restoreAllMocks();
  });

  function makeTempDir(prefix: string) {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(tempDir);
    return tempDir;
  }

  async function start(options: TestAppOptions = {}) {
    const app = await createApp(options);
    apps.push(app);
    return app;
  }

  it('returns only explicitly authorized roots with realpath de-dupe', async () => {
    const homeRoot = makeTempDir('od-fs-browser-home-root-');
    const cwdRoot = makeTempDir('od-fs-browser-cwd-root-');
    const rootA = makeTempDir('od-fs-browser-root-a-');
    const rootB = makeTempDir('od-fs-browser-root-b-');
    const app = await start({
      cwd: cwdRoot,
      homedir: homeRoot,
      roots: [rootA, rootB, rootA],
    });

    const response = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: app.baseUrl },
    });

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({
      roots: [
        { label: path.basename(rootA), path: realpathSync(rootA), kind: 'configured' },
        { label: path.basename(rootB), path: realpathSync(rootB), kind: 'configured' },
      ],
    });
    expect(app.isLocalSameOrigin).toHaveBeenCalled();
    expect(app.getResolvedPort).toHaveBeenCalled();
  });

  it('never exposes an explicitly configured filesystem root', async () => {
    const filesystemRoot = path.parse(makeTempDir('od-fs-browser-safe-root-')).root;
    const app = await start({ roots: [filesystemRoot] });

    const response = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: app.baseUrl },
    });

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({ roots: [] });
  });

  it('reloads dynamic authorized roots on each request', async () => {
    const firstRoot = makeTempDir('od-fs-browser-dynamic-a-');
    const secondRoot = makeTempDir('od-fs-browser-dynamic-b-');
    let roots = [firstRoot];
    const getRoots = vi.fn(async () => roots);
    const app = await start({ roots: [], getRoots });

    const first = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: app.baseUrl },
    });
    roots = [secondRoot];
    const second = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: app.baseUrl },
    });

    expect((await jsonOf<any>(first)).roots.map((root: any) => root.path)).toEqual([
      realpathSync(firstRoot),
    ]);
    expect((await jsonOf<any>(second)).roots.map((root: any) => root.path)).toEqual([
      realpathSync(secondRoot),
    ]);
    expect(getRoots).toHaveBeenCalledTimes(2);
  });

  it('rejects sensitive descendants of an authorized root', async () => {
    const homeRoot = makeTempDir('od-fs-browser-sensitive-home-');
    const sshDir = path.join(homeRoot, '.ssh');
    await mkdir(sshDir);
    const app = await start({ roots: [homeRoot] });

    const response = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(sshDir)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(response.status).toBe(403);
    expect(await jsonOf(response)).toMatchObject({ error: 'PATH_ACCESS_DENIED' });
  });

  it('rejects a nested .ssh directory at every path boundary', async () => {
    const root = makeTempDir('od-fs-browser-nested-ssh-root-');
    const parent = path.join(root, 'users', 'alice');
    const sshDir = path.join(parent, '.ssh');
    const safeDir = path.join(parent, 'workspace');
    await mkdir(sshDir, { recursive: true });
    await mkdir(safeDir);
    const app = await start({ roots: [root] });

    const parentResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(parent)}`,
      { headers: { Origin: app.baseUrl } },
    );
    const directResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(sshDir)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(parentResponse.status).toBe(200);
    expect((await jsonOf<any>(parentResponse)).entries.map((entry: any) => entry.name)).toEqual([
      'workspace',
    ]);
    expect(directResponse.status).toBe(403);
    expect(await jsonOf(directResponse)).toMatchObject({ error: 'PATH_ACCESS_DENIED' });
  });

  it('rejects a nested .config/gh sequence without hiding safe .config children', async () => {
    const root = makeTempDir('od-fs-browser-nested-config-root-');
    const configDir = path.join(root, 'users', 'alice', '.config');
    const ghDir = path.join(configDir, 'gh');
    const safeDir = path.join(configDir, 'themes');
    await mkdir(ghDir, { recursive: true });
    await mkdir(safeDir);
    const app = await start({ roots: [root] });

    const configResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(configDir)}`,
      { headers: { Origin: app.baseUrl } },
    );
    const directResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(ghDir)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(configResponse.status).toBe(200);
    expect((await jsonOf<any>(configResponse)).entries.map((entry: any) => entry.name)).toEqual([
      'themes',
    ]);
    expect(directResponse.status).toBe(403);
    expect(await jsonOf(directResponse)).toMatchObject({ error: 'PATH_ACCESS_DENIED' });
  });

  it('rejects case variants of sensitive sequences and sensitive roots', async () => {
    const root = makeTempDir('od-fs-browser-sensitive-case-root-');
    const parent = path.join(root, 'users', 'alice');
    const sshDir = path.join(parent, '.SSH');
    const configDir = path.join(parent, '.CONFIG');
    const ghDir = path.join(configDir, 'GH');
    const safeDir = path.join(configDir, 'themes');
    await mkdir(sshDir, { recursive: true });
    await mkdir(ghDir, { recursive: true });
    await mkdir(safeDir);
    const app = await start({ roots: [root, sshDir] });

    const rootsResponse = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: app.baseUrl },
    });
    const parentResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(parent)}`,
      { headers: { Origin: app.baseUrl } },
    );
    const configResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(configDir)}`,
      { headers: { Origin: app.baseUrl } },
    );
    const sshResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(sshDir)}`,
      { headers: { Origin: app.baseUrl } },
    );
    const ghResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(ghDir)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect((await jsonOf<any>(rootsResponse)).roots.map((entry: any) => entry.path)).toEqual([
      realpathSync(root),
    ]);
    expect((await jsonOf<any>(parentResponse)).entries.map((entry: any) => entry.name)).toEqual([
      '.CONFIG',
    ]);
    expect((await jsonOf<any>(configResponse)).entries.map((entry: any) => entry.name)).toEqual([
      'themes',
    ]);
    expect(sshResponse.status).toBe(403);
    expect(ghResponse.status).toBe(403);
  });

  it('never exposes an exact sensitive directory as an authorized root', async () => {
    const parent = makeTempDir('od-fs-browser-sensitive-root-parent-');
    const sshDir = path.join(parent, '.ssh');
    await mkdir(sshDir);
    const app = await start({ roots: [sshDir] });

    const rootsResponse = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: app.baseUrl },
    });
    const listResponse = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(sshDir)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(rootsResponse.status).toBe(200);
    expect(await jsonOf(rootsResponse)).toEqual({ roots: [] });
    expect(listResponse.status).toBe(403);
  });

  it('lists only directories inside an allowed root', async () => {
    const root = makeTempDir('od-fs-browser-list-root-');
    const dir = path.join(root, 'workspace');
    const childDir = path.join(dir, 'src');
    const filePath = path.join(dir, '.env');
    await mkdir(childDir, { recursive: true });
    writeFileSync(filePath, 'SECRET=value\n');
    const app = await start({ roots: [root] });

    const response = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(dir)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(response.status).toBe(200);
    expect(await jsonOf(response)).toEqual({
      path: realpathSync(dir),
      parent: realpathSync(root),
      truncated: false,
      entries: [
        expect.objectContaining({
          name: 'src',
          path: realpathSync(childDir),
          type: 'directory',
          hidden: false,
        }),
      ],
    });
  });

  it('does not expose a server-side mkdir mutation', async () => {
    const root = makeTempDir('od-fs-browser-read-only-root-');
    const app = await start({ roots: [root] });
    const blocked = path.join(root, 'must-not-exist');

    const response = await fetch(`${app.baseUrl}/api/fs-browser/mkdir`, {
      method: 'POST',
      headers: { Origin: app.baseUrl, 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: root, name: 'must-not-exist' }),
    });

    expect(response.status).toBe(404);
    expect(existsSync(blocked)).toBe(false);
  });

  it('does not disclose raw filesystem errors', async () => {
    const root = makeTempDir('od-fs-browser-error-root-');
    const app = await start({ roots: [root] });
    const originalStat = fs.stat.bind(fs);
    let statCalls = 0;
    vi.spyOn(fs, 'stat').mockImplementation(async (...args) => {
      statCalls += 1;
      if (statCalls === 2) {
        throw new Error(`sensitive host detail: ${path.join(root, '.secret')}`);
      }
      return originalStat(...args);
    });

    const response = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(root)}`,
      { headers: { Origin: app.baseUrl } },
    );
    const body = await jsonOf<{ error: string; message: string }>(response);

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: 'PATH_ACCESS_DENIED',
      message: 'filesystem request failed',
    });
    expect(JSON.stringify(body)).not.toContain(root);
    expect(JSON.stringify(body)).not.toContain('sensitive host detail');
  });

  it('rejects paths outside allowed roots', async () => {
    const root = makeTempDir('od-fs-browser-allowed-root-');
    const outside = makeTempDir('od-fs-browser-outside-root-');
    const app = await start({ roots: [root] });

    const response = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(outside)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(response.status).toBe(403);
    expect(await jsonOf(response)).toMatchObject({
      error: 'PATH_OUTSIDE_ALLOWED_ROOTS',
      message: expect.any(String),
    });
  });

  it('rejects symlinks that escape allowed roots', async () => {
    const root = makeTempDir('od-fs-browser-symlink-root-');
    const outside = makeTempDir('od-fs-browser-symlink-outside-');
    const linkPath = path.join(root, 'outside-link');
    symlinkSync(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    const app = await start({ roots: [root] });

    const response = await fetch(
      `${app.baseUrl}/api/fs-browser/list?path=${encodeURIComponent(linkPath)}`,
      { headers: { Origin: app.baseUrl } },
    );

    expect(response.status).toBe(403);
    expect(await jsonOf(response)).toMatchObject({
      error: 'PATH_OUTSIDE_ALLOWED_ROOTS',
      message: expect.any(String),
    });
  });

  it('rejects cross-origin requests', async () => {
    const root = makeTempDir('od-fs-browser-origin-root-');
    const app = await start({ roots: [root], sameOrigin: false });

    const response = await fetch(`${app.baseUrl}/api/fs-browser/roots`, {
      headers: { Origin: 'https://evil.example' },
    });

    expect(response.status).toBe(403);
    expect(await jsonOf(response)).toEqual({
      error: 'cross-origin request rejected',
    });
  });
});
