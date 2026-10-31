// RUN-004 opt-in browser witness for the five roles' real funding denial.
// The 0600 JSON fixture contains a zero-balance Free space, exhausted Go/Max
// plan windows, and Go Admin/Member identities in an owned local AMR sandbox.
// Set OD_RUN004_REAL_FIXTURE, OD_RUN004_VELA_BIN, and OD_RUN004_OPENCODE_BIN.
// Successful model completion, settlement, and disconnect recovery are separate.
import type { ChatRunCreateRequest } from '@open-design/contracts';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { T } from '@/timeouts';

type Actor = { userId: string; email: string; controlKey: string; runtimeKey: string; memberId: string };
type Space = { workspaceId: string; tier: string };
type Fixture = { prefix: string; actors: Record<string, Actor>; spaces: Record<string, Space>;
  urls: { api: string; link: string; web: string } };
const fixturePath = process.env.OD_RUN004_REAL_FIXTURE;
// An explicit owner-scoped sandbox fixture enables this live cross-layer witness.
// The standard UI suite skips it because CI has no AMR account or Link sandbox.
const fixture = fixturePath ? await loadFixture(fixturePath) : null;
const velaBin = process.env.OD_RUN004_VELA_BIN;
const opencodeBin = process.env.OD_RUN004_OPENCODE_BIN;

async function loadFixture(path: string): Promise<Fixture> {
  if (((await stat(path)).mode & 0o077) !== 0) throw new Error('RUN-004 fixture must be owner-only (0600)');
  const value = JSON.parse(await readFile(path, 'utf8')) as Fixture;
  for (const endpoint of Object.values(value.urls)) {
    const url = new URL(endpoint);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('RUN-004 fixture endpoints must be isolated loopback URLs');
  }
  return value;
}

const cases = [
  { role: 'free-owner', space: 'free', model: 'deepseek-v4.1-flash', kind: 'owner', cta: true },
  { role: 'go-owner', space: 'go', model: 'e2e-limit-model', kind: 'owner', cta: true },
  { role: 'max-owner', space: 'max', model: 'e2e-limit-model', kind: 'owner', cta: false },
  { role: 'admin', space: 'go', model: 'e2e-limit-model', kind: 'admin', cta: false },
  { role: 'member', space: 'go', model: 'e2e-limit-model', kind: 'member', cta: false },
] as const;

test.describe('RUN-004 real funding denial matrix', () => {
  test.skip(!fixturePath, 'Requires an explicit isolated RUN-004 fixture');
  for (const scenario of cases) {
    test(`[P0] RUN-004 real funding preflight ${scenario.role}`, async ({ page }, info) => {
      test.setTimeout(T.xlong * 3);
      if (!fixture || !velaBin || !opencodeBin) throw new Error('Complete owned fixture and Vela/OpenCode binaries required');
      const actor = fixture.actors[scenario.role];
      const space = fixture.spaces[scenario.space];
      if (!actor || !space) throw new Error(`Missing real fixture ${scenario.role}/${scenario.space}`);
      const namespace = `run004-${scenario.role}-${randomUUID().slice(0, 8)}`;
      const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
      const scratch = join(root, 'scratch');
      const suite = createToolsDevSuite({
        root, namespace, ownerPid: process.pid,
        dataDir: join(scratch, 'data'), toolsDevRoot: join(scratch, 'tools-dev'),
        codexHomeDir: join(scratch, 'codex-home'),
      });
      const amrHome = join(scratch, 'amr-home');
      await mkdir(amrHome, { recursive: true, mode: 0o700 });
      await mkdir(suite.dataDir, { recursive: true });
      await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
        controlKey: actor.controlKey, runtimeKey: actor.runtimeKey,
        apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
        user: { id: actor.userId, email: actor.email, name: `RUN004 ${scenario.role}` },
      } } }), { mode: 0o600 });
      const config = { privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false },
        mode: 'daemon', agentId: 'amr', model: scenario.model, onboardingCompleted: true,
        agentModels: { amr: { model: scenario.model } },
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: velaBin } } };
      await writeFile(join(suite.dataDir, 'app-config.json'), JSON.stringify(config));
      const env = { AMR_HOME: amrHome, VELA_BIN: velaBin, VELA_PROFILE: 'local',
        OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api,
        VELA_LINK_URL: fixture.urls.link, VELA_CONTROL_KEY: actor.controlKey,
        VELA_OPENCODE_BIN: opencodeBin, OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
        OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1',
        OD_VELA_WEB_URL: fixture.urls.web, OD_COLLAB_TRANSPORT: 'off',
        OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off' };
      const runPosts: Array<{ url: string; method: string }> = [];
      page.on('request', request => {
        if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs')
          runPosts.push({ url: request.url(), method: request.method() });
      });
      let started = false;
      try {
        await suite.startWeb(env);
        started = true;
        await warmPlaywrightWebRuntime(suite.url.web('/'));
        await warmPlaywrightDaemonRuntime(suite.url.daemon('/api/health'));
        const selection = { workspaceId: space.workspaceId, workspaceMemberId: actor.memberId };
        await page.addInitScript(({ config, selection }) => {
          localStorage.setItem('open-design:config', JSON.stringify(config));
          localStorage.setItem('open-design:locale', 'zh-CN');
          localStorage.setItem('open-design:locale-source', 'manual');
          sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(selection));
        }, { config, selection });
        await page.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded' });
        const input = page.getByTestId('home-hero-input');
        await expect(input).toBeVisible({ timeout: T.xlong });
        const draft = `RUN004 ${scenario.role} original draft ${fixture.prefix}`;
        await input.fill(draft);
        await expect(page.getByTestId('home-hero-submit')).toBeEnabled();
        await page.getByTestId('home-hero-submit').click();
        const modal = scenario.kind === 'owner'
          ? page.getByTestId('amr-balance-dialog')
          : page.getByRole('dialog', { name: '团队额度不足' });
        await expect(modal).toBeVisible({ timeout: T.xlong });
        await info.attach(`${scenario.role}-real-browser-denial`, { body: await page.screenshot(), contentType: 'image/png' });
        if (scenario.kind === 'owner') {
          await expect(modal).not.toContainText('自动充值');
          const plans = modal.getByTestId('amr-balance-dialog-plans');
          if (scenario.cta) {
            await expect(plans).toBeVisible();
            const popupPromise = page.waitForEvent('popup');
            await plans.click();
            const popup = await popupPromise;
            await expect.poll(() => popup.url()).toContain('billing=plan');
            expect(new URL(popup.url()).searchParams.get('workspaceId')).toBe(space.workspaceId);
            await info.attach(`${scenario.role}-plan-url`, { body: popup.url(), contentType: 'text/plain' });
            await popup.close();
          } else await expect(plans).toHaveCount(0);
        } else {
          await expect(modal).toContainText('联系团队空间所有者');
          await expect(modal.getByTestId('amr-balance-dialog-plans')).toHaveCount(0);
        }
        expect(runPosts, 'Denied send must not create a run').toHaveLength(0);
        await modal.getByRole('button', { name: /知道了|稍后|关闭/ }).first().click();
        await expect(modal).toBeHidden();
        await expect(input).toHaveText(draft);
        await info.attach(`${scenario.role}-real-browser-after-dismiss`, { body: await page.screenshot(), contentType: 'image/png' });
        await info.attach(`${scenario.role}-real-browser-observation`, { body: JSON.stringify({
          role: scenario.role, workspaceId: space.workspaceId, memberId: actor.memberId, model: scenario.model,
          planTier: space.tier, runPosts, draftPreserved: true, planCta: scenario.cta,
          runtime: { daemon: suite.daemonUrl, web: suite.webUrl },
        }, null, 2), contentType: 'application/json' });
      } finally {
        if (started) await suite.stopWeb(env).catch(() => undefined);
        if (info.status === info.expectedStatus) await rm(root, { recursive: true, force: true }).catch(() => undefined);
      }
    });
  }
});

// UISTATE-F10: four independent non-Owner spaces; RUN004 remains a separate
// previously qualified role-hint witness and is not re-executed by this lane.
type F10Fixture = {
  alias: string; cfg: { sourceRoot: string }; tuple: { odSha: string; amrSha: string };
  urls: { api: string; link: string; web: string };
  runtime: { velaBin: string; openCodeBin: string; velaSha256: string; openCodeSha256: string; modelId: string };
  fundingCases: Record<string, { workspaceId: string; tier: string; actors: Record<string, Actor & { deviceKeyId: string }> }>;
};
const f10Directory = process.env.OD_F10_FIXTURE_DIR;
const f10Cases = ['admin-home', 'admin-project', 'member-home', 'member-project'] as const;
test.describe('F10 real funding recovery', () => {
  test.skip(!f10Directory, 'Requires the owned F10 zero-wallet fixture');
  for (const name of f10Cases) test(`[P1] F10 real funding recovery ${name}`, async ({ page }, info) => {
    test.setTimeout(T.xlong * 4);
    if (!f10Directory) throw new Error('Owned F10 fixture required');
    const directory = resolve(f10Directory);
    const fixtureFile = join(directory, 'funding-ui-fixture.private.json');
    expect((await stat(fixtureFile)).mode & 0o077).toBe(0);
    const f = JSON.parse(await readFile(fixtureFile, 'utf8')) as F10Fixture;
    expect(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim()).toBe(f.tuple.odSha);
    for (const url of Object.values(f.urls)) expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
    expect(createHash('sha256').update(await readFile(f.runtime.velaBin)).digest('hex')).toBe(f.runtime.velaSha256);
    expect(createHash('sha256').update(await readFile(f.runtime.openCodeBin)).digest('hex')).toBe(f.runtime.openCodeSha256);
    const role = name.startsWith('admin') ? 'admin' : 'member';
    const surface = name.endsWith('home') ? 'home' : 'project';
    const space = f.fundingCases[name]; const actor = space?.actors[role];
    if (!space || !actor) throw new Error(`F10 exact role/space missing: ${name}`);
    const recovery = process.env.OD_F10_RECOVERY_CASE === name;
    const evidence = resolve(directory, '../evidence', `${name}${recovery ? '-manual-only' : ''}`);
    await mkdir(evidence, { recursive: true });
    const save = async (file: string, value: unknown) => writeFile(join(evidence, file), JSON.stringify(value, null, 2));
    const action = async (kind: 'fund' | 'audit' | 'resume', reference: string) => {
      const output = execFileSync('corepack', ['pnpm', '--dir', f.cfg.sourceRoot, '--filter', '@vela/api', 'exec', 'tsx',
        'test/e2e/phase1-od-funding-case.ts', directory, name, kind, reference], { env: process.env, timeout: T.xlong * 2, stdio: 'pipe' });
      await writeFile(join(evidence, `${kind}.stdout.private.log`), output);
      const result = JSON.parse(output.toString().trim().split('\n').at(-1) ?? '') as Record<string, unknown>;
      await save(`${kind}-result.safe.json`, result); return result;
    };
    const namespace = `f10-${name}-${randomUUID().slice(0, 8)}`;
    const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace); const scratch = join(root, 'scratch');
    const suite = createToolsDevSuite({ root, namespace, ownerPid: process.pid, dataDir: join(scratch, 'data'),
      toolsDevRoot: join(scratch, 'tools-dev'), codexHomeDir: join(scratch, 'codex-home') });
    const amrHome = join(scratch, 'amr-home');
    await mkdir(amrHome, { recursive: true, mode: 0o700 }); await mkdir(suite.dataDir, { recursive: true });
    await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: { controlKey: actor.controlKey,
      runtimeKey: actor.runtimeKey, apiUrl: f.urls.api, linkUrl: f.urls.link,
      user: { id: actor.userId, email: actor.email, name: `F10 ${role}` } } } }), { mode: 0o600 });
    const config = { privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false }, mode: 'daemon',
      agentId: 'amr', model: f.runtime.modelId, onboardingCompleted: true, agentModels: { amr: { model: f.runtime.modelId } },
      agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: f.runtime.velaBin } } };
    await writeFile(join(suite.dataDir, 'app-config.json'), JSON.stringify(config));
    const env = { AMR_HOME: amrHome, VELA_BIN: f.runtime.velaBin, VELA_OPENCODE_BIN: f.runtime.openCodeBin,
      VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: f.urls.api, VELA_LINK_URL: f.urls.link,
      VELA_CONTROL_KEY: actor.controlKey, OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: f.urls.web,
      OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
      OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' };
    const headers = { 'x-od-workspace-id': space.workspaceId, 'x-od-workspace-member-id': actor.memberId,
      'x-od-workspace-role': role, 'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-member-status': 'active' };
    let started = false; let succeeded = false;
    const posts: Array<{ workspaceId: string | null; body: ChatRunCreateRequest }> = [];
    page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs')
      posts.push({ workspaceId: request.headers()['x-od-workspace-id'] ?? null, body: request.postDataJSON() }); });
    const preflight = async () => {
      const url = new URL('/api/workspace/billing/preflight', suite.url.web('/'));
      url.search = new URLSearchParams({ scope: 'workspace', workspaceId: space.workspaceId, modelId: f.runtime.modelId }).toString();
      const response = await fetch(url, { headers }); expect(response.status).toBe(200);
      return (await response.json()).preflight as { fundingCheck: string; modelCovered: boolean; workspaceId: string; workspaceMemberId: string };
    };
    try {
      await suite.startWeb(env); started = true;
      await warmPlaywrightWebRuntime(suite.url.web('/')); await warmPlaywrightDaemonRuntime(suite.url.daemon('/api/health'));
      const context = await (await fetch(suite.url.web('/api/workspace/context'), { headers })).json();
      expect(context.context).toMatchObject({ workspaceId: space.workspaceId, workspaceMemberId: actor.memberId, role });
      const initial = await preflight(); expect(initial).toMatchObject({ fundingCheck: recovery ? 'available' : 'insufficient', modelCovered: false,
        workspaceId: space.workspaceId, workspaceMemberId: actor.memberId }); await save('initial-preflight.safe.json', initial);
      const projectId = `f10-${randomUUID()}`; const artifactName = 'existing-f10-output.html';
      const artifact = '<!doctype html><html><body><h1>Existing F10 output survives</h1></body></html>';
      const created = await fetch(suite.url.web('/api/projects'), { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ id: projectId, name: 'F10 preserved project', metadata: { kind: 'prototype' } }) });
      expect(created.ok, await created.text()).toBe(true);
      const stored = await fetch(suite.url.web(`/api/projects/${projectId}/files`), { method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ name: artifactName, content: artifact, encoding: 'utf8' }) });
      expect(stored.ok, await stored.text()).toBe(true);
      await page.addInitScript(({ config, selection }) => { localStorage.setItem('open-design:config', JSON.stringify(config));
        localStorage.setItem('open-design:locale', 'zh-CN'); localStorage.setItem('open-design:locale-source', 'manual');
        sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(selection)); },
      { config, selection: { workspaceId: space.workspaceId, workspaceMemberId: actor.memberId } });
      const route = surface === 'home' ? '/' : `/projects/${projectId}`;
      await page.goto(suite.url.web(route), { waitUntil: 'domcontentloaded' });
      const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
      const send = page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send');
      const staged = page.getByTestId(surface === 'home' ? 'home-hero-staged-files' : 'staged-attachments');
      await expect(input).toBeVisible({ timeout: T.xlong });
      if (surface === 'project') await expect(page.frameLocator('[data-testid="artifact-preview-frame"]')
        .getByRole('heading', { name: 'Existing F10 output survives' })).toBeVisible({ timeout: T.long });
      const challengeId = `f10-${name}-${randomUUID()}`;
      const draft = `QA:${JSON.stringify({ id: challengeId, tokens: 1000 })} Reply OK only.`;
      await input.fill(draft);
      const uploaded = surface === 'project' ? page.waitForResponse(r => r.request().method() === 'POST'
        && new URL(r.url()).pathname.endsWith(`/projects/${projectId}/upload`)) : null;
      await page.getByTestId(surface === 'home' ? 'home-hero-file-input' : 'chat-file-input')
        .setInputFiles({ name: 'f10-original-brief.txt', mimeType: 'text/plain', buffer: Buffer.from('Original F10 attachment') });
      if (uploaded) expect((await uploaded).ok()).toBe(true);
      await expect(staged).toContainText('f10-original-brief.txt');
      const retainedRoute = new URL(page.url()).pathname;
      if (surface === 'project') expect(retainedRoute).toContain(`/projects/${projectId}`);
      const retained = async () => { await expect(input).toHaveText(draft); await expect(staged).toContainText('f10-original-brief.txt');
        const r = await fetch(suite.url.web(`/api/projects/${projectId}/files/${artifactName}`), { headers });
        expect(r.ok && await r.text() === artifact).toBe(true); expect(new URL(page.url()).pathname).toBe(retainedRoute); };
      if (!recovery) {
      await send.click(); const modal = page.getByRole('dialog', { name: '团队额度不足', exact: true });
      await expect(modal).toBeVisible({ timeout: T.long }); await retained();
      await expect.poll(async () => (await modal.boundingBox())?.width).toBe(480);
      await expect(modal).toContainText('当前团队额度不足，请联系团队空间所有者充值或升级订阅。');
      await expect(modal.locator('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
      await expect.poll(() => modal.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
      expect((await modal.getByRole('button').allTextContents()).map(s => s.trim()).filter(Boolean)).toEqual(['知道了']);
      expect(posts).toHaveLength(0); await page.mouse.move(0, 0); await page.evaluate(() => document.fonts.ready);
      await modal.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(a => a.finished.catch(() => undefined))); });
      await modal.screenshot({ path: join(evidence, 'dialog-default.png') }); await page.screenshot({ path: join(evidence, 'blocked.png') });
      await modal.getByRole('button', { name: '知道了', exact: true }).click(); await expect(modal).toBeHidden(); await retained();
      await action('fund', challengeId);
      } else {
        const proof = JSON.parse(await readFile(join(directory, `${name}-tool-cancel-proof.private.json`), 'utf8')) as { originalRunId: string };
        const guard = await action('resume', proof.originalRunId); expect(guard.resumeAllowed).toBe(true);
      }
      await expect.poll(async () => (await preflight()).fundingCheck, { timeout: T.long }).toBe('available');
      // Observe the real cross-process recovery without injecting a UI refresh
      // or auto-send. Only the subsequent explicit click may create a run.
      const automatic = await page.waitForEvent('request', { predicate: r => r.method() === 'POST'
        && new URL(r.url()).pathname === '/api/runs', timeout: T.short }).catch(() => null);
      expect(automatic).toBeNull(); expect(posts).toHaveLength(0); await retained();
      await page.screenshot({ path: join(evidence, 'funded-no-click.png') });
      const accepted = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/runs');
      await send.click(); const response = await accepted; expect(response.status()).toBe(202);
      const run = await response.json() as { runId: string }; expect(posts).toHaveLength(1);
      expect(posts[0]?.workspaceId).toBe(space.workspaceId); expect(posts[0]?.body.currentPrompt).toContain(draft);
      expect(posts[0]?.body.attachments).toHaveLength(1);
      expect(basename(posts[0]?.body.attachments?.[0] ?? '')).toBe('f10-original-brief.txt');
      if (surface === 'project') expect(posts[0]?.body.projectId).toBe(projectId);
      let terminal = ''; await expect.poll(async () => { const r = await fetch(suite.url.web(`/api/runs/${run.runId}`));
        expect(r.status).toBe(200); terminal = (await r.json()).status; return ['succeeded','failed','canceled','error'].includes(terminal);
      }, { timeout: T.xlong }).toBe(true); expect(terminal).toBe('succeeded');
      const audit = await action('audit', run.runId); expect(audit.status).toBe('passed');
      await page.screenshot({ path: join(evidence, 'manual-succeeded.png') });
      const result = { case: 'client:UISTATE-F10-CLIENT', name, role, surface, tuple: f.tuple, status: 'passed', runId: run.runId,
        noAutoSend: true, manualPostsInThisExecution: posts.length, totalManualActionsAcrossToolRecovery: recovery ? 2 : 1, recoveryMode: recovery, terminal, audit, restoration: 'Owner-scoped production grant writer and transactional event; controlled checkout identity, no Stripe payment claim' };
      await save('result.safe.json', result); await info.attach('F10-result', { body: JSON.stringify(result), contentType: 'application/json' }); succeeded = true;
    } finally {
      await save('request-summary.safe.json', { posts, role, surface, workspaceId: space.workspaceId });
      await page.context().close().catch(() => undefined); if (started) await suite.stopWeb(env).catch(() => undefined);
      if (succeeded) await rm(root, { recursive: true, force: true });
    }
  });
});
