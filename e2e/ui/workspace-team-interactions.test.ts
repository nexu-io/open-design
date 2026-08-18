import type { Page, Route } from '@playwright/test';

import { expect, test } from '@/playwright/suite';
import { applyStandardMocks } from '@/playwright/mock-factory';
import { ensureRailOpen } from '@/playwright/rail';
import { T } from '@/timeouts';

type WorkspaceRole = 'owner' | 'member';

type WorkspaceFixture = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: 'personal' | 'team';
  workspaceMemberId: string;
  role: WorkspaceRole;
  memberStatus: 'active';
  lifecycleState: 'active' | 'locked';
  billingState: 'free' | 'inactive' | 'active';
  planId: string | null;
  seatSummary: {
    seatLimit: number;
    usedSeats: number;
    availableSeats: number;
    isSeatFull: boolean;
  };
  permissions: {
    canInviteMembers: boolean;
    canManageBilling: boolean;
    canViewWorkspaceSettings: boolean;
    canManageSharedResources: boolean;
    canShareProjects: boolean;
    canWriteSyncedFiles: boolean;
  };
  workspaceSettingsUrl: string;
};

const PERSONAL: WorkspaceFixture = workspace({
  workspaceId: 'ui-ws-personal',
  workspaceName: 'Ada workspace',
  workspaceType: 'personal',
  workspaceMemberId: 'ui-wm-personal',
  role: 'owner',
});

const TEAM_OWNER: WorkspaceFixture = workspace({
  workspaceId: 'ui-ws-team',
  workspaceName: 'Atlas Team',
  workspaceType: 'team',
  workspaceMemberId: 'ui-wm-owner',
  role: 'owner',
});

const TEAM_MEMBER: WorkspaceFixture = workspace({
  workspaceId: 'ui-ws-member',
  workspaceName: 'Readonly Team',
  workspaceType: 'team',
  workspaceMemberId: 'ui-wm-member',
  role: 'member',
});

const TEAM_SECOND: WorkspaceFixture = workspace({
  workspaceId: 'ui-ws-team-second',
  workspaceName: 'Beacon Team',
  workspaceType: 'team',
  workspaceMemberId: 'ui-wm-second-owner',
  role: 'owner',
});

const TEAM_LOCKED: WorkspaceFixture = {
  ...TEAM_OWNER,
  workspaceName: 'Locked Atlas Team',
  lifecycleState: 'locked',
  billingState: 'inactive',
  permissions: {
    ...TEAM_OWNER.permissions,
    canInviteMembers: false,
    canManageSharedResources: false,
    canShareProjects: false,
    canWriteSyncedFiles: false,
  },
};

const TEAM_UNLOCKED: WorkspaceFixture = {
  ...TEAM_OWNER,
  workspaceName: TEAM_LOCKED.workspaceName,
};

const TEAM_FULL: WorkspaceFixture = {
  ...TEAM_OWNER,
  workspaceName: 'Full Atlas Team',
  seatSummary: {
    seatLimit: 2,
    usedSeats: 2,
    availableSeats: 0,
    isSeatFull: true,
  },
};

const TEAM_UNKNOWN_SEATS: WorkspaceFixture = {
  ...TEAM_OWNER,
  workspaceName: 'Seat state loading',
  // Deliberately model the pre-authority window. The production resolver must
  // not infer spare capacity from permissions alone.
  seatSummary: undefined as never,
};

type WorkspaceMocks = {
  activeBodies: Array<{ workspaceId?: string; workspaceMemberId?: string }>;
  inviteBodies: Array<{
    invites?: Array<{ email?: string; role?: string }>;
  }>;
  activeWorkspaceId: () => string;
  setCurrent: (workspace: WorkspaceFixture) => void;
  setBalance: (balanceUsd: string) => void;
};

type WorkspaceProjectMove = {
  body: { visibility?: string };
  headers: Record<string, string>;
};

const LOCAL_TEAM_DRAFT = {
  id: 'ui-team-draft',
  name: 'Workspace launch plan',
  skillId: null,
  designSystemId: null,
  createdAt: 1_720_000_000_000,
  updatedAt: 1_720_000_001_000,
  metadata: {
    kind: 'prototype',
    nameSource: 'user',
  },
};

const PERSONAL_DRAFT = {
  ...LOCAL_TEAM_DRAFT,
  id: 'ui-personal-draft',
  name: 'Personal roadmap',
};

const SWITCHED_TEAM_DRAFT = {
  ...LOCAL_TEAM_DRAFT,
  id: 'ui-switched-team-draft',
  name: 'Atlas launch board',
};

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
});

test('[P0] workspace switcher changes identity, returns Home, and exposes team navigation', async ({
  page,
}) => {
  const mocks = await wireWorkspaceMocks(page, PERSONAL, [PERSONAL, TEAM_OWNER]);
  await gotoHome(page);
  await ensureRailOpen(page);

  await expect(page.getByTestId('workspace-switcher')).toContainText('Ada workspace');
  await expect(page.getByTestId('entry-nav-drafts')).toContainText('Personal projects');
  await expect(page.getByTestId('entry-nav-all-projects')).toHaveCount(0);

  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);

  await page.getByTestId('workspace-switcher').click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Ada workspace' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await menu.getByRole('menuitem', { name: 'Atlas Team' }).click();

  await expect.poll(() => mocks.activeBodies).toEqual([
    {
      workspaceId: TEAM_OWNER.workspaceId,
      workspaceMemberId: TEAM_OWNER.workspaceMemberId,
    },
  ]);
  await expect(page.getByTestId('workspace-switcher')).toContainText('Atlas Team');
  await expect(page.getByTestId('entry-view-home')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('entry-nav-drafts')).toContainText('Personal projects');
  await expect(page.getByTestId('entry-nav-all-projects')).toContainText('Team projects');
  await expect(page.getByTestId('entry-nav-all-projects')).toBeVisible();

  await page.getByTestId('workspace-switcher').click();
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Atlas Team' }),
  ).toHaveAttribute('aria-current', 'true');
});

test('[P1] New team deep-links Vela creation and exposes the created workspace on return', async ({
  page,
}) => {
  // Directory reads share a 1s TTL (`coalescedGet`). Install the clock before
  // navigation so we can expire that product window without a real sleep.
  await page.clock.install();
  const directory = [PERSONAL];
  const mocks = await wireWorkspaceMocks(page, PERSONAL, directory);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('workspace-switcher').click();
  const createTeam = page.getByTestId('entry-nav-create-team');
  const href = new URL((await createTeam.getAttribute('href'))!);
  expect(href.origin).toBe('https://console.example.test');
  expect(href.pathname).toBe('/dashboard');
  expect(href.searchParams.get('workspaceId')).toBe(PERSONAL.workspaceId);
  expect(href.searchParams.get('workspace')).toBe('create');
  await expect(createTeam).toHaveAttribute('target', '_blank');

  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 } });
  directory.push(TEAM_SECOND);
  // Directory reads are deliberately coalesced for one second. A real console
  // roundtrip exceeds that window; jump past it so this assertion exercises
  // the return revalidation instead of the warm response from the first open.
  await page.clock.fastForward(1_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await page.getByTestId('workspace-switcher').click();
  const returnedTeam = page.getByRole('menu').getByRole('menuitem', {
    name: TEAM_SECOND.workspaceName,
  });
  await expect(returnedTeam).toBeVisible({ timeout: T.long });
  await returnedTeam.click();
  await expect.poll(() => mocks.activeBodies).toEqual([{
    workspaceId: TEAM_SECOND.workspaceId,
    workspaceMemberId: TEAM_SECOND.workspaceMemberId,
  }]);
  await expect(page.getByTestId('workspace-switcher')).toContainText(
    TEAM_SECOND.workspaceName,
  );
});

test('[P0] failed workspace switch stays on the original identity and keeps retry available', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, PERSONAL, [PERSONAL, TEAM_OWNER]);
  let failedSwitches = 0;
  await page.route('**/api/workspace/active', async (route) => {
    failedSwitches += 1;
    await route.fulfill({ status: 503, json: { error: 'workspace_switch_unavailable' } });
  });
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('entry-nav-design-systems').click();
  await expect(page).toHaveURL(/\/design-systems$/);
  await page.getByTestId('workspace-switcher').click();
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Atlas Team' }).click();

  await expect.poll(() => failedSwitches).toBe(1);
  await expect(page.getByTestId('workspace-switcher')).toContainText('Ada workspace');
  await expect(page.getByTestId('entry-nav-all-projects')).toHaveCount(0);
  await expect(page).toHaveURL(/\/design-systems$/);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Atlas Team' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Ada workspace' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('[P0] workspace switch clears the previous project list before the next scope resolves', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, PERSONAL, [PERSONAL, TEAM_OWNER]);
  let releaseTeamProjects!: () => void;
  const teamProjectsGate = new Promise<void>((resolve) => {
    releaseTeamProjects = resolve;
  });
  let teamProjectsRequested = false;

  await page.route('**/api/workspaces/*/projects**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET' || !url.pathname.endsWith('/projects')) {
      await route.fallback();
      return;
    }
    if (url.pathname.includes(`/${PERSONAL.workspaceId}/`)) {
      await route.fulfill({
        json: {
          projects: [
            scopedProjectSummary(PERSONAL_DRAFT, PERSONAL, 'personal'),
          ],
        },
      });
      return;
    }
    if (url.pathname.includes(`/${TEAM_OWNER.workspaceId}/`)) {
      teamProjectsRequested = true;
      await teamProjectsGate;
      await route.fulfill({
        json: {
          projects: [
            scopedProjectSummary(SWITCHED_TEAM_DRAFT, TEAM_OWNER, 'personal'),
          ],
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/*/files**', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });

  await gotoHome(page);
  await ensureRailOpen(page);
  await expect(visibleProjectCard(page, PERSONAL_DRAFT.id)).toBeVisible();

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Atlas Team' }).click();

  await expect.poll(() => teamProjectsRequested).toBe(true);
  await expect(page.getByTestId('workspace-switcher')).toContainText('Atlas Team');
  await expect(visibleProjectCard(page, PERSONAL_DRAFT.id)).toHaveCount(0);
  await expect(visibleProjectCard(page, SWITCHED_TEAM_DRAFT.id)).toHaveCount(0);

  releaseTeamProjects();
  await expect(visibleProjectCard(page, SWITCHED_TEAM_DRAFT.id)).toBeVisible();
  await expect(visibleProjectCard(page, PERSONAL_DRAFT.id)).toHaveCount(0);
});

test('[P1] an unnamed legacy workspace row keeps the switcher usable with a stable id fallback', async ({
  page,
}) => {
  await page.addInitScript(
    ({ workspaceId, workspaceMemberId }) => {
      window.sessionStorage.setItem(
        'od.workspaceSelection.v1',
        JSON.stringify({ workspaceId, workspaceMemberId }),
      );
    },
    {
      workspaceId: TEAM_OWNER.workspaceId,
      workspaceMemberId: TEAM_OWNER.workspaceMemberId,
    },
  );
  await wireWorkspaceMocks(page, TEAM_OWNER, [PERSONAL, TEAM_OWNER]);
  await page.route('**/api/workspace/directory', async (route) => {
    const unnamed = { ...TEAM_OWNER } as Partial<typeof TEAM_OWNER>;
    delete unnamed.workspaceName;
    await route.fulfill({
      json: {
        items: [PERSONAL, unnamed],
        activeWorkspaceId: null,
      },
    });
  });
  await page.route('**/api/workspace/context', async (route) => {
    const context: Partial<WorkspaceFixture> = { ...TEAM_OWNER };
    delete context.workspaceName;
    await route.fulfill({ json: { context } });
  });

  await gotoHome(page);
  await ensureRailOpen(page);
  await expect(page.getByTestId('workspace-switcher')).toContainText(TEAM_OWNER.workspaceId);
  await page.getByTestId('workspace-switcher').click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: TEAM_OWNER.workspaceId })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(menu.getByRole('menuitem', { name: PERSONAL.workspaceName })).toBeVisible();
});

test('[P0] switching teams invalidates the shared-project catalog instead of reusing the previous team cache', async ({
  page,
}) => {
  const mocks = await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER, TEAM_SECOND]);
  const atlasShared = teamProject('ui-atlas-shared', 'Atlas shared brief', 'ui-atlas-member');
  const beaconShared = teamProject(
    'ui-beacon-shared',
    'Beacon shared brief',
    'ui-beacon-member',
  );

  await page.route('**/api/workspace/projects/team', async (route) => {
    await route.fulfill({
      json: {
        projects:
          mocks.activeWorkspaceId() === TEAM_OWNER.workspaceId
            ? [atlasShared]
            : [beaconShared],
      },
    });
  });
  await page.route('**/api/workspaces/*/projects**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/*/files**', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });

  await gotoHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-all-projects').click();
  await expect(visibleProjectCard(page, atlasShared.projectId)).toBeVisible();

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Beacon Team' }).click();
  await expect(page.getByTestId('workspace-switcher')).toContainText('Beacon Team');
  await page.getByTestId('entry-nav-all-projects').click();

  await expect(visibleProjectCard(page, beaconShared.projectId)).toBeVisible();
  await expect(visibleProjectCard(page, atlasShared.projectId)).toHaveCount(0);
});

test('[P0] account replacement never paints the previous account workspace or projects while the new scope loads', async ({
  page,
}) => {
  const accountA = {
    workspace: TEAM_OWNER,
    user: {
      id: 'ui-account-a',
      email: 'account-a@example.com',
      name: 'Account A',
    },
    project: {
      ...SWITCHED_TEAM_DRAFT,
      id: 'ui-account-a-project',
      name: 'Account A confidential launch',
    },
  };
  const accountBWorkspace = workspace({
    workspaceId: 'ui-account-b-workspace',
    workspaceName: 'Account B workspace',
    workspaceType: 'personal',
    workspaceMemberId: 'ui-account-b-member',
    role: 'owner',
  });
  const accountB = {
    workspace: accountBWorkspace,
    user: {
      id: 'ui-account-b',
      email: 'account-b@example.com',
      name: 'Account B',
    },
    project: {
      ...PERSONAL_DRAFT,
      id: 'ui-account-b-project',
      name: 'Account B private roadmap',
    },
  };
  let activeAccount = accountA;
  let releaseAccountBProjects!: () => void;
  const accountBProjectsGate = new Promise<void>((resolve) => {
    releaseAccountBProjects = resolve;
  });
  let accountBProjectsRequested = false;

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        loginInFlight: false,
        profile: 'test',
        user: {
          ...activeAccount.user,
          plan: activeAccount.workspace.planId ?? 'free',
        },
        account: {
          plan: activeAccount.workspace.planId ?? 'free',
          balanceUsd: activeAccount === accountA ? '91.00' : '0.00',
        },
        configPath: '/tmp/.amr/config.json',
      },
    });
  });
  await page.route('**/api/workspace/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname === '/api/workspace/context' && request.method() === 'GET') {
      await route.fulfill({ json: { context: activeAccount.workspace } });
      return;
    }
    if (pathname === '/api/workspace/directory' && request.method() === 'GET') {
      await route.fulfill({
        json: {
          items: [directoryItem(activeAccount.workspace)],
          activeWorkspaceId: activeAccount.workspace.workspaceId,
        },
      });
      return;
    }
    if (pathname === '/api/workspace/billing' && request.method() === 'GET') {
      const balanceUsd = activeAccount === accountA ? '91.00' : '0.00';
      await route.fulfill({
        json: {
          summary: null,
          workspaceBalance: {
            workspaceId: activeAccount.workspace.workspaceId,
            workspaceMemberId: activeAccount.workspace.workspaceMemberId,
            balanceUsd,
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: '2026-07-31T00:00:00.000Z',
          },
        },
      });
      return;
    }
    if (pathname === '/api/workspace/projects/team' && request.method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/workspaces/*/projects**', async (route) => {
    const request = route.request();
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    const accountAtRequest = activeAccount;
    if (accountAtRequest === accountB) {
      accountBProjectsRequested = true;
      await accountBProjectsGate;
    }
    await route.fulfill({
      json: {
        projects: [
          scopedProjectSummary(
            accountAtRequest.project,
            accountAtRequest.workspace,
            'personal',
          ),
        ],
      },
    });
  });
  await page.route('**/api/projects/*/files**', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });

  await gotoHome(page);
  await ensureRailOpen(page);
  await expect(visibleProjectCard(page, accountA.project.id)).toBeVisible();
  await expect(page.getByTestId('workspace-switcher')).toContainText(
    accountA.workspace.workspaceName,
  );

  activeAccount = accountB;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(() => accountBProjectsRequested).toBe(true);

  // Account A's warm cache must be discarded synchronously. Holding B's
  // project response open makes any stale-frame leak deterministic.
  await expect(visibleProjectCard(page, accountA.project.id)).toHaveCount(0);
  await expect(page.getByText(accountA.workspace.workspaceName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(accountA.project.name, { exact: true })).toHaveCount(0);

  releaseAccountBProjects();
  await page.getByText('Loading Open Design…').waitFor({
    state: 'hidden',
    timeout: T.long,
  });
  await ensureRailOpen(page);
  await expect(page.getByTestId('workspace-switcher')).toContainText(
    accountB.workspace.workspaceName,
  );
  await expect(visibleProjectCard(page, accountB.project.id)).toBeVisible();
  await expect(visibleProjectCard(page, accountA.project.id)).toHaveCount(0);
});

test('[P1] two windows for one account keep Personal and Team billing scopes isolated', async ({
  context,
  page: personalPage,
}) => {
  test.fail(true, 'The #5517 account menu no longer exposes either Personal or Team credit balances.');
  const teamPage = await context.newPage();
  await applyStandardMocks(teamPage);
  let teamBalanceUsd = '19.00';

  await Promise.all([
    pinWindowWorkspace(personalPage, PERSONAL),
    pinWindowWorkspace(teamPage, TEAM_OWNER),
  ]);
  await Promise.all([
    wireMultiWindowWorkspaceAuthority(personalPage, () => teamBalanceUsd),
    wireMultiWindowWorkspaceAuthority(teamPage, () => teamBalanceUsd),
  ]);

  await Promise.all([gotoHome(personalPage), gotoHome(teamPage)]);
  await expect(personalPage.getByTestId('workspace-switcher')).toContainText(
    PERSONAL.workspaceName,
  );
  await expect(teamPage.getByTestId('workspace-switcher')).toContainText(
    TEAM_OWNER.workspaceName,
  );

  await Promise.all([
    openAccountMenu(personalPage),
    openAccountMenu(teamPage),
  ]);
  const personalCredits = personalPage.getByTestId('entry-nav-credits-row');
  const teamCredits = teamPage.getByTestId('entry-nav-credits-row');
  await expect(personalCredits).toContainText('$7.00');
  await expect(teamCredits).toContainText('$19.00');

  // A Team-wallet invalidation belongs only to the Team window. Both pages
  // share one browser account and localStorage, so this catches accidental
  // process-global selection or billing-cache keys that omit workspace scope.
  teamBalanceUsd = '11.25';
  await teamPage.evaluate(() => {
    window.dispatchEvent(new Event('od:workspace-billing-refresh'));
  });
  await expect(teamCredits).toContainText('$11.25', { timeout: T.long });
  await expect(personalCredits).toContainText('$7.00');
  await expect(personalPage.getByTestId('workspace-switcher')).toContainText(
    PERSONAL.workspaceName,
  );
});

test('[P0] team owner completes a multi-row invite with explicit roles', async ({ page }) => {
  await page.addInitScript(
    ({ workspaceId, workspaceMemberId }) => {
      window.sessionStorage.setItem(
        'od.workspaceSelection.v1',
        JSON.stringify({ workspaceId, workspaceMemberId }),
      );
    },
    {
      workspaceId: TEAM_OWNER.workspaceId,
      workspaceMemberId: TEAM_OWNER.workspaceMemberId,
    },
  );
  const mocks = await wireWorkspaceMocks(page, TEAM_OWNER, [PERSONAL, TEAM_OWNER]);
  await gotoHome(page);
  await ensureRailOpen(page);
  await expect(page.getByTestId('workspace-switcher')).toContainText(TEAM_OWNER.workspaceName);

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }).click();

  const dialog = page.getByRole('dialog', { name: 'Invite members' });
  await expect(dialog).toBeVisible();
  const emailInputs = dialog.getByPlaceholder('Enter email address…');
  await emailInputs.first().fill('admin@example.com');

  await dialog.getByRole('button', { name: 'Assign role' }).first().click();
  await page.getByRole('listbox').getByRole('option', { name: 'Admin' }).click();

  await dialog.getByRole('button', { name: 'Add member' }).click();
  await expect(emailInputs).toHaveCount(2);
  await emailInputs.nth(1).fill('member@example.com');
  await dialog.getByRole('button', { name: 'Confirm and invite' }).click();

  await expect.poll(() => mocks.inviteBodies).toEqual([
    {
      invites: [
        { email: 'admin@example.com', role: 'admin' },
        { email: 'member@example.com', role: 'member' },
      ],
    },
  ]);
  await expect(dialog.getByRole('button', { name: 'Invitation sent' })).toBeVisible();
  await expect(dialog).toHaveCount(0, { timeout: 5_000 });
});

test('[P1] stale invite success timer does not close a reopened dialog', async ({ page }) => {
  await page.addInitScript(
    ({ workspaceId, workspaceMemberId }) => {
      window.sessionStorage.setItem(
        'od.workspaceSelection.v1',
        JSON.stringify({ workspaceId, workspaceMemberId }),
      );
    },
    {
      workspaceId: TEAM_OWNER.workspaceId,
      workspaceMemberId: TEAM_OWNER.workspaceMemberId,
    },
  );
  await wireWorkspaceMocks(page, TEAM_OWNER, [PERSONAL, TEAM_OWNER]);
  await gotoHome(page);
  await ensureRailOpen(page);
  await page.clock.install();
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 60_000);

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }).click();

  const dialog = page.getByRole('dialog', { name: 'Invite members' });
  const emailInput = dialog.getByPlaceholder('Enter email address…').first();
  await emailInput.fill('first@example.com');
  await dialog.getByRole('button', { name: 'Confirm and invite' }).click();
  await expect(dialog.getByRole('button', { name: 'Invitation sent' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }).click();
  await expect(dialog).toBeVisible();
  await emailInput.fill('second@example.com');

  await page.clock.fastForward(999);
  await expect(dialog).toBeVisible();
  await expect(emailInput).toHaveValue('second@example.com');

  await page.clock.fastForward(1);

  await expect(dialog).toBeVisible();
  await expect(emailInput).toHaveValue('second@example.com');
});

test('[P0] full team routes every invite entry to Vela seat resolution without opening the local dialog', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const target = window as Window & typeof globalThis & {
      __workspaceInviteUrls?: string[];
    };
    target.__workspaceInviteUrls = [];
    window.open = ((url?: string | URL) => {
      target.__workspaceInviteUrls!.push(String(url ?? ''));
      return null;
    }) as typeof window.open;
  });
  await wireWorkspaceMocks(page, TEAM_FULL, [TEAM_FULL]);
  await page.route('**/api/workspace/projects/team', async (route) => {
    await route.fulfill({
      json: {
        projects: [teamProject('ui-full-seat-shared', 'Capacity planning', 'ui-wm-owner')],
      },
    });
  });
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }).click();
  await expect(page.getByRole('dialog', { name: 'Invite members' })).toHaveCount(0);
  await expect.poll(() => inviteUrls(page)).toHaveLength(1);
  await expect.poll(async () => (await inviteUrls(page))[0]).toContain('invite=auto');
  await expect.poll(async () => (await inviteUrls(page))[0]).toContain(
    `workspaceId=${TEAM_FULL.workspaceId}`,
  );

  await page.getByTestId('entry-nav-all-projects').click();
  await page.getByRole('button', { name: 'Invite teammates' }).click();
  await expect(page.getByRole('dialog', { name: 'Invite members' })).toHaveCount(0);
  await expect.poll(() => inviteUrls(page)).toHaveLength(2);
  await expect.poll(async () => (await inviteUrls(page))[1]).toContain('invite=auto');
});

test('[P1] an already-open full team restores the local invite flow when a seat is released', async ({
  page,
}) => {
  // Context reads share a 1s TTL (`coalescedGet`). Install before navigation
  // so the product window can expire under a virtual clock.
  await page.clock.install();
  await page.addInitScript(() => {
    const target = window as Window & { __workspaceInviteUrls?: string[] };
    target.__workspaceInviteUrls = [];
    window.open = ((url?: string | URL) => {
      target.__workspaceInviteUrls!.push(String(url ?? ''));
      return null;
    }) as typeof window.open;
  });
  const workspaceMocks = await wireWorkspaceMocks(page, TEAM_FULL, [TEAM_FULL]);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }).click();
  await expect(page.getByRole('dialog', { name: 'Invite members' })).toHaveCount(0);
  await expect.poll(() => inviteUrls(page)).toHaveLength(1);

  // A teammate is removed in Vela while this shell remains mounted. The next
  // authoritative context refresh must stop treating the Team as full and
  // restore the in-product invitation path without a reload.
  workspaceMocks.setCurrent({
    ...TEAM_FULL,
    seatSummary: {
      seatLimit: 2,
      usedSeats: 1,
      availableSeats: 1,
      isSeatFull: false,
    },
  });
  // Context reads are coalesced for one second. The real member-management
  // roundtrip is slower than that; jump past the window so focus cannot
  // legitimately reuse the pre-removal full-seat snapshot.
  await page.clock.fastForward(1_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await page.getByTestId('workspace-switcher').click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }).click();
  await expect(page.getByRole('dialog', { name: 'Invite members' })).toBeVisible({
    timeout: T.long,
  });
  await expect.poll(() => inviteUrls(page)).toHaveLength(1);
});

test('[P0] unknown team seat state fails closed across rail and project surfaces', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_UNKNOWN_SEATS, [TEAM_UNKNOWN_SEATS]);
  await page.route('**/api/workspace/projects/team', async (route) => {
    await route.fulfill({
      json: {
        projects: [teamProject('ui-unknown-seat-shared', 'Seat loading project', 'ui-wm-owner')],
      },
    });
  });
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('workspace-switcher').click();
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }),
  ).toHaveCount(0);
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 } });
  await page.getByTestId('entry-nav-all-projects').click();
  await expect(page.getByRole('button', { name: 'Invite teammates' })).toHaveCount(0);
});

test('[P0] ordinary team member sees team projects but no invite or workspace-admin actions', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_MEMBER, [TEAM_MEMBER]);
  await gotoHome(page);
  await ensureRailOpen(page);

  await expect(page.getByTestId('entry-nav-all-projects')).toBeVisible();
  await expect(page.getByTestId('entry-nav-workspace-settings')).toHaveCount(0);

  await page.getByTestId('workspace-switcher').click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Readonly Team' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(menu.getByRole('menuitem', { name: 'Invite colleague' })).toHaveCount(0);
});

test('[P0] locked workspace removes invite and sharing capabilities while preserving the recovery settings exit', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_LOCKED, [TEAM_LOCKED]);
  await gotoHome(page);
  await ensureRailOpen(page);

  await expect(page.getByTestId('workspace-switcher')).toContainText('Locked Atlas Team');
  await page.getByTestId('workspace-switcher').click();
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }),
  ).toHaveCount(0);

  const settingsExit = page.getByTestId('entry-nav-workspace-settings');
  await expect(settingsExit).toBeVisible();
  await expect(settingsExit).toHaveAttribute('href', TEAM_LOCKED.workspaceSettingsUrl);
  await expect(page.getByTestId('entry-nav-all-projects')).toBeVisible();
});

test('[P0] an already-open locked workspace restores invite and sharing actions when authority unlocks', async ({
  page,
}) => {
  const workspaceMocks = await wireWorkspaceMocks(page, TEAM_LOCKED, [TEAM_LOCKED]);
  await wireWorkspaceProjectMocks(page);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('workspace-switcher').click();
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }),
  ).toHaveCount(0);
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 } });
  await page.getByTestId('entry-nav-drafts').click();
  const card = projectCard(page);
  await openProjectMenu(card);
  await expect(card.getByRole('menuitem', { name: 'Move to team space' })).toHaveCount(0);
  await card.getByRole('button', { name: 'More actions' }).click();
  await expect(card.getByRole('menu')).toHaveCount(0);

  // The same membership becomes active again while the shell stays mounted.
  // The next authoritative ambient refresh must restore capabilities without
  // treating this as an account/workspace identity replacement or reloading.
  workspaceMocks.setCurrent(TEAM_UNLOCKED);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
  });

  await expect(page.getByTestId('workspace-switcher')).toContainText('Locked Atlas Team', {
    timeout: T.long,
  });
  await page.getByTestId('workspace-switcher').click();
  await expect(
    page.getByRole('menu').getByRole('menuitem', { name: 'Invite colleague' }),
  ).toBeVisible({ timeout: T.long });
  await page.locator('.entry-nav-rail__menu-backdrop').click({ position: { x: 2, y: 2 } });
  await page.getByTestId('entry-nav-drafts').click();
  await expect(card).toBeVisible({ timeout: T.long });
  await expect(card.getByRole('button', { name: 'More actions' })).toBeVisible({
    timeout: T.long,
  });
  await openProjectMenu(card);
  await expect(page.getByRole('menuitem', { name: 'Move to team space' })).toBeVisible();
});

test('[P0] an already-open move flow fails closed when the workspace locks before commit', async ({
  page,
}) => {
  const workspaceMocks = await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  await wireWorkspaceProjectMocks(page);
  let rejectedMoves = 0;
  await page.route(
    `**/api/workspaces/${TEAM_OWNER.workspaceId}/projects/${LOCAL_TEAM_DRAFT.id}/move`,
    async (route) => {
      rejectedMoves += 1;
      await route.fulfill({
        status: 403,
        json: { error: { code: 'WORKSPACE_LOCKED', message: 'workspace_locked' } },
      });
    },
  );
  await gotoHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-drafts').click();

  const card = projectCard(page);
  await openProjectMenu(card);
  await page.getByRole('menuitem', { name: 'Move to team space' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Move to team space' });
  await expect(dialog).toBeVisible();

  // The dialog was authorized by the old frame, but the daemon authority has
  // locked the workspace before the mutation reaches it.
  workspaceMocks.setCurrent(TEAM_LOCKED);
  await dialog.getByRole('button', { name: 'Confirm move' }).click();
  await expect.poll(() => rejectedMoves).toBe(1);
  await expect(card).toBeVisible();
  await expect(card.getByRole('alert')).toContainText(
    'Could not move to team space. Try again.',
  );

  await page.evaluate(() => {
    window.dispatchEvent(new Event('od:workspace-context-refresh'));
  });
  await expect(page.getByTestId('workspace-switcher')).toContainText('Locked Atlas Team');
  // Locking revokes Team move/share authority, but this is still the caller's
  // own local project: rename, duplicate and delete remain reachable from the
  // same menu. Pin the capability that must disappear instead of treating the
  // entire owner-actions surface as Team-only.
  await openProjectMenu(card);
  await expect(card.getByRole('menuitem', { name: 'Move to team space' })).toHaveCount(0);
});

test('[P1] visible workspace allowance refreshes in place without reloading the shell', async ({
  page,
}) => {
  const workspaceMocks = await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  await gotoHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-account').evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  const credits = page.getByTestId('entry-nav-credits-row');
  await expect(credits).toContainText('$0.00');
  const documentMarker = await page.evaluate(() => {
    const target = window as Window & typeof globalThis & { __billingMarker?: string };
    target.__billingMarker = crypto.randomUUID();
    return target.__billingMarker;
  });

  workspaceMocks.setBalance('42.75');
  await page.evaluate(() => {
    window.dispatchEvent(new Event('od:workspace-billing-refresh'));
  });
  await expect(credits).toContainText('$42.75');
  await expect.poll(() => page.evaluate(() =>
    (window as Window & typeof globalThis & { __billingMarker?: string }).__billingMarker ?? null,
  )).toBe(documentMarker);
});

test('[P0] plugin owner shares, syncs, and removes a workspace resource from the real catalog controls', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  const resourceMocks = await wirePluginResourceMocks(page);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('entry-nav-plugins').click();
  const pluginsView = page.getByTestId('entry-view-plugins');
  await pluginsView.getByTestId('plugins-tab-installed').click();
  const card = pluginsView.getByTestId(`plugins-card-${LOCAL_PLUGIN.id}`);
  await expect(card).toBeVisible();

  await card.getByTestId(`plugins-card-more-${LOCAL_PLUGIN.id}`).click();
  await card.getByRole('menuitem', { name: 'Share with team' }).click();

  await expect.poll(() => resourceMocks.mutations).toEqual(['POST']);
  await expect(card.getByText('Shared with team', { exact: true })).toBeVisible();
  await card.getByTestId(`plugins-card-more-${LOCAL_PLUGIN.id}`).click();
  await expect(card.getByRole('menuitem', { name: 'Sync to team' })).toBeVisible();
  await card.getByRole('menuitem', { name: 'Remove from team' }).click();

  await expect.poll(() => resourceMocks.mutations).toEqual(['POST', 'DELETE']);
  await expect(card.getByText('Shared with team', { exact: true })).toHaveCount(0);
  await card.getByTestId(`plugins-card-more-${LOCAL_PLUGIN.id}`).click();
  await expect(card.getByRole('menuitem', { name: 'Share with team' })).toBeVisible();
});

test('[P1] same-id Personal plugin stays masked by Team projection until retraction', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_MEMBER, [TEAM_MEMBER]);
  const resourceMocks = await wireTeammatePluginResourceMocks(page);
  await gotoHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-plugins').click();
  const pluginsView = page.getByTestId('entry-view-plugins');

  await pluginsView.getByTestId('plugins-tab-installed').click();
  const card = pluginsView.getByTestId(`plugins-card-${LOCAL_PLUGIN.id}`);
  await expect(card).toHaveCount(0);

  await pluginsView.getByRole('button', { name: 'Team', exact: true }).click();
  await expect(card).toContainText(LOCAL_PLUGIN.title);
  const more = card.getByTestId(`plugins-card-more-${LOCAL_PLUGIN.id}`);
  if (await more.isVisible().catch(() => false)) {
    await more.click();
    await expect(card.getByRole('menuitem', { name: 'Sync to team' })).toHaveCount(0);
    await expect(card.getByRole('menuitem', { name: 'Remove from team' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }

  resourceMocks.retract();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(card).toHaveCount(0, { timeout: 15_000 });
  await page.getByTestId('entry-nav-plugins').click();
  await expect(pluginsView).toBeVisible();
  await pluginsView.getByTestId('plugins-tab-installed').click();
  await expect(card).toBeVisible();
  await expect(card.getByText('Shared with team', { exact: true })).toHaveCount(0);
  await card.getByTestId(`plugins-card-more-${LOCAL_PLUGIN.id}`).click();
  // Active members may publish their own Personal resources; managing or
  // removing somebody else's Team projection remains owner/admin-only.
  await expect(card.getByRole('menuitem', { name: 'Share with team' })).toBeVisible();
  await expect(card.getByRole('menuitem', { name: 'Remove from team' })).toHaveCount(0);
});

test('[P1] skill owner share and removal returns the skill to Personal without stale team attribution', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  const resourceMocks = await wirePluginResourceMocks(page);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('entry-nav-plugins').click();
  const pluginsView = page.getByTestId('entry-view-plugins');
  await pluginsView.getByRole('button', { name: 'Skills', exact: true }).click();
  await pluginsView.getByTestId('plugins-tab-installed').click();
  const card = pluginsView.getByTestId(`plugins-card-${LOCAL_SKILL.id}`);
  await expect(card).toBeVisible();

  await card.getByTestId(`plugins-card-more-${LOCAL_SKILL.id}`).click();
  await card.getByRole('menuitem', { name: 'Share with team' }).click();
  await expect.poll(() => resourceMocks.skillMutations).toEqual(['POST']);
  await expect(card.getByText('Shared with team', { exact: true })).toBeVisible();

  await card.getByTestId(`plugins-card-more-${LOCAL_SKILL.id}`).click();
  await card.getByRole('menuitem', { name: 'Remove from team' }).click();
  await expect.poll(() => resourceMocks.skillMutations).toEqual(['POST', 'DELETE']);
  await expect(card).toBeVisible();
  await expect(card.getByText('Shared with team', { exact: true })).toHaveCount(0);
  await card.getByTestId(`plugins-card-more-${LOCAL_SKILL.id}`).click();
  await expect(card.getByRole('menuitem', { name: 'Share with team' })).toBeVisible();
});

test('[P1] design-system owner shares, syncs, and removes the resource from its independent detail menu', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  const resourceMocks = await wireDesignSystemResourceMocks(page);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('entry-nav-design-systems').click();
  await page.getByRole('tab', { name: 'Your systems' }).click();
  const card = page.getByTestId(`design-system-card-${LOCAL_DESIGN_SYSTEM.id}`);
  await expect(card).toBeVisible();
  await card.click();
  const detail = page.getByTestId(`design-system-detail-${LOCAL_DESIGN_SYSTEM.id}`);

  await detail.getByTestId('design-kit-more-actions').click();
  await page.getByRole('menuitem', { name: 'Share to team' }).click();
  await expect.poll(() => resourceMocks.mutations).toEqual(['POST']);

  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: 'Team' }).click();
  await expect(card).toBeVisible();
  await card.click();
  const teamDetail = page.getByTestId(`design-system-detail-${LOCAL_DESIGN_SYSTEM.id}`);
  await teamDetail.getByTestId('design-kit-more-actions').click();
  await expect(page.getByRole('menuitem', { name: 'Sync to team' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Remove from team' }).click();
  await expect.poll(() => resourceMocks.mutations).toEqual(['POST', 'DELETE']);

  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: 'Your systems' }).click();
  await expect(card).toBeVisible();
  await card.click();
  const personalDetail = page.getByTestId(`design-system-detail-${LOCAL_DESIGN_SYSTEM.id}`);
  await personalDetail.getByTestId('design-kit-more-actions').click();
  await expect(page.getByRole('menuitem', { name: 'Share to team' })).toBeVisible();
});

test('[P0] project card moves into team space and back with scoped requests and immediate list updates', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  const projectMocks = await wireWorkspaceProjectMocks(page);
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('entry-nav-drafts').click();
  const card = projectCard(page);
  await expect(card).toBeVisible();

  await openProjectMenu(card);
  await page.getByRole('menuitem', { name: 'Move to team space' }).click();
  const moveInDialog = page.getByRole('alertdialog', { name: 'Move to team space' });
  await expect(moveInDialog).toContainText('all team members can view and comment');
  await moveInDialog.getByRole('button', { name: 'Confirm move' }).click();

  await expect.poll(() => projectMocks.moves.map((move) => move.body)).toEqual([
    { visibility: 'team' },
  ]);
  expect(projectMocks.moves[0]?.headers).toMatchObject({
    'x-od-workspace-id': TEAM_OWNER.workspaceId,
    'x-od-workspace-member-id': TEAM_OWNER.workspaceMemberId,
    'x-od-workspace-role': TEAM_OWNER.role,
    'x-od-workspace-can-share-projects': 'true',
  });
  await expect(card).toHaveCount(0);

  await page.getByTestId('entry-nav-all-projects').click();
  const sharedCard = projectCard(page);
  await expect(sharedCard).toBeVisible();
  await expect(sharedCard.getByText('Shared', { exact: true }).first()).toBeVisible();

  await openProjectMenu(sharedCard);
  await page.getByRole('menuitem', { name: 'Move out of team space' }).click();
  const moveOutDialog = page.getByRole('alertdialog', { name: 'Move out of team space' });
  await expect(moveOutDialog).toContainText('only you can view and edit it');
  await moveOutDialog.getByRole('button', { name: 'Confirm move' }).click();

  await expect.poll(() => projectMocks.moves.map((move) => move.body)).toEqual([
    { visibility: 'team' },
    { visibility: 'personal' },
  ]);
  await expect(sharedCard).toHaveCount(0);

  await page.getByTestId('entry-nav-drafts').click();
  await expect(projectCard(page)).toBeVisible();
  await expect(projectCard(page).getByText('Shared', { exact: true })).toHaveCount(0);
});

test('[P0] project owner conflict keeps the draft in place and exposes the non-retryable reason', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_OWNER, [TEAM_OWNER]);
  const projectMocks = await wireWorkspaceProjectMocks(page, { ownerConflict: true });
  await gotoHome(page);
  await ensureRailOpen(page);

  await page.getByTestId('entry-nav-drafts').click();
  const card = projectCard(page);
  await openProjectMenu(card);
  await page.getByRole('menuitem', { name: 'Move to team space' }).click();
  await page
    .getByRole('alertdialog', { name: 'Move to team space' })
    .getByRole('button', { name: 'Confirm move' })
    .click();

  await expect.poll(() => projectMocks.moves.map((move) => move.body)).toEqual([
    { visibility: 'team' },
  ]);
  await expect(card).toBeVisible();
  await expect(
    card.getByRole('alert').getByText(
      'Could not move to team space: another member already shares this project with the team.',
    ),
  ).toBeVisible();
  await expect(card.getByRole('menuitem', { name: 'Move to team space' })).toBeEnabled();
});

test('[P0] failed first-open materialization releases the shared-project card for a real retry', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_MEMBER, [TEAM_MEMBER]);
  const remoteProject = teamProject(
    'ui-remote-first-open',
    'Remote launch artifact',
    'ui-remote-owner',
  );
  let pullAttempts = 0;

  await page.route('**/api/workspace/projects/team', async (route) => {
    await route.fulfill({ json: { projects: [remoteProject] } });
  });
  await page.route(`**/api/workspaces/${TEAM_MEMBER.workspaceId}/projects**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${remoteProject.projectId}/files**`, async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route(`**/api/projects/${remoteProject.projectId}/collab/pull`, async (route) => {
    pullAttempts += 1;
    await route.fulfill({
      status: 503,
      json: { error: { code: 'TEAM_PROJECT_MATERIALIZING', message: 'try again' } },
    });
  });

  await gotoHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-all-projects').click();
  const card = visibleProjectCard(page, remoteProject.projectId);
  const openButton = card.locator('.recent-projects__card-main');
  await expect(card).toBeVisible();

  await openButton.click();
  await expect.poll(() => pullAttempts).toBe(1);
  await expect(openButton).not.toHaveAttribute('aria-busy', 'true');
  await expect(card).toBeVisible();
  await expect(page).toHaveURL(/\/all-projects$/);

  await openButton.click();
  await expect.poll(() => pullAttempts).toBe(2);
  await expect(openButton).not.toHaveAttribute('aria-busy', 'true');
  await expect(card).toBeVisible();
});

test('[P0] inbound shared-project transfer shows syncing instead of a false empty project', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_MEMBER, [TEAM_MEMBER]);
  const remoteProject = teamProject(
    'ui-remote-transfer-pending',
    'Inbound transfer artifact',
    'ui-remote-owner',
  );
  const placeholder = {
    ...LOCAL_TEAM_DRAFT,
    id: remoteProject.projectId,
    name: remoteProject.name,
  };
  let pullAttempts = 0;
  const scopeHeaderLog: Array<Record<string, string>> = [];

  await page.route('**/api/workspace/projects/team', async (route) => {
    await route.fulfill({ json: { projects: [remoteProject] } });
  });
  await page.route(`**/api/workspaces/${TEAM_MEMBER.workspaceId}/projects**`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          projects: [scopedProjectSummary(placeholder, TEAM_MEMBER, 'team')],
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${remoteProject.projectId}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('/workspace-scope') && request.method() === 'GET') {
      scopeHeaderLog.push(await request.allHeaders());
      await route.fulfill({
        json: {
          scope: {
            kind: 'team',
            projectId: remoteProject.projectId,
            workspaceId: TEAM_MEMBER.workspaceId,
            visibility: 'team',
            context: TEAM_MEMBER,
          },
        },
      });
      return;
    }
    if (pathname.endsWith('/collab/status') && request.method() === 'GET') {
      await route.fulfill({
        json: {
          publishedVersion: 7,
          materializedVersion: null,
          awaitingFirstMaterialization: true,
          syncState: 'synced',
          ownerMemberId: remoteProject.ownerMemberId,
          ownerDisplayName: 'Remote Owner',
          contentTransferState: {
            status: 'downloading',
            generation: 1,
            expectedVersion: 7,
          },
        },
      });
      return;
    }
    if (pathname.endsWith('/collab/pull') && request.method() === 'POST') {
      pullAttempts += 1;
      await route.fulfill({ json: { ok: true, materializedVersion: null } });
      return;
    }
    if (pathname.endsWith('/files') && request.method() === 'GET') {
      await route.fulfill({ json: { files: [] } });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${remoteProject.projectId}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          project: {
            ...placeholder,
            workspaceId: TEAM_MEMBER.workspaceId,
          },
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto(`/projects/${remoteProject.projectId}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: T.long });
  await page.getByTestId('design-files-tab').click();
  await expect(page.getByTestId('design-files-syncing')).toBeVisible();
  await expect(page.getByTestId('design-files-empty')).toHaveCount(0);
  await expect(page.getByText('New sketch', { exact: true })).toHaveCount(0);
  await expect.poll(() => pullAttempts).toBeGreaterThan(0);
  expect(scopeHeaderLog).toEqual(expect.arrayContaining([
    expect.objectContaining({
      'x-od-workspace-id': TEAM_MEMBER.workspaceId,
      'x-od-workspace-member-id': TEAM_MEMBER.workspaceMemberId,
    }),
  ]));
});

test('[P0] successful first-open materialization opens one read-only local mirror with the catalog title', async ({
  page,
}) => {
  await wireWorkspaceMocks(page, TEAM_MEMBER, [TEAM_MEMBER]);
  const remoteProject = teamProject(
    'ui-remote-first-open-success',
    'Catalog-owned launch artifact',
    'ui-remote-owner',
  );
  const materializedProject = {
    ...LOCAL_TEAM_DRAFT,
    id: remoteProject.projectId,
    name: 'Stale pulled title',
  };
  let materialized = false;
  let pullAttempts = 0;

  await page.route('**/api/workspace/projects/team', async (route) => {
    await route.fulfill({ json: { projects: [remoteProject] } });
  });
  await page.route(`**/api/workspaces/${TEAM_MEMBER.workspaceId}/projects**`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        projects: materialized
          ? [
              {
                ...scopedProjectSummary(materializedProject, TEAM_MEMBER, 'team'),
                currentUserAccess: {
                  canOpen: true,
                  canRename: false,
                  canDelete: false,
                  canDuplicate: false,
                  canMoveToTeam: false,
                  canMoveToPersonal: false,
                  canExport: true,
                  canSendTo: false,
                  canRestoreVersion: false,
                },
              },
            ]
          : [],
      },
    });
  });
  await page.route(`**/api/projects/${remoteProject.projectId}/collab/pull`, async (route) => {
    pullAttempts += 1;
    materialized = true;
    await route.fulfill({ json: { ok: true, materializedVersion: 7 } });
  });
  await page.route(`**/api/projects/${remoteProject.projectId}`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          project: {
            ...materializedProject,
            workspaceId: TEAM_MEMBER.workspaceId,
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route(`**/api/projects/${remoteProject.projectId}/files**`, async (route) => {
    await route.fulfill({
      json: {
        files: [
          {
            name: 'index.html',
            path: 'index.html',
            type: 'file',
            size: 76,
          },
        ],
      },
    });
  });

  await gotoHome(page);
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-all-projects').click();
  const card = visibleProjectCard(page, remoteProject.projectId);
  await expect(card).toContainText(remoteProject.name);

  await card.locator('.recent-projects__card-main').click();

  await expect.poll(() => pullAttempts).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/projects/${remoteProject.projectId}$`));
  await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('project-title')).toHaveText(remoteProject.name);
  await expect(page.getByText('Stale pulled title', { exact: true })).toHaveCount(0);

  await page.goto('/all-projects');
  await expect(visibleProjectCard(page, remoteProject.projectId)).toHaveCount(1);
  await expect(visibleProjectCard(page, remoteProject.projectId)).toContainText(remoteProject.name);
  await expect.poll(() => pullAttempts).toBe(1);
});

function workspace(
  input: Pick<
    WorkspaceFixture,
    | 'workspaceId'
    | 'workspaceName'
    | 'workspaceType'
    | 'workspaceMemberId'
    | 'role'
  >,
): WorkspaceFixture {
  const isTeam = input.workspaceType === 'team';
  const owner = input.role === 'owner';
  return {
    ...input,
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: isTeam ? 'active' : 'free',
    planId: isTeam ? 'team_plus' : null,
    seatSummary: isTeam
      ? { seatLimit: 5, usedSeats: 2, availableSeats: 3, isSeatFull: false }
      : { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
    permissions: {
      canInviteMembers: isTeam && owner,
      canManageBilling: owner,
      canViewWorkspaceSettings: owner,
      canManageSharedResources: isTeam && owner,
      canShareProjects: isTeam,
      canWriteSyncedFiles: owner,
    },
    workspaceSettingsUrl:
      `https://console.example.test/settings?workspaceId=${input.workspaceId}`,
  };
}

async function wireWorkspaceMocks(
  page: Page,
  initial: WorkspaceFixture,
  directory: WorkspaceFixture[],
): Promise<WorkspaceMocks> {
  let current = initial;
  let balanceUsd = '0.00';
  const activeBodies: WorkspaceMocks['activeBodies'] = [];
  const inviteBodies: WorkspaceMocks['inviteBodies'] = [];

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        loginInFlight: false,
        profile: 'test',
        user: {
          id: 'ui-workspace-user',
          email: 'workspace-ui@example.com',
          name: 'Workspace UI',
          plan: current.planId ?? 'free',
        },
        account: { plan: current.planId ?? 'free', balanceUsd },
        configPath: '/tmp/.amr/config.json',
      },
    });
  });

  await page.route('**/api/workspace/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    const method = request.method();

    if (pathname === '/api/workspace/context' && method === 'GET') {
      const headers = await request.allHeaders();
      if (
        headers['x-od-workspace-id'] !== current.workspaceId ||
        headers['x-od-workspace-member-id'] !== current.workspaceMemberId
      ) {
        await route.fulfill({
          status: headers['x-od-workspace-id'] ? 403 : 400,
          json: { error: 'workspace_context_not_authorized' },
        });
        return;
      }
      await route.fulfill({ json: { context: current } });
      return;
    }
    if (pathname === '/api/workspace/directory' && method === 'GET') {
      await route.fulfill({
        json: {
          items: directory.map(directoryItem),
          activeWorkspaceId: null,
        },
      });
      return;
    }
    if (pathname === '/api/workspace/active' && method === 'PUT') {
      const body = request.postDataJSON() as {
        workspaceId?: string;
        workspaceMemberId?: string;
      };
      activeBodies.push(body);
      const selected = directory.find(
        (candidate) =>
          candidate.workspaceId === body.workspaceId &&
          candidate.workspaceMemberId === body.workspaceMemberId,
      );
      if (!selected) {
        await route.fulfill({ status: 404, json: { error: 'workspace_not_visible' } });
        return;
      }
      current = selected;
      await route.fulfill({ json: { context: current } });
      return;
    }
    if (pathname === '/api/workspace/invite' && method === 'POST') {
      const body = request.postDataJSON() as WorkspaceMocks['inviteBodies'][number];
      inviteBodies.push(body);
      await route.fulfill({
        json: {
          results: (body.invites ?? []).map((invite, index) => ({
            email: invite.email,
            ok: true,
            inviteId: `ui-invite-${index + 1}`,
          })),
        },
      });
      return;
    }
    if (pathname === '/api/workspace/billing' && method === 'GET') {
      await route.fulfill({
        json: {
          summary: null,
          workspaceBalance: {
            workspaceId: current.workspaceId,
            workspaceMemberId: current.workspaceMemberId,
            balanceUsd,
            billingScopeVersion: 2,
            expiresAt: null,
            updatedAt: '2026-07-31T00:00:00.000Z',
          },
        },
      });
      return;
    }
    if (pathname === '/api/workspace/projects/team' && method === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });

  return {
    activeBodies,
    inviteBodies,
    activeWorkspaceId: () => current.workspaceId,
    setCurrent: (workspaceFixture) => {
      current = workspaceFixture;
      const directoryIndex = directory.findIndex(
        (item) =>
          item.workspaceId === workspaceFixture.workspaceId &&
          item.workspaceMemberId === workspaceFixture.workspaceMemberId,
      );
      if (directoryIndex >= 0) directory[directoryIndex] = workspaceFixture;
    },
    setBalance: (nextBalanceUsd) => {
      balanceUsd = nextBalanceUsd;
    },
  };
}

function directoryItem(workspaceFixture: WorkspaceFixture) {
  const {
    workspaceId,
    workspaceName,
    workspaceType,
    workspaceMemberId,
    role,
    memberStatus,
    lifecycleState,
  } = workspaceFixture;
  return {
    workspaceId,
    workspaceName,
    workspaceType,
    workspaceMemberId,
    role,
    memberStatus,
    lifecycleState,
  };
}

async function pinWindowWorkspace(
  page: Page,
  workspaceFixture: WorkspaceFixture,
): Promise<void> {
  await page.addInitScript(
    ({ workspaceId, workspaceMemberId }) => {
      window.sessionStorage.setItem(
        'od.workspaceSelection.v1',
        JSON.stringify({ workspaceId, workspaceMemberId }),
      );
    },
    {
      workspaceId: workspaceFixture.workspaceId,
      workspaceMemberId: workspaceFixture.workspaceMemberId,
    },
  );
}

async function wireMultiWindowWorkspaceAuthority(
  page: Page,
  teamBalanceUsd: () => string,
): Promise<void> {
  const directory = [PERSONAL, TEAM_OWNER];

  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        loginInFlight: false,
        profile: 'test',
        user: {
          id: 'ui-multi-window-user',
          email: 'multi-window@example.com',
          name: 'Multi Window User',
          plan: 'team_plus',
        },
        account: { plan: 'free', balanceUsd: '7.00' },
        configPath: '/tmp/.amr/config.json',
      },
    });
  });

  await page.route('**/api/workspace/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method();

    if (pathname === '/api/workspace/directory' && method === 'GET') {
      await route.fulfill({
        json: {
          items: directory.map(directoryItem),
          activeWorkspaceId: null,
        },
      });
      return;
    }
    if (pathname === '/api/workspace/context' && method === 'GET') {
      const headers = await request.allHeaders();
      const selected = directory.find(
        (candidate) =>
          candidate.workspaceId === headers['x-od-workspace-id']
          && candidate.workspaceMemberId === headers['x-od-workspace-member-id'],
      );
      if (!selected) {
        await route.fulfill({ status: 403, json: { error: 'workspace_context_not_authorized' } });
        return;
      }
      await route.fulfill({ json: { context: selected } });
      return;
    }
    if (pathname === '/api/workspace/active' && method === 'PUT') {
      const body = request.postDataJSON() as {
        workspaceId?: string;
        workspaceMemberId?: string;
      };
      const selected = directory.find(
        (candidate) =>
          candidate.workspaceId === body.workspaceId
          && candidate.workspaceMemberId === body.workspaceMemberId,
      );
      await route.fulfill(
        selected
          ? { json: { context: selected } }
          : { status: 404, json: { error: 'workspace_not_visible' } },
      );
      return;
    }
    if (pathname === '/api/workspace/billing' && method === 'GET') {
      if (url.searchParams.get('scope') === 'account') {
        await route.fulfill({
          json: {
            summary: { membershipTier: 'free', balanceUsd: '7.00' },
            workspaceBalance: null,
          },
        });
        return;
      }
      if (
        url.searchParams.get('scope') === 'workspace'
        && url.searchParams.get('workspaceId') === TEAM_OWNER.workspaceId
      ) {
        await route.fulfill({
          json: {
            summary: null,
            workspaceBalance: {
              workspaceId: TEAM_OWNER.workspaceId,
              workspaceMemberId: TEAM_OWNER.workspaceMemberId,
              balanceUsd: teamBalanceUsd(),
              billingScopeVersion: 2,
              expiresAt: null,
              updatedAt: '2026-08-03T00:00:00.000Z',
            },
          },
        });
        return;
      }
      await route.fulfill({ status: 400, json: { error: 'unexpected_billing_scope' } });
      return;
    }
    if (pathname === '/api/workspace/projects/team' && method === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
}

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByText('Loading Open Design…').waitFor({
    state: 'hidden',
    timeout: T.long,
  });
  await expect(page.getByTestId('home-hero')).toBeVisible({ timeout: T.medium });
  await ensureRailOpen(page);
  await expect(page.getByTestId('workspace-switcher')).toBeAttached();
}

async function openAccountMenu(page: Page): Promise<void> {
  await ensureRailOpen(page);
  await page.getByTestId('entry-nav-account').evaluate((element: HTMLButtonElement) => {
    element.click();
  });
  await expect(page.getByTestId('entry-nav-credits-row')).toBeVisible({ timeout: 1_000 });
}

async function inviteUrls(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as Window & typeof globalThis & {
      __workspaceInviteUrls?: string[];
    }).__workspaceInviteUrls ?? [],
  );
}

async function wireWorkspaceProjectMocks(
  page: Page,
  options: { ownerConflict?: boolean } = {},
): Promise<{ moves: WorkspaceProjectMove[] }> {
  const moves: WorkspaceProjectMove[] = [];
  let visibility: 'personal' | 'team' = 'personal';

  await page.route(`**/api/workspaces/${TEAM_OWNER.workspaceId}/projects**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() === 'GET' && pathname.endsWith('/projects')) {
      await route.fulfill({
        json: { projects: [workspaceProjectSummary(visibility)] },
      });
      return;
    }
    if (
      request.method() === 'POST' &&
      pathname ===
        `/api/workspaces/${TEAM_OWNER.workspaceId}/projects/${LOCAL_TEAM_DRAFT.id}/move`
    ) {
      const body = request.postDataJSON() as WorkspaceProjectMove['body'];
      moves.push({ body, headers: await request.allHeaders() });
      if (options.ownerConflict && body.visibility === 'team') {
        await route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'TEAM_PROJECT_OWNER_CONFLICT',
              message: 'team_project_owner_conflict',
            },
          },
        });
        return;
      }
      visibility = body.visibility === 'team' ? 'team' : 'personal';
      await route.fulfill({
        json: {
          project: workspaceProjectSummary(visibility),
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/workspace/projects/team', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        projects:
          visibility === 'team'
            ? [
                teamProject(
                  LOCAL_TEAM_DRAFT.id,
                  LOCAL_TEAM_DRAFT.name,
                  TEAM_OWNER.workspaceMemberId,
                ),
              ]
            : [],
      },
    });
  });

  await page.route(`**/api/projects/${LOCAL_TEAM_DRAFT.id}/files**`, async (route) => {
    await route.fulfill({ json: { files: [] } });
  });

  return { moves };
}

function workspaceProjectSummary(visibility: 'personal' | 'team') {
  return scopedProjectSummary(LOCAL_TEAM_DRAFT, TEAM_OWNER, visibility);
}

function scopedProjectSummary(
  project: typeof LOCAL_TEAM_DRAFT,
  workspaceFixture: WorkspaceFixture,
  visibility: 'personal' | 'team',
) {
  return {
    ...project,
    workspaceId: workspaceFixture.workspaceId,
    visibility,
    resourceState: 'active',
    createdByWorkspaceMemberId: workspaceFixture.workspaceMemberId,
    updatedByWorkspaceMemberId: workspaceFixture.workspaceMemberId,
    resourceHubResourceId: visibility === 'team' ? 'ui-team-resource' : null,
    cloudTombstonedAt: visibility === 'team' ? null : 1_720_000_002_000,
    syncState: visibility === 'team' ? 'synced' : 'local_only',
    currentUserAccess: {
      canOpen: true,
      canRename: true,
      canDelete: true,
      canDuplicate: true,
      canMoveToTeam: visibility === 'personal',
      canMoveToPersonal: visibility === 'team',
      canExport: true,
      canSendTo: true,
      canRestoreVersion: true,
    },
    project: {
      ...project,
      workspaceId: workspaceFixture.workspaceId,
    },
  };
}

function teamProject(projectId: string, name: string, ownerMemberId: string) {
  return {
    projectId,
    name,
    ownerMemberId,
    sharedAt: '2026-07-31T00:00:00.000Z',
    createdAt: 1_722_384_000_000,
    updatedAt: 1_722_384_001_000,
    skillId: null,
    designSystemId: null,
    metadata: { kind: 'prototype', nameSource: 'user' },
  };
}

const LOCAL_PLUGIN = {
  id: 'ui-workspace-plugin',
  title: 'Workspace Brief Builder',
  version: '1.0.0',
  trust: 'trusted',
  sourceKind: 'local',
  source: '/tmp/ui-workspace-plugin',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/ui-workspace-plugin',
  installedAt: 1_722_384_000_000,
  updatedAt: 1_722_384_001_000,
  manifest: {
    name: 'ui-workspace-plugin',
    title: 'Workspace Brief Builder',
    version: '1.0.0',
    description: 'Build a concise workspace brief.',
    tags: ['workspace'],
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      mode: 'prototype',
      useCase: { query: { en: 'Build a workspace brief.' } },
    },
  },
};

const LOCAL_SKILL = {
  id: 'ui-workspace-skill',
  name: 'ui-workspace-skill',
  displayName: { en: 'Workspace Research Skill' },
  description: 'Research a workspace decision.',
  triggers: [],
  mode: 'prototype',
  source: 'user',
  previewType: 'none',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Research this workspace decision.',
};

const LOCAL_DESIGN_SYSTEM = {
  id: 'ui-workspace-design-system',
  title: 'Workspace Brand System',
  category: 'Productivity & SaaS',
  summary: 'A workspace-owned brand system.',
  surface: 'web',
  source: 'user',
  status: 'published',
  updatedAt: '2026-07-31T00:00:00.000Z',
  swatches: ['#111827', '#F97316'],
};

async function wirePluginResourceMocks(
  page: Page,
): Promise<{ mutations: string[]; skillMutations: string[] }> {
  let shared = false;
  let skillShared = false;
  const mutations: string[] = [];
  const skillMutations: string[] = [];

  await page.route('**/api/plugins**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { plugins: [LOCAL_PLUGIN] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/marketplaces**', async (route) => {
    await route.fulfill({ json: { marketplaces: [] } });
  });
  await page.route('**/api/skills**', async (route) => {
    await route.fulfill({ json: { skills: [LOCAL_SKILL] } });
  });
  await page.route('**/api/workspace/plugins/team', async (route) => {
    await route.fulfill({
      json: {
        ids: shared ? [LOCAL_PLUGIN.id] : [],
        resources: shared
          ? [{
              id: LOCAL_PLUGIN.id,
              title: LOCAL_PLUGIN.title,
              canUnshare: true,
              ownerMemberId: TEAM_OWNER.workspaceMemberId,
            }]
          : [],
      },
    });
  });
  await page.route('**/api/workspace/skills/team', async (route) => {
    await route.fulfill({
      json: {
        ids: skillShared ? [LOCAL_SKILL.id] : [],
        resources: skillShared
          ? [{
              id: LOCAL_SKILL.id,
              title: LOCAL_SKILL.displayName.en,
              canUnshare: true,
              ownerMemberId: TEAM_OWNER.workspaceMemberId,
            }]
          : [],
      },
    });
  });
  await page.route(
    `**/api/workspace/plugins/${LOCAL_PLUGIN.id}/share`,
    async (route) => {
      const method = route.request().method();
      mutations.push(method);
      if (method === 'POST') {
        shared = true;
        await route.fulfill({ json: { shared: true } });
        return;
      }
      if (method === 'DELETE') {
        shared = false;
        await route.fulfill({ json: { unshared: true } });
        return;
      }
      await route.fallback();
    },
  );

  await page.route(
    `**/api/workspace/skills/${LOCAL_SKILL.id}/share`,
    async (route) => {
      const method = route.request().method();
      skillMutations.push(method);
      if (method === 'POST') {
        skillShared = true;
        await route.fulfill({ json: { shared: true } });
        return;
      }
      if (method === 'DELETE') {
        skillShared = false;
        await route.fulfill({ json: { unshared: true } });
        return;
      }
      await route.fallback();
    },
  );

  return { mutations, skillMutations };
}

async function wireTeammatePluginResourceMocks(
  page: Page,
): Promise<{ retract: () => void }> {
  let shared = true;

  await page.route('**/api/plugins**', async (route) => {
    if (route.request().method() === 'GET') {
      // Model a pre-existing Personal install with the same id as the Team
      // projection. Retraction removes only the Team projection, revealing
      // this independent local resource; it does not reclassify a Team mirror.
      await route.fulfill({ json: { plugins: [LOCAL_PLUGIN] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/marketplaces**', async (route) => {
    await route.fulfill({ json: { marketplaces: [] } });
  });
  await page.route('**/api/skills**', async (route) => {
    await route.fulfill({ json: { skills: [] } });
  });
  await page.route('**/api/workspace/plugins/team', async (route) => {
    await route.fulfill({
      json: {
        ids: shared ? [LOCAL_PLUGIN.id] : [],
        resources: shared
          ? [{
              id: LOCAL_PLUGIN.id,
              title: LOCAL_PLUGIN.title,
              canUnshare: false,
              ownerMemberId: TEAM_OWNER.workspaceMemberId,
            }]
          : [],
      },
    });
  });
  await page.route('**/api/workspace/skills/team', async (route) => {
    await route.fulfill({ json: { ids: [], resources: [] } });
  });

  return {
    retract: () => {
      shared = false;
    },
  };
}

async function wireDesignSystemResourceMocks(
  page: Page,
): Promise<{ mutations: string[] }> {
  let shared = false;
  const mutations: string[] = [];

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: [LOCAL_DESIGN_SYSTEM] } });
  });
  await page.route(`**/api/design-systems/${LOCAL_DESIGN_SYSTEM.id}`, async (route) => {
    await route.fulfill({
      json: {
        designSystem: {
          ...LOCAL_DESIGN_SYSTEM,
          body: `# ${LOCAL_DESIGN_SYSTEM.title}`,
        },
      },
    });
  });
  await page.route('**/api/workspace/design-systems/team', async (route) => {
    await route.fulfill({
      json: {
        ids: shared ? [LOCAL_DESIGN_SYSTEM.id] : [],
        resources: shared
          ? [{ id: LOCAL_DESIGN_SYSTEM.id, canUnshare: true }]
          : [],
      },
    });
  });
  await page.route(
    `**/api/workspace/design-systems/${LOCAL_DESIGN_SYSTEM.id}/share`,
    async (route) => {
      const method = route.request().method();
      mutations.push(method);
      if (method === 'POST') {
        shared = true;
        await route.fulfill({ json: { shared: true } });
        return;
      }
      if (method === 'DELETE') {
        shared = false;
        await route.fulfill({ json: { unshared: true } });
        return;
      }
      await route.fallback();
    },
  );

  return { mutations };
}

function projectCard(page: Page) {
  return visibleProjectCard(page, LOCAL_TEAM_DRAFT.id);
}

function visibleProjectCard(page: Page, projectId: string) {
  return page.locator(`.recent-projects__card[data-project-id="${projectId}"]:visible`);
}

async function openProjectMenu(card: ReturnType<typeof projectCard>): Promise<void> {
  await card.getByRole('button', { name: 'More actions' }).click();
  await expect(card.getByRole('menu')).toBeVisible();
}
