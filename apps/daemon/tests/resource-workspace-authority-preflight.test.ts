import type http from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { openDatabase } from '../src/db.js';
import { getInstalledPlugin } from '../src/plugins/registry.js';
import { startServer } from '../src/server.js';

let server: http.Server;
let baseUrl: string;
let sourceRoot: string;
let shutdown: (() => Promise<void> | void) | undefined;

beforeAll(async () => {
  sourceRoot = await mkdtemp(path.join(os.tmpdir(), 'od-workspace-authority-preflight-'));
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
  await rm(sourceRoot, { recursive: true, force: true });
});

describe('Workspace resource mutation authority preflight', () => {
  it('rejects a partial Plugin install scope before filesystem or database effects', async () => {
    const pluginId = `partial-plugin-${Date.now()}`;
    const pluginSource = path.join(sourceRoot, pluginId);
    await mkdir(pluginSource, { recursive: true });
    await writeFile(
      path.join(pluginSource, 'open-design.json'),
      JSON.stringify({
        name: pluginId,
        title: pluginId,
        version: '1.0.0',
      }),
    );

    const response = await fetch(`${baseUrl}/api/plugins/install`, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        'x-od-workspace-id': 'workspace-partial-plugin',
      },
      body: JSON.stringify({ source: pluginSource }),
    });
    await response.text();

    expect(response.status).toBe(400);
    const db = openDatabase(process.cwd(), { dataDir: process.env.OD_DATA_DIR! });
    expect(getInstalledPlugin(db, pluginId)).toBeNull();
  });

  it('rejects a partial Skill import scope before creating its folder or binding', async () => {
    const skillId = `partial-skill-${Date.now()}`;
    const userSkillDir = path.join(process.env.OD_DATA_DIR!, 'skills', skillId);

    const response = await fetch(`${baseUrl}/api/skills/import`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-workspace-id': 'workspace-partial-skill',
      },
      body: JSON.stringify({
        name: skillId,
        description: 'partial Workspace authority fixture',
        body: `---\nname: ${skillId}\ndescription: fixture\n---\n\n# Fixture\n`,
      }),
    });

    expect(response.status).toBe(400);
    expect(existsSync(userSkillDir)).toBe(false);
  });
});
