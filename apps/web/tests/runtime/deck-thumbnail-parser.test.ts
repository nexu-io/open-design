// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseDeckThumbnails } from '../../src/runtime/deck-thumbnail-parser';

// Canonical OD framework deck: `.deck-shell > .deck-stage#deck-stage >
// section.slide`, styles in a <head> <style>, `:root` vars, chrome outside the
// stage.
function frameworkDeck(slides: number): string {
  const sections = Array.from({ length: slides }, (_, i) =>
    `<section class="slide${i === 0 ? ' active' : ''}" data-screen-label="0${i + 1} Title">
       <h1 class="title">Slide ${i + 1}</h1>
       <img src="assets/pic-${i}.png" alt="" />
     </section>`,
  ).join('\n');
  return `<!doctype html><html><head><style>
    :root { --bg: #fff; --fg: #111; }
    html, body { background: var(--shell); color: var(--fg); }
    .deck-stage { width: 1920px; height: 1080px; background: var(--bg); }
    .slide:not(.active) { display: none !important; }
    .title { background: url(bg/hero.png); }
  </style></head><body>
    <div class="deck-shell"><div class="deck-stage" id="deck-stage">
      ${sections}
    </div></div>
    <nav class="deck-counter"><button id="deck-prev">‹</button></nav>
    <script>/* nav */</script>
  </body></html>`;
}

describe('parseDeckThumbnails', () => {
  it('extracts slides, styles, ancestors and design size from a framework deck', () => {
    const parsed = parseDeckThumbnails(frameworkDeck(3), '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(true);
    expect(parsed.slides).toHaveLength(3);
    expect(parsed.slides[0]).toMatch(/^<section/);
    expect(parsed.slides[1]).toContain('Slide 2');
    expect(parsed.designWidth).toBe(1920);
    expect(parsed.designHeight).toBe(1080);
    expect(parsed.ancestors.map((a) => a.tag)).toEqual(['div', 'div']);
    // outer→inner: deck-shell then deck-stage
    expect(parsed.ancestors[0]!.attributes).toContainEqual(['class', 'deck-shell']);
    expect(parsed.ancestors[1]!.attributes).toContainEqual(['id', 'deck-stage']);
  });

  it('rewrites root selectors to their shadow-root targets', () => {
    const parsed = parseDeckThumbnails(frameworkDeck(1));
    expect(parsed.styleText).toContain(':host { --bg: #fff');
    expect(parsed.styleText).toContain(
      '[data-od-thumb-html], [data-od-thumb-body] { background: var(--shell)',
    );
    expect(parsed.styleText).not.toMatch(/:root\s*\{/);
    expect(parsed.styleText).toContain('.deck-stage {');
  });

  it('preserves html/body attributes and rewrites compound root selectors', () => {
    const html = `<!doctype html><html class="dark" lang="zh-CN"><head><style>
      :root { --bg: #fff; }
      html.dark body[data-theme="night"] .slide { background: #111; }
      body[data-theme="night"]::before { content: "brand"; }
      .stage { width: 1920px; height: 1080px; }
    </style></head><body data-theme="night">
      <main class="stage"><section class="slide active">A</section></main>
    </body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.rootAttributes.html).toContainEqual(['class', 'dark']);
    expect(parsed.rootAttributes.html).toContainEqual(['lang', 'zh-CN']);
    expect(parsed.rootAttributes.body).toContainEqual(['data-theme', 'night']);
    expect(parsed.styleText).toContain(
      '[data-od-thumb-html].dark [data-od-thumb-body][data-theme="night"] .slide',
    );
    expect(parsed.styleText).toContain(
      '[data-od-thumb-body][data-theme="night"]::before',
    );
    expect(parsed.styleText).not.toContain('html.dark');
    expect(parsed.styleText).not.toContain('body[data-theme');
  });

  it('rewrites :root to :host even when a CSS comment precedes it', () => {
    // Real decks lead their `<style>` with a banner comment right before the
    // `:root` custom-property block (e.g. `/* === VIEWPORT BASE === */`). If the
    // rewrite is fooled by the comment, `:root` survives, matches nothing in the
    // shadow tree, and every `var(--slide-bg)` resolves to transparent — the
    // slide paints nothing over the near-black thumbnail host = black thumbnail.
    const html = `<!doctype html><html><head><style>
      /* === VIEWPORT BASE === */
      :root { --stage-bg: #0a0a0a; --slide-bg: #ffffff; }
      html, body { background: var(--stage-bg); }
      .deck-stage { width: 1920px; height: 1080px; background: var(--slide-bg); }
      .slide { position: absolute; inset: 0; background: var(--slide-bg); }
    </style></head><body>
      <div class="deck-viewport"><main class="deck-stage" id="deck-stage">
        <section class="slide active" data-screen-label="01">A</section>
      </main></div>
    </body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    // The custom properties must land on :host so they inherit into the slide.
    expect(parsed.styleText).toContain(':host { --stage-bg: #0a0a0a; --slide-bg: #ffffff; }');
    expect(parsed.styleText).not.toMatch(/:root\s*\{/);
  });

  it('absolutizes relative asset URLs against the base href', () => {
    const parsed = parseDeckThumbnails(frameworkDeck(1), '/api/projects/p1/raw/sub');
    expect(parsed.slides[0]).toContain('src="/api/projects/p1/raw/sub/assets/pic-0.png"');
    expect(parsed.styleText).toContain('url(/api/projects/p1/raw/sub/bg/hero.png)');
  });

  it('lifts @font-face out of the shadow styles into fontFaces', () => {
    const html = frameworkDeck(1).replace(
      '<style>',
      '<style>@font-face { font-family: "X"; src: url(fonts/x.woff2); }',
    );
    const parsed = parseDeckThumbnails(html, '/api/projects/p1/raw/');
    expect(parsed.fontFaces).toContain('@font-face');
    expect(parsed.fontFaces).toContain('/api/projects/p1/raw/fonts/x.woff2');
    expect(parsed.styleText).not.toContain('@font-face');
  });

  it('collects external font-stylesheet links and stays renderable', () => {
    const html = frameworkDeck(1).replace(
      '</head>',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"></head>',
    );
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.fontLinks).toEqual(['https://fonts.googleapis.com/css2?family=Inter']);
  });

  it('lifts an approved font @import out of shadow CSS', () => {
    const html = frameworkDeck(1).replace(
      '<style>',
      '<style>@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap");',
    );
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.fontLinks).toContain(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
    );
    expect(parsed.styleText).not.toContain('@import');
  });

  it('falls back when inline CSS imports a non-font stylesheet', () => {
    const html = frameworkDeck(1).replace(
      '<style>',
      '<style>@import "./layout.css";',
    );
    const parsed = parseDeckThumbnails(html, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(false);
    expect(parsed.reason).toBe('external-stylesheet');
  });

  it('reads design size + ancestors from a <deck-stage> template deck', () => {
    const html = `<!doctype html><html><head><style>
      deck-stage > section.slide { width: 1280px; height: 720px; }
    </style></head><body>
      <deck-stage width="1280" height="720">
        <section class="s1" data-screen-label="01">A</section>
        <section class="s2" data-screen-label="02">B</section>
      </deck-stage>
    </body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.designWidth).toBe(1280);
    expect(parsed.designHeight).toBe(720);
    expect(parsed.ancestors.map((a) => a.tag)).toEqual(['deck-stage']);
  });

  it('uses the real stage size instead of a slide-descendant decoration size', () => {
    // Regression: `.stage` is the real 1920×1080 canvas, while the broad
    // `.slide` selector heuristic also matched `.slide-title .accent-dot` and
    // returned its first width/height pair (10×10). The thumbnail renderer then
    // clipped the full slide into that tiny canvas and painted an empty frame.
    const html = `<!doctype html><html><head><style>
      .stage { position: relative; width: 1920px; height: 1080px; }
      .slide { position: absolute; inset: 0; }
      .slide-title .accent-dot { width: 10px; height: 10px; }
    </style></head><body><main class="stage">
      <section class="slide slide-title active" data-screen-label="01">
        <span class="accent-dot"></span><h1>Aether</h1>
      </section>
    </main></body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.designWidth).toBe(1920);
    expect(parsed.designHeight).toBe(1080);
  });

  it('uses editable .stage metadata as a structured deck boundary', () => {
    const html = `<!doctype html><html><head><style>
      .stage { position: relative; width: 1920px; height: 1080px; }
      .slide { position: absolute; inset: 0; }
    </style></head><body>
      <aside><div class="slide">Decorative sample</div></aside>
      <main class="stage" data-od-id="deck-stage">
        <section class="slide">One</section>
        <section class="slide">Two</section>
      </main>
    </body></html>`;
    const parsed = parseDeckThumbnails(html);

    expect(parsed.renderable).toBe(true);
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.slides.join(' ')).not.toContain('Decorative sample');
    expect(parsed.designWidth).toBe(1920);
    expect(parsed.designHeight).toBe(1080);
  });

  it('falls back instead of accepting an implausibly small slide canvas', () => {
    const html = `<!doctype html><html><head><style>
      .slide { width: 10px; height: 10px; }
    </style></head><body>
      <section class="slide active" data-screen-label="01">A</section>
    </body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.designWidth).toBe(1920);
    expect(parsed.designHeight).toBe(1080);
  });

  it('preserves a valid portrait canvas instead of forcing a 16:9 ratio', () => {
    const html = `<!doctype html><html><head><style>
      .stage { width: 1080px; height: 1920px; }
      .slide { position: absolute; inset: 0; }
    </style></head><body><main class="stage">
      <section class="slide active" data-screen-label="01">Portrait</section>
    </main></body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.designWidth).toBe(1080);
    expect(parsed.designHeight).toBe(1920);
  });

  it('rewrites viewport units in CSS to canvas px (renderable, faithful)', () => {
    // No explicit px canvas → defaults to 1920×1080; 100vw→1920px, 100vh→1080px.
    const html = `<!doctype html><html><head><style>
      #deck > section.slide { width: 100vw; height: 100vh; }
      .title { font-size: clamp(24px, 4vh, 48px); padding: 6vw; }
    </style></head><body>
      <div id="deck"><section class="slide">A</section></div>
    </body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.styleText).toContain('width: calc(100 * 19.2px)');
    expect(parsed.styleText).toContain('height: calc(100 * 10.8px)');
    expect(parsed.styleText).toContain('clamp(24px, calc(4 * 10.8px), 48px)');
    expect(parsed.styleText).toContain('padding: calc(6 * 19.2px)');
    expect(parsed.styleText).not.toMatch(/\d(?:vw|vh)\b/);
  });

  it('rewrites viewport units in slide inline styles', () => {
    const html = `<!doctype html><html><head><style>
      .deck-stage { width: 1920px; height: 1080px; }
    </style></head><body><div class="deck-stage" id="deck-stage">
      <section class="slide active"><div style="height: 12vh">bar</div></section>
    </div></body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.slides[0]).toContain('calc(12 * 10.8px)');
    expect(parsed.slides[0]).not.toContain('12vh');
  });

  it('stays renderable for a fixed px canvas with percent-sized slides', () => {
    const html = `<!doctype html><html><head><style>
      .deck-stage { width: 1920px; height: 1080px; }
      .slide { width: 100%; height: 100%; position: absolute; }
    </style></head><body><div class="deck-stage" id="deck-stage">
      <section class="slide active">A</section>
    </div></body></html>`;
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(true);
    expect(parsed.designWidth).toBe(1920);
    // Percent sizing is left untouched — it already resolves to the canvas.
    expect(parsed.styleText).toContain('width: 100%');
  });

  it('falls back when the deck depends on an external layout stylesheet', () => {
    const html = frameworkDeck(1).replace(
      '</head>',
      '<link rel="stylesheet" href="/api/projects/p1/raw/deck.css"></head>',
    );
    const parsed = parseDeckThumbnails(html);
    expect(parsed.renderable).toBe(false);
    expect(parsed.reason).toBe('external-stylesheet');
  });

  it('falls back for documents with no slides or no styles', () => {
    expect(parseDeckThumbnails('<div>not a deck</div>').reason).toBe('no-slides');
    expect(parseDeckThumbnails('').reason).toBe('no-slides');
    const styleless = '<body><section class="slide">A</section></body>';
    expect(parseDeckThumbnails(styleless).reason).toBe('no-styles');
  });

  it.each(['canvas', 'video', 'iframe', 'object', 'embed'])(
    'falls back when a slide contains runtime-rendered <%s> content',
    (tag) => {
      const deck = `<!doctype html><html><head><style>
        .deck-stage { width: 1920px; height: 1080px; }
      </style></head><body>
        <div class="deck-stage" id="deck-stage">
          <section class="slide active"><${tag}></${tag}></section>
        </div>
      </body></html>`;
      const parsed = parseDeckThumbnails(deck);
      expect(parsed.renderable).toBe(false);
      expect(parsed.reason).toBe('runtime-rendered-content');
    },
  );

  it('falls back when a script builds content inside a slide-owned element', () => {
    const deck = `<!doctype html><html><head><style>
      .deck-stage { width: 1920px; height: 1080px; }
      .stars { position: absolute; inset: 0; }
    </style></head><body>
      <div class="deck-stage" id="deck-stage">
        <section class="slide active"><div class="stars" id="starfield"></div></section>
      </div>
      <script>
        const starfield = document.getElementById('starfield');
        const star = document.createElement('i');
        starfield.appendChild(star);
      </script>
    </body></html>`;
    const parsed = parseDeckThumbnails(deck);
    expect(parsed.renderable).toBe(false);
    expect(parsed.reason).toBe('runtime-rendered-content');
  });

  it('keeps ordinary slide-navigation scripts on the static path', () => {
    const deck = frameworkDeck(2).replace(
      '<script>/* nav */</script>',
      `<script>
        const slides = document.querySelectorAll('.slide');
        document.getElementById('deck-prev')?.addEventListener('click', () => {
          slides[0]?.classList.add('active');
          slides[1]?.classList.remove('active');
        });
      </script>`,
    );
    const parsed = parseDeckThumbnails(deck);
    expect(parsed.renderable).toBe(true);
    expect(parsed.slides).toHaveLength(2);
  });

  it('keeps navigation counters separate from queried slide content', () => {
    const deck = frameworkDeck(2).replace(
      '<script>/* nav */</script>',
      `<script>
        const slides = document.querySelectorAll('.slide');
        const counter = document.querySelector('.data-deck-nav');
        function paint(index) {
          slides.forEach((slide, i) => slide.classList.toggle('active', i === index));
          counter.textContent = (index + 1) + ' / ' + slides.length;
        }
        paint(0);
      </script>`,
    );
    const parsed = parseDeckThumbnails(deck);
    expect(parsed.renderable).toBe(true);
    expect(parsed.slides).toHaveLength(2);
  });

  it('strips executable content from untrusted slide markup', () => {
    const deck = [
      '<!doctype html><html><head><style>',
      '  .deck-stage { width: 1920px; height: 1080px; }',
      '  .slide:not(.active) { display: none; }',
      '</style></head><body>',
      '  <div class="deck-shell"><div class="deck-stage" id="deck-stage">',
      '    <section class="slide active">',
      '      <img src="x" onerror="fetch(\'//evil\')" alt="" />',
      '      <a href="javascript:alert(1)">link</a>',
      '      <a href="java\tscript:alert(3)">tabbed</a>',
      '      <h1 onclick="steal()">Title</h1>',
      '      <script>alert(2)</script>',
      '      <form action="https://evil.example"><button formaction="javascript:go()">x</button></form>',
      '    </section>',
      '  </div></div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(true);
    const slide = parsed.slides[0] ?? '';
    // no inline event handlers, executable/navigable elements, or script URLs
    expect(slide).not.toMatch(/onerror/i);
    expect(slide).not.toMatch(/onclick/i);
    expect(slide).not.toMatch(/<script/i);
    expect(slide).not.toMatch(/<form/i);
    expect(slide).not.toMatch(/formaction/i);
    expect(slide).not.toMatch(/javascript:/i);
    // control-character-obfuscated scheme is neutralized too
    expect(slide).not.toContain('alert(3)');
    // benign slide content is preserved
    expect(slide).toContain('<h1');
    expect(slide).toContain('Title');
  });

  it('sanitizes reconstructed slide ancestors (a second injection path)', () => {
    const deck = [
      '<!doctype html><html><head><style>',
      '  .deck-stage { width: 1920px; height: 1080px; }',
      '</style></head><body>',
      '  <div class="deck-shell" onclick="wrap()"><div class="deck-stage" id="deck-stage" onmouseover="wrap2()">',
      '    <section class="slide active"><h1>Title</h1></section>',
      '  </div></div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(true);
    const ancestorAttrNames = parsed.ancestors.flatMap((a) => a.attributes.map(([n]) => n.toLowerCase()));
    // wrapper inline handlers are dropped before they are recreated in the DOM
    expect(ancestorAttrNames.some((n) => n.startsWith('on'))).toBe(false);
    // benign wrapper attributes (class) survive so CSS still targets the chain
    expect(ancestorAttrNames).toContain('class');
  });

  it('sanitizes html/body attributes copied into the thumbnail root shims', () => {
    const deck = `<!doctype html><html class="dark" onclick="steal()"><head><style>
      .deck-stage { width: 1920px; height: 1080px; }
    </style></head><body data-theme="night" onload="steal2()">
      <div class="deck-stage"><section class="slide active">A</section></div>
    </body></html>`;
    const parsed = parseDeckThumbnails(deck);
    const names = [
      ...parsed.rootAttributes.html,
      ...parsed.rootAttributes.body,
    ].map(([name]) => name.toLowerCase());
    expect(names.some((name) => name.startsWith('on'))).toBe(false);
    expect(parsed.rootAttributes.html).toContainEqual(['class', 'dark']);
    expect(parsed.rootAttributes.body).toContainEqual(['data-theme', 'night']);
  });

  it('neutralizes a slide whose root element is itself executable/navigable', () => {
    const deck = [
      '<!doctype html><html><head><style>',
      '  .deck-stage { width: 1920px; height: 1080px; }',
      '</style></head><body>',
      '  <div class="deck-stage" id="deck-stage">',
      '    <form class="slide active" onsubmit="steal()" action="https://evil.example"><h1>Title</h1></form>',
      '  </div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(true);
    const slide = parsed.slides[0] ?? '';
    // the navigable/submittable root element and its handlers are removed ...
    expect(slide).not.toMatch(/<form/i);
    expect(slide).not.toMatch(/onsubmit/i);
    expect(slide).not.toMatch(/action=/i);
    // ... while its inert content is preserved
    expect(slide).toContain('Title');
  });

  it('removes SVG SMIL animation that could rewrite a sanitized attribute', () => {
    const deck = [
      '<!doctype html><html><head><style>',
      '  .deck-stage { width: 1920px; height: 1080px; }',
      '</style></head><body>',
      '  <div class="deck-stage" id="deck-stage">',
      '    <section class="slide active">',
      '      <svg><a><animate attributeName="href" to="javascript:steal()" /></a></svg>',
      '    </section>',
      '  </div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(true);
    const slide = parsed.slides[0] ?? '';
    expect(slide).not.toMatch(/<animate/i);
    expect(slide).not.toMatch(/javascript:/i);
  });

  it('rejects a font-stylesheet link whose host is not exactly an approved CDN', () => {
    const deck = [
      '<!doctype html><html><head>',
      '  <link rel="stylesheet" href="https://evil.example/fonts.googleapis.com/inject.css">',
      '  <style>.deck-stage { width: 1920px; height: 1080px; }</style>',
      '</head><body>',
      '  <div class="deck-stage" id="deck-stage"><section class="slide active"><h1>Title</h1></section></div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    // a substring hostname match would inject this stylesheet into the app doc;
    // it must be treated as an untrusted external stylesheet instead.
    expect(parsed.renderable).toBe(false);
    expect(parsed.reason).toBe('external-stylesheet');
    expect(parsed.fontLinks).not.toContain('https://evil.example/fonts.googleapis.com/inject.css');
  });

  it('still accepts a genuine approved font CDN stylesheet link', () => {
    const deck = [
      '<!doctype html><html><head>',
      '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
      '  <style>.deck-stage { width: 1920px; height: 1080px; }</style>',
      '</head><body>',
      '  <div class="deck-stage" id="deck-stage"><section class="slide active"><h1>Title</h1></section></div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(true);
    expect(parsed.fontLinks).toContain('https://fonts.googleapis.com/css2?family=Inter');
  });

  it('falls back when a slide-nested <style> imports external CSS', () => {
    const deck = [
      '<!doctype html><html><head><style>.deck-stage { width: 1920px; height: 1080px; }</style></head><body>',
      '  <div class="deck-stage" id="deck-stage">',
      '    <section class="slide active">',
      '      <style>@import url("https://evil.example/nested.css");</style>',
      '      <h1>Title</h1>',
      '    </section>',
      '  </div>',
      '</body></html>',
    ].join('\n');
    const parsed = parseDeckThumbnails(deck, '/api/projects/p1/raw/');
    expect(parsed.renderable).toBe(false);
    expect(parsed.reason).toBe('external-stylesheet');
  });
});
