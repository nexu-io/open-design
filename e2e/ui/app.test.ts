import { expect, test } from '@playwright/test';
import type { Dialog, Page, Request, Response } from '@playwright/test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { T } from '@/timeouts';
import { automatedUiScenarios } from '@/playwright/resources';
import type { UiScenario } from '@/playwright/resources';

const STORAGE_KEY = 'open-design:config';
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';
const APP_OWNED_SCENARIO_FLOWS = new Set([
  'design-files-upload',
  'design-files-delete',
  'design-files-tab-persistence',
  'uploaded-image-renders-in-preview',
  'python-source-preview',
  'example-use-prompt',
  'comment-attachment-flow',
]);
test.describe.configure({ timeout: 45_000 });

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
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

for (const entry of automatedUiScenarios().filter(
  (scenario) => !APP_OWNED_SCENARIO_FLOWS.has(scenario.flow ?? ''),
)) {
  test(`[${scenarioPriority(entry)}] ${entry.id}: ${entry.title}`, async ({ page }) => {
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

    if (entry.flow === 'hyperframes-project-routing') {
      await page.route('**/api/skills', async (route) => {
        await route.fulfill({
          json: {
            skills: [
              {
                id: 'video-shortform',
                name: 'Video shortform',
                description: 'Shortform video skill',
                mode: 'video',
                surface: 'video',
                previewType: 'video',
                designSystemRequired: false,
                defaultFor: [],
                triggers: [],
                upstream: null,
                hasBody: true,
                examplePrompt: '',
                aggregatesExamples: false,
              },
              {
                id: 'hyperframes',
                name: 'HyperFrames',
                description: 'HTML-in-canvas video',
                mode: 'video',
                surface: 'video',
                previewType: 'video',
                designSystemRequired: false,
                defaultFor: [],
                triggers: [],
                upstream: null,
                hasBody: true,
                examplePrompt: '',
                aggregatesExamples: false,
              },
            ],
          },
        });
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

    if (entry.flow === 'file-mention') {
      await routeMockSuccessfulRun(page, 'file-mention-run');
    }

    await gotoEntryHome(page);

    if (entry.flow === 'example-use-prompt') {
      await runExampleUsePromptFlow(page, entry);
      return;
    }
    if (entry.flow === 'hyperframes-project-routing') {
      await runHyperframesProjectRoutingFlow(page, entry);
      return;
    }
    if (entry.flow === 'image-project-routing') {
      await runImageProjectRoutingFlow(page, entry);
      return;
    }
    if (entry.flow === 'video-project-routing') {
      await runVideoProjectRoutingFlow(page, entry);
      return;
    }
    if (entry.flow === 'audio-project-routing') {
      await runAudioProjectRoutingFlow(page, entry);
      return;
    }
    if (entry.flow === 'live-artifact-project-routing') {
      await runLiveArtifactProjectRoutingFlow(page, entry);
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
    const { projectId } = await getCurrentProjectContext(page);
    await expectScenarioProjectState(page, entry, projectId);
  });
}

test('[P0] comment attachment flow attaches preview comments to the next run as structured context', async ({ page }) => {
  const entry = automatedUiScenarios().find((scenario) => scenario.id === 'comment-attachment-flow');
  if (!entry?.mockArtifact) {
    throw new Error('comment-attachment-flow scenario fixture is missing');
  }

  await routeMockAgents(page);
  await page.route('**/api/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: 'comment-attachment-run' }),
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

  const projectId = await createEmptyProject(page, 'Comment attachment flow');
  await expectWorkspaceReady(page);
  await seedHtmlArtifact(page, projectId, entry.mockArtifact.fileName, entry.mockArtifact.html);
  await page.reload();
  await expectWorkspaceReady(page);
  await page.goto(`/projects/${projectId}/files/${entry.mockArtifact.fileName}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(artifactPreview(page)).toBeVisible();

  await runCommentAttachmentFlow(page, entry);
});

test('[P0] sending preview comments keeps the preview file active and refreshes it with the follow-up artifact', async ({ page }) => {
  const entry = automatedUiScenarios().find((scenario) => scenario.id === 'comment-attachment-flow');
  if (!entry?.mockArtifact) {
    throw new Error('comment-attachment-flow scenario fixture is missing');
  }
  const revisedHtml =
    '<!doctype html><html><body><main data-od-id="hero-section">' +
    '<h1 data-od-id="hero-title" data-screen-label="Hero title">Revised headline</h1>' +
    '<p data-od-id="hero-copy">Preview copy refreshed after comment send.</p>' +
    '</main></body></html>';

  await routeMockAgents(page);

  let requestCount = 0;
  await page.route('**/api/runs', async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ runId: `mock-run-${requestCount}` }),
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    const artifactTitle = requestCount === 1 ? entry.mockArtifact!.title : 'Commentable Artifact Revised';
    const artifactHtml = requestCount === 1 ? entry.mockArtifact!.html : revisedHtml;
    const body = [
      'event: start',
      'data: {"bin":"mock-agent"}',
      '',
      'event: stdout',
      `data: ${JSON.stringify({
        chunk:
          `<artifact identifier="${entry.mockArtifact!.identifier}" type="text/html" title="${artifactTitle}">` +
          artifactHtml +
          '</artifact>',
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

  const projectId = await createEmptyProject(page, 'Comment preview follow-up');
  await expectWorkspaceReady(page);

  await seedHtmlArtifact(page, projectId, entry.mockArtifact.fileName, entry.mockArtifact.html);
  await page.reload();
  await expectWorkspaceReady(page);
  await page.goto(`/projects/${projectId}/files/${entry.mockArtifact.fileName}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(artifactPreview(page)).toBeVisible();

  await page.getByTestId('board-mode-toggle').click();
  await page.getByTestId('comment-panel-toggle').click();
  const frame = artifactPreviewFrame(page);
  await frame.locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Make the headline more specific.');
  await page.getByTestId('comment-popover-save').click();
  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();

  const sidePanel = page.getByTestId('comment-side-panel');
  await expect(sidePanel).toBeVisible();
  await expect(sidePanel.getByTestId('comment-side-item').filter({ hasText: 'Make the headline more specific.' }).first()).toBeVisible();
  await expect
    .poll(async () => {
      const selectAll = sidePanel.getByRole('button', { name: /select all/i }).first();
      if ((await selectAll.count()) === 0) return false;
      await selectAll.evaluate((element: HTMLButtonElement) => element.click());
      return (await page.getByTestId('comment-side-send-claude').count()) > 0;
    })
    .toBe(true);
  await expect(page.getByTestId('comment-side-send-claude')).toBeVisible();

  const runRequest = page.waitForRequest(isCreateRunRequest);
  await page.getByTestId('comment-side-send-claude').click();
  const body = (await runRequest).postDataJSON() as {
    commentAttachments?: Array<{ elementId?: string; comment?: string; filePath?: string }>;
  };
  expect(body.commentAttachments).toEqual([
    expect.objectContaining({
      elementId: 'hero-title',
      comment: 'Make the headline more specific.',
      filePath: 'commentable-artifact.html',
    }),
  ]);

  await ensureHtmlArtifactPreviewable(page, projectId, entry.mockArtifact.fileName, revisedHtml);
  await page.reload();
  await expectWorkspaceReady(page);
  await page.goto(`/projects/${projectId}/files/${entry.mockArtifact.fileName}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/files/${entry.mockArtifact.fileName.replace('.', '\\.')}$`));
  await expectProjectFileToContain(page, projectId, entry.mockArtifact.fileName, 'Revised headline');
  await expectProjectFileToContain(page, projectId, entry.mockArtifact.fileName, 'Preview copy refreshed after comment send.');
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

function scenarioPriority(entry: UiScenario): 'P0' | 'P1' | 'P2' {
  switch (entry.flow) {
    case 'example-use-prompt':
    case 'hyperframes-project-routing':
    case 'image-project-routing':
    case 'video-project-routing':
    case 'audio-project-routing':
    case 'live-artifact-project-routing':
    case 'conversation-persistence':
    case 'file-upload-send':
    case 'conversation-delete-recovery':
    case 'comment-attachment-flow':
      return 'P0';
    case 'deep-link-preview':
    case 'question-form-submit-persistence':
    case 'generation-does-not-create-extra-file':
    case 'file-mention':
    case 'deck-pagination-next-prev-correctness':
    case 'deck-pagination-per-file-isolated':
      return 'P1';
    case 'question-form-selection-limit':
      return 'P2';
    default:
      return 'P1';
  }
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

async function createEmptyProject(page: Page, name: string): Promise<string> {
  await gotoEntryHome(page);
  await openNewProjectModal(page);
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

async function ensureHtmlArtifactPreviewable(
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
  if (resp.ok() || resp.status() === 409) return;
  expect(resp.ok(), `${resp.status()} ${await resp.text()}`).toBeTruthy();
}

async function openDesignFile(page: Page, fileName: string) {
  await page.getByTestId('design-files-tab').click();
  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: fileName,
  });
  await expect(fileRow).toBeVisible();
  const mainButton = fileRow.getByRole('button').first();
  await mainButton.click();
  const openButton = page.getByTestId('design-file-preview').getByRole('button', { name: 'Open' });
  if (await openButton.isVisible().catch(() => false)) {
    await openButton.click();
    return;
  }
  await mainButton.dblclick();
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

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: T.short });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveValue(prompt, { timeout: T.short });
  await expect(sendButton).toBeEnabled({ timeout: T.short });
  await Promise.all([
    page.waitForResponse(isCreateRunResponse, { timeout: 5_000 }),
    sendButton.evaluate((button: HTMLButtonElement) => button.click()),
  ]);
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

async function runHyperframesProjectRoutingFlow(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  const createProjectResponse = page.waitForResponse(isCreateProjectResponse);
  await page.getByTestId('create-project').click();

  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    skillId?: string;
    metadata?: {
      kind?: string;
      videoModel?: string;
    };
  };
  expect(body.skillId).toBe('hyperframes');
  expect(body.metadata?.kind).toBe('video');
  expect(body.metadata?.videoModel).toBe('hyperframes-html');

  const response = await createProjectResponse;
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();

  await expectWorkspaceReady(page);
  await sendPrompt(page, entry.prompt);
  const { projectId } = await getCurrentProjectContext(page);
  await expect(page.getByRole('tab', { name: new RegExp(`${entry.mockArtifact!.fileName.replace('.', '\\.')}$`, 'i') })).toBeVisible();
  await expectProjectFileToContain(page, projectId, entry.mockArtifact!.fileName, entry.mockArtifact!.heading);
  await expectScenarioProjectState(page, entry, projectId);
}

async function runImageProjectRoutingFlow(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  const createProjectResponse = page.waitForResponse(isCreateProjectResponse);
  await page.getByTestId('create-project').click();

  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    metadata?: {
      kind?: string;
    };
  };
  expect(body.metadata?.kind).toBe('image');

  const response = await createProjectResponse;
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();

  await expectWorkspaceReady(page);
  const { projectId } = await getCurrentProjectContext(page);
  await expectScenarioProjectState(page, entry, projectId);
}

async function runVideoProjectRoutingFlow(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  const createProjectResponse = page.waitForResponse(isCreateProjectResponse);
  await page.getByTestId('create-project').click();

  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    metadata?: {
      kind?: string;
      videoModel?: string;
      videoAspect?: string;
      videoLength?: number;
    };
  };
  expect(body.metadata?.kind).toBe('video');
  expect(body.metadata?.videoModel).toBeTruthy();
  expect(body.metadata?.videoAspect).toBe('16:9');
  expect(body.metadata?.videoLength).toBe(5);

  const response = await createProjectResponse;
  expect(response.ok()).toBeTruthy();

  await expectWorkspaceReady(page);
  const { projectId } = await getCurrentProjectContext(page);
  await expectScenarioProjectState(page, entry, projectId);
}

async function runAudioProjectRoutingFlow(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  const createProjectResponse = page.waitForResponse(isCreateProjectResponse);
  await page.getByTestId('create-project').click();

  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    metadata?: {
      kind?: string;
      audioKind?: string;
      audioDuration?: number;
    };
  };
  expect(body.metadata?.kind).toBe('audio');
  expect(body.metadata?.audioKind).toBe('sfx');
  expect(typeof body.metadata?.audioDuration).toBe('number');
  expect((body.metadata?.audioDuration ?? 0)).toBeGreaterThan(0);

  const response = await createProjectResponse;
  expect(response.ok()).toBeTruthy();

  await expectWorkspaceReady(page);
  const { projectId } = await getCurrentProjectContext(page);
  const project = await fetchProjectFromApi(page, projectId);
  await expectScenarioProjectState(page, entry, projectId);
  const metadata = project.metadata as Record<string, unknown> | undefined;
  expect(metadata?.audioDuration).toBe(body.metadata?.audioDuration);
}

async function runLiveArtifactProjectRoutingFlow(
  page: Page,
  entry: UiScenario,
) {
  await createProjectNameOnly(page, entry);

  const createProjectRequest = page.waitForRequest(isCreateProjectRequest);
  const createProjectResponse = page.waitForResponse(isCreateProjectResponse);
  await page.getByTestId('create-project').click();

  const request = await createProjectRequest;
  const body = request.postDataJSON() as {
    metadata?: {
      kind?: string;
      intent?: string;
      fidelity?: string;
    };
  };
  expect(body.metadata?.kind).toBe('prototype');
  expect(body.metadata?.intent).toBe('live-artifact');
  expect(body.metadata?.fidelity).toBe('high-fidelity');

  const response = await createProjectResponse;
  expect(response.ok()).toBeTruthy();

  await expectWorkspaceReady(page);
  const { projectId } = await getCurrentProjectContext(page);
  await expectScenarioProjectState(page, entry, projectId);
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
  const firstRunRequestPromise = page.waitForRequest(isCreateRunRequest);
  await sendPrompt(page, entry.prompt);
  const firstRunBody = (await firstRunRequestPromise).postDataJSON() as Record<string, unknown>;
  expectScenarioRunRequest(firstRunBody, entry);

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
  await expect(page.getByText(entry.mockArtifact!.fileName, { exact: true }).first()).toBeVisible();
  await expectScenarioProjectState(page, entry, projectId);
}

async function runCommentAttachmentFlow(
  page: Page,
  entry: UiScenario,
) {
  await page.getByTestId('board-mode-toggle').click();
  await page.getByTestId('comment-panel-toggle').click();
  const frame = artifactPreviewFrame(page);
  await frame.locator('[data-od-id="hero-title"]').click();
  await expect(page.getByTestId('comment-popover')).toBeVisible();
  await page.getByTestId('comment-popover-input').fill('Make the headline more specific.');
  await page.getByTestId('comment-popover-save').click();

  await expect(page.getByTestId('comment-saved-marker-hero-title')).toBeVisible();
  await expect(page.getByTestId('staged-comment-attachments')).toHaveCount(0);
  await expect(page.getByTestId('comment-popover')).toHaveCount(0);

  const sidePanel = page.getByTestId('comment-side-panel');
  await expect(sidePanel).toBeVisible();
  await expect(sidePanel).toContainText('Make the headline more specific.');
  await expect(sidePanel.getByTestId('comment-side-item').filter({ hasText: 'Make the headline more specific.' }).first()).toBeVisible();
  await expect
    .poll(async () => {
      const selectAll = sidePanel.getByRole('button', { name: /select all/i }).first();
      if ((await selectAll.count()) === 0) return false;
      await selectAll.evaluate((element: HTMLButtonElement) => element.click());
      return (await page.getByTestId('comment-side-send-claude').count()) > 0;
    })
    .toBe(true);
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

  const frame = artifactPreviewFrame(page);
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
  const frame = artifactPreviewFrame(page);
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
  if (entry.create.tab === 'media' && entry.create.mediaSurface) {
    await page.getByTestId(`new-project-media-surface-${entry.create.mediaSurface}`).click();
  }
  if (entry.create.tab === 'media' && entry.create.mediaSurface === 'video' && entry.create.videoModel) {
    await page.getByTestId('model-picker-trigger').click();
    await page.getByTestId(`model-picker-option-${entry.create.videoModel}`).click();
  }
  if (entry.create.tab === 'media' && entry.create.mediaSurface === 'audio' && entry.create.audioKind === 'sfx') {
    await page.getByRole('button', { name: 'SFX' }).click();
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

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.medium });
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

async function listProjectFilesFromApi(
  page: Page,
  projectId: string,
): Promise<Array<{ name: string; kind: string }>> {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string; kind: string }> };
  return files;
}

async function expectScenarioProjectState(
  page: Page,
  entry: UiScenario,
  projectId: string,
) {
  await expectScenarioProjectMetadata(page, entry, projectId);
  await expectScenarioFiles(page, entry, projectId);
  await expectScenarioPreviewText(page, entry);
}

async function expectScenarioProjectMetadata(
  page: Page,
  entry: UiScenario,
  projectId: string,
) {
  if (!entry.expectedProjectMetadata) return;
  const project = await fetchProjectFromApi(page, projectId);
  const metadata = project.metadata as Record<string, unknown> | undefined;
  expect(metadata).toBeDefined();
  expectObjectContaining(metadata ?? {}, entry.expectedProjectMetadata);
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

async function expectScenarioPreviewText(
  page: Page,
  entry: UiScenario,
) {
  if (!entry.expectedPreviewText) return;
  if ((await artifactPreview(page).count()) === 0) return;
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByText(entry.expectedPreviewText, { exact: false })).toBeVisible();
}

function expectScenarioRunRequest(
  requestBody: Record<string, unknown>,
  entry: UiScenario,
) {
  if (!entry.expectedRunRequest) return;
  const normalizedActual = {
    ...requestBody,
    attachments: Array.isArray(requestBody.attachments)
      ? requestBody.attachments
      : [],
  };
  expectObjectContaining(normalizedActual, entry.expectedRunRequest);
}

function expectObjectContaining(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(expected)) {
    const actualValue = actual[key];
    if (Array.isArray(value)) {
      expect(actualValue).toEqual(expect.arrayContaining(value));
      continue;
    }
    if (value && typeof value === 'object') {
      expect(actualValue).toBeTruthy();
      expectObjectContaining(actualValue as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }
    if (typeof value === 'string' && typeof actualValue === 'string') {
      expect(actualValue).toContain(value);
      continue;
    }
    expect(actualValue).toBe(value);
  }
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
  await expect(page.getByRole('tab', { name: new RegExp(`${artifact.fileName.replace('.', '\\.')}$`, 'i') })).toBeVisible();
  if ((await artifactPreview(page).count()) === 0) {
    const turnCard = page.locator('.msg.assistant').filter({ hasText: artifact.fileName }).last();
    if ((await turnCard.count()) > 0) {
      const openButton = turnCard.getByRole('button', { name: 'Open' });
      if ((await openButton.count()) > 0) {
        await openButton.click();
      }
    }
  }
  if ((await artifactPreview(page).count()) === 0) {
    const { projectId } = await getCurrentProjectContext(page);
    await expectProjectFileToContain(page, projectId, artifact.fileName, artifact.heading);
    return;
  }
  await expect(artifactPreview(page)).toBeVisible();
  if (entry.kind === 'deck') {
    await expect(page.getByLabel('Previous slide')).toBeVisible();
    await expect(page.getByLabel('Next slide')).toBeVisible();
    const { projectId } = await getCurrentProjectContext(page);
    await expectProjectFileToContain(page, projectId, artifact.fileName, artifact.heading);
    return;
  }
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: artifact.heading })).toBeVisible();
}

async function runConversationPersistenceFlow(
  page: Page,
  entry: UiScenario,
) {
  await sendPrompt(page, entry.prompt);
  await expect(page.locator('.msg.user').getByText(entry.prompt, { exact: true })).toBeVisible();
  const firstContext = await getCurrentProjectContext(page);
  await expect(page.getByRole('tab', { name: new RegExp(`${entry.mockArtifact!.fileName.replace('.', '\\.')}$`, 'i') })).toBeVisible();
  await expectProjectFileToContain(page, firstContext.projectId, entry.mockArtifact!.fileName, entry.mockArtifact!.heading);
  const firstConversationId = firstContext.conversationId;

  await page.getByTestId('new-conversation').click();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue('');

  const nextPrompt = entry.secondaryPrompt!;
  await sendPrompt(page, nextPrompt);
  await expect(page.locator('.msg.user').getByText(nextPrompt, { exact: true })).toBeVisible();
  const secondContext = await getCurrentProjectContext(page);
  const secondConversationId = secondContext.conversationId;
  expect(secondConversationId).not.toBe(firstConversationId);

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
  await expect(page.locator('.msg.user').getByText(nextPrompt, { exact: true })).toHaveCount(0);
  const { projectId } = await getCurrentProjectContext(page);
  const conversationsResponse = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(conversationsResponse.ok()).toBeTruthy();
  const { conversations } = (await conversationsResponse.json()) as { conversations: Array<{ id: string }> };
  expect(conversations.map((conversation) => conversation.id)).toEqual(
    expect.arrayContaining([firstConversationId, secondConversationId]),
  );
  await expectScenarioProjectState(page, entry, projectId);
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

  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await page.getByTestId('chat-send').click();
  const runBody = (await runRequestPromise).postDataJSON() as Record<string, unknown>;
  expectScenarioRunRequest(runBody, entry);
  await expect(page.locator('.msg.user').filter({ hasText: 'Review @reference.txt' }).first()).toBeVisible();
  await expect(page.locator('.user-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
  await expectScenarioProjectState(page, entry, projectId);
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
  const artifactTab = page.getByRole('tab', { name: new RegExp(`${fileName.replace('.', '\\.')}$`, 'i') });
  await expect(artifactTab).toBeVisible();
  await expect(artifactTab).toHaveAttribute('aria-selected', 'true');
  await expectProjectFileToContain(page, projectId, fileName, entry.mockArtifact!.heading);
  await expectScenarioProjectState(page, entry, projectId);
}

async function runFileUploadSendFlow(
  page: Page,
  entry: UiScenario,
) {
  const { projectId } = await getCurrentProjectContext(page);
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
  await expect(page.locator('.msg.user').getByText(entry.prompt, { exact: true })).toBeVisible();
  await expect(page.locator('.user-attachments').getByText('reference.txt', { exact: true })).toBeVisible();
  await expectScenarioProjectState(page, entry, projectId);
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
