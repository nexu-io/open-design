import { mkdir } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import {
  createCollabCluster,
  type CollabCluster,
} from '@/playwright/collab-cluster';
import { startFakeCollabHub } from '@/playwright/fake-collab-hub';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';

const WORKSPACE_ID = 'ws-team-design-system-picker';

const OWNER = {
  controlKey: 'team-ds-picker-owner-key',
  memberId: 'mem-team-ds-picker-owner',
  name: 'Design System Owner',
  role: 'owner' as const,
};

const MEMBER = {
  controlKey: 'team-ds-picker-member-key',
  memberId: 'mem-team-ds-picker-member',
  name: 'Design System Member',
  role: 'member' as const,
};

test.describe.configure({ timeout: T.xlong * 8 });

test('[P0] Team design systems catch up missed shares, updates, and retractions', async ({
  browser,
}, testInfo) => {
  const hubRoot = testInfo.outputPath('fake-team-design-system-hub');
  await mkdir(hubRoot, { recursive: true });
  const hub = await startFakeCollabHub({
    root: hubRoot,
    workspaceId: WORKSPACE_ID,
    workspaceName: 'Design System Team',
    clients: [OWNER, MEMBER],
    includePersonalWorkspace: true,
  });
  const velaBin = await hub.writeVelaBin(testInfo.outputPath('fake-vela-team-design-system'));
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
    cluster = await createCollabCluster(browser, testInfo, [
      {
        id: 'owner-design-system',
        env: { ...commonEnv, VELA_CONTROL_KEY: OWNER.controlKey },
      },
      {
        id: 'member-design-system',
        env: { ...commonEnv, VELA_CONTROL_KEY: MEMBER.controlKey },
      },
    ]);
    const ownerPage = cluster.clients['owner-design-system']!.page;
    const memberPage = cluster.clients['member-design-system']!.page;
    const memberCatalogRequests = {
      designSystems: 0,
      plugins: 0,
      skills: 0,
    };
    memberPage.on('request', (request) => {
      const url = new URL(request.url());
      if (request.method() !== 'GET') return;
      if (url.pathname === '/api/design-systems') memberCatalogRequests.designSystems += 1;
      if (url.pathname === '/api/plugins') memberCatalogRequests.plugins += 1;
      if (url.pathname === '/api/skills') memberCatalogRequests.skills += 1;
    });
    await Promise.all([applyStandardMocks(ownerPage), applyStandardMocks(memberPage)]);

    await Promise.all([
      pinWorkspace(ownerPage, OWNER.memberId),
      pinWorkspace(memberPage, MEMBER.memberId),
    ]);

    await gotoHome(ownerPage);
    await ensureRailOpen(ownerPage);
    await ownerPage.getByTestId('workspace-switcher').click();
    await ownerPage.getByRole('menuitem', { name: 'Design System Team' }).click();
    await expect(ownerPage.getByTestId('workspace-switcher')).toContainText(
      'Design System Team',
    );

    const createResponse = await ownerPage.request.post('/api/design-systems', {
      data: {
        title: 'Shared Product Language',
        summary: 'A Team-owned system visible in project creation.',
        category: 'Custom',
        status: 'published',
      },
      headers: workspaceHeaders(OWNER),
      timeout: T.long,
    });
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const created = await createResponse.json() as {
      id?: string;
      designSystem?: { id?: string };
    };
    const designSystemId = created.id ?? created.designSystem?.id;
    expect(designSystemId).toBeTruthy();

    const workspaceResponse = await ownerPage.request.post(
      `/api/design-systems/${encodeURIComponent(designSystemId!)}/workspace`,
      {
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(workspaceResponse.ok(), await workspaceResponse.text()).toBeTruthy();
    const workspace = await workspaceResponse.json() as { project?: { id?: string } };
    const projectId = workspace.project?.id;
    expect(projectId).toBeTruthy();

    await writeLogoProjectFile(
      ownerPage,
      projectId!,
      'brand.json',
      JSON.stringify(sharedLogoBrand()),
    );
    await writeLogoProjectFile(ownerPage, projectId!, 'assets/logo.svg', sharedLogoSvg());
    const syncResponse = await ownerPage.request.post(
      `/api/design-systems/${encodeURIComponent(designSystemId!)}/sync-assets`,
      { headers: workspaceHeaders(OWNER), timeout: T.long },
    );
    expect(syncResponse.ok(), await syncResponse.text()).toBeTruthy();

    await ownerPage.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
    await expectProjectSharedLogo(
      ownerPage,
      'Shared Product Language',
      OWNER.memberId,
    );

    await gotoDesignSystems(ownerPage);
    await ownerPage.getByRole('tab', { name: /Your systems/i }).click();
    const ownerCard = ownerPage.getByTestId(`design-system-card-${designSystemId}`);
    await expect(ownerCard).toBeVisible({ timeout: T.xlong });
    await ownerCard.click();
    await expectSharedLogo(
      ownerPage.getByTestId(`design-system-detail-${designSystemId}`),
      'Shared Product Language',
      OWNER.memberId,
    );

    const shareResponse = await ownerPage.request.post(
      `/api/workspace/design-systems/${encodeURIComponent(designSystemId!)}/share`,
      {
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(shareResponse.ok(), await shareResponse.text()).toBeTruthy();

    // The member has never visited the Design Systems management surface.
    // Opening Home must prime the Team materialization before reading the
    // unified catalog used by this picker.
    await gotoHome(memberPage);
    await ensureRailOpen(memberPage);
    await memberPage.getByTestId('workspace-switcher').click();
    await memberPage.getByRole('menuitem', { name: 'Design System Team' }).click();
    await expect(memberPage.getByTestId('workspace-switcher')).toContainText(
      'Design System Team',
    );
    // The hub stream is leased by an explicit Workspace billing interest.
    // Wait for the same lease the open shell owns before retracting; otherwise
    // the fake hub can emit before this member daemon has joined the stream,
    // turning a realtime assertion into the 15-second poll fallback path.
    const billingResponse = await memberPage.request.get(
      `/api/workspace/billing?scope=workspace&workspaceId=${WORKSPACE_ID}`,
      { headers: workspaceHeaders(MEMBER), timeout: T.long },
    );
    expect(billingResponse.ok(), await billingResponse.text()).toBeTruthy();
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.long },
    ).toBeGreaterThan(0);
    await memberPage.getByTestId('home-hero-design-system-trigger').click();
    const picker = memberPage.getByTestId('project-ds-picker-popover');
    await expect(picker).toBeVisible();
    await expect(picker.getByTestId('project-ds-picker-group-team')).toBeVisible({
      timeout: T.xlong,
    });
    const teamOption = picker.getByTestId(`project-ds-picker-option-${designSystemId}`);
    await expect(teamOption).toContainText('Shared Product Language');
    await teamOption.click();
    await expect(memberPage.getByTestId('home-hero-design-system-trigger')).toContainText(
      'Shared Product Language',
    );

    await gotoDesignSystems(memberPage);
    await memberPage.getByRole('tab', { name: /^Team/ }).click();
    const memberCard = memberPage.getByTestId(`design-system-card-${designSystemId}`);
    await expect(memberCard).toBeVisible({ timeout: T.xlong });
    await memberCard.click();
    await expectSharedLogo(
      memberPage.getByTestId(`design-system-detail-${designSystemId}`),
      'Shared Product Language',
      MEMBER.memberId,
    );
    await gotoHome(memberPage);
    await ensureRailOpen(memberPage);
    await expect(memberPage.getByTestId('workspace-switcher')).toContainText(
      'Design System Team',
    );
    await expect(memberPage.getByTestId('home-hero-design-system-trigger')).toContainText(
      'Shared Product Language',
    );

    // Returning from a hidden-tab gap is the browser-level reconnect signal.
    // Because thin resource events are not replayed, the shell must re-read
    // every Team resource catalog rather than guessing which kind changed.
    const catalogRequestsBeforeReconnect = { ...memberCatalogRequests };
    await memberPage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(
      () => (
        memberCatalogRequests.designSystems > catalogRequestsBeforeReconnect.designSystems
        && memberCatalogRequests.plugins > catalogRequestsBeforeReconnect.plugins
        && memberCatalogRequests.skills > catalogRequestsBeforeReconnect.skills
      ),
      { timeout: T.long },
    ).toBe(true);

    // Keep the member's real picker open while its upstream event stream is
    // unavailable. Restoring only the daemon-to-hub stream must invalidate the
    // continuously connected browser after missed shares, updates, and
    // retractions; reopening Home or visiting Design Systems would hide the
    // stale-catalog bug this witness is intended to catch.
    await memberPage.getByTestId('home-hero-design-system-trigger').click();
    const openPicker = memberPage.getByTestId('project-ds-picker-popover');
    await expect(
      openPicker.getByTestId(`project-ds-picker-option-${designSystemId}`),
    ).toBeVisible();

    hub.setEventsAvailable(MEMBER.memberId, false);
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.long },
    ).toBe(0);
    const missedCreateResponse = await ownerPage.request.post('/api/design-systems', {
      data: {
        title: 'Missed Shared Language',
        summary: 'Shared while the member event stream is unavailable.',
        category: 'Custom',
        status: 'published',
      },
      headers: workspaceHeaders(OWNER),
      timeout: T.long,
    });
    expect(missedCreateResponse.ok(), await missedCreateResponse.text()).toBeTruthy();
    const missedCreated = await missedCreateResponse.json() as {
      id?: string;
      designSystem?: { id?: string };
    };
    const missedDesignSystemId = missedCreated.id ?? missedCreated.designSystem?.id;
    expect(missedDesignSystemId).toBeTruthy();
    const missedWorkspaceResponse = await ownerPage.request.post(
      `/api/design-systems/${encodeURIComponent(missedDesignSystemId!)}/workspace`,
      { headers: workspaceHeaders(OWNER), timeout: T.long },
    );
    expect(
      missedWorkspaceResponse.ok(),
      await missedWorkspaceResponse.text(),
    ).toBeTruthy();
    const missedShareResponse = await ownerPage.request.post(
      `/api/workspace/design-systems/${encodeURIComponent(missedDesignSystemId!)}/share`,
      { headers: workspaceHeaders(OWNER), timeout: T.long },
    );
    expect(missedShareResponse.ok(), await missedShareResponse.text()).toBeTruthy();
    hub.setEventsAvailable(MEMBER.memberId, true);
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.xlong },
    ).toBeGreaterThan(0);
    // Split daemon convergence from browser invalidation in the failure
    // witness. This read does not materialize Team resources; it only observes
    // the unified local catalog that reconnect reconciliation must have
    // committed before emitting the downstream design_system invalidation.
    await expect.poll(async () => {
      const response = await memberPage.request.get('/api/design-systems', {
        headers: workspaceHeaders(MEMBER),
        timeout: T.long,
      });
      if (!response.ok()) return null;
      const body = await response.json() as {
        designSystems?: Array<{ id?: string; title?: string }>;
      };
      return body.designSystems?.find(
        (system) => system.id === missedDesignSystemId,
      )?.title ?? null;
    }, { timeout: T.xlong }).toBe('Missed Shared Language');
    await expect(
      openPicker.getByTestId(`project-ds-picker-option-${missedDesignSystemId}`),
    ).toContainText('Missed Shared Language', { timeout: T.xlong });

    hub.setEventsAvailable(MEMBER.memberId, false);
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.long },
    ).toBe(0);
    const updateResponse = await ownerPage.request.patch(
      `/api/design-systems/${encodeURIComponent(designSystemId!)}`,
      {
        data: { title: 'Shared Product Language v2' },
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(updateResponse.ok(), await updateResponse.text()).toBeTruthy();
    const republishResponse = await ownerPage.request.post(
      `/api/workspace/design-systems/${encodeURIComponent(designSystemId!)}/share`,
      { headers: workspaceHeaders(OWNER), timeout: T.long },
    );
    expect(republishResponse.ok(), await republishResponse.text()).toBeTruthy();
    hub.setEventsAvailable(MEMBER.memberId, true);
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.xlong },
    ).toBeGreaterThan(0);
    await expect(
      openPicker.getByTestId(`project-ds-picker-option-${designSystemId}`),
    ).toContainText('Shared Product Language v2', { timeout: T.xlong });

    const catalogRequestsBeforeRetraction = memberCatalogRequests.designSystems;
    hub.setEventsAvailable(MEMBER.memberId, false);
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.long },
    ).toBe(0);
    const retractResponse = await ownerPage.request.delete(
      `/api/workspace/design-systems/${encodeURIComponent(designSystemId!)}/share`,
      {
        headers: workspaceHeaders(OWNER),
        timeout: T.long,
      },
    );
    expect(retractResponse.ok(), await retractResponse.text()).toBeTruthy();
    await hub.waitForEvent(
      (event) =>
        event.type === 'team-resources-changed'
        && event.resourceKind === 'design_system'
        && event.resourceStatus === 'retracted',
      T.long,
    );
    hub.setEventsAvailable(MEMBER.memberId, true);
    await expect.poll(
      () => hub.eventSubscriberCount(MEMBER.memberId),
      { timeout: T.xlong },
    ).toBeGreaterThan(0);
    await expect.poll(
      () => memberCatalogRequests.designSystems,
      { timeout: T.long },
    ).toBeGreaterThan(catalogRequestsBeforeRetraction);
    await expect(
      openPicker.getByTestId(`project-ds-picker-option-${designSystemId}`),
    ).toHaveCount(0, { timeout: T.xlong });
    await expect(memberPage.getByTestId('home-hero-design-system-trigger')).not.toContainText(
      'Shared Product Language',
    );
    await memberPage.keyboard.press('Escape');

    // Switching to Personal must clear Team A synchronously at the identity
    // boundary; a late Team catalog response or cached picker state may not
    // paint the old resource under the new Workspace.
    await memberPage.getByTestId('workspace-switcher').click();
    await memberPage.getByRole('menuitem', {
      name: `${MEMBER.name} workspace`,
    }).click();
    await expect(memberPage.getByTestId('workspace-switcher')).toContainText(
      `${MEMBER.name} workspace`,
    );
    await memberPage.getByTestId('home-hero-design-system-trigger').click();
    const personalPicker = memberPage.getByTestId('project-ds-picker-popover');
    await expect(
      personalPicker.getByTestId(`project-ds-picker-option-${designSystemId}`),
    ).toHaveCount(0);
    await expect(personalPicker.getByTestId('project-ds-picker-group-team')).toHaveCount(0);
  } catch (error) {
    failed = true;
    await testInfo.attach('fake-team-design-system-hub-log', {
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

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, {
    timeout: T.xlong,
  });
}

async function gotoDesignSystems(page: Page): Promise<void> {
  await page.goto('/design-systems', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, {
    timeout: T.xlong,
  });
}

async function writeLogoProjectFile(
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

async function expectSharedLogo(
  container: ReturnType<Page['getByTestId']>,
  alt: string,
  workspaceMemberId: string,
): Promise<void> {
  const logo = container.getByTestId('design-kit-logo-section').getByRole('img', { name: alt });
  await expect(logo).toBeVisible({ timeout: T.xlong });
  await expect.poll(
    () => logo.evaluate((image: HTMLImageElement) => ({
      complete: image.complete,
      width: image.naturalWidth,
      height: image.naturalHeight,
      workspaceMemberId: new URL(image.src).searchParams.get('workspaceMemberId'),
    })),
    { timeout: T.long },
  ).toEqual({ complete: true, width: 320, height: 160, workspaceMemberId });
}

async function expectProjectSharedLogo(
  page: Page,
  alt: string,
  workspaceMemberId: string,
): Promise<void> {
  const tab = page.getByTestId('design-system-project-tab');
  const panel = page.getByTestId('design-system-project-tab-panel');
  const logo = page
    .getByTestId('design-system-project-kit')
    .getByTestId('design-kit-logo-section')
    .getByRole('img', { name: alt });
  let matchingSince = 0;

  await expect.poll(async () => {
    const tabReady = await tab.getAttribute('aria-selected') === 'true'
      && await panel.isVisible();
    if (!tabReady) {
      matchingSince = 0;
      await tab.click({ timeout: T.short });
      return 0;
    }

    const image = await logo.evaluate((element: HTMLImageElement) => ({
      complete: element.complete,
      width: element.naturalWidth,
      height: element.naturalHeight,
      workspaceMemberId: new URL(element.src).searchParams.get('workspaceMemberId'),
    })).catch(() => null);
    const matches = image?.complete === true
      && image.width === 320
      && image.height === 160
      && image.workspaceMemberId === workspaceMemberId;
    if (!matches) {
      matchingSince = 0;
      return 0;
    }
    if (matchingSince === 0) matchingSince = Date.now();
    return Date.now() - matchingSince;
  }, {
    message: 'project Design system tab and scoped logo should survive workspace restoration',
    timeout: T.xlong,
  }).toBeGreaterThanOrEqual(500);
}

function workspaceHeaders(identity: typeof OWNER | typeof MEMBER): Record<string, string> {
  return {
    'x-od-workspace-id': WORKSPACE_ID,
    'x-od-workspace-type': 'team',
    'x-od-workspace-member-id': identity.memberId,
    'x-od-workspace-role': identity.role,
    'x-od-workspace-member-status': 'active',
    'x-od-workspace-lifecycle-state': 'active',
    'x-od-workspace-can-share-projects': identity.role === 'owner' ? 'true' : 'false',
    'x-od-workspace-can-write-synced-files': identity.role === 'owner' ? 'true' : 'false',
    'x-od-workspace-can-manage-shared-resources': identity.role === 'owner' ? 'true' : 'false',
  };
}

function sharedLogoSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">',
    '<rect width="320" height="160" rx="32" fill="#1867c0"/>',
    '<text x="160" y="102" text-anchor="middle" font-family="sans-serif" font-size="72" fill="white">SL</text>',
    '</svg>',
  ].join('');
}

function sharedLogoBrand() {
  return {
    name: 'Shared Product Language',
    tagline: 'One visual language for the Team.',
    description: 'A Team-owned design system with a real logo asset.',
    sourceUrl: '',
    logo: {
      primary: 'assets/logo.svg',
      alternates: [],
      notes: 'Shared logo regression witness.',
    },
    colors: [{
      role: 'accent',
      hex: '#1867c0',
      oklch: '',
      name: 'Team blue',
      usage: 'Primary actions',
    }],
    typography: {
      display: { family: 'Inter', fallbacks: ['sans-serif'], weights: [700] },
      body: { family: 'Inter', fallbacks: ['sans-serif'], weights: [400] },
    },
    voice: {
      adjectives: ['clear'],
      tone: 'direct',
      messagingPillars: ['Build together'],
      vocabulary: { use: ['team'], avoid: ['silo'] },
    },
    imagery: { style: 'graphic', subjects: [], treatment: 'flat', avoid: [] },
    layout: {
      radius: '12px',
      borderWeight: '1px',
      spacing: '8px grid',
      postureRules: ['Keep layouts open'],
    },
  };
}
