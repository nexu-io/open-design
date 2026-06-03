import { expect, test } from '@playwright/test';
import type { Locator, Page, Request, Response } from '@playwright/test';
import { automatedUiScenarios } from '@/playwright/resources';
import type { UiScenario } from '@/playwright/resources';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=';

test.describe.configure({ timeout: 30_000 });

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
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          privacyDecisionAt: 1,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        },
      },
    });
  });
});

const designFileFlows = new Set([
  'design-files-upload',
  'design-files-delete',
  'design-files-tab-persistence',
  'uploaded-image-renders-in-preview',
  'python-source-preview',
]);

for (const entry of automatedUiScenarios().filter((scenario) => designFileFlows.has(scenario.flow ?? ''))) {
  test(`[${designFileScenarioPriority(entry)}] ${entry.id}: ${entry.title}`, async ({ page }) => {
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

    await gotoEntryHome(page);
    await createProject(page, entry);
    await expectWorkspaceReady(page);

    if (entry.flow === 'design-files-upload') {
      await runDesignFilesUploadFlow(page);
      return;
    }
    if (entry.flow === 'design-files-delete') {
      await runDesignFilesDeleteFlow(page);
      return;
    }
    if (entry.flow === 'design-files-tab-persistence') {
      await runDesignFilesTabPersistenceFlow(page);
      return;
    }
    if (entry.flow === 'uploaded-image-renders-in-preview') {
      await runUploadedImageRendersInPreviewFlow(page, entry);
      return;
    }
    if (entry.flow === 'python-source-preview') {
      await runPythonSourcePreviewFlow(page, entry);
    }
  });
}

async function createProject(page: Page, entry: UiScenario) {
  await createProjectNameOnly(page, entry);
  await page.getByTestId('create-project').click();
}

async function createProjectNameOnly(page: Page, entry: UiScenario) {
  await openNewProjectModal(page);
  if (entry.create.tab) {
    await page.getByTestId(`new-project-tab-${entry.create.tab}`).click();
  }
  await page.getByTestId('new-project-name').fill(entry.create.projectName);
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-modal')).toBeVisible();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function getCurrentProjectContext(page: Page): Promise<{ projectId: string; conversationId: string }> {
  const current = new URL(page.url());
  const [, projects, projectId, maybeConversations, conversationId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  if (maybeConversations === 'conversations' && conversationId) {
    return { projectId, conversationId };
  }

  const response = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  const active = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!active) throw new Error(`no conversations found for project ${projectId}`);
  return { projectId, conversationId: active.id };
}

async function seedProjectFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
  encoding?: 'base64',
  artifactManifest?: Record<string, unknown>,
) {
  const response = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
      data: {
        name,
        content,
        ...(encoding ? { encoding } : {}),
        ...(artifactManifest ? { artifactManifest } : {}),
      },
      timeout: 15_000,
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function seedHtmlArtifact(page: Page, projectId: string, fileName: string, content: string) {
  const resp = await page.request.post(
    `/api/projects/${projectId}/files`,
    {
      data: {
        name: fileName,
        content,
        artifactManifest: {
          version: 1,
          kind: 'html',
          title: fileName,
          entry: fileName,
          renderer: 'html',
          exports: ['html'],
        },
      },
      timeout: 15_000,
    },
  );
  expect(resp.ok()).toBeTruthy();
}

async function listProjectFilesFromApi(
  page: Page,
  projectId: string,
): Promise<Array<{ name: string; kind: string }>> {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string; kind: string }> };
  return files;
}

async function expectProjectFileToContain(
  page: Page,
  projectId: string,
  fileName: string,
  expected: string,
) {
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!response.ok()) return '';
      return response.text();
    }, { timeout: 15_000 })
    .toContain(expected);
}

async function expectScenarioFiles(
  page: Page,
  entry: UiScenario,
  projectId: string,
) {
  if (!entry.expectedFiles?.length) return;
  const files = await listProjectFilesFromApi(page, projectId);
  for (const expectedFile of entry.expectedFiles) {
    const actual = files.find((file) => file.name === expectedFile.name);
    expect(actual, `missing expected file ${expectedFile.name}`).toBeDefined();
    if (expectedFile.kind) {
      expect(actual?.kind).toBe(expectedFile.kind);
    }
    if (expectedFile.previewText) {
      await expectProjectFileToContain(page, projectId, expectedFile.name, expectedFile.previewText);
    }
  }
}

async function expectScenarioPreviewText(page: Page, entry: UiScenario) {
  if (!entry.expectedPreviewText) return;
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByText(entry.expectedPreviewText, { exact: false })).toBeVisible();
}

async function expectScenarioProjectState(
  page: Page,
  entry: UiScenario,
  projectId: string,
) {
  await expectScenarioFiles(page, entry, projectId);
  await expectScenarioPreviewText(page, entry);
}

async function expectProjectFilesToIncludeSuffixes(
  page: Page,
  projectId: string,
  suffixes: string[],
) {
  await expect
    .poll(async () => {
      const names = (await listProjectFilesFromApi(page, projectId)).map((file) => file.name);
      return suffixes.every((suffix) => names.some((name) => name.endsWith(suffix)));
    })
    .toBe(true);
}

async function openDesignFile(page: Page, fileName: string) {
  const preview = page.getByTestId('artifact-preview-frame');
  if (await preview.isVisible()) return;

  const fileTab = page.getByRole('tab', { name: new RegExp(fileName.replace(/\./g, '\\.'), 'i') });
  if (await fileTab.isVisible()) {
    await fileTab.click();
    return;
  }

  await page.getByTestId('design-files-tab').click();
  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: fileName,
  });
  await expect(fileRow).toBeVisible();
  await fileRow.getByRole('button').first().click();
  await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
}

async function runUploadedImageRendersInPreviewFlow(page: Page, entry: UiScenario) {
  const { projectId } = await getCurrentProjectContext(page);
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=';
  await seedProjectFile(page, projectId, 'brand.png', pngBase64, 'base64');
  await seedHtmlArtifact(
    page,
    projectId,
    'image-preview.html',
    '<!doctype html><html><body><main><h1>Image Preview</h1><img alt="Brand logo" src="brand.png"></main></body></html>',
  );
  await page.reload();
  await openDesignFile(page, 'image-preview.html');

  const image = page.frameLocator('[data-testid="artifact-preview-frame"]').getByRole('img', { name: 'Brand logo' });
  await expect(image).toBeVisible();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  await expectScenarioProjectState(page, entry, projectId);
}

async function runPythonSourcePreviewFlow(page: Page, entry: UiScenario) {
  const { projectId } = await getCurrentProjectContext(page);
  await seedProjectFile(page, projectId, 'app.py', 'def greet():\n    return "hello from python"\n');
  await page.reload();
  await openDesignFile(page, 'app.py');

  await expect(page.locator('.code-viewer')).toContainText('def greet');
  await expect(page.locator('.code-viewer')).toContainText('hello from python');
  await expectScenarioFiles(page, entry, projectId);
}

async function runDesignFilesUploadFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'moodboard.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  await expect(page.getByRole('tab', { name: /moodboard\.png/i })).toBeVisible();
  await page.getByTestId('design-files-tab').click();
  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'moodboard.png',
  });
  await expect(fileRow).toBeVisible();
  const nameBtn = fileRow.getByRole('button').first();
  await nameBtn.click();
  const preview = page.getByTestId('design-file-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/moodboard\.png/i)).toBeVisible();

  await nameBtn.dblclick();
  await expect(page.getByRole('tab', { name: /moodboard\.png/i })).toBeVisible();
  await expectProjectFilesToIncludeSuffixes(page, projectId, ['moodboard.png']);
}

async function runDesignFilesDeleteFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'keep-me.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(page.getByRole('tab', { name: /keep-me\.png/i })).toBeVisible();

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'trash-me.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });

  await expect(page.getByRole('tab', { name: /trash-me\.png/i })).toBeVisible();
  await page.getByTestId('design-files-tab').click();

  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'trash-me.png',
  });
  await expect(fileRow).toBeVisible();
  await fileRow.hover();
  await fileRow.locator('[data-testid^="design-file-menu-"]').click();
  await expect(page.getByTestId('design-file-menu-popover')).toBeVisible();
  await page.locator('[data-testid^="design-file-delete-"]').click();

  await expect(fileRow).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /trash-me\.png/i })).toHaveCount(0);
  await expect(page.getByTestId('design-files-tab')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /keep-me\.png/i })).toBeVisible();
  await expect
    .poll(async () => {
      const names = (await listProjectFilesFromApi(page, projectId)).map((file) => file.name);
      return (
        names.length === 1 &&
        names.some((name) => name.endsWith('keep-me.png')) &&
        names.every((name) => !name.endsWith('trash-me.png'))
      );
    })
    .toBe(true);
}

test('design files batch delete removes only the selected files and clears the bulk action state', async ({ page }) => {
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

  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-name').fill('Design files batch delete flow');
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const { projectId } = await getCurrentProjectContext(page);
  await seedProjectFile(page, projectId, 'keep.png', TINY_PNG_B64, 'base64');
  await seedProjectFile(page, projectId, 'trash-a.png', TINY_PNG_B64, 'base64');
  await seedProjectFile(page, projectId, 'trash-b.png', TINY_PNG_B64, 'base64');
  await page.reload();
  await expectWorkspaceReady(page);
  await page.getByTestId('design-files-tab').click();

  const keepRow = page.getByTestId('design-file-row-keep.png');
  const trashARow = page.getByTestId('design-file-row-trash-a.png');
  const trashBRow = page.getByTestId('design-file-row-trash-b.png');
  await expect(keepRow).toBeVisible();
  await expect(trashARow).toBeVisible();
  await expect(trashBRow).toBeVisible();

  await trashARow.getByRole('checkbox').click();
  await trashBRow.getByRole('checkbox').click();
  const batchDelete = page.getByTestId('design-files-batch-delete');
  await expect(batchDelete).toBeVisible();
  await batchDelete.click();

  await expect(trashARow).toHaveCount(0);
  await expect(trashBRow).toHaveCount(0);
  await expect(keepRow).toBeVisible();
  await expect(page.getByTestId('design-files-batch-delete')).toHaveCount(0);
  await expect(page.getByTestId('design-files-upload-trigger')).toBeVisible();

  await expect
    .poll(async () => {
      const names = (await listProjectFilesFromApi(page, projectId)).map((file) => file.name);
      return (
        names.length === 1 &&
        names[0]?.endsWith('keep.png')
      );
    })
    .toBe(true);
});

test('design files kind filter trims hidden selections before batch delete reaches the backend', async ({ page }) => {
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-name').fill('Design files filtered batch delete flow');
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);

  const { projectId } = await getCurrentProjectContext(page);
  await seedProjectFile(page, projectId, 'visible-image.png', TINY_PNG_B64, 'base64');
  await seedProjectFile(page, projectId, 'hidden-image.png', TINY_PNG_B64, 'base64');
  await seedProjectFile(page, projectId, 'notes.txt', 'plain text note');
  await page.reload();
  await expectWorkspaceReady(page);
  await page.getByTestId('design-files-tab').click();

  const visibleImageRow = page.getByTestId('design-file-row-visible-image.png');
  const hiddenImageRow = page.getByTestId('design-file-row-hidden-image.png');
  const notesRow = page.getByTestId('design-file-row-notes.txt');
  await expect(visibleImageRow).toBeVisible();
  await expect(hiddenImageRow).toBeVisible();
  await expect(notesRow).toBeVisible();

  await visibleImageRow.getByRole('checkbox').click();
  await notesRow.getByRole('checkbox').click();
  await expect(page.getByTestId('design-files-batch-delete')).toBeVisible();

  const filterBtn = page.getByRole('button', { name: /filter by kind/i });
  await filterBtn.click();
  const filterPopover = page.getByRole('dialog', { name: /filter by kind/i });
  await expect(filterPopover).toBeVisible();
  await filterPopover.getByRole('checkbox', { name: /image/i }).check();
  await filterBtn.click();
  await expect(filterPopover).toBeHidden();

  await expect(visibleImageRow).toBeVisible();
  await expect(hiddenImageRow).toBeVisible();
  await expect(notesRow).toHaveCount(0);

  const batchDelete = page.getByTestId('design-files-batch-delete');
  await expect(batchDelete).toBeVisible();
  await batchDelete.click();

  await expect(visibleImageRow).toHaveCount(0);
  await expect(hiddenImageRow).toBeVisible();
  await expect(page.getByTestId('design-files-batch-delete')).toHaveCount(0);

  await expect
    .poll(async () => {
      const names = (await listProjectFilesFromApi(page, projectId)).map((file) => file.name).sort();
      return JSON.stringify(names);
    })
    .toBe(JSON.stringify(['hidden-image.png', 'notes.txt']));
});

async function runDesignFilesTabPersistenceFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'first-tab.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(page.getByRole('tab', { name: /first-tab\.png/i })).toBeVisible();

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'second-tab.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  const firstTab = page.getByRole('tab', { name: /first-tab\.png/i });
  const secondTab = page.getByRole('tab', { name: /second-tab\.png/i });
  await expect(firstTab).toBeVisible();
  await expect(secondTab).toBeVisible();

  await firstTab.click();
  await expect(firstTab).toHaveAttribute('aria-selected', 'true');
  await expect(secondTab).toHaveAttribute('aria-selected', 'false');

  await page.reload();

  const restoredFirstTab = page.getByRole('tab', { name: /first-tab\.png/i });
  await expect(restoredFirstTab).toBeVisible();
  await expect(restoredFirstTab).toHaveAttribute('aria-selected', 'true');

  // The refreshed workspace restores the active file tab, while other project files
  // remain available from the Design Files list until the user reopens them.
  await page.getByTestId('design-files-tab').click();
  const secondFileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'second-tab.png',
  });
  await expect(secondFileRow).toBeVisible();
  await secondFileRow.getByRole('button').first().click();
  await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();

  const restoredSecondTab = page.getByRole('tab', { name: /second-tab\.png/i });
  await expect(restoredSecondTab).toBeVisible();
  await expect(restoredSecondTab).toHaveAttribute('aria-selected', 'true');
  await expect(restoredFirstTab).toHaveAttribute('aria-selected', 'false');
  await expectProjectFilesToIncludeSuffixes(page, projectId, ['first-tab.png', 'second-tab.png']);
}

function homeDesignCard(page: Page, name: string): Locator {
  return page.locator('.design-card', {
    has: page.locator('.design-card-name', { hasText: name }),
  });
}

function designFileScenarioPriority(entry: UiScenario): 'P0' | 'P1' {
  switch (entry.flow) {
    case 'design-files-upload':
    case 'design-files-delete':
    case 'design-files-tab-persistence':
      return 'P0';
    case 'uploaded-image-renders-in-preview':
    case 'python-source-preview':
    default:
      return 'P1';
  }
}
