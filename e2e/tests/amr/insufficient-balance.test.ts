// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { writeFakeVelaBin } from '@/amr';
import { createAmrProject, putAmrAppConfig } from '@/vitest/amr';
import { listMessages } from '@/vitest/messages';
import { readRunEvents, startRun, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

describe('AMR insufficient balance run failures', () => {
  test('fails the run with a recharge-facing AMR error when fake vela reports insufficient balance', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-insufficient-balance');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-balance'), {
        endpoints: suite.amr,
        failBalanceAtPrompt: true,
        requireLoginConfig: false,
        requireSetModel: false,
      });

      await putAmrAppConfig(webUrl, {
        agentId: 'amr',
        agentCliEnv: {
          amr: {
            VELA_BIN: velaBin,
            ...suite.amr.runtimeEnv(),
          },
        },
      });

      const project = await createAmrProject(webUrl, 'AMR insufficient balance');
      const assistantMessageId = `assistant-${Date.now()}`;
      const run = await startRun(webUrl, {
        agentId: 'amr',
        assistantMessageId,
        clientRequestId: `req-${Date.now()}`,
        conversationId: project.conversationId,
        designSystemId: null,
        message: 'This should surface a recharge link.',
        model: 'default',
        projectId: project.project.id,
        reasoning: 'default',
        skillId: null,
      });

      const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
      expect(terminal.status).toBe('failed');

      const events = await readRunEvents(webUrl, run.runId);
      expect(events).toContain('AMR_INSUFFICIENT_BALANCE');
      expect(events).toContain(
        'https://open-design.ai/amr/wallet?source=open_design',
      );

      const messages = await listMessages(webUrl, project.project.id, project.conversationId);
      const assistant = messages.find((message) => message.id === assistantMessageId);
      expect(assistant?.runStatus).toBe('failed');
    });
  });
});
