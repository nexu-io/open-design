import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { server: http.Server; url: string };

let server: http.Server | undefined;
let baseUrl = '';
let pluginRoot = '';

async function closeServer(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (!server) return resolve(undefined);
    server.close((error?: Error) => (error ? reject(error) : resolve(undefined)));
  });
  server = undefined;
}

async function installPlugin(source: string): Promise<void> {
  const resp = await fetch(`${baseUrl}/api/plugins/install`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify({ source }),
  });
  expect(resp.status).toBe(200);
  if (!resp.body) throw new Error('install stream missing body');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  if (!raw.includes('event: success')) {
    throw new Error(`installer did not finalize:\n${raw}`);
  }
}

beforeEach(async () => {
  pluginRoot = await mkdtemp(path.join(os.tmpdir(), 'od-doctor-route-'));
  const started = await startServer({ port: 0, returnServer: true }) as StartedServer;
  server = started.server;
  baseUrl = started.url;
});

afterEach(async () => {
  await closeServer();
  await rm(pluginRoot, { recursive: true, force: true });
});

describe('POST /api/plugins/:id/doctor', () => {
  it('fails plugins that require a connector missing from the live connector catalog', async () => {
    const pluginId = `missing-connector-${randomUUID()}`;
    const folder = path.join(pluginRoot, pluginId);
    await mkdir(folder, { recursive: true });
    await writeFile(
      path.join(folder, 'open-design.json'),
      JSON.stringify({
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: pluginId,
        title: 'Missing Connector Fixture',
        version: '1.0.0',
        description: 'requires a connector that is not in the catalog',
        license: 'MIT',
        od: {
          kind: 'skill',
          taskKind: 'new-generation',
          useCase: { query: 'Check connectors.' },
          connectors: {
            required: [
              { id: 'definitely_missing_connector', tools: ['missing_tool'] },
            ],
          },
          capabilities: [
            'prompt:inject',
            'connector:definitely_missing_connector',
          ],
        },
      }),
    );
    await writeFile(
      path.join(folder, 'SKILL.md'),
      `---\nname: ${pluginId}\ndescription: missing connector fixture\n---\n# Fixture\n`,
    );
    await installPlugin(folder);

    const resp = await fetch(`${baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/doctor`, {
      method: 'POST',
    });

    expect(resp.status).toBe(200);
    const report = await resp.json() as {
      ok: boolean;
      issues: Array<{ severity: string; code: string; message: string; field?: string }>;
    };
    expect(report.ok).toBe(false);
    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'error',
          code: 'connector.unknown-connector',
          field: 'od.connectors',
        }),
      ]),
    );
  });
});
