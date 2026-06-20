import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

type StartedServer = {
  url: string;
  server: http.Server;
  shutdown?: () => Promise<void> | void;
};

type ServerModule = {
  startServer: (options: {
    port: number;
    returnServer: boolean;
  }) => Promise<StartedServer>;
};

type RunStatus = {
  id: string;
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  agentId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  errorCode: string | null;
  eventsLogPath: string;
};

type RunListBody = {
  runs: RunStatus[];
};

describe('daemon startup route smoke', () => {
  let started: StartedServer;
  let dataDir: string;
  const originalDataDir = process.env.OD_DATA_DIR;

  beforeAll(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'od-server-startup-smoke-'));
    process.env.OD_DATA_DIR = dataDir;
    vi.resetModules();
    const { startServer } = await import('../src/server.js') as ServerModule;
    started = await startServer({ port: 0, returnServer: true });
  });

  afterAll(async () => {
    await Promise.resolve(started.shutdown?.());
    await new Promise<void>((resolve) => started.server.close(() => resolve()));
    await rm(dataDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env.OD_DATA_DIR;
    else process.env.OD_DATA_DIR = originalDataDir;
    vi.resetModules();
  });

  it('registers the main app routes on a real daemon boot', async () => {
    const routeChecks: Array<{
      path: string;
      statuses?: number[];
      assert: (body: unknown) => void;
    }> = [
      {
        path: '/api/health',
        assert: (body) => expect(body).toMatchObject({ ok: true }),
      },
      {
        path: '/api/version',
        assert: (body) => expect(body).toMatchObject({
          version: {
            version: expect.any(String),
            channel: expect.any(String),
          },
        }),
      },
      {
        path: '/api/app-config',
        assert: (body) => expect(body).toHaveProperty('config'),
      },
      {
        path: '/api/projects',
        assert: (body) => expect(body).toHaveProperty('projects'),
      },
      {
        path: '/api/routines',
        assert: (body) => expect(body).toHaveProperty('routines'),
      },
      {
        path: '/api/automation-templates',
        assert: (body) => expect(body).toHaveProperty('templates'),
      },
      {
        path: '/api/connectors',
        assert: (body) => expect(body).toHaveProperty('connectors'),
      },
      {
        path: '/api/agents',
        assert: (body) => expect(body).toHaveProperty('agents'),
      },
      {
        path: '/api/amr/models',
        statuses: [200, 500],
        assert: (body) => expect(body).toEqual(expect.any(Object)),
      },
    ];

    await Promise.all(routeChecks.map(async (check) => {
      const response = await fetch(`${started.url}${check.path}`);
      expect(check.statuses ?? [200], check.path).toContain(response.status);
      const body = await response.json();
      check.assert(body);
    }));
  }, 60_000);

  it('keeps core project, conversation, message, and routine write paths wired', async () => {
    const projectId = `startup-write-${Date.now()}`;
    const projectResponse = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Startup write smoke',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(projectResponse.status).toBe(200);
    await expect(projectResponse.json()).resolves.toMatchObject({
      project: { id: projectId, name: 'Startup write smoke' },
    });

    const conversationResponse = await fetch(`${started.url}/api/projects/${projectId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Startup write conversation', sessionMode: 'design' }),
    });
    expect(conversationResponse.status).toBe(200);
    const conversationBody = await conversationResponse.json() as {
      conversation: { id: string; projectId: string; title: string };
    };
    expect(conversationBody).toMatchObject({
      conversation: { projectId, title: 'Startup write conversation' },
    });

    const messageResponse = await fetch(
      `${started.url}/api/projects/${projectId}/conversations/${conversationBody.conversation.id}/messages/startup-message-1`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'startup-message-1',
          role: 'user',
          content: 'Smoke test message',
          createdAt: Date.now(),
        }),
      },
    );
    expect(messageResponse.status).toBe(200);
    await expect(messageResponse.json()).resolves.toMatchObject({
      message: { id: 'startup-message-1', role: 'user', content: 'Smoke test message' },
    });

    const routineResponse = await fetch(`${started.url}/api/routines`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Startup write routine',
        prompt: 'Summarize startup write path health.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
      }),
    });
    expect(routineResponse.status).toBe(201);
    await expect(routineResponse.json()).resolves.toMatchObject({
      routine: {
        name: 'Startup write routine',
        target: { mode: 'create_each_run' },
      },
    });
  });

  it('keeps project file write, read, list, and delete routes wired through the real daemon', async () => {
    const projectId = `startup-files-${Date.now()}`;
    const createProject = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'Startup file smoke',
        skillId: null,
        designSystemId: null,
      }),
    });
    expect(createProject.status).toBe(200);

    const upload = await fetch(`${started.url}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'smoke/index.html',
        content: '<!doctype html><h1>Startup file smoke</h1>',
      }),
    });
    expect(upload.status).toBe(200);
    await expect(upload.json()).resolves.toMatchObject({
      file: {
        name: 'smoke/index.html',
      },
    });

    const list = await fetch(`${started.url}/api/projects/${projectId}/files`);
    expect(list.status).toBe(200);
    const listBody = await list.json() as { files?: Array<{ name?: string; path?: string }> };
    expect(listBody.files ?? []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'smoke/index.html' }),
      ]),
    );

    const raw = await fetch(`${started.url}/api/projects/${projectId}/raw/smoke/index.html`);
    expect(raw.status).toBe(200);
    await expect(raw.text()).resolves.toContain('Startup file smoke');

    const del = await fetch(`${started.url}/api/projects/${projectId}/files/${encodeURIComponent('smoke/index.html')}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(200);
    await expect(del.json()).resolves.toMatchObject({ ok: true });

    const missing = await fetch(`${started.url}/api/projects/${projectId}/raw/smoke/index.html`);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: 'FILE_NOT_FOUND', message: expect.any(String) },
    });
  });

  it('returns structured BAD_REQUEST errors before creating invalid runs', async () => {
    const response = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'startup-invalid-run',
        message: 'This run should be rejected before spawning an agent.',
        toolBundle: 'invalid-tool-bundle',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.stringContaining('toolBundle'),
      },
    });
  });

  it('[P0] creates a legal run, exposes failed status, and keeps the daemon healthy', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'od-startup-run-smoke-bin-'));
    try {
      const claudeBin = await writeFailingClaudeBin(
        binDir,
        'claude-rate-limit',
        [
          'HTTP 429 Too Many Requests: rate limit exceeded by upstream provider.',
          'Retry after 30 seconds.',
        ].join(' '),
      );
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
      });

      const run = await createAndWaitForRun(started.url, {
        caseId: `legal_run_failure_${randomUUID()}`,
        agentId: 'claude',
        message: 'startup legal run failure smoke',
      });

      expect(run).toMatchObject({
        agentId: 'claude',
        status: 'failed',
        exitCode: 1,
        signal: null,
        errorCode: 'RATE_LIMITED',
      });
      expect(run.error ?? '').toMatch(/rate limit|too many requests/i);
      expect(run.eventsLogPath).toEqual(expect.any(String));

      const readable = await fetch(`${started.url}/api/runs/${encodeURIComponent(run.id)}`);
      expect(readable.status).toBe(200);
      await expect(readable.json()).resolves.toMatchObject({
        id: run.id,
        status: 'failed',
        errorCode: 'RATE_LIMITED',
      });

      const health = await fetch(`${started.url}/api/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({ ok: true });
    } finally {
      await clearAgentCliEnv(started.url);
      await rm(binDir, { recursive: true, force: true });
    }
  });

  it('[P0] cancels an active run, exposes canceled status, and keeps the daemon healthy', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'od-startup-cancel-smoke-bin-'));
    try {
      const claudeBin = await writeHangingClaudeBin(binDir, 'claude-hang');
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
      });

      const runId = await createRun(started.url, {
        caseId: `cancel_run_${randomUUID()}`,
        agentId: 'claude',
        message: 'startup cancel run smoke',
      });
      const active = await waitForRunStatus(started.url, runId, (run) =>
        run.status === 'running' || run.status === 'queued',
      );
      expect(active.cancelRequested).toBe(false);

      const cancel = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}/cancel`, {
        method: 'POST',
      });
      expect(cancel.status).toBe(200);
      await expect(cancel.json()).resolves.toMatchObject({
        ok: true,
        run: {
          id: runId,
          status: 'canceled',
          cancelRequested: true,
        },
      });

      const canceled = await fetch(`${started.url}/api/runs/${encodeURIComponent(runId)}`);
      expect(canceled.status).toBe(200);
      await expect(canceled.json()).resolves.toMatchObject({
        id: runId,
        status: 'canceled',
        cancelRequested: true,
      });

      const health = await fetch(`${started.url}/api/health`);
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toMatchObject({ ok: true });
    } finally {
      await clearAgentCliEnv(started.url);
      await rm(binDir, { recursive: true, force: true });
    }
  });

  it('[P0] lists active runs and removes them from the active view after terminal states', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'od-startup-active-runs-bin-'));
    try {
      const claudeBin = await writeHangingClaudeBin(binDir, 'claude-active');
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
      });

      const firstRunId = await createRun(started.url, {
        caseId: `active_run_a_${randomUUID()}`,
        agentId: 'claude',
        message: 'startup active run smoke one',
      });
      const secondRunId = await createRun(started.url, {
        caseId: `active_run_b_${randomUUID()}`,
        agentId: 'claude',
        message: 'startup active run smoke two',
      });

      await waitForRunStatus(started.url, firstRunId, (run) =>
        run.status === 'running' || run.status === 'queued',
      );
      await waitForRunStatus(started.url, secondRunId, (run) =>
        run.status === 'running' || run.status === 'queued',
      );

      const activeBefore = await listRuns(started.url, 'active');
      expect(activeBefore.map((run) => run.id)).toEqual(
        expect.arrayContaining([firstRunId, secondRunId]),
      );

      await cancelRun(started.url, firstRunId);
      await cancelRun(started.url, secondRunId);

      await expect.poll(async () => {
        const activeAfter = await listRuns(started.url, 'active');
        return activeAfter.map((run) => run.id);
      }, { timeout: 10_000 }).not.toEqual(expect.arrayContaining([firstRunId, secondRunId]));
    } finally {
      await clearAgentCliEnv(started.url);
      await rm(binDir, { recursive: true, force: true });
    }
  });

  it('[P0] replays run SSE events after Last-Event-ID and still emits the terminal event', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'od-startup-sse-replay-bin-'));
    try {
      const claudeBin = await writeSuccessfulClaudeBin(binDir, 'claude-sse-replay');
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
      });

      const runId = await createRun(started.url, {
        caseId: `sse_replay_${randomUUID()}`,
        agentId: 'claude',
        message: 'startup sse replay smoke',
      });
      await waitForRun(started.url, runId);

      const firstReplay = await readRunSse(started.url, runId);
      expect(firstReplay).toContain('event: start');
      expect(firstReplay).toContain('event: end');
      const firstIds = sseIds(firstReplay);
      expect(firstIds.length).toBeGreaterThan(1);
      const startId = sseEventId(firstReplay, 'start');
      expect(startId).toBeGreaterThan(0);

      const replayAfterStart = await readRunSse(started.url, runId, startId);
      expect(replayAfterStart).not.toContain('event: start');
      expect(replayAfterStart).toContain('event: end');

      const replayAtTerminalCursor = await readRunSse(started.url, runId, firstIds.at(-1));
      expect(replayAtTerminalCursor).toContain('event: end');
    } finally {
      await clearAgentCliEnv(started.url);
      await rm(binDir, { recursive: true, force: true });
    }
  });
});

async function putAppConfig(url: string, patch: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  expect(response.status).toBe(200);
}

async function clearAgentCliEnv(url: string): Promise<void> {
  await putAppConfig(url, { agentCliEnv: null, agentId: null });
}

async function createAndWaitForRun(url: string, input: {
  caseId: string;
  agentId: string;
  message: string;
}): Promise<RunStatus> {
  const runId = await createRun(url, input);
  return await waitForRun(url, runId);
}

async function createRun(url: string, input: {
  caseId: string;
  agentId: string;
  message: string;
}): Promise<string> {
  const projectId = `startup-run-${input.caseId}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `Startup run smoke ${input.caseId}`,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  const assistantMessageId = `assistant-${input.caseId}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId,
      conversationId: projectBody.conversationId,
      assistantMessageId,
      clientRequestId: `client-${input.caseId}`,
      agentId: input.agentId,
      message: input.message,
      currentPrompt: input.message,
    }),
  });
  expect(runResponse.status).toBe(202);
  const runBody = await runResponse.json() as { runId: string };
  return runBody.runId;
}

async function waitForRun(url: string, runId: string): Promise<RunStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus;
    if (run.status === 'failed' || run.status === 'succeeded' || run.status === 'canceled') {
      return run;
    }
    await delay(100);
  }
  throw new Error(`run ${runId} did not finish`);
}

async function waitForRunStatus(
  url: string,
  runId: string,
  predicate: (run: RunStatus & { cancelRequested?: boolean }) => boolean,
): Promise<RunStatus & { cancelRequested?: boolean }> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
    expect(response.status).toBe(200);
    const run = await response.json() as RunStatus & { cancelRequested?: boolean };
    if (predicate(run)) return run;
    await delay(100);
  }
  throw new Error(`run ${runId} did not reach the expected status`);
}

async function listRuns(url: string, status: string): Promise<RunStatus[]> {
  const response = await fetch(`${url}/api/runs?status=${encodeURIComponent(status)}`);
  expect(response.status).toBe(200);
  const body = await response.json() as RunListBody;
  return body.runs;
}

async function cancelRun(url: string, runId: string): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { run: RunStatus };
  return body.run;
}

async function writeFailingClaudeBin(dir: string, name: string, stderr: string): Promise<string> {
  const bin = join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude 0.0.0-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
process.stderr.write(${JSON.stringify(stderr)});
process.exit(1);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function writeHangingClaudeBin(dir: string, name: string): Promise<string> {
  const bin = join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude 0.0.0-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
setInterval(() => {}, 1000);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function writeSuccessfulClaudeBin(dir: string, name: string): Promise<string> {
  const bin = join(dir, name);
  await writeFile(bin, `#!/usr/bin/env node
if (process.argv.includes('--version')) {
  console.log('claude 0.0.0-smoke');
  process.exit(0);
}
if (process.argv.includes('--help')) {
  console.log('Usage: claude -p [--include-partial-messages] [--add-dir DIR]');
  process.exit(0);
}
console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sse-smoke' }));
console.log(JSON.stringify({
  type: 'assistant',
  message: {
    id: 'msg-sse-smoke',
    content: [{ type: 'text', text: 'SSE replay smoke complete.' }],
    stop_reason: 'end_turn'
  }
}));
setTimeout(() => process.exit(0), 20);
`, 'utf8');
  await chmod(bin, 0o755);
  return bin;
}

async function readRunSse(url: string, runId: string, lastEventId?: number): Promise<string> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/events`, {
    headers: lastEventId === undefined ? {} : { 'Last-Event-ID': String(lastEventId) },
  });
  expect(response.status).toBe(200);
  return await response.text();
}

function sseIds(body: string): number[] {
  return body
    .split(/\r?\n/u)
    .map((line) => /^id:\s*(\d+)$/u.exec(line)?.[1])
    .filter((id): id is string => Boolean(id))
    .map((id) => Number(id));
}

function sseEventId(body: string, eventName: string): number {
  let currentId = 0;
  for (const line of body.split(/\r?\n/u)) {
    const id = /^id:\s*(\d+)$/u.exec(line)?.[1];
    if (id) currentId = Number(id);
    if (line === `event: ${eventName}`) return currentId;
  }
  return 0;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
