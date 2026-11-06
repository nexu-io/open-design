export function mount(html: string): HTMLElement {
  document.body.innerHTML = `<h1>${html}</h1>`;
  return document.body.firstElementChild as HTMLElement;
}

/** A range over the host's text, by character offsets across the whole element. */
/** Every text node and line break in order, with the offset each one starts at. */
function charSpans(host: HTMLElement): Array<{ node: Node; from: number; length: number }> {
  const spans: Array<{ node: Node; from: number; length: number }> = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let seen = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const isBreak = node.nodeType === 1 && (node as Element).tagName === "BR";
    if (node.nodeType === 1 && !isBreak) continue;
    const length = isBreak ? 1 : (node.textContent?.length ?? 0);
    spans.push({ node, from: seen, length });
    seen += length;
  }
  return spans;
}

/**
 * A range over the host's text, by character offsets across the whole element.
 *
 * A line break counts as one character, the same way the module does, but is
 * never landed on: a boundary there belongs to the text beside it, which is
 * where a real selection would put it too.
 */
export function rangeOver(host: HTMLElement, start: number, end: number): Range {
  const range = document.createRange();
  const text = charSpans(host).filter((span) => span.node.nodeType === 3);
  const at = (offset: number) => text.find((span) => span.from + span.length >= offset);
  const from = at(start);
  const to = at(end);
  if (from) range.setStart(from.node, start - from.from);
  if (from && to) range.setEnd(to.node, end - to.from);
  return range;
}
