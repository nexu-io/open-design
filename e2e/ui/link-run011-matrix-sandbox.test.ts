import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { Browser, Page, Request } from '@playwright/test';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

type Role = 'owner' | 'admin' | 'member';
type Surface = 'home' | 'project';
type Actor = { controlKey: string; runtimeKey: string; userId: string; email: string; name: string; memberId: string };
type Fixture = {
  alias: string;
  tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; modelId: string };
  space: { workspaceId: string; tier: 'go'; actors: Record<Role, Actor> };
};
type Binding = {
  protocol: 'od-link-run011-matrix-v1';
  alias: string;
  attemptId: string;
  fixtureSha256: string;
  odSha: string;
  amrSha: string;
  workspaceId: string;
  modelId: string;
};
type RunResponse = { status: number; runId: string | null };
type BillingRead = {
  requestedAt: string;
  completedAt: string;
  status: number;
  workspaceId: string | null;
  workspaceMemberId: string | null;
  fundingCheck: string | null;
  balanceUsd: string | null;
};
type Case = {
  role: Role;
  surface: Surface;
  actor: Actor;
  page: Page;
  projectId: string | null;
  requests: Array<{ at: string; method: string; path: string; workspaceId: string | null }>;
  runResponses: RunResponse[];
  billingReads: BillingRead[];
  runBodies: Array<{ currentPrompt: string | null; attachmentPaths: string[];
    projectId: string | null; conversationId: string | null; userMessageId: string | null }>;
  draft: string;
  attachment: string;
};
type Session = {
  role: Role;
  actor: Actor;
  runtime: ReturnType<typeof createToolsDevSuite>;
  dataDir: string;
  env: Record<string, string>;
  cases: Case[];
};

const fixturePath = process.env.OD_LINK_RUN011_FIXTURE;
const output = process.env.OD_LINK_RUN011_EVIDENCE;
const roles: Role[] = ['owner', 'admin', 'member'];
const surfaces: Surface[] = ['home', 'project'];

test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

async function prepare() {
  if (!fixturePath || !output) throw new Error('Explicit RUN011 fixture and evidence directory required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture0600 required');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const fixtureSha256 = createHash('sha256').update(bytes).digest('hex');
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim();
  if (fixture.tuple.odSha !== odSha || !fixture.tuple.amrSha || fixture.space.tier !== 'go'
    || !fixture.space.workspaceId || !fixture.runtime.modelId) throw new Error('Incomplete fixed RUN011 tuple');
  for (const value of Object.values(fixture.urls)) {
    const url = new URL(value);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Only isolated loopback AMR endpoints permitted');
    }
  }
  for (const role of roles) {
    const actor = fixture.space.actors[role];
    if (!actor?.controlKey || !actor.runtimeKey || !actor.memberId) {
      throw new Error('Three product-authenticated actors required');
    }
  }
  await mkdir(output, { recursive: true, mode: 0o700 });
  await chmod(output, 0o700);
  const markers = join(output, 'markers');
  await mkdir(markers, { recursive: true, mode: 0o700 });
  await chmod(markers, 0o700);
  if ((await readdir(markers)).length !== 0) throw new Error('Fresh empty marker directory required');
  const binding: Binding = { protocol: 'od-link-run011-matrix-v1', alias: fixture.alias,
    attemptId: randomUUID(), fixtureSha256, odSha, amrSha: fixture.tuple.amrSha,
    workspaceId: fixture.space.workspaceId, modelId: fixture.runtime.modelId };
  const save = (name: string, value: unknown) =>
    writeFile(join(output, name), JSON.stringify(value, null, 2), { mode: 0o600 });
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
    if (value.error) throw new Error('RUN011 accounting receipt blocked: ' + String(value.error));
    await save(name, value);
    return value;
  };
  return { fixture, binding, save, marker, receipt };
}

function caseKey(item: Pick<Case, 'role' | 'surface'>) {
  return item.role + '-' + item.surface;
}

function elements(item: Case) {
  const home = item.surface === 'home';
  return {
    input: item.page.getByTestId(home ? 'home-hero-input' : 'chat-composer-input'),
    send: item.page.getByTestId(home ? 'home-hero-submit' : 'chat-send'),
    file: item.page.getByTestId(home ? 'home-hero-file-input' : 'chat-file-input'),
    staged: item.page.getByTestId(home ? 'home-hero-staged-files' : 'staged-attachments'),
  };
}

function runPosts(item: Case) {
  return item.requests.filter(request => request.method === 'POST' && request.path === '/api/runs');
}

async function startSession(browser: Browser, fixture: Fixture, role: Role, attemptId: string): Promise<Session> {
  const actor = fixture.space.actors[role];
  const namespace = 'link-run011-' + randomUUID().slice(0, 8);
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
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
  const cases: Case[] = [];
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    const headers = { 'x-od-workspace-id': fixture.space.workspaceId,
      'x-od-workspace-member-id': actor.memberId, 'x-od-workspace-role': role,
      'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-member-status': 'active' };
    const contextResponse = await fetch(runtime.url.web('/api/workspace/context'), { headers });
    const contextText = await contextResponse.text();
    let context: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(contextText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        context = parsed as Record<string, unknown>;
      }
    } catch { /* diagnostic below */ }
    if (contextResponse.status !== 200 || !context.context) {
      const diagnostic = { role, status: contextResponse.status,
        contentType: contextResponse.headers.get('content-type'),
        keys: Object.keys(context), error: context.error ?? null,
        message: context.message ?? null, bodyStart: contextText.slice(0, 500) };
      await writeFile(join(output!, 'RUN011-' + role + '-workspace-context.private.json'),
        JSON.stringify(diagnostic, null, 2), { mode: 0o600 });
      throw new Error('Workspace context preflight failed: status=' + diagnostic.status
        + ' error=' + String(diagnostic.error) + ' keys=' + diagnostic.keys.join(','));
    }
    expect(context.context).toMatchObject({ workspaceId: fixture.space.workspaceId,
      workspaceMemberId: actor.memberId, role });
    const projectId = 'run011-' + role + '-' + attemptId;
    const created = await fetch(runtime.url.web('/api/projects'), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'RUN011 existing project', metadata: { kind: 'prototype' } }) });
    expect(created.ok, await created.text()).toBe(true);
    const artifact = '<!doctype html><html><body><h1>Existing RUN011 output survives</h1></body></html>';
    const saved = await fetch(runtime.url.web('/api/projects/' + projectId + '/files'), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'existing-output.html', content: artifact, encoding: 'utf8' }) });
    expect(saved.ok, await saved.text()).toBe(true);
    for (const surface of surfaces) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const requests: Case['requests'] = [];
      const runResponses: RunResponse[] = [];
      const billingReads: BillingRead[] = [];
      const billingRequests = new Map<Request, string>();
      const runBodies: Case['runBodies'] = [];
      cases.push({ role, surface, actor, page, projectId: surface === 'project' ? projectId : null,
        requests, runResponses, billingReads, runBodies, draft: '', attachment: '' });
      page.on('request', request => {
        const url = new URL(request.url());
        const path = url.pathname;
        if (request.method() === 'GET'
          && ['/api/workspace/billing', '/api/workspace/billing/preflight'].includes(path)
          && url.searchParams.get('workspaceId') === fixture.space.workspaceId) {
          billingRequests.set(request, new Date().toISOString());
        }
        if (path.startsWith('/api/')) requests.push({ at: new Date().toISOString(),
          method: request.method(), path, workspaceId: request.headers()['x-od-workspace-id'] ?? null });
        if (request.method() === 'POST' && path === '/api/runs') {
          const body = request.postDataJSON() as {
            currentPrompt?: unknown; attachments?: unknown[];
            projectId?: unknown; conversationId?: unknown; userMessageId?: unknown;
          };
          runBodies.push({ currentPrompt: typeof body.currentPrompt === 'string' ? body.currentPrompt : null,
            attachmentPaths: Array.isArray(body.attachments)
              ? body.attachments.map(value => typeof value === 'string' ? value : '') : [],
            projectId: typeof body.projectId === 'string' ? body.projectId : null,
            conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
            userMessageId: typeof body.userMessageId === 'string' ? body.userMessageId : null });
        }
      });
      page.on('response', response => {
        const requestedAt = billingRequests.get(response.request());
        if (requestedAt) {
          billingRequests.delete(response.request());
          const read: BillingRead = { requestedAt, completedAt: new Date().toISOString(),
            status: response.status(), workspaceId: null, workspaceMemberId: null,
            fundingCheck: null, balanceUsd: null };
          void response.json().then(body => {
            const wallet = body.workspaceBalance ?? body.workspaceSnapshot;
            const proof = body.preflight ?? wallet;
            billingReads.push({ ...read, completedAt: new Date().toISOString(),
              workspaceId: proof?.workspaceId ?? null,
              workspaceMemberId: proof?.workspaceMemberId ?? null,
              fundingCheck: body.preflight?.fundingCheck ?? null,
              balanceUsd: body.preflight?.balanceUsd ?? wallet?.balanceUsd ?? wallet?.wallet?.balanceUsd ?? null });
          }).catch(() => { billingReads.push(read); });
        }
        if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/runs') return;
        void response.json().then(body => {
          runResponses.push({ status: response.status(),
            runId: typeof body?.runId === 'string' ? body.runId : null });
        }).catch(() => { runResponses.push({ status: response.status(), runId: null }); });
      });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
          ? route.continue() : route.abort();
      });
      await page.addInitScript(({ appConfig, workspaceId, workspaceMemberId }) => {
        localStorage.setItem('open-design:config', JSON.stringify(appConfig));
        localStorage.setItem('open-design:locale', 'zh-CN');
        localStorage.setItem('open-design:locale-source', 'manual');
        sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId, workspaceMemberId }));
      }, { appConfig: config, workspaceId: fixture.space.workspaceId, workspaceMemberId: actor.memberId });
      await page.goto(runtime.url.web(surface === 'home' ? '/' : '/projects/' + projectId),
        { waitUntil: 'domcontentloaded', timeout: T.xlong });
      const item = cases.at(-1)!;
      await expect(elements(item).input).toBeVisible({ timeout: T.long });
      if (surface === 'project') await expect(page.frameLocator('[data-testid="artifact-preview-frame"]')
        .getByRole('heading', { name: 'Existing RUN011 output survives' })).toBeVisible({ timeout: T.long });
    }
    return { role, actor, runtime, dataDir, env, cases };
  } catch (error) {
    for (const item of cases) await item.page.close().catch(() => undefined);
    await runtime.stopWeb(env).catch(() => undefined);
    throw error;
  }
}

async function stopSession(session: Session) {
  for (const item of session.cases) await item.page.close().catch(() => undefined);
  await session.runtime.stopWeb(session.env);
}

async function preflight(item: Case, session: Session, fixture: Fixture) {
  const url = new URL('/api/workspace/billing', session.runtime.url.web());
  url.search = new URLSearchParams({ scope: 'workspace', workspaceId: fixture.space.workspaceId,
    includePreflight: '1', modelId: fixture.runtime.modelId }).toString();
  const headers = { 'x-od-workspace-id': fixture.space.workspaceId,
    'x-od-workspace-member-id': item.actor.memberId, 'x-od-workspace-role': item.role };
  const attempts: Array<{ attempt: number; at: string; status?: number; errorCode?: string | null }> = [];
  const diagnosticPath = join(output!, 'RUN011-' + caseKey(item) + '-preflight-transport-'
    + Date.now() + '-' + randomUUID().slice(0, 8) + '.private.json');
  const record = () => writeFile(diagnosticPath, JSON.stringify({ role: item.role,
    surface: item.surface, url: url.toString(), attempts }, null, 2), { mode: 0o600 });
  let response: Response | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      response = await fetch(url, { headers });
      attempts.push({ attempt, at: new Date().toISOString(), status: response.status });
      break;
    } catch (error) {
      const cause = error instanceof Error ? error.cause : null;
      const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : null;
      attempts.push({ attempt, at: new Date().toISOString(), errorCode: code });
      // This is an idempotent GET. One immediate retry replaces an idle local
      // socket reset; no send, run or wallet mutation is repeated.
      if (code !== 'ECONNRESET' || attempt === 2) {
        await record();
        throw error;
      }
    }
  }
  await record();
  if (!response) throw new Error('RUN011 preflight returned no response');
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.preflight).toMatchObject({ workspaceId: fixture.space.workspaceId,
    workspaceMemberId: item.actor.memberId, modelId: fixture.runtime.modelId });
  return body.preflight as { fundingCheck: string; [key: string]: unknown };
}

async function terminalRun(item: Case, session: Session, fixture: Fixture, runId: string) {
  let row!: Record<string, unknown>;
  await expect.poll(async () => {
    const response = await fetch(session.runtime.url.web('/api/runs/' + encodeURIComponent(runId)), {
      headers: { 'x-od-workspace-id': fixture.space.workspaceId,
        'x-od-workspace-member-id': item.actor.memberId, 'x-od-workspace-role': item.role },
    });
    expect(response.ok).toBe(true);
    row = await response.json() as Record<string, unknown>;
    return row.status;
  }, { timeout: T.xlong, intervals: [250, 500, 1000] }).toBe('succeeded');
  expect(row).toMatchObject({ id: runId, status: 'succeeded', signal: null,
    cancelOrigin: null, error: null, errorCode: null,
    failureCategory: null, endedWithUnfinishedWork: false });
  expect([0, 130]).toContain(row.exitCode);
  let acpEvidence: { eventsSha256: string; completedSteps: number;
    completedMessages: number; retryDiagnostics: number } | null = null;
  if (row.exitCode === 130) {
    // Vela can exit 130 after a successful ACP completion. Check the original
    // local run stream before accepting the daemon's succeeded verdict; a
    // retry diagnostic alone is not a terminal failure, and the AMR receipt
    // below still must prove every chargeable call settled exactly once.
    expect(runId).toMatch(/^[0-9a-f-]{36}$/i);
    const eventsPath = join(session.dataDir, 'runs', runId, 'events.jsonl');
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
    expect(events.some(event => event.event === 'agent' && event.data?.type === 'usage')).toBe(true);
    expect(events.some(event => event.event === 'agent' && event.data?.type === 'error')).toBe(false);
    expect(diagnostics.some(event => ['model_step_lifecycle', 'assistant_message_lifecycle'].includes(
      String(event.data?.name)) && event.data?.phase === 'end'
      && event.data.status !== 'completed')).toBe(false);
    expect(events.some(event => event.event === 'diagnostic' && event.data?.type === 'runtime_close'
      && event.data.status === 'succeeded' && event.data.exit_code === 130)).toBe(true);
    expect(events.at(-1)).toMatchObject({ event: 'end',
      data: { status: 'succeeded', code: 130, signal: null, endedWithUnfinishedWork: false,
        failureCategory: null } });
    acpEvidence = { eventsSha256: createHash('sha256').update(bytes).digest('hex'),
      completedSteps, completedMessages,
      retryDiagnostics: diagnostics.filter(event => event.data?.name === 'model_retry').length };
  }
  return { status: row.status, exitCode: row.exitCode, errorCode: row.errorCode ?? null,
    acpEvidence };
}

function balanceNotice(item: Case) {
  return item.page.getByTestId(item.role === 'owner' ? 'amr-balance-dialog' : 'amr-balance-owner-dialog');
}

async function dismissNotice(item: Case) {
  if (item.role === 'owner') {
    await balanceNotice(item).getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
  } else {
    await item.page.getByTestId('amr-balance-owner-dismiss').click();
  }
}

async function assertRetained(item: Case) {
  const { input, staged } = elements(item);
  await expect(input).toHaveText(item.draft);
  await assertStagedAttachment(item, staged);
  await expect(item.page.getByTestId('queued-send-banner')).toHaveCount(0);
  if (item.surface === 'project') {
    await expect(item.page.frameLocator('[data-testid="artifact-preview-frame"]')
      .getByRole('heading', { name: 'Existing RUN011 output survives' })).toBeVisible();
    const queue = await item.page.evaluate(projectId => {
      const raw = localStorage.getItem('od:chat-queued-sends:' + projectId + ':v1');
      return raw ? JSON.parse(raw) : [];
    }, item.projectId!);
    expect(queue).toEqual([]);
  }
}

async function assertStagedAttachment(item: Case, staged: ReturnType<typeof elements>['staged']) {
  if (item.surface === 'project') {
    // The project composer intentionally middle-truncates long names in the
    // visible card; its title retains the complete uploaded filename.
    await expect(staged.getByTitle(item.attachment, { exact: true })).toBeVisible();
  } else {
    await expect(staged).toContainText(item.attachment);
  }
}

test('[P0] RUN011 six roles and surfaces retain drafts until one manual funded send', async ({ browser }) => {
  test.setTimeout(1_200_000);
  const { fixture, binding, save, marker, receipt } = await prepare();
  const sessions: Session[] = [];
  try {
    for (const role of roles) sessions.push(await startSession(browser, fixture, role, binding.attemptId));
    const all = sessions.flatMap(session => session.cases);
    for (const item of all) {
      const session = sessions.find(candidate => candidate.role === item.role)!;
      const funding = await preflight(item, session, fixture);
      expect(funding.fundingCheck).toBe('insufficient');
      const { input, send, file, staged } = elements(item);
      await input.fill('RUN011 first blocked ' + caseKey(item) + ' ' + binding.attemptId);
      await send.click();
      await expect(balanceNotice(item)).toBeVisible({ timeout: T.long });
      expect(runPosts(item)).toHaveLength(0);
      if (item.role === 'owner') {
        await expect(item.page.getByTestId('amr-balance-dialog-plans')).toBeVisible();
      } else {
        await expect(balanceNotice(item)).toContainText('联系团队空间所有者');
        await expect(item.page.getByTestId('amr-balance-owner-dismiss')).toHaveText('知道了');
      }
      await dismissNotice(item);
      // The controlled real-Link provider requires an explicit QA marker in
      // the actual user prompt; keep the tested draft and attachment intact.
      item.draft = 'RUN011 new attached draft ' + caseKey(item) + ' ' + binding.attemptId
        + ' QA:' + JSON.stringify({ id: 'run011-' + caseKey(item) + '-' + binding.attemptId, tokens: 16 });
      item.attachment = 'run011-' + caseKey(item) + '.txt';
      await input.fill(item.draft);
      const upload = item.surface === 'project' ? item.page.waitForResponse(response =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(
          '/projects/' + item.projectId + '/upload')) : null;
      await file.setInputFiles({ name: item.attachment, mimeType: 'text/plain',
        buffer: Buffer.from('RUN011 retained attachment ' + caseKey(item)) });
      if (upload) expect((await upload).ok()).toBe(true);
      await assertStagedAttachment(item, staged);
      await send.click({ clickCount: 2 });
      await expect(balanceNotice(item)).toBeVisible({ timeout: T.long });
      if (item.role === 'owner') {
        await expect(item.page.getByTestId('amr-balance-dialog-plans')).toBeVisible();
      } else {
        await expect(balanceNotice(item)).toContainText('联系团队空间所有者');
      }
      await assertRetained(item);
      expect(runPosts(item)).toHaveLength(0);
      await item.page.screenshot({ path: join(output!, 'RUN011-' + caseKey(item) + '-blocked.png') });
      await dismissNotice(item);
    }
    for (const item of all) {
      expect(runPosts(item)).toHaveLength(0);
      expect(item.runResponses).toHaveLength(0);
      await assertRetained(item);
    }
    const blocked = all.map(item => ({ role: item.role, surface: item.surface,
      memberId: item.actor.memberId, projectId: item.projectId, draft: item.draft,
      attachment: item.attachment, runPosts: runPosts(item).length }));
    await save('RUN011-all-blocked.safe.json', { binding, blocked });
    for (const item of all) {
      await item.page.context().setOffline(true);
      expect(await item.page.evaluate(() => navigator.onLine)).toBe(false);
    }
    const disconnectedAt = new Date().toISOString();
    await marker('RUN011-ready.json', { cases: blocked, fundingCheck: 'insufficient', disconnectedAt });
    const funded = await receipt('RUN011-funded.json');
    expect(funded.fundingCheck).toBe('available');
    expect(funded.workspaceId).toBe(fixture.space.workspaceId);
    const reconnectStartedAt = new Date().toISOString();
    for (const item of all) {
      await item.page.context().setOffline(false);
      expect(await item.page.evaluate(() => navigator.onLine)).toBe(true);
    }
    const reconnectedAt = new Date().toISOString();
    for (const item of all) {
      // Observe the product's own online/poll refresh after real funding. A
      // test-generated GET or refresh event would conceal a recovery failure.
      await expect.poll(() => item.billingReads.some(read => read.status === 200
        && Date.parse(read.requestedAt) >= Date.parse(reconnectStartedAt)
        && read.workspaceId === fixture.space.workspaceId
        && read.workspaceMemberId === item.actor.memberId
        && (read.fundingCheck === 'available' || Number(read.balanceUsd) > 0)),
      { timeout: T.xlong, intervals: [250, 500, 1000] }).toBe(true);
    }
    const noClickStart = new Date().toISOString();
    const automatic = await Promise.all(all.map(item => item.page.waitForEvent('request', {
      predicate: request => request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs',
      timeout: 5000,
    }).catch(() => null)));
    expect(automatic.every(value => value === null)).toBe(true);
    for (const item of all) {
      expect(runPosts(item)).toHaveLength(0);
      await assertRetained(item);
      await item.page.screenshot({ path: join(output!, 'RUN011-' + caseKey(item) + '-funded-no-click.png') });
    }
    await save('RUN011-funded-no-click.safe.json', { binding, disconnectedAt, reconnectStartedAt,
      reconnectedAt, noClickStart, observedAt: new Date().toISOString(), funded, cases: blocked,
      naturalBillingReads: all.map(item => ({ role: item.role, surface: item.surface,
        reads: item.billingReads })) });
    const completed: Array<{ role: Role; surface: Surface; runId: string }> = [];
    const allCanonicalIds: string[] = [];
    for (const item of all) {
      const ledgerReady = await receipt('RUN011-' + caseKey(item) + '-ledger-ready.json');
      expect(ledgerReady.role).toBe(item.role);
      expect(ledgerReady.surface).toBe(item.surface);
      expect(ledgerReady.workspaceId).toBe(fixture.space.workspaceId);
      const { send } = elements(item);
      const responseReady = item.page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
      await send.click();
      const response = await responseReady;
      expect(response.status()).toBe(202);
      const body = await response.json() as { runId?: string };
      expect(body.runId).toEqual(expect.any(String));
      expect(body.runId?.length).toBeGreaterThan(0);
      await expect.poll(() => item.runResponses.length, { timeout: T.long }).toBe(1);
      expect(runPosts(item)).toHaveLength(1);
      expect(item.runBodies).toHaveLength(1);
      const sent = item.runBodies[0]!;
      expect(sent.currentPrompt).toContain(item.draft);
      expect(sent.attachmentPaths).toHaveLength(1);
      const attachmentPath = sent.attachmentPaths[0]!;
      expect(attachmentPath.length).toBeGreaterThan(0);
      expect(attachmentPath).not.toMatch(/^(?:\/|\.\.?\/)/);
      expect(basename(attachmentPath)).toBe(item.attachment);
      expect(sent.projectId).toEqual(expect.any(String));
      if (item.projectId) expect(sent.projectId).toBe(item.projectId);
      expect(sent.conversationId).toEqual(expect.any(String));
      expect(sent.userMessageId).toEqual(expect.any(String));
      expect(runPosts(item)[0]?.workspaceId).toBe(fixture.space.workspaceId);
      for (const other of all.filter(other => other !== item && !completed.some(done =>
        done.role === other.role && done.surface === other.surface))) {
        expect(runPosts(other)).toHaveLength(0);
      }
      const session = sessions.find(candidate => candidate.role === item.role)!;
      await expect.poll(async () => {
        const url = session.runtime.url.web('/api/projects/' + encodeURIComponent(sent.projectId!)
          + '/conversations/' + encodeURIComponent(sent.conversationId!) + '/messages');
        const readback = await fetch(url, { headers: {
          'x-od-workspace-id': fixture.space.workspaceId,
          'x-od-workspace-member-id': item.actor.memberId,
          'x-od-workspace-role': item.role,
        } });
        if (!readback.ok) return null;
        const rows = await readback.json() as { messages?: Array<Record<string, unknown>> };
        const message = rows.messages?.find(row => row.id === sent.userMessageId);
        return message ? { projectId: sent.projectId, conversationId: sent.conversationId,
          content: message.content, attachments: message.attachments,
          attachmentCount: Array.isArray(message.attachments) ? message.attachments.length : -1 } : null;
      }, { timeout: T.long, intervals: [250, 500, 1000] }).toMatchObject({
        projectId: sent.projectId, conversationId: sent.conversationId,
        content: item.draft,
        attachmentCount: 1,
        attachments: [{ path: attachmentPath, name: item.attachment, kind: 'file', order: 0 }],
      });
      const terminal = await terminalRun(item, session, fixture, body.runId!);
      await marker('RUN011-' + caseKey(item) + '-manual-ready.json', {
        role: item.role, surface: item.surface, memberId: item.actor.memberId,
        projectId: item.projectId, runId: body.runId, status: response.status(), terminal,
      });
      const verified = await receipt('RUN011-' + caseKey(item) + '-manual-verified.json');
      expect(verified.runId).toBe(body.runId);
      expect(verified.billingWorkspaceId).toBe(fixture.space.workspaceId);
      expect(Number(verified.targetSuccessfulUpstreamCount)).toBeGreaterThan(0);
      expect(Number(verified.targetUsageCount)).toBeGreaterThanOrEqual(
        Number(verified.targetSuccessfulUpstreamCount));
      expect(Number(verified.unsettledSuccessfulCallCount)).toBe(0);
      expect(Number(verified.unmatchedChargeCount)).toBe(0);
      const calls = verified.chargeableCalls as Array<{
        canonicalRequestId: string; usageId: string; chargedWorkspaceId: string;
      }>;
      expect(Array.isArray(calls) && calls.length > 0).toBe(true);
      expect(new Set(calls.map(call => call.canonicalRequestId)).size).toBe(calls.length);
      for (const call of calls) {
        expect(call.canonicalRequestId.length).toBeGreaterThan(0);
        expect(call.usageId.length).toBeGreaterThan(0);
        expect(call.chargedWorkspaceId).toBe(fixture.space.workspaceId);
        allCanonicalIds.push(call.canonicalRequestId);
      }
      expect((await preflight(item, session, fixture)).fundingCheck).toBe('available');
      await save('RUN011-' + caseKey(item) + '-manual.safe.json', { binding, verified,
        runResponse: { status: response.status(), runId: body.runId }, terminal, requests: item.requests });
      completed.push({ role: item.role, surface: item.surface, runId: body.runId! });
    }
    expect(new Set(completed.map(item => item.runId)).size).toBe(6);
    expect(new Set(allCanonicalIds).size).toBe(allCanonicalIds.length);
    for (const item of all) {
      expect(runPosts(item)).toHaveLength(1);
      expect(item.runResponses).toEqual([{ status: 202,
        runId: completed.find(done => done.role === item.role && done.surface === item.surface)?.runId }]);
      await expect(item.page.getByTestId('queued-send-banner')).toHaveCount(0);
      if (item.projectId) {
        const queue = await item.page.evaluate(projectId => {
          const raw = localStorage.getItem('od:chat-queued-sends:' + projectId + ':v1');
          return raw ? JSON.parse(raw) : [];
        }, item.projectId);
        expect(queue).toEqual([]);
      }
    }
    await marker('RUN011-complete.json', { completed });
    await save('RUN011-complete.safe.json', { binding, completed,
      cases: all.map(item => ({ role: item.role, surface: item.surface,
        requests: item.requests, runResponses: item.runResponses })) });
  } finally {
    try {
      await save('RUN011-natural-billing-readbacks.private.json', { binding,
        cases: sessions.flatMap(session => session.cases).map(item => ({ role: item.role,
          surface: item.surface, reads: item.billingReads })) });
    } finally {
      for (const session of sessions.reverse()) await stopSession(session);
    }
  }
});

test('[P0] RUN011 isolated runtime probe reaches Link before six-page replay', async ({ browser }) => {
  test.skip(process.env.OD_LINK_RUN011_PROBE !== '1', 'Only the explicit funded-space runtime probe may run');
  test.setTimeout(360_000);
  const { fixture, binding, save } = await prepare();
  const session = await startSession(browser, fixture, 'owner', binding.attemptId);
  try {
    const item = session.cases.find(candidate => candidate.surface === 'home')!;
    expect((await preflight(item, session, fixture)).fundingCheck).toBe('available');
    const prompt = 'RUN011 isolated runtime probe ' + binding.attemptId
      + ' QA:' + JSON.stringify({ id: 'run011-probe-' + binding.attemptId, tokens: 16 });
    await elements(item).input.fill(prompt);
    const startedAt = Date.now();
    const responsePromise = item.page.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/runs',
    { timeout: T.long });
    await elements(item).send.click();
    const response = await responsePromise;
    const body = await response.json() as { runId?: unknown };
    const runId = typeof body.runId === 'string' ? body.runId : null;
    await save('RUN011-runtime-probe-start.safe.json', { binding, startedAt, runId,
      responseStatus: response.status(), workspaceId: fixture.space.workspaceId,
      modelId: fixture.runtime.modelId, runtimeBin: fixture.runtime.openCodeBin,
      prompt, requests: item.requests });
    expect(response.status()).toBe(202);
    expect(runId).toMatch(/^[0-9a-f-]{36}$/i);
    let run: Record<string, unknown> = {};
    const deadline = Date.now() + 240_000;
    do {
      const result = await fetch(session.runtime.url.web('/api/runs/' + runId), { headers: {
        'x-od-workspace-id': fixture.space.workspaceId,
        'x-od-workspace-member-id': item.actor.memberId,
        'x-od-workspace-role': item.role,
      } });
      expect(result.ok).toBe(true);
      run = await result.json() as Record<string, unknown>;
      if (['succeeded', 'failed', 'canceled'].includes(String(run.status))) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    } while (Date.now() < deadline);
    await save('RUN011-runtime-probe-terminal.safe.json', { binding, runId,
      status: run.status, exitCode: run.exitCode, elapsedMs: Date.now() - startedAt,
      requests: item.requests, runResponses: item.runResponses });
    expect(run.status).toBe('succeeded');
    expect(run.exitCode).toBe(0);
    expect(runPosts(item)).toHaveLength(1);
  } finally {
    await stopSession(session);
  }
});
