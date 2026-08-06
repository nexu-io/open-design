import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';

import { seedCampaignDismissals } from './campaign-dismissals.ts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../tools-dev/runtime.ts';
import type { ToolsDevSuite } from '../tools-dev/types.ts';

export type CollabClusterClientSpec = {
  id: string;
  env: Record<string, string | undefined>;
};

export type CollabClusterClient = CollabClusterClientSpec & {
  context: BrowserContext;
  page: Page;
  runtime: ToolsDevSuite;
};

export type CollabCluster = {
  clients: Record<string, CollabClusterClient>;
  close: (options?: { preserve?: boolean }) => Promise<void>;
};

/**
 * Start genuinely isolated Open Design clients for collaboration E2E.
 *
 * A second BrowserContext against the normal Playwright worker fixture is not
 * a second client: both pages still share one daemon, sqlite database, project
 * directory and watcher graph. Every entry here gets its own web + daemon,
 * dataDir and browser context while caller-supplied env can point all clients
 * at one shared collaboration authority.
 */
export async function createCollabCluster(
  browser: Browser,
  testInfo: TestInfo,
  specs: readonly CollabClusterClientSpec[],
): Promise<CollabCluster> {
  if (specs.length < 2) {
    throw new Error('a collaboration cluster requires at least two clients');
  }
  const ids = new Set(specs.map((spec) => spec.id));
  if (ids.size !== specs.length) {
    throw new Error('collaboration cluster client ids must be unique');
  }

  const safeTitle = sanitizeSegment(testInfo.titlePath.join('-'));
  const clusterRoot = join(
    e2eWorkspaceRoot(),
    '.tmp',
    'e2e',
    `collab-cluster-${process.pid}-${testInfo.workerIndex}-${safeTitle}`,
  );
  await mkdir(clusterRoot, { recursive: true });

  let closed = false;
  const results = await Promise.allSettled(
    specs.map((spec) => startClient(browser, testInfo, clusterRoot, spec)),
  );
  const started = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : []);
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failed) {
    await closeStartedClients(started, clusterRoot, testInfo, true);
    throw failed.reason;
  }

  return {
    clients: Object.fromEntries(started.map((client) => [client.id, client])),
    close: async (options = {}) => {
      if (closed) return;
      closed = true;
      await closeStartedClients(
        started,
        clusterRoot,
        testInfo,
        options.preserve === true || testInfo.status !== testInfo.expectedStatus,
      );
    },
  };
}

async function startClient(
  browser: Browser,
  testInfo: TestInfo,
  clusterRoot: string,
  spec: CollabClusterClientSpec,
): Promise<CollabClusterClient> {
  const root = join(clusterRoot, sanitizeSegment(spec.id));
  const scratchDir = join(root, 'scratch');
  await mkdir(scratchDir, { recursive: true });
  const runtime = createToolsDevSuite({
    codexHomeDir: join(scratchDir, 'codex-home'),
    dataDir: join(scratchDir, 'data'),
    namespace: `collab-${process.pid}-${testInfo.workerIndex}-${sanitizeSegment(spec.id)}`,
    root,
    toolsDevRoot: join(scratchDir, 'tools-dev'),
  });
  let context: BrowserContext | null = null;
  try {
    await runtime.startWeb(spec.env);
    context = await browser.newContext({ baseURL: runtime.url.web() });
    // Collab clients allocate their own BrowserContext, so the suite-level
    // context fixture never runs here. Seed campaign dismissals before the
    // first navigation or the home modal backdrop blocks rail clicks.
    await seedCampaignDismissals(context);
    const page = await context.newPage();
    return { ...spec, context, page, runtime };
  } catch (error) {
    await context?.close().catch(() => undefined);
    try {
      await attachRuntimeLogs(runtime, spec, testInfo);
    } finally {
      await runtime.stopWeb(spec.env).catch(() => undefined);
    }
    throw error;
  }
}

async function closeStartedClients(
  clients: readonly CollabClusterClient[],
  clusterRoot: string,
  testInfo: TestInfo,
  preserve: boolean,
): Promise<void> {
  await Promise.all(clients.map(async (client) => {
    await client.context.close().catch(() => undefined);
    try {
      if (preserve) await attachRuntimeLogs(client.runtime, client, testInfo);
    } finally {
      await client.runtime.stopWeb(client.env).catch(() => undefined);
    }
  }));
  if (!preserve) {
    await rm(clusterRoot, { force: true, recursive: true });
  }
}

async function attachRuntimeLogs(
  runtime: ToolsDevSuite,
  client: CollabClusterClientSpec,
  testInfo: TestInfo,
): Promise<void> {
  try {
    const logs = await runtime.logs(client.env).catch(() => null);
    if (!logs) return;
    await testInfo.attach(`collab-${client.id}-runtime-logs`, {
      body: JSON.stringify(logs, null, 2),
      contentType: 'application/json',
    });
  } catch {
    // Diagnostics are best effort and must never mask startup failures or
    // prevent already-acquired client resources from being released.
  }
}

function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe.slice(0, 80) || 'client';
}
