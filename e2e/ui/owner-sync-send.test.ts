import { randomUUID } from 'node:crypto';
import { createCollabCluster, type CollabCluster } from '@/playwright/collab-cluster';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { clusterTest as test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';

test('[P1] OPEND-4492 owner replacement holds send until synchronization completes and keeps the unsent draft', async ({ browser }, testInfo) => {
  test.setTimeout(T.xlong);
  const workspaceId = 'ws-owner-sync-send';
  const owner = { controlKey: 'owner-sync-send-key', memberId: 'owner-sync-send', name: 'Owner', role: 'owner' as const };
  let holdPull = false;
  let pullStarted = false;
  let release!: () => void;
  const pullGate = new Promise<void>(resolve => { release = resolve; });
  let holdInitialPull = true;
  let initialPullStarted = false;
  let releaseInitial!: () => void;
  const initialPullGate = new Promise<void>(resolve => { releaseInitial = resolve; });
  const hub = await startFakeCollabHub({
    root: testInfo.outputPath('hub'), workspaceId, workspaceName: 'Owner sync', clients: [owner],
    beforeCommand: async ({ args }) => {
      const ownerDownload = args[0] === 'resource' && args[1] === 'pull' && args[2] === 'project';
      const firstDownload = args[0] === 'team-projects' && args[1] === 'pull' && !args.includes('--authorize-only');
      if (holdInitialPull && (ownerDownload || firstDownload) && args.some(arg => arg.includes('/b/scratch/'))) {
        initialPullStarted = true;
        await initialPullGate;
      }
      if (holdPull && ownerDownload) {
        pullStarted = true;
        await pullGate;
      }
    },
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('vela'));
  const env = { OD_COLLAB_TRANSPORT: 'vela-cli', OD_RESOURCE_TRANSPORT: 'vela-cli', OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli', OD_WORKSPACE_CONTEXT_SOURCE: 'vela', VELA_API_URL: hub.url, VELA_BIN: velaBin, VELA_CONTROL_KEY: owner.controlKey, AMR_HOME: testInfo.outputPath('empty-amr-home') };
  const headers = { 'x-od-workspace-id': workspaceId, 'x-od-workspace-member-id': owner.memberId, 'x-od-workspace-type': 'team', 'x-od-workspace-role': 'owner', 'x-od-workspace-member-status': 'active', 'x-od-workspace-lifecycle-state': 'active', 'x-od-workspace-can-share-projects': 'true', 'x-od-workspace-can-write-synced-files': 'true' };
  const id = randomUUID();
  let cluster: CollabCluster | undefined;
  let failed = false;
  try {
    cluster = await createCollabCluster(browser, testInfo, [{ id: 'a', env }, { id: 'b', env }]);
    const a = cluster.clients.a!.page;
    const b = cluster.clients.b!.page;
    let browserVersion = 0;
    b.on('response', async response => {
      if (new URL(response.url()).pathname === `/api/projects/${id}/collab/status` && response.ok()) {
        const body = await response.json().catch(() => null);
        browserVersion = body?.ownedContentUpdate?.latestVersion ?? browserVersion;
      }
    });
    await b.addInitScript(() => {
      localStorage.setItem('open-design:locale', 'zh-CN');
      localStorage.setItem('open-design:locale-source', 'manual');
    });
    for (const page of [a, b]) {
      await applyStandardMocks(page);
      const pin = await page.request.put('/api/workspace/active', { data: { workspaceId, workspaceMemberId: owner.memberId } });
      expect(pin.ok(), await pin.text()).toBeTruthy();
      await page.request.get(`/api/workspace/billing?scope=workspace&workspaceId=${workspaceId}`, { headers });
    }
    const created = await a.request.post('/api/projects', { headers, data: { id, name: 'Owner synchronization admission', skillId: null, designSystemId: null, metadata: { kind: 'prototype' } } });
    expect(created.ok(), await created.text()).toBeTruthy();
    async function write(content: string) {
      const response = await a.request.post(`/api/projects/${id}/files`, { headers, data: { name: 'index.html', content: `<!doctype html><html><body>${content}</body></html>` } });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await write('Initial content');
    const shared = await a.request.post(`/api/workspaces/${workspaceId}/projects/${id}/move`, { headers, data: { visibility: 'team' } });
    expect(shared.ok(), await shared.text()).toBeTruthy();
    // Sharing schedules the first upload; do not start the other install's
    // first download before the source has a durable published version.
    await expect.poll(async () => {
      const response = await a.request.get(`/api/projects/${id}/collab/status`, { headers });
      return (await response.json()).ownedContentUpdate?.localVersion ?? 0;
    }, { timeout: T.long }).toBeGreaterThan(0);
    const initialStatus = await b.request.get(`/api/projects/${id}/collab/status`, { headers });
    expect(initialStatus.ok(), await initialStatus.text()).toBeTruthy();
    await expect.poll(() => initialPullStarted, { timeout: T.long, message: 'first project download reaches the receiving daemon' }).toBe(true);
    await b.goto(`/projects/${id}/files/index.html`);
    const composer = b.getByTestId('chat-composer-input');
    const send = b.getByTestId('chat-send');
    const syncHint = '项目同步中，请稍后';
    await expect(composer).toHaveAttribute('aria-placeholder', syncHint);
    await expect(b.getByText(syncHint, { exact: true }).first()).toBeVisible();
    await expect(composer).toHaveAttribute('contenteditable', 'false');
    await expect(send).toBeDisabled();
    // The sync gate must look like the app's existing disabled controls,
    // rather than retaining the bright idle send mark.
    const disabledAppearance = await b.evaluate(() => {
      const reference = document.createElement('button');
      reference.disabled = true;
      document.body.appendChild(reference);
      try {
        const style = getComputedStyle(reference);
        return { background: style.backgroundColor, color: style.color, cursor: style.cursor };
      } finally { reference.remove(); }
    });
    await expect(send).toHaveCSS('background-color', disabledAppearance.background);
    await expect(send).toHaveCSS('color', disabledAppearance.color);
    await expect(send).toHaveCSS('cursor', disabledAppearance.cursor);
    await b.screenshot({ path: testInfo.outputPath('initial-project-sync-hint.png'), animations: 'disabled' });
    await testInfo.attach('Product-confirmed first-open synchronization hint', { path: testInfo.outputPath('initial-project-sync-hint.png'), contentType: 'image/png' });
    holdInitialPull = false;
    releaseInitial();
    await expect(composer).toHaveAttribute('contenteditable', 'true', { timeout: T.long });
    await expect(composer).not.toHaveAttribute('aria-placeholder', syncHint);
    await expect.poll(async () => (await b.request.get(`/api/projects/${id}/raw/index.html`, { headers })).text(), { timeout: T.long }).toContain('Initial content');
    let previousLocalVersion = 0;
    await expect.poll(async () => {
      const response = await a.request.get(`/api/projects/${id}/collab/status`, { headers });
      previousLocalVersion = (await response.json()).ownedContentUpdate?.localVersion ?? 0;
      return previousLocalVersion;
    }, { timeout: T.long }).toBeGreaterThan(0);
    const draft = 'Keep this draft while the cloud version replaces the files';
    await composer.fill(draft);
    await expect(send).toBeEnabled();
    await expect(send).not.toHaveCSS('background-color', disabledAppearance.background);
    const runs: string[] = [];
    b.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/runs') runs.push(request.url());
    });
    await write('Replacement content');
    // The file watcher schedules publication. Wait for its durable receipt;
    // an extra explicit flush can publish the same change twice and advance
    // the exact head while the confirmation is being accepted.
    let replacementVersion = previousLocalVersion;
    await expect.poll(async () => {
      const response = await a.request.get(`/api/projects/${id}/collab/status`, { headers });
      replacementVersion = (await response.json()).ownedContentUpdate?.localVersion ?? 0;
      return replacementVersion;
    }, { timeout: T.long }).toBeGreaterThan(previousLocalVersion);
    await expect.poll(async () => {
      const response = await b.request.get(`/api/projects/${id}/collab/status`, { headers });
      return (await response.json()).ownedContentUpdate?.latestVersion ?? 0;
    }, { timeout: T.long }).toBeGreaterThanOrEqual(replacementVersion);
    await expect.poll(() => browserVersion, { timeout: T.long, message: 'the rendered confirmation has consumed the new published head' }).toBeGreaterThanOrEqual(replacementVersion);
    const dialog = b.getByRole('alertdialog', { name: '其他设备有更新' });
    await expect(dialog).toBeVisible({ timeout: T.long });
    holdPull = true;
    const accepted = b.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/projects/${id}/collab/update`);
    await dialog.getByRole('button', { name: '同步并覆盖' }).click();
    await expect.poll(() => pullStarted, { timeout: T.medium, message: 'replacement reaches native resource download' }).toBe(true);
    await expect(dialog).toHaveCount(0, { timeout: T.long });
    const status = await b.request.get(`/api/projects/${id}/collab/status`, { headers });
    const during = (await status.json()).ownedContentUpdate;
    expect(during.state).toBe('downloading');
    await expect(b.getByTestId('owned-content-update').getByRole('button', { name: '正在同步…', exact: true })).toBeVisible();
    await expect(send).toBeDisabled();
    await expect(composer).toHaveAttribute('contenteditable', 'false');
    await expect(composer).toHaveAttribute('aria-placeholder', syncHint);
    await expect(composer).toHaveText(draft);
    await expect(send).toHaveCSS('background-color', disabledAppearance.background);
    await expect(send).toHaveCSS('color', disabledAppearance.color);
    await b.screenshot({ path: testInfo.outputPath('owner-sync-send-blocked.png'), animations: 'disabled' });
    await testInfo.attach('Sync holds send and preserves draft', { path: testInfo.outputPath('owner-sync-send-blocked.png'), contentType: 'image/png' });
    holdPull = false;
    release();
    const acceptedResponse = await accepted;
    expect(acceptedResponse.ok()).toBeTruthy();
    await testInfo.attach('Accepted content head response', { body: JSON.stringify({ status: acceptedResponse.status(), request: acceptedResponse.request().postData(), response: await acceptedResponse.json() }, null, 2), contentType: 'application/json' });
    await expect(send).toBeEnabled({ timeout: T.long });
    await expect(composer).toHaveText(draft);
    await expect(send).not.toHaveCSS('background-color', disabledAppearance.background);
    const content = await b.request.get(`/api/projects/${id}/raw/index.html`, { headers });
    expect(await content.text()).toContain('Replacement content');
    expect(runs).toEqual([]);
    const completed = await b.request.get(`/api/projects/${id}/collab/status`, { headers });
    const after = (await completed.json()).ownedContentUpdate;
    expect(after.state).toBe('up_to_date');
    expect(after.localVersion).toBe(after.latestVersion);
    await testInfo.attach('Owner sync admission evidence', {
      body: JSON.stringify({ projectId: id, workspaceId, during, after, unsentDraft: draft, runRequests: runs }, null, 2),
      contentType: 'application/json',
    });
    await b.screenshot({ path: testInfo.outputPath('owner-sync-send-restored.png'), animations: 'disabled' });
    await testInfo.attach('Sync completes without automatically sending the draft', { path: testInfo.outputPath('owner-sync-send-restored.png'), contentType: 'image/png' });
  } catch (error) { failed = true; throw error; }
  finally { releaseInitial(); release(); await cluster?.close({ preserve: failed }); await hub.close(); }
});
