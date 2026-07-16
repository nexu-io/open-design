import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

import {
  buildSpeakerNotesPresenterHtml,
  extractSpeakerNotesFromHtml,
  PRESENTER_WINDOW_MIN_HEIGHT,
  PRESENTER_WINDOW_MIN_WIDTH,
  removeSpeakerNotesFromHtml,
  upsertSpeakerNotesInHtml,
} from '../../src/runtime/speaker-notes';

describe('speaker notes HTML helpers', () => {
  it('reads the shared #speaker-notes JSON array format', () => {
    const html = [
      '<!doctype html><html><body>',
      '<section class="slide">One</section>',
      '<script type="application/json" id="speaker-notes">',
      '["Intro", "Details"]',
      '</script>',
      '</body></html>',
    ].join('');

    expect(extractSpeakerNotesFromHtml(html, 3)).toEqual(['Intro', 'Details']);
  });

  it('falls back to per-slide .notes blocks', () => {
    const html = [
      '<section class="slide"><h1>One</h1><aside class="notes">Open<br>strong.</aside></section>',
      '<section class="slide"><h1>Two</h1><div class="notes"><p>Close &amp; transition.</p></div></section>',
    ].join('');

    expect(extractSpeakerNotesFromHtml(html, 2)).toEqual([
      'Open\nstrong.',
      'Close & transition.',
    ]);
  });

  it('upserts notes without mutating visible slide content', () => {
    const source = '<!doctype html><html><body><section class="slide">Visible</section></body></html>';
    const next = upsertSpeakerNotesInHtml(source, ['Private note']);

    expect(next).toContain('<section class="slide">Visible</section>');
    expect(next).toContain('id="speaker-notes"');
    expect(extractSpeakerNotesFromHtml(next)).toEqual(['Private note']);
  });

  it('replaces an existing speaker notes script', () => {
    const source = '<script type="application/json" id="speaker-notes">["Old"]</script>';
    const next = upsertSpeakerNotesInHtml(source, ['New']);

    expect(next).not.toContain('Old');
    expect(extractSpeakerNotesFromHtml(next)).toEqual(['New']);
  });

  it('ignores invalid speaker notes JSON instead of showing script garbage', () => {
    const source = [
      '<deck-stage><section class="slide">One</section></deck-stage>',
      '<script type="application/json" id="speaker-notes">',
      ' * and posts {slideIndexChanged: N} to the parent window on nav.',
      ' * keyboard navigation — arrows.',
      '</script>',
    ].join('\n');

    expect(extractSpeakerNotesFromHtml(source, 1)).toEqual([]);
  });

  it('removes only the real speaker notes script block', () => {
    const source = [
      '<script>',
      '/* mentions <script type="application/json" id="speaker-notes"> in runtime docs */',
      'window.RUNTIME = true;',
      '</script>',
      '<script type="application/json" id="speaker-notes">["Intro"]</script>',
    ].join('\n');
    const next = removeSpeakerNotesFromHtml(source);

    expect(next).toContain('window.RUNTIME = true;');
    expect(next).toContain('mentions <script type="application/json" id="speaker-notes">');
    expect(extractSpeakerNotesFromHtml(next)).toEqual([]);
  });

  // Regression: the deck-stage runtime's JSDoc header contains the literal
  // string `<script type="application/json" id="speaker-notes">` (it documents
  // that the component reads that tag). Script content is CDATA, so that text
  // is NOT a real element — but a naive regex matches it and treats the deck
  // runtime's own `</script>` as the block's close, clobbering the entire
  // runtime on upsert and reading garbage on extract. The result is a deck
  // that renders as a black screen (issue: deck black screen after notes save).
  const deckWithRuntimeMention = [
    '<!doctype html><html><body>',
    '<deck-stage><section class="slide">One</section></deck-stage>',
    '<script>',
    '/**',
    ' * <deck-stage> — reusable web component for HTML decks.',
    ' * Handles:',
    ' *  (a) speaker notes — reads <script type="application/json" id="speaker-notes">',
    ' *  (b) keyboard navigation — arrows, PgUp/PgDn.',
    ' */',
    "(() => { const DECK_RUNTIME_MARKER = 1; customElements.define('deck-stage', class extends HTMLElement {}); })();",
    '</script>',
    '<script type="application/json" id="speaker-notes">',
    '["Real one", "Real two"]',
    '</script>',
    '</body></html>',
  ].join('\n');

  it('reads the real notes tag, not the deck-stage JSDoc mention', () => {
    expect(extractSpeakerNotesFromHtml(deckWithRuntimeMention, 2)).toEqual(['Real one', 'Real two']);
  });

  it('upserts without clobbering a deck-stage runtime that mentions the tag', () => {
    const next = upsertSpeakerNotesInHtml(deckWithRuntimeMention, ['Edited']);

    // The runtime and its JSDoc must survive untouched.
    expect(next).toContain('const DECK_RUNTIME_MARKER = 1');
    expect(next).toContain("customElements.define('deck-stage'");
    expect(next).toContain('(b) keyboard navigation');
    // And the edit lands in the real notes block.
    expect(extractSpeakerNotesFromHtml(next)).toEqual(['Edited']);
    // Exactly one real speaker-notes element still exists.
    expect(next.match(/id="speaker-notes"/g)?.length).toBe(2); // one mention + one real tag
  });

  it('escapes script-closing text inside presenter data', () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<script>console.log("</script>")</script>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Do not close </script>'],
      initialSlideIndex: 0,
      slideCount: 1,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });

    expect(html).toContain('id="od-presenter-data"');
    expect(html).not.toContain('Do not close </script>');
    expect(html).toContain('\\u003c/script>');
  });

  it('hides deck chrome inside presenter slide frames', () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<!doctype html><html><head></head><body><nav class="deck-counter"></nav></body></html>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro'],
      initialSlideIndex: 0,
      slideCount: 1,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });

    const match = /<script type="application\/json" id="od-presenter-data">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1] ?? '{}') as { previewHtml?: string };
    expect(data.previewHtml).toContain('data-od-presenter-frame-chrome');
    expect(data.previewHtml).toContain('.deck-counter,');
    expect(data.previewHtml).toContain('.deck-floating-nav,');
    expect(data.previewHtml).toContain('[role="navigation"][aria-label*="Deck"]');
    expect(data.previewHtml).toContain('display: none !important');
  });

  it('can carry per-slide presenter frame HTML so previous and next previews stay in sync', () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<!doctype html><html><head></head><body>fallback</body></html>',
      previewHtmlBySlide: [
        '<!doctype html><html><head></head><body>slide one</body></html>',
        '<!doctype html><html><head></head><body>slide two</body></html>',
      ],
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro', 'Second'],
      initialSlideIndex: 0,
      slideCount: 2,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });

    const match = /<script type="application\/json" id="od-presenter-data">([\s\S]*?)<\/script>/.exec(html);
    expect(match).not.toBeNull();
    const data = JSON.parse(match![1] ?? '{}') as { previewHtmlBySlide?: string[] };
    expect(data.previewHtmlBySlide).toHaveLength(2);
    expect(data.previewHtmlBySlide?.[0]).toContain('slide one');
    expect(data.previewHtmlBySlide?.[1]).toContain('slide two');
    expect(data.previewHtmlBySlide?.[0]).toContain('data-od-presenter-frame-chrome');
    expect(html).toContain('data.previewHtmlBySlide[target]');
  });

  it('edits presenter notes from the notes body instead of a separate switch', () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<!doctype html><html><head></head><body>slide</body></html>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro'],
      initialSlideIndex: 0,
      slideCount: 1,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });

    expect(html).not.toContain('class="edit-toggle"');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('type="checkbox" id="edit"');
    expect(html).toContain("els.notesBody.addEventListener('mousedown', handleNotesBodyMouseDown)");
    expect(html).toContain("els.notesBody.addEventListener('click', handleNotesBodyClick)");
    expect(html).toContain("div.setAttribute('role', 'textbox')");
  });

  it('does not immediately refocus presenter notes after clicking blank space during blur save', async () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<!doctype html><html><head></head><body>slide</body></html>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro'],
      initialSlideIndex: 0,
      slideCount: 1,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });
    const dom = new JSDOM(html, {
      pretendToBeVisual: true,
      runScripts: 'dangerously',
      url: 'http://localhost',
    });

    try {
      const notesBody = dom.window.document.getElementById('notes-body');
      expect(notesBody).not.toBeNull();
      notesBody!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
      const textarea = notesBody!.querySelector('textarea');
      expect(textarea).not.toBeNull();

      textarea!.value = 'Edited note';
      notesBody!.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
      textarea!.blur();
      await new Promise<void>((resolve) => dom.window.setTimeout(resolve, 0));
      notesBody!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

      expect(notesBody!.querySelector('textarea')).toBeNull();
      expect(notesBody!.textContent).toContain('Edited note');
    } finally {
      dom.window.close();
    }
  });

  it('pins the previous filmstrip cell to the left column and next to the right', () => {
    // The first slide has no previous and the last has no next; each cell must
    // keep its own column so "Next" always reads on the right, not collapsed
    // into column 1 when its sibling is hidden.
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<!doctype html><html><head></head><body>slide</body></html>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro'],
      initialSlideIndex: 0,
      slideCount: 3,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });

    expect(html).toContain('#previous-section { grid-column: 1; }');
    expect(html).toContain('#next-section { grid-column: 2; }');
    // The markup order must keep previous before next so the pinning above
    // matches the DOM the presenter script drives.
    expect(html.indexOf('id="previous-section"')).toBeLessThan(html.indexOf('id="next-section"'));
  });

  it('keeps presenter popup content responsive and enforces a minimum window size', () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<!doctype html><html><head></head><body>slide</body></html>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro'],
      initialSlideIndex: 0,
      slideCount: 1,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });

    expect(html).toContain(`--presenter-min-width: ${PRESENTER_WINDOW_MIN_WIDTH}px;`);
    expect(html).toContain(`--presenter-min-height: ${PRESENTER_WINDOW_MIN_HEIGHT}px;`);
    expect(html).toContain('html {');
    expect(html).toContain('overflow: auto;');
    expect(html).toContain('.topbar { display: flex; flex-wrap: wrap;');
    expect(html).toContain('.filmstrip { gap: 10px; min-height: 96px; }');
    expect(html).toContain('.thumb-frame { height: 86px; border-radius: 7px; }');
    expect(html).toContain('@media (max-width: 720px), (max-height: 640px)');
    expect(html).toContain('.filmstrip { gap: 8px; min-height: 82px; }');
    expect(html).toContain('.thumb-frame { height: 74px; }');
    expect(html).not.toContain('.filmstrip { display: none; }');
    expect(html).toContain(`var minWindowWidth = ${PRESENTER_WINDOW_MIN_WIDTH};`);
    expect(html).toContain(`var minWindowHeight = ${PRESENTER_WINDOW_MIN_HEIGHT};`);
    expect(html).toContain('function enforceMinimumWindowSize(){');
    expect(html).toContain('window.resizeTo(nextWidth, nextHeight)');
    expect(html).toContain("window.addEventListener('resize', scheduleMinimumWindowSize)");
  });

  it('sandboxes the presenter slide iframes to an opaque origin', () => {
    const html = buildSpeakerNotesPresenterHtml({
      previewHtml: '<section class="slide">One</section>',
      title: 'Deck',
      projectId: 'project-1',
      fileName: 'deck.html',
      notes: ['Intro'],
      initialSlideIndex: 0,
      slideCount: 1,
      labels: {
        title: 'Speaker notes',
        edit: 'Edit',
        save: 'Save notes',
        pause: 'Pause',
        resume: 'Resume',
        reset: 'Reset',
        previous: 'Previous',
        next: 'Next',
        empty: 'Empty',
        slide: 'Slide {current} / {total}',
      },
    });
    // The srcdoc loaded into each frame is the full, untrusted deck (scripts
    // included); the frames must run it in an opaque origin so it cannot reach
    // the app's storage or daemon.
    for (const id of ['current', 'previous', 'next']) {
      const tag = html.match(new RegExp(`<iframe id="${id}"[^>]*>`))?.[0] ?? '';
      expect(tag).toContain('sandbox="allow-scripts"');
      expect(tag).not.toContain('allow-same-origin');
    }
  });
});
