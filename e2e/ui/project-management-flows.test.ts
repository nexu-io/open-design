import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

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

const TAB_SKILLS = [
  skillSummary('prototype-skill', 'Prototype Skill', 'prototype', 'web', ['prototype']),
  skillSummary('live-artifact', 'live-artifact', 'prototype', 'web', []),
  skillSummary('deck-skill', 'Deck Skill', 'deck', 'web', ['deck']),
  skillSummary('image-skill', 'Image Skill', 'image', 'image', ['image']),
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          agentCliEnv: {},
        },
      },
    });
  });

  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      json: {
        agents: [
          {
            id: 'mock',
            name: 'Mock Agent',
            bin: 'mock-agent',
            available: true,
            version: 'test',
            models: [{ id: 'default', label: 'Default' }],
          },
        ],
      },
    });
  });
});

test('new project tabs switch visible form sections and preserve drafts', async ({ page }) => {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({ json: { skills: TAB_SKILLS } });
  });
  await page.route('**/api/connectors', async (route) => {
    await route.fulfill({ json: { connectors: [] } });
  });
  await page.route('**/api/connectors/status', async (route) => {
    await route.fulfill({ json: { statuses: {} } });
  });

  await page.goto('/');
  await openNewProjectPanel(page);
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
});

test('design system multi-select stores primary and inspiration metadata', async ({ page }) => {
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await page.goto('/');
  await openNewProjectPanel(page);
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
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const project = await fetchCurrentProject(page);
  expect(project.designSystemId).toBe('nexu-soft-tech');
  expect(project.metadata?.inspirationDesignSystemIds).toEqual([
    'editorial-noir',
    'data-mist',
  ]);
});

test('design system picker searches and switches the single selected system', async ({ page }) => {
  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });

  await page.goto('/');
  await openNewProjectPanel(page);
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
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const project = await fetchCurrentProject(page);
  expect(project.designSystemId).toBe('data-mist');
  expect(project.metadata?.inspirationDesignSystemIds).toBeUndefined();
});

test('project title rename persists after reload and ignores blank titles', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Original rename title');
  await expectWorkspaceReady(page);

  const title = page.getByTestId('project-title');
  await renameProjectTitle(page, title, 'Renamed persistent title');
  await expect(title).toContainText('Renamed persistent title');

  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('project-title')).toContainText('Renamed persistent title');

  await renameProjectTitle(page, page.getByTestId('project-title'), '   ');
  await page.reload();
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('project-title')).toContainText('Renamed persistent title');

  const project = await fetchCurrentProject(page);
  expect(project.name).toBe('Renamed persistent title');
});

test('canceling design file deletion keeps the file and open tab', async ({ page }) => {
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
  await page.getByTestId('design-files-tab').click();
  await rowByFileName(page, uploadedName).hover();
  await menuByFileName(page, uploadedName).click();
  await page.getByTestId(`design-file-delete-${uploadedName}`).click();

  await expect(rowByFileName(page, uploadedName)).toBeVisible();
  await expect(fileTab).toBeVisible();

  const { projectId } = getProjectContextFromUrl(page);
  const files = await listProjectFiles(page, projectId);
  expect(files.map((file) => file.name)).toContain(uploadedName);
});

test('home design card deletion supports cancel and confirm flows', async ({ page }) => {
  const projectName = `Home delete design flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
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

test('home designs view toggle switches between grid and kanban and persists', async ({ page }) => {
  const projectName = `Home view toggle flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  await page.getByRole('button', { name: /back to projects/i }).click();
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

  await page.getByTestId('designs-view-grid').click();
  await expect(page.locator('.design-grid')).toBeVisible();
  await expect(homeDesignCard(page, projectName)).toBeVisible();
  await expect(page.getByTestId('designs-view-grid')).toHaveAttribute('aria-pressed', 'true');
});

test('home designs search filters projects and recovers from no results', async ({ page }) => {
  const stamp = Date.now();
  const alphaName = `Home search alpha ${stamp}`;
  const betaName = `Home search beta ${stamp}`;
  await page.goto('/');

  await createProject(page, alphaName);
  await expectWorkspaceReady(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await createProject(page, betaName);
  await expectWorkspaceReady(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
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
});

test('change pet opens pet settings and updates the custom companion draft', async ({ page }) => {
  await seedAdoptedPet(page);
  await page.route('**/api/codex-pets', async (route) => {
    await route.fulfill({ json: { pets: [], rootDir: '' } });
  });

  await page.goto('/');
  const dialog = await openEntrySettingsDialog(page, /^Pets\b/);
  await expect(dialog.getByRole('heading', { level: 2, name: 'Pets' })).toBeVisible();

  await dialog.getByRole('tab', { name: 'Custom' }).click();
  const customPanel = dialog.locator('.pet-custom');
  await expect(customPanel).toBeVisible();

  await customPanel.getByLabel('Name').fill('QA Turtle');
  await customPanel.getByLabel('Glyph').fill('🐢');
  await customPanel.getByLabel('Greeting').fill('Shell yeah, tests are green.');
  await expect(customPanel.getByText('QA Turtle')).toBeVisible();
  await expect(customPanel.getByText('Shell yeah, tests are green.')).toBeVisible();

  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test.skip('project actions toolbar enables Continue in CLI after DESIGN.md and surfaces stale provenance fallback', async ({ page }) => {
  // Skipped: the project-actions toolbar (Finalize design package + Continue
  // in CLI) was removed from the project header. Reinstate this test once
  // those entry points have a new home.
  await page.goto('/');
  await createProject(page, `Project actions toolbar flow ${Date.now()}`);
  await expectWorkspaceReady(page);

  await expect(page.getByRole('button', { name: 'Finalize design package' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue in CLI' })).toBeDisabled();
  await expect(page.locator('.project-actions-disabled-hint')).toContainText(
    'Finalize the design package first.',
  );

  const { projectId } = getProjectContextFromUrl(page);
  await seedProjectFile(page, projectId, 'DESIGN.md', malformedProvenanceDesignMd());

  await page.reload();
  await expectWorkspaceReady(page);

  const continueButton = page.getByRole('button', { name: 'Continue in CLI' });
  await expect(continueButton).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Re-finalize (spec is stale)' })).toBeVisible();
  await expect(page.locator('.project-actions-chip')).toContainText(
    'Spec freshness unknown — regenerate to refresh signal',
  );

  const expectedDir = await fetchResolvedProjectDir(page, projectId);
  await continueButton.click();

  const toast = page.locator('.od-toast');
  await expect(toast).toBeVisible();
  if (expectedDir) {
    await expect(toast).toContainText(
      `Open your terminal at ${expectedDir}, run \`claude\`, and paste the prompt.`,
    );
  } else {
    await expect(toast).toContainText(
      'Working directory unavailable. Update the daemon to enable Continue in CLI.',
    );
  }
});

async function createProject(
  page: Page,
  projectName: string,
) {
  await openNewProjectPanel(page);
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
}

async function openNewProjectPanel(page: Page) {
  if (await page.getByTestId('new-project-panel').isVisible().catch(() => false)) return;
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function expectDesignsView(page: Page) {
  if (!/\/projects$/.test(new URL(page.url()).pathname)) {
    await page.getByTestId('entry-nav-projects').click();
  }
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.design-grid, .design-kanban-board')).toBeVisible();
}

async function openEntrySettingsDialog(page: Page, sectionName?: RegExp | string): Promise<Locator> {
  const settingsButton = page.getByRole('button', { name: /open settings/i });
  await settingsButton.click();
  const settingsMenu = page.locator('.avatar-popover[role="menu"]');
  await expect(settingsMenu).toBeVisible();
  await settingsMenu.getByRole('button', { name: /^Settings$/i }).click();

  const settingsDialog = page.getByRole('dialog');
  await expect(settingsDialog).toBeVisible();
  if (sectionName) {
    await settingsDialog.getByRole('button', { name: sectionName }).click();
  }
  return settingsDialog;
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function renameProjectTitle(
  page: Page,
  title: Locator,
  nextName: string,
) {
  await title.click();
  await page.keyboard.press('Meta+A');
  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  if (selected.length === 0) {
    await page.keyboard.press('Control+A');
  }
  await page.keyboard.type(nextName);
  await page.keyboard.press('Enter');
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

function tabBySuffix(page: Page, name: string): Locator {
  return page.getByRole('tab', { name: new RegExp(`${escapeRegExp(name)}$`, 'i') });
}

function rowByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`design-file-row-${name}`);
}

function menuByFileName(page: Page, name: string): Locator {
  return page.getByTestId(`design-file-menu-${name}`);
}

function homeDesignCard(page: Page, name: string): Locator {
  return page.locator('.design-card', {
    has: page.locator('.design-card-name', { hasText: name }),
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
        model: 'claude-sonnet-4-5',
        agentId: 'mock',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: {},
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
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: {
      name: string;
      designSystemId: string | null;
      metadata?: {
        inspirationDesignSystemIds?: string[];
      };
    };
  };
  return body.project;
}

async function listProjectFiles(page: Page, projectId: string) {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { files: Array<{ name: string }> };
  return body.files;
}

async function seedProjectFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: { name, content },
  });
  expect(response.ok()).toBeTruthy();
}

async function fetchResolvedProjectDir(
  page: Page,
  projectId: string,
): Promise<string | null> {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    resolvedDir?: string | null;
    project?: { metadata?: { baseDir?: string | null } };
  };
  return body.resolvedDir ?? body.project?.metadata?.baseDir ?? null;
}

function getProjectContextFromUrl(page: Page) {
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  return { projectId };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function malformedProvenanceDesignMd(): string {
  return `# DESIGN.md

## Provenance

- Project ID: qa-project
- Design system: nexu-soft-tech
- Current artifact: mock-artifact.html
- Transcript message count: 7
- Generated UTC timestamp: not-a-real-date
`;
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
