// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { seedVelaLoginConfig, startFakeAmrRecoveryApi, writeFakeVelaBin } from '@/amr';
import { createAmrProject, putAmrAppConfig } from '@/vitest/amr';
import { readRunEvents, startRun, waitForRunStatus, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

describe('AMR relogin-required run failures', () => {
  test('fails a new /api/runs request when the local AMR login config is missing', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-relogin-required');
    const homeDir = join(suite.scratchDir, 'home-missing-login');

    await suite.with.env({ HOME: homeDir, OPEN_DESIGN_AMR_PROFILE: 'local' }, async () => {
      await suite.with.toolsDev(async ({ webUrl }) => {
        const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-missing-login'), {
          endpoints: suite.amr,
        });

        await putAmrAppConfig(webUrl, {
          agentId: 'amr',
          agentCliEnv: {
            amr: {
              VELA_BIN: velaBin,
              OPEN_DESIGN_AMR_PROFILE: 'local',
            },
          },
        });

        const project = await createAmrProject(webUrl, 'AMR relogin required');

        const assistantMessageId = `assistant-${Date.now()}`;
        const run = await startRun(webUrl, {
          agentId: 'amr',
          assistantMessageId,
          clientRequestId: `req-${Date.now()}`,
          conversationId: project.conversationId,
          designSystemId: null,
          message: 'This should require a fresh AMR login.',
          model: 'default',
          projectId: project.project.id,
          reasoning: 'default',
          skillId: null,
        });
        const terminal = await waitForRunTerminal(webUrl, run.runId, { timeoutMs: 20_000 });
        expect(terminal.status).toBe('failed');

        await expect(readRunEvents(webUrl, run.runId)).resolves.toMatch(/AMR_AUTH_REQUIRED/);
      });
    });
  });

  test('uses configured AMR profile env for pre-run login status', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-configured-profile-preflight');
    const recoveryApi = await startFakeAmrRecoveryApi(suite.amr);
    const homeDir = join(suite.scratchDir, 'home-configured-profile');

    try {
      await suite.with.env({ HOME: homeDir, OPEN_DESIGN_AMR_PROFILE: 'prod' }, async () => {
        await seedVelaLoginConfig(homeDir, { endpoints: suite.amr, profile: 'local' });
        await suite.with.toolsDev(async ({ webUrl }) => {
          const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-configured-profile'), {
            endpoints: suite.amr,
          });

          await putAmrAppConfig(webUrl, {
            agentId: 'amr',
            agentCliEnv: {
              amr: {
                VELA_BIN: velaBin,
                OPEN_DESIGN_AMR_PROFILE: 'local',
              },
            },
          });

          const project = await createAmrProject(webUrl, 'AMR configured profile preflight');
          const run = await startRun(webUrl, {
            agentId: 'amr',
            assistantMessageId: `assistant-configured-profile-${Date.now()}`,
            clientRequestId: `req-configured-profile-${Date.now()}`,
            conversationId: project.conversationId,
            designSystemId: null,
            message: 'This should use the configured AMR profile.',
            model: 'default',
            projectId: project.project.id,
            reasoning: 'default',
            skillId: null,
          });

          await waitForRunStatus(webUrl, run.runId, 'succeeded', { timeoutMs: 20_000 });
        });
      });
    } finally {
      await recoveryApi.close();
    }
  });

  test('uses daemon AMR runtime credentials for pre-run login status', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-daemon-env-credentials-preflight');
    const recoveryApi = await startFakeAmrRecoveryApi(suite.amr);
    const homeDir = join(suite.scratchDir, 'home-daemon-env-credentials');

    try {
      await suite.with.env(
        {
          HOME: homeDir,
          OPEN_DESIGN_AMR_PROFILE: 'local',
          ...suite.amr.runtimeEnv({ VELA_RUNTIME_KEY: 'fake-runtime-key-from-daemon-env' }),
        },
        async () => {
          await suite.with.toolsDev(async ({ webUrl }) => {
            const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-daemon-env-credentials'), {
              endpoints: suite.amr,
              requireLoginConfig: false,
            });

            await putAmrAppConfig(webUrl, {
              agentId: 'amr',
              agentCliEnv: {
                amr: {
                  VELA_BIN: velaBin,
                  OPEN_DESIGN_AMR_PROFILE: 'local',
                },
              },
            });

            const project = await createAmrProject(webUrl, 'AMR daemon env credentials preflight');
            const run = await startRun(webUrl, {
              agentId: 'amr',
              assistantMessageId: `assistant-daemon-env-credentials-${Date.now()}`,
              clientRequestId: `req-daemon-env-credentials-${Date.now()}`,
              conversationId: project.conversationId,
              designSystemId: null,
              message: 'This should use daemon AMR runtime credentials.',
              model: 'default',
              projectId: project.project.id,
              reasoning: 'default',
              skillId: null,
            });

            await waitForRunStatus(webUrl, run.runId, 'succeeded', { timeoutMs: 20_000 });
          });
        },
      );
    } finally {
      await recoveryApi.close();
    }
  });
});
