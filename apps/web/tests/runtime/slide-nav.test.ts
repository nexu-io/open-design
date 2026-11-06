import { beforeEach, describe, expect, it } from 'vitest';

import {
  deliverableSlideNavForActiveFile,
  isSlideNavDeliverableNow,
  resetConsumedSlideNavForTests,
  shouldConsumeSlideNav,
} from '../../src/runtime/slide-nav';

describe('shouldConsumeSlideNav', () => {
  beforeEach(() => resetConsumedSlideNavForTests());

  it('navigates only on the first handling of a request, even across remounts', () => {
    const key = 'proj:deck.html';
    // First mount handles the queued send's request → flip the preview.
    expect(shouldConsumeSlideNav(key, 5)).toBe(true);
    // The request stays live in parent state; leaving the deck tab and coming
    // back remounts the viewer with the same nonce. It must NOT flip again —
    // otherwise manual navigation after the queued send gets yanked back.
    expect(shouldConsumeSlideNav(key, 5)).toBe(false);
    expect(shouldConsumeSlideNav(key, 5)).toBe(false);
  });

  it('navigates again when a new queued send arms a fresh nonce', () => {
    const key = 'proj:deck.html';
    expect(shouldConsumeSlideNav(key, 5)).toBe(true);
    expect(shouldConsumeSlideNav(key, 9)).toBe(true);
    expect(shouldConsumeSlideNav(key, 9)).toBe(false);
  });

  it('tracks consumed nonces per file independently', () => {
    expect(shouldConsumeSlideNav('proj:a.html', 5)).toBe(true);
    expect(shouldConsumeSlideNav('proj:b.html', 5)).toBe(true);
    expect(shouldConsumeSlideNav('proj:a.html', 5)).toBe(false);
    expect(shouldConsumeSlideNav('proj:b.html', 5)).toBe(false);
  });
});

describe('slide-nav deliverability (follow-along only)', () => {
  it('is deliverable only when the target deck is already an open tab', () => {
    expect(isSlideNavDeliverableNow({ name: 'deck.html' }, ['deck.html', 'index.html'])).toBe(true);
    expect(isSlideNavDeliverableNow({ name: 'deck.html' }, ['index.html'])).toBe(false);
    expect(isSlideNavDeliverableNow({ name: '' }, ['index.html'])).toBe(false);
    expect(isSlideNavDeliverableNow(null, ['deck.html'])).toBe(false);
  });

  it('forwards a request to the active file once it is marked deliverable', () => {
    const req = { name: 'deck.html', slideIndex: 3, nonce: 7 };
    // Target was open at fire time → its nonce became deliverable.
    expect(deliverableSlideNavForActiveFile(req, 'deck.html', 7)).toEqual({ slideIndex: 3, nonce: 7 });
  });

  it('does NOT jump a deck the user opens after a queued send started while it was closed', () => {
    const req = { name: 'deck.html', slideIndex: 3, nonce: 7 };
    // Deck was closed when the send started → nonce never became deliverable
    // (deliverableNonce stays null). Later opening the deck makes it the active
    // file, but the stale request must not resurface and flip the preview.
    expect(deliverableSlideNavForActiveFile(req, 'deck.html', null)).toBeNull();
    // A different deck being active never matches either.
    expect(deliverableSlideNavForActiveFile(req, 'other.html', 7)).toBeNull();
  });
});
