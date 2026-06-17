import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test as base } from '@playwright/test';

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
      const suite = await createPlaywrightToolsDevSuite(workerInfo.workerIndex);
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
    { scope: 'worker', timeout: 120_000 },
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

async function createPlaywrightToolsDevSuite(workerIndex: number): Promise<ToolsDevSuite> {
  const namespaceBase = process.env.OD_E2E_NAMESPACE ?? `playwright-${process.pid}`;
  const namespace = `${sanitizeSegment(namespaceBase)}-w${workerIndex}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratchDir = join(root, 'scratch');
  const suite = createToolsDevSuite({
    codexHomeDir: join(scratchDir, 'codex-home'),
    dataDir: join(scratchDir, 'data'),
    namespace,
    root,
    toolsDevRoot: join(scratchDir, 'tools-dev'),
  });

  await mkdir(scratchDir, { recursive: true });
  return suite;
}

function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'playwright';
}
