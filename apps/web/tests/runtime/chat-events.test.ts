import { describe, expect, it } from 'vitest';

import { appendErrorStatusEvent } from '../../src/runtime/chat-events';
import type { ChatMessage } from '../../src/types';

const base: ChatMessage = { id: 'm1', role: 'assistant', content: '' };

describe('appendErrorStatusEvent', () => {
  it('returns the message unchanged when detail is empty or whitespace', () => {
    expect(appendErrorStatusEvent(base, '')).toBe(base);
    expect(appendErrorStatusEvent(base, '   ')).toBe(base);
  });

  it('appends a status event with the given detail when there are no prior events', () => {
    const next = appendErrorStatusEvent(base, 'boom');
    expect(next).not.toBe(base);
    expect(next.events).toEqual([{ kind: 'status', label: 'error', detail: 'boom' }]);
  });

  it('does not duplicate when the last event is an identical error status', () => {
    const seeded: ChatMessage = {
      ...base,
      events: [{ kind: 'status', label: 'error', detail: 'boom' }],
    };
    expect(appendErrorStatusEvent(seeded, 'boom')).toBe(seeded);
  });

  it('merges classification into the existing trailing error event with the same detail', () => {
    // Reload/reattach race: the daemon-persisted error frame is read first
    // (detail only), then the run finishes and onError arrives with the
    // finalize-time classification. The helper must enrich in place, not no-op.
    const seeded: ChatMessage = {
      ...base,
      events: [{ kind: 'status', label: 'error', detail: 'quota gone' }],
    };
    const next = appendErrorStatusEvent(seeded, 'quota gone', 'RATE_LIMITED', {
      failureCategory: 'rate_limit',
      failureDetail: 'hard_quota',
    });
    expect(next).not.toBe(seeded);
    expect(next.events).toHaveLength(1);
    expect(next.events?.[0]).toEqual({
      kind: 'status',
      label: 'error',
      detail: 'quota gone',
      code: 'RATE_LIMITED',
      failureCategory: 'rate_limit',
      failureDetail: 'hard_quota',
    });
  });

  it('no-ops when the new pass adds nothing beyond the existing error event', () => {
    const seeded: ChatMessage = {
      ...base,
      events: [
        {
          kind: 'status',
          label: 'error',
          detail: 'quota gone',
          code: 'RATE_LIMITED',
          failureCategory: 'rate_limit',
          failureDetail: 'hard_quota',
        },
      ],
    };
    expect(
      appendErrorStatusEvent(seeded, 'quota gone', 'RATE_LIMITED', {
        failureCategory: 'rate_limit',
        failureDetail: 'hard_quota',
      }),
    ).toBe(seeded);
  });

  it('appends when the previous error status detail differs', () => {
    const seeded: ChatMessage = {
      ...base,
      events: [{ kind: 'status', label: 'error', detail: 'first' }],
    };
    const next = appendErrorStatusEvent(seeded, 'second');
    expect(next.events).toHaveLength(2);
    expect(next.events?.[1]).toEqual({ kind: 'status', label: 'error', detail: 'second' });
  });

  it('preserves non-error events that precede the new one', () => {
    const seeded: ChatMessage = {
      ...base,
      events: [{ kind: 'text', text: 'hi' }, { kind: 'status', label: 'ok' }],
    };
    const next = appendErrorStatusEvent(seeded, 'fail');
    expect(next.events).toEqual([
      { kind: 'text', text: 'hi' },
      { kind: 'status', label: 'ok' },
      { kind: 'status', label: 'error', detail: 'fail' },
    ]);
  });
});
