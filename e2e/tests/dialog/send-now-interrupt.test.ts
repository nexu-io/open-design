// @vitest-environment node

// Send-now interrupt — the queued-send "send now" affordance.
//
// While a run is streaming, typing another turn queues it. Clicking the
// queued item's send-now (↩) arrow must interrupt the in-flight run and
// dispatch the queued turn immediately, instead of silently waiting for the
// current run to finish. This spec drives the real browser UI against a real
// daemon + fake agent: it starts a held (never-finishing) run, queues a second
// turn, clicks send-now, and asserts the held run is canceled and the queued
// turn dispatches as a fresh run.

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { chromium, expect as playwrightExpect, type Browser, type Page } from '@playwright/test';
import { afterEach, describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import { T } from '@/timeouts';
import { requestJson } from '@/vitest/http';
import { waitForRunTerminal } from '@/vitest/runs';
import { createSmokeSuite } from '@/vitest/suite';

const HELD_PROMPT = 'Hold the daemon run open until canceled for the send-now smoke';
const QUEUED_PROMPT = 'Create a deterministic smoke artifact';
const STORAGE_KEY = 'open-design:config';

type ProjectResponse = {
  conversationId: string;
  project: { id: string; name: string };
};

describe('dialog send-now interrupt', () => {
  let browser: Browser | null = null;

  afterEach(async () => {
    await browser?.close();
    browser = null;
  });

  test('interrupts the in-flight run and dispatches the queued turn when send-now is clicked', async () => {
    const suite = await createSmokeSuite('dialog-send-now-interrupt');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const fakeAgents = await createFakeAgentRuntimes({
        root: join(suite.scratchDir, 'fake-agents'),
        runtimeIds: ['codex'],
      });

      await requestJson<{ config: Record<string, unknown> }>(webUrl, '/api/app-config', {
        body: {
          agentCliEnv: { codex: fakeAgents.codex.env },
          agentId: 'codex',
          agentModels: { codex: { model: 'default', reasoning: 'default' } },
          designSystemId: null,
          onboardingCompleted: true,
          privacyDecisionAt: 1,
          skillId: null,
          telemetry: { artifactManifest: true, content: false, metrics: false },
        },
        method: 'PUT',
      });

      const project = await requestJson<ProjectResponse>(webUrl, '/api/projects', {
        body: {
          designSystemId: null,
          id: randomUUID(),
          metadata: { kind: 'prototype' },
          name: 'Dialog send-now interrupt project',
          pendingPrompt: null,
          skillId: null,
        },
      });

      browser = await chromium.launch();
      const context = await browser.newContext({ baseURL: webUrl });
      await context.addInitScript(({ key, codexEnv }) => {
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
            privacyDecisionAt: 1,
            agentModels: { codex: { model: 'default', reasoning: 'default' } },
            agentCliEnv: { codex: codexEnv },
            telemetry: { metrics: false, content: false, artifactManifest: true },
          }),
        );
      }, { key: STORAGE_KEY, codexEnv: fakeAgents.codex.env });

      const page = await context.newPage();
      page.setDefaultNavigationTimeout(T.xlong);
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForLoadingToClear(page);
      const target = `/projects/${encodeURIComponent(project.project.id)}/conversations/${encodeURIComponent(project.conversationId)}`;
      await page.goto(target, { waitUntil: 'domcontentloaded' });
      await expectWorkspaceReady(page);

      // Start a run that never finishes on its own — the conversation stays busy.
      const heldRunId = await sendComposerTurn(page, HELD_PROMPT);
      await waitForRunStatusIs(webUrl, heldRunId, 'running');

      // Type a second turn while busy; it is queued (no new run yet).
      await queueComposerTurn(page, QUEUED_PROMPT);
      await playwrightExpect(page.getByTestId('chat-queued-send-strip')).toBeVisible();

      // Click send-now on the queued item: the held run must be canceled and
      // the queued turn dispatched as a brand-new run.
      const newRunResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/runs'
          && response.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await page.getByTestId('chat-queued-send-now').click();

      // The interrupted run reaches a terminal (canceled) status.
      const terminal = await waitForRunTerminal(webUrl, heldRunId);
      expect(terminal.status).toBe('canceled');

      // ...and a fresh run was dispatched for the queued turn.
      const dispatched = await newRunResponse;
      expect(dispatched.ok()).toBe(true);
      const { runId: queuedRunId } = (await dispatched.json()) as { runId: string };
      expect(queuedRunId).not.toBe(heldRunId);

      // The queued strip drains once its only item has been dispatched.
      await playwrightExpect(page.getByTestId('chat-queued-send-strip')).toHaveCount(0);
    });
  }, 180_000);
});

async function expectWorkspaceReady(page: Page) {
  await waitForLoadingToClear(page);
  const privacyDialog = page.getByRole('region', { name: 'Help us improve Open Design' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /don't share|not now/i }).click();
    await playwrightExpect(privacyDialog).toHaveCount(0);
  }
  await playwrightExpect(page).toHaveURL(/\/projects\//);
  await playwrightExpect(page.getByTestId('chat-composer')).toBeVisible();
  await playwrightExpect(page.getByTestId('chat-composer-input')).toBeVisible();
  await playwrightExpect(page.getByTestId('file-workspace')).toBeVisible();
}

async function waitForLoadingToClear(page: Page) {
  const loading = page.getByText('Loading Open Design…');
  await loading.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
}

// Send a turn that starts a run immediately (conversation idle). Returns the runId.
async function sendComposerTurn(page: Page, prompt: string): Promise<string> {
  const input = page.getByTestId('chat-composer-input');
  await playwrightExpect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/runs'
      && response.request().method() === 'POST',
    { timeout: 10_000 },
  );
  await page.getByTestId('chat-send').click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const { runId } = (await response.json()) as { runId: string };
  return runId;
}

// Type and submit a turn while the conversation is busy; it is queued, so no
// POST /api/runs fires. The send button is shown (not Stop) because the
// composer has content.
async function queueComposerTurn(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  await input.click();
  await input.fill(prompt);
  await playwrightExpect(page.getByTestId('chat-send')).toBeEnabled();
  await page.getByTestId('chat-send').click();
}

async function waitForRunStatusIs(webUrl: string, runId: string, status: string) {
  await playwrightExpect
    .poll(
      async () => {
        const run = await requestJson<{ status: string }>(
          webUrl,
          `/api/runs/${encodeURIComponent(runId)}`,
        );
        return run.status;
      },
      { timeout: 15_000 },
    )
    .toBe(status);
}
