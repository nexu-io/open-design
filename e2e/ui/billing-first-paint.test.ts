import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createBillingPreviewFixture, BILLING_SPACES } from '@/playwright/billing-preview-fixture';
import { ensureRailOpen } from '@/playwright/rail';
import { seedVelaLoginConfig } from '@/amr';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

test.use({ trace: 'on', viewport: { width: 1280, height: 900 } });

test('[P1] real daemon renders scoped quota early and refreshes models after subscription upgrade', async ({ page }, info) => {
  test.setTimeout(T.xlong * 6);
  const namespace = `billing-paint-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const runtime = createToolsDevSuite({ root, namespace, ownerPid: process.pid, dataDir: join(scratch, 'data'), toolsDevRoot: join(scratch, 'tools-dev'), codexHomeDir: join(scratch, 'codex-home') });
  await mkdir(runtime.dataDir, { recursive: true });
  const fixture = await createBillingPreviewFixture(scratch);
  const config = { mode: 'daemon', agentId: 'amr', model: 'fixture-model', onboardingCompleted: true,
    privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: { amr: { model: 'fixture-model' } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: fixture.velaBin } } };
  await writeFile(join(runtime.dataDir, 'app-config.json'), JSON.stringify(config));
  await seedVelaLoginConfig(scratch, { endpoints: { apiUrl: fixture.apiUrl, linkUrl: fixture.apiUrl }, profile: 'local' });
  const env = { AMR_HOME: join(scratch, '.amr'), VELA_BIN: fixture.velaBin, OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.apiUrl,
    VELA_LINK_URL: fixture.apiUrl, VELA_CONTROL_KEY: 'fake-control-key', VELA_RUNTIME_KEY: 'fake-runtime-key',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
  const timeline: Array<{ type: string; at: number; url: string; status?: number; workspaceId?: string; workspaceMemberId?: string }> = [];
  const modelResponses: Array<{ url: string; workspaceId?: string; workspaceMemberId?: string; body: unknown }> = [];
  const billingResponses: Array<{ url: string; body: unknown }> = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/amr/models') timeline.push({ type: 'model-request', at: Date.now(), url: request.url(), workspaceId: request.headers()['x-od-workspace-id'] ?? '', workspaceMemberId: request.headers()['x-od-workspace-member-id'] ?? '' });
    if (request.url().includes('/api/workspace/billing?') || new URL(request.url()).pathname === '/api/workspace/context') timeline.push({ type: 'request', at: Date.now(), url: request.url() });
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname === '/api/amr/models') { modelResponses.push({ url: response.url(), workspaceId: response.request().headers()['x-od-workspace-id'] ?? '', workspaceMemberId: response.request().headers()['x-od-workspace-member-id'] ?? '', body: await response.json().catch(() => null) }); return; }
    if (new URL(response.url()).pathname === '/api/workspace/context') { timeline.push({ type: 'response', at: Date.now(), url: response.url(), status: response.status() }); return; }
    if (!response.url().includes('/api/workspace/billing?')) return;
    timeline.push({ type: 'response', at: Date.now(), url: response.url(), status: response.status() });
    billingResponses.push({ url: response.url(), body: await response.json().catch(() => null) });
  });
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.addInitScript((value) => {
    localStorage.setItem('open-design:config', JSON.stringify(value));
    localStorage.setItem('open-design:locale', 'en');
  }, config);
  let passed = false;
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    await info.attach('source-runtime', { body: JSON.stringify({ sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim(), namespace, root, dataDir: runtime.dataDir, toolsDevRoot: runtime.toolsDevRoot, daemonUrl: runtime.daemonUrl, webUrl: runtime.webUrl, upstream: fixture.apiUrl }), contentType: 'application/json' });
    const baseResponse = page.waitForResponse((response) => response.url().includes('/api/workspace/billing?') && !new URL(response.url()).searchParams.has('includePreflight') && response.status() === 200, { timeout: T.long });
    await page.goto(runtime.url.web('/'), { waitUntil: 'domcontentloaded' });
    expect((await (await baseResponse).json()).workspaceSnapshot.workspaceId).toBe(BILLING_SPACES[0].workspaceId);
    await expect.poll(() => fixture.requests.some((row) => row.path.endsWith('/billing/preflight')), { timeout: T.long }).toBe(true);
    await fixture.previewPending;
    expect(fixture.previewReleased).toBe(false);
    const pill = page.getByTestId('entry-top-right-credits');
    const panel = page.getByTestId('entry-top-right-credits-panel');
    await expect(pill).toBeVisible({ timeout: T.long });
    await pill.hover();
    await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
    await expect(panel).toContainText('$12.50');
    await expect(panel.getByTestId('workspace-quota-skeleton')).toHaveCount(0);
    const firstContext = timeline.find((row) => row.type === 'response' && new URL(row.url).pathname === '/api/workspace/context');
    const firstBase = timeline.find((row) => row.type === 'request' && row.url.includes('/api/workspace/billing?') && !row.url.includes('includePreflight'));
    expect(firstContext).toBeDefined();
    expect(firstBase).toBeDefined();
    expect(firstBase!.at - firstContext!.at, 'initial scoped billing starts without the consumption 5s window').toBeLessThan(T.short);
    await info.attach('base-visible-preflight-still-pending', { body: await page.screenshot(), contentType: 'image/png' });
    // Lower-layer unit tests own the full timer matrix. This browser witness
    // uses one controlled 5s boundary to prove real event-to-card wiring.
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1_000));
    const forcedModelReads = () => timeline.filter((row) => row.type === 'model-request' && new URL(row.url).searchParams.get('refresh') === '1').length;
    const beforeConsumptionModels = forcedModelReads();
    const beforeEvent = timeline.filter((row) => row.type === 'request' && row.url.includes('/api/workspace/billing?') && !row.url.includes('includePreflight')).length;
    await expect.poll(() => fixture.requests.some((row) => row.path === '/api/v1/collab/events')).toBe(true);
    for (let index = 0; index < 100; index++) fixture.updateA();
    await page.clock.runFor(4_999);
    expect(timeline.filter((row) => row.type === 'request' && row.url.includes('/api/workspace/billing?') && !row.url.includes('includePreflight')).length - beforeEvent).toBeLessThanOrEqual(1);
    await page.clock.runFor(1);
    await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '70');
    await expect(panel).toContainText('$17.25');
    expect(forcedModelReads(), 'quota consumption does not force the model catalog').toBe(beforeConsumptionModels);
    const switchedAt = await page.evaluate(() => Date.now());
    await page.mouse.move(10, 400);
    await ensureRailOpen(page);
    await page.getByTestId('workspace-switcher').click();
    await page.getByTestId('workspace-switcher-list').getByText(BILLING_SPACES[1].workspaceName, { exact: true }).click();
    await pill.hover();
    await expect(panel).toContainText('$42.00');
    await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
    expect(await page.evaluate(() => Date.now())).toBe(switchedAt);
    fixture.releasePreview();
    await expect.poll(() => billingResponses.some((row) => row.url.includes(BILLING_SPACES[0].workspaceId) && row.url.includes('includePreflight'))).toBe(true);
    await expect(panel).toContainText('$42.00');
    await expect(panel).not.toContainText('$999.00');
    await expect(panel).not.toContainText('$17.25');
    await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
    await page.clock.resume();
    await info.attach('late-preview-keeps-current-scope', { body: await page.screenshot(), contentType: 'image/png' });
    await page.mouse.move(10, 400);
    const modelChip = page.getByTestId('inline-model-switcher-chip');
    await expect(modelChip).toBeVisible();
    await expect.poll(() => modelResponses.some((row) => {
      const body = row.body as { source?: string; models?: Array<{ id: string; enabled?: boolean }> } | null;
      return row.workspaceId === BILLING_SPACES[1].workspaceId && body?.source === 'remote'
        && body.models?.some((model) => model.id === 'fixture-pro-model' && model.enabled === false);
    }), { timeout: T.long }).toBe(true);
    await modelChip.click();
    const proModel = page.getByTestId('inline-model-switcher-compact-model-fixture-pro-model');
    await expect(proModel).toBeVisible();
    await expect(proModel).toHaveAttribute('aria-disabled', 'true');
    await info.attach('pro-model-locked-before-upgrade', { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    const forcedCatalog = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/amr/models'
      && new URL(response.url()).searchParams.get('refresh') === '1'
      && response.request().headers()['x-od-workspace-id'] === BILLING_SPACES[1].workspaceId, { timeout: T.long });
    fixture.upgradeB();
    const forcedResponse = await forcedCatalog;
    expect(forcedResponse.status()).toBe(200);
    expect(forcedResponse.request().headers()['x-od-workspace-member-id']).toBe(BILLING_SPACES[1].workspaceMemberId);
    await expect.poll(() => modelResponses.some((row) => {
      const body = row.body as { source?: string; models?: Array<{ id: string; enabled?: boolean }> } | null;
      return row.workspaceId === BILLING_SPACES[1].workspaceId && row.workspaceMemberId === BILLING_SPACES[1].workspaceMemberId
        && body?.source === 'remote' && body.models?.some((model) => model.id === 'fixture-pro-model' && model.enabled === true);
    }), { timeout: T.long }).toBe(true);
    await modelChip.click();
    await expect(proModel).toBeVisible();
    await expect(proModel).not.toHaveAttribute('aria-disabled', 'true');
    await info.attach('pro-model-enabled-after-upgrade', { body: await page.screenshot(), contentType: 'image/png' });
    passed = true;
  } finally {
    fixture.releasePreview();
    await info.attach('request-timeline', { body: JSON.stringify({ timeline, billingResponses, modelResponses, upstreamRequests: fixture.requests, subscriptionEvents: fixture.subscriptionEvents }, null, 2), contentType: 'application/json' });
    if (!page.isClosed()) { await info.attach('final-browser', { body: await page.screenshot(), contentType: 'image/png' }); await page.close(); }
    try { await runtime.stopWeb(); } finally { await fixture.close(); }
    if (passed) await rm(root, { recursive: true, force: true });
  }
});
