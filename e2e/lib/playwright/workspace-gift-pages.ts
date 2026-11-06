import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { basename, join } from 'node:path';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { seedCampaignDismissals } from './campaign-dismissals.ts';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from './runtime-lifecycle.ts';
import { createToolsDevSuite, e2eWorkspaceRoot } from '../tools-dev/runtime.ts';

// Local cross-repository evidence coordinator. AMR owns the funding fixture and
// signed provider callbacks; every balance below is read from running services.
type Handoff = {
  runId: string;
  alias: string;
  origin: string;
  linkUrl?: string;
  expectedBefore: string;
  expectedAfter: string;
  expiresAt: string;
  actor: {
    controlKey: string;
    runtimeKey: string;
    email: string;
    userId: string;
    workspace_id: string;
    member_id: string;
    sessionCookie: string;
  };
};
const money = (value: string) => `$${Number(value).toFixed(2)}`;
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

async function waitJson<T>(path: string, timeout = 600_000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { return JSON.parse(await readFile(path, 'utf8')) as T; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
    }
    await delay(200);
  }
  throw new Error(`funding coordinator: no completion file ${basename(path)}`);
}
async function publishMarker(path: string, marker: string) {
  const pending = `${path}.pending-${process.pid}`;
  await writeFile(pending, marker);
  await rename(pending, path);
}
async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>((done, fail) => server.close((error) => error ? fail(error) : done()));
  return address.port;
}
async function waitHttp(url: string, process: ChildProcess, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (process.exitCode != null) throw new Error(`AMR Vite exited ${process.exitCode}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; }
    catch { /* Vite is still starting. */ }
    await delay(200);
  }
  throw new Error('AMR Vite did not become ready');
}
async function closeChild(child: ChildProcess) {
  if (child.exitCode != null) return;
  const exited = new Promise<void>((done) => child.once('exit', () => done()));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(10_000)]);
  if (child.exitCode == null) child.kill('SIGKILL');
}
function cookies(header: string, url: string) {
  return header.split(';').map((piece) => piece.trim()).filter(Boolean).map((piece) => {
    const equals = piece.indexOf('=');
    assert(equals > 0, 'invalid session cookie fixture');
    return { name: piece.slice(0, equals), value: piece.slice(equals + 1), url, httpOnly: true, secure: false, sameSite: 'Lax' as const };
  });
}
async function openQuota(page: Page) {
  const button = page.getByTestId('entry-top-right-credits');
  await expect(button).toBeVisible({ timeout: 60_000 });
  const panel = page.getByTestId('entry-top-right-credits-panel');
  if (!await panel.isVisible()) await button.click();
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByTestId('workspace-quota-skeleton')).toHaveCount(0, { timeout: 30_000 });
  return panel;
}

export async function runWorkspaceGiftPages(input: { browser: Browser; handoffDir: string; velaBin: string; amrRoot: string; output: string; expectedOdSha: string }) {
  const { browser, handoffDir, velaBin, amrRoot, output, expectedOdSha } = input;
  await mkdir(output, { recursive: true });
  const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: e2eWorkspaceRoot(), encoding: 'utf8' }).trim();
  assert.equal(sourceSha, expectedOdSha, 'OD source must match the declared integration commit');
  const scriptHash = createHash('sha256').update(await readFile(import.meta.filename)).digest('hex');
  const first = await waitJson<Handoff>(join(handoffDir, 'plus.handoff.private.json'));
  assert.equal(first.alias, 'plus');
  assert.equal(typeof first.runId, 'string');
  assert(first.runId.length > 0, 'runId is mandatory');
  const vitePort = await availablePort();
  const webOrigin = `http://127.0.0.1:${vitePort}`;
  const viteLog = createWriteStream(join(handoffDir, 'browser-vite.private.log'));
  const vite = spawn('corepack', ['pnpm', 'exec', 'vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
    cwd: join(amrRoot, 'apps/web'),
    env: { ...process.env, VITE_API_PROXY_TARGET: first.origin, VITE_SEATS_PHASE1_UI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  vite.stdout?.pipe(viteLog);
  vite.stderr?.pipe(viteLog);
  try {
    await waitHttp(webOrigin, vite);
    for (const alias of ['plus', 'retained', 'giftOnly']) {
      const handoff = alias === 'plus' ? first : await waitJson<Handoff>(join(handoffDir, `${alias}.handoff.private.json`));
      assert.equal(handoff.runId, first.runId, 'handoff belongs to a different execution');
      assert.equal(handoff.alias, alias, 'handoff actor does not match its file');
      assert.equal(handoff.origin, first.origin, 'all actors must belong to the same live AMR test');
      const actor = handoff.actor;
      const namespace = `yang-funding-${alias.toLowerCase()}-${process.pid}`;
      const suiteRoot = join(e2eWorkspaceRoot(), '.tmp', 'e2e', namespace);
      const scratch = join(suiteRoot, 'scratch');
      const suite = createToolsDevSuite({
        root: suiteRoot, namespace, ownerPid: process.pid,
        dataDir: join(scratch, 'data'), toolsDevRoot: join(scratch, 'tools-dev'),
        codexHomeDir: join(scratch, 'codex-home'),
      });
      const amrHome = join(scratch, 'amr-home');
      await mkdir(amrHome, { recursive: true });
      await mkdir(suite.dataDir, { recursive: true });
      await writeFile(join(amrHome, 'config.json'), JSON.stringify({ profiles: { local: {
        controlKey: actor.controlKey, runtimeKey: actor.runtimeKey,
        apiUrl: handoff.origin, linkUrl: handoff.linkUrl ?? handoff.origin,
        user: { id: actor.userId, email: actor.email, name: 'Funding QA Owner' },
      } } }), { mode: 0o600 });
      const config = {
        privacyDecisionAt: 1, telemetry: { metrics: false, content: false, artifactManifest: false },
        mode: 'daemon', agentId: 'amr', model: 'gpt-5.6-sol', onboardingCompleted: true,
        agentModels: { amr: { model: 'gpt-5.6-sol' } },
        agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: 'local', VELA_BIN: velaBin } },
      };
      await writeFile(join(suite.dataDir, 'app-config.json'), JSON.stringify(config), { mode: 0o600 });
      const env = {
        AMR_HOME: amrHome, VELA_BIN: velaBin, VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local',
        VELA_API_URL: handoff.origin, VELA_LINK_URL: handoff.linkUrl ?? handoff.origin,
        VELA_CONTROL_KEY: actor.controlKey, OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_VELA_WEB_URL: webOrigin,
        OD_COLLAB_TRANSPORT: 'off', OD_RESOURCE_TRANSPORT: 'off', OD_TEAM_PROJECTS_TRANSPORT: 'off',
      };
      let webContext: BrowserContext | undefined;
      let odContext: BrowserContext | undefined;
      let webPage: Page | undefined;
      let odPage: Page | undefined;
      const requests: Array<{ surface: string; path: string; status: number; method: string }> = [];
      try {
        await suite.startWeb(env);
        await warmPlaywrightWebRuntime(suite.url.web('/'));
        await warmPlaywrightDaemonRuntime(suite.url.daemon('/api/health'));
        webContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
        await webContext.addCookies(cookies(actor.sessionCookie, webOrigin));
        webPage = await webContext.newPage();
        odContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US' });
        await seedCampaignDismissals(odContext);
        odPage = await odContext.newPage();
        for (const [surface, page] of [['web', webPage], ['od', odPage]] as const) {
          page.on('response', (response) => {
            const path = new URL(response.url()).pathname;
            if (path.includes('billing') || path.includes('workspace/context')) requests.push({ surface, path, status: response.status(), method: response.request().method() });
          });
        }
        await odPage.addInitScript(({ config, actor }) => {
          localStorage.setItem('open-design:config', JSON.stringify(config));
          localStorage.setItem('open-design:locale', 'en');
          localStorage.setItem('open-design:locale-source', 'manual');
          sessionStorage.setItem('od.workspaceSelection.v1', JSON.stringify({ workspaceId: actor.workspace_id, workspaceMemberId: actor.member_id }));
        }, { config, actor: { workspace_id: actor.workspace_id, member_id: actor.member_id } });
        await webPage.goto(`${webOrigin}/dashboard?workspaceId=${encodeURIComponent(actor.workspace_id)}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await odPage.goto(suite.url.web('/'), { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await expect(odPage.getByTestId('home-hero-input')).toBeVisible({ timeout: 90_000 });
        const beforePanel = await openQuota(odPage);
        const expectedPlan = alias === 'plus' ? 'Plus' : 'Free';
        await expect(webPage.getByRole('heading', { name: expectedPlan, exact: true })).toBeVisible();
        await expect(beforePanel.getByRole('img', { name: expectedPlan.toLowerCase(), exact: true })).toBeVisible();
        await expect(webPage.getByTestId('seats-wallet-total')).toHaveText(money(handoff.expectedBefore), { timeout: 60_000 });
        await expect(beforePanel.getByTestId('entry-nav-credits-row')).toContainText(money(handoff.expectedBefore), { timeout: 60_000 });
      const observedBefore = {
        web: await webPage.getByTestId('seats-wallet-total').innerText(),
        od: await beforePanel.getByTestId('entry-nav-credits-row').innerText(),
      };
        assert(Date.now() < Date.parse(handoff.expiresAt), `${alias} gift already expired before baseline capture`);
        await webPage.screenshot({ path: join(output, `${alias}-web-before.png`), fullPage: true });
        await odPage.screenshot({ path: join(output, `${alias}-od-before.png`), fullPage: true });
        const marker = (phase: 'ready' | 'before' | 'after') => JSON.stringify({ status: 'passed', runId: first.runId, alias, phase });
        await publishMarker(join(handoffDir, `${alias}.ready`), marker('ready'));
        await publishMarker(join(handoffDir, `${alias}.before.done`), marker('before'));
        const after = await waitJson<Record<string, unknown>>(join(handoffDir, `${alias}.after.private.json`));
        assert.equal(after.runId, first.runId, 'after result belongs to a different execution');
        assert.equal(after.alias, alias, 'after result belongs to a different actor');
        assert(Date.now() >= Date.parse(handoff.expiresAt), 'after signal preceded actual gift deadline');
        await webPage.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
        await odPage.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
        const afterPanel = await openQuota(odPage);
        await expect(webPage.getByRole('heading', { name: expectedPlan, exact: true })).toBeVisible();
        await expect(afterPanel.getByRole('img', { name: expectedPlan.toLowerCase(), exact: true })).toBeVisible();
        const rechargeButtons = webPage.getByRole('button', { name: 'Recharge', exact: true });
        const rechargeButtonCount = await rechargeButtons.count();
        // Free cannot start a recharge. Both an absent entry and an existing
        // disabled display preserve that confirmed behavior.
        if (alias !== 'plus') {
          for (let index = 0; index < rechargeButtonCount; index++) await expect(rechargeButtons.nth(index)).toBeDisabled();
        }
        await expect(webPage.getByTestId('seats-wallet-total')).toHaveText(money(handoff.expectedAfter), { timeout: 60_000 });
        await expect(afterPanel.getByTestId('entry-nav-credits-row')).toContainText(money(handoff.expectedAfter), { timeout: 60_000 });
      const observedAfter = {
        web: await webPage.getByTestId('seats-wallet-total').innerText(),
        od: await afterPanel.getByTestId('entry-nav-credits-row').innerText(),
      };
        await webPage.screenshot({ path: join(output, `${alias}-web-after.png`), fullPage: true });
        await odPage.screenshot({ path: join(output, `${alias}-od-after.png`), fullPage: true });
        await writeFile(join(handoffDir, `${alias}.browser.private.json`), JSON.stringify({ after, webText: await webPage.locator('body').innerText(), odText: await afterPanel.innerText() }, null, 2), { mode: 0o600 });
        await writeFile(join(output, `${alias}.safe.json`), JSON.stringify({
          status: 'passed', runId: first.runId, alias, odSha: sourceSha, scriptSha256: scriptHash,
          expectedBefore: handoff.expectedBefore, expectedAfter: handoff.expectedAfter,
        observedBefore, observedAfter,
          giftExpiresAt: handoff.expiresAt, requests,
          observedPlan: { before: expectedPlan, after: expectedPlan },
          afterFreeRechargeCannotActivate: alias === 'plus' ? null : true,
          afterRechargeButtonCount: rechargeButtonCount,
          screenshots: ['web-before', 'od-before', 'web-after', 'od-after'].map((name) => `${alias}-${name}.png`),
          scope: 'real Web and OD/daemon/CLI readback; local signed Stripe fixture upstream; no external payment',
        }, null, 2));
        await publishMarker(join(handoffDir, `${alias}.done`), marker('after'));
        console.log(JSON.stringify({ alias, status: 'passed', before: handoff.expectedBefore, after: handoff.expectedAfter }));
      } catch (error) {
        await webPage?.screenshot({ path: join(output, `${alias}-web-first-failure.png`), fullPage: true }).catch(() => {});
        await odPage?.screenshot({ path: join(output, `${alias}-od-first-failure.png`), fullPage: true }).catch(() => {});
        await writeFile(join(output, `${alias}-failure.safe.json`), JSON.stringify({ alias, status: 'failed', error: error instanceof Error ? error.message : String(error), requests }, null, 2));
        throw error;
      } finally {
        await odContext?.close();
        await webContext?.close();
        await suite.stopWeb(env);
      }
    }
  } finally {
    await closeChild(vite);
    viteLog.end();
  }
}
