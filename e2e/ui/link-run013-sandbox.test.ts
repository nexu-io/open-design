import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser, Locator, Page } from '@playwright/test';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

type Role = 'owner' | 'admin' | 'member';
type Actor = {
  controlKey: string;
  runtimeKey: string;
  userId: string;
  email: string;
  name: string;
  memberId: string;
};
type Space = {
  workspaceId: string;
  limit: number;
  actors: Partial<Record<Role, Actor>>;
};
type Fixture = {
  alias: string;
  tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; holdModelId: string; dualModelId: string };
  spaces: { funded?: Space; dual?: Space };
};
type Binding = {
  protocol: 'od-link-run013-v1';
  alias: string;
  attemptId: string;
  fixtureSha256: string;
  odSha: string;
  amrSha: string;
  stage: 'funded' | 'dual';
  challenge: string;
  workspaceId: string;
};
type RunResponse = { status: number; runId: string | null };
type Session = {
  role: Role;
  actor: Actor;
  page: Page;
  runtime: ReturnType<typeof createToolsDevSuite>;
  dataDir: string;
  workspaceId: string;
  modelId: string;
  env: Record<string, string>;
  requests: Array<{ at: string; method: string; path: string; workspaceId: string | null }>;
  runResponses: RunResponse[];
};

const fixturePath = process.env.OD_LINK_RUN013_FIXTURE;
const output = process.env.OD_LINK_RUN013_EVIDENCE;

test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

async function prepare(stage: Binding['stage']) {
  if (!fixturePath || !output) throw new Error('Explicit RUN013 fixture and evidence directory required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture0600 required');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const fixtureSha256 = createHash('sha256').update(bytes).digest('hex');
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim();
  if (fixture.tuple.odSha !== odSha || !fixture.tuple.amrSha) throw new Error('Current OD/AMR tuple mismatch');
  for (const value of Object.values(fixture.urls)) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Only isolated loopback AMR endpoints permitted');
    }
  }
  const space = stage === 'funded' ? fixture.spaces.funded : fixture.spaces.dual;
  if (!space?.workspaceId || space.limit !== 10 || !fixture.runtime.holdModelId || !fixture.runtime.dualModelId) {
    throw new Error('Missing exact Go10 workspace and model binding');
  }
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const markers = join(output, 'markers');
  await mkdir(markers, { recursive: true, mode: 0o700 });
  await chmod(markers, 0o700);
  if ((await readdir(markers)).length !== 0) throw new Error('Fresh empty marker directory required');
  const binding: Binding = {
    protocol: 'od-link-run013-v1',
    alias: fixture.alias,
    attemptId: randomUUID(),
    challenge: randomUUID(),
    fixtureSha256,
    odSha,
    amrSha: fixture.tuple.amrSha,
    stage,
    workspaceId: space.workspaceId,
  };
  const save = async (name: string, value: unknown) => {
    await writeFile(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  };
  const marker = async (name: string, value: Record<string, unknown>) => {
    const target = join(markers, name);
    const temp = target + '.' + process.pid + '.tmp';
    await writeFile(temp, JSON.stringify({ ...binding, ...value, at: new Date().toISOString() }),
      { mode: 0o600, flag: 'wx' });
    await rename(temp, target);
  };
  const receipt = async (name: string) => {
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
    expect(value.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(value.receiptFile).toMatch(/^[a-zA-Z0-9.-]+\.safe\.json$/);
    const evidence = await readFile(join(markers, String(value.receiptFile)));
    expect(createHash('sha256').update(evidence).digest('hex')).toBe(value.receiptDigest);
    if (value.error) throw new Error('RUN013 accounting receipt blocked: ' + String(value.error));
    await save(name, value);
    return value;
  };
  return { fixture, space, binding, save, marker, receipt };
}

async function startSession(
  browser: Browser, fixture: Fixture, space: Space, actor: Actor, role: Role,
  modelId: string,
): Promise<Session> {
  const namespace = 'link-run013-' + randomUUID().slice(0, 8);
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const dataDir = join(scratch, 'data');
  const amrHome = join(scratch, 'amr-home');
  const runtime = createToolsDevSuite({ root, dataDir, namespace, ownerPid: process.pid,
    codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: actor.controlKey,
    runtimeKey: actor.runtimeKey,
    apiUrl: fixture.urls.api,
    linkUrl: fixture.urls.link,
    user: { id: actor.userId, email: actor.email, name: actor.name },
  } } }), { mode: 0o600 });
  const appConfig = { mode: 'daemon', agentId: 'amr', model: modelId,
    onboardingCompleted: true, privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: { amr: { model: modelId } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: fixture.runtime.velaBin } } };
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify(appConfig), { mode: 0o600 });
  const env = { AMR_HOME: amrHome, VELA_BIN: fixture.runtime.velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api, VELA_LINK_URL: fixture.urls.link,
    VELA_CONTROL_KEY: actor.controlKey, VELA_OPENCODE_BIN: fixture.runtime.openCodeBin,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.urls.web,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
  let createdPage: Page | undefined;
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    createdPage = page;
    const requests: Session['requests'] = [];
    const runResponses: RunResponse[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/')) requests.push({ at: new Date().toISOString(), method: request.method(),
        path, workspaceId: request.headers()['x-od-workspace-id'] ?? null });
    });
    page.on('response', response => {
      if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/runs') return;
      void response.json().then(body => {
        runResponses.push({ status: response.status(), runId: typeof body?.runId === 'string' ? body.runId : null });
      }).catch(() => { runResponses.push({ status: response.status(), runId: null }); });
    });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        ? route.continue() : route.abort();
    });
    await page.addInitScript(({ config, workspaceId, workspaceMemberId }) => {
      localStorage.setItem('open-design:config', JSON.stringify(config));
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId, workspaceMemberId }));
    }, { config: appConfig, workspaceId: space.workspaceId, workspaceMemberId: actor.memberId });
    await page.goto(runtime.url.web('/'), { waitUntil: 'domcontentloaded', timeout: T.xlong });
    await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.long });
    const headers = { 'x-od-workspace-id': space.workspaceId, 'x-od-workspace-member-id': actor.memberId,
      'x-od-workspace-role': role, 'x-od-workspace-lifecycle-state': 'active',
      'x-od-workspace-member-status': 'active' };
    const context = await (await fetch(runtime.url.web('/api/workspace/context'), { headers })).json();
    expect(context.context).toMatchObject({ workspaceId: space.workspaceId,
      workspaceMemberId: actor.memberId, role });
    return { role, actor, page, runtime, dataDir, workspaceId: space.workspaceId,
      modelId, env, requests, runResponses };
  } catch (error) {
    await createdPage?.close().catch(() => undefined);
    await runtime.stopWeb(env).catch(() => undefined);
    throw error;
  }
}

async function stopSession(session: Session) {
  await session.page.close().catch(() => undefined);
  await session.runtime.stopWeb(session.env);
}

function countPosts(session: Session) {
  return session.requests.filter(item => item.method === 'POST' && item.path === '/api/runs').length;
}

async function preflight(session: Session, workspaceId: string, modelId: string) {
  const url = new URL('/api/workspace/billing', session.runtime.url.web());
  url.search = new URLSearchParams({ scope: 'workspace', workspaceId,
    includePreflight: '1', modelId }).toString();
  const response = await fetch(url, { headers: {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-member-id': session.actor.memberId,
    'x-od-workspace-role': session.role,
  } });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.preflight).toMatchObject({ workspaceId, workspaceMemberId: session.actor.memberId, modelId });
  return body.preflight as { fundingCheck: string; [key: string]: unknown };
}

function heldIds(value: Record<string, unknown>, limit: number) {
  const ids = value.heldRequestIds as string[];
  expect(Array.isArray(ids)).toBe(true);
  expect(ids).toHaveLength(limit);
  expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
  expect(new Set(ids).size).toBe(limit);
  return ids;
}

function checkRefusalPosts(session: Session, before: number, receipt: Record<string, unknown>) {
  const posts = countPosts(session) - before;
  expect(posts).toBeLessThanOrEqual(1);
  if (posts === 1) {
    expect(session.runResponses.at(-1)?.status).toBe(202);
    expect(session.runResponses.at(-1)?.runId).toEqual(expect.any(String));
    expect(session.runResponses.at(-1)?.runId?.length).toBeGreaterThan(0);
    expect(receipt.runId).toBe(session.runResponses.at(-1)?.runId);
  } else {
    expect(receipt.runId).toBeNull();
  }
  return posts;
}

async function blockedRunTerminal(session: Session, before: number) {
  const posts = countPosts(session) - before;
  expect(posts).toBeLessThanOrEqual(1);
  if (posts === 0) return null;
  const runId = session.runResponses.at(-1)!.runId!;
  let row!: Record<string, unknown>;
  await expect.poll(async () => {
    const response = await fetch(session.runtime.url.web('/api/runs/' + encodeURIComponent(runId)), {
      headers: { 'x-od-workspace-id': session.workspaceId,
        'x-od-workspace-member-id': session.actor.memberId,
        'x-od-workspace-role': session.role },
    });
    expect(response.ok).toBe(true);
    row = await response.json() as Record<string, unknown>;
    return row.status;
  }, { timeout: T.xlong, intervals: [250, 500, 1000] }).toMatch(/failed|canceled/);
  const lines = (await readFile(join(session.dataDir, 'runs', runId, 'events.jsonl'), 'utf8'))
    .split('\n').filter(Boolean).map(line => JSON.parse(line) as { event: string; data?: { model?: string } });
  const runModels = lines.filter(line => line.event === 'start').map(line => line.data?.model);
  expect(runModels.length).toBeGreaterThan(0);
  expect(runModels.every(model => model === session.modelId)).toBe(true);
  await expect(session.page.getByTestId('queued-send-banner')).toHaveCount(0);
  return { runId, status: row.status, errorCode: row.errorCode ?? null,
    modelId: session.modelId, startEventCount: runModels.length };
}

async function expectSelectedModel(session: Session) {
  const model = await session.page.evaluate(() => {
    const raw = localStorage.getItem('open-design:config');
    if (!raw) return null;
    const config = JSON.parse(raw) as { agentModels?: { amr?: { model?: string } } };
    return config.agentModels?.amr?.model ?? null;
  });
  expect(model).toBe(session.modelId);
}

async function waitForNoticeArtwork(dialog: Locator) {
  await expect.poll(() => dialog.evaluate(element => getComputedStyle(element).opacity),
    { timeout: T.long }).toBe('1');
  const benefits = dialog.locator('li');
  if (await benefits.count()) {
    await expect.poll(() => benefits.last().evaluate(element => getComputedStyle(element).opacity),
      { timeout: T.long }).toBe('1');
  }
}

async function startSpectatorNoticeWatch(page: Page) {
  await page.evaluate(() => {
    type Watch = { count: number; observer: MutationObserver; seen: WeakSet<Element> };
    const host = window as unknown as { __run013NoticeWatch?: Watch };
    host.__run013NoticeWatch?.observer.disconnect();
    const watch = { count: 0, observer: null as unknown as MutationObserver, seen: new WeakSet<Element>() };
    const check = (root: Element) => {
      const dialogs = root.matches('[data-testid="amr-concurrency-dialog"],[data-testid="amr-balance-dialog"]')
        ? [root] : [...root.querySelectorAll('[data-testid="amr-concurrency-dialog"],[data-testid="amr-balance-dialog"]')];
      for (const dialog of dialogs) {
        if (watch.seen.has(dialog) || !dialog.isConnected) continue;
        const style = getComputedStyle(dialog);
        if (style.display === 'none' || style.visibility === 'hidden'
          || dialog.getBoundingClientRect().width === 0) continue;
        watch.seen.add(dialog);
        watch.count += 1;
      }
    };
    watch.observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        if (mutation.target instanceof Element) check(mutation.target);
        for (const node of mutation.addedNodes) if (node instanceof Element) check(node);
      }
    });
    watch.observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-hidden', 'data-testid'],
    });
    host.__run013NoticeWatch = watch;
    check(document.documentElement);
  });
}

async function stopSpectatorNoticeWatch(page: Page) {
  return page.evaluate(() => {
    type Watch = { count: number; observer: MutationObserver };
    const host = window as unknown as { __run013NoticeWatch?: Watch };
    const count = host.__run013NoticeWatch?.count ?? 0;
    host.__run013NoticeWatch?.observer.disconnect();
    delete host.__run013NoticeWatch;
    return count;
  });
}

test('[P0] RUN013 three Go roles notify only the initiator at actual Link full', async ({ browser }) => {
  test.setTimeout(900_000);
  const { fixture, space, binding, save, marker, receipt } = await prepare('funded');
  const roles: Role[] = ['owner', 'admin', 'member'];
  const sessions: Session[] = [];
  try {
    for (const role of roles) {
      const actor = space.actors[role];
      if (!actor?.controlKey || !actor.runtimeKey || !actor.memberId) {
        throw new Error('RUN013 requires three product-authenticated Go actors');
      }
      sessions.push(await startSession(browser, fixture, space, actor, role, fixture.runtime.holdModelId));
    }
    for (const session of sessions) {
      const funding = await preflight(session, space.workspaceId, fixture.runtime.holdModelId);
      expect(funding.fundingCheck).toBe('available');
      await expect(session.page.getByTestId('amr-concurrency-dialog')).toHaveCount(0);
    }
    await marker('RUN013-ready.json', { modelId: fixture.runtime.holdModelId,
      roles: roles.map(role => ({ role, memberId: space.actors[role]?.memberId })) });
    const held = await receipt('RUN013-held.json');
    expect(Number(held.running)).toBe(10);
    expect(Number(held.limit)).toBe(10);
    expect(held.heldWorkspaceId).toBe(space.workspaceId);
    const originalHeldIds = heldIds(held, 10);
    await save('RUN013-held.safe.json', { binding, held });

    for (const role of roles) {
      const initiator = sessions.find(session => session.role === role)!;
      const spectators = sessions.filter(session => session !== initiator);
      const spectatorPosts = new Map(spectators.map(session => [session.role, countPosts(session)]));
      for (const spectator of spectators) {
        await expect(spectator.page.getByTestId('amr-concurrency-dialog')).toHaveCount(0);
        await expect(spectator.page.getByTestId('amr-balance-dialog')).toHaveCount(0);
        await startSpectatorNoticeWatch(spectator.page);
      }
      const input = initiator.page.getByTestId('home-hero-input');
      const draft = 'RUN013 ' + role + ' actual Link-full request ' + binding.attemptId;
      await expectSelectedModel(initiator);
      await input.fill(draft);
      const before = countPosts(initiator);
      await initiator.page.getByTestId('home-hero-submit').click();
      const dialog = initiator.page.getByTestId('amr-concurrency-dialog');
      await expect(dialog).toBeVisible({ timeout: T.long });
      await expect(input).toHaveText(draft);
      await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(480);
      if (role === 'owner') {
        await expect(initiator.page.getByTestId('amr-concurrency-upgrade')).toHaveText('升级套餐');
      } else {
        await expect(dialog).toContainText('联系团队空间所有者');
        await expect(initiator.page.getByTestId('amr-concurrency-upgrade')).toHaveCount(0);
        await expect(initiator.page.getByTestId('amr-concurrency-close')).toHaveText('知道了');
      }
      for (const spectator of spectators) {
        await expect(spectator.page.getByTestId('amr-concurrency-dialog')).toHaveCount(0);
        await expect(spectator.page.getByTestId('amr-balance-dialog')).toHaveCount(0);
      }
      await expect.poll(() => initiator.runResponses.length, { timeout: T.long }).toBe(countPosts(initiator));
      const newPosts = countPosts(initiator) - before;
      const terminal = await blockedRunTerminal(initiator, before);
      await waitForNoticeArtwork(dialog);
      await initiator.page.screenshot({ path: join(output!, 'RUN013-' + role + '-initiator.png') });
      for (const spectator of spectators) {
        await spectator.page.screenshot({ path: join(output!, 'RUN013-' + role + '-spectator-' + spectator.role + '.png') });
      }
      await marker('RUN013-' + role + '-refusal-ready.json', {
        role, memberId: initiator.actor.memberId, modelId: fixture.runtime.holdModelId,
        draft, newPosts, terminal,
        runResponses: newPosts ? initiator.runResponses.slice(-newPosts) : [],
        spectatorRoles: spectators.map(session => session.role),
      });
      const refused = await receipt('RUN013-' + role + '-refusal-verified.json');
      expect(refused.role).toBe(role);
      expect(refused.workspaceMemberId).toBe(initiator.actor.memberId);
      expect(Number(refused.running)).toBe(10);
      expect((refused.heldRequestIds as string[]).slice().sort()).toEqual(originalHeldIds.slice().sort());
      expect(Number(refused.newUpstreamCount)).toBe(0);
      expect(Number(refused.newUsageCount)).toBe(0);
      expect(Number(refused.newCreditUsageCount)).toBe(0);
      if (newPosts === 1) {
        expect(refused.admissionFailureCode).toMatch(/tier_limit_exceeded|membership_concurrency_limit/);
        expect(refused.rejectedLinkRequestId).toEqual(expect.any(String));
      }
      expect(checkRefusalPosts(initiator, before, refused)).toBe(newPosts);
      for (const spectator of spectators) {
        await expect(spectator.page.getByTestId('amr-concurrency-dialog')).toHaveCount(0);
        await expect(spectator.page.getByTestId('amr-balance-dialog')).toHaveCount(0);
        expect(countPosts(spectator)).toBe(spectatorPosts.get(spectator.role));
        expect(await stopSpectatorNoticeWatch(spectator.page)).toBe(0);
      }
      await save('RUN013-' + role + '-refused.safe.json', {
        binding, refused, draft, terminal, initiatorRequests: initiator.requests,
        spectatorStates: spectators.map(session => ({ role: session.role, requests: session.requests })),
      });
      if (role === 'owner') {
        const dashboardRequest = initiator.page.context().waitForEvent('request', request =>
          request.isNavigationRequest() && new URL(request.url()).pathname === '/dashboard');
        const popupReady = initiator.page.waitForEvent('popup');
        await initiator.page.getByTestId('amr-concurrency-upgrade').click();
        const popup = await popupReady;
        const request = await dashboardRequest;
        const destination = new URL(request.url());
        expect(destination.origin).toBe(new URL(fixture.urls.web).origin);
        expect(destination.searchParams.get('workspaceId')).toBe(space.workspaceId);
        expect(destination.searchParams.get('source')).toBe('open_design');
        expect(destination.searchParams.get('billing')).toBe('plan');
        const response = await request.response();
        await save('RUN013-owner-upgrade-destination.safe.json', {
          binding, origin: destination.origin, path: destination.pathname, workspaceId: space.workspaceId,
          billing: destination.searchParams.get('billing'), dashboardStatus: response?.status() ?? null,
          scope: 'OD entry only; console plan selection needs an authenticated session',
        });
        await popup.close();
      }
      await initiator.page.getByTestId('amr-concurrency-close').click();
      await expect(input).toHaveText(draft);
    }
    await marker('RUN013-release-ready.json', { heldRequestIds: originalHeldIds });
    const released = await receipt('RUN013-released.json');
    expect(Number(released.running)).toBe(0);
    expect((released.releasedRequestIds as string[]).slice().sort()).toEqual(originalHeldIds.slice().sort());
    await save('RUN013-roles-complete.safe.json', { binding, held, released,
      roles: sessions.map(session => ({ role: session.role, requests: session.requests,
        runResponses: session.runResponses })) });
  } finally {
    for (const session of sessions.reverse()) await stopSession(session);
  }
});

test('[P0] RUN013 insufficient paygo balance remains blocked after releasing a real Link slot', async ({ browser }) => {
  test.setTimeout(600_000);
  const { fixture, space, binding, save, marker, receipt } = await prepare('dual');
  const actor = space.actors.owner;
  if (!actor?.controlKey || !actor.runtimeKey || !actor.memberId) {
    throw new Error('RUN013 dual-failure stage requires a product-authenticated Go Owner');
  }
  const session = await startSession(browser, fixture, space, actor, 'owner', fixture.runtime.dualModelId);
  try {
    const initial = await preflight(session, space.workspaceId, fixture.runtime.dualModelId);
    expect(initial.fundingCheck).toBe('insufficient');
    const input = session.page.getByTestId('home-hero-input');
    const send = session.page.getByTestId('home-hero-submit');
    const draft = 'RUN013 full and insufficient paygo ' + binding.attemptId;
    await expectSelectedModel(session);
    await input.fill(draft);
    await marker('dual-ready.json', { holdModelId: fixture.runtime.holdModelId,
      dualModelId: fixture.runtime.dualModelId, ownerMemberId: actor.memberId,
      initialFundingCheck: initial.fundingCheck });
    const held = await receipt('dual-held.json');
    expect(Number(held.running)).toBe(10);
    expect(Number(held.limit)).toBe(10);
    expect(held.heldWorkspaceId).toBe(space.workspaceId);
    expect(held.fundingCheck).toBe('insufficient');
    const originalHeldIds = heldIds(held, 10);
    const before = countPosts(session);
    await send.click();
    const balanceDialog = session.page.getByTestId('amr-balance-dialog');
    const concurrencyDialog = session.page.getByTestId('amr-concurrency-dialog');
    await expect.poll(async () => {
      if (await balanceDialog.isVisible()) return 'balance';
      if (await concurrencyDialog.isVisible()) return 'concurrency';
      return 'none';
    }, { timeout: T.long }).not.toBe('none');
    const firstHint = await balanceDialog.isVisible() ? 'balance' : 'concurrency';
    await expect(input).toHaveText(draft);
    await expect.poll(() => session.runResponses.length, { timeout: T.long }).toBe(countPosts(session));
    const firstPosts = countPosts(session) - before;
    const firstTerminal = await blockedRunTerminal(session, before);
    await waitForNoticeArtwork(firstHint === 'balance' ? balanceDialog : concurrencyDialog);
    await session.page.screenshot({ path: join(output!, 'RUN013-dual-full-and-insufficient.png') });
    await marker('dual-refusal-ready.json', { firstHint, newPosts: firstPosts,
      modelId: fixture.runtime.dualModelId, terminal: firstTerminal,
      runResponses: firstPosts ? session.runResponses.slice(-firstPosts) : [], draft });
    const refusal = await receipt('dual-refusal-verified.json');
    expect(Number(refusal.running)).toBe(10);
    expect((refusal.heldRequestIds as string[]).slice().sort()).toEqual(originalHeldIds.slice().sort());
    expect(Number(refusal.newUpstreamCount)).toBe(0);
    expect(Number(refusal.newUsageCount)).toBe(0);
    expect(Number(refusal.newCreditUsageCount)).toBe(0);
    expect(checkRefusalPosts(session, before, refusal)).toBe(firstPosts);
    await save('RUN013-dual-refused.safe.json', { binding, held, refusal, firstHint, firstTerminal,
      requests: session.requests, runResponses: session.runResponses });
    if (firstHint === 'balance') {
      await balanceDialog.getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
    } else {
      await session.page.getByTestId('amr-concurrency-close').click();
    }
    await expect(input).toHaveText(draft);
    await marker('dual-release-ready.json', { heldRequestIds: originalHeldIds });
    const released = await receipt('dual-one-released.json');
    expect(Number(released.running)).toBe(9);
    expect(originalHeldIds).toContain(released.releasedRequestId);
    expect((released.remainingHeldRequestIds as string[]).slice().sort())
      .toEqual(originalHeldIds.filter(id => id !== released.releasedRequestId).sort());
    const afterRelease = await preflight(session, space.workspaceId, fixture.runtime.dualModelId);
    expect(afterRelease.fundingCheck).toBe('insufficient');
    const manualBefore = countPosts(session);
    await send.click();
    await expect(balanceDialog).toBeVisible({ timeout: T.long });
    await expect(input).toHaveText(draft);
    await expect.poll(() => session.runResponses.length, { timeout: T.long }).toBe(countPosts(session));
    const manualPosts = countPosts(session) - manualBefore;
    const manualTerminal = await blockedRunTerminal(session, manualBefore);
    await waitForNoticeArtwork(balanceDialog);
    await session.page.screenshot({ path: join(output!, 'RUN013-dual-after-release-still-insufficient.png') });
    await marker('dual-manual-ready.json', { newPosts: manualPosts,
      modelId: fixture.runtime.dualModelId, terminal: manualTerminal,
      runResponses: manualPosts ? session.runResponses.slice(-manualPosts) : [],
      afterReleaseFundingCheck: afterRelease.fundingCheck, draft });
    const verified = await receipt('dual-manual-verified.json');
    expect(Number(verified.running)).toBe(9);
    expect(verified.fundingCheck).toBe('insufficient');
    expect(Number(verified.newUpstreamCount)).toBe(0);
    expect(Number(verified.newUsageCount)).toBe(0);
    expect(Number(verified.newCreditUsageCount)).toBe(0);
    expect(checkRefusalPosts(session, manualBefore, verified)).toBe(manualPosts);
    await save('RUN013-dual-complete.safe.json', { binding, held, refusal, released, verified,
      initial, afterRelease, firstHint, firstTerminal, manualTerminal,
      requests: session.requests, runResponses: session.runResponses });
  } finally {
    await stopSession(session);
  }
});
