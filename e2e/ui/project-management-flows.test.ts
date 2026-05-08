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

  await page.getByRole('button', { name: 'Scroll project types right' }).click();
  await page.getByTestId('new-project-tab-image').click();
  await expect(page.getByTestId('new-project-tab-image')).toHaveAttribute('aria-selected', 'true');
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
  await page.keyboard.press('Escape');
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  const designCard = homeDesignCard(page, projectName);
  await expect(designCard).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(projectName);
    await dialog.dismiss();
  });
  await designCard.hover();
  await designCard.getByRole('button', { name: new RegExp(`delete project ${escapeRegExp(projectName)}`, 'i') }).click();
  await expect(designCard).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain(projectName);
    await dialog.accept();
  });
  await designCard.hover();
  await designCard.getByRole('button', { name: new RegExp(`delete project ${escapeRegExp(projectName)}`, 'i') }).click();
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  await createProject(page, betaName);
  await expectWorkspaceReady(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();

  await page
    .locator('.entry-side-foot')
    .getByRole('button', { name: /change pet/i })
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Pets' })).toBeVisible();

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

async function createProject(
  page: Page,
  projectName: string,
) {
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(projectName);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Page) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByText('Start a conversation')).toBeVisible();
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

function getProjectContextFromUrl(page: Page) {
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  return { projectId };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
