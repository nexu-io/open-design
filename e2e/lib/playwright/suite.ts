import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test as base } from '@playwright/test';

import {
  PLAYWRIGHT_TOOLS_DEV_FIXTURE_TIMEOUT_MS,
  warmPlaywrightWebRuntime,
} from './runtime-lifecycle.ts';
import { resolvePlaywrightSlotNamespace } from './runtime-identity.ts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../tools-dev/runtime.ts';
import type { ToolsDevSuite } from '../tools-dev/types.ts';

type PlaywrightToolsDevSuite = ToolsDevSuite & {
  markFailed: () => void;
};

type TestFixtures = {
  _toolsDevFailureTracker: void;
};

type WorkerFixtures = {
  toolsDev: PlaywrightToolsDevSuite;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
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
