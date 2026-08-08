import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import {
  createCollabCluster,
  type CollabCluster,
} from '@/playwright/collab-cluster';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { clusterTest as test, expect } from '@/playwright/suite';
import { T } from '@/timeouts';

const WORKSPACE_ID = 'ws-multi-client';
const PROJECT_NAME = 'Realtime shared workspace';
// A freshly pulled read-only mirror uses the compact design-file iframe before
// the richer FileViewer test-id variants mount. There is exactly one visible
// artifact iframe in this flow.
const PREVIEW_SELECTOR = 'iframe:visible';

const OWNER = {
  controlKey: 'multi-client-owner-key',
  memberId: 'mem-multi-owner',
  name: 'Olivia Owner',
  role: 'owner' as const,
};
const MEMBER = {
  controlKey: 'multi-client-member-key',
  memberId: 'mem-multi-viewer',
  name: 'Mina Member',
  role: 'member' as const,
};

test.describe.configure({ timeout: T.xlong * 5 });

test('[P0] two isolated clients converge live content, presence, and owner unshare', async ({
  browser,
}, testInfo) => {
  const hubRoot = testInfo.outputPath('fake-collab-hub');
  await mkdir(hubRoot, { recursive: true });
  const hub = await startFakeCollabHub({
    root: hubRoot,
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Multi-client team',
    clients: [OWNER, MEMBER],
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('fake-vela-collab'));
  const commonEnv = {
    OD_COLLAB_TRANSPORT: 'vela-cli',
    OD_RESOURCE_TRANSPORT: 'vela-cli',
    OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
    VELA_API_URL: hub.url,
    VELA_BIN: velaBin,
  };
  let cluster: CollabCluster | undefined;
  let failed = false;
  try {
    cluster = await test.step('start isolated owner and member clients', async () =>
      await createCollabCluster(browser, testInfo, [
        {
          id: 'owner',
          env: { ...commonEnv, VELA_CONTROL_KEY: OWNER.controlKey },
        },
        {
          id: 'member',
          env: { ...commonEnv, VELA_CONTROL_KEY: MEMBER.controlKey },
        },
      ]));
    const ownerPage = cluster.clients.owner!.page;
    const memberPage = cluster.clients.member!.page;
    await test.step('configure isolated workspace clients', async () => {
      await Promise.all([applyStandardMocks(ownerPage), applyStandardMocks(memberPage)]);
      await Promise.all([
        pinWorkspace(ownerPage, OWNER.memberId),
        pinWorkspace(memberPage, MEMBER.memberId),
      ]);
    });
    await test.step('open the member workspace once', async () =>
      await openHome(memberPage));

    const projectId = await createProject(ownerPage);
    await writeHtml(ownerPage, projectId, htmlFor('Owner version 1'));

    const share = await ownerPage.request.post(
      `/api/workspaces/${WORKSPACE_ID}/projects/${projectId}/move`,
      {
        data: { visibility: 'team' },
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(share.ok(), await share.text()).toBeTruthy();
    await hub.waitForCommand(
      (entry) =>
        entry.memberId === OWNER.memberId &&
        entry.args[0] === 'team-projects' &&
        entry.args[1] === 'upsert' &&
        entry.args[2] === projectId,
      T.long,
    );

    await expect.poll(
      async () => {
        const response = await memberPage.request.get('/api/workspace/projects/team', {
          headers: workspaceHeaders(MEMBER),
        });
        const raw = await response.text();
        if (!response.ok()) {
          throw new Error(`member Team catalog ${response.status()}: ${raw}`);
        }
        const body = JSON.parse(raw) as { projects?: Array<{ projectId?: string }> };
        return body.projects?.map((project) => project.projectId) ?? [];
      },
      { timeout: T.long },
    ).toContain(projectId);

    await ensureRailOpen(memberPage);
    await memberPage.getByTestId('entry-nav-all-projects').click();
    const memberCard = memberPage.locator(
      `.recent-projects__card[data-project-id="${projectId}"]:visible`,
    );
    await expect(memberCard).toContainText(PROJECT_NAME);
    await memberCard.locator('.recent-projects__card-main').click();
    await expect(memberPage).toHaveURL(new RegExp(`/projects/${projectId}`), {
      timeout: T.long,
    });
    const memberPreview = memberPage.frameLocator(PREVIEW_SELECTOR);
    const initialMemberPull = await hub.waitForCommand(
      (entry) =>
        entry.memberId === MEMBER.memberId &&
        isProjectPull(entry.args),
      T.long,
    );
    const initialMemberVersion = projectPullVersion(initialMemberPull.args);
    await expect(
      memberPreview.getByRole('heading', { name: 'Owner version 1' }),
    ).toBeVisible({ timeout: T.long });
    await expect(memberPage.getByTestId('workspace-focus-toggle')).toBeVisible({
      timeout: T.long,
    });
    await expect(memberPage.getByTestId('chat-collapse-toggle')).toBeHidden();
    await memberPage.getByTestId('workspace-focus-toggle').click();
    await expect(memberPage.getByTestId('workspace-focus-toggle')).toHaveCount(0);
    await expect(memberPage.getByTestId('chat-collapse-toggle')).toBeVisible();
    const twoPersonPresence = memberPage.getByRole('group', {
      name: /2 collaborators online/i,
    });
    await expect(twoPersonPresence).toHaveCount(0);

    await ownerPage.bringToFront();
    await ownerPage.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await expect(ownerPage.getByTestId('file-workspace')).toBeVisible({
      timeout: T.long,
    });
    await expect(ownerPage.getByTestId('workspace-focus-toggle')).toHaveCount(0);
    await expect(ownerPage.getByTestId('chat-collapse-toggle')).toBeVisible();
    await hub.waitForCommand(
      (entry) =>
        entry.memberId === OWNER.memberId &&
        entry.args[0] === 'collab' &&
        entry.args[1] === 'presence' &&
        entry.args[2] === 'heartbeat' &&
        entry.args[3] === projectId,
      T.long,
    );
    await expect(twoPersonPresence).toBeVisible({
      timeout: T.long,
    });
    await expect(twoPersonPresence.locator('[data-self="true"]')).toHaveCount(1);
    await expect(twoPersonPresence.locator('[title]')).toHaveCount(2);

    const memberDocumentMarker = await memberPage.evaluate(() => {
      const target = window as Window & typeof globalThis & {
        __multiClientDocumentMarker?: string;
      };
      target.__multiClientDocumentMarker = crypto.randomUUID();
      return target.__multiClientDocumentMarker;
    });
    const previousPushCount = hub.commandLog.filter(
      (entry) =>
        entry.memberId === OWNER.memberId &&
        entry.args[0] === 'resource' &&
        entry.args[1] === 'push',
    ).length;
    const previousPublishedVersion = hub.eventLog.reduce(
      (latest, event) =>
        event.type === 'project-content-changed' &&
        event.projectId === projectId &&
        typeof event.version === 'number'
          ? Math.max(latest, event.version)
          : latest,
      initialMemberVersion,
    );

    // This write travels to the owner daemon over its real project-file route.
    // The publish watcher pushes it through Vela; the hub event makes the
    // member daemon replace its local mirror directory and emit file-changed
    // to the already-open browser.
    await writeHtml(ownerPage, projectId, htmlFor('Owner version 2'));
    await expect.poll(
      () =>
        hub.commandLog.filter(
          (entry) =>
            entry.memberId === OWNER.memberId &&
            entry.args[0] === 'resource' &&
            entry.args[1] === 'push',
        ).length,
      { timeout: T.long },
    ).toBeGreaterThan(previousPushCount);
    const contentEvent = await hub.waitForEvent(
      (entry) =>
        entry.type === 'project-content-changed' &&
        entry.projectId === projectId &&
        typeof entry.version === 'number' &&
        entry.version > previousPublishedVersion,
      T.long,
    );
    await hub.waitForCommand(
      (entry) =>
        entry.memberId === MEMBER.memberId &&
        isProjectPull(entry.args) &&
        projectPullVersion(entry.args) > initialMemberVersion,
      T.long,
    );

    await expect(
      memberPreview.getByRole('heading', { name: 'Owner version 2' }),
    ).toBeVisible({ timeout: T.long });
    await expect(
      memberPreview.getByRole('heading', { name: 'Owner version 1' }),
    ).toHaveCount(0);
    await expect.poll(
      () => memberPage.evaluate(() =>
        (window as Window & typeof globalThis & {
          __multiClientDocumentMarker?: string;
        }).__multiClientDocumentMarker ?? null,
      ),
      { timeout: T.long },
    ).toBe(memberDocumentMarker);
    // Expanding is sticky for this project visit: content/status events after
    // the initial confirmed non-owner default must never collapse chat again.
    await expect(memberPage.getByTestId('workspace-focus-toggle')).toHaveCount(0);
    await expect(memberPage.getByTestId('chat-collapse-toggle')).toBeVisible();

    const memberFile = await memberPage.request.get(
      `/api/projects/${projectId}/files/index.html`,
      { headers: workspaceHeaders(MEMBER) },
    );
    const memberFileBody = await memberFile.text();
    expect(memberFile.ok(), memberFileBody).toBeTruthy();
    expect(memberFileBody).toContain('Owner version 2');
    expect(contentEvent.workspaceId).toBe(WORKSPACE_ID);

    const unshare = await ownerPage.request.post(
      `/api/workspaces/${WORKSPACE_ID}/projects/${projectId}/move`,
      {
        data: { visibility: 'personal' },
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(unshare.ok(), await unshare.text()).toBeTruthy();
    await hub.waitForCommand(
      (entry) =>
        entry.memberId === OWNER.memberId &&
        entry.args[0] === 'team-projects' &&
        entry.args[1] === 'remove' &&
        entry.args[2] === projectId,
      T.long,
    );

    // A non-creator's local copy is a Team mirror, not their own draft. Once
    // the owner unshares it, quarantine that mirror: it must disappear from
    // every project list and must never be reclassified as Personal.
    await expect.poll(
      async () => {
        const response = await memberPage.request.get('/api/workspace/projects/team', {
          headers: workspaceHeaders(MEMBER),
        });
        const raw = await response.text();
        if (!response.ok()) {
          throw new Error(`member Team catalog ${response.status()}: ${raw}`);
        }
        const body = JSON.parse(raw) as { projects?: Array<{ projectId?: string }> };
        return body.projects?.map((project) => project.projectId) ?? [];
      },
      { timeout: T.long },
    ).not.toContain(projectId);
    await expect.poll(
      async () => {
        const response = await memberPage.request.get(
          `/api/workspaces/${WORKSPACE_ID}/projects`,
          { headers: workspaceHeaders(MEMBER) },
        );
        if (!response.ok()) return null;
        const body = await response.json() as {
          projects?: Array<{ id?: string; visibility?: string }>;
        };
        return body.projects?.find((project) => project.id === projectId) ?? null;
      },
      { timeout: T.long },
    ).toBeNull();

    await memberPage.goto('/', { waitUntil: 'domcontentloaded' });
    await ensureRailOpen(memberPage);
    await memberPage.getByTestId('entry-nav-all-projects').click();
    await expect(memberCard).toHaveCount(0);
    await memberPage.getByTestId('entry-nav-drafts').click();
    const quarantinedMirror = memberPage.locator(
      `.recent-projects__card[data-project-id="${projectId}"]:visible`,
    );
    await expect(quarantinedMirror).toHaveCount(0);

    const retainedMemberFile = await memberPage.request.get(
      `/api/projects/${projectId}/files/index.html`,
      { headers: workspaceHeaders(MEMBER) },
    );
    expect(retainedMemberFile.status()).toBe(404);
  } catch (error) {
    failed = true;
    await testInfo.attach('fake-collab-hub-log', {
      body: JSON.stringify({
        commands: hub.commandLog,
        events: hub.eventLog,
      }, null, 2),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await cluster?.close({ preserve: failed });
    await hub.close();
  }
});

test('[P0] two active clients converge when a member gains then loses admin access', async ({
  browser,
}, testInfo) => {
  const hubRoot = testInfo.outputPath('fake-role-change-hub');
  await mkdir(hubRoot, { recursive: true });
  const hub = await startFakeCollabHub({
    root: hubRoot,
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Multi-client team',
    clients: [OWNER, MEMBER],
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('fake-vela-role-change'));
  const commonEnv = {
    OD_COLLAB_TRANSPORT: 'vela-cli',
    OD_RESOURCE_TRANSPORT: 'vela-cli',
    OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
    OD_WORKSPACE_CONTEXT_SOURCE: 'vela',
    VELA_API_URL: hub.url,
    VELA_BIN: velaBin,
  };
  let cluster: CollabCluster | undefined;
  let failed = false;
  try {
    cluster = await test.step('start isolated owner and member clients', async () =>
      await createCollabCluster(browser, testInfo, [
        {
          id: 'owner',
          env: { ...commonEnv, VELA_CONTROL_KEY: OWNER.controlKey },
        },
        {
          id: 'member',
          env: { ...commonEnv, VELA_CONTROL_KEY: MEMBER.controlKey },
        },
      ]));
    const ownerPage = cluster.clients.owner!.page;
    const memberPage = cluster.clients.member!.page;
    await test.step('configure isolated workspace clients', async () => {
      await applyStandardMocks(memberPage);
      await Promise.all([
        pinWorkspace(ownerPage, OWNER.memberId),
        pinWorkspace(memberPage, MEMBER.memberId),
      ]);
    });
    // The owner witness below is the live daemon API and does not need an
    // unrelated home render. Only the member browser owns a UI assertion.
    await test.step('open the member workspace once', async () =>
      await openHome(memberPage));
    await test.step('connect both clients to workspace events', async () => {
      await Promise.all([
        registerWorkspaceEventInterest(ownerPage, 'owner-role-change', OWNER.memberId),
        registerWorkspaceEventInterest(memberPage, 'member-role-change', MEMBER.memberId),
      ]);
      await expect.poll(
        () => [
          hub.eventSubscriberCount(OWNER.memberId) > 0,
          hub.eventSubscriberCount(MEMBER.memberId) > 0,
        ],
        { timeout: T.long },
      ).toEqual([true, true]);
    });

    // Member -> Admin is delivered to the already-open client and grants the
    // invite capability. The owner sees the same role in its live roster.
    await test.step('promote member and converge both clients', async () => {
      hub.setMemberRole(MEMBER.memberId, 'admin');
      await expectWorkspaceRole(memberPage, 'admin', true);
      await expectRosterRole(ownerPage, 'admin');
      await ensureRailOpen(memberPage);
      await memberPage.getByTestId('workspace-switcher').click();
      await expect(
        memberPage.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }),
      ).toBeVisible({ timeout: T.long });
      await memberPage.keyboard.press('Escape');
    });

    // Admin -> Member revokes the affordance live in the already-open client.
    await test.step('demote admin and revoke the live affordance', async () => {
      hub.setMemberRole(MEMBER.memberId, 'member');
      await expectWorkspaceRole(memberPage, 'member', false);
      await expectRosterRole(ownerPage, 'member');
      await ensureRailOpen(memberPage);
      await memberPage.getByTestId('workspace-switcher').evaluate(
        (element: HTMLButtonElement) => element.click(),
      );
      await expect(
        memberPage.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }),
      ).toHaveCount(0, { timeout: T.long });
    });
  } catch (error) {
    failed = true;
    await testInfo.attach('fake-role-change-hub-log', {
      body: JSON.stringify({ commands: hub.commandLog, events: hub.eventLog }, null, 2),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await cluster?.close({ preserve: failed });
    await hub.close();
  }
});

async function pinWorkspace(page: Page, workspaceMemberId: string): Promise<void> {
  const response = await page.request.put('/api/workspace/active', {
    data: { workspaceId: WORKSPACE_ID, workspaceMemberId },
    timeout: T.long,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function openHome(page: Page): Promise<void> {
  await page.bringToFront();
  const workspaceEventsConnected = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.pathname === '/api/workspace/events';
  }, { timeout: T.long });
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: T.xlong });
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, {
    timeout: T.xlong,
  });
  expect((await workspaceEventsConnected).ok()).toBeTruthy();
  const privacyDialog = page
    .getByRole('dialog')
    .filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog
      .getByRole('button', { name: /I get it|not now|got it|don't share/i })
      .click();
  }
}

async function registerWorkspaceEventInterest(
  page: Page,
  clientId: string,
  workspaceMemberId: string,
): Promise<void> {
  const response = await page.request.put(
    `/api/workspace/billing/interests/${clientId}`,
    {
      data: {
        generation: '1',
        interests: [{ workspaceId: WORKSPACE_ID, workspaceMemberId }],
      },
      timeout: T.long,
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function expectWorkspaceRole(
  page: Page,
  role: 'admin' | 'member',
  canInviteMembers: boolean,
): Promise<void> {
  await expect.poll(
    async () => {
      const response = await page.request.get('/api/workspace/context', {
        // Keep the request identity fixed at the member's original role. The
        // expected role must come from the refreshed Vela context, not from a
        // test header that mirrors the assertion.
        headers: workspaceHeaders(MEMBER),
        timeout: T.long,
      });
      if (!response.ok()) return null;
      const body = await response.json() as {
        context?: { role?: string; permissions?: { canInviteMembers?: boolean } } | null;
      };
      return body.context ?? null;
    },
    { timeout: T.long },
  ).toMatchObject({ role, permissions: { canInviteMembers } });
}

async function expectRosterRole(page: Page, role: 'admin' | 'member'): Promise<void> {
  await expect.poll(
    async () => {
      const response = await page.request.get('/api/workspace/members', {
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      });
      if (!response.ok()) return null;
      const body = await response.json() as {
        members?: Array<{ memberId?: string; role?: string }>;
      };
      return body.members?.find((entry) => entry.memberId === MEMBER.memberId) ?? null;
    },
    { timeout: T.long },
  ).toMatchObject({ memberId: MEMBER.memberId, role });
}

async function createProject(page: Page): Promise<string> {
  const id = `multi-client-${Date.now()}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id,
      name: PROJECT_NAME,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype' },
    },
    headers: workspaceHeaders(OWNER),
    timeout: T.long,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json() as { project?: { id?: string } };
  if (!body.project?.id) {
    throw new Error(`project create response missing id: ${JSON.stringify(body)}`);
  }
  return body.project.id;
}

async function writeHtml(page: Page, projectId: string, content: string): Promise<void> {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'index.html',
      content,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: PROJECT_NAME,
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    },
    headers: workspaceHeaders(OWNER),
    timeout: T.long,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

function workspaceHeaders(identity: typeof OWNER | typeof MEMBER): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-id': identity.memberId,
    'x-od-workspace-role': identity.role,
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': 'true',
    'x-od-workspace-can-write-synced-files': 'true',
  };
}

function htmlFor(heading: string): string {
  return `<!doctype html><html><body><main><h1 data-od-id="shared-heading">${heading}</h1></main></body></html>`;
}

function isProjectPull(args: readonly string[]): boolean {
  return (
    (args[0] === 'team-projects' && args[1] === 'pull') ||
    (args[0] === 'resource' && args[1] === 'pull')
  );
}

function projectPullVersion(args: readonly string[]): number {
  const flagIndex = args.indexOf('--expected-version');
  if (flagIndex >= 0) return Number(args[flagIndex + 1] ?? 0);
  return 0;
}
