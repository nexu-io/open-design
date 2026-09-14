import express from 'express';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerFsBrowserRoutes } from '../src/routes/fs-browser.js';

const tempDirs: string[] = [];
function temp(prefix: string) { const dir = mkdtempSync(path.join(os.tmpdir(), prefix)); tempDirs.push(dir); return dir; }
async function start(roots: string[], originAllowed = true, getRoots?: () => Promise<readonly string[]>) {
  const app = express();
  registerFsBrowserRoutes(app, { roots, ...(getRoots ? { getRoots } : {}), http: { isLocalSameOrigin: () => originAllowed, resolvedPortRef: { current: 7456 } } });
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing port');
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
describe('fs browser confinement', () => {
  const servers: Array<{ close(): Promise<void> }> = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.close())); for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
  it('lists directories only from real authorized roots and includes cold-start PROJECTS_DIR', async () => {
    const projects = temp('od-projects-'); const root = temp('od-root-'); const child = path.join(root, 'child'); await mkdir(child); writeFileSync(path.join(root, '.env'), 'secret');
    const server = await start([projects, root]); servers.push(server);
    const roots = await (await fetch(`${server.url}/api/fs-browser/roots`)).json() as { roots: Array<{ path: string }> };
    expect(roots.roots.map((entry: { path: string }) => entry.path)).toEqual(expect.arrayContaining([projects, root]));
    const listing = await (await fetch(`${server.url}/api/fs-browser/list?path=${encodeURIComponent(root)}`)).json() as { entries: Array<{ name: string }> };
    expect(listing.entries.map((entry: { name: string }) => entry.name)).toEqual(['child']);
  });
  it('blocks traversal, symlink escape, filesystem root, and sensitive paths', async () => {
    const root = temp('od-root-'); const outside = temp('od-outside-'); const ssh = path.join(root, '.SSH'); await mkdir(ssh); symlinkSync(outside, path.join(root, 'escape'));
    const server = await start([root, path.parse(root).root]); servers.push(server);
    for (const target of [outside, path.join(root, 'escape'), ssh]) {
      const response = await fetch(`${server.url}/api/fs-browser/list?path=${encodeURIComponent(target)}`);
      expect(response.status).toBe(403);
    }
    const roots = await (await fetch(`${server.url}/api/fs-browser/roots`)).json() as { roots: Array<{ path: string }> };
    expect(roots.roots.map((entry: { path: string }) => entry.path)).not.toContain(path.parse(root).root);
  });
  it('allows a contained directory whose name starts with two dots', async () => {
    const root = temp('od-root-');
    const child = path.join(root, '..project');
    await mkdir(child);
    const server = await start([root]); servers.push(server);
    const response = await fetch(`${server.url}/api/fs-browser/list?path=${encodeURIComponent(child)}`);
    expect(response.status).toBe(200);
  });
  it('rejects unauthorized origins before reading roots', async () => {
    let reads = 0;
    const server = await start([], false, async () => { reads += 1; return []; }); servers.push(server);
    for (const endpoint of ['roots', 'list?path=/']) {
      expect((await fetch(`${server.url}/api/fs-browser/${endpoint}`)).status).toBe(403);
    }
    expect(reads).toBe(0);
  });
  it('refreshes grants and rejects revoked roots', async () => {
    const root = temp('od-root-');
    let roots = [root];
    const server = await start([], true, async () => roots); servers.push(server);
    const url = `${server.url}/api/fs-browser/list?path=${encodeURIComponent(root)}`;
    expect((await fetch(url)).status).toBe(200);
    roots = [];
    expect((await fetch(url)).status).toBe(403);
  });
  it('caps a large directory listing and signals truncation', async () => {
    const root = temp('od-root-');
    await Promise.all(Array.from({ length: 501 }, (_, index) => mkdir(path.join(root, `project-${index}`))));
    const server = await start([root]); servers.push(server);
    const response = await fetch(`${server.url}/api/fs-browser/list?path=${encodeURIComponent(root)}`);
    const listing = await response.json() as { entries: unknown[]; truncated: boolean };
    expect(listing.entries).toHaveLength(500);
    expect(listing.truncated).toBe(true);
  });
  it('rejects exact and nested sensitive roots in every case variant', async () => {
    const root = temp('od-root-');
    const sensitiveDirs = ['.ssh', '.SSH', '.config/gh', 'nested/.Config/GH'];
    const paths = sensitiveDirs.map((name) => path.join(root, name));
    await Promise.all(paths.map((directory) => mkdir(directory, { recursive: true })));
    const server = await start([root, ...paths]); servers.push(server);
    const roots = await (await fetch(`${server.url}/api/fs-browser/roots`)).json() as { roots: Array<{ path: string }> };
    expect(roots.roots.map((entry) => entry.path)).toEqual([root]);
    for (const target of paths) {
      expect((await fetch(`${server.url}/api/fs-browser/list?path=${encodeURIComponent(target)}`)).status).toBe(403);
    }
  });
  it('returns a sanitized JSON error when root discovery fails', async () => {
    const server = await start([], true, async () => { throw new Error('private detail'); }); servers.push(server);
    const response = await fetch(`${server.url}/api/fs-browser/roots`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'PATH_ACCESS_DENIED', message: 'filesystem request failed' });
  });
});
