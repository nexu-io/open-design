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
import { applyStandardMocks } from '@/playwright/mock-factory';
import { AMR_PERSONAL_WORKSPACE_CONTEXT, mockAmrPersonalWorkspace } from '@/playwright/amr';

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
  // Seeds localStorage + /api/app-config with privacyDecisionAt set, so the
  // first-run privacy-consent surface doesn't render over the composer and
  // interfere with the hover/geometry assertions below.
  await applyStandardMocks(page);

  // Establish write authority deterministically instead of racing the real
  // GET /api/projects/:id/workspace-scope round trip: useProjectWorkspaceScope
  // starts `loading: true`, and while it's loading (with no session-local
  // creation witness, since this project was created via a raw API POST
  // rather than the UI create flow) useProjectCollab.viewerOnly fails closed.
  // DesignSystemPicker closes its popover whenever `disabled` (viewerOnly)
  // flips, so a slow/late-resolving real request could shut the popover mid
  // assertion. Same fixture project-management-flows.test.ts's
  // "write authority" coverage uses.
  await mockAmrPersonalWorkspace(page);
  await page.route('**/api/projects/*/workspace-scope', async (route) => {
    const [, projectId] = new URL(route.request().url()).pathname.match(
      /\/api\/projects\/([^/]+)/,
    ) ?? [];
    await route.fulfill({
      json: {
        scope: {
          kind: 'personal',
          projectId,
          workspaceId: AMR_PERSONAL_WORKSPACE_CONTEXT.workspaceId,
          visibility: 'personal',
          context: AMR_PERSONAL_WORKSPACE_CONTEXT,
        },
      },
    });
  });

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

// Review follow-up on the fixed-height conversion: a hard 220px floor would
// render a 220px popover even when the chosen side has less space, pushing it
// past the viewport edge (top for upward placement, bottom for downward).
// Content-driven sizing used to mask this in short windows; with a fixed
// height the popover itself must clamp to the available side space, like the
// New Project picker already does (see new-project-ds-picker-clipping.test.ts).
//
// #5517/#6142 moved this trigger from a separate chrome-header pill into a
// single inline icon in the composer's own icon row (composer-design-system-
// trigger), which is itself always docked a fixed, small distance above the
// composer pane's bottom edge. That distance stays constant across viewport
// heights, so spaceBelow is always tiny (well under the 320px openUp
// threshold) and spaceAbove is always the larger side: this trigger opens
// upward in every reachable viewport size, short or tall. There is no longer
// a composer surface that can drive the downward branch, so only the upward
// clamp is exercised here. `clampHeight` in DesignSystemPicker.tsx applies
// the identical formula to spaceAbove and spaceBelow, so this still covers
// the downward branch's math even though this trigger can't reach it live.
test('[P1] popover stays inside a short viewport (upward placement)', async ({ page }) => {
  // Short enough that spaceAbove drops under the 220px preferred minimum
  // (the trigger sits ~50-60px above the composer pane's bottom edge
  // regardless of viewport height), but tall enough for the app shell to
  // still lay out normally.
  await page.setViewportSize({ width: 1280, height: 260 });
  await page.goto('/');
  await createProject(page, 'DS picker short viewport up');
  await expect(page.getByTestId('chat-composer')).toBeVisible();

  await openDesignSystemPicker(page);
  const popover = page.getByTestId('project-ds-picker-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveAttribute('data-placement', 'up');
  await expectPopoverInsideViewport(page, 'up');
});

async function expectPopoverInsideViewport(page: Page, placement: 'up' | 'down') {
  const geometry = await page
    .getByTestId('project-ds-picker-popover')
    .evaluate((el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        viewportH: window.innerHeight,
      };
    });

  // Confirm the case genuinely exercises the tight branch: the popover must
  // have had less than the 220px preferred minimum available on its side.
  expect(
    geometry.height < 220,
    `Expected a sub-220px popover to exercise the clamped branch (${placement}); geometry: ${JSON.stringify(geometry)}`,
  ).toBe(true);

  expect(
    geometry.top,
    `Popover top (${geometry.top}) is above the viewport (${placement} placement). ${JSON.stringify(geometry)}`,
  ).toBeGreaterThanOrEqual(-1);
  expect(
    geometry.bottom,
    `Popover bottom (${geometry.bottom}) overflows the short viewport (${placement} placement). ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.viewportH + 1);
}

async function openDesignSystemPicker(page: Page) {
  const composer = page.getByTestId('chat-composer');
  await composer.getByTestId('composer-design-system-trigger').click();
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
