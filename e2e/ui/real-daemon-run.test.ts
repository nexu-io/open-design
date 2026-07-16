import { expect, test } from '@/playwright/suite';
import { openNewProjectModal as openNewProjectModalFromProjects } from '@/playwright/rail';
import { runErrorCard } from '@/playwright/chat';
import type { Locator, Page, Request, Response } from '@playwright/test';
import {
  createFakeAgentRuntimes,
  FAKE_AGENT_RUNTIME_IDS,
} from '@/playwright/fake-agents';
import type { FakeAgentId } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const ACTIVE_ARTIFACT_PREVIEW_SELECTOR = '[data-testid="artifact-preview-frame"]:visible, [data-testid="artifact-preview-frame-url-load"]:visible, [data-testid="artifact-preview-frame-srcdoc"]:visible, [data-testid="live-artifact-preview-frame"]:visible';
const GENERATED_FILE = 'real-daemon-smoke.html';
const GENERATED_HEADING = 'Real Daemon Smoke';
const EDITED_GENERATED_HEADING = 'Real Daemon Smoke Edited';
const CHUNKED_FILE = 'chunked-daemon-smoke.html';
const CHUNKED_HEADING = 'Chunked Daemon Smoke';
const PLAIN_STREAM_FILE = 'fake-agent-runtime-qwen.html';
const PLAIN_STREAM_HEADING = 'Fake Agent Runtime qwen';
const DELAYED_FILE = 'delayed-daemon-smoke.html';
const DELAYED_HEADING = 'Delayed Daemon Smoke';
const SLOW_RELOAD_FILE = 'slow-reload-daemon-smoke.html';
const SLOW_RELOAD_HEADING = 'Slow Reload Daemon Smoke';
const FOLLOW_UP_FILE = 'follow-up-daemon-smoke.html';
let fakeRuntimes: Awaited<ReturnType<typeof createFakeAgentRuntimes>>;

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes();
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(T.xlong);

  await resetDaemonAppConfig(page);

  await page.addInitScript(({ key, codexEnv }) => {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default', reasoning: 'default' } },
        agentCliEnv: { codex: codexEnv },
      }),
    );
  }, { key: STORAGE_KEY, codexEnv: fakeRuntimes.codex.env });

  await configureFakeAgent(page, 'codex');
});

test.afterEach(async ({ page }) => {
  await resetDaemonAppConfig(page);
});

test('[P0] real daemon run streams, persists, and previews an artifact', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Real daemon run smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);
  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();

  const rawResponse = await page.request.get(`/api/projects/${projectId}/raw/${GENERATED_FILE}`, {
    headers: { Origin: 'null' },
  });
  expect(rawResponse.ok(), await rawResponse.text()).toBeTruthy();
  expect(rawResponse.headers()['access-control-allow-origin']).toBe('*');
  expect(rawResponse.headers()['content-type']).toContain('text/html');
  expect(await rawResponse.text()).toContain(GENERATED_HEADING);

  await expectProjectFileToContain(page, projectId, GENERATED_FILE, GENERATED_HEADING);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(artifactPreview(page)).toBeVisible();
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();
  await expectProjectFileToContain(page, projectId, GENERATED_FILE, GENERATED_HEADING);
});

test('[P0] real daemon run persists an artifact streamed across multiple chunks', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Chunked daemon run smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a chunked deterministic smoke artifact');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [CHUNKED_FILE]);
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: CHUNKED_HEADING })).toBeVisible();

  await expectProjectFileToContain(page, projectId, CHUNKED_FILE, CHUNKED_HEADING);
});

test('[P1] plain stdout daemon runtime persists artifact tags into project files and preview', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Plain stream artifact smoke', 'qwen');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Fake runtime smoke for qwen');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [PLAIN_STREAM_FILE]);
  await expect(artifactPreview(page)).toBeVisible();
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: PLAIN_STREAM_HEADING })).toBeVisible();
  await expectProjectFileToContain(page, projectId, PLAIN_STREAM_FILE, PLAIN_STREAM_HEADING);
});

test('[P0] real daemon run surfaces process/parser errors in chat', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Daemon error smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return an intentional daemon smoke failure');

  await expect(runErrorCard(page)).toContainText('intentional fake codex failure', { timeout: 15_000 });
  await expect(runErrorCard(page)).toContainText('intentional fake codex failure');
});

test('[P0] real daemon run classifies a Claude mid-stream socket drop as a retryable connection error', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Daemon socket-drop smoke', 'claude');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return a daemon socket-drop failure');

  // The raw SDK error ("The socket connection was closed unexpectedly") is
  // classified as AGENT_CONNECTION_DROPPED and the error card shows the
  // localized chat.connectionDropped copy (en locale here) instead of echoing
  // the raw SDK string verbatim.
  await expect(runErrorCard(page)).toContainText('connection to the model service dropped', {
    timeout: 15_000,
  });
});

test('[P0] real daemon run supports a follow-up turn in the same project', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Daemon follow-up smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');
  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);

  await sendPrompt(page, 'Create a follow-up deterministic smoke artifact');
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE, FOLLOW_UP_FILE]);

  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const { files } = (await response.json()) as { files: Array<{ name: string }> };
  expect(files.map((file) => file.name)).toEqual(expect.arrayContaining([GENERATED_FILE, FOLLOW_UP_FILE]));

  await expectProjectFileToContain(page, projectId, FOLLOW_UP_FILE, 'Generated after an earlier daemon turn.');
});

test('[P1] real daemon run treats an in-place artifact edit as produced work', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Daemon artifact edit smoke', 'claude');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');
  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);
  await expectProjectFileToContain(page, projectId, GENERATED_FILE, GENERATED_HEADING);

  await sendPrompt(page, 'Edit the existing deterministic smoke artifact through the managed project alias');

  await expectProjectFileToContain(page, projectId, GENERATED_FILE, EDITED_GENERATED_HEADING);
  const files = await listProjectFiles(page, projectId);
  expect(files.filter((file) => file.name === GENERATED_FILE)).toHaveLength(1);
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: EDITED_GENERATED_HEADING })).toBeVisible();

  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistantMessages = messages.filter((message) => message.role === 'assistant');
      return assistantMessages.map((message) => ({
        runStatus: message.runStatus ?? null,
        producedFiles: message.producedFiles?.map((file) => file.name) ?? [],
        traceObjectFiles: message.traceObjectFiles?.map((file) => file.name) ?? [],
        resultDeliveryState: message.resultDeliveryState ?? null,
      }));
    }, { timeout: 15_000 })
    .toContainEqual({
      runStatus: 'succeeded',
      producedFiles: [],
      traceObjectFiles: [GENERATED_FILE],
      resultDeliveryState: 'delivered',
    });
  await expect(runErrorCard(page)).toHaveCount(0);

  await page.getByTestId('manual-edit-mode-toggle').click();
  const editedHeading = artifactPreviewFrame(page).locator('[data-od-id="smoke-title"]');
  await expect(editedHeading).toBeVisible();
  await editedHeading.click();
  await expect(editedHeading).toHaveAttribute('data-od-edit-selected', 'true');
  const fontSizeInput = page
    .locator('.manual-edit-modal .cc-section')
    .filter({ hasText: 'TYPOGRAPHY' })
    .locator('.cc-row')
    .filter({ hasText: 'Size' })
    .locator('input');
  await fontSizeInput.fill('52');
  await page.locator('.manual-edit-modal').getByRole('button', { name: /^Save$/ }).click({ force: true });
  await expectProjectFileToContain(page, projectId, GENERATED_FILE, 'font-size: 52px');
  await page.getByTestId('manual-edit-mode-toggle').click();

  await page.getByRole('button', { name: 'Versions' }).click();
  const versionsDialog = page.getByRole('dialog', { name: 'Versions' });
  await expect(versionsDialog).toBeVisible();
  await expect(versionsDialog).toContainText('3 versions');
  await expect(versionsDialog.getByRole('option')).toHaveCount(3);
});

test('[P1] Plan mode daemon run creates, opens, and restores an editable markdown plan', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Plan mode markdown smoke');
  await expectWorkspaceReady(page);

  await selectComposerSessionMode(page, 'Plan mode');
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await sendPrompt(page, 'Create a deterministic plan document');
  const runRequest = await runRequestPromise;
  expect((runRequest.postDataJSON() as { sessionMode?: string }).sessionMode).toBe('plan');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, ['plan.md']);
  await expectProjectFileToContain(page, projectId, 'plan.md', '# Deterministic Plan');
  await expect(page.getByTestId('file-workspace').getByRole('tab', { name: /plan\.md/i })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /markdown editor/i })).toHaveValue(/Deterministic Plan/);
  await expect(page.getByLabel(/markdown preview/i)).toContainText('Scope');
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByRole('tab', { name: /plan\.md/i })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: /markdown editor/i })).toHaveValue(/Deterministic Plan/);
  await expect(page.getByLabel(/markdown preview/i)).toContainText('Keep the plan editable');
  await expect(page.getByTestId('chat-composer')).toBeVisible();
});

// Red spec for "Plan 模式生成 HTML 后没有自动打开生成的文件": after the user
// reviews the plan and asks for the final deliverable, the generation turn
// writes the HTML as a project file (Write tool, no inline artifact echo) and
// then touches the plan document again. The viewer must auto-open the
// generated HTML instead of staying on the markdown plan.
test('[P1] Plan mode generation turn auto-opens the generated HTML file', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await createProject(page, 'Plan mode html auto-open smoke', 'claude');
  await expectWorkspaceReady(page);

  await selectComposerSessionMode(page, 'Plan mode');
  await sendPrompt(page, 'Create a deterministic plan document');
  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, ['plan.md']);
  const planTab = page.getByTestId('file-workspace').getByRole('tab', { name: /plan\.md/i });
  await expect(planTab).toHaveAttribute('aria-selected', 'true');

  // Mirror the real Plan-mode interaction: the user reviews and edits the
  // markdown plan in the split editor (autosave on) before asking for the
  // final deliverable.
  const planEditor = page.getByRole('textbox', { name: /markdown editor/i });
  await expect(planEditor).toHaveValue(/Deterministic Plan/);
  await planEditor.click();
  await planEditor.press('End');
  await planEditor.pressSequentially('\n- Reviewed by the user before generation.\n', { delay: 10 });
  await expectProjectFileToContain(page, projectId, 'plan.md', 'Reviewed by the user before generation.');

  await sendPrompt(page, 'Generate the deterministic artifact from the plan document');
  await expectProjectFilesToContain(page, projectId, ['index.html', 'plan.md']);
  const htmlTab = page.getByTestId('file-workspace').getByRole('tab', { name: /index\.html/i });
  await expect(htmlTab).toBeVisible({ timeout: 15_000 });
  await expect(htmlTab).toHaveAttribute('aria-selected', 'true');
});

// Red spec, regeneration loop: Plan mode's core iteration is
// plan → generate → edit the plan → generate AGAIN. On the second generation
// the HTML file already exists, so a pre/post file-name diff sees no "new"
// file — the viewer must still re-focus the regenerated HTML. Uses the codex
// fake runtime (no tool_use events, like most CLI protocols) so the per-write
// auto-open path cannot mask the turn-end selection.
test('[P1] Plan mode regeneration re-opens the existing generated HTML file', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await createProject(page, 'Plan mode html regen smoke');
  await expectWorkspaceReady(page);

  await selectComposerSessionMode(page, 'Plan mode');
  await sendPrompt(page, 'Create a deterministic plan document');
  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, ['plan.md']);
  const workspace = page.getByTestId('file-workspace');
  await expect(workspace.getByRole('tab', { name: /plan\.md/i })).toHaveAttribute('aria-selected', 'true');

  await sendPrompt(page, 'Generate the deterministic artifact from the plan document');
  await expectProjectFilesToContain(page, projectId, ['index.html', 'plan.md']);
  const htmlTab = workspace.getByRole('tab', { name: /index\.html/i });
  await expect(htmlTab).toBeVisible({ timeout: 15_000 });
  await expect(htmlTab).toHaveAttribute('aria-selected', 'true');

  // The user goes back to the plan document to revise it...
  await workspace.getByRole('tab', { name: /plan\.md/i }).click();
  await expect(workspace.getByRole('tab', { name: /plan\.md/i })).toHaveAttribute('aria-selected', 'true');

  // ...and asks for another generation. index.html is rewritten in place —
  // no new file name appears, but the fresh deliverable must take focus.
  await sendPrompt(page, 'Generate the deterministic artifact from the plan document');
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      return messages.filter((m) => m.role === 'assistant' && m.runStatus === 'succeeded').length;
    }, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(3);
  await expect(htmlTab).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
});

test('[P0] real daemon run restores a delayed artifact turn after reload', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Delayed daemon reload smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a delayed deterministic smoke artifact');
  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [DELAYED_FILE], 20_000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);

  await expectProjectFilesToContain(page, projectId, [DELAYED_FILE]);
  await expect(page.getByText('I recovered the delayed reasoning path and will persist the artifact now.')).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: DELAYED_HEADING })).toBeVisible();

  const files = await listProjectFiles(page, projectId);
  expect(files.map((file) => file.name)).toEqual(expect.arrayContaining([DELAYED_FILE]));
  await expectProjectFileToContain(page, projectId, DELAYED_FILE, 'Generated after a delayed daemon turn.');

  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    expectedUserMessages: 1,
    expectedThinking: false,
  });
});

test('[P1] real daemon run reconnects after reload while the run is still active', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await createProject(page, 'Running daemon reload smoke');
  await expectWorkspaceReady(page);

  const runResponse = await sendPrompt(page, 'Create a slow reload deterministic smoke artifact');
  const { runId } = (await runResponse.json()) as { runId: string };
  await expect
    .poll(async () => {
      const status = await page.request.get(`/api/runs/${runId}`);
      if (!status.ok()) return `http-${status.status()}`;
      return ((await status.json()) as { status: string }).status;
    }, { timeout: 10_000 })
    .toBe('running');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);

  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [SLOW_RELOAD_FILE], 40_000);
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: SLOW_RELOAD_HEADING })).toBeVisible();
  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    requireRunId: true,
    expectedThinking: false,
    producedFiles: [SLOW_RELOAD_FILE],
  });
});

// Regression spec for #4607: when the page is reloaded while a real daemon
// run is still active and then reattaches, the artifact write must complete and
// be recorded on the assistant message.  The bug manifests as producedFiles
// being empty even after runStatus reaches succeeded.
test('[P1] artifact persistence survives page reload during an active real daemon run', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto('/');
  await createProject(page, 'Running daemon reload smoke');
  await expectWorkspaceReady(page);

  // Send a prompt that makes the fake agent delay 15 s before emitting the
  // artifact, giving us a reliable window to reload mid-run.
  const runResponse = await sendPrompt(page, 'Create a slow reload deterministic smoke artifact');
  const { runId } = (await runResponse.json()) as { runId: string };

  // Wait until the run is actually in-flight before reloading.
  await expect
    .poll(async () => {
      const status = await page.request.get(`/api/runs/${runId}`);
      if (!status.ok()) return `http-${status.status()}`;
      return ((await status.json()) as { status: string }).status;
    }, { timeout: 10_000 })
    .toBe('running');

  // Capture the conversation identity BEFORE reload so the post-reload poll
  // asserts against the *same* conversation.  Picking by updatedAt after reload
  // would pass even if reattach regressed by switching or recreating the
  // conversation, masking the real failure.
  const { projectId, conversationId } = await currentProjectContext(page);

  // Reload while the run is still active — this is the reattach trigger.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);

  // Criterion 1 + 2: run reaches succeeded and the assistant message is still
  // attached to the original conversation (asserting assistantMessages === 1).
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistant = messages.find((m) => m.role === 'assistant');
      return {
        runStatus: assistant?.runStatus ?? null,
        assistantMessages: messages.filter((m) => m.role === 'assistant').length,
      };
    }, { timeout: 50_000 })
    .toEqual({ runStatus: 'succeeded', assistantMessages: 1 });

  // Criterion 3: the generated file is written to project storage.
  await expectProjectFileToContain(page, projectId, SLOW_RELOAD_FILE, SLOW_RELOAD_HEADING);

  // Criterion 4: producedFiles on the assistant message records the artifact
  // AND the message retains its runId (proves it was reattached in-place,
  // not recreated).  This is the primary regression assertion — the bug
  // leaves producedFiles empty.
  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    requireRunId: true,
    producedFiles: [SLOW_RELOAD_FILE],
    expectedThinking: false,
  });
  // Criterion 4b: the runId must equal the *original* runId captured before
  // reload — requireRunId:true above only proves *some* runId is present, not
  // that the message was reattached in-place rather than recreated with a new id.
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistant = messages.find((m) => m.role === 'assistant');
      return assistant?.runId ?? null;
    }, { timeout: 5_000 })
    .toBe(runId);

  // Criterion 5: the artifact preview restores and renders the artifact heading.
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: SLOW_RELOAD_HEADING })).toBeVisible({ timeout: 15_000 });
});

test('[P1] real daemon run survives reload before the create response reaches the browser', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Delayed daemon create-response reload smoke');
  await expectWorkspaceReady(page);

  await sendPromptAndReloadBeforeCreateResponse(
    page,
    'Create a delayed deterministic smoke artifact',
  );
  await expectWorkspaceReady(page);

  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [DELAYED_FILE], 20_000);
  await expect(page.getByText('I recovered the delayed reasoning path and will persist the artifact now.')).toBeVisible();

  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    requireRunId: true,
    expectedThinking: false,
  });
});

test('[P0] empty daemon output fails cleanly, persists after reload, and does not leave ghost files', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Empty daemon failure smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return an empty daemon smoke response');

  const expectedError = 'Agent completed without producing any output.';
  await expect(page.getByText(expectedError, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await expect(runErrorCard(page)).toContainText(expectedError);

  const { projectId, conversationId } = await currentProjectContext(page);
  await expect.poll(async () => {
    const messages = await listConversationMessages(page, projectId, conversationId);
    return messages.find((message) => message.role === 'assistant')?.runStatus ?? 'missing';
  }, { timeout: 15_000 }).toBe('failed');
  expect(await listProjectFiles(page, projectId)).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(page.getByText(expectedError, { exact: false }).first()).toBeVisible();
  await expect(runErrorCard(page)).toContainText(expectedError);
  expect(await listProjectFiles(page, projectId)).toEqual([]);
});

test('[P1] plain stdout daemon runtime surfaces stderr-only failures without ghost files', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Plain stderr failure smoke', 'qwen');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return a stderr-only daemon smoke failure');

  const expectedError = 'stderr-only daemon smoke failure from fake qwen';
  await expect(runErrorCard(page)).toContainText(expectedError, { timeout: 15_000 });

  const { projectId, conversationId } = await currentProjectContext(page);
  await expect.poll(async () => {
    const messages = await listConversationMessages(page, projectId, conversationId);
    return messages.find((message) => message.role === 'assistant')?.runStatus ?? 'missing';
  }, { timeout: 15_000 }).toBe('failed');
  expect(await listProjectFiles(page, projectId)).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(runErrorCard(page)).toContainText(expectedError);
  expect(await listProjectFiles(page, projectId)).toEqual([]);
});

test('[P0] separate projects keep daemon artifacts isolated across recent-project navigation', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Real daemon isolation alpha');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a deterministic smoke artifact');
  const alpha = await currentProjectContext(page);
  await expectProjectFilesToContain(page, alpha.projectId, [GENERATED_FILE]);

  await page.getByRole('button', { name: /back to projects/i }).click();

  await createProject(page, 'Real daemon isolation beta');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a follow-up deterministic smoke artifact');
  const beta = await currentProjectContext(page);
  await expectProjectFilesToContain(page, beta.projectId, [FOLLOW_UP_FILE]);
  expect(beta.projectId).not.toBe(alpha.projectId);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await openProjectFromProjectsView(page, alpha.projectId);
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByText(GENERATED_FILE, { exact: true })).toBeVisible();
  await expect(page.getByText(FOLLOW_UP_FILE, { exact: true })).toHaveCount(0);
  expect((await listProjectFiles(page, alpha.projectId)).map((file) => file.name)).toEqual([GENERATED_FILE]);

  await page.getByRole('button', { name: /back to projects/i }).click();
  await openProjectFromProjectsView(page, beta.projectId);
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByText(FOLLOW_UP_FILE, { exact: true })).toBeVisible();
  await expect(page.getByText(GENERATED_FILE, { exact: true })).toHaveCount(0);
  expect((await listProjectFiles(page, beta.projectId)).map((file) => file.name)).toEqual([FOLLOW_UP_FILE]);
});

test('[P0] real daemon run previews an artifact from a fake OpenCode runtime', async ({ page }) => {
  await createProject(page, 'Fake OpenCode runtime smoke', 'opencode');
  await expectWorkspaceReady(page);

  const runResponse = await sendPrompt(page, 'Fake runtime smoke for opencode');
  expectCreateRunAgentId(runResponse, 'opencode');

  const fileName = 'fake-agent-runtime-opencode.html';
  const heading = 'Fake Agent Runtime opencode';
  await expect(page.getByTestId('file-workspace').getByText(fileName, { exact: true })).toBeVisible({ timeout: 15_000 });
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: heading })).toBeVisible();

  const { projectId } = currentProject(page);
  await expectProjectFileToContain(page, projectId, fileName, heading);
});

test('[P1] BYOK OpenCode run fails clearly before spawn when provider config is missing', async ({ page }) => {
  await createByokOpenCodeProject(page, 'BYOK OpenCode missing provider smoke');
  await expectWorkspaceReady(page);

  const runResponse = await sendPrompt(page, 'Create a BYOK OpenCode missing provider smoke artifact');
  expectCreateRunAgentId(runResponse, 'byok-opencode');
  const { runId } = (await runResponse.json()) as { runId: string };

  const expectedError = 'BYOK OpenCode requires a provider, API key, and model for this run.';
  await expect(runErrorCard(page)).toContainText(expectedError, { timeout: 15_000 });
  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${runId}`);
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { status?: string; error?: string };
    return { status: body.status ?? null, error: body.error ?? null };
  }, { timeout: 15_000 }).toEqual({ status: 'failed', error: expectedError });

  const { projectId, conversationId } = await currentProjectContext(page);
  await expect.poll(async () => {
    const messages = await listConversationMessages(page, projectId, conversationId);
    return messages.find((message) => message.role === 'assistant')?.runStatus ?? 'missing';
  }, { timeout: 15_000 }).toBe('failed');
  expect(await listProjectFiles(page, projectId)).toEqual([]);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(runErrorCard(page)).toContainText(expectedError);
  expect(await listProjectFiles(page, projectId)).toEqual([]);
});

test('[P1] plugin authoring produces a generated-plugin scaffold with action cards', async ({ page }) => {
  await configureFakeAgent(page, 'codex');
  await installBrowserAgentConfig(page, 'codex');
  await gotoEntryHome(page);
  await setBrowserAgentConfig(page, 'codex');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await setBrowserAgentConfig(page, 'codex');
  await configureFakeAgent(page, 'codex');
  await expectBrowserAgentConfig(page, 'codex');
  await dismissPrivacyDialog(page);

  await page.getByTestId('home-hero-shortcuts-trigger').click();
  await page.getByTestId('home-hero-rail-create-plugin').click();
  await expect(page.getByTestId('home-hero-input')).toHaveText(/Create an Open Design plugin for:/);

  const projectRequestPromise = page.waitForRequest(isCreateProjectRequest);
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await page.getByTestId('home-hero-submit').click();

  const projectRequest = await projectRequestPromise;
  const projectBody = projectRequest.postDataJSON() as {
    pluginId?: string;
    pendingPrompt?: string;
  };
  expect(projectBody.pluginId).toBe('od-plugin-authoring');
  expect(projectBody.pendingPrompt).toContain('produce a folder named generated-plugin');

  const runRequest = await runRequestPromise;
  const runBody = runRequest.postDataJSON() as { message?: string; agentId?: string };
  expect(runBody.agentId).toBe('codex');
  expect(runBody.message).toContain('produce a folder named generated-plugin');

  await expectWorkspaceReady(page);
  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [
    'generated-plugin/open-design.json',
    'generated-plugin/SKILL.md',
    'generated-plugin/examples/demo.md',
  ]);
  await expectProjectFileToContain(page, projectId, 'generated-plugin/open-design.json', '"name": "generated-plugin"');
  await expectProjectFileToContain(page, projectId, 'generated-plugin/SKILL.md', '# Generated Plugin');

  await expect(page.getByText('Files from this turn')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-actions-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-install-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-publish-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-contribute-generated-plugin')).toBeVisible();

  await expect(page.getByTestId('design-plugin-folder-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('design-plugin-folder-install-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('design-plugin-folder-publish-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('design-plugin-folder-contribute-generated-plugin')).toBeVisible();
});

test('[P0] real daemon run supports fake non-Codex runtime protocols', async ({ page }) => {
  test.setTimeout(180_000);

  for (const agentId of FAKE_AGENT_RUNTIME_IDS) {
    await test.step(agentId, async () => {
      await configureFakeAgent(page, agentId);
      const projectId = `fake-runtime-${agentId}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
      const { conversationId } = await createProjectViaApi(page, projectId, `Fake ${agentId} runtime smoke`);
      const expectedArtifact = `fake-agent-runtime-${agentId}`;

      expect(conversationId).toBeTruthy();
      await startRunAndWaitForSuccess(page, {
        agentId,
        projectId,
        conversationId,
        message: `Fake runtime smoke for ${agentId}`,
        expectedOutput: expectedArtifact,
      });
    });
  }
});

async function createProject(page: Page, name: string, agentId: FakeAgentId = 'codex') {
  await configureFakeAgent(page, agentId);
  await installBrowserAgentConfig(page, agentId);
  await gotoEntryHome(page);
  await setBrowserAgentConfig(page, agentId);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await setBrowserAgentConfig(page, agentId);
  await configureFakeAgent(page, agentId);
  await expectBrowserAgentConfig(page, agentId);
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
}

async function createByokOpenCodeProject(page: Page, name: string) {
  await configureByokOpenCodeWithoutProvider(page);
  await installBrowserByokOpenCodeConfig(page);
  await gotoEntryHome(page);
  await setBrowserByokOpenCodeConfig(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await setBrowserByokOpenCodeConfig(page);
  await configureByokOpenCodeWithoutProvider(page);
  await expectBrowserAgentConfig(page, 'byok-opencode');
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
}

async function createProjectViaApi(page: Page, projectId: string, name: string) {
  const response = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { conversationId: string };
}

async function openProjectFromProjectsView(page: Page, projectId: string) {
  await gotoEntryHome(page);
  const recentProjects = page.getByTestId('recent-projects-strip');
  await expect(recentProjects).toBeVisible();
  await recentProjects.locator(`[data-project-id="${projectId}"]`).click();
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

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function selectComposerSessionMode(page: Page, modeTitle: 'Ask mode' | 'Plan mode' | 'Design mode') {
  const trigger = page.getByTestId('chat-composer').getByTestId('session-mode-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();

  const menu = page.locator('.session-mode-toggle__menu[role="menu"]');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Ask mode' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Plan mode' })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'Design mode' })).toBeVisible();
  await menu.getByRole('menuitemradio', { name: modeTitle }).click();
  await expect(trigger).toHaveAttribute('aria-label', modeTitle);
}

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt);
  await expect(sendButton).toBeEnabled();
  const response = await Promise.race([
    page.waitForResponse(isCreateRunResponse, { timeout: 10_000 }),
    (async () => {
      await sendButton.click();
      return page.waitForResponse(isCreateRunResponse, { timeout: 10_000 });
    })(),
  ]);
  expect(response.ok()).toBeTruthy();
  return response;
}

async function sendPromptAndReloadBeforeCreateResponse(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  let releaseResponse!: () => void;
  const releaseResponsePromise = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let createResponseReady = false;
  const runRoute = '**/api/runs';

  await page.route(runRoute, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    createResponseReady = true;
    await releaseResponsePromise;
    await route.fulfill({ response }).catch(() => {});
  });

  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt);
  await expect(sendButton).toBeEnabled();
  await sendButton.click();
  await expect.poll(() => createResponseReady, { timeout: 10_000 }).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  releaseResponse();
  await page.unroute(runRoute).catch(() => {});
}

async function openNewProjectModal(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
}

async function dismissPrivacyDialog(page: Page) {
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
}

async function clickVisible(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: T.medium });
  await locator.evaluate((element: HTMLElement) => element.click());
}

async function configureFakeAgent(page: Page, agentId: FakeAgentId) {
  const runtime = fakeRuntimes[agentId];
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId,
      agentModels: { [agentId]: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { [agentId]: runtime.env },
      skillId: null,
      designSystemId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function configureByokOpenCodeWithoutProvider(page: Page) {
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'byok-opencode',
      agentModels: { 'byok-opencode': { model: 'default', reasoning: 'default' } },
      agentCliEnv: {},
      skillId: null,
      designSystemId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function setBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  const payload = { key: STORAGE_KEY, id: agentId, env: fakeRuntimes[agentId].env };
  await installBrowserAgentConfig(page, agentId);
  await page.evaluate(installConfig, payload);
}

async function setBrowserByokOpenCodeConfig(page: Page) {
  await installBrowserByokOpenCodeConfig(page);
  await page.evaluate(installByokOpenCodeConfig, { key: STORAGE_KEY });
}

async function installBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  await page.addInitScript(installConfig, {
    key: STORAGE_KEY,
    id: agentId,
    env: fakeRuntimes[agentId].env,
  });
}

async function installBrowserByokOpenCodeConfig(page: Page) {
  await page.addInitScript(installByokOpenCodeConfig, { key: STORAGE_KEY });
}

function installConfig({ key, id, env }: { key: string; id: FakeAgentId; env: Record<string, string> }) {
  window.localStorage.setItem(
    key,
    JSON.stringify({
      mode: 'daemon',
      apiKey: '',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
      agentId: id,
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      agentModels: { [id]: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { [id]: env },
    }),
  );
}

function installByokOpenCodeConfig({ key }: { key: string }) {
  window.localStorage.setItem(
    key,
    JSON.stringify({
      mode: 'daemon',
      apiKey: '',
      baseUrl: '',
      model: 'default',
      agentId: 'byok-opencode',
      skillId: null,
      designSystemId: null,
      onboardingCompleted: true,
      agentModels: { 'byok-opencode': { model: 'default', reasoning: 'default' } },
      agentCliEnv: {},
    }),
  );
}

async function expectBrowserAgentConfig(page: Page, agentId: string) {
  await expect
    .poll(async () => page.evaluate(({ key }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw).agentId ?? null;
      } catch {
        return null;
      }
    }, { key: STORAGE_KEY }), { timeout: 10_000 })
    .toBe(agentId);
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/app-config');
      if (!response.ok()) return null;
      const body = (await response.json()) as { config?: { agentId?: string } };
      return body.config?.agentId ?? null;
    }, { timeout: 10_000 })
    .toBe(agentId);
}

async function resetDaemonAppConfig(page: Page) {
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'mock',
      agentModels: {},
      agentCliEnv: {},
      skillId: null,
      designSystemId: null,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function startRunAndWaitForSuccess(
  page: Page,
  options: {
    agentId: FakeAgentId;
    projectId: string;
    conversationId: string;
    message: string;
    expectedOutput?: string;
  },
) {
  const requestId = `fake-${options.agentId}-${Date.now()}`;
  const response = await page.request.post('/api/runs', {
    data: {
      agentId: options.agentId,
      message: options.message,
      projectId: options.projectId,
      conversationId: options.conversationId,
      assistantMessageId: `assistant-${requestId}`,
      clientRequestId: requestId,
      skillId: null,
      designSystemId: null,
      model: 'default',
      reasoning: 'default',
    },
  });
  expect(response.ok()).toBeTruthy();
  const { runId } = (await response.json()) as { runId: string };

  await expect
    .poll(async () => {
      const status = await page.request.get(`/api/runs/${runId}`);
      if (!status.ok()) return `http-${status.status()}`;
      const body = (await status.json()) as { status: string };
      return body.status;
    }, { timeout: 60_000 })
    .toBe('succeeded');

  if (options.expectedOutput) {
    const events = await page.request.get(`/api/runs/${runId}/events`);
    expect(events.ok()).toBeTruthy();
    await expect(events.text()).resolves.toContain(options.expectedOutput);
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

async function expectProjectFilesToContain(
  page: Page,
  projectId: string,
  expectedNames: string[],
  timeout = 15_000,
) {
  await expect
    .poll(async () => {
      try {
        const files = await listProjectFiles(page, projectId);
        return files.map((file) => file.name);
      } catch {
        return [];
      }
    }, { timeout })
    .toEqual(expect.arrayContaining(expectedNames));
}

async function listProjectFiles(
  page: Page,
  projectId: string,
) {
  const response = await page.request.get(`/api/projects/${projectId}/files`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as { files: Array<{ kind: string; name: string }> };
  return body.files;
}

async function currentProjectContext(
  page: Page,
): Promise<{ conversationId: string; projectId: string }> {
  const { projectId } = currentProject(page);
  const response = await page.request.get(`/api/projects/${projectId}/conversations`);
  expect(response.ok()).toBeTruthy();
  const { conversations } = (await response.json()) as {
    conversations: Array<{ id: string; updatedAt: number }>;
  };
  const active = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!active) {
    throw new Error(`no conversations found for project ${projectId}`);
  }
  return { projectId, conversationId: active.id };
}

async function expectRestoredDelayedAssistantMessage(
  page: Page,
  projectId: string,
  conversationId: string,
  options: {
    expectedUserMessages?: number;
    requireRunId?: boolean;
    expectedThinking?: boolean;
    producedFiles?: string[];
  } = {},
) {
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistant = messages.find((message) => message.role === 'assistant');
      return {
        userMessages: messages.filter((message) => message.role === 'user').length,
        assistantMessages: messages.filter((message) => message.role === 'assistant').length,
        hasRunId: Boolean(assistant?.runId),
        runStatus: assistant?.runStatus ?? null,
        producedFiles: assistant?.producedFiles?.map((file) => file.name) ?? [],
        hasThinking: Boolean(assistant?.events?.some((event) => event.kind === 'thinking')),
      };
    }, { timeout: 15_000 })
    .toEqual({
      userMessages: options.expectedUserMessages ?? expect.any(Number),
      assistantMessages: 1,
      hasRunId: options.requireRunId ? true : expect.any(Boolean),
      runStatus: 'succeeded',
      producedFiles: options.producedFiles ?? [DELAYED_FILE],
      hasThinking: options.expectedThinking ?? true,
    });
}

async function listConversationMessages(
  page: Page,
  projectId: string,
  conversationId: string,
) {
  const response = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    messages: Array<{
      id: string;
      role: string;
      runId?: string;
      runStatus?: string;
      events?: Array<{ kind: string }>;
      producedFiles?: Array<{ name: string }>;
      traceObjectFiles?: Array<{ name: string }>;
      resultDeliveryState?: string;
    }>;
  };
  return body.messages;
}

function isCreateRunResponse(response: Response): boolean {
  const url = new URL(response.url());
  return url.pathname === '/api/runs' && response.request().method() === 'POST';
}

function isCreateRunRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/runs' && request.method() === 'POST';
}

function isCreateProjectRequest(request: Request): boolean {
  const url = new URL(request.url());
  return url.pathname === '/api/projects' && request.method() === 'POST';
}

function expectCreateRunAgentId(response: Response, agentId: string) {
  expect(response.request().postDataJSON()).toMatchObject({ agentId });
}

function currentProject(page: Page): { projectId: string } {
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
  return { projectId };
}
