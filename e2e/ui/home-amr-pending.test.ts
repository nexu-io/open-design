import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';

import {
  gotoEntryHome,
  mockAmrPersonalWorkspace,
  seedBrowserConfig,
} from '@/playwright/amr';
import {
  applyStandardMocks,
  routeAgents,
  routeSuccessfulRuns,
  suppressWhatsNew,
} from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import { T } from '@/timeouts';

/*
 * OPEND-2614 · Home → project hand-off with OpenDesign Cloud (AMR).
 *
 * F6 (#7890) made a Home send flush the optimistic pending frame on the tick
 * the click lands — but only on the local-agent path. With AMR selected the
 * shell first awaits the pre-run balance gate (`GET /api/integrations/vela/
 * wallet` + `GET /api/workspace/billing?…&freshness=authoritative`, an
 * upstream Vela read of 1–2 s) and only then creates the project, so the user
 * sat on a frozen Home for that whole round trip.
 *
 * These cases pin the ORDER, not a stopwatch: the pending frame must be on
 * screen while the billing gate is still in flight, within one animation
 * frame of the click. The gate's verdict still lands before any project is
 * created — the blocked case below proves the dialog now sits over the
 * pending frame and a dismiss hands the draft back to Home.
 */

declare global {
  interface Window {
    __odHandoffProbe?: {
      frame: number;
      clickFrame: number | null;
      pendingFrame: number | null;
    };
  }
}

const AMR_AGENT = {
  id: 'amr',
  name: 'OpenDesign AMR',
  bin: 'vela',
  available: true,
  version: 'test',
  models: [{ id: 'glm-5', label: 'glm-5' }],
};

const AMR_CONFIG = {
  mode: 'daemon',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  agentId: 'amr',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  agentModels: {},
  privacyDecisionAt: 1,
  telemetry: { metrics: false, content: false, artifactManifest: false },
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Frame-accurate probe installed before the app boots: a rAF counter, the
 * frame the send button was clicked on, and the frame the pending frame's
 * root landed in the DOM. "≤ 1 frame" is then a plain subtraction.
 */
async function installHandoffProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = { frame: 0, clickFrame: null as number | null, pendingFrame: null as number | null };
    window.__odHandoffProbe = probe;
    const tick = () => {
      probe.frame += 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as Element | null;
        if (probe.clickFrame == null && target?.closest?.('[data-testid="home-hero-submit"]')) {
          probe.clickFrame = probe.frame;
        }
      },
      true,
    );
    new MutationObserver(() => {
      if (
        probe.pendingFrame == null
        && document.querySelector('[data-testid="project-creation-pending-view"]')
      ) {
        probe.pendingFrame = probe.frame;
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

async function readHandoffFrames(page: Page): Promise<number> {
  const probe = await page.evaluate(() => window.__odHandoffProbe ?? null);
  expect(probe?.clickFrame, 'send click was observed').not.toBeNull();
  expect(probe?.pendingFrame, 'pending frame was observed').not.toBeNull();
  return (probe!.pendingFrame as number) - (probe!.clickFrame as number);
}

/** Hold POST /api/projects until released; the create must not gate the frame. */
async function holdProjectCreate(page: Page) {
  const release = deferred();
  let requested = false;
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    requested = true;
    await release.promise;
    await route.continue();
  });
  return { release: release.resolve, requested: () => requested };
}

/** Hold the authoritative workspace billing read the AMR gate depends on. */
async function holdAmrBillingGate(page: Page) {
  const release = deferred();
  let held = false;
  await page.route('**/api/workspace/billing**', async (route) => {
    const url = new URL(route.request().url());
    if (
      route.request().method() === 'GET'
      && url.pathname === '/api/workspace/billing'
      && url.searchParams.get('freshness') === 'authoritative'
    ) {
      held = true;
      await release.promise;
    }
    await route.fallback();
  });
  return { release: release.resolve, held: () => held };
}

async function wireSignedInAmrHome(
  page: Page,
  options: { accountBalanceUsd?: string } = {},
): Promise<void> {
  await seedBrowserConfig(page, AMR_CONFIG);
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { config: AMR_CONFIG } });
  });
  await routeAgents(page, [AMR_AGENT]);
  await mockSignedInVelaAccount(page, { balanceUsd: options.accountBalanceUsd ?? '20.00' });
  await mockAmrPersonalWorkspace(page, undefined, {
    accountBalanceUsd: options.accountBalanceUsd ?? '20.00',
    accountCredits: 2_000,
    accountPlan: 'free',
  });
}

async function sendFromHome(page: Page, prompt: string): Promise<void> {
  const input = page.getByTestId('home-hero-input');
  await expect(input).toBeVisible({ timeout: T.medium });
  await input.fill(prompt);
  const submit = page.getByTestId('home-hero-submit');
  await expect(submit).toBeEnabled();
  await submit.click();
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
  await installHandoffProbe(page);
});

test('[P0] AMR send from Home enters the pending frame before the balance gate answers', async ({ page }) => {
  await wireSignedInAmrHome(page);
  const billing = await holdAmrBillingGate(page);
  const create = await holdProjectCreate(page);
  const runBodies: Array<Record<string, unknown>> = [];
  const runRequests = await routeSuccessfulRuns(page, {
    bodies: runBodies,
    runId: 'home-amr-pending-run',
  });

  await gotoEntryHome(page);
  await sendFromHome(page, 'Draft a landing page for a coffee subscription.');

  const pending = page.getByTestId('project-creation-pending-view');
  // The frame is up while the gate is still reading the wallet: nothing was
  // created yet, and the user already sees their prompt in the project shell.
  await expect(pending).toBeVisible({ timeout: T.short });
  expect(billing.held(), 'the balance gate was in flight').toBe(true);
  expect(create.requested(), 'no project was created before the verdict').toBe(false);
  await expect(page.getByTestId('project-creation-pending-chat')).toBeVisible();
  expect(await readHandoffFrames(page)).toBeLessThanOrEqual(1);

  // The verdict lands → the create leaves → the run starts, all behind the
  // same frame; the frame never flashes back to Home in between.
  billing.release();
  await expect.poll(() => create.requested(), { timeout: T.medium }).toBe(true);
  await expect(pending).toBeVisible();
  create.release();
  await runRequests.expectCount(1);
  expect(runBodies[0]).toMatchObject({ agentId: 'amr' });
  await expect(pending).toBeHidden({ timeout: T.medium });
  await expect(page.getByTestId('chat-composer')).toBeVisible({ timeout: T.medium });
});

test('[P0] blocked AMR send shows the balance dialog over the pending frame and hands the draft back', async ({ page }) => {
  await wireSignedInAmrHome(page, { accountBalanceUsd: '0.00' });
  const create = await holdProjectCreate(page);
  const prompt = 'Design a pricing page for an empty wallet.';

  await gotoEntryHome(page);
  await sendFromHome(page, prompt);

  const pending = page.getByTestId('project-creation-pending-view');
  const dialog = page.getByTestId('amr-balance-dialog');
  await expect(pending).toBeVisible({ timeout: T.short });
  await expect(dialog).toBeVisible({ timeout: T.medium });
  await expect(pending).toBeVisible();
  expect(create.requested(), 'a blocked send creates nothing').toBe(false);

  await dialog.getByRole('button', { name: /later|not now|稍后|暂不/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('home-hero-input')).toBeVisible({ timeout: T.medium });
  await expect(page.getByTestId('home-hero-input')).toHaveText(prompt);
  expect(create.requested()).toBe(false);
});

test('[P1] local-agent send from Home still enters the pending frame within a frame', async ({ page }) => {
  await applyStandardMocks(page);
  const create = await holdProjectCreate(page);
  const runRequests = await routeSuccessfulRuns(page, { runId: 'home-local-pending-run' });

  await gotoEntryHome(page);
  await sendFromHome(page, 'Draft a landing page with the local agent.');

  const pending = page.getByTestId('project-creation-pending-view');
  await expect(pending).toBeVisible({ timeout: T.short });
  expect(await readHandoffFrames(page)).toBeLessThanOrEqual(1);
  create.release();
  await runRequests.expectCount(1);
  await expect(pending).toBeHidden({ timeout: T.medium });
});
