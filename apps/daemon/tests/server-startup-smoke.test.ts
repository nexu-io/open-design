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

type RunResultPackageBody = {
  schema: string;
  run: {
    id: string;
    status: string;
    projectId: string;
    error?: string | null;
    errorCode?: string | null;
    cancelRequested?: boolean;
    signal?: string | null;
  };
  events: {
    logPath: string | null;
  };
  artifacts: Array<unknown>;
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
    await rmRecursiveWithRetry(dataDir);
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

  it('[P1] result packages preserve failed and canceled terminal status without inventing artifacts', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'od-startup-result-package-bin-'));
    try {
      const failingClaude = await writeFailingClaudeBin(
        binDir,
        'claude-result-package-fail',
        'HTTP 429 Too Many Requests: result package failure smoke.',
      );
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: failingClaude } },
      });
      const failedRun = await createAndWaitForRun(started.url, {
        caseId: `result_package_failed_${randomUUID()}`,
        agentId: 'claude',
        message: 'result package failed run smoke',
      });

      const failedPackage = await fetchResultPackage(started.url, failedRun.id);
      expect(failedPackage).toMatchObject({
        schema: 'open-design.run-result-package.v1',
        run: {
          id: failedRun.id,
          status: 'failed',
          projectId: failedRun.projectId,
          errorCode: 'RATE_LIMITED',
        },
        events: {
          logPath: expect.any(String),
        },
      });
      expect(failedPackage.run.error ?? '').toMatch(/rate limit|too many requests/i);
      expect(failedPackage.artifacts).toEqual([]);

      const hangingClaude = await writeHangingClaudeBin(binDir, 'claude-result-package-cancel');
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: hangingClaude } },
      });
      const canceledRunId = await createRun(started.url, {
        caseId: `result_package_canceled_${randomUUID()}`,
        agentId: 'claude',
        message: 'result package canceled run smoke',
      });
      await waitForRunStatus(started.url, canceledRunId, (run) =>
        run.status === 'running' || run.status === 'queued',
      );
      await cancelRun(started.url, canceledRunId);

      const canceledPackage = await fetchResultPackage(started.url, canceledRunId);
      expect(canceledPackage).toMatchObject({
        schema: 'open-design.run-result-package.v1',
        run: {
          id: canceledRunId,
          status: 'canceled',
          cancelRequested: true,
          signal: expect.any(String),
        },
        events: {
          logPath: expect.any(String),
        },
      });
      expect(canceledPackage.run.errorCode ?? null).toBeNull();
      expect(canceledPackage.artifacts).toEqual([]);
    } finally {
      await clearAgentCliEnv(started.url);
      await rm(binDir, { recursive: true, force: true });
    }
  });

  it('[P1] filters runs by project, conversation, and lifecycle status together', async () => {
    const binDir = await mkdtemp(join(tmpdir(), 'od-startup-run-filters-bin-'));
    const activeRunIds: string[] = [];
    try {
      const failingClaude = await writeFailingClaudeBin(
        binDir,
        'claude-filter-fail',
        'HTTP 429 Too Many Requests: filter failure smoke.',
      );
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: failingClaude } },
      });

      const primaryProject = await createProject(started.url, `run_filters_primary_${randomUUID()}`);
      const primaryFollowupConversationId = await createConversation(
        started.url,
        primaryProject.projectId,
        'Run filter follow-up',
      );
      const secondaryProject = await createProject(started.url, `run_filters_secondary_${randomUUID()}`);

      const failedRunId = await createRunForProject(started.url, {
        caseId: `run_filter_failed_${randomUUID()}`,
        projectId: primaryProject.projectId,
        conversationId: primaryProject.conversationId,
        agentId: 'claude',
        message: 'run filter failed smoke',
      });
      const failedRun = await waitForRun(started.url, failedRunId);
      expect(failedRun.status).toBe('failed');

      const hangingClaude = await writeHangingClaudeBin(binDir, 'claude-filter-active');
      await putAppConfig(started.url, {
        agentId: 'claude',
        agentCliEnv: { claude: { CLAUDE_BIN: hangingClaude } },
      });
      const primaryActiveRunId = await createRunForProject(started.url, {
        caseId: `run_filter_primary_active_${randomUUID()}`,
        projectId: primaryProject.projectId,
        conversationId: primaryFollowupConversationId,
        agentId: 'claude',
        message: 'run filter active primary smoke',
      });
      activeRunIds.push(primaryActiveRunId);
      const secondaryActiveRunId = await createRunForProject(started.url, {
        caseId: `run_filter_secondary_active_${randomUUID()}`,
        projectId: secondaryProject.projectId,
        conversationId: secondaryProject.conversationId,
        agentId: 'claude',
        message: 'run filter active secondary smoke',
      });
      activeRunIds.push(secondaryActiveRunId);

      await waitForRunStatus(started.url, primaryActiveRunId, (run) =>
        run.status === 'running' || run.status === 'queued',
      );
      await waitForRunStatus(started.url, secondaryActiveRunId, (run) =>
        run.status === 'running' || run.status === 'queued',
      );

      await expectRunIds(
        started.url,
        {
          projectId: primaryProject.projectId,
          conversationId: primaryProject.conversationId,
          status: 'failed',
        },
        [failedRunId],
      );
      await expectRunIds(
        started.url,
        {
          projectId: primaryProject.projectId,
          conversationId: primaryFollowupConversationId,
          status: 'active',
        },
        [primaryActiveRunId],
      );
      await expectRunIds(
        started.url,
        {
          projectId: primaryProject.projectId,
          status: 'active',
        },
        [primaryActiveRunId],
      );
      await expectRunIds(
        started.url,
        {
          projectId: secondaryProject.projectId,
          status: 'active',
        },
        [secondaryActiveRunId],
      );
      await expectRunIds(
        started.url,
        {
          projectId: primaryProject.projectId,
          conversationId: primaryProject.conversationId,
          status: 'active',
        },
        [],
      );
    } finally {
      await Promise.all(activeRunIds.map((runId) => cancelRun(started.url, runId).catch(() => null)));
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

async function createProject(url: string, caseId: string): Promise<{
  projectId: string;
  conversationId: string;
}> {
  const projectId = `startup-run-${caseId}`;
  const projectResponse = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `Startup run smoke ${caseId}`,
      metadata: { kind: 'prototype' },
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const projectBody = await projectResponse.json() as { conversationId: string };
  return { projectId, conversationId: projectBody.conversationId };
}

async function createConversation(url: string, projectId: string, title: string): Promise<string> {
  const response = await fetch(`${url}/api/projects/${encodeURIComponent(projectId)}/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, sessionMode: 'design' }),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as { conversation: { id: string } };
  return body.conversation.id;
}

async function createRun(url: string, input: {
  caseId: string;
  agentId: string;
  message: string;
}): Promise<string> {
  const project = await createProject(url, input.caseId);
  return await createRunForProject(url, {
    ...input,
    projectId: project.projectId,
    conversationId: project.conversationId,
  });
}

async function createRunForProject(url: string, input: {
  caseId: string;
  projectId: string;
  conversationId: string;
  agentId: string;
  message: string;
}): Promise<string> {
  const assistantMessageId = `assistant-${input.caseId}`;
  const runResponse = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      projectId: input.projectId,
      conversationId: input.conversationId,
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
  return await listRunsWithFilters(url, { status });
}

async function listRunsWithFilters(url: string, filters: {
  projectId?: string;
  conversationId?: string;
  status?: string;
}): Promise<RunStatus[]> {
  const params = new URLSearchParams();
  if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.conversationId) params.set('conversationId', filters.conversationId);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  const response = await fetch(`${url}/api/runs${query ? `?${query}` : ''}`);
  expect(response.status).toBe(200);
  const body = await response.json() as RunListBody;
  return body.runs;
}

async function expectRunIds(
  url: string,
  filters: {
    projectId?: string;
    conversationId?: string;
    status?: string;
  },
  expectedIds: string[],
): Promise<void> {
  const runs = await listRunsWithFilters(url, filters);
  expect(runs.map((run) => run.id).sort()).toEqual([...expectedIds].sort());
}

async function fetchResultPackage(url: string, runId: string): Promise<RunResultPackageBody> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}/result-package`);
  expect(response.status).toBe(200);
  return await response.json() as RunResultPackageBody;
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

async function rmRecursiveWithRetry(target: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY' || attempt === 4) {
        throw error;
      }
      await delay(100 * (attempt + 1));
    }
  }
}
