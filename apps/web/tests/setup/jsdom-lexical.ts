import { afterEach } from 'vitest';

// Extend vitest's expect with @testing-library/jest-dom matchers (e.g.
// toBeInTheDocument, toHaveTextContent) so jsdom-environment tests can use
// them without importing jest-dom in every test file.
import '@testing-library/jest-dom/vitest';

import { resetPluginsCache } from '../../src/state/projects';

// The visible-plugins cache is module-level so it survives Home remounts in the
// app (a deliberate perf choice). In tests that persistence would leak a case's
// mocked `/api/plugins` payload into the next case via `listPluginsFresh`, so
// clear it after every case — each test then observes only its own mock.
afterEach(() => {
  resetPluginsCache();
});

// jsdom does not implement geometry for Range/Element, but Lexical's
// `updateDOMSelection` calls `getBoundingClientRect()` on the collapsed
// selection target whenever the editor is the active element (to scroll it
// into view). With a real textarea this never ran; now that HomeHero embeds
// the Lexical contenteditable and we call `editor.focus()`, focused commits
// hit that path and throw `getBoundingClientRect is not a function` inside a
// timer/rAF callback (an uncaught exception that fails the run).
//
// These polyfills are purely additive — they only define geometry methods
// jsdom is missing — so they change no behavior in browsers or node-env
// tests (guarded on `window`). They let the same Lexical editor that already
// powers the project composer be exercised under jsdom on the homepage.

if (typeof window !== 'undefined') {
  const zeroRect = (): DOMRect => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    toJSON: () => ({}),
  });

  if (typeof Range !== 'undefined') {
    if (typeof Range.prototype.getBoundingClientRect !== 'function') {
      Range.prototype.getBoundingClientRect = zeroRect;
    }
    if (typeof Range.prototype.getClientRects !== 'function') {
      Range.prototype.getClientRects = (() =>
        Object.assign([], { item: () => null })) as unknown as Range['getClientRects'];
    }
  }

  if (
    typeof Element !== 'undefined' &&
    typeof Element.prototype.scrollIntoView !== 'function'
  ) {
    Element.prototype.scrollIntoView = () => {};
  }
}
