import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

// A browser witness for the presenter/shared-cache/SSE boundary. Billing JSON
// is injected at the HTTP edge; EventSource still consumes a real HTTP stream.
// This does not claim to exercise Vela billing or provider settlement.
test('[P1] personal credits reuse cached snapshots across hover, update while hidden over SSE, and survive a failed refresh', async ({ page }, testInfo) => {
  test.setTimeout(T.xlong);
  const streams = new Set<ServerResponse>();
  const server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    });
    res.write(': connected\n\n');
    streams.add(res);
    res.on('close', () => streams.delete(res));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('SSE fixture port missing');
  const eventUrl = `http://127.0.0.1:${address.port}/events`;
  const scope = {
    workspaceId: 'ws-cache-browser', workspaceMemberId: 'member-cache-browser',
    workspaceName: 'Cache acceptance', workspaceType: 'personal',
    role: 'owner', memberStatus: 'active', lifecycleState: 'active',
  };
  const context = {
    ...scope, billingState: 'active', planId: 'go', providerMode: 'platform_credits',
    permissions: { canManageBilling: true, canManageMembers: true, canInviteMembers: true,
      canManageAutoRecharge: true, canShareProjects: true, canWriteSyncedFiles: true,
      canViewWorkspaceSettings: true, canManageSharedResources: true },
  };
  const team = { ...scope, workspaceId: 'ws-cache-team', workspaceMemberId: 'member-cache-team', workspaceType: 'team', workspaceName: 'Cache team' };
  const teamContext = { ...context, ...team, planId: 'team_plus' };
  let activeWorkspaceId = scope.workspaceId;
  let remaining = 80;
  let quotaHealthy = true;
  let requests = 0;
  let failNext = false;
  let releaseCold!: () => void;
  const coldResponse = new Promise<void>((resolve) => { releaseCold = resolve; });
  let delayPersonal = false;
  let releasePersonal: (() => void) | undefined;
  let personalHeld: (() => void) | undefined;
  const requestWitness: Array<{ count: number; remaining: number; failed: boolean }> = [];
  function emit(eventId: string, options: { legacy?: boolean; memberId?: string } = {}) {
    const type = options.legacy ? 'billing-changed' : 'coding-plan-usage-changed';
    const payload = { type, workspaceId: scope.workspaceId,
      ...(options.legacy ? {} : { workspaceMemberId: options.memberId ?? scope.workspaceMemberId }),
      eventId, at: new Date().toISOString() };
    for (const stream of streams) stream.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
  try {
    await applyStandardMocks(page);
    await page.route('**/api/integrations/vela/status*', (route) => route.fulfill({ json: {
      loggedIn: true, profile: 'test', user: { id: 'cache-user', email: 'cache@example.invalid', plan: 'go' },
    } }));
    await page.route('**/api/workspace/directory', (route) => route.fulfill({ json: { items: [scope, team], activeWorkspaceId } }));
    await page.route('**/api/workspace/context', (route) => route.fulfill({ json: { context: route.request().headers()['x-od-workspace-id'] === team.workspaceId ? teamContext : context } }));
    await page.route('**/api/workspace/active', (route) => {
      activeWorkspaceId = route.request().postDataJSON().workspaceId;
      return route.fulfill({ json: { activeWorkspaceId, context: activeWorkspaceId === team.workspaceId ? teamContext : context } });
    });
    await page.route('**/api/workspace/billing/interests/*', (route) => route.fulfill({ json: route.request().method() === 'DELETE' ? { ok: true, released: true } : {
      clientId: decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!),
      acceptedGeneration: route.request().postDataJSON().generation,
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    } }));
    await page.route('**/api/projects*', (route) => route.fulfill({ json: { projects: [] } }));
    await page.route('**/api/workspace/events*', (route) => route.fulfill({ status: 307, headers: { location: eventUrl } }));
    await page.route('**/api/workspace/billing?*', async (route) => {
      const selected = new URL(route.request().url()).searchParams.get('workspaceId') === team.workspaceId ? team : scope;
      const balanceUsd = selected === team ? '42.00' : '0.00';
      const failed = failNext;
      failNext = false;
      requests += 1;
      requestWitness.push({ count: requests, remaining, failed });
      await coldResponse;
      if (failed) { await route.fulfill({ status: 503, json: { error: 'fixture_billing_unavailable' } }); return; }
      if (delayPersonal && selected === scope) {
        await new Promise<void>((resolve) => { releasePersonal = resolve; personalHeld?.(); });
      }
      const generatedAt = await page.evaluate(() => new Date().toISOString());
      await route.fulfill({ json: {
        summary: { workspaceId: null, membershipTier: 'go', subscriptionStatus: 'active', balanceUsd: '999.00', totalAvailableCredits: 999, subscriptionCredits: 0, rechargeCredits: 0, availableActions: [], workspaceBalance: null },
        workspaceBalance: { ...selected, balanceUsd, billingScopeVersion: 2, updatedAt: generatedAt, expiresAt: null },
        quotaRealtime: { healthy: quotaHealthy },
        workspaceRuntime: { workspaceId: selected.workspaceId, workspaceMemberId: selected.workspaceMemberId,
          status: 'fresh', revision: String(requests), observedAt: generatedAt,
          softExpiresAt: new Date(Date.parse(generatedAt) + 30_000).toISOString(),
          hardExpiresAt: new Date(Date.parse(generatedAt) + 600_000).toISOString(),
          retryAt: null, errorCode: null, reason: 'browser-fixture', sourceGapDetected: false },
        preflight: {
          schemaVersion: 1, workspaceId: selected.workspaceId, workspaceMemberId: selected.workspaceMemberId,
          modelId: null, generatedAt, balanceUsd, funding: 'coding_plan', modelCovered: null,
          codingPlan: { workspaceId: selected.workspaceId, generatedAt, eligible: true, tier: 'go', windows: [18000, 604800].map((durationSeconds) => ({
            policyId: `quota-${durationSeconds}`, durationSeconds, resetMode: 'activity_triggered',
            usedCredits: String(100 - remaining), remainingCredits: String(remaining), limitCredits: '100',
            windowStart: null, resetsAt: null,
          })) },
        },
      } });
    });
    await page.clock.install();
    const initialBilling = page.waitForRequest((request) => request.url().includes('/api/workspace/billing?'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const pill = page.getByTestId('entry-top-right-credits');
    const panel = page.getByTestId('entry-top-right-credits-panel');
    await initialBilling;
    // The entry currently withholds the pill itself until its first billing
    // snapshot resolves. A component's cold skeleton is not a browser witness.
    await expect(pill).toHaveCount(0);
    releaseCold();
    await expect(pill).toBeVisible({ timeout: T.long });
    await pill.hover();
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('progressbar')).toHaveCount(2);
    await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '80');
    await expect(panel).toContainText('US$0.00');
    await expect.poll(() => streams.size).toBeGreaterThan(0);

    // Use the real pointer path: these events mount/unmount the credits card.
    const beforeHover = requests;
    for (let i = 0; i < 5; i += 1) {
      await page.mouse.move(10, 400);
      await expect(panel).toHaveCount(0);
      await pill.hover();
      await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '80');
      await expect(page.getByTestId('coding-plan-quota-skeleton')).toHaveCount(0);
    }
    expect(requests).toBe(beforeHover);
    const afterHover = requests;

    await page.clock.pauseAt(new Date(Date.now() + 1_000));
    const beforeHealthyFloor = requests;
    await page.clock.runFor(30_001);
    expect(requests, 'healthy upstream quota events + local SSE suppress 30s polling').toBe(beforeHealthyFloor);

    await page.mouse.move(10, 400);
    await page.clock.runFor(200);
    await expect(panel).toHaveCount(0);
    remaining = 70;
    const refreshed = page.waitForResponse((response) => response.url().includes('/api/workspace/billing?') && response.status() === 200);
    const beforeQuota = requests;
    emit('wrong-member', { memberId: 'other-member' });
    emit('usage-70');
    emit('usage-70');
    await refreshed;
    await pill.hover();
    await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '70');
    await expect(page.getByTestId('coding-plan-quota-skeleton')).toHaveCount(0);
    expect(requests, 'foreign member and duplicate quota events must not create extra billing reads').toBe(beforeQuota + 1);
    await expect(panel).toContainText('US$0.00');

    // Older clients receive this backend compatibility projection without a
    // wallet change, revision or clock. It must still re-read preflight.
    remaining = 65;
    emit('legacy-65', { legacy: true });
    await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '65');

    quotaHealthy = false;
    emit('capability-unavailable', { legacy: true });
    await expect.poll(() => requests).toBeGreaterThan(beforeQuota + 2);
    await page.mouse.move(10, 400);
    await page.clock.runFor(200);
    await expect(panel).toHaveCount(0);
    remaining = 63;
    const polled = page.waitForResponse((response) => response.url().includes('/api/workspace/billing?') && response.status() === 200);
    await page.clock.runFor(30_001);
    await polled;
    await pill.hover();
    await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '63');
    await expect(page.getByTestId('coding-plan-quota-skeleton')).toHaveCount(0);
    quotaHealthy = true;

    failNext = true;
    const failedResponse = page.waitForResponse((response) => response.url().includes('/api/workspace/billing?') && response.status() === 503);
    emit('temporary-outage');
    await failedResponse;
    await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '63');
    await expect(panel).toContainText('US$0.00');
    await expect(page.getByTestId('coding-plan-quota-skeleton')).toHaveCount(0);
    remaining = 60;
    emit('recovered-60');
    await expect(panel.getByRole('progressbar').first()).toHaveAttribute('aria-valuenow', '60');
    await testInfo.attach('recovered-go', { body: await page.screenshot(), contentType: 'image/png' });
    await page.clock.resume();

    delayPersonal = true;
    const held = new Promise<void>((resolve) => { personalHeld = resolve; });
    emit('hold-personal-before-team');
    await held;
    await page.mouse.move(10, 400);
    await page.clock.runFor(200);
    await ensureRailOpen(page);
    await page.getByTestId('workspace-switcher').click();
    await page.getByTestId('workspace-switcher-list').getByText('Cache team', { exact: true }).click();
    await expect.poll(() => activeWorkspaceId).toBe(team.workspaceId);
    await pill.hover();
    await expect(panel).toContainText('$42.00');
    const latePersonal = page.waitForResponse((response) => response.url().includes(`/api/workspace/billing?scope=workspace&workspaceId=${scope.workspaceId}`));
    delayPersonal = false;
    releasePersonal!();
    await latePersonal;
    await expect(panel).toContainText('$42.00');
    await expect(panel).not.toContainText('US$0.00');
    await expect(panel.getByRole('progressbar')).toHaveCount(0);
    await testInfo.attach('scope-switch-late-personal', { body: await page.screenshot(), contentType: 'image/png' });
    await testInfo.attach('billing-request-witness', { body: JSON.stringify({ beforeHover, afterHover, requestWitness }, null, 2), contentType: 'application/json' });
  } catch (error) {
    await testInfo.attach('billing-failure-state', {
      body: JSON.stringify({ requests, requestWitness, html: await page.locator('body').innerText().catch(() => 'page unavailable') }, null, 2),
      contentType: 'application/json',
    });
    if (!page.isClosed()) await testInfo.attach('billing-failure-screen', { body: await page.screenshot(), contentType: 'image/png' });
    throw error;
  } finally {
    releaseCold();
    releasePersonal?.();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    for (const stream of streams) stream.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

// A bounded VIEW-021 evidence continuation. The browser edge controls one
// outage and one delayed response; every accepted amount/permission comes from
// the owned AMR API and database. It never buys, consumes, or re-ages funds.
test('[P0] VIEW-021 Free wallet preserves real scope and role through edge failures', async ({ page, browser }, info) => {
  const handoffDir = process.env.VIEW021_EDGE_HANDOFF_DIR;
  test.skip(!handoffDir, 'Requires a live owned AMR Free-wallet edge handoff');
  test.setTimeout(T.xlong * 4);
  type Actor = { sessionCookie: string };
  type Snapshot = { workspaceId: string; workspaceMemberId: string; plan: { tier: string };
    wallet: { balanceUsd: string; expiresAt: string | null; updatedAt: string | null };
    permissions: { canRecharge: boolean; canUpgrade: boolean }; revisions: { billing: string; wallet: string } };
  type Given = { runId: string; origin: string; owner: Actor; member: Actor;
    personal: { workspaceId: string; memberId: string };
    team: { workspaceId: string; ownerMemberId: string; actorMemberId: string };
    snapshots: { personalOwner: Snapshot; teamOwner: Snapshot; teamMember: Snapshot } };
  const handoff = JSON.parse(await readFile(join(handoffDir!, 'handoff.private.json'), 'utf8')) as Given;
  const scopes = {
    a: { workspaceId: handoff.personal.workspaceId, memberId: handoff.personal.memberId, name: 'Free owner personal', role: 'owner', type: 'personal' },
    b: { workspaceId: handoff.team.workspaceId, memberId: handoff.team.ownerMemberId, name: 'Free edge team', role: 'owner', type: 'team' },
  } as const;
  const realReads: Array<{ alias: string; status: number; workspaceId?: string; memberId?: string; balance?: string; canRecharge?: boolean }> = [];
  const readReal = async (alias: 'a' | 'b' | 'member') => {
    const scope = alias === 'a' ? scopes.a : scopes.b;
    const actor = alias === 'member' ? handoff.member : handoff.owner;
    const response = await fetch(`${handoff.origin}/api/v1/workspaces/${scope.workspaceId}/billing/snapshot`,
      { headers: { cookie: actor.sessionCookie } });
    const body = await response.json() as Snapshot;
    realReads.push({ alias, status: response.status, workspaceId: body.workspaceId,
      memberId: body.workspaceMemberId, balance: body.wallet?.balanceUsd,
      canRecharge: body.permissions?.canRecharge });
    expect(response.status).toBe(200);
    expect(body.workspaceId).toBe(scope.workspaceId);
    expect(body.workspaceMemberId).toBe(alias === 'member' ? handoff.team.actorMemberId : scope.memberId);
    expect(body.plan.tier).toBe('free');
    expect(body.permissions.canRecharge).toBe(false);
    return body;
  };
  const firstA = await readReal('a');
  const firstB = await readReal('b');
  const firstMember = await readReal('member');
  expect(firstA.wallet.balanceUsd).toBe(handoff.snapshots.personalOwner.wallet.balanceUsd);
  expect(firstB.wallet.balanceUsd).toBe(handoff.snapshots.teamOwner.wallet.balanceUsd);
  expect(firstMember.wallet.balanceUsd).toBe(handoff.snapshots.teamMember.wallet.balanceUsd);
  const streams = new Set<ServerResponse>();
  const events = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' });
    response.write(': connected\n\n');
    streams.add(response);
    response.on('close', () => streams.delete(response));
  });
  await new Promise<void>(resolve => events.listen(0, '127.0.0.1', resolve));
  const eventAddress = events.address();
  if (!eventAddress || typeof eventAddress === 'string') throw new Error('event port missing');
  const eventUrl = `http://127.0.0.1:${eventAddress.port}/events`;
  let active: 'a' | 'b' = 'a';
  let releaseCold: (() => void) | undefined;
  let releaseLateA: (() => void) | undefined;
  let holdCold = true;
  let holdLateA = false;
  let failNext = false;
  const edgeReads: Array<{ workspaceId: string; status: number; edge: string; revision: string }> = [];
  const eventWitness: Array<{ workspaceId: string; memberId: string; revision: string }> = [];
  const emit = (alias: 'a' | 'b', revision: string, memberId = scopes[alias].memberId) => {
    const scope = scopes[alias];
    eventWitness.push({ workspaceId: scope.workspaceId, memberId, revision });
    const body = { type: 'wallet-balance-changed', workspaceId: scope.workspaceId,
      workspaceMemberId: memberId, revision, eventId: `edge-${revision}` };
    for (const stream of streams) stream.write(`event: wallet-balance-changed\ndata: ${JSON.stringify(body)}\n\n`);
  };
  const consoleContexts = [] as Awaited<ReturnType<typeof browser.newContext>>[];
  let vite: ReturnType<typeof spawn> | undefined;
  try {
    await applyStandardMocks(page);
    await page.route('**/api/integrations/vela/status*', route => route.fulfill({ json: {
      loggedIn: true, profile: 'owned', user: { id: 'free-wallet-owner', email: 'owner@example.invalid', plan: 'free' },
    } }));
    const directory = Object.values(scopes).map(scope => ({ workspaceId: scope.workspaceId,
      workspaceMemberId: scope.memberId, workspaceName: scope.name, workspaceType: scope.type,
      role: scope.role, memberStatus: 'active', lifecycleState: 'active' }));
    const contextFor = (alias: 'a' | 'b') => ({ ...directory[alias === 'a' ? 0 : 1],
      billingState: 'free', planId: 'free', providerMode: 'platform_credits',
      permissions: { canManageBilling: true, canManageMembers: true, canInviteMembers: true,
        canManageAutoRecharge: false, canShareProjects: true, canWriteSyncedFiles: true,
        canViewWorkspaceSettings: true, canManageSharedResources: true } });
    await page.route('**/api/workspace/directory', route => route.fulfill({ json: { items: directory, activeWorkspaceId: scopes[active].workspaceId } }));
    await page.route('**/api/workspace/context', route => route.fulfill({ json: { context: contextFor(active) } }));
    await page.route('**/api/workspace/active', route => {
      const target = route.request().postDataJSON() as { workspaceId: string };
      active = target.workspaceId === scopes.b.workspaceId ? 'b' : 'a';
      return route.fulfill({ json: { activeWorkspaceId: scopes[active].workspaceId, context: contextFor(active) } });
    });
    await page.route('**/api/workspace/billing/interests/*', route => route.fulfill({ json: route.request().method() === 'DELETE'
      ? { ok: true, released: true } : { clientId: 'owned', acceptedGeneration: 1,
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString() } }));
    await page.route('**/api/projects*', route => route.fulfill({ json: { projects: [] } }));
    await page.route('**/api/workspace/events*', route => route.fulfill({ status: 307, headers: { location: eventUrl } }));
    await page.route('**/api/workspace/billing?*', async route => {
      const workspaceId = new URL(route.request().url()).searchParams.get('workspaceId');
      const alias = workspaceId === scopes.b.workspaceId ? 'b' : 'a';
      const raw = await readReal(alias);
      if (holdCold && alias === 'a') await new Promise<void>(resolve => { releaseCold = resolve; });
      if (holdLateA && alias === 'a') await new Promise<void>(resolve => { releaseLateA = resolve; });
      if (failNext) {
        failNext = false;
        edgeReads.push({ workspaceId: raw.workspaceId, status: 503, edge: 'injected-once', revision: raw.revisions.wallet });
        await route.fulfill({ status: 503, json: { error: 'controlled_edge_outage' } });
        return;
      }
      edgeReads.push({ workspaceId: raw.workspaceId, status: 200, edge: 'real-API-derived', revision: raw.revisions.wallet });
      const generatedAt = new Date().toISOString();
      await route.fulfill({ json: {
        summary: { membershipTier: 'free', subscriptionStatus: null, balanceUsd: raw.wallet.balanceUsd,
          totalAvailableCredits: Number(raw.wallet.balanceUsd), subscriptionCredits: 0, rechargeCredits: 0,
          availableActions: [], workspaceBalance: null },
        workspaceSnapshot: raw,
        workspaceBalance: { ...contextFor(alias), balanceUsd: raw.wallet.balanceUsd,
          billingScopeVersion: 2, updatedAt: raw.wallet.updatedAt, expiresAt: raw.wallet.expiresAt },
        workspaceRuntime: { workspaceId: raw.workspaceId, workspaceMemberId: raw.workspaceMemberId,
          status: 'fresh', revision: raw.revisions.wallet, observedAt: generatedAt,
          softExpiresAt: new Date(Date.now() + 30_000).toISOString(),
          hardExpiresAt: new Date(Date.now() + 600_000).toISOString(),
          retryAt: null, errorCode: null, sourceGapDetected: false },
        preflight: { schemaVersion: 1, workspaceId: raw.workspaceId, workspaceMemberId: raw.workspaceMemberId,
          modelId: null, generatedAt, balanceUsd: raw.wallet.balanceUsd, funding: 'cash', modelCovered: null,
          codingPlan: { workspaceId: raw.workspaceId, generatedAt, eligible: false, tier: null, windows: [] } },
      } });
    });
    const pendingCold = page.waitForRequest(request => request.url().includes('/api/workspace/billing?'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await pendingCold;
    // The generic signed-in shell may render its placeholder account pill
    // before the workspace read resolves. Only the scoped card is asserted.
    holdCold = false;
    releaseCold?.();
    const pill = page.getByTestId('entry-top-right-credits');
    const panel = page.getByTestId('entry-top-right-credits-panel');
    await expect(pill).toBeVisible({ timeout: T.long });
    await pill.hover();
    await expect(panel).toContainText('$0.50');
    await expect(panel.getByTestId('workspace-quota-skeleton')).toHaveCount(0);
    await expect.poll(() => streams.size).toBeGreaterThan(0);
    failNext = true;
    emit('a', 'wallet-v2-1');
    await expect.poll(() => edgeReads.some(read => read.status === 503)).toBe(true);
    await expect(panel).toContainText('$0.50');
    emit('a', 'wallet-v2-2');
    await expect.poll(() => edgeReads.filter(read => read.status === 200 && read.workspaceId === scopes.a.workspaceId).length).toBeGreaterThan(1);
    await expect(panel).toContainText('$0.50');
    holdLateA = true;
    emit('a', 'wallet-v2-3');
    await expect.poll(() => Boolean(releaseLateA)).toBe(true);
    await ensureRailOpen(page);
    await page.getByTestId('workspace-switcher').click();
    await page.getByTestId('workspace-switcher-list').getByText(scopes.b.name, { exact: true }).click();
    await pill.hover();
    await expect(panel).toContainText('$0.00');
    holdLateA = false;
    releaseLateA?.();
    emit('a', 'wallet-v2-1');
    await expect(panel).toContainText('$0.00');
    await expect(panel).not.toContainText('$0.50');
    const lastA = await readReal('a');
    const lastB = await readReal('b');
    const lastMember = await readReal('member');
    expect(lastA.wallet.balanceUsd).toBe(firstA.wallet.balanceUsd);
    expect(lastB.wallet.balanceUsd).toBe(firstB.wallet.balanceUsd);
    expect(lastMember.permissions.canUpgrade).toBe(false);
    const clientScreenshot = await page.screenshot();
    await info.attach('VIEW021-edge-client', { body: clientScreenshot, contentType: 'image/png' });
    await writeFile(join(handoffDir!, 'edge-client.png'), clientScreenshot, { mode: 0o600, flag: 'wx' });

    // The actual Vela Console browser is read-only here. The payment buttons
    // are checked under both real session roles, with no checkout request.
    const portServer = createServer();
    await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
    const portAddress = portServer.address();
    if (!portAddress || typeof portAddress === 'string') throw new Error('Vite port missing');
    await new Promise<void>(resolve => portServer.close(() => resolve()));
    const webOrigin = `http://127.0.0.1:${portAddress.port}`;
    const viteLog = createWriteStream(info.outputPath('view021-vite.private.log'));
    vite = spawn('corepack', ['pnpm', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(portAddress.port), '--strictPort'], {
      cwd: join(process.env.VIEW021_EDGE_AMR_ROOT!, 'apps/web'), env: { ...process.env, VITE_API_PROXY_TARGET: handoff.origin,
        VITE_SEATS_PHASE1_UI: 'true' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    vite.stdout?.pipe(viteLog);
    vite.stderr?.pipe(viteLog);
    await expect.poll(async () => { try { return (await fetch(webOrigin)).ok; } catch { return false; } }, { timeout: T.long }).toBe(true);
    const cookieValues = (cookie: string) => cookie.split(';').map(value => value.trim()).filter(Boolean).map(value => {
      const at = value.indexOf('=');
      if (at <= 0) throw new Error('bad owned session cookie');
      return { name: value.slice(0, at), value: value.slice(at + 1), url: webOrigin };
    });
    for (const [alias, actor, workspaceId, expected] of [
      ['owner', handoff.owner, scopes.a.workspaceId, '$0.50'],
      ['member', handoff.member, scopes.b.workspaceId, '$0.00'],
    ] as const) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
      consoleContexts.push(context);
      await context.addCookies(cookieValues(actor.sessionCookie));
      const consolePage = await context.newPage();
      await consolePage.goto(`${webOrigin}/dashboard?workspaceId=${encodeURIComponent(workspaceId)}`,
        { waitUntil: 'domcontentloaded', timeout: T.long });
      if (alias === 'member') {
        const confirm = consolePage.getByRole('button', { name: 'Switch to Free edge team', exact: true });
        await expect.poll(async () => await confirm.isVisible() || await consolePage.getByTestId('seats-wallet-total').isVisible(),
          { timeout: T.long }).toBe(true);
        if (await confirm.isVisible()) await confirm.click();
      }
      await expect(consolePage.getByTestId('seats-wallet-total')).toHaveText(expected, { timeout: T.long });
      await expect(consolePage.getByRole('button', { name: /^recharge$/i })).toHaveCount(0);
      const upgrade = consolePage.getByRole('button', { name: /^upgrade$/i });
      if (alias === 'owner') await expect(upgrade).toHaveCount(1);
      else await expect(upgrade).toHaveCount(0);
      const screenshot = await consolePage.screenshot();
      await info.attach(`VIEW021-${alias}-real-console`, { body: screenshot, contentType: 'image/png' });
      await writeFile(join(handoffDir!, `edge-${alias}-console.png`), screenshot, { mode: 0o600, flag: 'wx' });
    }
    const safeReceipt = JSON.stringify({ runId: handoff.runId, realReads, edgeReads, eventWitness,
      controlledStimuli: ['initial held A', 'one 503', 'late A after switching B', 'scoped SSE revisions'],
      finalVisible: '$0.00', ownerUpgrade: true, memberUpgrade: false, freeRechargeButtons: 0 }, null, 2);
    await info.attach('VIEW021-edge-read-receipt', { body: safeReceipt, contentType: 'application/json' });
    await writeFile(join(handoffDir!, 'edge-read-receipt.safe.json'), safeReceipt, { mode: 0o600, flag: 'wx' });
    await writeFile(join(handoffDir!, 'browser.done'), JSON.stringify({ runId: handoff.runId, status: 'passed' }), { mode: 0o600, flag: 'wx' });
  } finally {
    releaseCold?.();
    releaseLateA?.();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    for (const context of consoleContexts) await context.close();
    if (vite && vite.exitCode === null) {
      const exited = new Promise<void>(resolve => vite!.once('exit', () => resolve()));
      vite.kill('SIGTERM');
      await Promise.race([exited, new Promise<void>(resolve => setTimeout(resolve, 10_000))]);
      if (vite.exitCode === null) vite.kill('SIGKILL');
    }
    for (const stream of streams) stream.end();
    await new Promise<void>(resolve => events.close(() => resolve()));
  }
});
