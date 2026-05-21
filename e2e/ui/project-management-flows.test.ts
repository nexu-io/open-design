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
  const { projectId } = getProjectContextFromUrl(page);

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
  const projectsAfterReload = await listProjectsFromApi(page);
  expect(projectsAfterReload.some((project) => project.id === projectId && project.name === projectName)).toBe(true);

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
  const alphaProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await createProject(page, betaName);
  await expectWorkspaceReady(page);
  const betaProjectId = getProjectContextFromUrl(page).projectId;
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
  const projects = await listProjectsFromApi(page);
  expect(projects).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: alphaProjectId, name: alphaName }),
      expect.objectContaining({ id: betaProjectId, name: betaName }),
    ]),
  );
});

test('projects sub tabs switch between Recent and Your designs ordering', async ({ page }) => {
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

test('projects grid card rename updates the card title and persists after reload', async ({ page }) => {
  const originalName = `Projects rename flow ${Date.now()}`;
  const renamedName = `${originalName} renamed`;
  await page.goto('/');
  await createProject(page, originalName);
  await expectWorkspaceReady(page);
  const { projectId } = getProjectContextFromUrl(page);

  await page.getByRole('button', { name: /back to projects/i }).click();
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

test('projects select mode supports multi-select delete with cancel and confirm', async ({ page }) => {
  const firstName = `Batch delete A ${Date.now()}`;
  const secondName = `Batch delete B ${Date.now()}`;
  await page.goto('/');

  await createProject(page, firstName);
  await expectWorkspaceReady(page);
  const firstProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await createProject(page, secondName);
  await expectWorkspaceReady(page);
  const secondProjectId = getProjectContextFromUrl(page).projectId;
  await page.getByRole('button', { name: /back to projects/i }).click();
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

test('projects kanban cards open projects and support delete cancel and confirm', async ({ page }) => {
  const projectName = `Kanban flow ${Date.now()}`;
  await page.goto('/');
  await createProject(page, projectName);
  await expectWorkspaceReady(page);

  const { projectId } = getProjectContextFromUrl(page);
  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectDesignsView(page);

  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  const kanbanCard = page.locator('.design-kanban-card', { hasText: projectName });
  await expect(kanbanCard).toBeVisible();

  await kanbanCard.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await expect(page.getByTestId('project-title')).toContainText(projectName);
  const openedProject = await fetchCurrentProject(page);
  expect(openedProject.name).toBe(projectName);

  await page.getByRole('button', { name: /back to projects/i }).click();
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

test('projects page shows the empty state when there are no projects', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { projects: [] } });
      return;
    }
    await route.continue();
  });

  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.locator('.tab-empty')).toBeVisible();
  await expect(page.locator('.tab-empty')).toContainText('No projects yet');
  await expect(page.locator('.design-grid')).toHaveCount(0);
  await expect(page.locator('.design-kanban-board')).toHaveCount(0);
});

test('projects page shows the no-results state and recovers when search is cleared', async ({ page }) => {
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

test('projects grid overflow menu closes on outside click and Escape', async ({ page }) => {
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

  await page.goto('/projects');
  await expectDesignsView(page);

  const card = homeDesignCard(page, 'Menu Close Project');
  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  const menu = page.locator('.design-card-menu');
  await expect(menu).toBeVisible();

  await page.mouse.click(20, 20);
  await expect(menu).toHaveCount(0);

  await card.hover();
  await card.getByRole('button', { name: /more actions/i }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('projects kanban view groups cards into status columns', async ({ page }) => {
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

  await page.goto('/projects');
  await expectDesignsView(page);
  await page.getByTestId('designs-view-kanban').click();
  await expect(page.locator('.design-kanban-board')).toBeVisible();

  await expect(page.locator('.design-kanban-card.status-not_started')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-running')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-awaiting_input')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-succeeded')).toHaveCount(1);
  await expect(page.locator('.design-kanban-card.status-failed')).toHaveCount(1);
  await expect(page.locator('.design-kanban-empty')).toHaveCount(1);

  await expect(page.locator('.design-kanban-card.status-running')).toContainText('Running Card');
  await expect(page.locator('.design-kanban-card.status-awaiting_input')).toContainText(
    'Awaiting Input Card',
  );
  await expect(page.locator('.design-kanban-card.status-succeeded')).toContainText(
    'Succeeded Card',
  );
});

test('projects page shows live artifact cards, supports search, and opens the live artifact project', async ({ page }) => {
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
  await expect(page).toHaveURL(/\/projects\/proj-live$/);
  await expect(page.getByTestId('project-title')).toContainText('Orbit Daily Digest');
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
