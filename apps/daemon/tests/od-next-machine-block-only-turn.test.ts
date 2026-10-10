import type { Server } from 'node:http';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../src/db.js';
import { startServer, type StartServerOptions } from '../src/server.js';
import { clearOdNextRolloutStop } from '../src/strategies/od-next/rollout.js';

/**
 * A production-stage OD Next turn routinely answers with the machine block the
 * contract asks for and nothing else: the model wrote the files, so the reply
 * carries the Runtime State and no prose. That reply is well formed — there is
 * no malformed markup anywhere in it — and the run must still terminate.
 *
 * The close handler used to finish the protocol stream first and only then run
 * the empty-output guard that autofills "I generated these files". The autofill
 * goes back out through `send`, `send` pushes into the finished protocol stream,
 * and `push` throws once finished. The close handler is `try/finally` with no
 * `catch`, so the throw escaped as an unhandled rejection and the run never
 * reached a terminal status: the user watched a spinner forever while the files
 * sat finished on disk.
 */

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  eventsLogPath: string;
  error?: string | null;
  errorCode?: string | null;
};

const EXECUTION_PREFLIGHT = {
  productionRoutes: [{ id: 'html', available: true }],
  dependencies: [],
  inputs: [{ id: 'request', available: true }],
  renderers: [],
  exporters: [],
  templates: [],
  outputKinds: [{ id: 'prototype', supported: true }],
};

const RUNTIME_STATE = {
  schema: 'open-design.strategy-state/v2',
  route: 'full_plan',
  inputStage: 'request',
  outcome: 'plan_ready',
  executionMode: 'simple',
  reasonCodes: [],
};

/** The whole reply: the contract's machine block, no prose around it. */
const MACHINE_BLOCK_ONLY = `<open-design-runtime-state>\n${JSON.stringify(
  RUNTIME_STATE,
)}\n</open-design-runtime-state>`;

function database() {
  const dataDir = process.env.OD_DATA_DIR;
  if (!dataDir) throw new Error('OD_DATA_DIR is required');
  return openDatabase(process.cwd(), { dataDir });
}

/**
 * A fake `claude` that writes a real file and then answers with nothing but the
 * machine block — the exact shape a production-stage OD Next turn produces.
 */
async function writeFakeClaude(dir: string): Promise<string> {
  const bin = path.join(dir, 'claude-machine-block-only');
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
if (argv.includes('--version')) { fs.writeSync(1, '2.1.233 (Claude Code)\\n'); process.exit(0); }
if (argv.includes('--help')) { fs.writeSync(1, 'Usage: claude -p [--add-dir] [--include-partial-messages] [--forward-subagent-text] [--agents JSON] [--resume ID]\\n'); process.exit(0); }
let stdin = '';
let finished = false;
function w(v) { fs.writeSync(1, JSON.stringify(v) + '\\n'); }
function finish() {
  if (finished || stdin.length === 0) return;
  finished = true;
  const target = path.join(process.cwd(), 'index.html');
  fs.writeFileSync(target, '<!doctype html><title>Machine block only</title>');
  w({ type: 'system', subtype: 'init', model: 'claude-haiku-4-5', session_id: 'machine-block-only-session', claude_code_version: '2.1.233' });
  w({ type: 'assistant', parent_tool_use_id: null, message: { id: 'w1', stop_reason: 'tool_use', content: [
    { type: 'tool_use', id: 'tool-write-1', name: 'Write', input: { file_path: target, content: 'x' } },
  ] } });
  w({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-write-1', content: 'ok' }] } });
  w({ type: 'assistant', parent_tool_use_id: null, message: { id: 'final', stop_reason: 'end_turn', content: [
    { type: 'text', text: ${JSON.stringify(MACHINE_BLOCK_ONLY)} },
  ] } });
  w({ type: 'result', subtype: 'success', is_error: false, session_id: 'machine-block-only-session', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, duration_ms: 30 });
  setTimeout(() => process.exit(0), 10);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { stdin += c; setTimeout(finish, 0); });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`,
    'utf8',
  );
  await chmod(bin, 0o755);
  return bin;
}

describe('OD Next turn whose whole reply is the machine block', () => {
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  const savedRollout = process.env.OD_NEXT_STRATEGY_ROLLOUT;
  const savedCanary = process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY;

  afterEach(async () => {
    if (savedRollout === undefined) delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
    else process.env.OD_NEXT_STRATEGY_ROLLOUT = savedRollout;
    if (savedCanary === undefined) delete process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY;
    else process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = savedCanary;
    if (started) {
      await Promise.resolve(started.shutdown?.());
      if (started.server.listening) {
        // This suite polls the run over `fetch`, which keeps its sockets alive.
        // `close()` alone would wait on them until the hook timed out, so drop
        // the idle connections it is waiting for.
        await new Promise<void>((resolve) => {
          started!.server.close(() => resolve());
          started!.server.closeAllConnections?.();
        });
      }
    }
    started = null;
    closeDatabase();
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
  });

  it('terminates the run instead of hanging forever', async () => {
    binDir = await mkdtemp(path.join(os.tmpdir(), 'od-next-machine-block-'));
    const bin = await writeFakeClaude(binDir);

    started = (await startServer({
      port: 0,
      returnServer: true,
      odNextExecutionPreflightResolver: () => EXECUTION_PREFLIGHT,
      odNextComplexProductionResolver: null,
    } as StartServerOptions)) as StartedServer;
    const url = started.url;

    const config = await fetch(`${url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: bin } },
        telemetry: { metrics: false, content: false, artifactManifest: false },
        privacyDecisionAt: Date.now(),
      }),
    });
    expect(config.status).toBe(200);
    await fetch(`${url}/api/agents`);

    // OD Next is opt-in, so this suite asks for it explicitly rather than
    // relying on whatever the shipped default happens to be.
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    clearOdNextRolloutStop(database());

    const projectId = `machine-block-only-${Date.now()}`;
    const projectResponse = await fetch(`${url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'machine block only',
        metadata: { kind: 'prototype' },
        conversationMode: 'design',
        automaticStrategyTaskProfile: 'prototype',
        skipDiscoveryBrief: true,
      }),
    });
    expect(projectResponse.status, await projectResponse.clone().text()).toBe(200);
    const { conversationId } = (await projectResponse.json()) as { conversationId: string };

    const message = 'Create an OD Next prototype.';
    const runResponse = await fetch(`${url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId,
        conversationId,
        agentId: 'claude',
        userMessageId: 'user-machine-block-only',
        assistantMessageId: 'assistant-machine-block-only',
        clientRequestId: `machine-block-only-${Date.now()}`,
        message,
        currentPrompt: message,
      }),
    });
    const created = (await runResponse.json()) as { runId: string; strategyTask?: unknown };
    expect(runResponse.status, JSON.stringify(created)).toBe(202);
    // Guards the premise: a run OD Next never admitted would terminate for
    // reasons that have nothing to do with the protocol stream.
    expect(created.strategyTask, JSON.stringify(created)).toBeTruthy();

    let status: RunStatus | null = null;
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) {
      const response = await fetch(`${url}/api/runs/${encodeURIComponent(created.runId)}`);
      status = (await response.json()) as RunStatus;
      if (['succeeded', 'failed', 'canceled'].includes(status.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(
      status?.status,
      `run never reached a terminal status; last seen ${JSON.stringify(status)}`,
    ).toBe('succeeded');
  }, 60_000);
});
