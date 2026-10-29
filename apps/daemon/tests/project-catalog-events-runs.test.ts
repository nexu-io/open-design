import type http from 'node:http';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { openProjectCatalogStream } from './helpers/project-catalog-stream.js';

// A run started by another client (MCP `start_run`, `od` CLI) changes a
// project's badge from idle to running and back without writing a project row,
// so the run lifecycle itself must announce the transition or the list keeps
// showing a finished project as busy (and a busy one as idle).
describe.skipIf(process.platform === 'win32')('project catalog events for runs', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalStrategyMode = process.env.OD_NEXT_STRATEGY_ROLLOUT;

  beforeAll(async () => {
    // The OD Next rollout rejects a bare project with no persisted task
    // mapping; this suite exercises run lifecycle, not strategy routing.
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalStrategyMode == null) delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
    else process.env.OD_NEXT_STRATEGY_ROLLOUT = originalStrategyMode;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function listedStatus(projectId: string): Promise<string | undefined> {
    const resp = await fetch(`${baseUrl}/api/projects`);
    const body = (await resp.json()) as {
      projects: Array<{ id: string; status?: { value?: string } }>;
    };
    return body.projects.find((project) => project.id === projectId)?.status?.value;
  }

  it('announces when a run starts and again when it finishes', async () => {
    const projectId = 'catalog-events-run';
    const binDir = await mkdtemp(path.join(tmpdir(), 'od-catalog-run-bin-'));
    const releaseFile = path.join(binDir, 'release');
    const originalPath = process.env.PATH;
    const stream = await openProjectCatalogStream(baseUrl);
    try {
      const agent = path.join(binDir, 'opencode');
      await writeFile(
        agent,
        `#!/usr/bin/env node
const fs = require('node:fs');
process.stdin.resume();
process.stdin.on('end', () => {
  const finish = () => {
    console.log(JSON.stringify({ type: 'step_start' }));
    console.log(JSON.stringify({ type: 'text', part: { text: 'done' } }));
    console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
    process.exit(0);
  };
  const wait = setInterval(() => {
    if (fs.existsSync(${JSON.stringify(releaseFile)})) {
      clearInterval(wait);
      finish();
    }
  }, 20);
});
`,
      );
      await chmod(agent, 0o755);
      process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ''}`;

      const created = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: projectId }),
      });
      expect(created.ok).toBe(true);
      await stream.nextSignal();

      const chat = fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: 'opencode', projectId, message: 'make something' }),
      });

      await stream.untilSeen(async () => (await listedStatus(projectId)) === 'running');

      await writeFile(releaseFile, '');
      await (await chat).text();

      await stream.untilSeen(async () => {
        const status = await listedStatus(projectId);
        return status !== undefined && status !== 'running' && status !== 'queued';
      });
      expect(await listedStatus(projectId)).not.toBe('running');
    } finally {
      process.env.PATH = originalPath;
      await stream.close();
      await rm(binDir, { recursive: true, force: true });
    }
  });
});
