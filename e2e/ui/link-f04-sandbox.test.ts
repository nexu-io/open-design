import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

type Tier = 'free' | 'go' | 'plus' | 'pro' | 'max';
type Role = 'owner' | 'admin' | 'member';
type Surface = 'home' | 'project';
type Actor = { controlKey: string; runtimeKey: string; userId: string; email: string; name: string; memberId: string };
type Space = { workspaceId: string; tier: Tier; limit: number; actors: Partial<Record<Role, Actor>> };
type Fixture = {
  alias: string;
  tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; modelId: string; velaSha256?: string; openCodeSha256?: string };
  concurrency: Partial<Record<Tier, Space>>;
};

const fixturePath = process.env.OD_LINK_F04_FIXTURE;
const output = process.env.OD_LINK_F04_EVIDENCE;
const tier = process.env.OD_LINK_F04_TIER as Tier;
const role = process.env.OD_LINK_F04_ROLE as Role;
const surface = process.env.OD_LINK_F04_SURFACE as Surface;

test.use({ video: 'on', viewport: { width: 1280, height: 720 } });

test('[P1] F04/F06/RUN014 actual Link-full notice preserves content until manual retry', async ({ page }, info) => {
  test.setTimeout(600_000);
  if (!fixturePath || !output || !['free', 'go', 'plus', 'pro', 'max'].includes(tier)
    || !['owner', 'admin', 'member'].includes(role) || !['home', 'project'].includes(surface)
    || (role === 'owner' && !['go', 'plus', 'pro', 'max'].includes(tier))) {
    throw new Error('Explicit F04 fixture/evidence/tier/role/surface required');
  }
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture0600 required');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const digest = createHash('sha256').update(bytes).digest('hex');
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim();
  if (fixture.tuple.odSha !== odSha || !fixture.tuple.amrSha) throw new Error('Current OD/AMR tuple mismatch');
  for (const value of Object.values(fixture.urls)) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Only isolated loopback AMR endpoints permitted');
    }
  }
  if (fixture.runtime.velaSha256) expect(createHash('sha256').update(await readFile(fixture.runtime.velaBin)).digest('hex')).toBe(fixture.runtime.velaSha256);
  if (fixture.runtime.openCodeSha256) expect(createHash('sha256').update(await readFile(fixture.runtime.openCodeBin)).digest('hex')).toBe(fixture.runtime.openCodeSha256);
  const space = fixture.concurrency?.[tier];
  const actor = space?.actors?.[role];
  if (!space || !actor || space.tier !== tier || !space.workspaceId || !actor.memberId
    || !actor.controlKey || !actor.runtimeKey || !fixture.runtime?.modelId) {
    throw new Error('Missing exact tier/role/model/runtime binding');
  }
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const markers = join(output, 'markers');
  await mkdir(markers, { recursive: true, mode: 0o700 });
  await chmod(markers, 0o700);
  if ((await readdir(markers)).length !== 0) throw new Error('Fresh empty marker directory required');
  const binding = { protocol: 'od-link-f04-v1', alias: fixture.alias, attemptId: randomUUID(),
    fixtureSha256: digest, odSha, amrSha: fixture.tuple.amrSha, workspaceId: space.workspaceId,
    tier, role, surface, modelId: fixture.runtime.modelId };
  const save = async (name: string, value: unknown) => writeFile(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  const marker = async (name: string, value: Record<string, unknown>) => {
    const target = join(markers, name);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify({ ...binding, ...value, at: new Date().toISOString() }), { mode: 0o600, flag: 'wx' });
    await rename(temp, target);
  };
  const receipt = async (name: string) => {
    let value!: Record<string, unknown>;
    await expect.poll(async () => {
      try { value = JSON.parse(await readFile(join(markers, name), 'utf8')) as Record<string, unknown>; return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    }, { timeout: 180_000, intervals: [250, 500, 1000] }).toBe(true);
    expect(value).toMatchObject(binding);
    expect(value.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(value.receiptFile).toMatch(/^[a-zA-Z0-9.-]+\.safe\.json$/);
    const evidence = await readFile(join(markers, String(value.receiptFile)));
    expect(createHash('sha256').update(evidence).digest('hex')).toBe(value.receiptDigest);
    await save(name, value);
    return value;
  };

  const namespace = `link-f04-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const dataDir = join(scratch, 'data');
  const amrHome = join(scratch, 'amr-home');
  const runtime = createToolsDevSuite({ root, dataDir, namespace, ownerPid: process.pid,
    codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: actor.controlKey, runtimeKey: actor.runtimeKey,
    apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
    user: { id: actor.userId, email: actor.email, name: actor.name },
  } } }), { mode: 0o600 });
  const config = { mode: 'daemon', agentId: 'amr', model: fixture.runtime.modelId,
    onboardingCompleted: true, privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: { amr: { model: fixture.runtime.modelId } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: fixture.runtime.velaBin } } };
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify(config), { mode: 0o600 });
  const env = { AMR_HOME: amrHome, VELA_BIN: fixture.runtime.velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api, VELA_LINK_URL: fixture.urls.link,
    VELA_CONTROL_KEY: actor.controlKey, VELA_OPENCODE_BIN: fixture.runtime.openCodeBin,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.urls.web,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off', OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' };
  const headers = { 'x-od-workspace-id': space.workspaceId, 'x-od-workspace-member-id': actor.memberId,
    'x-od-workspace-role': role, 'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active' };
  const requests: Array<{ at: string; method: string; path: string; workspaceId: string | null }> = [];
  const concurrencyResponses: Array<{ at: string; status: number; hintStatus: string | null; running: number | null; limit: number | null }> = [];
  const concurrencyResponseReads: Promise<void>[] = [];
  const runResponses: Array<{ status: number; runId: string | null }> = [];
  const responseReads: Promise<void>[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ at: new Date().toISOString(), method: request.method(),
      path, workspaceId: request.headers()['x-od-workspace-id'] ?? null });
  });
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/workspace/billing/request-concurrency') {
      concurrencyResponseReads.push(response.json().then(body => {
        const hint = body?.requestConcurrencyHint;
        concurrencyResponses.push({ at: new Date().toISOString(), status: response.status(),
          hintStatus: typeof hint?.status === 'string' ? hint.status : null,
          running: Number.isSafeInteger(hint?.running) ? hint.running : null,
          limit: Number.isSafeInteger(hint?.limit) ? hint.limit : null });
      }).catch(() => { concurrencyResponses.push({ at: new Date().toISOString(), status: response.status(),
        hintStatus: null, running: null, limit: null }); }));
    }
    if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/runs') return;
    responseReads.push(response.json().then(body => {
      runResponses.push({ status: response.status(), runId: typeof body?.runId === 'string' ? body.runId : null });
    }).catch(() => { runResponses.push({ status: response.status(), runId: null }); }));
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort();
  });
  const postCount = () => requests.filter(item => item.method === 'POST' && item.path === '/api/runs').length;
  const projectId = `link-f04-${binding.attemptId}`;
  const artifactName = 'existing-output.html';
  const artifact = '<!doctype html><html><body><h1>Existing F04 output survives</h1></body></html>';
  const challenge = `QA:${JSON.stringify({ id: `f04-${binding.attemptId}`, tokens: 1000, hold: false })} Reply ok only.`;
  let succeeded = false;
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    const status = await (await fetch(runtime.url.web('/api/integrations/vela/status'))).json();
    expect(status.loggedIn).toBe(true);
    expect(status.user?.id).toBe(actor.userId);
    const context = await (await fetch(runtime.url.web('/api/workspace/context'), { headers })).json();
    expect(context.context).toMatchObject({ workspaceId: space.workspaceId, workspaceMemberId: actor.memberId, role });
    const billingUrl = new URL('/api/workspace/billing/preflight', runtime.url.web());
    billingUrl.search = new URLSearchParams({ scope: 'workspace', workspaceId: space.workspaceId,
      includePreflight: '1', modelId: fixture.runtime.modelId }).toString();
    const billingResponse = await fetch(billingUrl, { headers });
    const billing = await billingResponse.json();
    await save('initial-real-preflight.private.json', { status: billingResponse.status, ...billing });
    expect(billingResponse.status, JSON.stringify(billing)).toBe(200);
    expect(billing.preflight).toMatchObject({ workspaceId: space.workspaceId,
      workspaceMemberId: actor.memberId, fundingCheck: 'available', modelId: fixture.runtime.modelId });
    const created = await fetch(runtime.url.web('/api/projects'), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'F04 actual Link full', metadata: { kind: 'prototype' } }) });
    expect(created.ok, await created.text()).toBe(true);
    const saved = await fetch(runtime.url.web(`/api/projects/${projectId}/files`), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: artifactName, content: artifact, encoding: 'utf8' }) });
    expect(saved.ok, await saved.text()).toBe(true);
    await page.addInitScript(({ appConfig, workspaceId, workspaceMemberId }) => {
      localStorage.setItem('open-design:config', JSON.stringify(appConfig));
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId, workspaceMemberId }));
    }, { appConfig: config, workspaceId: space.workspaceId, workspaceMemberId: actor.memberId });
    await page.goto(surface === 'home' ? runtime.url.web('/') : runtime.url.web(`/projects/${projectId}`),
      { waitUntil: 'domcontentloaded', timeout: T.xlong });
    if (surface === 'project') {
      await expect(page.frameLocator('[data-testid="artifact-preview-frame"]')
        .getByRole('heading', { name: 'Existing F04 output survives' })).toBeVisible({ timeout: T.long });
    }
    const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
    const send = page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send');
    const staged = page.getByTestId(surface === 'home' ? 'home-hero-staged-files' : 'staged-attachments');
    await expect(input).toBeVisible({ timeout: T.long });
    await input.fill(challenge);
    const upload = surface === 'project' ? page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith(`/projects/${projectId}/upload`)) : null;
    await page.getByTestId(surface === 'home' ? 'home-hero-file-input' : 'chat-file-input')
      .setInputFiles({ name: 'f04-brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Original attachment bytes.') });
    if (upload) expect((await upload).ok()).toBe(true);
    await expect(staged).toContainText('f04-brief.txt');
    await marker('F04-ready.json', { projectId, challenge, stage: 'await actual Link-full hold' });
    const held = await receipt('F04-held.json');
    expect(Number(held.running)).toBe(space.limit);
    expect(Number(held.limit)).toBe(space.limit);
    expect(held.heldWorkspaceId).toBe(space.workspaceId);
    const heldRequestIds = held.heldRequestIds as string[];
    expect(Array.isArray(heldRequestIds)).toBe(true);
    expect(heldRequestIds).toHaveLength(space.limit);
    expect(heldRequestIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(heldRequestIds).size).toBe(space.limit);
    const before = postCount();
    await send.click();
    const dialog = page.getByTestId('amr-concurrency-dialog');
    await expect(dialog).toBeVisible({ timeout: T.long });
    await expect(input).toHaveText(challenge);
    await expect(staged).toContainText('f04-brief.txt');
    if (role !== 'owner' || tier !== 'max') {
      await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(480);
      await expect(dialog.locator('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
      await expect.poll(() => dialog.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    }
    if (role === 'owner' && tier !== 'max') {
      await expect(dialog.locator('li')).toHaveText([
        '无需复杂配置，海量 SOTA 模型任选',
        '邀请成员免费加入，共享额度',
        '支持多模态图像创作，图文一站生成',
        '作品一键发布上线，链接随时分享',
      ]);
      await expect(page.getByTestId('amr-concurrency-upgrade')).toHaveText('升级套餐');
      await expect(page.getByTestId('amr-concurrency-close')).toHaveText('暂不需要');
    } else if (role === 'owner') {
      await expect(dialog).toContainText('等待');
      await expect(page.getByTestId('amr-concurrency-upgrade')).toHaveCount(0);
    } else {
      await expect(dialog).toContainText('联系团队空间所有者');
      await expect(page.getByTestId('amr-concurrency-upgrade')).toHaveCount(0);
      await expect(page.getByTestId('amr-concurrency-close')).toHaveText('知道了');
    }
    const existing = await fetch(runtime.url.web(`/api/projects/${projectId}/files/${artifactName}`), { headers });
    expect(existing.ok && await existing.text() === artifact).toBe(true);
    if (surface === 'project') {
      await expect(page.frameLocator('[data-testid="artifact-preview-frame"]')
        .getByRole('heading', { name: 'Existing F04 output survives' })).toBeVisible();
    }
    const rejectedPosts = postCount() - before;
    expect(rejectedPosts).toBeLessThanOrEqual(1);
    await expect.poll(() => runResponses.length, { timeout: T.long }).toBe(rejectedPosts);
    await Promise.all(responseReads);
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await dialog.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))); });
    await page.screenshot({ path: join(output, 'F04-refused.png') });
    await dialog.screenshot({ path: join(output, 'dialog-default.png') });
    if (role === 'owner' && tier !== 'max') {
      const popup = page.waitForEvent('popup');
      await page.getByTestId('amr-concurrency-upgrade').click();
      const upgradePage = await popup;
      const target = new URL(upgradePage.url());
      expect(target.searchParams.get('workspaceId')).toBe(space.workspaceId);
      expect(target.searchParams.get('billing')).toBe('plan');
      await save('upgrade-entry.safe.json', { workspaceId: space.workspaceId, tier, url: target.toString() });
      await upgradePage.close();
    }
    await save('F04-refused.safe.json', { binding, held, before, rejectedPosts, runResponses, requests,
      dialog: await dialog.innerText(), geometry: await dialog.boundingBox() });
    await marker('F04-rejected.json', { projectId, challenge, runPosts: rejectedPosts, runResponses });
    const refusal = await receipt('F04-refusal-verified.json');
    expect(refusal.challenge).toBe(challenge);
    expect(Number(refusal.running)).toBe(space.limit);
    expect(refusal.heldWorkspaceId).toBe(space.workspaceId);
    expect((refusal.heldRequestIds as string[]).slice().sort()).toEqual(heldRequestIds.slice().sort());
    if (refusal.admissionSource === 'link') {
      expect(refusal.admissionFailureCode).toMatch(/tier_limit_exceeded|membership_concurrency_limit/);
      expect(rejectedPosts).toBe(1);
      expect(runResponses).toHaveLength(1);
      expect(runResponses[0]?.status).toBe(202);
      expect(runResponses[0]?.runId).toEqual(expect.any(String));
      expect(runResponses[0]?.runId?.length).toBeGreaterThan(0);
      expect(refusal.runId).toBe(runResponses[0]?.runId);
      expect(refusal.rejectedLinkRequestId).toEqual(expect.any(String));
      expect(String(refusal.rejectedLinkRequestId).length).toBeGreaterThan(0);
    } else {
      expect(refusal.admissionSource).toBe('hint');
      expect(refusal.hintStatus).toBe('full');
      expect(rejectedPosts).toBe(0);
      expect(refusal.runId).toBeNull();
    }
    expect(Number(refusal.newUpstreamCount)).toBe(0);
    expect(Number(refusal.newCreditUsageCount)).toBe(0);
    await page.getByTestId('amr-concurrency-close').click();
    await expect(input).toHaveText(challenge);
    await expect(staged).toContainText('f04-brief.txt');
    await marker('F04-release-ready.json', { projectId });
    const released = await receipt('F04-one-released.json');
    expect(Number(released.running)).toBe(space.limit - 1);
    expect(released.heldWorkspaceId).toBe(space.workspaceId);
    expect(heldRequestIds).toContain(released.releasedRequestId);
    expect((released.remainingHeldRequestIds as string[]).slice().sort())
      .toEqual(heldRequestIds.filter(id => id !== released.releasedRequestId).sort());
    const idleStart = new Date().toISOString();
    const automatic = await page.waitForEvent('request', { predicate: request => request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/runs', timeout: 5000 }).catch(() => null);
    expect(automatic).toBeNull();
    if (surface === 'project') {
      await expect(page.frameLocator('[data-testid="artifact-preview-frame"]')
        .getByRole('heading', { name: 'Existing F04 output survives' })).toBeVisible();
    }
    await save('F04-released-no-click.safe.json', { binding, idleStart, observedAt: new Date().toISOString(),
      released, requests });
    await page.screenshot({ path: join(output, 'F04-released-no-click.png') });
    const manualClickAt = new Date().toISOString();
    const runResponse = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
    await send.click();
    const response = await runResponse;
    expect(response.status()).toBe(202);
    const run = await response.json();
    expect(run.runId).toEqual(expect.any(String));
    expect(postCount()).toBe(before + rejectedPosts + 1);
    let terminal = '';
    await expect.poll(async () => {
      const response = await fetch(runtime.url.web(`/api/runs/${run.runId}`));
      expect(response.status).toBe(200);
      const body = await response.json(); terminal = body.status;
      return ['succeeded', 'failed', 'canceled', 'error'].includes(terminal);
    }, { timeout: T.xlong }).toBe(true);
    expect(terminal).toBe('succeeded');
    await marker('F04-manual-ready.json', { projectId, runId: run.runId, challenge, terminal });
    const verified = await receipt('F04-manual-verified.json');
    if (verified.error) throw new Error(`F04 accounting receipt blocked: ${String(verified.error)}`);
    expect(verified.runId).toBe(run.runId);
    expect(verified.billingWorkspaceId).toBe(space.workspaceId);
    expect(verified.fundingKind).toMatch(/^(coding_plan|wallet)$/);
    expect(Number(verified.targetSuccessfulUpstreamCount)).toBeGreaterThan(0);
    expect(Number(verified.targetUsageCount)).toBeGreaterThanOrEqual(Number(verified.targetSuccessfulUpstreamCount));
    expect(Number(verified.auxiliaryUsageCount)).toBeGreaterThanOrEqual(Number(verified.auxiliarySuccessfulUpstreamCount));
    expect(Number(verified.unsettledSuccessfulCallCount)).toBe(0);
    expect(Number(verified.unmatchedChargeCount)).toBe(0);
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
      expect(call.chargedWorkspaceId).toBe(space.workspaceId);
    }
    await save('F04-manual.safe.json', { binding, manualClickAt, run, requests, verified });
    succeeded = true;
  } finally {
    await Promise.allSettled(concurrencyResponseReads);
    await save('request-timeline.safe.json', { binding, requests, concurrencyResponses });
    await page.context().close().catch(() => undefined);
    await runtime.stopWeb(env);
    await info.attach('owned-runtime-stopped', { body: JSON.stringify(await runtime.status(env)), contentType: 'application/json' });
    if (succeeded) await rm(root, { recursive: true, force: true });
  }
});
