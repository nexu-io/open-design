// Regression (#5487): a Task SUB-AGENT turn boundary must not be treated as the
// main turn's completion.
//
// Bug: the claude stream-json parser treated a SUB-AGENT (Task) assistant frame
// exactly like a main-turn frame. claude-stream.ts reads `message.stop_reason`
// off ANY `type:'assistant'` wrapper and, when it is not 'tool_use', emits
// `turn_end`. It never inspected `parent_tool_use_id`, which claude-code sets on
// every message a sub-agent emits (main-turn messages carry
// `parent_tool_use_id: null`). Claude is spawned with `--verbose`
// (runtimes/defs/claude.ts:59), so sub-agent frames DO appear inline in the
// stream. The fix guards the emit on `parent_tool_use_id == null`.
//
// Consequence: when a Task sub-agent finishes its internal turn with
// `stop_reason: 'end_turn'`, applyClaudeStreamJsonRunBookkeeping
// (chat-run-lifecycle.ts:98-118) sets `run.turnCompletedCleanly = true` AND
// closes stdin — while the MAIN turn is still running. Nothing ever resets that
// flag within the attempt. If the main agent then terminates non-zero WITHOUT a
// result frame (hard crash / OOM kill / connection-drop abort mid-synthesis),
// the close handler finds `turnCompletedCleanly === true` and
// classifyChatRunCloseStatus (chat-run-lifecycle.ts:70) translates the non-zero
// exit into 'succeeded' — a false success that hides the failure and skips the
// same-run retry, surfacing the sub-agent's internal scratch as the "answer".
//
// A/B: the ONLY difference between the two runs below is the presence of the
// sub-agent `end_turn` frame. Both crash with exit 1 and no result frame.
//   - control (no sub-agent frame): turnCompletedCleanly stays false -> 'failed'
//   - sidechain (sub-agent end_turn): flag flips true -> currently 'succeeded'
// The sub-agent frame is the sole cause of the misclassification.
//
// Expected (invariant): a sub-agent turn boundary must NOT vouch for the whole
// run. Both runs must classify 'failed'.
// Actual on current code: the sidechain run classifies 'succeeded', exitCode 1.

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

describe('claude sub-agent turn_end false success (#5487)', () => {
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

  it('a sub-agent end_turn must not classify a crashed main turn as succeeded', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-sidechain-claude-bin-'));
    const controlBin = await writeCrashClaude(binDir, 'claude-control', { withSubagent: false });
    const sidechainBin = await writeCrashClaude(binDir, 'claude-sidechain', { withSubagent: true });

    delete process.env.POSTHOG_KEY;
    delete process.env.POSTHOG_HOST;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_BASE_URL;
    delete process.env.OPEN_DESIGN_TELEMETRY_RELAY_URL;

    started = await startServer({ port: 0, returnServer: true }) as StartedServer;

    // A/B control: identical crash (exit 1, no result frame) WITHOUT a sub-agent
    // frame. turnCompletedCleanly stays false, so the run classifies 'failed'.
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: controlBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const controlRun = await createAndWaitForRun(started.url);
    expect(controlRun.exitCode).toBe(1);
    // Baseline: without the sub-agent frame the crash is correctly a failure.
    expect(controlRun.status).toBe('failed');

    // The bug: swap in the sub-agent-emitting CLI, same crash, and the run is
    // misclassified as a success purely because the sub-agent's internal turn
    // set turnCompletedCleanly.
    await putConfig(started.url, {
      agentId: 'claude',
      agentCliEnv: { claude: { CLAUDE_BIN: sidechainBin } },
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    });
    const sidechainRun = await createAndWaitForRun(started.url);
    expect(sidechainRun.exitCode).toBe(1);
    // INVARIANT: a sub-agent (parent_tool_use_id != null) turn boundary must not
    // vouch for the main turn. A non-zero crash with no result frame is a
    // failure regardless of any sub-agent's internal end_turn.
    expect(sidechainRun.status).toBe('failed');
  });
});

async function writeCrashClaude(
  dir: string,
  name: string,
  opts: { withSubagent: boolean },
): Promise<string> {
  const bin = path.join(dir, name);
  // Frames written synchronously (fs.writeSync) so nothing is lost when the
  // process exits non-zero. The main turn commits a Task tool_use (stop_reason
  // 'tool_use', so it never sets turnCompletedCleanly), the sub-agent finishes
  // its OWN internal turn with end_turn (parent_tool_use_id set), then the main
  // agent "crashes" (exit 1) before delivering any final answer or result frame.
  const subagentFrame = opts.withSubagent
    ? `w(JSON.stringify({
        type: 'assistant',
        parent_tool_use_id: 'tu_task',
        message: {
          id: 'msg-sub',
          content: [{ type: 'text', text: 'sub-agent internal scratch' }],
          stop_reason: 'end_turn',
        },
      }) + '\\n');`
    : '';
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
function w(s) { fs.writeSync(1, s); }
if (process.argv.includes('--version')) { w('claude-code 1.0.0-sidechain-test\\n'); process.exit(0); }
if (process.argv.includes('--help')) { w('Usage: claude -p [--include-partial-messages] [--add-dir DIR]\\n'); process.exit(0); }

w(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sidechain-test', session_id: 's-sidechain' }) + '\\n');
// Main turn delegates to a Task sub-agent (stop_reason 'tool_use' keeps stdin open).
w(JSON.stringify({
  type: 'assistant',
  parent_tool_use_id: null,
  message: {
    id: 'msg-main',
    content: [{ type: 'tool_use', id: 'tu_task', name: 'Task', input: { prompt: 'do work' } }],
    stop_reason: 'tool_use',
  },
}) + '\\n');
${subagentFrame}
// Main agent dies mid-synthesis: non-zero exit, NO result frame, NO error frame.
setTimeout(() => process.exit(1), 30);
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
  const projectId = `sidechain_claude_${randomUUID()}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: 'Sidechain turn_end repro',
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
      'x-od-analytics-device-id': 'sidechain-claude-test',
      'x-od-analytics-session-id': 'sidechain-claude-session',
      'x-od-analytics-client-type': 'web',
    },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId: `assistant_sidechain_${randomUUID()}`,
      clientRequestId: `client_sidechain_${randomUUID()}`,
      agentId: 'claude',
      message: 'reproduce sub-agent turn_end false success',
      currentPrompt: 'reproduce sub-agent turn_end false success',
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
