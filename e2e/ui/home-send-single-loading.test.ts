import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';

import { gotoEntryHome, mockAmrPersonalWorkspace, seedBrowserConfig } from '@/playwright/amr';
import { applyStandardMocks, routeAgents, routeSuccessfulRuns, suppressWhatsNew } from '@/playwright/mock-factory';
import { mockSignedInVelaAccount } from '@/playwright/visual';
import { T } from '@/timeouts';

/*
 * OPEND-2170 · one loading state from the Home send to the running turn.
 *
 * After the optimistic hand-off (F6 / OPEND-2614) the pending frame used to
 * drop the moment `POST /api/projects` answered, and ProjectView then walked
 * through its own loaders in the chat column — a whole-column spinner while
 * the conversation id resolved, then the "Loading" skeleton while the
 * transcript loaded, then an empty log until the auto-send painted the user
 * turn — three forms in ~300 ms, before the same prompt bubble and assistant
 * row the pending frame had already drawn came back.
 *
 * These cases pin the paint sequence, not a stopwatch: the hand-off frame must
 * stay on screen until the real transcript shows the user's message, and none
 * of the intermediate loaders may be visible in between. The right column is
 * checked the same way (it never had a loader on this branch; keep it so).
 */

declare global {
  interface Window {
    __odPaintLog?: Array<{ key: string; present: boolean; at: number }>;
    __odClickAt?: number;
  }
}

const SELECTORS = {
  creationPending: '[data-creation-phase="pending"]',
  chatPaneSpinner: '[data-testid="chat-pane-loading"]',
  chatSkeleton: '.chat-loading-state',
  designFilesReloading: '[data-testid="design-files-reloading"]',
  userMessage: '[data-testid="chat-log"] .msg.user',
} as const;

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

/**
 * In-page paint log: one entry per presence flip of each watched selector. A
 * node counts as present only when it is laid out and not `visibility:
 * hidden`, so a loader parked under the hand-off frame does not register.
 */
async function installPaintLog(page: Page): Promise<void> {
  await page.addInitScript((selectors: Record<string, string>) => {
    const log: Array<{ key: string; present: boolean; at: number }> = [];
    window.__odPaintLog = log;
    const seen: Record<string, boolean> = {};
    const isShown = (selector: string): boolean => {
      for (const node of Array.from(document.querySelectorAll(selector))) {
        const el = node as HTMLElement;
        if (el.getClientRects().length === 0) continue;
        if (getComputedStyle(el).visibility === 'hidden') continue;
        return true;
      }
      return false;
    };
    const check = () => {
      const now = performance.now();
      for (const [key, selector] of Object.entries(selectors)) {
        const present = isShown(selector);
        if (seen[key] !== present) {
          seen[key] = present;
          log.push({ key, present, at: now });
        }
      }
    };
    new MutationObserver(check).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target as Element | null;
        if (window.__odClickAt == null && target?.closest?.('[data-testid="home-hero-submit"]')) {
          window.__odClickAt = performance.now();
        }
      },
      true,
    );
  }, SELECTORS);
}

async function sendFromHome(page: Page, prompt: string): Promise<void> {
  const input = page.getByTestId('home-hero-input');
  await expect(input).toBeVisible({ timeout: T.medium });
  await input.fill(prompt);
  const submit = page.getByTestId('home-hero-submit');
  await expect(submit).toBeEnabled();
  await submit.click();
}

async function expectSingleLoadingSequence(page: Page): Promise<void> {
  await expect(page.locator(SELECTORS.userMessage).first()).toBeVisible({ timeout: T.long });
  // Let the create answer before reading the log.
  await expect(page.locator(SELECTORS.creationPending)).toHaveCount(0, { timeout: T.medium });
  const { log, clickAt } = await page.evaluate(() => ({
    log: window.__odPaintLog ?? [],
    clickAt: window.__odClickAt ?? null,
  }));
  expect(clickAt, 'send click was observed').not.toBeNull();
  const after = log.filter((entry) => entry.at >= (clickAt as number));
  const readable = after
    .map((entry) => `${Math.round(entry.at - (clickAt as number))}ms ${entry.present ? 'show' : 'hide'} ${entry.key}`)
    .join('\n');
  const firstUserMessage = after.find((entry) => entry.key === 'userMessage' && entry.present);
  expect(firstUserMessage, `the user turn was painted:\n${readable}`).toBeDefined();
  // OPEND-3334: ProjectView is mounted from the click and draws the
  // optimistic first turn while the project is still being created, so the
  // user turn is on screen before the create answers — and it must never
  // leave: not when the create answers, not when the real turn takes over.
  const pendingSeenAt = after.find((entry) => entry.key === 'creationPending' && entry.present)?.at;
  const persistedAt = after.find((entry) => entry.key === 'creationPending' && !entry.present && entry.at > (pendingSeenAt ?? Infinity))?.at;
  expect(pendingSeenAt, `the pending phase was painted:\n${readable}`).toBeDefined();
  expect(persistedAt, `the create answered:\n${readable}`).toBeDefined();
  expect(firstUserMessage!.at, `the user turn was not on screen before the create answered:\n${readable}`)
    .toBeLessThanOrEqual(persistedAt!);
  expect(
    after.some((entry) => entry.key === 'userMessage' && !entry.present && entry.at > firstUserMessage!.at),
    `the user turn left the screen during the hand-off:\n${readable}`,
  ).toBe(false);
  for (const key of ['chatPaneSpinner', 'chatSkeleton', 'designFilesReloading'] as const) {
    expect(
      after.some((entry) => entry.key === key && entry.present),
      `${key} was visible during the hand-off:\n${readable}`,
    ).toBe(false);
  }
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
  await installPaintLog(page);
});

test('[P0] a local-agent send from Home shows one loading state until the first turn is on screen', async ({ page }) => {
  await applyStandardMocks(page);
  await routeSuccessfulRuns(page, { runId: 'home-single-loading-local' });
  await gotoEntryHome(page);
  await sendFromHome(page, 'Gamified habit app: draft the onboarding flow.');
  await expectSingleLoadingSequence(page);
});

test('[P0] an AMR send from Home shows one loading state until the first turn is on screen', async ({ page }) => {
  await seedBrowserConfig(page, AMR_CONFIG);
  await page.route('**/api/app-config', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    await route.fulfill({ json: { config: AMR_CONFIG } });
  });
  await routeAgents(page, [AMR_AGENT]);
  await mockSignedInVelaAccount(page, { balanceUsd: '20.00' });
  await mockAmrPersonalWorkspace(page, undefined, {
    accountBalanceUsd: '20.00',
    accountCredits: 2_000,
    accountPlan: 'free',
    fundingCheck: 'available',
  });
  await routeSuccessfulRuns(page, { runId: 'home-single-loading-amr' });
  await gotoEntryHome(page);
  await sendFromHome(page, 'Gamified habit app: draft the streak screen.');
  await expectSingleLoadingSequence(page);
});
