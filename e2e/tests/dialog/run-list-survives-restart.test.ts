// @vitest-environment node

// OPEND-2629 — the per-project run list must survive a full daemon restart.
//
// Symptom from the work item: after fully quitting and relaunching the daemon
// over the same data directory, `GET /api/runs?projectId=<id>` returned only
// the subset of that project's persisted runs that happened to be hydrated
// into memory (or none at all). The Home entry rail (PR #7730) folds that feed
// into one status per project, so an older `failed` run outranked a newer
// `succeeded` one, and a project blocked on an unanswered `<question-form>`
// lost its `awaiting_input` flag because `awaitingInputProjectIds` is
// intersected with the projects the returned runs reveal.
//
// This spec exercises the daemon HTTP contract across the restart boundary:
// every persisted run of the queried project comes back, and the awaiting set
// still names the project, so the same fold gives the same answer before and
// after the restart.

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { requestJson } from '@/vitest/http';
import { saveMessage } from '@/vitest/messages';
import { startRun, waitForRunTerminal, type ChatRunStatusBody } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectResponse = {
  conversationId: string;
  project: { id: string; name: string };
};

type RunsListResponse = {
  runs: ChatRunStatusBody[];
  awaitingInputProjectIds: string[];
};

/** Same shape the daemon's own awaiting-input detector accepts as renderable. */
const RENDERABLE_FORM =
  'Which direction? <question-form>{"questions":[{"id":"dir","label":"Direction?"}]}</question-form>';

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

describe('project run list survives daemon restart', () => {
  test('failed→succeeded history and an unanswered question-form fold the same before and after restart', async () => {
    const externalRoot = await mkdtemp(join(tmpdir(), 'od-run-list-restart-e2e-'));
    const sharedDataDir = join(externalRoot, 'daemon-data');
    // The fake agent binaries live outside either suite's scratch dir: a
    // successful suite removes its scratch dir, and the restarted daemon still
    // reads the persisted agent env that points at them.
    const fakeAgents = await createFakeAgentRuntimes({
      root: join(externalRoot, 'fake-agents'),
      runtimeIds: ['codex'],
    });

    let retriedProjectId = '';
    let failedRunId = '';
    let succeededRunId = '';
    let askingProjectId = '';
    let askingRunId = '';

    try {
      const first = await createSmokeSuite('run-list-restart-first', { dataDir: sharedDataDir });
      await first.with.toolsDev(async ({ webUrl }) => {
        await requestJson<{ config: Record<string, unknown> }>(webUrl, '/api/app-config', {
          body: {
            agentCliEnv: { codex: fakeAgents.codex.env },
            agentId: 'codex',
            agentModels: { codex: { model: 'default', reasoning: 'default' } },
            designSystemId: null,
            onboardingCompleted: true,
            skillId: null,
            telemetry: { artifactManifest: true, content: false, metrics: false },
          },
          method: 'PUT',
        });

        // Project 1: an older failed run, then a newer succeeded run.
        const retried = await createProject(webUrl, 'Run list restart: retried');
        retriedProjectId = retried.project.id;
        const failedRun = await runToTerminal(
          webUrl,
          retried,
          'Return an intentional daemon smoke failure',
        );
        expect(failedRun.status).toBe('failed');
        failedRunId = failedRun.id;
        const succeededRun = await runToTerminal(
          webUrl,
          retried,
          'Create a deterministic smoke artifact',
        );
        expect(succeededRun.status).toBe('succeeded');
        succeededRunId = succeededRun.id;
        expect(succeededRun.updatedAt).toBeGreaterThan(failedRun.updatedAt);

        // Project 2: a succeeded run whose conversation ends on an unanswered
        // renderable question form.
        const asking = await createProject(webUrl, 'Run list restart: asking');
        askingProjectId = asking.project.id;
        const askingRun = await runToTerminal(
          webUrl,
          asking,
          'Create a deterministic smoke artifact',
        );
        expect(askingRun.status).toBe('succeeded');
        askingRunId = askingRun.id;
        await saveMessage(webUrl, asking.project.id, asking.conversationId, {
          agentId: 'codex',
          agentName: 'Codex',
          content: RENDERABLE_FORM,
          createdAt: Date.now(),
          id: `assistant-ask-${Date.now()}`,
          role: 'assistant',
          runStatus: 'succeeded',
        });

        // Baseline: the live daemon already answers correctly.
        await expectProjectRunList(webUrl, {
          askingProjectId,
          askingRunId,
          failedRunId,
          retriedProjectId,
          succeededRunId,
        });
      });

      // Full restart over the same persisted data. Nothing in memory survives
      // this boundary, so the project-scoped list must be rebuilt from the
      // durable run history instead of from whatever happened to be loaded.
      const restarted = await createSmokeSuite('run-list-restart-restarted', {
        dataDir: sharedDataDir,
      });
      await restarted.with.toolsDev(async ({ webUrl }) => {
        await expectProjectRunList(webUrl, {
          askingProjectId,
          askingRunId,
          failedRunId,
          retriedProjectId,
          succeededRunId,
        });
      });
    } finally {
      await rm(externalRoot, { force: true, recursive: true });
    }
  }, 300_000);
});

async function createProject(webUrl: string, name: string): Promise<ProjectResponse> {
  return await requestJson<ProjectResponse>(webUrl, '/api/projects', {
    body: {
      designSystemId: null,
      id: randomUUID(),
      metadata: { kind: 'prototype' },
      name,
      pendingPrompt: null,
      skillId: null,
    },
  });
}

/** Drive one chat turn through the production run API until it terminates. */
async function runToTerminal(
  webUrl: string,
  project: ProjectResponse,
  prompt: string,
): Promise<ChatRunStatusBody> {
  const startedAt = Date.now();
  const userMessageId = `user-${startedAt}-${randomUUID().slice(0, 8)}`;
  const assistantMessageId = `assistant-${startedAt}-${randomUUID().slice(0, 8)}`;
  const projectId = project.project.id;
  const conversationId = project.conversationId;
  await saveMessage(webUrl, projectId, conversationId, {
    content: prompt,
    createdAt: startedAt,
    id: userMessageId,
    role: 'user',
  });
  await saveMessage(webUrl, projectId, conversationId, {
    agentId: 'codex',
    agentName: 'Codex',
    content: '',
    createdAt: startedAt,
    events: [],
    id: assistantMessageId,
    role: 'assistant',
    runStatus: 'running',
    startedAt,
  });
  const run = await startRun(webUrl, {
    agentId: 'codex',
    assistantMessageId,
    clientRequestId: `req-${startedAt}-${randomUUID().slice(0, 8)}`,
    conversationId,
    designSystemId: null,
    message: prompt,
    model: 'default',
    projectId,
    reasoning: 'default',
    skillId: null,
  });
  const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 30_000 });
  // Keep terminal timestamps strictly ordered between consecutive turns so
  // the newest-terminal fold below is unambiguous.
  await delay(20);
  return terminal;
}

/**
 * The newest terminal run wins, exactly as the web fold does
 * (`foldRunsToProjectRunSummaries` in `apps/web/src/state/projectRunStatus.ts`).
 */
function newestTerminalRun(runs: ChatRunStatusBody[]): ChatRunStatusBody | null {
  let newest: ChatRunStatusBody | null = null;
  for (const run of runs) {
    if (!TERMINAL_STATUSES.has(run.status)) continue;
    if (!newest || run.updatedAt > newest.updatedAt) newest = run;
  }
  return newest;
}

async function expectProjectRunList(
  webUrl: string,
  ids: {
    askingProjectId: string;
    askingRunId: string;
    failedRunId: string;
    retriedProjectId: string;
    succeededRunId: string;
  },
): Promise<void> {
  const retried = await requestJson<RunsListResponse>(
    webUrl,
    `/api/runs?projectId=${encodeURIComponent(ids.retriedProjectId)}`,
  );
  expect(retried.runs.map((run) => run.id).sort()).toEqual(
    [ids.failedRunId, ids.succeededRunId].sort(),
  );
  expect(retried.runs.every((run) => run.projectId === ids.retriedProjectId)).toBe(true);
  expect(newestTerminalRun(retried.runs)).toMatchObject({
    id: ids.succeededRunId,
    status: 'succeeded',
  });
  expect(retried.awaitingInputProjectIds).not.toContain(ids.retriedProjectId);

  const asking = await requestJson<RunsListResponse>(
    webUrl,
    `/api/runs?projectId=${encodeURIComponent(ids.askingProjectId)}`,
  );
  expect(asking.runs.map((run) => run.id)).toEqual([ids.askingRunId]);
  expect(newestTerminalRun(asking.runs)).toMatchObject({
    id: ids.askingRunId,
    status: 'succeeded',
  });
  expect(asking.awaitingInputProjectIds).toEqual([ids.askingProjectId]);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
