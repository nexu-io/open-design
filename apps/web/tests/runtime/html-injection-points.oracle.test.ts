import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { findRealTagOffset, HTML_TAG_PATTERNS } from '@open-design/contracts/runtime/html-injection-points';

// --------------------------------------------------------------------------
// Differential oracle for the shared injection-point scanner.
//
// The scanner is a tokenizer-level approximation, chosen over a full parse
// because it runs on every previewed asset (~13x faster on a 1MB document) and
// because contracts ships into the browser bundle. What it must never be is
// *wrong* where the spec is right — so this pins it against a real HTML5
// parser. jsdom is built on parse5, the html5lib-tested implementation, and is
// already a dependency here; contracts stays dependency-free by hosting the
// oracle in the package that already pays for a parser.
//
// The property asserted is the outcome, not the offset: inserting at the
// scanner's offset must leave the parse tree with one extra element inside
// <body> and nothing else moved.
//
// Outcome rather than offset equality is deliberate. Where a source token
// closes an element is not the same question as where an injection may go: in
// `…</body></html><p>tail</p></body></html>` the spec reopens the body, so a
// parser attributes the close to the *second* `</body>` while inserting before
// the first is equally correct. Asserting offsets would fail that document for
// no reason.
// --------------------------------------------------------------------------

const BRIDGE_ATTR = 'data-od-test-bridge';
const BRIDGE = `<script ${BRIDGE_ATTR}>var s = "</div>";<\/script>`;

/** Comments are inert; dropping them keeps the comparison about structure. */
function stripComments(document: Document): string {
  const walker = document.createTreeWalker(document.documentElement, 128 /* SHOW_COMMENT */);
  const comments: ChildNode[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) comments.push(node as ChildNode);
  comments.forEach((node) => node.remove());
  return document.documentElement.outerHTML;
}

function structure(html: string): string {
  return stripComments(new JSDOM(html).window.document);
}

function injectAndCompare(html: string): { parent: string | null; unchanged: boolean } {
  const before = structure(html);
  const at = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose);
  const injected = at >= 0 ? html.slice(0, at) + BRIDGE + html.slice(at) : html + BRIDGE;

  const { document } = new JSDOM(injected).window;
  const el = document.querySelector(`[${BRIDGE_ATTR}]`);
  if (!el) return { parent: null, unchanged: false };
  const parent = el.parentElement?.tagName ?? null;
  el.remove();

  return { parent, unchanged: stripComments(document) === before };
}

/** Documents where a boundary tag also appears as ordinary content. */
const HAZARDS: Record<string, string> = {
  'script builds a document string':
    '<!doctype html><html><head></head><body><script>var t=`<body>x</body>`;<\/script><p>hi</p></body></html>',
  'markup stored on a data attribute':
    '<!doctype html><html><head></head><body><div data-t="<body>x</body>"></div><p>hi</p></body></html>',
  'boundary inside a comment':
    '<!doctype html><html><head></head><body><!-- </body> --><p>hi</p></body></html>',
  'boundary inside a textarea':
    '<!doctype html><html><head></head><body><textarea></body></textarea><p>hi</p></body></html>',
  'boundary inside a style block':
    '<!doctype html><html><head><style>/* </body> */</style></head><body><p>hi</p></body></html>',
  'boundary inside a title':
    '<!doctype html><html><head><title>a </body> b</title></head><body><p>hi</p></body></html>',
  'boundary inside a template':
    '<!doctype html><html><head></head><body><template></body></template><p>hi</p></body></html>',
  'boundary inside noscript':
    '<!doctype html><html><head></head><body><noscript></body></noscript><p>hi</p></body></html>',
  'boundary inside xmp':
    '<!doctype html><html><head></head><body><xmp></body></xmp><p>hi</p></body></html>',
  'quoted angle bracket in an attribute':
    '<!doctype html><html><head></head><body><div title="a>b" data-t="</body>"></div><p>hi</p></body></html>',
  'quote inside an unquoted attribute':
    "<!doctype html><html><head></head><body><div data-x=a'b><p>hi</p></div></body></html>",
  'legacy doctype with a quoted string':
    '<!DOCTYPE html SYSTEM "about:legacy-compat"><html><head></head><body><p>hi</p></body></html>',
  'less-than in prose':
    '<!doctype html><html><head></head><body><p>a < b and 3<4</p></body></html>',
  'escaped close tag in a script':
    '<!doctype html><html><head></head><body><script>var s="<\\/script>";<\/script><p>hi</p></body></html>',
  'body carrying the boundary as an attribute':
    '<!doctype html><html><head></head><body data-t="</body>"><p>hi</p></body></html>',
  'no explicit body close':
    '<!doctype html><html><head></head><body><p>hi</p>',
  'bare fragment':
    '<p>hi</p><script>var t=`</body>`;<\/script>',
  'no head at all':
    '<!doctype html><html><body><script>var t=`<head></head>`;<\/script><p>hi</p></body></html>',
  'uppercase close tag':
    '<!doctype html><html><head></head><body><p>hi</p></BODY></html>',
  'whitespace before the close bracket':
    '<!doctype html><html><head></head><body><p>hi</p></body ></html>',
  'content after the document closes':
    '<html><head></head><body><p>hi</p></body></html><p>tail</p></body></html>',
  'script appended past the document close':
    '<!doctype html><html><head></head><body><p>hi</p></body></html><script>window.__tail=1;<\/script>',
  'doubled close tags':
    '<!doctype html><html><head></head><body data-t="</body>"><div><p>hi</p></div></body></html></body></html>',
};

describe('inserting at the scanner offset', () => {
  it.each(Object.entries(HAZARDS))(
    'adds one element inside <body> and moves nothing else — %s',
    (_name, html) => {
      expect(injectAndCompare(html)).toEqual({ parent: 'BODY', unchanged: true });
    },
  );

  // Two jsdom parses per document makes this the one genuinely slow spec in the
  // file; give it room rather than let a loaded CI box flake it out.
  it('holds across generated documents', { timeout: 30_000 }, () => {
    // A deterministic LCG keeps a failure reproducible; a random seed would
    // report a different document on every run.
    let seed = 20260826;
    const random = (): number => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length) % values.length]!;

    const parts = [
      '<script>var t=`<body>x</body>`;<\/script>',
      '<script>var t=`<head><title>t</title></head>`;<\/script>',
      '<div data-t="<body>x</body>"></div>',
      '<div data-t="</head>" title="a>b"></div>',
      '<!-- </body> </head> -->',
      '<textarea></body></textarea>',
      '<style>/* </body> <head> */</style>',
      '<p>a < b and 3<4</p>',
      "<div data-x=a'b>u</div>",
      '<template></body></template>',
      '<noscript></body></noscript>',
      '<xmp></body></xmp>',
      '<script>var s="<\\/script>";<\/script>',
      '<div title="</body>"></div>',
      '<p>plain</p>',
      '<br/>',
    ];
    const heads = ['<head></head>', '<head>', '<head lang="x" data-t="</head>">', '', '<head><title>a</title></head>'];
    const doctypes = ['<!doctype html>', '<!DOCTYPE html SYSTEM "about:legacy-compat">', ''];
    const bodies = ['<body>', '<body class="a">', '<body data-t="</body>">', ''];

    const failures: string[] = [];
    for (let i = 0; i < 150; i += 1) {
      let inner = '';
      for (let part = 0; part < 1 + Math.floor(random() * 4); part += 1) inner += pick(parts);
      const head = pick(heads);
      const body = pick(bodies);
      const html = `${pick(doctypes)}<html>${head}${head && !head.includes('</head>') ? '</head>' : ''}`
        + `${body}${inner}${body ? '</body>' : ''}</html>`;
      const result = injectAndCompare(html);
      if (result.parent !== 'BODY' || !result.unchanged) failures.push(html);
    }

    expect(failures).toEqual([]);
  });
});
