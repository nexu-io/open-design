// Red spec — plugin uninstall id must be treated as an opaque registry key,
// never as a filesystem path fragment.
//
// `POST /api/plugins/:id/uninstall` passes `req.params.id` straight into
// `uninstallPlugin(db, id, roots)` (src/routes/plugins/index.ts), which does
// `path.join(roots.userPluginsRoot, id)` and then `rm -rf` on the result
// (src/plugins/installer.ts `uninstallPlugin`). The id is never validated
// against SAFE_BASENAME (the install path does validate it), so an id with
// encoded traversal segments (`..%2F..%2F…`) escapes the plugin registry
// root and recursively deletes an arbitrary directory on the daemon host.
//
// Expected (secure) behavior asserted here:
//   - the route rejects ids that are not safe basenames with 400, and
//   - no path outside the plugin registry root is ever touched.
//
// The sibling asset route already behaves this way: it answers
// `GET /api/plugins/:id/asset/..%2Fescape` with 400
// (see tests/plugins-asset-route.test.ts).

import type http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../src/server.js';
import { defaultRegistryRoots } from '../src/plugins/registry.js';

let server: http.Server;
let baseUrl: string;
let shutdown: (() => Promise<void> | void) | undefined;
let scratchRoot: string;
let outsideDir: string;
let markerPath: string;

beforeAll(async () => {
  // A directory entirely outside OD_DATA_DIR, standing in for any victim
  // folder on the daemon host (a user workspace, PROJECTS_DIR, $HOME, …).
  scratchRoot = await mkdtemp(path.join(os.tmpdir(), 'od-uninstall-traversal-'));
  outsideDir = path.join(scratchRoot, 'outside-root');
  await mkdir(outsideDir, { recursive: true });
  markerPath = path.join(outsideDir, 'keep.txt');
  await writeFile(markerPath, 'do not delete');

  const started = (await startServer({ port: 0, returnServer: true })) as {
    url: string;
    server: http.Server;
    shutdown?: () => Promise<void> | void;
  };
  baseUrl = started.url;
  server = started.server;
  shutdown = started.shutdown;
});

afterAll(async () => {
  await Promise.resolve(shutdown?.());
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(scratchRoot, { recursive: true, force: true });
});

describe('POST /api/plugins/:id/uninstall — traversal in plugin id', () => {
  it('rejects a traversal id and never deletes outside the plugin registry root', async () => {
    const pluginsRoot = defaultRegistryRoots().userPluginsRoot;
    const rel = path.relative(pluginsRoot, outsideDir);
    // One URL path segment that decodes to e.g. '../../outside-root'.
    const encodedId = rel.split(path.sep).map(encodeURIComponent).join('%2F');
    // Sanity: the payload really does traverse upwards out of the root.
    expect(rel.startsWith('..')).toBe(true);
    expect(encodedId).toContain('..%2F');

    const resp = await fetch(`${baseUrl}/api/plugins/${encodedId}/uninstall`, { method: 'POST' });
    // Evidence for the report: the daemon answers 200 and names the folder it
    // recursively deleted — outside the data root.
    console.log('uninstall response:', resp.status, JSON.stringify(await resp.json()));

    // Disk assertion: the victim directory outside the data root survives.
    expect(existsSync(markerPath)).toBe(true);
    expect(existsSync(outsideDir)).toBe(true);
    expect(resp.status).toBe(400);
  });

  it('control: a safe id still removes only its own folder inside the registry root', async () => {
    const pluginsRoot = defaultRegistryRoots().userPluginsRoot;
    const orphanFolder = path.join(pluginsRoot, 'orphan-plugin');
    await mkdir(orphanFolder, { recursive: true });
    await writeFile(path.join(orphanFolder, 'open-design.json'), '{}');

    const resp = await fetch(`${baseUrl}/api/plugins/orphan-plugin/uninstall`, { method: 'POST' });

    expect(resp.status).toBe(200);
    expect(existsSync(orphanFolder)).toBe(false);
    expect(existsSync(pluginsRoot)).toBe(true);
  });
});
