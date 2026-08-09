import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test as base } from '@playwright/test';

import { seedCampaignDismissals } from './campaign-dismissals.ts';
import {
  PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS,
  warmPlaywrightDaemonRuntime,
  warmPlaywrightWebRuntime,
} from './runtime-lifecycle.ts';
import { routeUnavailableVelaStatus } from './mock-factory.ts';
import { resolvePlaywrightSlotNamespace } from './runtime-identity.ts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../tools-dev/runtime.ts';
import type { ToolsDevSuite } from '../tools-dev/types.ts';

type PlaywrightToolsDevSuite = ToolsDevSuite & {
  markFailed: () => void;
};

type TestFixtures = {
  _defaultCloudStatus: void;
  _toolsDevFailureTracker: void;
};

type WorkerFixtures = {
  toolsDev: PlaywrightToolsDevSuite;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  context: async ({ context }, use) => {
    await seedCampaignDismissals(context);
    await use(context);
  },

  toolsDev: [
    async ({}, use, workerInfo) => {
      const suite = await createPlaywrightToolsDevSuite(
        workerInfo.parallelIndex,
        workerInfo.workerIndex,
      );
      let failed = false;
      const toolsDev: PlaywrightToolsDevSuite = Object.assign(suite, {
        markFailed() {
          failed = true;
        },
      });

      let useError: unknown = null;
      let stopError: unknown = null;
      try {
        await toolsDev.startWeb();
        await warmPlaywrightWebRuntime(toolsDev.url.web('/'));
        await warmPlaywrightDaemonRuntime(toolsDev.url.daemon('/api/health'));
        await use(toolsDev);
      } catch (error) {
        useError = error;
        failed = true;
        throw error;
      } finally {
        try {
          await toolsDev.stopWeb();
        } catch (error) {
          stopError = error;
          failed = true;
        }
        if (!failed) {
          await rm(toolsDev.root, { force: true, recursive: true });
        }
        if (stopError != null && useError == null) {
          throw stopError;
        }
      }
    },
    { scope: 'worker', timeout: PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS },
  ],

  baseURL: async ({ toolsDev }, use) => {
    await use(toolsDev.url.web());
  },

  // Most UI specs exercise Home or Workspace behavior, not authentication.
  // Model a transient Cloud-status outage so the Cloud-first entry gate cannot
  // redirect them and no fake account changes local APIs to Workspace scope.
  // Auth/onboarding specs register a later route with their intended state.
  _defaultCloudStatus: [
    async ({ page }, use) => {
      await routeUnavailableVelaStatus(page);
      await use();
    },
    { auto: true },
  ],

  _toolsDevFailureTracker: [
    async ({ toolsDev }, use, testInfo) => {
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        toolsDev.markFailed();
        await testInfo.attach('tools-dev-runtime', {
          body: JSON.stringify({
            dataDir: toolsDev.dataDir,
            daemonPort: toolsDev.daemonPort,
            daemonUrl: toolsDev.daemonUrl,
            namespace: toolsDev.namespace,
            root: toolsDev.root,
            toolsDevRoot: toolsDev.toolsDevRoot,
            webPort: toolsDev.webPort,
            webUrl: toolsDev.webUrl,
          }, null, 2),
          contentType: 'application/json',
        });
      }
    },
    { auto: true },
  ],
});

/**
 * Playwright lifecycle for specs that allocate and release their own isolated
 * tools-dev runtimes. Keeping this entrypoint in the suite module preserves
 * the UI-test ownership boundary without booting an unused worker runtime in
 * addition to the runtimes owned by the spec.
 */
export const clusterTest = base.extend({
  context: async ({ context }, use) => {
    await seedCampaignDismissals(context);
    await use(context);
  },
});

export { expect };
export type { PlaywrightToolsDevSuite };

async function createPlaywrightToolsDevSuite(
  parallelIndex: number,
  workerIndex: number,
): Promise<ToolsDevSuite> {
  const namespace = resolvePlaywrightSlotNamespace(parallelIndex);
  const incarnation = `i${workerIndex}-p${process.pid}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace, incarnation);
  const scratchDir = join(root, 'scratch');
  const suite = createToolsDevSuite({
    codexHomeDir: join(scratchDir, 'codex-home'),
    dataDir: join(scratchDir, 'data'),
    namespace,
    ownerPid: process.pid,
    root,
    toolsDevRoot: join(scratchDir, 'tools-dev'),
  });

  await mkdir(scratchDir, { recursive: true });
  return suite;
}
