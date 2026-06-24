import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  codexSessionIdFromRunEvents,
  extractCodexLastTurnFirstCallUsage,
  readCodexRolloutFirstCall,
} from '../src/codex-rollout-usage.js';

// Shapes mirror real codex 0.133.0 rollout JSONL (`~/.codex/sessions/**/rollout-*.jsonl`):
// each turn opens with a `task_started` event_msg, and every model call emits a
// `token_count` event_msg whose `info.last_token_usage` is that single call's
// usage (OpenAI-style: input_tokens INCLUDES the cached_input_tokens subset).
function taskStarted(): string {
  return JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } });
}
function tokenCount(input: number | null, cached: number | null): string {
  return JSON.stringify({
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info:
        input === null
          ? { last_token_usage: null }
          : { last_token_usage: { input_tokens: input, cached_input_tokens: cached } },
    },
  });
}

describe('extractCodexLastTurnFirstCallUsage', () => {
  it('reports the first call of the LAST turn, not the whole-session aggregate', () => {
    // Real numbers from a 3-turn session: turn-1 is a cold open (18.5%), turn-2
    // a warm resume (96.2%). The daemon just finished turn-3 (95%).
    const rollout = [
      taskStarted(),
      tokenCount(13137, 2432), // turn-1 first call
      tokenCount(13160, 2560), // within-turn-1 follow-up — must be ignored
      taskStarted(),
      tokenCount(13171, 12672), // turn-2 first call (the 96% spec number)
      taskStarted(),
      tokenCount(13342, 12672), // turn-3 first call — this is what we want
      tokenCount(20000, 18000), // within-turn-3 follow-up — must be ignored
    ].join('\n');

    const result = extractCodexLastTurnFirstCallUsage(rollout);
    expect(result).toEqual({
      first_call_input_tokens: 13342,
      first_call_cache_read_input_tokens: 12672,
      first_call_cache_hit_ratio: 12672 / 13342,
    });
  });

  it('skips zero-input placeholder calls and uses the turn’s real first call', () => {
    const rollout = [
      taskStarted(),
      tokenCount(0, 0), // interrupted/placeholder call — no usable ratio
      tokenCount(40318, 15744), // the turn’s real opening call
    ].join('\n');

    const result = extractCodexLastTurnFirstCallUsage(rollout);
    expect(result?.first_call_input_tokens).toBe(40318);
    expect(result?.first_call_cache_hit_ratio).toBeCloseTo(15744 / 40318);
  });

  it('treats a missing cached subset as a zero cache hit on a cold open', () => {
    const rollout = [taskStarted(), tokenCount(15761, null)].join('\n');
    const result = extractCodexLastTurnFirstCallUsage(rollout);
    expect(result).toEqual({
      first_call_input_tokens: 15761,
      first_call_cache_read_input_tokens: 0,
      first_call_cache_hit_ratio: 0,
    });
  });

  it('returns null when the last turn produced no usable token_count yet', () => {
    const rollout = [
      taskStarted(),
      tokenCount(13171, 12672),
      taskStarted(), // a fresh turn opened but no call has landed
      tokenCount(null, null),
    ].join('\n');
    expect(extractCodexLastTurnFirstCallUsage(rollout)).toBeNull();
  });

  it('tolerates blank lines and non-JSON noise without throwing', () => {
    const rollout = ['', 'not json', taskStarted(), '   ', tokenCount(13342, 12672)].join('\n');
    const result = extractCodexLastTurnFirstCallUsage(rollout);
    expect(result?.first_call_cache_hit_ratio).toBeCloseTo(12672 / 13342);
  });
});

describe('codexSessionIdFromRunEvents', () => {
  const statusEvent = (extra: Record<string, unknown>) => ({
    event: 'agent',
    data: { type: 'status', label: 'initializing', ...extra },
  });

  it('returns the thread id from the initializing status event', () => {
    const events = [
      statusEvent({ sessionId: '019eef4f-7409-7c82-bebe-30504eed3959' }),
      { event: 'agent', data: { type: 'status', label: 'thinking' } },
    ];
    expect(codexSessionIdFromRunEvents(events)).toBe(
      '019eef4f-7409-7c82-bebe-30504eed3959',
    );
  });

  it('ignores status events without a session id and non-status events', () => {
    const events = [
      { event: 'agent', data: { type: 'usage', usage: { input_tokens: 1 } } },
      statusEvent({ label: 'thinking' }),
    ];
    expect(codexSessionIdFromRunEvents(events)).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(codexSessionIdFromRunEvents(null)).toBeNull();
    expect(codexSessionIdFromRunEvents('nope')).toBeNull();
    expect(codexSessionIdFromRunEvents([{ event: 'agent' }, 42])).toBeNull();
  });
});

describe('readCodexRolloutFirstCall', () => {
  // Plants a rollout under <home>/sessions/<y>/<m>/<d>/ exactly as codex names
  // them, so the locate-and-read layer is covered (not just the pure extractor).
  function plantRollout(sessionId: string, lines: string[]): string {
    const home = mkdtempSync(path.join(tmpdir(), 'codex-home-'));
    const dayDir = path.join(home, 'sessions', '2026', '06', '24');
    mkdirSync(dayDir, { recursive: true });
    writeFileSync(
      path.join(dayDir, `rollout-2026-06-24T12-00-00-${sessionId}.jsonl`),
      lines.join('\n'),
    );
    return home;
  }
  const rollout = (sid: string) => [
    JSON.stringify({ type: 'event_msg', payload: { type: 'task_started' } }),
    JSON.stringify({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 13342, cached_input_tokens: 12672 } },
      },
    }),
  ];

  it('locates the rollout by session id under CODEX_HOME and extracts first-call', async () => {
    const sid = '019eef4f-7409-7c82-bebe-30504eed3959';
    const home = plantRollout(sid, rollout(sid));
    const result = await readCodexRolloutFirstCall({ codexHome: home, sessionId: sid });
    expect(result?.first_call_input_tokens).toBe(13342);
    expect(result?.first_call_cache_hit_ratio).toBeCloseTo(12672 / 13342);
  });

  it('returns null (never throws) when the session id has no matching rollout', async () => {
    const home = plantRollout('some-other-session', rollout('some-other-session'));
    await expect(
      readCodexRolloutFirstCall({ codexHome: home, sessionId: 'missing-session' }),
    ).resolves.toBeNull();
  });

  it('returns null when no session id is given', async () => {
    await expect(
      readCodexRolloutFirstCall({ codexHome: '/nonexistent', sessionId: null }),
    ).resolves.toBeNull();
  });
});
