/**
 * Critique Theater end-to-end coverage (Phase 11).
 *
 * The plan splits this into four tasks:
 *   11.1 happy path (live debate -> shipped)
 *   11.2 interrupt path (Esc mid-run -> interrupted)
 *   11.3 visual regression at 375 / 768 / 1280
 *   11.4 a11y self-test (every state passes WCAG AA via the
 *        Playwright role-tree snapshot)
 *
 * Strategy: production critique runs originate inside a CLI session
 * (the orchestrator) and surface as `critique.*` SSE channels on the
 * project-events endpoint. Standing up the full pipeline inside the
 * e2e harness would mean a real daemon + a real model session, which
 * defeats the determinism we need for visual baselines. Instead, we
 * mock the project-events SSE stream and replay a deterministic
 * transcript pulled from the v1 fixture set so every CI run sees
 * the same Theater layout for the same screenshot baseline.
 *
 * Each test boots the app under `OD_CRITIQUE_ENABLED=true` via
 * localStorage so the `<CritiqueTheaterMount>` actually renders.
 * The fake daemon endpoint streams a deterministic critique
 * transcript and the assertions are about what the UI presents,
 * which is exactly the lens an e2e gate should apply.
 */

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

interface CritiqueFrame {
  event: string;
  data: Record<string, unknown>;
}

/** Deterministic transcript: open, one panelist closes round 1, ship. */
const TRANSCRIPT: CritiqueFrame[] = [
  {
    event: 'critique.run_started',
    data: {
      runId: 'e2e-run-1',
      protocolVersion: 1,
      cast: ['designer', 'critic', 'brand', 'a11y', 'copy'],
      maxRounds: 3,
      threshold: 8,
      scale: 10,
    },
  },
  {
    event: 'critique.panelist_open',
    data: { runId: 'e2e-run-1', round: 1, role: 'critic' },
  },
  {
    event: 'critique.panelist_dim',
    data: {
      runId: 'e2e-run-1', round: 1, role: 'critic',
      dimName: 'hierarchy', dimScore: 8.2, dimNote: 'clear',
    },
  },
  {
    event: 'critique.panelist_close',
    data: { runId: 'e2e-run-1', round: 1, role: 'critic', score: 8.2 },
  },
  {
    event: 'critique.round_end',
    data: {
      runId: 'e2e-run-1', round: 1, composite: 8.6, mustFix: 0,
      decision: 'ship', reason: 'threshold met',
    },
  },
  {
    event: 'critique.ship',
    data: {
      runId: 'e2e-run-1', round: 1, composite: 8.6, status: 'shipped',
      artifactRef: { projectId: 'e2e', artifactId: 'a-1' },
      summary: 'looks good',
    },
  },
];

function sseBody(frames: CritiqueFrame[]): string {
  let out = 'event: ready\ndata: {}\n\n';
  for (const f of frames) {
    out += `event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`;
  }
  return out;
}

async function bootAppWithCritiqueEnabled(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
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
        critiqueTheaterEnabled: true,
      }),
    );
  }, STORAGE_KEY);
}

async function stubProjectEvents(page: Page, frames: CritiqueFrame[]): Promise<void> {
  await page.route('**/api/projects/*/events', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
      body: sseBody(frames),
    });
  });
}

/**
 * Parked behind `test.describe.fixme` until the next follow-up PR
 * (PerishCode P1 on PR #1338). The suite as written assumes the route
 * at `/` mounts `<ProjectView>` and therefore renders
 * `<CritiqueTheaterMount>`, but the home route shows the entry gallery;
 * the mount only renders inside `/projects/:id`. The follow-up commit
 * replaces the `await page.goto('/')` calls with seeded-project
 * navigation (similar to `app-design-files.test.ts`), splits the SSE
 * fixture into a live prefix and a terminal suffix (Codex P2 on PR
 * #1320), and commits the first PNG baselines. Until that lands, the
 * suite would time out on every assertion; `fixme` skips at run time
 * while keeping the spec visible to the contributor who finishes the
 * wireup.
 */
test.describe.fixme('Critique Theater e2e (Phase 11) [awaiting full mount-route follow-up, see file header]', () => {
  test.beforeEach(async ({ page }) => {
    await bootAppWithCritiqueEnabled(page);
  });

  // Task 11.1: happy path
  test('renders the live stage, all five lanes, and the shipped badge', async ({ page }) => {
    await stubProjectEvents(page, TRANSCRIPT);
    await page.goto('/');
    // The Theater stage exposes role="region" with aria-label="Design Jury".
    await expect(page.getByRole('region', { name: 'Design Jury' })).toBeVisible({
      timeout: 5_000,
    });
    // Every panelist lane mounts a role="group" with the localized label.
    for (const role of ['Designer', 'Critic', 'Brand', 'Accessibility', 'Copy']) {
      await expect(page.getByRole('group', { name: role })).toBeVisible();
    }
    // The ship event flips us to the collapsed surface with the badge.
    await expect(page.getByText('Shipped')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Shipped at round 1/)).toBeVisible();
    await expect(page.getByText(/composite 8\.6/)).toBeVisible();
  });

  // Task 11.2: interrupt path
  test('Esc mid-run transitions to interrupted with the best-composite summary', async ({ page }) => {
    // Stream only the first three frames so the run stays mid-flight.
    await stubProjectEvents(page, TRANSCRIPT.slice(0, 3));
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Design Jury' })).toBeVisible();
    // The Interrupt button is the focus surface for the Esc keybind.
    const interruptBtn = page.getByRole('button', { name: 'Interrupt' });
    await expect(interruptBtn).toBeVisible();
    await interruptBtn.focus();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Interrupted')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Interrupted at round/)).toBeVisible();
  });

  // Task 11.3: visual regression at 3 viewports
  for (const vp of [
    { width: 375, height: 720, label: 'mobile' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    test(`visual regression - shipped state @ ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await stubProjectEvents(page, TRANSCRIPT);
      await page.goto('/');
      await expect(page.getByText('Shipped')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.theater-collapsed')).toHaveScreenshot(
        `theater-shipped-${vp.label}.png`,
        { animations: 'disabled' },
      );
    });
  }

  // Task 11.4: a11y self-test (Playwright's `getByRole` consults the
  // accessibility tree under the hood, so each `toBeVisible` here is
  // effectively a "this role + name reaches assistive tech" assertion.)
  test('Theater states expose a valid role tree (region + 5 panelist groups)', async ({ page }) => {
    await stubProjectEvents(page, TRANSCRIPT.slice(0, 3));
    await page.goto('/');
    const stage = page.getByRole('region', { name: 'Design Jury' });
    await expect(stage).toBeVisible();
    for (const role of ['Designer', 'Critic', 'Brand', 'Accessibility', 'Copy']) {
      await expect(stage.getByRole('group', { name: role })).toBeVisible();
    }
    // The Interrupt button is reachable via its accessible name (no
    // image-only buttons).
    await expect(stage.getByRole('button', { name: 'Interrupt' })).toBeVisible();
  });
});
