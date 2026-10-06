import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';

import { gotoEntryHome } from '@/playwright/amr';
import { applyStandardMocks, routeSuccessfulRuns, suppressWhatsNew } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

/*
 * OPEND-3207 · the project split must not move after a Home send lands.
 *
 * A Home send opens the optimistic project frame first (OPEND-2617 / 2614)
 * and ProjectView takes over once `POST /api/projects` answers. The two
 * surfaces used to size the chat column from different sources: the pending
 * frame left `.split` on its stylesheet default (460px), while ProjectView
 * resolved the user's saved width, or the equal split of the container when
 * nothing was saved, only after it mounted. The column therefore widened or
 * narrowed once the real view arrived, dragging the composer and the preview's
 * left edge with it — the jump the two QA recordings show in both directions.
 *
 * These cases sample the chat column every animation frame from the first
 * paint of the hand-off frame until the user's turn is on screen, and require
 * one width for the whole stretch. No stopwatch: a 200ms transition and a hard
 * cut fail the same way.
 */

declare global {
  interface Window {
    __odSplitWidthLog?: Array<{ at: number; width: number; pending: boolean; user: boolean }>;
  }
}

const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';

async function installSplitWidthProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: Array<{ at: number; width: number; pending: boolean; user: boolean }> = [];
    window.__odSplitWidthLog = log;
    let last: string | null = null;
    const sample = () => {
      const slot = document.querySelector('.split-chat-slot') as HTMLElement | null;
      if (slot && slot.getClientRects().length > 0) {
        const width = Math.round(slot.getBoundingClientRect().width);
        const pending = document.querySelector('[data-testid="project-creation-pending-view"]') !== null;
        const user = document.querySelector('[data-testid="chat-log"] .msg.user') !== null;
        const key = `${width}|${pending}|${user}`;
        if (key !== last) {
          last = key;
          log.push({ at: performance.now(), width, pending, user });
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
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

/**
 * Every chat-column width sampled from the first hand-off paint through the
 * frame the user turn appears, plus the widths that followed it, so a shift
 * that lands right after the transcript settles is caught too.
 */
async function expectStableSplitWidth(page: Page, expectedWidth?: number): Promise<void> {
  await expect(page.locator('[data-testid="chat-log"] .msg.user').first()).toBeVisible({ timeout: T.long });
  await expect(page.locator('[data-testid="project-creation-pending-view"]')).toHaveCount(0, { timeout: T.medium });
  await expect(page.locator('[data-testid="project-creation-pending-chat"]')).toHaveCount(0, { timeout: T.medium });
  // Let any width transition that was still running finish before reading.
  await page.waitForTimeout(400);
  const log = await page.evaluate(() => window.__odSplitWidthLog ?? []);
  const firstPending = log.findIndex((entry) => entry.pending);
  expect(firstPending, 'the hand-off frame was sampled').toBeGreaterThanOrEqual(0);
  const stretch = log.slice(firstPending);
  const readable = stretch
    .map((entry) => `${Math.round(entry.at - stretch[0]!.at)}ms ${entry.width}px${entry.pending ? ' pending' : ''}${entry.user ? ' user' : ''}`)
    .join('\n');
  const widths = Array.from(new Set(stretch.map((entry) => entry.width)));
  expect(widths, `the chat column changed width after the hand-off:\n${readable}`).toHaveLength(1);
  if (expectedWidth !== undefined) {
    expect(widths[0], `the chat column did not hold the saved width:\n${readable}`).toBe(expectedWidth);
  }
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
  await installSplitWidthProbe(page);
});

test('[P0] a Home send with no saved chat width keeps one column width from the hand-off frame to the first turn', async ({ page }) => {
  await applyStandardMocks(page);
  await routeSuccessfulRuns(page, { runId: 'home-split-width-default' });
  await gotoEntryHome(page);
  await sendFromHome(page, 'Gamified habit app: draft the onboarding flow.');
  await expectStableSplitWidth(page);
});

test('[P0] a Home send with a saved chat width shows that width from the hand-off frame onwards', async ({ page }) => {
  await applyStandardMocks(page);
  await page.addInitScript((key: string) => {
    window.localStorage.setItem(key, '380');
  }, CHAT_PANEL_WIDTH_STORAGE_KEY);
  await routeSuccessfulRuns(page, { runId: 'home-split-width-saved' });
  await gotoEntryHome(page);
  await sendFromHome(page, 'Gamified habit app: draft the streak screen.');
  await expectStableSplitWidth(page, 380);
});
