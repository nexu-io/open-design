// Mid-chat design-system switcher (issue #498 v1).
//
// Verifies that the "Skills and design systems" entry in the chat
// composer's Tools popover opens a picker, that picking a design
// system PATCHes the project, and that the subsequent chat run
// composes with the newly selected `designSystemId`. The legacy
// "Coming soon" affordance on this entry was the user-visible
// blocker for the feature; this spec is the regression boundary.

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

const DESIGN_SYSTEMS = [
  {
    id: 'paper',
    title: 'Paper',
    category: 'Product',
    summary: 'Warm utility system for product interfaces.',
    swatches: ['#F7F4EE', '#D6CBBF', '#1F2937', '#D97757'],
  },
  {
    id: 'editorial',
    title: 'Editorial',
    category: 'Editorial',
    summary: 'High-contrast editorial system with expressive type.',
    swatches: ['#111111', '#F6EFE6', '#C44536', '#F2C14E'],
  },
];

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

  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          agentId: 'mock',
          skillId: null,
          designSystemId: null,
          agentModels: {},
          agentCliEnv: {},
        },
      },
    });
  });

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

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
});

test('[P1] chat composer switches the project design system mid-chat', async ({ page }) => {
  // Capture every outbound run-create request so we can prove the chat
  // turn *after* the switch composes with the new design system rather
  // than stale in-memory state. The run + its SSE stream are stubbed so
  // the assertion does not depend on a live agent.
  const runRequestBodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/runs', async (route) => {
    const raw = route.request().postData();
    if (raw) {
      try {
        runRequestBodies.push(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        // Non-JSON body — ignore; the assertion below will surface it.
      }
    }
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: '{"runId":"mock-run"}',
    });
  });
  await page.route('**/api/runs/*/events', async (route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: ['event: end', 'data: {"code":0,"status":"succeeded"}', '', ''].join('\n'),
    });
  });

  await page.goto('/');
  await createProject(page, 'Mid-chat DS switch');
  await expectWorkspaceReady(page);

  const initial = await fetchCurrentProject(page);
  // The freshest project picks up the app-config default DS; clear it on
  // the server so the picker has a meaningful "no DS bound" starting
  // state to switch away from.
  await page.request.patch(`/api/projects/${initial.id}`, {
    data: { designSystemId: null },
  });

  await openImportTab(page);

  const dsEntry = page.getByTestId('composer-import-design-systems');
  await expect(dsEntry).toBeEnabled();
  await dsEntry.click();

  await expect(page.getByTestId('composer-ds-picker')).toBeVisible();
  await page
    .getByTestId('composer-ds-picker-search')
    .fill('editorial');
  await page.getByTestId('composer-ds-picker-item-editorial').click();

  // The composer closes the popover on a successful switch, so the
  // picker disappears and the project mirrors the new DS.
  await expect(page.getByTestId('composer-ds-picker')).toHaveCount(0);

  const after = await fetchCurrentProject(page);
  expect(after.designSystemId).toBe('editorial');

  // The regression boundary: send a chat turn and assert the outbound
  // run carries the *switched* design system. If the composer kept
  // composing from a stale `project` mirror, `designSystemId` here would
  // still be `null` even though the server record was updated.
  const input = page.getByTestId('chat-composer-input');
  await expect(input).toBeVisible();
  await input.fill('Lay out the landing hero');
  const sendButton = page.getByTestId('chat-send');
  await expect(sendButton).toBeEnabled();
  await Promise.all([
    page.waitForRequest(
      (req) => req.url().includes('/api/runs') && req.method() === 'POST',
    ),
    sendButton.click(),
  ]);

  expect(runRequestBodies.length).toBeGreaterThan(0);
  expect(runRequestBodies[0]?.designSystemId).toBe('editorial');
});

async function openImportTab(page: Page) {
  // The leading "tools" button in the composer host the import menu.
  await page.getByLabel(/Open CLI and model settings/i).click();
  const importTab = page.getByRole('tab', { name: /import/i });
  if (await importTab.isVisible().catch(() => false)) {
    await importTab.click();
  }
}

async function createProject(page: Page, projectName: string): Promise<void> {
  const response = await page.request.post('/api/projects', {
    data: {
      id: randomUUID(),
      name: projectName,
      skillId: null,
      designSystemId: null,
      metadata: {
        kind: 'prototype',
        nameSource: 'user',
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: { id: string };
    conversationId: string;
  };
  await page.goto(`/projects/${body.project.id}/conversations/${body.conversationId}`);
}

async function expectWorkspaceReady(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-composer-input')).toBeVisible();
  await expect(page.getByTestId('file-workspace')).toBeVisible();
}

async function fetchCurrentProject(page: Page): Promise<{ id: string; designSystemId: string | null }> {
  const url = new URL(page.url());
  // The web routes a live project as `/projects/:projectId/conversations/:conversationId`,
  // so naive `.pop()` extraction picks the conversation id and the subsequent
  // `/api/projects/:id` GET 404s. Match the segment explicitly the same way
  // `project-management-flows.test.ts` and `entry-configuration-flows.test.ts` do.
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: { id: string; designSystemId: string | null };
  };
  return body.project;
}
