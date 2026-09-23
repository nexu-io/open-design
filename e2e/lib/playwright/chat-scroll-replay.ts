/**
 * Deterministic chat-log streaming, and a wheel-reach ruler built to be honest
 * about its own limits.
 *
 * HISTORY, BECAUSE IT IS THE POINT
 * --------------------------------
 * Two earlier versions of this ruler each manufactured the defect they were
 * built to detect, and both looked entirely convincing in the data:
 *
 *  - A FIXED WHEEL BUDGET. One version sent a constant total of wheel delta
 *    (5356px) and called whatever remained "unreachable". On any taller log it
 *    reported a ceiling of exactly `layoutMax - 5356`, and its per-phase
 *    reaches matched the running budget to the pixel — every notch had
 *    delivered in full, nothing had ever stalled. It was reporting subtraction.
 *  - CONTAMINATION DELETION. The version before that ran until the wheel
 *    stalled, but refused to credit any step during which follow-mode also
 *    wrote scrollTop. Where follow re-pins constantly that discarded most of an
 *    honest descent, so the log showed the wheel arriving at the bottom while
 *    the "clean reach" sat hundreds of pixels lower.
 *
 * Everything those two produced was withdrawn. The guards that replaced them:
 * no total budget, per-notch requested-vs-actual accounting, a reported runaway
 * cap, and JS displacement recorded beside the reach instead of subtracted from
 * it. A stall means consecutive notches asked for real pixels and moved
 * nothing — never "the scan stopped asking".
 *
 * STILL TRUE AND STILL LOAD-BEARING
 * ---------------------------------
 *  - `scrollTop = n` is the CONTROL, never the measurement. Programmatic
 *    assignment reaches the bottom even on a genuinely frozen log; the
 *    defect's signature is the PAIR (assignment lands, wheel does not).
 *  - Coarse-only stepping cannot see a small ceiling — real ones as low as 25px
 *    and 91px were reported from a packaged client — so the descent refines
 *    down to 4px notches.
 *
 * UNRESOLVED
 * ----------
 * This harness has never been confirmed to reproduce a genuine wheel stall.
 * The one candidate observation (wheel dead at 6px against 1673px of range) was
 * never reproduced, and every other "ceiling" turned out to be one of the two
 * ruler bugs above. The freezes users actually hit were caught on a packaged
 * client, not here.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

import { CHAT_SCROLL_RECORDING } from '../../resources/chat-scroll-recording.ts';
import type { ToolsDevSuite } from '../tools-dev/types.ts';

/** Directory name the daemon's `.selected` pointer names. */
export const WHEEL_REACH_RECORDING = 'wheel-reach';

const FILLER_WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot'];
/** Filler of an exact length — length is what drives wrapping, and so height. */
function filler(n: number, seed: number): string {
  let out = '';
  let i = seed;
  while (out.length < n) {
    out += (out ? ' ' : '') + FILLER_WORDS[i % FILLER_WORDS.length];
    i += 1;
  }
  return out.slice(0, n);
}

/**
 * Expand the compact resource into the `events.jsonl` the daemon replays.
 *
 * The daemon reads a durable run event log: one JSON record per line with
 * `{id, event, data, timestamp}`. The resource stores offsets rather than
 * absolute timestamps so the fixture is stable, and stores payload lengths
 * rather than payload text so no user content ships.
 */
function expandRecording(): string {
  const base = Date.now() - 3_600_000;
  return CHAT_SCROLL_RECORDING.map(([offset, kind, payload], index) => {
    const timestamp = base + offset;
    const id = index + 1;
    if (kind === 'j') {
      const outer = JSON.parse(String(payload)) as { event: string; data: unknown };
      return JSON.stringify({ id, event: outer.event, data: outer.data, timestamp });
    }
    return JSON.stringify({
      id,
      event: 'agent',
      data: {
        type: kind === 't' ? 'text_delta' : 'thinking_delta',
        delta: filler(Number(payload), index),
      },
      timestamp,
    });
  }).join('\n') + '\n';
}

export const CHAT_LOG_SELECTOR = '[data-testid="chat-log"]';

/**
 * Where the daemon looks for recordings. The worker fixture points
 * `OD_REPLAY_DIR` here for its whole lifetime, but arming the directory is not
 * by itself a decision to replay: the daemon only substitutes a recording for
 * the real agent when a `.selected` pointer names one. Every other spec sharing
 * this runtime keeps its normal agent.
 */
export function replayDirFor(toolsDev: ToolsDevSuite): string {
  return join(toolsDev.root, 'scratch', 'chat-scroll-replay');
}

/** Materialize the fixture into this worker's replay dir and select it. */
export async function armChatScrollReplay(
  toolsDev: ToolsDevSuite,
  recording: string = WHEEL_REACH_RECORDING,
): Promise<void> {
  const dir = replayDirFor(toolsDev);
  await mkdir(join(dir, recording), { recursive: true });
  await writeFile(join(dir, recording, 'events.jsonl'), expandRecording(), 'utf8');
  await writeFile(join(dir, '.selected'), recording, 'utf8');
}

/** Stop replaying, so later runs in this worker reach a real agent again. */
export async function disarmChatScrollReplay(toolsDev: ToolsDevSuite): Promise<void> {
  await writeFile(join(replayDirFor(toolsDev), '.selected'), '', 'utf8');
}

export interface WheelReachResult {
  /** `scrollHeight - clientHeight` at the instant the wheel got closest. */
  layoutMax: number;
  /** The furthest `scrollTop` the wheel alone reached. */
  wheelReached: number;
  /**
   * `layoutMax - wheelReached`, both read from the SAME rAF sample. Mixing two
   * instants is not a rounding detail: the log grows during the descent, and an
   * across-instants subtraction produced values from -244 to +47 on a log that
   * was in fact fully reachable.
   */
  unreachable: number;
  /** Control: where `scrollTop = 1e7` lands. Expected to equal layoutMax. */
  programmaticReached: number;
  /** Pixels the app's own follow logic moved the scroller during the descent. */
  jsDisplacementPx: number;
  /** True when the descent began from a released follow state at the top. */
  startedAtTop: boolean;
  /**
   * Total wheel delta asked for. Recorded so that "the wheel stopped" and "the
   * scan stopped asking" can never again be confused: a reach that equals this
   * number is the scan's own limit, not the product's.
   */
  requestedTotalPx: number;
  /** Consecutive dead notches at the end of the descent. */
  deadTailNotches: number;
  /** 'reached-bottom' | 'STALLED' | 'INCONCLUSIVE-hit-request-cap'. */
  verdict: string;
}

interface Sample { t: number; st: number; sh: number; ch: number }
interface WriteRecord { at: number; fromPx: number; toPx: number }

/**
 * Notch size for the descent. There is deliberately NO total budget.
 *
 * An earlier version of this scan sent a FIXED total of wheel delta and called
 * whatever was left "unreachable". On any log taller than that total it
 * reported a ceiling equal to `layoutMax - budget`, and the per-phase reaches
 * matched the running budget to the pixel — every notch had delivered in full
 * and nothing had ever stalled. It measured its own arithmetic. Do not
 * reintroduce a cap on how much this is allowed to ask for.
 */
const NOTCH_PX = 600;
/** Consecutive notches that must ask for real pixels and move nothing. */
const STALL_LIMIT = 6;
/** Sub-pixel rounding is not a ceiling. */
const TOLERANCE_PX = 2;

/**
 * Coarse-to-fine, because a coarse step alone cannot see a small ceiling: a
 * 91px ceiling is invisible to a 240px step and reads as zero drift. The coarse
 * phases only find the neighbourhood; what the finest step can still reach is
 * the number that matters.
 */
/**
 * Milliseconds between wheel notches.
 *
 * A slow, human-ish cadence is kept for one reason that survived the audit:
 * rapid successive wheel events get accelerated, so a notch moves more than the
 * delta it asked for. That breaks the requested-vs-actual accounting this ruler
 * depends on to tell "the wheel stopped" apart from "the scan stopped asking".
 *
 * (An earlier comment here claimed a 40ms burst hid the defect while 800ms
 * exposed it. That comparison was an artifact of the fixed budget described in
 * the file header — the fast burst simply covered more ground per notch and so
 * escaped the budget. It is not evidence about the defect.)
 */
const WHEEL_CADENCE_MS = 800;

export async function measureWheelReach(
  page: Page,
  { cadenceMs = WHEEL_CADENCE_MS }: { cadenceMs?: number } = {},
): Promise<WheelReachResult> {
  const armed = await page.evaluate(() => {
    const w = window as unknown as {
      __chatScrollFreeze?: { writes?: { enable?: () => boolean; clear?: () => void } };
    };
    w.__chatScrollFreeze?.writes?.clear?.();
    return Boolean(w.__chatScrollFreeze?.writes?.enable?.());
  });
  if (!armed) {
    // Without write attribution a follow-mode carry to the bottom is
    // indistinguishable from the wheel working, which would turn this spec
    // green exactly when it should be red. Refuse to measure instead.
    throw new Error(
      'chat scroll write trace unavailable: window.__chatScrollFreeze.writes.enable() '
      + 'returned false, so wheel movement cannot be separated from stick-to-bottom writes',
    );
  }

  const box = await page.locator(CHAT_LOG_SELECTOR).boundingBox();
  if (!box) throw new Error('chat log has no bounding box');
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  await page.mouse.move(cx, cy);

  await page.evaluate((sel) => {
    const w = window as unknown as { __wheelScan?: { raf?: number; samples: number[][] } };
    if (w.__wheelScan?.raf) cancelAnimationFrame(w.__wheelScan.raf);
    const t0 = performance.now();
    const scan: { raf?: number; samples: number[][] } = { samples: [] };
    w.__wheelScan = scan;
    const tick = (): void => {
      const el = document.querySelector(sel);
      if (el) {
        scan.samples.push([
          Math.round(performance.now() - t0),
          Math.round(el.scrollTop), el.scrollHeight, el.clientHeight,
        ]);
      }
      scan.raf = requestAnimationFrame(tick);
    };
    tick();
  }, CHAT_LOG_SELECTOR);

  // Leave the bottom with real wheel input, so follow disengages the way it
  // does for a user reading back through the transcript.
  for (let i = 0; i < 14; i += 1) {
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(600);
  const startedAtTop = await page.evaluate(
    (sel) => (document.querySelector(sel)?.scrollTop ?? 999) <= 2,
    CHAT_LOG_SELECTOR,
  );

  // Descend with no total budget: keep asking until the scroller stops
  // responding. The cap below is a runaway guard, set far above any plausible
  // log, and it is REPORTED so it can never be mistaken for the measurement.
  const startGeom = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? { sh: el.scrollHeight, ch: el.clientHeight, st: el.scrollTop } : null;
  }, CHAT_LOG_SELECTOR);
  const requestCapPx = Math.max(60_000, ((startGeom?.sh ?? 0) - (startGeom?.ch ?? 0)) * 6);

  let requestedTotalPx = 0;
  let deadTail = 0;
  let reached = startGeom?.st ?? 0;
  let hitCap = false;
  const readTop = async (): Promise<{ st: number; max: number }> => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? { st: el.scrollTop, max: el.scrollHeight - el.clientHeight } : { st: 0, max: 0 };
  }, CHAT_LOG_SELECTOR);

  for (const notch of [NOTCH_PX, 240, 60, 16, 4]) {
    deadTail = 0;
    for (;;) {
      const before = await readTop();
      if (before.max - reached <= TOLERANCE_PX) break;
      if (requestedTotalPx >= requestCapPx) { hitCap = true; break; }
      await page.mouse.wheel(0, notch);
      requestedTotalPx += notch;
      await page.waitForTimeout(cadenceMs);
      const after = await readTop();
      reached = Math.max(reached, after.st);
      if (after.st - before.st > TOLERANCE_PX) deadTail = 0; else deadTail += 1;
      if (deadTail >= STALL_LIMIT) break;
    }
    if (hitCap) break;
    const now = await readTop();
    if (now.max - reached <= TOLERANCE_PX) break;
  }
  await page.waitForTimeout(600);
  const descentEnd = await page.evaluate(() => performance.now());

  const raw = await page.evaluate(() => {
    const w = window as unknown as {
      __wheelScan?: { raf?: number; samples: number[][] };
      __chatScrollFreeze?: { writes?: { list?: () => Array<Record<string, unknown>> } };
    };
    if (w.__wheelScan?.raf) cancelAnimationFrame(w.__wheelScan.raf);
    return {
      samples: w.__wheelScan?.samples ?? [],
      writes: (w.__chatScrollFreeze?.writes?.list?.() ?? []).map((x) => ({
        at: Number(x.at ?? 0),
        fromPx: Number(x.fromPx ?? -1),
        toPx: Number(x.toPx ?? -1),
      })),
    };
  });

  // JS displacement is REPORTED, never subtracted from reach. A previous
  // version refused to credit any step during which follow-mode also wrote
  // scrollTop; on a log where follow re-pins constantly that discarded most of
  // an honest descent and invented a ceiling hundreds of pixels below where the
  // wheel had visibly got to.
  const displacing = (raw.writes as WriteRecord[]).filter((w) => Math.abs(w.toPx - w.fromPx) >= 1);
  const jsDisplacementPx = displacing.reduce((a, w) => a + Math.abs(w.toPx - w.fromPx), 0);
  const samples: Sample[] = raw.samples.map(([t, st, sh, ch]) => ({
    t: t as number, st: st as number, sh: sh as number, ch: ch as number,
  }));
  // Geometry has to come from ONE sample: the log grows during the descent, and
  // pairing a reach from one instant with a layoutMax from another produced
  // scatter from -244 to +47 on a log that was fully reachable.
  const best = samples.length > 0
    ? samples.reduce((a, b) => (((b.sh - b.ch) - b.st) < ((a.sh - a.ch) - a.st) ? b : a))
    : null;

  const programmaticReached = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return -1;
    el.scrollTop = 1e7;
    return Math.round(el.scrollTop);
  }, CHAT_LOG_SELECTOR);

  if (!best) throw new Error('no scroll samples captured during the descent');
  const layoutMax = Math.round(best.sh - best.ch);
  const wheelReached = Math.round(Math.max(reached, best.st));
  const unreachable = Math.round(layoutMax - wheelReached);
  return {
    layoutMax,
    wheelReached,
    unreachable,
    programmaticReached,
    jsDisplacementPx,
    startedAtTop,
    requestedTotalPx,
    deadTailNotches: deadTail,
    // A stall is consecutive notches asking for real pixels and moving nothing.
    // It is never "the scan stopped asking".
    verdict: unreachable <= TOLERANCE_PX
      ? 'reached-bottom'
      : hitCap
        ? 'INCONCLUSIVE-hit-request-cap'
        : deadTail >= STALL_LIMIT ? 'STALLED' : 'inconclusive',
  };
}
