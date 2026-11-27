import type { Server } from 'node:http';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachAcpSession } from '../src/agent-protocol/acp/index.js';
import { hermesAgentDef } from '../src/runtimes/defs/hermes.js';
import { startServer } from '../src/server.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
  promptCache?: {
    hit?: boolean;
    missReason?: string;
  } | null;
};

/**
 * Writes an executable fake Hermes ACP CLI that enforces strict ACP schemas:
 * - `initialize` advertises `agentCapabilities.loadSession: true` (unless omitted).
 * - `session/new` returns `{ sessionId, models }` with NO `openCodeSessionId`.
 * - `session/load` REQUIRES `Array.isArray(params.mcpServers)` (matching Hermes'
 *   pydantic validation), streams spec-mandated history replay notifications
 *   (`user_message_chunk`, `agent_thought_chunk`, `agent_message_chunk`,
 *   `tool_call`, `tool_call_update`, `plan`) plus load-time state updates
 *   (`available_commands_update`, `usage_update`, `current_mode_update`), and
 *   returns a strict `LoadSessionResponse` WITHOUT `sessionId` or
 *   `openCodeSessionId` (`{ _meta: {}, models, modes }`).
 * - `session/prompt` streams live thinking + assistant text and completes.
 */
async function writeStrictHermesStub(
  dir: string,
  options: {
    ledgerPath: string;
    sessionId?: string;
    advertiseLoadSession?: boolean;
    turn1Reply?: string;
    turn2Reply?: string;
  },
): Promise<string> {
  const scriptPath = path.join(dir, 'fake-hermes.mjs');
  const binPath = path.join(dir, 'hermes');
  const sessionId = options.sessionId ?? 'hermes-native-session-001';
  const advertiseLoadSession = options.advertiseLoadSession ?? true;
  const turn1Reply = options.turn1Reply ?? 'Turn 1 answer from Hermes.';
  const turn2Reply = options.turn2Reply ?? 'Turn 2 resumed answer from Hermes.';

  const script = `
import { appendFileSync } from 'node:fs';
import readline from 'node:readline';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  process.stdout.write('hermes-agent 0.22.2\\n');
  process.exit(0);
}

const LEDGER = ${JSON.stringify(options.ledgerPath)};
const SESSION_ID = ${JSON.stringify(sessionId)};
const ADVERTISE_LOAD = ${JSON.stringify(advertiseLoadSession)};
const TURN1_REPLY = ${JSON.stringify(turn1Reply)};
const TURN2_REPLY = ${JSON.stringify(turn2Reply)};

let didLoad = false;
let activeSessionId = SESSION_ID;

function record(entry) {
  appendFileSync(LEDGER, JSON.stringify(entry) + '\\n');
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\\n');
}

function writeResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function writeError(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });
}

function writeUpdate(update) {
  send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: { sessionId: activeSessionId, update },
  });
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    record({ method, params });
    writeResult(id, {
      protocolVersion: 1,
      agentInfo: { name: 'hermes', version: '0.22.2' },
      agentCapabilities: ADVERTISE_LOAD
        ? { loadSession: true, sessionCapabilities: { fork: {}, list: {}, resume: {} } }
        : { promptCapabilities: { embeddedContext: false } },
    });
    return;
  }
  if (method === 'session/new') {
    record({ method, params });
    activeSessionId = SESSION_ID;
    writeResult(id, {
      sessionId: activeSessionId,
      models: { currentModelId: 'default', availableModels: [{ modelId: 'default', name: 'default' }] },
      modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
    });
    return;
  }
  if (method === 'session/load') {
    record({ method, params });
    if (!params || !Array.isArray(params.mcpServers)) {
      writeError(id, -32602, 'Invalid params', {
        errors: [{ type: 'missing', loc: ['mcpServers'], msg: 'Field required' }],
      });
      return;
    }
    didLoad = true;
    activeSessionId = typeof params.sessionId === 'string' ? params.sessionId : SESSION_ID;
    // Stream spec-mandated history replay BEFORE answering session/load:
    writeUpdate({ sessionUpdate: 'user_message_chunk', content: { type: 'text', text: 'REPLAYED_USER_PROMPT' } });
    writeUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'REPLAYED_THOUGHT' } });
    writeUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: TURN1_REPLY } });
    writeUpdate({
      sessionUpdate: 'tool_call',
      toolCallId: 'replay-tool-1',
      title: 'Read prior file',
      kind: 'read',
      status: 'in_progress',
      rawInput: { path: 'old.html' },
    });
    writeUpdate({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'replay-tool-1',
      status: 'completed',
      rawOutput: 'old file contents',
    });
    writeUpdate({
      sessionUpdate: 'plan',
      entries: [{ content: 'REPLAYED_PLAN_STEP', status: 'completed' }],
    });
    // Also stream load-time state updates that must keep flowing:
    writeUpdate({ sessionUpdate: 'available_commands_update', availableCommands: [] });
    writeUpdate({ sessionUpdate: 'usage_update', usage: { inputTokens: 10, outputTokens: 5 } });
    writeUpdate({ sessionUpdate: 'current_mode_update', currentModeId: 'default' });
    // Strict ACP LoadSessionResponse: no sessionId, no openCodeSessionId.
    writeResult(id, {
      _meta: {},
      models: { currentModelId: 'default', availableModels: [{ modelId: 'default', name: 'default' }] },
      modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default' }] },
    });
    return;
  }
  if (method === 'session/prompt') {
    record({ method, params });
    if (didLoad) {
      writeUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'LIVE_TURN2_THOUGHT' } });
      writeUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: TURN2_REPLY } });
    } else {
      writeUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'LIVE_TURN1_THOUGHT' } });
      writeUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: TURN1_REPLY } });
    }
    writeResult(id, { stopReason: 'end_turn', usage: { inputTokens: 20, outputTokens: 10 } });
    return;
  }
});
rl.on('close', () => process.exit(0));
`;

  await writeFile(scriptPath, script, 'utf8');
  const quote = (v: string) => `'${v.replaceAll("'", "'\\''")}'`;
  await writeFile(
    binPath,
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(scriptPath)} "$@"\n`,
    'utf8',
  );
  await chmod(binPath, 0o755);
  return binPath;
}

async function readLedger(ledgerPath: string): Promise<Array<{ method: string; params?: Record<string, unknown> }>> {
  const raw = await readFile(ledgerPath, 'utf8');
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { method: string; params?: Record<string, unknown> });
}

function waitForExit(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('close', () => resolve());
  });
}

describe('ACP strict session/load resume (Hermes F1-F5)', () => {
  let tempDir: string | null = null;
  let started: StartedServer | null = null;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
  });

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('declares resumesSessionViaAcpLoad on hermesAgentDef (F1)', () => {
    expect(hermesAgentDef.resumesSessionViaAcpLoad).toBe(true);
  });

  it('captures ACP sessionId on session/new and completes strict session/load with replay suppression (F2-F5)', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-strict-load-'));
    const ledgerPath = path.join(tempDir, 'ledger.jsonl');
    const binPath = await writeStrictHermesStub(tempDir, {
      ledgerPath,
      sessionId: 'hermes-uuid-42',
    });

    // Turn 1: session/new without openCodeSessionId, initialize advertises loadSession: true.
    const child1 = spawn(binPath, ['acp', '--accept-hooks'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let capturedHandle: string | null = null;
    try {
      const s1 = attachAcpSession({
        child: child1 as never,
        prompt: 'first turn',
        cwd: tempDir,
        model: 'default',
        mcpServers: [],
        send: () => {},
      });
      await waitForExit(child1);
      expect(s1.hasFatalError()).toBe(false);
      expect(s1.completedSuccessfully()).toBe(true);
      capturedHandle = s1.getDurableSessionId();
      expect(capturedHandle).toBe('hermes-uuid-42');
    } finally {
      if (child1.exitCode === null) child1.kill('SIGTERM');
    }

    // Turn 2: session/load against strict schema (requires mcpServers, omits sessionId in result,
    // streams history replay before resolving).
    const events2: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const child2 = spawn(binPath, ['acp', '--accept-hooks'], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      const s2 = attachAcpSession({
        child: child2 as never,
        prompt: 'second turn',
        cwd: tempDir,
        model: 'default',
        resumeSessionId: capturedHandle,
        mcpServers: [{ type: 'stdio', name: 'demo', command: 'echo', args: ['hi'], env: {} }],
        send: (event, payload) => {
          events2.push({ event, payload: (payload ?? {}) as Record<string, unknown> });
        },
      });
      await waitForExit(child2);
      expect(s2.hasFatalError()).toBe(false);
      expect(s2.completedSuccessfully()).toBe(true);
      expect(s2.getDurableSessionId()).toBe('hermes-uuid-42');
    } finally {
      if (child2.exitCode === null) child2.kill('SIGTERM');
    }

    // Verify F2: session/load carried mcpServers.
    const ledger = await readLedger(ledgerPath);
    const loadEntry = ledger.find((entry) => entry.method === 'session/load');
    expect(loadEntry).toBeDefined();
    expect(loadEntry?.params?.sessionId).toBe('hermes-uuid-42');
    expect(Array.isArray(loadEntry?.params?.mcpServers)).toBe(true);
    expect((loadEntry?.params?.mcpServers as Array<{ name?: string }>)[0]?.name).toBe('demo');

    // Verify F5: replayed history was suppressed, while live turn 2 output & load-time mode update flowed.
    const textDeltas = events2
      .filter((e) => e.event === 'agent' && e.payload.type === 'text_delta')
      .map((e) => String(e.payload.delta ?? ''))
      .join('');
    expect(textDeltas).toBe('Turn 2 resumed answer from Hermes.');

    const thinkingDeltas = events2
      .filter((e) => e.event === 'agent' && e.payload.type === 'thinking_delta')
      .map((e) => String(e.payload.delta ?? ''))
      .join('');
    expect(thinkingDeltas).toBe('LIVE_TURN2_THOUGHT');

    const toolEvents = events2.filter(
      (e) => e.event === 'agent' && (e.payload.type === 'tool_use' || e.payload.type === 'tool_result'),
    );
    expect(toolEvents).toEqual([]);

    const statusLabels = events2
      .filter((e) => e.event === 'agent' && e.payload.type === 'status')
      .map((e) => String(e.payload.label ?? ''));
    expect(statusLabels).not.toContain('user_message_chunk');
    expect(statusLabels).not.toContain('plan');
    expect(statusLabels).toContain('current_mode_update');
  });

  it('does not persist ACP sessionId as durable when agent does not advertise loadSession', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-acp-noload-'));
    const ledgerPath = path.join(tempDir, 'ledger.jsonl');
    const binPath = await writeStrictHermesStub(tempDir, {
      ledgerPath,
      sessionId: 'ephemeral-id',
      advertiseLoadSession: false,
    });

    const child = spawn(binPath, ['acp', '--accept-hooks'], { stdio: ['pipe', 'pipe', 'pipe'] });
    try {
      const s = attachAcpSession({
        child: child as never,
        prompt: 'hello',
        cwd: tempDir,
        model: 'default',
        mcpServers: [],
        send: () => {},
      });
      await waitForExit(child);
      expect(s.completedSuccessfully()).toBe(true);
      expect(s.getDurableSessionId()).toBeNull();
    } finally {
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  });

  it('reuses Hermes native ACP session across turns end-to-end without duplicating replayed text', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'od-hermes-e2e-'));
    const dataDir = path.join(tempDir, 'data');
    const ledgerPath = path.join(tempDir, 'ledger.jsonl');
    const binPath = await writeStrictHermesStub(tempDir, {
      ledgerPath,
      sessionId: 'hermes-e2e-session-99',
      turn1Reply: 'ALPHA_TURN_ONE_REPLY',
      turn2Reply: 'BETA_TURN_TWO_REPLY',
    });

    process.env.OD_DATA_DIR = dataDir;
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.POSTHOG_API_KEY;

    started = (await startServer({ port: 0, returnServer: true })) as StartedServer;

    const cfgRes = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'hermes',
        agentCliEnv: { hermes: { HERMES_BIN: binPath } },
      }),
    });
    expect(cfgRes.status).toBe(200);

    const projectId = `hermes-resume-${randomUUID().slice(0, 8)}`;
    const projRes = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Hermes Resume Test',
        metadata: { kind: 'prototype' },
        skipDiscoveryBrief: true,
      }),
    });
    expect(projRes.status).toBe(200);
    const projBody = (await projRes.json()) as { id: string; conversationId: string };
    const conversationId = projBody.conversationId;
    expect(conversationId).toBeTruthy();

    const sendTurn = async (message: string): Promise<RunStatus> => {
      const startRes = await fetch(`${started!.url}/api/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          conversationId,
          assistantMessageId: `assistant_hermes_${randomUUID()}`,
          clientRequestId: `client_hermes_${randomUUID()}`,
          message,
          currentPrompt: message,
          agentId: 'hermes',
          model: 'default',
        }),
      });
      const startBody = (await startRes.json()) as { runId?: string };
      expect(startRes.status, JSON.stringify(startBody)).toBe(202);
      const runId = startBody.runId!;
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        const pollRes = await fetch(`${started!.url}/api/runs/${encodeURIComponent(runId)}`);
        expect(pollRes.status).toBe(200);
        const run = (await pollRes.json()) as RunStatus;
        if (['succeeded', 'failed', 'canceled', 'cancelled'].includes(run.status)) {
          return run;
        }
        await new Promise((r) => setTimeout(r, 80));
      }
      throw new Error(`Timed out waiting for run ${runId}`);
    };

    const turn1 = await sendTurn('First prompt');
    expect(turn1.status, JSON.stringify(turn1)).toBe('succeeded');

    const turn2 = await sendTurn('Second prompt');
    expect(turn2.status, JSON.stringify(turn2)).toBe('succeeded');

    // Verify turn 1 called session/new and turn 2 called session/load with the saved handle + mcpServers.
    const ledger = await readLedger(ledgerPath);
    const sessionCalls = ledger
      .filter((entry) => entry.method === 'session/new' || entry.method === 'session/load')
      .map((entry) => entry.method);
    expect(sessionCalls).toEqual(['session/new', 'session/load']);

    const loadCall = ledger.find((entry) => entry.method === 'session/load');
    expect(loadCall?.params?.sessionId).toBe('hermes-e2e-session-99');
    expect(Array.isArray(loadCall?.params?.mcpServers)).toBe(true);

    // Verify promptCache hit on turn 2.
    const state2 = JSON.parse(
      await readFile(path.join(path.dirname(turn2.eventsLogPath), 'state.json'), 'utf8'),
    ) as { promptCache?: { hit?: boolean } };
    expect(state2.promptCache?.hit).toBe(true);

    // Verify assistant message on turn 2 has ONLY turn 2's reply (no replayed turn 1 text).
    const msgRes = await fetch(
      `${started.url}/api/projects/${projectId}/conversations/${conversationId}/messages`,
    );
    expect(msgRes.ok).toBe(true);
    const msgBody = (await msgRes.json()) as {
      messages: Array<{ role: string; content: string }>;
    };
    const assistantMessages = msgBody.messages.filter((m) => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0]?.content).toContain('ALPHA_TURN_ONE_REPLY');
    expect(assistantMessages[1]?.content).toContain('BETA_TURN_TWO_REPLY');
    expect(assistantMessages[1]?.content).not.toContain('ALPHA_TURN_ONE_REPLY');
  }, 30_000);
});
