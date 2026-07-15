import { expect, test } from '@/playwright/suite';
import { openNewProjectModal } from '@/playwright/rail';
import type { Page, Route } from '@playwright/test';
import { openSettingsDialog } from '../lib/playwright/amr.js';

const STORAGE_KEY = 'open-design:config';

function baseConfig(): Record<string, unknown> {
  return {
    mode: 'daemon',
    apiKey: '',
    apiProtocol: 'anthropic',
    apiVersion: '',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
    apiProviderBaseUrl: 'https://api.anthropic.com',
    agentId: 'codex',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    mediaProviders: {},
    agentModels: {},
    agentCliEnv: {},
  };
}

async function seedSettingsBase(page: Page, override?: Record<string, unknown>) {
  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: STORAGE_KEY, value: { ...baseConfig(), ...override } });
}

async function routeBootstrapApis(
  page: Page,
  options?: {
    mediaConfigGet?: (route: Route) => Promise<void>;
    mediaConfigPut?: (route: Route) => Promise<void>;
    projectCreate?: (route: Route) => Promise<void>;
    runProject?: {
      id: string;
      conversationId: string;
      name: string;
      metadata: Record<string, unknown>;
      runBodies: Array<Record<string, unknown>>;
    };
  },
) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    if (path === '/api/health') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/agents') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          agents: [
            {
              id: 'codex',
              name: 'Codex CLI',
              bin: 'codex',
              available: true,
              version: '0.130.0',
              models: [{ id: 'default', label: 'Default' }],
            },
          ],
        }),
      });
      return;
    }
    if (path === '/api/editors') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"editors":[]}' });
      return;
    }
    if (path === '/api/app-config') {
      if (method === 'GET') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/connectors/composio/config') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"configured":false,"apiKeyTail":""}' });
      return;
    }
    if (path === '/api/media/config' && method === 'GET') {
      if (options?.mediaConfigGet) {
        await options.mediaConfigGet(route);
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"providers":{}}' });
      return;
    }
    if (path === '/api/media/config' && method === 'PUT') {
      if (options?.mediaConfigPut) {
        await options.mediaConfigPut(route);
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      return;
    }
    if (path === '/api/skills') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"skills":[]}' });
      return;
    }
    if (path === '/api/design-systems') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"designSystems":[]}' });
      return;
    }
    if (path === '/api/projects') {
      if (method === 'POST' && options?.projectCreate) {
        await options.projectCreate(route);
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"projects":[]}' });
      return;
    }
    if (path === '/api/templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"templates":[]}' });
      return;
    }
    if (path === '/api/prompt-templates') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"promptTemplates":[]}' });
      return;
    }
    if (options?.runProject && path === `/api/projects/${options.runProject.id}`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          project: {
            id: options.runProject.id,
            name: options.runProject.name,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: options.runProject.metadata,
          },
        }),
      });
      return;
    }
    if (options?.runProject && path === `/api/projects/${options.runProject.id}/conversations`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          conversations: [
            { id: options.runProject.conversationId, title: options.runProject.name, updatedAt: Date.now() },
          ],
        }),
      });
      return;
    }
    if (
      options?.runProject &&
      path === `/api/projects/${options.runProject.id}/conversations/${options.runProject.conversationId}/messages`
    ) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"messages":[]}' });
      return;
    }
    if (options?.runProject && path === `/api/projects/${options.runProject.id}/files`) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"files":[]}' });
      return;
    }
    if (path === '/api/runs') {
      if (method === 'POST' && options?.runProject) {
        options.runProject.runBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 202, contentType: 'application/json', body: '{"runId":"configured-image-run"}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"runs":[]}' });
      return;
    }
    if (/^\/api\/runs\/[^/]+\/events$/.test(path)) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
        body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
      });
      return;
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
}

async function waitForLoadingToClear(page: Page) {
  await expect(page.getByText('Loading Open Design…')).toHaveCount(0, { timeout: 15_000 });
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
  }
}

async function openMediaSettings(page: Page) {
  await gotoEntryHome(page);
  return await openMediaSettingsFromCurrentPage(page);
}

async function openMediaSettingsFromCurrentPage(page: Page) {
  const dialog = await openSettingsDialog(page);
  await dialog.getByRole('button', { name: /^Media providers$/ }).click();
  await expect(dialog.getByRole('heading', { name: 'Media providers' })).toBeVisible();
  return dialog;
}

async function openNewProjectImageModelPicker(page: Page) {
  await openNewProjectModal(page);
  await page.getByTestId('new-project-tab-media').click();
  await page.getByTestId('new-project-media-surface-image').click();
  await page.getByTestId('model-picker-trigger').click();
  return page.locator('.ds-picker-group').filter({ has: page.getByText('OpenAI', { exact: true }) });
}

test.describe('Settings media providers flows', () => {
  test('[P1] autosaves media provider edits and restores them after closing and reopening settings', async ({ page }) => {
    await seedSettingsBase(page);

    const mediaConfigWrites: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      mediaConfigPut: async (route) => {
        mediaConfigWrites.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
      },
    });

    let dialog = await openMediaSettings(page);

    await dialog.getByLabel('FishAudio API key').fill('fish-key');
    await dialog.getByLabel('FishAudio Base URL').fill('https://fish.example.com');

    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.fishaudio?.apiKey === 'fish-key'
          && parsed.mediaProviders?.fishaudio?.baseUrl === 'https://fish.example.com';
      },
      { key: STORAGE_KEY },
    );

    await expect(dialog.getByText('All changes saved')).toBeVisible();
    expect(mediaConfigWrites.length).toBeGreaterThan(0);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    dialog = await openMediaSettingsFromCurrentPage(page);
    await expect(dialog.getByLabel('FishAudio API key')).toHaveValue('fish-key');
    await expect(dialog.getByLabel('FishAudio Base URL')).toHaveValue('https://fish.example.com');
  });

  test('[P1] reloads media provider settings from daemon after an initial load failure', async ({ page }) => {
    await seedSettingsBase(page);

    let daemonMediaStatus: 'error' | 'ok' = 'error';
    await routeBootstrapApis(page, {
      mediaConfigGet: async (route) => {
        if (daemonMediaStatus === 'error') {
          await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"daemon unavailable"}' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            providers: {
              openai: {
                configured: true,
                apiKeyTail: '9876',
                baseUrl: 'https://daemon.example/v1',
              },
            },
          }),
        });
      },
    });

    const dialog = await openMediaSettings(page);

    await expect(
      dialog.getByText('Could not load media provider settings from the local daemon. Using browser-saved settings for now.'),
    ).toBeVisible();

    daemonMediaStatus = 'ok';
    await dialog.getByRole('button', { name: 'Reload from daemon' }).click();

    await expect(dialog.getByText('Reloaded media provider settings from the local daemon.')).toBeVisible();
    await expect(dialog.getByText('Saved · ••••9876')).toBeVisible();
    await expect(dialog.getByLabel('OpenAI Base URL')).toHaveValue('https://daemon.example/v1');
  });

  test('[P1] saved media provider config is consumed by the new-project media picker across pages', async ({ page }) => {
    await seedSettingsBase(page);
    await routeBootstrapApis(page);

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel('OpenAI API key').fill('sk-openai-cross-page');

    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.openai?.apiKey === 'sk-openai-cross-page';
      },
      { key: STORAGE_KEY },
    );
    await expect(dialog.getByText('All changes saved')).toBeVisible();
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    const openaiGroup = await openNewProjectImageModelPicker(page);
    await expect(openaiGroup).toContainText('Configured');
    await expect(openaiGroup).not.toContainText('Integrated');
  });

  test('[P1] configured media provider model is written into image project metadata', async ({ page }) => {
    test.setTimeout(60_000);

    await seedSettingsBase(page);

    const createBodies: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      projectCreate: async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        createBodies.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: 'configured-image-project',
              name: body.name ?? 'Configured image generation',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadata: body.metadata ?? {},
            },
            conversationId: 'configured-image-conversation',
          }),
        });
      },
    });

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel('OpenAI API key').fill('sk-openai-image-project');
    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.openai?.apiKey === 'sk-openai-image-project';
      },
      { key: STORAGE_KEY },
    );
    await dialog.getByRole('button', { name: /Close/i }).click();
    await expect(dialog).toHaveCount(0);

    await openNewProjectModal(page);
    await page.getByTestId('new-project-tab-media').click();
    await page.getByTestId('new-project-media-surface-image').click();
    await page.getByTestId('new-project-name').fill('Configured image generation');

    await page.getByTestId('model-picker-trigger').click();
    const openaiGroup = page.locator('.ds-picker-group').filter({ has: page.getByText('OpenAI', { exact: true }) });
    await expect(openaiGroup).toContainText('Configured');
    await openaiGroup.getByTestId('model-picker-option-gpt-image-2').click();

    await page.getByTestId('create-project').click();
    await expect
      .poll(() => createBodies.length, { timeout: 10_000 })
      .toBe(1);

    expect(createBodies[0]).toMatchObject({
      name: 'Configured image generation',
      metadata: {
        kind: 'image',
        imageModel: 'gpt-image-2',
      },
    });
  });

  test('[P1] configured image media model is carried into the first daemon run without leaking provider keys', async ({ page }) => {
    test.setTimeout(60_000);

    await seedSettingsBase(page);

    const projectId = 'configured-image-run-project';
    const conversationId = 'configured-image-run-conversation';
    const runBodies: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      projectCreate: async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: projectId,
              name: body.name ?? 'Configured image run',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadata: body.metadata ?? {},
            },
            conversationId,
          }),
        });
      },
      runProject: {
        id: projectId,
        conversationId,
        name: 'Configured image run',
        metadata: { kind: 'image', imageModel: 'gpt-image-2' },
        runBodies,
      },
    });

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel('OpenAI API key').fill('sk-openai-run-secret');
    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.openai?.apiKey === 'sk-openai-run-secret';
      },
      { key: STORAGE_KEY },
    );
    await dialog.getByRole('button', { name: /Close/i }).click();
    await expect(dialog).toHaveCount(0);

    await openNewProjectModal(page);
    await page.getByTestId('new-project-tab-media').click();
    await page.getByTestId('new-project-media-surface-image').click();
    await page.getByTestId('new-project-name').fill('Configured image run');
    await page.getByTestId('model-picker-trigger').click();
    const openaiGroup = page.locator('.ds-picker-group').filter({ has: page.getByText('OpenAI', { exact: true }) });
    await openaiGroup.getByTestId('model-picker-option-gpt-image-2').click();
    await page.getByTestId('create-project').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
    await page.getByTestId('chat-composer-input').fill('Generate a launch poster using the configured image provider.');
    await page.getByTestId('chat-send').click();

    await expect.poll(() => runBodies.length, { timeout: 10_000 }).toBe(1);
    expect(runBodies[0]).toMatchObject({
      projectId,
      conversationId,
      mediaExecution: {
        mode: 'enabled',
        allowedSurfaces: ['image'],
        allowedModels: ['gpt-image-2'],
      },
    });
    expect(JSON.stringify(runBodies[0])).not.toContain('sk-openai-run-secret');
  });

  test('[P1] MiniMax image-01 is carried into the first daemon run without leaking provider keys', async ({ page }) => {
    test.setTimeout(60_000);

    await seedSettingsBase(page);

    const projectId = 'configured-minimax-image-run-project';
    const conversationId = 'configured-minimax-image-run-conversation';
    const runBodies: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      projectCreate: async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: projectId,
              name: body.name ?? 'Configured MiniMax image run',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadata: body.metadata ?? {},
            },
            conversationId,
          }),
        });
      },
      runProject: {
        id: projectId,
        conversationId,
        name: 'Configured MiniMax image run',
        metadata: { kind: 'image', imageModel: 'minimax-image-01' },
        runBodies,
      },
    });

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel('MiniMax API key').fill('minimax-image-secret');
    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.minimax?.apiKey === 'minimax-image-secret';
      },
      { key: STORAGE_KEY },
    );
    await dialog.getByRole('button', { name: /Close/i }).click();
    await expect(dialog).toHaveCount(0);

    await openNewProjectModal(page);
    await page.getByTestId('new-project-tab-media').click();
    await page.getByTestId('new-project-media-surface-image').click();
    await page.getByTestId('new-project-name').fill('Configured MiniMax image run');
    await page.getByTestId('model-picker-trigger').click();
    const minimaxGroup = page.locator('.ds-picker-group').filter({ has: page.getByText('MiniMax', { exact: true }) });
    await expect(minimaxGroup).toContainText('Configured');
    await minimaxGroup.getByTestId('model-picker-option-minimax-image-01').click();
    await page.getByTestId('create-project').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
    await page.getByTestId('chat-composer-input').fill('Generate a launch poster using MiniMax image-01.');
    await page.getByTestId('chat-send').click();

    await expect.poll(() => runBodies.length, { timeout: 10_000 }).toBe(1);
    expect(runBodies[0]).toMatchObject({
      projectId,
      conversationId,
      mediaExecution: {
        mode: 'enabled',
        allowedSurfaces: ['image'],
        allowedModels: ['minimax-image-01'],
      },
    });
    expect(JSON.stringify(runBodies[0])).not.toContain('minimax-image-secret');
  });

  test('[P1] configured video media model is carried into the first daemon run without leaking provider keys', async ({ page }) => {
    test.setTimeout(60_000);

    await seedSettingsBase(page);

    const projectId = 'configured-video-run-project';
    const conversationId = 'configured-video-run-conversation';
    const runBodies: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      projectCreate: async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: projectId,
              name: body.name ?? 'Configured video run',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadata: body.metadata ?? {},
            },
            conversationId,
          }),
        });
      },
      runProject: {
        id: projectId,
        conversationId,
        name: 'Configured video run',
        metadata: { kind: 'video', videoModel: 'doubao-seedance-2-0-fast-260128' },
        runBodies,
      },
    });

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel(/Volcengine Ark.*API key/i).fill('volcengine-video-secret');
    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.volcengine?.apiKey === 'volcengine-video-secret';
      },
      { key: STORAGE_KEY },
    );
    await dialog.getByRole('button', { name: /Close/i }).click();
    await expect(dialog).toHaveCount(0);

    await openNewProjectModal(page);
    await page.getByTestId('new-project-tab-media').click();
    await page.getByTestId('new-project-media-surface-video').click();
    await page.getByTestId('new-project-name').fill('Configured video run');
    await page.getByTestId('model-picker-trigger').click();
    const volcengineGroup = page.locator('.ds-picker-group').filter({ has: page.getByText('Volcengine Ark (Doubao)', { exact: true }) });
    await expect(volcengineGroup).toContainText('Configured');
    await volcengineGroup.getByTestId('model-picker-option-doubao-seedance-2-0-fast-260128').click();
    await page.getByTestId('create-project').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
    await page.getByTestId('chat-composer-input').fill('Generate a launch film using the configured video provider.');
    await page.getByTestId('chat-send').click();

    await expect.poll(() => runBodies.length, { timeout: 10_000 }).toBe(1);
    expect(runBodies[0]).toMatchObject({
      projectId,
      conversationId,
      mediaExecution: {
        mode: 'enabled',
        allowedSurfaces: ['video'],
        allowedModels: ['doubao-seedance-2-0-fast-260128'],
      },
    });
    expect(JSON.stringify(runBodies[0])).not.toContain('volcengine-video-secret');
  });

  test('[P1] configured audio media model is carried into the first daemon run without leaking provider keys', async ({ page }) => {
    test.setTimeout(60_000);

    await seedSettingsBase(page);

    const projectId = 'configured-audio-run-project';
    const conversationId = 'configured-audio-run-conversation';
    const runBodies: Array<Record<string, unknown>> = [];
    await routeBootstrapApis(page, {
      projectCreate: async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            project: {
              id: projectId,
              name: body.name ?? 'Configured audio run',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              metadata: body.metadata ?? {},
            },
            conversationId,
          }),
        });
      },
      runProject: {
        id: projectId,
        conversationId,
        name: 'Configured audio run',
        metadata: { kind: 'audio', audioKind: 'speech', audioModel: 'fish-speech-2' },
        runBodies,
      },
    });

    const dialog = await openMediaSettings(page);
    await dialog.getByLabel('FishAudio API key').fill('fish-audio-run-secret');
    await page.waitForFunction(
      ({ key }) => {
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return parsed.mediaProviders?.fishaudio?.apiKey === 'fish-audio-run-secret';
      },
      { key: STORAGE_KEY },
    );
    await dialog.getByRole('button', { name: /Close/i }).click();
    await expect(dialog).toHaveCount(0);

    await openNewProjectModal(page);
    await page.getByTestId('new-project-tab-media').click();
    await page.getByTestId('new-project-media-surface-audio').click();
    await page.getByTestId('new-project-name').fill('Configured audio run');
    await page.getByTestId('model-picker-trigger').click();
    const fishAudioGroup = page.locator('.ds-picker-group').filter({ has: page.getByText('FishAudio', { exact: true }) });
    await expect(fishAudioGroup).toContainText('Configured');
    await fishAudioGroup.getByTestId('model-picker-option-fish-speech-2').click();
    await page.getByTestId('create-project').click();

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
    await page.getByTestId('chat-composer-input').fill('Generate narration using the configured audio provider.');
    await page.getByTestId('chat-send').click();

    await expect.poll(() => runBodies.length, { timeout: 10_000 }).toBe(1);
    expect(runBodies[0]).toMatchObject({
      projectId,
      conversationId,
      mediaExecution: {
        mode: 'enabled',
        allowedSurfaces: ['audio'],
        allowedModels: ['fish-speech-2'],
      },
    });
    expect(JSON.stringify(runBodies[0])).not.toContain('fish-audio-run-secret');
  });
});
