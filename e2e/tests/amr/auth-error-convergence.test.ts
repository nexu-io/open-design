// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { startFakeAmrRecoveryApi, writeFakeVelaBin } from '@/amr';
import { createAmrProject, putAmrAppConfig } from '@/vitest/amr';
import { listMessages } from '@/vitest/messages';
import { readRunEvents, startRun, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

describe('AMR auth error convergence', () => {
  test('marks the run and assistant message as failed when fake vela returns an auth error during prompt', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-auth-error-convergence');
    const recoveryApi = await startFakeAmrRecoveryApi(suite.amr);

    try {
      await suite.with.toolsDev(async ({ webUrl }) => {
        const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-auth-error'), {
          endpoints: suite.amr,
          failAuthAtPrompt: true,
          requireLoginConfig: false,
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

        const project = await createAmrProject(webUrl, 'AMR auth error convergence');
        const assistantMessageId = `assistant-${Date.now()}`;

        const run = await startRun(webUrl, {
          agentId: 'amr',
          assistantMessageId,
          clientRequestId: `req-${Date.now()}`,
          conversationId: project.conversationId,
          designSystemId: null,
          message: 'Simulate an AMR auth expiry during session/prompt.',
          model: 'default',
          projectId: project.project.id,
          reasoning: 'default',
          skillId: null,
        });

        const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
        expect(terminal.status).toBe('failed');

        const messages = await listMessages(webUrl, project.project.id, project.conversationId);
        const assistant = messages.find((message) => message.id === assistantMessageId);
        expect(assistant?.runStatus).toBe('failed');
        await expect(readRunEvents(webUrl, run.runId)).resolves.toMatch(/AMR_AUTH_REQUIRED/);
      });
    } finally {
      await recoveryApi.close();
    }
  });
});
