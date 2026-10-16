// Regression (#5466): cancelling an Antigravity concrete-model run while it
// waits on the global model lock must NOT permanently poison the lock.
//
// acquireAntigravityModelLock (runtimes/defs/antigravity.ts) is a promise chain:
// each acquirer installs a fresh unresolved promise and returns its resolve() as
// `release`. server.ts acquires it BEFORE spawn for a concrete-model run, but the
// release is only handed off to the child-exit/watcher path AFTER a successful
// spawn — and the pre-spawn cancel check (`if (run.cancelRequested) { cleanup;
// return }`) returned without calling release. So a run cancelled WHILE awaiting
// the lock resumed once the prior holder released, became the holder, hit the
// cancel check, and returned without releasing — every subsequent concrete-model
// Antigravity run then hung forever. The fix adds a handoff-guarded, idempotent
// early-exit release across the acquire→spawn region.
//
// Scenario: A holds the lock (its agy stalls), B waits, B is cancelled, A exits →
// B resumes and (pre-fix) poisons the lock, then C can never acquire it. On main
// C never reaches a terminal status; with the early-exit release it does.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };

const CONCRETE_MODEL = 'Gemini 3.1 Pro (High)';

describe('antigravity model lock cancel release (#5466)', () => {
  const savedPath = process.env.PATH;
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
    process.env.PATH = savedPath;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('a run cancelled while waiting on the model lock does not poison it for later runs', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-agy-poison-'));
    const invocationsDir = path.join(binDir, 'inv');
    const goFile = path.join(binDir, 'go');
    await writeFakeAgy(binDir, invocationsDir, goFile);
    process.env.PATH = `${binDir}${path.delimiter}${savedPath ?? ''}`;
    for (const k of Object.keys(savedEnv)) delete process.env[k];

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'antigravity',
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const projectId = await createProject(started.url);

    // A: holds the lock (its agy stalls until the `go` file appears).
    const runA = await startRun(started.url, projectId);
    await waitFor(() => countInvocations(invocationsDir).then((n) => n >= 1), 8000, 'agy A to spawn');

    // B: waits on the lock (A holds it), so it never spawns its agy.
    const runB = await startRun(started.url, projectId);
    await sleep(1000); // let B reach `await acquireAntigravityModelLock()`
    expect(await countInvocations(invocationsDir)).toBe(1); // B has NOT spawned

    // Cancel B while it waits, then release A so B resumes and hits the cancel
    // check — where main returns without releasing the lock.
    await cancelRun(started.url, runB);
    await sleep(300);
    await writeFile(goFile, 'go');
    await waitFor(() => isTerminal(started!.url, runA), 8000, 'A terminal');
    await waitFor(() => isTerminal(started!.url, runB), 8000, 'B terminal');

    // C: a fresh concrete-model run. On main the lock is poisoned and C never
    // reaches a terminal status; a correct release lets C acquire and finish.
    const runC = await startRun(started.url, projectId);
    const cReachedTerminal = await pollTerminal(started.url, runC, 6000);
    expect(
      cReachedTerminal,
      `run C never reached a terminal status — the model lock was poisoned by ` +
        `the cancelled-while-waiting run B`,
    ).toBe(true);
  });
});

async function writeFakeAgy(dir: string, invocationsDir: string, goFile: string): Promise<void> {
  await writeFile(path.join(dir, 'agy'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
if (process.argv.includes('--version')) { fs.writeSync(1, 'agy 1.0.0-fake\\n'); process.exit(0); }
const invDir = ${JSON.stringify(invocationsDir)};
const goFile = ${JSON.stringify(goFile)};
try { fs.mkdirSync(invDir, { recursive: true }); } catch {}
fs.writeFileSync(path.join(invDir, String(process.pid)), '1');
// Hold (keep the lock held) until the test drops the go file, then emit a
// minimal plain reply and exit. Never write the model-propagation log line, so
// the lock release is driven only by our exit.
const iv = setInterval(() => {
  if (fs.existsSync(goFile)) {
    clearInterval(iv);
    fs.writeSync(1, 'Done.\\n');
    process.exit(0);
  }
}, 50);
`, 'utf8');
  await chmod(path.join(dir, 'agy'), 0o755);
}

async function countInvocations(invocationsDir: string): Promise<number> {
  if (!existsSync(invocationsDir)) return 0;
  return (await readdir(invocationsDir)).length;
}

async function putConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${url}/api/app-config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  expect(r.status).toBe(200);
}

async function createProject(url: string): Promise<string> {
  const id = `agy_poison_${randomUUID()}`;
  const r = await fetch(`${url}/api/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, name: 'agy poison', metadata: { kind: 'prototype' }, skipDiscoveryBrief: true }) });
  expect(r.status).toBe(200);
  return id;
}

async function startRun(url: string, projectId: string): Promise<string> {
  const projResp = await (await fetch(`${url}/api/projects/${encodeURIComponent(projectId)}`)).json() as { conversationId?: string };
  const r = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-od-analytics-device-id': 'd', 'x-od-analytics-session-id': 's', 'x-od-analytics-client-type': 'web' },
    body: JSON.stringify({
      projectId,
      conversationId: projResp.conversationId ?? undefined,
      assistantMessageId: `a_${randomUUID()}`,
      clientRequestId: `c_${randomUUID()}`,
      agentId: 'antigravity',
      model: CONCRETE_MODEL,
      message: 'hi',
      currentPrompt: 'hi',
    }),
  });
  expect(r.status).toBe(202);
  return ((await r.json()) as { runId: string }).runId;
}

async function cancelRun(url: string, runId: string): Promise<void> {
  await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
}

async function runStatus(url: string, runId: string): Promise<string> {
  const r = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
  if (r.status !== 200) return 'unknown';
  return ((await r.json()) as { status: string }).status;
}

async function isTerminal(url: string, runId: string): Promise<boolean> {
  return ['succeeded', 'failed', 'canceled'].includes(await runStatus(url, runId));
}

async function pollTerminal(url: string, runId: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isTerminal(url, runId)) return true;
    await sleep(150);
  }
  return false;
}

async function waitFor(cond: () => Promise<boolean>, timeoutMs: number, what: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }
