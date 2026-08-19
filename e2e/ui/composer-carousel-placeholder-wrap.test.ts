// Composer follow-up placeholder — clip-free at supported widths.
//
// Once the user has completed at least one chat turn in a project, ChatPane
// seeds the composer's PlaceholderCarousel with the design-toolbox next-step
// prompts (`followUpComposerScenarios`). Several — visualPolish at ~270
// chars — used to ellipsis-clip against the pre-fix composer CSS. This spec
// drives a real fake-agent turn and measures the carousel at three widths.
//
// DOM shape (caret nested in the text span) is locked separately at the
// Vitest layer: apps/web/tests/components/home-hero/PlaceholderCarousel.caret-inline.test.tsx.

import { expect, test } from '@/playwright/suite';
import { createFakeAgentRuntimes } from '@/playwright/fake-agents';
import type { FakeAgentRuntime } from '@/playwright/fake-agents';
import { T } from '@/timeouts';

const STORAGE_KEY = 'open-design:config';

// Verbatim `chat.designToolbox.prompt.visualPolish` from apps/web/src/i18n/locales/en.ts.
const VISUAL_POLISH_TEXT =
  'Polish this design until it is ready to ship: check hierarchy, typography, spacing, responsive behavior, button states, empty/loading/error states, and accessibility; directly fix the most important issues.';

// Mid-prompt slice — robust against a rotate boundary and a harmless copy tweak.
const VISUAL_POLISH_MATCH = 'Polish this design until it is ready to ship';

const COMPOSER_WIDTHS_PX = [780, 640, 456] as const;

let fakeRuntimes: Record<string, FakeAgentRuntime>;

test.beforeAll(async () => {
  fakeRuntimes = await createFakeAgentRuntimes(['codex']);
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(T.xlong);

  // reduce-motion short-circuits the typewriter to full-text-per-rotation
  // (~2s per scenario), so visualPolish appears in seconds instead of ~10s.
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
  }, { key: STORAGE_KEY, env: codexEnv });
});

test('[P1] follow-up composer placeholder wraps long design-toolbox prompts without clipping', async ({ page }) => {
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
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });

  const privacyDialog = page.getByRole('dialog').filter({ hasText: 'Help us improve OpenDesign' });
  if (await privacyDialog.isVisible().catch(() => false)) {
    await privacyDialog.getByRole('button', { name: /I get it|not now|got it|don't share/i }).click();
    await expect(privacyDialog).toHaveCount(0);
  }

  const composer = page.getByTestId('chat-composer');
  await expect(composer).toBeVisible();
  const composerInput = page.getByTestId('chat-composer-input');
  await expect(composerInput).toBeVisible();
  const sendButton = page.getByTestId('chat-send');

  // Run one real turn so displayMessages > 0 flips composer scenarios from
  // blank-project to follow-up (the code path that surfaces visualPolish).
  await composerInput.click();
  await composerInput.fill('Create a deterministic smoke artifact');
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect(page.getByTestId('file-workspace').getByText('real-daemon-smoke.html', { exact: true }))
    .toBeVisible({ timeout: T.long });

  // Blur composer — carousel pauses while the composer is focused.
  await page.getByTestId('file-workspace').click({ position: { x: 10, y: 10 } });
  await expect(composerInput).not.toBeFocused();

  const carousel = page.getByTestId('home-hero-carousel');
  await expect(carousel).toBeVisible({ timeout: T.medium });

  await expect
    .poll(async () => (await carousel.textContent()) ?? '', { timeout: T.medium })
    .toContain(VISUAL_POLISH_MATCH);

  const measurements: Array<{
    viewportWidth: number;
    carouselScrollWidth: number;
    carouselClientWidth: number;
    carouselHeight: number;
    lineCount: number;
    whiteSpace: string;
    textOverflow: string;
    caretGapDx: number | null;
    caretGapDy: number | null;
    caretVisible: boolean;
    visibleTextSample: string;
  }> = [];

  for (const w of COMPOSER_WIDTHS_PX) {
    await page.setViewportSize({ width: w, height: 720 });
    await expect
      .poll(async () => (await carousel.textContent()) ?? '', { timeout: T.medium })
      .toContain(VISUAL_POLISH_MATCH);

    const m = await carousel.evaluate((el) => {
      const textSpan = el.querySelector('.home-hero__carousel-text') as HTMLElement | null;
      const caret = el.querySelector('.home-hero__carousel-caret') as HTMLElement | null;
      if (!textSpan || !caret) {
        return { error: `structure missing text=${!!textSpan} caret=${!!caret}` } as const;
      }
      const rect = el.getBoundingClientRect();
      const caretRect = caret.getBoundingClientRect();
      const cs = window.getComputedStyle(textSpan);
      const lineHeight = parseFloat(cs.lineHeight);

      let textNode: Text | null = null;
      for (let i = textSpan.childNodes.length - 1; i >= 0; i--) {
        const child = textSpan.childNodes[i];
        if (child && child.nodeType === Node.TEXT_NODE) {
          textNode = child as Text;
          break;
        }
      }
      let caretGapDx: number | null = null;
      let caretGapDy: number | null = null;
      const visibleTextSample = (textNode?.data ?? '').slice(-64);
      if (textNode && textNode.length > 0) {
        const range = document.createRange();
        range.setStart(textNode, textNode.length - 1);
        range.setEnd(textNode, textNode.length);
        const rects = range.getClientRects();
        const lcr = rects[rects.length - 1];
        if (lcr) {
          caretGapDx = caretRect.left - lcr.right;
          caretGapDy = caretRect.bottom - lcr.bottom;
        }
      }

      return {
        carouselScrollWidth: el.scrollWidth,
        carouselClientWidth: el.clientWidth,
        carouselHeight: Math.round(rect.height),
        lineCount: Math.max(1, Math.round(rect.height / lineHeight)),
        whiteSpace: cs.whiteSpace,
        textOverflow: cs.textOverflow,
        caretGapDx,
        caretGapDy,
        caretVisible: caretRect.width > 0 && caretRect.height > 0,
        visibleTextSample,
      };
    });

    if ('error' in m) throw new Error(m.error);
    measurements.push({ viewportWidth: w, ...m });
  }

  const detail = JSON.stringify(measurements, null, 2);

  for (const m of measurements) {
    expect(m.carouselScrollWidth, `horizontal clip at ${m.viewportWidth}px: ${detail}`)
      .toBeLessThanOrEqual(m.carouselClientWidth + 1);
    expect(m.whiteSpace, `white-space regressed at ${m.viewportWidth}px: ${detail}`)
      .toBe('pre-wrap');
    expect(m.textOverflow, `text-overflow regressed at ${m.viewportWidth}px: ${detail}`)
      .toBe('clip');
    expect(m.caretVisible, `caret not visible at ${m.viewportWidth}px: ${detail}`).toBe(true);
    expect(m.caretGapDx, `caret dx unreadable at ${m.viewportWidth}px: ${detail}`).not.toBeNull();
    expect(m.caretGapDy, `caret dy unreadable at ${m.viewportWidth}px: ${detail}`).not.toBeNull();
    expect(Math.abs(m.caretGapDx!), `caret horizontal drift at ${m.viewportWidth}px: ${detail}`)
      .toBeLessThanOrEqual(6);
    expect(Math.abs(m.caretGapDy!), `caret vertical drift at ${m.viewportWidth}px: ${detail}`)
      .toBeLessThanOrEqual(4);
  }

  const wrapped = measurements.filter((m) => m.lineCount >= 2);
  expect(wrapped.length, `expected wrapping at every width: ${detail}`)
    .toBe(COMPOSER_WIDTHS_PX.length);
  void VISUAL_POLISH_TEXT;
});

test('[P1] follow-up carousel caps growth at four lines under pathological placeholder lengths', async ({ page }) => {
  // Guardrail against a future scenario copy landing at 500+ chars. The
  // composer's min-height accommodates four wrapped lines; line-clamp
  // prevents growth past that so a monster prompt cannot overtake the
  // composer chrome. Measured under the app's real composer-scoped CSS
  // without depending on a real chat turn (the cap holds independent of
  // whether the carousel is home-hero or follow-up).
  await page.goto('/');
  await page.getByText('Loading OpenDesign…').waitFor({ state: 'hidden', timeout: T.long });

  const seed = 'Polish this design until it is ready to ship: check hierarchy, typography, spacing, responsive behavior, button states, empty/loading/error states, and accessibility; directly fix the most important issues. ';
  const cases = [
    { label: 'baseline (~270 chars)', text: seed.trim() },
    { label: 'double (~540 chars)', text: (seed + seed).trim() },
    { label: 'quadruple (~1080 chars)', text: (seed + seed + seed + seed).trim() },
    { label: 'unbreakable-monster (600-char no-space run)', text: 'a'.repeat(600) },
    { label: 'punctuation-only (200 chars)', text: '.-.-.-.-.'.repeat(20) },
    { label: 'mixed CJK', text: '设计校对'.repeat(80) },
  ];

  const results = await page.evaluate((args) => {
    const { widths, cases } = args as { widths: number[]; cases: Array<{ label: string; text: string }> };
    const out: Array<{
      width: number;
      label: string;
      carouselHeight: number;
      wrapHeight: number;
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
        const carouselRect = carousel.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
        out.push({
          width: w,
          label: c.label,
          carouselHeight: Math.round(carouselRect.height),
          wrapHeight: Math.round(wrapRect.height),
          carouselOverflowsWrap: carouselRect.bottom > wrapRect.bottom + 0.5,
          lineCount: Math.max(1, Math.round(carouselRect.height / lineHeight)),
        });
        wrap.remove();
      }
    }
    return out;
  }, { widths: [780, 456, 360], cases });

  const detail = JSON.stringify(results, null, 2);

  // Cap invariant: the carousel never exceeds four wrapped lines regardless
  // of input length. If a scenario is intentionally shorter, that is fine
  // (lineCount < 4); the cap only prevents unbounded growth.
  for (const r of results) {
    expect(r.lineCount, `line-clamp breach at ${r.width}px [${r.label}]: ${detail}`)
      .toBeLessThanOrEqual(4);
    // The carousel must stay within the composer wrap's own box so it
    // never paints over the toolbar row below.
    expect(r.carouselOverflowsWrap, `wrap overflow at ${r.width}px [${r.label}]: ${detail}`)
      .toBe(false);
  }
});
