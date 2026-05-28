// @vitest-environment node

import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { seedVelaLoginConfig, writeFakeVelaBin } from '@/amr';
import { createAmrProject, putAmrAppConfig } from '@/vitest/amr';
import { readRunEvents, startRun, waitForRunStatus, waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/smoke-suite';

describe('AMR relogin-required run failures', () => {
  test('fails a new /api/runs request when the local AMR login config is missing', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-relogin-required');
    const previousProfile = process.env.OPEN_DESIGN_AMR_PROFILE;
    const previousHome = process.env.HOME;
    const homeDir = join(suite.scratchDir, 'home-missing-login');
    process.env.OPEN_DESIGN_AMR_PROFILE = 'local';
    process.env.HOME = homeDir;

    try {
      await suite.with.toolsDev(async ({ webUrl }) => {
        const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-missing-login'));

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
    } finally {
      if (previousProfile === undefined) delete process.env.OPEN_DESIGN_AMR_PROFILE;
      else process.env.OPEN_DESIGN_AMR_PROFILE = previousProfile;
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  test('uses configured AMR profile env for pre-run login status', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-configured-profile-preflight');
    const previousProfile = process.env.OPEN_DESIGN_AMR_PROFILE;
    const previousHome = process.env.HOME;
    const homeDir = join(suite.scratchDir, 'home-configured-profile');
    process.env.OPEN_DESIGN_AMR_PROFILE = 'prod';
    process.env.HOME = homeDir;

    try {
      await seedVelaLoginConfig(homeDir, { profile: 'local' });
      await suite.with.toolsDev(async ({ webUrl }) => {
        const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-configured-profile'));

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
    } finally {
      if (previousProfile === undefined) delete process.env.OPEN_DESIGN_AMR_PROFILE;
      else process.env.OPEN_DESIGN_AMR_PROFILE = previousProfile;
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
    }
  });

  test('uses daemon AMR runtime credentials for pre-run login status', { timeout: 180_000 }, async () => {
    const suite = await createSmokeSuite('amr-daemon-env-credentials-preflight');
    const previousProfile = process.env.OPEN_DESIGN_AMR_PROFILE;
    const previousHome = process.env.HOME;
    const previousRuntimeKey = process.env.VELA_RUNTIME_KEY;
    const previousLinkUrl = process.env.VELA_LINK_URL;
    const homeDir = join(suite.scratchDir, 'home-daemon-env-credentials');
    process.env.OPEN_DESIGN_AMR_PROFILE = 'local';
    process.env.HOME = homeDir;
    process.env.VELA_RUNTIME_KEY = 'fake-runtime-key-from-daemon-env';
    process.env.VELA_LINK_URL = 'http://localhost:18081';

    try {
      await suite.with.toolsDev(async ({ webUrl }) => {
        const velaBin = await writeFakeVelaBin(join(suite.scratchDir, 'fake-vela-daemon-env-credentials'), {
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
    } finally {
      if (previousProfile === undefined) delete process.env.OPEN_DESIGN_AMR_PROFILE;
      else process.env.OPEN_DESIGN_AMR_PROFILE = previousProfile;
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousRuntimeKey === undefined) delete process.env.VELA_RUNTIME_KEY;
      else process.env.VELA_RUNTIME_KEY = previousRuntimeKey;
      if (previousLinkUrl === undefined) delete process.env.VELA_LINK_URL;
      else process.env.VELA_LINK_URL = previousLinkUrl;
    }
  });
});
