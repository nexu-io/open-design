import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  error: string | null;
  errorCode: string | null;
};

describe('Claude stream actionable-progress watchdog (#5036)', () => {
  const originalEnv = {
    OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS: process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS,
    OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS: process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
  };
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
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it.skipIf(process.platform === 'win32')('times out a Claude stream that keeps emitting thinking but never answers or calls a tool', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-claude-progress-bin-'));
    const claudeBin = await writeThinkingOnlyClaude(binDir);

    process.env.OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS = '400';
    process.env.OD_CHAT_RUN_INACTIVITY_KILL_GRACE_MS = '100';
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);
    expect(run.status).toBe('failed');
    expect(run.errorCode).toBe('AGENT_EXECUTION_FAILED');
    expect(run.error).toContain('without producing a response or making tool progress');
  }, 15_000);
});

async function writeThinkingOnlyClaude(dir: string): Promise<string> {
  const bin = path.join(dir, 'claude-thinking-only');
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
function write(value) { fs.writeSync(1, JSON.stringify(value) + '\\n'); }
if (process.argv.includes('--version')) { fs.writeSync(1, 'claude-code 1.0.0-progress-test\\n'); process.exit(0); }
if (process.argv.includes('--help')) { fs.writeSync(1, 'Usage: claude -p [--include-partial-messages] [--add-dir DIR]\\n'); process.exit(0); }
write({ type: 'system', subtype: 'init', model: 'thinking-only-test', session_id: 's-thinking-only' });
const emitThinking = () => write({
  type: 'stream_event',
  event: {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'still thinking' },
  },
  session_id: 's-thinking-only',
});
emitThinking();
const timer = setInterval(emitThinking, 40);
process.on('SIGTERM', () => { clearInterval(timer); process.exit(0); });
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function createAndWaitForRun(url: string): Promise<RunStatus> {
  const projectId = `claude_progress_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Claude actionable progress repro',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'claude-progress-test',
      'x-od-analytics-session-id': 'claude-progress-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_progress_${randomUUID()}`,
      clientRequestId: `client_progress_${randomUUID()}`,
      agentId: 'claude',
      message: 'Create a small HTML landing page.',
      currentPrompt: 'Create a small HTML landing page.',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 12_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
