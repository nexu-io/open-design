// Composer footer card layering + inset.
//
// Follow-up to the alignment fix (#3949). The composer mounts under
// `.chat-composer-fixed-layer`, whose shell had `padding: 0`, so the staged
// chips, the input field, and the toolbar all hugged the card's rounded frame
// — the + and Send buttons sat flush against the left/right edges with no
// margin, and a redundant toolbar divider stacked an extra line into the
// footer. This spec pins the polished card: every edge gets an even inset and
// the divider is gone, so the footer reads as one tidy card.
//
// These invariants are pane-width independent (they follow from the shell's
// fixed padding and the removed border), so they don't depend on the e2e
// viewport width the way label-collapse would.

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

test('[P1] composer footer sits inset inside the card with no toolbar divider', async ({ page }) => {
  await page.goto('/');
  await createProject(page, 'Composer footer card');
  await expect(page).toHaveURL(/\/projects\//);
  await expect(page.getByTestId('chat-composer')).toBeVisible();
  await expect(page.getByTestId('chat-send')).toBeVisible();

  const m = await page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector(sel);
      return el ? el.getBoundingClientRect() : null;
    };
    const shell = rect('.composer-shell');
    const send = rect('.composer-row .composer-send');
    const plus = rect('.composer-row .icon-btn');
    const input = rect('.composer-input-wrap');
    const row = document.querySelector('.composer-row');
    const rowBorderTop = row ? getComputedStyle(row).borderTopWidth : null;
    if (!shell || !send || !plus || !input) return { error: 'missing composer parts' as const };
    return {
      sendRightInset: shell.right - send.right,
      plusLeftInset: plus.left - shell.left,
      inputLeftInset: input.left - shell.left,
      inputRightInset: shell.right - input.right,
      rowBorderTop,
    };
  });

  if ('error' in m) throw new Error(m.error);

  // The + and Send must not hug the card frame — they get a real side margin.
  // On main (shell padding: 0) these are ~1px and this fails.
  expect(m.sendRightInset, JSON.stringify(m)).toBeGreaterThanOrEqual(5);
  expect(m.plusLeftInset, JSON.stringify(m)).toBeGreaterThanOrEqual(5);
  // Input field inset evenly from both sides.
  expect(Math.abs(m.inputLeftInset - m.inputRightInset), JSON.stringify(m)).toBeLessThanOrEqual(1);
  expect(m.inputLeftInset, JSON.stringify(m)).toBeGreaterThanOrEqual(5);
  // No divider line above the toolbar — the white input field is the only
  // separator now. On main this is "1px"; here it must be "0px".
  expect(m.rowBorderTop, JSON.stringify(m)).toBe('0px');
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
