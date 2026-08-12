import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';
import { toolTokenRegistry } from '../src/tool-tokens.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

const originalInactivityTimeout = process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
let started: StartedServer | null = null;
let binDir: string | null = null;

afterEach(async () => {
  vi.restoreAllMocks();
  toolTokenRegistry.clear();
  await Promise.resolve(started?.shutdown?.());
  if (started?.server) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()));
  }
  started = null;
  if (binDir) await rm(binDir, { recursive: true, force: true });
  binDir = null;
  if (originalInactivityTimeout === undefined) {
    delete process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS;
  } else {
    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = originalInactivityTimeout;
  }
});

async function writeActiveFakeClaude(dir: string): Promise<string> {
  const bin = path.join(dir, 'claude');
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-token-lease'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]'); process.exit(0); }
setTimeout(() => {
  console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-token-lease' }));
}, 100);
setTimeout(() => {
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-token-lease',
      content: [{ type: 'text', text: 'Still working.' }],
      stop_reason: 'end_turn'
    }
  }));
}, 200);
setTimeout(() => process.exit(0), 300);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

it('refreshes the tool token on agent activity with the inactivity watchdog disabled, then revokes it on exit', async () => {
  process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '0';
  binDir = await mkdtemp(path.join(os.tmpdir(), 'od-token-lease-bin-'));
  const fakeClaude = await writeActiveFakeClaude(binDir);
  const refreshSpy = vi.spyOn(toolTokenRegistry, 'refreshRun');

  started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  const configResponse = await fetch(`${started.url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(configResponse.status).toBe(200);

  const projectId = `token_lease_${randomUUID()}`;
  const projectResponse = await fetch(`${started.url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Token lease smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  const runResponse = await fetch(`${started.url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'token-lease-test',
      'x-od-analytics-session-id': 'token-lease-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_${randomUUID()}`,
      clientRequestId: `client_${randomUUID()}`,
      agentId: 'claude',
      message: 'emit activity before exiting',
      currentPrompt: 'emit activity before exiting',
    }),
  });
  expect(runResponse.status).toBe(202);
  const { runId } = (await runResponse.json()) as { runId: string };

  let status = '';
  for (let i = 0; i < 100; i++) {
    const response = await fetch(`${started.url}/api/runs/${runId}`);
    expect(response.status).toBe(200);
    status = ((await response.json()) as { status: string }).status;
    if (status === 'failed' || status === 'succeeded' || status === 'canceled') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  expect(status).toBe('succeeded');
  const runRefreshes = refreshSpy.mock.calls.filter(([refreshedRunId]) => refreshedRunId === runId);
  expect(runRefreshes.length).toBeGreaterThanOrEqual(2);
  expect(toolTokenRegistry.activeRunTokenCount(runId)).toBe(0);
});
