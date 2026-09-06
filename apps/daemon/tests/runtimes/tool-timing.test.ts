import { describe, expect, it } from 'vitest';
import { stampToolTiming } from '../../src/runtimes/tool-timing.js';

const clockAt = (...values: number[]) => {
  let i = 0;
  return { now: () => values[Math.min(i++, values.length - 1)] ?? 0 };
};

describe('stampToolTiming', () => {
  it('stamps a start time on tool_use so the UI can measure the call', () => {
    const ev: Record<string, unknown> = { type: 'tool_use', id: 't1', name: 'Read', input: {} };
    stampToolTiming(ev, clockAt(1_000));
    expect(ev.startedAt).toBe(1_000);
  });

  it('stamps a finish time on tool_result', () => {
    const ev: Record<string, unknown> = { type: 'tool_result', toolUseId: 't1', content: 'ok' };
    stampToolTiming(ev, clockAt(1_400));
    expect(ev.completedAt).toBe(1_400);
  });

  it('never overwrites a time the adapter already knows (ACP carries its own first-frame time)', () => {
    const use: Record<string, unknown> = { type: 'tool_use', id: 't1', startedAt: 42 };
    const result: Record<string, unknown> = { type: 'tool_result', toolUseId: 't1', completedAt: 99 };
    stampToolTiming(use, clockAt(1_000));
    stampToolTiming(result, clockAt(1_000));
    expect(use.startedAt).toBe(42);
    expect(result.completedAt).toBe(99);
  });

  it('leaves every other event kind untouched', () => {
    for (const ev of [
      { type: 'text_delta', delta: 'hi' },
      { type: 'thinking_delta', delta: '' },
      { type: 'status', label: 'requesting' },
      { type: 'usage' },
    ] as Record<string, unknown>[]) {
      const before = JSON.stringify(ev);
      stampToolTiming(ev, clockAt(1_000));
      expect(JSON.stringify(ev)).toBe(before);
    }
  });

  it('tolerates junk without throwing — this sits on the hot path of every run', () => {
    expect(() => stampToolTiming(null)).not.toThrow();
    expect(() => stampToolTiming(undefined)).not.toThrow();
    expect(() => stampToolTiming('tool_use')).not.toThrow();
    expect(() => stampToolTiming(7)).not.toThrow();
  });

  it('a call whose start and finish arrive together yields a sub-100ms span — the web reads that as unknown', () => {
    // codex emits `tool_use` only at `item.completed`, so both ends land in the same tick.
    const clock = clockAt(5_000, 5_002);
    const use: Record<string, unknown> = { type: 'tool_use', id: 't1' };
    const result: Record<string, unknown> = { type: 'tool_result', toolUseId: 't1' };
    stampToolTiming(use, clock);
    stampToolTiming(result, clock);
    expect((result.completedAt as number) - (use.startedAt as number)).toBeLessThan(100);
  });
});
