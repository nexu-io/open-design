import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type ServerModule = {
  startServer: (options: {
    port: number;
    returnServer: boolean;
  }) => Promise<StartedServer>;
};

type RunStatus = {
  id: string;
  status: string;
  deliverableSyntaxValidation?: {
    source?: string;
    status?: string;
    metrics?: {
      repairExecutor?: string;
      repairDurationMs?: number;
      appliedRepairRules?: string[];
    };
    repairState?: {
      mode?: string;
      attempt?: number;
    };
  };
};

const originalEnv = {
  OD_DATA_DIR: process.env.OD_DATA_DIR,
  POSTHOG_KEY: process.env.POSTHOG_KEY,
  POSTHOG_HOST: process.env.POSTHOG_HOST,
  LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
  LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
  LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
  OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
};

describe('successful run deliverable syntax finalizer (HTTP)', () => {
  let started: StartedServer | null = null;
  let dataDir: string | null = null;
  let binDir: string | null = null;

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-syntax-finalizer-data-'));
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-syntax-finalizer-bin-'));
    process.env.OD_DATA_DIR = dataDir;
    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    vi.resetModules();
    const serverModule = await import('../src/server.js') as unknown as ServerModule;
    started = await serverModule.startServer({ port: 0, returnServer: true });
  }, 60_000);

  afterAll(async () => {
    const current = started;
    started = null;
    await Promise.resolve(current?.shutdown?.());
    if (current?.server) {
      current.server.closeAllConnections?.();
      current.server.closeIdleConnections?.();
      await new Promise<void>((resolve) => current.server.close(() => resolve()));
    }
    if (dataDir) await rm(dataDir, { recursive: true, force: true });
    if (binDir) await rm(binDir, { recursive: true, force: true });
    dataDir = null;
    binDir = null;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }, 30_000);

  it('repairs a physical HTML deliverable without OD Next strategy state', async () => {
    if (!started || !binDir) throw new Error('server fixture not started');
    const fakeClaude = await writeBrokenHtmlClaude(binDir);
    await putConfig(started.url, fakeClaude);

    const { projectId, conversationId } = await createProject(started.url);
    const run = await createAndWaitForRun(started.url, projectId, conversationId);

    expect(run.status).toBe('succeeded');
    expect(run.deliverableSyntaxValidation).toMatchObject({
      source: 'run_finalizer',
      status: 'pass',
      repairState: {
        mode: 'host_safe_fixer',
        attempt: 1,
      },
      metrics: {
        repairExecutor: 'host_safe_fixer',
        repairDurationMs: expect.any(Number),
        appliedRepairRules: ['insert_missing_closing_delimiter'],
      },
    });

    const artifact = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/raw/index.html`,
    );
    expect(artifact.status).toBe(200);
    expect(await artifact.text()).toContain('const items = [1, 2];');
  }, 60_000);

  it('blocks an unsafe syntax error and preserves the original bytes', async () => {
    if (!started || !binDir) throw new Error('server fixture not started');
    const original = '<!doctype html><script>const value = ;</script>';
    const fakeClaude = await writeHtmlClaude(binDir, original, 'claude-unsafe-syntax');
    await putConfig(started.url, fakeClaude);

    const { projectId, conversationId } = await createProject(started.url);
    const run = await createAndWaitForRun(started.url, projectId, conversationId);

    expect(run.status).toBe('failed');
    expect(run.deliverableSyntaxValidation).toMatchObject({
      source: 'run_finalizer',
      status: 'repairable',
    });

    const artifact = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(projectId)}/raw/index.html`,
    );
    expect(artifact.status).toBe(200);
    expect(await artifact.text()).toContain(original);
  }, 60_000);
});

async function writeBrokenHtmlClaude(dir: string): Promise<string> {
  return writeHtmlClaude(
    dir,
    '<!doctype html><script>const items = [1, 2;</script>',
    'claude-syntax-finalizer',
  );
}

async function writeHtmlClaude(dir: string, content: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-syntax-finalizer'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--add-dir DIR]'); process.exit(0); }
const content = ${JSON.stringify(content)};
fs.writeFileSync(path.join(process.cwd(), 'index.html'), content);
const W = (value) => fs.writeSync(1, JSON.stringify(value) + '\\n');
W({ type: 'system', subtype: 'init', model: 'syntax-finalizer-test', session_id: 'syntax-finalizer-session' });
W({ type: 'assistant', message: { id: 'write', content: [{
  type: 'tool_use', id: 'write-index', name: 'Write',
  input: { file_path: 'index.html', content },
}], stop_reason: 'tool_use' } });
W({ type: 'user', message: { content: [{
  type: 'tool_result', tool_use_id: 'write-index', content: 'File written', is_error: false,
}] } });
W({ type: 'assistant', message: { id: 'final', content: [{ type: 'text', text: 'Done' }], stop_reason: 'end_turn' } });
W({ type: 'result', subtype: 'success', is_error: false, session_id: 'syntax-finalizer-session', stop_reason: 'end_turn', usage: { input_tokens: 2, output_tokens: 1 }, duration_ms: 10 });
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function putConfig(url: string, claudeBin: string): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(response.status).toBe(200);
}

async function createProject(url: string): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `syntax_finalizer_${randomUUID()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Host syntax finalizer integration',
      metadata: { kind: 'prototype', entryFile: 'index.html' },
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
    headers: {
      'content-type': 'application/json',
      'x-od-analytics-device-id': 'syntax-finalizer-test',
      'x-od-analytics-session-id': 'syntax-finalizer-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId,
      assistantMessageId: `assistant_${randomUUID()}`,
      clientRequestId: `client_${randomUUID()}`,
      agentId: 'claude',
      message: 'Create the page',
      currentPrompt: 'Create the page',
    }),
  });
  expect(response.status).toBe(202);
  const { runId } = await response.json() as { runId: string };

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const statusResponse = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(statusResponse.status).toBe(200);
    const run = await statusResponse.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}
