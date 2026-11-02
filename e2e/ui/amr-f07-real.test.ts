import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { clusterTest as test, expect } from '@/playwright/suite';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { T } from '@/timeouts';

type Fixture = {
  prefix: string;
  actors: Record<string, { userId: string; email: string; controlKey: string; runtimeKey: string; memberId: string }>;
  spaces: Record<string, { workspaceId: string; tier: string }>;
  urls: { api: string; link: string; web: string };
};
const fixturePath = process.env.OD_F07_REAL_FIXTURE;
const fixture = fixturePath ? JSON.parse(await readFile(fixturePath, 'utf8')) as Fixture : null;
test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });

test('[P1] F07 Free Owner funding offer and manual recovery on Home and Project', async ({ page }, info) => {
  test.skip(!fixture, 'Requires an owned local AMR/Link fixture');
  test.setTimeout(T.xlong * 5);
  if (!fixture || !fixturePath || !process.env.OD_F07_DATABASE_URL) throw new Error('Owned fixture and isolated database URL required');
  if (((await stat(fixturePath)).mode & 0o077) !== 0) throw new Error('Fixture must be private');
  const actor = fixture.actors['free-owner'];
  const space = fixture.spaces.free;
  const velaBin = process.env.OD_F07_VELA_BIN;
  const opencodeBin = process.env.OD_F07_OPENCODE_BIN;
  if (!actor || !space || !velaBin || !opencodeBin) throw new Error('Incomplete Free Owner fixture');
  for (const id of [actor.userId, actor.memberId, space.workspaceId])
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid isolated fixture identifier');
  for (const endpoint of Object.values(fixture.urls))
    if (!['127.0.0.1', 'localhost'].includes(new URL(endpoint).hostname)) throw new Error('Non-local fixture endpoint');
  const namespace = `f07-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const suite = createToolsDevSuite({ root, namespace, ownerPid: process.pid,
    dataDir: join(scratch, 'data'), toolsDevRoot: join(scratch, 'tools-dev'), codexHomeDir: join(scratch, 'codex-home') });
  const amrHome = join(scratch, 'amr-home');
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await mkdir(suite.dataDir, { recursive: true });
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
    controlKey: actor.controlKey, runtimeKey: actor.runtimeKey,
    apiUrl: fixture.urls.api, linkUrl: fixture.urls.link,
    user: { id: actor.userId, email: actor.email, name: 'F07 Free Owner' },
  } } }), { mode: 0o600 });
  const config = { privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false },
    mode: 'daemon', agentId: 'amr', model: 'deepseek-v4.1-flash', onboardingCompleted: true,
    agentModels: { amr: { model: 'deepseek-v4.1-flash' } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: velaBin } } };
  await writeFile(join(suite.dataDir, 'app-config.json'), JSON.stringify(config));
  const env = { AMR_HOME: amrHome, VELA_BIN: velaBin, VELA_PROFILE: 'local',
    OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: fixture.urls.api,
    VELA_LINK_URL: fixture.urls.link, VELA_CONTROL_KEY: actor.controlKey,
    VELA_OPENCODE_BIN: opencodeBin, OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
    OD_VELA_WEB_URL: fixture.urls.web, OD_COLLAB_TRANSPORT: 'off',
    OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
    OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' };
  const headers = { 'x-od-workspace-id': space.workspaceId,
    'x-od-workspace-member-id': actor.memberId,
    'x-od-workspace-role': 'owner', 'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-member-status': 'active' };
  const posts: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs') posts.push(request.url());
  });
  let started = false;
  try {
    await suite.startWeb(env); started = true;
    await warmPlaywrightWebRuntime(suite.url.web('/'));
    await warmPlaywrightDaemonRuntime(suite.url.daemon('/api/health'));
    const projectId = `f07-${randomUUID()}`;
    const project = await fetch(suite.url.web('/api/projects'), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'F07 existing output', metadata: { kind: 'prototype' } }) });
    expect(project.ok, await project.text()).toBe(true);
    const artifact = '<!doctype html><html><body><h1>F07 existing output</h1></body></html>';
    const saved = await fetch(suite.url.web(`/api/projects/${projectId}/files`), { method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'existing-output.html', content: artifact, encoding: 'utf8' }) });
    expect(saved.ok, await saved.text()).toBe(true);
    await page.addInitScript(({ config, selection }) => {
      localStorage.setItem('open-design:config', JSON.stringify(config));
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify(selection));
    }, { config, selection: { workspaceId: space.workspaceId, workspaceMemberId: actor.memberId } });
    const expectedBenefits = [
      '无需复杂配置，海量 SOTA 模型任选',
      '邀请成员免费加入，共享额度',
      '支持多模态图像创作，图文一站生成',
      '作品一键发布上线，链接随时分享',
    ];
    for (const surface of ['home', 'project'] as const) {
      await page.goto(suite.url.web(surface === 'home' ? '/' : `/projects/${projectId}`), { waitUntil: 'domcontentloaded' });
      const input = page.getByTestId(surface === 'home' ? 'home-hero-input' : 'chat-composer-input');
      const send = page.getByTestId(surface === 'home' ? 'home-hero-submit' : 'chat-send');
      await expect(input).toBeVisible({ timeout: T.xlong });
      const draft = `F07 ${surface} retain original input`;
      await input.fill(draft);
      const prior = posts.length;
      await expect(send).toBeEnabled();
      await send.click();
      const dialog = page.getByTestId('amr-balance-dialog');
      await expect(dialog).toBeVisible({ timeout: T.long });
      await expect.poll(async () => (await dialog.boundingBox())?.width).toBe(480);
      await expect(dialog.locator('li')).toHaveText(expectedBenefits);
      await expect(dialog.locator('img')).toHaveAttribute('src', '/upgrade/cloud-signin-aurora.jpg');
      await dialog.locator('img').evaluate((image: HTMLImageElement) => image.decode());
      expect(await dialog.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(dialog.getByRole('button', { name: '暂不需要' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: '升级套餐' })).toBeVisible();
      await expect(input).toHaveText(draft);
      expect(posts).toHaveLength(prior);
      const file = await fetch(suite.url.web(`/api/projects/${projectId}/files/existing-output.html`), { headers });
      expect(file.ok).toBe(true);
      expect(await file.text()).toBe(artifact);
      await info.attach(`f07-${surface}-blocked`, { body: await page.screenshot(), contentType: 'image/png' });
      await dialog.getByRole('button', { name: '暂不需要' }).click();
      await expect(dialog).toBeHidden();
      await expect(input).toHaveText(draft);
      expect(posts).toHaveLength(prior);
    }
    const rechargeId = `f07-${randomUUID()}`;
    execFileSync('psql', [process.env.OD_F07_DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c',
      `insert into credit_recharges(id,app_user_id,amount,balance,source,source_id,idempotency_key,sponsor_workspace_id,sponsor_workspace_member_id,billing_scope_version)
       values('${rechargeId}','${actor.userId}',100000,100000,'manual','${rechargeId}','${rechargeId}','${space.workspaceId}','${actor.memberId}',2)`],
    { stdio: 'pipe', timeout: T.medium });
    const preflight = async () => {
      const response = await fetch(`${fixture.urls.api}/api/v1/workspaces/${space.workspaceId}/billing/preflight?modelId=deepseek-v4.1-flash`,
        { headers: { Cookie: process.env.OD_F07_OWNER_COOKIE ?? '' } });
      if (!response.ok) throw new Error(`Preflight HTTP ${response.status}`);
      return (await response.json()) as { fundingCheck?: string; preflight?: { fundingCheck?: string } };
    };
    await expect.poll(async () => {
      const value = await preflight();
      return value.preflight?.fundingCheck ?? value.fundingCheck;
    }, { timeout: T.long }).toBe('available');
    expect(posts).toHaveLength(0);
    await page.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded' });
    const input = page.getByTestId('home-hero-input');
    await expect(input).toBeVisible({ timeout: T.long });
    await input.fill('F07 manual send after funding restoration');
    const created = page.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
    await page.getByTestId('home-hero-submit').click();
    const response = await created;
    expect(response.status()).toBe(202);
    const body = await response.json() as { runId?: string; run?: { id?: string }; id?: string };
    const runId = body.runId ?? body.run?.id ?? body.id;
    expect(runId).toBeTruthy();
    expect(response.request().headers()['x-od-workspace-id']).toBe(space.workspaceId);
    expect(posts).toHaveLength(1);
    await info.attach('f07-manual-recovery', { body: JSON.stringify({ runId, workspaceId: space.workspaceId,
      fundingCheck: 'available', automaticRunCount: 0, manualRunCount: posts.length }), contentType: 'application/json' });
  } finally {
    await page.close().catch(() => undefined);
    if (started) await suite.stopWeb(env).catch(() => undefined);
    if (info.status === info.expectedStatus) await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});
