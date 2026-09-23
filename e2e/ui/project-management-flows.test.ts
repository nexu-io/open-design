import { expect, test } from '@/playwright/suite';
import { ACTIVE_ARTIFACT_PREVIEW_SELECTOR } from '@/playwright/artifact-preview';
import { ensureRailOpen, openNewProjectModal } from '@/playwright/rail';
import { openAllProjectFiles } from '@/playwright/workspace';
import { T } from '@/timeouts';
import type { Locator, Page, Request } from '@playwright/test';
import { routeAgents, routeSuccessfulRuns, suppressWhatsNew } from '../lib/playwright/mock-factory.js';
import {
  AMR_PERSONAL_WORKSPACE_CONTEXT,
  AMR_PERSONAL_WORKSPACE_HEADERS,
  mockAmrPersonalWorkspace,
  openSettingsDialog,
  settingsSurface,
} from '../lib/playwright/amr.js';

// The `/projects` view in `EntryShell` renders a `CenteredLoader` until
// `projectsLoading || skillsLoading || designSystemsLoading` all clear
// (`apps/web/src/components/EntryShell.tsx`). Tests that land on `/projects`
// should stub the catalog endpoints that are unrelated to the project-list
// behavior under test; otherwise a large registry response can keep the first
// assertion gated on daemon/catalog timing instead of the UI contract.
async function stubCatalogsEmpty(page: Page): Promise<void> {
  await page.route('**/api/design-templates', async (route) => {
    await route.fulfill({ json: { designTemplates: [] } });
  });
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: [] } });
  });
}

const STORAGE_KEY = 'open-design:config';
function projectDesignSystemTrigger(page: Page): Locator {
  return page
    .getByTestId('chat-composer')
    .getByTestId('home-hero-design-system-trigger');
}
const AGENTS = [
  {
    id: 'codex',
    name: 'Codex CLI',
    bin: 'codex',
    available: true,
    version: '0.134.0',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      {
        id: 'gpt-5.5',
        label: 'GPT 5.5',
        additionalSpeedTiers: ['fast'],
        serviceTierOptions: [{ id: 'priority', label: 'Fast' }],
      },
    ],
  },
  {
    id: 'claude',
    name: 'Claude Code',
    bin: 'claude',
    available: true,
    version: '2.1.131',
    models: [
      { id: 'default', label: 'Default (CLI config)' },
      { id: 'sonnet', label: 'Sonnet (alias)' },
      { id: 'opus', label: 'Opus (alias)' },
    ],
  },
];

const DESIGN_SYSTEMS = [
  {
    id: 'nexu-soft-tech',
    title: 'Nexu Soft Tech',
    category: 'Product',
    summary: 'Warm utility system for product interfaces.',
    swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
  },
  {
    id: 'editorial-noir',
    title: 'Editorial Noir',
    category: 'Editorial',
    summary: 'High-contrast editorial system with expressive type.',
    swatches: ['#111111', '#F6EFE6', '#C44536', '#F2C14E'],
  },
  {
    id: 'data-mist',
    title: 'Data Mist',
    category: 'Analytics',
    summary: 'Calm dashboard system for dense data products.',
    swatches: ['#EAF4F4', '#5EAAA8', '#05668D', '#0B132B'],
  },
];

async function stubEmptyProjectsNewProjectData(page: Page): Promise<void> {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: TAB_SKILLS } });
  });
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: {} } });
  });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
}

async function openNewProjectFromEmptyProjects(page: Page): Promise<void> {
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Loading OpenDesign…')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.designs-empty-state')).toBeVisible();
  await page.getByTestId('designs-empty-new-project').click();

  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

// #5517's rail has no "+ New project" button any more, so the Projects view's
// own CTA is the entry this flow starts from.
async function openNewProjectFromProjectsView(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('od.entry.railOpen', 'true');
  });
  await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.entry')).toHaveClass(/entry--rail-open/);
  const projectsView = page.getByTestId('entry-view-projects');
  await expect(projectsView).toBeVisible();
  const createButton = projectsView
    .getByTestId('designs-new-project')
    .or(projectsView.getByTestId('designs-empty-new-project'))
    .first();
  await expect(createButton).toBeVisible();
  await createButton.click();

  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

const TAB_SKILLS = [
  skillSummary('prototype-skill', 'Prototype Skill', 'prototype', 'web', ['prototype']),
  skillSummary('live-artifact', 'live-artifact', 'prototype', 'web', []),
  skillSummary('deck-skill', 'Deck Skill', 'deck', 'web', ['deck']),
  skillSummary('image-skill', 'Image Skill', 'image', 'image', ['image']),
];

const COMPOSER_PLUS_PLUGIN = {
  id: 'composer-context-plugin',
  title: 'Composer Context Plugin',
  version: '1.0.0',
  trust: 'bundled',
  sourceKind: 'bundled',
  source: '/tmp/composer-context-plugin',
  fsPath: '/tmp/composer-context-plugin',
  capabilitiesGranted: ['prompt:inject'],
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'composer-context-plugin',
    title: 'Composer Context Plugin',
    version: '1.0.0',
    description: 'Project composer context picker fixture.',
    od: {
      kind: 'scenario',
      taskKind: 'new-generation',
      useCase: {
        query: 'Use the composer context plugin.',
      },
    },
  },
};

test.beforeEach(async ({ page }) => {
  // The entry home mounts `WhatsNewPopup` (EntryShell.tsx), and its backdrop
  // sits at z-index 1500 — above the z-index 120 workspace chrome that owns
  // the rail toggle. A live release card therefore swallows every rail/settings
  // click in this file. Pin it closed.
  await suppressWhatsNew(page);
  let appConfig = {
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mode: 'daemon',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    agentModels: { codex: { model: 'default' } },
    agentCliEnv: {},
  };

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'default',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
        agentModels: { codex: { model: 'default' } },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const next = route.request().postDataJSON() as Record<string, unknown>;
      appConfig = {
        ...appConfig,
        ...next,
      };
      await route.fulfill({ json: { config: appConfig } });
      return;
    }
    await route.fulfill({
      json: {
        config: appConfig,
      },
    });
  });

  await routeAgents(page, AGENTS);
});

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

test.describe('new project modal from left rail', () => {
  // Timeout-only configure: both tests open the modal themselves against
  // stubbed data; serial would make the pair atomic within one CI shard.
  test.describe.configure({ timeout: 60_000 });

  test('[P1] new project tabs switch visible form sections and preserve drafts', async ({ page }) => {
    await stubEmptyProjectsNewProjectData(page);
    await openNewProjectFromProjectsView(page);
    await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New prototype');
    await expect(page.getByTestId('design-system-trigger')).toBeVisible();
    await expect(page.getByText('Fidelity', { exact: true })).toBeVisible();
    await page.getByTestId('new-project-name').fill('Prototype draft survives');

    await page.getByTestId('new-project-tab-live-artifact').click();
    await expect(page.getByTestId('new-project-tab-live-artifact')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New live artifact');
    await expect(page.locator('.newproj-title')).toContainText('Beta');
    await expect(page.getByTestId('design-system-picker')).toHaveCount(0);
    await expect(page.getByTestId('new-project-connectors')).toBeVisible();
    await expect(page.getByTestId('create-project')).toContainText('Create live artifact');

    await page.getByTestId('new-project-tab-deck').click();
    await expect(page.getByTestId('new-project-tab-deck')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New slide deck');
    await expect(page.getByTestId('design-system-trigger')).toBeVisible();
    await expect(page.getByText('Use speaker notes')).toBeVisible();
    await expect(page.getByTestId('new-project-connectors')).toHaveCount(0);

    await page.getByTestId('new-project-tab-prototype').click();
    await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New prototype');
    await expect(page.getByTestId('new-project-name')).toHaveValue('Prototype draft survives');
  });

  test('[P1] new project media tab switches inner media surfaces', async ({ page }) => {
    await stubEmptyProjectsNewProjectData(page);
    await openNewProjectFromProjectsView(page);

    // Playwright auto-scrolls the tab into view; the consolidated media flow
    // keeps image/video/audio as inner segmented surfaces.
    await page.getByTestId('new-project-tab-media').click();
    await expect(page.getByTestId('new-project-tab-media')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('new-project-media-surface-image').click();
    await expect(page.getByTestId('new-project-media-surface-image')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New image');
    await expect(page.getByTestId('design-system-picker')).toHaveCount(0);
    await expect(page.getByText('Model', { exact: true })).toBeVisible();
    await expect(page.getByText('Aspect', { exact: true })).toBeVisible();

    await page.getByTestId('new-project-media-surface-video').click();
    await expect(page.getByTestId('new-project-media-surface-video')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New video');

    await page.getByTestId('new-project-media-surface-audio').click();
    await expect(page.getByTestId('new-project-media-surface-audio')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.newproj-title')).toContainText('New audio');
  });
});

test('[P0] projects empty state create action opens the new project flow', async ({ page }) => {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: TAB_SKILLS } });
  });
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: {} } });
  });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });

  await stubCatalogsEmpty(page);
  await openNewProjectFromEmptyProjects(page);

  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await expect(page.getByTestId('new-project-tab-prototype')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.newproj-title')).toContainText('New prototype');
});

test('[P0] UI-created Personal project recovers preview and write authority after reload', async ({ page }) => {
  // Create + upload + gated reload needs more than the suite default once the
  // post-reload waits use the long boot/route budgets under CI contention.
  test.setTimeout(T.xlong);
  await mockWritablePersonalProjectScope(page);
  await stubCatalogsEmpty(page);
  await page.goto('/');
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Reloaded Personal authority');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'reload-personal-authority.html',
    '<!doctype html><html><body><h1>Reloaded Personal preview</h1></body></html>',
    { headers: AMR_PERSONAL_WORKSPACE_HEADERS },
  );
  await openUploadedHtmlArtifactPreview(page, uploadedName);
  await expect(artifactPreviewFrame(page).getByRole('heading', {
    name: 'Reloaded Personal preview',
  })).toBeVisible();

  let releaseScope = () => {};
  const scopeGate = new Promise<void>((resolve) => {
    releaseScope = resolve;
  });
  let releaseStatus = () => {};
  const statusGate = new Promise<void>((resolve) => {
    releaseStatus = resolve;
  });
  await page.route('**/api/projects/*/workspace-scope', async (route) => {
    await scopeGate;
    const projectId = getProjectIdFromApiPath(route.request().url());
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
  });
  await page.route('**/api/projects/*/collab/status', async (route) => {
    await statusGate;
    await route.fulfill({
      json: {
        publishedVersion: null,
        materializedVersion: null,
        syncState: 'local_only',
        ownerMemberId: null,
      },
    });
  });

  const scopeRequested = page.waitForRequest(
    (request) => new URL(request.url()).pathname.endsWith('/workspace-scope'),
    { timeout: T.long },
  );
  const statusRequested = page.waitForRequest(
    (request) => new URL(request.url()).pathname.endsWith('/collab/status'),
    { timeout: T.long },
  );

  try {
    // A hard reload drops the module-local same-session creation witness. Keep
    // both authority reads unresolved long enough to observe the fail-closed
    // state, then release them independently. The persisted Personal binding —
    // not that ephemeral witness — must reconnect the already-ready artifact.
    //
    // Reload only reaches `domcontentloaded` while the dynamic App boot shell
    // (`Loading OpenDesign…`) and the project-route workspace-context gate
    // (`Loading workspace…`) may still own the page. Wait those out with the
    // suite's long budget before asserting the fail-closed workspace chrome —
    // the default expect timeout is 10s and is too short under CI contention.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page
      .getByText('Loading OpenDesign…')
      .waitFor({ state: 'hidden', timeout: T.long })
      .catch(() => {});
    await expect(page.getByText('Loading workspace…')).toHaveCount(0, { timeout: T.long });
    await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: T.long });
    await scopeRequested;
    // The content-loading skeleton is intentionally transient: a restored
    // iframe can become ready before this assertion runs. The authority gate is
    // the durable user-visible contract while the scope request is unresolved.
    await expect(page.getByTestId('chat-composer-input')).toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByRole('button', { name: /^Share$/i })).toBeDisabled();

    releaseScope();
    // Prevent a second release from the finally if the remaining asserts fail.
    releaseScope = () => {};
    await statusRequested;
    await expect(artifactPreviewFrame(page).getByRole('heading', {
      name: 'Reloaded Personal preview',
    })).toBeVisible({ timeout: T.long });
    // A daemon-confirmed `personal` scope IS the write authority — the gate must
    // NOT stay closed waiting on `/collab/status`.
    //
    // This assertion used to read `toHaveAttribute('aria-readonly', 'true')`,
    // written 2026-08-25 when a personal project really did stay read-only until
    // status answered. OPEND-2624 (commit `a17a22e32a`, 2026-09-04) deliberately
    // changed that: `projectIsDaemonConfirmedPersonal` in
    // `apps/web/src/collab/useProjectCollab.ts` now grants write authority from
    // the scope alone, because the old behavior showed the creator of a private
    // local-only draft 「这是共享项目」 with chat, upload, edit and export all
    // disabled while the daemon would have accepted every one of those writes.
    // The ruling is pinned by
    // `apps/web/tests/collab/opend-2624-personal-project-readonly.test.tsx:211`
    // ("does not present a daemon-confirmed personal project as shared read-only
    // when /collab/status refuses").
    //
    // So DO NOT flip this back to expecting read-only: after that ruling the
    // read-only window here is only as wide as one React commit, and the old
    // assertion passed purely by racing it. `/collab/status` is still unresolved
    // on purpose — write authority has to come back from the persisted Personal
    // binding by itself. Share shares the same `viewerOnly` gate as the composer
    // (`FileViewer.tsx`), so it re-enables on the same tick.
    await expect(page.getByTestId('chat-composer-input')).not.toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByRole('button', { name: /^Share$/i })).toBeEnabled();

    releaseStatus();
    releaseStatus = () => {};
    // A settled status must not demote the writer the scope just confirmed.
    await expect(page.getByTestId('chat-composer-input')).not.toHaveAttribute('aria-readonly', 'true');
    await expect(page.getByRole('button', { name: /^Share$/i })).toBeEnabled();
  } finally {
    releaseScope();
    releaseStatus();
  }
});

test('[P1] design system multi-select stores primary and inspiration metadata', async ({ page }) => {
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromProjectsView(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Design system multi select metadata');
  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');

  await page.getByTestId('design-system-trigger').click();
  const multiTab = page.getByRole('tab', { name: /multi/i });
  await multiTab.click();
  await expect(multiTab).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('option', { name: /Editorial Noir/i }).click();
  await page.getByRole('option', { name: /Data Mist/i }).click();

  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');
  await expect(page.getByTestId('design-system-trigger')).toContainText('+2');
  await page.getByTestId('design-system-trigger').click();
  await expect(page.locator('.ds-picker-popover')).toHaveCount(0);
  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBe('nexu-soft-tech');
  expect(body.metadata?.inspirationDesignSystemIds).toEqual([
    'editorial-noir',
    'data-mist',
  ]);
});

test('[P1] design system picker searches and switches the single selected system', async ({ page }) => {
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromProjectsView(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Design system single switch flow');
  await expect(page.getByTestId('design-system-trigger')).toBeVisible();

  await page.getByTestId('design-system-trigger').click();
  await page.getByTestId('design-system-search').fill('mist');
  await expect(page.getByRole('option', { name: /Data Mist/i })).toBeVisible();
  await expect(page.getByRole('option', { name: /Nexu Soft Tech/i })).toHaveCount(0);
  await page.getByRole('option', { name: /Data Mist/i }).click();

  await expect(page.getByTestId('design-system-trigger')).toContainText('Data Mist');
  await expect(page.getByTestId('design-system-trigger')).toContainText('Analytics');
  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBe('data-mist');
  expect(body.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('[P1] design system picker can clear the default system before creating a project', async ({ page }) => {
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromProjectsView(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Design system clear create flow');
  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');

  await page.getByTestId('design-system-trigger').click();
  await page.getByRole('option', { name: /None.*freeform/i }).click();

  await expect(page.getByTestId('design-system-trigger')).toContainText('None');
  await expect(page.getByTestId('design-system-trigger')).not.toContainText('Nexu Soft Tech');

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBeNull();
  expect(body.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('[P1] stale daemon default design system is not posted when creating a project', async ({ page }) => {
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        json: {
          config: {
            onboardingCompleted: true,
            privacyDecisionAt: 1,
            telemetry: { metrics: false, content: false, artifactManifest: false },
            mode: 'daemon',
            agentId: 'codex',
            skillId: null,
            designSystemId: 'stale-design-system',
            agentModels: { codex: { model: 'default' } },
            agentCliEnv: {},
          },
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
          mode: 'daemon',
          agentId: 'codex',
          skillId: null,
          designSystemId: 'stale-design-system',
          agentModels: { codex: { model: 'default' } },
          agentCliEnv: {},
        },
      },
    });
  });
  await stubEmptyProjectsNewProjectData(page);
  await openNewProjectFromProjectsView(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill('Stale design system default flow');

  await expect(page.getByTestId('design-system-trigger')).toContainText('None');
  await expect(page.getByTestId('design-system-trigger')).not.toContainText('stale-design-system');

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click({ force: true });
  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    designSystemId?: string | null;
    metadata?: {
      inspirationDesignSystemIds?: string[];
    };
  };
  expect(body.designSystemId).toBeNull();
  expect(body.designSystemId).not.toBe('stale-design-system');
  expect(body.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('[P1] project detail composer design system picker switches the active project design system', async ({ page }) => {
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await page.goto('/');
  await createProject(page, 'Header design system switch');
  await expectWorkspaceReady(page);

  const trigger = projectDesignSystemTrigger(page);
  await expect(trigger).toHaveAccessibleName(/^Design system$/i);

  await trigger.click();
  const popover = page.getByTestId('project-ds-picker-popover');
  await expect(popover).toBeVisible();
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const editorialOption = page.getByRole('option', { name: /^Editorial Noir$/ });
  await expect(editorialOption).toBeVisible();
  const patchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === `/api/projects/${getProjectContextFromUrl(page).projectId}` && request.method() === 'PATCH';
  });
  await editorialOption.click();

  await expect(popover).toHaveCount(0);

  const request = await patchRequest;
  const body = request.postDataJSON() as { designSystemId?: string | null };
  expect(body.designSystemId).toBe('editorial-noir');
  await expect(trigger).toHaveAccessibleName(/Editorial Noir/i);
});

test('[P1] design system create Back restores the originating project conversation', async ({ page }) => {
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await page.goto('/');
  await createProject(page, 'Design system create return target');
  await expectWorkspaceReady(page);

  const origin = new URL(page.url());
  expect(origin.pathname).toMatch(/^\/projects\/[^/]+\/conversations\/[^/]+$/);

  await projectDesignSystemTrigger(page).click();
  await page.getByTestId('project-ds-picker-create').click();
  await expect(page).toHaveURL(/\/design-systems\/create$/);

  await page.getByRole('button', { name: /^(Back|返回)$/ }).first().click();
  await expect(page).toHaveURL(origin.toString());
  await expectWorkspaceReady(page);
});

test('[P0] @critical project detail composer design system switch carries into the next run request', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runId: 'mock-run' });

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
  // This helper creates through APIRequestContext, bypassing the browser-side
  // same-session creation witness. Pin the scenario to an exact writable
  // Personal owner so a slow catalog/status read cannot turn it viewer-only.
  await mockWritablePersonalProjectScope(page);

  await page.goto('/');
  await createProject(page, 'Header design system run context', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await expectWorkspaceReady(page);

  const trigger = projectDesignSystemTrigger(page);
  await expect(trigger).toHaveAccessibleName(/^Design system$/i);
  await trigger.click();
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const editorialOption = page.getByRole('option', { name: /^Editorial Noir$/ });
  await expect(editorialOption).toBeVisible();
  const patchRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return url.pathname === `/api/projects/${getProjectContextFromUrl(page).projectId}` && request.method() === 'PATCH';
  });
  await editorialOption.click();
  const patchBody = await patchRequest.then((request) => request.postDataJSON() as { designSystemId?: string | null });
  expect(patchBody.designSystemId).toBe('editorial-noir');
  await expect(trigger).toHaveAccessibleName(/Editorial Noir/i);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Use the active design system in this layout.');
  const sendButton = page.getByTestId('chat-send');
  await expect(sendButton).toBeEnabled();
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    sendButton.click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.designSystemId).toBe('editorial-noir');
});

test('[P1] project detail design system picker stays inside the composer controls', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer design system position');
  await expectWorkspaceReady(page);

  const composer = page.getByTestId('chat-composer');
  await expect(
    composer.getByTestId('home-hero-design-system-trigger'),
  ).toHaveAccessibleName(/^Design system$/i);
});

test('[P1] project detail composer working directory picker opens without leaving chat', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer working directory picker');
  await expectWorkspaceReady(page);

  const composer = page.getByTestId('chat-composer');
  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-working-dir').click();
  await expect(page.getByTestId('composer-plus-working-dir-pick')).toBeVisible();
  await expect(page).toHaveURL(/\/projects\//);
});

test('[P1] project detail composer plus menu exposes the attachment entry and no resource submenus', async ({ page }) => {
  await routeComposerPlusFixtures(page);
  await page.goto('/');
  await createProject(page, 'Composer plus context menu');
  await expectWorkspaceReady(page);

  const composer = page.getByTestId('chat-composer');
  await composer.getByTestId('chat-plus-trigger').click();
  await expect(page.getByTestId('composer-plus-attach')).toBeVisible();
  // Plugins, connectors and MCP were removed from this menu; they stay
  // reachable from their own surfaces.
  await expect(page.getByTestId('composer-plus-plugins')).toHaveCount(0);
  await expect(page.getByTestId('composer-plus-connectors')).toHaveCount(0);
  await expect(page.getByTestId('composer-plus-mcp')).toHaveCount(0);
});

test('[P1] project detail composer plus menu opens project, local code, Figma help, and design system context actions', async ({ page }) => {
  const referenceProject = {
    id: 'ref-project-context',
    name: 'Reference Project Context',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await routeComposerPlusFixtures(page);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/ref-project-context**', async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-project-context',
      },
    });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.fallback();
      return;
    }
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split('/').pop() ?? 'composer-plus-context-actions');
    const body = route.request().postDataJSON() as { metadata?: Record<string, unknown> };
    await route.fulfill({
      json: {
        project: {
          id,
          name: 'Composer plus context actions',
          skillId: null,
          designSystemId: null,
          createdAt: Date.now() - 1_000,
          updatedAt: Date.now(),
          metadata: body.metadata ?? { kind: 'prototype' },
        },
      },
    });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-project' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });

  await page.goto('/');
  await createProject(page, 'Composer plus context actions');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  // Both context actions sit inside the "+" menu's working-dir group.
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog).toBeVisible();
  await expect(referenceDialog.getByRole('option', { name: /Reference Project Context/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(referenceDialog).toHaveCount(0);
  await expect(input).toContainText('Reference Project Context');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-project');

  // The "查看方法" (.fig download guide) row was removed from the "+" menu: the
  // menu lists things to ATTACH to the message, and a help article is not one.
  await composer.getByTestId('chat-plus-trigger').click();
  await expect(page.getByTestId('composer-plus-figma-help')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await composer.getByTestId('home-hero-design-system-trigger').click();
  await expect(page.getByTestId('project-ds-picker-popover')).toBeVisible();
});

test('[P1] project detail Figma import uploads a .fig file and stages the suggested prompt', async ({ page }) => {
  test.setTimeout(60_000);
  const importBodies: string[] = [];
  const runRequestBodies: Array<Record<string, unknown>> = [];
  const suggestedPrompt = 'Build the current project from figma/DESIGN-context.md.';

  await routeComposerPlusFixtures(page);
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'figma-import-build-run' });
  await page.route('**/api/projects/*/figma/import', async (route) => {
    importBodies.push(route.request().postData() ?? '');
    await route.fulfill({
      json: {
        snapshotDir: 'figma',
        files: ['figma/tree.json', 'figma/DESIGN-context.md', 'figma/thumbnail.png'],
        inventory: {
          decoded: true,
          source: 'fig-file',
          nodeCount: 10,
          pageCount: 1,
          frameCount: 2,
          componentCount: 2,
          colors: ['#0B5FFF'],
          fonts: [{ family: 'Inter', styles: ['Regular'] }],
          assetCount: 1,
          hasThumbnail: true,
          warnings: [],
        },
        thumbnailPath: 'figma/thumbnail.png',
        contextPath: 'figma/DESIGN-context.md',
        suggestedPrompt,
        label: 'project-flow.fig',
      },
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, 'Project Figma import success');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await expect(figmaImport).toBeVisible();
  await figmaImport.locator('input[type="file"]').setInputFiles({
    name: 'project-flow.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('fake project fig payload', 'utf8'),
  });
  await expect(figmaImport).toContainText('project-flow.fig');
  await figmaImport.getByPlaceholder(/Optional: notes/i).fill('Keep the original hierarchy.');
  await figmaImport.getByRole('button', { name: 'Import & build' }).click();

  await expect.poll(() => importBodies.length, { timeout: 10_000 }).toBe(1);
  expect(importBodies[0]).toContain('project-flow.fig');
  expect(importBodies[0]).toContain('Keep the original hierarchy.');
  await expect(figmaImport).toBeVisible();
  await expect(input).toContainText(suggestedPrompt);
  await figmaImport.getByRole('button', { name: 'Close' }).click();
  await expect(figmaImport).toHaveCount(0);

  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);
  await expect.poll(() => runRequestBodies.length).toBe(1);
  expect(runRequestBodies[0]?.message).toContain(suggestedPrompt);
});

test('[P1] project detail Figma import keeps the dialog open and retryable on decode failure', async ({ page }) => {
  const importBodies: string[] = [];

  await routeComposerPlusFixtures(page);
  await page.route('**/api/projects/*/figma/import', async (route) => {
    importBodies.push(route.request().postData() ?? '');
    await route.fulfill({
      status: 500,
      json: { error: { message: 'Could not decode the Figma archive.' } },
    });
  });

  await page.goto('/');
  await createProject(page, 'Project Figma import failure');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-figma').click();
  const figmaImport = page.getByRole('dialog', { name: 'Import from Figma' });
  await figmaImport.locator('input[type="file"]').setInputFiles({
    name: 'broken-project-flow.fig',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('broken fig payload', 'utf8'),
  });
  await figmaImport.getByRole('button', { name: 'Import & build' }).click();

  await expect.poll(() => importBodies.length, { timeout: 10_000 }).toBe(1);
  await expect(figmaImport).toBeVisible();
  await expect(figmaImport).toContainText('Could not decode the Figma archive.');
  await expect(figmaImport.getByRole('button', { name: 'Import & build' })).toBeEnabled();
  await expect(input).not.toContainText('figma/DESIGN-context.md');
});

test('[P1] project detail composer sends referenced workspace contexts into the run request', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  const referenceProject = {
    id: 'ref-project-payload',
    name: 'Reference Project Payload',
    skillId: null,
    designSystemId: null,
    createdAt: Date.now() - 1_000,
    updatedAt: Date.now(),
    metadata: {
      kind: 'prototype',
      nameSource: 'user',
    },
  };

  await routeComposerPlusFixtures(page);
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'workspace-context-payload-run' });
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [referenceProject] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/projects/ref-project-payload**', async (route) => {
    await route.fulfill({
      json: {
        project: referenceProject,
        resolvedDir: '/tmp/open-design/reference-project-payload',
      },
    });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer workspace context payload',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-project-payload' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });

  await page.goto('/');
  await createProject(page, 'Composer workspace context payload');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  // Both context actions sit inside the "+" menu's working-dir group.
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByTestId('composer-plus-reference-project').click();
  const referenceDialog = page.getByRole('dialog', { name: 'Reference another project' });
  await expect(referenceDialog.getByRole('option', { name: /Reference Project Payload/i })).toHaveAttribute('aria-selected', 'true');
  await referenceDialog.getByRole('button', { name: 'Reference project' }).click();
  await expect(input).toContainText('Reference Project Payload');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-project-payload');

  await input.fill('Use the referenced workspace contexts in this run.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ id?: string; label?: string; absolutePath?: string }> } | undefined;
  expect(context?.workspaceItems ?? []).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: 'project:ref-project-payload',
        label: 'Reference Project Payload',
        absolutePath: '/tmp/open-design/reference-project-payload',
      }),
      expect.objectContaining({
        id: 'local-code:/tmp/open-design/local-code-project-payload',
        label: 'local-code-project-payload',
        absolutePath: '/tmp/open-design/local-code-project-payload',
      }),
    ]),
  );
});

test('[P1] project detail composer removing local-code context updates metadata and the next run request', async ({ page }) => {
  test.fail(true, 'Deleting an inline workspace mention does not yet remove linkedDirs metadata');
  const patchRequests: Array<Record<string, unknown>> = [];
  const runRequestBodies: Array<Record<string, unknown>> = [];

  await routeComposerPlusFixtures(page);
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'workspace-context-remove-run' });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-remove' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patchRequests.push(body);
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer remove context',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await createProject(page, 'Composer remove context');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByTestId('composer-plus-local-code').click();
  await expect(input).toContainText('local-code-remove');

  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  await expect(input).not.toContainText('local-code-remove');
  await expect.poll(() => patchRequests.length).toBeGreaterThanOrEqual(2);
  expect((patchRequests.at(-1)?.metadata as { linkedDirs?: string[] } | undefined)?.linkedDirs ?? []).toEqual([]);

  await input.fill('Run without the removed local code context.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ label?: string; absolutePath?: string }> } | undefined;
  expect(context?.workspaceItems ?? []).toEqual([]);
});

test('[P1] project detail keeps local-code context when linkedDirs PATCH removal fails', async ({ page }) => {
  test.fail(true, 'Inline workspace mention deletion does not yet reach the linkedDirs PATCH path');
  test.setTimeout(60_000);
  const patchRequests: Array<Record<string, unknown>> = [];
  const runRequestBodies: Array<Record<string, unknown>> = [];

  await routeComposerPlusFixtures(page);
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'workspace-context-remove-failure-run' });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-persist' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patchRequests.push(body);
      const linkedDirs = (body.metadata as { linkedDirs?: string[] } | undefined)?.linkedDirs ?? [];
      if (linkedDirs.length === 0) {
        await route.fulfill({
          status: 400,
          json: { error: { code: 'INVALID_LINKED_DIR', message: 'linked dir removal rejected' } },
        });
        return;
      }
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer remove context failure',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, 'Composer remove context failure');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');
  const input = page.getByTestId('chat-composer-input');

  await composer.getByTestId('chat-plus-trigger').click();
  // Link-local-code sits inside the + menu's working-dir group.
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByRole('menuitem', { name: /Link local code/i }).click();
  await expect(input).toContainText('local-code-persist');

  await input.press('ControlOrMeta+A');
  await input.press('Backspace');
  await expect.poll(() => patchRequests.length).toBeGreaterThanOrEqual(2);
  await expect(input).toContainText('local-code-persist');

  await input.fill('Run with the local code context after removal failed.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ label?: string; absolutePath?: string }> } | undefined;
  expect(context?.workspaceItems ?? []).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: 'local-code-persist',
        absolutePath: '/tmp/open-design/local-code-persist',
      }),
    ]),
  );
});

test('[P1] project detail composer context actions emit analytics event fields', async ({ page }) => {
  test.fail(true, 'Inline workspace mention deletion does not yet emit context_remove analytics');
  const analyticsBodies: string[] = [];

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          mode: 'daemon',
          apiKey: '',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5',
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          onboardingCompleted: true,
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          privacyDecisionAt: 1,
          telemetry: { metrics: true, content: false, artifactManifest: false },
        },
      },
    });
  });
  await page.route('**/api/analytics/config', async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        env: 'e2e',
        key: 'phc_e2e',
        host: 'https://analytics.open-design.test',
        installationId: 'e2e-installation',
      },
    });
  });
  await page.route('https://analytics.open-design.test/**', async (route) => {
    analyticsBodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, json: { status: 1 } });
  });
  await routeComposerPlusFixtures(page);
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: '/tmp/open-design/local-code-analytics' } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          project: {
            id: route.request().url().split('/api/projects/')[1]?.split(/[/?#]/)[0] ?? 'project',
            name: 'Composer context analytics',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: body.metadata ?? { kind: 'prototype' },
          },
        },
      });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await createProject(page, 'Composer context analytics');
  await expectWorkspaceReady(page);
  const composer = page.getByTestId('chat-composer');

  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-working-dir').click();
  await page.getByTestId('composer-plus-local-code').click();
  const chip = composer.locator('.staged-context--workspace', { hasText: 'local-code-analytics' });
  await expect(chip).toBeVisible();
  await chip.getByRole('button', { name: /local-code-analytics/i }).click();
  await expect(chip).toHaveCount(0);

  await expect.poll(() => analyticsBodies.join('\n')).toContain('plus_pick');
  const raw = analyticsBodies.join('\n');
  expect(raw).toContain('context_remove');
  expect(raw).toContain('workspace');
  expect(raw).toContain('local-code');
});

const TEAM_RUN_CONTEXT = {
  workspaceId: 'e2e-team-run-workspace',
  workspaceName: 'E2E Team Run Workspace',
  workspaceType: 'team' as const,
  workspaceMemberId: 'e2e-team-run-member',
  role: 'owner' as const,
  memberStatus: 'active' as const,
  lifecycleState: 'active' as const,
  billingState: 'active' as const,
  planId: 'team_plus',
  seatSummary: {
    seatLimit: 5,
    usedSeats: 2,
    availableSeats: 3,
    isSeatFull: false,
  },
  permissions: {
    canInviteMembers: true,
    canManageBilling: true,
    canViewWorkspaceSettings: true,
    canManageSharedResources: true,
    canShareProjects: true,
    canWriteSyncedFiles: true,
  },
  workspaceSettingsUrl: 'https://console.example.test/workspace/e2e-team-run-workspace',
};

async function wireTeamRunBalanceFixtures(
  page: Page,
  options: {
    personalBalanceUsd: string;
    teamBalanceUsd: string;
  },
): Promise<{
  personalWalletRequests: () => number;
  resetBalanceRequests: () => void;
  teamBillingRequests: () => number;
  teamBillingQueries: () => Array<Record<string, string | null>>;
}> {
  let personalWalletRequestCount = 0;
  let teamBillingRequestCount = 0;
  const teamBillingQueries: Array<Record<string, string | null>> = [];
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          mode: 'daemon',
          apiKey: '',
          baseUrl: 'https://api.anthropic.com',
          model: 'claude-sonnet-4-5',
          agentId: 'amr',
          skillId: null,
          designSystemId: null,
          onboardingCompleted: true,
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
          agentModels: {},
          agentCliEnv: {},
        },
      },
    });
  });
  await routeAgents(page, [
    ...AGENTS,
    {
      id: 'amr',
      name: 'OpenDesign Cloud',
      bin: 'amr',
      available: true,
      version: 'cloud',
      models: [{ id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
    },
  ]);
  await page.route('**/api/integrations/vela/status', async (route) => {
    await route.fulfill({
      json: {
        loggedIn: true,
        loginInFlight: false,
        profile: 'test',
        user: {
          id: 'e2e-team-run-user',
          email: 'team-run@example.com',
          name: 'Team Run Owner',
          plan: 'team_plus',
        },
        account: { plan: 'free', balanceUsd: options.personalBalanceUsd },
        configPath: '/tmp/.amr/config.json',
      },
    });
  });
  await page.route('**/api/integrations/vela/wallet**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/integrations/vela/wallet') {
      personalWalletRequestCount += 1;
    }
    await route.fulfill({
      json: {
        status: 'available',
        profile: 'local',
        user: {
          id: 'e2e-team-run-user',
          email: 'team-run@example.com',
          plan: 'free',
        },
        balanceUsd: options.personalBalanceUsd,
        updatedAt: '2026-08-02T00:00:00.000Z',
        fetchedAt: '2026-08-02T00:00:00.000Z',
        stale: false,
        source: 'vela_api',
      },
    });
  });
  await page.route('**/api/workspace/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const { pathname } = url;
    if (request.method() !== 'GET') {
      await route.fallback();
      return;
    }
    if (pathname === '/api/workspace/context') {
      await route.fulfill({ json: { context: TEAM_RUN_CONTEXT } });
      return;
    }
    if (pathname === '/api/workspace/directory') {
      await route.fulfill({
        json: {
          items: [{
            workspaceId: TEAM_RUN_CONTEXT.workspaceId,
            workspaceName: TEAM_RUN_CONTEXT.workspaceName,
            workspaceType: TEAM_RUN_CONTEXT.workspaceType,
            workspaceMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
            role: TEAM_RUN_CONTEXT.role,
            memberStatus: TEAM_RUN_CONTEXT.memberStatus,
            lifecycleState: TEAM_RUN_CONTEXT.lifecycleState,
          }],
          activeWorkspaceId: TEAM_RUN_CONTEXT.workspaceId,
        },
      });
      return;
    }
    if (pathname === '/api/workspace/billing') {
      teamBillingRequestCount += 1;
      const query = {
        scope: url.searchParams.get('scope'),
        workspaceId: url.searchParams.get('workspaceId'),
        freshness: url.searchParams.get('freshness'),
      };
      teamBillingQueries.push(query);
      if (
        query.scope !== 'workspace' ||
        query.workspaceId !== TEAM_RUN_CONTEXT.workspaceId ||
        (query.freshness !== null && query.freshness !== 'authoritative')
      ) {
        await route.fulfill({ status: 400, json: { error: 'unexpected_billing_scope' } });
        return;
      }
      await route.fulfill({
        json: {
          summary: null,
          workspaceBalance: {
            billingScopeVersion: 2,
            workspaceId: TEAM_RUN_CONTEXT.workspaceId,
            workspaceMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
            balanceUsd: options.teamBalanceUsd,
            expiresAt: null,
            updatedAt: '2026-08-02T00:00:00.000Z',
          },
          workspaceRuntime: {
            workspaceId: TEAM_RUN_CONTEXT.workspaceId,
            workspaceMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
            status: 'fresh',
            revision: '1',
            observedAt: '2026-08-02T00:00:00.000Z',
            softExpiresAt: '2099-08-02T00:00:30.000Z',
            hardExpiresAt: '2099-08-02T00:02:00.000Z',
            retryAt: null,
            errorCode: null,
            reason:
              query.freshness === 'authoritative'
                ? 'authoritative-action-read'
                : 'explicit-billing-read',
            sourceGapDetected: false,
          },
          ...(query.freshness === 'authoritative'
            ? {
                authoritativeWorkspaceRead: {
                  workspaceId: TEAM_RUN_CONTEXT.workspaceId,
                  workspaceMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
                  observedAt: '2026-08-02T00:00:00.000Z',
                },
              }
            : {}),
        },
      });
      return;
    }
    if (pathname === '/api/workspace/projects/team') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.fallback();
  });
  return {
    personalWalletRequests: () => personalWalletRequestCount,
    resetBalanceRequests: () => {
      personalWalletRequestCount = 0;
      teamBillingRequestCount = 0;
      teamBillingQueries.length = 0;
    },
    teamBillingRequests: () => teamBillingRequestCount,
    teamBillingQueries: () => [...teamBillingQueries],
  };
}

async function createBoundTeamProject(
  page: Page,
  projectName: string,
): Promise<{ projectId: string; conversationId: string }> {
  const response = await createProjectViaApi(page, projectName);
  const created = (await response.json()) as {
    project: Record<string, unknown> & { id: string };
    conversationId: string;
  };
  const bindProject = (project: Record<string, unknown>) => ({
    ...project,
    workspaceId: TEAM_RUN_CONTEXT.workspaceId,
    visibility: 'personal',
    createdByWorkspaceMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
    updatedByWorkspaceMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
  });

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    const responseFromDaemon = await route.fetch();
    const body = (await responseFromDaemon.json()) as {
      projects?: Array<Record<string, unknown> & { id?: string }>;
    };
    await route.fulfill({
      response: responseFromDaemon,
      json: {
        ...body,
        projects: (body.projects ?? []).map((project) =>
          project.id === created.project.id ? bindProject(project) : project),
      },
    });
  });
  await page.route(`**/api/projects/${created.project.id}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: { project: bindProject(created.project) },
    });
  });
  await page.route(`**/api/projects/${created.project.id}/collab/status`, async (route) => {
    await route.fulfill({
      json: {
        publishedVersion: 1,
        materializedVersion: 1,
        awaitingFirstMaterialization: false,
        syncState: 'synced',
        ownerMemberId: TEAM_RUN_CONTEXT.workspaceMemberId,
        ownerDisplayName: 'Team Run Owner',
        ownerRole: TEAM_RUN_CONTEXT.role,
        contentTransferState: null,
      },
    });
  });
  return {
    projectId: created.project.id,
    conversationId: created.conversationId,
  };
}

test('[P0] Team project send keeps exact Team run scope through project bootstrap', async ({ page }) => {
  test.setTimeout(60_000);
  const prompt = 'Run against the exact Team workspace established during project bootstrap.';
  const balanceRequests = await wireTeamRunBalanceFixtures(page, {
    personalBalanceUsd: '0.00',
    teamBalanceUsd: '99.97',
  });
  const { projectId, conversationId } = await createBoundTeamProject(
    page,
    'Exact Team scope run witness',
  );
  let scopeRequests = 0;
  let scopedReadHeaders: Record<string, string> | null = null;
  await page.route(`**/api/projects/${projectId}/workspace-scope`, async (route) => {
    scopeRequests += 1;
    const requestHeaders = await route.request().allHeaders();
    // Route bootstrap must finish before ProjectView mounts. Capture the first
    // exact Team read without blocking it, then prove the same witness reaches
    // the run and billing boundaries below.
    if (
      scopedReadHeaders === null
      && requestHeaders['x-od-workspace-id'] === TEAM_RUN_CONTEXT.workspaceId
      && requestHeaders['x-od-workspace-member-id'] === TEAM_RUN_CONTEXT.workspaceMemberId
    ) {
      scopedReadHeaders = requestHeaders;
    }
    await route.fulfill({
      json: {
        scope: {
          kind: 'team',
          projectId,
          workspaceId: TEAM_RUN_CONTEXT.workspaceId,
          visibility: 'personal',
          context: TEAM_RUN_CONTEXT,
        },
      },
    });
  });
  const runBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, {
    bodies: runBodies,
    runIdPrefix: 'pending-team-scope-run',
    events: false,
  });
  const runHeaders: Array<Record<string, string>> = [];
  await page.route('**/api/runs', async (route) => {
    if (route.request().method() === 'POST') {
      runHeaders.push(await route.request().allHeaders());
    }
    await route.fallback();
  });

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  await expect.poll(() => scopeRequests).toBeGreaterThanOrEqual(2);
  expect(scopedReadHeaders?.['x-od-workspace-id']).toBe(TEAM_RUN_CONTEXT.workspaceId);
  expect(scopedReadHeaders?.['x-od-workspace-member-id']).toBe(
    TEAM_RUN_CONTEXT.workspaceMemberId,
  );
  await expect(page.getByTestId('chat-composer-input')).toBeEditable();
  balanceRequests.resetBalanceRequests();
  await page.getByTestId('chat-composer-input').fill(prompt);
  await page.getByTestId('chat-send').click();

  await expect.poll(() => runHeaders.length).toBe(1);
  expect(runHeaders[0]?.['x-od-workspace-id']).toBe(TEAM_RUN_CONTEXT.workspaceId);
  expect(runHeaders[0]?.['x-od-workspace-member-id']).toBe(
    TEAM_RUN_CONTEXT.workspaceMemberId,
  );
  // Run scope is an HTTP authority header contract. The daemon intentionally
  // does not duplicate this mutable principal into ChatRequest JSON.
  expect(runBodies[0]?.currentPrompt).toBe(prompt);
  expect(balanceRequests.teamBillingRequests()).toBeGreaterThanOrEqual(1);
  const teamBillingQueries = balanceRequests.teamBillingQueries();
  expect(teamBillingQueries.length).toBeGreaterThanOrEqual(1);
  for (const query of teamBillingQueries) {
    expect(query.scope).toBe('workspace');
    expect(query.workspaceId).toBe(TEAM_RUN_CONTEXT.workspaceId);
    expect([null, 'authoritative']).toContain(query.freshness);
  }
  expect(teamBillingQueries.some((query) => query.freshness === 'authoritative')).toBe(true);
  // Team preflight reads the account snapshot once for signed-in identity
  // metadata only; Personal $0 is not the balance oracle and cannot veto the
  // Team-funded run proved above.
  expect(balanceRequests.personalWalletRequests()).toBe(1);
  await expect(page.getByTestId('amr-balance-dialog')).toHaveCount(0);
});

test('[P0] Team project balance gate ignores funded Personal wallet and blocks on empty Team wallet', async ({ page }) => {
  test.setTimeout(60_000);
  const balanceRequests = await wireTeamRunBalanceFixtures(page, {
    personalBalanceUsd: '99.97',
    teamBalanceUsd: '0.00',
  });
  const { projectId, conversationId } = await createBoundTeamProject(
    page,
    'Empty Team wallet run witness',
  );
  let scopeRequests = 0;
  let scopedReadHeaders: Record<string, string> | null = null;
  await page.route(`**/api/projects/${projectId}/workspace-scope`, async (route) => {
    scopeRequests += 1;
    const requestHeaders = await route.request().allHeaders();
    if (
      scopedReadHeaders === null
      && requestHeaders['x-od-workspace-id'] === TEAM_RUN_CONTEXT.workspaceId
      && requestHeaders['x-od-workspace-member-id'] === TEAM_RUN_CONTEXT.workspaceMemberId
    ) {
      scopedReadHeaders = requestHeaders;
    }
    await route.fulfill({
      json: {
        scope: {
          kind: 'team',
          projectId,
          workspaceId: TEAM_RUN_CONTEXT.workspaceId,
          visibility: 'personal',
          context: TEAM_RUN_CONTEXT,
        },
      },
    });
  });
  const runRequests = await routeSuccessfulRuns(page, {
    runIdPrefix: 'should-not-use-personal-wallet',
    events: false,
  });

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  await expect.poll(() => scopeRequests).toBeGreaterThanOrEqual(2);
  expect(scopedReadHeaders?.['x-od-workspace-id']).toBe(TEAM_RUN_CONTEXT.workspaceId);
  expect(scopedReadHeaders?.['x-od-workspace-member-id']).toBe(
    TEAM_RUN_CONTEXT.workspaceMemberId,
  );
  await expect(page.getByTestId('chat-composer-input')).toBeEditable();
  balanceRequests.resetBalanceRequests();
  await page.getByTestId('chat-composer-input').fill(
    'Do not charge the funded Personal wallet for this Team project.',
  );
  await page.getByTestId('chat-send').click();

  const dialog = page.getByTestId('amr-balance-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('$0.00');
  expect(balanceRequests.teamBillingRequests()).toBeGreaterThanOrEqual(1);
  const teamBillingQueries = balanceRequests.teamBillingQueries();
  expect(teamBillingQueries.length).toBeGreaterThanOrEqual(1);
  for (const query of teamBillingQueries) {
    expect(query.scope).toBe('workspace');
    expect(query.workspaceId).toBe(TEAM_RUN_CONTEXT.workspaceId);
    expect([null, 'authoritative']).toContain(query.freshness);
  }
  expect(teamBillingQueries.some((query) => query.freshness === 'authoritative')).toBe(true);
  // Conversely, funded Personal identity metadata cannot override Team $0.
  expect(balanceRequests.personalWalletRequests()).toBe(1);
  await runRequests.expectNone({
    message: 'An empty Team wallet must block before POST /api/runs',
  });
});

test('[P0] @critical project detail composer agent menu lets the user switch the model', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await createProject(page, 'Composer agent switch');
  await expectWorkspaceReady(page);

  const { menu } = await openComposerAgentMenu(page);
  const list = menu.getByTestId('avatar-model-list');
  await expect(list).toBeVisible();
  await expect(list.locator('.avatar-model-option.is-active')).toContainText(/default/i);

  await list.getByRole('radio', { name: /^GPT 5\.5$/i }).click();

  const { menu: reopened } = await openComposerAgentMenu(page);
  await expect(
    reopened.getByTestId('avatar-model-list').locator('.avatar-model-option.is-active'),
  ).toContainText(/GPT 5\.5/i);
});

test('[P0] project detail composer model switch carries into the next daemon run request', async ({ page }) => {
  test.setTimeout(60_000);
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runId: 'agent-model-run' });
  await mockWritablePersonalProjectScope(page);

  await page.goto('/');
  await createProject(page, 'Composer agent switch run context', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await expectWorkspaceReady(page);

  await pickComposerModel(page, /^GPT 5\.5$/i);

  // The composer no longer carries a session-mode picker (#7635): every turn
  // runs in the conversation's stored mode, which is design for a new project.
  await expect(page.getByTestId('chat-composer').getByTestId('composer-mode-trigger')).toHaveCount(0);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Use the selected local agent for this design run.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.agentId).toBe('codex');
  expect(runRequestBodies[0]?.model).toBe('gpt-5.5');
  expect(runRequestBodies[0]?.sessionMode).toBe('design');
});

test('[P1] GPT 5.5 Fast service tier carries into the next Codex daemon run request', async ({ page }) => {
  test.setTimeout(60_000);
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'codex-fast-tier-run' });

  await page.goto('/');
  await createProject(page, 'Codex Fast service tier contract');
  await expectWorkspaceReady(page);

  await pickComposerModel(page, /^GPT 5\.5$/i);
  const { menu } = await openComposerAgentMenu(page);

  const serviceTierSelect = menu
    .locator('label.avatar-select-row', { hasText: /Service tier/i })
    .locator('select');
  await expect(serviceTierSelect).toBeVisible();
  await serviceTierSelect.selectOption('priority');
  await expect(serviceTierSelect).toHaveValue('priority');

  await page.keyboard.press('Escape');
  await expect(page.locator('.avatar-popover[role="dialog"]')).toHaveCount(0);

  await page.getByTestId('chat-composer-input').fill('Use GPT 5.5 Fast for this Codex run.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  expect(runRequestBodies[0]).toMatchObject({
    agentId: 'codex',
    model: 'gpt-5.5',
    serviceTier: 'priority',
  });
});
test('[P1] project detail composer keeps design mode across consecutive turns without a mode picker', async ({ page }) => {
  test.setTimeout(60_000);
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'fixed-design-mode-run' });

  await page.goto('/');
  await createProject(page, 'Composer session mode contract');
  await expectWorkspaceReady(page);

  async function sendTurn(prompt: string) {
    const input = page.getByTestId('chat-composer-input');
    await expect(input).toBeVisible();
    await input.fill(prompt);
    await Promise.all([
      page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
      page.getByTestId('chat-send').click(),
    ]);
    await expect(input).toHaveText('');
  }

  // The 规划/设计/提问 picker left the composer row (#7635): there is nothing
  // to alternate from here, and consecutive turns keep the conversation's
  // stored mode — design for a new project — on every run request.
  await expect(page.getByTestId('chat-composer').getByTestId('composer-mode-trigger')).toHaveCount(0);
  await expect(page.getByTestId('composer-mode-menu')).toHaveCount(0);

  await sendTurn('Design the first iteration.');
  await sendTurn('Design the second iteration without touching any mode control.');

  expect(runRequestBodies.map((body) => body.sessionMode)).toEqual(['design', 'design']);
});

test('[P0] @critical project detail composer opens Execution settings where BYOK model choice persists', async ({ page }) => {
  test.setTimeout(60_000);
  let config = {
    mode: 'daemon',
    apiKey: 'sk-openai-test',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-2024-05-13',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mediaProviders: {},
    agentModels: { codex: { model: 'default' } },
    agentCliEnv: {},
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      config = { ...config, ...body };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config }),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer BYOK model switch');
  await expectWorkspaceReady(page);

  const { menu } = await openComposerAgentMenu(page);
  await menu.getByTestId('avatar-open-execution-settings').click();

  const settings = settingsSurface(page);
  await expect(settings).toBeVisible();
  await expect(settings.getByTestId('settings-nav-execution')).toBeVisible();
  await settings.getByRole('tab', { name: 'API providers' }).click();
  await settings.getByRole('tab', { name: 'OpenAI', exact: true }).click();
  const modelSelect = settings.getByRole('combobox', { name: 'Model', exact: true });
  await expect(modelSelect).toContainText('Custom (type below)…');
  await expect(settings.getByRole('textbox', { name: 'Custom model id', exact: true }))
    .toHaveValue('gpt-4o-2024-05-13');
  await modelSelect.click();
  const modelPopover = page.getByTestId('settings-byok-model-popover');
  await expect(modelPopover.getByRole('option', { name: /^gpt-4o-mini$/i })).toBeVisible();
  await expect(modelPopover.getByRole('option', { name: /deepseek/i })).toHaveCount(0);
  await expect(modelPopover.getByRole('option', { name: /MiniMax/i })).toHaveCount(0);
  await modelPopover.getByRole('option', { name: /^gpt-4o-mini$/i }).click();

  await expect(modelSelect).toContainText('gpt-4o-mini');
  await expect.poll(async () => page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY)).toMatchObject({
    mode: 'api',
    model: 'gpt-4o-mini',
  });
});

test('[P0] @critical project detail composer keeps Local CLI and BYOK model choices isolated', async ({ page }) => {
  test.setTimeout(60_000);
  const config = {
    mode: 'daemon',
    apiKey: 'test-byok-key',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-2024-05-13',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mediaProviders: {},
    agentModels: { codex: { model: 'default' } },
    agentCliEnv: {},
  };

  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: config },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ config: body }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ config }),
    });
  });

  await page.goto('/');
  await createProject(page, 'Composer model mode isolation');
  await expectWorkspaceReady(page);

  // Picking a Local CLI model must not touch the stored BYOK model: the two
  // live in separate config slots (`agentModels[agentId].model` vs `model`).
  await pickComposerModel(page, /^GPT 5\.5$/i);

  await expect.poll(async () => page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY)).toMatchObject({
    mode: 'daemon',
    agentId: 'codex',
    model: 'gpt-4o-2024-05-13',
    agentModels: {
      codex: { model: 'gpt-5.5' },
    },
  });

  const { menu } = await openComposerAgentMenu(page);
  await expect(
    menu.getByTestId('avatar-model-list').locator('.avatar-model-option.is-active'),
  ).toContainText(/GPT 5\.5/i);
});

test('[P0] clearing the project design system removes designSystemId from the next run request', async ({ page }) => {
  const patchBodies: Array<Record<string, unknown>> = [];
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    patchBodies.push(body);
    await route.continue();
  });
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runId: 'design-system-clear-run' });

  await page.goto('/');
  await createProject(page, 'Header design system clear run context');
  await expectWorkspaceReady(page);

  const trigger = projectDesignSystemTrigger(page);
  await expect(trigger).toHaveAccessibleName(/^Design system$/i);
  await trigger.click();
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const editorialOption = page.getByRole('option', { name: /^Editorial Noir$/ });
  await expect(editorialOption).toBeVisible();
  await editorialOption.click();
  await expect(trigger).toHaveAccessibleName(/Editorial Noir/i);

  await trigger.click();
  await page.locator('.project-ds-picker-option').first().click();
  await expect(trigger).toHaveAccessibleName(/^Design system$/i);

  expect(patchBodies.some((body) => Object.prototype.hasOwnProperty.call(body, 'designSystemId') && body.designSystemId === null)).toBe(true);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Generate this without an active design system.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.designSystemId).toBeNull();
});

test('[P1] a disabled project design system is omitted from the next run request', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          config: {
            onboardingCompleted: true,
            agentId: 'codex',
            designSystemId: null,
            disabledDesignSystems: ['editorial-noir'],
            agentModels: { codex: { model: 'default' } },
            privacyDecisionAt: 1,
            telemetry: { metrics: false, content: false, artifactManifest: false },
          },
        },
      });
      return;
    }
    await route.fallback();
  });
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runId: 'disabled-design-system-run' });

  await createProject(page, 'Disabled project design system');
  await expectWorkspaceReady(page);
  const projectId = getProjectContextFromUrl(page).projectId;
  const projectResponse = await page.request.get(`/api/projects/${projectId}`);
  expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy();
  const projectPayload = (await projectResponse.json()) as { project: Record<string, unknown> };
  const disabledProject = {
    ...projectPayload.project,
    designSystemId: 'editorial-noir',
  };
  await page.route(`**/api/projects/${projectId}`, async (route) => {
    if (route.request().method() === 'GET' || route.request().method() === 'PATCH') {
      await route.fulfill({ json: { project: disabledProject } });
      return;
    }
    await route.fallback();
  });
  await page.reload();
  await expectWorkspaceReady(page);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Generate without the disabled design system.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  expect(runRequestBodies).toHaveLength(1);
  expect(runRequestBodies[0]?.designSystemId).toBeNull();
});

test('[P1] project rename from the switcher persists after reload and ignores blank titles', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Original rename title');
  await expectWorkspaceReady(page);

  // The chat card carries no inline title any more (OPEND-3128); the project
  // is renamed through the switcher's row menu (K2 #8183).
  const switcher = page.getByTestId('workspace-tabs-dropdown-trigger');
  await renameProjectFromSwitcher(page, 'Original rename title', 'Renamed persistent title');
  await expect(switcher).toContainText('Renamed persistent title');

  await page.reload();
  await expectWorkspaceReady(page);
  await expect(switcher).toContainText('Renamed persistent title');

  await renameProjectFromSwitcher(page, 'Renamed persistent title', '   ');
  await page.reload();
  await expectWorkspaceReady(page);
  await expect(switcher).toContainText('Renamed persistent title');

  const project = await fetchCurrentProject(page);
  expect(project.name).toBe('Renamed persistent title');
});


test('[P1] project handoff CLI prompt copies the project path, framework, id, and target agent', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.defineProperty(window, '__copiedTexts', {
      value: store,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText(text: string) {
          store.push(text);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
  await routeHandoffEditors(page);
  await page.goto('/');
  await createProject(page, 'Handoff CLI prompt contract');
  await expectWorkspaceReady(page);
  await uploadTinyHtml(
    page,
    'handoff-cli.html',
    '<!doctype html><html><body><h1>Handoff CLI</h1></body></html>',
  );
  const { projectId } = getProjectContextFromUrl(page);

  const menu = await openHandoffCliTab(page);
  const pathButton = menu.locator('.handoff-path-button');
  await expect(pathButton).toBeEnabled();
  const projectDir = await pathButton.getAttribute('title');
  expect(projectDir).toBeTruthy();

  await menu.getByRole('button', { name: /^Next\.js$/ }).click();
  await menu.getByTestId('handoff-cli-item-codex').click();
  await expect(menu.getByTestId('handoff-cli-item-codex')).toContainText('Copied');

  const copied = await page.evaluate(() => {
    return (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? [];
  });
  const prompt = copied.at(-1) ?? '';
  expect(prompt).toContain(projectDir as string);
  expect(prompt).toContain('cd ');
  expect(prompt).toContain('Target: Next.js / React');
  expect(prompt).toContain('CLI: Codex CLI (codex)');
  expect(prompt).toContain(`Project ID: ${projectId}`);
});

test('[P1] canceling design file deletion keeps the file and open tab', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Design file delete cancel flow');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyPng(page, 'delete-cancel.png');
  const fileTab = tabBySuffix(page, uploadedName);
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('delete-cancel.png');
    await dialog.dismiss();
  });
  await openAllProjectFiles(page);
  await rowByFileName(page, uploadedName).hover();
  await menuByFileName(page, uploadedName).click();
  await page.getByTestId(`design-file-delete-${uploadedName}`).click();

  await expect(rowByFileName(page, uploadedName)).toBeVisible();
  await expect(fileTab).toBeVisible();

  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  expect(files.map((file) => file.name)).toContain(uploadedName);
});

test('[P1] project detail workspace keeps design file tabs and preview controls visible for uploaded html artifacts', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Workspace preview structure');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(page, 'workspace-preview.html', '<!doctype html><html><body><main><h1>Workspace Preview Structure</h1><p>Preview stays visible.</p></main></body></html>');

  const fileTab = tabBySuffix(page, uploadedName);
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  // #5517 replaced the tab strip's pages dropdown with a plain Design Files
  // tab; that tab is the file-navigation entry this assertion guards now.
  await expect(page.getByTestId('design-files-tab')).toBeVisible();

  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await expect(page.getByRole('tablist', { name: 'View mode' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Preview', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(artifactPreview(page)).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Workspace Preview Structure' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Preview viewport/i })).toBeVisible();
  await expect(page.locator('pre.viewer-source')).toHaveCount(0);
});

test('[P1] project detail turns carry the stored design session mode into daemon runs and message history', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'session-mode-run' });

  await page.goto('/');
  await createProject(page, 'Project session mode contract');
  await expectWorkspaceReady(page);

  // No picker in the composer row any more (#7635); the conversation's stored
  // mode is what every run request and message chip carry.
  await expect(page.getByTestId('composer-mode-trigger')).toHaveCount(0);

  await page.getByTestId('chat-composer-input').fill('Draft the first pass of the screens.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);
  await expect.poll(() => runRequestBodies.length).toBe(1);
  expect(runRequestBodies[0]?.sessionMode).toBe('design');
  // Design is the default, so the message history carries no mode chip for it
  // (only Ask / Plan turns are chipped).
  await expect(page.getByTestId('msg-run-context-row').last()).toBeVisible();
  await expect(page.getByTestId('msg-session-mode-chip')).toHaveCount(0);
});
test('[P1] BYOK OpenCode project run sends provider config through the daemon contract', async ({ page }) => {
  const byokConfig = {
    mode: 'api',
    apiKey: 'sk-openai-e2e',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: {},
    agentCliEnv: {},
  };
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: byokConfig },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { config: byokConfig } });
  });
  await routeAgents(page, [
    ...AGENTS,
    {
      id: 'byok-opencode',
      name: 'BYOK OpenCode',
      bin: 'opencode',
      available: true,
      version: '0.12.0',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
  await page.route('**/api/memory/extract', async (route) => {
    await route.fulfill({ json: { ok: true, extracted: [] } });
  });
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'byok-opencode-run' });

  await page.goto('/');
  await createProject(page, 'BYOK OpenCode daemon contract');
  await expectWorkspaceReady(page);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Create a landing page with the configured BYOK provider.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  expect(runRequestBodies[0]).toMatchObject({
    agentId: 'byok-opencode',
    model: 'gpt-4o-mini',
    byokProvider: {
      protocol: 'openai',
      apiKey: 'sk-openai-e2e',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiVersion: '',
    },
    analyticsHints: {
      runtimeType: 'byok',
    },
  });
});

test('[P1] BYOK OpenCode keyless vLLM run keeps auth fields out of the daemon contract', async ({ page }) => {
  const byokConfig = {
    mode: 'api',
    apiKey: '',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'http://127.0.0.1:8000/v1',
    model: 'model',
    apiProviderBaseUrl: 'http://127.0.0.1:8000/v1',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: {},
    agentCliEnv: {},
  };
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: byokConfig },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { config: byokConfig } });
  });
  await routeAgents(page, [
    ...AGENTS,
    {
      id: 'byok-opencode',
      name: 'BYOK OpenCode',
      bin: 'opencode',
      available: true,
      version: '0.12.0',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);
  await page.route('**/api/memory/extract', async (route) => {
    await route.fulfill({ json: { ok: true, extracted: [] } });
  });
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'byok-opencode-keyless-run' });

  await page.goto('/');
  await createProject(page, 'BYOK OpenCode keyless vLLM contract');
  await expectWorkspaceReady(page);

  await page.getByTestId('chat-composer-input').fill('Use the local vLLM BYOK endpoint.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  expect(runRequestBodies[0]).toMatchObject({
    agentId: 'byok-opencode',
    model: 'model',
    byokProvider: {
      protocol: 'openai',
      apiKey: '',
      baseUrl: 'http://127.0.0.1:8000/v1',
      model: 'model',
      requiresApiKey: false,
    },
    analyticsHints: {
      runtimeType: 'byok',
    },
  });
});

test('[P1] BYOK OpenCode unavailable blocks the project run before daemon routing', async ({ page }) => {
  const byokConfig = {
    mode: 'api',
    apiKey: 'sk-openai-e2e',
    apiProtocol: 'openai',
    apiVersion: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    apiProviderBaseUrl: 'https://api.openai.com/v1',
    agentId: null,
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    agentModels: {},
    agentCliEnv: {},
  };
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: byokConfig },
  );
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({ json: { config: byokConfig } });
  });
  await routeAgents(page, [
    ...AGENTS,
    {
      id: 'byok-opencode',
      name: 'BYOK OpenCode',
      bin: 'opencode',
      available: false,
      version: null,
      models: [],
    },
  ]);

  const runRequests = await routeSuccessfulRuns(page, {
    runIdPrefix: 'byok-opencode-unavailable-should-not-start',
    events: false,
  });

  await page.goto('/');
  await createProject(page, 'BYOK OpenCode unavailable contract');
  await expectWorkspaceReady(page);

  const input = page.getByTestId('chat-composer-input');
  await input.fill('Create a landing page with unavailable OpenCode.');
  await page.getByTestId('chat-send').click();

  await expect(page.locator('.run-error__description')).toContainText(
    /BYOK API runs require OpenCode/i,
  );
  await runRequests.expectNone({
    message: 'unavailable BYOK OpenCode should fail preflight before POST /api/runs',
  });
});

test('[P1] project detail active file context is sent with the run but hidden on the user message', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'workspace-context-run' });

  await page.goto('/');
  await createProject(page, 'Workspace context chip contract');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'workspace-context.html',
    '<!doctype html><html><body><main><h1>Workspace Context</h1></main></body></html>',
  );
  await expect(tabBySuffix(page, uploadedName)).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('chat-composer-input').fill('Use the currently open file as context.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ label?: string; id?: string }> } | undefined;
  expect(context?.workspaceItems?.some((item) => item.label === uploadedName || item.id?.includes(uploadedName))).toBe(true);
  await expect(page.getByTestId('msg-run-context-row')).toHaveCount(0);
  await expect(page.getByTestId('msg-workspace-context-chip')).toHaveCount(0);
});

test('[P1] project detail active file context survives reload in message history', async ({ page }) => {
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await routeSuccessfulRuns(page, { bodies: runRequestBodies, runIdPrefix: 'workspace-context-reload-run' });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, 'Workspace context reload contract');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'workspace-context-reload.html',
    '<!doctype html><html><body><main><h1>Workspace Context Reload</h1></main></body></html>',
  );
  await expect(tabBySuffix(page, uploadedName)).toHaveAttribute('aria-selected', 'true');

  await page.getByTestId('chat-composer-input').fill('Persist this file context through reload.');
  await Promise.all([
    page.waitForRequest((request) => request.url().includes('/api/runs') && request.method() === 'POST'),
    page.getByTestId('chat-send').click(),
  ]);

  await expect.poll(() => runRequestBodies.length).toBe(1);
  const context = runRequestBodies[0]?.context as { workspaceItems?: Array<{ label?: string; id?: string }> } | undefined;
  expect(runRequestBodies[0]?.sessionMode).toBe('design');
  expect(context?.workspaceItems?.some((item) => item.label === uploadedName || item.id?.includes(uploadedName))).toBe(true);
  // Design turns carry no mode chip (only Ask / Plan are chipped).
  await expect(page.getByTestId('msg-session-mode-chip')).toHaveCount(0);
  await expect(page.getByTestId('msg-workspace-context-chip').last()).toContainText(uploadedName);
  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('msg-session-mode-chip')).toHaveCount(0);
  await expect(page.getByTestId('msg-workspace-context-chip').last()).toContainText(uploadedName);
});

test('[P1] active project API defaults to the selected project file from the real workspace', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await createProject(page, 'MCP active context contract');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'mcp-active-context.html',
    '<!doctype html><html><body><main><h1>MCP Active Context</h1></main></body></html>',
  );
  const { projectId } = getProjectContextFromUrl(page);
  await expect(tabBySuffix(page, uploadedName)).toHaveAttribute('aria-selected', 'true');
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/active');
      const body = (await response.json()) as { projectId?: string; fileName?: string };
      return `${body.projectId ?? ''}:${body.fileName ?? ''}`;
    })
    .toBe(`${projectId}:${uploadedName}`);
});

test('[P1] project detail HTML version manager previews and restores an older snapshot', async ({ page }) => {
  const restoredRequests: string[] = [];

  await page.goto('/');
  await createProject(page, 'HTML version manager contract');
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(
    page,
    'version-manager.html',
    '<!doctype html><html><body><main><h1>Current Version</h1></main></body></html>',
  );
  const { projectId } = getProjectContextFromUrl(page);
  const now = Date.now();
  const currentVersion = {
    id: 'v-current',
    fileName: uploadedName,
    version: 2,
    label: 'Current generated HTML',
    createdAt: now,
    source: 'ai',
    prompt: 'Current generated HTML',
    promptSource: 'message',
    size: 82,
    mime: 'text/html',
    kind: 'html',
    current: true,
  };
  const oldVersion = {
    id: 'v-old',
    fileName: uploadedName,
    version: 1,
    label: 'Initial generated HTML',
    createdAt: now - 60_000,
    source: 'manual',
    prompt: 'Initial generated HTML',
    promptSource: 'manual',
    size: 78,
    mime: 'text/html',
    kind: 'html',
    current: false,
  };
  const restoredVersion = {
    ...oldVersion,
    id: 'v-restored',
    version: 3,
    source: 'restore',
    current: true,
    restoreFromVersionId: oldVersion.id,
  };
  const oldVersionContent = '<!doctype html><html><body><main><h1>Initial Version</h1></main></body></html>';
  const restoredContent = '<!doctype html><html><body><main><h1>Restored Version</h1></main></body></html>';

  await page.route(`**/api/projects/${projectId}/files/${uploadedName}/versions`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: {
          file: { name: uploadedName, kind: 'html', mime: 'text/html', size: oldVersionContent.length, mtime: now },
          versions: [currentVersion, oldVersion],
        },
      });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/projects/${projectId}/files/${uploadedName}/versions/v-old`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { version: oldVersion, content: oldVersionContent } });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/projects/${projectId}/files/${uploadedName}/versions/v-old/restore`, async (route) => {
    if (route.request().method() === 'POST') {
      restoredRequests.push(route.request().url());
      await route.fulfill({
        json: {
          file: { name: uploadedName, kind: 'html', mime: 'text/html', size: restoredContent.length, mtime: Date.now() },
          version: restoredVersion,
        },
      });
      return;
    }
    await route.continue();
  });

  await openUploadedHtmlArtifactPreview(page, uploadedName);
  await page.getByRole('button', { name: 'Versions' }).click();
  const dialog = page.getByRole('dialog', { name: 'Versions' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('option', { name: /Current generated HTML/i })).toHaveAttribute('aria-selected', 'true');

  await dialog.getByRole('option', { name: /Initial generated HTML/i }).click();
  await expect(dialog.locator('iframe').first().contentFrame().getByRole('heading', { name: 'Initial Version' })).toBeVisible();

  await dialog.getByRole('button', { name: 'Switch to this version' }).click();
  await dialog.getByRole('dialog', { name: 'Switch to this version?' }).getByRole('button', { name: 'Switch' }).click();
  await expect.poll(() => restoredRequests.length).toBe(1);
  await expect(dialog).toHaveCount(0);
});

test('[P1] project detail assistant completion actions support copy, fork, and feedback', async ({ page }) => {
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.defineProperty(window, '__copiedTexts', {
      value: store,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText(text: string) {
          store.push(text);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });

  const { projectId, conversationId, assistantMessageId, assistantText } =
    await seedProjectWithAssistantCompletion(page);

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  await expect(page.getByText('Assistant completion actions fixture')).toBeVisible();

  const copyButton = page.getByTestId('assistant-copy-markdown');
  await expect(copyButton).toBeVisible();
  await copyButton.click();
  await expect(copyButton).toHaveAttribute('data-copied', 'true');
  const copied = await page.evaluate(() => {
    return (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? [];
  });
  expect(copied.at(-1)).toBe(assistantText);

  const positive = page.getByTestId('assistant-feedback-positive');
  const negative = page.getByTestId('assistant-feedback-negative');
  await expect(positive).toBeVisible();
  await expect(negative).toBeVisible();
  await positive.click();
  await expect(positive).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.assistant-feedback-reasons')).toBeVisible();
  await negative.click();
  await expect(negative).toHaveAttribute('aria-pressed', 'true');
  await expect(positive).toHaveAttribute('aria-pressed', 'false');

  const forkRequestPromise = page.waitForRequest((request) => {
    return request.method() === 'POST'
      && request.url().endsWith(`/api/projects/${projectId}/conversations`);
  });
  await page.getByTestId('assistant-fork-button').click();
  const forkRequest = await forkRequestPromise;
  const forkBody = forkRequest.postDataJSON() as {
    forkAfterMessageId?: string;
    seedFromConversationId?: string;
    seedMessages?: unknown;
  };
  expect(forkBody.seedFromConversationId).toBe(conversationId);
  expect(forkBody.forkAfterMessageId).toBe(assistantMessageId);
  expect(forkBody.seedMessages).toBeUndefined();
  await expect
    .poll(() => getProjectContextFromUrl(page).conversationId)
    .not.toBe(conversationId);
});

for (const origin of ['artifact-card', 'toolbar'] as const) {
  test(`[P1] share failure recovery matches available actions from ${origin}`, async ({ page }) => {
    await page.clock.install();
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await mockWritablePersonalProjectScope(page);
    const { projectId, conversationId } = await seedProjectWithRepeatedArtifactCards(page);
    const publicationPath = `/api/projects/${projectId}/files/index.html/publish-public`;
    const url = `https://example.test/artifact/${projectId}/recovery-alias`;
    let attempts = 0;
    let releaseRetry = () => {};
    const retryGate = new Promise<void>(resolve => { releaseRetry = resolve; });
    await page.route(`**${publicationPath}`, async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { publication: null } });
        return;
      }
      attempts += 1;
      if (attempts === 1) {
        await route.fulfill({ status: 500, json: { error: 'fixture publish failed' } });
        return;
      }
      await retryGate;
      await route.fulfill({ json: { url, slug: 'recovery-alias', fileName: 'index.html' } });
    });
    await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
    await expectWorkspaceReady(page);
    if (origin === 'artifact-card') await page.getByTestId('artifact-card-publish-index.html').last().click();
    else await page.locator('.chrome-share-menu--unified > button[aria-label="Share"]').click();
    const menu = page.locator('.share-menu-popover[role="menu"]');
    const hint = menu.getByText('Closing this panel will not interrupt the upload.', { exact: true });
    await expect(hint).toHaveCount(0);
    const deploy = menu.getByRole('menuitem', { name: 'Deploy to Vercel', exact: true });
    if (origin === 'toolbar') await expect(deploy).toBeVisible();
    else await expect(deploy).toHaveCount(0);
    await test.info().attach(`failure-recovery-${origin}-entry`, { body: await page.screenshot(), contentType: 'image/png' });
    await menu.getByRole('menuitem', { name: 'Generate and copy link', exact: true }).click();
    await expect(menu.getByRole('status')).toHaveText('Could not create the share link. Please try again later.');
    expect(attempts).toBe(1);
    const retry = menu.getByRole('menuitem', { name: 'Retry', exact: true });
    await expect(retry).toBeEnabled();
    await test.info().attach(`failure-recovery-${origin}-failed`, { body: await page.screenshot(), contentType: 'image/png' });
    try {
      await retry.click();
      const progress = menu.getByRole('progressbar');
      await expect(progress).toBeVisible();
      // Advance the existing waiting simulation, not upload bytes or the held response.
      await page.clock.fastForward(3_500);
      await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(0.4);
      await expect(progress).toHaveCSS('height', '32px');
      await expect(progress).toHaveCSS('border-radius', '6px');
      await expect(progress).toHaveCSS('background-color', 'rgb(110, 110, 112)');
      const busy = menu.getByRole('menuitem', { name: /Uploading.*\d+%/ });
      await expect(busy).toBeDisabled();
      const spinner = busy.locator('.icon-spin');
      await expect(spinner).toHaveCSS('width', '13px');
      await expect(spinner).toHaveCSS('height', '13px');
      for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
        await expect(spinner).toHaveAttribute(name, value);
      }
      await expect(spinner.locator('path')).toHaveAttribute('d', 'M12 3a9 9 0 1 0 9 9');
      expect(await spinner.evaluate(node => getComputedStyle(node).animationName)).not.toBe('none');
      await expect(busy).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(busy).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      expect(await progress.boundingBox()).toEqual(await busy.boundingBox());
      const rendered = await progress.evaluate(node => ({
        value: Number(node.getAttribute('value')),
        text: node.parentElement?.querySelector('button')?.textContent,
      }));
      expect(rendered.value).toBeGreaterThan(0.4);
      expect(rendered.value).toBeLessThanOrEqual(0.9);
      expect(rendered.text).toContain(`${Math.round(rendered.value * 100)}%`);
      await expect(menu.getByRole('status')).toHaveCount(0);
      await expect.poll(() => attempts).toBe(2);
      await expect(hint).toBeVisible();
      await expect(hint).toHaveCSS('font-size', '10.5px');
      await expect(hint).toHaveCSS('line-height', '17px');
      await expect(hint).toHaveCSS('color', 'rgb(153, 153, 153)');
      await expect(hint).toHaveCSS('margin', '0px');
      await test.info().attach(`failure-recovery-${origin}-retry`, { body: await page.screenshot(), contentType: 'image/png' });
      const close = menu.getByRole('button', { name: 'Close', exact: true });
      const closeIcon = close.locator('svg');
      for (const [name, value] of Object.entries({ width: '14', height: '14', viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
        await expect(closeIcon).toHaveAttribute(name, value);
      }
      await expect(closeIcon).toHaveCSS('width', '14px');
      await expect(closeIcon).toHaveCSS('height', '14px');
      await expect(closeIcon.locator('path')).toHaveAttribute('d', 'M4 4l8 8M12 4l-8 8');
      await close.click();
      await expect(menu).toBeHidden();
      await page.clock.fastForward(500);
      if (origin === 'artifact-card') await page.getByTestId('artifact-card-publish-index.html').last().click();
      else await page.locator('.chrome-share-menu--unified > button[aria-label="Share"]').click();
      await expect(hint).toBeVisible();
      await expect(progress).toBeVisible();
      expect(Number(await progress.getAttribute('value'))).toBeGreaterThanOrEqual(rendered.value);
      expect(attempts).toBe(2); // Dismissing does not abort or restart the pending upload.
      await test.info().attach(`failure-recovery-${origin}-reopened`, { body: await page.screenshot(), contentType: 'image/png' });
    } finally {
      releaseRetry();
    }
    await expect(menu.getByRole('button', { name: 'Stop sharing', exact: true })).toBeVisible();
    await expect(menu).not.toContainText('Could not create the share link.');
    await expect(hint).toHaveCount(0);
    await expect(menu.getByRole('status')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect(retry).toHaveCount(0);
    await expect(menu.getByRole('progressbar')).toHaveCount(0);
    expect(attempts).toBe(2);
    if (origin === 'toolbar') await expect(deploy).toBeVisible();
    else await expect(deploy).toHaveCount(0);
    await test.info().attach(`failure-recovery-${origin}-success`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

for (const published of [false, true]) {
  test(`[P1] team scope trigger canvas published=${published}`, async ({ page }) => {
    await mockWritablePersonalProjectScope(page);
    const { projectId, conversationId } = await seedProjectWithRepeatedArtifactCards(page);
    const context = { ...AMR_PERSONAL_WORKSPACE_CONTEXT, workspaceType: 'team', teamId: 'scope-visual-team' };
    await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({
      json: { scope: { kind: 'team', projectId, workspaceId: context.workspaceId, visibility: 'team', context } },
    }));
    await page.route(`**/api/projects/${projectId}/collab/status`, route => route.fulfill({
      json: { publishedVersion: null, materializedVersion: null, syncState: 'local_only', ownerMemberId: context.workspaceMemberId },
    }));
    await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`, route => route.fulfill({
      json: { publication: published ? { url: `https://example.test/artifact/${projectId}/stable-alias`, slug: 'stable-alias', fileName: 'index.html' } : null },
    }));
    await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
    await expectWorkspaceReady(page);
    await page.locator('.chrome-share-menu--unified > button[aria-label="Share"]').click();
    const menu = page.locator('.share-menu-popover[role="menu"]');
    if (published) await expect(menu.getByRole('button', { name: 'Stop sharing', exact: true })).toBeVisible();
    else await expect(menu.getByRole('menuitem', { name: 'Generate and copy link', exact: true })).toBeVisible();
     const heading = menu.locator('.share-menu-section-label--help');
     await expect(heading).toHaveText('Visibility in workspace');
     const publicBlock = published ? menu.locator('.chrome-publish-plain') : menu.getByRole('menuitem', { name: 'Generate and copy link', exact: true });
     const publicBounds = (await publicBlock.boundingBox())!;
     expect((await heading.locator('..').boundingBox())!.y - publicBounds.y - publicBounds.height).toBe(32);
     for (const [property, value] of Object.entries({ padding: '0px', color: 'rgb(51, 51, 51)', 'font-size': '13px', 'font-weight': '500', 'line-height': '20px' })) {
       await expect(heading).toHaveCSS(property, value);
     }
     await expect(menu.getByTestId('workspace-access-help')).toHaveCount(0);
     const description = menu.getByText('Members of this workspace can access this project.', { exact: true });
     await expect(description).toBeVisible();
     for (const [property, value] of Object.entries({ margin: '0px', color: 'rgb(136, 136, 136)', 'font-size': '12px', 'line-height': '18px', 'font-weight': '400' })) {
       await expect(description).toHaveCSS(property, value);
     }
     await expect(description.locator('..')).toHaveCSS('gap', '4px');
     // S12 moved deployment entries into the header overflow, not a body heading.
     await expect(menu.getByRole('button', { name: 'More sharing options' })).toBeVisible();
     await expect(menu.locator('.share-menu-section-label:not(.share-menu-section-label--help)')).toHaveCount(0);
     const trigger = menu.locator('.chrome-access-trigger');
     const headingBounds = (await heading.boundingBox())!;
     const triggerBounds = (await trigger.boundingBox())!;
     expect(headingBounds.y + headingBounds.height / 2).toBe(triggerBounds.y + triggerBounds.height / 2);
     expect(triggerBounds.x).toBeGreaterThan(headingBounds.x + headingBounds.width);
     expect((await description.boundingBox())!.y - triggerBounds.y - triggerBounds.height).toBe(4);
    await expect(trigger).toBeEnabled();
    await expect(trigger.locator(':scope > .share-menu-icon')).toBeHidden();
    await expect(trigger.locator(':scope > svg')).toHaveCSS('width', '12px');
    await expect(trigger.locator(':scope > svg')).toHaveCSS('height', '12px');
    const chevron = trigger.locator(':scope > svg');
    for (const [name, value] of Object.entries({ viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      await expect(chevron).toHaveAttribute(name, value);
    }
    await expect(chevron.locator('path')).toHaveAttribute('d', 'm4 6 4 4 4-4');
    for (const [property, value] of Object.entries({
      height: '28px', 'min-height': '28px', 'min-width': '88px', padding: '0px 8px', gap: '8px',
      'border-top-width': '0px', 'border-radius': '5px', 'background-color': 'rgb(246, 246, 246)',
      color: 'rgb(85, 85, 85)', 'font-size': '12px', display: 'flex',
    })) await expect(trigger).toHaveCSS(property, value);
    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const scopeMenu = menu.getByRole('listbox');
    for (const [property, value] of Object.entries({
      padding: '4px', gap: '2px', display: 'flex', 'flex-direction': 'column',
      'border-top-width': '1px', 'border-top-color': 'rgba(0, 0, 0, 0.03)',
      'border-radius': '8px', 'background-color': 'rgb(255, 255, 255)',
      'box-shadow': 'rgba(0, 0, 0, 0.07) 0px 6px 20px 0px, rgba(0, 0, 0, 0.024) 0px 1px 4px 0px',
    })) await expect(scopeMenu).toHaveCSS(property, value);
    await expect(scopeMenu).toHaveCSS('min-width', '168px');
    await expect(scopeMenu).toHaveCSS('width', '168px');
    const scopeBounds = (await scopeMenu.boundingBox())!;
    const anchorBounds = (await trigger.boundingBox())!;
    expect(scopeBounds.x + scopeBounds.width).toBe(anchorBounds.x + anchorBounds.width);
    const options = menu.getByRole('option');
    for (const option of await options.all()) {
      await expect(option.locator(':scope > .share-menu-icon')).toBeHidden();
      const label = option.locator(':scope > span:nth-child(2)');
      await expect(label).toHaveCSS('grid-column-start', '2');
      expect(await label.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    }
    const check = menu.getByRole('option', { selected: true }).locator(':scope > svg');
    await expect(check).toHaveCSS('grid-column-start', '1');
    await expect(check).toHaveCSS('width', '13px');
    await expect(check).toHaveCSS('height', '13px');
    for (const [name, value] of Object.entries({ viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) {
      await expect(check).toHaveAttribute(name, value);
    }
    await expect(check.locator('path')).toHaveAttribute('d', 'm3 8 3 3 7-7');
    await expect(menu.getByRole('option', { selected: false }).locator(':scope > svg')).toHaveCount(0);
    await expect(options).toHaveCount(2);
    for (const option of await options.all()) {
      for (const [property, value] of Object.entries({
        height: '28px', 'min-height': '28px', padding: '0px 8px', gap: '8px',
        'border-top-width': '0px', 'border-radius': '4px', 'font-size': '12px', 'font-weight': '400',
      })) await expect(option).toHaveCSS(property, value);
    }
    const selected = menu.getByRole('option', { name: 'Workspace members', exact: true });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected).toHaveCSS('background-color', 'rgb(242, 242, 244)');
    await expect(selected).toHaveCSS('color', 'rgb(31, 31, 31)');
    const privateOption = menu.getByRole('option', { name: 'Only me', exact: true });
    await expect(privateOption).toHaveCSS('color', 'rgb(73, 73, 73)');
    await privateOption.hover();
    await expect(privateOption).toHaveCSS('background-color', 'rgb(242, 242, 244)');
    await expect(privateOption).toHaveCSS('color', 'rgb(31, 31, 31)');
    await expect(privateOption).toHaveAttribute('aria-selected', 'false');
    await trigger.hover();
    await expect(privateOption).toHaveCSS('color', 'rgb(73, 73, 73)');
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected).toHaveCSS('background-color', 'rgb(242, 242, 244)');
    await test.info().attach(`team-scope-${published ? 'published' : 'first'}`, { body: await page.screenshot(), contentType: 'image/png' });
    await trigger.click();
    await expect(menu.getByRole('listbox')).toBeHidden();

    // Keyboard navigation must not change visibility or dismiss the Share panel.
    await trigger.press('ArrowDown');
    await expect(selected).toBeFocused();
    await selected.press('Home');
    await expect(privateOption).toBeFocused();
    await privateOption.press('End');
    await expect(selected).toBeFocused();
    await selected.press('ArrowDown');
    await expect(privateOption).toBeFocused();
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await privateOption.press('Escape');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('listbox')).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);

    // A real confirmation/request drives busy state; do not inject DOM classes.
    const movePath = `/api/workspaces/${context.workspaceId}/projects/${projectId}/move`;
    let releaseMove = () => {};
    const moveGate = new Promise<void>(resolve => { releaseMove = resolve; });
    await page.route(`**${movePath}`, async route => {
      await moveGate;
      await route.fulfill({ status: 503, json: { error: { message: 'visual busy-state fixture' } } });
    });
    try {
      await trigger.press('ArrowUp');
      await expect(selected).toBeFocused();
      await selected.press('Home');
      await expect(privateOption).toBeFocused();
      await privateOption.press('Enter');
      const confirmation = page.getByRole('alertdialog', { name: 'Move out of team space' });
      const [request] = await Promise.all([
        page.waitForRequest(request => new URL(request.url()).pathname === movePath && request.method() === 'POST'),
        confirmation.getByRole('button', { name: 'Confirm move', exact: true }).click(),
      ]);
      expect(request.postDataJSON()).toEqual({ visibility: 'personal' });
      // Confirmation is outside the anchored popover and dismisses it.
      await page.locator('.chrome-share-menu--unified > button[aria-label="Share"]').click();
      await expect(trigger).toBeDisabled();
      await expect(trigger.locator('.share-menu-icon .icon-spin')).toBeVisible();
      await test.info().attach(`team-scope-busy-${published ? 'published' : 'first'}`, { body: await page.screenshot(), contentType: 'image/png' });
      const viewport = page.viewportSize()!;
      // Give the preview the viewport through the real layout control.
      await page.getByRole('button', { name: 'Collapse the conversation pane', exact: true }).click();
      try {
        await page.setViewportSize({ width: 320, height: 900 });
        // Collapsing chat changes the anchor layout; reopen the workspace entry.
        await expect(menu).toBeHidden();
        await page.locator('.chrome-share-menu--unified > button[aria-label="Share"]').click();
        await expect(menu).toBeVisible();
        const menuBox = (await menu.boundingBox())!;
        const triggerBox = (await trigger.boundingBox())!;
        const headingBox = (await heading.boundingBox())!;
        await test.info().attach(`team-scope-narrow-bounds-${published ? 'published' : 'first'}`, {
          body: JSON.stringify({ viewport: page.viewportSize(), menuBox, triggerBox, headingBox }), contentType: 'application/json',
        });
        expect(menuBox.x).toBeGreaterThanOrEqual(0);
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(320);
        expect(headingBox.x + headingBox.width + 12).toBeLessThanOrEqual(triggerBox.x);
        expect(triggerBox.x + triggerBox.width).toBeLessThanOrEqual(menuBox.x + menuBox.width - 20);
        expect(await heading.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
        await expect(trigger.locator('.share-menu-icon .icon-spin')).toBeVisible();
        await test.info().attach(`team-scope-narrow-busy-${published ? 'published' : 'first'}`, { body: await page.screenshot(), contentType: 'image/png' });
      } finally {
        if (!page.isClosed()) await page.setViewportSize(viewport);
      }
      await expect(menu).toBeVisible();
    } finally {
      releaseMove();
    }
    await expect(trigger).toBeEnabled();
    await expect(trigger.locator(':scope > .share-menu-icon')).toBeHidden();
    await expect(trigger).toHaveText('Workspace members');
    await expect(description).toBeVisible(); // Failed move must not announce a different visibility.

    // Reuse this workflow's settled team project for Chinese copy/cascade checks.
    for (const [locale, label] of [['zh-CN', '团队成员'], ['zh-TW', '團隊成員']] as const) {
      await page.evaluate(locale => {
        localStorage.setItem('open-design:locale', locale);
        localStorage.setItem('open-design:locale-source', 'manual');
      }, locale);
      await page.reload();
      await expectWorkspaceReady(page);
      await page.locator('.chrome-share-menu--unified > button[aria-label="分享"]').click();
      await expect(trigger).toHaveText(label);
      if (published) {
        const copyButton = menu.getByRole('button', { name: locale === 'zh-CN' ? '复制链接' : '複製連結', exact: true });
        await expect(copyButton).toBeEnabled();
        await expect(copyButton).toHaveCSS('height', '32px');
      }
      await expect(trigger).toBeEnabled();
      await trigger.click();
      const teamOption = menu.getByRole('option', { name: label, exact: true });
      await expect(teamOption).toHaveAttribute('aria-selected', 'true');
      await expect(teamOption).toHaveCSS('height', '28px');
      await expect(menu.getByRole('listbox')).toHaveCSS('width', '168px');
      const teamLabel = teamOption.locator(':scope > span:nth-child(2)');
      expect(await teamLabel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      await expect(menu).not.toContainText(locale === 'zh-CN' ? '工作空间成员' : '工作空間成員');
      await test.info().attach(`team-scope-${locale}-${published ? 'published' : 'first'}`, { body: await page.screenshot(), contentType: 'image/png' });
    }

    // Private workspace visibility is independent of the public file link.
    await page.route(`**/api/projects/${projectId}/collab/status`, route => route.fulfill({
      json: { publishedVersion: null, materializedVersion: null, syncState: 'local_only' },
    }));
    await page.route('**/api/workspace/projects/team', route => route.fulfill({ json: { projects: [] } }));
    for (const [locale, label, descriptionText] of [
      ['zh-CN', '仅自己', '只有你可以在工作区内访问此项目。'],
      ['zh-TW', '只有自己', '只有你可以在工作區內存取此專案。'],
    ] as const) {
      await page.evaluate(locale => {
        localStorage.setItem('open-design:locale', locale);
        localStorage.setItem('open-design:locale-source', 'manual');
      }, locale);
      await page.reload();
      await expectWorkspaceReady(page);
      await page.locator('.chrome-share-menu--unified > button[aria-label="分享"]').click();
      await expect(trigger).toHaveText(label);
      if (published) {
        const copyButton = menu.getByRole('button', { name: locale === 'zh-CN' ? '复制链接' : '複製連結', exact: true });
        await expect(copyButton).toBeEnabled();
        await expect(copyButton).toHaveCSS('height', '32px');
      }
      const privateDescription = menu.getByText(descriptionText, { exact: true });
      await expect(privateDescription).toBeVisible();
      await expect(privateDescription).toHaveCSS('font-size', '12px');
      await expect(privateDescription).toHaveCSS('line-height', '18px');
      if (published) await expect(menu.getByText(`https://example.test/artifact/${projectId}/stable-alias`, { exact: true })).toBeVisible();
      else await expect(menu.getByRole('menuitem', { name: locale === 'zh-CN' ? '生成并复制链接' : '產生並複製連結', exact: true })).toBeVisible();
      await trigger.click();
      await expect(menu.getByRole('option', { name: label, exact: true })).toHaveAttribute('aria-selected', 'true');
      await test.info().attach(`team-scope-private-${locale}-${published ? 'published' : 'first'}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
    await page.evaluate(() => {
      localStorage.setItem('open-design:locale', 'de');
      localStorage.setItem('open-design:locale-source', 'manual');
    });
    await page.reload();
    await expectWorkspaceReady(page);
    await page.locator('.chrome-share-menu--unified > button[aria-label="Teilen"]').click();
    await expect(trigger).toHaveText('Nur ich');
    await trigger.click();
    await expect(menu.getByRole('option', { name: 'Nur ich', exact: true })).toHaveAttribute('aria-selected', 'true');
    const germanMembers = menu.getByRole('option', { name: 'Teammitglieder', exact: true });
    await expect(germanMembers).toHaveAttribute('aria-selected', 'false');
    await expect(germanMembers).toHaveCSS('height', '28px');
    const germanLabel = germanMembers.locator(':scope > span:nth-child(2)');
    expect(await germanLabel.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await test.info().attach(`team-scope-private-de-${published ? 'published' : 'first'}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('[P1] S12 more sharing opens the existing deployment dialog from the share header', async ({ page }) => {
  await mockWritablePersonalProjectScope(page);
  const { projectId, conversationId } = await seedProjectWithRepeatedArtifactCards(page);
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  const secondShare = page.getByTestId('artifact-card-publish-index.html').nth(1);
  await secondShare.click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  const heading = menu.getByRole('heading', { name: 'Share', level: 2 });
  await expect(heading).toBeVisible();
  const moreSharing = menu.getByRole('button', { name: 'More sharing options', exact: true });
  await expect(moreSharing).toBeVisible();
  await expect(moreSharing).toHaveCSS('width', '20px');
  await expect(moreSharing).toHaveCSS('height', '20px');
  await moreSharing.click();
  const deploymentMenu = menu.getByRole('menu', { name: 'More sharing options', exact: true });
  await expect(deploymentMenu.getByRole('menuitem')).toHaveText(['Deploy to Vercel', 'Deploy to Cloudflare Pages']);
  for (const [property, value] of Object.entries({ width: '214px', height: '68px', padding: '4px', gap: '2px', 'border-radius': '8px', 'background-color': 'rgb(255, 255, 255)' })) {
    await expect(deploymentMenu).toHaveCSS(property, value);
  }
  const vercelAction = deploymentMenu.getByRole('menuitem', { name: 'Deploy to Vercel', exact: true });
  for (const [property, value] of Object.entries({ height: '28px', padding: '0px 8px', gap: '8px', 'font-size': '12px', 'font-weight': '400' })) {
    await expect(vercelAction).toHaveCSS(property, value);
  }
  await expect(vercelAction).toBeFocused();
  await test.info().attach('s12-more-sharing', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('ArrowDown');
  await expect(deploymentMenu.getByRole('menuitem', { name: 'Deploy to Cloudflare Pages' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(deploymentMenu).toBeHidden();
  await expect(moreSharing).toBeFocused();
  await expect(heading).toBeVisible();
  await moreSharing.click();
  await vercelAction.click();
  const deployDialog = page.getByRole('dialog');
  await expect(deployDialog).toBeVisible();
  await expect(deployDialog.getByRole('combobox', { name: /Provider/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(deployDialog).toBeHidden();
  await secondShare.click();
  await expect(heading).toBeVisible();
  // The toolbar consumes the same shell, not a second deployment implementation.
  await menu.getByRole('button', { name: 'Close', exact: true }).click();
  await page.locator('.chrome-share-menu--unified > button[aria-label="Share"]').click();
  await moreSharing.click();
  await expect(deploymentMenu.getByRole('menuitem')).toHaveCount(2);
  await test.info().attach('s12-toolbar-sharing', { body: await page.screenshot(), contentType: 'image/png' });
});

test('[P1] S10 failed stop preserves the share link and retries without republishing', async ({ page }) => {
  await mockWritablePersonalProjectScope(page);
  const { projectId, conversationId } = await seedProjectWithRepeatedArtifactCards(page);
  const publicationPath = `/api/projects/${projectId}/files/index.html/publish-public`;
  const slug = 's10-stable-alias';
  const url = `https://example.test/artifact/${projectId}/${slug}`;
  let stopAttempts = 0;
  let publishAttempts = 0;
  await page.route(`**${publicationPath}`, async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: { publication: { url, slug, fileName: 'index.html', publishedAt: 1 } } });
    } else if (method === 'DELETE') {
      stopAttempts += 1;
      await route.fulfill(stopAttempts === 1
        ? { status: 500, json: { error: 's10_fixture_stop_failure' } }
        : { json: { ok: true, slug, fileName: 'index.html' } });
    } else {
      publishAttempts += 1;
      await route.fulfill({ status: 500, json: { error: 'unexpected publish' } });
    }
  });
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  await page.getByTestId('artifact-card-publish-index.html').last().click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  const link = menu.locator('.chrome-publish-url');
  const stop = menu.getByRole('button', { name: 'Stop sharing', exact: true });
  const copy = menu.getByRole('button', { name: 'Copy share link', exact: true });
  await expect(link).toHaveText(url);
  const response = () => page.waitForResponse(r => r.request().method() === 'DELETE'
    && new URL(r.url()).pathname === publicationPath);
  const failure = response();
  await stop.click();
  expect((await failure).status()).toBe(500);
  await expect(menu.getByRole('status')).toHaveText('Could not turn off the link. Please try again.');
  await expect(link).toHaveText(url);
  await expect(stop).toBeEnabled();
  await expect(copy).toBeEnabled();
  await expect(menu).not.toContainText('Please manually copy');
  expect(stopAttempts).toBe(1);
  expect(publishAttempts).toBe(0);
  await test.info().attach('s10-stop-failed', { body: await page.screenshot(), contentType: 'image/png' });
  const retry = response();
  await stop.click();
  expect((await retry).ok()).toBe(true);
  await expect(menu.getByRole('menuitem', { name: 'Generate and copy link', exact: true })).toBeEnabled();
  await expect(link).toHaveCount(0);
  await expect(menu.getByRole('status')).toHaveCount(0);
  expect(stopAttempts).toBe(2);
  expect(publishAttempts).toBe(0);
});

test('[P1] repeated artifact cards anchor Share to the clicked turn and keep the card menu focused', async ({ page }) => {
  await page.clock.install();
  await mockWritablePersonalProjectScope(page);
  const { projectId, conversationId } = await seedProjectWithRepeatedArtifactCards(page);

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);

  const shareButtons = page.getByTestId('artifact-card-publish-index.html');
  await expect(shareButtons).toHaveCount(2);
  const firstShare = shareButtons.nth(0);
  const secondShare = shareButtons.nth(1);
  // E0/G1 share-only seams must survive the production global CSS cascade.
  const toolbarShare = page.locator('.chrome-share-menu--unified > button[aria-label="Share"]');
  await expect(toolbarShare).toBeVisible();
  for (const [property, value] of Object.entries({
    height: '28px', 'border-radius': '6px', gap: '5px',
    'padding-left': '12px', 'padding-right': '12px',
    'background-color': 'rgb(40, 40, 40)', color: 'rgb(255, 255, 255)',
    'font-size': '12px', 'font-weight': '500', 'border-top-width': '0px',
  })) {
    await expect(toolbarShare).toHaveCSS(property, value);
  }
  for (const [property, value] of Object.entries({
    height: '30px', 'border-radius': '6px', gap: '5px',
    'background-color': 'rgb(237, 237, 240)', color: 'rgb(51, 51, 51)',
    'font-size': '12px', 'font-weight': '500', 'border-top-width': '0px',
    'backdrop-filter': 'none', 'box-shadow': 'none',
  })) {
    await expect(secondShare).toHaveCSS(property, value);
  }
  const firstAnchor = await firstShare.getAttribute('data-artifact-anchor');
  const secondAnchor = await secondShare.getAttribute('data-artifact-anchor');
  expect(firstAnchor).toBeTruthy();
  expect(secondAnchor).toBeTruthy();
  expect(secondAnchor).not.toBe(firstAnchor);

  await secondShare.click();

  const anchoredMenu = page.locator('[data-anchored-menu]');
  await expect(anchoredMenu).toHaveCount(1);
  await expect(anchoredMenu).toHaveAttribute('data-anchored-menu', secondAnchor!);
  const menu = anchoredMenu.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  // Shared S1/S2/S3/S4/S4-C/S7 shell, scoped away from the Export tab.
  for (const [property, value] of Object.entries({
    width: '360px', padding: '16px 20px', gap: '12px',
    'border-radius': '12px', 'background-color': 'rgb(255, 255, 255)',
    'border-top-color': 'rgba(0, 0, 0, 0.03)', 'border-top-width': '1px',
    'box-shadow': 'rgba(0, 0, 0, 0.063) 0px 8px 28px 0px, rgba(0, 0, 0, 0.024) 0px 2px 6px 0px',
  })) {
    await expect(menu).toHaveCSS(property, value);
  }
  await expect(menu.locator('.chrome-unified-panel--share')).toHaveCSS('padding', '0px');
  await expect(menu.locator('.chrome-unified-panel--share')).toHaveCSS('gap', '12px');
  const heading = menu.getByRole('heading', { name: 'Share', level: 2 });
  await expect(heading).toBeVisible();
  for (const [property, value] of Object.entries({ 'font-size': '15px', 'line-height': '22px', 'font-weight': '600', margin: '0px' })) {
    await expect(heading).toHaveCSS(property, value);
  }
  const header = heading.locator('..');
  for (const [property, value] of Object.entries({ 'min-height': '24px', gap: '12px', 'align-items': 'center', 'justify-content': 'space-between' })) {
    await expect(header).toHaveCSS(property, value);
  }
  const closeShare = menu.getByRole('button', { name: 'Close', exact: true });
  for (const [property, value] of Object.entries({
    width: '20px', height: '20px', padding: '3px', 'border-top-width': '0px', 'border-radius': '5px',
    color: 'rgb(133, 133, 133)', 'background-color': 'rgba(0, 0, 0, 0)',
  })) {
    await expect(closeShare).toHaveCSS(property, value);
  }
  await test.info().attach('share-header-first', { body: await page.screenshot(), contentType: 'image/png' });
  await closeShare.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await secondShare.click();
  await expect(heading).toBeVisible();
  const shareLink = menu.getByRole('menuitem', { name: 'Generate and copy link', exact: true });
  await expect(shareLink).toBeVisible();
  await expect(shareLink).toBeEnabled();
  // S1's local button seam must survive the real shared/global CSS cascade.
  for (const [property, value] of Object.entries({
    height: '32px', 'border-radius': '6px', 'padding-top': '0px', 'padding-right': '8px',
    'padding-bottom': '0px', 'padding-left': '8px', gap: '5px',
    'background-color': 'rgb(41, 41, 43)', color: 'rgb(255, 255, 255)',
    'font-size': '12px', 'font-weight': '500', 'line-height': '18px', 'border-top-width': '0px',
  })) {
    await expect(shareLink).toHaveCSS(property, value);
  }
  await expect(shareLink.locator('svg')).toHaveAttribute('width', '13');
  await expect(shareLink.locator('svg')).toHaveAttribute('height', '13');
  await expect(shareLink.locator('svg path')).toHaveAttribute('d', 'M12 15V4m-4 4 4-4 4 4M5 20h14');
  await expect(menu).not.toContainText(/Quick Share/i);
  await expect(menu).not.toContainText('Share project in workspace');
  await expect(menu).not.toContainText('Visibility in workspace');
  await expect(menu.getByRole('menuitem', { name: 'Deploy to Vercel', exact: true })).toBeHidden();
  await expect(menu).not.toContainText('Save as template');

  // S7 HTTP failure fixture, not a real cloud failure. Only the production API
  // response is mocked; the product module and its CSS remain unmodified.
  let publishAttempts = 0;
  let releaseFirstPublish!: () => void;
  const firstPublishGate = new Promise<void>(resolve => { releaseFirstPublish = resolve; });
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`, async (route) => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    publishAttempts += 1;
    if (publishAttempts === 1) await firstPublishGate;
    await route.fulfill({ status: 500, json: { error: 's7_fixture_internal_failure' } });
  });
  await shareLink.click();
  try {
    await expect(menu.getByRole('progressbar')).toBeVisible();
    await expect(closeShare).toBeEnabled();
    await test.info().attach('share-header-publishing', { body: await page.screenshot(), contentType: 'image/png' });
    await closeShare.click();
    await expect(menu).toBeHidden();
    await secondShare.click();
    await expect(heading).toBeVisible();
    await expect(menu.getByRole('progressbar')).toBeVisible();
    expect(publishAttempts).toBe(1); // Closing a shell must not cancel or restart upload.
  } finally {
    releaseFirstPublish();
  }
  const failure = menu.getByRole('status');
  await expect(failure).toHaveText('Could not create the share link. Please try again later.');
  await expect(failure).not.toContainText('s7_fixture_internal_failure');
  for (const [property, value] of Object.entries({
    color: 'rgb(201, 78, 78)', 'font-size': '12px', 'line-height': '18px',
    display: 'flex', 'align-items': 'flex-start', gap: '6px', margin: '0px', padding: '0px',
  })) {
    await expect(failure).toHaveCSS(property, value);
  }
  const warningIcon = failure.locator('svg');
  await expect(warningIcon).toHaveCSS('width', '14px');
  await expect(warningIcon).toHaveCSS('height', '14px');
  await expect(warningIcon).toHaveCSS('flex-shrink', '0');
  await expect(warningIcon).toHaveCSS('margin-top', '2px');
  await expect(warningIcon).toHaveAttribute('aria-hidden', 'true');
  await expect(warningIcon.locator('path')).toHaveAttribute('d', 'M8 4.8v3.6M8 11h.01');
  const retry = menu.getByRole('menuitem', { name: 'Retry', exact: true });
  await expect(retry).toBeEnabled();
  expect(publishAttempts).toBe(1);
  const retried = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/projects/${projectId}/files/index.html/publish-public`);
  await retry.click();
  expect((await retried).status()).toBe(500);
  await expect(failure).toBeVisible();
  expect(publishAttempts).toBe(2);

  // S11: publication succeeds, but both browser clipboard mechanisms fail.
  // Mock external boundaries only; selection and CSS exercise the real DOM.
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('clipboard denied by fixture')) },
    });
    document.execCommand = () => false;
  });
  const publicUrl = `https://example.test/artifact/${projectId}/stable-alias-for-manual-copy`;
  await page.route(`**/api/projects/${projectId}/files/index.html/publish-public`, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    publishAttempts += 1;
    await route.fulfill({ json: { url: publicUrl, slug: 'stable-alias-for-manual-copy', fileName: 'index.html' } });
  });
  await retry.click();
  const failedCopy = menu.getByRole('button', { name: 'Copy share link', exact: true });
  await expect(failedCopy).toBeVisible();
  const manualCopyHint = menu.getByRole('status');
  await expect(manualCopyHint).toHaveText('Could not copy automatically. Please manually copy the link above.');
  for (const [property, value] of Object.entries({
    margin: '0px', color: 'rgb(136, 136, 136)', 'font-size': '12px', 'line-height': '18px',
  })) {
    await expect(manualCopyHint).toHaveCSS(property, value);
  }
  const fallback = menu.locator('.chrome-publish-url');
  await expect(fallback).toHaveText(publicUrl);
  await expect(fallback).toHaveAttribute('title', publicUrl);
  for (const [property, value] of Object.entries({
    height: '32px', padding: '0px 9px', 'border-radius': '6px',
    'border-top-width': '1px', 'border-top-color': 'rgb(229, 229, 229)',
    'background-color': 'rgb(255, 255, 255)', color: 'rgb(102, 102, 102)',
    'font-size': '11px', 'line-height': '30px', 'user-select': 'text',
    'white-space': 'nowrap', 'text-overflow': 'ellipsis',
  })) {
    await expect(fallback).toHaveCSS(property, value);
  }
  await fallback.click({ clickCount: 3 });
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString().trim())).toBe(publicUrl);
  await test.info().attach('s11-manual-copy', { body: await page.screenshot(), contentType: 'image/png' });
  await failedCopy.click();
  await expect(failedCopy).toBeEnabled();
  expect(publishAttempts).toBe(3); // Retrying copy must not publish again.

  // S4-C: hold only the external clipboard boundary; the real host settles feedback.
  // Pause before the copy creates its feedback timer; assert the actual boundary.
  // Anchor to the browser clock: Playwright actions may have advanced it beyond Node's time.
  const pauseTime = await page.evaluate(() => Date.now() + 1_000);
  await page.clock.pauseAt(pauseTime);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => new Promise<void>((resolve) => {
        window.addEventListener('test:release-copy', () => resolve(), { once: true });
      }) },
    });
  });
  await failedCopy.click();
  const copying = menu.getByRole('button', { name: 'Copying…', exact: true });
  await expect(copying).toBeVisible();
  await expect(copying).toBeDisabled();
  await expect(copying).toHaveAttribute('aria-busy', 'true');
  await expect(copying).toHaveCSS('background-color', 'rgb(90, 90, 92)');
  await expect(copying).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(copying).toHaveCSS('opacity', '1');
  const copySpinner = copying.locator('svg');
  await expect(copySpinner).toHaveAttribute('stroke-width', '2');
  await expect(copySpinner.locator('path')).toHaveAttribute('d', 'M12 3a9 9 0 1 0 9 9');
  await expect(copySpinner).toHaveCSS('width', '13px');
  expect(await copySpinner.evaluate((node) => getComputedStyle(node).animationName)).not.toBe('none');
  await expect(fallback).toHaveText(publicUrl);
  await test.info().attach('s4-c-copy-pending', { body: await page.screenshot(), contentType: 'image/png' });
  await page.evaluate(() => window.dispatchEvent(new Event('test:release-copy')));
  const copied = menu.getByRole('button', { name: 'Copied!', exact: true });
  await expect(copied).toBeVisible();
  await expect(copied).toBeEnabled();
  await expect(copied).not.toHaveAttribute('aria-busy');
  await page.clock.runFor(1799);
  await expect(copied).toBeVisible();
  await page.clock.runFor(1);
  await expect(failedCopy).toBeVisible(); // Existing host feedback timer restores the action.
  await page.clock.resume();
  expect(publishAttempts).toBe(3);

  // The same real cards become disabled through the workspace permission boundary.
  const readonlyContext = {
    ...AMR_PERSONAL_WORKSPACE_CONTEXT,
    workspaceType: 'team', teamId: 'disabled-share-team',
    permissions: { ...AMR_PERSONAL_WORKSPACE_CONTEXT.permissions, canWriteSyncedFiles: false },
  };
  await page.route(`**/api/projects/${projectId}/workspace-scope`, route => route.fulfill({
    json: { scope: { kind: 'team', projectId, workspaceId: readonlyContext.workspaceId, visibility: 'team', context: readonlyContext } },
  }));
  await page.route(`**/api/projects/${projectId}/collab/status`, route => route.fulfill({
    json: { publishedVersion: 1, materializedVersion: 1, syncState: 'synced', ownerMemberId: 'another-owner' },
  }));
  await page.reload();
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('chat-composer-input')).toHaveAttribute('aria-readonly', 'true');
  // Read-only navigation may focus the preview; reveal chat through its UI controls.
  const showChat = page.getByTestId('workspace-focus-toggle');
  if (await showChat.isVisible()) await showChat.click();
  const expandConversation = page.getByRole('button', { name: 'Expand the conversation pane' });
  if (await expandConversation.isVisible()) await expandConversation.click();
  await expect(secondShare).toBeVisible();
  await expect(shareButtons).toHaveCount(2);
  for (const share of await shareButtons.all()) {
    await expect(share).toBeDisabled();
    await expect(share).toHaveAttribute('title', /.+/);
    for (const [property, value] of Object.entries({ 'background-color': 'rgb(243, 243, 241)', color: 'rgb(189, 189, 184)', opacity: '1', height: '30px' })) {
      await expect(share).toHaveCSS(property, value);
    }
  }
  await secondShare.hover();
  await expect(secondShare).toHaveCSS('background-color', 'rgb(243, 243, 241)');
  await expect(secondShare).toHaveCSS('color', 'rgb(189, 189, 184)');
  await expect(page.locator('.share-menu-popover[role="menu"]')).toHaveCount(0);
  await test.info().attach('card-share-disabled', { body: await page.screenshot(), contentType: 'image/png' });
});

test('[P1] project detail fork emits correlated click and result analytics', async ({ page }) => {
  const analyticsBodies: string[] = [];
  await page.unroute('**/api/app-config').catch(() => {});
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'default',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        privacyDecisionAt: 1,
        telemetry: { metrics: true, content: false, artifactManifest: false },
        agentModels: { codex: { model: 'default' } },
      }),
    );
  }, STORAGE_KEY);
  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          privacyDecisionAt: 1,
          telemetry: { metrics: true, content: false, artifactManifest: false },
          mode: 'daemon',
          agentId: 'codex',
          skillId: null,
          designSystemId: null,
          agentModels: { codex: { model: 'default' } },
          agentCliEnv: {},
        },
      },
    });
  });
  await page.route('**/api/analytics/config', async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        env: 'e2e',
        key: 'phc_e2e',
        host: 'https://analytics.open-design.test',
        installationId: 'e2e-installation',
      },
    });
  });
  await page.route('https://analytics.open-design.test/**', async (route) => {
    analyticsBodies.push(route.request().postData() ?? '');
    await route.fulfill({ status: 200, json: { status: 1 } });
  });

  const { projectId, conversationId } = await seedProjectWithAssistantCompletion(page);
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);

  const forkResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST'
      && response.url().endsWith(`/api/projects/${projectId}/conversations`);
  });
  await page.getByTestId('assistant-fork-button').click();
  expect((await forkResponsePromise).ok()).toBe(true);

  await expect
    .poll(() => analyticsBodies.join('\n'), { timeout: T.medium })
    .toContain('conversation_fork_result');
  const raw = analyticsBodies.join('\n');
  expect(raw).toContain('assistant_fork_button');
  expect(raw).toContain('fork_conversation');
  expect(raw).toContain('"result":"success"');
  expect(raw).toContain('"fork_point":"latest"');
  expect(raw).toContain(projectId);
  expect(raw).toContain(conversationId);
  const requestIdCounts = new Map<string, number>();
  for (const match of raw.matchAll(/"request_id":"([^"]+)"/g)) {
    const requestId = match[1];
    if (!requestId) continue;
    requestIdCounts.set(requestId, (requestIdCounts.get(requestId) ?? 0) + 1);
  }
  expect([...requestIdCounts.values()].some((count) => count >= 2)).toBe(true);
});

test('[P1] project detail forks histories larger than the daemon JSON body limit', async ({ page }) => {
  test.setTimeout(T.xlong);
  const { projectId, conversationId, expectedContents } =
    await seedProjectWithLargeAssistantHistory(page);

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('assistant-fork-button')).toHaveCount(3, {
    timeout: T.long,
  });

  const forkResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST'
      && response.url().endsWith(`/api/projects/${projectId}/conversations`);
  });
  await page.getByTestId('assistant-fork-button').last().click();
  const forkResponse = await forkResponsePromise;
  expect(
    forkResponse.ok(),
    `fork large conversation: ${await forkResponse.text()}`,
  ).toBe(true);
  const forkRequestBody = forkResponse.request().postDataJSON() as {
    seedMessages?: unknown;
  };
  expect(forkRequestBody.seedMessages).toBeUndefined();

  await expect
    .poll(() => getProjectContextFromUrl(page).conversationId)
    .not.toBe(conversationId);
  const forkConversationId = getProjectContextFromUrl(page).conversationId;
  expect(forkConversationId).toBeTruthy();
  const forkRequestHeaders = forkResponse.request().headers();
  const workspaceHeaders = Object.fromEntries(
    ['x-od-workspace-id', 'x-od-workspace-member-id']
      .map((name) => [name, forkRequestHeaders[name]] as const)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  const forkMessagesResponse = await page.request.get(
    `/api/projects/${projectId}/conversations/${forkConversationId}/messages`,
    { headers: workspaceHeaders },
  );
  expect(
    forkMessagesResponse.ok(),
    `load forked messages: ${await forkMessagesResponse.text()}`,
  ).toBe(true);
  const forkMessagesBody = (await forkMessagesResponse.json()) as {
    messages: Array<{ content: string }>;
  };
  expect(forkMessagesBody.messages.map((message) => message.content)).toEqual(expectedContents);
});

test('[P1] read-only project viewers do not see conversation fork actions', async ({ page }) => {
  const { projectId, conversationId } = await seedProjectWithAssistantCompletion(page);
  const readonlyTeamContext = {
    ...AMR_PERSONAL_WORKSPACE_CONTEXT,
    workspaceId: 'workspace-readonly-fork',
    workspaceType: 'team',
    workspaceMemberId: 'member-readonly-fork',
    role: 'member',
    teamId: 'team-readonly-fork',
    permissions: {
      ...AMR_PERSONAL_WORKSPACE_CONTEXT.permissions,
      canWriteSyncedFiles: false,
    },
  };
  await page.route(`**/api/projects/${projectId}/workspace-scope`, async (route) => {
    await route.fulfill({
      json: {
        scope: {
          kind: 'team',
          projectId,
          workspaceId: readonlyTeamContext.workspaceId,
          visibility: 'team',
          context: readonlyTeamContext,
        },
      },
    });
  });
  await page.route(`**/api/projects/${projectId}/collab/status`, async (route) => {
    await route.fulfill({
      json: {
        publishedVersion: 1,
        materializedVersion: 1,
        syncState: 'synced',
        ownerMemberId: 'member-project-owner',
      },
    });
  });

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`);
  await page
    .getByText('Loading OpenDesign…')
    .waitFor({ state: 'hidden', timeout: T.long })
    .catch(() => {});
  const showChat = page.getByTestId('workspace-focus-toggle');
  if (await showChat.isVisible()) {
    await showChat.click();
  }
  const expandConversation = page.getByRole('button', { name: 'Expand the conversation pane' });
  if (await expandConversation.isVisible()) {
    await expandConversation.click();
  }
  await expect(page.getByTestId('chat-composer-input')).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('chat-composer-input')).toHaveAttribute('aria-readonly', 'true');
  await expect(page.getByTestId('assistant-fork-button')).toHaveCount(0);
});

test('[P1] project detail conversations menu supports new chat, search, and recency metadata', async ({ page }) => {
  const { projectId, conversations } = await seedProjectConversationHistory(page);
  await routeConversationHistoryFixtures(page, projectId, conversations);

  await page.goto(`/projects/${projectId}/conversations/${conversations[0]!.id}`);
  await expectWorkspaceReady(page);

  await page.getByTestId('conversation-history-trigger').click();
  const menu = page.getByTestId('conversation-history-menu');
  await expect(menu).toBeVisible();
  // The dropdown no longer shows a heading, a count, per-row message counts
  // or run durations (OPEND-3087, Demo #8113): rows carry only the title and
  // the time since the last update. The fixtures are 30s / 2m / 7m old at
  // seed time, so allow one minute of drift while the page loads.
  const rows = page.getByTestId('conversation-list').locator('.chat-conv-item');
  await expect(rows).toHaveCount(3);
  await expect(page.getByTestId(`conversation-select-${conversations[0]!.id}`)).toContainText('Runway final polish');
  await expect(page.getByTestId(`conversation-meta-${conversations[0]!.id}`)).toHaveText(/^(now|1m)$/);
  await expect(page.getByTestId(`conversation-meta-${conversations[1]!.id}`)).toHaveText(/^[23]m$/);
  await expect(page.getByTestId(`conversation-meta-${conversations[2]!.id}`)).toHaveText(/^[78]m$/);
  await expect(page.getByTestId('conversation-history-count')).toHaveCount(0);
  await expect(menu.getByTestId(/^conversation-delete-/)).toHaveCount(0);

  await page.getByTestId('conversation-history-search').fill('font audit');
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId(`conversation-item-${conversations[1]!.id}`)).toBeVisible();
  await expect(page.getByTestId(`conversation-item-${conversations[0]!.id}`)).toHaveCount(0);

  await page.getByTestId('conversation-history-search').fill('');
  const newConversationRequestPromise = page.waitForRequest((request) => {
    return request.method() === 'POST'
      && request.url().endsWith(`/api/projects/${projectId}/conversations`);
  });
  // The single "new conversation" control sits inside the dropdown beside the
  // search field. Clicking it still dismisses the menu, which is what the
  // count assertion below pins.
  await menu.getByTestId('chat-new-conversation').click();
  await newConversationRequestPromise;
  await expect(page.getByTestId('conversation-history-menu')).toHaveCount(0);

  await page.getByTestId('conversation-history-trigger').click();
  await expect(rows).toHaveCount(4);
  await expect(page.getByTestId('conversation-select-conv-new-history')).toContainText('Untitled');
  await expect(page.getByTestId('conversation-meta-conv-new-history')).toHaveText(/^(now|1m)$/);
});

test('[P0] project detail share menu copies the current share link for uploaded html artifacts', async ({ page }) => {
  // Upload opens the file tab immediately, so the first deployment read may
  // precede the upload helper's return. Seed the deterministic file name so
  // that read receives the deployment instead of a stale empty fixture.
  let uploadedName = 'share-link-copy.html';
  await page.addInitScript(() => {
    const store: string[] = [];
    Object.defineProperty(window, '__copiedTexts', {
      value: store,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText(text: string) {
          store.push(text);
          return Promise.resolve();
        },
      },
      configurable: true,
    });
  });
  await page.route('**/api/projects/*/deployments', async (route) => {
    await route.fulfill({
      json: {
        deployments: uploadedName
          ? [{
              id: 'ready-share-link',
              projectId: getProjectIdFromApiPath(route.request().url()),
              fileName: uploadedName,
              providerId: 'vercel-self',
              url: 'https://share-preview.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            }]
          : [],
      },
    });
  });
  await mockWritablePersonalProjectScope(page);

  await page.goto('/');
  await createProject(page, 'Share link copy flow', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await expectWorkspaceReady(page);

  uploadedName = await uploadTinyHtml(page, 'share-link-copy.html', '<!doctype html><html><body><h1>Share link copy</h1></body></html>', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await openShareMenu(page);
  await page.getByRole('menuitem', { name: /^Copy share link$/i }).click();
  await expect(page.getByRole('menuitem', { name: /^Copied!$/i })).toBeVisible();

  const copied = await page.evaluate(() => (window as typeof window & { __copiedTexts?: string[] }).__copiedTexts ?? []);
  expect(copied.at(-1)).toBe('https://share-preview.example');
});

test('[P0] project detail share menu opens the current share page for uploaded html artifacts', async ({ page }) => {
  // See the copy-link case above: FileViewer can ask for deployments before
  // the upload helper returns and assigns the persisted file name.
  let uploadedName = 'share-page-open.html';
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.defineProperty(window, '__openedUrls', {
      value: opened,
      configurable: true,
    });
    const originalOpen = window.open.bind(window);
    window.open = ((...args: Parameters<typeof window.open>) => {
      if (typeof args[0] === 'string') opened.push(args[0]);
      return originalOpen(...args);
    }) as typeof window.open;
  });
  await page.route('**/api/projects/*/deployments', async (route) => {
    await route.fulfill({
      json: {
        deployments: uploadedName
          ? [{
              id: 'protected-share-link',
              projectId: getProjectIdFromApiPath(route.request().url()),
              fileName: uploadedName,
              providerId: 'vercel-self',
              url: 'https://protected-share.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'protected',
              createdAt: 1,
              updatedAt: 2,
            }]
          : [],
      },
    });
  });

  // This scenario creates through Playwright's APIRequestContext rather than
  // the browser UI, so the Web cannot inherit its normal same-session creation
  // witness. Give the page an exact writable Personal/owner identity and bind
  // the project-scope bootstrap to that same identity. Do not make the share
  // control writable by weakening the shared-project authority gate.
  await mockWritablePersonalProjectScope(page);

  await page.goto('/');
  await createProject(page, 'Open share page flow', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await expectWorkspaceReady(page);

  uploadedName = await uploadTinyHtml(page, 'share-page-open.html', '<!doctype html><html><body><h1>Open share page</h1></body></html>', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await openShareMenu(page);
  await page.getByRole('menuitem', { name: /Open share page/i }).click();

  await expect
    .poll(() =>
      page.evaluate(() => (window as typeof window & { __openedUrls?: string[] }).__openedUrls ?? []),
    )
    .toContain('https://protected-share.example');
});

test('[P0] @critical project detail share menu publish action opens the deploy flow for the selected provider', async ({ page }) => {
  let deployConfigUrl: string | null = null;
  await page.route('**/api/projects/*/deployments', async (route) => {
    await route.fulfill({ json: { deployments: [] } });
  });
  await page.route('**/api/deploy/config?providerId=*', async (route) => {
    deployConfigUrl = route.request().url();
    const url = new URL(route.request().url());
    await route.fulfill({
      json: {
        configured: false,
        providerId: url.searchParams.get('providerId'),
        tokenMask: '',
        teamId: '',
        teamSlug: '',
      },
    });
  });
  // Match the other writable share scenarios: APIRequestContext creation does
  // not register the browser's same-session owner witness, so provide the
  // exact Personal authority this test intends to exercise.
  await mockWritablePersonalProjectScope(page);

  await page.goto('/');
  await createProject(page, 'Deploy action flow', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await expectWorkspaceReady(page);

  const uploadedName = await uploadTinyHtml(page, 'deploy-action.html', '<!doctype html><html><body><h1>Deploy action</h1></body></html>', {
    headers: AMR_PERSONAL_WORKSPACE_HEADERS,
  });
  await openUploadedHtmlArtifactPreview(page, uploadedName);

  await openShareMenu(page);
  await page.getByRole('menuitem', { name: /^Deploy to Vercel$/i }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Deploy to Vercel/i })).toBeVisible();
  await expect(dialog.locator('select').first()).toHaveValue('vercel-self');
  await expect
    .poll(() => deployConfigUrl ?? '', { timeout: T.medium })
    .toContain('providerId=vercel-self');
});

test('[P1] home design card deletion supports cancel and confirm flows', async ({ page }) => {
  const projectName = `Home delete design flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  const designCard = homeDesignCard(page, projectName);
  await expect(designCard).toBeVisible();

  // Cancel flow: open the overflow menu, choose Delete, then dismiss the confirm modal.
  await designCard.hover();
  await designCard.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: /^delete$/i }).click();
  const confirmDialog = page.locator('.modal-confirm');
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toContainText(projectName);
  await confirmDialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(designCard).toBeVisible();

  // Confirm flow: same trigger, this time accept the confirm modal.
  await designCard.hover();
  await designCard.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: /^delete$/i }).click();
  const confirmDialog2 = page.locator('.modal-confirm');
  await expect(confirmDialog2).toBeVisible();
  await expect(confirmDialog2).toContainText(projectName);
  await confirmDialog2.getByRole('button', { name: /^delete$/i }).click();
  await expect(homeDesignCard(page, projectName)).toHaveCount(0);

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.status()).toBe(404);
});

test('[P2] home designs view toggle switches between grid and kanban and persists', async ({ page }) => {
  const projectName = `Home view toggle flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);
  const { projectId } = getProjectContextFromUrl(page);

  await page.goto('/projects');
  await expectDesignsView(page);
  await expect(homeDesignCard(page, projectName)).toBeVisible();
  await expect(page.locator('.design-grid')).toBeVisible();
  await expect(page.locator('.design-kanban-board')).toHaveCount(0);
  await expect(page.getByTestId('designs-view-grid')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();
  await expect(page.locator('.design-grid')).toHaveCount(0);
  await expect(page.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.design-kanban-card', { hasText: projectName })).toBeVisible();

  await page.reload();
  await expectDesignsView(page);
  await expect(page.locator('.design-kanban-board')).toBeVisible();
  await expect(page.getByTestId('designs-view-kanban')).toHaveAttribute('aria-pressed', 'true');
  const projectsAfterReload = await listProjectsFromApi(page);
  expect(projectsAfterReload.some((project) => project.id === projectId && project.name === projectName)).toBe(true);

  await page.getByTestId('designs-view-grid').click();
  await expect(page.locator('.design-grid')).toBeVisible();
  await expect(homeDesignCard(page, projectName)).toBeVisible();
  await expect(page.getByTestId('designs-view-grid')).toHaveAttribute('aria-pressed', 'true');
});

test('[P1] home designs search filters projects and recovers from no results', async ({ page }) => {
  test.setTimeout(60_000);

  const stamp = Date.now();
  const alphaName = `Home search alpha ${stamp}`;
  const betaName = `Home search beta ${stamp}`;
  await page.goto('/');

  await createProject(page, alphaName);
  await expectWorkspaceReady(page);
  const alphaProjectId = getProjectContextFromUrl(page).projectId;
  await page.goto('/projects');
  await expectDesignsView(page);

  await createProject(page, betaName);
  await expectWorkspaceReady(page);
  const betaProjectId = getProjectContextFromUrl(page).projectId;
  await page.goto('/projects');
  await expectDesignsView(page);
  await expect(homeDesignCard(page, alphaName)).toBeVisible();
  await expect(homeDesignCard(page, betaName)).toBeVisible();

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('alpha');
  await expect(homeDesignCard(page, alphaName)).toBeVisible();
  await expect(homeDesignCard(page, betaName)).toHaveCount(0);

  await search.fill(`missing-${stamp}`);
  await expect(homeDesignCard(page, alphaName)).toHaveCount(0);
  await expect(homeDesignCard(page, betaName)).toHaveCount(0);
  await expect(page.locator('.tab-empty')).toBeVisible();

  await search.fill('');
  await expect(homeDesignCard(page, alphaName)).toBeVisible();
  await expect(homeDesignCard(page, betaName)).toBeVisible();
  const projects = await listProjectsFromApi(page);
  expect(projects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: alphaProjectId, name: alphaName }),
      expect.objectContaining({ id: betaProjectId, name: betaName }),
    ]),
  );
});

test('[P2] projects sub tabs switch between Recent and Your designs ordering', async ({ page }) => {
  const now = Date.now();
  const projects = [
    makeProjectsTabProject({
      id: 'proj-alpha',
      name: 'Sort Alpha',
      createdAt: now - 3 * 60_000,
      updatedAt: now - 1 * 60_000,
    }),
    makeProjectsTabProject({
      id: 'proj-beta',
      name: 'Sort Beta',
      createdAt: now - 1 * 60_000,
      updatedAt: now - 3 * 60_000,
    }),
    makeProjectsTabProject({
      id: 'proj-gamma',
      name: 'Sort Gamma',
      createdAt: now - 2 * 60_000,
      updatedAt: now - 2 * 60_000,
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  await expect(page.locator('.design-grid .design-card .design-card-name').nth(0)).toContainText(
    'Sort Alpha',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(1)).toContainText(
    'Sort Gamma',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(2)).toContainText(
    'Sort Beta',
  );

  await page.getByRole('button', { name: 'Your designs' }).click();
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(0)).toContainText(
    'Sort Beta',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(1)).toContainText(
    'Sort Gamma',
  );
  await expect(page.locator('.design-grid .design-card .design-card-name').nth(2)).toContainText(
    'Sort Alpha',
  );
});

test('[P1] projects grid card rename updates the card title and persists after reload', async ({ page }) => {
  const originalName = `Projects rename flow ${Date.now()}`;
  const renamedName = `${originalName} renamed`;
  await page.goto('/');
  await createProject(page, originalName);
  await expectWorkspaceReady(page);
  const { projectId } = getProjectContextFromUrl(page);

  await page.goto('/projects');
  await expectDesignsView(page);

  const card = homeDesignCard(page, originalName);
  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('menuitem', { name: /^rename$/i }).click();

  const renameModal = page.locator('.modal-rename');
  await expect(renameModal).toBeVisible();
  const renameInput = renameModal.getByRole('textbox');
  await expect(renameInput).toHaveValue(originalName);
  await renameInput.fill(renamedName);
  await renameModal.locator('button.primary').click();

  await expect(homeDesignCard(page, renamedName)).toBeVisible();
  await expect(homeDesignCard(page, originalName)).toHaveCount(0);

  await page.reload();
  await expectDesignsView(page);
  await expect(homeDesignCard(page, renamedName)).toBeVisible();
  const project = await fetchProjectById(page, projectId);
  expect(project.name).toBe(renamedName);
});

test('[P1] projects select mode supports multi-select delete with cancel and confirm', async ({ page }) => {
  const firstName = `Batch delete A ${Date.now()}`;
  const secondName = `Batch delete B ${Date.now()}`;
  await page.goto('/');

  await createProject(page, firstName);
  await expectWorkspaceReady(page);
  const firstProjectId = getProjectContextFromUrl(page).projectId;
  await page.goto('/projects');
  await expectDesignsView(page);

  await createProject(page, secondName);
  await expectWorkspaceReady(page);
  const secondProjectId = getProjectContextFromUrl(page).projectId;
  await page.goto('/projects');
  await expectDesignsView(page);

  await page.locator('.designs-select-toggle').click();
  await homeDesignCard(page, firstName).click();
  await homeDesignCard(page, secondName).click();
  await expect(page.locator('.designs-select-bar')).toBeVisible();
  await expect(page.locator('.design-card.is-selected')).toHaveCount(2);

  await page.getByRole('button', { name: /Delete selected/i }).click();
  const confirmDialog = page.locator('.modal-confirm');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(confirmDialog).toHaveCount(0);
  await expect(homeDesignCard(page, firstName)).toBeVisible();
  await expect(homeDesignCard(page, secondName)).toBeVisible();

  await page.getByRole('button', { name: /Delete selected/i }).click();
  const confirmDialog2 = page.locator('.modal-confirm');
  await expect(confirmDialog2).toBeVisible();
  await confirmDialog2.getByRole('button', { name: /^delete/i }).click();
  await expect(homeDesignCard(page, firstName)).toHaveCount(0);
  await expect(homeDesignCard(page, secondName)).toHaveCount(0);
  await expect(page.locator('.designs-select-bar')).toHaveCount(0);

  const firstResponse = await page.request.get(`/api/projects/${firstProjectId}`);
  const secondResponse = await page.request.get(`/api/projects/${secondProjectId}`);
  expect(firstResponse.status()).toBe(404);
  expect(secondResponse.status()).toBe(404);
});

test('[P1] projects kanban cards open projects and support delete cancel and confirm', async ({ page }) => {
  const projectName = `Kanban flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  const kanbanCard = page.locator('.design-kanban-card', { hasText: projectName });
  await expect(kanbanCard).toBeVisible();

  await kanbanCard.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}(/conversations/[^/]+)?$`));
  await expect(page.getByTestId('workspace-tabs-dropdown-trigger')).toContainText(projectName);
  const openedProject = await fetchCurrentProject(page);
  expect(openedProject.name).toBe(projectName);

  await page.goto('/projects');
  await expectDesignsView(page);
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  const kanbanCardAgain = page.locator('.design-kanban-card', { hasText: projectName });
  await kanbanCardAgain.locator('.design-card-close').click();
  const confirmDialog = page.locator('.modal-confirm');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: /^cancel$/i }).click();
  await expect(kanbanCardAgain).toBeVisible();

  await kanbanCardAgain.locator('.design-card-close').click();
  const confirmDialog2 = page.locator('.modal-confirm');
  await expect(confirmDialog2).toBeVisible();
  await confirmDialog2.getByRole('button', { name: /^delete/i }).click();
  await expect(page.locator('.design-kanban-card', { hasText: projectName })).toHaveCount(0);

  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.status()).toBe(404);
});

test('[P2] projects page shows the empty state when there are no projects', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.tab-empty')).toBeVisible();
  await expect(page.locator('.tab-empty')).toContainText('No projects yet');
  await expect(page.locator('.design-grid')).toHaveCount(0);
  await expect(page.locator('.design-kanban-board')).toHaveCount(0);
});

test('[P2] projects page shows the no-results state and recovers when search is cleared', async ({ page }) => {
  const projects = [
    makeProjectsTabProject({
      id: 'proj-search-1',
      name: 'Searchable Prototype',
      createdAt: Date.now() - 10_000,
      updatedAt: Date.now() - 5_000,
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);
  await expect(homeDesignCard(page, 'Searchable Prototype')).toBeVisible();

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('does-not-exist');
  await expect(page.locator('.tab-empty')).toBeVisible();
  await expect(page.locator('.tab-empty')).toContainText('No projects match your search');
  await expect(homeDesignCard(page, 'Searchable Prototype')).toHaveCount(0);

  await search.fill('');
  await expect(homeDesignCard(page, 'Searchable Prototype')).toBeVisible();
});

test('[P2] projects grid overflow menu closes on outside click and Escape', async ({ page }) => {
  const projects = [
    makeProjectsTabProject({
      id: 'proj-menu-1',
      name: 'Menu Close Project',
      createdAt: Date.now() - 10_000,
      updatedAt: Date.now() - 5_000,
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  const card = homeDesignCard(page, 'Menu Close Project');
  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  const menu = page.locator('.design-card-menu');
  await expect(menu).toBeVisible();

  await page.locator('.tab-panel-toolbar').click({ position: { x: 8, y: 8 } });
  await expect(menu).toHaveCount(0);

  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('[P2] projects kanban view groups cards into status columns', async ({ page }) => {
  const now = Date.now();
  const projects = [
    makeProjectsTabProject({
      id: 'proj-not-started',
      name: 'Not Started Card',
      createdAt: now - 50_000,
      updatedAt: now - 45_000,
      status: { value: 'not_started' },
    }),
    makeProjectsTabProject({
      id: 'proj-running',
      name: 'Running Card',
      createdAt: now - 40_000,
      updatedAt: now - 35_000,
      status: { value: 'running' },
    }),
    makeProjectsTabProject({
      id: 'proj-awaiting',
      name: 'Awaiting Input Card',
      createdAt: now - 30_000,
      updatedAt: now - 25_000,
      status: { value: 'awaiting_input' },
    }),
    makeProjectsTabProject({
      id: 'proj-succeeded',
      name: 'Succeeded Card',
      createdAt: now - 20_000,
      updatedAt: now - 15_000,
      status: { value: 'succeeded' },
    }),
    makeProjectsTabProject({
      id: 'proj-failed',
      name: 'Failed Card',
      createdAt: now - 10_000,
      updatedAt: now - 5_000,
      status: { value: 'failed' },
    }),
  ];

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    await route.fulfill({ json: { liveArtifacts: [] } });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);
  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  await expect(page.locator('.design-kanban-card.status-not_started')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-running')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-awaiting_input')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-succeeded')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-failed')).toHaveCount(1);
  const kanbanColumns = page.locator('.design-kanban-col');
  await expect(kanbanColumns).toHaveCount(7);
  await expect(
    kanbanColumns.filter({ hasText: 'Incomplete' }).locator('.design-kanban-empty'),
  ).toHaveCount(1);
  await expect(
    kanbanColumns.filter({ hasText: 'Canceled' }).locator('.design-kanban-empty'),
  ).toHaveCount(1);
  await expect(page.locator('.design-kanban-empty')).toHaveCount(2);

  await expect(page.locator('.design-kanban-card.status-running')).toContainText('Running Card');
  await expect(page.locator('.design-kanban-card.status-awaiting_input')).toContainText(
    'Awaiting Input Card',
  );
  await expect(page.locator('.design-kanban-card.status-succeeded')).toContainText(
    'Succeeded Card',
  );
});

test('[P1] projects page shows live artifact cards, supports search, and opens the live artifact project', async ({ page }) => {
  const liveProject = makeProjectsTabProject({
    id: 'proj-live',
    name: 'Orbit Daily Digest',
    createdAt: Date.now() - 60_000,
    updatedAt: Date.now() - 30_000,
    skillId: 'live-artifact',
    metadata: { kind: 'orbit', intent: 'live-artifact' },
    status: { value: 'succeeded' },
  });
  const regularProject = makeProjectsTabProject({
    id: 'proj-regular',
    name: 'Regular Prototype',
    createdAt: Date.now() - 120_000,
    updatedAt: Date.now() - 90_000,
  });
  const liveArtifact = {
    id: 'artifact-1',
    projectId: 'proj-live',
    title: 'Orbit Daily Digest — 2026-05-15',
    slug: 'orbit-daily-digest',
    status: 'ready',
    refreshStatus: 'succeeded',
    pinned: false,
    hasDocument: true,
    updatedAt: new Date(Date.now() - 20_000).toISOString(),
    createdAt: new Date(Date.now() - 50_000).toISOString(),
    preview: {
      kind: 'rendered',
      url: '',
    },
  };

  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [liveProject, regularProject] } });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/projects/proj-live', async (route) => {
    await route.fulfill({ json: { project: liveProject } });
  });
  await page.route('**/api/projects/proj-live/files', async (route) => {
    await route.fulfill({ json: { files: [] } });
  });
  await page.route('**/api/live-artifacts?projectId=*', async (route) => {
    const url = new URL(route.request().url());
    const projectId = url.searchParams.get('projectId');
    await route.fulfill({
      json: {
        liveArtifacts: projectId === 'proj-live' ? [liveArtifact] : [],
      },
    });
  });
  await page.route('**/api/live-artifacts/artifact-1', async (route) => {
    await route.fulfill({ json: { liveArtifact } });
  });
  await page.route('**/api/live-artifacts/artifact-1/refreshes?projectId=*', async (route) => {
    await route.fulfill({ json: { refreshes: [] } });
  });
  await page.route('**/api/live-artifacts/artifact-1/preview?projectId=*', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><h1>Orbit Daily Digest</h1></body></html>',
    });
  });

  await stubCatalogsEmpty(page);
  await page.goto('/projects');
  await expectDesignsView(page);

  const liveCard = page.locator('.live-artifact-card', {
    has: page.locator('.design-card-name', { hasText: 'Orbit Daily Digest' }),
  });
  await expect(liveCard).toBeVisible();
  await expect(liveCard).toContainText(/Live Artifact/i);
  await expect(liveCard).toContainText(/LIVE|Refreshed/i);

  const search = page.locator('.tab-panel-toolbar .toolbar-search input');
  await search.fill('digest');
  await expect(liveCard).toBeVisible();
  await expect(homeDesignCard(page, 'Regular Prototype')).toHaveCount(0);

  await liveCard.click();
  await expect(page).toHaveURL(/\/projects\/proj-live\/files\/live%3Aartifact-1$/);
  await expect(page.getByTestId('workspace-tabs-dropdown-trigger')).toContainText('Orbit Daily Digest');
});

test('[P2] General settings updates the custom companion draft', async ({ page }) => {
  await seedAdoptedPet(page);
  await page.route('**/api/codex-pets', async (route) => {
    await route.fulfill({ json: { pets: [], rootDir: '' } });
  });

  await page.goto('/');
  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('button', { name: /^General$/i }).click();
  await expect(dialog.getByRole('heading', { level: 3, name: 'Pets' })).toBeVisible();

  await dialog.getByRole('tab', { name: 'Custom' }).click();
  const customPanel = dialog.locator('.pet-custom');
  await expect(customPanel).toBeVisible();

  await customPanel.getByLabel('Name').fill('QA Turtle');
  await customPanel.getByLabel('Glyph').fill('🐢');
  await customPanel.getByLabel('Greeting').fill('Shell yeah, tests are green.');
  await expect(customPanel.getByText('QA Turtle')).toBeVisible();
  await expect(customPanel.getByText('Shell yeah, tests are green.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Back to home', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

async function createProject(
  page: Page,
  projectName: string,
  options: { headers?: Readonly<Record<string, string>> } = {},
) {
  const response = await createProjectViaApi(page, projectName, options);
  const body = (await response.json()) as {
    project: { id: string };
    conversationId: string;
  };
  await page.goto(`/projects/${body.project.id}/conversations/${body.conversationId}`);
}

async function createProjectViaApi(
  page: Page,
  projectName: string,
  options: { headers?: Readonly<Record<string, string>> } = {},
) {
  // The Playwright suite fixture waits on daemon `/api/health` before handing
  // out a worker. Project create is therefore a single-shot completion signal
  // (the HTTP response), not a call-site retry loop over an unknown race.
  const response = await page.request.post('/api/projects', {
    timeout: 15_000,
    ...(options.headers ? { headers: { ...options.headers } } : {}),
    data: {
      id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: projectName,
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(
    response.ok(),
    `create project "${projectName}": ${await response.text()}`,
  ).toBeTruthy();
  return response;
}

async function seedProjectWithAssistantCompletion(
  page: Page,
): Promise<{
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  assistantText: string;
}> {
  const projectId = `assistant-actions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Assistant Completion Actions',
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  const fileResponse = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'index.html',
      content: '<!doctype html><html><body><main><h1>Assistant actions preview</h1></main></body></html>',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'index.html',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(fileResponse.ok(), `seed index.html: ${await fileResponse.text()}`).toBeTruthy();

  const createdAt = Date.now() - 2_000;
  const userMessageId = `u-${projectId}`;
  const userResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMessageId}`,
    {
      data: {
        id: userMessageId,
        role: 'user',
        content: 'Create a tiny prototype.',
        createdAt,
      },
    },
  );
  expect(userResponse.ok(), `seed user message: ${await userResponse.text()}`).toBeTruthy();

  const assistantMessageId = `a-${projectId}`;
  const assistantText = 'Assistant completion actions fixture.\n\nGenerated `index.html` for this turn.';
  const assistantResponse = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
    {
      data: {
        id: assistantMessageId,
        role: 'assistant',
        content: assistantText,
        runStatus: 'succeeded',
        startedAt: createdAt + 500,
        endedAt: createdAt + 1_500,
        events: [
          { kind: 'text', text: assistantText },
        ],
        createdAt: createdAt + 1_000,
      },
    },
  );
  expect(assistantResponse.ok(), `seed assistant message: ${await assistantResponse.text()}`).toBeTruthy();

  return { projectId, conversationId, assistantMessageId, assistantText };
}

async function seedProjectWithRepeatedArtifactCards(
  page: Page,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `repeated-artifact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Repeated Artifact Card Anchors',
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype', nameSource: 'user' },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  const fileName = 'index.html';
  const fileContent = '<!doctype html><html><body><main><h1>Repeated artifact anchors</h1></main></body></html>';
  const fileResponse = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: fileName,
      content: fileContent,
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: fileName,
        entry: fileName,
        renderer: 'html',
        exports: ['html'],
      },
    },
  });
  expect(fileResponse.ok(), `seed ${fileName}: ${await fileResponse.text()}`).toBeTruthy();

  const startedAt = Date.now() - 4_000;
  const producedFile = {
    name: fileName,
    path: fileName,
    localPath: `/project/${projectId}/${fileName}`,
    type: 'file',
    size: fileContent.length,
    mtime: startedAt + 1_000,
    kind: 'html',
    mime: 'text/html',
  };

  for (let turn = 0; turn < 2; turn += 1) {
    const userMessageId = `repeated-artifact-user-${turn}-${projectId}`;
    const assistantMessageId = `repeated-artifact-assistant-${turn}-${projectId}`;
    const turnStartedAt = startedAt + turn * 2_000;
    const userResponse = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMessageId}`,
      {
        data: {
          id: userMessageId,
          role: 'user',
          content: `Generate ${fileName}, turn ${turn + 1}.`,
          createdAt: turnStartedAt,
        },
      },
    );
    expect(userResponse.ok(), `seed user turn ${turn + 1}: ${await userResponse.text()}`).toBeTruthy();

    const toolUseId = `write-index-${turn}`;
    const assistantResponse = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        data: {
          id: assistantMessageId,
          role: 'assistant',
          content: `Generated ${fileName}, turn ${turn + 1}.`,
          runStatus: 'succeeded',
          startedAt: turnStartedAt + 200,
          endedAt: turnStartedAt + 1_200,
          events: [
            {
              kind: 'tool_use',
              id: toolUseId,
              name: 'Write',
              input: { file_path: producedFile.localPath, content: fileContent },
            },
            { kind: 'tool_result', toolUseId, content: 'ok', isError: false },
            { kind: 'text', text: `Generated ${fileName}, turn ${turn + 1}.` },
            { kind: 'artifact_focus', show: [fileName] },
          ],
          producedFiles: [producedFile],
          createdAt: turnStartedAt + 1_000,
        },
      },
    );
    expect(assistantResponse.ok(), `seed assistant turn ${turn + 1}: ${await assistantResponse.text()}`).toBeTruthy();
  }

  return { projectId, conversationId };
}

async function seedProjectWithLargeAssistantHistory(
  page: Page,
): Promise<{
  projectId: string;
  conversationId: string;
  expectedContents: string[];
}> {
  const projectId = `assistant-large-fork-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Large Conversation Fork',
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };
  const expectedContents: string[] = [];

  for (let index = 1; index <= 3; index += 1) {
    const userMessageId = `large-user-${index}`;
    const userContent = `Large fork request ${index}`;
    const userResponse = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${userMessageId}`,
      {
        data: {
          id: userMessageId,
          role: 'user',
          content: userContent,
          createdAt: Date.now() + index * 2,
        },
      },
    );
    expect(userResponse.ok(), `seed user ${index}: ${await userResponse.text()}`).toBeTruthy();
    expectedContents.push(userContent);

    const assistantMessageId = `large-assistant-${index}`;
    const assistantContent = `Large fork point ${index}`;
    const assistantResponse = await page.request.put(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
      {
        data: {
          id: assistantMessageId,
          role: 'assistant',
          content: assistantContent,
          runStatus: 'succeeded',
          events: [{ kind: 'raw', line: 'x'.repeat(1_500_000) }],
          createdAt: Date.now() + index * 2 + 1,
        },
      },
    );
    expect(
      assistantResponse.ok(),
      `seed assistant ${index}: ${await assistantResponse.text()}`,
    ).toBeTruthy();
    expectedContents.push(assistantContent);
  }

  return { projectId, conversationId, expectedContents };
}

type ConversationHistoryFixture = {
  id: string;
  projectId: string;
  title: string | null;
  sessionMode: 'design' | 'ask' | 'plan';
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  totalDurationMs?: number;
  latestRun?: {
    status: 'succeeded' | 'failed' | 'canceled';
    durationMs?: number;
  };
};

async function seedProjectConversationHistory(
  page: Page,
): Promise<{
  projectId: string;
  conversations: ConversationHistoryFixture[];
}> {
  const projectId = `conversation-history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const projectResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Conversation History Coverage',
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(projectResponse.ok(), `create project: ${await projectResponse.text()}`).toBeTruthy();
  const { conversationId } = (await projectResponse.json()) as { conversationId: string };

  const now = Date.now();
  return {
    projectId,
    conversations: [
      {
        id: conversationId,
        projectId,
        title: 'Runway final polish',
        sessionMode: 'design',
        messageCount: 8,
        createdAt: now - 90 * 60_000,
        updatedAt: now - 30_000,
        totalDurationMs: 342_000,
        latestRun: {
          status: 'succeeded',
          durationMs: 330_000,
        },
      },
      {
        id: 'conv-font-audit',
        projectId,
        title: 'Font audit and brand pass',
        sessionMode: 'design',
        messageCount: 6,
        createdAt: now - 80 * 60_000,
        updatedAt: now - 2 * 60_000,
        latestRun: {
          status: 'succeeded',
          durationMs: 1_140_000,
        },
      },
      {
        id: 'conv-slide-review',
        projectId,
        title: 'Slide review baseline',
        sessionMode: 'ask',
        messageCount: 6,
        createdAt: now - 70 * 60_000,
        updatedAt: now - 7 * 60_000,
      },
    ],
  };
}

async function routeConversationHistoryFixtures(
  page: Page,
  projectId: string,
  initialConversations: ConversationHistoryFixture[],
) {
  const conversations = [...initialConversations];
  await page.route(`**/api/projects/${projectId}/conversations`, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { conversations } });
      return;
    }
    if (route.request().method() === 'POST') {
      const now = Date.now();
      const fresh: ConversationHistoryFixture = {
        id: 'conv-new-history',
        projectId,
        title: null,
        sessionMode: 'design',
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      conversations.unshift(fresh);
      await route.fulfill({ json: { conversation: fresh } });
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/projects/${projectId}/conversations/*/messages`, async (route) => {
    if (route.request().method() === 'GET') {
      const conversationId = conversationIdFromMessagesApiPath(route.request().url());
      const conversation = conversations.find((item) => item.id === conversationId);
      const count = conversation?.messageCount ?? 0;
      await route.fulfill({
        json: {
          messages: Array.from({ length: count }, (_, index) => ({
            id: `${conversationId}-m-${index}`,
            role: index % 2 === 0 ? 'user' : 'assistant',
            content: `Conversation ${conversationId} message ${index + 1}`,
            createdAt: (conversation?.createdAt ?? Date.now()) + index,
          })),
        },
      });
      return;
    }
    await route.continue();
  });
}

function conversationIdFromMessagesApiPath(url: string): string {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/\/conversations\/([^/]+)\/messages$/);
  return match ? decodeURIComponent(match[1]!) : '';
}

async function expectDesignsView(page: Page) {
  if (!/\/projects$/.test(new URL(page.url()).pathname)) {
    // The rail's Projects destination went away in #5517; /projects is still a
    // real route (Home's recent-projects "view all" is the in-product entry).
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
  }
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.design-grid, .design-kanban-board')).toBeVisible();
}

/**
 * Opens the composer's agent/model popover.
 *
 * The popover is a one-decision surface: pick the model for the agent that is
 * already active. Which CLI agent runs, the execution mode, PATH rescan and
 * reasoning effort are configuration and live in Settings → Execution, so
 * tests that need a different agent/mode seed it into the stored config rather
 * than clicking through this popover.
 */
async function openComposerAgentMenu(page: Page): Promise<{ menu: Locator }> {
  const composer = page.getByTestId('chat-composer');
  await expect(composer).toBeVisible();
  const trigger = composer.locator('.avatar-menu .avatar-agent-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.locator('.avatar-popover[role="dialog"]');
  await expect(menu).toBeVisible();
  return { menu };
}

/** Picks a model from the popover's always-expanded radio list. */
async function pickComposerModel(page: Page, name: RegExp): Promise<void> {
  const { menu } = await openComposerAgentMenu(page);
  const list = menu.getByTestId('avatar-model-list');
  await expect(list).toBeVisible({ timeout: 20_000 });
  await list.getByRole('radio', { name }).click();
  // Selecting a model dismisses the popover.
  await expect(page.locator('.avatar-popover[role="dialog"]')).toHaveCount(0);
}

async function routeComposerPlusFixtures(page: Page) {
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({
      json: {
        connectors: [
          {
            id: 'figma',
            name: 'Figma Connector',
            provider: 'Composio',
            category: 'Design',
            status: 'connected',
            tools: [],
          },
        ],
      },
    });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({
      json: {
        statuses: {
          figma: { status: 'connected', accountLabel: 'Design Team' },
        },
      },
    });
  });
  await page.route('**/api/connectors/discovery**', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/plugins', async (route) => {
    await route.fulfill({ json: { plugins: [COMPOSER_PLUS_PLUGIN] } });
  });
  await page.route('**/api/mcp/servers', async (route) => {
    await route.fulfill({
      json: {
        servers: [
          {
            id: 'design-docs',
            label: 'Design Docs MCP',
            transport: 'stdio',
            enabled: true,
            command: 'npx',
          },
        ],
        templates: [],
      },
    });
  });
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long }).catch(() => {});
  await dismissPrivacyDialog(page);
  await expect(page.getByTestId('workspace-tabs-dropdown-trigger')).toBeVisible();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.locator('.chat-loading-state')).toHaveCount(0, { timeout: T.medium });
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function routeHandoffEditors(page: Page): Promise<void> {
  await page.route('**/api/editors', async (route) => {
    await route.fulfill({
      json: {
        platform: 'darwin',
        editors: [
          {
            id: 'cursor',
            label: 'Cursor',
            icon: 'cursor',
            available: true,
            resolvedPath: '/Applications/Cursor.app',
            platforms: ['darwin', 'win32', 'linux'],
          },
          {
            id: 'finder',
            label: 'Finder',
            icon: 'finder',
            available: true,
            resolvedPath: '/System/Library/CoreServices/Finder.app',
            platforms: ['darwin'],
          },
        ],
      },
    });
  });
}

async function openHandoffCliTab(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const unifiedPopover = page.locator('.chrome-unified-popover:visible');
  await unifiedPopover.getByRole('tab', { name: 'Send to...' }).click();
  const menu = unifiedPopover.getByTestId('handoff-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('tab', { name: /^Copy for CLI$/ }).click();
  return menu;
}

async function dismissPrivacyDialog(page: Page) {
  const privacyRegion = page.getByRole('region', { name: /Help us improve OpenDesign/i });
  if (await privacyRegion.isVisible().catch(() => false)) {
    await privacyRegion.getByRole('button', { name: /I get it|not now|got it/i }).click();
    await expect(privacyRegion).toBeHidden();
  }
}

/**
 * Renames a project through the switcher's row menu (K2 #8183): open the
 * dropdown, ⋮ on the project's row, 重命名, type, Enter. The chat card carries
 * no inline title to edit any more (OPEND-3128).
 */
async function renameProjectFromSwitcher(
  page: Page,
  currentName: string,
  nextName: string,
) {
  await page.getByTestId('workspace-tabs-dropdown-trigger').click();
  const row = page
    .locator('.workspace-tabs-dropdown__row')
    .filter({ hasText: currentName })
    .first();
  await row.hover();
  await row.getByTestId('workspace-tabs-dropdown-row-more').click();
  await page
    .getByTestId('workspace-tabs-dropdown-row-menu')
    .getByRole('menuitem', { name: 'Rename' })
    .click();
  const input = page.getByRole('textbox', { name: 'Rename' });
  await input.fill(nextName);
  await input.press('Enter');
  await page.locator('.workspace-tabs-dropdown__backdrop').click({ position: { x: 4, y: 4 } });
}

async function uploadTinyHtml(
  page: Page,
  name: string,
  content: string,
  options: { headers?: Readonly<Record<string, string>> } = {},
): Promise<string> {
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name,
    mimeType: 'text/html',
    buffer: Buffer.from(content),
  });
  const { projectId } = getProjectContextFromUrl(page);
  let uploadedName = '';
  await expect
    .poll(async () => {
      const files = await listProjectFiles(page, projectId, options);
      uploadedName = files.find((file) => file.name.endsWith(name))?.name ?? '';
      return uploadedName;
    })
    .not.toBe('');
  await expect(tabBySuffix(page, uploadedName)).toBeVisible();
  return uploadedName;
}

async function uploadTinyPng(
  page: Page,
  name: string,
): Promise<string> {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(tabBySuffix(page, name)).toBeVisible();
  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  const uploaded = files.find((file) => file.name.endsWith(name));
  expect(uploaded?.name).toBeTruthy();
  return uploaded!.name;
}

async function openUploadedHtmlArtifactPreview(page: Page, uploadedName: string) {
  await openAllProjectFiles(page);
  const fileRow = rowByFileName(page, uploadedName);
  await expect(fileRow).toBeVisible();
  // #5517 deleted the preview card and its Open button: the row's primary
  // target opens the artifact in a workspace tab on a single click.
  await fileRow.getByRole('button').first().click();
  await expect(tabBySuffix(page, uploadedName)).toHaveAttribute('aria-selected', 'true');
}

function tabBySuffix(page: Page, name: string): Locator {
  return page.getByRole('tab', { name: new RegExp(`${escapeRegExp(name)}(?:\\s+Close tab)?$`, 'i') });
}

function rowByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`design-file-row-${name}`);
}

function menuByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`design-file-menu-${name}`);
}

function homeDesignCard(page: Page, name: string): Locator {
  return page.locator('.design-card', {
    has: page.locator('.design-card-name', {
      hasText: new RegExp(`^${escapeRegExp(name)}$`),
    }),
  });
}

async function seedAdoptedPet(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'default',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default' } },
        pet: {
          adopted: true,
          enabled: true,
          petId: 'custom',
          custom: {
            name: 'Original Buddy',
            glyph: '🦄',
            accent: '#c96442',
            greeting: 'Ready to pair.',
          },
        },
      }),
    );
  }, STORAGE_KEY);
}

async function fetchCurrentProject(page: Page) {
  const { projectId } = getProjectContextFromUrl(page);
  return fetchProjectById(page, projectId);
}

async function fetchProjectById(page: Page, projectId: string) {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      id?: string;
      name: string;
      designSystemId: string | null;
      metadata?: {
        inspirationDesignSystemIds?: string[];
      };
    };
  };
  return body.project;
}

async function listProjectsFromApi(page: Page) {
  const response = await page.request.get('/api/projects');
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    projects: Array<{ id: string; name: string }>;
  };
  return body.projects;
}

async function listProjectFiles(
  page: Page,
  projectId: string,
  options: { headers?: Readonly<Record<string, string>> } = {},
) {
  const response = await page.request.get(
    `/api/projects/${projectId}/files`,
    options.headers ? { headers: { ...options.headers } } : undefined,
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { files: Array<{ name: string }> };
  return body.files;
}

async function mockWritablePersonalProjectScope(page: Page) {
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope', async (route) => {
    const projectId = getProjectIdFromApiPath(route.request().url());
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
  });
}

function isCreateProjectRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/projects' && request.method() === 'POST';
}

function getProjectContextFromUrl(page: Page) {
  const url = new URL(page.url());
  const [, projectId, conversationId] = url.pathname.match(
    /\/projects\/([^/]+)(?:\/conversations\/([^/]+))?/,
  ) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  return { projectId, conversationId };
}

function getProjectIdFromApiPath(rawUrl: string) {
  const url = new URL(rawUrl);
  const [, projectId] = url.pathname.match(/\/api\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project api path: ${url.pathname}`);
  return projectId;
}

// Share opens straight onto the link/asset-shaped rows — share link, share
// page, deploy targets, save-as-template. These used to live under the old
// popover's "Export" tab; the split moved them to Share and left Export as a
// pure file-format menu, so the callers below take the Share door now. The
// popover shell is still shared between the two, so the locator is unchanged.
async function openShareMenu(page: Page) {
  await page.getByRole('button', { name: /^Share$/i }).click();
  const menu = page.locator('.share-menu-popover[role="menu"]');
  await expect(menu).toBeVisible();
  return menu;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeProjectsTabProject({
  id,
  name,
  createdAt,
  updatedAt,
  skillId = null,
  metadata = { kind: 'prototype' as const },
  status = { value: 'succeeded' as const },
}: {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  skillId?: string | null;
  metadata?: Record<string, unknown>;
  status?: { value: string };
}) {
  return {
    id,
    name,
    createdAt,
    updatedAt,
    skillId,
    designSystemId: null,
    pendingPrompt: '',
    customInstructions: null,
    metadata,
    status,
  };
}

function skillSummary(
  id: string,
  name: string,
  mode: 'prototype' | 'deck' | 'image',
  surface: 'web' | 'image',
  defaultFor: string[],
) {
  return {
    id,
    name,
    description: `${name} for tab switching coverage.`,
    triggers: [],
    mode,
    surface,
    platform: 'desktop',
    scenario: 'qa',
    previewType: 'html',
    designSystemRequired: mode !== 'image',
    defaultFor,
    upstream: null,
    featured: null,
    fidelity: null,
    speakerNotes: null,
    animations: null,
    hasBody: true,
    examplePrompt: '',
  };
}
