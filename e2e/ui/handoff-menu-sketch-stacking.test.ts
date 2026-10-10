import { expect, test } from '@/playwright/suite';
import { routeAgents } from '@/playwright/mock-factory';
import { openAllProjectFiles } from '@/playwright/workspace';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

// Regression: with a sketch tab open, the header "open in editor" dropdown
// painted UNDER the Excalidraw toolbar island. `.ws-tabs-shell` carries
// `z-index: 4`, which makes it a stacking context, so `.handoff-menu`'s own
// `z-index: 50` is trapped inside it — and Excalidraw's toolbar layer also
// sits at 4 (`--zIndex-layerUI`) while painting later in DOM order, so it
// wins. The fix lifts the tab shell while the handoff menu is open.

const STORAGE_KEY = 'open-design:config';

test.describe.configure({ timeout: T.xlong });

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
        privacyDecisionAt: 1,
        telemetry: { metrics: false, content: false, artifactManifest: false },
      }),
    );
  }, STORAGE_KEY);
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
});

test('[P1] handoff dropdown paints above the sketch canvas toolbar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const projectId = `handoff-sketch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const created = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Handoff over sketch',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(created.ok(), `create project: ${await created.text()}`).toBeTruthy();

  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  await openAllProjectFiles(page);
  await page.getByTestId('design-files-empty-new-sketch').click();
  await expect(page.getByTestId('sketch-excalidraw-editor')).toBeVisible();

  await page.getByTestId('handoff-caret').click();
  const menu = page.getByTestId('handoff-menu');
  await expect(menu).toBeVisible();

  const probe = await probeMenuOverToolbar(page);
  expect(probe.overlapped, 'handoff menu and sketch toolbar do not overlap — probe is vacuous').toBe(true);
  expect(
    probe.leaks,
    `Sketch toolbar paints over the open handoff menu at: ${JSON.stringify(probe.leaks)}`,
  ).toEqual([]);
});

async function probeMenuOverToolbar(page: Page) {
  return page.evaluate(() => {
    const menu = document.querySelector('[data-testid="handoff-menu"]');
    const toolbar =
      document.querySelector('.excalidraw .App-toolbar') ??
      document.querySelector('.excalidraw .App-toolbar-content');
    if (!menu || !toolbar) throw new Error('menu or excalidraw toolbar not found');
    const m = menu.getBoundingClientRect();
    const t = toolbar.getBoundingClientRect();
    const left = Math.max(m.left, t.left);
    const right = Math.min(m.right, t.right);
    const top = Math.max(m.top, t.top);
    const bottom = Math.min(m.bottom, t.bottom);
    if (right <= left || bottom <= top) return { overlapped: false, leaks: [] };
    const leaks: Array<{ x: number; y: number; hit: string }> = [];
    for (const fx of [0.25, 0.5, 0.75]) {
      for (const fy of [0.35, 0.65]) {
        const x = Math.round(left + (right - left) * fx);
        const y = Math.round(top + (bottom - top) * fy);
        const hit = document.elementFromPoint(x, y);
        if (!hit?.closest('[data-testid="handoff-menu"]')) {
          leaks.push({
            x,
            y,
            hit:
              hit instanceof HTMLElement
                ? hit.className.toString().slice(0, 60) || hit.tagName
                : (hit?.tagName ?? 'null'),
          });
        }
      }
    }
    return { overlapped: true, leaks };
  });
}
