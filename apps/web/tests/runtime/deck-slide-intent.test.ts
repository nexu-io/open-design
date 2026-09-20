import { describe, expect, it } from 'vitest';

import {
  DECK_SLIDE_INTENT_TIMEOUT_MS,
  decideDeckSlideReport,
} from '../../src/runtime/deck-slide-intent';

describe('deck slide reports while the host is mid-move', () => {
  it('adopts anything when the host is not waiting on a move', () => {
    expect(decideDeckSlideReport(null, 2, 1_000)).toBe('adopt');
  });

  // The measured loop: the host asks for 1, a second reporter answers with a
  // stale 2, the host adopts it and replays 2 as a fresh intent, which is
  // answered with 1 — forever.
  it('ignores a report that disagrees with the move in flight', () => {
    expect(decideDeckSlideReport({ index: 1, atMs: 1_000 }, 2, 1_050)).toBe('ignore');
  });

  it('settles once the deck confirms the move', () => {
    expect(decideDeckSlideReport({ index: 1, atMs: 1_000 }, 1, 1_050)).toBe('adopt-and-settle');
  });

  // A deck that clamps the index, or has no runtime to answer at all, must not
  // be able to freeze host state: this is a tie-breaker, not a lock.
  it('gives up waiting rather than stranding host state', () => {
    const justBefore = 1_000 + DECK_SLIDE_INTENT_TIMEOUT_MS - 1;
    expect(decideDeckSlideReport({ index: 1, atMs: 1_000 }, 2, justBefore)).toBe('ignore');
    const atTimeout = 1_000 + DECK_SLIDE_INTENT_TIMEOUT_MS;
    expect(decideDeckSlideReport({ index: 1, atMs: 1_000 }, 2, atTimeout)).toBe('adopt-and-settle');
  });
});
