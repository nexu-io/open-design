import { splitOnOdCards } from '@open-design/contracts';
import { computeSkipRanges, rangeContains, type Range } from './markdown-context';

/**
 * Code and card payloads are data, never independent question/done markers.
 * A recognized card resets Markdown context after its close: backticks inside
 * JSON cannot open a code span in the following prose. An unfinished card owns
 * its remaining payload until a later delta completes it.
 */
export function chatProtocolSkipRanges(text: string): Range[] {
  const result: Range[] = [];
  let start = 0;
  while (start < text.length) {
    const tail = text.slice(start);
    const { ranges, unclosedFenceStart } = computeSkipRanges(tail);
    const code = unclosedFenceStart === null ? ranges : [...ranges, [unclosedFenceStart, tail.length] as const];
    const open = /<od-card(?=\s|>)[^>]*>/gi;
    let matched = false;
    let candidate: RegExpExecArray | null;
    while ((candidate = open.exec(tail))) {
      if (rangeContains(code, candidate.index)) continue;
      const close = /<\/od-card>/gi;
      close.lastIndex = open.lastIndex;
      const closing = close.exec(tail);
      const end = closing ? close.lastIndex : tail.length;
      if (closing && !splitOnOdCards(tail.slice(candidate.index, end)).some((part) => part.kind === 'card')) continue;
      for (const [from, to] of code) {
        if (from < candidate.index) result.push([start + from, start + Math.min(to, candidate.index)]);
      }
      result.push([start + candidate.index, start + end]);
      start += end;
      matched = true;
      break;
    }
    if (matched) continue;
    result.push(...code.map(([from, to]): Range => [start + from, start + to]));
    break;
  }
  return result;
}

/** Equal-length search view only; the original text remains the rendered data. */
export function maskChatProtocolPayloads(text: string): string {
  const ranges = chatProtocolSkipRanges(text).sort(([a], [b]) => a - b);
  let cursor = 0;
  let masked = '';
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    masked += text.slice(cursor, Math.max(cursor, start));
    masked += ' '.repeat(end - Math.max(cursor, start));
    cursor = end;
  }
  return masked + text.slice(cursor);
}
