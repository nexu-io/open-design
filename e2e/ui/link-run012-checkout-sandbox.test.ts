import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { BrowserContext, Page, Request } from '@playwright/test';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

type Space = { workspaceId: string; workspaceMemberId: string; workspaceName: string;
  ownerUserId: string; tier: 'go' | 'plus' | 'pro' | 'max' };
type Fixture = {
  alias: string;
  tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; modelId: string };
  actor: { controlKey: string; runtimeKey: string; userId: string; email: string; name: string;
    consoleCookie: { name: string; value: string } };
  spaces: { A: Space; B: Space };
};
type Binding = {
  protocol: 'od-link-run012-checkout-v1'; alias: string; attemptId: string;
  fixtureSha256: string; odSha: string; amrSha: string;
  aWorkspaceId: string; bWorkspaceId: string; modelId: string;
};
type RunCall = { at: string; workspaceId: string | null; body: {
  currentPrompt?: unknown; attachments?: unknown; projectId?: unknown;
  conversationId?: unknown; userMessageId?: unknown;
} };

const fixturePath = process.env.OD_LINK_RUN012_FIXTURE;
const output = process.env.OD_LINK_RUN012_EVIDENCE;

test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

async function prepare() {
  if (!fixturePath || !output) throw new Error('Explicit RUN012 fixture and evidence directory required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture 0600 required');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const fixtureSha256 = createHash('sha256').update(bytes).digest('hex');
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: e2eWorkspaceRoot(), encoding: 'utf8',
  }).trim();
  if (!fixture.alias || fixture.tuple?.odSha !== odSha || !fixture.tuple.amrSha
    || !fixture.runtime?.velaBin || !fixture.runtime.openCodeBin || !fixture.runtime.modelId
    || !fixture.actor?.controlKey || !fixture.actor.runtimeKey || !fixture.actor.userId
    || !fixture.actor.consoleCookie?.name || !fixture.actor.consoleCookie.value
    || !fixture.spaces?.A?.workspaceId || !fixture.spaces?.B?.workspaceId
    || fixture.spaces.A.workspaceId === fixture.spaces.B.workspaceId
    || fixture.spaces.A.workspaceMemberId === fixture.spaces.B.workspaceMemberId
    || fixture.spaces.A.ownerUserId !== fixture.actor.userId
    || fixture.spaces.B.ownerUserId !== fixture.actor.userId) {
    throw new Error('Incomplete fixed RUN012 same-account independent A/B fixture');
  }
  for (const value of Object.values(fixture.urls)) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Only isolated loopback AMR endpoints permitted');
    }
  }
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const markers = join(output, 'markers');
  await mkdir(markers, { recursive: true, mode: 0o700 });
  await chmod(markers, 0o700);
  if ((await readdir(markers)).length !== 0) throw new Error('Fresh empty RUN012 marker directory required');
  const binding: Binding = {
    protocol: 'od-link-run012-checkout-v1', alias: fixture.alias, attemptId: randomUUID(),
    fixtureSha256, odSha, amrSha: fixture.tuple.amrSha,
    aWorkspaceId: fixture.spaces.A.workspaceId, bWorkspaceId: fixture.spaces.B.workspaceId,
    modelId: fixture.runtime.modelId,
  };
  const save = (name: string, value: unknown) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
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
      try {
        value = JSON.parse(await readFile(join(markers, name), 'utf8')) as Record<string, unknown>;
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
        throw error;
      }
    }, { timeout: 180_000, intervals: [250, 500, 1000] }).toBe(true);
    expect(value).toMatchObject(binding);
    expect(Date.parse(String(value.at))).toBeGreaterThanOrEqual(Date.parse(readyAt));
    expect(value.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(value.receiptFile).toMatch(/^[a-zA-Z0-9.-]+\.safe\.json$/);
    const evidence = await readFile(join(markers, String(value.receiptFile)));
    expect(createHash('sha256').update(evidence).digest('hex')).toBe(value.receiptDigest);
    await save(name, value);
    if (value.error) throw new Error('RUN012 sandbox receipt blocked: ' + String(value.error));
    return value;
  };
  return { fixture, binding, save, marker, receipt };
}

function workspaceHeaders(space: Space) {
  return {
    'x-od-workspace-id': space.workspaceId,
    'x-od-workspace-member-id': space.workspaceMemberId,
    'x-od-workspace-role': 'owner',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active',
  };
}

async function preflight(runtime: ReturnType<typeof createToolsDevSuite>, space: Space, modelId: string) {
  const url = new URL('/api/workspace/billing', runtime.url.web());
  url.search = new URLSearchParams({
    scope: 'workspace', workspaceId: space.workspaceId, includePreflight: '1', modelId,
  }).toString();
  const response = await fetch(url, { headers: workspaceHeaders(space) });
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBe(200);
  expect(body.preflight).toMatchObject({
    workspaceId: space.workspaceId, workspaceMemberId: space.workspaceMemberId, modelId,
  });
  return body.preflight as { fundingCheck: string; modelCovered?: boolean };
}

async function selectWorkspace(page: Page, space: Space) {
  const rail = page.getByTestId('entry-rail-collapse');
  if (await rail.getAttribute('aria-expanded') !== 'true') await rail.click();
  await page.getByTestId('workspace-switcher').click();
  const row = page.getByTestId('workspace-switcher-list').getByRole('menuitem')
    .filter({ hasText: space.workspaceName });
  const changed = page.waitForResponse(response => response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/workspace/active', { timeout: T.medium });
  await row.click();
  const response = await changed;
  expect(response.status()).toBe(200);
  expect((await response.json()).context.workspaceId).toBe(space.workspaceId);
  await expect(page.getByTestId('workspace-switcher')).toContainText(space.workspaceName);
}

function runPosts(calls: RunCall[]) { return calls.length; }

async function persistedRunIds(dataDir: string) {
  try {
    const entries = await readdir(join(dataDir, 'runs'), { withFileTypes: true });
    return entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function assertNoUnsentHomeRun(page: Page, dataDir: string, initialRunIds: string[]) {
  const runIds = await persistedRunIds(dataDir);
  expect(runIds, 'A draft must not create a durable OD run before a manual send')
    .toEqual(initialRunIds);
  const queuedSends = await page.evaluate(() => {
    const entries: Array<{ key: string; count: number }> = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith('od:chat-queued-sends:')) continue;
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      entries.push({ key, count: Array.isArray(parsed) ? parsed.length : -1 });
    }
    return entries;
  });
  expect(queuedSends.every(entry => entry.count === 0),
    'A Home draft must not enter a durable project send queue').toBe(true);
  return { runIds, queuedSends };
}

async function waitNoRunPost(page: Page, calls: RunCall[]) {
  // A real no-click window lets billing events, visibility and polling finish.
  const unexpected = await page.waitForEvent('request', {
    predicate: request => request.method() === 'POST'
      && new URL(request.url()).pathname === '/api/runs', timeout: 5000,
  }).catch(() => null);
  expect(unexpected).toBeNull();
  expect(runPosts(calls)).toBe(0);
}

async function assertRetained(page: Page, draft: string, attachment: string) {
  await expect(page.getByTestId('home-hero-input')).toHaveText(draft);
  await expect(page.getByTestId('home-hero-staged-files')).toContainText(attachment);
  await expect(page.getByTestId('queued-send-banner')).toHaveCount(0);
}

async function terminalRun(runtime: ReturnType<typeof createToolsDevSuite>,
  dataDir: string, space: Space, runId: string) {
  let value: Record<string, unknown> = {};
  await expect.poll(async () => {
    const response = await fetch(runtime.url.web('/api/runs/' + runId), {
      headers: workspaceHeaders(space),
    });
    expect(response.status).toBe(200);
    value = await response.json() as Record<string, unknown>;
    return value.status;
  }, { timeout: 240_000, intervals: [500, 1000] }).toBe('succeeded');
  expect(value).toMatchObject({ id: runId, status: 'succeeded', signal: null,
    cancelOrigin: null, error: null, errorCode: null,
    failureCategory: null, endedWithUnfinishedWork: false });
  expect([0, 130]).toContain(value.exitCode);
  let acpEvidence: { eventsSha256: string; completedSteps: number;
    completedMessages: number; retryDiagnostics: number; agentUsageCount: number;
    agentErrorCount: number;
    incompleteLifecycleCount: number; runtimeCloseSucceeded: boolean;
    endSucceeded: boolean } | null = null;
  if (value.exitCode === 130) {
    // Vela can exit 130 after clean ACP completion. The original event stream
    // must prove that completion; the independent AMR receipt still checks
    // every successful canonical call and its original-space settlement.
    expect(runId).toMatch(/^[0-9a-f-]{36}$/i);
    const eventsPath = join(dataDir, 'runs', runId, 'events.jsonl');
    await expect.poll(async () => {
      try {
        const lines = (await readFile(eventsPath, 'utf8')).trim().split('\n');
        return (JSON.parse(lines.at(-1) ?? '{}') as { event?: string }).event ?? null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }, { timeout: T.long, intervals: [100, 250, 500] }).toBe('end');
    const bytes = await readFile(eventsPath);
    const events = bytes.toString().trim().split('\n').map(line => JSON.parse(line) as {
      event: string; data?: Record<string, unknown>;
    });
    const diagnostics = events.filter(event => event.event === 'agent'
      && event.data?.type === 'diagnostic');
    const completedSteps = diagnostics.filter(event => event.data?.name === 'model_step_lifecycle'
      && event.data.phase === 'end' && event.data.status === 'completed').length;
    const completedMessages = diagnostics.filter(event => event.data?.name === 'assistant_message_lifecycle'
      && event.data.phase === 'end' && event.data.status === 'completed').length;
    expect(completedSteps).toBeGreaterThan(0);
    expect(completedMessages).toBeGreaterThan(0);
    const agentUsageCount = events.filter(event => event.event === 'agent'
      && event.data?.type === 'usage').length;
    expect(agentUsageCount).toBeGreaterThan(0);
    const agentErrorCount = events.filter(event => event.event === 'agent'
      && event.data?.type === 'error').length;
    const incompleteLifecycleCount = diagnostics.filter(event =>
      ['model_step_lifecycle', 'assistant_message_lifecycle'].includes(
      String(event.data?.name)) && event.data?.phase === 'end'
      && event.data.status !== 'completed').length;
    const runtimeCloseSucceeded = events.some(event => event.event === 'diagnostic'
      && event.data?.type === 'runtime_close' && event.data.status === 'succeeded'
      && event.data.exit_code === 130);
    expect(agentErrorCount).toBe(0);
    expect(incompleteLifecycleCount).toBe(0);
    expect(runtimeCloseSucceeded).toBe(true);
    const end = events.at(-1);
    expect(end).toMatchObject({ event: 'end',
      data: { status: 'succeeded', code: 130, signal: null, endedWithUnfinishedWork: false,
        failureCategory: null } });
    const endSucceeded = end?.event === 'end' && end.data?.status === 'succeeded'
      && end.data.code === 130 && end.data.signal === null
      && end.data.endedWithUnfinishedWork === false && end.data.failureCategory === null;
    expect(endSucceeded).toBe(true);
    acpEvidence = { eventsSha256: createHash('sha256').update(bytes).digest('hex'),
      completedSteps, completedMessages,
      retryDiagnostics: diagnostics.filter(event => event.data?.name === 'model_retry').length,
      agentUsageCount,
      agentErrorCount, incompleteLifecycleCount, runtimeCloseSucceeded, endSucceeded };
  }
  return { status: value.status, exitCode: value.exitCode, errorCode: value.errorCode ?? null,
    signal: value.signal, cancelOrigin: value.cancelOrigin,
    error: value.error, failureCategory: value.failureCategory,
    endedWithUnfinishedWork: value.endedWithUnfinishedWork,
    acpEvidence };
}

test('[P0] RUN012 browser B checkout never funds or resubmits A until A is funded and manually sent', async ({ browser }) => {
  test.setTimeout(900_000);
  const { fixture, binding, save, marker, receipt } = await prepare();
  const namespace = 'link-run012-' + randomUUID().slice(0, 8);
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const dataDir = join(scratch, 'data');
  const amrHome = join(scratch, 'amr-home');
  const runtime = createToolsDevSuite({ root, dataDir, namespace, ownerPid: process.pid,
    codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: fixture.actor.controlKey, runtimeKey: fixture.actor.runtimeKey,
    apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
    user: { id: fixture.actor.userId, email: fixture.actor.email, name: fixture.actor.name },
  } } }), { mode: 0o600 });
  const config = {
    mode: 'daemon', agentId: 'amr', model: fixture.runtime.modelId, onboardingCompleted: true,
    privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: { amr: { model: fixture.runtime.modelId } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: fixture.runtime.velaBin } },
  };
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify(config), { mode: 0o600 });
  const env = {
    AMR_HOME: amrHome, VELA_BIN: fixture.runtime.velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api, VELA_LINK_URL: fixture.urls.link,
    VELA_CONTROL_KEY: fixture.actor.controlKey, VELA_OPENCODE_BIN: fixture.runtime.openCodeBin,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.urls.web,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
  };
  let context: BrowserContext | undefined;
  const calls: RunCall[] = [];
  const runResponses: Array<{ status: number; runId: string | null }> = [];
  const bBillingRequests = new Map<Request, string>();
  const bBillingResponses: Array<{ requestedAt: string; completedAt: string; status: number }> = [];
  const checkoutCapture: { current: { status: number; body: unknown } | null } = { current: null };
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    const directoryResponse = await fetch(runtime.url.web('/api/workspace/directory'));
    expect(directoryResponse.status).toBe(200);
    const directory = await directoryResponse.json();
    const items = directory.items ?? directory.workspaces ?? [];
    for (const space of [fixture.spaces.A, fixture.spaces.B]) {
      expect(items.some((item: Space) => item.workspaceId === space.workspaceId)).toBe(true);
    }
    const initialA = await preflight(runtime, fixture.spaces.A, fixture.runtime.modelId);
    const initialB = await preflight(runtime, fixture.spaces.B, fixture.runtime.modelId);
    expect(initialA.fundingCheck).toBe('insufficient');
    expect(initialB.fundingCheck).toBe('insufficient');
    expect(initialA.modelCovered).toBe(false);
    expect(initialB.modelCovered).toBe(false);
    await save('RUN012-initial.safe.json', { binding, initialA, initialB });
    context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: {
      dir: output!,
    } });
    await context.exposeBinding('__odRun012CheckoutCapture', (_source, result: unknown) => {
      checkoutCapture.current = result as { status: number; body: unknown };
    });
    await context.addInitScript(({ amrWebOrigin }) => {
      if (location.origin !== amrWebOrigin) return;
      const nativeFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const response = await nativeFetch(input, init);
        const requestUrl = new URL(input instanceof Request ? input.url : String(input), location.href);
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (method === 'POST' && /\/billing\/commerce\/checkouts$/.test(requestUrl.pathname)) {
          // Capture the real browser response before the console navigates to
          // Stripe. CDP may discard its body after that cross-origin navigation.
          const capture = (window as unknown as {
            __odRun012CheckoutCapture?: (value: { status: number; body: unknown }) => Promise<void>;
          }).__odRun012CheckoutCapture;
          if (capture) {
            const body = await response.clone().json().catch(() => null);
            await capture({ status: response.status, body }).catch(() => {});
          }
        }
        return response;
      };
    }, { amrWebOrigin: new URL(fixture.urls.web).origin });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      const stripeHost = ['stripe.com', 'stripe.network', 'stripecdn.com'].some(domain =>
        url.hostname === domain || url.hostname.endsWith('.' + domain));
      return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || stripeHost
        ? route.continue() : route.abort();
    });
    await context.addCookies([{ ...fixture.actor.consoleCookie, url: fixture.urls.web,
      httpOnly: true, sameSite: 'Lax' }]);
    await context.addInitScript(({ appConfig, space, odOrigin }) => {
      if (location.origin === odOrigin) {
        localStorage.setItem('open-design:config', JSON.stringify(appConfig));
        localStorage.setItem('open-design:locale', 'zh-CN');
        localStorage.setItem('open-design:locale-source', 'manual');
        sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(space));
      }
    }, { appConfig: config, space: fixture.spaces.A,
      odOrigin: new URL(runtime.url.web('/')).origin });
    const page = await context.newPage();
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/api/workspace/billing'
        && url.searchParams.get('workspaceId') === fixture.spaces.B.workspaceId) {
        bBillingRequests.set(request, new Date().toISOString());
      }
      if (request.method() !== 'POST' || new URL(request.url()).pathname !== '/api/runs') return;
      const body = request.postDataJSON() as RunCall['body'];
      calls.push({ at: new Date().toISOString(),
        workspaceId: request.headers()['x-od-workspace-id'] ?? null, body });
    });
    page.on('response', response => {
      const requestedAt = bBillingRequests.get(response.request());
      if (requestedAt) {
        bBillingResponses.push({ requestedAt, completedAt: new Date().toISOString(),
          status: response.status() });
        bBillingRequests.delete(response.request());
      }
      if (response.request().method() !== 'POST'
        || new URL(response.url()).pathname !== '/api/runs') return;
      void response.json().then((body: { runId?: string }) => {
        runResponses.push({ status: response.status(), runId: body.runId ?? null });
      });
    });
    const initialContextResponse = page.waitForResponse(response =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/workspace/context'
      && response.status() === 200, { timeout: T.xlong });
    await page.goto(runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    const browserAContext = (await initialContextResponse).json() as Promise<{
      context?: { workspaceId?: string; workspaceMemberId?: string; role?: string };
    }>;
    expect((await browserAContext).context).toMatchObject({
      workspaceId: fixture.spaces.A.workspaceId,
      workspaceMemberId: fixture.spaces.A.workspaceMemberId, role: 'owner',
    });
    const rail = page.getByTestId('entry-rail-collapse');
    if (await rail.getAttribute('aria-expanded') !== 'true') await rail.click();
    await page.getByTestId('workspace-switcher').click();
    await expect(page.getByTestId('workspace-switcher-list').getByRole('menuitem')
      .filter({ hasText: fixture.spaces.A.workspaceName })).toHaveAttribute('aria-current', 'true');
    await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 } });
    await save('RUN012-browser-A-identity.safe.json', { binding, context: (await browserAContext).context,
      selectedWorkspaceName: fixture.spaces.A.workspaceName });
    const initialRunIds = await persistedRunIds(dataDir);
    expect(initialRunIds, 'fresh RUN012 daemon data root must have no prior runs').toEqual([]);
    const input = page.getByTestId('home-hero-input');
    const send = page.getByTestId('home-hero-submit');
    const staged = page.getByTestId('home-hero-staged-files');
    await expect(input).toBeVisible({ timeout: T.xlong });
    // The controlled real-Link provider requires a marker in the user prompt.
    const draft = 'RUN012 A retained draft ' + binding.attemptId
      + ' QA:' + JSON.stringify({ id: 'run012-a-' + binding.attemptId, tokens: 16 });
    const attachment = 'run012-a-' + binding.attemptId + '.txt';
    await input.fill(draft);
    await page.getByTestId('home-hero-file-input').setInputFiles({
      name: attachment, mimeType: 'text/plain', buffer: Buffer.from(draft),
    });
    await expect(staged).toContainText(attachment);
    await send.click();
    await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
    await assertRetained(page, draft, attachment);
    expect(runPosts(calls)).toBe(0);
    await assertNoUnsentHomeRun(page, dataDir, initialRunIds);
    await page.screenshot({ path: join(output!, 'RUN012-A-initial-blocked.png') });
    await page.getByTestId('amr-balance-dialog').getByRole('button',
      { name: /暂不|稍后|not now|later/i }).click();

    // The frozen step is a real browser switch before B's own checkout.
    await selectWorkspace(page, fixture.spaces.B);
    expect((await preflight(runtime, fixture.spaces.A, fixture.runtime.modelId)).fundingCheck)
      .toBe('insufficient');
    const opened = context.waitForEvent('page', { timeout: T.medium });
    await page.getByTestId('entry-nav-account').click();
    await page.getByTestId('entry-account-billing').click();
    const consolePage = await opened;
    await consolePage.waitForLoadState('domcontentloaded');
    const consoleUrl = new URL(consolePage.url());
    expect(consoleUrl.origin).toBe(new URL(fixture.urls.web).origin);
    expect(consoleUrl.searchParams.get('workspaceId')).toBe(fixture.spaces.B.workspaceId);
    const switchConfirm = consolePage.getByTestId('workspace-deep-link-confirm');
    const billingPage = consolePage.getByTestId('seats-console-page');
    await expect.poll(async () => await switchConfirm.isVisible() || await billingPage.isVisible(),
      { timeout: T.xlong }).toBe(true);
    if (await switchConfirm.isVisible()) await switchConfirm.click();
    await expect(billingPage).toBeVisible({ timeout: T.xlong });
    await expect(consolePage.getByTestId('seats-wallet-total')).toBeVisible();
    await save('RUN012-B-browser-entry.safe.json', { binding, consoleUrl: consoleUrl.toString(),
      activeB: fixture.spaces.B.workspaceId, aPreflight: 'insufficient' });
    await consolePage.screenshot({ path: join(output!, 'RUN012-B-console-entry.png') });

    // B's console, checkout POST, hosted Stripe test-mode payment and signed
    // webhook all stay real. The webhook consumer re-reads the same Stripe
    // Checkout Session and PaymentIntent before it can grant B's credits.
    await consolePage.getByTestId('seats-console-page')
      .getByRole('button', { name: /^(充值|Recharge|Top up)$/i }).click();
    await expect(consolePage.getByTestId('recharge-preset-10')).toBeVisible();
    await consolePage.getByTestId('recharge-preset-10').click();
    await consolePage.screenshot({ path: join(output!, 'RUN012-B-recharge-form.png') });
    const checkoutResponse = consolePage.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname
        === '/api/v1/workspaces/' + fixture.spaces.B.workspaceId + '/billing/commerce/checkouts',
    { timeout: T.long });
    await consolePage.getByTestId('recharge-submit').click();
    const response = await checkoutResponse;
    expect(response.status()).toBe(200);
    const posted = response.request().postDataJSON() as {
      kind?: string; amountUsd?: string; clientOperationId?: string;
    };
    await expect.poll(() => checkoutCapture.current, { timeout: T.long }).not.toBeNull();
    expect(checkoutCapture.current!.status).toBe(200);
    const checkout = checkoutCapture.current!.body as {
      operation?: { operationId?: string; workspaceId?: string; kind?: string;
        target?: { amountUsd?: string }; paymentStatus?: string };
      checkoutUrl?: string;
    };
    expect(posted).toMatchObject({ kind: 'manual_recharge', amountUsd: '10' });
    expect(posted.clientOperationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(checkout.operation).toMatchObject({ workspaceId: fixture.spaces.B.workspaceId,
      kind: 'manual_recharge' });
    expect(Number(checkout.operation?.target?.amountUsd)).toBe(10);
    expect(checkout.operation?.operationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new URL(checkout.checkoutUrl!).hostname).toBe('checkout.stripe.com');
    await consolePage.waitForURL('https://checkout.stripe.com/**', { timeout: T.long });
    const checkoutAt = new Date().toISOString();
    await save('RUN012-B-checkout.private.json', { binding, checkoutAt, posted, checkout });
    await marker('RUN012-B-checkout-ready.json', {
      workspaceId: fixture.spaces.B.workspaceId,
      clientOperationId: posted.clientOperationId, operationId: checkout.operation!.operationId,
      amountUsd: '10', checkoutUrlSha256: createHash('sha256').update(checkout.checkoutUrl!).digest('hex'),
    });
    // Stripe can reopen a Checkout session with Card already expanded.
    const cardNumber = consolePage.locator('input[name="cardNumber"]');
    if (!(await cardNumber.isVisible())) {
      await consolePage.getByTestId('card-accordion-item')
        .locator('.AccordionItemHeader--clickable').click({ timeout: T.medium });
    }
    await expect(cardNumber).toBeVisible({ timeout: T.xlong });
    const email = consolePage.locator('input[name="email"]');
    if (await email.isVisible()) await email.fill(fixture.actor.email);
    await cardNumber.fill('4242424242424242');
    await consolePage.locator('input[name="cardExpiry"]').fill('1234');
    await consolePage.locator('input[name="cardCvc"]').fill('123');
    const billingName = consolePage.locator('input[name="billingName"]');
    if (await billingName.isVisible()) await billingName.fill(fixture.actor.name);
    const postalCode = consolePage.locator('input[name="billingPostalCode"]');
    if (await postalCode.isVisible()) await postalCode.fill('10001');
    const saveWithLink = consolePage.locator('input[name="enableStripePass"]');
    if (await saveWithLink.isVisible()) await saveWithLink.uncheck();
    await consolePage.screenshot({ path: join(output!, 'RUN012-B-stripe-test-checkout.png') });
    await consolePage.getByTestId('hosted-payment-submit-button').click();
    const paidAt = new Date().toISOString();
    await marker('RUN012-B-payment-ready.json', {
      workspaceId: fixture.spaces.B.workspaceId,
      clientOperationId: posted.clientOperationId, operationId: checkout.operation!.operationId,
      amountUsd: '10', testCardSubmittedAt: paidAt,
    });
    const bPaid = await receipt('RUN012-B-paid.json', paidAt);
    expect(bPaid).toMatchObject({
      workspaceId: fixture.spaces.B.workspaceId, operationId: checkout.operation!.operationId,
      clientOperationId: posted.clientOperationId, paymentStatus: 'paid',
      entitlementStatus: 'applied', aFundingCheck: 'insufficient', bFundingCheck: 'available',
      rechargeSource: 'stripe_checkout',
    });
    expect(bPaid.checkoutUrlSha256).toBe(
      createHash('sha256').update(checkout.checkoutUrl!).digest('hex'));
    expect(bPaid.checkoutSessionId).toEqual(expect.any(String));
    expect(String(bPaid.checkoutSessionId).length).toBeGreaterThan(0);
    expect(bPaid.webhookEventId).toEqual(expect.any(String));
    expect(String(bPaid.webhookEventId).length).toBeGreaterThan(0);
    expect(Number(bPaid.bWalletCredits)).toBeGreaterThan(0);
    expect(Number(bPaid.bRechargeCountDelta)).toBe(1);
    expect(Number(bPaid.aRechargeCountDelta)).toBe(0);
    expect(bPaid.bRechargeOperationId).toBe(checkout.operation!.operationId);
    expect(bPaid.bRechargeSourceId).toBe(bPaid.checkoutSessionId);
    expect(bPaid.bRechargeWorkspaceId).toBe(fixture.spaces.B.workspaceId);
    expect(bPaid.bRechargeMemberId).toBe(fixture.spaces.B.workspaceMemberId);
    expect(bPaid.webhookSignatureVerified).toBe(true);
    expect(Number(bPaid.bCreditsDelta)).toBeGreaterThan(0);
    expect(Number(bPaid.bWalletCreditsAfter) - Number(bPaid.bWalletCreditsBefore))
      .toBe(Number(bPaid.bCreditsDelta));
    expect(Number(bPaid.bWalletCredits)).toBe(Number(bPaid.bWalletCreditsAfter));
    expect(Number(bPaid.aWalletCreditsAfter)).toBe(Number(bPaid.aWalletCreditsBefore));
    await consolePage.close();
    await page.bringToFront();
    await expect.poll(() => bBillingResponses.some(item =>
      item.status === 200 && Date.parse(item.requestedAt) >= Date.parse(paidAt)),
    { timeout: T.long }).toBe(true);
    await page.getByTestId('entry-top-right-credits').click();
    await expect(page.getByTestId('entry-top-right-credits-panel')
      .getByTestId('entry-nav-credits-row')).toContainText('$10.00');
    await page.screenshot({ path: join(output!, 'RUN012-B-browser-balance-refreshed.png') });
    await save('RUN012-B-browser-balance-refreshed.safe.json',
      { binding, paidAt, bBillingResponses, walletUi: '$10.00' });
    expect((await preflight(runtime, fixture.spaces.B, fixture.runtime.modelId)).fundingCheck)
      .toBe('available');
    await selectWorkspace(page, fixture.spaces.A);
    await assertRetained(page, draft, attachment);
    const afterB = await preflight(runtime, fixture.spaces.A, fixture.runtime.modelId);
    expect(afterB.fundingCheck).toBe('insufficient');
    expect(runPosts(calls)).toBe(0);
    await send.click();
    await expect(page.getByTestId('amr-balance-dialog')).toBeVisible({ timeout: T.long });
    await assertRetained(page, draft, attachment);
    expect(runPosts(calls)).toBe(0);
    await assertNoUnsentHomeRun(page, dataDir, initialRunIds);
    await save('RUN012-B-paid-A-still-blocked.safe.json', { binding, bPaid, afterB,
      aDraft: draft, aAttachment: attachment, runPosts: calls });
    await page.screenshot({ path: join(output!, 'RUN012-B-paid-A-still-blocked.png') });
    await page.getByTestId('amr-balance-dialog').getByRole('button',
      { name: /暂不|稍后|not now|later/i }).click();

    const beforeAFunding = await assertNoUnsentHomeRun(page, dataDir, initialRunIds);
    const aReadyAt = new Date().toISOString();
    await save('RUN012-A-before-funding-od-state.safe.json', { binding, beforeAFunding });
    await marker('RUN012-A-fund-ready.json', {
      workspaceId: fixture.spaces.A.workspaceId, bOperationId: checkout.operation!.operationId,
      aFundingCheck: 'insufficient', runPosts: 0,
    });
    const aFunded = await receipt('RUN012-A-funded.json', aReadyAt);
    expect(aFunded).toMatchObject({ workspaceId: fixture.spaces.A.workspaceId,
      aFundingCheck: 'available', bOperationId: checkout.operation!.operationId });
    expect(aFunded.aRechargeCountDelta).toBe(1);
    expect(aFunded.aFundedWorkspaceId).toBe(fixture.spaces.A.workspaceId);
    expect(aFunded.aFundedMemberId).toBe(fixture.spaces.A.workspaceMemberId);
    expect(aFunded.aSponsorWorkspaceId).toBe(fixture.spaces.A.workspaceId);
    expect(aFunded.aSponsorMemberId).toBe(fixture.spaces.A.workspaceMemberId);
    expect(aFunded.aFundingReceiptId).toEqual(expect.any(String));
    expect(String(aFunded.aFundingReceiptId).length).toBeGreaterThan(0);
    expect(Number(aFunded.aCreditsDelta)).toBeGreaterThan(0);
    expect(Number(aFunded.aWalletCreditsAfter) - Number(aFunded.aWalletCreditsBefore))
      .toBe(Number(aFunded.aCreditsDelta));
    expect(Number(aFunded.bWalletCreditsBefore)).toBe(Number(bPaid.bWalletCredits));
    expect(Number(aFunded.bWalletCreditsAfter)).toBe(Number(bPaid.bWalletCredits));
    expect(Number(aFunded.bRechargeCountDelta)).toBe(0);
    expect((await preflight(runtime, fixture.spaces.A, fixture.runtime.modelId)).fundingCheck)
      .toBe('available');
    const afterAFunding = await assertNoUnsentHomeRun(page, dataDir, initialRunIds);
    const noClickAt = new Date().toISOString();
    await page.evaluate(() => window.dispatchEvent(new Event('od:workspace-billing-refresh')));
    await waitNoRunPost(page, calls);
    await assertRetained(page, draft, attachment);
    const afterNoClick = await assertNoUnsentHomeRun(page, dataDir, initialRunIds);
    await save('RUN012-A-funded-no-click.safe.json', { binding, noClickAt,
      observedAt: new Date().toISOString(), aFunded, afterAFunding, afterNoClick,
      runPosts: calls });
    await page.screenshot({ path: join(output!, 'RUN012-A-funded-no-click.png') });

    const manualAt = new Date().toISOString();
    const createdResponse = page.waitForResponse(result => result.request().method() === 'POST'
      && new URL(result.url()).pathname === '/api/runs', { timeout: T.long });
    await send.click();
    const created = await createdResponse;
    expect(created.status()).toBe(202);
    const run = await created.json() as { runId?: string };
    expect(run.runId).toMatch(/^[0-9a-f-]{36}$/i);
    await expect.poll(() => runResponses.length, { timeout: T.long }).toBe(1);
    expect(runResponses).toEqual([{ status: 202, runId: run.runId }]);
    expect(runPosts(calls)).toBe(1);
    expect(calls[0]!.workspaceId).toBe(fixture.spaces.A.workspaceId);
    expect(calls[0]!.body.currentPrompt).toContain(draft);
    const attachmentPaths = calls[0]!.body.attachments;
    expect(Array.isArray(attachmentPaths)).toBe(true);
    expect(attachmentPaths).toHaveLength(1);
    const attachmentPath = (attachmentPaths as string[])[0];
    expect(typeof attachmentPath).toBe('string');
    expect(attachmentPath).not.toMatch(/^(?:\/|\.\.?\/)/);
    expect(basename(attachmentPath!)).toBe(attachment);
    const projectId = calls[0]!.body.projectId;
    const conversationId = calls[0]!.body.conversationId;
    const userMessageId = calls[0]!.body.userMessageId;
    expect(projectId).toEqual(expect.any(String));
    expect(conversationId).toEqual(expect.any(String));
    expect(userMessageId).toEqual(expect.any(String));
    await expect.poll(async () => {
      const url = runtime.url.web('/api/projects/' + encodeURIComponent(String(projectId))
        + '/conversations/' + encodeURIComponent(String(conversationId)) + '/messages');
      const response = await fetch(url, { headers: workspaceHeaders(fixture.spaces.A) });
      if (!response.ok) return null;
      const body = await response.json() as { messages?: Array<Record<string, unknown>> };
      const message = body.messages?.find(row => row.id === userMessageId);
      return message ? { content: message.content, attachments: message.attachments,
        attachmentCount: Array.isArray(message.attachments) ? message.attachments.length : -1 } : null;
    }, { timeout: T.long, intervals: [250, 500, 1000] }).toMatchObject({
      content: draft, attachmentCount: 1,
      attachments: [{ path: attachmentPath, name: attachment, kind: 'file', order: 0 }],
    });
    const terminal = await terminalRun(runtime, dataDir, fixture.spaces.A, run.runId!);
    await marker('RUN012-A-manual-ready.json', { workspaceId: fixture.spaces.A.workspaceId,
      runId: run.runId, terminal, bOperationId: checkout.operation!.operationId });
    const verified = await receipt('RUN012-A-manual-verified.json', manualAt);
    expect(verified).toMatchObject({ workspaceId: fixture.spaces.A.workspaceId,
      runId: run.runId, billingWorkspaceId: fixture.spaces.A.workspaceId,
      bOperationId: checkout.operation!.operationId });
    expect(Number(verified.targetSuccessfulUpstreamCount)).toBeGreaterThan(0);
    expect(Number(verified.unsettledSuccessfulCallCount)).toBe(0);
    expect(Number(verified.unmatchedChargeCount)).toBe(0);
    expect(Number(verified.bCreditUsageDelta)).toBe(0);
    expect(Number(verified.bWalletCredits)).toBe(Number(bPaid.bWalletCredits));
    const chargeable = verified.chargeableCalls as Array<{
      canonicalRequestId: string; usageId: string; chargedWorkspaceId: string;
    }>;
    expect(Array.isArray(chargeable) && chargeable.length > 0).toBe(true);
    expect(new Set(chargeable.map(call => call.canonicalRequestId)).size).toBe(chargeable.length);
    expect(new Set(chargeable.map(call => call.usageId)).size).toBe(chargeable.length);
    for (const call of chargeable) {
      expect(call.canonicalRequestId.length).toBeGreaterThan(0);
      expect(call.usageId.length).toBeGreaterThan(0);
      expect(call.chargedWorkspaceId).toBe(fixture.spaces.A.workspaceId);
    }
    expect(runPosts(calls)).toBe(1);
    expect(runResponses).toEqual([{ status: 202, runId: run.runId }]);
    await expect(page.getByTestId('queued-send-banner')).toHaveCount(0);
    await save('RUN012-complete.safe.json', { binding, bPaid, aFunded, manualAt,
      run: { runId: run.runId, terminal }, verified, calls, runResponses });
  } finally {
    await save('RUN012-request-timeline.private.json', { binding, calls, runResponses });
    await context?.close();
    await runtime.stopWeb(env);
  }
});
