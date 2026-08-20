// Regression (neighbor of #5487): a Task SUB-AGENT's in-stream error frame must
// not condemn the whole run when the main turn demonstrably recovers.
//
// Bug: #5487 guarded the `turn_end` emit on `parent_tool_use_id == null`
// (claude-stream.ts:461), but the `error` emit on the SAME assistant wrapper
// seven lines below (claude-stream.ts:468-474) has no sidechain guard. Claude
// is spawned with `--verbose` (runtimes/defs/claude.ts:59), so Task sub-agent
// frames stream inline carrying a non-null top-level `parent_tool_use_id`.
// Claude-code surfaces an API failure (overload / connection reset, later
// retried internally or absorbed by the main agent) as an assistant wrapper
// with an `error` field — the daemon's own comment at server.ts:7133-7139
// documents the `assistant error:"unknown"` shape for connection drops. When
// that failure happens inside a sub-agent's turn, the frame carries BOTH
// `error` and `parent_tool_use_id`, and the parser emits a fatal-looking
// `type:'error'` event for it.
//
// Consequence chain (all server.ts):
//   1. The claude event callback treats ANY `type:'error'` as the run's
//      stream error: sets `agentStreamError`, sends a terminal-looking SSE
//      `error` to the chat UI mid-run, clears the inactivity watchdog
//      (server.ts:7100-7160). Nothing ever clears `agentStreamError` again.
//   2. At child close, `agentStreamError` short-circuits BEFORE
//      classifyChatRunCloseStatus: the run is finished 'failed' and a clean
//      exit code 0 is rewritten to 1 (server.ts:7505-7508). A subsequent
//      main-turn recovery (end_turn + is_error:false result + exit 0) cannot
//      rescue it. Since the sub-agent emitted text / the main turn called a
//      tool, decideSafeRunRetry also suppresses the same-run retry
//      (user_visible_output_seen / tool_call_seen), so the user just gets a
//      failed run on top of a correct answer.
//
// A/B: the ONLY difference between the two runs below is the `error` field on
// the sub-agent assistant frame. Both recover (main end_turn), deliver a clean
// success result frame, and exit 0.
//   - control (sub-agent frame without `error`): no stream error -> 'succeeded'
//   - sidechain-error (sub-agent frame with `error:"unknown"`):
//     agentStreamError latched -> currently 'failed', exitCode rewritten 0 -> 1
// The sub-agent's internal error field is the sole cause of the misclassification.
//
// Expected (invariant): a sub-agent's internal stream error must not vouch for
// the whole run. The terminal truth is the main turn's result frame and the
// process exit code; both runs must classify 'succeeded'.
// Actual on current code: the sidechain-error run classifies 'failed', exitCode 1.

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
  eventsLogPath: string;
};

describe('claude sub-agent assistant error false failure', () => {
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

  it('a sub-agent in-stream error must not fail a run whose main turn recovers', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-sidechain-error-claude-bin-'));
    const controlBin = await writeRecoveringClaude(binDir, 'claude-control', { withSubagentError: false });
    const sidechainBin = await writeRecoveringClaude(binDir, 'claude-sidechain-error', { withSubagentError: true });

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;

    // A/B control: identical recovery (main end_turn + clean result + exit 0)
    // WITHOUT an `error` field on the sub-agent frame. No stream error is
    // latched, so the run classifies 'succeeded'.
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: controlBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const controlRun = await createAndWaitForRun(started.url);
    // Baseline: without the sub-agent error field the recovered run succeeds.
    expect(controlRun.status).toBe('succeeded');
    expect(controlRun.exitCode).toBe(0);

    // The bug: swap in the CLI whose SUB-AGENT frame carries `error:"unknown"`,
    // same recovery, and the run is failed purely because a sub-agent's
    // internal stream error latched `agentStreamError`.
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: sidechainBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const sidechainRun = await createAndWaitForRun(started.url);
    // INVARIANT: a sub-agent (parent_tool_use_id != null) in-stream error must
    // not condemn the main turn. A clean result frame (is_error:false) plus a
    // zero exit code is a success regardless of any sub-agent's internal error.
    // (toMatchObject so a violation prints the full misclassified run body.)
    expect(sidechainRun).toMatchObject({ status: 'succeeded', exitCode: 0 });
  });
});

async function writeRecoveringClaude(
  dir: string,
  name: string,
  opts: { withSubagentError: boolean },
): Promise<string> {
  const bin = path.join(dir, name);
  // Frames written synchronously (fs.writeSync) so nothing is lost on exit.
  // The main turn delegates to a Task sub-agent; the sub-agent's assistant
  // frame optionally carries `error:"unknown"` (the shape server.ts:7133-7139
  // documents for an API connection drop); the main turn then recovers with a
  // final answer + end_turn, the CLI reports a clean success result frame and
  // exits 0. The `error` field is the ONLY difference between the two bins.
  const subagentErrorField = opts.withSubagentError
    ? `\n        error: 'unknown',`
    : '';
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
function w(s) { fs.writeSync(1, s); }
if (process.argv.includes('--version')) { w('claude-code 1.0.0-sidechain-error-test\\n'); process.exit(0); }
if (process.argv.includes('--help')) { w('Usage: claude -p [--include-partial-messages] [--add-dir DIR]\\n'); process.exit(0); }

w(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sidechain-error-test', session_id: 's-sidechain-error' }) + '\\n');
// Main turn delegates to a Task sub-agent (stop_reason 'tool_use' keeps stdin open).
w(JSON.stringify({
  type: 'assistant',
  parent_tool_use_id: null,
  message: {
    id: 'msg-main-task',
    content: [{ type: 'tool_use', id: 'tu_task', name: 'Task', input: { prompt: 'do work' } }],
    stop_reason: 'tool_use',
  },
}) + '\\n');
// Sub-agent frame: hits an internal API error mid-turn (parent_tool_use_id set).
w(JSON.stringify({
  type: 'assistant',
  parent_tool_use_id: 'tu_task',${subagentErrorField}
  message: {
    id: 'msg-sub',
    content: [{ type: 'text', text: 'sub-agent partial output before its API hiccup' }],
    stop_reason: null,
  },
}) + '\\n');
// Main turn RECOVERS: final answer + end_turn on a main-turn frame.
w(JSON.stringify({
  type: 'assistant',
  parent_tool_use_id: null,
  message: {
    id: 'msg-main-final',
    content: [{ type: 'text', text: 'final answer from the recovered main turn' }],
    stop_reason: 'end_turn',
  },
}) + '\\n');
// Clean terminal truth: success result frame (is_error:false), then exit 0.
w(JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  session_id: 's-sidechain-error',
  usage: { input_tokens: 10, output_tokens: 20 },
  total_cost_usd: 0.01,
  duration_ms: 1000,
}) + '\\n');
setTimeout(() => process.exit(0), 30);
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
  const projectId = `sidechain_error_claude_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Sidechain assistant error repro',
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
      'x-od-analytics-device-id': 'sidechain-error-claude-test',
      'x-od-analytics-session-id': 'sidechain-error-claude-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_sidechain_error_${randomUUID()}`,
      clientRequestId: `client_sidechain_error_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce sub-agent assistant error false failure',
      currentPrompt: 'reproduce sub-agent assistant error false failure',
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
