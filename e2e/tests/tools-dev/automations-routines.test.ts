// @vitest-environment node

import { join } from 'node:path';

import type { CreateRoutineRequest } from '@open-design/contracts';
import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { listMessages } from '@/vitest/messages';
import { createRoutine, deleteRoutine, listRoutines, runRoutine, updateRoutine } from '@/vitest/routines';
import { createSmokeSuite } from '@/vitest/smoke-suite';
import { requestJson } from '@/vitest/http';
import { readRunEvents, waitForRunStatus, waitForRunTerminal } from '@/vitest/runs';

type ProjectResponse = {
  project: {
    id: string;
    metadata?: {
      kind?: string;
      trigger?: string;
    };
    name: string;
  };
};

describe('tools-dev automations routines', () => {
  test('supports create, pause/resume, run, and delete through the routines API', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('tools-dev-automations-routines');

    await suite.with.toolsDev(async ({ runtime, status, webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents'),
        runtimeIds: ['codex'],
      });

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

      const createBody: CreateRoutineRequest = {
        name: 'E2E daily digest',
        prompt: 'Create a deterministic smoke artifact for the routines API.',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        skillId: null,
        context: {},
      };

      const created = await createRoutine(webUrl, createBody);
      expect(created.id).toEqual(expect.any(String));
      expect(created.name).toBe('E2E daily digest');
      expect(created.enabled).toBe(true);

      const afterCreate = await listRoutines(webUrl);
      expect(afterCreate.map((routine) => routine.id)).toContain(created.id);

      const paused = await updateRoutine(webUrl, created.id, { enabled: false });
      expect(paused.enabled).toBe(false);
      const listedPaused = await listRoutines(webUrl);
      expect(listedPaused.find((routine) => routine.id === created.id)?.enabled).toBe(false);

      const resumed = await updateRoutine(webUrl, created.id, { enabled: true });
      expect(resumed.enabled).toBe(true);
      const listedResumed = await listRoutines(webUrl);
      expect(listedResumed.find((routine) => routine.id === created.id)?.enabled).toBe(true);

      const started = await runRoutine(webUrl, created.id);
      expect(started.projectId).toEqual(expect.any(String));
      expect(started.conversationId).toEqual(expect.any(String));
      expect(started.agentRunId).toEqual(expect.any(String));

      const finalRun = await waitForRunStatus(webUrl, String(started.agentRunId), 'succeeded', {
        timeoutMs: 30_000,
      });
      expect(finalRun.projectId).toBe(started.projectId);
      expect(finalRun.status).toBe('succeeded');

      const project = await requestJson<ProjectResponse>(
        webUrl,
        `/api/projects/${encodeURIComponent(String(started.projectId))}`,
      );
      expect(project.project.id).toBe(started.projectId);
      expect(project.project.metadata?.trigger).toBe('manual');

      const messages = await listMessages(
        webUrl,
        String(started.projectId),
        String(started.conversationId),
      );
      expect(
        messages.some(
          (message) =>
            message.role === 'assistant' &&
            message.content.includes('Real Daemon Smoke'),
        ),
      ).toBe(true);

      const afterRun = await listRoutines(webUrl);
      const routineAfterRun = afterRun.find((routine) => routine.id === created.id);
      expect(routineAfterRun?.lastRun?.status).toBe('succeeded');
      expect(routineAfterRun?.lastRun?.projectId).toBe(started.projectId);
      expect(routineAfterRun?.lastRun?.conversationId).toBe(started.conversationId);

      await deleteRoutine(webUrl, created.id);
      const afterDelete = await listRoutines(webUrl);
      expect(afterDelete.find((routine) => routine.id === created.id)).toBeUndefined();

      await suite.report.json('summary.json', {
        created,
        finalRun,
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          runStatus: message.runStatus ?? null,
        })),
        namespace: suite.namespace,
        project: project.project,
        routineAfterRun,
        runtime: {
          daemonPort: runtime.daemonPort,
          webPort: runtime.webPort,
          webUrl,
        },
        status,
      });
    });
  });

  test('persists failed lastRun details when an automation run errors', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('tools-dev-automations-routines-failed-run');

    await suite.with.toolsDev(async ({ runtime, status, webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents'),
        runtimeIds: ['codex'],
      });

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

      const createBody: CreateRoutineRequest = {
        name: 'E2E failing digest',
        prompt: 'Return an intentional daemon smoke failure',
        schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
        target: { mode: 'create_each_run' },
        enabled: true,
        skillId: null,
        context: {},
      };

      const created = await createRoutine(webUrl, createBody);
      const started = await runRoutine(webUrl, created.id);
      expect(started.projectId).toEqual(expect.any(String));
      expect(started.conversationId).toEqual(expect.any(String));
      expect(started.agentRunId).toEqual(expect.any(String));

      const terminal = await waitForRunTerminal(webUrl, String(started.agentRunId), {
        timeoutMs: 30_000,
      });
      expect(terminal.status).toBe('failed');

      const events = await readRunEvents(webUrl, String(started.agentRunId));
      expect(events).toMatch(/intentional daemon smoke failure|failed/i);

      const messages = await listMessages(
        webUrl,
        String(started.projectId),
        String(started.conversationId),
      );
      const assistant = messages.find(
        (message) => message.role === 'assistant' && message.runId === started.agentRunId,
      );
      expect(assistant?.runStatus).toBe('failed');
      expect(typeof assistant?.endedAt).toBe('number');

      const afterRun = await listRoutines(webUrl);
      const routineAfterRun = afterRun.find((routine) => routine.id === created.id);
      expect(routineAfterRun?.lastRun?.status).toBe('failed');
      expect(routineAfterRun?.lastRun?.projectId).toBe(started.projectId);
      expect(routineAfterRun?.lastRun?.conversationId).toBe(started.conversationId);
      expect(routineAfterRun?.lastRun?.error).toMatch(/intentional fake codex failure|failed/i);

      await suite.report.json('failure-summary.json', {
        created,
        lastRun: routineAfterRun?.lastRun ?? null,
        messages: messages.map((message) => ({
          endedAt: message.endedAt ?? null,
          id: message.id,
          role: message.role,
          runId: message.runId ?? null,
          runStatus: message.runStatus ?? null,
        })),
        namespace: suite.namespace,
        runEventsPreview: events.slice(0, 500),
        runtime: {
          daemonPort: runtime.daemonPort,
          webPort: runtime.webPort,
          webUrl,
        },
        status,
        terminal,
      });
    });
  });
});
