import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { EventEmitter as EventEmitterType } from 'node:events';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PassThrough as PassThroughType } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawnState = vi.hoisted(() => ({
  target: '',
  targetSpawnCount: 0,
  staleCloseAfterRetrySpawn: false,
}));

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const { EventEmitter } = await import('node:events');
  const { PassThrough } = await import('node:stream');

  return {
    ...actual,
    spawn: vi.fn((command, args, options) => {
      if (command !== spawnState.target) {
        return actual.spawn(command, args, options);
      }

      spawnState.targetSpawnCount += 1;
      if (spawnState.targetSpawnCount > 1) {
        return actual.spawn(command, args, options);
      }

      const child = new EventEmitter() as EventEmitterType & {
        pid: number;
        stdin: PassThroughType;
        stdout: PassThroughType;
        stderr: PassThroughType;
        exitCode: number | null;
        signalCode: NodeJS.Signals | null;
        killed: boolean;
        kill: (signal?: NodeJS.Signals) => boolean;
      };
      child.pid = 2_000_000_000;
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.exitCode = null;
      child.signalCode = null;
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        return true;
      };

      setImmediate(() => {
        child.emit('error', new Error('HTTP 503 Service Unavailable before first token'));
      });
      setTimeout(() => {
        child.exitCode = 1;
        spawnState.staleCloseAfterRetrySpawn = spawnState.targetSpawnCount > 1;
        child.emit('close', 1, null);
      }, 1_200).unref();

      return child;
    }),
  };
});

import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

describe('same-run retry generation terminal fence', () => {
  const originalEnv = snapshotEnv();
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
    spawnState.target = '';
    spawnState.targetSpawnCount = 0;
    spawnState.staleCloseAfterRetrySpawn = false;
    restoreEnv(originalEnv);
  });

  it('ignores a previous attempt close after the retry child owns the run', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-retry-generation-fence-'));
    spawnState.target = await writeDelayedSuccessfulClaude(binDir, 'claude-generation-fence');

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: spawnState.target } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);

    expect(spawnState.targetSpawnCount).toBe(2);
    expect(spawnState.staleCloseAfterRetrySpawn).toBe(true);
    expect(run.status).toBe('succeeded');
  });
});

async function writeDelayedSuccessfulClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude-code 1.0.0-generation-fence');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-generation-fence' }));
setTimeout(() => {
  console.log(JSON.stringify({
    type: 'assistant',
    message: {
      id: 'msg-generation-fence',
      content: [{ type: 'text', text: 'The current retry completed.' }],
      stop_reason: 'end_turn'
    }
  }));
  setTimeout(() => process.exit(0), 20);
}, 1800);
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

function snapshotEnv(): Record<string, string | undefined> {
  return {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function createAndWaitForRun(url: string): Promise<{ status: string }> {
  const projectId = `retry_generation_fence_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Retry generation terminal fence',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const project = await projectResponse.json() as { conversationId: string };

  const prompt = 'reproduce a stale retry generation close';
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'retry-generation-fence-test',
      'x-od-analytics-session-id': 'retry-generation-fence-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: project.conversationId,
      assistantMessageId: `assistant_retry_generation_${randomUUID()}`,
      clientRequestId: `client_retry_generation_${randomUUID()}`,
      agentId: 'claude',
      message: prompt,
      currentPrompt: prompt,
    }),
  });
  expect(runResponse.status).toBe(202);
  const { runId } = await runResponse.json() as { runId: string };

  const eventsResponse = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`);
  expect(eventsResponse.status).toBe(200);
  await eventsResponse.text();

  const statusResponse = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
  expect(statusResponse.status).toBe(200);
  return await statusResponse.json() as { status: string };
}
