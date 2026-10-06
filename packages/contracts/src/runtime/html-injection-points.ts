/**
 * Locating a real structural boundary in an HTML document, by source offset.
 *
 * Both preview transports splice text into an artifact's own bytes: the daemon
 * injects URL-preview bridges into the file it serves, and `buildSrcdoc`
 * injects the srcDoc bridges. Neither re-serializes the document — the author's
 * bytes have to survive — so each needs the *offset* of a boundary rather than
 * a parsed tree.
 *
 * Finding that offset with a plain text match is what broke
 * nexu-io/open-design#7410. The tags these injectors look for are also
 * perfectly ordinary content: a prototype that builds an HTML document (a print
 * window, an email template, a `srcdoc` payload) writes `<body>` into a script
 * string or onto a `data-` attribute. Splicing there puts the injected
 * `</script>` inside the author's script, which ends it early and renders the
 * remainder as page text — or closes their attribute early, since injected
 * bridges carry quotes. Either way the page breaks with no console error.
 *
 * This module is the single source of truth for that lookup. It lives in
 * contracts because the bug's root cause was two copies of the same logic
 * drifting apart: the srcDoc path anchored on the real `</body>` while the
 * daemon copy still matched the first one in the text.
 *
 * Pure string scanning — no DOM, no parser dependency — so it behaves
 * identically in the daemon, in the browser, and under test.
 */

/**
 * Elements whose content the HTML parser reads as character data, not markup.
 * A tag written inside one of these is text the author chose to store, not a
 * structural boundary of this document.
 *
 * `noscript` is included because every preview surface runs with scripting
 * enabled, which is what puts it in the raw-text set. `plaintext` runs to end
 * of input; having no close tag, it correctly reports "no boundary left".
 */
export const HTML_RAW_TEXT_ELEMENTS = [
  'script',
  'style',
  'textarea',
  'title',
  'iframe',
  'noembed',
  'noframes',
  'noscript',
  'plaintext',
  'xmp',
] as const;

/**
 * Offset of the `>` that closes the start/end tag beginning at `from`, or -1
 * when the tag never closes. Quoted attribute values are skipped, so a `>`
 * the author wrote inside one does not end the tag early. A quote only opens
 * a value when it directly follows `=`; anywhere else it is a literal
 * character of an unquoted value.
 */
/**
 * Offset just past the comment starting at `from` (which points at `<!--`), or
 * -1 when it never closes.
 *
 * A comment closes on a run of dashes followed by `>` or `!>`, and `<!-->` /
 * `<!--->` are already closed at the start. A plain `indexOf('-->')` misses
 * `--!>` and the abrupt forms, and then resumes scanning inside author text —
 * where the next `-->` it finds may well be in a script string.
 */
/** Lowercase only A–Z, so the result is the same length as the input. */
function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function endOfComment(html: string, from: number): number {
  let i = from + 4;
  if (html.startsWith('>', i)) return i + 1;
  if (html.startsWith('->', i)) return i + 2;
  while (i < html.length) {
    const dash = html.indexOf('--', i);
    if (dash < 0) return -1;
    let j = dash;
    while (html.charCodeAt(j) === 45 /* - */) j += 1;
    if (html.startsWith('>', j)) return j + 1;
    if (html.startsWith('!>', j)) return j + 2;
    i = j > dash ? j : dash + 2;
  }
  return -1;
}

/**
 * One walk of a start or end tag, in the tokenizer's own states.
 *
 * The three things callers need — where the tag ends, whether its solidus is a
 * real self-closing marker, and what its attributes are — all depend on the
 * same state, so they are produced together. Inferring any of them from the
 * surrounding bytes goes wrong on tags the browser still accepts: in
 * `<head data==">` the second `=` opens an *unquoted* value and the `"` is a
 * character of it, so the tag ends at the very next `>`. A walker that treats
 * that quote as opening a quoted value runs on to the next quote in the
 * document — typically inside a script — and reports a `>` that is author text.
 *
 * `from` is the offset just past the tag name. `end` is the offset of the `>`
 * that closes the tag, or -1 if the tag is unterminated.
 */
interface ScannedTag {
  end: number;
  selfClosing: boolean;
  attrs: Map<string, string>;
}

function scanTag(html: string, from: number): ScannedTag {
  const attrs = new Map<string, string>();
  const unterminated: ScannedTag = { end: -1, selfClosing: false, attrs };
  let i = from;
  let selfClosing = false;
  while (i < html.length) {
    // Before attribute name.
    const ch = html.charCodeAt(i);
    // A solidus only self-closes when `>` comes *immediately* after it: the
    // self-closing start tag state reconsumes anything else in the
    // before-attribute-name state, so `<svg/ >` is an ordinary open tag.
    // Leaving the flag set through the whitespace made `<svg/ >` look closed,
    // and the scan then read the element's contents as document markup.
    if (isHtmlWhitespace(ch)) { selfClosing = false; i += 1; continue; }
    if (ch === 47 /* / */) { selfClosing = true; i += 1; continue; }
    if (ch === 62 /* > */) return { end: i, selfClosing, attrs };
    // A solidus only self-closes when `>` comes next; anything else resumes
    // attributes and the solidus was noise.
    selfClosing = false;
    const nameStart = i;
    // An `=` where a name should start is the name's first character, not the
    // start of a value: the tokenizer's unexpected-equals-sign-before-attribute
    // -name rule. Reading it as a value separator instead consumes the quote
    // that follows as a value delimiter, and the tag then appears to run to
    // some later quote in the document.
    if (html.charCodeAt(i) === 61 /* = */) i += 1;
    while (i < html.length) {
      const c = html.charCodeAt(i);
      if (isHtmlWhitespace(c) || c === 47 || c === 61 /* = */ || c === 62) break;
      i += 1;
    }
    // The tokenizer replaces NUL in an attribute name with U+FFFD, so a name
    // that carries one is still not the name it looks like without it.
    const name = asciiLower(html.slice(nameStart, i)).replace(/\0/g, '\uFFFD');
    // After attribute name.
    while (i < html.length && isHtmlWhitespace(html.charCodeAt(i))) i += 1;
    if (i >= html.length) return unterminated;
    let value = '';
    if (html.charCodeAt(i) === 61 /* = */) {
      i += 1;
      // Before attribute value.
      while (i < html.length && isHtmlWhitespace(html.charCodeAt(i))) i += 1;
      if (i >= html.length) return unterminated;
      const quote = html.charCodeAt(i);
      if (quote === 34 /* " */ || quote === 39 /* ' */) {
        const close = html.indexOf(String.fromCharCode(quote), i + 1);
        if (close < 0) return unterminated;
        value = html.slice(i + 1, close);
        i = close + 1;
      } else if (quote === 62 /* > */) {
        // Missing value; the tag ends here.
        if (name && !attrs.has(name)) attrs.set(name, '');
        return { end: i, selfClosing: false, attrs };
      } else {
        const valueStart = i;
        while (i < html.length) {
          const c = html.charCodeAt(i);
          if (isHtmlWhitespace(c) || c === 62) break;
          i += 1;
        }
        value = html.slice(valueStart, i);
      }
    }
    if (name && !attrs.has(name)) attrs.set(name, value);
  }
  return unterminated;
}

/** Offset of the `>` that closes the tag whose name ends at `from`, or -1. */
export function endOfTag(html: string, from: number): number {
  return scanTag(html, from).end;
}


/**
 * Offset of the first `pattern` match that the HTML parser would actually
 * treat as a tag. `pattern` is matched stickily at each `<`, so pass it
 * unanchored and let it identify the tag name only — use `endOfTag` for the
 * tag's extent.
 *
 * Every URL-preview injection splices text into the served document, so its
 * insertion point has to be a real structural boundary. The tags we look for
 * are also perfectly ordinary *content*: a prototype that builds an HTML
 * document (a print window, an email template, a `srcdoc` payload) writes
 * them into a script string or a `data-` attribute. Splicing at the first
 * textual match lands the injected markup inside that string, which ends the
 * author's script early — or closes their attribute early, since the
 * injection carries quotes — and renders the remainder as page text with no
 * console error to explain it (nexu-io/open-design#7410).
 *
 * So this walks tag by tag rather than character by character, skipping every
 * place a tag-looking run of text is not this document's markup: comments and
 * other markup declarations, raw-text element content, attribute values, and
 * `<template>` content.
 */
/**
 * Offset of the end tag that actually closes a raw-text element, or -1 when it
 * never closes.
 *
 * The tokenizer only leaves raw text on `</name` followed by whitespace, `/`,
 * or `>`. A longer name that merely starts with it — `</script-template>`
 * inside a `<script>` — is character data, so resuming there would drop the
 * scan back into the author's string and hand back a boundary from inside it.
 */
/**
 * HTML ASCII whitespace: TAB, LF, FF, CR, SPACE — and nothing else.
 *
 * The tokenizer separates tokens on exactly these five. Every other code point
 * at or below U+0020 is an ordinary character: a NUL inside an attribute name
 * becomes U+FFFD and stays part of that name, so `color\0=x` is an attribute
 * called `color\uFFFD`, not `color`. Treating the whole C0 range as whitespace
 * invents attributes the parser never saw, and an invented `color` on `<font>`
 * is enough to break out of foreign content early.
 */
function isHtmlWhitespace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

/** A character that ends an end-tag name: ASCII whitespace, `/`, or `>`. */
function isEndTagBoundary(code: number): boolean {
  return isHtmlWhitespace(code) || code === 47 || code === 62;
}

export function findRawTextClose(lowerHtml: string, tagName: string, from: number): number {
  // `<plaintext>` switches the tokenizer to PLAINTEXT, which has no way out:
  // everything to end of input is character data and `</plaintext>` is text
  // like anything else. Reporting no close is what keeps the scan from
  // resuming in it.
  if (tagName === 'plaintext') return -1;
  if (tagName === 'script') return findScriptClose(lowerHtml, from);
  const needle = `</${tagName}`;
  let at = lowerHtml.indexOf(needle, from);
  while (at >= 0) {
    // NaN past end of input fails the test, which is correct: an unterminated
    // end tag does not close the element.
    if (isEndTagBoundary(lowerHtml.charCodeAt(at + needle.length))) return at;
    at = lowerHtml.indexOf(needle, at + needle.length);
  }
  return -1;
}

/**
 * Offset of the `</script` that actually closes a script, or -1.
 *
 * Script data has escape states the other raw-text elements do not: after
 * `<!--` a nested `<script` moves the tokenizer to double-escaped, where
 * `</script>` steps back out instead of closing. Treating that first
 * `</script>` as the close resumes the scan inside the author's string.
 */
function findScriptClose(lowerHtml: string, from: number): number {
  let i = from;
  let escaped = false;
  let doubleEscaped = false;
  while (i < lowerHtml.length) {
    if (!escaped && lowerHtml.startsWith('<!--', i)) { escaped = true; i += 4; continue; }
    // `>` in the script-data-double-escaped-dash-dash state switches to the
    // plain script data state, so `-->` leaves *both* escape levels. Keeping
    // double-escaped here runs the scan past the element's real close and into
    // whatever follows it.
    if (escaped && lowerHtml.startsWith('-->', i)) { escaped = false; doubleEscaped = false; i += 3; continue; }
    if (escaped && !doubleEscaped && lowerHtml.startsWith('<script', i) && isEndTagBoundary(lowerHtml.charCodeAt(i + 7))) {
      doubleEscaped = true;
      i += 7;
      continue;
    }
    if (lowerHtml.startsWith('</script', i) && isEndTagBoundary(lowerHtml.charCodeAt(i + 8))) {
      if (!doubleEscaped) return i;
      doubleEscaped = false;
      i += 8;
      continue;
    }
    i += 1;
  }
  return -1;
}

/**
 * Offset just past the `</template>` that closes the template opened before
 * `from`, or -1. Counted with the same skip rules the main scan uses: a
 * `</template>` inside a nested script string is content, and counting it
 * would end the template early and drop the scan back into author text.
 */
function skipTemplateContent(html: string, lowerHtml: string, from: number): number {
  const tagOpen = /<(\/?)([a-z][^\t\n\f\r \/>]*)/iy;
  // One insertion-mode state per open template, and the stack is the depth. A
  // nested template's contents are processed through the template rules, which
  // start it in a fresh mode and restore the outer one at its close — carrying
  // a single `inSelect` straight through made the walker ignore a real `<svg>`
  // inside the inner fragment.
  const modes: SelectModeState[] = [newSelectModeState()];
  let i = from;
  while (i < html.length && modes.length > 0) {
    if (html.charCodeAt(i) !== 60 /* < */) { i += 1; continue; }
    if (html.startsWith('<!--', i)) {
      const end = endOfComment(html, i);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (html.startsWith('</', i) && !/[a-z]/i.test(html.charAt(i + 2))) {
      const end = html.indexOf('>', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      const end = html.indexOf('>', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    tagOpen.lastIndex = i;
    const open = tagOpen.exec(html);
    if (!open) { i += 1; continue; }
    const tag = scanTag(html, i + open[0].length);
    const tagEnd = tag.end;
    if (tagEnd < 0) return -1;
    const tagName = (open[2] ?? '').toLowerCase();
    const selectMode = modes[modes.length - 1]!;
    if (!observeSelectMode(selectMode, tagName, !!open[1], tag.selfClosing)) return -1;
    if (!open[1] && (HTML_RAW_TEXT_ELEMENTS as readonly string[]).includes(tagName)) {
      const contentEnd = findRawTextClose(lowerHtml, tagName, tagEnd + 1);
      if (contentEnd < 0) return -1;
      i = contentEnd;
      continue;
    }
    if (!open[1] && !selectMode.inSelect && (tagName === 'svg' || tagName === 'math')
        && !tag.selfClosing) {
      // Foreign content inside a template follows the same rules, CDATA
      // included, so it has to go through the same skip.
      const contentEnd = skipForeignContent(html, lowerHtml, tagName, tagEnd + 1);
      if (contentEnd < 0) return -1;
      i = contentEnd;
      continue;
    }
    if (tagName === 'template') {
      if (open[1]) {
        modes.pop();
        if (modes.length === 0) return tagEnd + 1;
      } else if (!tag.selfClosing) {
        modes.push(newSelectModeState());
      }
    }
    i = tagEnd + 1;
  }
  return -1;
}

// Void elements never have contents, so they never open a namespace frame and
// a trailing solidus on them is redundant rather than meaningful.
/**
 * The in-select insertion mode, shared by every walker that decides whether an
 * `<svg>` / `<math>` start tag opens foreign content.
 *
 * It lives in one place because it has to give the same answer everywhere: a
 * template's contents are parsed with the same insertion modes as the document,
 * so a walker that models this at the top level and not inside a template
 * disagrees with itself on the same bytes.
 */
interface SelectModeState {
  inSelect: boolean;
  tableDepth: number;
}

function newSelectModeState(): SelectModeState {
  return { inSelect: false, tableDepth: 0 };
}

/**
 * Fold one tag into `state`. Returns false when the transition depends on table
 * scope, which no linear scan can determine — the caller refuses rather than
 * guessing. See the `<select>` notes in `findRealTagOffset`.
 */
function observeSelectMode(
  state: SelectModeState,
  tagName: string,
  isEndTag: boolean,
  selfClosing: boolean,
): boolean {
  const wasInSelect = state.inSelect;
  const tableDepthBefore = state.tableDepth;
  let determinate = true;
  if (tagName === 'select') state.inSelect = !isEndTag && !state.inSelect;
  else if (state.inSelect && !isEndTag && SELECT_CLOSING_START_TAGS.includes(tagName)) {
    state.inSelect = false;
  } else if (state.inSelect && tableDepthBefore > 0 && SELECT_IN_TABLE_CLOSING_TAGS.includes(tagName)) {
    determinate = false;
  }
  // A token the in-select mode ignored never reaches the table stack, and a
  // `<table>` cannot put itself in a table.
  if (!(wasInSelect && tableDepthBefore === 0)) {
    if (!isEndTag && tagName === 'table' && !selfClosing) state.tableDepth += 1;
    else if (isEndTag && tagName === 'table' && state.tableDepth > 0) state.tableDepth -= 1;
  }
  return determinate;
}

// Start tags that close an open `<select>` and are then reprocessed, in every
// select context.
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

// End tags whose "in body" rule synthesises the element and then closes it,
// popping whatever is open above — including a foreign element. Every other
// stray end tag meets a `special` element and is ignored.
const REPROCESSED_END_TAGS: readonly string[] = ['p', 'br'];

const SELECT_CLOSING_START_TAGS: readonly string[] = ['input', 'keygen', 'textarea'];
// Tags that close it only in "in select in table" — outside a table the
// in-select mode ignores them and the select stays open.
const SELECT_IN_TABLE_CLOSING_TAGS: readonly string[] = [
  'caption', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'td', 'th',
];

const PREVIEW_VOID_ELEMENTS: readonly string[] = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr',
];

/**
 * SVG elements whose children the parser reads as ordinary HTML again.
 * MathML has two separate sets: the text integration points below, which
 * always qualify, and `annotation-xml`, which qualifies only when its
 * `encoding` names an HTML type — so it is handled by attribute, not by list.
 */
const HTML_INTEGRATION_POINTS: readonly string[] = ['foreignobject', 'desc', 'title'];
const MATHML_TEXT_INTEGRATION_POINTS: readonly string[] = ['mi', 'mo', 'mn', 'ms', 'mtext'];
// Beneath a MathML text integration point the parser is in HTML — except for
// these two, which the dispatcher keeps in MathML.
const MATHML_TEXT_INTEGRATION_EXCEPTIONS: readonly string[] = ['mglyph', 'malignmark'];
// A start tag on this list inside `<svg>` / `<math>` is a parse error that pops
// the foreign element and is then reprocessed as HTML, so the foreign subtree
// ends at the tag rather than at a matching close.
const FOREIGN_BREAKOUT_TAGS: readonly string[] = [
  'b', 'big', 'blockquote', 'body', 'br', 'center', 'code', 'dd', 'div', 'dl',
  'dt', 'em', 'embed', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'hr', 'i',
  'img', 'li', 'listing', 'menu', 'meta', 'nobr', 'ol', 'p', 'pre', 'ruby', 's',
  'small', 'span', 'strong', 'strike', 'sub', 'sup', 'table', 'tt', 'u', 'ul',
  'var',
];
const HTML_ANNOTATION_ENCODINGS: readonly string[] = ['text/html', 'application/xhtml+xml'];

/**
 * The only named character references that can appear in an encoding this
 * scanner accepts. `text/html` and `application/xhtml+xml` are letters plus
 * `/`, `+` and `.`, and HTML has no named reference for an ASCII letter — so
 * with numeric references handled below, this table is complete for that
 * comparison rather than a sample of a larger one.
 */
const ATTRIBUTE_NAMED_REFERENCES: ReadonlyMap<string, string> = new Map([
  ['sol', '/'],
  ['plus', '+'],
  ['period', '.'],
]);

/**
 * An attribute value with its character references resolved, as the tokenizer
 * resolves them before the tree builder ever compares the value.
 *
 * A numeric reference is consumed with or without its semicolon, which is what
 * the tokenizer does in an attribute value. A named one is only a reference
 * when terminated by `;`: without it, an alphanumeric or `=` following makes it
 * an ambiguous ampersand, which stays literal.
 */
function decodeAttributeValue(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(
    /&(?:#([0-9]+);?|#[xX]([0-9a-fA-F]+);?|([a-zA-Z][a-zA-Z0-9]*);)/g,
    (whole, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (dec !== undefined || hex !== undefined) {
        const code = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex!, 16);
        // Null, out of range, and lone surrogates all become U+FFFD, as the
        // tokenizer's numeric-reference end state specifies.
        if (!Number.isFinite(code)) return whole;
        if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
        return String.fromCodePoint(code);
      }
      // Named references are case-sensitive: `&sol;` is one and `&SOL;` is not,
      // and the parser leaves the latter as literal text.
      return ATTRIBUTE_NAMED_REFERENCES.get(name ?? '') ?? whole;
    },
  );
}


/**
 * Whether this start tag breaks out of foreign content. `font` only does so
 * when it carries a presentational attribute; everything else is by name.
 */
function isForeignBreakoutTag(tagName: string, attrs: ReadonlyMap<string, string>): boolean {
  if (tagName === 'font') {
    return attrs.has('color') || attrs.has('face') || attrs.has('size');
  }
  return FOREIGN_BREAKOUT_TAGS.includes(tagName);
}

/**
 * Whether an `annotation-xml` `encoding` makes it an HTML integration point.
 *
 * The value is decoded first, because the tokenizer resolves references before
 * the tree builder compares it — and not trimmed, because that comparison is
 * exact, so a padded value is not a match and must not be smoothed into one.
 */
function annotationXmlEncodingIsHtml(value: string | undefined): boolean {
  if (value === undefined) return false;
  return HTML_ANNOTATION_ENCODINGS.includes(asciiLower(decodeAttributeValue(value)));
}

/**
 * The namespace an element's *children* are parsed in, given the namespace the
 * element itself lives in. This is the tree builder's "adjusted current node"
 * rule: at an HTML integration point the parser returns to HTML, so the same
 * bytes mean different things on either side of the boundary.
 */
function foreignChildNamespace(
  tagName: string,
  elementNs: string,
  attrs: ReadonlyMap<string, string>,
): string {
  if (elementNs === 'svg' && HTML_INTEGRATION_POINTS.includes(tagName)) return 'html';
  if (elementNs === 'math') {
    if (MATHML_TEXT_INTEGRATION_POINTS.includes(tagName)) return 'html';
    if (tagName === 'annotation-xml' && annotationXmlEncodingIsHtml(attrs.get('encoding'))) {
      return 'html';
    }
  }
  return elementNs;
}

/**
 * Offset just past the `</svg>` / `</math>` that closes the foreign element
 * opened before `from`, or -1.
 *
 * The whole subtree is skipped because no document-level boundary can live
 * inside `<svg>` or `<math>` — but working out where that subtree *ends*
 * requires knowing which namespace each byte is in, because two rules invert
 * across the boundary:
 *
 *   - `<![CDATA[ … ]]>` is real character data in foreign content and a bogus
 *     comment (ending at the first `>`) in HTML. Reading `<svg><![CDATA[label
 *     > </body>]]></svg>` by the HTML rule stops at that first `>` and hands
 *     back the `</body>` inside the section.
 *   - `<script>`/`<style>`/`<title>` are raw text in HTML and ordinary
 *     SVG/MathML elements in foreign content, where `<` in them is markup.
 *
 * Namespace is a stack, not a depth: `<svg><foreignObject>` returns to HTML,
 * but a `<math>` beneath that foreignObject re-enters MathML, and its children
 * are foreign again. A counter cannot express that.
 */
function skipForeignContent(html: string, lowerHtml: string, rootName: string, from: number): number {
  const tagOpen = /<(\/?)([a-z][^\t\n\f\r \/>]*)/iy;
  // The stack is the element's whole lifetime — there is no parallel counter.
  // A name counter cannot survive an unwind: in `<svg><foreignObject><svg>` the
  // inner `<svg>` shares the root's name but is an ordinary element, and when
  // `</foreignObject>` truncates the stack past it the counter is left holding
  // a frame that no longer exists. The walk then never returns and reads the
  // rest of the document as foreign content.
  //
  // Frame 0 is the already-open root; `childNs` is the namespace its contents
  // are parsed in, which for `<svg>` / `<math>` is that namespace itself.
  const nsStack: { name: string; childNs: string; mathmlText: boolean }[] = [
    { name: rootName, childNs: rootName, mathmlText: false },
  ];
  let i = from;
  while (i < html.length && nsStack.length > 0) {
    if (html.charCodeAt(i) !== 60 /* < */) {
      i += 1;
      continue;
    }
    const currentNs = nsStack[nsStack.length - 1]?.childNs ?? rootName;
    if (html.startsWith('<!--', i)) {
      const end = endOfComment(html, i);
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (html.startsWith('</', i) && !/[a-z]/i.test(html.charAt(i + 2))) {
      const end = html.indexOf('>', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (currentNs !== 'html' && lowerHtml.startsWith('<![cdata[', i)) {
      const end = html.indexOf(']]>', i + 9);
      if (end < 0) return -1;
      i = end + 3;
      continue;
    }
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      const end = html.indexOf('>', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    tagOpen.lastIndex = i;
    const open = tagOpen.exec(html);
    if (!open) {
      i += 1;
      continue;
    }
    const tag = scanTag(html, i + open[0].length);
    const tagEnd = tag.end;
    if (tagEnd < 0) return -1;
    const tagName = (open[2] ?? '').toLowerCase();
    if (open[1]) {
      // Unwind to the matching open element, frame 0 included: an end tag that
      // matches the root closes the subtree.
      let matched = false;
      for (let frame = nsStack.length - 1; frame >= 0; frame -= 1) {
        if (nsStack[frame]?.name === tagName) {
          nsStack.length = frame;
          matched = true;
          break;
        }
      }
      // An end tag that matches nothing is walked down to the first
      // HTML-namespace ancestor and reprocessed in the current insertion mode.
      // Usually it meets a `special` element there and is ignored, so it closes
      // nothing here either — measured against a real parser, 33 of 35 stray
      // end tags leave the foreign element open. `</p>` and `</br>` are the
      // exceptions: "in body" gives both a rule that synthesises the element
      // and then closes it, which pops the foreign element on the way. Those
      // two are stateful in a way this scan does not model, so refuse.
      if (!matched && REPROCESSED_END_TAGS.includes(tagName)) return -1;
      i = tagEnd + 1;
      if (nsStack.length === 0) return i;
      continue;
    }
    if (currentNs !== 'html' && isForeignBreakoutTag(tagName, tag.attrs)) {
      // The tag is reprocessed as HTML after the foreign elements are popped,
      // so the scan does not consume it — it only leaves foreign content and
      // lets the next pass read the same tag under HTML rules.
      while (nsStack.length > 0 && nsStack[nsStack.length - 1]!.childNs !== 'html') {
        nsStack.pop();
      }
      if (nsStack.length === 0) return i;
      continue;
    }
    // A solidus really does close the element in foreign content; in HTML it
    // is ignored on anything that is not void, so it must not pop a frame.
    const selfClosing = tag.selfClosing
      && (currentNs !== 'html' || PREVIEW_VOID_ELEMENTS.includes(tagName));
    if (!selfClosing && currentNs === 'html'
        && (HTML_RAW_TEXT_ELEMENTS as readonly string[]).includes(tagName)) {
      const contentEnd = findRawTextClose(lowerHtml, tagName, tagEnd + 1);
      if (contentEnd < 0) return -1;
      i = contentEnd;
      continue;
    }
    if (!selfClosing && !PREVIEW_VOID_ELEMENTS.includes(tagName)) {
      const parent = nsStack[nsStack.length - 1];
      const underMathmlText = parent?.mathmlText ?? false;
      // The dispatcher hands `<svg>` beneath a MathML `annotation-xml` to the
      // HTML rules even with no `encoding`, so the element lands in SVG rather
      // than inheriting MathML — and a `<foreignObject>` under it is then a
      // real integration point whose `<script>` is HTML raw text again.
      const elementNs = currentNs === 'html'
        ? (underMathmlText && MATHML_TEXT_INTEGRATION_EXCEPTIONS.includes(tagName) ? 'math'
          : tagName === 'svg' ? 'svg' : tagName === 'math' ? 'math' : 'html')
        : (currentNs === 'math' && tagName === 'svg' && parent?.name === 'annotation-xml'
          ? 'svg'
          : currentNs);
      nsStack.push({
        name: tagName,
        childNs: foreignChildNamespace(tagName, elementNs, tag.attrs),
        mathmlText: elementNs === 'math' && MATHML_TEXT_INTEGRATION_POINTS.includes(tagName),
      });
    }
    i = tagEnd + 1;
  }
  return -1;
}

export function findRealTagOffset(html: string, pattern: RegExp): number {
  const anchored = new RegExp(pattern.source, `${pattern.flags.replace(/[gy]/g, '')}y`);
  const tagOpen = /<(\/?)([a-z][^\t\n\f\r \/>]*)/iy;
  // ASCII-only, so the shadow stays index-aligned with `html`. A full
  // toLowerCase() is not length-preserving (U+0130 lowercases to two code
  // units), and every offset taken from the shadow is used against `html`.
  const lower = asciiLower(html);
  const selectMode = newSelectModeState();
  let i = 0;
  while (i < html.length) {
    if (html.charCodeAt(i) !== 60 /* < */) {
      i += 1;
      continue;
    }
    if (html.startsWith('<!--', i)) {
      const end = endOfComment(html, i);
      // An unterminated comment swallows the rest of the document, so there is
      // no real tag left to find.
      if (end < 0) return -1;
      i = end;
      continue;
    }
    if (html.startsWith('</', i) && !/[a-z]/i.test(html.charAt(i + 2))) {
      // End-tag-open on anything that is not an ASCII letter is a bogus
      // comment running to the next `>`; scanning inside it treats author
      // prose as markup.
      const end = html.indexOf('>', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    if (html.startsWith('<!', i) || html.startsWith('<?', i)) {
      // Doctype and bogus-comment states both end at the next `>`.
      const end = html.indexOf('>', i + 2);
      if (end < 0) return -1;
      i = end + 1;
      continue;
    }
    anchored.lastIndex = i;
    if (anchored.test(html)) return i;
    tagOpen.lastIndex = i;
    const open = tagOpen.exec(html);
    if (!open) {
      // A `<` that starts no tag is ordinary text (`a < b`).
      i += 1;
      continue;
    }
    const tag = scanTag(html, i + open[0].length);
    const tagEnd = tag.end;
    if (tagEnd < 0) return -1;
    const tagName = (open[2] ?? '').toLowerCase();
    // `<select>` is the one HTML context this scan has to know about: the
    // in-select insertion mode *ignores* an `<svg>` / `<math>` start tag
    // outright, so no foreign element is created and the bytes after it are
    // still ordinary HTML. Walking them as foreign content is how
    // `<select><svg></select><script>…` ended up reading a script string as
    // markup. Everything else about insertion modes stays unmodelled.
    //
    // Knowing where the mode *ends* is the whole job, and it ends in more ways
    // than `</select>`. A second `<select>` start tag closes the open one
    // rather than nesting. `input`, `keygen` and `textarea` close it and are
    // then reprocessed. Inside a table the mode is "in select in table", where
    // the table tokens below close it too — and outside a table those same
    // tokens are simply ignored, which is why the table has to be tracked
    // rather than assumed.
    // Whether a table token ends the mode depends on the select being in *table
    // scope*, a property of the open-element stack rather than of having seen a
    // `<table>` start tag — foster parenting can move the select out of the
    // table it appeared inside. A linear scan cannot tell those apart, and both
    // answers are wrong in some document, so that case refuses.
    if (!observeSelectMode(selectMode, tagName, !!open[1], tag.selfClosing)) return -1;
    if (!open[1] && (HTML_RAW_TEXT_ELEMENTS as readonly string[]).includes(tagName)) {
      const contentEnd = findRawTextClose(lower, tagName, tagEnd + 1);
      // Unclosed raw text runs to the end of the document — same as above.
      if (contentEnd < 0) return -1;
      i = contentEnd;
      continue;
    }
    if (!open[1] && !selectMode.inSelect && (tagName === 'svg' || tagName === 'math')
        && !tag.selfClosing) {
      const contentEnd = skipForeignContent(html, lower, tagName, tagEnd + 1);
      if (contentEnd < 0) return -1;
      i = contentEnd;
      continue;
    }
    if (!open[1] && tagName === 'template') {
      // Template content is an inert fragment the tree builder keeps out of the
      // document, so a `</body>` inside one is not this document's boundary and
      // an injection placed there would never run.
      const contentEnd = skipTemplateContent(html, lower, tagEnd + 1);
      if (contentEnd < 0) return -1;
      i = contentEnd;
      continue;
    }
    i = tagEnd + 1;
  }
  return -1;
}

/**
 * Prepend `payload` to `html`, but after a leading DOCTYPE if there is one.
 *
 * A `<script>` token before the DOCTYPE puts the parser in quirks mode and the
 * DOCTYPE is then dropped, silently changing the page's box model — a bridge
 * must never do that to an artifact.
 */
/**
 * Whether a bogus comment starts at `i` — a token the tokenizer turns into a
 * comment rather than markup, and which therefore does not stop a later doctype
 * from applying. `<!doctype` is excluded because it is the thing being looked
 * for, and `<!--` because a real comment is walked with `endOfComment`.
 */
function isBogusCommentStart(html: string, i: number): boolean {
  if (html.startsWith('<?', i)) return true;
  if (html.startsWith('</', i)) return !/[a-z]/i.test(html.charAt(i + 2));
  if (!html.startsWith('<!', i)) return false;
  if (html.startsWith('<!--', i)) return false;
  return !/^<!doctype/i.test(html.slice(i, i + 9));
}

export function prependAfterDoctype(html: string, payload: string): string {
  // A leading U+FEFF is the encoding signature, and it only counts at byte
  // zero. Putting anything in front of it demotes it to an ordinary character
  // token, which in turn puts a character before the doctype — so the doctype
  // stops applying and the document silently drops to quirks mode. The BOM
  // therefore stays put, and every offset here is measured after it.
  const bom = html.charCodeAt(0) === 0xfeff ? 1 : 0;
  const atTop = (): string => html.slice(0, bom) + payload + html.slice(bom);
  // Whitespace and comments may legally precede the doctype without changing
  // the document's mode, so the payload has to go behind them. "Comment" here
  // is every token the tokenizer turns into one, not just `<!-- … -->`: an XML
  // prologue (`<?xml … ?>`), a stray `<!foo>` and a `</1>` are all bogus
  // comments, and a document that opens with one still reaches its doctype in
  // no-quirks mode. Stopping at only the `<!--` spelling put the payload in
  // front of those, which puts a character token before the doctype and drops
  // the document to quirks — a silent change to the artifact's box model.
  //
  // Real comments still go through `endOfComment`, since `--!>` and the abrupt
  // forms close one just as well as `-->`; bogus comments end at the first `>`.
  let i = bom;
  for (;;) {
    while (i < html.length && isHtmlWhitespace(html.charCodeAt(i))) i += 1;
    if (html.startsWith('<!--', i)) {
      const end = endOfComment(html, i);
      if (end < 0) return atTop();
      i = end;
      continue;
    }
    if (isBogusCommentStart(html, i)) {
      const end = html.indexOf('>', i + 2);
      if (end < 0) return atTop();
      i = end + 1;
      continue;
    }
    break;
  }
  if (!/^<!doctype/i.test(html.slice(i))) return atTop();
  const doctypeEnd = html.indexOf('>', i);
  if (doctypeEnd < 0) return atTop();
  return html.slice(0, doctypeEnd + 1) + payload + html.slice(doctypeEnd + 1);
}

/**
 * Offset just past the `>` of the first real `pattern` match — the insertion
 * point for content that belongs immediately inside that tag. -1 when the
 * document has no such tag.
 */
export function findRealTagEnd(html: string, pattern: RegExp): number {
  const start = findRealTagOffset(html, pattern);
  if (start < 0) return -1;
  const end = endOfTag(html, start);
  return end < 0 ? -1 : end + 1;
}

/**
 * Source range of the first real `<tag …>…</tag>` pair, or null.
 *
 * Both ends are located structurally: the open tag ends at `endOfTag`, so a `>`
 * inside a quoted attribute cannot cut it short, and the close is only accepted
 * when the name is followed by whitespace, `/`, or `>` — `</title-page>` inside
 * a title, or `</title>` sitting in an attribute value, is content.
 */
export function findRealElementRange(
  html: string,
  pattern: RegExp,
  tagName: string,
): { start: number; contentStart: number; contentEnd: number; end: number } | null {
  const start = findRealTagOffset(html, pattern);
  if (start < 0) return null;
  const openEnd = endOfTag(html, start);
  if (openEnd < 0) return null;
  // `asciiLower`, not `toLowerCase()`: the latter is not length-preserving
  // (U+0130 lowercases to two code units), and every offset taken from the
  // shadow is used against `html`.
  const contentEnd = findRawTextClose(asciiLower(html), tagName, openEnd + 1);
  if (contentEnd < 0) return null;
  const end = endOfTag(html, contentEnd);
  if (end < 0) return null;
  return { start, contentStart: openEnd + 1, contentEnd, end: end + 1 };
}

/** Tag-name-bounded patterns for the boundaries preview injection cares about. */
export const HTML_TAG_PATTERNS = {
  htmlOpen: /<html(?=[\t\n\f\r />])/i,
  headOpen: /<head(?=[\t\n\f\r />])/i,
  headClose: /<\/head(?=[\t\n\f\r >])/i,
  bodyOpen: /<body(?=[\t\n\f\r />])/i,
  bodyClose: /<\/body(?=[\t\n\f\r >])/i,
  baseOpen: /<base(?=[\t\n\f\r />])/i,
  titleOpen: /<title(?=[\t\n\f\r >])/i,
} as const;
