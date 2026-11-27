import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectSpeakerNotes } from '../../src/main/deck-capture.js';

// #7526: the screenshot PPTX gets its speaker notes from the rendered deck. The
// collector runs inside the render window (serialized with `.toString()`), so it
// is exercised here against a minimal stand-in for the page's `document`.

const SLIDE_SELECTOR = '.slide, [data-screen-label], .deck-slide, .ppt-slide';

interface FakeSlide {
  notes?: string;
  // A presenter-mode clone (thumbnail / overview), which is never captured.
  clone?: boolean;
}

function stubDocument(page: { speakerNotes?: string; slides: FakeSlide[] }): void {
  const slides = page.slides.map((slide) => ({
    closest: () => (slide.clone ? {} : null),
    querySelector: (selector: string) =>
      selector === '.notes' && slide.notes !== undefined ? { textContent: slide.notes } : null,
  }));
  vi.stubGlobal('document', {
    getElementById: (id: string) =>
      id === 'speaker-notes' && page.speakerNotes !== undefined ? { textContent: page.speakerNotes } : null,
    querySelectorAll: () => slides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('collectSpeakerNotes', () => {
  it("reads the editor's #speaker-notes JSON, one entry per captured slide", () => {
    stubDocument({
      speakerNotes: JSON.stringify(['Open with the Q3 number\nThen pause', '', 7]),
      slides: [{}, {}, {}, {}],
    });
    expect(collectSpeakerNotes(SLIDE_SELECTOR)).toEqual(['Open with the Q3 number\nThen pause', '', '', '']);
  });

  it('prefers the #speaker-notes JSON over per-slide .notes', () => {
    stubDocument({ speakerNotes: '["From the editor"]', slides: [{ notes: 'Stale aside' }] });
    expect(collectSpeakerNotes(SLIDE_SELECTOR)).toEqual(['From the editor']);
  });

  it("falls back to each slide's .notes, skipping presenter clones so notes stay aligned", () => {
    stubDocument({
      slides: [
        { notes: '  First   slide\n note ' },
        { notes: 'Clone copy', clone: true },
        {},
        { notes: 'Third' },
      ],
    });
    expect(collectSpeakerNotes(SLIDE_SELECTOR)).toEqual(['First slide note', '', 'Third']);
  });

  it('gives a plain-text #speaker-notes block to the first slide', () => {
    stubDocument({ speakerNotes: '  One note for the deck ', slides: [{}, {}] });
    expect(collectSpeakerNotes(SLIDE_SELECTOR)).toEqual(['One note for the deck', '']);
  });

  it('returns empty notes for a deck without any', () => {
    stubDocument({ slides: [{}, {}] });
    expect(collectSpeakerNotes(SLIDE_SELECTOR)).toEqual(['', '']);
  });
});
