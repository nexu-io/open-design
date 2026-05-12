/**
 * Critique Theater end-to-end coverage (Phase 11).
 *
 * Activation history. The earlier revision of this file was parked behind
 * `test.describe.fixme` because the route at `/` did not mount the
 * Theater (`<CritiqueTheaterMount>` only renders inside `<ProjectView>`,
 * i.e. on `/projects/:id`) and because the single-shot SSE fixture
 * streamed `run_started` through `ship` in one body, which collapses the
 * UI to the shipped surface before any assertion can observe the live
 * stage (Codex P2 on PR #1320).
 *
 * This revision activates the suite in three moves:
 *
 *   1. Setup creates a real project through the daemon `POST /api/projects`
 *      and navigates to `/projects/:id`, so the mount actually renders.
 *      Pattern mirrors `app-design-files.test.ts`; agents are stubbed at
 *      `**\/api/agents` so the project-create lane does not depend on
 *      whatever agents the host machine has installed.
 *
 *   2. The SSE fixture is split. `LIVE_PREFIX` streams only enough frames
 *      to leave the reducer in `running`; `FULL_TRANSCRIPT` continues to
 *      `shipped`. Live-stage and interrupt assertions consume the prefix
 *      only; shipped-state assertions consume the full transcript and do
 *      not also claim the live stage was visible (the two phases are
 *      mutually exclusive surfaces).
 *
 *   3. The visual-regression cases stay parked at the per-test level via
 *      `test.fixme`, because their PNG baselines are not yet committed.
 *      The follow-up that lands the baselines flips those four lines to
 *      `test` and runs Playwright with `--update-snapshots` on first run.
 *      Suite-level activation does not block on that follow-up.
 *
 * Determinism boundary: the daemon owns project state (creation, metadata,
 * conversation persistence). The e2e harness owns the SSE event delivery
 * via `page.route('**\/api/projects/*\/events')` so every CI run sees the
 * same critique frames for the same screenshot baseline.
 */

import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

const STORAGE_KEY = 'open-design:config';

interface CritiqueFrame {
  event: string;
  data: Record<string, unknown>;
}

const LIVE_PREFIX: CritiqueFrame[] = [
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
];

const TERMINAL_SUFFIX: CritiqueFrame[] = [
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

const FULL_TRANSCRIPT = [...LIVE_PREFIX, ...TERMINAL_SUFFIX];

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

async function stubAgents(page: Page): Promise<void> {
  await page.route('**/api/agents', async (route: Route) => {
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
 * Stub the daemon interrupt endpoint with a 204 ack.
 *
 * Why this exists (Codex P1 + lefarcen P1 on PR #1483): the e2e suite
 * drives the Theater through a synthetic SSE fixture, but
 * `runOrchestrator` never actually registers `runId: 'e2e-run-1'` with
 * the daemon. When the user clicks Interrupt, the mount's
 * wait-for-daemon-ack pattern hits `POST /api/projects/:id/critique/
 * :runId/interrupt`, the real daemon answers 404 (unknown run), the
 * mount clears `interruptPending`, and the assertion times out.
 *
 * Stubbing the route with a 2xx mirrors the production happy path for
 * a known run without standing up a real critique session. Idempotent;
 * applied in beforeEach so every test sees a deterministic ack even if
 * only the interrupt test actually drives the click.
 */
async function stubInterruptEndpoint(page: Page): Promise<void> {
  await page.route('**/api/projects/*/critique/*/interrupt', async (route: Route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

/**
 * Create a project through the real daemon and return to the caller a
 * URL the page can navigate to. The daemon owns the project row;
 * `stubProjectEvents` overrides only the SSE channel. Project ids are
 * scoped per test so concurrent Playwright workers do not collide.
 */
async function seedProject(page: Page, slug: string): Promise<string> {
  const projectId = `e2e-critique-${slug}-${Date.now()}`;
  const response = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: `e2e critique ${slug}`,
    },
  });
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`seedProject failed: ${response.status()} ${body}`);
  }
  return projectId;
}

test.describe('Critique Theater e2e (Phase 11)', () => {
  test.beforeEach(async ({ page }) => {
    await bootAppWithCritiqueEnabled(page);
    await stubAgents(page);
    await stubInterruptEndpoint(page);
  });

  test('mounts the live stage with five panelist lanes mid-run', async ({ page }) => {
    // LIVE_PREFIX leaves the reducer in `running` so the Theater stage
    // is the rendered surface. No terminal frame arrives, so the
    // collapsed surface never replaces it during the assertions.
    await stubProjectEvents(page, LIVE_PREFIX);
    const projectId = await seedProject(page, 'live-stage');
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('region', { name: 'Design Jury' })).toBeVisible({
      timeout: 5_000,
    });
    for (const role of ['Designer', 'Critic', 'Brand', 'Accessibility', 'Copy']) {
      await expect(page.getByRole('group', { name: role })).toBeVisible();
    }
  });

  test('renders the shipped badge after the run terminates', async ({ page }) => {
    // FULL_TRANSCRIPT runs through `ship`, so the reducer settles on
    // `shipped` and `<TheaterCollapsed>` mounts. We do NOT assert the
    // live stage was visible here; the two surfaces are mutually
    // exclusive and racing them in one test was the source of the
    // earlier flake (Codex P2 on PR #1320).
    await stubProjectEvents(page, FULL_TRANSCRIPT);
    const projectId = await seedProject(page, 'shipped');
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText('Shipped')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Shipped at round 1/)).toBeVisible();
    await expect(page.getByText(/composite 8\.6/)).toBeVisible();
  });

  test('Esc mid-run transitions to interrupted with the best-composite summary', async ({ page }) => {
    await stubProjectEvents(page, LIVE_PREFIX);
    const projectId = await seedProject(page, 'interrupt');
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByRole('region', { name: 'Design Jury' })).toBeVisible();
    const interruptBtn = page.getByRole('button', { name: 'Interrupt' });
    await expect(interruptBtn).toBeVisible();
    await interruptBtn.focus();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Interrupted')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Interrupted at round/)).toBeVisible();
  });

  test('Theater states expose a valid role tree (region + 5 panelist groups)', async ({ page }) => {
    await stubProjectEvents(page, LIVE_PREFIX);
    const projectId = await seedProject(page, 'a11y');
    await page.goto(`/projects/${projectId}`);
    const stage = page.getByRole('region', { name: 'Design Jury' });
    await expect(stage).toBeVisible();
    for (const role of ['Designer', 'Critic', 'Brand', 'Accessibility', 'Copy']) {
      await expect(stage.getByRole('group', { name: role })).toBeVisible();
    }
    await expect(stage.getByRole('button', { name: 'Interrupt' })).toBeVisible();
  });

  // Visual regression at three viewports. Parked per-test until the
  // baseline-seeding follow-up commits the first PNGs via
  // `playwright test --update-snapshots`. The four cases stay visible
  // to `--list` so the suite count does not flap when they activate.
  for (const vp of [
    { width: 375, height: 720, label: 'mobile' },
    { width: 768, height: 1024, label: 'tablet' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    test.fixme(`visual regression - shipped state @ ${vp.label}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await stubProjectEvents(page, FULL_TRANSCRIPT);
      const projectId = await seedProject(page, `visual-${vp.label}`);
      await page.goto(`/projects/${projectId}`);
      await expect(page.getByText('Shipped')).toBeVisible({ timeout: 5_000 });
      await expect(page.locator('.theater-collapsed')).toHaveScreenshot(
        `theater-shipped-${vp.label}.png`,
        { animations: 'disabled' },
      );
    });
  }
});
