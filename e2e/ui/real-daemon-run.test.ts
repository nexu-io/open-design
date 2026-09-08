import { expect, test } from '@/playwright/suite';
import { ACTIVE_ARTIFACT_PREVIEW_SELECTOR } from '@/playwright/artifact-preview';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openNewProjectModal as openNewProjectModalFromProjects } from '@/playwright/rail';
import { runErrorCard } from '@/playwright/chat';
import { openAllProjectFiles } from '@/playwright/workspace';
import type { Locator, Page, Request, Response } from '@playwright/test';
import {
  createFakeAcpHandshakeRuntime,
  createFakeAgentRuntimes,
  FAKE_AGENT_RUNTIME_IDS,
} from '@/playwright/fake-agents';
import { trackRunRequests } from '@/playwright/mock-factory';
import type { FakeAcpHandshakeRuntime, FakeAgentId } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const EXPERIENCE_SURVEY_RETIRED_KEY = 'open-design:experience-survey:v1:retired';
const EXPERIENCE_SURVEY_DELIVERIES_KEY = 'open-design:experience-survey:v1:deliveries';
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
const OD_NEXT_CANARY_FILE = 'od-next-active-canary.html';
const DECK_DIRECT_NAVIGATION_BUDGET_MS = 2_500;
const MEDIA_ONLY_FILE = 'media-only.png';
const SERVER_DERIVED_WORKSPACE_HEADERS = {
  'x-od-workspace-id': 'e2e-server-derived-workspace',
  'x-od-workspace-type': 'personal',
  'x-od-workspace-member-id': 'e2e-server-derived-member',
  'x-od-workspace-role': 'owner',
  'x-od-workspace-member-status': 'active',
  'x-od-workspace-lifecycle-state': 'active',
  'x-od-workspace-can-share-projects': 'true',
  'x-od-workspace-can-write-synced-files': 'true',
} as const;
let fakeRuntimes: Awaited<ReturnType<typeof createFakeAgentRuntimes>>;
let fakeAcpHandshakeRuntime: FakeAcpHandshakeRuntime;

function artifactPreview(page: Page) {
  return page.locator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR).first();
}

function artifactPreviewFrame(page: Page) {
  return page.frameLocator(ACTIVE_ARTIFACT_PREVIEW_SELECTOR);
}

// No serial mode: every test performs its full setup in beforeEach (config
// reset, localStorage seed, fake agent config) and creates its own project,
// so tests hold order-independent. Keeping the file splittable matters for
// the CI shard matrix — a serial group is atomic within one shard and this
// file's chain alone would floor the UI wall time.

test.beforeAll(async ({ toolsDev }) => {
  [fakeRuntimes, fakeAcpHandshakeRuntime] = await Promise.all([
    createFakeAgentRuntimes({
      root: join(toolsDev.root, 'scratch', 'fake-agent-runtimes'),
    }),
    createFakeAcpHandshakeRuntime({
      root: join(toolsDev.root, 'scratch', 'fake-acp-handshake-runtime'),
    }),
  ]);
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
  await createProject(page, 'Real daemon run smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);
  await expect(artifactPreview(page)).toBeVisible();
  const frame = artifactPreviewFrame(page);
  await expect(frame.getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();
  await expectGeneratedPreviewToRemainStable(page, GENERATED_HEADING);

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

test('[P0] local OD Next active canary follows one public task across physical runs', async ({ page }) => {
  test.skip(
    process.env.OD_NEXT_STRATEGY_ROLLOUT !== 'active'
      || process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY !== '1',
    'requires the explicit local synthetic rollout canary flags',
  );
  await prepareLocalOdNextCanary(page, 'OD Next local active canary');

  const createResponsePromise = page.waitForResponse(isCreateRunResponse);
  await sendPrompt(page, 'Create an OD Next active canary artifact');
  const createResponse = await createResponsePromise;
  const created = await createResponse.json() as {
    runId: string;
    taskExecutionId?: string;
    strategyTask?: { taskExecutionId: string; inputStage: string; terminal: boolean };
  };
  expect(created.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
  expect(created.taskExecutionId).toBe(created.strategyTask?.taskExecutionId);

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [OD_NEXT_CANARY_FILE]);
  await expect(page.getByText(
    'Created od-next-active-canary.html through the continued native session.',
  ).last()).toBeVisible();

  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${created.runId}`);
    const status = await response.json() as {
      strategyTask?: {
        activeRunId: string;
        inputStage: string;
        outcome: string;
        terminal: boolean;
      };
    };
    return status.strategyTask;
  }, { timeout: 20_000 }).toMatchObject({
    inputStage: 'production',
    outcome: 'completed',
    terminal: true,
    activeRunId: expect.not.stringMatching(new RegExp(`^${created.runId}$`)),
  });

  const list = await page.request.get(`/api/runs?projectId=${encodeURIComponent(projectId)}`);
  const body = await list.json() as {
    runs: Array<{ strategyTask?: { taskExecutionId: string } }>;
  };
  expect(body.runs.filter((run) => (
    run.strategyTask?.taskExecutionId === created.taskExecutionId
  ))).toHaveLength(2);
});

test('[P0] OD Next active + Blank prototype generates a directly navigable Deck Protocol v1 deck', async ({ page }) => {
  test.skip(
    process.env.OD_NEXT_STRATEGY_ROLLOUT !== 'active'
      || process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY !== '1',
    'requires the explicit local synthetic rollout canary flags',
  );
  await prepareLocalOdNextCanary(page, 'OD Next prototype to PPT canary');

  const response = await sendPrompt(
    page,
    'Create an OD Next PowerPoint protocol canary from this prototype project',
    T.xlong,
  );
  const created = await response.json() as { strategyTask?: { inputStage: string } };
  expect(created.strategyTask).toMatchObject({ inputStage: 'request' });

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [OD_NEXT_CANARY_FILE]);
  await expect(page.getByText(
    'Created od-next-active-canary.html through the continued native session.',
  ).last()).toBeVisible();
  await expectProjectFileToContain(page, projectId, OD_NEXT_CANARY_FILE, 'data-od-deck-protocol="1"');
  await expectDeckThumbnailNavigationUnderBudget(page);
});

test('[P0] OD Next off + Blank prototype keeps explicit PPT turns on Deck Protocol v1', async ({ page }) => {
  test.skip(
    process.env.OD_NEXT_STRATEGY_ROLLOUT !== 'off',
    'requires a daemon started with the rollout env explicitly off',
  );
  await prepareLocalOdNextCanary(page, 'Classic prototype to PPT canary', 'off');

  const response = await sendPrompt(
    page,
    'Create an OD Next PowerPoint protocol canary from this prototype project',
    T.xlong,
  );
  const created = await response.json() as { strategyTask?: unknown };
  expect(created.strategyTask).toBeUndefined();

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [OD_NEXT_CANARY_FILE]);
  await expect(page.getByText(
    'Created the classic/off-rollout Deck Protocol canary.',
  ).last()).toBeVisible();
  await expectProjectFileToContain(page, projectId, OD_NEXT_CANARY_FILE, 'data-od-deck-protocol="1"');
  await expectDeckThumbnailNavigationUnderBudget(page);
});

for (const strategyMode of ['active', 'off'] as const) {
  test(`[P0] OD Next ${strategyMode} + selected legacy deck template remains directly navigable`, async ({ page }) => {
    test.skip(
      !isDeckMatrixStrategyModeEnabled(strategyMode),
      `requires a daemon started with the rollout env explicitly ${strategyMode}`,
    );
    await prepareSelectedDeckTemplateCanary(
      page,
      `Selected template ${strategyMode} canary`,
      strategyMode,
    );

    const response = await sendPrompt(
      page,
      'Create a selected-template deck navigation canary',
      T.xlong,
    );
    const created = await response.json() as { strategyTask?: { inputStage: string } };
    if (strategyMode === 'active') {
      expect(created.strategyTask).toMatchObject({ inputStage: 'request' });
    } else {
      expect(created.strategyTask).toBeUndefined();
    }

    const { projectId } = await currentProjectContext(page);
    await expectProjectFilesToContain(page, projectId, [OD_NEXT_CANARY_FILE]);
    await expect(page.getByText('Created the selected-template legacy deck canary.').last()).toBeVisible();
    const source = await readProjectFile(page, projectId, OD_NEXT_CANARY_FILE);
    expect(source).not.toContain('data-od-deck-protocol="1"');
    await expectDeckThumbnailNavigationUnderBudget(page);
  });
}

test('[P0] local OD Next clarification canary preserves one taskExecutionId through the public form', async ({ page }) => {
  test.skip(
    process.env.OD_NEXT_STRATEGY_ROLLOUT !== 'active'
      || process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY !== '1',
    'requires the explicit local synthetic rollout canary flags',
  );
  await prepareLocalOdNextCanary(page, 'OD Next local clarification canary');

  const createResponsePromise = page.waitForResponse(isCreateRunResponse);
  await sendPrompt(page, 'Create an OD Next clarification canary artifact');
  const created = await (await createResponsePromise).json() as {
    runId: string;
    taskExecutionId: string;
  };
  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${created.runId}`);
    return (await response.json() as { strategyTask?: { outcome: string } }).strategyTask?.outcome;
  }, { timeout: 20_000 }).toBe('clarification_required');

  const form = page.locator('.question-form').first();
  await expect(form).toBeVisible();
  await form.getByText('Desktop web', { exact: true }).click();
  const clarificationResponsePromise = page.waitForResponse(isCreateRunResponse);
  await form.getByRole('button', { name: 'Send answers' }).click();
  const clarificationResponse = await clarificationResponsePromise;
  const clarificationText = await clarificationResponse.text();
  expect(clarificationResponse.ok(), clarificationText).toBeTruthy();
  const clarification = JSON.parse(clarificationText) as {
    taskExecutionId: string;
    strategyTask?: { inputStage: string };
  };
  expect(clarification.taskExecutionId).toBe(created.taskExecutionId);
  expect(clarification.strategyTask?.inputStage).toBe('clarification');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [OD_NEXT_CANARY_FILE]);
  await expect(page.getByText(
    'Created od-next-active-canary.html through the continued native session.',
  ).last()).toBeVisible();
  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${created.runId}`);
    return (await response.json() as {
      strategyTask?: { taskExecutionId: string; outcome: string; terminal: boolean };
    }).strategyTask;
  }, { timeout: 20_000 }).toMatchObject({
    taskExecutionId: created.taskExecutionId,
    outcome: 'completed',
    terminal: true,
  });
});

test('[P0] local OD Next public canaries project blocked and canceled terminal mappings', async ({ page }) => {
  test.skip(
    process.env.OD_NEXT_STRATEGY_ROLLOUT !== 'active'
      || process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY !== '1',
    'requires the explicit local synthetic rollout canary flags',
  );
  await prepareLocalOdNextCanary(page, 'OD Next local blocked canary');
  const blockedResponsePromise = page.waitForResponse(isCreateRunResponse);
  await sendPrompt(page, 'Create an OD Next blocked canary');
  const blocked = await (await blockedResponsePromise).json() as {
    runId: string;
    taskExecutionId: string;
  };
  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${blocked.runId}`);
    return (await response.json() as {
      strategyTask?: { taskExecutionId: string; outcome: string; terminal: boolean };
    }).strategyTask;
  }, { timeout: 20_000 }).toMatchObject({
    taskExecutionId: blocked.taskExecutionId,
    outcome: 'blocked',
    terminal: true,
  });

  await prepareLocalOdNextCanary(page, 'OD Next local canceled canary');
  const canceledResponsePromise = page.waitForResponse(isCreateRunResponse);
  await sendPrompt(page, 'Hold the daemon run open until canceled');
  const canceled = await (await canceledResponsePromise).json() as {
    runId: string;
    taskExecutionId: string;
  };
  const cancelResponse = await page.request.post(`/api/runs/${canceled.runId}/cancel`);
  expect(cancelResponse.ok(), await cancelResponse.text()).toBeTruthy();
  await expect.poll(async () => {
    const response = await page.request.get(`/api/runs/${canceled.runId}`);
    return (await response.json() as {
      strategyTask?: { taskExecutionId: string; outcome: string; terminal: boolean };
    }).strategyTask;
  }, { timeout: 20_000 }).toMatchObject({
    taskExecutionId: canceled.taskExecutionId,
    outcome: 'canceled',
    terminal: true,
  });
});

test('[P0] OD Next app-config switch takes effect immediately and rejects invalid modes atomically', async ({ page }) => {
  const readRollout = async () => {
    const response = await page.request.get('/api/strategies/od-next/rollout');
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json() as {
      status: {
        requestedMode: string;
        requestedModeSource: string;
        effectiveMode: string;
      };
    }).status;
  };

  const activeWrite = await page.request.put('/api/app-config', {
    data: { odNextStrategyMode: 'active' },
  });
  expect(activeWrite.ok(), await activeWrite.text()).toBeTruthy();
  await expect.poll(readRollout).toMatchObject({
    requestedMode: 'active',
    requestedModeSource: 'app_config',
    effectiveMode: 'active',
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  const persisted = await page.request.get('/api/app-config');
  expect(persisted.ok(), await persisted.text()).toBeTruthy();
  expect((await persisted.json() as { config: { odNextStrategyMode?: string; agentId?: string } }).config)
    .toMatchObject({ odNextStrategyMode: 'active', agentId: 'codex' });

  const invalidWrite = await page.request.put('/api/app-config', {
    data: { odNextStrategyMode: 'acive', agentId: 'mock' },
  });
  expect(invalidWrite.status()).toBe(400);
  expect(await invalidWrite.json()).toMatchObject({
    error: { code: 'INVALID_APP_CONFIG_VALUE' },
  });
  await expect.poll(readRollout).toMatchObject({
    requestedMode: 'active',
    requestedModeSource: 'app_config',
    effectiveMode: 'active',
  });
  const afterInvalid = await page.request.get('/api/app-config');
  expect((await afterInvalid.json() as { config: { odNextStrategyMode?: string; agentId?: string } }).config)
    .toMatchObject({ odNextStrategyMode: 'active', agentId: 'codex' });

  const offWrite = await page.request.put('/api/app-config', {
    data: { odNextStrategyMode: 'off' },
  });
  expect(offWrite.ok(), await offWrite.text()).toBeTruthy();
  await expect.poll(readRollout).toMatchObject({
    requestedMode: 'off',
    requestedModeSource: 'app_config',
    effectiveMode: 'off',
  });
});

test('[P1] delivered artifact opens the one-time experience survey and accepts an Other response', async ({ page }) => {
  await enableExperienceSurvey(page);
  await createProject(page, 'Delivered artifact survey smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic smoke artifact');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [GENERATED_FILE]);
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();

  const survey = page.getByRole('dialog', {
    name: /We'd love your feedback — help improve Open ?Design/,
  });
  const recommendation = survey.getByText(
    /How likely are you to recommend Open ?Design to a colleague or friend\?/,
  );
  await expect(recommendation).toBeVisible({ timeout: T.medium });
  await survey.getByRole('button', { name: '8', exact: true }).click();
  await expect(survey.getByText('Which one should we improve first?')).toBeVisible();
  await survey.getByRole('button', { name: 'Something else', exact: true }).click();
  const other = survey.getByRole('textbox', { name: 'Tell us in your own words' });
  await expect(other).toBeFocused();
  await other.fill('Keep generated artifact previews visible after delivery.');
  await survey.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(survey.getByText('Thank you!')).toBeVisible();

  await expect
    .poll(() => page.evaluate((key) => window.localStorage.getItem(key), EXPERIENCE_SURVEY_RETIRED_KEY))
    .toBe('1');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(survey).toHaveCount(0);
});

test('[P0] bound project reads derive Workspace authority without browser query scope', async ({ page }) => {
  const projectId = `server-derived-raw-${Date.now()}`;
  const { conversationId } = await createProjectViaApi(
    page,
    projectId,
    'Server-derived raw authority',
    undefined,
    SERVER_DERIVED_WORKSPACE_HEADERS,
  );

  expect(conversationId).toBeTruthy();
  const conversationsResponse = await page.request.get(
    `/api/projects/${projectId}/conversations`,
  );
  expect(
    conversationsResponse.ok(),
    await conversationsResponse.text(),
  ).toBeTruthy();
  const messagesResponse = await page.request.get(
    `/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(messagesResponse.ok(), await messagesResponse.text()).toBeTruthy();

  const writeResponse = await page.request.post(`/api/projects/${projectId}/files`, {
    headers: SERVER_DERIVED_WORKSPACE_HEADERS,
    data: {
      name: GENERATED_FILE,
      content: `<!doctype html><html><body><h1>${GENERATED_HEADING}</h1></body></html>`,
    },
  });
  expect(writeResponse.ok(), await writeResponse.text()).toBeTruthy();

  const rawPath = `/api/projects/${projectId}/raw/${GENERATED_FILE}`;
  const response = await page.goto(rawPath, { waitUntil: 'domcontentloaded' });
  expect(response?.ok(), await response?.text()).toBeTruthy();
  expect(new URL(page.url()).searchParams.has('workspaceId')).toBe(false);
  expect(new URL(page.url()).searchParams.has('workspaceMemberId')).toBe(false);
  await expect(page.getByRole('heading', { name: GENERATED_HEADING })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('WORKSPACE_CONTEXT_REQUIRED');
});

test('[P0] real daemon run persists an artifact streamed across multiple chunks', async ({ page }) => {
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
  await createProject(page, 'Daemon error smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return an intentional daemon smoke failure');

  await expect(runErrorCard(page)).toContainText('intentional fake codex failure', { timeout: 15_000 });
  await expect(runErrorCard(page)).toContainText('intentional fake codex failure');
});

test('[P0] real daemon run classifies a Claude mid-stream socket drop as a retryable connection error', async ({ page }) => {
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

test('[P0] ACP handshake refusal is actionable, persists, and does not auto-retry', async ({ page }) => {
  await createHandshakeRefusingKimiProject(page, 'ACP handshake refusal smoke');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Start a session that the ACP fixture refuses');

  const card = runErrorCard(page);
  await expect(card).toContainText('Agent version incompatible', { timeout: 15_000 });
  await expect(card).toContainText('Kimi CLI refused to start a session');
  await expect(card).toContainText('json-rpc id 2: Internal error');
  await expect(card.getByRole('button', { name: /^Retry$/ })).toBeVisible();
  await expect.poll(() => countAcpRunSessionStarts(fakeAcpHandshakeRuntime.invocationLog)).toBe(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(runErrorCard(page)).toContainText('Agent version incompatible', { timeout: 15_000 });
  await expect(runErrorCard(page)).toContainText('Kimi CLI refused to start a session');
  await expect.poll(() => countAcpRunSessionStarts(fakeAcpHandshakeRuntime.invocationLog)).toBe(1);
});

test('[P1] real daemon classifies a Claude prompt-too-long result and preserves it across reload', async ({ page }) => {
  await createProject(page, 'Daemon prompt-too-long smoke', 'claude');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Return a Claude prompt-too-long failure');

  const card = runErrorCard(page);
  await expect(card).toContainText('Input too long', { timeout: 15_000 });
  await expect(card).toContainText("exceeded the model's context limit");
  await expect(card.getByRole('button', { name: /^Retry$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Switch to OpenDesign Cloud & retry/i })).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await expect(runErrorCard(page)).toContainText('Input too long', { timeout: 15_000 });
  await expect(runErrorCard(page)).toContainText("exceeded the model's context limit");
});

test('[P0] real daemon run supports a follow-up turn in the same project', async ({ page }) => {
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
      producedFiles: [GENERATED_FILE],
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
    .filter({ hasText: 'Parameters' })
    .locator('.cc-row')
    .filter({ hasText: 'Font size' })
    .locator('input');
  await fontSizeInput.fill('52');
  // Project-detail editing is optimistic: the authored artifact must update
  // in the active preview before persistence finishes or the user clicks
  // Save. A file-only assertion would miss a broken edit bridge that writes
  // correct bytes while leaving the visible artifact stale.
  await expect.poll(
    () => editedHeading.evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe('52px');
  await page.locator('.manual-edit-modal').getByRole('button', { name: /^Save$/ }).click({ force: true });
  await expectProjectFileToContain(page, projectId, GENERATED_FILE, 'font-size: 52px');
  await page.getByTestId('manual-edit-mode-toggle').click();
  await expect(artifactPreviewFrame(page).locator('[data-od-id="smoke-title"]')).toHaveCSS('font-size', '52px');

  await page.getByRole('button', { name: 'Versions' }).click();
  const versionsDialog = page.getByRole('dialog', { name: 'Versions' });
  await expect(versionsDialog).toBeVisible();
  await expect(versionsDialog).toContainText('3 versions');
  await expect(versionsDialog.getByRole('option')).toHaveCount(3);
});

test('[P1] plan-document daemon run creates, opens, and restores an editable markdown plan', async ({ page }) => {
  await createProject(page, 'Plan document markdown smoke');
  await expectWorkspaceReady(page);

  // The composer has no session-mode picker any more (#7635); the plan
  // document flow is driven by the prompt (the fake runtime keys on it), and
  // the run carries the conversation's stored design mode.
  await expect(page.getByTestId('chat-composer').getByTestId('composer-mode-trigger')).toHaveCount(0);
  const runRequestPromise = page.waitForRequest(isCreateRunRequest);
  await sendPrompt(page, 'Create a deterministic plan document');
  const runRequest = await runRequestPromise;
  expect((runRequest.postDataJSON() as { sessionMode?: string }).sessionMode).toBe('design');

  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, ['plan.md']);
  await expectProjectFileToContain(page, projectId, 'plan.md', '# Deterministic Plan');
  await expect(page.getByTestId('file-workspace').getByRole('tab', { name: /plan\.md/i })).toBeVisible();
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /markdown editor/i })).toHaveValue(/Deterministic Plan/);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByRole('tab', { name: /plan\.md/i })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /markdown editor/i })).toHaveValue(/Deterministic Plan/);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
});

test('[P1] media-only turn auto-opens the generated image file', async ({ page }) => {
  await createProject(page, 'Media-only auto-open smoke');
  await expectWorkspaceReady(page);

  // Establish an already-active project file first. Otherwise the workspace's
  // one-time initial-primary-file fallback can open the first project file and
  // mask whether turn-end media selection actually works.
  await sendPrompt(page, 'Create a deterministic plan document');
  const workspace = page.getByTestId('file-workspace');
  await expect(workspace.getByRole('tab', { name: /plan\.md/i })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await sendPrompt(page, 'Create a deterministic media-only artifact');

  const mediaTab = workspace.getByRole('tab', { name: /media-only\.png/i });
  await expect(mediaTab).toBeVisible({ timeout: T.medium });
  await expect(mediaTab).toHaveAttribute('aria-selected', 'true');
  await expect(workspace.getByRole('img', { name: MEDIA_ONLY_FILE })).toBeVisible();

  const rawHref = await workspace.getByRole('link', { name: 'Open' }).getAttribute('href');
  if (!rawHref) throw new Error('media preview did not expose its raw file URL');
  const rawResponse = await page.request.get(rawHref);
  expect(rawResponse.ok(), await rawResponse.text()).toBeTruthy();
  expect(rawResponse.headers()['content-type']).toContain('image/png');
});

// Red spec for "Plan 模式生成 HTML 后没有自动打开生成的文件": after the user
// reviews the plan and asks for the final deliverable, the generation turn
// writes the HTML as a project file (Write tool, no inline artifact echo) and
// then touches the plan document again. The viewer must auto-open the
// generated HTML instead of staying on the markdown plan.
test('[P1] plan-document generation turn auto-opens the generated HTML file', async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, 'Plan document html auto-open smoke', 'claude');
  await expectWorkspaceReady(page);

  await sendPrompt(page, 'Create a deterministic plan document');
  const { projectId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, ['plan.md']);
  const planTab = page.getByTestId('file-workspace').getByRole('tab', { name: /plan\.md/i });
  await expect(planTab).toHaveAttribute('aria-selected', 'true');

  // Mirror the real Plan-mode interaction: the user reviews and edits the
  // markdown plan in the split editor (autosave on) before asking for the
  // final deliverable.
  const planEditor = page.getByRole('textbox', { name: /markdown editor/i });
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(planEditor).toHaveValue(/Deterministic Plan/);
  await planEditor.click();
  await planEditor.press('End');
  await planEditor.pressSequentially('\n- Reviewed by the user before generation.\n', { delay: 10 });
  await expectProjectFileToContain(page, projectId, 'plan.md', 'Reviewed by the user before generation.');

  await sendPrompt(page, 'Generate the deterministic artifact from the plan document');
  await expectProjectFilesToContain(page, projectId, ['index.html', 'plan.md']);
  const htmlTab = page.getByTestId('file-workspace').getByRole('tab', { name: /index\.html/i });
  await expect(htmlTab).toBeVisible({ timeout: 2_000 });
  await expect(htmlTab).toHaveAttribute('aria-selected', 'true');
});

// Red spec, regeneration loop: Plan mode's core iteration is
// plan → generate → edit the plan → generate AGAIN. On the second generation
// the HTML file already exists, so a pre/post file-name diff sees no "new"
// file — the viewer must still re-focus the regenerated HTML. Uses the codex
// fake runtime (no tool_use events, like most CLI protocols) so the per-write
// auto-open path cannot mask the turn-end selection.
test('[P1] plan-document regeneration re-opens the existing generated HTML file', async ({ page }) => {
  test.setTimeout(120_000);
  await createProject(page, 'Plan document html regen smoke');
  await expectWorkspaceReady(page);

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
  await createProject(page, 'Real daemon isolation alpha');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a deterministic smoke artifact');
  const alpha = await currentProjectContext(page);
  await expectProjectFilesToContain(page, alpha.projectId, [GENERATED_FILE]);

  await leaveProjectForEntry(page);

  await createProject(page, 'Real daemon isolation beta');
  await expectWorkspaceReady(page);
  await sendPrompt(page, 'Create a follow-up deterministic smoke artifact');
  const beta = await currentProjectContext(page);
  await expectProjectFilesToContain(page, beta.projectId, [FOLLOW_UP_FILE]);
  expect(beta.projectId).not.toBe(alpha.projectId);

  await leaveProjectForEntry(page);
  await openProjectFromProjectsView(page, alpha.projectId);
  await expectWorkspaceReady(page);
  await expect(page.getByTestId('file-workspace').getByText(GENERATED_FILE, { exact: true })).toBeVisible();
  await expect(page.getByText(FOLLOW_UP_FILE, { exact: true })).toHaveCount(0);
  expect((await listProjectFiles(page, alpha.projectId)).map((file) => file.name)).toEqual([GENERATED_FILE]);

  await leaveProjectForEntry(page);
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

test('[P2] OpenCode non-zero tool results trigger and persist the repeated-failure warning', async ({ page }) => {
  await createProject(page, 'OpenCode repeated tool failure smoke', 'opencode');
  await expectWorkspaceReady(page);

  const runResponse = await sendPrompt(page, 'Return repeated OpenCode tool failures');
  expectCreateRunAgentId(runResponse, 'opencode');

  const warning = 'Heads up — the agent has repeated a failing bash call 4× and may be stuck.';
  await expect(page.getByText(warning, { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Stopped retrying after repeated tool failures.', { exact: true })).toBeVisible();

  const { projectId, conversationId } = await currentProjectContext(page);
  await expect.poll(async () => {
    const messages = await listConversationMessages(page, projectId, conversationId);
    const assistant = messages.find((message) => message.role === 'assistant');
    return {
      runStatus: assistant?.runStatus ?? null,
      failedToolResults: assistant?.events?.filter(
        (event) => event.kind === 'tool_result' && event.isError === true,
      ).length ?? 0,
      warningDetails: assistant?.events?.filter(
        (event) => event.kind === 'status' && event.detail === warning,
      ).length ?? 0,
    };
  }, { timeout: 15_000 }).toEqual({
    runStatus: 'succeeded',
    failedToolResults: 4,
    warningDetails: 1,
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await expect(page.getByText(warning, { exact: true })).toBeVisible();
  await expect(page.getByText('Stopped retrying after repeated tool failures.', { exact: true })).toBeVisible();
});

test('[P1] BYOK OpenCode run is blocked before spawn when provider config is missing', async ({ page }) => {
  await createByokOpenCodeProject(page, 'BYOK OpenCode missing provider smoke');
  await expectWorkspaceReady(page);
  const projectUrl = page.url();

  // The client-side BYOK preflight (apps/web byok/preflight) catches a missing
  // provider before any POST: it blocks the submit and opens the execution
  // Settings section for the user to complete the config. So "fails clearly
  // before spawn" now means no create-run request is issued and the preflight
  // surfaces the fix, not a daemon-side failed run.
  const runRequests = trackRunRequests(page);

  const { projectId } = await currentProjectContext(page);
  const input = page.getByTestId('chat-composer-input');
  await input.click();
  await input.fill('Create a BYOK OpenCode missing provider smoke artifact');
  await expect(input).toHaveText('Create a BYOK OpenCode missing provider smoke artifact');
  await page.getByTestId('chat-send').click();

  // The preflight opens the execution-mode Settings section.
  const settings = page.locator('.modal-settings');
  await expect(settings).toBeVisible({ timeout: 15_000 });
  await expect(settings.getByRole('tablist', { name: 'Execution mode' })).toBeVisible();

  // No run was created and no artifact was produced — the block is pre-spawn.
  await runRequests.expectNone({
    timeout: 1_000,
    message: 'missing BYOK provider should block before POST /api/runs',
  });
  runRequests.dispose?.();
  expect(await listProjectFiles(page, projectId)).toEqual([]);

  await page.goto(projectUrl, { waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);
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

  // Enter plugin authoring through the current Plugins Add panel. The
  // agent-assisted option hands its prompt back to the Home composer; the
  // scaffold and action cards below remain the end-to-end oracle.
  await page.goto('/plugins', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByTestId('plugin-create-with-agent').click();
  await expect(page.getByTestId('home-hero-input')).toHaveText(/Create an OpenDesign plugin for:/);

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
  const { projectId, conversationId } = await currentProjectContext(page);
  await expectProjectFilesToContain(page, projectId, [
    'generated-plugin/open-design.json',
    'generated-plugin/SKILL.md',
    'generated-plugin/examples/demo.md',
  ]);
  await expectProjectFileToContain(page, projectId, 'generated-plugin/open-design.json', '"name": "generated-plugin"');
  await expectProjectFileToContain(page, projectId, 'generated-plugin/SKILL.md', '# Generated Plugin');

  await expectRestoredDelayedAssistantMessage(page, projectId, conversationId, {
    producedFiles: [
      'generated-plugin/examples/demo.md',
      'generated-plugin/SKILL.md',
      'generated-plugin/open-design.json',
    ],
    expectedThinking: false,
  });

  await expect(page.getByText('Files from this turn')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-actions-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-install-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-publish-generated-plugin')).toBeVisible();
  await expect(page.getByTestId('assistant-plugin-contribute-generated-plugin')).toBeVisible();

  // The run auto-opens the produced file tab; the plugin-folder card lives in
  // the Design Files ("All project files") view, so navigate there first.
  await openAllProjectFiles(page);
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

async function createProject(
  page: Page,
  name: string,
  agentId: FakeAgentId = 'codex',
  conversationMode?: 'design' | 'chat' | 'plan',
) {
  const projectId = `real-daemon-${name}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  await configureFakeAgent(page, agentId);
  await installBrowserAgentConfig(page, agentId);
  // Keep the branch's conversation-scoped landing (createProjectViaApi returns
  // the seeded conversation here), and take #6161's two improvements: the
  // post-navigation `configureFakeAgent` + `setBrowserAgentConfig` pair is the
  // redundant setup it removed — `installBrowserAgentConfig` above already
  // seeded it — and the goto is guarded against the aborted-navigation races a
  // domcontentloaded wait can lose to.
  const { conversationId } = await createProjectViaApi(
    page,
    projectId,
    name,
    conversationMode,
  );
  try {
    await page.goto(`/projects/${projectId}/conversations/${conversationId}`, {
      waitUntil: 'domcontentloaded',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/ERR_ABORTED|frame was detached/i.test(message)) throw error;
  }
  await waitForLoadingToClear(page);
  await expectBrowserAgentConfig(page, agentId);
  await dismissPrivacyDialog(page);
}

async function createHandshakeRefusingKimiProject(page: Page, name: string) {
  const env = fakeAcpHandshakeRuntime.env;
  const response = await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'kimi',
      agentModels: { kimi: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { kimi: env },
      skillId: null,
      designSystemId: null,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.addInitScript(installConfig, {
    key: STORAGE_KEY,
    id: 'kimi',
    env,
  });

  const projectId = `real-daemon-${name}-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const { conversationId } = await createProjectViaApi(page, projectId, name);
  await page.goto(`/projects/${projectId}/conversations/${conversationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await waitForLoadingToClear(page);
  await expectBrowserAgentConfig(page, 'kimi');
  await dismissPrivacyDialog(page);
}

async function prepareLocalOdNextCanary(
  page: Page,
  name: string,
  strategyMode: 'active' | 'off' = 'active',
): Promise<void> {
  // Exercise the shipped Design-mode New Project flow, rather than hand-
  // constructing the create payload. EntryShell leaves the silently selected
  // default out of explicit plugin authority; the daemon derives and stamps
  // its exact snapshot, so rollout can replace only that automatic pin.
  await configureFakeAgent(page, 'opencode');
  await setOdNextStrategyMode(page, strategyMode);
  await installBrowserAgentConfig(page, 'opencode');
  await gotoEntryHome(page);
  await setBrowserAgentConfig(page, 'opencode');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await setBrowserAgentConfig(page, 'opencode');
  await configureFakeAgent(page, 'opencode');
  await setOdNextStrategyMode(page, strategyMode);
  await expectBrowserAgentConfig(page, 'opencode');
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
  await expectWorkspaceReady(page);
  await configureFakeAgent(page, 'opencode');
  await setOdNextStrategyMode(page, strategyMode);
  await expectFakeAgentRuntime(page, 'opencode', 'opencode-e2e 0.0.0');
}

async function prepareSelectedDeckTemplateCanary(
  page: Page,
  name: string,
  strategyMode: 'active' | 'off',
): Promise<void> {
  await configureFakeAgent(page, 'opencode');
  await setOdNextStrategyMode(page, strategyMode);
  await installBrowserAgentConfig(page, 'opencode');
  await gotoEntryHome(page);
  await setBrowserAgentConfig(page, 'opencode');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await setBrowserAgentConfig(page, 'opencode');
  await configureFakeAgent(page, 'opencode');
  await setOdNextStrategyMode(page, strategyMode);
  await expectBrowserAgentConfig(page, 'opencode');
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
  await page.getByTestId('new-project-tab-deck').click();
  const selectedTemplate = page.getByRole('radio', { name: 'Example Helix', exact: true });
  await expect(selectedTemplate).toBeVisible({ timeout: T.medium });
  await selectedTemplate.click();
  await expect(selectedTemplate).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('new-project-name').fill(name);
  const createRequestPromise = page.waitForRequest(isCreateProjectRequest);
  await page.getByTestId('create-project').click();
  const createRequest = await createRequestPromise;
  expect(createRequest.postDataJSON()).toMatchObject({
    skillId: 'replit-deck:example-helix',
    metadata: { kind: 'deck' },
  });
  await expectWorkspaceReady(page);
  await configureFakeAgent(page, 'opencode');
  await setOdNextStrategyMode(page, strategyMode);
}

async function setOdNextStrategyMode(page: Page, mode: 'active' | 'off'): Promise<void> {
  const response = await page.request.put('/api/app-config', {
    data: { odNextStrategyMode: mode },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

function isDeckMatrixStrategyModeEnabled(mode: 'active' | 'off'): boolean {
  if (process.env.OD_NEXT_STRATEGY_ROLLOUT !== mode) return false;
  return mode === 'off' || process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY === '1';
}

async function expectFakeAgentRuntime(
  page: Page,
  agentId: string,
  version: string,
): Promise<void> {
  const response = await page.request.get('/api/agents');
  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json() as {
    agents?: Array<{ id: string; available: boolean; version?: string }>;
  };
  expect(body.agents?.find((agent) => agent.id === agentId)).toMatchObject({
    available: true,
    version,
  });
}

async function expectDeckThumbnailNavigationUnderBudget(page: Page): Promise<void> {
  const thumbnails = page.locator('.deck-thumbnail-button');
  await expect(thumbnails).toHaveCount(3, { timeout: T.medium });
  await expect(thumbnails.nth(0)).toHaveAttribute('aria-current', 'true');

  const startedAt = Date.now();
  await thumbnails.nth(2).click();
  await expect(thumbnails.nth(2)).toHaveAttribute('aria-current', 'true', {
    timeout: DECK_DIRECT_NAVIGATION_BUDGET_MS,
  });
  expect(
    Date.now() - startedAt,
    'thumbnail navigation must complete before the old ~3 second fallback delay',
  ).toBeLessThan(DECK_DIRECT_NAVIGATION_BUDGET_MS);
  await expect(artifactPreviewFrame(page).getByText('Matrix Slide Three')).toBeVisible();
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

async function createProjectViaApi(
  page: Page,
  projectId: string,
  name: string,
  conversationMode?: 'design' | 'chat' | 'plan',
  headers?: Readonly<Record<string, string>>,
) {
  const response = await page.request.post('/api/projects', {
    ...(headers ? { headers: { ...headers } } : {}),
    data: {
      id: projectId,
      name,
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
      ...(conversationMode ? { conversationMode } : {}),
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { conversationId: string };
}

async function openProjectFromProjectsView(page: Page, projectId: string) {
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
}

/**
 * Leave the open project through the UI and land back on the entry surface.
 *
 * This used to be `getByRole('button', { name: /back to projects/i })`, which
 * no longer resolves to anything on a project surface. #5517 (884ed1085) gave
 * ChatPane's top-left slot to the pane-collapse control — `onCollapse` wins
 * over `onBack` there, and ProjectView passes both — and the standalone
 * `AppChromeHeader` that owned the `app-chrome-back` "Back to projects" button
 * is no longer mounted anywhere (only its portal-id constants are still
 * imported). The single remaining "Back to projects" label lives inside the
 * avatar menu's popover, which is closed by default, so the old locator just
 * hung until the test timed out.
 *
 * The surviving way out of a project is the pinned entry tab in the workspace
 * tabs bar: `WorkspaceTabsBar.openTab` always sends that tab home, whatever
 * entry section it last showed. Coverage is unchanged — this still exercises
 * "leave the project through real chrome", which is what the isolation
 * journey below depends on.
 */
async function leaveProjectForEntry(page: Page) {
  // In docked project mode the state-bearing pinned tab remains mounted in
  // the hidden dock strip while `workspace-home-chrome` is its visible,
  // interactive stand-in in the top chrome.
  const dockedHome = page.getByTestId('workspace-home-chrome');
  if (await dockedHome.isVisible().catch(() => false)) {
    await dockedHome.click();
    await expect(page.getByTestId('file-workspace')).toHaveCount(0);
    return;
  }
  const pinnedEntryTab = page.locator('.workspace-tab.is-pinned');
  await expect(pinnedEntryTab).toBeVisible();
  await pinnedEntryTab.locator('.workspace-tab__main').click();
  await expect(page.getByTestId('file-workspace')).toHaveCount(0);
}

async function gotoEntryHome(page: Page) {
  // Hold until the async projects list settles: its late resolution re-renders
  // the home hero (recent-projects strip mounting), which keeps controls like
  // the shortcuts trigger unstable under CI timing. Arm before navigating.
  const projectsSettled = page
    .waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/projects' &&
        response.request().method() === 'GET',
      { timeout: 10_000 },
    )
    .catch(() => null);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForLoadingToClear(page);
  await projectsSettled;
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
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

async function sendPrompt(page: Page, prompt: string, responseTimeout = T.medium) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await expect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await expect(input).toHaveText(prompt);
  await expect(sendButton).toBeEnabled();
  // Split the diagnosis on timeout: track whether the create-run POST was
  // ever issued, so a failure distinguishes "the click never produced a
  // request" (composer/overlay problem) from "the daemon did not answer in
  // time" (runtime problem).
  let createRunRequestSent = false;
  const markRequest = (request: Request) => {
    if (isCreateRunRequest(request)) createRunRequestSent = true;
  };
  page.on('request', markRequest);
  try {
    const [response] = await Promise.all([
      page.waitForResponse(isCreateRunResponse, { timeout: responseTimeout }),
      sendButton.click(),
    ]);
    expect(response.ok()).toBeTruthy();
    return response;
  } catch (error) {
    throw new Error(
      `sendPrompt did not observe a create-run response (POST /api/runs ${
        createRunRequestSent ? 'was sent but not answered in time' : 'was never issued'
      })`,
      { cause: error },
    );
  } finally {
    page.off('request', markRequest);
  }
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
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
}

async function clickVisible(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: T.medium });
  await locator.evaluate((element: HTMLElement) => element.click());
}

async function expectGeneratedPreviewToRemainStable(page: Page, heading: string) {
  const preview = artifactPreview(page);
  const original = await preview.elementHandle();
  if (!original) throw new Error('generated artifact preview iframe is missing');

  // The regression happened after the first successful paint: the file-route
  // commit briefly re-entered materialization, remounted the pooled iframe,
  // and Electron cancelled its srcdoc navigation. Observe the already-painted
  // frame through that settle window instead of accepting one transiently
  // successful visibility check.
  await original.evaluate(async (frame) => {
    const startedAt = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (!frame.isConnected) {
          reject(new Error('generated artifact preview iframe was detached after first paint'));
          return;
        }
        const style = getComputedStyle(frame);
        const rect = frame.getBoundingClientRect();
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity) === 0
          || rect.width === 0
          || rect.height === 0
        ) {
          reject(new Error('generated artifact preview became hidden after first paint'));
          return;
        }
        const blockingSurface = Array.from(
          document.querySelectorAll<HTMLElement>('.viewer-loading, .viewer-empty'),
        ).some((element) => {
          const candidateStyle = getComputedStyle(element);
          return candidateStyle.display !== 'none'
            && candidateStyle.visibility !== 'hidden'
            && Number(candidateStyle.opacity) !== 0
            && element.getClientRects().length > 0;
        });
        if (blockingSurface) {
          reject(new Error('loading or empty state masked the generated artifact after first paint'));
          return;
        }
        if (performance.now() - startedAt >= 1_200) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });

  expect(
    await preview.evaluate((frame, firstFrame) => frame === firstFrame, original),
    'generated artifact preview iframe was replaced after first paint',
  ).toBe(true);
  await expect(artifactPreviewFrame(page).getByRole('heading', { name: heading })).toBeVisible();
}

async function enableExperienceSurvey(page: Page) {
  const response = await page.request.put('/api/app-config', {
    data: {
      telemetry: { metrics: true, content: false, artifactManifest: false },
      privacyDecisionAt: 1,
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.addInitScript(({ configKey, deliveriesKey, retiredKey }) => {
    const resetMarker = 'od-e2e:experience-survey-reset';
    if (window.sessionStorage.getItem(resetMarker) !== '1') {
      window.localStorage.removeItem(deliveriesKey);
      window.localStorage.removeItem(retiredKey);
      window.sessionStorage.setItem(resetMarker, '1');
    }
    const parsed = JSON.parse(window.localStorage.getItem(configKey) ?? '{}') as Record<string, unknown>;
    parsed.privacyDecisionAt = 1;
    parsed.telemetry = { metrics: true, content: false, artifactManifest: false };
    window.localStorage.setItem(configKey, JSON.stringify(parsed));
  }, {
    configKey: STORAGE_KEY,
    deliveriesKey: EXPERIENCE_SURVEY_DELIVERIES_KEY,
    retiredKey: EXPERIENCE_SURVEY_RETIRED_KEY,
  });
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
      // byok-opencode availability resolves through the `opencode` agent's
      // configured cli env (daemon detection maps byok-opencode → opencode).
      // Point it at the fake runtime binary: runners without a real
      // `opencode` on PATH otherwise report the agent unavailable and the
      // web composer refuses to POST /api/runs at all. The run still fails
      // pre-spawn on the missing provider config — this spec's oracle — so
      // the fake binary is never executed.
      agentCliEnv: { opencode: fakeRuntimes.opencode.env },
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

function installConfig({ key, id, env }: { key: string; id: string; env: Record<string, string> }) {
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

async function countAcpRunSessionStarts(invocationLog: string): Promise<number> {
  const raw = await readFile(invocationLog, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { client?: string; method?: string })
    .filter((entry) => entry.client === 'open-design' && entry.method === 'session/new')
    .length;
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
      odNextStrategyMode: 'off',
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

async function readProjectFile(page: Page, projectId: string, fileName: string): Promise<string> {
  const response = await page.request.get(`/api/projects/${projectId}/files/${fileName}`);
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.text();
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
      events?: Array<{
        kind: string;
        content?: string;
        detail?: string;
        isError?: boolean;
        name?: string;
      }>;
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
