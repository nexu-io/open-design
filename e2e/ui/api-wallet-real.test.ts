import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { clusterTest as test, expect } from '@/playwright/suite';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { createOwnWalletKeys, loadApiWalletFixture, readConsoleWallets, runApiWalletAction, walletEvidence } from '@/playwright/api-wallet-fixture';
import { T } from '@/timeouts';

const directory = process.env.OD_API001_FIXTURE_DIR;
test.use({ viewport: { width: 1280, height: 800 }, video: 'on' });
test('[P1] API-001 own API Key and real Open Design task share one wallet and retain actors', async ({ page, browser }, info) => {
  test.skip(!directory, 'Requires an owned isolated AMR API/Link/Web fixture');
  test.setTimeout(T.xlong * 6);
  if (!directory) throw new Error('API001 owned fixture directory required');
  const f = await loadApiWalletFixture(directory);
  const evidence = resolve(directory, '../evidence');
  await mkdir(evidence, { recursive: true });
  const runtime = JSON.parse(await readFile(resolve(directory, 'runtime.private.json'), 'utf8')) as { velaBin: string; velaSourceSha: string; velaSha256: string; opencodeBin: string; opencodeSha256: string };
  expect(runtime.velaSourceSha).toBe(f.tuple.amr);
  expect(createHash('sha256').update(await readFile(runtime.velaBin)).digest('hex')).toBe(runtime.velaSha256);
  expect(createHash('sha256').update(await readFile(runtime.opencodeBin)).digest('hex')).toBe(runtime.opencodeSha256);
  // Recovery may continue only when the owned fixture proves API $2 is the
  // sole positive call and the native client never reached the provider.
  if (process.env.OD_API001_RESUME_CLIENT === '1') runApiWalletAction(f, directory, 'resume-client');
  else {
    await createOwnWalletKeys(browser, f, directory, evidence, info);
    runApiWalletAction(f, directory, 'consume-api');
  }
  const namespace = `api001-${randomUUID().slice(0, 8)}`;
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
  const scratch = join(root, 'scratch');
  const suite = createToolsDevSuite({ root, namespace, ownerPid: process.pid, dataDir: join(scratch, 'data'), toolsDevRoot: join(scratch, 'tools-dev'), codexHomeDir: join(scratch, 'codex-home') });
  const amrHome = join(scratch, 'amr-home');
  await mkdir(amrHome, { recursive: true, mode: 0o700 });
  await mkdir(suite.dataDir, { recursive: true });
  const owner = f.actors.owner;
  await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: { controlKey: owner.controlKey, runtimeKey: owner.runtimeKey, apiUrl: f.cfg.urls.api, linkUrl: f.cfg.urls.link, user: { id: owner.userId, email: owner.email, name: 'API001 Owner' } } } }), { mode: 0o600 });
  const config = { privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false }, mode: 'daemon', agentId: 'amr', model: f.model, onboardingCompleted: true, agentModels: { amr: { model: f.model } }, agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: runtime.velaBin, VELA_OPENCODE_BIN: runtime.opencodeBin } } };
  await writeFile(join(suite.dataDir, 'app-config.json'), JSON.stringify(config));
  const env = { AMR_HOME: amrHome, VELA_BIN: runtime.velaBin, VELA_OPENCODE_BIN: runtime.opencodeBin, VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local', VELA_API_URL: f.cfg.urls.api, VELA_LINK_URL: f.cfg.urls.link, VELA_CONTROL_KEY: owner.controlKey, OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: f.cfg.urls.web, OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off', OPENCODE_DISABLE_DEFAULT_PLUGINS: '1', OPENCODE_DISABLE_EXTERNAL_SKILLS: '1' };
  let started = false;
  let succeeded = false;
  const posts: Array<{ workspaceId: string | undefined; status: number; runId: string }> = [];
  try {
    await suite.startWeb(env); started = true;
    await warmPlaywrightWebRuntime(suite.url.web('/'));
    await warmPlaywrightDaemonRuntime(suite.url.daemon('/api/health'));
    await page.addInitScript(({ config, workspaceId, workspaceMemberId }) => {
      localStorage.setItem('open-design:config', JSON.stringify(config));
      localStorage.setItem('open-design:locale', 'en');
      localStorage.setItem('open-design:locale-source', 'manual');
      sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId, workspaceMemberId }));
    }, { config, workspaceId: f.workspaceId, workspaceMemberId: f.ownerMemberId });
    page.on('response', async (response) => {
      if (response.request().method() !== 'POST' || new URL(response.url()).pathname !== '/api/runs') return;
      const body = await response.json() as { runId: string };
      posts.push({ workspaceId: response.request().headers()['x-od-workspace-id'], status: response.status(), runId: body.runId });
    });
    await page.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded' });
    const input = page.getByTestId('home-hero-input');
    await expect(input).toBeVisible({ timeout: T.xlong });
    const runs: Array<{ runId: string; projectId: string; terminal: string }> = [];
    for (const turn of [1, 2, 3]) {
      // Each native session makes a paid title ($0.01) and main ($0.99)
      // response at unchanged $4/$20 prices. Both are accounted in the audit.
      if (turn > 1) {
        await page.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded' });
        await expect(input).toBeVisible({ timeout: T.long });
      }
      const challenge = `QA:${JSON.stringify({ id: `api001-gui-${randomUUID()}`, tokens: 1, inputTokens: 145000, outputTokens: 20500 })} Reply exactly OK.`;
      await input.fill(challenge);
      const accepted = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/runs', { timeout: T.long });
      await page.getByTestId('home-hero-submit').click();
      const response = await accepted;
      expect(response.status()).toBe(202);
      const body = await response.json() as { runId: string };
      expect(body.runId).toBeTruthy();
      let terminal = '';
      let projectId = '';
      await expect.poll(async () => {
        const r = await fetch(suite.url.web(`/api/runs/${body.runId}`));
        expect(r.status).toBe(200);
        const state = await r.json() as { status: string; projectId: string };
        terminal = state.status;
        projectId = state.projectId;
        return ['succeeded', 'failed', 'canceled', 'error'].includes(terminal);
      }, { timeout: T.xlong }).toBe(true);
      expect(terminal).toBe('succeeded');
      expect(projectId).toBeTruthy();
      runs.push({ runId: body.runId, projectId, terminal });
      await walletEvidence(page, info, evidence, `api001-od-manual-turn-${turn}`);
    }
    expect(new Set(runs.map((run) => run.projectId)).size).toBe(3);
    await writeFile(resolve(directory, 'api001-od-runs.private.json'), JSON.stringify({ runs }, null, 2), { mode: 0o600 });
    runApiWalletAction(f, directory, 'audit');
    await page.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded' });
    await expect(input).toBeVisible({ timeout: T.long });
    await page.getByTestId('entry-top-right-credits').click();
    const panel = page.getByTestId('entry-top-right-credits-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('workspace-quota-skeleton')).toHaveCount(0, { timeout: T.long });
    await expect(panel.getByTestId('entry-nav-credits-row')).toContainText('$5.00', { timeout: T.long });
    await walletEvidence(page, info, evidence, 'api001-od-owner-wallet-five');
    await readConsoleWallets(browser, f, evidence, info);
    await expect.poll(() => posts.length).toBe(3);
    expect(posts).toEqual(runs.map((run) => ({ workspaceId: f.workspaceId, status: 202, runId: run.runId })));
    const result = { qa: 'client:API-001', status: 'passed', tuple: f.tuple, runs, manualRuns: posts.length, apiCredits: '20000', clientCredits: '30000', finalCredits: '50000', sourceBoundary: 'Actual API Key and actual OD GUI/Vela/Link; only provider and initial ten-dollar/projection Given controlled' };
    await writeFile(resolve(evidence, 'api001-browser.safe.json'), JSON.stringify(result, null, 2));
    await info.attach('api001-browser-result', { body: JSON.stringify(result), contentType: 'application/json' });
    succeeded = true;
  } finally {
    await page.context().close();
    if (started) await suite.stopWeb(env).catch(() => undefined);
    if (succeeded) await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});
