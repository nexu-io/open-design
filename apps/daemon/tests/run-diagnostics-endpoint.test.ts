// Feature (#5489, slice 1): GET /api/runs/:id/diagnostics + `od run inspect`
// expose the full failure classification the daemon already computes at
// finalize-time. Before this, only failureCategory / failureDetail reached the
// API; failureStage / retryable / userAction were telemetry-only. This spec
// drives a real daemon over the production HTTP API, fails a run through a fake
// claude CLI, and asserts the diagnostics endpoint now carries all five fields.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

describe('run diagnostics endpoint (#5489)', () => {
  const savedEnv: Record<string, string | undefined> = {};
  for (const k of ['POSTHOG_KEY', 'POSTHOG_HOST', 'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL', 'OPEN_DESIGN_TELEMETRY_RELAY_URL']) {
    savedEnv[k] = process.env[k];
  }
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) await new Promise<void>((r) => started?.server.close(() => r()));
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('exposes stage / retryable / userAction for a failed run, not just category/detail', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-run-diag-'));
    const bin = await writeFailingClaude(binDir, 'claude-fail');
    for (const k of Object.keys(savedEnv)) delete process.env[k];
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: bin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const runId = await createAndWaitForFailure(started.url);

    // The diagnostics endpoint carries the full classification.
    const diag = await (await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/diagnostics`)).json() as {
      runId: string;
      status: string;
      failure: { category: unknown; detail: unknown; stage: unknown; retryable: unknown; userAction: unknown } | null;
    };
    expect(diag.runId).toBe(runId);
    expect(diag.status).toBe('failed');
    expect(diag.failure, 'a failed run must carry a failure object').not.toBeNull();
    // The three fields this slice newly exposes must be present (the whole point).
    expect(diag.failure).toHaveProperty('stage');
    expect(diag.failure).toHaveProperty('retryable');
    expect(diag.failure).toHaveProperty('userAction');
    expect(typeof diag.failure!.retryable === 'boolean' || diag.failure!.retryable === null).toBe(true);

    // Control: the plain status endpoint still does NOT carry the new fields,
    // proving the diagnostics resource is what adds them.
    const status = await (await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}`)).json() as Record<string, unknown>;
    expect(status).not.toHaveProperty('failureStage');
    expect(status).not.toHaveProperty('failureUserAction');
  });
});

async function writeFailingClaude(dir: string, name: string): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { fs.writeSync(1, 'claude-code 1.0.0-diag-test\\n'); process.exit(0); }
if (process.argv.includes('--help')) { fs.writeSync(1, 'Usage: claude -p\\n'); process.exit(0); }
fs.writeSync(1, JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-diag-test' }) + '\\n');
// Fail with an authentication error so the classifier produces a concrete
// stage/retryable/user_action (not just a generic process_exit).
fs.writeSync(2, 'Error: authentication required. Please sign in again.\\n');
process.exit(1);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${url}/api/app-config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  expect(r.status).toBe(200);
}

async function createAndWaitForFailure(url: string): Promise<string> {
  const projectId = `run_diag_${randomUUID()}`;
  const p = await fetch(`${url}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: projectId, name: 'Run diagnostics', metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }) });
  expect(p.status).toBe(200);
  const { conversationId } = await p.json() as { conversationId: string };
  const r = await fetch(`${url}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-od-analytics-device-id': 'd', 'x-od-analytics-session-id': 's', 'x-od-analytics-client-type': 'web' }, body: JSON.stringify({ projectId, conversationId, assistantMessageId: `a_${randomUUID()}`, clientRequestId: `c_${randomUUID()}`, agentId: 'claude', message: 'x', currentPrompt: 'x' }) });
  expect(r.status).toBe(202);
  const { runId } = await r.json() as { runId: string };
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    const run = await (await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`)).json() as { status: string };
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) {
      expect(run.status).toBe('failed');
      return runId;
    }
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error(`run ${runId} did not finish`);
}
