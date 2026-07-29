// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { requestJson } from '@/vitest/http';
import { listMessages, saveMessage } from '@/vitest/messages';
import { cancelRun, startRun, waitForRunStatus } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';

type ProjectResponse = {
  conversationId: string;
  project: { id: string; metadata?: { kind?: string }; name: string };
};

const PROMPT_FIRST = 'Create a deterministic smoke artifact';
const PROMPT_RETRY = 'Create a deterministic smoke artifact';

describe('dialog retry after stop', () => {
  test('retried turn keeps its own startedAt and does not merge with the previously stopped run', async () => {
    const suite = await createSmokeSuite('dialog-retry-after-stop');

    await suite.with.toolsDev(async ({ webUrl }) => {
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

      const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
        body: {
          designSystemId: null,
          id: randomUUID(),
          metadata: { kind: 'prototype' },
          name: 'Dialog retry-after-stop project',
          pendingPrompt: null,
          skillId: null,
        },
      });
      const projectId = project.project.id;
      const conversationId = project.conversationId;

      // ---- Attempt 1: start, then user stops it ----
      const t0 = Date.now();
      const userMessageId1 = `user-stop-${t0}`;
      const assistantMessageId1 = `assistant-stop-${t0}`;
      await saveMessage(webUrl, projectId, conversationId, {
        content: PROMPT_FIRST,
        createdAt: t0,
        id: userMessageId1,
        role: 'user',
      });
      await saveMessage(webUrl, projectId, conversationId, {
        agentId: 'codex',
        agentName: 'Codex',
        content: '',
        createdAt: t0,
        events: [],
        id: assistantMessageId1,
        role: 'assistant',
        runStatus: 'running',
        startedAt: t0,
      });

      const run1 = await startRun(webUrl, {
        agentId: 'codex',
        assistantMessageId: assistantMessageId1,
        clientRequestId: `req-${t0}`,
        conversationId,
        designSystemId: null,
        message: PROMPT_FIRST,
        model: 'default',
        projectId,
        reasoning: 'default',
        skillId: null,
      });

      // Mirror the UI handleStop path: cancel the run, then persist the
      // assistant message with runStatus=canceled and a frozen endedAt.
      await cancelRun(webUrl, run1.runId);
      const stoppedAt = Date.now();
      await saveMessage(webUrl, projectId, conversationId, {
        agentId: 'codex',
        agentName: 'Codex',
        content: '',
        createdAt: t0,
        endedAt: stoppedAt,
        events: [],
        id: assistantMessageId1,
        role: 'assistant',
        runStatus: 'canceled',
        startedAt: t0,
      });

      // ---- Attempt 2: retry by sending again ----
      // Wait briefly so timestamps differ enough to be observable.
      await delay(50);
      const t1 = Date.now();
      const userMessageId2 = `user-retry-${t1}`;
      const assistantMessageId2 = `assistant-retry-${t1}`;
      await saveMessage(webUrl, projectId, conversationId, {
        content: PROMPT_RETRY,
        createdAt: t1,
        id: userMessageId2,
        role: 'user',
      });
      await saveMessage(webUrl, projectId, conversationId, {
        agentId: 'codex',
        agentName: 'Codex',
        content: '',
        createdAt: t1,
        events: [],
        id: assistantMessageId2,
        role: 'assistant',
        runStatus: 'running',
        startedAt: t1,
      });

      const run2 = await startRun(webUrl, {
        agentId: 'codex',
        assistantMessageId: assistantMessageId2,
        clientRequestId: `req-${t1}`,
        conversationId,
        designSystemId: null,
        message: PROMPT_RETRY,
        model: 'default',
        projectId,
        reasoning: 'default',
        skillId: null,
      });

      const finalRun2 = await waitForRunStatus(webUrl, run2.runId, 'succeeded', { timeoutMs: 30_000 });
      expect(finalRun2.assistantMessageId).toBe(assistantMessageId2);

      // Mirror the UI's onDone handler: persist the completion timestamp.
      const finishedAt = Date.now();
      await saveMessage(webUrl, projectId, conversationId, {
        agentId: 'codex',
        agentName: 'Codex',
        content: '',
        createdAt: t1,
        endedAt: finishedAt,
        events: [],
        id: assistantMessageId2,
        role: 'assistant',
        runStatus: 'succeeded',
        startedAt: t1,
      });

      // ---- Assert no merge ----
      const allMessages = await listMessages(webUrl, projectId, conversationId);
      const assistant1 = allMessages.find((m) => m.id === assistantMessageId1);
      const assistant2 = allMessages.find((m) => m.id === assistantMessageId2);

      expect(assistant1, 'first attempt persisted').toBeDefined();
      expect(assistant2, 'retried attempt persisted').toBeDefined();

      // Stopped attempt is preserved as historical state with a frozen timer.
      expect(assistant1!.runStatus).toBe('canceled');
      expect(assistant1!.startedAt).toBe(t0);
      expect(assistant1!.endedAt).toBe(stoppedAt);

      // Retried attempt has its own fresh startedAt — not merged with the
      // previous attempt's startedAt — and its own endedAt.
      expect(assistant2!.runStatus).toBe('succeeded');
      expect(assistant2!.startedAt).toBe(t1);
      expect(assistant2!.startedAt!).toBeGreaterThan(stoppedAt);
      expect(assistant2!.endedAt).toBe(finishedAt);
    });
  }, 180_000);
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
