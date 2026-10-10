import { expect, test } from '@/playwright/suite';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

import { gotoEntryHome } from '@/playwright/amr';
import { comparePngBuffers } from '@/playwright/artifact-render-parity';
import { applyStandardMocks, routeSuccessfulRuns, suppressWhatsNew } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

/*
 * OPEND-3334 · the Home → project hand-off must be invisible.
 *
 * A Home send opens the optimistic project frame (OPEND-2617) and ProjectView
 * takes over once `POST /api/projects` answers (OPEND-2170 keeps the frame's
 * chat card on screen until the first transcript settles). The frame is a
 * hand-drawn copy of ProjectView, so every place the copy drifted from the
 * real view becomes a jump at the hand-off: the assistant status row
 * ("Preparing…" in the old footer vs the execution record's "Working" head),
 * the composer (simplified vs real), the empty state's pills (disabled vs
 * live), the tabs dock, the switcher name.
 *
 * Two pins, no stopwatch:
 *  1. Pixel parity: the chat column and the workspace column look the same in
 *     the last frame before the hand-off and the first frame after it
 *     (animations frozen so only geometry and content count).
 *  2. One status: from the click until the first content arrives, the
 *     assistant status row shows one label with one class set.
 *
 * Runs on the local-agent path (no balance gate) with the run's events held
 * pending, so nothing but the hand-off itself can change the picture.
 */

declare global {
  interface Window {
    __odStatusLog?: Array<{ at: number; text: string; className: string; where: string }>;
    __odMountLog?: Array<{ at: number; surface: 'pending' | 'view'; pane: number; rows: string[]; entering: string[]; workspace: string }>;
  }
}

const FREEZE_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Hold POST /api/projects until released so the pending frame can be captured at rest. */
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

/**
 * Every distinct (label text, class set) the assistant status row showed,
 * sampled each animation frame. Both the frame's copy (`.assistant-footer
 * .assistant-label`) and the real view's rows are watched; any element inside
 * an assistant message whose text is a run-status word counts.
 */
async function installStatusLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: Array<{ at: number; text: string; className: string; where: string }> = [];
    window.__odStatusLog = log;
    const seen = new Set<string>();
    const STATUS = /^(Preparing…|Preparing\.\.\.|Thinking|Working|准备中…|思考中|进行中)$/;
    const sample = () => {
      const nodes = document.querySelectorAll('.msg.assistant span, .msg.assistant i, [data-testid="assistant-label"]');
      for (const node of Array.from(nodes)) {
        const el = node as HTMLElement;
        const text = (el.textContent ?? '').trim();
        if (!STATUS.test(text)) continue;
        if (el.getClientRects().length === 0) continue;
        const where = el.closest('[data-creation-handoff]') ? 'handoff' : 'view';
        const className = el.className;
        const key = `${where}|${text}|${className}`;
        if (!seen.has(key)) {
          seen.add(key);
          log.push({ at: performance.now(), text, className, where });
        }
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

/**
 * Every change, per animation frame, to: which surface draws the chat column,
 * the identity of its `.pane` root, the identity of each `.msg` row, which rows
 * are playing their `msg-enter` fade, and which state the workspace column
 * shows. Identities are small integers handed out on first sight.
 */
async function installMountLog(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const log: NonNullable<Window['__odMountLog']> = [];
    window.__odMountLog = log;
    const ids = new WeakMap<Element, number>();
    let next = 1;
    const idOf = (el: Element) => {
      let id = ids.get(el);
      if (!id) {
        id = next++;
        ids.set(el, id);
      }
      return id;
    };
    let last = '';
    const sample = () => {
      const pane = document.querySelector('.split-chat-slot > .pane');
      if (pane) {
        const surface = document.querySelector('[data-testid="project-creation-pending-view"]') ? 'pending' : 'view';
        const rows: string[] = [];
        const entering: string[] = [];
        for (const row of Array.from(document.querySelectorAll('.split-chat-slot .msg'))) {
          const id = `${row.classList.contains('user') ? 'u' : 'a'}${idOf(row)}`;
          rows.push(id);
          const fading = row.getAnimations().some(
            (animation) => animation.playState === 'running' && (animation as CSSAnimation).animationName === 'msg-enter',
          );
          if (fading) entering.push(id);
        }
        const workspace = ['design-files-loading', 'design-files-empty', 'design-files-empty-unconfirmed', 'pending-design-files-empty']
          .find((testId) => document.querySelector(`[data-testid="${testId}"]`)) ?? 'other';
        const entry = { at: performance.now(), surface, pane: idOf(pane), rows, entering, workspace } as const;
        const key = JSON.stringify({ ...entry, at: 0 });
        if (key !== last) {
          last = key;
          log.push(entry);
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

/** Rows of a PNG that differ, bucketed into contiguous bands (top → bottom). */
function diffBands(diffPng: Buffer): Array<{ top: number; bottom: number }> {
  const png = PNG.sync.read(diffPng);
  const bands: Array<{ top: number; bottom: number }> = [];
  let open: { top: number; bottom: number } | null = null;
  for (let y = 0; y < png.height; y += 1) {
    let differs = false;
    for (let x = 0; x < png.width; x += 1) {
      const i = (y * png.width + x) * 4;
      // pixelmatch paints differing pixels red (255, 0, 0).
      if (png.data[i] === 255 && png.data[i + 1] === 0 && png.data[i + 2] === 0) {
        differs = true;
        break;
      }
    }
    if (differs) {
      if (open && y === open.bottom + 1) open.bottom = y;
      else {
        open = { top: y, bottom: y };
        bands.push(open);
      }
    }
  }
  return bands;
}

async function expectColumnParity(
  page: Page,
  selector: string,
  label: string,
  capture: { before: Buffer; after: Buffer },
): Promise<void> {
  const comparison = comparePngBuffers(capture.after, capture.before, 0.1);
  const bands = diffBands(comparison.diffPng)
    .map((band) => `rows ${band.top}–${band.bottom} (${band.bottom - band.top + 1}px)`)
    .join(', ');
  const readable = [
    `${label} (${selector})`,
    `size before ${comparison.expectedWidth}×${comparison.expectedHeight}, after ${comparison.actualWidth}×${comparison.actualHeight}`,
    `perceptual diff ${(comparison.perceptualDiffRatio * 100).toFixed(2)}% (${comparison.perceptualDiffPixels}px)`,
    `bands: ${bands || 'none'}`,
  ].join('\n');
  await test.info().attach(`${label}-before.png`, { body: capture.before, contentType: 'image/png' });
  await test.info().attach(`${label}-after.png`, { body: capture.after, contentType: 'image/png' });
  await test.info().attach(`${label}-diff.png`, { body: comparison.diffPng, contentType: 'image/png' });
  expect(
    comparison.actualWidth === comparison.expectedWidth
      && comparison.actualHeight === comparison.expectedHeight,
    `the ${label} changed size across the hand-off:\n${readable}`,
  ).toBe(true);
  // 0.2% tolerates sub-pixel text rendering; a moved row or a swapped control
  // is orders of magnitude above it.
  expect(
    comparison.perceptualDiffRatio,
    `the ${label} changed across the hand-off:\n${readable}`,
  ).toBeLessThan(0.002);
}

test.describe.configure({ timeout: T.xlong });

test.beforeEach(async ({ page }) => {
  await suppressWhatsNew(page);
  await installStatusLog(page);
});

test('[P0] the chat and workspace columns do not change across the Home → project hand-off', async ({ page }) => {
  await applyStandardMocks(page);
  const create = await holdProjectCreate(page);
  await routeSuccessfulRuns(page, { runId: 'home-handoff-parity', events: 'pending' });
  await gotoEntryHome(page);
  await page.addStyleTag({ content: FREEZE_CSS });
  await sendFromHome(page, 'Gamified habit app: draft the onboarding flow.');

  const pending = page.getByTestId('project-creation-pending-view');
  await expect(pending).toBeVisible({ timeout: T.short });
  await expect.poll(() => create.requested(), { timeout: T.medium }).toBe(true);
  // The frame at rest: nothing is in flight but the held create.
  await page.waitForTimeout(600);
  const chat = page.locator('.split-chat-slot').first();
  const workspace = page.locator('.split > .workspace').first();
  const before = {
    chat: await chat.screenshot({ animations: 'disabled' }),
    workspace: await workspace.screenshot({ animations: 'disabled' }),
  };

  create.release();
  // The first frame of the real view: the frame's card has been released and
  // the user turn is on screen; the run's events are still held, so nothing
  // else can have painted yet.
  await expect(page.locator('[data-testid="chat-log"] .msg.user').first()).toBeVisible({ timeout: T.long });
  await expect(pending).toHaveCount(0, { timeout: T.medium });
  await expect(page.getByTestId('project-creation-pending-chat')).toHaveCount(0, { timeout: T.medium });
  const after = {
    chat: await chat.screenshot({ animations: 'disabled' }),
    workspace: await workspace.screenshot({ animations: 'disabled' }),
  };

  await expectColumnParity(page, '.split-chat-slot', 'chat-column', { before: before.chat, after: after.chat });
  await expectColumnParity(page, '.split > .workspace', 'workspace-column', { before: before.workspace, after: after.workspace });
});

test('[P0] the assistant status row shows one label with one class set from the click to the first content', async ({ page }) => {
  await applyStandardMocks(page);
  await routeSuccessfulRuns(page, { runId: 'home-handoff-status', events: 'pending' });
  await gotoEntryHome(page);
  await sendFromHome(page, 'Gamified habit app: draft the streak screen.');

  await expect(page.locator('[data-testid="chat-log"] .msg.user').first()).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('project-creation-pending-view')).toHaveCount(0, { timeout: T.medium });
  await expect(page.getByTestId('project-creation-pending-chat')).toHaveCount(0, { timeout: T.medium });
  // Let the real view's status row settle before reading the log.
  await page.waitForTimeout(800);
  const log = await page.evaluate(() => window.__odStatusLog ?? []);
  const readable = log
    .map((entry) => `${Math.round(entry.at)}ms [${entry.where}] "${entry.text}" .${entry.className.split(/\s+/).filter(Boolean).join('.')}`)
    .join('\n');
  expect(log.length, `no status row was sampled:\n${readable}`).toBeGreaterThan(0);
  const texts = Array.from(new Set(log.map((entry) => entry.text)));
  expect(texts, `the status label changed across the hand-off:\n${readable}`).toHaveLength(1);
  expect(texts[0], `the only status label must be the running one:\n${readable}`).toMatch(/^(Working|进行中)$/);
  // The same head is more than one element (the record's shimmer span and
  // its summary wrapper both carry the text); what must hold is that the
  // hand-off frame and the real view draw the SAME set of them.
  const signature = (where: 'handoff' | 'view') =>
    Array.from(new Set(log.filter((entry) => entry.where === where).map((entry) => `${entry.text}|${entry.className}`))).sort();
  const handoff = signature('handoff');
  const view = signature('view');
  expect(handoff.length, `the hand-off frame drew no status row:\n${readable}`).toBeGreaterThan(0);
  expect(view, `the status row's elements changed across the hand-off:\n${readable}`).toEqual(handoff);
});

test('[P0] the first turn enters once and nothing remounts or reloads after the Home → project hand-off', async ({ page }) => {
  await installMountLog(page);
  await applyStandardMocks(page);
  await routeSuccessfulRuns(page, { runId: 'home-handoff-mounts', events: 'pending' });
  await gotoEntryHome(page);
  await sendFromHome(page, 'Gamified habit app: draft the rewards screen.');

  // Past the whole hand-off: the real view, its conversation resolved, the
  // real first turn on screen.
  await expect(page).toHaveURL(/\/conversations\//, { timeout: T.long });
  await expect(page.locator('[data-testid="chat-log"] .msg.user').first()).toBeVisible({ timeout: T.long });
  await expect(page.getByTestId('project-creation-pending-chat')).toHaveCount(0, { timeout: T.medium });
  await page.waitForTimeout(800);

  const log = await page.evaluate(() => window.__odMountLog ?? []);
  const readable = log
    .map((entry) => `${Math.round(entry.at)}ms ${entry.surface} pane#${entry.pane} rows=[${entry.rows.join(' ')}] entering=[${entry.entering.join(' ')}] ws=${entry.workspace}`)
    .join('\n');
  expect(log.length, `nothing was sampled:\n${readable}`).toBeGreaterThan(0);
  expect(log[0]?.surface, `the pending frame was never sampled:\n${readable}`).toBe('pending');

  // The pending frame's first rows are the only entrance. Any other row seen
  // fading in is the turn flashing: the view taking over, the conversation id
  // re-keying the pane, or the real rows replacing the optimistic ones.
  const firstRows = new Set(log.find((entry) => entry.rows.length > 0)?.rows ?? []);
  const replayed = Array.from(new Set(log.flatMap((entry) => entry.entering.filter((row) => !firstRows.has(row)))));
  expect(replayed, `rows faded in again after the first paint:\n${readable}`).toEqual([]);

  // The real view mounts its pane once; resolving the conversation id is not a
  // conversation switch.
  const viewPanes = Array.from(new Set(log.filter((entry) => entry.surface === 'view').map((entry) => entry.pane)));
  expect(viewPanes, `the real view remounted its chat pane:\n${readable}`).toHaveLength(1);

  // A project born from the Home send has no files; the workspace says so from
  // the first frame and never detours through "Loading…".
  const workspaces = Array.from(new Set(log.map((entry) => entry.workspace)));
  expect(workspaces, `the workspace column changed state across the hand-off:\n${readable}`).not.toContain('design-files-loading');
});
