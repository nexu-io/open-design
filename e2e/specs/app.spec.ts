import { expect, test } from '@playwright/test';
import { automatedCases } from '../cases';
import type { UICase } from '../cases/types';

const STORAGE_KEY = 'open-design:config';

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

for (const entry of automatedCases()) {
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
      await page.route('**/api/skills', async (route) => {
        await route.fulfill({
          json: {
            skills: [
              {
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

    await sendPrompt(page, entry.prompt);

    if (entry.mockArtifact) {
      await expectArtifactVisible(page, entry);
    }
  });
}

async function createProject(
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  await createProjectNameOnly(page, entry);
  await page.getByTestId('create-project').click();
}

async function expectWorkspaceReady(page: Parameters<typeof test>[0]['page']) {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await expect(page.getByText('Start a conversation')).toBeVisible();
}

async function sendPrompt(
  page: Parameters<typeof test>[0]['page'],
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
        (resp) => resp.url().includes('/api/runs') && resp.request().method() === 'POST',
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
          (resp) => resp.url().includes('/api/runs') && resp.request().method() === 'POST',
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

async function runDesignSystemSelectionFlow(
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  await page.getByTestId('entry-tab-examples').click();
  await expect(page.getByTestId('example-card-warm-utility-example')).toBeVisible();
  await page.getByTestId('example-use-prompt-warm-utility-example').click();

  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toHaveValue(entry.prompt);
  await expect(page.getByTestId('project-title')).toContainText('Warm Utility Example');
  await expect(page.getByTestId('project-meta')).toContainText('Warm Utility Example');
}

async function runQuestionFormSelectionLimitFlow(
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
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

async function createProjectNameOnly(
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  await expect(page.getByTestId('new-project-panel')).toBeVisible();
  if (entry.create.tab) {
    await page.getByTestId(`new-project-tab-${entry.create.tab}`).click();
  }
  await page.getByTestId('new-project-name').fill(entry.create.projectName);
}

async function getCurrentProjectContext(
  page: Parameters<typeof test>[0]['page'],
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
  page: Parameters<typeof test>[0]['page'],
  projectId: string,
): Promise<Array<{ name: string; kind: string }>> {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string; kind: string }> };
  return files;
}

async function expectArtifactVisible(
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  const artifact = entry.mockArtifact!;
  await expect(page.getByText(artifact.fileName, { exact: true })).toBeVisible();
  await expect(page.getByTestId('artifact-preview-frame')).toBeVisible();
  const frame = page.frameLocator('[data-testid="artifact-preview-frame"]');
  await expect(frame.getByRole('heading', { name: artifact.heading })).toBeVisible();
}

async function runConversationPersistenceFlow(
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  await sendPrompt(page, entry.prompt);
  await expect(page.getByText(entry.prompt, { exact: true })).toBeVisible();
  await expectArtifactVisible(page, entry);

  await page.getByTestId('new-conversation').click();
  await expect(page.getByText('Start a conversation')).toBeVisible();

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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  const uploadResponse = page.waitForResponse(
    (resp) => resp.url().includes('/upload') && resp.request().method() === 'POST',
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

async function runDesignFilesUploadFlow(
  page: Parameters<typeof test>[0]['page'],
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
  await page.getByTestId('design-files-tab').click();
  const fileRow = page.locator('[data-testid^="design-file-row-"]', {
    hasText: 'moodboard.png',
  });
  await expect(fileRow).toBeVisible();
  await fileRow.click();
  const preview = page.getByTestId('design-file-preview');
  await expect(preview).toBeVisible();
  await expect(preview.getByText(/moodboard\.png/i)).toBeVisible();

  await fileRow.dblclick();
  await expect(page.getByRole('tab', { name: /moodboard\.png/i })).toBeVisible();
}

async function runDesignFilesDeleteFlow(
  page: Parameters<typeof test>[0]['page'],
) {
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.getByTestId('design-files-upload-input').setInputFiles({
    name: 'trash-me.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5W6McAAAAASUVORK5CYII=',
      'base64',
    ),
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
}

async function runDesignFilesTabPersistenceFlow(
  page: Parameters<typeof test>[0]['page'],
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
  page: Parameters<typeof test>[0]['page'],
  entry: UICase,
) {
  page.on('dialog', async (dialog) => {
    await dialog.accept();
  });

  await sendPrompt(page, entry.prompt);
  await expect(
    page.locator('.msg.user .user-text').filter({ hasText: entry.prompt }).first(),
  ).toBeVisible();

  await page.getByTestId('new-conversation').click();
  await expect(page.getByText('Start a conversation')).toBeVisible();

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
