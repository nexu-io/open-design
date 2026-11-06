import { readCoveredInlineStyleChars } from "./inlineTextStyleRange";

/**
 * What the range is styled with, for a toolbar that has to open showing the
 * truth rather than a default. Reports a property only when the whole range
 * agrees about it, which is what a control can honestly display.
 */
export function readInlineStyle(range: Range, properties: string[]): Record<string, string> {
  const chars = readCoveredInlineStyleChars(range);
  if (!chars) return {};

  const styles: Record<string, string> = {};
  for (const property of properties) {
    const first: string | undefined = chars[0]?.style[property];
    if (first === undefined) continue;
    if (chars.every(({ style }) => style[property] === first)) styles[property] = first;
  }
  return styles;
}

/**
 * The distinct values one property takes across the range, in document order:
 * `["red", "lime"]`.
 *
 * `readInlineStyle` above answers "what is this range" and reports nothing when
 * the range disagrees with itself — right for a toggle, which can only be on or
 * off. A swatch can show more than one value at once, and showing the default
 * instead reads as "this text is white" when none of it is.
 */
export function readInlineStyleSpread(range: Range, property: string): string[] {
  const covered = readCoveredInlineStyleChars(range);
  if (!covered) return [];
  const seen = new Set<string>();
  const spread: string[] = [];
  for (const { char, style } of covered) {
    // A space paints nothing, so the colour it inherits is not a colour anyone
    // can see. Counting it puts the element's own colour in the swatch for text
    // that shows none of it — the stray band on a selection that happens to
    // start or end next to a space.
    if (!char.trim()) continue;
    const value = style[property];
    if (value === undefined || seen.has(value)) continue;
    seen.add(value);
    spread.push(value);
  }
  return spread;
}

export function readFirstPaintedElement(range: Range, property: string): Element | null {
  const covered = readCoveredInlineStyleChars(range);
  if (!covered) return null;
  const painted = covered.filter(({ char }) => char.trim());
  const owner =
    painted.find(({ style }) => style[property] !== undefined) ?? painted[0] ?? covered[0];
  return owner?.painter ?? null;
}
