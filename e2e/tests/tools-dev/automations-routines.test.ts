// @vitest-environment node

import { join } from 'node:path';

import type { CreateRoutineRequest, Routine } from '@open-design/contracts';
import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { requestJson } from '@/vitest/http';
import { waitForRunStatus } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

type RoutineRunStartResponse = {
  agentRunId?: string | null;
  conversationId?: string | null;
  projectId?: string | null;
};

describe('tools-dev automations routines', () => {
  test('creates and runs a routine through the API', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('tools-dev-automations-routines');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents'),
        runtimeIds: ['codex'],
      });
      await requestJson(webUrl, '/api/app-config', {
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
      const { routine } = await requestJson<{ routine: Routine }>(webUrl, '/api/routines', {
        body: createBody,
        method: 'POST',
      });
      expect(routine.name).toBe('E2E daily digest');

      const listed = await requestJson<{ routines: Routine[] }>(webUrl, '/api/routines');
      expect(listed.routines.map((entry) => entry.id)).toContain(routine.id);

      const started = await requestJson<RoutineRunStartResponse>(
        webUrl,
        `/api/routines/${encodeURIComponent(routine.id)}/run`,
        { body: {}, method: 'POST' },
      );
      expect(started.projectId).toEqual(expect.any(String));
      expect(started.conversationId).toEqual(expect.any(String));
      expect(started.agentRunId).toEqual(expect.any(String));

      const finalRun = await waitForRunStatus(webUrl, String(started.agentRunId), 'succeeded', {
        timeoutMs: 30_000,
      });
      expect(finalRun.projectId).toBe(started.projectId);
    });
  });
});
