import { describe, expect, it } from 'vitest';

import {
  injectDeckPrintStylesheet,
  injectPrintReadyHandshake,
  injectPrintScript,
} from '../../src/runtime/exports';
import { upsertSpeakerNotesInHtml } from '../../src/runtime/speaker-notes';

// Export splices bridges into the artifact's own bytes exactly like the preview
// transports do, so it carries the same hazard: a prototype that builds an HTML
// document string writes `</head>` and `</body>` as ordinary content. #7410 was
// reported against preview only because `od export` skips the daemon's
// URL-preview injection — the export path had the same defect all along.
//
// Each fixture puts the authored copy of the boundary *before* the document's
// own, which is the only arrangement a first-match injector gets wrong. These
// run with no `DOMParser` (the web suite's default environment is node), so
// each injector is judged on its own rather than on an upstream round-trip.

const AUTHORED = 'const doc = `<head><title>Slip</title></head><body>slip</body>`;';

/** The authored copy sits in `<head>`, ahead of the document's own `</head>`. */
const HEAD_FIRST = '<!doctype html><html><head>'
  + `<script>${AUTHORED}<\/script><title>Deck</title></head>`
  + '<body><div class="slide">one</div></body></html>';

/** The authored copy sits in `<body>`, ahead of the document's own `</body>`. */
const BODY_FIRST = '<!doctype html><html><head><title>Deck</title></head><body>'
  + `<script>${AUTHORED}<\/script><div class="slide">one</div></body></html>`;

/** The authored script's text, as the parser would read it after injection. */
function authoredScript(html: string): string {
  const start = html.indexOf('const doc = `');
  return html.slice(start, html.indexOf('<\/script>', start));
}

describe('export injection points', () => {
  it.each([
    ['print script', HEAD_FIRST, (doc: string) => injectPrintScript(doc, 'Title')],
    ['print-ready handshake', HEAD_FIRST, (doc: string) => injectPrintReadyHandshake(doc, 'nonce-1')],
    ['deck print stylesheet', HEAD_FIRST, (doc: string) => injectDeckPrintStylesheet(doc)],
    ['speaker notes', BODY_FIRST, (doc: string) => upsertSpeakerNotesInHtml(doc, ['note'])],
  ])('leaves a script that builds an HTML document string intact — %s', (_name, doc, inject) => {
    const out = inject(doc);

    expect(out).toContain(AUTHORED);
    expect(authoredScript(out)).toBe(AUTHORED);
  });

  it('puts speaker notes in the real body, after the deck content', () => {
    const out = upsertSpeakerNotesInHtml(BODY_FIRST, ['note']);

    expect(out.indexOf('id="speaker-notes"')).toBeGreaterThan(out.indexOf('class="slide"'));
    expect(out.indexOf('id="speaker-notes"')).toBeLessThan(out.lastIndexOf('</body>'));
  });

  it('puts the deck print stylesheet in the real head', () => {
    const out = injectDeckPrintStylesheet(HEAD_FIRST);

    expect(out.indexOf('data-deck-print')).toBeLessThan(out.lastIndexOf('</head>'));
    expect(out.indexOf('data-deck-print')).toBeGreaterThan(out.indexOf('<title>Deck</title>'));
  });
});
