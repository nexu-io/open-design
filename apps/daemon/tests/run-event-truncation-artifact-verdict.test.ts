// Regression: a run's committed-artifact verdict must survive truncation of
// the in-memory event ring buffer.
//
// run.events is capped at createChatRunService `maxEvents` (2000). On a long
// run, the earliest events — including an artifact's tool_use / tool_result
// pair — are spliced out. The finalization consumers (retry safety gate,
// artifact_count, and the close-status `artifactProducedThisRun` verdict) used
// to re-scan the truncated run.events, so a run that genuinely produced an
// artifact early, then streamed >2000 more events, then exited non-zero, was
// misclassified 'failed' (its non-zero exit no longer rescued by the lost
// artifact evidence). The fix folds committed side effects into a
// truncation-proof per-run ledger at emit time.
//
// Two layers:
//   1. HTTP-level: drive a real run over the daemon API with a fake claude CLI
//      that writes an artifact early, floods past the ring buffer, then exits
//      non-zero. Expected 'succeeded'; before the fix, 'failed'.
//   2. Unit: fold the same shape into the ledger and confirm the verdict holds
//      regardless of how many later events would have truncated run.events.

import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import {
  createRunSideEffectLedger,
  foldEventIntoRunSideEffectLedger,
  runArtifactCountForRun,
  runSideEffectsForRun,
  sideEffectsFromLedger,
} from '../src/runtimes/run-lifecycle-analytics.js';

const PROD_DEFAULT_MAX_EVENTS = 2_000;

describe('run event-buffer truncation vs artifact verdict (unit)', () => {
  it('the ledger keeps the artifact verdict after 2000+ later events', () => {
    const ledger = createRunSideEffectLedger();
    // Early artifact write: a Write index.html tool_use paired with a
    // non-error tool_result.
    foldEventIntoRunSideEffectLedger(ledger, {
      event: 'agent',
      data: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'index.html' } },
    });
    foldEventIntoRunSideEffectLedger(ledger, {
      event: 'agent',
      data: { type: 'tool_result', toolUseId: 'toolu_1', isError: false },
    });
    // Flood with far more than maxEvents later events — these would splice the
    // tool_use/tool_result out of an in-memory run.events buffer.
    for (let i = 0; i < PROD_DEFAULT_MAX_EVENTS + 500; i++) {
      foldEventIntoRunSideEffectLedger(ledger, {
        event: 'agent',
        data: { type: 'text_delta', delta: `tok${i}` },
      });
    }
    const verdict = sideEffectsFromLedger(ledger);
    expect(verdict.artifactWriteSeen).toBe(true);
    expect(ledger.artifactPaths.size).toBe(1);
  });

  it('a failed (isError) tool_result does not count as an artifact', () => {
    const ledger = createRunSideEffectLedger();
    foldEventIntoRunSideEffectLedger(ledger, {
      event: 'agent',
      data: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'index.html' } },
    });
    foldEventIntoRunSideEffectLedger(ledger, {
      event: 'agent',
      data: { type: 'tool_result', toolUseId: 'toolu_1', isError: true },
    });
    expect(sideEffectsFromLedger(ledger).artifactWriteSeen).toBe(false);
    expect(ledger.artifactPaths.size).toBe(0);
  });

  it('does not accumulate unbounded state for ordinary non-write tool results', () => {
    const ledger = createRunSideEffectLedger();
    // A long tool-heavy run: thousands of Read/Bash/Grep calls, each a
    // tool_use + tool_result pair. None are write/edit tools, so none should
    // leave anything behind in the ledger's pending map — otherwise this fix
    // would reintroduce unbounded per-run growth on the same long-run path it
    // is meant to harden.
    for (let i = 0; i < 5_000; i++) {
      const id = `toolu_read_${i}`;
      foldEventIntoRunSideEffectLedger(ledger, {
        event: 'agent',
        data: { type: 'tool_use', id, name: 'Read', input: { file_path: `src/file${i}.ts` } },
      });
      foldEventIntoRunSideEffectLedger(ledger, {
        event: 'agent',
        data: { type: 'tool_result', toolUseId: id, isError: false },
      });
    }
    expect(ledger.pendingWritePathById.size).toBe(0);
    expect(sideEffectsFromLedger(ledger).artifactWriteSeen).toBe(false);
    expect(ledger.toolCallSeen).toBe(true);
  });

  it('an artifact write pairs and clears its pending entry once resolved', () => {
    const ledger = createRunSideEffectLedger();
    foldEventIntoRunSideEffectLedger(ledger, {
      event: 'agent',
      data: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'index.html' } },
    });
    foldEventIntoRunSideEffectLedger(ledger, {
      event: 'agent',
      data: { type: 'tool_result', toolUseId: 'toolu_1', isError: false },
    });
    expect(sideEffectsFromLedger(ledger).artifactWriteSeen).toBe(true);
    // No lingering pending state after a write pairs with its result.
    expect(ledger.pendingWritePathById.size).toBe(0);
  });

  it('runSideEffectsForRun falls back to scanning run.events when no ledger', () => {
    const events = [
      { event: 'agent', data: { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'index.html' } } },
      { event: 'agent', data: { type: 'tool_result', toolUseId: 'toolu_1', isError: false } },
    ];
    expect(runSideEffectsForRun({ events }).artifactWriteSeen).toBe(true);
    expect(runArtifactCountForRun({ events })).toBe(1);
  });
});

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type RunStatus = { id: string; status: string; exitCode: number | null };

describe('run event-buffer truncation vs artifact verdict (HTTP)', () => {
  const originalEnv = {
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

  it('a run that wrote an artifact then flooded past the ring buffer, then exited non-zero, is succeeded', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-trunc-artifact-bin-'));
    // Flood well past maxEvents (2000) so the early tool_use/tool_result pair
    // is spliced out of the in-memory run.events buffer.
    const fakeClaude = await writeArtifactThenFloodClaude(binDir, 'claude-trunc', PROD_DEFAULT_MAX_EVENTS + 500);

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: fakeClaude } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });

    const run = await createAndWaitForRun(started.url);

    // The run genuinely produced index.html (its tool_use/tool_result is in the
    // on-disk log) and then exited non-zero. The non-zero exit must be rescued
    // by the artifact it produced — the verdict must not depend on that
    // evidence surviving the run.events ring buffer.
    expect(run.exitCode).toBe(1);
    expect(run.status).toBe('succeeded');
  });
});

async function writeArtifactThenFloodClaude(dir: string, name: string, flood: number): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('--version')) { console.log('claude-code 1.0.0-trunc'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: claude -p [--add-dir DIR]'); process.exit(0); }
// Synchronous writes so every line is delivered before the process exits.
const W = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
W({ type: 'system', subtype: 'init', model: 'trunc-test' });
// Early artifact: Write index.html, stop_reason 'tool_use' so no clean turn_end
// (a clean turn would independently rescue the run and mask the bug).
W({ type: 'assistant', message: { id: 'm_tool', content: [
  { type: 'tool_use', id: 'toolu_1', name: 'Write', input: { file_path: 'index.html', content: '<html>hi</html>' } },
], stop_reason: 'tool_use' } });
W({ type: 'user', message: { content: [
  { type: 'tool_result', tool_use_id: 'toolu_1', content: 'File written', is_error: false },
] } });
// Flood: text_delta stream events push the early pair out of the ring buffer.
for (let i = 0; i < ${flood}; i++) {
  W({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 't' + i + ' ' } } });
}
process.exit(1); // non-zero, no clean turn_end
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
  const projectId = `trunc_artifact_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Truncation artifact repro',
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
      'x-od-analytics-device-id': 'trunc-test',
      'x-od-analytics-session-id': 'trunc-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_trunc_${randomUUID()}`,
      clientRequestId: `client_trunc_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce artifact-verdict truncation',
      currentPrompt: 'reproduce artifact-verdict truncation',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
