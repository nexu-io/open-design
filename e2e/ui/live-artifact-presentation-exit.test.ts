import { expect, test } from '@/playwright/suite';
import { applyStandardMocks, routeAgents } from '@/playwright/mock-factory';
import type { Page } from '@playwright/test';
import { T } from '@/timeouts';

test.describe.configure({ timeout: T.xlong });

const ARTIFACT_ID = 'live-artifact-exit-probe';
const ARTIFACT_TITLE = 'Exit Probe Artifact';

/**
 * A live artifact preview is a plain URL document with no Open Design bridge
 * injected (`/api/live-artifacts/:id/preview` serves the stored HTML as-is), and
 * the iframe is sandboxed without `allow-same-origin`. So it is cross-origin to
 * the host and cannot post anything back — including the `od:present-escape`
 * signal the main file viewer relies on.
 */
const PREVIEW_HTML = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;height:100%}main{height:100%;display:flex;align-items:center;justify-content:center;font:600 40px system-ui}</style>
</head><body><main><h1>Live Artifact Slide</h1></main></body></html>`;

function liveArtifactSummary(projectId: string) {
  return {
    schemaVersion: 1 as const,
    id: ARTIFACT_ID,
    projectId,
    title: ARTIFACT_TITLE,
    slug: 'exit-probe-artifact',
    status: 'active' as const,
    pinned: false,
    preview: { type: 'html' as const, entry: 'index.html' },
    refreshStatus: 'succeeded' as const,
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    updatedAt: new Date().toISOString(),
    lastRefreshedAt: new Date().toISOString(),
    hasDocument: true,
  };
}

/**
 * Stub only the live-artifact data source. Everything downstream — the tab
 * strip, the LiveArtifactViewer, its Present menu, the promotion CSS — is the
 * real product. A live artifact cannot be created through the UI: the create
 * endpoint is behind an agent tool grant, so this is the closest a UI test can
 * get to the real surface.
 */
async function routeLiveArtifact(page: Page, projectId: string) {
  const summary = liveArtifactSummary(projectId);
  await page.route('**/api/live-artifacts?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ artifacts: [summary] }),
    });
  });
  await page.route('**/api/live-artifacts/*/preview*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PREVIEW_HTML });
  });
  await page.route('**/api/live-artifacts/*/refreshes*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ refreshes: [] }) });
  });
  await page.route(`**/api/live-artifacts/${ARTIFACT_ID}?*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        artifact: {
          ...summary,
          document: {
            format: 'html_template_v1',
            templatePath: 'template.html',
            generatedPreviewPath: 'index.html',
            dataPath: 'data.json',
            dataJson: {},
          },
        },
      }),
    });
  });
}

async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const id = `pw-live-artifact-exit-${Date.now()}`;
  const response = await page.request.post('/api/projects', {
    data: { id, name, skillId: null, designSystemId: null },
  });
  expect(response.ok()).toBeTruthy();
  return id;
}

/** Open the artifact the way a user does: from the Design Files panel. */
async function openLiveArtifact(page: Page) {
  await expect(page.getByTestId('file-workspace')).toBeVisible();
  const row = page.getByTestId(`design-file-row-live:${ARTIFACT_ID}`);
  if (await row.count() === 0) {
    // The panel shows one category at a time; live artifacts get their own tab
    // only when at least one exists.
    await page.getByRole('button', { name: /live artifact/i }).first().click();
  }
  await row.click();
  await expect(page.getByTestId('live-artifact-preview-frame')).toBeVisible();
}

async function enterPresentation(page: Page) {
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  await page.getByRole('menuitem', { name: /^In this tab/i }).click();
  await expect(page.locator('.live-artifact-viewer.is-tab-present')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await applyStandardMocks(page);
  await routeAgents(page, [{ id: 'mock', name: 'Mock Agent', bin: 'mock-agent', available: true }]);
});

/**
 * Presenting a live artifact must leave a way out that a pointer can reach.
 *
 * The exit control is the last resort by construction: once the user clicks the
 * artifact, focus moves into the sandboxed cross-origin frame and Escape stops
 * arriving at the host document (OPEND-2156). The live artifact preview also
 * ships no Open Design bridge, so — unlike the file viewer — nothing can post
 * `od:present-escape` back either. That leaves exactly one escape, and it has to
 * actually be on top: not merely rendered, but the element a click at its own
 * position lands on.
 */
test('[P0] presented live artifact keeps an exit control a pointer can reach', async ({ page }) => {
  const projectId = await createProject(page, 'Live artifact exit stacking');
  await routeLiveArtifact(page, projectId);
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await openLiveArtifact(page);

  await enterPresentation(page);

  const exit = page.locator('.present-exit-btn');
  await expect(exit).toHaveCount(1);

  const hit = await exit.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    return {
      hasBox: r.width > 0 && r.height > 0,
      isSelf: at === el || (at != null && el.contains(at)),
      topMost: at ? `${at.tagName}.${String((at as HTMLElement).className || '').split(' ')[0]}` : null,
    };
  });
  expect(hit.hasBox).toBe(true);
  expect(hit, 'the exit control must be the element a click at its own position lands on').toMatchObject({ isSelf: true });
});

/**
 * The exit must work from the state the user is actually in: having clicked the
 * artifact, so focus is inside the sandboxed frame and no keyboard path is left.
 * This is the invariant — an exit that does not depend on the host document
 * holding focus — not the specific control that provides it.
 */
test('[P0] presented live artifact can be exited after the sandboxed frame takes focus', async ({ page }) => {
  const projectId = await createProject(page, 'Live artifact exit escape');
  await routeLiveArtifact(page, projectId);
  await page.goto(`/projects/${projectId}`, { waitUntil: 'domcontentloaded' });
  await openLiveArtifact(page);

  await enterPresentation(page);

  // Put focus where a presenting user puts it: inside the artifact.
  const frameBox = await page.getByTestId('live-artifact-preview-frame').boundingBox();
  expect(frameBox).not.toBeNull();
  await page.mouse.click(
    Math.round(frameBox!.x + frameBox!.width / 2),
    Math.round(frameBox!.y + frameBox!.height / 2),
  );
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe('IFRAME');

  // Escape is gone now, by design of the sandbox. The pointer path must remain.
  await page.locator('.present-exit-btn').click({ timeout: 10_000 });
  await expect(page.locator('.live-artifact-viewer.is-tab-present')).toHaveCount(0);
});
