import { expect, test } from '@playwright/test';
import type { Dialog, Page, Request, Response } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { automatedUiScenarios } from '@/playwright/resources';
import type { UiScenario } from '@/playwright/resources';

const STORAGE_KEY = 'open-design:config';
const APP_OWNED_SCENARIO_FLOWS = new Set([
  'design-files-upload',
  'design-files-delete',
  'design-files-tab-persistence',
  'example-use-prompt',
]);
const QUERY_PLUGIN_MANIFEST = {
  $schema: 'https://open-design.ai/schemas/plugin.v1.json',
  name: 'query-plugin',
  title: 'Query Plugin',
  version: '1.0.0',
  description: 'E2E fixture for import, apply, and query rendering.',
  license: 'MIT',
  tags: ['e2e', 'query'],
  od: {
    kind: 'skill',
    taskKind: 'new-generation',
    useCase: {
      query: 'Generate a {{topic}} brief for {{audience}}.',
    },
    inputs: [
      {
        name: 'topic',
        type: 'string',
        required: true,
        default: 'release QA',
        label: 'Topic',
      },
      {
        name: 'audience',
        type: 'string',
        required: false,
        default: 'general',
        label: 'Audience',
      },
    ],
    capabilities: ['prompt:inject'],
  },
};
const QUERY_PLUGIN_SKILL = [
  '---',
  'name: query-plugin',
  'description: E2E fixture for plugin import and query rendering.',
  'od:',
  '  kind: skill',
  '  taskKind: new-generation',
  '---',
  '',
  '# Query Plugin',
  '',
  'Use this fixture to verify that a user-installed plugin can render a starter query and bind that query to a project run.',
].join('\n');

test.describe.configure({ timeout: 45_000 });

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

for (const entry of automatedUiScenarios().filter(
  (scenario) => !APP_OWNED_SCENARIO_FLOWS.has(scenario.flow ?? ''),
)) {
  test(`${entry.id}: ${entry.title}`, async ({ page }) => {
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

    if (entry.flow === 'design-system-selection') {
      await page.route('**/api/design-systems', async (route) => {
        await route.fulfill({
          json: {
            designSystems: [
              {
                id: 'nexu-soft-tech',
                title: 'Nexu Soft Tech',
                category: 'Product',
                summary: 'Warm utility system for product interfaces.',
                swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
              },
            ],
          },
        });
      });
    }

    if (entry.flow === 'example-use-prompt') {
      const exampleSummary = {
        id: 'warm-utility-example',
        name: 'Warm Utility Example',
        description: 'A warm utility prototype example.',
        triggers: [],
        mode: 'prototype',
        platform: 'desktop',
        scenario: 'product',
        previewType: 'html',
        designSystemRequired: false,
        defaultFor: ['prototype'],
        upstream: null,
        featured: 1,
        fidelity: 'high-fidelity',
        speakerNotes: null,
        animations: null,
        hasBody: true,
        examplePrompt: entry.prompt,
      };
      await page.route('**/api/skills', async (route) => {
        await route.fulfill({ json: { skills: [exampleSummary] } });
      });
      // The skills/design-templates split (see specs/current/
      // skills-and-design-templates.md) moved the EntryView Templates
      // tab onto its own daemon registry. The fixture skill above now
      // also has to be served on the design-templates surface so the
      // gallery card the test clicks actually renders.
      await page.route('**/api/design-templates', async (route) => {
        await route.fulfill({ json: { designTemplates: [exampleSummary] } });
      });
    }

    if (entry.mockArtifact) {
      await page.route('**/api/runs', async (route) => {
        await route.fulfill({ status: 202, contentType: 'application/json', body: '{"runId":"mock-run"}' });
      });
      await page.route('**/api/runs/*/events', async (route) => {
        const artifact =
          `<artifact identifier="${entry.mockArtifact!.identifier}" type="text/html" title="${entry.mockArtifact!.title}">` +
          entry.mockArtifact!.html +
          '</artifact>';
        const body = [
          'event: start',
          'data: {"bin":"mock-agent"}',
          '',
          'event: stdout',
          `data: ${JSON.stringify({ chunk: artifact })}`,
          '',
          'event: end',
          'data: {"code":0}',
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
    }

    if (entry.flow === 'question-form-selection-limit') {
      await page.route('**/api/runs', async (route) => {
        await route.fulfill({ status: 202, contentType: 'application/json', body: '{"runId":"mock-run"}' });
      });
      await page.route('**/api/runs/*/events', async (route) => {
        const form = [
          '<question-form id="discovery" title="Quick brief — 30 seconds">',
          JSON.stringify(
            {
              description: "I'll lock these in before building.",
              questions: [
                {
                  id: 'tone',
                  label: 'Visual tone (pick up to two)',
                  type: 'checkbox',
                  maxSelections: 2,
                  options: ['Editorial / magazine', 'Modern minimal', 'Soft / warm'],
                  required: true,
                },
              ],
            },
            null,
            2,
          ),
          '</question-form>',
        ].join('\n');
        const body = [
          'event: start',
          'data: {"bin":"mock-agent"}',
          '',
          'event: stdout',
          `data: ${JSON.stringify({ chunk: form })}`,
          '',
          'event: end',
          'data: {"code":0}',
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
    }

    if (entry.flow === 'question-form-submit-persistence') {
      let requestCount = 0;
      await page.route('**/api/runs', async (route) => {
        await route.fulfill({ status: 202, contentType: 'application/json', body: '{"runId":"mock-run"}' });
      });
      await page.route('**/api/runs/*/events', async (route) => {
        requestCount += 1;
        const chunk =
          requestCount === 1
            ? [
                '<question-form id="discovery" title="Quick brief — 30 seconds">',
                JSON.stringify(
                  {
                    description: "I'll lock these in before building.",
                    questions: [
                      {
                        id: 'tone',
                        label: 'Visual tone (pick up to two)',
                        type: 'checkbox',
                        maxSelections: 2,
                        options: ['Editorial / magazine', 'Modern minimal', 'Soft / warm'],
                        required: true,
                      },
                    ],
                  },
                  null,
                  2,
                ),
                '</question-form>',
              ].join('\n')
            : 'Thanks — I will use these answers for the next draft.';
        const body = [
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
    }

    await gotoEntryHome(page);

    if (entry.flow === 'design-system-selection') {
      await runDesignSystemSelectionFlow(page, entry);
      return;
    }
    if (entry.flow === 'example-use-prompt') {
      await runExampleUsePromptFlow(page, entry);
      return;
    }
    if (entry.flow === 'plugin-create-import') {
      await runPluginCreateImportFlow(page, entry);
      return;
    }
    if (entry.flow === 'home-rail-generation') {
      await runHomeRailGenerationFlow(page, entry);
      return;
    }

    await createProject(page, entry);
    await expectWorkspaceReady(page);

    if (entry.flow === 'conversation-persistence') {
      await runConversationPersistenceFlow(page, entry);
      return;
    }
    if (entry.flow === 'file-mention') {
      await runFileMentionFlow(page, entry);
      return;
    }
    if (entry.flow === 'deep-link-preview') {
      await runDeepLinkPreviewFlow(page, entry);
      return;
    }
    if (entry.flow === 'file-upload-send') {
      await runFileUploadSendFlow(page, entry);
      return;
    }
    if (entry.flow === 'conversation-delete-recovery') {
      await runConversationDeleteRecoveryFlow(page, entry);
      return;
    }
    if (entry.flow === 'question-form-selection-limit') {
      await runQuestionFormSelectionLimitFlow(page, entry);
      return;
    }
    if (entry.flow === 'question-form-submit-persistence') {
      await runQuestionFormSubmitPersistenceFlow(page, entry);
      return;
    }
    if (entry.flow === 'generation-does-not-create-extra-file') {
      await runGenerationDoesNotCreateExtraFileFlow(page, entry);
      return;
    }
    if (entry.flow === 'comment-attachment-flow') {
      await runCommentAttachmentFlow(page, entry);
      return;
    }
    if (entry.flow === 'deck-pagination-next-prev-correctness') {
      await runDeckPaginationNextPrevCorrectnessFlow(page);
      return;
    }
    if (entry.flow === 'deck-pagination-per-file-isolated') {
      await runDeckPaginationPerFileIsolatedFlow(page);
      return;
    }
    await sendPrompt(page, entry.prompt);

    if (entry.mockArtifact) {
      await expectArtifactVisible(page, entry);
    }
  });
}

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

async function routeMockSuccessfulRun(page: Page, runId: string) {
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      'data: {"chunk":"Plugin flow completed."}',
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
}

async function createQueryPluginFixture(): Promise<string> {
  const folder = await mkdtemp(path.join(tmpdir(), 'od-query-plugin-'));
  await writeFile(
    path.join(folder, 'open-design.json'),
    `${JSON.stringify(QUERY_PLUGIN_MANIFEST, null, 2)}\n`,
    'utf8',
  );
  await writeFile(path.join(folder, 'SKILL.md'), `${QUERY_PLUGIN_SKILL}\n`, 'utf8');
  return folder;
}

async function createEmptyProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await expect(page).toHaveURL(/\/projects\//);
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
  await page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' }).click();
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

async function expectProjectShellReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function sendPrompt(
  page: Page,
  prompt: string,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const input = page.getByTestId('chat-composer-input');
    const sendButton = page.getByTestId('chat-send');
    await expect(input).toBeVisible({ timeout: 3_000 });
    await input.click();
    await input.fill(prompt);
    try {
      await expect(input).toHaveValue(prompt, { timeout: 1500 });
      await expect(sendButton).toBeEnabled({ timeout: 1500 });
      await Promise.all([
        page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
        sendButton.evaluate((button: HTMLButtonElement) => button.click()),
      ]);
      return;
    } catch (error) {
      const retryInput = page.getByTestId('chat-composer-input');
      const retrySendButton = page.getByTestId('chat-send');
      await expect(retryInput).toBeVisible({ timeout: 3_000 });
      await retryInput.click();
      await retryInput.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
      await retryInput.press('Backspace');
      await retryInput.pressSequentially(prompt);
      try {
        await expect(retryInput).toHaveValue(prompt, { timeout: 1500 });
        await expect(retrySendButton).toBeEnabled({ timeout: 1500 });
        await Promise.all([
          page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
          retrySendButton.evaluate((button: HTMLButtonElement) => button.click()),
        ]);
        return;
      } catch (retryError) {
        if (attempt === 2) throw retryError;
      }
    }
  }
}

function isCreateRunResponse(resp: Response): boolean {
  const url = new URL(resp.url());
  return url.pathname === '/api/runs' && resp.request().method() === 'POST';
}

function isCreateProjectResponse(resp: Response): boolean {
  const url = new URL(resp.url());
  return url.pathname === '/api/projects' && resp.request().method() === 'POST';
}

function isCreateRunRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/runs' && request.method() === 'POST';
}

function isCreateProjectRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/projects' && request.method() === 'POST';
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
  const exampleCard = page.getByTestId('example-card-warm-utility-example');
  if ((await exampleCard.count()) === 0) {
    const examplesTab = page.getByTestId('entry-tab-examples');
    if ((await examplesTab.count()) > 0) {
      await examplesTab.click();
    }
  }
  await expect(exampleCard).toBeVisible();
  await page.getByTestId('example-use-prompt-warm-utility-example').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue(entry.prompt);
  await expect(page.getByTestId('project-title')).toContainText('Warm Utility Example');
  await expect(page.getByTestId('project-meta')).toContainText('Warm Utility Example');
}

async function runHomeRailGenerationFlow(
  page: Page,
  entry: UiScenario,
) {
  const chipId = entry.create.railChip;
  const expectedProjectKind = entry.create.expectedProjectKind;
  const expectedPluginId = entry.create.expectedPluginId;
  const artifact = entry.mockArtifact;
  if (!chipId || !expectedProjectKind || !expectedPluginId || !artifact) {
    throw new Error(`home rail scenario ${entry.id} is missing required test data`);
  }

  await expect(page.getByTestId('home-hero-rail')).toBeVisible();
  const chip = page.getByTestId(`home-hero-rail-${chipId}`);
  await expect(chip).toBeVisible();
  await expect(chip).toBeEnabled();
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
  await expect(page.getByTestId('home-hero-active-plugin')).toBeVisible();

  const input = page.getByTestId('home-hero-input');
  await input.fill(entry.prompt);
  await expect(input).toHaveValue(entry.prompt);
  await expect(page.getByTestId('home-hero-submit')).toBeEnabled();

  const createProjectResponse = page.waitForResponse(isCreateProjectResponse);
  const runRequest = page.waitForRequest(isCreateRunRequest);
  const runResponse = page.waitForResponse(isCreateRunResponse);
  await page.getByTestId('home-hero-submit').click();

  const createResponse = await createProjectResponse;
  expect(createResponse.ok()).toBeTruthy();
  const createBody = (await createResponse.json()) as {
    project: { id: string };
    appliedPluginSnapshotId?: string;
  };
  expect(createBody.appliedPluginSnapshotId).toBeTruthy();

  await expectProjectShellReady(page);

  const request = await runRequest;
  const runBody = request.postDataJSON() as {
    projectId?: string;
    message?: string;
  };
  expect(runBody.projectId).toBe(createBody.project.id);
  expect(runBody.message).toContain(entry.prompt);

  const response = await runResponse;
  expect(response.ok()).toBeTruthy();

  await expectArtifactVisible(page, entry);

  const { projectId } = await getCurrentProjectContext(page);
  expect(projectId).toBe(createBody.project.id);

  const project = await fetchProjectFromApi(page, projectId);
  expect(project.metadata?.kind).toBe(expectedProjectKind);
  expect(project.appliedPluginSnapshotId).toBe(createBody.appliedPluginSnapshotId);

  const snapshot = await fetchAppliedPluginSnapshotFromApi(
    page,
    project.appliedPluginSnapshotId!,
  );
  expect(snapshot.pluginId).toBe(expectedPluginId);

  await expect(page.getByTestId('msg-plugin-chip')).toBeVisible();
  await expect(page.getByTestId('msg-plugin-chip')).toContainText(snapshot.pluginTitle);
  await expectProjectFileToContain(page, projectId, artifact.fileName, artifact.heading);

  await page.reload();
  await expectProjectShellReady(page);
  await expectProjectFileToContain(page, projectId, artifact.fileName, artifact.heading);
  await expect(page.getByText(artifact.fileName, { exact: true })).toBeVisible();
}

async function runPluginCreateImportFlow(
  page: Page,
  entry: UiScenario,
) {
  await routeMockSuccessfulRun(page, 'plugin-create-import-run');

  await page.getByTestId('entry-nav-plugins').click();
  await expect(page.getByTestId('plugins-create-button')).toBeVisible();

  await page.getByTestId('plugins-create-button').click();
  const homeInput = page.getByTestId('home-hero-input');
  await expect(homeInput).toHaveValue(/Create an Open Design plugin/);
  await expect(page.getByTestId('home-hero-active-plugin')).toContainText('Create plugin');

  await page.getByTestId('entry-nav-plugins').click();
  await expect(page.getByTestId('plugins-import-button')).toBeVisible();
  await page.getByTestId('plugins-import-button').click();

  const dialog = page.getByRole('dialog', { name: 'Import a plugin' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /From GitHub/i })).toBeVisible();

  const queryPluginFixture = await createQueryPluginFixture();
  try {
    await dialog.getByLabel('GitHub, archive, or marketplace source').fill(queryPluginFixture);
    const installResponse = page.waitForResponse(
      (resp) =>
        new URL(resp.url()).pathname === '/api/plugins/install' &&
        resp.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    expect((await installResponse).ok()).toBeTruthy();

    await expect(page.getByText('Installed Query Plugin.')).toBeVisible();
    await expect(page.getByTestId('plugins-tab-installed')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-plugin-id="query-plugin"]')).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('home-hero')).toBeVisible();
    await homeInput.click();
    await homeInput.fill('@query');
    const picker = page.getByTestId('home-hero-plugin-picker');
    await expect(picker).toBeVisible();
    const queryOption = picker.getByRole('option', { name: /Query Plugin/ });
    await expect(queryOption).toBeEnabled();
    await queryOption.click();

    await expect(page.getByRole('button', { name: '@Query Plugin' }).first()).toBeVisible();
    await expect(homeInput).toHaveValue(/@Query Plugin/);
    await homeInput.fill(entry.prompt);
    await expect(page.getByTestId('home-hero-submit')).toBeEnabled();

    const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
    const runRequestPromise = page.waitForRequest(isCreateRunRequest);
    await page.getByTestId('home-hero-submit').click();

    const projectRequest = await projectRequestPromise;
    const projectBody = projectRequest.postDataJSON() as {
      pluginId?: string;
      pendingPrompt?: string;
      metadata?: { kind?: string };
    };
    expect(projectBody.pendingPrompt).toBe(entry.prompt);
    expect(projectBody.metadata?.kind).toBe('other');

    await expect(page).toHaveURL(/\/projects\//);

    const runRequest = await runRequestPromise;
    const runBody = runRequest.postDataJSON() as { message?: string };
    expect(runBody.message).toContain(entry.prompt);
    await expect(page.locator('.msg.user .user-text').filter({ hasText: entry.prompt }).first()).toBeVisible();
  } finally {
    await rm(queryPluginFixture, { recursive: true, force: true });
  }
}

async function runQuestionFormSelectionLimitFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);

  const toneQuestion = page.locator('.qf-field', {
    has: page.getByText('Visual tone (pick up to two)'),
  });
  await expect(toneQuestion).toBeVisible();

  const editorialChip = toneQuestion.locator('label.qf-chip', {
    has: page.getByText('Editorial / magazine'),
  });
  const modernChip = toneQuestion.locator('label.qf-chip', {
    has: page.getByText('Modern minimal'),
  });
  const softChip = toneQuestion.locator('label.qf-chip', {
    has: page.getByText('Soft / warm'),
  });
  const editorial = editorialChip.locator('input[type="checkbox"]');
  const modern = modernChip.locator('input[type="checkbox"]');
  const soft = softChip.locator('input[type="checkbox"]');

  await editorialChip.click();
  await modernChip.click();

  await expect(editorial).toBeChecked();
  await expect(modern).toBeChecked();
  await expect(soft).toBeDisabled();

  const checkedOptions = toneQuestion.locator('input[type="checkbox"]:checked');
  await expect(checkedOptions).toHaveCount(2);
  await expect(soft).not.toBeChecked();
  await expect(checkedOptions).toHaveCount(2);
}

async function runQuestionFormSubmitPersistenceFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);

  const form = page.locator('.question-form').first();
  await expect(form).toBeVisible();

  const toneQuestion = form.locator('.qf-field', {
    has: page.getByText('Visual tone (pick up to two)'),
  });
  await toneQuestion.locator('label.qf-chip', { has: page.getByText('Editorial / magazine') }).click();
  await toneQuestion.locator('label.qf-chip', { has: page.getByText('Modern minimal') }).click();

  await form.getByRole('button', { name: 'Send answers' }).click();

  await expect(page.getByText('[form answers — discovery]', { exact: false })).toBeVisible();
  await expect(form.getByText('answered', { exact: true })).toBeVisible();
  await expect(form.getByText('Answers sent — agent is using these for the rest of the session.')).toBeVisible();

  const { projectId, conversationId } = await getCurrentProjectContext(page);
  const messagesResponse = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(messagesResponse.ok()).toBeTruthy();
  const { messages } = (await messagesResponse.json()) as { messages: Array<{ role: string; content: string }> };
  const formAnswerMessage = messages.find((message) => message.role === 'user' && message.content.includes('[form answers — discovery]'));
  expect(formAnswerMessage).toBeTruthy();

  await page.reload();
  const restoredForm = page.locator('.question-form').first();
  await expect(restoredForm).toBeVisible();
  await expect(restoredForm.getByText('answered', { exact: true })).toBeVisible();
  await expect(restoredForm.locator('input[type="checkbox"]:checked')).toHaveCount(2);
  await expect(restoredForm.getByRole('button', { name: 'Send answers' })).toHaveCount(0);
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
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await frame.locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Make the headline more specific.');
  await page.getByTestId('comment-popover-save').click();

  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();
  await expect(page.getByTestId('staged-comment-attachments')).toHaveCount(0);
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('');
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  await expect(page.getByTestId('comment-popover')).toHaveCount(0);

  await frame.locator('[data-od-id="hero-copy"]').hover();
  await expect(page.getByTestId('comment-target-overlay')).toBeVisible();
  await expect(page.getByTestId('comment-target-overlay')).toContainText('hero-copy');

  await page.getByTestId('comment-saved-marker-hero-title').getByRole('button').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await expect(page.getByTestId('comment-popover-input')).toHaveValue('Make the headline more specific.');
  await page.locator('.comment-popover-close').click();

  const sidePanel = page.getByTestId('comment-side-panel');
  await expect(sidePanel).toBeVisible();
  await expect(sidePanel).toContainText('Make the headline more specific.');
  await sidePanel.getByTestId('comment-side-item').filter({ hasText: 'Make the headline more specific.' })
    .getByRole('button', { name: 'Select' })
    .click();
  await expect(page.getByTestId('comment-side-send-claude')).toBeVisible();

  const runRequest = page.waitForRequest(
    isCreateRunRequest,
  );
  await page.getByTestId('comment-side-send-claude').click();
  const request = await runRequest;
  const body = request.postDataJSON() as {
    message?: string;
    commentAttachments?: Array<{ elementId?: string; comment?: string; filePath?: string }>;
  };

  expect(body.message ?? '').not.toContain('Apply selected preview comments');
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

  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByText('Slide One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Slide Three')).toBeVisible();
  await page.getByLabel('Previous slide').click();
  await expect(frame.getByText('Slide Two')).toBeVisible();
}

async function runDeckPaginationPerFileIsolatedFlow(page: Page) {
  const { projectId } = await getCurrentProjectContext(page);
  await seedDeckArtifact(page, projectId, 'deck-alpha.html', 'Deck Alpha', ['Alpha One', 'Alpha Two']);
  await seedDeckArtifact(page, projectId, 'deck-beta.html', 'Deck Beta', ['Beta One', 'Beta Two']);
  await page.reload();

  await openDesignFile(page, 'deck-alpha.html');
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByText('Alpha One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Alpha Two')).toBeVisible();

  await page.getByTestId('design-files-tab').click();
  await openDesignFile(page, 'deck-beta.html');
  await expect(frame.getByText('Beta One')).toBeVisible();
  await page.getByLabel('Next slide').click();
  await expect(frame.getByText('Beta Two')).toBeVisible();

  await page.getByRole('tab', { name: /deck-alpha\.html/i }).click();
  await expect(frame.getByText('Alpha Two')).toBeVisible();
  await page.getByRole('tab', { name: /deck-beta\.html/i }).click();
  await expect(frame.getByText('Beta Two')).toBeVisible();
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
      exports: ['html', 'pptx'],
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  if (entry.create.tab) {
    await page.getByTestId(`new-project-tab-${entry.create.tab}`).click();
  }
  await page.getByTestId('new-project-name').fill(entry.create.projectName);
}

async function gotoEntryHome(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /not now/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
  await expect(page.getByTestId('home-hero')).toBeVisible();
  await expect(page.getByTestId('home-hero-input')).toBeVisible();
}

async function openNewProjectModal(page: Page) {
  await page.getByTestId('entry-nav-new-project').click();
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  const loading = page.getByText('Loading Open Design…');
  await loading.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
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

async function fetchProjectFromApi(
  page: Page,
  projectId: string,
): Promise<{
  metadata?: { kind?: string };
  appliedPluginSnapshotId?: string;
}> {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const { project } = (await response.json()) as {
    project: {
      metadata?: { kind?: string };
      appliedPluginSnapshotId?: string;
    };
  };
  return project;
}

async function fetchAppliedPluginSnapshotFromApi(
  page: Page,
  snapshotId: string,
): Promise<{ pluginId: string; pluginTitle: string }> {
  const response = await page.request.get(`/api/applied-plugins/${snapshotId}`);
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { pluginId: string; pluginTitle: string };
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

async function expectArtifactVisible(
  page: Page,
  entry: UiScenario,
) {
  const artifact = entry.mockArtifact!;
  await expect(page.getByText(artifact.fileName, { exact: true })).toBeVisible();
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: artifact.heading })).toBeVisible();
}

async function runConversationPersistenceFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expect(page.getByText(entry.prompt, { exact: true })).toBeVisible();
  await expectArtifactVisible(page, entry);

  await page.getByTestId('new-conversation').click();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('');

  const nextPrompt = entry.secondaryPrompt!;
  await sendPrompt(page, nextPrompt);
  await expect(page.getByText(nextPrompt, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByText(nextPrompt, { exact: true })).toBeVisible();

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

  await expect(page.getByText(entry.prompt, { exact: true })).toBeVisible();
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
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('Review @reference.txt ');
  await expect(page.getByTestId('staged-attachments')).toBeVisible();
  await expect(page.getByTestId('staged-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
  await expect(page.getByTestId('chat-send')).toBeEnabled();
}

async function runDeepLinkPreviewFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expectArtifactVisible(page, entry);

  const fileName = entry.mockArtifact!.fileName;
  await expect(page).toHaveURL(
    new RegExp(`/projects/[^/]+(?:/conversations/[^/]+)?/files/${fileName.replace('.', '\\.')}$`),
  );

  const current = new URL(page.url());
  const [, projects, projectId, maybeConversations, conversationId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  await page.goto(`/projects/${projectId}/files/${fileName}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
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

  await expect(page.getByTestId('staged-attachments')).toBeVisible();
  await expect(
    page.getByTestId('staged-attachments').getByText('reference.txt', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('reference.txt', { exact: true })).toBeVisible();

  await sendPrompt(page, entry.prompt);
  await expect(page.getByText(entry.prompt, { exact: true })).toBeVisible();
  await expect(page.locator('.user-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
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

  await page.getByTestId('new-conversation').click();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('');

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
