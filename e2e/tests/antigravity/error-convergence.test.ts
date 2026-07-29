// @vitest-environment node

import { dirname, join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { writeFakeAgyBin } from '@/antigravity';
import { createAntigravityProject, putAntigravityAppConfig } from '@/vitest/antigravity';
import { listMessages } from '@/vitest/messages';
import { readRunEvents, startRun, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';

describe('Antigravity error convergence', () => {
  test('marks the run and assistant message as failed with AGENT_AUTH_REQUIRED when agy print mode hits OAuth auth flow', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('antigravity-auth-error-convergence');
    const fakeAgy = await writeFakeAgyBin(
      join(suite.scratchDir, 'fake-antigravity-auth'),
      { mode: 'auth-required' },
    );
    const previousPath = process.env.PATH;
    process.env.PATH = `${dirname(fakeAgy)}:${previousPath ?? ''}`;

    try {
      await suite.with.toolsDev(async ({ webUrl }) => {
        await putAntigravityAppConfig(webUrl);

        const project = await createAntigravityProject(webUrl, 'Antigravity auth error convergence');
        const assistantMessageId = `assistant-${Date.now()}`;
        const run = await startRun(webUrl, {
          agentId: 'antigravity',
          assistantMessageId,
          clientRequestId: `req-${Date.now()}`,
          conversationId: project.conversationId,
          designSystemId: null,
          message: 'Trigger an Antigravity OAuth auth failure.',
          model: 'default',
          projectId: project.project.id,
          reasoning: 'default',
          skillId: null,
        });

        const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
        expect(terminal.status).toBe('failed');

        const events = await readRunEvents(webUrl, run.runId);
        expect(events).toContain('AGENT_AUTH_REQUIRED');
        expect(events).toContain('open a terminal and run `agy` once');

        const messages = await listMessages(webUrl, project.project.id, project.conversationId);
        const assistant = messages.find((message) => message.id === assistantMessageId);
        expect(assistant?.runStatus).toBe('failed');
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });

  test('marks the run and assistant message as failed with RATE_LIMITED when agy log file records quota exhaustion', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('antigravity-rate-limited-convergence');
    const fakeAgy = await writeFakeAgyBin(
      join(suite.scratchDir, 'fake-antigravity-rate-limited'),
      { mode: 'rate-limited' },
    );
    const previousPath = process.env.PATH;
    process.env.PATH = `${dirname(fakeAgy)}:${previousPath ?? ''}`;

    try {
      await suite.with.toolsDev(async ({ webUrl }) => {
        await putAntigravityAppConfig(webUrl);

        const project = await createAntigravityProject(webUrl, 'Antigravity rate-limited convergence');
        const assistantMessageId = `assistant-${Date.now()}`;
        const run = await startRun(webUrl, {
          agentId: 'antigravity',
          assistantMessageId,
          clientRequestId: `req-${Date.now()}`,
          conversationId: project.conversationId,
          designSystemId: null,
          message: 'Trigger an Antigravity quota exhaustion.',
          model: 'default',
          projectId: project.project.id,
          reasoning: 'default',
          skillId: null,
        });

        const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
        expect(terminal.status).toBe('failed');

        const events = await readRunEvents(webUrl, run.runId);
        expect(events).toContain('RATE_LIMITED');
        expect(events).toContain('Switch Model picker');

        const messages = await listMessages(webUrl, project.project.id, project.conversationId);
        const assistant = messages.find((message) => message.id === assistantMessageId);
        expect(assistant?.runStatus).toBe('failed');
      });
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }
  });
});
