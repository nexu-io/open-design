import { splitOnOdCards, type OdCardSegment } from '@open-design/contracts';
import { computeSkipRanges, rangeContains, type Range } from '../../artifacts/markdown-context';

function markdownCodeRanges(text: string): Range[] {
  const { ranges, unclosedFenceStart } = computeSkipRanges(text);
  return unclosedFenceStart === null
    ? ranges : [...ranges, [unclosedFenceStart, text.length]];
}

/** Preserve Markdown code examples; decode real cards with the shared protocol parser. */
export function splitShellCards(text: string, live: boolean): OdCardSegment[] {
  let markdownStart = 0;
  let codeRanges = markdownCodeRanges(text);
  const result: OdCardSegment[] = [];
  const open = /<od-card(?=\s|>)[^>]*>/gi;
  let cursor = 0;
  let match: RegExpExecArray | null;

  function appendText(value: string): void {
    if (!value) return;
    const last = result.at(-1);
    if (last?.kind === 'text') last.text += value;
    else result.push({ kind: 'text', text: value });
  }

  while ((match = open.exec(text))) {
    if (rangeContains(codeRanges, match.index - markdownStart)) continue;
    const close = /<\/od-card>/gi;
    close.lastIndex = open.lastIndex;
    const end = close.exec(text);
    if (!end) {
      if (live) {
        appendText(text.slice(cursor, match.index));
        return result;
      }
      break;
    }
    appendText(text.slice(cursor, match.index));
    const raw = text.slice(match.index, close.lastIndex);
    // Only the opening marker is classified by Markdown context. A real card's
    // JSON can itself quote markup/backticks; its payload must remain opaque.
    const decoded = splitOnOdCards(raw);
    for (const segment of decoded) {
      if (segment.kind === 'text') appendText(segment.text);
      else result.push(segment);
    }
    cursor = close.lastIndex;
    open.lastIndex = cursor;
    if (decoded.some((segment) => segment.kind === 'card')) {
      // Cards separate Markdown renders. Their JSON must not open a code span
      // in the following prose; malformed card text keeps its existing context.
      markdownStart = cursor;
      codeRanges = markdownCodeRanges(text.slice(markdownStart));
    }
  }
  if (live) {
    const candidateStart = text.lastIndexOf('<');
    if (candidateStart >= cursor && !rangeContains(codeRanges, candidateStart - markdownStart)) {
      const candidate = text.slice(candidateStart).toLowerCase();
      const opener = '<od-card';
      const partialName = candidate.startsWith('<od-') && opener.startsWith(candidate);
      const partialAttributes = candidate.startsWith(opener)
        && /^\s[^<>]*$/.test(candidate.slice(opener.length));
      if (partialName || partialAttributes) {
        // A future delta can complete this card opener. Keep earlier prose
        // visible now; terminal rendering restores candidates that never close.
        appendText(text.slice(cursor, candidateStart));
        return result;
      }
    }
  }
  appendText(text.slice(cursor));
  return result;
}
