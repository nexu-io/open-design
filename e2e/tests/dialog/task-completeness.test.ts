// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { requestJson } from '@/vitest/http';
import { listMessages, saveMessage } from '@/vitest/messages';
import { startRun, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

// Regression for #1247 / #1060: a design run whose declared work is unfinished
// (a non-completed TodoWrite task, or a max_tokens truncation) must NOT read as
// "Completed" on the run status, the /api/runs flag, or the project pill. Before
// the fix the daemon stamped these runs `succeeded` with no completeness signal,
// so the lower-left status surfaces read "Completed" while work was still pending.

type ProjectResponse = {
  conversationId: string;
  project: { id: string; name: string };
};

type RunStatusResponse = {
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  endedWithUnfinishedWork?: boolean;
};

type ProjectsResponse = {
  projects: Array<{ id: string; status?: { value?: string } }>;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('dialog task completeness (#1247)', () => {
  test('unfinished / stopped / truncated runs never read as Completed', async () => {
    const suite = await createSmokeSuite('dialog-task-completeness');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents'),
        runtimeIds: ['claude'],
      });

      await requestJson(webUrl, '/api/app-config', {
        body: {
          agentCliEnv: { claude: fakeAgents.claude.env },
          agentId: 'claude',
          agentModels: { claude: { model: 'default', reasoning: 'default' } },
          designSystemId: null,
          onboardingCompleted: true,
          skillId: null,
          telemetry: { artifactManifest: true, content: false, metrics: false },
        },
        method: 'PUT',
      });

      // Run one fake-agent turn in its own project and return the terminal run
      // status plus the project's projected display status.
      async function runCase(marker: string): Promise<{
        run: RunStatusResponse;
        projectStatus: string | undefined;
        projectId: string;
        conversationId: string;
      }> {
        const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
          body: {
            designSystemId: null,
            id: randomUUID(),
            metadata: { kind: 'prototype' },
            name: `completeness-${marker}`,
            pendingPrompt: null,
            skillId: null,
          },
        });
        const projectId = project.project.id;
        const conversationId = project.conversationId;
        const startedAt = Date.now();
        const userMessageId = `user-${startedAt}-${projectId}`;
        const assistantMessageId = `assistant-${startedAt}-${projectId}`;
        const prompt = `${marker} for the deterministic completeness smoke.`;

        await saveMessage(webUrl, projectId, conversationId, {
          content: prompt,
          createdAt: startedAt,
          id: userMessageId,
          role: 'user',
        });
        await saveMessage(webUrl, projectId, conversationId, {
          agentId: 'claude',
          agentName: 'Claude',
          content: '',
          createdAt: startedAt,
          events: [],
          id: assistantMessageId,
          role: 'assistant',
          runStatus: 'running',
          startedAt,
        });

        const run = await startRun(webUrl, {
          agentId: 'claude',
          assistantMessageId,
          clientRequestId: `req-${startedAt}-${projectId}`,
          conversationId,
          designSystemId: null,
          message: prompt,
          model: 'default',
          projectId,
          reasoning: 'default',
          skillId: null,
        });

        await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
        // The daemon persists the finalized run status onto the assistant message
        // asynchronously after the terminal frame; let it flush before reading.
        await delay(150);

        const status = await requestJson<RunStatusResponse>(
          webUrl,
          `/api/runs/${encodeURIComponent(run.runId)}`,
        );
        const projects = await requestJson<ProjectsResponse>(webUrl, '/api/projects');
        const projectStatus = projects.projects.find((p) => p.id === projectId)?.status?.value;

        return { run: status, projectStatus, projectId, conversationId };
      }

      // Case A — a TodoWrite left pending/in_progress at turn end.
      const unfinished = await runCase('Emit an unfinished-todo run');
      expect(unfinished.run.status).toBe('succeeded');
      expect(unfinished.run.endedWithUnfinishedWork).toBe(true);
      expect(unfinished.projectStatus).toBe('incomplete');

      // Case B — the canonical predicate: a stopped-only plan is still unfinished.
      const stopped = await runCase('Emit a stopped-todo run');
      expect(stopped.run.status).toBe('succeeded');
      expect(stopped.run.endedWithUnfinishedWork).toBe(true);
      expect(stopped.projectStatus).toBe('incomplete');

      // Case C — max_tokens truncation (Option A: stays succeeded, flagged
      // incomplete). All todos looked done, so truncation alone must flag it.
      const truncated = await runCase('Emit a max-tokens truncated run');
      expect(truncated.run.status).toBe('succeeded');
      expect(truncated.run.endedWithUnfinishedWork).toBe(true);
      expect(truncated.projectStatus).toBe('incomplete');

      // Negative — a genuinely finished plan stays Completed on every surface.
      const finished = await runCase('Emit an all-completed-todo run');
      expect(finished.run.status).toBe('succeeded');
      expect(finished.run.endedWithUnfinishedWork ?? false).toBe(false);
      expect(finished.projectStatus).toBe('succeeded');

      // Persistence: the unfinished run's TodoWrite snapshot survives on the
      // assistant message, which is what the project projection derives from
      // after the in-memory run ages out.
      const messages = await listMessages(webUrl, unfinished.projectId, unfinished.conversationId);
      const assistant = messages.find((m) => m.role === 'assistant');
      expect(assistant?.runStatus).toBe('succeeded');
      const hasTodoWrite = (assistant?.events ?? []).some(
        (e) => (e as { name?: string }).name === 'TodoWrite',
      );
      expect(hasTodoWrite).toBe(true);
    });
  }, 180_000);
});
