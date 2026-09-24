import { createServer, type ServerResponse } from 'node:http';

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
