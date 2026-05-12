// @vitest-environment jsdom

/**
 * Coverage for the localStorage-backed feedback store (issue #1288).
 * The store keeps the daemon out of the hot path for v1 so the
 * analytics pipeline can be designed without a contract migration;
 * these tests pin the persistence shape and the cross-mount sync
 * behaviour so a future swap-out for a daemon-backed implementation
 * doesn't quietly drop a feature the UI already depends on.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readMessageFeedback,
  writeMessageFeedback,
} from '../../src/state/message-feedback';

const STORAGE_KEY = (id: string) => `open-design:message-feedback:${id}`;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('message-feedback storage', () => {
  it('returns null when no feedback has been recorded for a message', () => {
    expect(readMessageFeedback('msg-1')).toBeNull();
  });

  it('round-trips a positive rating with the submittedAt timestamp', () => {
    writeMessageFeedback('msg-1', { rating: 'positive', submittedAt: 1700000000 });
    expect(readMessageFeedback('msg-1')).toEqual({
      rating: 'positive',
      submittedAt: 1700000000,
      comment: undefined,
    });
  });

  it('round-trips a negative rating with a free-text comment', () => {
    writeMessageFeedback('msg-2', {
      rating: 'negative',
      comment: 'preview opened the pointer file',
      submittedAt: 1700000005,
    });
    expect(readMessageFeedback('msg-2')).toEqual({
      rating: 'negative',
      comment: 'preview opened the pointer file',
      submittedAt: 1700000005,
    });
  });

  it('clears the entry when null is written', () => {
    writeMessageFeedback('msg-3', { rating: 'positive', submittedAt: 1 });
    expect(readMessageFeedback('msg-3')).not.toBeNull();
    writeMessageFeedback('msg-3', null);
    expect(readMessageFeedback('msg-3')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY('msg-3'))).toBeNull();
  });

  it('returns null and does not throw when the stored value is corrupted JSON', () => {
    // A bad write from a parallel tab or a manual user edit should not
    // crash the chat pane; treating the entry as "not yet rated" is the
    // safe behaviour because the UI can offer a fresh rating instead
    // of showing a stale (wrong) confirmation.
    window.localStorage.setItem(STORAGE_KEY('msg-4'), 'not json');
    expect(readMessageFeedback('msg-4')).toBeNull();
  });

  it('returns null when the stored object is missing the rating field', () => {
    window.localStorage.setItem(
      STORAGE_KEY('msg-5'),
      JSON.stringify({ submittedAt: 42 }),
    );
    expect(readMessageFeedback('msg-5')).toBeNull();
  });

  it('returns null when the stored rating is an unknown value', () => {
    // Defends against a future schema that introduces, say, a `neutral`
    // rating: the older runtime must drop the entry rather than render
    // a degraded badge that does not match the dictionary.
    window.localStorage.setItem(
      STORAGE_KEY('msg-6'),
      JSON.stringify({ rating: 'neutral', submittedAt: 42 }),
    );
    expect(readMessageFeedback('msg-6')).toBeNull();
  });

  it('uses the messageId as the storage key so different messages do not collide', () => {
    writeMessageFeedback('msg-7-a', { rating: 'positive', submittedAt: 1 });
    writeMessageFeedback('msg-7-b', { rating: 'negative', submittedAt: 2 });
    expect(readMessageFeedback('msg-7-a')?.rating).toBe('positive');
    expect(readMessageFeedback('msg-7-b')?.rating).toBe('negative');
  });

  it('broadcasts a CustomEvent carrying the new value on every successful write', () => {
    // Regression for the codex + lefarcen P2: a setItem failure used
    // to leave the broadcast in place but with no value to apply, so
    // listeners would re-read storage and get null. The new contract
    // always includes the value in `detail.value` so listeners can
    // apply it directly without trusting storage.
    const seen: unknown[] = [];
    const handler = (evt: Event) => seen.push((evt as CustomEvent).detail);
    window.addEventListener('open-design:message-feedback', handler);

    writeMessageFeedback('msg-broadcast', { rating: 'positive', submittedAt: 7 });
    writeMessageFeedback('msg-broadcast', null);

    window.removeEventListener('open-design:message-feedback', handler);
    expect(seen).toEqual([
      { messageId: 'msg-broadcast', value: { rating: 'positive', submittedAt: 7 } },
      { messageId: 'msg-broadcast', value: null },
    ]);
  });

  it('still broadcasts the new value when localStorage.setItem throws (private mode / quota)', () => {
    // The whole point of carrying the value in the event: writers in
    // private-mode browsers still keep the in-memory confirmation.
    const seen: unknown[] = [];
    const handler = (evt: Event) => seen.push((evt as CustomEvent).detail);
    window.addEventListener('open-design:message-feedback', handler);
    const setItemSpy = vi
      .spyOn(window.localStorage, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

    writeMessageFeedback('msg-quota', { rating: 'positive', submittedAt: 9 });

    window.removeEventListener('open-design:message-feedback', handler);
    setItemSpy.mockRestore();
    expect(seen).toEqual([
      { messageId: 'msg-quota', value: { rating: 'positive', submittedAt: 9 } },
    ]);
  });
});
