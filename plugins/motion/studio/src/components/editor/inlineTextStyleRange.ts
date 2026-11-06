/**
 * Styling a run of characters inside an element being edited in place.
 *
 * Not `document.execCommand`. That is deprecated, and what it emits varies by
 * browser between `<font>`, a class, and an inline style depending on
 * `styleWithCSS`. The output of this goes into the user's composition file, so
 * it has to be one predictable shape, and the shape is a `<span>` carrying an
 * inline style.
 *
 * Not DOM range surgery either, which is the obvious way and the wrong one.
 * Wrapping a range in a span is three lines and then every interesting case is
 * a special case: recolouring nests spans that shadow each other, removing a
 * style cannot reach the ancestor that set it, and styling across an existing
 * run's boundary has to split it. Each fix is a new branch and the branches
 * interact.
 *
 * So the element is read into a flat list of styled runs, the styling is
 * applied to a span of characters in that list, and the element is rebuilt
 * from it. Replacing, removing, splitting and merging all stop being cases:
 * the rebuild emits one span per distinct run and cannot nest or duplicate,
 * whatever was there before. Text elements in a composition are a headline or
 * a sentence, so reading and rebuilding one is not a cost worth avoiding.
 */

import {
  isRichTextFormattingAttribute,
  isRichTextFormattingStyle,
  isRichTextFormattingTag,
} from "@hyperframes/core/rich-text-sanitize";

/** One stretch of characters that are all styled the same way. */
interface StyledRun {
  text: string;
  style: Record<string, string>;
  /**
   * The child element these characters came out of, when they came out of one.
   *
   * Carried because an element's children are not always anonymous formatting:
   * the design panel keeps them as text layers and tracks each by an attribute
   * on it. Rebuilding from style alone emitted fresh, bare spans, which threw
   * that identity away — after colouring a single word the panel could no
   * longer match a layer to its source, so every edit it offered failed to
   * save. The rebuild puts the identity back on the run that still holds it.
   */
  origin: Element | null;
  /**
   * That identity as a value, so two runs can be compared without comparing
   * the nodes they came from. A child with nothing on it but a style has no
   * identity to lose, and merges with its neighbour exactly as before.
   */
  identity: string;
  painter?: Element | null;
}

export type InlineStyleDelta = Record<string, string | null>;

/**
 * Tags that mean a style. They are read as styling and written back as spans,
 * so there is one representation to reason about instead of two that have to
 * agree. Rendering is unchanged; the markup for an edited element is not.
 */
const TAG_STYLES: Record<string, Record<string, string>> = {
  B: { "font-weight": "700" },
  STRONG: { "font-weight": "700" },
  I: { "font-style": "italic" },
  EM: { "font-style": "italic" },
  U: { "text-decoration-line": "underline" },
};

/**
 * Stands in for a `<br>` while the element is a flat string, so a break counts
 * as one character and offsets survive the rebuild.
 *
 * Not a newline. Compositions are written across lines, so an element's text
 * routinely contains real newlines that are only source formatting, and using
 * one as the marker turned every one of them into a visible line break the
 * first time a word was styled. A NUL never appears: the HTML parser replaces
 * it with U+FFFD, so no document can contain one.
 */
const BREAK = "\u0000";

/** Apply `style` to the characters the range covers, then rebuild the element. */
export function applyInlineStyle(range: Range, style: InlineStyleDelta): void {
  if (range.collapsed) return;
  // Resolved from where the selection starts, not from where it and its end
  // happen to meet. A selection dragged past the element's edge meets its end
  // at an ancestor, and taking that as the host would rebuild the ancestor:
  // every sibling element inside it flattened into text by an edit that was
  // meant to colour a word.
  const host = editingHost(range.startContainer);
  if (!host || !holdsBothEnds(host, range)) return;

  const runs = readRuns(host);
  const span = graphemeBounds(
    runs,
    offsetOf(host, range.startContainer, range.startOffset),
    offsetOf(host, range.endContainer, range.endOffset),
  );
  if (!span) return;

  const next = restyle(runs, span.start, span.end, style);
  render(host, next);
  reconcileFillColors(host);
  selectRange(host, span.start, span.end);
}

/**
 * Whether something above the run is painting the glyphs a different colour.
 *
 * `-webkit-text-fill-color` inherits and paints the glyph fill, so an ancestor
 * that sets it wins over any `color` a descendant sets. A composition doing so
 * is not doing anything wrong, but from the editor it reads as the colour
 * picker being broken: the run is saved with the colour asked for and renders
 * in someone else's.
 *
 * Asked of the rendered span rather than worked out from the stylesheet. Its
 * own `color` is set, so its computed colour IS the one that was asked for, and
 * if the fill differs from it then something else is painting it. Both sides
 * come from the same computed style, so neither notation nor inheritance has to
 * be untangled by hand.
 */
function reconcileFillColors(host: Element): void {
  const view = host.ownerDocument.defaultView;
  if (!view?.getComputedStyle) return;
  for (const span of host.querySelectorAll<HTMLElement>("span")) {
    if (!span.style.color) continue;
    // A generated mirror repeats the run's colour. Remove that before asking
    // what would paint the run without it; an authored, different fill stays
    // in place long enough to be detected as the overpaint it is.
    const existingFill = span.style.getPropertyValue("-webkit-text-fill-color");
    if (existingFill === span.style.color) {
      span.style.removeProperty("-webkit-text-fill-color");
    }
    const computed = view.getComputedStyle(span) as CSSStyleDeclaration & {
      webkitTextFillColor?: string;
    };
    const fill = computed.webkitTextFillColor;
    if (!fill || !computed.color) continue;
    if (fill !== computed.color) {
      span.style.setProperty("-webkit-text-fill-color", span.style.color);
    }
  }
}

/**
 * The offsets to style, widened so they never fall inside a character.
 *
 * Selection offsets count UTF-16 units, while one visible character can be a
 * surrogate pair, combining sequence, flag, modifier sequence, or a family
 * joined by zero-width joiners. Splitting any of those across spans corrupts
 * what the user selected even when every individual code point remains valid.
 */
function graphemeBounds(
  runs: StyledRun[],
  start: number | null,
  end: number | null,
): { start: number; end: number } | null {
  if (start === null || end === null || start >= end) return null;
  const text = runs.map((run) => run.text).join("");
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const boundaries = [0, ...Array.from(segmenter.segment(text), atEndOfSegment)];
  return {
    start: boundaryAtOrBefore(boundaries, start),
    end: boundaries.find((boundary) => boundary >= end) ?? end,
  };
}

function atEndOfSegment({ index, segment }: Intl.SegmentData): number {
  return index + segment.length;
}

function boundaryAtOrBefore(boundaries: number[], offset: number): number {
  let previous = offset;
  for (const boundary of boundaries) {
    if (boundary > offset) return previous;
    previous = boundary;
  }
  return previous;
}

/** Whether the whole selection lives inside this element. */
function holdsBothEnds(host: Element, range: Range): boolean {
  return host.contains(range.startContainer) && host.contains(range.endContainer);
}

export interface InlineStyleChar {
  char: string;
  style: Readonly<Record<string, string>>;
  painter: Element | null;
}

/** Every character the range covers with its style, or null when it covers none. */
export function readCoveredInlineStyleChars(range: Range): readonly InlineStyleChar[] | null {
  const host = editingHost(range.startContainer);
  if (!host || !holdsBothEnds(host, range)) return null;
  const start = offsetOf(host, range.startContainer, range.startOffset);
  const end = offsetOf(host, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;
  const collapsed = start === end;
  const covered = charRuns(readRuns(host))
    .slice(collapsed ? Math.max(0, start - 1) : start, collapsed ? Math.max(1, start) : end)
    .map((entry) => ({ char: entry.char, style: entry.style, painter: entry.painter ?? null }));
  return covered.length > 0 ? covered : null;
}

/**
 * The element the caret is in: the one made editable, never a span inside it.
 *
 * Reading the nearest element instead would rebuild only the run the caret
 * happened to land in, which is how a recolour ends up nested inside the
 * colour it was meant to replace.
 */
function editingHost(node: Node): HTMLElement | null {
  let element = (node.nodeType === 1 ? node : node.parentElement) as HTMLElement | null;
  const editable = element?.closest<HTMLElement>("[contenteditable]");
  if (editable) {
    return editable.getAttribute("contenteditable")?.toLowerCase() === "false" ? null : editable;
  }
  // No open edit, so climb out of the formatting to the element that owns it.
  while (element?.parentElement && isRichTextFormattingTag(element.tagName)) {
    element = element.parentElement;
  }
  return element;
}

/** Read the element as a flat list of runs, in document order. */
interface RunWalkFrame {
  node: Node;
  inherited: Record<string, string>;
  origin: Element | null;
}

function readRuns(host: Element): StyledRun[] {
  const runs: StyledRun[] = [];
  const pending: RunWalkFrame[] = Array.from(
    host.childNodes,
    (node): RunWalkFrame => ({ node, inherited: {}, origin: null }),
  ).reverse();
  for (let frame = pending.pop(); frame; frame = pending.pop()) {
    pending.push(...visitRunFrame(frame, runs));
  }
  return runs;
}

function visitRunFrame(frame: RunWalkFrame, runs: StyledRun[]): RunWalkFrame[] {
  const { node, inherited, origin } = frame;
  if (node.nodeType === 3) {
    const text = node.textContent ?? "";
    if (text) runs.push({ ...styledRun(text, inherited, origin), painter: node.parentElement });
    return [];
  }
  if (!isStyleElement(node)) return [];
  const element = node;
  if (element.tagName === "BR") {
    runs.push(styledRun(BREAK, inherited, origin));
    return [];
  }
  return childRunFrames(element, inherited, origin);
}

function isStyleElement(node: Node): node is HTMLElement {
  return node.nodeType === 1 && "style" in node;
}

function styledRun(text: string, style: Record<string, string>, origin: Element | null): StyledRun {
  return { text, style, origin, identity: identityOf(origin) };
}

function childRunFrames(
  element: HTMLElement,
  inherited: Record<string, string>,
  origin: Element | null,
): RunWalkFrame[] {
  const formatting = isRichTextFormattingTag(element.tagName);
  const nextInherited = formatting
    ? { ...inherited, ...TAG_STYLES[element.tagName], ...ownStyle(element) }
    : inherited;
  // The outermost formatting child that carries anything is the one the panel
  // knows as a layer. Tags the sanitizer unwraps cannot own a layer.
  const nextOrigin =
    formatting && !origin && preservedAttributes(element).size > 0 ? element : origin;
  return Array.from(
    element.childNodes,
    (node): RunWalkFrame => ({ node, inherited: nextInherited, origin: nextOrigin }),
  ).reverse();
}

/** A child's identity as a comparable string, empty when it has none. */
function identityOf(element: Element | null): string {
  if (!element) return "";
  return JSON.stringify([...preservedAttributes(element)].sort(([a], [b]) => (a < b ? -1 : 1)));
}

function ownStyle(element: HTMLElement): Record<string, string> {
  const style: Record<string, string> = {};
  for (let index = 0; index < element.style.length; index += 1) {
    const property = element.style.item(index);
    if (!property) continue;
    const value = element.style.getPropertyValue(property);
    if (isRichTextFormattingStyle(property, value)) style[property] = value;
  }
  return style;
}

/** One entry per character, which is the easiest thing to slice and compare. */
function charRuns(runs: StyledRun[]): Array<Omit<StyledRun, "text"> & { char: string }> {
  const perChar: Array<Omit<StyledRun, "text"> & { char: string }> = [];
  for (const run of runs) {
    // By UTF-16 unit, not code point: `restyle` indexes this list with selection
    // offsets, which count units, so an emoji has to stay two entries long.
    for (let index = 0; index < run.text.length; index += 1) {
      perChar.push({
        char: run.text[index] ?? "",
        style: run.style,
        origin: run.origin,
        identity: run.identity,
        painter: run.painter,
      });
    }
  }
  return perChar;
}

/** Apply the delta to `[start, end)` and hand back runs covering the element. */
function restyle(
  runs: StyledRun[],
  start: number,
  end: number,
  delta: InlineStyleDelta,
): StyledRun[] {
  const text = runs.map((run) => run.text).join("");
  const perChar = charRuns(runs);
  const next: StyledRun[] = [];
  // Indexed by UTF-16 unit, not by code point: `perChar`, `start` and `end` all
  // count units, and spreading the string would count a surrogate pair once and
  // slide every index after an emoji.
  for (let index = 0; index < text.length; index += 1) {
    appendChar(
      next,
      text[index] ?? "",
      charAfter(perChar[index], index >= start && index < end, delta),
    );
  }
  return next;
}

/** What one character is styled with once the delta has been applied to it. */
function charAfter(
  at: Omit<StyledRun, "text"> | undefined,
  inside: boolean,
  delta: InlineStyleDelta,
): Omit<StyledRun, "text"> {
  const style = at?.style ?? {};
  return {
    style: inside ? withDelta(style, delta) : style,
    origin: at?.origin ?? null,
    identity: at?.identity ?? "",
  };
}

/**
 * One character onto the run list, merged into the run before it when they
 * belong together.
 *
 * Merged as it is built, so equal neighbours never become two spans. Two that
 * the design panel tracks as separate layers stay apart even when they now look
 * identical, because merging them deletes one of them.
 */
function appendChar(runs: StyledRun[], char: string, at: Omit<StyledRun, "text">): void {
  const last = runs[runs.length - 1];
  if (last && last.identity === at.identity && sameStyle(last.style, at.style)) {
    last.text += char;
    return;
  }
  runs.push({ text: char, ...at });
}

function withDelta(style: Record<string, string>, delta: InlineStyleDelta): Record<string, string> {
  const next = { ...style };
  for (const [property, value] of Object.entries(delta)) {
    if (value === null) delete next[property];
    else next[property] = value;
  }
  return next;
}

function sameStyle(a: Record<string, string>, b: Record<string, string>): boolean {
  return styleKey(a) === styleKey(b);
}

/** Sorted, so two runs styled the same way compare equal whatever the order. */
function styleKey(style: Record<string, string>): string {
  return Object.keys(style)
    .sort()
    .map((property) => `${property}: ${style[property]}`)
    .join("; ");
}

/** Rebuild the element: bare text where there is no styling, one span where there is. */
function render(host: Element, runs: StyledRun[]): void {
  const doc = host.ownerDocument;
  const nodes = runNodes(doc, runs);
  host.replaceChildren();
  if (nodes.length > 1 && laysOutItsChildren(host)) {
    // Wrapped, because in a flex or grid container every child is an item to
    // be laid out. Text that was one anonymous item becomes several boxes the
    // moment a word inside it is coloured, and the element visibly reflows:
    // centring, wrapping and order all change under an edit that was only ever
    // meant to change a colour. One wrapper keeps it a single item, and the
    // runs inside it stay inline text.
    const wrapper = doc.createElement("span");
    wrapper.append(...nodes);
    host.append(wrapper);
    return;
  }
  host.append(...nodes);
}

function runNodes(doc: Document, runs: StyledRun[]): Node[] {
  const nodes: Node[] = [];
  // One span per origin keeps its attributes: an identity that appeared twice
  // would be two layers claiming to be the same one. A run split off from an
  // origin is a new layer and is written as one.
  const claimed = new Set<Element>();
  for (const run of runs) {
    const carried =
      run.origin && !claimed.has(run.origin) ? preservedAttributes(run.origin) : new Map();
    if (carried.size > 0 && run.origin) claimed.add(run.origin);
    nodes.push(...runNode(doc, run, carried));
  }
  return nodes;
}

/**
 * One run's nodes: its line breaks as `<br>`, and its text as bare text when it
 * has nothing to carry or a span when it has. The identity goes on the first
 * piece only, so a run broken across lines does not claim it twice.
 */
function runNode(doc: Document, run: StyledRun, carried: Map<string, string>): Node[] {
  const key = styleKey(run.style);
  const nodes: Node[] = [];
  for (const [index, piece] of run.text.split(BREAK).entries()) {
    if (index > 0) nodes.push(doc.createElement("br"));
    if (!piece) continue;
    if (!key && carried.size === 0) {
      nodes.push(doc.createTextNode(piece));
      continue;
    }
    const span = doc.createElement("span");
    for (const [name, value] of carried) span.setAttribute(name, value);
    if (key) span.setAttribute("style", key);
    span.textContent = piece;
    nodes.push(span);
    carried.clear();
  }
  return nodes;
}

/**
 * The one attribute the writer assigns rather than the author.
 *
 * Left out on purpose. It is stamped onto every element on the way to disk, so
 * carrying it preserves nothing — and it made the wrapper this rebuild adds
 * inside a flex container look like a layer as soon as the file had been saved
 * once, which put it back to shadowing the real layers underneath it.
 */
const DERIVED_ATTR = "data-hf-id";

/**
 * What a child carries besides its styling: the identity the design panel
 * tracks it by. Its style is not copied — that is what the run holds, already
 * merged with whatever the edit changed.
 */
function preservedAttributes(element: Element): Map<string, string> {
  const kept = new Map<string, string>();
  for (const name of element.getAttributeNames()) {
    if (name === "style" || name === DERIVED_ATTR) continue;
    const value = element.getAttribute(name) ?? "";
    if (isRichTextFormattingAttribute(name, value)) kept.set(name, value);
  }
  return kept;
}

/** Displays whose children are boxes it positions, rather than text it flows. */
const LAYS_OUT_CHILDREN = new Set([
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  // How line clamping is written, and it boxes its children like flex.
  "-webkit-box",
  "-webkit-inline-box",
]);

function laysOutItsChildren(host: Element): boolean {
  const view = host.ownerDocument.defaultView;
  if (!view) return false;
  return LAYS_OUT_CHILDREN.has(view.getComputedStyle(host).display);
}

/** Where a DOM position falls, counted in characters from the element's start. */
function offsetOf(host: Element, container: Node, containerOffset: number): number | null {
  // A position between children, expressed as a child index.
  if (container === host) {
    return Array.from(host.childNodes)
      .slice(0, containerOffset)
      .reduce((count, child) => count + subtreeCharLength(child), 0);
  }
  let count = 0;
  const walker = host.ownerDocument.createTreeWalker(
    host,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node === container) return count + containerOffset;
    count += charLength(node);
    node = walker.nextNode();
  }
  return null;
}

/** How many character positions a node occupies itself: its own text, or one
 *  for a break. An element contributes nothing; the walk visits its text. */
function charLength(node: Node): number {
  if (node.nodeType === 3) return (node.textContent ?? "").length;
  return nodeName(node) === "BR" ? 1 : 0;
}

/** The same count for a child and everything inside it, for a position given as
 *  a child index rather than a place in a text node. */
function subtreeCharLength(node: Node): number {
  let count = 0;
  const pending = [node];
  for (let current = pending.pop(); current; current = pending.pop()) {
    count += charLength(current);
    pending.push(...Array.from(current.childNodes));
  }
  return count;
}

function nodeName(node: Node): string {
  return node.nodeType === 1 ? (node as Element).tagName : "";
}

/** Put the selection back over the characters that were just styled. */
function selectRange(host: Element, start: number, end: number): void {
  const doc = host.ownerDocument;
  const selection = doc.defaultView?.getSelection();
  const from = positionAt(host, start);
  const to = positionAt(host, end);
  if (!selection || !from || !to) return;
  const range = doc.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * The DOM position a character offset lands on, after a rebuild.
 *
 * Counts a line break as one position, because everything that produced the
 * offset did. This walked text nodes only, so in an element containing a `<br>`
 * it landed one character early for every break before the offset — and the
 * selection it put back was not the one that had just been styled.
 *
 * Which was invisible until a control fired more than once. The colour input
 * does: a native picker reports every sample while the pointer moves in it, and
 * each one restyled a selection that had walked one character further along
 * than the last. Choosing a colour for three characters painted a different
 * shade onto each character of the whole line.
 */
function positionAt(host: Element, offset: number): { node: Node; offset: number } | null {
  let count = 0;
  const walker = host.ownerDocument.createTreeWalker(
    host,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );
  let node = walker.nextNode();
  let last: Node | null = null;
  while (node) {
    if (node.nodeType !== 3) {
      if (nodeName(node) === "BR") count += 1;
      node = walker.nextNode();
      continue;
    }
    const length = (node.textContent ?? "").length;
    if (count + length >= offset) return { node, offset: offset - count };
    count += length;
    last = node;
    node = walker.nextNode();
  }
  if (last) return { node: last, offset: (last.textContent ?? "").length };
  return { node: host, offset: 0 };
}
