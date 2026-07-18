import { expect, test } from '@/playwright/suite';
import { openNewProjectModal as openNewProjectModalFromProjects } from '@/playwright/rail';
import type { Page, Response } from '@playwright/test';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import type { FakeAgentId } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';
const SLOW_RELOAD_FILE = 'slow-reload-daemon-smoke.html';
const SLOW_RELOAD_HEADING = 'Slow Reload Daemon Smoke';

let fakeRuntimes: Awaited<ReturnType<typeof createFakeAgentRuntimes>>;

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes();
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(180_000);

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

// Regression spec for the #4607 follow-up (spuriouslyFailedPending recovery):
// the bug requires a genuine client/daemon MISMATCH at reload time, not
// merely "reload while running" or "reload after already-succeeded" (both
// already covered elsewhere, on a different timing). The mismatch this test
// locks: the persisted assistant message shows runStatus:'failed' with no
// producedFiles and a real runId (because the browser's live SSE connection
// to the run was severed and the client's onError path gave up and persisted
// a failed+empty-files row) while the daemon's authoritative
// /api/runs/:runId record independently reached 'succeeded' -- the daemon
// process behind the run is unaffected by the browser losing its stream,
// exactly as it survives a page reload.
//
// We force this precondition through real client behavior only: we sever
// the transport (abort every connection attempt the *page* makes to the
// run's status/SSE endpoints) and let the actual client error-handling code
// persist the failed row via its normal production HTTP call. Nothing here
// hand-writes message state -- that would prove a fake flow instead of the
// real one.
//
// `content` is captured and logged for visibility on every run, but is
// deliberately NOT part of the gating precondition match. Empirically
// (confirmed across repeated runs with both `/api/runs/:id` and
// `/api/runs/:id/events` blocked from the page), `content` still resyncs to
// the real generated text within the same window even though runStatus and
// producedFiles stay pinned at their spurious values -- this looks like a
// daemon-side write that never traverses the page's network stack, so
// page.route() structurally cannot intercept or hold it back. Gating on
// content staying empty made the precondition unreachable more often than
// not; runStatus + producedFiles + runId + daemonStatus is the slice of the
// mismatch this harness can force and hold reliably, and is what is locked
// below. The post-reload assertions further down remain strict on content.
test('[P1] reload recovers a spuriously-failed pending message once the daemon run actually succeeded', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Spurious failed reload smoke');
  await expectWorkspaceReady(page);

  // Sever the browser's live view of the run for the whole test: every
  // attempt BY THE PAGE to open (or reopen) the event stream, or to poll the
  // run's plain status endpoint, fails immediately -- simulating a dropped
  // connection. This only interferes with the transport the *browser* uses;
  // it does not touch the daemon process running the agent (which keeps
  // going), and it does not affect this test's own out-of-band
  // `page.request` polling below (Playwright's APIRequestContext bypasses
  // page.route() entirely, so our assertions still see the daemon's real
  // status throughout).
  //
  // Blocking only the SSE stream was not enough to hold runStatus at
  // 'failed': the client apparently also reconciles runStatus via a plain
  // status poll independent of the event stream, so a route that only
  // aborted `/events` let runStatus quietly resync to 'succeeded' before
  // this test could observe it. Blocking both endpoints keeps runStatus and
  // producedFiles pinned at their spurious failed+empty values for the
  // whole test, confirmed stable across repeated runs (see the precondition
  // poll below). `content`, however, still resyncs to the real generated
  // text within this same window even with both endpoints blocked -- see
  // the note on the precondition poll for what that means for this test.
  await page.route('**/api/runs/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRunStatusOrEvents = request.method() === 'GET' && /^\/api\/runs\/[^/]+(?:\/events)?$/.test(url.pathname);
    if (!isRunStatusOrEvents) {
      await route.continue();
      return;
    }
    await route.abort('connectionreset');
  });

  const runResponse = await sendPrompt(page, 'Create a slow reload deterministic smoke artifact');
  const { runId } = (await runResponse.json()) as { runId: string };

  const { projectId, conversationId } = await currentProjectContext(page);

  // Wait for the reproducible slice of the client/daemon mismatch this test
  // locks, captured as ONE atomic snapshot per poll iteration (persisted
  // message + daemon status fetched back to back, with no reload or other
  // action in between). Polling each side separately would leave a window
  // where a same-page self-heal (observed empirically: the client can, on
  // its own, eventually reconcile parts of a severed-then-restored stream
  // without a reload) could repair the row between "check A passed" and
  // "check B passed", producing a false precondition read. Capturing both in
  // the same iteration and gating on that exact captured object removes that
  // gap. `content` rides along in the same snapshot for the informational
  // assertion + log below, but is intentionally excluded from the gate
  // itself -- see the file-level comment above for why.
  type PreconditionSnapshot = {
    runId: string | null;
    runStatus: string | null;
    content: string;
    producedFiles: string[];
    daemonStatus: string;
  };
  // A mutable ref object (rather than a plain `let`) sidesteps a TypeScript
  // control-flow narrowing quirk where a `let` reassigned only inside a
  // nested async closure gets narrowed to `never` at the point of use below.
  const preconditionRef: { current: PreconditionSnapshot | null } = { current: null };
  await expect
    .poll(async () => {
      const assistant = await findAssistantMessage(page, projectId, conversationId);
      const daemonStatusResponse = await page.request.get(`/api/runs/${runId}`);
      const daemonStatus = daemonStatusResponse.ok()
        ? ((await daemonStatusResponse.json()) as { status: string }).status
        : `http-${daemonStatusResponse.status()}`;
      const snapshot: PreconditionSnapshot = {
        runId: assistant?.runId ?? null,
        runStatus: assistant?.runStatus ?? null,
        content: assistant?.content ?? '',
        producedFiles: assistant?.producedFiles?.map((file) => file.name) ?? [],
        daemonStatus,
      };
      preconditionRef.current = snapshot;
      // Gate on the reliably-reproducible fields only (runId, runStatus,
      // producedFiles, daemonStatus). `content` is omitted from the match on
      // purpose so the gate does not depend on winning a race this harness
      // cannot control -- see the file-level comment above.
      return {
        runId: snapshot.runId,
        runStatus: snapshot.runStatus,
        producedFiles: snapshot.producedFiles,
        daemonStatus: snapshot.daemonStatus,
      };
    }, { timeout: 90_000, intervals: [200] })
    .toEqual({
      runId,
      runStatus: 'failed',
      producedFiles: [],
      daemonStatus: 'succeeded',
    });

  // Precondition assertion + informational log: `precondition` holds the
  // exact atomic snapshot that satisfied the gating poll above (message +
  // daemon status fetched back to back, no reload or other action in
  // between). The gating fields are re-asserted strictly here so the proof
  // is tied to the snapshot that actually triggered the reload below, not a
  // fresh read that could already have self-healed. `content` is logged for
  // visibility but is informational only, per the harness limitation
  // documented at the top of this test.
  const precondition = preconditionRef.current;
  console.log('[precondition] persisted message + daemon status:', JSON.stringify(precondition));
  expect(precondition?.runId, 'precondition: persisted runId must match the real run').toBe(runId);
  expect(precondition?.runStatus, 'precondition: persisted runStatus must be failed').toBe('failed');
  expect(precondition?.producedFiles, 'precondition: persisted producedFiles must be empty').toEqual([]);
  expect(
    precondition?.daemonStatus,
    'precondition: the daemon must independently report succeeded',
  ).toBe('succeeded');

  // Stop severing the stream so the reload/reattach recovery pass can behave
  // normally -- the bug is about what recovery does with the already-
  // mismatched persisted row, not about a stream that is still broken.
  // unrouteAll (not a string-matched unroute) guarantees the handler
  // registered above is actually removed before reload.
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expectWorkspaceReady(page);

  // Required post-reload behavior:
  //   1. content recovers (no longer empty)
  //   2 + 3. producedFiles is repopulated with the real artifact
  //   4. the SAME runId + conversationId are reattached in place, not a
  //      recreated run/conversation
  await expect
    .poll(async () => {
      const messages = await listConversationMessages(page, projectId, conversationId);
      const assistant = messages.find((message) => message.role === 'assistant');
      return {
        assistantMessages: messages.filter((message) => message.role === 'assistant').length,
        runId: assistant?.runId ?? null,
        runStatus: assistant?.runStatus ?? null,
        hasContent: Boolean(assistant?.content && assistant.content.trim().length > 0),
        producedFiles: assistant?.producedFiles?.map((file) => file.name) ?? [],
      };
    }, { timeout: 30_000 })
    .toEqual({
      assistantMessages: 1,
      runId,
      runStatus: 'succeeded',
      hasContent: true,
      producedFiles: [SLOW_RELOAD_FILE],
    });

  // Same project + conversation after reload, not a recreated one.
  const postReload = await currentProjectContext(page);
  expect(postReload.projectId).toBe(projectId);
  expect(postReload.conversationId).toBe(conversationId);

  // The run's artifact project file exists in project storage.
  await expectProjectFileToContain(page, projectId, SLOW_RELOAD_FILE, SLOW_RELOAD_HEADING);
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
  await dismissPrivacyDialog(page);
  await openNewProjectModalFromProjects(page);
  await page.getByTestId('new-project-tab-prototype').click();
  await page.getByTestId('new-project-name').fill(name);
  await page.getByTestId('create-project').click();
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

async function dismissPrivacyDialog(page: Page) {
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible()) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
}

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  await page.getByText('Loading Open Design…').waitFor({ state: 'hidden', timeout: T.long });
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

function isCreateRunResponse(response: Response): boolean {
  const url = new URL(response.url());
  return url.pathname === '/api/runs' && response.request().method() === 'POST';
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

async function setBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  await installBrowserAgentConfig(page, agentId);
  await page.evaluate(installConfig, { key: STORAGE_KEY, id: agentId, env: fakeRuntimes[agentId].env });
}

async function installBrowserAgentConfig(page: Page, agentId: FakeAgentId) {
  await page.addInitScript(installConfig, {
    key: STORAGE_KEY,
    id: agentId,
    env: fakeRuntimes[agentId].env,
  });
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

async function currentProjectContext(
  page: Page,
): Promise<{ conversationId: string; projectId: string }> {
  const current = new URL(page.url());
  const [, projects, projectId] = current.pathname.split('/');
  if (projects !== 'projects' || !projectId) {
    throw new Error(`unexpected project route: ${current.pathname}`);
  }
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

async function findAssistantMessage(page: Page, projectId: string, conversationId: string) {
  const messages = await listConversationMessages(page, projectId, conversationId);
  return messages.find((message) => message.role === 'assistant');
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
      content?: string;
      runId?: string;
      runStatus?: string;
      producedFiles?: Array<{ name: string }>;
    }>;
  };
  return body.messages;
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
