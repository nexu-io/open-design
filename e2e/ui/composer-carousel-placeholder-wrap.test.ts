// Geometric visibility contract for the placeholder-carousel caret on both
// surfaces that mount it:
//
// - Home hero: single-line, ellipsized text, caret pinned row-end so the clip
//   cannot take it out with the overflow.
// - Follow-up composer: pre-wrapped text capped at four lines (-webkit-line-clamp)
//   with the caret on the typing edge.
//
// Oracle: chain-intersect the caret rect with the text span, carousel, and
// viewport rects. Chromium reports nonzero geometry for descendants clipped by
// overflow/-webkit-line-clamp, so `rect.width > 0` alone proves nothing.
//
// DOM-shape-only coverage lives in
// apps/web/tests/components/home-hero/PlaceholderCarousel.caret-inline.test.tsx.

import { expect, test } from '@/playwright/suite';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import type { FakeAgentRuntime } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';

// Distinct prefixes of `chat.designToolbox.prompt.visualPolish` (206 chars) and
// `.assetSearch` (287 chars) from apps/web/src/i18n/locales/en.ts.
const VISUAL_POLISH_MATCH = 'Polish this design until it is ready to ship';
const ASSET_SEARCH_MATCH = 'Find the best image/reference assets';

const COMPOSER_WIDTHS_PX = [780, 640, 456] as const;

interface RectLike {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface CarouselMetrics {
  error?: string;
  shown: string;
  whiteSpace: string;
  textOverflow: string;
  lineCount: number;
  scrollWidth: number;
  clientWidth: number;
  ellipsisEngaged: boolean;
  carouselBottom: number;
  toolbarTop: number | null;
  docOverflowFree: boolean;
  caretWidth: number;
  caretHeight: number;
  caretTop: number;
  caretRight: number;
  textBottom: number;
  carouselRight: number;
  visibleWidth: number;
  visibleHeight: number;
}

let fakeRuntimes: Record<string, FakeAgentRuntime>;

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes(['codex']);
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(T.xlong);

  // reduce-motion swaps the typewriter to whole-scenario holds (~1.9s each), so
  // a target prompt is measurable within seconds instead of a full type cycle.
  await page.emulateMedia({ reducedMotion: 'reduce' });

  const codexEnv = fakeRuntimes.codex!.env;
  await page.request.put('/api/app-config', {
    data: {
      onboardingCompleted: true,
      agentId: 'codex',
      agentModels: { codex: { model: 'default', reasoning: 'default' } },
      agentCliEnv: { codex: codexEnv },
      skillId: null,
      designSystemId: null,
    },
  });

  await page.addInitScript(({ key, env }) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        mode: 'daemon',
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-5',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        agentModels: { codex: { model: 'default', reasoning: 'default' } },
        agentCliEnv: { codex: env },
      }),
    );
    // Keep the survey out of layout screenshots.
    window.localStorage.setItem('open-design:experience-survey:v1:retired', '1');
  }, { key: STORAGE_KEY, env: codexEnv });
});

async function dismissEntryChrome(page: import('@playwright/test').Page): Promise<void> {
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });
  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }
}

// Runs one real fake-agent turn so displayMessages flips the composer pool to
// the follow-up scenarios (the surface whose placeholder wraps).
async function openFollowUpCarousel(
  page: import('@playwright/test').Page,
): Promise<void> {
  const projectId = `carousel-wrap-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const createResponse = await page.request.post('/api/projects', {
    data: {
      id: projectId,
      name: 'Composer follow-up placeholder wrap',
      skillId: null,
      designSystemId: null,
      pendingPrompt: null,
      metadata: { kind: 'prototype' },
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const { conversationId } = (await createResponse.json()) as { conversationId: string };

  await page.goto(`/projects/${projectId}/conversations/${conversationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissEntryChrome(page);

  const composerInput = page.getByTestId('chat-composer-input');
  await expect(composerInput).toBeVisible();
  const sendButton = page.getByTestId('chat-send');

  await composerInput.click();
  await composerInput.fill('Create a deterministic smoke artifact');
  // Agent availability arrives through the /api/agents SSE stream.
  await expect(sendButton, 'codex availability must stream in before submit')
    .toBeEnabled({ timeout: T.long });
  await sendButton.click();

  await expect(page.getByTestId('file-workspace').getByText('real-daemon-smoke.html', { exact: true }))
    .toBeVisible({ timeout: T.long });

  // Blur the composer so the carousel mounts.
  await page.getByTestId('file-workspace').click({ position: { x: 10, y: 10 } });
  await expect(composerInput).not.toBeFocused();

  await expect(page.getByTestId('home-hero-carousel')).toBeVisible({ timeout: T.medium });
}

async function measureCarousel(page: import('@playwright/test').Page): Promise<CarouselMetrics> {
  return page.evaluate(() => {
    const carousel = document.querySelector<HTMLElement>('[data-testid="home-hero-carousel"]');
    const textSpan = carousel?.querySelector<HTMLElement>('.home-hero__carousel-text');
    const caret = carousel?.querySelector<HTMLElement>('.home-hero__carousel-caret');
    if (!carousel || !textSpan || !caret) {
      return {
        error: `structure missing carousel=${!!carousel} text=${!!textSpan} caret=${!!caret}`,
        shown: '', whiteSpace: '', textOverflow: '', lineCount: 0, scrollWidth: 0,
        clientWidth: 0, ellipsisEngaged: false, carouselBottom: 0, toolbarTop: null,
        docOverflowFree: false, caretWidth: 0, caretHeight: 0,
        caretTop: 0, caretRight: 0, textBottom: 0, carouselRight: 0,
        visibleWidth: 0, visibleHeight: 0,
      };
    }
    const toolbar = carousel.closest('.composer-shell')?.querySelector('.composer-row');
    const cRect = carousel.getBoundingClientRect();
    const tRect = textSpan.getBoundingClientRect();
    const kRect = caret.getBoundingClientRect();
    const cs = window.getComputedStyle(textSpan);
    const lineHeight = parseFloat(cs.lineHeight) || 1;

    let box: RectLike = {
      left: kRect.left, top: kRect.top, right: kRect.right, bottom: kRect.bottom,
    };
    // typing-edge carets live inside the text span (its clamp box clips them);
    // row-end carets are siblings after it, so only the carousel clips them.
    const clips: RectLike[] = caret.parentElement === textSpan
      ? [tRect, cRect]
      : [cRect];
    clips.push({ left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight });
    for (const clip of clips) {
      box = {
        left: Math.max(box.left, clip.left),
        top: Math.max(box.top, clip.top),
        right: Math.min(box.right, clip.right),
        bottom: Math.min(box.bottom, clip.bottom),
      };
    }

    return {
      shown: textSpan.textContent ?? '',
      whiteSpace: cs.whiteSpace,
      textOverflow: cs.textOverflow,
      lineCount: Math.max(1, Math.round(cRect.height / lineHeight)),
      scrollWidth: carousel.scrollWidth,
      clientWidth: carousel.clientWidth,
      ellipsisEngaged: textSpan.scrollWidth > textSpan.clientWidth,
      carouselBottom: cRect.bottom,
      toolbarTop: toolbar ? toolbar.getBoundingClientRect().top : null,
      docOverflowFree: document.documentElement.scrollWidth <= window.innerWidth + 1,
      caretWidth: kRect.width,
      caretHeight: kRect.height,
      caretTop: kRect.top,
      caretRight: kRect.right,
      textBottom: tRect.bottom,
      carouselRight: cRect.right,
      visibleWidth: Math.max(0, box.right - box.left),
      visibleHeight: Math.max(0, box.bottom - box.top),
    };
  });
}

// Samples until both the requested scenario is showing and its metrics are
// readable; the reduced-motion carousel rotates every ~1.9s, so a single
// instant snapshot can land between scenarios.
async function measureWhenShowing(
  page: import('@playwright/test').Page,
  match: string,
): Promise<CarouselMetrics> {
  const deadline = Date.now() + T.long;
  for (;;) {
    await expect(page.getByTestId('home-hero-carousel')).toContainText(match, { timeout: T.long });
    const m = await measureCarousel(page);
    if (!m.error && m.shown.includes(match)) return m;
    if (Date.now() > deadline) {
      throw new Error(`no stable measurement for "${match}": ${JSON.stringify(m)}`);
    }
    await page.waitForTimeout(300);
  }
}

function expectCaretTruth(m: CarouselMetrics, label: string): void {
  const detail = JSON.stringify(m);
  expect(m.visibleWidth, `caret has no visible horizontal intersection ${label}: ${detail}`)
    .toBeGreaterThanOrEqual(m.caretWidth * 0.9);
  expect(m.visibleHeight, `caret has no visible vertical intersection ${label}: ${detail}`)
    .toBeGreaterThanOrEqual(m.caretHeight * 0.5);
}

test('[P1] follow-up composer wraps prompts and keeps the caret truthfully placed', async ({ page }, testInfo) => {
  await openFollowUpCarousel(page);

  const measurements: CarouselMetrics[] = [];
  for (const w of COMPOSER_WIDTHS_PX) {
    await page.setViewportSize({ width: w, height: 720 });
    const m = await measureWhenShowing(page, VISUAL_POLISH_MATCH);
    const detail = `[${w}px] ${JSON.stringify(m)}`;

    expect(m.whiteSpace, `white-space regressed ${detail}`).toBe('pre-wrap');
    expect(m.textOverflow, `text-overflow regressed ${detail}`).toBe('clip');
    expect(m.lineCount, `expected wrapping ${detail}`).toBeGreaterThanOrEqual(2);
    expect(m.lineCount, `four-line cap breached ${detail}`).toBeLessThanOrEqual(4);
    expect(m.scrollWidth, `horizontal spill ${detail}`).toBeLessThanOrEqual(m.clientWidth + 1);
    expect(m.docOverflowFree, `document horizontal overflow ${detail}`).toBe(true);
    expect(m.toolbarTop, `toolbar missing ${detail}`).not.toBeNull();
    expect(m.carouselBottom, `carousel covers toolbar ${detail}`).toBeLessThanOrEqual(m.toolbarTop! + 0.5);
    expectCaretTruth(m, detail);

    const shot = testInfo.outputPath(`composer-followup-w${w}.png`);
    await page.screenshot({ path: shot });
    await testInfo.attach(`composer-followup-w${w}`, { path: shot, contentType: 'image/png' });
    measurements.push(m);
  }

  // assetSearch exceeds four wrapped lines at 456px, so the inline caret is
  // clipped by the line clamp.
  await page.setViewportSize({ width: 456, height: 720 });
  const clamped = await measureWhenShowing(page, ASSET_SEARCH_MATCH);
  const clampedDetail = `[clamp] ${JSON.stringify(clamped)}`;
  expect(clamped.lineCount, `cap breached beyond clamp ${clampedDetail}`).toBeLessThanOrEqual(4);
  expect(clamped.caretTop, `caret box must sit below the clamp box ${clampedDetail}`)
    .toBeGreaterThanOrEqual(clamped.textBottom - 1);
  expect(clamped.visibleWidth * clamped.visibleHeight,
    `clamped caret must have zero-area intersection ${clampedDetail}`).toBe(0);
  expect(clamped.carouselBottom, `carousel covers toolbar ${clampedDetail}`)
    .toBeLessThanOrEqual((clamped.toolbarTop ?? 0) + 0.5);

  const shot = testInfo.outputPath('composer-followup-beyond-clamp.png');
  await page.screenshot({ path: shot });
  await testInfo.attach('composer-followup-beyond-clamp', { path: shot, contentType: 'image/png' });
});

test('[P1] home hero placeholder stays single-line with a visible row-end caret', async ({ page }, testInfo) => {
  // German copy carries the longest home-hero scenario strings; a narrow card
  // guarantees at least one rotating scenario trips the ellipsis clip.
  await page.addInitScript(() => {
    window.localStorage.setItem('open-design:locale', 'de');
    window.localStorage.setItem('open-design:locale-source', 'manual');
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await dismissEntryChrome(page);

  // Avoid the editor and logo; click empty hero padding until the carousel mounts.
  const carousel = page.getByTestId('home-hero-carousel');
  const blurDeadline = Date.now() + T.long;
  while (!(await carousel.isVisible().catch(() => false))) {
    if (Date.now() > blurDeadline) break;
    await page.mouse.click(180, 60);
    await page.waitForTimeout(400);
  }
  await expect(carousel).toBeVisible({ timeout: T.medium });
  // Require the mount to survive late focus/remount activity.
  await page.waitForTimeout(2_000);
  await expect(carousel).toBeVisible();

  // Find a rotation that exercises ellipsis.
  const deadline = Date.now() + T.xlong;
  let m: CarouselMetrics | null = null;
  for (;;) {
    const probe = await measureCarousel(page);
    if (!probe.error && probe.ellipsisEngaged) {
      m = probe;
      break;
    }
    if (Date.now() > deadline) {
      throw new Error(`no overflowing home-hero rotation observed: ${JSON.stringify(probe)}`);
    }
    await page.waitForTimeout(250);
  }

  const detail = JSON.stringify(m);
  expect(m.whiteSpace, detail).toBe('nowrap');
  expect(m.lineCount, `home hero must stay single-line ${detail}`).toBe(1);
  expect(m.scrollWidth, `hero carousel spills horizontally ${detail}`)
    .toBeLessThanOrEqual(m.clientWidth + 1);
  expect(m.docOverflowFree, `document horizontal overflow ${detail}`).toBe(true);
  expect(m.caretRight, `row-end caret must stay pinned inside the carousel row ${detail}`)
    .toBeLessThanOrEqual(m.carouselRight + 1);
  expectCaretTruth(m, detail);

  const shot = testInfo.outputPath('home-hero-ellipsis.png');
  await page.screenshot({ path: shot });
  await testInfo.attach('home-hero-ellipsis', { path: shot, contentType: 'image/png' });
});

test('[P2] four-line clamp caps pathological placeholders without covering the toolbar', async ({ page }) => {
  await page.goto('/');
  await dismissEntryChrome(page);

  const seed = 'Polish this design until it is ready to ship.';
  const cases = [
    { label: 'double', text: `${seed} ${seed}`.trim() },
    { label: 'quadruple', text: Array(4).fill(seed).join(' ') },
    { label: 'unbreakable-600', text: 'a'.repeat(600) },
    { label: 'punctuation-200', text: '.-.-.-.-.'.repeat(20) },
    { label: 'cjk-320', text: '设计校对'.repeat(80) },
  ];

  const results = await page.evaluate((args) => {
    const { widths, cases } = args as { widths: number[]; cases: Array<{ label: string; text: string }> };
    const out: Array<{
      width: number;
      label: string;
      carouselOverflowsWrap: boolean;
      lineCount: number;
    }> = [];
    for (const w of widths) {
      for (const c of cases) {
        const wrap = document.createElement('div');
        wrap.className = 'composer-input-wrap';
        wrap.style.cssText = `position:fixed;top:-3000px;left:0;width:${w}px;padding:8px 9px;box-sizing:border-box;`;
        const carousel = document.createElement('div');
        carousel.className = 'home-hero__carousel';
        const text = document.createElement('span');
        text.className = 'home-hero__carousel-text';
        text.appendChild(document.createTextNode(c.text));
        const caret = document.createElement('span');
        caret.className = 'home-hero__carousel-caret';
        text.appendChild(caret);
        carousel.appendChild(text);
        wrap.appendChild(carousel);
        document.body.appendChild(wrap);
        const textEl = wrap.querySelector<HTMLElement>('.home-hero__carousel-text')!;
        const carouselRect = carousel.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(textEl).lineHeight) || 1;
        out.push({
          width: w,
          label: c.label,
          carouselOverflowsWrap: carouselRect.bottom > wrapRect.bottom + 0.5,
          lineCount: Math.max(1, Math.round(carouselRect.height / lineHeight)),
        });
        wrap.remove();
      }
    }
    return out;
  }, { widths: [780, 456, 360], cases });

  const detail = JSON.stringify(results, null, 2);
  for (const r of results) {
    expect(r.lineCount, `line-clamp breach at ${r.width}px [${r.label}]: ${detail}`)
      .toBeLessThanOrEqual(4);
    expect(r.carouselOverflowsWrap, `wrap overflow at ${r.width}px [${r.label}]: ${detail}`)
      .toBe(false);
  }
});
