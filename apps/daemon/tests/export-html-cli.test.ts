import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import type http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

const execFileP = promisify(execFile);
const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const tsxCli = path.join(repoRoot, 'node_modules/tsx/dist/cli.mjs');

describe('od export --format html', () => {
  let server: http.Server;
  let daemonUrl: string;
  let outputDir: string;
  const projectId = `html_cli_${randomUUID()}`;

  beforeAll(async () => {
    outputDir = await mkdtemp(path.join(os.tmpdir(), 'od-export-html-cli-'));
    const started = (await startServer({ port: 0, returnServer: true })) as {
      server: http.Server;
      url: string;
    };
    server = started.server;
    daemonUrl = started.url;
    const created = await fetch(`${daemonUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'CLI standalone HTML fixture',
        metadata: { kind: 'prototype', entryFile: 'index.html' },
        skipDiscoveryBrief: true,
      }),
    });
    expect(created.status).toBe(200);
    for (const [name, content] of [
      ['index.html', '<!doctype html><img src="assets/logo.svg"><script type="module" src="scripts/main.js"></script>'],
      ['assets/logo.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'],
      ['scripts/main.js', 'document.body.dataset.cliStandalone = "ready";'],
    ] as const) {
      const response = await fetch(`${daemonUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, content }),
      });
      expect(response.status).toBe(200);
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(outputDir, { recursive: true, force: true });
  });

  it('writes the same daemon-owned standalone artifact without a desktop renderer', async () => {
    const outputPath = path.join(outputDir, 'standalone.html');
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [
        tsxCli,
        cliEntry,
        'export',
        'index.html',
        '--project',
        projectId,
        '--format',
        'html',
        '--out',
        outputPath,
        '--json',
      ],
      {
        cwd: daemonRoot,
        env: {
          ...process.env,
          NODE_OPTIONS: '',
          OD_DAEMON_URL: daemonUrl,
          OD_PROJECT_ID: projectId,
        },
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    expect(stderr).toBe('');
    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      format: 'html',
      path: outputPath,
    });
    const html = await readFile(outputPath, 'utf8');
    expect(html).toContain('data:image/svg+xml;base64,');
    expect(html).toContain(Buffer.from(
      'document.body.dataset.cliStandalone = "ready";',
    ).toString('base64'));
    expect(html).not.toContain('assets/logo.svg');
    expect(html).not.toContain('src="scripts/main.js"');
    expect(html).toContain('od-project:/scripts/main.js');
  });
});
