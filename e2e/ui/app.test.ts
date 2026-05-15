import { expect, test } from '@playwright/test';
import type { Dialog, Page, Request, Response } from '@playwright/test';
import { automatedUiScenarios } from '@/playwright/resources';
import type { UiScenario } from '@/playwright/resources';

const STORAGE_KEY = 'open-design:config';
const APP_OWNED_SCENARIO_FLOWS = new Set([
  'design-files-upload',
  'design-files-delete',
  'design-files-tab-persistence',
]);

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

    await page.goto('/');

    if (entry.flow === 'design-system-selection') {
      await runDesignSystemSelectionFlow(page, entry);
      return;
    }
    if (entry.flow === 'example-use-prompt') {
      await runExampleUsePromptFlow(page, entry);
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
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function sendPrompt(
  page: Page,
  prompt: string,
) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.click();
    await input.fill(prompt);
    try {
      await expect(input).toHaveValue(prompt, { timeout: 1500 });
      await expect(sendButton).toBeEnabled({ timeout: 1500 });
      const chatResponse = page.waitForResponse(
        isCreateRunResponse,
        { timeout: 2000 },
      );
      await sendButton.evaluate((button: HTMLButtonElement) => button.click());
      await chatResponse;
      return;
    } catch (error) {
      await input.click();
      await input.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+A`);
      await input.press('Backspace');
      await input.pressSequentially(prompt);
      try {
        await expect(input).toHaveValue(prompt, { timeout: 1500 });
        await expect(sendButton).toBeEnabled({ timeout: 1500 });
        const chatResponse = page.waitForResponse(
          isCreateRunResponse,
          { timeout: 2000 },
        );
        await sendButton.evaluate((button: HTMLButtonElement) => button.click());
        await chatResponse;
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
  await page.getByTestId('entry-tab-templates').click();
  await expect(page.getByTestId('example-card-warm-utility-example')).toBeVisible();
  await page.getByTestId('example-use-prompt-warm-utility-example').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue(entry.prompt);
  await expect(page.getByTestId('project-title')).toContainText('Warm Utility Example');
  await expect(page.getByTestId('project-meta')).toContainText('Warm Utility Example');
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
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  if (entry.create.tab) {
    await page.getByTestId(`new-project-tab-${entry.create.tab}`).click();
  }
  await page.getByTestId('new-project-name').fill(entry.create.projectName);
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
  await expect(page).toHaveURL(new RegExp(`/projects/[^/]+/files/${fileName.replace('.', '\\.')}$`));

  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }

  await page.goto(`/projects/${projectId}`);
  await expect(page.getByTestId('file-workspace')).toBeVisible();

  await page.goto(`/projects/${projectId}/files/${fileName}`);
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
