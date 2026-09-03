// Regression (#7564): a whitespace-only text_delta must not count as produced
// output, or the close-time empty-output guard is defeated.
//
// Bug: sendAgentEvent marked `agentProducedOutput = true` for ANY non-empty
// delta string it forwarded, including pure whitespace ("\n"). A codex run
// (json-event-stream → trackingSubstantiveOutput = true) whose ENTIRE answer
// is blank therefore passes the empty-output guard at close time and, with a
// clean exit 0, classifies 'succeeded'.
//
// A/B: the ONLY difference between the two runs below is the agent_message
// text ('Real answer.' vs '\n'). Both exit 0.
//   - control (real text): 'succeeded' proves the healthy path is unaffected.
//   - blank ("\n"): INVARIANT 'failed' — on current code it is 'succeeded'.

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
  exitCode: number | null;
  error: string | null;
  errorCode: string | null;
  failureCategory: string | null;
  eventsLogPath: string;
};

describe('blank output must not defeat the empty-output guard (#7564)', () => {
  const originalEnv = {
    POSTHOG_KEY: process.env.POSTHOG_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    OPEN_DESIGN_TELEMETRY_RELAY_URL: process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL,
    OD_NEXT_STRATEGY_ROLLOUT: process.env.OD_NEXT_STRATEGY_ROLLOUT,
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

  it('a run whose entire answer is whitespace-only must fail, not succeed', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-blank-output-codex-bin-'));
    const controlBin = await writeBlankCodex(binDir, 'codex-control', { text: 'Real answer.' });
    const blankBin = await writeBlankCodex(binDir, 'codex-blank', { text: '\n' });

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;

    // A/B control: a real agent_message with a clean exit is a success.
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: controlBin, CODEX_HOME: binDir } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const controlRun = await createAndWaitForRun(started.url);
    expect(controlRun.exitCode).toBe(0);
    expect(controlRun.status).toBe('succeeded');

    // The bug: the same healthy close shape, but the whole answer is "\n".
    // INVARIANT: a whitespace-only response is not substantive output; the
    // close-time empty-output guard must classify the run 'failed'.
    await putConfig(started.url, {
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: blankBin, CODEX_HOME: binDir } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const blankRun = await createAndWaitForRun(started.url);
    expect(blankRun.status).toBe('failed');
    expect(blankRun.failureCategory).toBe('empty_output');
  });
});

async function writeBlankCodex(
  dir: string,
  name: string,
  opts: { text: string },
): Promise<string> {
  const bin = path.join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
function w(s) { fs.writeSync(1, s); }
if (process.argv.includes('--version')) { w('codex-cli 0.147.0\\n'); process.exit(0); }
if (process.argv.includes('--help')) { w('Usage: codex exec [--sandbox MODE]\\n'); process.exit(0); }
w(JSON.stringify({ type: 'thread.started', thread_id: 'thread-${name}' }) + '\\n');
w(JSON.stringify({ type: 'turn.started' }) + '\\n');
w(JSON.stringify({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: ${JSON.stringify(opts.text)} } }) + '\\n');
w(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }) + '\\n');
setTimeout(() => process.exit(0), 5);
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
  const projectId = `blank_output_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Blank output empty-output guard repro',
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
      'x-od-analytics-device-id': 'blank-output-codex-test',
      'x-od-analytics-session-id': 'blank-output-codex-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_blank_output_${randomUUID()}`,
      clientRequestId: `client_blank_output_${randomUUID()}`,
      agentId: 'codex',
      message: 'reproduce blank output false success',
      currentPrompt: 'reproduce blank output false success',
    }),
  });
  expect(runResponse.status).toBe(202);
  const body = await runResponse.json() as { runId: string };
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(body.runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (['failed', 'succeeded', 'canceled'].includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`run ${body.runId} did not finish`);
}
