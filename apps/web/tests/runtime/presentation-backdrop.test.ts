import { describe, expect, it } from 'vitest';

import {
  PRESENTATION_BACKDROP_DELAY_MS,
  presentationBackdropPhase,
} from '../../src/runtime/presentation-backdrop';

describe('when the presentation backdrop may paint', () => {
  it('paints nothing while not presenting', () => {
    expect(presentationBackdropPhase({
      presenting: false, promotedAtMs: 1_000, nowMs: 9_999,
    })).toBe('idle');
  });

  // The flash: the ground must not arrive in the same frame as the layout
  // change, or the audience sees black before the slide.
  it('stays transparent for the frames right after promotion', () => {
    expect(presentationBackdropPhase({
      presenting: true, promotedAtMs: 1_000, nowMs: 1_000,
    })).toBe('promoting');
    expect(presentationBackdropPhase({
      presenting: true,
      promotedAtMs: 1_000,
      nowMs: 1_000 + PRESENTATION_BACKDROP_DELAY_MS - 1,
    })).toBe('promoting');
  });

  // And it must actually arrive: letterbox bars for a slide whose aspect ratio
  // does not fill the window depend on it.
  it('paints the ground once the document has had time to render', () => {
    expect(presentationBackdropPhase({
      presenting: true,
      promotedAtMs: 1_000,
      nowMs: 1_000 + PRESENTATION_BACKDROP_DELAY_MS,
    })).toBe('settled');
  });

  it('treats an unknown promotion time as still promoting', () => {
    expect(presentationBackdropPhase({
      presenting: true, promotedAtMs: null, nowMs: 5_000,
    })).toBe('promoting');
  });
});
