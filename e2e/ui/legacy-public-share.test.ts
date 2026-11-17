import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import type { WorkspaceProjectSummary } from '@open-design/contracts';
import { clusterTest as test, expect } from '@/playwright/suite';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';
import { applyStorageConfig, routeMockAgents, suppressWhatsNew } from '@/playwright/mock-factory';
import { createToolsDevSuite, e2eWorkspaceRoot } from '@/tools-dev/runtime';
import { warmPlaywrightDaemonRuntime, warmPlaywrightWebRuntime } from '@/playwright/runtime-lifecycle';
import { T } from '@/timeouts';

const OWNER = { controlKey: 'legacy-e2e-owner-key', memberId: 'legacy-owner', name: 'Legacy Owner', role: 'owner' as const };
const WORKSPACE = 'legacy-personal';
const HEADERS = { 'x-od-workspace-id': WORKSPACE, 'x-od-workspace-member-id': OWNER.memberId, 'x-od-workspace-type': 'personal' };

/** Production web/daemon/SQLite and CLI subprocesses; only external Vela is a local service double. */
test('[P0] OPEND-4615 signed-out legacy draft survives login and publishes through the real UI', async ({ browser }, info) => {
  test.setTimeout(T.xlong * 6);
  const root = join(e2eWorkspaceRoot(), '.tmp', 'e2e', `legacy-share-${randomUUID()}`);
  const scratch = join(root, 'scratch');
  await mkdir(scratch, { recursive: true });
  const hub = await startFakeCollabHub({ root: join(scratch, 'hub'), workspaceId: WORKSPACE,
    workspaceName: 'Legacy personal workspace', workspaceType: 'personal', clients: [OWNER] });
  const velaBin = await hub.writeVelaBin(join(scratch, 'vela'), OWNER);
  const runtime = createToolsDevSuite({ root, namespace: `legacy-share-${randomUUID().slice(0, 8)}`,
    dataDir: join(scratch, 'data'), toolsDevRoot: join(scratch, 'tools-dev'), codexHomeDir: join(scratch, 'codex-home'), ownerPid: process.pid });
  const env = { AMR_HOME: join(scratch, 'amr-home'), VELA_BIN: velaBin, VELA_API_URL: hub.url,
    VELA_LINK_URL: hub.url, VELA_CONTROL_KEY: undefined, VELA_RUNTIME_KEY: undefined,
    VELA_PROFILE: 'local', OPEN_DESIGN_AMR_PROFILE: 'local', OPEN_DESIGN_VELA_TELEMETRY: 'off',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela', OD_COLLAB_TRANSPORT: 'vela-cli',
    OD_RESOURCE_TRANSPORT: 'vela-cli', OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli' };
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  let completed = false;
  const evidence: Record<string, unknown> = { boundary: 'real browser, Next web, daemon, SQLite, CLI; local fake external Vela service', root };
  try {
    await runtime.startWeb(env);
    await Promise.all([warmPlaywrightWebRuntime(runtime.url.web()), warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'))]);
    evidence.runtime = await runtime.status(env);
    const api = context.request;
    const request = async (method: 'get' | 'post' | 'put', path: string, options: Parameters<APIRequestContext['post']>[1] = {}) => {
      const response = await api[method](new URL(path, runtime.url.web()).toString(), options);
      expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
      return response.json();
    };
    await request('put', '/api/app-config', { data: { onboardingCompleted: true, agentId: 'mock', privacyDecisionAt: 1,
      telemetry: { metrics: false, content: false, artifactManifest: false } } });
    const id = randomUUID();
    const content = '<!doctype html><html><body><h1>Historical project before sign-in</h1><p>Preserve these original bytes.</p></body></html>';
    await test.step('create an actual signed-out unbound project and file over HTTP', async () => {
      expect((await request('get', '/api/integrations/vela/status')).loggedIn).toBe(false);
      await request('post', '/api/projects', { data: { id, name: 'OPEND-4615 historical draft', skillId: null,
        designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
      await request('post', `/api/projects/${id}/files`, { data: { name: 'index.html', content,
        artifactManifest: { version: 1, kind: 'html', title: 'Historical draft', entry: 'index.html', renderer: 'html', exports: ['html'] } } });
      expect((await request('get', `/api/projects/${id}/workspace-scope`)).scope.kind).toBe('unbound');
    });
    await test.step('complete the real daemon login handshake, then adopt via the real personal project list', async () => {
      await request('post', '/api/integrations/vela/login', { data: {} });
      await expect.poll(async () => (await request('get', '/api/integrations/vela/status')).loggedIn,
        { timeout: T.long, message: 'saved test credentials are accepted by the daemon login supervisor' }).toBe(true);
      await request('put', '/api/workspace/active', { data: { workspaceId: WORKSPACE, workspaceMemberId: OWNER.memberId } });
      const list = await request('get', `/api/workspaces/${WORKSPACE}/projects?view=all`, { headers: HEADERS });
      const legacy = list.projects.find((project: WorkspaceProjectSummary) => project.id === id);
      expect(legacy).toMatchObject({ visibility: 'personal', resourceState: 'active', createdByWorkspaceMemberId: null, syncState: 'local_only' });
      evidence.beforeShare = legacy;
    });
    await applyStorageConfig(page);
    await routeMockAgents(page);
    await suppressWhatsNew(page);
    await page.addInitScript(() => {
      localStorage.setItem('open-design:locale', 'en');
      localStorage.setItem('open-design:locale-source', 'manual');
    });
    let published!: { slug: string; url: string };
    await test.step('publish with the actual Share menu and verify uploaded source bytes', async () => {
      await page.goto(runtime.url.web(`/projects/${id}/files/index.html`));
      const shareButton = page.locator('.ws-tabs-file-actions').getByRole('button', { name: 'Share', exact: true });
      await expect(shareButton).toBeEnabled({ timeout: T.long });
      await shareButton.click();
      const menu = page.locator('.share-menu-popover');
      await expect(menu).toBeVisible();
      await page.screenshot({ path: info.outputPath('legacy-share-entry.png'), animations: 'disabled' });
      const responseReady = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === `/api/projects/${id}/files/index.html/publish-public`, { timeout: T.long });
      await menu.getByRole('menuitem', { name: /Generate and copy link/i }).click();
      const response = await responseReady;
      const result = await response.json();
      evidence.publication = { status: response.status(), body: result };
      expect(response.status(), JSON.stringify(result)).toBe(200);
      expect(result.status).toBe('published');
      published = { slug: result.receipt.slug, url: result.url };
      await expect(menu.locator('.chrome-publish-url')).toHaveText(result.url, { timeout: T.long });
      const bytes = await api.get(`${hub.url}/__e2e/public-files/${published.slug}`);
      expect(bytes.ok(), await bytes.text()).toBeTruthy();
      expect(await bytes.text()).toContain('Historical project before sign-in');
      expect(hub.commandLog.some(entry => entry.args[0] === 'resource' && entry.args[1] === 'push')).toBe(true);
      expect(hub.commandLog.some(entry => entry.args[0] === 'share' && entry.args[1] === 'publish')).toBe(true);
      await page.screenshot({ path: info.outputPath('legacy-share-published.png'), animations: 'disabled' });
    });
    await test.step('republish, stop and resume preserve ownership and the stable link', async () => {
      const endpoint = `/api/projects/${id}/files/index.html/publish-public`;
      const second = await request('post', endpoint, { headers: HEADERS });
      expect(second.receipt.slug).toBe(published.slug);
      const stopped = await api.delete(runtime.url.web(endpoint), { headers: HEADERS, data: { slug: published.slug } });
      expect(stopped.ok(), await stopped.text()).toBeTruthy();
      expect((await api.get(`${hub.url}/__e2e/public-files/${published.slug}`)).status()).toBe(404);
      const resumed = await request('post', endpoint, { headers: HEADERS, data: { mode: 'resume' } });
      expect(resumed.receipt.slug).toBe(published.slug);
      const list = await request('get', `/api/workspaces/${WORKSPACE}/projects?view=all`, { headers: HEADERS });
      const claimed = list.projects.find((project: WorkspaceProjectSummary) => project.id === id);
      expect(claimed.createdByWorkspaceMemberId).toBe(OWNER.memberId);
      await expect((await api.get(runtime.url.web(`/api/projects/${id}/raw/index.html`), { headers: HEADERS })).text()).resolves.toBe(content);
      evidence.afterShare = claimed;
    });
    await test.step('new signed-in projects retain their existing owner and publish normally', async () => {
      const newId = randomUUID();
      await request('post', '/api/projects', { headers: HEADERS, data: { id: newId, name: 'New owned draft',
        skillId: null, designSystemId: null, metadata: { kind: 'prototype', nameSource: 'user' } } });
      await request('post', `/api/projects/${newId}/files`, { headers: HEADERS, data: { name: 'index.html', content } });
      const list = await request('get', `/api/workspaces/${WORKSPACE}/projects?view=all`, { headers: HEADERS });
      expect(list.projects.find((project: WorkspaceProjectSummary) => project.id === newId).createdByWorkspaceMemberId).toBe(OWNER.memberId);
      const fresh = await request('post', `/api/projects/${newId}/files/index.html/publish-public`, { headers: HEADERS });
      expect(fresh.status).toBe('published');
      expect(fresh.receipt.slug).not.toBe(published.slug);
    });
    await test.step('a real runtime restart preserves repaired ownership, file contents and the public alias', async () => {
      await page.goto('about:blank');
      await runtime.stopWeb(env);
      await runtime.startWeb(env);
      await Promise.all([warmPlaywrightWebRuntime(runtime.url.web()), warmPlaywrightDaemonRuntime(runtime.url.daemon('/api/health'))]);
      expect((await request('get', '/api/integrations/vela/status')).loggedIn).toBe(true);
      const list = await request('get', `/api/workspaces/${WORKSPACE}/projects?view=all`, { headers: HEADERS });
      expect(list.projects.find((project: WorkspaceProjectSummary) => project.id === id).createdByWorkspaceMemberId).toBe(OWNER.memberId);
      await expect((await api.get(runtime.url.web(`/api/projects/${id}/raw/index.html`), { headers: HEADERS })).text()).resolves.toBe(content);
      const again = await request('post', `/api/projects/${id}/files/index.html/publish-public`, { headers: HEADERS });
      expect(again.receipt.slug).toBe(published.slug);
      expect(again.url).toBe(published.url);
      evidence.afterRestart = again;
    });
    await test.step('forged membership cannot publish or reach external upload', async () => {
      const start = hub.commandLog.length;
      const response = await api.post(runtime.url.web(`/api/projects/${id}/files/index.html/publish-public`), {
        headers: { ...HEADERS, 'x-od-workspace-member-id': 'other-member', 'x-od-workspace-role': 'owner' },
      });
      expect(response.status()).toBe(403);
      expect(hub.commandLog.slice(start).filter(entry => entry.args[0] === 'share' && entry.args[1] === 'publish'
        || entry.args[0] === 'resource' && entry.args[1] === 'push')).toHaveLength(0);
    });
    completed = true;
  } finally {
    evidence.commands = hub.commandLog;
    evidence.requests = hub.requestLog;
    await info.attach('legacy-share-evidence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    await writeFile(info.outputPath('legacy-share-evidence.json'), JSON.stringify(evidence, null, 2));
    await context.close();
    const logs = await runtime.logs(env).catch(() => null);
    if (logs) await info.attach('runtime-logs', { body: JSON.stringify(logs, null, 2), contentType: 'application/json' });
    await runtime.stopWeb(env);
    await hub.close();
    if (completed) await rm(root, { force: true, recursive: true });
  }
});
