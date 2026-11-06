import { describe, expect, it } from 'vitest';
import type { DeckNavigateMessage } from '../src/runtime/deck-protocol';

describe('deck navigation protocol types', () => {
  it('requires an index only for absolute navigation', () => {
    const absolute = {
      type: 'od:slide',
      action: 'go',
      index: 2,
      protocolVersion: 1,
    } satisfies DeckNavigateMessage;
    const relative = {
      type: 'od:slide',
      action: 'next',
    } satisfies DeckNavigateMessage;

    // @ts-expect-error Absolute navigation must name its zero-based target.
    const missingIndex: DeckNavigateMessage = { type: 'od:slide', action: 'go' };
    // @ts-expect-error Relative navigation must not carry an ambiguous index.
    const unexpectedIndex: DeckNavigateMessage = {
      type: 'od:slide',
      action: 'next',
      index: 2,
    };

    expect(absolute.index).toBe(2);
    expect(relative.action).toBe('next');
    void missingIndex;
    void unexpectedIndex;
  });
});
