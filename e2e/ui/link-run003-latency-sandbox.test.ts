import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { T } from '@/timeouts';

type Gate = 'balance' | 'concurrency';
type Surface = 'home' | 'project';
type Actor = { controlKey: string; runtimeKey: string; userId: string; email: string; name: string; memberId: string };
type Fixture = {
  alias: string;
  tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; modelId: string };
  space: { workspaceId: string; workspaceName: string; tier: string; limit: number; actor: Actor };
  background: { workspaceId: string };
};
type RunResponse = { status: number; runId: string | null };

declare global {
  interface Window {
    __odRun003Paint?: { clickAt: number | null; visibleAt: number | null;
      noticeText: string | null; timeOrigin: number };
  }
}

const fixturePath = process.env.OD_LINK_RUN003_FIXTURE;
const output = process.env.OD_LINK_RUN003_EVIDENCE;
const gate = process.env.OD_LINK_RUN003_GATE as Gate;
const surface = process.env.OD_LINK_RUN003_SURFACE as Surface;
const manualOnly = process.env.OD_LINK_RUN003_MANUAL_ONLY === '1';
const NOTICE_SELECTOR = {
  balance: '[data-testid="amr-balance-dialog"]',
  concurrency: '[data-testid="amr-concurrency-dialog"]',
} as const;

test.use({ video: 'on', viewport: { width: 1280, height: 800 } });

test('[P0] RUN003 real browser first-visible notice, task isolation and manual recovery', async ({ page }, info) => {
  test.setTimeout(600_000);
  if (!fixturePath || !output || !['balance', 'concurrency'].includes(gate)
    || !['home', 'project'].includes(surface)) {
    throw new Error('Explicit RUN003 fixture/evidence/gate/surface required; execute each of the four cells separately');
  }
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Private fixture0600 required');
  const bytes = await readFile(fixturePath);
  const fixture = JSON.parse(bytes.toString()) as Fixture;
  const fixtureSha256 = createHash('sha256').update(bytes).digest('hex');
  if (execFileSync('git', ['status', '--porcelain'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim()) {
    throw new Error('RUN003 requires a clean OD worktree matching the signed tuple');
  }
  const odSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim();
  const { space, runtime: model, background } = fixture;
  if (fixture.tuple.odSha !== odSha || !fixture.tuple.amrSha || !fixture.alias || !space?.workspaceId
    || !space.workspaceName?.trim()
    || !space.actor?.controlKey || !space.actor.runtimeKey || !space.actor.memberId
    || !model?.modelId || !model.velaBin || !model.openCodeBin || !background
    || background.workspaceId !== space.workspaceId || space.limit < 2) {
    throw new Error('Incomplete fixed RUN003 tuple, current workspace, model or same-space background run');
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
  if ((await readdir(markers)).length !== 0) throw new Error('Fresh empty marker directory required');
  const attemptId = randomUUID();
  let binding!: { protocol: string; alias: string; attemptId: string; fixtureSha256: string;
    odSha: string; amrSha: string; workspaceId: string; tier: string; modelId: string;
    gate: Gate; surface: Surface; backgroundRunId: string };
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
    if (value.error) throw new Error('RUN003 independent receipt blocked: ' + String(value.error));
    await save(name, value);
    return value;
  };

  const namespace = 'link-run003-' + randomUUID().slice(0, 8);
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const dataDir = join(scratch, 'data');
  const amrHome = join(scratch, 'amr-home');
  const runtime = createToolsDevSuite({ root, dataDir, namespace, ownerPid: process.pid,
    codexHomeDir: join(scratch, 'codex-home'), toolsDevRoot: join(scratch, 'tools-dev') });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  const actor = space.actor;
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: actor.controlKey, runtimeKey: actor.runtimeKey,
    apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
    user: { id: actor.userId, email: actor.email, name: actor.name },
  } } }), { mode: 0o600 });
  const config = { mode: 'daemon', agentId: 'amr', model: model.modelId,
    onboardingCompleted: true, privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: { amr: { model: model.modelId } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: model.velaBin } } };
  await writeFile(join(dataDir, 'app-config.json'), JSON.stringify(config), { mode: 0o600 });
  const env = { AMR_HOME: amrHome, VELA_BIN: model.velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api, VELA_LINK_URL: fixture.urls.link,
    VELA_CONTROL_KEY: actor.controlKey, VELA_OPENCODE_BIN: model.openCodeBin,
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: fixture.urls.web,
    OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
  const headers = { 'x-od-workspace-id': space.workspaceId, 'x-od-workspace-member-id': actor.memberId,
    'x-od-workspace-role': 'owner', 'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active' };
  const preflight = async () => {
    const url = new URL('/api/workspace/billing', runtime.url.web());
    url.search = new URLSearchParams({ scope: 'workspace', workspaceId: space.workspaceId,
      includePreflight: '1', modelId: model.modelId }).toString();
    const response = await fetch(url, { headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.preflight).toMatchObject({ workspaceId: space.workspaceId,
      workspaceMemberId: actor.memberId, modelId: model.modelId });
    return body.preflight as { fundingCheck: string; modelCovered?: boolean };
  };
  const terminalRun = async (runId: string, allowed: string[]) => {
    let row: Record<string, unknown> = {};
    await expect.poll(async () => {
      const response = await fetch(runtime.url.web('/api/runs/' + encodeURIComponent(runId)), { headers });
      expect(response.status).toBe(200);
      row = await response.json() as Record<string, unknown>;
      return ['succeeded', 'failed', 'canceled'].includes(String(row.status));
    }, { timeout: 180_000, intervals: [250, 500, 1000] }).toBe(true);
    expect(allowed, 'unexpected OD run terminal state').toContain(row.status);
    expect(row).toMatchObject({ id: runId, status: 'succeeded', signal: null,
      cancelRequested: false, cancelOrigin: null, error: null, errorCode: null,
      failureCategory: null, endedWithUnfinishedWork: false });
    expect([0, 130]).toContain(row.exitCode);
    let acpEvidence: { eventsSha256: string; completedSteps: number;
      completedMessages: number; retryDiagnostics: number } | null = null;
    if (row.exitCode === 130) {
      // Vela may exit 130 after clean ACP completion. Require its original
      // stream to prove completion, then retain the independent AMR ledger
      // receipt below as the settlement authority for every model call.
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
    return { status: row.status, exitCode: row.exitCode, errorCode: row.errorCode,
      cancelOrigin: row.cancelOrigin, acpEvidence };
  };
  const requests: Array<{ method: string; path: string; workspaceId: string | null }> = [];
  const runResponses: RunResponse[] = [];
  const runBodies: Array<{ currentPrompt: string | null; attachmentPaths: string[];
    projectId: string | null; conversationId: string | null; userMessageId: string | null }> = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ method: request.method(), path,
      workspaceId: request.headers()['x-od-workspace-id'] ?? null });
    if (request.method() === 'POST' && path === '/api/runs') {
      const body = request.postDataJSON() as { currentPrompt?: unknown; attachments?: unknown[];
        projectId?: unknown; conversationId?: unknown; userMessageId?: unknown };
      runBodies.push({ currentPrompt: typeof body.currentPrompt === 'string' ? body.currentPrompt : null,
        attachmentPaths: Array.isArray(body.attachments)
          ? body.attachments.map(value => typeof value === 'string' ? value : '') : [],
        projectId: typeof body.projectId === 'string' ? body.projectId : null,
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : null,
        userMessageId: typeof body.userMessageId === 'string' ? body.userMessageId : null });
    }
  });
  page.on('response', response => {
    if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/runs') return;
    void response.json().then(body => runResponses.push({ status: response.status(),
      runId: typeof body?.runId === 'string' ? body.runId : null }))
      .catch(() => runResponses.push({ status: response.status(), runId: null }));
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return !url.protocol.startsWith('http') || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      ? route.continue() : route.abort();
  });
  const postCount = () => requests.filter(item => item.method === 'POST' && item.path === '/api/runs').length;
  const projectId = 'run003-' + attemptId;
  const artifactName = 'existing-output.html';
  const artifact = '<!doctype html><html><body><h1>Existing RUN003 output survives</h1></body></html>';
  const draft = 'RUN003 retained draft ' + attemptId;
  const attachmentName = 'run003-brief.txt';
  let started = false;
  try {
    started = true;
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web('/'));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'));
    // This same suite owns the daemon. Create the background task only after
    // it is ready, then bind its actual persisted runId to every observer
    // marker. A pre-supplied runId cannot exist in this fresh daemon.
    const backgroundProjectId = 'run003-background-' + attemptId;
    const backgroundProjectResponse = await fetch(runtime.url.web('/api/projects'), {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: backgroundProjectId, name: 'RUN003 background task',
        skipDiscoveryBrief: true }),
    });
    expect(backgroundProjectResponse.ok, await backgroundProjectResponse.clone().text()).toBe(true);
    const backgroundProject = await backgroundProjectResponse.json() as { conversationId?: string };
    expect(backgroundProject.conversationId).toMatch(/^[0-9a-f-]{36}$/i);
    const holdId = `od-concurrency-${attemptId}-${surface}-0`;
    const backgroundPrompt = `QA:${JSON.stringify({ id: holdId, tokens: 1, hold: true })}`;
    const backgroundResponse = await fetch(runtime.url.web('/api/runs'), {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: backgroundProjectId,
        conversationId: backgroundProject.conversationId, agentId: 'amr',
        assistantMessageId: randomUUID(), clientRequestId: randomUUID(),
        message: backgroundPrompt, currentPrompt: backgroundPrompt,
        skillId: null, designSystemId: null, model: 'default', reasoning: 'default' }),
    });
    expect(backgroundResponse.status, await backgroundResponse.clone().text()).toBe(202);
    const backgroundCreated = await backgroundResponse.json() as { runId?: string };
    expect(backgroundCreated.runId).toMatch(/^[0-9a-f-]{36}$/i);
    const backgroundRunId = backgroundCreated.runId!;
    await expect.poll(async () => {
      const response = await fetch(runtime.url.web('/api/runs/' + backgroundRunId), { headers });
      expect(response.ok).toBe(true);
      return (await response.json() as { status?: string }).status;
    }, { timeout: T.long, intervals: [250, 500, 1000] }).toBe('running');
    binding = { protocol: 'od-link-run003-v1', alias: fixture.alias, attemptId,
      fixtureSha256, odSha, amrSha: fixture.tuple.amrSha, workspaceId: space.workspaceId,
      tier: space.tier, modelId: model.modelId, gate, surface, backgroundRunId };
    await save('RUN003-background-created.safe.json', { binding, backgroundProjectId,
      clientWebUrl: runtime.url.web('/'), status: 'running', holdId });
    const contextResponse = await fetch(runtime.url.web('/api/workspace/context'), { headers });
    expect(contextResponse.status).toBe(200);
    const context = await contextResponse.json();
    expect(context.context).toMatchObject({ workspaceId: space.workspaceId,
      workspaceMemberId: actor.memberId, role: 'owner' });
    const created = await fetch(runtime.url.web('/api/projects'), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'RUN003 existing project', metadata: { kind: 'prototype' } }) });
    expect(created.ok, await created.text()).toBe(true);
    const saved = await fetch(runtime.url.web('/api/projects/' + projectId + '/files'), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: artifactName, content: artifact, encoding: 'utf8' }) });
    expect(saved.ok, await saved.text()).toBe(true);
    await page.addInitScript(({ appConfig, workspaceId, workspaceMemberId }) => {
      localStorage.setItem('open-design:config', JSON.stringify(appConfig));
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId, workspaceMemberId }));
    }, { appConfig: config, workspaceId: space.workspaceId, workspaceMemberId: actor.memberId });
    const initialContextResponse = page.waitForResponse(response =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/workspace/context'
      && response.status() === 200, { timeout: T.xlong });
    await page.goto(runtime.url.web(surface === 'home' ? '/' : '/projects/' + projectId),
      { waitUntil: 'domcontentloaded', timeout: T.xlong });
    const browserContext = await (await initialContextResponse).json() as {
      context?: { workspaceId?: string; workspaceMemberId?: string; role?: string };
    };
    expect(browserContext.context).toMatchObject({ workspaceId: space.workspaceId,
      workspaceMemberId: actor.memberId, role: 'owner' });
    const assertBrowserSelection = async () => {
      if (surface === 'project') {
        // The project editor has no entry rail or workspace switcher. Its
        // workspace identity is the live /api/workspace/context response above;
        // also require the actual project opened in the editor.
        await expect(page.getByRole('button', { name: 'RUN003 existing project' }))
          .toBeVisible({ timeout: T.long });
        return;
      }
      const rail = page.getByTestId('entry-rail-collapse');
      if (await rail.getAttribute('aria-expanded') !== 'true') await rail.click();
      const switcher = page.getByTestId('workspace-switcher');
      await expect(switcher).toBeVisible({ timeout: T.long });
      await switcher.click();
      // The personal workspace may be named "<team name>'s workspace". Match
      // the selected row's accessible name exactly, not as a substring.
      const selected = page.getByTestId('workspace-switcher-list')
        .getByRole('menuitem', { name: space.workspaceName, exact: true });
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveAttribute('aria-current', 'true');
      await expect(switcher).toContainText(space.workspaceName);
      await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 } });
    };
    await assertBrowserSelection();
    await save('RUN003-browser-identity.safe.json', { binding,
      context: browserContext.context, selectedWorkspaceName: space.workspaceName });
    const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
    const send = page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send');
    const staged = page.getByTestId(surface === 'home' ? 'home-hero-staged-files' : 'staged-attachments');
    const file = page.getByTestId(surface === 'home' ? 'home-hero-file-input' : 'chat-file-input');
    const notice = page.locator(NOTICE_SELECTOR[gate]);
    const artifactHeading = page.frameLocator('[data-testid="artifact-preview-frame"]')
      .getByRole('heading', { name: 'Existing RUN003 output survives' });
    await expect(input).toBeVisible({ timeout: T.long });
    if (surface === 'project') await expect(artifactHeading).toBeVisible({ timeout: T.long });
    await input.fill(draft);
    const uploaded = surface === 'project' ? page.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(
        '/projects/' + projectId + '/upload')) : null;
    await file.setInputFiles({ name: attachmentName, mimeType: 'text/plain',
      buffer: Buffer.from('RUN003 original attached bytes') });
    if (uploaded) expect((await uploaded).ok()).toBe(true);
    const assertRetained = async () => {
      await expect(input).toHaveText(draft);
      if (surface === 'project') {
        await expect(staged.getByTitle(attachmentName, { exact: true })).toBeVisible();
        await expect(artifactHeading).toBeVisible();
        const queue = await page.evaluate(id => {
          const raw = localStorage.getItem('od:chat-queued-sends:' + id + ':v1');
          return raw ? JSON.parse(raw) : [];
        }, projectId);
        expect(queue).toEqual([]);
      } else {
        await expect(staged).toContainText(attachmentName);
      }
      await expect(page.getByTestId('queued-send-banner')).toHaveCount(0);
    };
    await assertRetained();
    await expect(notice).toHaveCount(0);
    if (manualOnly) {
      // Resume only the manual-retry subpath after an independently observed
      // blocked/recovered cell. Do not re-execute its already proven click.
      await expect.poll(async () => (await preflight()).fundingCheck,
        { timeout: T.xlong, intervals: [250, 500, 1000] }).toBe('available');
      await page.evaluate(() => window.dispatchEvent(new Event('od:workspace-billing-refresh')));
      const automatic = await page.waitForEvent('request', { predicate: request =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs',
      timeout: 5000 }).catch(() => null);
      expect(automatic).toBeNull();
      expect(postCount()).toBe(0);
      await assertRetained();
      const responseReady = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
      await send.click();
      const response = await responseReady;
      expect(response.status()).toBe(202);
      const body = await response.json() as { runId?: string };
      expect(body.runId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(postCount()).toBe(1);
      expect(runBodies).toHaveLength(1);
      const sent = runBodies[0]!;
      expect(sent.currentPrompt).toContain(draft);
      expect(sent.attachmentPaths).toHaveLength(1);
      expect(basename(sent.attachmentPaths[0]!)).toBe(attachmentName);
      expect(sent.projectId).toEqual(expect.any(String));
      if (surface === 'project') expect(sent.projectId).toBe(projectId);
      expect(requests.filter(item => item.method === 'POST' && item.path === '/api/runs')[0]?.workspaceId)
        .toBe(space.workspaceId);
      const terminal = await terminalRun(body.runId!, ['succeeded', 'failed', 'canceled']);
      expect(terminal.status).toBe('succeeded');
      await save('RUN003-manual-only-complete.safe.json', { binding, noAutomaticSend: true,
        manualRunId: body.runId, manualTerminal: terminal, sent, requests, runResponses });
      return;
    }
    // For the balance cell, the independent controller depletes this owned
    // workspace only after the real background call is admitted and held.
    // Wait for the resulting production preflight, not a fixed startup delay.
    await expect.poll(async () => (await preflight()).fundingCheck,
      { timeout: T.xlong, intervals: [250, 500, 1000] })
      .toBe(gate === 'balance' ? 'insufficient' : 'available');
    // The independent AMR watcher reads this project's run inventory through
    // the same workspace identity before and after the blocked click.
    await marker('RUN003-ready.json', { projectId, draft, attachmentName,
      clientWebUrl: runtime.url.web('/') });
    const gateReady = await receipt('RUN003-gate-ready.json');
    expect(gateReady.backgroundRunId).toBe(binding.backgroundRunId);
    expect(gateReady.backgroundStatus).toBe('running');
    expect(gateReady.fundingCheck).toBe(gate === 'balance' ? 'insufficient' : 'available');
    expect(Number(gateReady.limit)).toBe(space.limit);
    if (gate === 'concurrency') {
      expect(Number(gateReady.running)).toBe(space.limit);
      const heldIds = gateReady.heldRequestIds as string[];
      expect(heldIds).toHaveLength(space.limit);
      expect(heldIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true);
      expect(new Set(heldIds).size).toBe(space.limit);
    } else {
      expect(Number(gateReady.running)).toBeLessThan(space.limit);
    }

    const browserVersion = page.context().browser()?.version() ?? null;
    const environment = await page.evaluate(async () => {
      const start = performance.now();
      const response = await fetch('/api/health', { cache: 'no-store' });
      return { userAgent: navigator.userAgent, healthStatus: response.status,
        sameOriginRttMs: performance.now() - start };
    });
    expect(browserVersion).toBeTruthy();
    expect(environment.healthStatus).toBe(200);
    // Both event times come from this page's monotonic clock. A post-rAF task
    // samples the laid-out notice after a render opportunity; Playwright's
    // click-return time and DOM insertion time are not presentation time.
    await page.evaluate(({ sendSelector, noticeSelector }) => {
      const state = { clickAt: null as number | null, visibleAt: null as number | null,
        noticeText: null as string | null, timeOrigin: performance.timeOrigin };
      window.__odRun003Paint = state;
      const visible = (element: HTMLElement): boolean => {
        if (element.getClientRects().length === 0) return false;
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility !== 'visible'
            || Number(style.opacity) <= 0 || node.inert || node.getAttribute('aria-hidden') === 'true') return false;
        }
        return true;
      };
      const sampleAfterFrame = () => {
        if (state.clickAt === null || state.visibleAt !== null) return;
        const node = document.querySelector<HTMLElement>(noticeSelector);
        if (node && visible(node) && node.innerText.trim()) {
          state.visibleAt = performance.now();
          state.noticeText = node.innerText;
          return;
        }
        if (performance.now() - state.clickAt < 20_000) requestAnimationFrame(() => {
          setTimeout(sampleAfterFrame, 0);
        });
      };
      document.addEventListener('click', event => {
        const target = event.target as Element | null;
        if (state.clickAt === null && target?.closest(sendSelector)) {
          state.clickAt = performance.now();
          requestAnimationFrame(() => { setTimeout(sampleAfterFrame, 0); });
        }
      }, true);
    }, { sendSelector: surface === 'home' ? '[data-testid="home-hero-submit"]' : '[data-testid="chat-send"]',
      noticeSelector: NOTICE_SELECTOR[gate] });
    const before = postCount();
    await send.click();
    await expect(notice).toBeVisible({ timeout: T.long });
    await expect.poll(() => page.evaluate(() => window.__odRun003Paint?.visibleAt ?? null),
      { timeout: T.long }).not.toBeNull();
    const paint = await page.evaluate(() => window.__odRun003Paint);
    expect(paint?.clickAt).toEqual(expect.any(Number));
    expect(paint?.visibleAt).toEqual(expect.any(Number));
    const elapsedMs = paint!.visibleAt! - paint!.clickAt!;
    expect(elapsedMs).toBeGreaterThanOrEqual(0);
    expect(elapsedMs, 'browser click to first visible notice must be <=500ms').toBeLessThanOrEqual(500);
    await assertRetained();
    const blockedPosts = postCount() - before;
    expect(blockedPosts, 'a blocked send must not create an OD run').toBe(0);
    expect(runResponses).toHaveLength(0);
    expect(runBodies).toHaveLength(0);
    await page.screenshot({ path: join(output, 'RUN003-blocked.png') });
    await save('RUN003-paint.safe.json', { binding, paint, elapsedMs, browserVersion,
      environment, blockedPosts, requests, gateReady });
    await marker('RUN003-blocked.json', { projectId, paint, elapsedMs, blockedPosts });
    const blocked = await receipt('RUN003-blocked-verified.json');
    expect(blocked.backgroundRunId).toBe(binding.backgroundRunId);
    expect(blocked.backgroundStatus).toBe('running');
    expect(Number(blocked.newProviderCalls)).toBe(0);
    expect(Number(blocked.newRunCount)).toBe(0);
    expect(Number(blocked.newUsageCount)).toBe(0);
    expect(Number(blocked.newCreditUsageCount)).toBe(0);
    expect(blocked.runId).toBeNull();
    if (gate === 'concurrency') {
      expect((blocked.heldRequestIds as string[]).slice().sort())
        .toEqual((gateReady.heldRequestIds as string[]).slice().sort());
    }
    await assertRetained();

    await page.context().setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await marker('RUN003-offline-ready.json', { projectId, blockedRunId: null });
    const recovered = await receipt('RUN003-recovered.json');
    expect(recovered.backgroundRunId).toBe(binding.backgroundRunId);
    expect(recovered.backgroundStatus).toBe('running');
    expect(recovered.fundingCheck).toBe('available');
    if (gate === 'concurrency') {
      const released = recovered.releasedRequestIds as string[];
      // One OD task starts auxiliary and primary model requests concurrently.
      // The Link limit is per request, so restore enough slots for both.
      expect(released).toHaveLength(2);
      expect(Number(recovered.running)).toBe(space.limit - released.length);
      for (const id of released) expect(gateReady.heldRequestIds as string[]).toContain(id);
      expect((recovered.remainingHeldRequestIds as string[]).slice().sort()).toEqual(
        (gateReady.heldRequestIds as string[])
          .filter(id => !released.includes(id)).sort());
    }
    expect(postCount()).toBe(before + blockedPosts);
    await page.context().setOffline(false);
    expect(await page.evaluate(() => navigator.onLine)).toBe(true);
    expect((await preflight()).fundingCheck).toBe('available');
    await page.evaluate(() => window.dispatchEvent(new Event('od:workspace-billing-refresh')));
    const idleStart = new Date().toISOString();
    const automatic = await page.waitForEvent('request', { predicate: request =>
      request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs',
    timeout: 5000 }).catch(() => null);
    expect(automatic).toBeNull();
    expect(postCount()).toBe(before + blockedPosts);
    await assertRetained();
    await page.screenshot({ path: join(output, 'RUN003-recovered-no-click.png') });
    await save('RUN003-recovered-no-click.safe.json', { binding, idleStart,
      observedAt: new Date().toISOString(), recovered, requests });

    if (gate === 'balance') await page.getByTestId('amr-balance-dialog')
      .getByRole('button', { name: /暂不|稍后|not now|later/i }).click();
    else await page.getByTestId('amr-concurrency-close').click();
    await assertRetained();
    await assertBrowserSelection();
    await marker('RUN003-manual-prepare.json', { projectId, draft, attachmentName });
    const ledgerReady = await receipt('RUN003-manual-ledger-ready.json');
    expect(ledgerReady.backgroundRunId).toBe(binding.backgroundRunId);
    expect(ledgerReady.backgroundStatus).toBe('running');
    expect(ledgerReady.workspaceId).toBe(space.workspaceId);
    const responseReady = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
    await send.click();
    const response = await responseReady;
    expect(response.status()).toBe(202);
    const body = await response.json() as { runId?: string };
    expect(body.runId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.runId).not.toBe(binding.backgroundRunId);
    expect(postCount()).toBe(before + blockedPosts + 1);
    await expect.poll(() => runResponses.length, { timeout: T.long }).toBe(1);
    expect(runResponses).toEqual([{ status: 202, runId: body.runId }]);
    expect(runBodies).toHaveLength(1);
    const sent = runBodies[0]!;
    expect(sent.currentPrompt).toContain(draft);
    expect(sent.attachmentPaths).toHaveLength(1);
    const attachmentPath = sent.attachmentPaths[0]!;
    expect(attachmentPath.length).toBeGreaterThan(0);
    expect(attachmentPath).not.toMatch(/^(?:\/|\.\.?\/)/);
    expect(basename(attachmentPath)).toBe(attachmentName);
    expect(sent.projectId).toEqual(expect.any(String));
    if (surface === 'project') expect(sent.projectId).toBe(projectId);
    expect(sent.conversationId).toEqual(expect.any(String));
    expect(sent.userMessageId).toEqual(expect.any(String));
    const manualRequest = requests.filter(item => item.method === 'POST' && item.path === '/api/runs').at(-1);
    expect(manualRequest?.workspaceId).toBe(space.workspaceId);
    await expect.poll(async () => {
      const url = runtime.url.web('/api/projects/' + encodeURIComponent(sent.projectId!)
        + '/conversations/' + encodeURIComponent(sent.conversationId!) + '/messages');
      const readback = await fetch(url, { headers });
      if (!readback.ok) return null;
      const rows = await readback.json() as { messages?: Array<Record<string, unknown>> };
      const message = rows.messages?.find(row => row.id === sent.userMessageId);
      return message ? { content: message.content, attachments: message.attachments,
        attachmentCount: Array.isArray(message.attachments) ? message.attachments.length : -1 } : null;
    }, { timeout: T.long, intervals: [250, 500, 1000] }).toMatchObject({
      content: draft, attachmentCount: 1,
      attachments: [{ path: attachmentPath, name: attachmentName, kind: 'file', order: 0 }],
    });
    const manualTerminal = await terminalRun(body.runId!, ['succeeded', 'failed', 'canceled']);
    expect(manualTerminal.status).toBe('succeeded');
    await marker('RUN003-manual-ready.json', { projectId, runId: body.runId,
      status: response.status(), terminal: { status: manualTerminal.status,
        exitCode: manualTerminal.exitCode, acpEvidence: manualTerminal.acpEvidence },
      backgroundRunId: binding.backgroundRunId });
    const manual = await receipt('RUN003-manual-verified.json');
    expect(manual.runId).toBe(body.runId);
    expect(manual.billingWorkspaceId).toBe(space.workspaceId);
    expect(manual.runTerminalStatus).toBe('succeeded');
    expect(manual.backgroundRunId).toBe(binding.backgroundRunId);
    expect(manual.backgroundStatus).toBe('running');
    expect(Number(manual.targetSuccessfulUpstreamCount)).toBeGreaterThan(0);
    expect(Number(manual.unsettledSuccessfulCallCount)).toBe(0);
    expect(Number(manual.unmatchedChargeCount)).toBe(0);
    const calls = manual.chargeableCalls as Array<{
      canonicalRequestId: string; usageId: string; chargedWorkspaceId: string;
    }>;
    expect(Array.isArray(calls) && calls.length > 0).toBe(true);
    expect(calls).toHaveLength(Number(manual.targetUsageCount) + Number(manual.auxiliaryUsageCount));
    expect(new Set(calls.map(call => call.canonicalRequestId)).size).toBe(calls.length);
    expect(new Set(calls.map(call => call.usageId)).size).toBe(calls.length);
    for (const call of calls) {
      expect(call.canonicalRequestId.length).toBeGreaterThan(0);
      expect(call.usageId.length).toBeGreaterThan(0);
      expect(call.chargedWorkspaceId).toBe(space.workspaceId);
    }
    expect(postCount()).toBe(before + blockedPosts + 1);
    await save('RUN003-complete.safe.json', { binding, elapsedMs, blocked, recovered,
      manual, ledgerReady, manualTerminal: { status: manualTerminal.status,
        exitCode: manualTerminal.exitCode, acpEvidence: manualTerminal.acpEvidence },
      sent, requests, runResponses });
  } finally {
    await save('RUN003-request-timeline.safe.json', { binding, requests, runResponses });
    await page.close().catch(() => undefined);
    if (started) await runtime.stopWeb(env);
    await info.attach('owned-runtime-stopped', { body: JSON.stringify(await runtime.status(env)),
      contentType: 'application/json' });
  }
});
