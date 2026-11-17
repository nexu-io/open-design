import { randomUUID, createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { Page, Request, Response, TestInfo } from '@playwright/test';
import type { WorkspaceBillingPreflight, WorkspaceBillingResponse } from '@open-design/contracts';
import { requireScopedFundingPreflight } from './workspace-funding-preflight.ts';

import { expect } from './suite.ts';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from './runtime-lifecycle.ts';
import { fundingHeaders, readFundingFixture, requireDpModelCoverage, type FundingSpace, type FundingFixture } from './workspace-funding-fixture.ts';
import { verifyFundingLease } from './workspace-funding-lease.ts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../tools-dev/runtime.ts';
import { T } from '../timeouts.ts';

export type Preflight = WorkspaceBillingPreflight;

export async function startFundingClient(page: Page, info: TestInfo, options: {
  preserveSelectedLocale?: boolean; initialSpace?: keyof FundingFixture['spaces'];
  freeWallet?: 'retained' | 'giftOnly'; freeWalletPhase?: 'before' | 'after';
  scopeSwitch?: boolean;
} = {}) {
  if (process.env.OD_FUNDING_OWNER_RUNNER !== 'active') {
    throw new Error('Use the mandatory funding-runner entrypoint; direct Playwright invocation is not owned');
  }
  const loaded = await readFundingFixture();
  const wallet = options.freeWallet ? loaded.freeWallet?.[options.freeWallet] : undefined;
  if (options.freeWallet && !wallet) throw new Error('Explicit real personal Free wallet required');
  const switchGiven = options.scopeSwitch ? loaded.scopeSwitch : undefined;
  if (options.scopeSwitch && !switchGiven?.deviceRuntimeKey) throw new Error('Explicit WS-005 account DeviceAuthorization credential required');
  const fixture = wallet ? { ...loaded, actor: wallet.actor } : loaded;
  const client = await startScopedFundingClient(page, info, {
    fixture,
    initialSpace: wallet?.space ?? switchGiven?.spaces.a ?? fixture.spaces[options.initialSpace ?? 'dp'],
    checkedSpaces: wallet ? { wallet: wallet.space } : switchGiven?.spaces ?? fixture.spaces,
    runtimeKey: wallet?.space.runtimeKey ?? switchGiven?.deviceRuntimeKey ?? fixture.spaces[options.initialSpace ?? 'dp'].runtimeKey,
    ...(options.freeWallet ? { identitySuffix: options.freeWallet } : {}),
    attachmentPrefix: options.freeWallet ? `VIEW021-${options.freeWallet}-` : '',
    requireNamePrefix: !wallet,
    ...(options.preserveSelectedLocale !== undefined ? { preserveSelectedLocale: options.preserveSelectedLocale } : {}),
    checkPreflight(alias, space, preflight) {
      // Free has no subscription-backed Design Plan descriptor.
      if (!switchGiven) expect(preflight.codingPlan.tier).toBe(wallet ? null : 'go');
      if (switchGiven) expect(Number(preflight.balanceUsd)).toBe(alias === 'a' ? 10 : 20);
      if (wallet) {
        expect(preflight.codingPlan.eligible).toBe(false);
        expect(preflight.codingPlan.windows).toEqual([]);
        expect(space.workspaceKind).toBe('personal');
        expect(space.actorRole).toBe('owner');
        expect(Number(preflight.balanceUsd)).toBe(Number(options.freeWalletPhase === 'after' ? wallet.afterBalanceUsd : wallet.beforeBalanceUsd));
      }
      // `unknown` is a legitimate advisory result for funded/DP-eligible
      // inputs. Only B needs a reliable insufficient verdict; Link remains
      // authoritative for actual model admission.
      if (alias === 'funded') expect(Number(preflight.balanceUsd)).toBe(100);
      if (alias === 'empty') {
        expect(Number(preflight.balanceUsd)).toBe(0);
        expect(preflight.fundingCheck).toBe('insufficient');
        expect(preflight.codingPlan.windows.length).toBe(2);
        expect(preflight.codingPlan.windows.every(w => Number(w.remainingCredits) === 0)).toBe(true);
      }
      if (alias === 'dp') {
        expect(Number(preflight.balanceUsd)).toBe(0);
        requireDpModelCoverage(preflight.modelCovered === true);
        expect(preflight.codingPlan.eligible).toBe(true);
        expect(preflight.codingPlan.windows.length).toBe(2);
        expect(preflight.codingPlan.windows.every(w => Number(w.remainingCredits) > 0)).toBe(true);
        expect(preflight.fundingCheck).not.toBe('insufficient');
      }
    },
  });
  return { ...client, fixture };
}

/** Shared owned runtime, real directory and close path for scoped billing witnesses. */
export async function startScopedFundingClient(page: Page, info: TestInfo, options: {
  fixture: Pick<FundingFixture, 'isolation' | 'owner' | 'upstream' | 'runtime' | 'actor'>;
  initialSpace: FundingSpace;
  checkedSpaces: Record<string, FundingSpace>;
  runtimeKey: string;
  identitySuffix?: string;
  attachmentPrefix?: string;
  requireNamePrefix: boolean;
  preserveSelectedLocale?: boolean;
  checkPreflight: (alias: string, space: FundingSpace, preflight: Preflight) => void | Promise<void>;
}) {
  if (process.env.OD_FUNDING_OWNER_RUNNER !== 'active') {
    throw new Error('Use the mandatory funding-runner entrypoint; direct Playwright invocation is not owned');
  }
  const { fixture, initialSpace, checkedSpaces } = options;
  const ownerPre = await verifyFundingLease(fixture, T.xlong * 7);
  const namespace = `funding-${process.pid}-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const runtime = createToolsDevSuite({
    root, namespace, ownerPid: process.pid,
    dataDir: join(scratch, 'data'),
    toolsDevRoot: join(scratch, 'tools-dev'),
    codexHomeDir: join(scratch, 'codex-home'),
  });
  const amrHome = join(scratch, 'amr-home');
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await mkdir(runtime.dataDir, { recursive: true });
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: fixture.actor.controlKey,
    runtimeKey: options.runtimeKey,
    apiUrl: fixture.upstream.apiUrl,
    linkUrl: fixture.upstream.linkUrl,
    user: { id: fixture.actor.userId, email: fixture.actor.email, name: 'Disposable funding QA' },
  } } }), { mode: 0o600 });
  const config = {
    privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false },
    mode: 'daemon', agentId: 'amr', model: fixture.runtime.modelId, onboardingCompleted: true,
    agentModels: { amr: { model: fixture.runtime.modelId } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: fixture.runtime.velaBin } },
  };
  await writeFile(join(runtime.dataDir, 'app-config.json'), JSON.stringify(config));
  const env = {
    AMR_HOME: amrHome, VELA_BIN: fixture.runtime.velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.upstream.apiUrl,
    VELA_LINK_URL: fixture.upstream.linkUrl, VELA_CONTROL_KEY: fixture.actor.controlKey,
    VELA_OPENCODE_BIN: fixture.runtime.openCodeBin,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.upstream.webUrl,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
  };
  const posts: Array<{ path: string; workspaceId: string | undefined }> = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && ['/api/projects', '/api/runs'].includes(path)) {
      posts.push({ path, workspaceId: request.headers()['x-od-workspace-id'] });
    }
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort();
  });
  const identityPath = info.outputPath(`owned-runtime-identity${options.identitySuffix ? `-${options.identitySuffix}` : ''}.safe.json`);
  await mkdir(dirname(identityPath), { recursive: true });
  await writeFile(identityPath, JSON.stringify({ namespace, root, dataDir: runtime.dataDir,
    toolsDevRoot: runtime.toolsDevRoot, testPid: process.pid }, null, 2), { mode: 0o600 });
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
  } catch (error) {
    await page.close().catch(() => undefined);
    await runtime.stopWeb(env);
    throw error;
  }
  const attach = async (name: string, value: unknown) => info.attach(`${options.attachmentPrefix ?? ''}${name}`, {
    body: JSON.stringify(value, null, 2), contentType: 'application/json',
  });
  try {
    const directoryResponse = await fetch(runtime.url.web('/api/workspace/directory'));
    expect(directoryResponse.ok).toBe(true);
    const directory = await directoryResponse.json() as {
      items?: Array<{ workspaceId: string; workspaceName: string; workspaceMemberId: string; role: string }>;
      workspaces?: Array<{ workspaceId: string; workspaceName: string; workspaceMemberId: string; role: string }>;
    };
    const items = directory.items ?? directory.workspaces ?? [];
    for (const space of Object.values(checkedSpaces)) {
      const item = items.find(item => item.workspaceId === space.workspaceId);
      expect(item, 'Every sandbox workspace must be authorized for the explicit actor').toBeTruthy();
      if (options.requireNamePrefix) expect(item!.workspaceName.startsWith(fixture.isolation.workspaceNamePrefix), 'Sandbox workspace isolation prefix').toBe(true);
      expect(item!.workspaceMemberId).toBe(space.actorMemberId ?? space.ownerMemberId);
      expect(item!.role).toBe(space.actorRole ?? 'owner');
    }
    const preconditions: Record<string, Preflight> = {};
    for (const [alias, space] of Object.entries(checkedSpaces)) {
      const url = new URL('/api/workspace/billing', runtime.url.web());
      url.search = new URLSearchParams({ scope: 'workspace', workspaceId: space.workspaceId,
        includePreflight: '1', modelId: fixture.runtime.modelId }).toString();
      const response = await fetch(url, { headers: fundingHeaders(space) });
      const rawBody = await response.text();
      // Keep the exact failed prerequisite too; a failed assertion must not
      // leave only an undefined-field error with no original response.
      await attach(`real-sandbox-preflight-${alias}`, {
        workspaceId: space.workspaceId, modelId: fixture.runtime.modelId,
        status: response.status, body: rawBody,
      });
      expect(response.ok).toBe(true);
      const preflight = requireScopedFundingPreflight(JSON.parse(rawBody) as WorkspaceBillingResponse, {
        workspaceId: space.workspaceId,
        workspaceMemberId: space.actorMemberId ?? space.ownerMemberId,
        modelId: fixture.runtime.modelId,
      });
      await options.checkPreflight(alias, space, preflight);
      preconditions[alias] = preflight;
    }
    await attach('real-sandbox-preconditions', { runId: fixture.isolation.runId,
      amrSha: fixture.upstream.amrSha, velaSha256: fixture.runtime.velaSha256,
      openCodeSha256: fixture.runtime.openCodeSha256, preconditions });
    await attach('canonical-owner-live-pre', ownerPre.safe);
    await page.addInitScript(({ config, space, preserveSelectedLocale }) => {
      localStorage.setItem('open-design:config', JSON.stringify(config));
      if (!preserveSelectedLocale || !localStorage.getItem('open-design:locale')) localStorage.setItem('open-design:locale', 'en');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({
        workspaceId: space.workspaceId, workspaceMemberId: space.actorMemberId ?? space.ownerMemberId,
      }));
    }, { config, space: initialSpace, preserveSelectedLocale: options.preserveSelectedLocale ?? false });
    const select = async (space: FundingSpace) => {
      const toggle = page.getByTestId('entry-rail-collapse');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click({ timeout: T.medium });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const item = items.find(item => item.workspaceId === space.workspaceId)!;
      const switcher = page.getByTestId('workspace-switcher');
      const selected = await page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? 'null')?.workspaceId);
      await switcher.click({ timeout: T.medium });
      const row = page.getByTestId('workspace-switcher-list').getByRole('menuitem')
        .filter({ hasText: item.workspaceName });
      if (selected === space.workspaceId) {
        await expect(row).toHaveAttribute('aria-current', 'true');
        // This backdrop is scoped to the rail: its center may be covered by a long menu.
        await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 }, timeout: T.medium });
        await expect(switcher).toHaveAttribute('aria-expanded', 'false');
        return; // Selecting the already-current workspace correctly sends no PUT.
      }
      const changed = page.waitForResponse(r => r.request().method() === 'PUT'
        && new URL(r.url()).pathname === '/api/workspace/active', { timeout: T.medium });
      await row.click({ timeout: T.medium });
      const response = await changed;
      expect(response.ok()).toBe(true);
      expect((await response.json()).context.workspaceId).toBe(space.workspaceId);
      await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('od.workspaceSelection.v1') ?? 'null')?.workspaceId)).toBe(space.workspaceId);
    };
    return {
      fixture, runtime, posts, attach, select, authorizedSpaces: items,
      async createProject(space: FundingSpace) {
        const id = `funding-${randomUUID()}`;
        const response = await fetch(runtime.url.web('/api/projects'), {
          method: 'POST', headers: { ...fundingHeaders(space), 'content-type': 'application/json' },
          body: JSON.stringify({ id, name: 'Disposable workspace funding regression', metadata: { kind: 'prototype' } }),
        });
        expect(response.ok).toBe(true);
        return id;
      },
      async close(closeOptions: { preserveScratch?: boolean } = {}) {
        await info.attach(`${options.attachmentPrefix ?? ''}final-observed-page`, { body: await page.screenshot(), contentType: 'image/png' }).catch(() => undefined);
        await attach('actual-POST-scopes', posts);
        let pageClosed = false;
        try {
          try {
            await page.close();
            pageClosed = true;
          }
          finally {
            try { await runtime.stopWeb(env); }
            finally {
              const stopped = await runtime.status(env);
              await attach('owned-runtime-stopped', stopped);
              expect(Object.values(stopped.apps ?? {}).every(app => !app?.pid), 'Every owned process must be terminal').toBe(true);
            }
          }
        } finally {
          await attach('canonical-owner-live-post', (await verifyFundingLease(fixture, 0)).safe);
        }
        if (pageClosed && info.status === info.expectedStatus && !closeOptions.preserveScratch) {
          await rm(root, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await page.close().catch(() => undefined);
    await runtime.stopWeb(env);
    throw error;
  }
}

export function holdRealBilling(page: Page, workspaceIds: string[]) {
  type Held = { workspaceId: string; path: string; sha256: string; bodyText: string;
    upstreamFetchedAt: number; browserCompletedAt: number | null; browserStatus: number | null; requestFailure: string | null;
    release: () => Promise<void>; cleanup: () => Promise<void> };
  const held: Held[] = [];
  let enabled = true;
  const install = page.route('**/api/workspace/billing**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const workspaceId = url.searchParams.get('workspaceId') ?? request.headers()['x-od-workspace-id'] ?? '';
    if (!enabled || !workspaceIds.includes(workspaceId)) return route.continue();
    // Only delivery timing is controlled. No balances, funding verdicts, or
    // upstream bytes are supplied by this test.
    const response = await route.fetch({ timeout: T.xlong });
    const body = await response.body();
    if (!enabled) return route.fulfill({ response, body });
    let unblock!: () => void;
    const blocked = new Promise<void>(resolve => { unblock = resolve; });
    let fulfilled!: () => void;
    const done = new Promise<void>(resolve => { fulfilled = resolve; });
    let released: Promise<void> | undefined;
    const row: Held = { workspaceId, path: url.pathname, bodyText: body.toString('utf8'),
      sha256: createHash('sha256').update(body).digest('hex'),
      upstreamFetchedAt: Date.now(), browserCompletedAt: null, browserStatus: null, requestFailure: null,
      release: () => released ??= (async () => {
          const arrived = new Promise<Response | null>((resolve, reject) => {
            let settled = false;
            const finish = (value: Response | null, error?: Error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              page.off('response', onResponse);
              page.off('requestfailed', onFailure);
              if (error) reject(error); else resolve(value);
            };
            const onFailure = (failed: Request) => {
              if (failed !== request) return;
              row.requestFailure = failed.failure()?.errorText ?? 'unknown request failure';
              if (row.requestFailure === 'net::ERR_ABORTED' || row.requestFailure === 'ERR_ABORTED') finish(null);
              else finish(null, new Error(`Unexpected billing request failure: ${row.requestFailure}`));
            };
            const onResponse = (observed: Response) => {
              if (observed.request() === request) finish(observed);
            };
            const timeout = setTimeout(() => finish(null, new Error('Billing delivery completion signal timed out')), T.long);
            page.on('response', onResponse);
            page.on('requestfailed', onFailure);
            // A workspace switch may already have canceled this exact request.
            // Register first so an in-flight abort cannot fall between checks.
            if (request.failure()) onFailure(request);
          });
          unblock();
          const browserResponse = await arrived;
          if (browserResponse) {
            row.browserStatus = browserResponse.status();
            const error = await browserResponse.finished();
            if (error) {
              row.requestFailure = request.failure()?.errorText ?? String(error);
              expect(['net::ERR_ABORTED', 'ERR_ABORTED']).toContain(row.requestFailure);
            } else row.browserCompletedAt = Date.now();
          }
          await done;
        })(),
      cleanup: async () => { unblock(); await done; },
    };
    held.push(row);
    await blocked;
    try { await route.fulfill({ response, body }); }
    catch (error) {
      const failure = request.failure()?.errorText;
      if (failure !== 'net::ERR_ABORTED' && failure !== 'ERR_ABORTED') throw error;
    }
    finally { fulfilled(); }
  });
  return { held, install,
    stopHolding() { enabled = false; },
    async release(workspaceId: string) {
      const matching = held.filter(row => row.workspaceId === workspaceId);
      expect(matching.length).toBeGreaterThan(0);
      await Promise.all(matching.map(row => row.release()));
    },
    async dispose() {
      enabled = false;
      // Cleanup only: canceled navigation may prevent a browser receipt.
      await Promise.allSettled(held.map(row => row.cleanup()));
      await page.unroute('**/api/workspace/billing**');
    },
  };
}
