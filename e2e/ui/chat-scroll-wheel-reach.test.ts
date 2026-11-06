/**
 * Regression witness for the chat-log scroll freeze. CURRENTLY SKIPPED — read
 * why before enabling it.
 *
 * THE INVARIANT
 * -------------
 * A real wheel must be able to reach the bottom of the chat log. That is the
 * defect stated without reference to any candidate fix, so this spec stays
 * valid whichever fix eventually lands.
 *
 * WHY IT IS SKIPPED
 * -----------------
 * It has never been observed RED, and a guard that has only ever been green
 * cannot tell "the product is healthy" from "the harness cannot see the bug".
 *
 * Two rulers were built before this one and BOTH manufactured ceilings — a
 * fixed wheel budget in one, over-eager contamination-deletion in the other
 * (see `chat-scroll-replay.ts` for the numbers). Every "reproduction" this
 * replay harness appeared to produce was withdrawn when those were found. What
 * remains is: the freezes users hit are real and were caught on a packaged
 * client, and this harness has never been confirmed to reproduce one.
 *
 * TO MAKE IT REAL, IN ORDER
 * -------------------------
 *  1. Get the harness to produce a genuine stall — consecutive notches asking
 *     for real pixels and moving nothing, with `scrollTop = n` still landing.
 *     Until that happens there is nothing here to guard.
 *  2. Only then decide the enabling conditions (log height, headed vs
 *     headless, streaming or idle). Do not guess them from the withdrawn data.
 *
 * WHAT IT WILL NOT PROVE EVEN WHEN GREEN
 * --------------------------------------
 *  - The turn is a replayed recording. Its event stream and timing were
 *    verified faithful (span within 30ms over 197s, text byte-identical), but
 *    the resulting DOM geometry has never been shown to match a real session's.
 *  - Ceiling magnitudes are viewport-specific and not comparable to the
 *    packaged client's.
 *  - Green means "no stall observed under these conditions", never "no stall
 *    exists". Confirm on a real client before believing a fix.
 *
 * The infrastructure around the assertion IS verified and reusable: the
 * recording fixture, the daemon-side replay, and `measureWheelReach`.
 */
import { expect, test } from '@/playwright/suite';
import { T } from '@/timeouts';
import { applyStandardMocks } from '@/playwright/mock-factory';
import {
  armChatScrollReplay,
  CHAT_LOG_SELECTOR,
  disarmChatScrollReplay,
  measureWheelReach,
} from '@/playwright/chat-scroll-replay';

/**
 * How tall the log is grown before measuring.
 *
 * NOT a validated trigger. An earlier comment here cited a latch at 5356px;
 * that number was the previous ruler's fixed wheel budget, not a property of
 * the product, and the whole height-trigger story was withdrawn with it. This
 * is now only "tall enough that a ceiling would have room to show", pending
 * step 1 above.
 */
const MIN_LAYOUT_MAX = 5_600;
/**
 * Upper bound on replayed turns while growing the log. Measured at
 * OD_REPLAY_SPEED=8: ~25s and ~495px of scroll range per turn, so reaching the
 * trigger costs roughly twelve turns and five minutes.
 */
const MAX_BUILD_TURNS = 14;
/** Descents. Two, for redundancy against a mis-measured one — not for luck. */
const DESCENTS = 2;

/**
 * See the file header for why this is skipped.
 *
 * Additional measured fact, still valid: under this suite's HEADLESS Chromium
 * the wheel reached the bottom at every height probed (2801, 4415 and 7433px of
 * range, 0 short each time). That was measured with the budgeted ruler, so it
 * cannot be read as "headless hides the defect" — only as "nothing showed up".
 *
 * This spec is not enabled because it has never been observed RED, and a
 * regression guard that has only ever been green proves nothing — it cannot
 * distinguish "the product is healthy" from "the harness cannot see the bug".
 *
 * The defect reproduces reliably in a real, headed Chrome: the wheel's reach
 * latches and the log grows past it (measured wheel=5356 against layoutMax
 * 6517 / 7045 / 7198 / 7311, with programmatic scrollTop reaching layoutMax
 * every time). Under this suite's headless Chromium the same scenario, driven
 * by the same recording through the same daemon, stays fully reachable:
 *
 *   layoutMax 2801 -> wheel 2801 (0 short)
 *   layoutMax 4415 -> wheel 4415 (0 short)
 *   layoutMax 7433 -> wheel 7433 (0 short)
 *
 * 7433px is well past the 5356 latch seen in real Chrome, so this is not a
 * matter of building a taller log. The most likely explanation is that the
 * stale bound lives in a compositor path headless does not exercise, which
 * would also explain why only real wheel input at a human cadence ever showed
 * it. That has NOT been confirmed.
 *
 * To make this spec real, one of these has to be settled first:
 *   - run this lane headed (a display, or xvfb on Linux CI) and confirm it
 *     goes red there; or
 *   - find the headless-visible form of the same defect and re-anchor the
 *     oracle on that.
 *
 * Everything around the assertion is verified and reusable in the meantime:
 * the recording fixture, the daemon-side replay, and `measureWheelReach`,
 * which HAS caught the defect repeatedly when pointed at a real browser.
 */
test.describe('chat log wheel reachability', () => {
  test.skip('[P2] a streaming chat log stays reachable by a real wheel', async ({ page, toolsDev }) => {
    // Growing the log past the latch means replaying several turns end to end.
    // `test.slow()` only triples the 45s default, which is not the right order
    // of magnitude, so the budget is stated outright.
    test.setTimeout(12 * 60 * 1000);
    await armChatScrollReplay(toolsDev);
    try {
      await applyStandardMocks(page);

      const projectId = `chat-scroll-wheel-reach-${Date.now()}`;
      const created = await page.request.post('/api/projects', {
        data: { id: projectId, name: 'Chat scroll wheel reach', skillId: null },
      });
      expect(created.ok(), 'project create').toBeTruthy();
      const { conversationId } = await created.json() as { conversationId: string };

      await page.goto(`/projects/${projectId}/conversations/${conversationId}`, {
        waitUntil: 'domcontentloaded',
      });
      const log = page.locator(CHAT_LOG_SELECTOR);
      await expect(log).toBeVisible({ timeout: T.long });

      // The replay substitutes the agent subprocess entirely, so the agent id
      // only has to be accepted by `POST /api/runs` — no CLI is spawned and no
      // real agent binary is required. That is what keeps this hermetic.
      const sendTurn = async (label: string): Promise<void> => {
        const composer = page.getByTestId('chat-composer-input');
        await composer.click();
        await composer.fill(`replay ${label}`);
        await page.getByTestId('chat-send').click();
      };
      /**
       * A poll that survives a dropped connection. The build loop polls for
       * minutes while the daemon streams, and a single ECONNRESET there would
       * fail the spec for a reason that has nothing to do with scrolling —
       * which is exactly the kind of wrong-reason red this spec exists to avoid.
       * `null` means "ask again", not "no runs".
       */
      const runsNow = async (): Promise<Array<{ id: string; status: string }> | null> => {
        try {
          const res = await page.request.get(`/api/runs?projectId=${projectId}`);
          if (!res.ok()) return null;
          const body = await res.json() as { runs?: Array<{ id: string; status: string }> };
          return body.runs ?? [];
        } catch {
          return null;
        }
      };
      const terminal = (status: string): boolean =>
        ['succeeded', 'failed', 'canceled'].includes(status);
      /**
       * Wait for the turn to settle, and say WHY if it does not. An opaque
       * predicate timeout here is indistinguishable from three different
       * failures — replay not armed, replay running at full speed, or the run
       * never created — and this spec is worthless if it goes red for one of
       * those instead of for the defect.
       */
      /**
       * Wait for THIS turn's run to appear and then settle.
       *
       * Waiting only for "every run is terminal" returns instantly on the
       * previous turn's statuses, because `POST /api/runs` has not landed yet
       * when the poll first fires. That silently skips the turn: an earlier
       * version reported turn durations of 25184, 5, 3, 49553, 12, 15, 11 ms
       * and built a third of the height it thought it had.
       */
      const waitForTurn = async (label: string, known: Set<string>): Promise<number> => {
        const startedAt = Date.now();
        const budgetMs = 4 * T.xlong;
        let runId: string | null = null;
        let lastStatus = 'none';
        while (Date.now() - startedAt < budgetMs) {
          const runs = await runsNow();
          if (runs != null) {
            if (runId == null) {
              runId = runs.find((r) => !known.has(r.id))?.id ?? null;
              if (runId != null) known.add(runId);
            }
            if (runId != null) {
              lastStatus = runs.find((r) => r.id === runId)?.status ?? 'gone';
              if (terminal(lastStatus)) return Date.now() - startedAt;
            }
          }
          await page.waitForTimeout(1_000);
        }
        throw new Error(
          `turn "${label}" did not settle within ${budgetMs}ms `
          + `(runId=${runId ?? 'never created'}, lastStatus=${lastStatus}). `
          + 'A run stuck non-terminal usually means the recording is replaying at its '
          + 'original pace — check OD_REPLAY_SPEED reached the daemon. No run at all '
          + 'means POST /api/runs never happened.',
        );
      };

      const knownRuns = new Set<string>(((await runsNow()) ?? []).map((r) => r.id));
      let layoutMax = 0;
      let builtTurns = 0;
      const turnMs: number[] = [];
      while (layoutMax < MIN_LAYOUT_MAX && builtTurns < MAX_BUILD_TURNS) {
        await sendTurn(`build-${builtTurns}`);
        turnMs.push(await waitForTurn(`build-${builtTurns}`, knownRuns));
        builtTurns += 1;
        layoutMax = await log.evaluate((el) => el.scrollHeight - el.clientHeight);
      }
      // eslint-disable-next-line no-console
      console.log(`[wheel-reach] built ${builtTurns} turns to layoutMax=${layoutMax}; `
        + `turn durations ms = ${turnMs.join(', ')}`);
      expect(
        layoutMax,
        `chat log only reached ${layoutMax}px of scroll range after ${builtTurns} replayed turns; `
        + `the stale-bound trigger was measured just above 5218px, so a shorter log cannot `
        + 'exercise it and a pass here would be vacuous',
      ).toBeGreaterThanOrEqual(MIN_LAYOUT_MAX);

      // The descent deliberately does NOT have to race the stream. The stale
      // bound persists after the turn settles — measured `layoutMax=6517
      // wheel=5356 unreachable=1161` on an idle log — so streaming is only how
      // the log GREW past the bound, not a condition of observing it. Racing a
      // ~25s accelerated turn with a ~23s descent would make the spec flaky for
      // no gain.
      const observations: string[] = [];
      let worst: Awaited<ReturnType<typeof measureWheelReach>> | null = null;
      for (let i = 0; i < DESCENTS; i += 1) {
        const result = await measureWheelReach(page);
        observations.push(
          `#${i} layoutMax=${result.layoutMax} wheel=${result.wheelReached} `
          + `unreachable=${result.unreachable} programmatic=${result.programmaticReached} `
          + `jsPx=${result.jsDisplacementPx} startedAtTop=${result.startedAtTop}`,
        );
        if (worst == null || result.unreachable > worst.unreachable) worst = result;
      }

      expect(worst, `no descent produced a measurement: ${observations.join(' | ')}`)
        .not.toBeNull();
      const observed = worst!;

      // Name the failure cause rather than letting an assertion time out with
      // an opaque diff: the pair below IS the defect's signature.
      expect(
        observed.unreachable,
        `real wheel could not reach the bottom of the chat log.\n`
        + `  layout says ${observed.layoutMax}px of travel exists\n`
        + `  the wheel got to ${observed.wheelReached}px (${observed.unreachable}px short)\n`
        + `  programmatic scrollTop reached ${observed.programmaticReached}px, so the range is real\n`
        + `  follow-mode displaced ${observed.jsDisplacementPx}px during the descent\n`
        + `  all descents: ${observations.join(' | ')}`,
      ).toBe(0);

      // Control. If this ever stops holding, the ruler is broken rather than
      // the product being fixed, and the assertion above means nothing.
      expect(
        observed.programmaticReached,
        'programmatic scrollTop should always reach layoutMax; if it does not, '
        + 'this spec is no longer measuring what it claims',
      ).toBeGreaterThanOrEqual(observed.layoutMax - 1);
    } finally {
      await disarmChatScrollReplay(toolsDev);
    }
  });
});
