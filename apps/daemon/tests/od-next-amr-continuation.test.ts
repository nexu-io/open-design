/**
 * Compaction-continuation recovery on the OD Next rounds that start a new
 * process or a new task, through the full daemon and a fake `vela`.
 *
 * The same-Run recovery (`decidePostToolResumeRecovery` → `_session/continue`)
 * is keyed on the Run's own live durable session and the runtime's advertised
 * continuation capability. It does not look at which round of which task the
 * Run is, so the three rounds this file drives must converge exactly like a
 * plain chat turn does: one interruption after a committed tool write, one
 * continuation in the same durable session with no prompt, one final reply,
 * and a task that settles on the recovered Run.
 *
 * - cold-start build round: the planning round leaves no durable handle, so
 *   the daemon starts the build round as a fresh process on a Bundle;
 * - form-answer round: the first task settles on its question, the answer
 *   opens a new task whose first round continues the session;
 * - retry round: the first task blocks on a failed Run, the user's retry opens
 *   a new task in the same conversation.
 */
import type { Server } from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StrategyTaskProjectionV2 } from '@open-design/contracts';

import { startServer } from '../src/server.js';

type StartedServer = { url: string; server: Server; shutdown?: () => Promise<void> | void };
type RunStatus = {
  id: string;
  status: string;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
  strategyTask?: StrategyTaskProjectionV2;
};
type RunEvent = { event: string; data: Record<string, unknown> };
type LedgerRow = {
  method: string;
  pid: number;
  index?: number;
  prompt?: string;
  durable?: boolean;
  hasPrompt?: boolean;
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'fake-vela-od-next-continuation.ts');
const ENV_KEYS = [
  'LANGFUSE_PUBLIC_KEY', 'LANGFUSE_SECRET_KEY', 'LANGFUSE_BASE_URL', 'OPEN_DESIGN_TELEMETRY_RELAY_URL',
  'POSTHOG_KEY', 'POSTHOG_HOST', 'OD_NEXT_STRATEGY_ROLLOUT', 'OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY',
] as const;

describe('OD Next rounds recover a compaction continuation on AMR', () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  let started: StartedServer | null = null;
  let binDir: string | null = null;

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
  });

  afterEach(async () => {
    await Promise.resolve(started?.shutdown?.());
    if (started?.server) {
      await new Promise<void>((resolve) => started?.server.close(() => resolve()));
    }
    started = null;
    if (binDir) await rm(binDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    binDir = null;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  async function startWithScenario(scenario: 'cold-build' | 'answer' | 'retry') {
    binDir = await mkdtemp(path.join(os.tmpdir(), `od-next-amr-${scenario}-`));
    const bin = path.join(binDir, 'vela');
    const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
    await writeFile(bin, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(FIXTURE)} ${quote(scenario)} ${quote(binDir)} "$@"\n`);
    await chmod(bin, 0o755);
    started = await startServer({ port: 0, returnServer: true }) as StartedServer;
    const config = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'amr',
        agentCliEnv: {
          amr: {
            VELA_BIN: bin,
            VELA_RUNTIME_KEY: 'rt-od-next-amr-continuation-test',
            VELA_LINK_URL: 'https://amr-link.example.test/v1',
          },
        },
        telemetry: { metrics: false, content: false, artifactManifest: false },
        privacyDecisionAt: Date.now(),
      }),
    });
    expect(config.status).toBe(200);
    // Populates the runtime inventory the OD Next admission reads.
    expect((await fetch(`${started.url}/api/agents`)).status).toBe(200);
    return { ledgerPath: path.join(binDir, 'ledger.jsonl') };
  }

  async function createOdNextProject() {
    const projectId = `od-next-amr-${randomUUID()}`;
    const workspaceId = `od-next-amr-personal-${projectId}`;
    const workspaceMemberId = `od-next-amr-owner-${projectId}`;
    const headers = {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-type': 'personal',
      'x-od-workspace-member-id': workspaceMemberId,
      'x-od-workspace-role': 'owner',
    };
    const response = await fetch(`${started!.url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({
        id: projectId,
        name: 'OD Next AMR continuation',
        metadata: { kind: 'prototype' },
        conversationMode: 'design',
        automaticStrategyTaskProfile: 'prototype',
        skipDiscoveryBrief: true,
      }),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as {
      conversationId: string;
      project?: { metadata?: { strategyBinding?: unknown } };
    };
    expect(body.project?.metadata?.strategyBinding).toMatchObject({ taskProfile: 'prototype' });
    return { projectId, conversationId: body.conversationId, headers };
  }

  async function postRun(project: Awaited<ReturnType<typeof createOdNextProject>>, message: string) {
    const response = await fetch(`${started!.url}/api/runs`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-od-analytics-device-id': 'od-next-amr-test',
        'x-od-analytics-session-id': 'od-next-amr-session',
        'x-od-analytics-client-type': 'web',
        ...project.headers,
      },
      body: JSON.stringify({
        projectId: project.projectId,
        conversationId: project.conversationId,
        assistantMessageId: `assistant_${randomUUID()}`,
        clientRequestId: `client_${randomUUID()}`,
        agentId: 'amr',
        message,
        currentPrompt: message,
      }),
    });
    const body = await response.json() as {
      runId?: string;
      taskExecutionId?: string;
      strategyTask?: StrategyTaskProjectionV2;
      error?: unknown;
    };
    expect(response.status, JSON.stringify(body)).toBe(202);
    expect(body.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    return body as { runId: string; taskExecutionId: string };
  }

  async function getRun(project: { headers: Record<string, string> }, runId: string): Promise<RunStatus> {
    const response = await fetch(`${started!.url}/api/runs/${encodeURIComponent(runId)}`, { headers: project.headers });
    expect(response.status).toBe(200);
    return await response.json() as RunStatus;
  }

  async function waitForTerminalTask(project: { headers: Record<string, string> }, runId: string) {
    const deadline = Date.now() + 25_000;
    let latest: RunStatus | null = null;
    while (Date.now() < deadline) {
      latest = await getRun(project, runId);
      if (latest.strategyTask?.terminal) return latest;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`task on run ${runId} did not settle: ${JSON.stringify(latest)}`);
  }

  async function taskRuns(project: { projectId: string; headers: Record<string, string> }, taskExecutionId: string) {
    const response = await fetch(
      `${started!.url}/api/runs?projectId=${encodeURIComponent(project.projectId)}`,
      { headers: project.headers },
    );
    const body = await response.json() as { runs: RunStatus[] };
    return body.runs.filter((run) => run.strategyTask?.taskExecutionId === taskExecutionId);
  }

  async function readLedger(ledgerPath: string): Promise<LedgerRow[]> {
    const raw = await readFile(ledgerPath, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as LedgerRow);
  }

  async function readRunEvents(run: RunStatus): Promise<RunEvent[]> {
    const raw = await readFile(run.eventsLogPath, 'utf8');
    return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as RunEvent);
  }

  /** The round that was interrupted converged in one continuation and its task settled on it. */
  async function expectRecoveredRound(
    project: { headers: Record<string, string> },
    run: RunStatus,
    ledger: LedgerRow[],
  ) {
    expect(run.status, JSON.stringify(run)).toBe('succeeded');
    const continues = ledger.filter((row) => row.method === '_session/continue');
    expect(continues).toHaveLength(1);
    expect(continues[0]).toMatchObject({ loaded: true, previousAlive: false, hasPrompt: false });
    const events = await readRunEvents(run);
    expect(events.filter((event) => event.event === 'run_retry_attempted')).toHaveLength(1);
    expect(events.find((event) => event.event === 'run_retry_finished')?.data).toMatchObject({
      retry_result: 'success',
    });
    expect(events.filter((event) => event.event === 'end')).toHaveLength(1);
    expect(events.some((event) => (
      event.event === 'diagnostic' && event.data.type === 'agent_resume_auto_reseed'
    ))).toBe(false);
    expect((await getRun(project, run.id)).strategyTask).toMatchObject({
      outcome: 'completed',
      terminal: true,
      settlementReason: 'deliverable_changed',
      deliverableWritten: true,
    });
  }

  it('recovers the cold-start build round in the session that round opened', async () => {
    const { ledgerPath } = await startWithScenario('cold-build');
    const project = await createOdNextProject();
    const created = await postRun(project, 'Build a landing page for the launch.');
    const settled = await waitForTerminalTask(project, created.runId);
    expect(settled.strategyTask).toMatchObject({ inputStage: 'production', autoRoundCount: 1 });

    const runs = await taskRuns(project, created.taskExecutionId);
    expect(runs).toHaveLength(2);
    const buildRun = runs.find((run) => run.id !== created.runId)!;
    const ledger = await readLedger(ledgerPath);
    // Planning round: a fresh session with no durable handle; build round: a
    // fresh process again, on a Bundle whose transcript carries the plan.
    expect(ledger.filter((row) => row.method === 'session/new').map((row) => row.durable)).toEqual([false, true]);
    const prompts = ledger.filter((row) => row.method === 'session/prompt');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]!.prompt).toContain('# OD Next build round');
    expect(prompts[1]!.prompt).toContain('The plan is ready: one landing page in index.html.');
    // The continuation reloads the build round's own session; the planning
    // round is never replayed.
    expect(ledger.filter((row) => row.method === 'session/load')).toHaveLength(1);
    await expectRecoveredRound(project, buildRun, ledger);
    expect(await readFile(path.join(binDir!, 'tool-executions'), 'utf8')).toBe('write\n');
  }, 60_000);

  it('recovers the form-answer round without asking the question again', async () => {
    const { ledgerPath } = await startWithScenario('answer');
    const project = await createOdNextProject();
    const asked = await postRun(project, 'Build a landing page for the launch.');
    const first = await waitForTerminalTask(project, asked.runId);
    expect(first.strategyTask).toMatchObject({
      outcome: 'completed',
      settlementReason: 'question',
      deliverableWritten: false,
    });

    const answered = await postRun(project, '[form answers — od-next-amr-platform]\n- Target platform: Desktop web');
    expect(answered.taskExecutionId).not.toBe(asked.taskExecutionId);
    const second = await waitForTerminalTask(project, answered.runId);
    const ledger = await readLedger(ledgerPath);
    const prompts = ledger.filter((row) => row.method === 'session/prompt');
    expect(prompts).toHaveLength(2);
    // The answered round continues the conversation's session (one load for
    // the round, one for the continuation) and carries the answer.
    expect(ledger.filter((row) => row.method === 'session/load')).toHaveLength(2);
    expect(prompts[1]!.prompt).toContain('[form answers — od-next-amr-platform]');
    // The session already holds the question; the resumed first round drops
    // the prior transcript rather than repeating the form markup.
    expect(prompts[1]!.prompt).not.toContain('<question-form id="od-next-amr-platform"');
    await expectRecoveredRound(project, second, ledger);
    expect((await taskRuns(project, answered.taskExecutionId))).toHaveLength(1);
  }, 60_000);

  it('recovers the retry round the user opens after a failed first task', async () => {
    const { ledgerPath } = await startWithScenario('retry');
    const project = await createOdNextProject();
    const failed = await postRun(project, 'Build a landing page for the launch.');
    const first = await waitForTerminalTask(project, failed.runId);
    expect(first.status).toBe('failed');
    expect(first.strategyTask).toMatchObject({ outcome: 'blocked', terminal: true });

    const retried = await postRun(project, 'Build a landing page for the launch.');
    expect(retried.taskExecutionId).not.toBe(failed.taskExecutionId);
    const second = await waitForTerminalTask(project, retried.runId);
    const ledger = await readLedger(ledgerPath);
    expect(ledger.filter((row) => row.method === 'session/prompt')).toHaveLength(2);
    await expectRecoveredRound(project, second, ledger);
    expect((await taskRuns(project, retried.taskExecutionId))).toHaveLength(1);
  }, 60_000);
});
