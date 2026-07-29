// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { requestJson } from '@/vitest/http';
import { listMessages } from '@/vitest/messages';
import { readRunEvents, startRun, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';

type ProjectResponse = {
  conversationId: string;
  project: { id: string; metadata?: { kind?: string }; name: string };
};

describe('dialog service error convergence', () => {
  test('marks a normal agent 429 provider failure as RATE_LIMITED', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('dialog-rate-limited-convergence');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents-429'),
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
          name: 'Dialog 429 convergence project',
          pendingPrompt: null,
          skillId: null,
        },
      });

      const assistantMessageId = `assistant-429-${Date.now()}`;
      const run = await startRun(webUrl, {
        agentId: 'codex',
        assistantMessageId,
        clientRequestId: `req-429-${Date.now()}`,
        conversationId: project.conversationId,
        designSystemId: null,
        message: 'Return a daemon 429 service failure',
        model: 'default',
        projectId: project.project.id,
        reasoning: 'default',
        skillId: null,
      });

      const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
      expect(terminal.status).toBe('failed');

      const events = await readRunEvents(webUrl, run.runId);
      expect(events).toContain('RATE_LIMITED');
      expect(events).toContain('429');

      const messages = await listMessages(webUrl, project.project.id, project.conversationId);
      const assistant = messages.find((message) => message.id === assistantMessageId);
      expect(assistant?.runStatus).toBe('failed');
    });
  });

  test('marks a normal agent 503 provider failure as UPSTREAM_UNAVAILABLE', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('dialog-upstream-unavailable-convergence');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents-503'),
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
          name: 'Dialog 503 convergence project',
          pendingPrompt: null,
          skillId: null,
        },
      });

      const assistantMessageId = `assistant-503-${Date.now()}`;
      const run = await startRun(webUrl, {
        agentId: 'codex',
        assistantMessageId,
        clientRequestId: `req-503-${Date.now()}`,
        conversationId: project.conversationId,
        designSystemId: null,
        message: 'Return a daemon 503 service failure',
        model: 'default',
        projectId: project.project.id,
        reasoning: 'default',
        skillId: null,
      });

      const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
      expect(terminal.status).toBe('failed');

      const events = await readRunEvents(webUrl, run.runId);
      expect(events).toContain('UPSTREAM_UNAVAILABLE');
      expect(events).toContain('503');

      const messages = await listMessages(webUrl, project.project.id, project.conversationId);
      const assistant = messages.find((message) => message.id === assistantMessageId);
      expect(assistant?.runStatus).toBe('failed');
    });
  });
});
