// Composer design-system picker hover stability.
//
// Repro: open the chat composer's design-system picker, type a query so the
// list shrinks to a couple of rows, then hover the filtered option. The right
// pane swaps the short "no design system" blurb for the much taller kit
// preview, so a content-driven popover height grows on hover. The composer
// picker opens upward (bottom-anchored), so growth moves every row up under
// the stationary cursor; the cursor lands on a different row, the preview
// swaps back, the popover shrinks, and the loop repeats — visible flicker.
//
// The invariant that kills the loop: once open, hovering an option must not
// resize or move the popover. With the full list the popover is already
// clamped at its max height, which is why the bug only shows after filtering.

import { randomUUID } from 'node:crypto';
import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { routeAgents } from '@/playwright/mock-factory';

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

  await routeAgents(page, [
    {
      id: 'mock',
      name: 'Mock Agent',
      bin: 'mock-agent',
      available: true,
      version: 'test',
      models: [{ id: 'default', label: 'Default' }],
    },
  ]);

  await page.route('**/api/design-systems', async (route) => {
    await route.fulfill({ json: { designSystems: DESIGN_SYSTEMS } });
  });
});

test('[P1] hovering a filtered design system does not resize or move the popover', async ({
  page,
}) => {
  await page.goto('/');
  await createProject(page, 'DS picker hover stability');
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  // Start with no design system bound so the popover opens on the short
  // "no design system" blurb — the low-height side of the oscillation.
  const projectId = currentProjectId(page);
  await page.request.patch(`/api/projects/${projectId}`, {
    data: { designSystemId: null },
  });

  await openDesignSystemPicker(page);
  const popover = page.getByTestId('project-ds-picker-popover');
  await expect(popover).toBeVisible();

  // Filter until the list is short enough that the preview pane, not the
  // list, would drive a content-sized popover height.
  await page.getByTestId('project-ds-picker-search').fill('editorial');
  const option = page.getByTestId('project-ds-picker-option-editorial');
  await expect(option).toBeVisible();

  const before = await popover.boundingBox();
  if (!before) throw new Error('Expected the popover to have a bounding box');

  await option.hover();
  await expect(page.getByTestId('project-ds-picker-preview-kit-wrap')).toBeVisible();

  // Sample the popover geometry for a while: a single post-hover measurement
  // could land on either phase of the oscillation and pass by luck. Every
  // sample must match the pre-hover box.
  for (let sample = 0; sample < 10; sample += 1) {
    const box = await popover.boundingBox();
    if (!box) throw new Error('Expected the popover to stay mounted while hovered');
    expect(
      Math.abs(box.height - before.height),
      `Popover height changed on hover (sample ${sample}): ${before.height} -> ${box.height}. ` +
        'Hover-driven preview content must not drive the popover size.',
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(box.y - before.y),
      `Popover top edge moved on hover (sample ${sample}): ${before.y} -> ${box.y}. ` +
        'A moving top edge shifts rows under the cursor and causes hover flicker.',
    ).toBeLessThanOrEqual(1);
    await page.waitForTimeout(50);
  }
});

async function openDesignSystemPicker(page: Page) {
  const composer = page.getByTestId('chat-composer');
  await composer.getByTestId('chat-plus-trigger').click();
  await page.getByTestId('composer-plus-design-system').click();
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

function currentProjectId(page: Page): string {
  const url = new URL(page.url());
  const [, projectId] = url.pathname.match(/\/projects\/([^/]+)/) ?? [];
  if (!projectId) throw new Error(`unexpected project route: ${url.pathname}`);
  return projectId;
}
