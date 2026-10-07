import assert from 'node:assert/strict';
import { Server } from 'node:http';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { startServer } from '../../../src/server.js';
import { closeDatabase, getAgentSessionRecord, openDatabase } from '../../../src/db.js';
import type { DshProfileExecuteCommand } from '../../../src/agent-protocol/dsh-profile/types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  assert(isRecord(value));
  return value;
}

type GenerationServerFixture = {
  readonly db: Database.Database;
  readonly statePath: string;
  readonly conversationId: string;
  state(extra?: Record<string, unknown>): void;
  session(): ReturnType<typeof getAgentSessionRecord>;
  commands(): DshProfileExecuteCommand[];
  turn(extra?: Record<string, unknown>): Promise<{
    runId: string;
    taskExecutionId: string | undefined;
    status: Record<string, unknown>;
    events: string;
  }>;
  close(): Promise<void>;
};

export async function generationServer(strategy = false): Promise<GenerationServerFixture> {
  const directory = mkdtempSync(path.join(tmpdir(), 'od-dsh-recovery-'));
  const statePath = path.join(directory, 'state.json');
  const fixture = path.resolve('tests/fixtures/dsh-profile/generation-dsh.ts');
  const bin = path.join(directory, process.platform === 'win32' ? 'dsh.cmd' : 'dsh');
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  writeFileSync(bin, process.platform === 'win32'
    ? '@echo off\r\n"' + process.execPath + '" "' + fixture + '" %*\r\n'
    : '#!/bin/sh\nexec ' + quote(process.execPath) + ' ' + quote(fixture) + ' "$@"\n');
  chmodSync(bin, 0o700);
  const state = (extra: Record<string, unknown> = {}) =>
    writeFileSync(statePath, JSON.stringify({ generation: 'generation-1', ...extra }));
  state(strategy ? { question: true } : {});
  // Real child stalls exercise the daemon watchdog; this is its existing retry-fixture budget.
  vi.stubEnv('OD_CHAT_RUN_INACTIVITY_TIMEOUT_MS', '3000');
  vi.stubEnv('DSH_BIN', bin);
  vi.stubEnv('DSH_HOME', directory);
  vi.stubEnv('OD_DSH_GENERATION_STATE', statePath);
  vi.stubEnv('OD_NEXT_STRATEGY_ROLLOUT', strategy ? 'active' : 'off');
  vi.stubEnv('OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY', '1');
  vi.stubEnv('OD_NEXT_STRATEGY_AGENTS', 'deepseek-harness');
  mkdirSync(path.join(directory, 'profiles/open-design'), { recursive: true });
  writeFileSync(path.join(directory, 'profiles/open-design/package.json'), '{}');
  const runtime = await startServer({ port: 0, returnServer: true });
  assert(isRecord(runtime));
  const { url, server, shutdown } = runtime;
  assert(typeof url === 'string' && server instanceof Server && typeof shutdown === 'function');
  async function post(route: string, body: object, method = 'POST') {
    const response = await fetch(url + route, {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
    return json(response);
  }
  await post('/api/app-config', {
    agentId: 'deepseek-harness', agentCliEnv: {
      'deepseek-harness': { DSH_BIN: bin, OD_DSH_GENERATION_STATE: statePath },
    },
    telemetry: { metrics: false, content: false, artifactManifest: false },
    privacyDecisionAt: Date.now(),
  }, 'PUT');
  const projectId = 'generation_' + randomUUID();
  const project = await post('/api/projects', {
    id: projectId, name: 'Generation recovery', metadata: { kind: 'prototype' },
    conversationMode: strategy ? 'design' : 'chat',
    ...(strategy ? { automaticStrategyTaskProfile: 'prototype' } : {}),
    skipDiscoveryBrief: true,
  });
  const conversationId = project.conversationId;
  assert(typeof conversationId === 'string');
  const dataDir = process.env.OD_DATA_DIR;
  assert(dataDir);
  const db: Database.Database = openDatabase(process.cwd(), { dataDir });
  return {
    db, state, statePath, conversationId,
    session: () => getAgentSessionRecord(db, conversationId, 'deepseek-harness'),
    commands: (): DshProfileExecuteCommand[] => readFileSync(statePath + '.commands', 'utf8')
      .trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
    async turn(extra: Record<string, unknown> = {}) {
      const run = await post('/api/runs', {
        projectId, conversationId, assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
        agentId: 'deepseek-harness', message: 'HISTORY_SENTINEL\nCURRENT_SENTINEL',
        currentPrompt: 'CURRENT_SENTINEL', ...extra,
      });
      const runId = run.runId;
      assert(typeof runId === 'string');
      const taskExecutionId = typeof run.taskExecutionId === 'string' ? run.taskExecutionId : undefined;
      // Completion is the actual SSE terminal/child-close boundary, with a failure budget.
      const response = await fetch(url + '/api/runs/' + runId + '/events', { signal: AbortSignal.timeout(10_000) });
      expect(response.status).toBe(200);
      const events = await response.text();
      const status = await json(await fetch(url + '/api/runs/' + runId));
      return { runId, taskExecutionId, status, events };
    },
    async close() {
      await shutdown();
      await new Promise<void>(resolve => server.close(() => resolve()));
      closeDatabase();
      rmSync(directory, { recursive: true, force: true });
      vi.unstubAllEnvs();
    },
  };
}
