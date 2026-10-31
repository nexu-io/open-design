import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

type Space = { workspaceId: string; workspaceMemberId: string; name: string };
type Fixture = {
  alias: string;
  tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; modelId: string };
  actor: { controlKey: string; runtimeKey: string; userId: string; email: string; name: string };
  spaces: { A: Space; B: Space };
};

const fixturePath = process.env.OD_LINK_CLOSURE_FIXTURE;
const evidenceDir = process.env.OD_LINK_CLOSURE_EVIDENCE;

async function readFixture(): Promise<{ fixture: Fixture; digest: string }> {
  if (!fixturePath || !evidenceDir) throw new Error('Explicit OD_LINK_CLOSURE_FIXTURE and OD_LINK_CLOSURE_EVIDENCE required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Fixture must be private (0600)');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  if (!fixture.alias || !fixture.tuple?.odSha || !fixture.tuple?.amrSha || !fixture.actor?.controlKey
    || !fixture.actor.runtimeKey || !fixture.runtime?.velaBin || !fixture.runtime.openCodeBin
    || !fixture.runtime.modelId || !fixture.spaces?.A?.workspaceId || !fixture.spaces?.B?.workspaceId
    || fixture.spaces.A.workspaceId === fixture.spaces.B.workspaceId) {
    throw new Error('Incomplete, non-isolated A/B fixture');
  }
  const currentOdSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim();
  if (fixture.tuple.odSha !== currentOdSha) throw new Error('OD fixture tuple is not the exact current commit');
  for (const value of Object.values(fixture.urls)) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Only this host loopback AMR endpoints are permitted');
    }
  }
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  await chmod(evidenceDir, 0o700);
  return { fixture, digest: createHash('sha256').update(bytes).digest('hex') };
}

test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('[P0] RUN-011/012 Owner Home actual A/B funding never submits without another click', async ({ page }, info) => {
  test.setTimeout(600_000);
  const { fixture, digest } = await readFixture();
  const output = evidenceDir!;
  const markerDir = join(output, 'markers');
  await mkdir(markerDir, { recursive: true, mode: 0o700 });
  await chmod(markerDir, 0o700);
  if ((await readdir(markerDir)).length !== 0) throw new Error('Fresh empty marker directory required');
  const binding = { protocol: 'od-link-closure-v1', alias: fixture.alias, attemptId: randomUUID(), fixtureSha256: digest,
    odSha: fixture.tuple.odSha, amrSha: fixture.tuple.amrSha };
  const save = async (name: string, value: unknown) => writeFile(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  const marker = async (name: string, value: Record<string, unknown>) => {
    const target = join(markerDir, name);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ ...binding, ...value, at: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
    await rename(temp, target);
  };
  const receipt = async (name: string, workspaceId: string, readyAt: string) => {
    let found!: Record<string, unknown>;
    await expect.poll(async () => {
      try { found = JSON.parse(await readFile(join(markerDir, name), 'utf8')) as Record<string, unknown>; return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    }, { timeout: 180_000, intervals: [250, 500, 1000] }).toBe(true);
    expect(found).toMatchObject({ ...binding, workspaceId });
    expect(Date.parse(String(found.at))).toBeGreaterThanOrEqual(Date.parse(readyAt));
    expect(found.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(found.receiptFile).toMatch(/^[a-zA-Z0-9.-]+\.safe\.json$/);
    const evidence = await readFile(join(markerDir, String(found.receiptFile)));
    expect(createHash('sha256').update(evidence).digest('hex')).toBe(found.receiptDigest);
    await save(name, found);
    return found;
  };

  const namespace = `link-closure-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const dataDir = join(scratch, 'data');
  const amrHome = join(scratch, 'amr-home');
  const runtime = createToolsDevSuite({ root, dataDir, namespace, ownerPid: process.pid,
    codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  const amrConfig = { profiles: { local: { controlKey: fixture.actor.controlKey,
    runtimeKey: fixture.actor.runtimeKey, apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
    user: { id: fixture.actor.userId, email: fixture.actor.email, name: fixture.actor.name } } } };
  await writeFile(join(amrHome, 'config.json'), JSON.stringify(amrConfig), { mode: 0o600 });
  const config = { mode: 'daemon', agentId: 'amr', model: fixture.runtime.modelId,
    onboardingCompleted: true, privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: { amr: { model: fixture.runtime.modelId } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: fixture.runtime.velaBin } } };
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify(config), { mode: 0o600 });
  const env = { AMR_HOME: amrHome, VELA_BIN: fixture.runtime.velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api, VELA_LINK_URL: fixture.urls.link,
    VELA_CONTROL_KEY: fixture.actor.controlKey, VELA_OPENCODE_BIN: fixture.runtime.openCodeBin,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.urls.web,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
  const calls: Array<{ at: string; method: string; path: string; workspaceId: string | null }> = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) calls.push({ at: new Date().toISOString(), method: request.method(),
      path: url.pathname, workspaceId: request.headers()['x-od-workspace-id'] ?? null });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort();
  });
  const headers = (space: Space) => ({ 'x-od-workspace-id': space.workspaceId,
    'x-od-workspace-member-id': space.workspaceMemberId, 'x-od-workspace-role': 'owner',
    'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-member-status': 'active' });
  const preflight = async (space: Space) => {
    const url = new URL('/api/workspace/billing', runtime.url.web());
    url.search = new URLSearchParams({ scope: 'workspace', workspaceId: space.workspaceId,
      includePreflight: '1', modelId: fixture.runtime.modelId }).toString();
    const response = await fetch(url, { headers: headers(space) });
    const body = await response.json();
    expect(response.ok, JSON.stringify(body)).toBe(true);
    expect(body.preflight).toMatchObject({ workspaceId: space.workspaceId,
      workspaceMemberId: space.workspaceMemberId, modelId: fixture.runtime.modelId });
    return body;
  };
  const countPosts = () => calls.filter(call => call.method === 'POST' && call.path === '/api/runs').length;
  const input = page.getByTestId('home-hero-input');
  const send = page.getByTestId('home-hero-submit');
  const staged = page.getByTestId('home-hero-staged-files');
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    const status = await (await fetch(runtime.url.web('/api/integrations/vela/status'))).json();
    expect(status.loggedIn).toBe(true);
    expect(status.user?.id).toBe(fixture.actor.userId);
    const directory = await (await fetch(runtime.url.web('/api/workspace/directory'))).json();
    const items = directory.items ?? directory.workspaces ?? [];
    for (const space of [fixture.spaces.A, fixture.spaces.B]) {
      expect(items.some((item: Space) => item.workspaceId === space.workspaceId)).toBe(true);
    }
    const selectWorkspace = async (space: Space) => {
      const toggle = page.getByTestId('entry-rail-collapse');
      if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
      const item = items.find((row: Space) => row.workspaceId === space.workspaceId);
      const switcher = page.getByTestId('workspace-switcher');
      await switcher.click();
      const row = page.getByTestId('workspace-switcher-list').getByRole('menuitem')
        .filter({ hasText: item.workspaceName ?? item.name });
      const changed = page.waitForResponse(response => response.request().method() === 'PUT'
        && new URL(response.url()).pathname === '/api/workspace/active', { timeout: T.medium });
      await row.click();
      const response = await changed;
      expect(response.ok()).toBe(true);
      expect((await response.json()).context.workspaceId).toBe(space.workspaceId);
    };
    const initialA = await preflight(fixture.spaces.A);
    const initialB = await preflight(fixture.spaces.B);
    expect(initialA.preflight.fundingCheck).toBe('insufficient');
    expect(initialB.preflight.fundingCheck).toBe('insufficient');
    await save('initial-preflight.safe.json', { binding, A: initialA, B: initialB });
    await page.addInitScript(({ config: appConfig, space }) => {
      localStorage.setItem('open-design:config', JSON.stringify(appConfig));
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(space));
    }, { config, space: fixture.spaces.A });
    await page.goto(runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(input).toBeVisible({ timeout: T.xlong });
    await input.fill('RUN011 first blocked message');
    await send.click();
    await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
    await expect(input).toHaveText('RUN011 first blocked message');
    expect(countPosts()).toBe(0);
    await page.getByTestId('amr-balance-dialog').getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
    await input.fill('RUN011 second message with real attachment');
    await page.getByTestId('home-hero-file-input').setInputFiles({ name: 'run011-brief.txt',
      mimeType: 'text/plain', buffer: Buffer.from('Current blocked input must remain.') });
    await expect(staged).toContainText('run011-brief.txt');
    await send.click({ clickCount: 2 });
    await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
    await expect(input).toHaveText('RUN011 second message with real attachment');
    await expect(staged).toContainText('run011-brief.txt');
    expect(countPosts()).toBe(0);
    await save('A-blocked.safe.json', { binding, at: new Date().toISOString(), calls,
      A: await preflight(fixture.spaces.A), clickCount: 2 });
    await page.screenshot({ path: join(output, 'A-blocked.png') });
    await marker('A-ready.json', { workspaceId: fixture.spaces.A.workspaceId, countPosts: countPosts() });

    // The sandbox owner performs the real business writer. A direct test SQL
    // balance edit would not prove that A/B billing isolation survives.
    await page.getByTestId('amr-balance-dialog').getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
    await selectWorkspace(fixture.spaces.B);
    await save('browser-selected-B.safe.json', { binding, context: await (await fetch(runtime.url.web('/api/workspace/context'),
      { headers: headers(fixture.spaces.B) })).json(), calls });
    const bReadyAt = new Date().toISOString();
    await marker('B-fund-ready.json', { workspaceId: fixture.spaces.B.workspaceId });
    await receipt('B-funded.json', fixture.spaces.B.workspaceId, bReadyAt);
    await selectWorkspace(fixture.spaces.A);
    await expect(input).toHaveText('RUN011 second message with real attachment');
    await expect(staged).toContainText('run011-brief.txt');
    const afterB = { A: await preflight(fixture.spaces.A), B: await preflight(fixture.spaces.B) };
    expect(afterB.A.preflight.fundingCheck).toBe('insufficient');
    expect(afterB.B.preflight.fundingCheck).toBe('available');
    expect(countPosts()).toBe(0);
    await send.click();
    await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
    await expect(input).toHaveText('RUN011 second message with real attachment');
    await expect(staged).toContainText('run011-brief.txt');
    expect(countPosts()).toBe(0);
    await save('B-funded-A-still-blocked.safe.json', { binding, afterB, calls });

    const aReadyAt = new Date().toISOString();
    await marker('A-fund-ready.json', { workspaceId: fixture.spaces.A.workspaceId });
    await receipt('A-funded.json', fixture.spaces.A.workspaceId, aReadyAt);
    const afterA = await preflight(fixture.spaces.A);
    expect(afterA.preflight.fundingCheck).toBe('available');
    const noClickStart = new Date().toISOString();
    await page.evaluate(() => window.dispatchEvent(new Event('od:workspace-billing-refresh')));
    const automatic = await page.waitForEvent('request', { predicate: request => request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/runs', timeout: 5000 }).catch(() => null);
    expect(automatic).toBeNull();
    expect(countPosts()).toBe(0);
    await save('A-funded-no-click.safe.json', { binding, noClickStart, observedAt: new Date().toISOString(),
      afterA, calls, draft: await input.textContent(), staged: await staged.allTextContents() });
    await page.screenshot({ path: join(output, 'A-funded-no-click.png') });
    const dialog = page.getByTestId('amr-balance-dialog');
    if (await dialog.isVisible()) await dialog.getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
    const manualClickAt = new Date().toISOString();
    const createdResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
    await send.click();
    const response = await createdResponse;
    expect(response.status()).toBe(202);
    const created = await response.json();
    expect(created.runId).toEqual(expect.any(String));
    await expect.poll(() => countPosts(), { timeout: T.long }).toBe(1);
    expect(calls.find(call => call.method === 'POST' && call.path === '/api/runs')?.workspaceId)
      .toBe(fixture.spaces.A.workspaceId);
    await marker('A-manual-ready.json', { workspaceId: fixture.spaces.A.workspaceId, runId: created.runId });
    const verified = await receipt('A-manual-verified.json', fixture.spaces.A.workspaceId, manualClickAt);
    if (verified.error) throw new Error(`A/B accounting receipt blocked: ${String(verified.error)}`);
    expect(verified.runId).toBe(created.runId);
    expect(verified.billingWorkspaceId).toBe(fixture.spaces.A.workspaceId);
    expect(Number(verified.targetSuccessfulUpstreamCount)).toBeGreaterThan(0);
    expect(Number(verified.targetUsageCount)).toBeGreaterThanOrEqual(Number(verified.targetSuccessfulUpstreamCount));
    expect(Number(verified.auxiliaryUsageCount)).toBeGreaterThanOrEqual(Number(verified.auxiliarySuccessfulUpstreamCount));
    expect(Number(verified.unsettledSuccessfulCallCount)).toBe(0);
    expect(Number(verified.unmatchedChargeCount)).toBe(0);
    expect(Number(verified.bCreditUsageDelta)).toBe(0);
    const chargeableCalls = verified.chargeableCalls as Array<{
      canonicalRequestId: string; usageId: string; chargedWorkspaceId: string;
    }>;
    expect(Array.isArray(chargeableCalls)).toBe(true);
    expect(chargeableCalls.length).toBe(Number(verified.targetUsageCount) + Number(verified.auxiliaryUsageCount));
    expect(new Set(chargeableCalls.map(call => call.canonicalRequestId)).size).toBe(chargeableCalls.length);
    expect(new Set(chargeableCalls.map(call => call.usageId)).size).toBe(chargeableCalls.length);
    for (const call of chargeableCalls) {
      expect(call.canonicalRequestId.length).toBeGreaterThan(0);
      expect(call.usageId.length).toBeGreaterThan(0);
      expect(call.chargedWorkspaceId).toBe(fixture.spaces.A.workspaceId);
    }
    await save('A-manual-once.safe.json', { binding, manualClickAt, created, responseStatus: response.status(), calls,
      verified, finalA: await preflight(fixture.spaces.A), finalB: await preflight(fixture.spaces.B) });
  } finally {
    await save('request-timeline.safe.json', { binding, calls });
    await page.close().catch(() => undefined);
    await runtime.stopWeb(env);
    await info.attach('owned-runtime-stopped', { body: JSON.stringify(await runtime.status(env)), contentType: 'application/json' });
  }
});
