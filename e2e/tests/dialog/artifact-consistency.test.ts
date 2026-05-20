// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { chromium, expect as playwrightExpect, type Browser, type Page } from '@playwright/test';
import { afterEach, describe, expect, test } from 'vitest';

import { createFakeAgentRuntimes } from '@/fake-agents';
import type { ProjectFile } from '@/vitest/artifacts';
import { requestJson, requestText } from '@/vitest/http';
import { listMessages, type E2eChatMessage } from '@/vitest/messages';
import { createSmokeSuite } from '@/vitest/smoke-suite';

const PROMPT = 'Create a deterministic smoke artifact';
const FILE_NAME = 'real-daemon-smoke.html';
const HEADING = 'Real Daemon Smoke';
const STORAGE_KEY = 'open-design:config';

type ProjectResponse = {
  conversationId: string;
  project: {
    id: string;
    metadata?: {
      kind?: string;
    };
    name: string;
  };
};

describe('dialog artifact consistency', () => {
  let browser: Browser | null = null;

  afterEach(async () => {
    await browser?.close();
    browser = null;
  });

  test('keeps run status, saved message, persisted file metadata, and raw artifact content aligned', async () => {
    const suite = await createSmokeSuite('dialog-artifact-consistency');

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
          name: 'Dialog artifact consistency project',
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
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.evaluate(({ projectId, conversationId }) => {
        const target = `/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`;
        window.history.pushState(null, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, { projectId: project.project.id, conversationId: project.conversationId });
      await expectWorkspaceReady(page);

      const createRunResponse = await sendPrompt(page, PROMPT);
      const { runId } = (await createRunResponse.json()) as { runId: string };

      const persistedFile = await waitForProjectFile(webUrl, project.project.id, FILE_NAME);
      expect(persistedFile.name).toBe(FILE_NAME);
      expect(persistedFile.kind).toBe('html');
      expect(persistedFile.artifactManifest?.title).toBe(HEADING);
      expect(persistedFile.artifactManifest?.entry).toBe(FILE_NAME);
      expect(persistedFile.artifactManifest?.renderer).toBe('html');
      expect(persistedFile.artifactManifest?.metadata).toEqual(
        expect.objectContaining({
          artifactType: 'text/html',
          identifier: 'real-daemon-smoke',
          inferred: false,
        }),
      );

      const assistant = await waitForFinishedAssistantMessage(
        webUrl,
        project.project.id,
        project.conversationId,
        runId,
      );
      assertAssistantMessage(assistant);
      expect(assistant.runStatus).toBe('succeeded');
      expect(assistant.runId).toBe(runId);
      expect(assistant.producedFiles).toEqual([
        expect.objectContaining({
          artifactManifest: expect.objectContaining({
            entry: FILE_NAME,
            renderer: 'html',
            title: HEADING,
          }),
          name: FILE_NAME,
        }),
      ]);

      const fileListResponse = await requestJson<{ files: ProjectFile[] }>(
        webUrl,
        `/api/projects/${encodeURIComponent(project.project.id)}/files`,
      );
      expect(fileListResponse.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            artifactManifest: expect.objectContaining({
              entry: FILE_NAME,
              renderer: 'html',
              title: HEADING,
            }),
            kind: 'html',
            name: FILE_NAME,
          }),
        ]),
      );

      const rawHtml = await requestText(
        webUrl,
        `/api/projects/${encodeURIComponent(project.project.id)}/files/${FILE_NAME}`,
      );
      expect(rawHtml).toContain(HEADING);
      expect(rawHtml).toContain('Generated through the daemon run path.');

      await suite.report.json('summary.json', {
        assistantMessageId: assistant.id,
        conversationId: project.conversationId,
        file: persistedFile,
        listedMessage: assistant,
        listedFiles: fileListResponse.files,
        projectId: project.project.id,
        rawHtml,
        runId,
      });
    });
  }, 180_000);
});

function assertAssistantMessage(
  value: E2eChatMessage | undefined,
): asserts value is E2eChatMessage {
  expect(value, 'assistant message should exist').toBeDefined();
}

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

async function sendPrompt(page: Page, prompt: string) {
  const input = page.getByTestId('chat-composer-input');
  const sendButton = page.getByTestId('chat-send');
  await playwrightExpect(input).toBeVisible({ timeout: 5_000 });
  await input.click();
  await input.fill(prompt);
  await playwrightExpect(input).toHaveValue(prompt);
  await playwrightExpect(sendButton).toBeEnabled();
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/runs' && response.request().method() === 'POST';
  }, { timeout: 10_000 });
  await sendButton.click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  return response;
}

async function waitForProjectFile(
  webUrl: string,
  projectId: string,
  fileName: string,
): Promise<ProjectFile> {
  let latest: ProjectFile[] = [];
  await expect.poll(async () => {
    const response = await requestJson<{ files: ProjectFile[] }>(
      webUrl,
      `/api/projects/${encodeURIComponent(projectId)}/files`,
    );
    latest = response.files;
    return response.files.some((file) => file.name === fileName);
  }, { timeout: 30_000 }).toBe(true);

  const file = latest.find((candidate) => candidate.name === fileName);
  if (!file) throw new Error(`project file ${fileName} did not remain listed`);
  return file;
}

async function waitForFinishedAssistantMessage(
  webUrl: string,
  projectId: string,
  conversationId: string,
  runId: string,
): Promise<E2eChatMessage | undefined> {
  let latest: E2eChatMessage[] = [];
  await expect.poll(async () => {
    latest = await listMessages(webUrl, projectId, conversationId);
    const assistant = latest.find((message) => message.role === 'assistant' && message.runId === runId);
    return {
      producedFileNames: assistant?.producedFiles?.map((file) =>
        typeof file === 'object' && file !== null && 'name' in file
          ? String(file.name)
          : '',
      ) ?? [],
      runStatus: assistant?.runStatus ?? 'missing',
    };
  }, { timeout: 30_000 }).toEqual({
    producedFileNames: [FILE_NAME],
    runStatus: 'succeeded',
  });

  return latest.find((message) => message.role === 'assistant' && message.runId === runId);
}
