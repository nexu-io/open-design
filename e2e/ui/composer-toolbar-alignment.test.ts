// Composer footer toolbar alignment.
//
// The composer's bottom row mixes three controls authored in three different
// components — the + icon (.icon-btn), the agent avatar
// (.avatar-agent-trigger) and Send (.composer-send); the session-mode picker
// that used to sit between them left the row (#7635), and the working
// directory lives inside the + menu rather than as a pill of its own. The composer mounts under `.chat-composer-fixed-layer` (a
// body-level portal), so the `.app`-scoped "one control system" normalization
// in chat.css never reached it and the controls drifted to 28/30/32px. Even
// though the row centers them, the differing heights left the pills and Send
// visibly misaligned against the left buttons.
//
// This spec is the regression boundary: the utility controls share the compact
// 28px geometry, Send keeps its deliberate emphasis as the supplied 32px
// disc (#7635), and every control shares one vertical center so the toolbar
// reads as a single row.

import { randomUUID } from 'node:crypto';
import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

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
        privacyDecisionAt: 1,
        agentModels: {},
      }),
    );
  }, STORAGE_KEY);

  await page.route('**/api/app-config', async (route) => {
    await route.fulfill({
      json: {
        config: {
          onboardingCompleted: true,
          privacyDecisionAt: 1,
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

test('[P1] composer footer controls keep their size hierarchy on one baseline', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer toolbar alignment');
  await expect(page).toHaveURL(/\/projects\//);
  // A cold worker compiles the project route on first open, which can outlive
  // the default assertion window; gate on the loading screen clearing first.
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('chat-send')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const row = document.querySelector('.composer-row');
    if (!row) return { error: 'no .composer-row' as const };
    const selectors = [
      '.icon-btn',
      '.avatar-agent-trigger',
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

  // Every control the row is documented to carry must be found; a shorter
  // list means a selector went stale and the height assertions below would be
  // measuring less than the whole toolbar.
  expect(controls.map((control) => control.sel)).toEqual([
    '.icon-btn',
    '.avatar-agent-trigger',
    '.composer-send',
  ]);

  const centers = controls.map((c) => c.center);
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);

  const send = controls.find((control) => control.sel === '.composer-send');
  const utilityControls = controls.filter((control) => control.sel !== '.composer-send');
  expect(send?.height, `control heights: ${JSON.stringify(controls)}`).toBe(32);
  for (const control of utilityControls) {
    expect(control.height, `control heights: ${JSON.stringify(controls)}`).toBe(28);
  }

  // All controls share a vertical center so nothing rides high or low in the row.
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
