import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  error?: string | null;
  errorCode?: string | null;
  executionDiagnostics?: {
    environment?: {
      agentCliVersion?: {
        state: string;
        value?: string;
      };
    };
  };
};

describe('run runtime version provenance', () => {
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
    restoreEnv(originalEnv);
  });

  it('freezes a non-Codex CLI version into terminal execution diagnostics', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-version-bin-'));
    const fakeOpenCode = await writeSuccessfulOpenCode(binDir);

    disableTelemetry();
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'opencode',
      agentCliEnv: { opencode: { OPENCODE_BIN: fakeOpenCode } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const { projectId, conversationId } = await createProject(started.url);
    const run = await createAndWaitForRun(started.url, projectId, conversationId);

    expect(run.status, JSON.stringify(run)).toBe('succeeded');
    expect(run.executionDiagnostics?.environment?.agentCliVersion).toEqual({
      state: 'available',
      value: 'opencode-cli 9.8.7',
      evidence: 'computed',
      source: 'agent-runtime',
      complete: true,
      definition: 'runtime CLI version observed during preflight',
    });
  });
});

function snapshotEnv(): Record<string, string | undefined> {
  return {
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
  };
}

function restoreEnv(env: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function disableTelemetry(): void {
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  delete process.env.LANGFUSE_BASE_URL;
  delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
  delete process.env.POSTHOG_KEY;
  delete process.env.POSTHOG_HOST;
}

async function writeSuccessfulOpenCode(dir: string): Promise<string> {
  const windows = process.platform === 'win32';
  const bin = path.join(dir, windows ? 'opencode-version.cmd' : 'opencode-version');
  const source = windows
    ? [
        '@echo off',
        'if "%1"=="--version" (',
        '  echo opencode-cli 9.8.7',
        '  exit /b 0',
        ')',
        'if "%1"=="models" (',
        '  echo test/provider',
        '  exit /b 0',
        ')',
        'echo {"type":"step_start"}',
        'echo {"type":"text","part":{"text":"completed"}}',
        'echo {"type":"step_finish","part":{"tokens":{"input":1,"output":1}}}',
        'exit /b 0',
        '',
      ].join('\r\n')
    : [
        '#!/bin/sh',
        'if [ "$1" = "--version" ]; then',
        '  echo "opencode-cli 9.8.7"',
        '  exit 0',
        'fi',
        'if [ "$1" = "models" ]; then',
        '  echo "test/provider"',
        '  exit 0',
        'fi',
        'echo \'{"type":"step_start"}\'',
        'echo \'{"type":"text","part":{"text":"completed"}}\'',
        'echo \'{"type":"step_finish","part":{"tokens":{"input":1,"output":1}}}\'',
        '',
      ].join('\n');
  await writeFile(bin, source, 'utf8');
  if (!windows) await chmod(bin, 0o755);
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

async function createProject(url: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const projectId = `run_version_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Run version provenance',
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversationId: string };
  return { projectId, conversationId: body.conversationId };
}

async function createAndWaitForRun(
  url: string,
  projectId: string,
  conversationId: string,
): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_run_version_${randomUUID()}`,
      clientRequestId: `client_run_version_${randomUUID()}`,
      agentId: 'opencode',
      message: 'complete the task',
      currentPrompt: 'complete the task',
    }),
  });
  expect(response.status).toBe(202);
  const body = await response.json() as { runId: string };
  return waitForRun(url, body.runId);
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}
