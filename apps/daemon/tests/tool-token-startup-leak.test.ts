import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';
import { toolTokenRegistry } from '../src/tool-tokens.js';

// Force a deterministic failure in the run startup phase, AFTER the tool token
// is minted but BEFORE the child process is spawned. `preparePromptFileForAgent`
// is awaited at that point in `startChatRun`, so rejecting it reproduces "any
// startup exception" without needing an unwritable filesystem.
vi.mock('../src/runtimes/prompt-file.js', () => ({
  preparePromptFileForAgent: () =>
    Promise.reject(new Error('injected startup failure')),
}));

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

let started: StartedServer | null = null;
let binDir: string | null = null;

afterEach(async () => {
  await Promise.resolve(started?.shutdown?.());
  if (started?.server) {
    await new Promise<void>((resolve) => started?.server.close(() => resolve()));
  }
  started = null;
  if (binDir) await rm(binDir, { recursive: true, force: true });
  binDir = null;
});

async function writeFakeClaude(dir: string): Promise<string> {
  const bin = path.join(dir, 'claude');
  await writeFile(
    bin,
    `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-token-leak'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p'); process.exit(0); }
setTimeout(() => process.exit(0), 200);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

it('revokes the run tool token when startup fails before spawn', async () => {
  binDir = await mkdtemp(path.join(os.tmpdir(), 'od-token-leak-bin-'));
  const fakeClaude = await writeFakeClaude(binDir);

  started = (await startServer({ port: 0, returnServer: true })) as StartedServer;
  await fetch(`${started.url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });

  const projectId = `token_leak_${randomUUID()}`;
  const projectRes = await fetch(`${started.url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Token leak smoke',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectRes.status).toBe(200);
  const { conversationId } = (await projectRes.json()) as { conversationId: string };

  const runRes = await fetch(`${started.url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'token-leak-test',
      'x-od-analytics-session-id': 'token-leak-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_${randomUUID()}`,
      clientRequestId: `client_${randomUUID()}`,
      agentId: 'claude',
      message: 'trigger a startup failure',
      currentPrompt: 'trigger a startup failure',
    }),
  });
  expect(runRes.status).toBe(202);
  const { runId } = (await runRes.json()) as { runId: string };

  // Poll until the run reaches a terminal state (it should fail on the
  // injected startup error).
  let status = '';
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`${started.url}/api/runs/${runId}`);
    if (res.status === 200) {
      status = ((await res.json()) as { status: string }).status;
      if (status === 'failed' || status === 'succeeded' || status === 'canceled') break;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(status).toBe('failed');

  // The failed run's minted tool token must be revoked. On the buggy path the
  // startup throw skips revocation and the capability stays live for its TTL.
  expect(toolTokenRegistry.activeRunTokenCount(runId)).toBe(0);
});
