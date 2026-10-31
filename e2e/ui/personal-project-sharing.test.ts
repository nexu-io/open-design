import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';

import { expect, clusterTest as test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';
import { createCollabCluster } from '@/playwright/collab-cluster';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';

const OWNER = {
  controlKey: 'personal-sharing-owner-key',
  memberId: 'personal-sharing-owner',
  name: 'Personal Sharing Owner',
  role: 'owner' as const,
};
const SECOND = {
  controlKey: 'personal-sharing-second-key',
  memberId: 'personal-sharing-second',
  name: 'Second Personal Owner',
  role: 'owner' as const,
};
const personalWorkspaceId = `personal-${OWNER.memberId}`;
const personalWorkspaceMemberId = `personal-member-${OWNER.memberId}`;
const personalHeaders = {
  'x-od-workspace-id': personalWorkspaceId,
  'x-od-workspace-type': 'personal',
  'x-od-workspace-member-id': personalWorkspaceMemberId,
  'x-od-workspace-role': 'owner',
  'x-od-workspace-member-status': 'active',
  'x-od-workspace-lifecycle-state': 'active',
  'x-od-workspace-can-share-projects': 'true',
  'x-od-workspace-can-write-synced-files': 'true',
};

test('[P1] Personal workspace owner keeps a moved project in Recent and Team while the catalog lags', async ({ browser }, testInfo) => {
  const projectId = randomUUID();
  const projectName = `Personal sharing browser ${projectId.slice(0, 8)}`;
  const hubRoot = testInfo.outputPath('personal-sharing-hub');
  await mkdir(hubRoot, { recursive: true });
  const hub = await startFakeCollabHub({
    root: hubRoot,
    workspaceId: 'personal-sharing-team-fixture',
    workspaceName: 'Unused team fixture',
    clients: [OWNER, SECOND],
    includePersonalWorkspace: true,
  });
  hub.setTeamProjectCatalogVisible(projectId, false);
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('fake-vela-personal-sharing'));
  const commonEnv = {
    OD_COLLAB_TRANSPORT: 'vela-cli',
    OD_RESOURCE_TRANSPORT: 'vela-cli',
    OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
    VELA_API_URL: hub.url,
    VELA_BIN: velaBin,
  };
  let cluster: Awaited<ReturnType<typeof createCollabCluster>> | undefined;
  let failed = false;
  try {
    cluster = await createCollabCluster(browser, testInfo, [
      { id: 'owner', env: { ...commonEnv, VELA_CONTROL_KEY: OWNER.controlKey } },
      { id: 'second', env: { ...commonEnv, VELA_CONTROL_KEY: SECOND.controlKey } },
    ]);
    const page = cluster.clients.owner!.page;
    await applyStandardMocks(page);
    await page.route('**/api/design-templates', (route) => route.fulfill({ json: { designTemplates: [] } }));
    await page.route('**/api/design-systems', (route) => route.fulfill({ json: { designSystems: [] } }));
    const active = await page.request.put('/api/workspace/active', {
      data: { workspaceId: personalWorkspaceId, workspaceMemberId: personalWorkspaceMemberId },
      timeout: T.long,
    });
    expect(active.ok(), `activate workspace: ${await active.text()}`).toBe(true);

    const created = await page.request.post('/api/projects', {
      headers: personalHeaders,
      data: {
        id: projectId,
        name: projectName,
        skillId: null,
        designSystemId: null,
        metadata: { kind: 'prototype', nameSource: 'user' },
      },
    });
    expect(created.ok(), `create project: ${await created.text()}`).toBe(true);
    for (let index = 0; index < 3; index += 1) {
      const extra = await page.request.post('/api/projects', {
        headers: personalHeaders,
        data: {
          id: randomUUID(),
          name: `Unmoved Personal project ${index + 1}`,
          skillId: null,
          designSystemId: null,
          metadata: { kind: 'prototype', nameSource: 'user' },
        },
      });
      expect(extra.ok(), await extra.text()).toBe(true);
    }

    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await ensureRailOpen(page);
    await page.getByTestId('entry-nav-drafts').click();

    const personalTab = page.getByTestId('recent-projects-collection-personalProjects');
    const teamTab = page.getByTestId('recent-projects-collection-teamProjects');
    const recentTab = page.getByTestId('recent-projects-collection-recent');
    const card = page.locator(`.recent-projects__card[data-project-id="${projectId}"]`);
    const cards = page.locator('.recent-projects__card:visible');
    await expect(teamTab).toBeVisible({ timeout: T.long });
    await personalTab.click();
    await expect(card).toBeVisible();
    await teamTab.click();
    await expect(card).toHaveCount(0);

    await personalTab.click();
    await card.getByRole('button', { name: 'More actions' }).click();
    await card.getByRole('menuitem', { name: 'Move to team space' }).click();
    const shareResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith(`/projects/${projectId}/move`),
    );
    const refreshedList = page.waitForResponse((response) =>
      response.request().method() === 'GET'
        && new URL(response.url()).pathname === `/api/workspaces/${personalWorkspaceId}/projects`,
    );
    await page.getByRole('alertdialog', { name: 'Move to team space' })
      .getByRole('button', { name: 'Confirm move' }).click();
    const shared = await shareResponse;
    expect(shared.ok(), `share: ${shared.status()} ${await shared.text()}`).toBe(true);
    expect((await refreshedList).ok()).toBe(true);

    await expect(card).toHaveCount(0);
    await expect(cards).toHaveCount(3);
    // The remote shared directory is deliberately stale. The confirmed local
    // project must still belong to Recent and Team immediately after the move.
    await recentTab.click();
    await expect(card).toBeVisible();
    await expect(cards).toHaveCount(4);
    const recentEvidence = testInfo.outputPath('recent-four-after-move.png');
    await page.screenshot({ path: recentEvidence });
    await testInfo.attach('recent-four-after-move', { path: recentEvidence, contentType: 'image/png' });
    await teamTab.click();
    await expect(card).toBeVisible();
    await expect(cards).toHaveCount(1);
    await expect(card).toHaveClass(/is-shared/);
    const teamEvidence = testInfo.outputPath('team-one-after-move.png');
    await page.screenshot({ path: teamEvidence });
    await testInfo.attach('team-one-after-move', { path: teamEvidence, contentType: 'image/png' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await teamTab.click();
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/is-shared/);

    hub.setTeamProjectCatalogVisible(projectId, true);
    hub.emitEvent({ type: 'team-projects-changed', workspaceId: personalWorkspaceId, projectId });
    await expect.poll(async () => {
      const response = await page.request.get('/api/workspace/projects/team', { headers: personalHeaders });
      expect(response.ok(), await response.text()).toBe(true);
      const body = await response.json() as { projects: Array<{ projectId: string }> };
      return body.projects.map((project) => project.projectId);
    }, { timeout: T.long }).toContain(projectId);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await teamTab.click();
    await expect(card).toBeVisible();

    await card.getByRole('button', { name: 'More actions' }).click();
    await card.getByRole('menuitem', { name: 'Move out of team space' }).click();
    const unshareResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST'
        && new URL(response.url()).pathname.endsWith(`/projects/${projectId}/move`),
    );
    await page.getByRole('alertdialog', { name: 'Move out of team space' })
      .getByRole('button', { name: 'Confirm move' }).click();
    const unshared = await unshareResponse;
    expect(unshared.ok(), `unshare: ${unshared.status()} ${await unshared.text()}`).toBe(true);

    await expect(card).toHaveCount(0);
    await personalTab.click();
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/is-shared/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await personalTab.click();
    await expect(card).toBeVisible();
    await expect(card).not.toHaveClass(/is-shared/);
  } catch (error) {
    failed = true;
    await testInfo.attach('fake-collab-commands', {
      body: JSON.stringify({ commands: hub.commandLog, requests: hub.requestLog }, null, 2),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await cluster?.close({ preserve: failed });
    await hub.close();
  }
});
