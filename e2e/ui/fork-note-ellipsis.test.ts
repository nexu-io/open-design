import { expect, test } from '@/playwright/suite';
import type { Locator, Page } from '@playwright/test';

import {
  AMR_PERSONAL_WORKSPACE_HEADERS,
  createProjectViaApi,
  dismissPrivacyDialog,
  expectWorkspaceReady,
  putAppConfig,
  seedBrowserConfig,
} from '@/playwright/amr';
import { routeAgents } from '@/playwright/mock-factory';
import { T } from '@/timeouts';

/**
 * The fork divider's footnote must ELLIPSIZE when it does not fit, not get cut
 * mid-glyph.
 *
 * #7863 collapsed the divider into one line, which made `.fork-note` a flex
 * container while the truncation declarations stayed on that same element.
 * Bare text in a flex container lives in an anonymous flex item, and
 * `text-overflow` is not inherited, so the anonymous box fell back to `clip`:
 * the width cap still bit, but the cut had no ellipsis. English
 * ("Continued from chat", 19 chars) mostly stays under the cap, so only the
 * longer shipped locales showed it.
 *
 * This is a browser-only witness on purpose. jsdom does not lay out, so
 * "is there an ellipsis" cannot be observed there, and asserting the CSS
 * declarations instead would be false green — the broken build declared
 * `text-overflow: ellipsis` too; what was wrong was the box it sat on. Per
 * `apps/web/src/components/chat/AGENTS.md` §5 the web-side tests must not
 * assert class names or declarations either, so the oracle below reads only
 * observable geometry and pixels through a stable `data-testid`.
 */

const AGENT = {
  id: 'amr',
  name: 'OpenDesign AMR',
  bin: 'vela',
  available: true,
  version: 'test',
  models: [{ id: 'default', label: 'Default' }],
};

/**
 * German is the longest of the 19 shipped `assistant.forkNote` translations
 * (`Fortsetzung der Konversation`, 28 characters against English's 19), so it
 * is the one the divider's 62% cap reaches first. The expected string is not
 * duplicated here — `apps/web` is another app's private source and e2e must
 * not borrow it — so if the translation is ever shortened, the overflow check
 * below fails with the measured widths and the string it actually rendered,
 * rather than passing vacuously.
 */
const LOCALE = 'de';

/** Narrow enough that 62% of the divider cannot fit the German label. */
const CHAT_PANEL_WIDTH_PX = 280;

async function seedForkedConversation(page: Page): Promise<Locator> {
  await page.addInitScript((locale) => {
    window.localStorage.setItem('open-design:locale', locale);
    window.localStorage.setItem('open-design:locale-source', 'manual');
  }, LOCALE);
  await routeAgents(page, [AGENT]);

  const config = {
    mode: 'daemon',
    apiKey: '',
    baseUrl: '',
    model: '',
    agentId: 'amr',
    skillId: null,
    designSystemId: null,
    onboardingCompleted: true,
    privacyDecisionAt: 1,
    mediaProviders: {},
    agentModels: { amr: { model: 'default', reasoning: 'default' } },
  };
  await seedBrowserConfig(page, config);
  await putAppConfig(page, config);

  const projectId = `fork-note-ellipsis-${Date.now()}`.replace(/[^A-Za-z0-9._-]/g, '-');
  const { conversationId } = await createProjectViaApi(page, projectId, 'Fork note ellipsis');

  // The daemon only stamps the divider when it can inherit a source title
  // ("拿不到源标题就不盖" in routes/project/conversations.ts), so name the
  // source conversation before forking off it.
  const titled = await page.request.patch(
    `/api/projects/${projectId}/conversations/${conversationId}`,
    {
      headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
      data: { title: 'Storefront prototype' },
    },
  );
  expect(titled.ok(), `title source conversation: ${await titled.text()}`).toBeTruthy();

  const assistantMessageId = `a-${projectId}`;
  const seeded = await page.request.put(
    `/api/projects/${projectId}/conversations/${conversationId}/messages/${assistantMessageId}`,
    {
      headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
      data: {
        role: 'assistant',
        content: 'Both pages are done.',
        agentId: 'amr',
        runStatus: 'succeeded',
        createdAt: Date.now() - 1_000,
        startedAt: Date.now() - 1_000,
        endedAt: Date.now() - 500,
        preTurnFileNames: [],
        events: [],
      },
    },
  );
  expect(seeded.ok(), `seed assistant message: ${await seeded.text()}`).toBeTruthy();

  // Fork through the real product endpoint. The daemon copies the transcript
  // into a fresh conversation and stamps `forkedInto` on the last carried
  // message — that stamp is what renders the divider. Writing the stamp
  // directly would prove a shape no user flow produces.
  const forked = await page.request.post(`/api/projects/${projectId}/conversations`, {
    headers: { ...AMR_PERSONAL_WORKSPACE_HEADERS },
    data: {
      seedFromConversationId: conversationId,
      forkAfterMessageId: assistantMessageId,
    },
  });
  expect(forked.ok(), `fork conversation: ${await forked.text()}`).toBeTruthy();
  const { conversation } = (await forked.json()) as { conversation?: { id?: string } };
  expect(conversation?.id, 'fork response carried no conversation id').toBeTruthy();

  await page.goto(`/projects/${projectId}/conversations/${conversation!.id}`, {
    waitUntil: 'domcontentloaded',
  });
  await dismissPrivacyDialog(page);
  await expectWorkspaceReady(page);

  // Let the divider paint at the default width first, so the squeeze below has
  // something to measure.
  const label = page.getByTestId('assistant-fork-note-label');
  await expect(label).toBeVisible({ timeout: T.long });
  await expect(label).toHaveText(/\S/);

  return label;
}

interface LabelBox {
  scrollWidth: number;
  clientWidth: number;
  text: string;
}

/**
 * Squeeze the chat panel (optional) and measure the label in ONE round trip.
 *
 * Two things make a naive "write, then measure" wrong here:
 *   - React clamps its own panel state to `MIN_CHAT_PANEL_WIDTH` (345px), so
 *     the width has to be written straight onto the split the way the resize
 *     handle does rather than through the product's own state.
 *   - `--project-chat-panel-width` is a registered `@property` with a 200ms
 *     transition, so a bare write TWEENS from the default 460px and anything
 *     measured right after reads the panel mid-flight. The product suspends
 *     that transition with `.is-resizing-chat` while the handle writes the
 *     width every frame; borrow the same switch instead of inventing one.
 *
 * Writing and reading inside a single `evaluate` also means no re-render can
 * land between them, and the `scrollWidth` read forces the layout that applies
 * the new width.
 */
async function measureLabel(page: Page, squeezeTo?: number): Promise<LabelBox | null> {
  return page.locator('.split').evaluate((element, panelWidth) => {
    const split = element as HTMLElement;
    if (panelWidth != null) {
      split.classList.add('is-resizing-chat');
      split.style.setProperty('--project-chat-panel-width', `${panelWidth}px`);
    }
    const label = split.querySelector<HTMLElement>('[data-testid="assistant-fork-note-label"]');
    if (!label) return null;
    return {
      scrollWidth: label.scrollWidth,
      clientWidth: label.clientWidth,
      text: label.textContent ?? '',
    };
  }, squeezeTo);
}

test('[P0] a long locale ellipsizes the fork divider note in a narrow chat panel', async ({
  page,
}) => {
  const label = await seedForkedConversation(page);

  // 1a. The squeeze landed. Measured before and after so a future failure says
  //     which half broke: a panel that never narrowed is a fixture problem,
  //     while a narrowed panel that still fits the text is a copy problem.
  const relaxed = await measureLabel(page);
  expect(relaxed, 'the divider never rendered').not.toBeNull();
  const box = await measureLabel(page, CHAT_PANEL_WIDTH_PX);
  expect(box, 'the divider vanished while the chat panel was being squeezed').not.toBeNull();
  expect(
    box!.clientWidth,
    `squeezing the chat panel to ${CHAT_PANEL_WIDTH_PX}px did not narrow the note `
      + `(${relaxed!.clientWidth}px before, ${box!.clientWidth}px after) `
      + '— the width write is not reaching the split, so nothing below is being measured',
  ).toBeLessThan(relaxed!.clientWidth);

  // 1b. The scenario is live: at this width the label really does overflow its
  //     own box. Without this the ellipsis check below could pass on a label
  //     that simply fits, and the guard would be measuring nothing.
  expect(
    box!.scrollWidth,
    `the divider note still fits at ${CHAT_PANEL_WIDTH_PX}px `
      + `(content ${box!.scrollWidth}px vs box ${box!.clientWidth}px, text ${JSON.stringify(box!.text)}) `
      + '— narrow the panel further or pick a longer shipped locale, otherwise this guard measures nothing',
  ).toBeGreaterThan(box!.clientWidth);

  // 2. The overflow is rendered as an ellipsis, not a hard cut. The control is
  //    the same element forced to `clip`: if the product were still clipping,
  //    forcing `clip` would change nothing and the two paints would match.
  //    Comparing the element against itself keeps this baseline-free, so it
  //    needs no committed snapshot and cannot drift with unrelated chrome.
  const ellipsized = await label.screenshot({ animations: 'disabled' });
  await label.evaluate((element) => {
    (element as HTMLElement).style.textOverflow = 'clip';
  });
  const hardCut = await label.screenshot({ animations: 'disabled' });

  expect(ellipsized.byteLength, 'the label painted nothing').toBeGreaterThan(0);
  expect(
    ellipsized.equals(hardCut),
    'the overflowing note paints identically with and without `text-overflow: ellipsis` '
      + '— it is being cut off mid-glyph instead of ellipsized',
  ).toBe(false);
});
