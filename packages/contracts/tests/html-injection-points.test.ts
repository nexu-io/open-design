import { describe, expect, it } from 'vitest';

import {
  endOfTag,
  findRealTagEnd,
  findRealTagOffset,
  HTML_TAG_PATTERNS,
} from '../src/runtime/html-injection-points';

// Unit coverage lives here, parser-free, so contracts keeps its dependency-less
// shape. The differential check against a real HTML parser — the one that
// proves the scanner and the spec agree about where a boundary is — runs in
// `apps/web/tests/runtime/html-injection-points.oracle.test.ts`, where jsdom is
// already a dependency.

describe('findRealTagOffset', () => {
  it('skips a boundary a script wrote into a string', () => {
    const html = '<!doctype html><html><head></head><body>'
      + '<script>var t = `<body>x</body>`;<\/script><p>hi</p></body></html>';

    const at = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose);

    expect(at).toBe(html.lastIndexOf('</body>'));
  });

  it('skips a boundary stored on an attribute', () => {
    const html = '<!doctype html><html><head></head><body>'
      + '<div data-t="<body>x</body>"></div><p>hi</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('is not fooled by a `>` inside a quoted attribute value', () => {
    const html = '<!doctype html><html><head></head><body>'
      + '<div title="a>b" data-t="</body>"></div><p>hi</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it.each([
    ['comment', '<!-- </body> -->'],
    ['textarea', '<textarea></body></textarea>'],
    ['noscript', '<noscript></body></noscript>'],
    ['xmp', '<xmp></body></xmp>'],
    ['template', '<template></body></template>'],
  ])('skips a boundary inside %s content', (_name, inert) => {
    const html = `<!doctype html><html><head></head><body>${inert}<p>hi</p></body></html>`;

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('skips a boundary inside a style block when looking for the head', () => {
    const html = '<!doctype html><html><body><style>/* <head> */</style><p>hi</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.headOpen)).toBe(-1);
  });

  it('reads a `<` that starts no tag as ordinary text', () => {
    const html = '<!doctype html><html><head></head><body><p>a < b and 3<4</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('steps over a doctype carrying a quoted string', () => {
    const html = '<!DOCTYPE html SYSTEM "about:legacy-compat"><html><head></head><body></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.headOpen)).toBe(html.indexOf('<head>'));
  });

  it('matches a close tag regardless of case or trailing space', () => {
    const upper = '<!doctype html><html><head></head><body><p>hi</p></BODY></html>';
    const spaced = '<!doctype html><html><head></head><body><p>hi</p></body ></html>';

    expect(findRealTagOffset(upper, HTML_TAG_PATTERNS.bodyClose)).toBe(upper.indexOf('</BODY>'));
    expect(findRealTagOffset(spaced, HTML_TAG_PATTERNS.bodyClose)).toBe(spaced.indexOf('</body >'));
  });

  it('reports -1 when the source carries no such boundary', () => {
    expect(findRealTagOffset('<!doctype html><html><head></head><body><p>hi</p>', HTML_TAG_PATTERNS.bodyClose)).toBe(-1);
    expect(findRealTagOffset('<p>fragment</p>', HTML_TAG_PATTERNS.headOpen)).toBe(-1);
  });

  it('does not leave raw text on a close-tag prefix', () => {
    // `</script-template>` is character data: the tokenizer only closes on
    // `</script` followed by whitespace, `/` or `>`. Accepting the prefix would
    // resume inside the author's string and return the `</body>` it contains.
    const html = '<script>const doc = "</script-template><body>slip</body>";<\/script><body>real</body>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('keeps a `</template>` written in a nested script inside the template', () => {
    // Counting template depth by text would end the template at the string's
    // copy and drop the scan back into the author's content.
    const html = '<html><body><template><script>const doc = "</template><body>slip</body>";<\/script>'
      + '</template><main>real</main></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  // Whether `<![CDATA[` is a section or a bogus comment depends on the adjusted
  // current node's namespace, so these used to report no boundary at all. The
  // namespace is tracked now, and each of these resolves.
  it.each([
    ['plain svg', '<html><body><svg><![CDATA[label > </body>]]></svg><main>real</main></body></html>'],
    ['template', '<html><body><template><svg><![CDATA[x > </template><body>slip</body>]]></svg></template><main>real</main></body></html>'],
    ['unencoded annotation-xml', '<html><body><math><annotation-xml><![CDATA[x > </math><body>slip</body>]]></annotation-xml></math><main>real</main></body></html>'],
  ])('reads CDATA in foreign content as character data — %s', (_name, html) => {
    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose))
      .toBe(html.lastIndexOf('</body>'));
  });

  // `</p>` and `</br>` are the two stray end tags whose "in body" rule pops the
  // foreign element, and that is stateful in a way this scan does not model.
  it.each([
    ['p', '<html><body><svg></p><script>const x = "<body>slip</body>";<\/script>'
      + '<main>real</main></body></html>'],
    ['br', '<html><body><svg></br><![CDATA[b > </body>]]></svg>'
      + '<main>real</main></body></html>'],
  ])('reports no boundary past a stray </%s>', (_name, html) => {
    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(-1);
  });

  it('reads CDATA under an integration point as the bogus comment it is', () => {
    // Inside `<foreignObject>` the parser is back in HTML, where `<![CDATA[x >`
    // is a bogus comment ending at that first `>`. The `</body>` after it is
    // therefore a real end tag, and the first one the tree builder acts on —
    // not the last one in the source.
    const html = '<html><body><svg><foreignObject><![CDATA[x > </svg><body>slip</body>]]>'
      + '</foreignObject></svg><main>real</main></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose))
      .toBe(html.indexOf('</body>'));
  });

  // The hazards the daemon copy gained after this module was extracted. They
  // are pinned here as well as there, because a shared implementation that only
  // its consumer tests is how the two drifted apart in the first place.
  it.each([
    ['foreign-content breakout',
      '<html><body><svg><p><script>const x = "</svg><body>slip</body>";<\/script></p></svg>'
      + '<main>real</main></body></html>'],
    ['mglyph stays MathML',
      '<html><body><math><mi><mglyph><![CDATA[x > </math><body>slip</body>]]></mglyph></mi></math>'
      + '<main>real</main></body></html>'],
    ['solidus then whitespace',
      '<html><body><svg/ ><![CDATA[x > </svg><body>slip</body>]]></svg><main>real</main></body></html>'],
    ['nested svg under foreignObject',
      '<html><body><svg><foreignObject><svg></foreignObject></svg>'
      + '<script>const x = "<table></body>";<\/script><main>real</main></body></html>'],
    ['svg start tag ignored inside select',
      '<html><body><select><svg></select><script>const x = "<table></body>";<\/script>'
      + '<main>real</main></body></html>'],
    ['unquoted value carrying a quote',
      '<html><head data==">' + '<script>const m = "inside>";<\/script></head>'
      + '<body><main>real</main></body></html>'],
    ['stray end tag that reprocessing ignores',
      '<html><body><svg></div><![CDATA[d > </body>]]></svg><main>real</main></body></html>'],
    ['nested template gets its own insertion mode',
      '<html><body><template><select><template><svg>'
      + '<![CDATA[n > </template></template><body>slip</body>]]>'
      + '</svg></template></select></template><main>real</main></body></html>'],
  ])('locates the real boundary — %s', (_name, html) => {
    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose))
      .toBe(html.lastIndexOf('</body>'));
  });

  it('keeps precise placement for foreign content without CDATA', () => {
    const html = '<html><body><svg><text>a</text></svg><p>hi</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('does not treat a self-closing `<svg/>` as opening a subtree', () => {
    const html = '<html><body><svg/><main>real</main></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('honours script data double escaping', () => {
    // After `<!--` a nested `<script` puts the tokenizer in double-escaped
    // state, where `</script>` steps back out instead of closing.
    const html = '<html><body><script><!--\nconst open = "<script>";\n'
      + 'const doc = "</script><body>slip</body>";\n//--><\/script><main>real</main></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('does not leave a style block on a close-tag prefix', () => {
    const html = '<!doctype html><html><head><style>/* </stylesheet><body>x</body> */</style></head>'
      + '<body><p>hi</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('does not leave RCDATA on a close-tag prefix', () => {
    const html = '<!doctype html><html><head></head><body>'
      + '<textarea></textarea-note><body>slip</body></textarea><p>hi</p></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(html.lastIndexOf('</body>'));
  });

  it('never leaves PLAINTEXT', () => {
    // Unlike every other raw-text element, `<plaintext>` has no exit: all
    // input after it is character data, `</plaintext>` included. Honouring
    // that close tag hands back a boundary the parser does not see.
    const html = '<html><body><plaintext></body></plaintext><main>x</main></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose)).toBe(-1);
  });

  it('reports -1 rather than guessing past unterminated raw text', () => {
    // The rest of the document is script data, so it holds no boundary. -1
    // makes the caller append instead of splicing into the script.
    expect(findRealTagOffset('<html><body><script>var t = "</bo', HTML_TAG_PATTERNS.bodyClose)).toBe(-1);
  });
});

describe('endOfTag', () => {
  it('skips a `>` written inside a quoted attribute value', () => {
    const html = '<div title="a>b" id="x">text</div>';

    expect(endOfTag(html, 4)).toBe(html.indexOf('>text'));
  });

  it('treats a quote outside an attribute value as a literal character', () => {
    const html = "<div data-x=a'b>text</div>";

    expect(endOfTag(html, 4)).toBe(html.indexOf('>text'));
  });

  it('reports -1 for a tag that never closes', () => {
    expect(endOfTag('<div class="unterminated', 4)).toBe(-1);
  });
});

describe('findRealTagEnd', () => {
  it('points just past the real open tag', () => {
    const html = '<!doctype html><html><head lang="en"><title>t</title></head><body></body></html>';

    expect(findRealTagEnd(html, HTML_TAG_PATTERNS.headOpen)).toBe(html.indexOf('<title>'));
  });

  it('points past a tag whose attribute value contains a `>`', () => {
    const html = '<!doctype html><html><head data-t="a>b"><title>t</title></head><body></body></html>';

    expect(findRealTagEnd(html, HTML_TAG_PATTERNS.headOpen)).toBe(html.indexOf('<title>'));
  });

  it('reports -1 when the document has no such tag', () => {
    expect(findRealTagEnd('<p>fragment</p>', HTML_TAG_PATTERNS.headOpen)).toBe(-1);
  });
});

describe('HTML_TAG_PATTERNS', () => {
  it('does not let the head pattern match `<header>`', () => {
    const html = '<!doctype html><html><body><header>nav</header></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.headOpen)).toBe(-1);
  });

  it('does not let the base pattern match `<basefont>`', () => {
    const html = '<!doctype html><html><head><basefont size="2"></head><body></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.baseOpen)).toBe(-1);
  });

  it('finds a real `<base>` so an authored one can suppress containment', () => {
    const html = '<!doctype html><html><head><base href="/x/"></head><body></body></html>';

    expect(findRealTagOffset(html, HTML_TAG_PATTERNS.baseOpen)).toBe(html.indexOf('<base '));
  });
});
