import { describe, expect, it } from 'vitest';

import { manualEditTextSessionHasLiveDocument } from '../../src/runtime/manual-edit-text-session';

/**
 * The predicate decides whether a fail-closed teardown may block on the host's
 * inline-text-session belief. Both directions cost a user something real, so
 * both are pinned here:
 *
 * - Saying "live" when the document is gone is the silent save. No bridge will
 *   ever answer, the settle times out, and Save returns before it writes
 *   anything or sets an error.
 * - Saying "gone" when the document is alive drops a genuinely pending inline
 *   edit and lets teardown proceed straight through it.
 *
 * The second is why "the session window is not the active frame" is not enough
 * on its own. A retained viewer keeps its document mounted while deactivated,
 * and the current/standby pair swaps under promotion and navigation retries;
 * the frame the host would post into is routinely not the frame that opened the
 * session, with no replacement involved. Only the absence of the document from
 * a non-empty set of mounted documents is evidence.
 */
const windowA = { name: 'document-a' } as unknown as Window;
const windowB = { name: 'document-b' } as unknown as Window;

describe('manualEditTextSessionHasLiveDocument', () => {
  it('keeps the session while its document is still mounted', () => {
    expect(manualEditTextSessionHasLiveDocument({
      liveWindows: [windowA],
      sessionWindow: windowA,
    })).toBe(true);
  });

  it('keeps the session when its document is mounted but not the active frame', () => {
    // The standby/current swap and the retained-viewer cycle both land here.
    expect(manualEditTextSessionHasLiveDocument({
      liveWindows: [windowB, windowA],
      sessionWindow: windowA,
    })).toBe(true);
  });

  it('releases the session once its document is absent from the mounted set', () => {
    expect(manualEditTextSessionHasLiveDocument({
      liveWindows: [windowB],
      sessionWindow: windowA,
    })).toBe(false);
  });

  it('keeps the session when no document is mounted to compare against', () => {
    // No evidence is not counter-evidence: an unaligned or torn-down ref must
    // not be read as a replacement.
    expect(manualEditTextSessionHasLiveDocument({
      liveWindows: [null, undefined],
      sessionWindow: windowA,
    })).toBe(true);
    expect(manualEditTextSessionHasLiveDocument({
      liveWindows: [],
      sessionWindow: windowA,
    })).toBe(true);
  });

  it('keeps a session recorded without an owning document', () => {
    // Sessions minted before this scoping existed carry no witness; they keep
    // the original fail-closed behavior rather than being weakened by it.
    expect(manualEditTextSessionHasLiveDocument({
      liveWindows: [windowB],
      sessionWindow: null,
    })).toBe(true);
  });
});
