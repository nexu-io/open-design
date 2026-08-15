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
const COLLAB_COMMENT_NOTE = 'Member asks for a clearer shared headline.';
const COLLAB_COMMENT_TARGET = {
  filePath: 'index.html',
  elementId: 'shared-heading',
  selector: '[data-od-id="shared-heading"]',
  label: 'h1',
  text: 'Owner version 1',
  htmlHint: '<h1>',
  position: { x: 0, y: 0, width: 0, height: 0 },
};

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

const ADAPTIVE_AUTHORITY_HEALTHY_SERIES =
  'open_design_workspace_authority_decisions_total' +
  '{mode="adaptive",source="sse",reason="healthy",outcome="allow"}';
const ADAPTIVE_AUTHORITY_UNHEALTHY_SERIES =
  'open_design_workspace_authority_decisions_total' +
  '{mode="adaptive",source="sse",reason="unhealthy",outcome="fallback"}';

test.describe.configure({ timeout: T.xlong * 5 });

test('[P0] strict SSE health suppresses authority reads and bounds event storms per account', async ({
  browser,
}, testInfo) => {
  const hubRoot = testInfo.outputPath('fake-authority-cache-hub');
  await mkdir(hubRoot, { recursive: true });
  const hub = await startFakeCollabHub({
    root: hubRoot,
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Multi-client team',
    clients: [OWNER, MEMBER],
    strictAuthorityEvents: true,
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('fake-vela-authority-cache'));
  const commonEnv = {
    OD_COLLAB_TRANSPORT: 'vela-cli',
    OD_RESOURCE_TRANSPORT: 'vela-cli',
    OD_TEAM_PROJECTS_TRANSPORT: 'vela-cli',
    OD_WORKSPACE_AUTHORITY_CACHE_MODE: 'adaptive',
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
          id: 'authority-owner',
          env: { ...commonEnv, VELA_CONTROL_KEY: OWNER.controlKey },
        },
        {
          id: 'authority-member',
          env: { ...commonEnv, VELA_CONTROL_KEY: MEMBER.controlKey },
        },
      ]));
    const owner = cluster.clients['authority-owner']!;
    const member = cluster.clients['authority-member']!;

    await test.step('establish exact team interests and strict producer health', async () => {
      await Promise.all([
        pinWorkspace(owner.page, OWNER.memberId),
        pinWorkspace(member.page, MEMBER.memberId),
      ]);
      await Promise.all([
        registerWorkspaceEventInterest(owner.page, 'authority-owner', OWNER.memberId),
        registerWorkspaceEventInterest(member.page, 'authority-member', MEMBER.memberId),
      ]);
      await expect.poll(
        () => [
          hub.eventSubscriberCount(OWNER.memberId),
          hub.eventSubscriberCount(MEMBER.memberId),
        ],
        { timeout: T.long },
      ).toEqual([1, 1]);
      await Promise.all([
        expectMetricGreaterThan(
          owner.runtime.url.daemon(),
          ADAPTIVE_AUTHORITY_HEALTHY_SERIES,
          0,
        ),
        expectMetricGreaterThan(
          member.runtime.url.daemon(),
          ADAPTIVE_AUTHORITY_HEALTHY_SERIES,
          0,
        ),
      ]);
      await Promise.all([
        waitForHubRequestCountToSettle(hub, OWNER.memberId, '/api/v1/workspaces'),
        waitForHubRequestCountToSettle(hub, MEMBER.memberId, '/api/v1/workspaces'),
      ]);
    });

    await test.step('serve concurrent exact-scoped display reads without touching AMR', async () => {
      const before = workspaceDirectoryCounts(hub);
      await Promise.all([
        readWorkspaceContextBurst(owner.page, OWNER, 50),
        readWorkspaceContextBurst(member.page, MEMBER, 50),
        readWorkspaceTeamDataBurst(owner.page, OWNER, 25),
        readWorkspaceTeamDataBurst(member.page, MEMBER, 25),
      ]);
      expect(workspaceDirectoryCounts(hub)).toEqual(before);
    });

    await test.step('collapse duplicate billing invalidations into one fetch per account', async () => {
      const before = billingCommandCounts(hub, 'summary');
      for (let index = 0; index < 100; index += 1) {
        hub.emitEvent({
          type: 'billing-changed',
          workspaceId: WORKSPACE_ID,
          revision: 'billing-storm-1',
        });
      }
      await Promise.all([
        readAccountBillingBurst(owner.page, 50),
        readAccountBillingBurst(member.page, 50),
      ]);
      expect(billingCommandCounts(hub, 'summary')).toEqual({
        [OWNER.memberId]: (before[OWNER.memberId] ?? 0) + 1,
        [MEMBER.memberId]: (before[MEMBER.memberId] ?? 0) + 1,
      });
    });

    await test.step('converge account plan changes independently per account', async () => {
      const before = billingCommandCounts(hub, 'summary');
      const startedAt = Date.now();
      hub.setAccountMembershipTier(OWNER.memberId, 'max');
      await expect.poll(
        () => readAccountMembershipTier(owner.page),
        { timeout: T.medium },
      ).toBe('max');
      expect(Date.now() - startedAt).toBeLessThan(T.medium);
      await expect(readAccountMembershipTier(member.page)).resolves.toBe('team_plus');
      const after = billingCommandCounts(hub, 'summary');
      expect((after[OWNER.memberId] ?? 0) - (before[OWNER.memberId] ?? 0))
        .toBeLessThanOrEqual(2);
      // The legacy account event is workspace-wide and therefore dirties the
      // member's account cache too, but its independent summary must remain
      // unchanged and may cost at most one lazy verification when read.
      expect((after[MEMBER.memberId] ?? 0) - (before[MEMBER.memberId] ?? 0))
        .toBeLessThanOrEqual(1);
    });

    await test.step('converge plan upgrades and bound high-frequency wallet refreshes', async () => {
      const planBefore = billingCommandCounts(hub, 'workspace-snapshot');
      const planStartedAt = Date.now();
      hub.setWorkspacePlan('team_max');
      await Promise.all([
        expect.poll(
          () => readWorkspaceBilling(owner.page, OWNER),
          { timeout: T.medium },
        ).toMatchObject({ planId: 'team_max', balanceUsd: '0.00' }),
        expect.poll(
          () => readWorkspaceBilling(member.page, MEMBER),
          { timeout: T.medium },
        ).toMatchObject({ planId: 'team_max', balanceUsd: '0.00' }),
      ]);
      expect(Date.now() - planStartedAt).toBeLessThan(T.medium);
      const planAfter = billingCommandCounts(hub, 'workspace-snapshot');
      expect((planAfter[OWNER.memberId] ?? 0) - (planBefore[OWNER.memberId] ?? 0))
        .toBeLessThanOrEqual(2);
      expect((planAfter[MEMBER.memberId] ?? 0) - (planBefore[MEMBER.memberId] ?? 0))
        .toBeLessThanOrEqual(2);

      const walletBefore = billingCommandCounts(hub, 'workspace-snapshot');
      const walletStartedAt = Date.now();
      for (let index = 1; index <= 100; index += 1) {
        hub.setWorkspaceBalance(OWNER.memberId, (100 - index).toFixed(2));
      }
      await expect.poll(
        () => readWorkspaceBilling(owner.page, OWNER),
        { timeout: T.medium },
      ).toMatchObject({ planId: 'team_max', balanceUsd: '0.00' });
      expect(Date.now() - walletStartedAt).toBeLessThan(T.medium);
      await expect(readWorkspaceBilling(member.page, MEMBER)).resolves.toMatchObject({
        planId: 'team_max',
        balanceUsd: '0.00',
      });
      const walletAfter = billingCommandCounts(hub, 'workspace-snapshot');
      expect((walletAfter[OWNER.memberId] ?? 0) - (walletBefore[OWNER.memberId] ?? 0))
        .toBeLessThanOrEqual(2);
      expect(walletAfter[MEMBER.memberId] ?? 0).toBe(walletBefore[MEMBER.memberId] ?? 0);
    });

    await test.step('bound duplicate workspace invalidations and return to zero-read steady state', async () => {
      const beforeStorm = workspaceDirectoryCounts(hub);
      for (let index = 0; index < 100; index += 1) {
        hub.emitEvent({
          type: 'workspace-context-changed',
          workspaceId: WORKSPACE_ID,
          revision: 'workspace-storm-1',
        });
      }
      await Promise.all([
        waitForHubRequestCountToSettle(hub, OWNER.memberId, '/api/v1/workspaces'),
        waitForHubRequestCountToSettle(hub, MEMBER.memberId, '/api/v1/workspaces'),
      ]);
      // An event can invalidate the exact cache after its leading refresh has
      // already started. The first post-storm read is then the one bounded
      // trailing revalidation; include it in the storm budget.
      await Promise.all([
        readWorkspaceContextBurst(owner.page, OWNER, 50),
        readWorkspaceContextBurst(member.page, MEMBER, 50),
      ]);
      await Promise.all([
        waitForHubRequestCountToSettle(hub, OWNER.memberId, '/api/v1/workspaces'),
        waitForHubRequestCountToSettle(hub, MEMBER.memberId, '/api/v1/workspaces'),
      ]);
      const afterRecovery = workspaceDirectoryCounts(hub);
      expect((afterRecovery[OWNER.memberId] ?? 0) - (beforeStorm[OWNER.memberId] ?? 0))
        .toBeLessThanOrEqual(3);
      expect((afterRecovery[MEMBER.memberId] ?? 0) - (beforeStorm[MEMBER.memberId] ?? 0))
        .toBeLessThanOrEqual(3);

      await Promise.all([
        readWorkspaceContextBurst(owner.page, OWNER, 50),
        readWorkspaceContextBurst(member.page, MEMBER, 50),
      ]);
      expect(workspaceDirectoryCounts(hub)).toEqual(afterRecovery);
    });

    await test.step('degrade only the disconnected account to the legacy authority floor', async () => {
      const ownerUnhealthyBefore = await readMetricCounter(
        owner.runtime.url.daemon(),
        ADAPTIVE_AUTHORITY_UNHEALTHY_SERIES,
      );
      hub.setEventsAvailable(OWNER.memberId, false);
      await expect.poll(
        () => hub.eventSubscriberCount(OWNER.memberId),
        { timeout: T.long },
      ).toBe(0);
      await expectMetricGreaterThan(
        owner.runtime.url.daemon(),
        ADAPTIVE_AUTHORITY_UNHEALTHY_SERIES,
        ownerUnhealthyBefore,
      );

      const before = workspaceDirectoryCounts(hub);
      // Keep asking the exact same read. The first requests may still use the
      // valid 15s lease; once it expires, the disconnected account must resume
      // a real directory verification instead of trusting stale SSE state.
      await expect.poll(
        async () => {
          await readWorkspaceContextBurst(owner.page, OWNER, 1);
          return workspaceDirectoryCounts(hub)[OWNER.memberId] ?? 0;
        },
        { timeout: T.long },
      ).toBeGreaterThan(before[OWNER.memberId] ?? 0);

      const memberBefore = workspaceDirectoryCounts(hub)[MEMBER.memberId] ?? 0;
      await readWorkspaceContextBurst(member.page, MEMBER, 50);
      expect(workspaceDirectoryCounts(hub)[MEMBER.memberId] ?? 0).toBe(memberBefore);
    });

    await test.step('reconnect, catch up, and restore the zero-read steady state', async () => {
      const ownerHealthyBefore = await readMetricCounter(
        owner.runtime.url.daemon(),
        ADAPTIVE_AUTHORITY_HEALTHY_SERIES,
      );
      hub.setEventsAvailable(OWNER.memberId, true);
      await expect.poll(
        () => hub.eventSubscriberCount(OWNER.memberId),
        { timeout: T.long },
      ).toBe(1);
      await expectMetricGreaterThan(
        owner.runtime.url.daemon(),
        ADAPTIVE_AUTHORITY_HEALTHY_SERIES,
        ownerHealthyBefore,
      );
      await waitForHubRequestCountToSettle(
        hub,
        OWNER.memberId,
        '/api/v1/workspaces',
      );

      const before = workspaceDirectoryCounts(hub)[OWNER.memberId] ?? 0;
      await readWorkspaceContextBurst(owner.page, OWNER, 50);
      expect(workspaceDirectoryCounts(hub)[OWNER.memberId] ?? 0).toBe(before);
    });
  } catch (error) {
    failed = true;
    await testInfo.attach('fake-authority-cache-hub-log', {
      body: JSON.stringify({
        commands: hub.commandLog,
        events: hub.eventLog,
        requests: hub.requestLog,
      }, null, 2),
      contentType: 'application/json',
    });
    throw error;
  } finally {
    await cluster?.close({ preserve: failed });
    await hub.close();
  }
});

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

    await test.step('relay a member comment into the owner UI', async () => {
      const [ownerConversationId, memberConversationId] = await Promise.all([
        firstConversationId(ownerPage, projectId, OWNER),
        firstConversationId(memberPage, projectId, MEMBER),
      ]);
      const commentStartedAt = Date.now();
      const response = await memberPage.request.post(
        `/api/projects/${projectId}/conversations/${memberConversationId}/comments`,
        {
          data: { target: COLLAB_COMMENT_TARGET, note: COLLAB_COMMENT_NOTE },
          headers: workspaceHeaders(MEMBER),
          timeout: T.long,
        },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      await hub.waitForCommand(
        (entry) =>
          entry.memberId === MEMBER.memberId
          && entry.args[0] === 'collab'
          && entry.args[1] === 'comment'
          && entry.args[2] === 'push'
          && entry.args[3] === projectId,
        T.medium,
      );
      await expect.poll(
        async () => {
          const ownerComments = await ownerPage.request.get(
            `/api/projects/${projectId}/conversations/${ownerConversationId}/comments`,
            { headers: workspaceHeaders(OWNER), timeout: T.long },
          );
          if (!ownerComments.ok()) return [];
          const body = await ownerComments.json() as {
            comments?: Array<{ note?: string }>;
          };
          return body.comments?.map((comment) => comment.note) ?? [];
        },
        { timeout: T.medium },
      ).toContain(COLLAB_COMMENT_NOTE);
      expect(Date.now() - commentStartedAt).toBeLessThan(T.medium);

      await ownerPage.goto(`/projects/${projectId}/files/index.html`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(ownerPage.getByTestId('file-workspace')).toBeVisible({
        timeout: T.long,
      });
      await ownerPage.getByTestId('board-mode-toggle').click();
      await ownerPage.getByTestId('comment-panel-toggle').click();
      await expect(
        ownerPage
          .getByTestId('comment-side-panel')
          .getByTestId('comment-side-item')
          .filter({ hasText: COLLAB_COMMENT_NOTE }),
      ).toBeVisible({ timeout: T.medium });
    });

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

test('[P0] two isolated clients converge shared plugins and skills without scope leaks', async ({
  browser,
}, testInfo) => {
  const hubRoot = testInfo.outputPath('fake-team-extension-hub');
  await mkdir(hubRoot, { recursive: true });
  const hub = await startFakeCollabHub({
    root: hubRoot,
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Multi-client team',
    clients: [OWNER, MEMBER],
    includePersonalWorkspace: true,
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('fake-vela-team-extensions'));
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
  const pluginId = `shared-plugin-${testInfo.workerIndex}-${Date.now()}`;
  const skillId = `shared-skill-${testInfo.workerIndex}-${Date.now()}`;
  try {
    cluster = await createCollabCluster(browser, testInfo, [
      {
        id: 'extension-owner',
        env: { ...commonEnv, VELA_CONTROL_KEY: OWNER.controlKey },
      },
      {
        id: 'extension-member',
        env: { ...commonEnv, VELA_CONTROL_KEY: MEMBER.controlKey },
      },
    ]);
    const ownerPage = cluster.clients['extension-owner']!.page;
    const memberPage = cluster.clients['extension-member']!.page;
    await Promise.all([
      applyStandardMocks(ownerPage),
      applyStandardMocks(memberPage),
      pinWorkspace(ownerPage, OWNER.memberId),
      pinWorkspace(memberPage, MEMBER.memberId),
      registerWorkspaceEventInterest(ownerPage, 'extension-owner', OWNER.memberId),
      registerWorkspaceEventInterest(memberPage, 'extension-member', MEMBER.memberId),
    ]);
    await expect.poll(
      () => [
        hub.eventSubscriberCount(OWNER.memberId),
        hub.eventSubscriberCount(MEMBER.memberId),
      ],
      { timeout: T.long },
    ).toEqual([1, 1]);

    const projectId = await createProject(ownerPage);
    await writeProjectTextFile(
      ownerPage,
      projectId,
      'plugin-source/open-design.json',
      JSON.stringify({
        $schema: 'https://open-design.ai/schemas/plugin.v1.json',
        name: pluginId,
        title: 'Realtime Shared Plugin',
        version: '0.1.0',
        description: 'A real two-daemon extension fixture.',
        license: 'MIT',
        od: { kind: 'atom', capabilities: ['prompt:inject'] },
      }),
    );
    await writeProjectTextFile(
      ownerPage,
      projectId,
      'plugin-source/SKILL.md',
      `---\nname: ${pluginId}\ndescription: E2E shared plugin fixture.\n---\n# Fixture\n`,
    );
    const installPlugin = await ownerPage.request.post(
      `/api/projects/${projectId}/plugins/install-folder`,
      {
        data: { path: 'plugin-source' },
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(installPlugin.ok(), await installPlugin.text()).toBeTruthy();
    const importSkill = await ownerPage.request.post('/api/skills/import', {
      data: {
        name: skillId,
        description: 'A real two-daemon Skill fixture.',
        body: '# Shared Skill\n\nReturn the shared skill fixture.',
      },
      headers: workspaceHeaders(OWNER),
      timeout: T.long,
    });
    expect(importSkill.ok(), await importSkill.text()).toBeTruthy();

    for (const [kind, resourceId] of [
      ['plugins', pluginId],
      ['skills', skillId],
    ] as const) {
      const shareStartedAt = Date.now();
      const share = await ownerPage.request.post(
        `/api/workspace/${kind}/${encodeURIComponent(resourceId)}/share`,
        { headers: workspaceHeaders(OWNER), timeout: T.long },
      );
      expect(share.ok(), await share.text()).toBeTruthy();
      await expect.poll(
        () => readTeamResourceIds(memberPage, MEMBER, kind),
        { timeout: T.medium },
      ).toContain(resourceId);
      expect(Date.now() - shareStartedAt).toBeLessThan(T.medium);
      await expect.poll(
        () => readLocalResourceIds(memberPage, MEMBER, kind),
        { timeout: T.medium },
      ).toContain(resourceId);

      if (kind === 'plugins') {
        const unshareStartedAt = Date.now();
        const unshare = await ownerPage.request.delete(
          `/api/workspace/${kind}/${encodeURIComponent(resourceId)}/share`,
          { headers: workspaceHeaders(OWNER), timeout: T.long },
        );
        expect(unshare.ok(), await unshare.text()).toBeTruthy();
        await expect.poll(
          () => readTeamResourceIds(memberPage, MEMBER, kind),
          { timeout: T.medium },
        ).not.toContain(resourceId);
        expect(Date.now() - unshareStartedAt).toBeLessThan(T.medium);
      }
    }

    await openHome(memberPage);
    await ensureRailOpen(memberPage);
    const remoteWorkspaceId = 'ws-created-remotely';
    const remoteWorkspaceName = 'Remote-created team';
    await expect(memberPage.getByRole('menu')).toHaveCount(0);
    const workspaceCreatedAt = Date.now();
    hub.addWorkspace(MEMBER.memberId, remoteWorkspaceId, remoteWorkspaceName);

    // The account event refreshes the rail cache even while the switcher is
    // closed. Opening it is only how this test observes the already-updated
    // state; it is not what triggers discovery.
    await expect.poll(
      async () => {
        const directory = await memberPage.request.get(
          '/api/workspace/directory',
          { timeout: T.long },
        );
        if (!directory.ok()) return [];
        const body = await directory.json() as {
          items?: Array<{ workspaceId?: string }>;
        };
        return body.items?.map((item) => item.workspaceId) ?? [];
      },
      { timeout: T.short },
    ).toContain(remoteWorkspaceId);
    const workspaceDirectoryLatencyMs = Date.now() - workspaceCreatedAt;
    expect(workspaceDirectoryLatencyMs).toBeLessThan(T.short);
    await testInfo.attach('remote-workspace-directory-latency', {
      body: JSON.stringify({ workspaceDirectoryLatencyMs }),
      contentType: 'application/json',
    });
    await memberPage.getByTestId('workspace-switcher').click();
    await expect(
      memberPage.getByRole('menu').getByRole('menuitem', { name: remoteWorkspaceName }),
    ).toBeVisible({ timeout: T.medium });
    expect(Date.now() - workspaceCreatedAt).toBeLessThan(T.medium);

    const ownerDirectory = await ownerPage.request.get('/api/workspace/directory', {
      timeout: T.long,
    });
    expect(ownerDirectory.ok(), await ownerDirectory.text()).toBeTruthy();
    const ownerDirectoryBody = await ownerDirectory.json() as {
      items?: Array<{ workspaceId?: string }>;
    };
    expect(ownerDirectoryBody.items?.map((item) => item.workspaceId) ?? [])
      .not.toContain(remoteWorkspaceId);

    await memberPage
      .getByRole('menu')
      .getByRole('menuitem', { name: remoteWorkspaceName })
      .click();
    await expect(memberPage.getByTestId('workspace-switcher')).toContainText(
      remoteWorkspaceName,
      { timeout: T.medium },
    );
    const remoteHeaders = addedWorkspaceHeaders(
      MEMBER,
      remoteWorkspaceId,
    );
    await expect(
      readTeamResourceIds(memberPage, MEMBER, 'skills', remoteHeaders),
    ).resolves.not.toContain(skillId);
    await expect(
      readLocalResourceIds(
        memberPage,
        MEMBER,
        'plugins',
        remoteHeaders,
      ),
    ).resolves.not.toContain(pluginId);
    await expect(
      readLocalResourceIds(
        memberPage,
        MEMBER,
        'skills',
        remoteHeaders,
      ),
    ).resolves.not.toContain(skillId);
    await expect.poll(
      () => readWorkspaceBilling(
        memberPage,
        MEMBER,
        remoteWorkspaceId,
        remoteHeaders,
      ),
      { timeout: T.medium },
    ).toMatchObject({ planId: null, balanceUsd: null });

    const unshareSkill = await ownerPage.request.delete(
      `/api/workspace/skills/${encodeURIComponent(skillId)}/share`,
      { headers: workspaceHeaders(OWNER), timeout: T.long },
    );
    expect(unshareSkill.ok(), await unshareSkill.text()).toBeTruthy();

    // The member was subscribed to the remote workspace while the original
    // team's retraction event fired. Switching back must catch up the missed
    // removal without reviving either resource from a different scope.
    await ensureRailOpen(memberPage);
    await memberPage.getByTestId('workspace-switcher').click();
    await memberPage
      .getByRole('menu')
      .getByRole('menuitem', { name: 'Multi-client team' })
      .click();
    await expect(memberPage.getByTestId('workspace-switcher')).toContainText(
      'Multi-client team',
      { timeout: T.medium },
    );
    await expect.poll(
      () => readWorkspaceBilling(memberPage, MEMBER),
      { timeout: T.medium },
    ).toMatchObject({ planId: 'team_plus', balanceUsd: '0.00' });
    await expect.poll(
      () => readTeamResourceIds(memberPage, MEMBER, 'skills'),
      { timeout: T.medium },
    ).not.toContain(skillId);
    await expect.poll(
      () => readLocalResourceIds(memberPage, MEMBER, 'skills'),
      { timeout: T.medium },
    ).not.toContain(skillId);
  } catch (error) {
    failed = true;
    await testInfo.attach('fake-team-extension-hub-log', {
      body: JSON.stringify({
        commands: hub.commandLog,
        events: hub.eventLog,
        requests: hub.requestLog,
      }, null, 2),
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
  await page.goto('/', { waitUntil: 'domcontentloaded', timeout: T.xlong });
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, {
    timeout: T.xlong,
  });
  // Do not wait on the long-lived SSE response itself: Chromium may not emit
  // a response event until the stream yields its first chunk. The live
  // convergence assertions below are the actual connection contract.
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

async function readWorkspaceContextBurst(
  page: Page,
  identity: typeof OWNER | typeof MEMBER,
  count: number,
): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: count }, () => page.request.get('/api/workspace/context', {
      headers: workspaceHeaders(identity),
      timeout: T.long,
    })),
  );
  for (const response of responses) {
    const raw = await response.text();
    expect(response.ok(), raw).toBeTruthy();
    const body = JSON.parse(raw) as {
      context?: { workspaceId?: string; workspaceMemberId?: string } | null;
    };
    expect(body.context).toMatchObject({
      workspaceId: WORKSPACE_ID,
      workspaceMemberId: identity.memberId,
    });
  }
}

async function readWorkspaceTeamDataBurst(
  page: Page,
  client: typeof OWNER | typeof MEMBER,
  count: number,
): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: count }, (_, index) => page.request.get(
      index % 2 === 0
        ? '/api/workspace/projects/team'
        : '/api/workspace/members',
      {
        headers: workspaceHeaders(client),
        timeout: T.long,
      },
    )),
  );
  for (const response of responses) {
    const raw = await response.text();
    expect(response.ok(), raw).toBeTruthy();
  }
}

async function readAccountBillingBurst(page: Page, count: number): Promise<void> {
  const responses = await Promise.all(
    Array.from({ length: count }, () => page.request.get(
      '/api/workspace/billing?scope=account',
      { timeout: T.long },
    )),
  );
  for (const response of responses) {
    const raw = await response.text();
    expect(response.ok(), raw).toBeTruthy();
    const body = JSON.parse(raw) as {
      summary?: { membershipTier?: string } | null;
    };
    expect(body.summary?.membershipTier).toBe('team_plus');
  }
}

async function readAccountMembershipTier(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/workspace/billing?scope=account', {
    timeout: T.long,
  });
  if (!response.ok()) return null;
  const body = await response.json() as {
    summary?: { membershipTier?: string } | null;
  };
  return body.summary?.membershipTier ?? null;
}

async function readWorkspaceBilling(
  page: Page,
  identity: typeof OWNER | typeof MEMBER,
  workspaceId = WORKSPACE_ID,
  headers = workspaceHeaders(identity),
): Promise<{ planId: string | null; balanceUsd: string | null } | null> {
  const response = await page.request.get(
    `/api/workspace/billing?scope=workspace&workspaceId=${encodeURIComponent(workspaceId)}`,
    { headers, timeout: T.long },
  );
  if (!response.ok()) return null;
  const body = await response.json() as {
    workspaceSnapshot?: {
      billing?: { planId?: string | null };
      wallet?: { balanceUsd?: string | null };
    } | null;
  };
  return {
    planId: body.workspaceSnapshot?.billing?.planId ?? null,
    balanceUsd: body.workspaceSnapshot?.wallet?.balanceUsd ?? null,
  };
}

function workspaceDirectoryCounts(hub: Awaited<ReturnType<typeof startFakeCollabHub>>):
  Record<string, number> {
  const counts: Record<string, number> = {};
  for (const request of hub.requestLog) {
    if (request.path !== '/api/v1/workspaces' || !request.memberId) continue;
    counts[request.memberId] = (counts[request.memberId] ?? 0) + 1;
  }
  return counts;
}

function billingCommandCounts(
  hub: Awaited<ReturnType<typeof startFakeCollabHub>>,
  command: string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of hub.commandLog) {
    if (entry.args[0] !== 'billing' || entry.args[1] !== command) continue;
    counts[entry.memberId] = (counts[entry.memberId] ?? 0) + 1;
  }
  return counts;
}

async function waitForHubRequestCountToSettle(
  hub: Awaited<ReturnType<typeof startFakeCollabHub>>,
  memberId: string,
  path: string,
): Promise<void> {
  let previous = -1;
  let stableSamples = 0;
  await expect.poll(
    () => {
      const current = hub.requestLog.filter(
        (request) => request.memberId === memberId && request.path === path,
      ).length;
      stableSamples = current === previous ? stableSamples + 1 : 0;
      previous = current;
      return stableSamples;
    },
    // One event lane may legally run a leading refresh, one trailing refresh,
    // and a billing-member reconnect. Require a real quiescence window after
    // all three, rather than sampling only the first short gap between them.
    { intervals: [100], timeout: T.medium },
  ).toBeGreaterThanOrEqual(20);
}

async function readMetricCounter(
  daemonUrl: string,
  series: string,
): Promise<number> {
  const response = await fetch(new URL('/api/metrics', daemonUrl));
  if (!response.ok) {
    throw new Error(`metrics ${response.status}: ${await response.text()}`);
  }
  const line = (await response.text())
    .split('\n')
    .find((entry) => entry.startsWith(`${series} `));
  return Number(line?.slice(series.length + 1).trim() ?? 0);
}

async function expectMetricGreaterThan(
  daemonUrl: string,
  series: string,
  floor: number,
): Promise<void> {
  await expect.poll(
    () => readMetricCounter(daemonUrl, series),
    { timeout: T.long },
  ).toBeGreaterThan(floor);
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

async function firstConversationId(
  page: Page,
  projectId: string,
  identity: typeof OWNER | typeof MEMBER,
): Promise<string> {
  const response = await page.request.get(`/api/projects/${projectId}/conversations`, {
    headers: workspaceHeaders(identity),
    timeout: T.long,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json() as {
    conversations?: Array<{ id?: string; updatedAt?: number }>;
  };
  const conversation = [...(body.conversations ?? [])]
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0];
  if (!conversation?.id) {
    throw new Error(`project ${projectId} has no routable conversation`);
  }
  return conversation.id;
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

async function writeProjectTextFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
): Promise<void> {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name, content },
    headers: workspaceHeaders(OWNER),
    timeout: T.long,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function readTeamResourceIds(
  page: Page,
  identity: typeof OWNER | typeof MEMBER,
  kind: 'plugins' | 'skills',
  headers = workspaceHeaders(identity),
): Promise<string[]> {
  const response = await page.request.get(`/api/workspace/${kind}/team`, {
    headers,
    timeout: T.long,
  });
  if (!response.ok()) return [];
  const body = await response.json() as { ids?: string[] };
  return body.ids ?? [];
}

async function readLocalResourceIds(
  page: Page,
  identity: typeof OWNER | typeof MEMBER,
  kind: 'plugins' | 'skills',
  headers = workspaceHeaders(identity),
): Promise<string[]> {
  const response = await page.request.get(`/api/${kind}`, {
    headers,
    timeout: T.long,
  });
  if (!response.ok()) return [];
  const body = await response.json() as {
    plugins?: Array<{ id?: string }>;
    skills?: Array<{ id?: string }>;
  };
  return (kind === 'plugins' ? body.plugins : body.skills)
    ?.flatMap((resource) => resource.id ? [resource.id] : []) ?? [];
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

function addedWorkspaceHeaders(
  identity: typeof OWNER | typeof MEMBER,
  workspaceId: string,
): Record<string, string> {
  return {
    'x-od-workspace-id': workspaceId,
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-id': `member-${identity.memberId}-${workspaceId}`,
    'x-od-workspace-role': 'owner',
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
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
