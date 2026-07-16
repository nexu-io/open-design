import { expect, test } from '@/playwright/suite';
import { ensureRailOpen, openNewProjectModal as openNewProjectModalFromProjects } from '@/playwright/rail';
import { runErrorCard } from '@/playwright/chat';
import {
  clickDeckNextSlide,
  clickDeckPreviousSlide,
  expectAllProjectFilesActive,
  expectAllProjectFilesInactive,
  openAllProjectFiles,
} from '@/playwright/workspace';
import type { Dialog, Locator, Page, Request, Response } from '@playwright/test';
import { automatedUiScenarios } from '@/playwright/resources';
import type { UiScenario } from '@/playwright/resources';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';

test.describe.configure({ timeout: process.env.CI ? 90_000 : 60_000 });

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

function stagedAttachmentName(page: Page, name: string): Locator {
  return page
    .locator('[data-testid="staged-attachments"], [data-testid="staged-contexts"]')
    .getByText(name, { exact: true });
}

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
test('[P0] @critical workspace restores the last manually selected file tab after reload instead of jumping back to the generated artifact', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"mock-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const artifact =
      '<artifact identifier="workspace-artifact" type="text/html" title="Workspace Artifact">' +
      '<!doctype html><html><body><main><h1>Workspace Artifact</h1></main></body></html>' +
      '</artifact>';
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({ chunk: artifact })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await createEmptyProject(page, 'Workspace active tab restore');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a workspace persistence artifact');
  await expect(page.getByText('workspace-artifact.html', { exact: true }).first()).toBeVisible();

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'manual-reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  const artifactTab = page.getByRole('tab', { name: /workspace-artifact\.html/i });
  const manualFileTab = tabBySuffix(page, 'manual-reference.png');
  await expect(artifactTab).toBeVisible();
  await expect(manualFileTab).toBeVisible();

  await manualFileTab.click();
  await expect(manualFileTab).toHaveAttribute('aria-selected', 'true');
  await expect(artifactTab).toHaveAttribute('aria-selected', 'false');

  await page.reload();
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  const restoredManualFileTab = tabBySuffix(page, 'manual-reference.png');
  await expect(restoredManualFileTab).toBeVisible();
  await expect(restoredManualFileTab).toHaveAttribute('aria-selected', 'true');
  const restoredArtifactTab = page.getByRole('tab', { name: /workspace-artifact\.html/i });
  if ((await restoredArtifactTab.count()) === 0) {
    const turnCard = page.locator('.msg.assistant').filter({ hasText: 'workspace-artifact.html' }).first();
    const openButton = turnCard.getByRole('button', { name: /^Open$/ });
    await expect(openButton).toBeVisible();
    await openButton.click();

    await expect(restoredArtifactTab).toBeVisible();
    await expect(restoredArtifactTab).toHaveAttribute('aria-selected', 'true');
    await expect(restoredManualFileTab).toHaveAttribute('aria-selected', 'false');
    return;
  }

  await expect(restoredArtifactTab).toBeVisible();
  await expect(restoredArtifactTab).toHaveAttribute('aria-selected', 'false');
  await expect(restoredManualFileTab).toHaveAttribute('aria-selected', 'true');
});

test('[P0] switching between projects restores each project workspace to its last active file tab', async ({ page }) => {
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

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );
  const alphaName = `Workspace Alpha ${Date.now()}`;
  const betaName = `Workspace Beta ${Date.now()}`;

  await gotoEntryHome(page);
  await createPrototypeProject(page, alphaName);
  await expectWorkspaceReady(page);

  const alphaPrimaryUpload = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'alpha-primary.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect((await alphaPrimaryUpload).ok()).toBeTruthy();
  await expect(tabBySuffix(page, 'alpha-primary.png')).toBeVisible();
  const alphaSecondaryUpload = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'alpha-secondary.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect((await alphaSecondaryUpload).ok()).toBeTruthy();

  const alphaPrimaryTab = tabBySuffix(page, 'alpha-primary.png');
  const alphaSecondaryTab = tabBySuffix(page, 'alpha-secondary.png');
  await expect(alphaPrimaryTab).toBeVisible();
  await expect(alphaSecondaryTab).toBeVisible();
  await alphaPrimaryTab.click();
  await expect(alphaPrimaryTab).toHaveAttribute('aria-selected', 'true');
  await expect(alphaSecondaryTab).toHaveAttribute('aria-selected', 'false');

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectProjectsView(page);

  await createPrototypeProject(page, betaName);
  await expectWorkspaceReady(page);

  const betaPrimaryUpload = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'beta-primary.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect((await betaPrimaryUpload).ok()).toBeTruthy();
  await expect(tabBySuffix(page, 'beta-primary.png')).toBeVisible();
  const betaSecondaryUpload = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'beta-secondary.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect((await betaSecondaryUpload).ok()).toBeTruthy();

  const betaPrimaryTab = tabBySuffix(page, 'beta-primary.png');
  const betaSecondaryTab = tabBySuffix(page, 'beta-secondary.png');
  await expect(betaPrimaryTab).toBeVisible();
  await expect(betaSecondaryTab).toBeVisible();
  await betaPrimaryTab.click();
  await expect(betaPrimaryTab).toHaveAttribute('aria-selected', 'true');
  await expect(betaSecondaryTab).toHaveAttribute('aria-selected', 'false');

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectProjectsView(page);

  await homeDesignCard(page, alphaName).click();
  await expectWorkspaceReady(page);
  await expect(tabBySuffix(page, 'alpha-primary.png')).toHaveAttribute('aria-selected', 'true');
  await expect(tabBySuffix(page, 'alpha-secondary.png')).toHaveAttribute('aria-selected', 'false');

  await page.getByRole('button', { name: /back to projects/i }).click();
  await expectProjectsView(page);

  await homeDesignCard(page, betaName).click();
  await expectWorkspaceReady(page);
  await expect(tabBySuffix(page, 'beta-primary.png')).toHaveAttribute('aria-selected', 'true');
  await expect(tabBySuffix(page, 'beta-secondary.png')).toHaveAttribute('aria-selected', 'false');
});

test('[P0] @critical visiting an uploaded design file route restores its tab and file workspace surface', async ({ page }) => {
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
  await createPrototypeProject(page, 'Uploaded file deep link');
  await expectWorkspaceReady(page);

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'deep-linked-reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const fileTab = tabBySuffix(page, 'deep-linked-reference.png');
  await expect(fileTab).toBeVisible();
  const uploadedName = await fileTab.getAttribute('title');
  expect(uploadedName).toBeTruthy();

  await openAllProjectFiles(page);
  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'deep-linked-reference.png',
  });
  await expect(fileRow).toBeVisible();
  await fileRow.getByRole('button').first().click();
  await expect(page.getByTestId('design-file-preview')).toBeVisible();
  await expect(page.getByTestId('design-file-preview').getByText(/deep-linked-reference\.png/i)).toBeVisible();

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }

  await gotoProjectRoute(page, `/projects/${projectId}/files/${encodeURIComponent(uploadedName!)}`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expectAllProjectFilesInactive(page);
});

test('[P0] returning from an uploaded design file route to the project root keeps the uploaded file tab active', async ({ page }) => {
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
  await createPrototypeProject(page, 'Uploaded file root route restore');
  await expectWorkspaceReady(page);

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'root-design-reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const fileTab = tabBySuffix(page, 'root-design-reference.png');
  await expect(fileTab).toBeVisible();
  const uploadedName = await fileTab.getAttribute('title');
  expect(uploadedName).toBeTruthy();

  await openAllProjectFiles(page);
  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'root-design-reference.png',
  });
  await expect(fileRow).toBeVisible();
  await fileRow.getByRole('button').first().click();
  await expect(page.getByTestId('design-file-preview')).toBeVisible();

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }

  await gotoProjectRoute(page, `/projects/${projectId}/files/${encodeURIComponent(uploadedName!)}`);
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await navigateProjectRouteInApp(page, `/projects/${projectId}`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
});

test('[P0] returning from an artifact file route to the project root keeps the artifact tab active', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"artifact-root-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const artifact =
      '<artifact identifier="root-restored-artifact" type="text/html" title="Root Restored Artifact">' +
      '<!doctype html><html><body><main><h1>Root Restored Artifact</h1></main></body></html>' +
      '</artifact>';
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({ chunk: artifact })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await createEmptyProject(page, 'Artifact root route restore');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create the artifact that should survive a root-route hop');
  const artifactTab = page.getByRole('tab', { name: /root-restored-artifact\.html/i });
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }

  await navigateProjectRouteInApp(page, `/projects/${projectId}`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');
});

test('[P0] @critical returning from an older conversation route to the project root keeps the composer available while the route is selected', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-root-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation root route restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'First conversation should stay selected';
  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');

  const secondPrompt = 'Second conversation should not replace the deep-linked one';
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);
  expect(secondContext.conversationId).not.toBe(firstContext.conversationId);

  await gotoProjectRoute(page, `/projects/${firstContext.projectId}/conversations/${firstContext.conversationId}`);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await page.getByTestId('conversation-history-trigger').click();
  const routeHistoryList = page.getByTestId('conversation-list');
  await expect(routeHistoryList).toBeVisible();
  await expect(routeHistoryList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();

  await navigateProjectRouteInApp(page, `/projects/${firstContext.projectId}`);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
});

test('[P0] @critical switching between conversations keeps the composer usable while navigating history', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-draft-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation draft restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'First conversation anchor';
  const secondPrompt = 'Second conversation anchor';
  const firstDraft = 'First conversation unsent draft';
  const secondDraft = 'Second conversation unsent draft';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);

  const composerInput = page.getByTestId('chat-composer-input');
  await composerInput.fill(secondDraft);
  await expect(composerInput).toHaveText(secondDraft);

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList.getByTestId(`conversation-select-${firstContext.conversationId}`).click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${firstContext.projectId}/conversations/${firstContext.conversationId}$`));

  await composerInput.fill(firstDraft);
  await expect(composerInput).toHaveText(firstDraft);

  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: secondPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${secondContext.projectId}/conversations/${secondContext.conversationId}$`));

  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: firstPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${firstContext.projectId}/conversations/${firstContext.conversationId}$`));

  await reloadCurrentRoute(page);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${firstContext.projectId}/conversations/${firstContext.conversationId}$`));
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);
});

test('[P0] @critical reloading an older conversation route keeps the composer visible on that route', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-reload-draft-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation reload draft restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Reloaded conversation anchor';
  const secondPrompt = 'Latest conversation anchor';
  const restoredDraft = 'Draft that should survive a reload on the older conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();

  await gotoProjectRoute(page, `/projects/${firstContext.projectId}/conversations/${firstContext.conversationId}`);
  const composerInput = page.getByTestId('chat-composer-input');
  await page.getByTestId('conversation-history-trigger').click();
  const routeHistoryList = page.getByTestId('conversation-list');
  await expect(routeHistoryList).toBeVisible();
  await expect(routeHistoryList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();

  await composerInput.fill(restoredDraft);
  await expect(composerInput).toHaveText(restoredDraft);

  await reloadCurrentRoute(page);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await page.getByTestId('conversation-history-trigger').click();
  const reloadedHistoryList = page.getByTestId('conversation-list');
  await expect(reloadedHistoryList).toBeVisible();
  await expect(reloadedHistoryList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();
});

test('[P0] @critical switching between conversations keeps staged attachments UI available', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-attachment-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation attachment restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Attachment conversation one';
  const secondPrompt = 'Attachment conversation two';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();

  const firstUploadResponse = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'first-draft-attachment.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('First conversation staged attachment.\n', 'utf8'),
  });
  await expect((await firstUploadResponse).ok()).toBeTruthy();
  await expect(stagedAttachmentName(page, 'first-draft-attachment.txt')).toBeVisible();

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  await expect(stagedAttachmentName(page, 'first-draft-attachment.txt')).toHaveCount(0);

  const secondUploadResponse = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'second-draft-attachment.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Second conversation staged attachment.\n', 'utf8'),
  });
  await expect((await secondUploadResponse).ok()).toBeTruthy();
  await expect(stagedAttachmentName(page, 'second-draft-attachment.txt')).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: firstPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: secondPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
});

test('[P0] @critical reloading an older conversation route keeps the composer available after staging attachments', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-attachment-reload-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation attachment reload restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Attachment reload conversation one';
  const secondPrompt = 'Attachment reload conversation two';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();

  await gotoProjectRoute(page, `/projects/${firstContext.projectId}/conversations/${firstContext.conversationId}`);
  await page.getByTestId('conversation-history-trigger').click();
  const routeHistoryList = page.getByTestId('conversation-list');
  await expect(routeHistoryList).toBeVisible();
  await expect(routeHistoryList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();

  const uploadResponse = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'reload-staged-attachment.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Attachment that should survive a reload.\n', 'utf8'),
  });
  await expect((await uploadResponse).ok()).toBeTruthy();
  await expect(stagedAttachmentName(page, 'reload-staged-attachment.txt')).toBeVisible();

  await reloadCurrentRoute(page);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
});

test('[P0] @critical reloading the project keeps the latest conversation selected in history', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-history-reload-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation history reload selection');
  await expectWorkspaceReady(page);

  const firstPrompt = 'History selection first conversation';
  const secondPrompt = 'History selection second conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);
  expect(secondContext.conversationId).not.toBe(firstContext.conversationId);

  await page.reload();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt })).toHaveCount(0);
  const reloadedContext = await getCurrentProjectContext(page);
  expect(reloadedContext.conversationId).toBe(secondContext.conversationId);

  const conversations = await listConversationsFromApi(page, secondContext.projectId);
  expect(conversations.map((conversation) => conversation.id)).toEqual(
    expect.arrayContaining([firstContext.conversationId, secondContext.conversationId]),
  );

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  const activeRow = historyList.getByTestId(`conversation-item-${secondContext.conversationId}`);
  await expect(activeRow).toHaveClass(/active/);
  await expect(historyList.locator('.chat-conv-item')).toHaveCount(2);
});

test('[P0] @critical deleting the active conversation selects the remaining conversation in history', async ({ page }) => {
  page.on('dialog', async (dialog: Dialog) => {
    await dialog.accept();
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-history-delete-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation history delete selection');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Delete selection first conversation';
  const secondPrompt = 'Delete selection second conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);
  expect(secondContext.conversationId).not.toBe(firstContext.conversationId);

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  const activeRow = historyList.getByTestId(`conversation-item-${secondContext.conversationId}`);
  await expect(activeRow).toHaveClass(/active/);
  await activeRow.getByTestId(/conversation-delete-/).click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);
  const restoredContext = await getCurrentProjectContext(page);
  expect(restoredContext.conversationId).toBe(firstContext.conversationId);

  const remainingConversations = await listConversationsFromApi(page, firstContext.projectId);
  expect(remainingConversations.map((conversation) => conversation.id)).toEqual([firstContext.conversationId]);

  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await expect(historyList.locator('.chat-conv-item')).toHaveCount(1);
  await expect(historyList.getByTestId(`conversation-item-${firstContext.conversationId}`)).toHaveClass(/active/);
});

test('[P0] returning from workspace surfaces keeps the older conversation reachable from history', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-history-surface-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation history surface restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Surface restore first conversation';
  const secondPrompt = 'Surface restore second conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'surface-restore.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(tabBySuffix(page, 'surface-restore.png')).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: firstPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);

  await openAllProjectFiles(page);
  await expectAllProjectFilesActive(page);

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  await navigateProjectRouteInApp(page, `/projects/${projectId}`);

  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await expect(historyList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();
});

test('[P0] reloading the project root keeps conversation history accessible', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-root-reload-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation root reload preserve selection');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Root reload first conversation';
  const secondPrompt = 'Root reload second conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: firstPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await expect(historyList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();
});

test('[P0] opening an uploaded file route keeps the older conversation present in history', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-file-surface-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation file surface selection');
  await expectWorkspaceReady(page);

  const firstPrompt = 'File surface first conversation';
  const secondPrompt = 'File surface second conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'conversation-surface-reference.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const uploadedFileTab = tabBySuffix(page, 'conversation-surface-reference.png');
  await expect(uploadedFileTab).toBeVisible();
  const uploadedName = await uploadedFileTab.getAttribute('title');
  expect(uploadedName).toBeTruthy();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: firstPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  await gotoProjectRoute(page, `/projects/${projectId}/files/${encodeURIComponent(uploadedName!)}`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(uploadedFileTab).toHaveAttribute('aria-selected', 'true');
  await expectAllProjectFilesInactive(page);
  await expectProjectFilesToIncludeSuffixes(page, projectId, ['conversation-surface-reference.png']);
  const persistedConversations = await listConversationsFromApi(page, projectId);
  expect(persistedConversations.map((conversation) => conversation.id)).toEqual(
    expect.arrayContaining([firstContext.conversationId, secondContext.conversationId]),
  );
  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await expect(historyList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();
});

test('[P0] opening an artifact file route keeps the older conversation present in history', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-artifact-surface-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const artifact =
      '<artifact identifier="conversation-surface-artifact" type="text/html" title="Conversation Surface Artifact">' +
      '<!doctype html><html><body><main><h1>Conversation Surface Artifact</h1></main></body></html>' +
      '</artifact>';
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({ chunk: artifact })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation artifact surface selection');
  await expectWorkspaceReady(page);

  const firstPrompt = 'Artifact surface first conversation';
  const secondPrompt = 'Artifact surface second conversation';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);

  const artifactTab = page.getByRole('tab', { name: /conversation-surface-artifact\.html/i });
  await expect(artifactTab).toBeVisible();
  await expect(artifactPreview(page)).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: firstPrompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  await gotoProjectRoute(page, `/projects/${projectId}/files/conversation-surface-artifact.html`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(artifactTab).toBeVisible();
  await expect(artifactPreview(page)).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', {
      name: 'Conversation Surface Artifact',
    }),
  ).toBeVisible();
  await expectProjectFilesToIncludeSuffixes(page, projectId, ['conversation-surface-artifact.html']);
  const persistedConversations = await listConversationsFromApi(page, projectId);
  expect(persistedConversations.map((conversation) => conversation.id)).toEqual(
    expect.arrayContaining([firstContext.conversationId, secondContext.conversationId]),
  );
  await page.getByTestId('conversation-history-trigger').click();
  await expect(historyList).toBeVisible();
  await expect(historyList.locator('.chat-conv-item').filter({ hasText: firstPrompt }).first()).toBeVisible();
});

test('[P0] returning from a file deep-link to the project root keeps the chosen file tab active', async ({ page }) => {
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

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"conversation-file-root-run"}',
    });
  });

  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Conversation file surface root restore');
  await expectWorkspaceReady(page);

  const firstPrompt = 'First conversation should survive file root restore';
  const secondPrompt = 'Second conversation should stay inactive during file root restore';

  await sendPrompt(page, firstPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  const { projectId, conversationId: firstConversationId } = await getCurrentProjectContext(page);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await sendPrompt(page, secondPrompt);
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt }).first()).toBeVisible();

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'conversation-root-file.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  const uploadedFileTab = tabBySuffix(page, 'conversation-root-file.png');
  await expect(uploadedFileTab).toBeVisible();
  const uploadedName = await uploadedFileTab.getAttribute('title');
  expect(uploadedName).toBeTruthy();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await historyList.getByTestId(`conversation-select-${firstConversationId}`).click();

  await expect(page.locator('.msg.user .user-text').filter({ hasText: firstPrompt }).first()).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: secondPrompt })).toHaveCount(0);

  await gotoProjectRoute(page, `/projects/${projectId}/files/${encodeURIComponent(uploadedName!)}`);

  const fileTab = tabBySuffix(page, 'conversation-root-file.png');
  await expect(fileTab).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expectAllProjectFilesInactive(page);

  await navigateProjectRouteInApp(page, `/projects/${projectId}`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(fileTab).toHaveAttribute('aria-selected', 'true');
  await expectAllProjectFilesInactive(page);
});

test('[P0] returning from an artifact deep-link to the project root keeps the artifact tab reachable after returning to the project root', async ({ page }) => {
  const projectId = await createEmptyProject(page, 'Artifact surface root restore');
  await seedHtmlArtifact(
    page,
    projectId,
    'conversation-root-artifact.html',
    '<!doctype html><html><body><main><h1>Conversation Root Artifact</h1></main></body></html>',
  );
  await expectProjectFilesToIncludeSuffixes(page, projectId, ['conversation-root-artifact.html']);

  await gotoProjectRoute(page, `/projects/${projectId}/files/conversation-root-artifact.html`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  const deepLinkedArtifactTab = page.getByRole('tab', { name: /conversation-root-artifact\.html/i });
  await expect(deepLinkedArtifactTab).toBeVisible();
  await expect(artifactPreview(page)).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', {
      name: 'Conversation Root Artifact',
    }),
  ).toBeVisible();

  await navigateProjectRouteInApp(page, `/projects/${projectId}`);

  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByRole('tab', { name: /conversation-root-artifact\.html/i })).toBeVisible();
});

test('[P0] a later completed run updates the workspace to the newest artifact tab', async ({ page }) => {
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

  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `workspace-run-${runCount}` }),
    });
  });

  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    const artifact =
      eventCount === 1
        ? '<artifact identifier="first-workspace-artifact" type="text/html" title="First Workspace Artifact"><!doctype html><html><body><main><h1>First Workspace Artifact</h1></main></body></html></artifact>'
        : '<artifact identifier="latest-workspace-artifact" type="text/html" title="Latest Workspace Artifact"><!doctype html><html><body><main><h1>Latest Workspace Artifact</h1></main></body></html></artifact>';
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({ chunk: artifact })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await createEmptyProject(page, 'Workspace latest artifact sync');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create the first workspace artifact');
  const firstArtifactTab = page.getByRole('tab', { name: /first-workspace-artifact\.html/i });
  await expect(firstArtifactTab).toBeVisible();
  await expect(firstArtifactTab).toHaveAttribute('aria-selected', 'true');

  await sendPrompt(page, 'Create the latest workspace artifact');
  const latestArtifactTab = page.getByRole('tab', { name: /latest-workspace-artifact\.html/i });
  await expect(latestArtifactTab).toBeVisible();
  await expect(firstArtifactTab).toBeVisible();
  await expect(latestArtifactTab).toHaveAttribute('aria-selected', 'true');
  await expect(firstArtifactTab).toHaveAttribute('aria-selected', 'false');
});

test('[P0] reloading a project keeps the Design Files entry reachable when it was the last active workspace surface', async ({ page }) => {
  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );

  await gotoEntryHome(page);
  await createPrototypeProject(page, 'Workspace design files restore');
  await expectWorkspaceReady(page);

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'restore-me.png',
    mimeType: 'image/png',
    buffer: pngBytes,
  });
  await expect(tabBySuffix(page, 'restore-me.png')).toBeVisible();

  await openAllProjectFiles(page);
  await expectAllProjectFilesActive(page);

  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'restore-me.png',
  });
  await expect(fileRow).toBeVisible();
  const rowButton = fileRow.getByRole('button').first();
  await rowButton.click();
  await expect(
    page.locator('[data-testid^="design-file-row-"]', {
      hasText: 'restore-me.png',
    }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('file-workspace')).toBeVisible({ timeout: 20_000 });
  await expectAllProjectFilesActive(page);
});

test('[P0] @critical daemon error details persist between failed sends', async ({ page }) => {
  const entry = automatedUiScenarios().find((scenario) => scenario.id === 'prototype-basic');
  if (!entry) throw new Error('prototype-basic scenario missing');

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

  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `error-run-${runCount}` }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: error',
      'data: {"message":"connection refused"}',
      '',
      '',
    ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await gotoEntryHome(page);
  await createProject(page, entry);
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'first failing prompt');
  await expect(runErrorCard(page)).toContainText('connection refused');
  await expect(page.locator('.msg.user').getByText('first failing prompt', { exact: true })).toBeVisible();

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) throw new Error(`unexpected project route: ${current.pathname}`);
  await seedHtmlArtifact(
    page,
    projectId,
    'error-cross-tab.html',
    '<!doctype html><html><body><h1>Error cross tab</h1></body></html>',
  );
  await openAllProjectFiles(page);
  const crossFileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'error-cross-tab.html',
  });
  await expect(crossFileRow).toBeVisible();
  await crossFileRow.getByRole('button').first().click();
  await clickDesignFilePreviewOpen(page);
  await expect(page.getByRole('tab', { name: /error-cross-tab\.html/i })).toHaveAttribute('aria-selected', 'true');
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: 'Error cross tab' })).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  await expectWorkspaceReady(page);
  await expect(runErrorCard(page)).toContainText('connection refused');
  await expect(page.locator('.msg.user').getByText('first failing prompt', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();

  await sendPrompt(page, 'second failing prompt');
  await expect(runErrorCard(page)).toContainText('connection refused');
  await expect(page.locator('.msg.user').getByText('first failing prompt', { exact: true })).toBeVisible();
  await expect(page.locator('.msg.user').getByText('second failing prompt', { exact: true })).toBeVisible();
});

test('[P0] a successful retry after a failed send restores the workspace to a fresh artifact tab', async ({ page }) => {
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

  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `retry-run-${runCount}` }),
    });
  });

  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    const body =
      eventCount === 1
        ? [
            'event: start',
            'data: {"bin":"mock-agent"}',
            '',
            'event: error',
            'data: {"message":"connection refused"}',
            '',
            '',
          ].join('\n')
        : [
            'event: start',
            'data: {"bin":"mock-agent"}',
            '',
            'event: stdout',
            `data: ${JSON.stringify({
              chunk:
                '<artifact identifier="retry-success-artifact" type="text/html" title="Retry Success Artifact"><!doctype html><html><body><main><h1>Retry Success Artifact</h1></main></body></html></artifact>',
            })}`,
            '',
            'event: end',
            'data: {"code":0,"status":"succeeded"}',
            '',
            '',
          ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await createEmptyProject(page, 'Retry success preview restore');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'first failing prompt');
  await expect(runErrorCard(page)).toContainText('connection refused');
  await expect(runErrorCard(page)).toContainText('connection refused');

  await sendPrompt(page, 'retry prompt that succeeds');
  await expect(page.getByText('retry-success-artifact.html', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /retry-success-artifact\.html/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByText('retry prompt that succeeds')).toBeVisible();
});

test('[P0] retrying a failed run does not duplicate the original user message', async ({ page }) => {
  await routeMockAgents(page);

  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `retry-run-${runCount}` }),
    });
  });

  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    const body =
      eventCount === 1
        ? [
            'event: start',
            'data: {"bin":"mock-agent"}',
            '',
            'event: error',
            'data: {"message":"connection refused"}',
            '',
            '',
          ].join('\n')
        : [
            'event: start',
            'data: {"bin":"mock-agent"}',
            '',
            'event: stdout',
            `data: ${JSON.stringify({
              chunk:
                '<artifact identifier="retry-dedup-artifact" type="text/html" title="Retry Dedup Artifact"><!doctype html><html><body><main><h1>Retry Dedup Artifact</h1></main></body></html></artifact>',
            })}`,
            '',
            'event: end',
            'data: {"code":0,"status":"succeeded"}',
            '',
            '',
          ].join('\n');

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  await createEmptyProject(page, 'Retry dedup restore');
  await expectWorkspaceReady(page);

  const prompt = 'retry dedup prompt';
  await sendPrompt(page, prompt);
  await expect(runErrorCard(page)).toContainText('connection refused');
  await expect(page.locator('.chat-error-retry')).toBeVisible();
  await expect(page.locator('.msg.user', { hasText: prompt })).toHaveCount(1);

  await Promise.all([
    page.waitForResponse((resp) => /\/api\/runs$/.test(new URL(resp.url()).pathname) && resp.request().method() === 'POST'),
    page.locator('.chat-error-retry').click(),
  ]);

  await expect(page.getByRole('tab', { name: /retry-dedup-artifact\.html/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('.msg.user', { hasText: prompt })).toHaveCount(1);
});

test('[P1] chat file links open project files in workspace tabs and keep trailing punctuation out of hrefs', async ({ page }) => {
  await routeMockAgents(page);

  let runCount = 0;
  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `link-run-${runCount}` }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({
        chunk:
          'Open [details.html](details.html). Also see https://example.com/release-notes。 for external notes.',
      })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body,
    });
  });

  const projectId = await createEmptyProject(page, 'Chat file links stay in workspace');
  await expectWorkspaceReady(page);
  await seedHtmlArtifact(
    page,
    projectId,
    'details.html',
    '<!doctype html><html><body><main><h1>Linked Details</h1></main></body></html>',
  );

  await sendPrompt(page, 'send chat links');
  const localLink = page.getByRole('link', { name: 'details.html' }).last();
  await expect(localLink).toBeVisible();
  const externalLink = page.getByRole('link', { name: 'https://example.com/release-notes' }).last();
  await expect(externalLink).toHaveAttribute('href', 'https://example.com/release-notes');

  await localLink.click();
  await expect(page.getByRole('tab', { name: /details\.html/i })).toHaveAttribute('aria-selected', 'true');
});

test('[P0] sending another prompt while a run is active queues it and starts it after the first run finishes', async ({ page }) => {
  await routeMockAgents(page);

  let runCount = 0;
  let releaseFirstRun!: () => void;
  const firstRunReleased = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });

  await page.route('**/api/runs', async (route) => {
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `queued-run-${runCount}` }),
    });
  });

  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    if (eventCount === 1) {
      await firstRunReleased;
      const firstBody = [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: stdout',
        `data: ${JSON.stringify({
          chunk:
            '<artifact identifier="first-queued-artifact" type="text/html" title="First Queued Artifact"><!doctype html><html><body><main><h1>First Queued Artifact</h1></main></body></html></artifact>',
        })}`,
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n');
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: firstBody,
      });
      return;
    }

    const secondBody = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({
        chunk:
          '<artifact identifier="second-queued-artifact" type="text/html" title="Second Queued Artifact"><!doctype html><html><body><main><h1>Second Queued Artifact</h1></main></body></html></artifact>',
      })}`,
      '',
      'event: end',
      'data: {"code":0,"status":"succeeded"}',
      '',
      '',
    ].join('\n');
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: secondBody,
    });
  });

  await createEmptyProject(page, 'Queued run workspace restore');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'first queued prompt');
  await expect.poll(() => runCount).toBe(1);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();

  const input = page.getByTestId('chat-composer-input');
  await input.click();
  await input.fill('second queued prompt');
  await page.getByTestId('chat-send').click();

  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('second queued prompt');
  expect(runCount).toBe(1);

  const release: () => void = releaseFirstRun ?? (() => { throw new Error('first run release handle missing'); });
  release();

  await expect.poll(() => runCount).toBe(2);
  await expect(queuedStrip).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /second-queued-artifact\.html/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('[P0] editing a queued prompt updates the next run request before it starts', async ({ page }) => {
  await routeMockAgents(page);

  let runCount = 0;
  const runBodies: Array<Record<string, unknown>> = [];
  let releaseFirstRun!: () => void;
  const firstRunReleased = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });

  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `edited-queued-run-${runCount}` }),
    });
  });

  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    if (eventCount === 1) {
      await firstRunReleased;
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
        },
        body: [
          'event: start',
          'data: {"bin":"mock-agent"}',
          '',
          'event: end',
          'data: {"code":0,"status":"succeeded"}',
          '',
          '',
        ].join('\n'),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: stdout',
        `data: ${JSON.stringify({
          chunk:
            '<artifact identifier="edited-queued-artifact" type="text/html" title="Edited Queued Artifact"><!doctype html><html><body><main><h1>Edited Queued Artifact</h1></main></body></html></artifact>',
        })}`,
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Queued run edit before send');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'first queued edit prompt');
  await expect.poll(() => runCount).toBe(1);

  const input = page.getByTestId('chat-composer-input');
  await input.click();
  await input.fill('queued prompt before edit');
  await page.getByTestId('chat-send').click();

  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('queued prompt before edit');
  expect(runCount).toBe(1);

  await queuedStrip.getByRole('button', { name: /^Edit$/i }).click();
  await expect(input).toHaveText('queued prompt before edit');
  await input.fill('queued prompt after edit');
  await page.getByTestId('chat-send').click();

  await expect(queuedStrip).toContainText('queued prompt after edit');
  await expect(queuedStrip).not.toContainText('queued prompt before edit');
  expect(runCount).toBe(1);

  const release: () => void = releaseFirstRun ?? (() => { throw new Error('first run release handle missing'); });
  release();

  await expect.poll(() => runCount).toBe(2);
  expect(runBodies[1]?.message).toContain('queued prompt after edit');
  expect(runBodies[1]?.message).not.toContain('queued prompt before edit');
  await expect(queuedStrip).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /edited-queued-artifact\.html/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('[P0] editing a queued prompt from an artifact file route keeps the file editing surface active', async ({ page }) => {
  await routeMockAgents(page);

  let runCount = 0;
  const runBodies: Array<Record<string, unknown>> = [];
  let releaseFirstRun!: () => void;
  const firstRunReleased = new Promise<void>((resolve) => {
    releaseFirstRun = resolve;
  });

  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    runCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `artifact-file-queued-run-${runCount}` }),
    });
  });

  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    if (eventCount === 1) {
      await firstRunReleased;
    }
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  const projectId = await createEmptyProject(page, 'Artifact file queued edit context');
  await seedHtmlArtifact(page, projectId, 'active-edit.html', manualEditHtml());
  await gotoProjectRoute(page, `/projects/${projectId}/files/active-edit.html`);

  await expect(tabBySuffix(page, 'active-edit.html')).toBeVisible();
  await expect(artifactPreview(page)).toBeVisible();
  await expect(
    artifactPreviewFrame(page).getByRole('heading', { name: 'Original Hero' }),
  ).toBeVisible();
  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(artifactPreviewFrame(page).locator('html[data-od-edit-mode]')).toHaveCount(1);

  await sendPrompt(page, 'first artifact file edit prompt');
  await expect.poll(() => runCount).toBe(1);

  const input = page.getByTestId('chat-composer-input');
  await input.click();
  await input.fill('queued artifact file prompt before edit');
  await page.getByTestId('chat-send').click();

  const queuedStrip = page.getByTestId('chat-queued-send-strip');
  await expect(queuedStrip).toBeVisible();
  await expect(queuedStrip).toContainText('queued artifact file prompt before edit');
  expect(runCount).toBe(1);

  await queuedStrip.getByRole('button', { name: /^Edit$/i }).click();
  await expect(input).toHaveText('queued artifact file prompt before edit');
  await input.fill('queued artifact file prompt after edit');
  await page.getByTestId('chat-send').click();

  await expect(queuedStrip).toContainText('queued artifact file prompt after edit');
  await expect(queuedStrip).not.toContainText('queued artifact file prompt before edit');

  const release: () => void = releaseFirstRun ?? (() => { throw new Error('first run release handle missing'); });
  release();

  await expect.poll(() => runCount).toBe(2);
  expect(runBodies[1]?.message).toContain('queued artifact file prompt after edit');
  expect(runBodies[1]?.message).not.toContain('queued artifact file prompt before edit');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/(?:conversations/[^/]+/)?files/active-edit\\.html$`));
  await expect(artifactPreviewFrame(page).locator('html[data-od-edit-mode]')).toHaveCount(1);
  await expect(queuedStrip).toHaveCount(0);
});

test('[P1] composer plus menu design toolbox action seeds the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"toolbox-action-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Composer toolbox action run context');
  await expectWorkspaceReady(page);

  await page.getByTestId('chat-composer-input').fill('Make this dashboard feel premium.');
  await page.getByTestId('chat-plus-trigger').click();
  await page.getByRole('menuitem', { name: 'Design toolbox' }).click();
  await page.getByRole('menuitem', { name: 'Match next step' }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('Creative Director orchestrator');
  await expect(input).toContainText('Preserve the intent already in the composer: Make this dashboard feel premium.');

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('Creative Director orchestrator');
  expect(runBodies[0]?.message).toContain('Make this dashboard feel premium.');
  expect(runBodies[0]?.message).toContain('Global resource index');
});

test('[P1] composer design toolbox motion action seeds its specific prompt into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"toolbox-motion-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Composer toolbox motion action context');
  await expectWorkspaceReady(page);

  await page.getByTestId('chat-composer-input').fill('Animate the KPI dashboard hero.');
  await page.getByTestId('chat-plus-trigger').click();
  await page.getByRole('menuitem', { name: 'Design toolbox' }).click();
  await page.getByRole('menuitem', { name: 'Add animation / motion' }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('Add high-quality motion to the current HTML / page element');
  await expect(input).toContainText('Preserve the intent already in the composer: Animate the KPI dashboard hero.');

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('Add high-quality motion to the current HTML / page element');
  expect(runBodies[0]?.message).toContain('prefers-reduced-motion fallbacks');
  expect(runBodies[0]?.message).toContain('Animate the KPI dashboard hero.');
  expect(runBodies[0]?.message).not.toContain('Creative Director orchestrator');
});

test('[P1] composer design toolbox anti-AI polish action seeds its specific prompt into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"toolbox-anti-ai-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Composer toolbox anti AI polish context');
  await expectWorkspaceReady(page);

  await page.getByTestId('chat-composer-input').fill('Make this SaaS landing page feel less generic.');
  await page.getByTestId('chat-plus-trigger').click();
  await page.getByRole('menuitem', { name: 'Design toolbox' }).click();
  await page.getByRole('menuitem', { name: 'Remove AI feel' }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('Do one anti-AI-feel polish pass');
  await expect(input).toContainText('Preserve the intent already in the composer: Make this SaaS landing page feel less generic.');

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('Do one anti-AI-feel polish pass');
  expect(runBodies[0]?.message).toContain('cheap gradients/glows');
  expect(runBodies[0]?.message).toContain('Make this SaaS landing page feel less generic.');
  expect(runBodies[0]?.message).not.toContain('prefers-reduced-motion fallbacks');
});

test('[P1] project composer design toolbox hides disabled skill resources', async ({ page }) => {
  await routeMockAgents(page);
  await routeRuntimeSkills(page);
  await routeAppConfig(page, {
    disabledSkills: ['disabled-runtime-skill'],
  });

  await createEmptyProject(page, 'Runtime disabled skill toolbox');
  await expectWorkspaceReady(page);

  await page.getByTestId('chat-plus-trigger').click();
  await page.getByRole('menuitem', { name: 'Design toolbox' }).click();
  await page.getByRole('textbox', { name: /Search design toolbox resources/i }).fill('Runtime Skill');

  await expect(page.getByRole('menuitem', { name: /Enabled Runtime Skill/i })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Disabled Runtime Skill/i })).toHaveCount(0);
});

test('[P1] completed background run sends the configured desktop notification', async ({ page }) => {
  const notificationConfig = {
    soundEnabled: false,
    successSoundId: 'ding',
    failureSoundId: 'buzz',
    desktopEnabled: true,
  };
  await page.addInitScript(
    ({ key, notificationsConfig }) => {
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
          notifications: notificationsConfig,
        }),
      );
    },
    { key: STORAGE_KEY, notificationsConfig: notificationConfig },
  );
  await page.addInitScript(() => {
    const notifications: Array<{ title: string; body?: string }> = [];
    Object.defineProperty(window, '__odTestNotifications', {
      value: notifications,
      configurable: true,
    });

    class FakeNotification {
      static permission = 'granted';

      title: string;
      body?: string;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        const body = options?.body;
        if (body) {
          this.body = body;
          notifications.push({ title, body });
        } else {
          notifications.push({ title });
        }
      }

      close() {
        this.onclose?.();
      }
    }

    Object.defineProperty(window, 'Notification', {
      value: FakeNotification,
      configurable: true,
    });
    const serviceWorkerRegistration = {
      showNotification: (title: string, options?: NotificationOptions) => {
        const body = options?.body;
        if (body) {
          notifications.push({ title, body });
        } else {
          notifications.push({ title });
        }
        return Promise.resolve();
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: () => Promise.resolve(serviceWorkerRegistration),
        ready: Promise.resolve(serviceWorkerRegistration),
      },
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      get: () => true,
      configurable: true,
    });
    Object.defineProperty(document, 'hasFocus', {
      value: () => false,
      configurable: true,
    });
  });
  await routeMockAgents(page);
  await routeAppConfig(page, {
    notifications: notificationConfig,
  });

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"notification-run"}',
    });
  });
  let releaseEvents!: () => void;
  const eventsReleased = new Promise<void>((resolve) => {
    releaseEvents = resolve;
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await eventsReleased;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: stdout',
        `data: ${JSON.stringify({ chunk: 'Background completion notification body.' })}`,
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Background notification run');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Finish and notify me');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  releaseEvents();

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & {
        __odTestNotifications?: Array<{ title: string; body?: string }>;
      }).__odTestNotifications ?? []),
    )
    .toContainEqual(expect.objectContaining({
      title: 'Task completed',
      body: expect.stringContaining('Background completion notification body.'),
    }));
});

test('[P1] failed foreground run still sends the configured desktop notification', async ({ page }) => {
  const notificationConfig = {
    soundEnabled: false,
    successSoundId: 'ding',
    failureSoundId: 'buzz',
    desktopEnabled: true,
  };
  await page.addInitScript(
    ({ key, notificationsConfig }) => {
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
          notifications: notificationsConfig,
        }),
      );
    },
    { key: STORAGE_KEY, notificationsConfig: notificationConfig },
  );
  await page.addInitScript(() => {
    const notifications: Array<{ title: string; body?: string }> = [];
    Object.defineProperty(window, '__odTestNotifications', {
      value: notifications,
      configurable: true,
    });

    class FakeNotification {
      static permission = 'granted';

      title: string;
      body?: string;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(title: string, options?: NotificationOptions) {
        this.title = title;
        const body = options?.body;
        if (body) {
          this.body = body;
          notifications.push({ title, body });
        } else {
          notifications.push({ title });
        }
      }

      close() {
        this.onclose?.();
      }
    }

    Object.defineProperty(window, 'Notification', {
      value: FakeNotification,
      configurable: true,
    });
    const serviceWorkerRegistration = {
      showNotification: (title: string, options?: NotificationOptions) => {
        const body = options?.body;
        if (body) {
          notifications.push({ title, body });
        } else {
          notifications.push({ title });
        }
        return Promise.resolve();
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: () => Promise.resolve(serviceWorkerRegistration),
        ready: Promise.resolve(serviceWorkerRegistration),
      },
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true,
    });
    Object.defineProperty(document, 'hasFocus', {
      value: () => true,
      configurable: true,
    });
  });
  await routeMockAgents(page);
  await routeAppConfig(page, {
    notifications: notificationConfig,
  });

  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"notification-failure-run"}',
    });
  });
  let releaseEvents!: () => void;
  const eventsReleased = new Promise<void>((resolve) => {
    releaseEvents = resolve;
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await eventsReleased;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: stderr',
        `data: ${JSON.stringify({ chunk: 'Foreground failure notification body.' })}`,
        '',
        'event: end',
        'data: {"code":1,"status":"failed"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Foreground failure notification run');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Fail and notify me');
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  releaseEvents();

  await expect
    .poll(async () =>
      page.evaluate(() => (window as typeof window & {
        __odTestNotifications?: Array<{ title: string; body?: string }>;
      }).__odTestNotifications ?? []),
    )
    .toContainEqual(expect.objectContaining({
      title: 'Task failed',
      body: 'The task ended with an error.',
    }));
});

test('[P1] Browser Inspiration page_info action seeds Browser tab context into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"browser-inspiration-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Browser Inspiration run context');
  await expectWorkspaceReady(page);

  await page.getByTestId('workspace-add-tab').click();
  await page.getByRole('button', { name: 'New Browser' }).click();
  await expect(
    page.getByTestId('file-workspace').getByRole('tab', { name: /Browser/ }),
  ).toBeVisible();

  await page.getByTestId('file-workspace').getByRole('button', { name: 'Inspiration' }).click();
  await page.locator('.db-browser-use-action').filter({ hasText: /^page_info/ }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('@agent-browser');
  await expect(input).toContainText('Use the selected Open Design Browser tab as the bound target.');
  await expect(input).toContainText('Operation: page_info');
  await expect(input).toContainText('- tab: Browser');
  await expect(input).toContainText('- url: about:blank');

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('@agent-browser');
  expect(runBodies[0]?.message).toContain('Operation: page_info');
  expect(runBodies[0]?.message).toContain('Browser tab context:');
  expect(runBodies[0]?.message).toContain('- url: about:blank');
});

test('[P1] Browser Inspiration navigate action carries Browser operation contract into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"browser-navigate-inspiration-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Browser navigate Inspiration run context');
  await expectWorkspaceReady(page);

  await page.getByTestId('workspace-add-tab').click();
  await page.getByRole('button', { name: 'New Browser' }).click();
  await expect(
    page.getByTestId('file-workspace').getByRole('tab', { name: /Browser/ }),
  ).toBeVisible();

  await page.getByTestId('file-workspace').getByRole('button', { name: 'Inspiration' }).click();
  await page.locator('.db-browser-use-action').filter({ hasText: /^navigate/ }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('@agent-browser');
  await expect(input).toContainText('Operation: navigate');
  await expect(input).toContainText('Input contract: url / domain / search terms');
  await expect(input).toContainText('Navigate the bound Browser tab to the requested URL');

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('Operation: navigate');
  expect(runBodies[0]?.message).toContain('Input contract: url / domain / search terms');
  expect(runBodies[0]?.message).toContain('First confirm the bound tab URL/title');
});

test('[P1] Browser Inspiration page_info carries the active Browser URL context into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"browser-active-url-context-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Browser active URL Inspiration context');
  await expectWorkspaceReady(page);

  await page.getByTestId('workspace-add-tab').click();
  await page.getByRole('button', { name: 'New Browser' }).click();
  await expect(
    page.getByTestId('file-workspace').getByRole('tab', { name: /Browser/ }),
  ).toBeVisible();

  const expectedUrl = `${new URL(page.url()).origin}/api/health`;
  const address = page.getByTestId('file-workspace').getByLabel('Browser address');
  await address.fill('/api/health');
  await address.press('Enter');
  await expect(page.locator('.db-address-display')).toContainText('/api/health');

  await page.getByTestId('file-workspace').getByRole('button', { name: 'Inspiration' }).click();
  await page.locator('.db-browser-use-action').filter({ hasText: /^page_info/ }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('Operation: page_info');
  await expect(input).toContainText(`- url: ${expectedUrl}`);

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('Operation: page_info');
  expect(runBodies[0]?.message).toContain(`- url: ${expectedUrl}`);
});

test('[P1] Browser Inspiration page_info carries a loaded page title into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/browser-title-fixture.html', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: [
        '<!doctype html>',
        '<html>',
        '<head><title>Browser Fixture Title</title></head>',
        '<body><main><h1>Browser fixture page</h1></main></body>',
        '</html>',
      ].join(''),
    });
  });
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"browser-title-context-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  await createEmptyProject(page, 'Browser loaded title Inspiration context');
  await expectWorkspaceReady(page);

  await page.getByTestId('workspace-add-tab').click();
  await page.getByRole('button', { name: 'New Browser' }).click();
  await expect(
    page.getByTestId('file-workspace').getByRole('tab', { name: /Browser/ }),
  ).toBeVisible();

  const expectedUrl = `${new URL(page.url()).origin}/browser-title-fixture.html`;
  const address = page.getByTestId('file-workspace').getByLabel('Browser address');
  await address.fill(expectedUrl);
  await address.press('Enter');
  await expect(page.locator('.db-address-display')).toContainText('/browser-title-fixture.html');
  await expect(page.locator('.db-address-display')).toContainText('Browser Fixture Title');

  await page.getByTestId('file-workspace').getByRole('button', { name: 'Inspiration' }).click();
  await page.locator('.db-browser-use-action').filter({ hasText: /^page_info/ }).click();

  const input = page.getByTestId('chat-composer-input');
  await expect(input).toContainText('Operation: page_info');
  await expect(input).toContainText(`- url: ${expectedUrl}`);
  await expect(input).toContainText('- title: Browser Fixture Title');

  await page.getByTestId('chat-send').click();
  expect(runBodies[0]?.message).toContain('Operation: page_info');
  expect(runBodies[0]?.message).toContain(`- url: ${expectedUrl}`);
  expect(runBodies[0]?.message).toContain('- title: Browser Fixture Title');
});

test('[P1] inline question form Skip all sends structured skipped answers into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `questions-skip-run-${runBodies.length}` }),
    });
  });
  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    const questionForm = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify(
        {
          description: 'Answer these before generation continues.',
          questions: [
            {
              id: 'audience',
              label: 'Audience',
              type: 'text',
              required: false,
            },
          ],
        },
        null,
        2,
      ),
      '</question-form>',
    ].join('\n');
    const chunk = eventCount === 1 ? questionForm : 'Thanks — continuing with skipped answers.';
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: stdout',
        `data: ${JSON.stringify({ chunk })}`,
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  const projectId = await createEmptyProject(page, 'Inline questions skip all');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Plan a landing page after asking clarifying questions.');
  const form = page.locator('.question-form').first();
  await expect(form).toBeVisible();
  await expect(form.getByText('Audience')).toBeVisible();

  const skipAll = form.getByRole('button', { name: /Skip all/i });
  await expect(skipAll).toBeEnabled();
  await Promise.all([
    page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
    skipAll.click(),
  ]);

  await expect.poll(() => runBodies.length).toBe(2);
  expect(runBodies[1]?.message).toContain('[form answers — discovery]');
  expect(runBodies[1]?.message).toContain('Audience: (skipped)');

  const conversationsResponse = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(conversationsResponse.ok()).toBeTruthy();
  const { conversations } = (await conversationsResponse.json()) as {
    conversations: Array<{ id: string }>;
  };
  const conversationId = conversations[0]?.id;
  expect(conversationId).toBeTruthy();
  const messagesResponse = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(messagesResponse.ok()).toBeTruthy();
  const { messages } = (await messagesResponse.json()) as {
    messages: Array<{ role: string; content: string }>;
  };
  expect(
    messages.some(
      (message) =>
        message.role === 'user' &&
        message.content.includes('[form answers — discovery]') &&
        message.content.includes('Audience: (skipped)'),
    ),
  ).toBe(true);
});

test('[P1] inline question form submits selected answers into the next run request', async ({ page }) => {
  await routeMockAgents(page);

  const runBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) runBodies.push(JSON.parse(raw) as Record<string, unknown>);
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `questions-continue-run-${runBodies.length}` }),
    });
  });
  let eventCount = 0;
  await page.route('**/api/runs/*/events', async (route) => {
    eventCount += 1;
    const questionForm = [
      '<question-form id="discovery" title="Quick brief">',
      JSON.stringify(
        {
          description: 'Answer these before generation continues.',
          questions: [
            {
              id: 'audience',
              label: 'Audience',
              type: 'text',
              required: true,
            },
          ],
        },
        null,
        2,
      ),
      '</question-form>',
    ].join('\n');
    const chunk = eventCount === 1 ? questionForm : 'Thanks — continuing with selected answers.';
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      },
      body: [
        'event: start',
        'data: {"bin":"mock-agent"}',
        '',
        'event: stdout',
        `data: ${JSON.stringify({ chunk })}`,
        '',
        'event: end',
        'data: {"code":0,"status":"succeeded"}',
        '',
        '',
      ].join('\n'),
    });
  });

  const projectId = await createEmptyProject(page, 'Inline questions submit run context');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Plan a landing page after user choices.');
  const form = page.locator('.question-form').first();
  await expect(form).toBeVisible();
  const audienceQuestion = form.locator('.qf-field', { has: page.getByText('Audience') });
  await audienceQuestion.locator('input.qf-input').fill('Product marketers');

  const submitButton = form.getByRole('button', { name: 'Send answers' });
  await expect(submitButton).toBeEnabled();
  await Promise.all([
    page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
    submitButton.click(),
  ]);

  await expect.poll(() => runBodies.length).toBe(2);
  expect(runBodies[1]?.message).toContain('[form answers — discovery]');
  expect(runBodies[1]?.message).toContain('Audience: Product marketers');
  expect(runBodies[1]?.message).not.toContain('(skipped)');

  const conversationsResponse = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(conversationsResponse.ok()).toBeTruthy();
  const { conversations } = (await conversationsResponse.json()) as {
    conversations: Array<{ id: string }>;
  };
  const conversationId = conversations[0]?.id;
  expect(conversationId).toBeTruthy();
  const messagesResponse = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(messagesResponse.ok()).toBeTruthy();
  const { messages } = (await messagesResponse.json()) as {
    messages: Array<{ role: string; content: string }>;
  };
  expect(
    messages.some(
      (message) =>
        message.role === 'user' &&
        message.content.includes('[form answers — discovery]') &&
        message.content.includes('Audience: Product marketers'),
    ),
  ).toBe(true);
});

test('[P1] project composer working directory replace and clear update linked dirs metadata', async ({ page }) => {
  const workingDir = '/Users/mac/open-design/open-design/e2e';
  const patchBodies: Array<Record<string, unknown>> = [];

  await page.route('**/api/recent-dirs', async (route) => {
    await route.fulfill({ json: { dirs: [] } });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: workingDir } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: true } });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({ json: { config: { recentLinkedDirs: [workingDir] } } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
    }
    await route.continue();
  });

  await createEmptyProject(page, 'Project composer working directory metadata');
  await expectWorkspaceReady(page);

  await page.getByTestId('working-dir-trigger').click();
  await page.getByTestId('working-dir-pick').click();
  await expect(page.getByTestId('working-dir-trigger')).toContainText('e2e');
  await expect
    .poll(() => patchBodies.at(-1)?.metadata)
    .toMatchObject({ linkedDirs: [workingDir] });

  await page.getByTestId('working-dir-trigger').click();
  await page.getByTestId('working-dir-clear').click();
  await expect(page.getByTestId('working-dir-trigger')).toContainText('Select working directory');
  await expect
    .poll(() => patchBodies.at(-1)?.metadata)
    .toMatchObject({ linkedDirs: [] });
});

test('[P1] project composer working directory rejects stale folder without promoting it to recents', async ({ page }) => {
  const staleDir = '/Users/mac/open-design/open-design/missing-linked-dir';
  const patchBodies: Array<Record<string, unknown>> = [];
  const recentDirPutBodies: Array<Record<string, unknown>> = [];

  await page.route('**/api/recent-dirs', async (route) => {
    await route.fulfill({ json: { dirs: [] } });
  });
  await page.route('**/api/dialog/open-folder', async (route) => {
    await route.fulfill({ json: { path: staleDir } });
  });
  await page.route('**/api/dir-exists', async (route) => {
    await route.fulfill({ json: { exists: false } });
  });
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      if (JSON.stringify(payload).includes(staleDir)) {
        recentDirPutBodies.push(payload);
      }
      await route.fulfill({ json: { config: { recentLinkedDirs: [staleDir] } } });
      return;
    }
    await route.fallback();
  });
  await page.route('**/api/projects/*', async (route) => {
    if (route.request().method() === 'PATCH') {
      patchBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'INVALID_LINKED_DIR',
            message: 'The linked directory no longer exists.',
          },
        }),
      });
      return;
    }
    await route.continue();
  });

  await createEmptyProject(page, 'Project composer stale working directory');
  await expectWorkspaceReady(page);

  await page.getByTestId('working-dir-trigger').click();
  await page.getByTestId('working-dir-pick').click();

  await expect(page.getByTestId('working-dir-trigger')).toContainText('Select working directory');
  await expect(page.getByText("Couldn't set the working directory")).toBeVisible();
  await expect
    .poll(() => patchBodies.at(-1)?.metadata)
    .toMatchObject({ linkedDirs: [staleDir] });
  expect(recentDirPutBodies).toHaveLength(0);
});

async function routeMockAgents(page: Page) {
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
}

async function routeAppConfig(page: Page, override: Record<string, unknown>) {
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
          ...override,
        },
      },
    });
  });
}

async function routeRuntimeSkills(page: Page) {
  await page.route('**/api/skills', async (route) => {
    await route.fulfill({
      json: {
        skills: [
          runtimeSkill('enabled-runtime-skill', 'Enabled Runtime Skill'),
          runtimeSkill('disabled-runtime-skill', 'Disabled Runtime Skill'),
        ],
      },
    });
  });
}

function runtimeSkill(id: string, name: string) {
  return {
    id,
    name,
    description: `${name} fixture`,
    triggers: [],
    mode: 'prototype',
    surface: 'web',
    platform: 'desktop',
    scenario: 'qa',
    previewType: 'html',
    designSystemRequired: true,
    defaultFor: [],
    upstream: null,
    featured: null,
    fidelity: null,
    speakerNotes: null,
    animations: null,
    hasBody: true,
    examplePrompt: '',
    source: 'builtin',
    category: 'Runtime',
  };
}

async function createEmptyProject(page: Page, name: string): Promise<string> {
  await gotoEntryHome(page);
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-live-artifact').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await expect(page).toHaveURL(/\/projects\//, { timeout: T.long });
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) throw new Error(`unexpected project route: ${current.pathname}`);
  return projectId;
}

async function seedHtmlArtifact(
  page: Page,
  projectId: string,
  fileName: string,
  content: string,
) {
  const resp = await page.request.post(`/api/projects/${projectId}/files`, {
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
  });
  expect(resp.ok()).toBeTruthy();
}

async function openDesignFile(page: Page, fileName: string) {
  await page.getByRole('button', { name: new RegExp(fileName.replace('.', '\\.')) }).click();
  await clickDesignFilePreviewOpen(page);
}

async function clickDesignFilePreviewOpen(page: Page) {
  const preview = page.getByTestId('design-file-preview');
  await expect(preview).toBeVisible();
  await expect(async () => {
    const openButton = preview.getByRole('button', { name: /^Open$/ });
    await expect(openButton).toBeVisible({ timeout: 1_000 });
    await openButton.click({ timeout: 1_000 });
  }).toPass({ timeout: T.medium });
}

async function expectFileSource(
  page: Page,
  projectId: string,
  fileName: string,
  snippets: string[],
) {
  await expect
    .poll(async () => {
      const resp = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
      if (!resp.ok()) return false;
      const source = await resp.text();
      return snippets.every((snippet) => source.includes(snippet));
    })
    .toBe(true);
}

function manualEditHtml(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Manual Edit</title></head>
  <body>
    <main>
      <section data-od-id="hero" data-od-label="Hero section">
        <h1 data-od-id="hero-title" data-od-label="Hero title">Original Hero</h1>
        <a data-od-id="cta" data-od-label="Primary CTA" href="/start">Start now</a>
        <img data-od-id="hero-image" data-od-label="Hero image" src="/hero.png" alt="Hero" style="width:64px;height:64px;">
      </section>
    </main>
  </body>
</html>`;
}

function deckHtml(): string {
  return `<!doctype html>
<html>
  <body>
    <section class="slide" data-od-id="slide-1"><h1>Slide One</h1></section>
    <section class="slide" data-od-id="slide-2" hidden><h1>Slide Two</h1></section>
    <script>
      let active = 0;
      const slides = Array.from(document.querySelectorAll('.slide'));
      function render() { slides.forEach((slide, index) => { slide.hidden = index !== active; }); }
      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'od:slide') return;
        if (event.data.action === 'next') active = Math.min(slides.length - 1, active + 1);
        if (event.data.action === 'prev') active = Math.max(0, active - 1);
        render();
        window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');
      });
      render();
      window.parent.postMessage({ type: 'od:slide-state', active, count: slides.length }, '*');
    </script>
  </body>
</html>`;
}

async function createProject(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: 3_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt, { timeout: 1500 });
  await expect(sendButton).toBeEnabled({ timeout: 1500 });
  await Promise.all([
    page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
    sendButton.evaluate((button: HTMLButtonElement) => button.click()),
  ]);
}

async function startNewConversation(page: Page) {
  await page.getByTestId('conversation-history-trigger').click();
  await expect(page.getByTestId('conversation-list')).toBeVisible();
  await page.getByTestId('conversation-history-new').click();
  await expect(page.getByTestId('conversation-list')).toHaveCount(0);
}

function tabBySuffix(page: Page, name: string): Locator {
  return page
    .locator('.ws-tab[role="tab"]')
    .filter({ has: page.locator('.ws-tab-label', { hasText: name }) })
    .first();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isCreateRunResponse(resp: Response): boolean {
  const url = new URL(resp.url());
  return url.pathname === '/api/runs' && resp.request().method() === 'POST';
}

function isCreateRunRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/runs' && request.method() === 'POST';
}

async function runDesignSystemSelectionFlow(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);
  await page.getByTestId('design-system-trigger').click();
  await expect(page.getByTestId('design-system-search')).toBeVisible();
  await page.getByTestId('design-system-search').fill('Nexu');
  await page.getByRole('option', { name: /Nexu Soft Tech/i }).click();
  await expect(page.getByTestId('design-system-trigger')).toContainText('Nexu Soft Tech');
  await page.getByTestId('create-project').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('project-meta')).toContainText('Nexu Soft Tech');
  await expect(page.getByTestId('chat-composer')).toBeVisible();
}

async function runExampleUsePromptFlow(
  page: Page,
  entry: UiScenario,
) {
  await page.getByTestId('entry-tab-examples').click();
  await expect(page.getByTestId('example-card-warm-utility-example')).toBeVisible();
  await page.getByTestId('example-use-prompt-warm-utility-example').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText(entry.prompt);
  await expect(page.getByTestId('project-title')).toContainText('Warm Utility Example');
  await expect(page.getByTestId('project-meta')).toContainText('Warm Utility Example');
}

async function runGenerationDoesNotCreateExtraFileFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expectArtifactVisible(page, entry);

  const { projectId } = await getCurrentProjectContext(page);
  const initialFiles = await listProjectFilesFromApi(page, projectId);
  expect(initialFiles.map((file) => file.name)).toContain(entry.mockArtifact!.fileName);

  await page.reload();
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  const reloadedFiles = await listProjectFilesFromApi(page, projectId);
  expect(reloadedFiles.map((file) => file.name)).toEqual(initialFiles.map((file) => file.name));
  await expect(page.getByText(entry.mockArtifact!.fileName, { exact: true })).toBeVisible();
}

async function runCommentAttachmentFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expectArtifactVisible(page, entry);

  await page.getByTestId('board-mode-toggle').click();
  await page.getByTestId('comment-mode-toggle').click();
  const frame = artifactPreviewFrame(page);
  await frame.locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Make the headline more specific.');
  await page.getByTestId('comment-popover').getByRole('button', { name: 'Save comment' }).click();

  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();
  await expect(page.getByTestId('staged-comment-attachments')).toHaveCount(0);
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  await page.getByTestId('comment-popover').getByRole('button', { name: 'Close' }).click();

  await frame.locator('[data-od-id="hero-copy"]').hover();
  await expect(page.getByTestId('comment-target-overlay')).toBeVisible();
  await expect(page.getByTestId('comment-target-overlay')).toContainText('hero-copy');

  await page.getByTestId('comment-saved-marker-hero-title').getByRole('button').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await expect(page.getByTestId('comment-popover-input')).toHaveValue('Make the headline more specific.');
  await page.getByTestId('comment-popover').getByRole('button', { name: 'Close' }).click();

  await page.getByRole('tab', { name: 'Comments' }).click();
  await expect(page.getByTestId('comments-panel')).toBeVisible();
  await expect(page.getByTestId('comments-panel').getByRole('heading', { name: 'Saved comments' })).toBeVisible();
  await page.getByTestId('comments-panel')
    .locator('[data-testid="comment-card-hero-title"]')
    .getByRole('button', { name: 'Add' })
    .click();
  await page.getByRole('tab', { name: 'Chat' }).click();
  await expect(page.getByTestId('staged-comment-attachments')).toBeVisible();
  await expect(page.getByTestId('staged-comment-attachments')).toContainText('hero-title');
  await expect(page.getByTestId('staged-comment-attachments')).toContainText('Make the headline more specific.');

  await page.getByRole('tab', { name: 'Comments' }).click();
  await expect(page.getByTestId('comments-panel').getByRole('heading', { name: 'Attached to chat' })).toBeVisible();
  await page.getByTestId('comments-panel')
    .locator('[data-testid="comment-card-hero-title"]')
    .getByRole('button', { name: 'Remove' })
    .click();
  await page.getByRole('tab', { name: 'Chat' }).click();
  await expect(page.getByTestId('staged-comment-attachments')).toHaveCount(0);
  await expect(page.getByTestId('chat-send')).toBeDisabled();

  await page.getByRole('tab', { name: 'Comments' }).click();
  await page.getByTestId('comments-panel')
    .locator('[data-testid="comment-card-hero-title"]')
    .getByRole('button', { name: 'Add' })
    .click();
  await page.getByRole('tab', { name: 'Chat' }).click();
  await expect(page.getByTestId('staged-comment-attachments')).toContainText('hero-title');

  const runRequest = page.waitForRequest(
    isCreateRunRequest,
  );
  await page.getByTestId('chat-send').click();
  const request = await runRequest;
  const body = request.postDataJSON() as {
    message?: string;
    commentAttachments?: Array<{ elementId?: string; comment?: string; filePath?: string }>;
  };

  expect(body.message).toMatch(/\n\n## user\n$/);
  expect(body.message).not.toContain('Apply selected preview comments');
  expect(body.commentAttachments).toEqual([
    expect.objectContaining({
      elementId: 'hero-title',
      comment: 'Make the headline more specific.',
      filePath: 'commentable-artifact.html',
    }),
  ]);
}

async function runDeckPaginationNextPrevCorrectnessFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  await seedDeckArtifact(page, projectId, 'pagination.html', 'Pagination Deck', ['Slide One', 'Slide Two', 'Slide Three']);
  await page.reload();
  await openDesignFile(page, 'pagination.html');

  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText('Slide One')).toBeVisible();
  await clickDeckNextSlide(page);
  await expect(frame.getByText('Slide Two')).toBeVisible();
  await clickDeckNextSlide(page);
  await expect(frame.getByText('Slide Three')).toBeVisible();
  await clickDeckPreviousSlide(page);
  await expect(frame.getByText('Slide Two')).toBeVisible();
}

async function runDeckPaginationPerFileIsolatedFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  await seedDeckArtifact(page, projectId, 'deck-alpha.html', 'Deck Alpha', ['Alpha One', 'Alpha Two']);
  await seedDeckArtifact(page, projectId, 'deck-beta.html', 'Deck Beta', ['Beta One', 'Beta Two']);
  await page.reload();

  await openDesignFile(page, 'deck-alpha.html');
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText('Alpha One')).toBeVisible();
  await clickDeckNextSlide(page);
  await expect(frame.getByText('Alpha Two')).toBeVisible();

  await openAllProjectFiles(page);
  await openDesignFile(page, 'deck-beta.html');
  await expect(frame.getByText('Beta One')).toBeVisible();
  await clickDeckNextSlide(page);
  await expect(frame.getByText('Beta Two')).toBeVisible();

  await page.getByRole('tab', { name: /deck-alpha\.html/i }).click();
  await expect(frame.getByText('Alpha Two')).toBeVisible();
  await page.getByRole('tab', { name: /deck-beta\.html/i }).click();
  await expect(frame.getByText('Beta Two')).toBeVisible();
}

async function runUploadedImageRendersInPreviewFlow(page: Page) {
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

  const image = artifactPreviewFrame(page).getByRole('img', { name: 'Brand logo' });
  await expect(image).toBeVisible();
  await expect
    .poll(async () => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
}

async function runPythonSourcePreviewFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  await seedProjectFile(page, projectId, 'app.py', 'def greet():\n    return "hello from python"\n');
  await page.reload();
  await openDesignFile(page, 'app.py');

  await expect(page.locator('.code-viewer')).toContainText('def greet');
  await expect(page.locator('.code-viewer')).toContainText('hello from python');
}

async function seedDeckArtifact(
  page: Page,
  projectId: string,
  fileName: string,
  title: string,
  slides: string[],
) {
  const slideHtml = slides
    .map((slide, index) => `<section class="slide" data-od-id="slide-${index + 1}"${index === 0 ? '' : ' hidden'}><h1>${slide}</h1></section>`)
    .join('\n');
  await seedProjectFile(
    page,
    projectId,
    fileName,
    `<!doctype html><html><body>${slideHtml}</body></html>`,
    undefined,
    {
      version: 1,
      kind: 'deck',
      title,
      entry: fileName,
      renderer: 'deck-html',
      exports: ['html', 'pdf'],
    },
  );
}

async function seedProjectFile(
  page: Page,
  projectId: string,
  name: string,
  content: string,
  encoding?: 'base64',
  artifactManifest?: Record<string, unknown>,
) {
  const response = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name,
      content,
      ...(encoding ? { encoding } : {}),
      ...(artifactManifest ? { artifactManifest } : {}),
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function createProjectNameOnly(
  page: Page,
  entry: UiScenario,
) {
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
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  await openNewProjectModalFromProjects(page);
}

async function gotoProjectRoute(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
}

async function navigateProjectRouteInApp(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState(null, '', target);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`));
}

async function reloadCurrentRoute(page: Page) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
}

async function createPrototypeProject(page: Page, projectName: string) {
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(uniqueProjectName(projectName));
  await page.getByTestId('create-project').click();
}

function uniqueProjectName(base: string): string {
  return `${base} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function expectProjectsView(page: Page) {
  if (!(await page.locator('.tab-panel-toolbar').isVisible().catch(() => false))) {
    await ensureRailOpen(page);
    await page.getByTestId('entry-nav-projects').click();
  }
  await expect(page.locator('.tab-panel-toolbar')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
}

async function getCurrentProjectContext(
  page: Page,
): Promise<{ projectId: string; conversationId: string }> {
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

async function listProjectFilesFromApi(
  page: Page,
  projectId: string,
): Promise<Array<{ name: string; kind: string }>> {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string; kind: string }> };
  return files;
}

async function listConversationsFromApi(
  page: Page,
  projectId: string,
): Promise<Array<{ id: string; updatedAt: number }>> {
  const response = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  return conversations;
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

async function expectArtifactVisible(
  page: Page,
  entry: UiScenario,
) {
  const artifact = entry.mockArtifact!;
  await expect(page.getByText(artifact.fileName, { exact: true })).toBeVisible();
  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: artifact.heading })).toBeVisible();
}

async function runConversationPersistenceFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expect(page.locator('.msg.user').getByText(entry.prompt, { exact: true })).toBeVisible();
  await expectArtifactVisible(page, entry);

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');

  const nextPrompt = entry.secondaryPrompt!;
  await sendPrompt(page, nextPrompt);
  await expect(page.locator('.msg.user').getByText(nextPrompt, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.locator('.msg.user').getByText(nextPrompt, { exact: true })).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  const historyList = page.getByTestId('conversation-list');
  await expect(historyList).toBeVisible();
  await expect(historyList.locator('.chat-conv-item')).toHaveCount(2);
  await historyList
    .locator('.chat-conv-item')
    .filter({ hasText: entry.prompt })
    .first()
    .locator('[data-testid^="conversation-select-"]')
    .click();

  await expect(page.locator('.msg.user').getByText(entry.prompt, { exact: true })).toBeVisible();
}

async function runFileMentionFlow(
  page: Page,
  entry: UiScenario,
) {
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }

  const resp = await page.request.post(`/api/projects/${projectId}/files`, {
    data: {
      name: 'reference.txt',
      content: 'Reference content for mention flow.\n',
    },
  });
  expect(resp.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByText('reference.txt', { exact: true })).toBeVisible();

  await page.getByTestId('chat-composer-input').click();
  await page.getByTestId('chat-composer-input').pressSequentially('Review @ref');
  await expect(page.getByTestId('mention-popover')).toBeVisible();
  await page.getByTestId('mention-popover').getByRole('button', { name: /reference\.txt/i }).click();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('Review @reference.txt ');
  await expect(stagedAttachmentName(page, 'reference.txt')).toBeVisible();
  await expect(page.getByTestId('chat-send')).toBeEnabled();
}

async function runDeepLinkPreviewFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expectArtifactVisible(page, entry);

  const fileName = entry.mockArtifact!.fileName;
  await expect(page).toHaveURL(new RegExp(`/projects/[^/]+/files/${fileName.replace('.', '\\.')}$`));

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }

  await gotoProjectRoute(page, `/projects/${projectId}`);
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  await gotoProjectRoute(page, `/projects/${projectId}/files/${fileName}`);
  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: entry.mockArtifact!.heading })).toBeVisible();
}

async function runFileUploadSendFlow(
  page: Page,
  entry: UiScenario,
) {
  const uploadResponse = page.waitForResponse(
    (resp: Response) => resp.url().includes('/upload') && resp.request().method() === 'POST',
    { timeout: 5000 },
  );
  await page.getByTestId('chat-file-input').setInputFiles({
    name: 'reference.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Reference content for upload flow.\n', 'utf8'),
  });
  await expect((await uploadResponse).ok()).toBeTruthy();

  await expect(stagedAttachmentName(page, 'reference.txt')).toBeVisible();
  await expect(page.getByText('reference.txt', { exact: true })).toBeVisible();

  await sendPrompt(page, entry.prompt);
  await expect(page.locator('.msg.user').getByText(entry.prompt, { exact: true })).toBeVisible();
  await expect(page.locator('.user-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
}

async function runDesignFilesUploadFlow(
  page: Page,
) {
  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'moodboard.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
  });

  await expect(page.getByRole('tab', { name: /moodboard\.png/i })).toBeVisible();
  await openAllProjectFiles(page);
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
}

async function runDesignFilesDeleteFlow(
  page: Page,
) {
  page.on('dialog', async (dialog: Dialog) => {
    await dialog.accept();
  });

  const pngBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
    'base64',
  );

  // Upload a sibling file first so that, after deleting trash-me.png, there
  // is a fallback tab the buggy code would have navigated to. The fix must
  // keep the user in the Design Files panel instead.
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
  await openAllProjectFiles(page);

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

  // Bug #115: deleting from the Design Files panel must not navigate the
  // user into another tab. The Design Files tab should remain the active
  // view, and the sibling tab should still exist (just not auto-activated).
  await expectAllProjectFilesActive(page);
  await expect(page.getByRole('tab', { name: /keep-me\.png/i })).toBeVisible();
}

async function runDesignFilesTabPersistenceFlow(
  page: Page,
) {
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
  const restoredSecondTab = page.getByRole('tab', { name: /second-tab\.png/i });
  await expect(restoredFirstTab).toBeVisible();
  await expect(restoredSecondTab).toBeVisible();
  await expect(restoredFirstTab).toHaveAttribute('aria-selected', 'true');
  await expect(restoredSecondTab).toHaveAttribute('aria-selected', 'false');
}

async function runConversationDeleteRecoveryFlow(
  page: Page,
  entry: UiScenario,
) {
  page.on('dialog', async (dialog: Dialog) => {
    await dialog.accept();
  });

  await sendPrompt(page, entry.prompt);
  await expect(
    page.locator('.msg.user .user-text').filter({ hasText: entry.prompt }).first(),
  ).toBeVisible();

  await startNewConversation(page);
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveText('');

  const nextPrompt = entry.secondaryPrompt!;
  await sendPrompt(page, nextPrompt);
  await expect(
    page.locator('.msg.user .user-text').filter({ hasText: nextPrompt }).first(),
  ).toBeVisible();

  await page.getByTestId('conversation-history-trigger').click();
  await expect(page.getByTestId('conversation-list')).toBeVisible();

  const activeRow = page
    .getByTestId('conversation-list')
    .locator('.chat-conv-item.active')
    .first();
  await expect(activeRow).toBeVisible();
  await activeRow.getByTestId(/conversation-delete-/).click();

  await expect(
    page.locator('.msg.user .user-text').filter({ hasText: entry.prompt }).first(),
  ).toBeVisible();
  await expect(page.locator('.msg.user .user-text').filter({ hasText: nextPrompt })).toHaveCount(0);

  await page.getByTestId('conversation-history-trigger').click();
  await expect(page.getByTestId('conversation-list').locator('.chat-conv-item')).toHaveCount(1);
}

function homeDesignCard(page: Page, name: string): Locator {
  return page.locator('.design-card', {
    has: page.locator('.design-card-name', { hasText: name }),
  });
}
