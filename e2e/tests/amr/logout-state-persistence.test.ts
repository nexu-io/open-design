// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { startFakeAmrRecoveryApi, writeFakeVelaBin } from '@/amr';
import { createAmrProject, putAmrAppConfig } from '@/vitest/amr';
import { requestJson } from '@/vitest/http';
import { readRunEvents, startRun, waitForRunStatus, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

describe('AMR logout state persistence', () => {
  test('a previously working AMR session stops working after local logout and requires re-login', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-logout-state-persistence');
    const recoveryApi = await startFakeAmrRecoveryApi(suite.amr);
    const homeDir = join(suite.scratchDir, 'home-logout-state');

    try {
      await suite.with.env({ HOME: homeDir, OPEN_DESIGN_AMR_PROFILE: 'local' }, async () => {
        await suite.with.toolsDev(async ({ webUrl }) => {
          const successVelaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-logout-success'), {
            assistantText: 'AMR logout persistence success',
            endpoints: suite.amr,
            requireLoginConfig: false,
          });
          const strictVelaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-logout-strict'), {
            assistantText: 'AMR logout persistence strict',
            endpoints: suite.amr,
          });

          await putAmrAppConfig(webUrl, {
            agentId: 'amr',
            agentCliEnv: {
              amr: {
                VELA_BIN: successVelaBin,
                OPEN_DESIGN_AMR_PROFILE: 'local',
                ...suite.amr.runtimeEnv(),
              },
            },
          });

          const project = await createAmrProject(webUrl, 'AMR logout state persistence');

          const firstRun = await startRun(webUrl, {
            agentId: 'amr',
            assistantMessageId: `assistant-success-${Date.now()}`,
            clientRequestId: `req-success-${Date.now()}`,
            conversationId: project.conversationId,
            designSystemId: null,
            message: 'First AMR run should succeed before logout.',
            model: 'default',
            projectId: project.project.id,
            reasoning: 'default',
            skillId: null,
          });
          await waitForRunStatus(webUrl, firstRun.runId, 'succeeded', { timeoutMs: 20_000 });

          await putAmrAppConfig(webUrl, {
            agentId: 'amr',
            agentCliEnv: {
              amr: {
                VELA_BIN: strictVelaBin,
                OPEN_DESIGN_AMR_PROFILE: 'local',
              },
            },
          });
          await requestJson(webUrl, '/api/integrations/vela/logout', { body: {}, method: 'POST' });
          const status = await requestJson<{ loggedIn: boolean }>(webUrl, '/api/integrations/vela/status');
          expect(status.loggedIn).toBe(false);

          const secondRun = await startRun(webUrl, {
            agentId: 'amr',
            assistantMessageId: `assistant-fail-${Date.now()}`,
            clientRequestId: `req-fail-${Date.now()}`,
            conversationId: project.conversationId,
            designSystemId: null,
            message: 'Second AMR run should require login again.',
            model: 'default',
            projectId: project.project.id,
            reasoning: 'default',
            skillId: null,
          });
          const terminal = await waitForRunTerminal(webUrl, secondRun.runId, { timeoutMs: 20_000 });
          expect(terminal.status).toBe('failed');

          await expect(readRunEvents(webUrl, secondRun.runId)).resolves.toMatch(/AMR_AUTH_REQUIRED/);
        });
      });
    } finally {
      await recoveryApi.close();
    }
  });
});
