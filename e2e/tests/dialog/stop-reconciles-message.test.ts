// @vitest-environment node

// Issue #135 scenario 1 — reattach after refresh.
//
// Symptom from the issue: after manually stopping a stuck run and starting it
// again, the previous run's elapsed time keeps accumulating into the new
// attempt. The web layer freezes the timer via `endedAt`, but if the user
// refreshes (or the persist call races) before the canceled message is saved,
// the message row in the daemon DB stays `run_status='running'` /
// `ended_at=NULL`. On reload, the web reattach effect picks up the message,
// sees the run is canceled, but never sets `endedAt` — so the renderer falls
// back to `now - startedAt` and the timer keeps climbing forever.
//
// This spec exercises the daemon contract: after a chat run reaches a terminal
// status, the corresponding assistant message row must carry both
// `runStatus` and `endedAt` so any later reload sees a frozen timer, even when
// the web client never managed to persist the cancel itself.

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { requestJson } from '@/vitest/http';
import { listMessages, saveMessage } from '@/vitest/messages';
import { cancelRun, startRun, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';

type ProjectResponse = {
  conversationId: string;
  project: { id: string; metadata?: { kind?: string }; name: string };
};

describe('dialog stop reconciles message endedAt', () => {
  test('canceling a run sets the message endedAt even when the web client never saves the cancel', async () => {
    const suite = await createSmokeSuite('dialog-stop-reconciles-message');

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
          name: 'Dialog stop reconciles project',
          pendingPrompt: null,
          skillId: null,
        },
      });
      const projectId = project.project.id;
      const conversationId = project.conversationId;

      const startedAt = Date.now();
      const userMessageId = `user-stop-reconcile-${startedAt}`;
      const assistantMessageId = `assistant-stop-reconcile-${startedAt}`;
      await saveMessage(webUrl, projectId, conversationId, {
        content: 'Create a deterministic smoke artifact',
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
        clientRequestId: `req-${startedAt}`,
        conversationId,
        designSystemId: null,
        message: 'Create a deterministic smoke artifact',
        model: 'default',
        projectId,
        reasoning: 'default',
        skillId: null,
      });

      // Cancel the run. Crucially, do NOT call saveMessage afterwards — this
      // models the user clicking Stop and then refreshing the page (or the
      // browser dropping the in-flight PUT) before the web client persists the
      // canceled state.
      await cancelRun(webUrl, run.runId);

      // Wait until the daemon reports the run as terminal so the reconciliation
      // path has had a chance to run. The exact terminal status (canceled vs
      // failed vs succeeded) doesn't matter here — the assertion is about the
      // resulting messages row, not which terminal the run landed in.
      const finalRun = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 10_000 });
      expect(TERMINAL_STATUSES).toContain(finalRun.status);
      const reconcileDeadline = Date.now();

      // Give the post-terminal reconciliation a brief moment to flush.
      await delay(100);

      const allMessages = await listMessages(webUrl, projectId, conversationId);
      const assistant = allMessages.find((m) => m.id === assistantMessageId);
      expect(assistant, 'assistant message present').toBeDefined();

      // The DB row must reflect that the run is no longer active and must
      // carry an endedAt that's close to the cancel/finish time. Without this,
      // a later reload sees `endedAt=undefined`, the renderer falls back to
      // `now - startedAt`, and the timer never freezes.
      expect(assistant!.runStatus).not.toBe('running');
      expect(assistant!.runStatus).not.toBe('queued');
      expect(typeof assistant!.endedAt).toBe('number');
      expect(assistant!.endedAt!).toBeGreaterThanOrEqual(startedAt);
      // Allow a generous +5s window — the assertion is that endedAt was set
      // around when the run terminated, not that the row sat with a NULL
      // endedAt waiting for a later web write.
      expect(assistant!.endedAt!).toBeLessThanOrEqual(reconcileDeadline + 5_000);
    });
  }, 180_000);
});

const TERMINAL_STATUSES = ['succeeded', 'failed', 'canceled'] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
