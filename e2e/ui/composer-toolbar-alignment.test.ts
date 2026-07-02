// Composer footer toolbar alignment.
//
// The composer's bottom row mixes five controls authored in five different
// components — the + icon (.icon-btn), the working-dir pill
// (.working-dir-pill-trigger), the agent avatar (.avatar-agent-trigger), the
// session-mode "Design"/CLI toggle (.session-mode-toggle__trigger) and Send
// (.composer-send). The composer mounts under `.chat-composer-fixed-layer` (a
// body-level portal), so the `.app`-scoped "one control system" normalization
// in chat.css never reached it and the controls drifted to 28/30/32px. Even
// though the row centers them, the differing heights left the pills and Send
// visibly misaligned against the left buttons.
//
// This spec is the regression boundary: every interactive control in the
// composer row must share one height and one vertical center so the toolbar
// reads as a single row.

import { randomUUID } from 'node:crypto';
import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';

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
});

test('[P1] composer footer controls share one height and baseline', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer toolbar alignment');
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-send')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const row = document.querySelector('.composer-row');
    if (!row) return { error: 'no .composer-row' as const };
    const selectors = [
      '.icon-btn',
      '.working-dir-pill-trigger',
      '.avatar-agent-trigger',
      '.session-mode-toggle__trigger',
      '.composer-send',
    ];
    const controls: Array<{ sel: string; height: number; center: number }> = [];
    for (const sel of selectors) {
      const el = row.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      controls.push({ sel, height: r.height, center: r.top + r.height / 2 });
    }
    return { controls };
  });

  if ('error' in metrics) throw new Error(metrics.error);
  const { controls } = metrics;

  // The toolbar should never collapse to a single control; if it does, the
  // selectors below are stale and the height assertion is meaningless.
  expect(controls.length).toBeGreaterThanOrEqual(4);

  const heights = controls.map((c) => c.height);
  const centers = controls.map((c) => c.center);
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

  // One control system: identical heights. On main these drift (e.g. the +
  // at 32px, the working-dir pill at 28px, Send at 30px) and this fails.
  expect(spread(heights), `control heights: ${JSON.stringify(controls)}`).toBeLessThanOrEqual(1);
  // ...and a shared vertical center so nothing rides high or low in the row.
  expect(spread(centers), `control centers: ${JSON.stringify(controls)}`).toBeLessThanOrEqual(1);
});

async function createProject(page: Page, projectName: string): Promise<void> {
  const response = await page.request.post('/api/projects', {
    data: {
      id: randomUUID(),
      name: projectName,
      skillId: null,
      designSystemId: null,
      metadata: { kind: 'prototype', nameSource: 'user' },
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as {
    project: { id: string };
    conversationId: string;
  };
  await page.goto(`/projects/${body.project.id}/conversations/${body.conversationId}`);
}
