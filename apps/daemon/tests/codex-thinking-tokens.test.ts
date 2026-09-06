import { describe, expect, it } from 'vitest';
import { createCodexAppServerNormalizer } from '../src/agent-protocol/codex-app-server/normalize.js';

/**
 * codex reports live reasoning-token counts; the shell's 「思考中」 slot never
 * saw them.
 *
 * The claude path already ships this reading (`claude-stream.ts` turns the CLI's
 * `system` / `subtype: thinking_tokens` frame into a `thinking_tokens` event,
 * `ExecutionShell` renders it). codex carries the same fact on a different
 * wire: every `thread/tokenUsage/updated` notification includes
 * `total.reasoningOutputTokens`, and the daemon was already reading that field
 * — it just stopped at the `usage` event, which the shell head does not use for
 * this slot.
 *
 * ── Why `total` and not `last` ──────────────────────────────────────────────
 *
 * The frames below are lifted verbatim from a real `codex app-server` session
 * (codex-cli 0.153.0, 2026-09-04), including their arrival offsets. They settle
 * the choice by observation rather than by the field names:
 *
 *   total.reasoningOutputTokens  28, 43, 43, 57, 65, 127, 127, 127   monotonic
 *   last.reasoningOutputTokens   28, 15,  0, 14,  8,  62,   0,   0   resets
 *
 * `last` is per upstream CALL, not per turn — it returns to 0 several times
 * inside one turn. Feeding it to a counter the product requires to only ever
 * climb would make the on-screen number fall back mid-thought. `total` is
 * thread-cumulative and never retreats.
 *
 * The normalizer additionally clamps against its own high-water mark, so a
 * future codex build that replays or resets the counter cannot rewind the
 * reading either.
 */

type Ev = Record<string, unknown>;

const THREAD = { threadId: 't1', turnId: 'turn1' };

/** `total.reasoningOutputTokens` as recorded, in arrival order. */
const REAL_REASONING_SERIES = [28, 43, 43, 57, 65, 127, 127, 127] as const;
/** `last.reasoningOutputTokens` from the same frames — deliberately not used. */
const REAL_LAST_SERIES = [28, 15, 0, 14, 8, 62, 0, 0] as const;

function realTokenUsageFrames() {
  return REAL_REASONING_SERIES.map((reasoning, i) => ({
    method: 'thread/tokenUsage/updated',
    params: {
      ...THREAD,
      tokenUsage: {
        total: {
          totalTokens: 16276 + i * 16700,
          inputTokens: 16143 + i * 16600,
          cachedInputTokens: 11264 + i * 16000,
          cacheWriteInputTokens: 0,
          outputTokens: 133 + i * 100,
          reasoningOutputTokens: reasoning,
        },
        last: {
          totalTokens: 16276,
          inputTokens: 16143,
          cachedInputTokens: 11264,
          cacheWriteInputTokens: 0,
          outputTokens: 133,
          reasoningOutputTokens: REAL_LAST_SERIES[i],
        },
        modelContextWindow: 258400,
      },
    },
  }));
}

function drive(frames: Array<{ method: string; params?: unknown }>) {
  const events: Ev[] = [];
  const normalizer = createCodexAppServerNormalizer((ev) => events.push(ev));
  for (const frame of frames) normalizer.handleNotification(frame.method, frame.params ?? {});
  return events;
}

describe('codex live thinking-token reading', () => {
  it('emits a thinking_tokens event whenever the reading advances', () => {
    const events = drive(realTokenUsageFrames());
    const thinking = events.filter((e) => e.type === 'thinking_tokens');
    // The recorded series is 28, 43, 43, 57, 65, 127, 127, 127 — codex repeats
    // the counter on frames where the model did no further reasoning. Those
    // repeats are dropped rather than re-emitted, and that is the point, not an
    // optimisation: the slot decides between the number and the stopwatch by
    // asking how long the number has stood still. Re-emitting an unchanged
    // count would keep resetting that clock and make a stalled turn look busy.
    expect(thinking.map((e) => e.tokens)).toEqual([28, 43, 57, 65, 127]);
  });

  it('keeps the usage event beside it, unchanged', () => {
    // The two readings answer different questions and have different lifetimes:
    // `usage` is billing and IS persisted, `thinking_tokens` is a live progress
    // signal that `chat-run-messages.ts` deliberately does not store. Replacing
    // one with the other would silently drop a run's cost accounting.
    const events = drive(realTokenUsageFrames().slice(0, 1));
    expect(events.map((e) => e.type)).toEqual(['usage', 'thinking_tokens']);
    expect((events[0] as { usage: Record<string, number> }).usage.thought_tokens).toBe(28);
  });

  it('never lets the reading go backwards', () => {
    // Same wire, adversarial order: a replayed or reset counter must not make
    // the on-screen number fall. The clamp is the invariant, not the ordering
    // of the frames that happened to be recorded.
    const events = drive([
      { method: 'thread/tokenUsage/updated', params: {
        ...THREAD,
        tokenUsage: { total: { inputTokens: 10, outputTokens: 5, reasoningOutputTokens: 900 } },
      } },
      { method: 'thread/tokenUsage/updated', params: {
        ...THREAD,
        tokenUsage: { total: { inputTokens: 20, outputTokens: 6, reasoningOutputTokens: 3 } },
      } },
      { method: 'thread/tokenUsage/updated', params: {
        ...THREAD,
        tokenUsage: { total: { inputTokens: 30, outputTokens: 7, reasoningOutputTokens: 950 } },
      } },
    ]);
    const thinking = events.filter((e) => e.type === 'thinking_tokens');
    expect(thinking.map((e) => e.tokens)).toEqual([900, 950]);
  });

  it('stays silent while the turn has reasoned nothing', () => {
    // Zero is not a progress signal — it is the absence of one. Emitting it
    // would put a 「0 tokens」 reading on screen for every non-reasoning turn.
    const events = drive([
      { method: 'thread/tokenUsage/updated', params: {
        ...THREAD,
        tokenUsage: { total: { inputTokens: 10, outputTokens: 5, reasoningOutputTokens: 0 } },
      } },
    ]);
    expect(events.some((e) => e.type === 'thinking_tokens')).toBe(false);
  });
});
