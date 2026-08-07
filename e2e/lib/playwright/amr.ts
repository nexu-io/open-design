import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type {
  WorkspaceCollabContext,
  WorkspaceDirectoryItem,
} from '@open-design/contracts';
import { ensureRailOpen } from './rail.js';
import { T } from '@/timeouts';

export const STORAGE_KEY = 'open-design:config';
export const OPEN_SETTINGS_LABEL = /Open settings|打开设置|開啟設定|Account & settings/i;

type MockAmrWalletOptions = {
  balanceUsd?: string;
  email?: string;
  loggedIn?: () => boolean;
  plan?: string;
  profile?: string;
};

type MockAmrPersonalWorkspaceOptions = {
  accountBalanceUsd?: string;
  accountCredits?: number;
  accountPlan?: string;
  accountSummaryAvailable?: boolean;
};

export const AMR_PERSONAL_WORKSPACE_ITEM = {
  workspaceId: 'ws-amr-playwright-personal',
  workspaceName: 'AMR Playwright personal workspace',
  workspaceType: 'personal',
  workspaceMemberId: 'mem-amr-playwright-personal',
  role: 'owner',
  memberStatus: 'active',
  lifecycleState: 'active',
} satisfies WorkspaceDirectoryItem;

export const AMR_PERSONAL_WORKSPACE_CONTEXT = {
  ...AMR_PERSONAL_WORKSPACE_ITEM,
  billingState: 'active',
  planId: null,
  providerMode: 'platform_credits',
  seatSummary: { seatLimit: 1, usedSeats: 1, availableSeats: 0, isSeatFull: true },
  permissions: {
    canManageMembers: true,
    canManageBilling: true,
    canInviteMembers: true,
    canManageAutoRecharge: true,
    canShareProjects: true,
    canWriteSyncedFiles: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: true,
  },
} satisfies WorkspaceCollabContext;

export const AMR_PERSONAL_WORKSPACE_HEADERS: Readonly<Record<string, string>> = {
  'x-od-workspace-id': AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
  'x-od-workspace-type': AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceType,
  'x-od-workspace-member-id': AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceMemberId,
  'x-od-workspace-role': AMR_PERSONAL_WORKSPACE_CONTEXT.role,
  'x-od-workspace-lifecycle-state': AMR_PERSONAL_WORKSPACE_CONTEXT.lifecycleState,
  'x-od-workspace-member-status': AMR_PERSONAL_WORKSPACE_CONTEXT.memberStatus,
  'x-od-workspace-can-share-projects': String(
    AMR_PERSONAL_WORKSPACE_CONTEXT.permissions.canShareProjects,
  ),
  'x-od-workspace-can-write-synced-files': String(
    AMR_PERSONAL_WORKSPACE_CONTEXT.permissions.canWriteSyncedFiles,
  ),
};

/**
 * Give AMR browser scenarios the same explicit Personal Workspace identity
 * used when their project is created. This stays opt-in so signed-out local
 * CLI and BYOK scenarios continue to run without an AMR Workspace identity.
 */
export async function mockAmrPersonalWorkspace(
  page: Page,
  projectId?: string,
  options: MockAmrPersonalWorkspaceOptions = {},
) {
  const accountPlan = options.accountPlan ?? 'free';
  const accountBalanceUsd = options.accountBalanceUsd ?? '0.00';
  const accountCredits = options.accountCredits ?? 0;
  await page.route('**/api/workspace/directory', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        items: [AMR_PERSONAL_WORKSPACE_ITEM],
        activeWorkspaceId: AMR_PERSONAL_WORKSPACE_ITEM.workspaceId,
      },
    });
  });

  await page.route('**/api/workspace/context', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const headers = route.request().headers();
    if (
      headers['x-od-workspace-id'] !== AMR_PERSONAL_WORKSPACE_ITEM.workspaceId
      || headers['x-od-workspace-member-id'] !== AMR_PERSONAL_WORKSPACE_ITEM.workspaceMemberId
    ) {
      await route.fulfill({
        status: 400,
        json: { error: 'exact_workspace_scope_required' },
      });
      return;
    }
    await route.fulfill({ json: { context: AMR_PERSONAL_WORKSPACE_CONTEXT } });
  });

  await page.route('**/api/workspace/billing**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      request.method() !== 'GET'
      || url.pathname !== '/api/workspace/billing'
      || url.searchParams.get('scope') !== 'account'
      || url.searchParams.size !== 1
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        summary: options.accountSummaryAvailable === false
          ? null
          : {
              workspaceId: null,
              membershipTier: accountPlan,
              totalAvailableCredits: accountCredits,
              subscriptionCredits: accountCredits,
              rechargeCredits: 0,
              balanceUsd: accountBalanceUsd,
              subscriptionStatus: 'active',
              availableActions: [],
              workspaceBalance: null,
            },
        workspaceBalance: null,
      },
    });
  });

  if (projectId) {
    // These AMR UI scenarios exercise run/error recovery rather than Vela's
    // remote directory transport. Scope only the project they create, and let
    // every files/conversations/messages/run request continue to the real
    // daemon with the context the Web derives from this response.
    await page.route(
      `**/api/projects/${encodeURIComponent(projectId)}/workspace-scope`,
      async (route) => {
        await route.fulfill({
          json: {
            scope: {
              kind: 'personal',
              projectId,
              workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
              visibility: 'personal',
              context: AMR_PERSONAL_WORKSPACE_CONTEXT,
            },
          },
        });
      },
    );
  }
}

export async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long }).catch(() => {});
}

export async function dismissPrivacyDialog(page: Page) {
  const privacySurface = page
    .getByRole('region', { name: /Help us improve Open Design/i })
    .or(page.locator('.privacy-consent-banner'))
    .first();
  await privacySurface.waitFor({ state: 'visible', timeout: 1_000 }).catch(() => {});
  if (await privacySurface.isVisible().catch(() => false)) {
    await privacySurface
      .getByRole('button', { name: /don['’]?t share|不分享|not now|i get it|got it/i })
      .click();
    await expect(privacySurface).toBeHidden();
  }
}

export async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
}

export async function mockAmrWalletSnapshot(
  page: Page,
  options: MockAmrWalletOptions = {},
) {
  const profile = options.profile ?? 'local';
  const email = options.email ?? 'amr-wallet@example.com';
  const plan = options.plan ?? 'plus';
  const balanceUsd = options.balanceUsd ?? '20.00';
  const fetchedAt = '2026-07-07T00:00:00.000Z';

  await page.route('**/api/integrations/vela/wallet**', async (route) => {
    if (options.loggedIn?.() === false) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'signed_out',
          profile,
          user: null,
          balanceUsd: null,
          updatedAt: null,
          fetchedAt,
          stale: false,
          source: 'unavailable',
          error: { code: 'signed_out', message: 'Sign in to view wallet balance.' },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'available',
        profile,
        user: { id: 'amr-wallet-user', email, plan },
        balanceUsd,
        updatedAt: fetchedAt,
        fetchedAt,
        stale: false,
        source: 'vela_api',
      }),
    });
  });
}

export async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
}

/**
 * #5517 moved the entry settings chip into the nav rail footer. The rail is
 * collapsed by default and carries `inert` while collapsed, so the chip is
 * present but neither focusable nor clickable — even a programmatic
 * `element.click()` is a no-op — and `getByRole` cannot see it at all because
 * the collapsed rail is `aria-hidden`. Expand the rail first whenever we are on
 * an entry view; inside a project workspace there is no rail to expand.
 */
async function ensureEntryRailOpenIfPresent(page: Page) {
  if ((await page.locator('.entry').count()) === 0) return;
  await ensureRailOpen(page).catch(() => {});
}

/**
 * The settings surface. Current entry and project launchers route to the
 * settings page, where `SettingsDialog` renders in `presentation="page"`
 * mode (`role="region"`, no `aria-modal`). Match the shared surface class so
 * this helper also remains correct if a modal presentation is used again.
 */
export function settingsSurface(page: Page) {
  // Match only `.modal-settings` — the class both presentations share, so the
  // bare `role="dialog"` fallback this used to carry was already redundant. It
  // was also actively wrong: AvatarMenu's popover is a `role="dialog"` too, so
  // the fallback could resolve to the account menu and let a test assert
  // against the wrong surface.
  return page.locator('.modal-settings').first();
}

/**
 * Open Settings from a project/workspace surface.
 *
 * Every `entry-*` settings trigger lives on the entry (Home) shell, so none of
 * them exists once a project is open. #5517 also left `EntrySettingsMenu`
 * (`entry-settings-menu-trigger` / `entry-settings-open-details`) and
 * `AppChromeHeader`'s `SettingsIconButton` (`.settings-icon-btn`) unrendered,
 * so the project surface's only settings entry is the composer's model popover:
 * open `AvatarMenu`, then take its pinned `avatar-open-execution-settings` row.
 * The topbar `InlineModelSwitcher` carries the same row under
 * `inline-model-switcher-open-settings`, so try that as a second route.
 *
 * Returns true when it managed to click a trigger, false when this page has no
 * in-project settings entry to drive.
 */
async function openSettingsFromProjectSurface(page: Page): Promise<boolean> {
  const avatarTrigger = page.locator('.avatar-menu .avatar-agent-trigger').first();
  if (await avatarTrigger.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await avatarTrigger.click();
    const openSettings = page.getByTestId('avatar-open-execution-settings').first();
    if (await openSettings.isVisible({ timeout: T.short }).catch(() => false)) {
      await openSettings.click();
      return true;
    }
    // Leave no popover behind for the next attempt to trip over.
    await page.keyboard.press('Escape').catch(() => {});
  }

  const switcherChip = page.getByTestId('inline-model-switcher-chip').first();
  if (await switcherChip.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await switcherChip.click();
    const openSettings = page.getByTestId('inline-model-switcher-open-settings').first();
    if (await openSettings.isVisible({ timeout: T.short }).catch(() => false)) {
      await openSettings.click();
      return true;
    }
    await page.keyboard.press('Escape').catch(() => {});
  }

  return false;
}

export async function openSettingsDialog(page: Page) {
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await ensureEntryRailOpenIfPresent(page);
  const dialog = settingsSurface(page);
  // On the entry, `entry-settings-button` is the rail nav item that carries
  // settings when signed out (see EntryNavRail — it calls itself the e2e
  // contract); signed in, settings lives in the account menu, which the
  // aria-label reaches. `entry-settings-menu-trigger` belongs to
  // `EntrySettingsMenu`, which #5517 left unrendered — kept last so an older
  // skin still resolves.
  const settingsTrigger = page
    .getByTestId('entry-settings-button')
    .or(page.getByTestId('entry-settings-menu-trigger'))
    .or(page.getByRole('button', { name: OPEN_SETTINGS_LABEL }))
    .first();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await dialog.isVisible().catch(() => false)) return dialog;

    await dismissPrivacyDialog(page);
    if (await settingsTrigger.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await settingsTrigger.evaluate((element: HTMLElement) => element.click());
    } else if (!(await openSettingsFromProjectSurface(page))) {
      // Neither the entry triggers nor the project surface's model popover is
      // on this page — fall back to the aria-label so the failure names the
      // missing trigger rather than timing out on the surface.
      const fallback = page.getByRole('button', { name: OPEN_SETTINGS_LABEL }).first();
      await expect(fallback).toBeVisible({ timeout: T.medium });
      await fallback.evaluate((element: HTMLElement) => element.click());
    }

    // The first click may only have opened a popover. `AvatarMenu`'s trigger is
    // labelled 'Account & settings' (`avatar.title`), which OPEN_SETTINGS_LABEL
    // matches, so on a project surface the chain above lands on the composer's
    // model popover rather than on Settings — its pinned
    // `avatar-open-execution-settings` row is the click that actually routes
    // there. Keep all three follow-throughs in one locator so whichever popover
    // opened gets finished.
    const detailsTrigger = page
      .getByTestId('entry-settings-open-details')
      .or(page.getByTestId('avatar-open-execution-settings'))
      .or(page.getByTestId('inline-model-switcher-open-settings'))
      .first();
    if (await detailsTrigger.isVisible({ timeout: T.short }).catch(() => false)) {
      await detailsTrigger.click();
    }

    await expect
      .poll(
        async () => {
          if (await dialog.isVisible().catch(() => false)) return 'dialog';
          return 'pending';
        },
        { timeout: T.medium },
      )
      .not.toBe('pending')
      .catch(() => {});

    if (await dialog.isVisible().catch(() => false)) return dialog;
  }

  await expect(dialog).toBeVisible({ timeout: T.medium });
  return dialog;
}

export async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible({ timeout: 10_000 });
  await input.click();
  await input.fill(prompt);
  await expect(page.getByTestId('chat-send')).toBeEnabled();
  await input.press('Enter');
}

export async function createProjectViaApi(
  page: Page,
  projectId: string,
  name: string,
  workspaceOptions: MockAmrPersonalWorkspaceOptions = {},
) {
  await mockAmrPersonalWorkspace(page, projectId, workspaceOptions);
  const response = await page.request.post('/api/projects', {
    headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
    data: {
      id: projectId,
      name,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { conversationId: string };
}

export async function gotoProject(page: Page, projectId: string) {
  try {
    await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|frame was detached/i.test(message)) throw error;
  }
  await dismissPrivacyDialog(page);
  await expectWorkspaceReady(page);
}

export async function putAppConfig(page: Page, config: Record<string, unknown>) {
  const response = await page.request.put('/api/app-config', { data: config });
  expect(response.ok(), await response.text()).toBeTruthy();
}

export async function readAppConfig(page: Page) {
  const response = await page.request.get('/api/app-config');
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as { config?: Record<string, unknown> };
}

export async function seedBrowserConfig(page: Page, value: Record<string, unknown>) {
  const payload = { key: STORAGE_KEY, config: value };
  await page.addInitScript(
    ({ key, config }) => {
      window.localStorage.setItem(key, JSON.stringify(config));
    },
    payload,
  );
  await page.evaluate(({ key, config }) => {
    window.localStorage.setItem(key, JSON.stringify(config));
  }, payload).catch(() => {
    // Some pre-navigation pages do not expose localStorage yet; the init script above covers the next load.
  });
}
