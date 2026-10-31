import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Request } from '@playwright/test';
import { test as base, expect } from '@/playwright/suite';
import { T } from '@/timeouts';
import { ensureRailOpen } from '@/playwright/rail';
import { createToolsDevSuite } from '@/tools-dev/runtime';
import { warmPlaywrightWebRuntime, warmPlaywrightDaemonRuntime } from '@/playwright/runtime-lifecycle';
import { suppressWhatsNew } from '@/playwright/mock-factory';

type Ticket = {
  schemaVersion: 1;
  amrSha: string;
  directory: string;
  apiUrl: string;
  physicalApiUrl: string;
  linkUrl: string;
  controlUrl: string;
  nonce: string;
  amrConfigPath: string;
  actorUserId: string;
  workspaceId: string;
  workspaceMemberId: string;
  cliPath: string;
  actualAPIPID: number;
  roleActors: Array<{role: "admin" | "member"; userId: string; workspaceMemberId: string; amrConfigPath: string}>;
};
type Scope = {
  workspaceId: string;
  workspaceMemberId: string;
  workspaceType: string;
  workspaceName?: string;
  role: 'owner' | 'admin' | 'member';
  lifecycleState: string;
  memberStatus: string;
  permissions?: { canShareProjects?: boolean; canWriteSyncedFiles?: boolean };
};
type Call = { requestId: string; correlationId: string; frameIndex: number; balance: string; walletRevision: string };
const test = base.extend({ _defaultCloudStatus: async ({}, use) => { await use(); } });
const ticketPath = process.env.MIGRATION_UI_TICKET;
const output = process.env.MIGRATION_UI_OUTPUT;
assert.equal(Boolean(ticketPath), Boolean(output), 'MIGRATION_UI_TICKET and MIGRATION_UI_OUTPUT must be configured together.');
test.skip(!ticketPath, 'Specialized cross-repository test: requires the owned live AMR driver and evidence output.');

function headers(scope: Scope) {
  return {
    'x-od-workspace-id': scope.workspaceId,
    'x-od-workspace-member-id': scope.workspaceMemberId,
    'x-od-workspace-type': scope.workspaceType,
    'x-od-workspace-role': scope.role,
    'x-od-workspace-lifecycle-state': scope.lifecycleState,
    'x-od-workspace-member-status': scope.memberStatus,
    'x-od-workspace-can-share-projects': String(scope.permissions?.canShareProjects === true),
    'x-od-workspace-can-write-synced-files': String(scope.permissions?.canWriteSyncedFiles === true),
  };
}
function usd(credits: string) {
  const value = BigInt(credits);
  // The AMR fixture's actual persisted credits use 10000 credits per USD.
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) / 10000);
}

function installBillingFetchDiagnostics() {
    localStorage.setItem('open-design:locale', 'en'); localStorage.setItem('open-design:locale-source', 'manual');
    const diagnostics: Record<string, number> = {};
    Object.defineProperty(window, '__migrationBillingFetchStacks', { value: diagnostics });
    const originalFetch = window.fetch.bind(window);
    window.fetch = (...args) => {
      const raw = args[0] instanceof Request ? args[0].url : String(args[0]);
      if (new URL(raw, location.href).pathname === '/api/workspace/billing') {
        const stack = new Error('actual billing fetch caller').stack ?? 'unknown caller';
        if (diagnostics[stack] !== undefined || Object.keys(diagnostics).length < 20) diagnostics[stack] = (diagnostics[stack] ?? 0) + 1;
      }
      return originalFetch(...args);
    };
}

test('[P1] MIG020 actual migration wallet notifications preserve the page and financial records', async ({ page, context, browser, toolsDev }) => {
  test.setTimeout(360_000);
  assert.ok(ticketPath && output, 'Explicit owned AMR driver ticket and evidence output required; no mocked fallback.');
  const ticket = JSON.parse(await readFile(ticketPath, 'utf8')) as Ticket;
  expect(ticket.schemaVersion).toBe(1);
  expect(ticket.roleActors.map(actor => actor.role).sort()).toEqual(["admin", "member"]);
  expect(ticket.amrSha).toMatch(/^[a-f0-9]{40}$/);
  for (const raw of [ticket.apiUrl, ticket.physicalApiUrl, ticket.linkUrl, ticket.controlUrl]) {
    const url = new URL(raw); expect(url.protocol).toBe('http:'); expect(url.hostname).toBe('127.0.0.1'); expect(url.username + url.password + url.search + url.hash).toBe('');
  }
  const save = (name: string, value: unknown) => writeFile(join(output, name), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  const control = async <T,>(action: string, index?: number): Promise<T> => {
    const response = await page.request.post(ticket.controlUrl, { headers: { 'x-migration-ui-nonce': ticket.nonce }, data: { action, ...(index === undefined ? {} : { index }) } });
    // The test-only command surface is /; production API reads stay untouched.
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json() as T;
  };
  const state = async () => {
    const response = await page.request.get(ticket.controlUrl + '/state', { headers: { 'x-migration-ui-nonce': ticket.nonce } });
    expect(response.ok(), await response.text()).toBe(true);
    return await response.json() as { calls: Call[]; frames: Array<Record<string, unknown>>; streams: number; facts: unknown };
  };
  const reads: unknown[] = []; const requests = new WeakMap<Request, number>();
  const browserErrors: Array<{ type: string; message: string }> = [];
  const errors: unknown[] = [];
  let passed = false;
  const cleanup = async (action: () => unknown | Promise<unknown>) => {
    try { await action(); } catch (error) { errors.push(error); }
  };
  try {
    await mkdir(output, { mode: 0o700 });
  const home = join(toolsDev.root, 'scratch', 'amr-home');
  await mkdir(home, { recursive: true });
  await copyFile(ticket.amrConfigPath, join(home, 'config.json')); await chmod(join(home, 'config.json'), 0o600);
  const sourceHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  page.on('pageerror', error => browserErrors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'warning' || message.type() === 'error') browserErrors.push({ type: message.type(), message: message.text() });
  });
  page.on('request', request => requests.set(request, Date.now()));
  page.on('response', async response => {
    const url = new URL(response.url());
    if (!['/api/workspace/billing', '/api/workspace/context', '/api/integrations/vela/status'].includes(url.pathname)) return;
    reads.push({ at: Date.now(), startedAt: requests.get(response.request()), path: url.pathname, status: response.status(), scope: response.request().headers()['x-od-workspace-id'] ?? url.searchParams.get('workspaceId'), body: await response.json().catch(() => null) });
  });
  await context.addInitScript(installBillingFetchDiagnostics);
  await expect.poll(async () => {
    const response = await page.request.get('/api/integrations/vela/status'); const status = await response.json();
    return status.loggedIn === true && status.profile === 'local' && status.user?.id === ticket.actorUserId;
  }, { timeout: T.long }).toBe(true);
  const directory = await (await page.request.get('/api/workspace/directory')).json();
  const scope = directory.items.find((entry: Scope) => entry.workspaceId === ticket.workspaceId) as Scope;
  expect(scope.workspaceMemberId).toBe(ticket.workspaceMemberId); expect(scope.role).toBe('owner'); expect(scope.memberStatus).toBe('active');
  const resolved = await page.request.get('/api/workspace/context', { headers: headers(scope) }); expect(resolved.ok()).toBe(true);
  const authority = (await resolved.json()).context as Scope;
  expect(authority.workspaceId).toBe(ticket.workspaceId); expect(authority.workspaceMemberId).toBe(ticket.workspaceMemberId);
  expect((await page.request.put('/api/workspace/active', { data: { workspaceId: scope.workspaceId, workspaceMemberId: scope.workspaceMemberId } })).ok()).toBe(true);
  expect((await page.request.put('/api/app-config', { data: { mode: 'daemon', agentId: 'amr', skillId: null, designSystemId: null, onboardingCompleted: true, privacyDecisionAt: 1, agentCliEnv: {}, mediaProviders: {} } })).ok()).toBe(true);
  const snapshot = async (target = scope) => {
    const response = await page.request.get('/api/workspace/billing?scope=workspace&workspaceId=' + encodeURIComponent(target.workspaceId), { headers: headers(target) });
    expect(response.ok(), await response.text()).toBe(true); const body = await response.json();
    expect(body.workspaceSnapshot?.workspaceId ?? body.workspaceBalance?.workspaceId).toBe(target.workspaceId);
    if (body.workspaceSnapshot) expect(body.workspaceSnapshot.workspaceMemberId).toBe(target.workspaceMemberId);
    return body;
  };
  const open = async () => {
    const chip = page.getByTestId('entry-top-right-credits'); await expect(chip).toBeVisible({ timeout: T.long }); await chip.click();
    await expect(page.getByTestId('entry-top-right-credits-panel')).toBeVisible();
  };
  const row = page.getByTestId('entry-nav-credits-row');
    await page.goto('/', { waitUntil: 'domcontentloaded' }); await open();
    const initial = await snapshot(); await expect(row).toContainText(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(initial.workspaceSnapshot.wallet.balanceUsd)));
    await page.screenshot({ path: join(output, 'before-original-consumption.png'), fullPage: true });
    await expect.poll(async () => (await state()).streams, { timeout: T.long }).toBeGreaterThan(0);
    const A = await control<Call>('consume'); const B = await control<Call>('consume');
    expect(A.requestId).not.toBe(B.requestId); expect(BigInt(B.walletRevision)).toBeGreaterThan(BigInt(A.walletRevision)); expect(BigInt(B.balance)).toBeLessThan(BigInt(A.balance));
    const primary = await state();
    const newest = await control<Record<string, unknown>>('deliver', B.frameIndex);
    expect(newest.workspaceId).toBe(scope.workspaceId);
    await expect(row).toContainText(usd(B.balance), { timeout: T.long });
    const afterNew = await snapshot(); expect(Number(afterNew.workspaceSnapshot.wallet.balanceUsd)).toBe(Number(B.balance) / 10000);
    await page.screenshot({ path: join(output, 'newer-B-notification-page.png'), fullPage: true });
    const old = await control<Record<string, unknown>>('deliver', A.frameIndex);
    expect(old.workspaceId).toBe(scope.workspaceId); expect(old.revision).not.toBe(newest.revision);
    // Re-read the native authority after the late signal; do not wait a guessed interval.
    const afterOld = await snapshot(); expect(afterOld.workspaceSnapshot.wallet).toEqual(afterNew.workspaceSnapshot.wallet);
    await expect(row).toContainText(usd(B.balance));
    await control('deliver', A.frameIndex); await control('deliver', B.frameIndex);
    const afterRepeat = await snapshot(); expect(afterRepeat.workspaceSnapshot.wallet).toEqual(afterNew.workspaceSnapshot.wallet);
    expect((await state()).facts).toEqual(primary.facts);
    await page.screenshot({ path: join(output, 'older-A-and-duplicate-notifications-page.png'), fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' }); await open(); await expect(row).toContainText(usd(B.balance), { timeout: T.long });
    expect((await snapshot()).workspaceSnapshot.wallet).toEqual(afterNew.workspaceSnapshot.wallet);
    await control('disconnect'); await expect.poll(async () => (await state()).streams, { timeout: T.long }).toBeGreaterThan(0);
    expect((await snapshot()).workspaceSnapshot.wallet).toEqual(afterNew.workspaceSnapshot.wallet);
    await expect(row).toContainText(usd(B.balance)); expect((await state()).facts).toEqual(primary.facts);
    await page.screenshot({ path: join(output, 'refresh-and-real-SSE-reconnect-page.png'), fullPage: true });
    const roleIsolation: unknown[] = [];
    // Each actor starts normally in an isolated daemon; rotating another running
    // daemon's CLI file is not the product's login or account-switch flow.
    for (const actor of ticket.roleActors) {
      const coldRoot = join(toolsDev.root, actor.role + '-cold'); const coldHome = join(coldRoot, 'scratch', 'amr-home');
      await mkdir(coldHome, { recursive: true }); await copyFile(actor.amrConfigPath, join(coldHome, 'config.json')); await chmod(join(coldHome, 'config.json'), 0o600);
      const cold = createToolsDevSuite({ root: coldRoot, namespace: toolsDev.namespace + '-' + actor.role + '-cold', dataDir: join(coldRoot, 'scratch', 'data'), codexHomeDir: join(coldRoot, 'scratch', 'codex-home'), toolsDevRoot: join(coldRoot, 'scratch', 'tools-dev'), ownerPid: process.pid });
      const coldEnv = { AMR_HOME: coldHome, OD_DATA_DIR: cold.dataDir, VELA_BIN: ticket.cliPath, VELA_PROFILE: 'local', VELA_API_URL: ticket.apiUrl, VELA_LINK_URL: ticket.linkUrl, OD_WORKSPACE_CONTEXT_SOURCE: 'vela' };
      const coldReads: unknown[] = [];
      const coldErrors: unknown[] = [];
      let ownedColdContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
      let ownedColdPage: Awaited<ReturnType<typeof context.newPage>> | undefined;
      let coldStartAttempted = false;
      const cleanupCold = async (action: () => unknown | Promise<unknown>) => {
        try { await action(); } catch (error) { coldErrors.push(error); }
      };
      try {
        const coldContext = await browser.newContext(); ownedColdContext = coldContext;
        const coldPage = await coldContext.newPage(); ownedColdPage = coldPage;
        coldPage.on('response', async response => { const url = new URL(response.url()); if (url.pathname === '/api/workspace/billing' || url.pathname === '/api/workspace/context') coldReads.push({ path: url.pathname, status: response.status(), body: await response.json().catch(() => null) }); });
        coldStartAttempted = true;
        await cold.startWeb(coldEnv); await warmPlaywrightWebRuntime(cold.url.web('/')); await warmPlaywrightDaemonRuntime(cold.url.daemon('/api/health'));
        const coldUrl = (path: string) => new URL(path, cold.webUrl!).toString();
        const status = await (await coldPage.request.get(coldUrl('/api/integrations/vela/status'))).json(); expect(status.loggedIn).toBe(true); expect(status.user.id).toBe(actor.userId);
        const coldDirectory = (await (await coldPage.request.get(coldUrl('/api/workspace/directory'))).json()).items as Scope[];
        const coldScope = coldDirectory.find(item => item.workspaceId === scope.workspaceId); assert.ok(coldScope); expect(coldScope.role).toBe(actor.role); expect(coldScope.workspaceMemberId).toBe(actor.workspaceMemberId);
        expect((await coldPage.request.put(coldUrl('/api/workspace/active'), { data: { workspaceId: coldScope.workspaceId, workspaceMemberId: coldScope.workspaceMemberId } })).ok()).toBe(true);
        expect((await coldPage.request.put(coldUrl('/api/app-config'), { data: { mode: 'daemon', agentId: 'amr', skillId: null, designSystemId: null, onboardingCompleted: true, privacyDecisionAt: 1, agentCliEnv: {}, mediaProviders: {} } })).ok()).toBe(true);
        await coldPage.addInitScript(installBillingFetchDiagnostics);
        await suppressWhatsNew(coldPage); await coldPage.goto(cold.url.web('/'), { waitUntil: 'domcontentloaded' });
        const coldOpen = async () => { await coldPage.getByTestId('entry-top-right-credits').click(); await expect(coldPage.getByTestId('entry-top-right-credits-panel')).toBeVisible(); };
        await coldOpen(); await expect(coldPage.getByTestId('entry-nav-credits-row')).toContainText(usd(B.balance), { timeout: T.long });
        const nativeSnapshot = async (target: Scope) => {
          // The server resolves the signed-in actor from its real CLI session.
          // Directory items are selection metadata, not permission claims.
          const response = await coldPage.request.get(coldUrl('/api/workspace/billing?scope=workspace&workspaceId=' + encodeURIComponent(target.workspaceId)));
          const rawBody = await response.text(); await save(actor.role + '-native-read-' + target.workspaceType + '-' + Date.now() + '.json', { url: response.url(), status: response.status(), rawBody });
          expect(response.headers()['content-type']).toContain('application/json'); const body = JSON.parse(rawBody);
          expect(response.ok(), JSON.stringify(body)).toBe(true); expect(body.workspaceSnapshot?.workspaceId ?? body.workspaceBalance?.workspaceId).toBe(target.workspaceId);
          if (body.workspaceSnapshot) expect(body.workspaceSnapshot.workspaceMemberId).toBe(target.workspaceMemberId);
          return body;
        };
        const coldSnapshot = await nativeSnapshot(coldScope); expect(Number(coldSnapshot.workspaceSnapshot.wallet.balanceUsd)).toBe(Number(B.balance) / 10000);
        await control('deliver', A.frameIndex); await control('deliver', B.frameIndex); await expect(coldPage.getByTestId('entry-nav-credits-row')).toContainText(usd(B.balance)); expect((await state()).facts).toEqual(primary.facts);
        const coldAfter = await nativeSnapshot(coldScope); expect(coldAfter.workspaceSnapshot.wallet).toEqual(coldSnapshot.workspaceSnapshot.wallet);
        await coldPage.screenshot({ path: join(output, actor.role + '-actual-member-scoped-wallet.png'), fullPage: true });
        const personal = coldDirectory.find(item => item.workspaceType === 'personal'); assert.ok(personal?.workspaceName); expect(personal.workspaceId).not.toBe(coldScope.workspaceId);
        await ensureRailOpen(coldPage);
        const switchTo = async (target: Scope) => {
          assert.ok(target.workspaceName); await coldPage.getByTestId('workspace-switcher').click();
          const item = coldPage.getByTestId('workspace-switcher-list').getByRole('menuitem').filter({ hasText: target.workspaceName }); await expect(item).toHaveCount(1);
          const switched = coldPage.waitForResponse(response => new URL(response.url()).pathname === '/api/workspace/active' && response.request().method() === 'PUT' && response.request().postDataJSON()?.workspaceId === target.workspaceId);
          await item.click(); expect((await switched).ok()).toBe(true);
        };
        await switchTo(personal); const personalBefore = await nativeSnapshot(personal); await coldOpen();
        await expect(coldPage.getByTestId('entry-top-right-credits-panel')).not.toContainText(usd(B.balance));
        await control('deliver', A.frameIndex); const personalAfter = await nativeSnapshot(personal);
        expect(personalAfter.workspaceSnapshot?.wallet ?? personalAfter.workspaceBalance).toEqual(personalBefore.workspaceSnapshot?.wallet ?? personalBefore.workspaceBalance);
        await expect(coldPage.getByTestId('entry-top-right-credits-panel')).not.toContainText(usd(B.balance));
        await coldPage.screenshot({ path: join(output, actor.role + '-other-space-ignores-original-team-frame.png'), fullPage: true });
        await switchTo(coldScope); await coldOpen(); await expect(coldPage.getByTestId('entry-nav-credits-row')).toContainText(usd(B.balance), { timeout: T.long });
        expect((await nativeSnapshot(coldScope)).workspaceSnapshot.workspaceMemberId).toBe(actor.workspaceMemberId); expect((await state()).facts).toEqual(primary.facts);
        const roleResult = { coldScope, coldSnapshot, coldAfter, personal: { workspaceId: personal.workspaceId, workspaceMemberId: personal.workspaceMemberId }, personalBefore, personalAfter, runtime: await cold.status(coldEnv), sourceHead, nativeLoginUserId: status.user.id, unchangedFinance: true };
        await save(actor.role + '-cold-start-result.json', roleResult); roleIsolation.push(roleResult);
        // Preserve the exact result of the older test's additional client claims.
        const claimedPath = '/api/workspace/billing?scope=workspace&workspaceId=' + encodeURIComponent(coldScope.workspaceId);
        const claimedRead = await coldPage.request.get(coldUrl(claimedPath), { headers: headers(coldScope) });
        await save(actor.role + '-directory-claims-diagnostic.json', { url: claimedRead.url(), status: claimedRead.status(), body: await claimedRead.text(), suppliedHeaders: headers(coldScope) });
        // Retain the old test-URL construction's exact raw result as a negative
        // harness control. tools-dev's path builder encodes query delimiters.
        const encodedRead = await coldPage.request.get(cold.url.web(claimedPath), { headers: headers(coldScope) });
        await save(actor.role + '-old-encoded-query-diagnostic.json', { url: encodedRead.url(), status: encodedRead.status(), contentType: encodedRead.headers()['content-type'], rawBody: await encodedRead.text() });
      } catch (error) {
        coldErrors.push(error);
      } finally {
        if (ownedColdPage) {
          const lastPage = ownedColdPage;
          await cleanupCold(() => lastPage.screenshot({ path: join(output, actor.role + '-cold-start-last-page.png'), fullPage: true }));
          await cleanupCold(async () => save(actor.role + '-cold-start-http.json', { coldReads, text: await lastPage.locator('body').innerText().catch(() => null), fetchStacks: await lastPage.evaluate(() => (window as typeof window & { __migrationBillingFetchStacks?: Record<string, number> }).__migrationBillingFetchStacks).catch(() => null) }));
        }
        await cleanupCold(() => ownedColdContext?.close());
        if (coldStartAttempted) {
          await cleanupCold(() => cold.stopWeb(coldEnv));
          await cleanupCold(async () => save(actor.role + '-cold-start-stopped.json', await cold.status(coldEnv)));
        }
      }
      if (coldErrors.length) throw new AggregateError(coldErrors, actor.role + ' consumer and owned cleanup');
    }
    const daemonLog = await readFile(join(toolsDev.root, 'scratch/tools-dev', toolsDev.namespace, 'logs/daemon/latest.log'), 'utf8');
    const binaryTrace = daemonLog.split('\n').filter(line => line.includes('using workspace Vela:'));
    expect(binaryTrace.some(line => line.includes(ticket.cliPath))).toBe(true);
    await save('actual-result.json', { sourceHead, amrSha: ticket.amrSha, apiPID: ticket.actualAPIPID, toolsDev: { namespace: toolsDev.namespace, root: toolsDev.root, web: toolsDev.webUrl, daemon: toolsDev.daemonUrl }, cliBinarySha256: createHash('sha256').update(await readFile(ticket.cliPath)).digest('hex'), binaryTrace, scope: authority, A, B, initial, afterNew, afterOld, afterRepeat, primaryFacts: primary.facts, reads, originalNotifications: { newest, old }, roleIsolation, financialPrimaryUnchangedAfterRepeatedNotifications: true, actualAmountsOnly: '200000 raw credits original fixture; no product price or balance adjustment to emulate QA $100/$70', noIndependentPass: true });
    await control('finish');
    passed = true;
  } catch (error) {
    errors.push(error);
  } finally {
    if (!passed) await cleanup(() => control('abort'));
    await cleanup(() => save('actual-network-read-evidence.json', { reads }));
    await cleanup(async () => save('actual-browser-diagnostics.json', { browserErrors, url: page.url(), quotaSkeleton: await page.getByTestId('workspace-quota-skeleton').count().catch(() => null), fetchStacks: await page.evaluate(() => (window as typeof window & { __migrationBillingFetchStacks?: Record<string, number> }).__migrationBillingFetchStacks).catch(() => null) }));
  }
  if (errors.length) throw new AggregateError(errors, 'migration ordering witness and owned cleanup');
});
