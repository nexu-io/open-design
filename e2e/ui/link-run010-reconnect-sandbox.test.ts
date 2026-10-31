import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrowserContext, Page, Request } from '@playwright/test';

import { clusterTest as test, expect } from '@/playwright/suite';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { T } from '@/timeouts';

type Space = { workspaceId: string; workspaceMemberId: string; workspaceName: string;
  ownerUserId: string; tier: 'go' | 'plus' | 'pro' | 'max' };
type Fixture = {
  alias: string; tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; modelId: string; depletionPrompt?: string };
  actor: { controlKey: string; runtimeKey: string; userId: string; email: string; name: string };
  spaces: { C: Space; D: Space };
};
type RunPost = { workspaceId: string | null; memberId: string | null;
  body: Record<string, unknown> };

test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

function headers(space: Space) {
  return { 'x-od-workspace-id': space.workspaceId,
    'x-od-workspace-member-id': space.workspaceMemberId,
    'x-od-workspace-role': 'owner', 'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active' };
}

async function prepare(group: 'C' | 'D') {
  const fixturePath = process.env.OD_LINK_RUN010_FIXTURE;
  const evidenceRoot = process.env.OD_LINK_RUN010_EVIDENCE;
  if (!fixturePath || !evidenceRoot) throw new Error('Explicit owned RUN010 fixture/evidence required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture 0600 required');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: e2eWorkspaceRoot(), encoding: 'utf8',
  }).trim();
  const space = fixture.spaces?.[group];
  if (!fixture.alias || fixture.tuple?.odSha !== odSha || !fixture.tuple.amrSha
    || !fixture.runtime?.velaBin || !fixture.runtime.openCodeBin || !fixture.runtime.modelId
    || !fixture.actor?.controlKey || !fixture.actor.runtimeKey || !fixture.actor.userId
    || !space?.workspaceId || !space.workspaceMemberId || space.ownerUserId !== fixture.actor.userId
    || fixture.spaces.C.workspaceId === fixture.spaces.D.workspaceId) {
    throw new Error('Incomplete fixed RUN010 same-owner isolated C/D fixture');
  }
  for (const endpoint of Object.values(fixture.urls)) {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Only isolated loopback endpoints permitted');
    }
  }
  if (group === 'D' && !fixture.runtime.depletionPrompt) {
    throw new Error('D requires a provider-controlled prompt that produces natural depletion and a real 402');
  }
  const output = join(evidenceRoot, group);
  const markers = join(output, 'markers');
  await mkdir(markers, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  await chmod(markers, 0o700);
  if ((await readdir(markers)).length) throw new Error('Fresh empty RUN010 group markers required');
  const binding = { protocol: 'od-link-run010-manual-v1', alias: fixture.alias, group,
    attemptId: randomUUID(), fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
    odSha, amrSha: fixture.tuple.amrSha, workspaceId: space.workspaceId,
    workspaceMemberId: space.workspaceMemberId, modelId: fixture.runtime.modelId };
  const save = (name: string, value: unknown) => writeFile(join(output, name),
    JSON.stringify(value, null, 2), { mode: 0o600 });
  const marker = async (name: string, value: Record<string, unknown>) => {
    const target = join(markers, name);
    const temporary = target + '.' + process.pid + '.tmp';
    await writeFile(temporary, JSON.stringify({ ...binding, ...value, at: new Date().toISOString() }),
      { mode: 0o600, flag: 'wx' });
    await rename(temporary, target);
  };
  const receipt = async (name: string, readyAt: string) => {
    let value!: Record<string, unknown>;
    await expect.poll(async () => {
      try { value = JSON.parse(await readFile(join(markers, name), 'utf8')); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
    }, { timeout: T.xlong * 2, intervals: [250, 500, 1000] }).toBe(true);
    expect(value).toMatchObject(binding);
    expect(Date.parse(String(value.at))).toBeGreaterThanOrEqual(Date.parse(readyAt));
    expect(value.receiptFile).toMatch(/^[a-zA-Z0-9.-]+\.safe\.json$/);
    expect(value.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    const raw = await readFile(join(markers, String(value.receiptFile)));
    expect(createHash('sha256').update(raw).digest('hex')).toBe(value.receiptDigest);
    await save(name, value);
    if (value.error) throw new Error('RUN010 coordinator blocked: ' + String(value.error));
    return value;
  };
  return { fixture, space, output, binding, save, marker, receipt };
}

async function funding(runtime: ReturnType<typeof createToolsDevSuite>, space: Space, modelId: string) {
  const url = new URL('/api/workspace/billing/preflight', runtime.url.web());
  url.search = new URLSearchParams({ workspaceId: space.workspaceId, modelId }).toString();
  const response = await fetch(url, { headers: headers(space) });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.preflight).toMatchObject({ workspaceId: space.workspaceId,
    workspaceMemberId: space.workspaceMemberId, modelId });
  return body.preflight as { fundingCheck: string };
}

async function closeFundingDialog(page: Page) {
  const dialog = page.getByTestId('amr-balance-dialog');
  await expect(dialog).toBeVisible({ timeout: T.long });
  await dialog.getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
  await expect(dialog).toBeHidden();
}

async function noAutomaticPost(page: Page, posts: RunPost[], expected: number) {
  const unexpected = await page.waitForEvent('request', { predicate: request =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs',
  timeout: 5000 }).catch(() => null);
  expect(unexpected, 'funding recovery/online must not create another run').toBeNull();
  expect(posts).toHaveLength(expected);
}

for (const group of ['C', 'D'] as const) {
  test(`[P1] RUN010 ${group === 'C' ? 'pre-send refusal' : 'in-run depletion'} reconnect keeps unsent input manual and preserves original workspace`, async ({ browser }) => {
    test.setTimeout(T.xlong * 10);
    const { fixture, space, output, binding, save, marker, receipt } = await prepare(group);
    if (group === 'D') {
      await expect.poll(async () => {
        try {
          const ready = JSON.parse(await readFile(join(output, 'observer-ready.safe.json'), 'utf8'));
          expect(ready).toMatchObject({group, alias:fixture.alias, fixtureSha256:binding.fixtureSha256,
            odSha:fixture.tuple.odSha, amrSha:fixture.tuple.amrSha});
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
          throw error;
        }
      }, {timeout:T.long}).toBe(true);
    }
    const namespace = 'link-run010-' + group.toLowerCase() + '-' + randomUUID().slice(0, 8);
    const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
    const scratch = join(root, 'scratch');
    const dataDir = join(scratch, 'data');
    const amrHome = join(scratch, 'amr-home');
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await mkdir(amrHome, { recursive: true, mode: 0o700 });
    await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
      controlKey: fixture.actor.controlKey, runtimeKey: fixture.actor.runtimeKey,
      apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
      user: { id: fixture.actor.userId, email: fixture.actor.email, name: fixture.actor.name },
    } } }), { mode: 0o600 });
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
      OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' };
    const runtime = createToolsDevSuite({ root, dataDir, namespace, ownerPid: process.pid,
      codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
    let context: BrowserContext | undefined;
    let started = false;
    const posts: RunPost[] = [];
    const billingRequests = new Map<Request, string>();
    const billingResponses: Array<{ requestedAt: string; completedAt: string;
      status: number; workspaceId: string | null; workspaceMemberId: string | null;
      fundingCheck: string | null; balanceUsd: string | null }> = [];
    try {
      await runtime.startWeb(env); started = true;
      await warmPlaywrightWebRuntime(runtime.url.web('/'));
      await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
      expect((await funding(runtime, space, fixture.runtime.modelId)).fundingCheck)
        .toBe(group === 'C' ? 'insufficient' : 'available');
      context = await browser.newContext({ viewport: { width: 1280, height: 800 },
        recordVideo: { dir: output } });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ? route.continue() : route.abort();
      });
      await context.addInitScript(({ appConfig, selected, origin }) => {
        if (location.origin !== origin) return;
        localStorage.setItem('open-design:config', JSON.stringify(appConfig));
        localStorage.setItem('open-design:locale', 'zh-CN');
        localStorage.setItem('open-design:locale-source', 'manual');
        sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(selected));
      }, { appConfig: config, selected: space, origin: new URL(runtime.url.web('/')).origin });
      const page = await context.newPage();
      page.on('request', request => {
        const url = new URL(request.url());
        if (request.method() === 'GET'
          && ['/api/workspace/billing', '/api/workspace/billing/preflight'].includes(url.pathname)
          && url.searchParams.get('workspaceId') === space.workspaceId) {
          billingRequests.set(request, new Date().toISOString());
        }
        if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/runs') return;
        posts.push({ workspaceId: request.headers()['x-od-workspace-id'] ?? null,
          memberId: request.headers()['x-od-workspace-member-id'] ?? null,
          body: request.postDataJSON() as Record<string, unknown> });
      });
      page.on('response', response => {
        const requestedAt = billingRequests.get(response.request());
        if (!requestedAt) return;
        billingRequests.delete(response.request());
        void response.json().then((body) => {
          const wallet = body.workspaceBalance ?? body.workspaceSnapshot;
          const proof = body.preflight ?? wallet;
          billingResponses.push({ requestedAt, completedAt: new Date().toISOString(),
            status: response.status(), workspaceId: proof?.workspaceId ?? null,
            workspaceMemberId: proof?.workspaceMemberId ?? null,
            fundingCheck: body.preflight?.fundingCheck ?? null,
            balanceUsd: body.preflight?.balanceUsd ?? wallet?.balanceUsd ?? wallet?.wallet?.balanceUsd ?? null });
        }).catch(() => undefined);
      });
      let projectId: string | undefined;
      if (group === 'D') {
        projectId = 'run010-d-' + randomUUID();
        const created = await fetch(runtime.url.web('/api/projects'), { method: 'POST',
          headers: { ...headers(space), 'content-type': 'application/json' },
          body: JSON.stringify({ id: projectId, name: 'RUN010 in-run depletion', metadata: { kind: 'prototype' } }) });
        expect(created.ok, await created.text()).toBe(true);
      }
      await page.goto(runtime.url.web(projectId ? '/projects/' + projectId : '/'),
        { waitUntil: 'domcontentloaded', timeout: T.xlong });
      const input = page.getByTestId(group === 'C' ? 'home-hero-input' : 'chat-composer-input');
      const send = page.getByTestId(group === 'C' ? 'home-hero-submit' : 'chat-send');
      await expect(input).toBeVisible({ timeout: T.xlong });
      const draft = group === 'C'
        ? 'RUN010 C preserve original input QA:' + JSON.stringify({ id: 'run010-c-' + binding.attemptId, tokens: 16 })
        : fixture.runtime.depletionPrompt!;
      await input.fill(draft);
      const attachment = 'run010-' + group.toLowerCase() + '-' + binding.attemptId + '.txt';
      if (group === 'C') {
        await page.getByTestId('home-hero-file-input').setInputFiles({ name: attachment,
          mimeType: 'text/plain', buffer: Buffer.from(draft) });
        await send.click();
        await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
        expect(posts).toHaveLength(0);
        await expect(input).toHaveText(draft);
        await expect(page.getByTestId('home-hero-staged-files')).toContainText(attachment);
      } else {
        const accepted = page.waitForResponse(response => response.request().method() === 'POST'
          && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
        await send.click();
        const response = await accepted;
        expect(response.status()).toBe(202);
        const run = await response.json() as { runId?: string };
        expect(run.runId).toMatch(/^[0-9a-f-]{36}$/i);
        const observedAt = new Date().toISOString();
        await marker('RUN010-D-observe-ready.json', { runId: run.runId, observedAt,
          clientWebUrl: runtime.url.web('/'), runtimeDataDir: dataDir });
        const refused = await receipt('RUN010-D-insufficient.json', observedAt);
        expect(refused).toMatchObject({ runId: run.runId, upstreamInsufficientStatus: 402,
          fundingCheck: 'insufficient', allChargesInTargetWorkspace: true });
        expect(Number(refused.successfulUpstreamCount)).toBeGreaterThan(0);
        let originalRun: Record<string, unknown> = {};
        await expect.poll(async () => {
          const result = await fetch(runtime.url.web('/api/runs/' + run.runId), { headers: headers(space) });
          expect(result.status).toBe(200);
          originalRun = await result.json() as Record<string, unknown>;
          return originalRun.status;
        }, { timeout: T.xlong, intervals: [100, 250, 500] }).toBe('failed');
        expect(originalRun.errorCode).toBe('AMR_INSUFFICIENT_BALANCE');
        await expect(page.getByTestId('chat-upgrade-card')).toBeVisible({ timeout: T.long });
        await save('RUN010-D-original-run.safe.json', { binding, refused, originalRun, posts });
      }
      const priorPosts = posts.length;
      expect(priorPosts).toBe(group === 'C' ? 0 : 1);
      await page.screenshot({ path: join(output, 'RUN010-before-offline.png') });
      if (group === 'C' || await page.getByTestId('amr-balance-dialog').isVisible()) {
        await closeFundingDialog(page);
      }
      await context.setOffline(true);
      const fundAt = new Date().toISOString();
      await marker('RUN010-' + group + '-fund-ready.json', { offline: true, runPosts: priorPosts,
        clientWebUrl: runtime.url.web('/'), runtimeDataDir: dataDir });
      const funded = await receipt('RUN010-' + group + '-funded.json', fundAt);
      expect(funded).toMatchObject({ paymentStatus: 'paid', entitlementStatus: 'applied',
        rechargeSource: 'stripe_checkout', webhookSignatureVerified: true, fundingCheck: 'available',
        rechargeCountDelta: 1 });
      for (const key of ['operationId', 'checkoutSessionId', 'webhookEventId']) {
        expect(typeof funded[key]).toBe('string'); expect(String(funded[key]).length).toBeGreaterThan(0);
      }
      const onlineAt = new Date().toISOString();
      await context.setOffline(false);
      await page.waitForFunction(() => navigator.onLine, undefined, { timeout: T.long });
      // Observe the product's own SSE/online/poll refresh. No test-generated
      // billing event is dispatched and no test request warms this read.
      await expect.poll(() => billingResponses.some((item) => item.status === 200
        && Date.parse(item.requestedAt) >= Date.parse(onlineAt)
        && item.workspaceId === space.workspaceId && item.workspaceMemberId === space.workspaceMemberId
        && (item.fundingCheck === 'available' || Number(item.balanceUsd) > 0)),
      { timeout: T.xlong, intervals: [250, 500, 1000] }).toBe(true);
      await noAutomaticPost(page, posts, priorPosts);
      if (group === 'C') {
        await expect(input).toHaveText(draft);
        await expect(page.getByTestId('home-hero-staged-files')).toContainText(attachment);
        await expect(page.getByTestId('queued-send-banner')).toHaveCount(0);
      } else {
        // Funding failure has an upgrade card, not a generic retry card. A new
        // explicit Send of the original task is the shipped retry surface.
        await input.fill(draft);
      }
      await page.screenshot({ path: join(output, 'RUN010-recovered-no-click.png') });
      await save('RUN010-recovered-no-click.safe.json', { binding, funded, onlineAt, billingResponses, posts });
      const manualAt = new Date().toISOString();
      await marker('RUN010-' + group + '-manual-intent.json', { manualAt,
        priorPosts, originalWorkspaceId: space.workspaceId });
      const accepted = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
      await send.click();
      const response = await accepted;
      expect(response.status()).toBe(202);
      const run = await response.json() as { runId?: string };
      expect(run.runId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(posts).toHaveLength(priorPosts + 1);
      expect(posts.at(-1)).toMatchObject({ workspaceId: space.workspaceId, memberId: space.workspaceMemberId });
      expect(String(posts.at(-1)?.body.currentPrompt)).toContain(draft);
      if (group === 'C') expect(posts.at(-1)?.body.attachments).toHaveLength(1);
      const manualProjectId = String(posts.at(-1)?.body.projectId);
      if (group === 'D') expect(manualProjectId).toBe(projectId);
      await marker('RUN010-' + group + '-manual-ready.json', { runId: run.runId,
        projectId: manualProjectId, manualAt, priorPosts, totalRunPosts: posts.length });
      const verified = await receipt('RUN010-' + group + '-manual-verified.json', manualAt);
      expect(verified).toMatchObject({ runId: run.runId, runStatus: 'succeeded',
        allChargesInTargetWorkspace: true, unsettledSuccessfulCallCount: 0, unmatchedChargeCount: 0,
        duplicateLedgerUsageCount: 0 });
      expect(Number(verified.successfulUpstreamCount)).toBeGreaterThan(0);
      expect(Number(verified.canonicalUsageCount)).toBe(Number(verified.uniqueCanonicalRequestCount));
      expect(Number(verified.chargeableCallCount)).toBe(Number(verified.uniqueLedgerUsageCount));
      expect(Number(verified.successfulUpstreamCount)).toBe(Number(verified.canonicalUsageCount));
      const terminal = await fetch(runtime.url.web('/api/runs/' + run.runId), { headers: headers(space) });
      expect(terminal.status).toBe(200);
      expect((await terminal.json()).status).toBe('succeeded');
      expect(posts).toHaveLength(priorPosts + 1);
      await page.screenshot({ path: join(output, 'RUN010-manual-complete.png') });
      await save('RUN010-complete.safe.json', { binding, actualOdSha: binding.odSha,
        actualAmrSha: binding.amrSha, group, manualRunId: run.runId, priorPosts,
        finalRunPostCount: posts.length, noAutomaticSend: true, posts, verified });
    } finally {
      await context?.close().catch(() => undefined);
      if (started) await runtime.stopWeb(env).catch(() => undefined);
    }
  });
}
