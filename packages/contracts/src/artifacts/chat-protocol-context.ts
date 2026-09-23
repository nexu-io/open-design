// Pure Markdown/protocol ownership shared by the web renderer and host detector.
// The Markdown delimiters match the existing chat renderer; this is not a new
// Markdown grammar. Form recognition is supplied by the existing form parser.
import { splitOnOdCards } from './od-card.js';

export type ChatProtocolRange = readonly [number, number];
// Opening fences may carry a language; closing fences are bare. Neither
// permits indentation. A trailing line without a newline is not a delimiter.
export const CHAT_PROTOCOL_FENCE_OPEN_RE = /^```(\w[\w+-]*)?\s*$/;
export const CHAT_PROTOCOL_FENCE_CLOSE_RE = /^```\s*$/;

/**
 * Headings/list rows have separate inline-code contexts in the chat renderer.
 * Horizontal rules are deliberately absent: inside an existing paragraph they
 * remain paragraph text, so inline backticks can pair across those rows.
 */
export function isChatProtocolStandaloneLine(line: string): boolean {
  return /^#{1,4}\s+/.test(line)
    || /^\s*[-*+]\s+/.test(line)
    || /^\s*\d+\.\s+/.test(line);
}

type LineKind = 'blank' | 'fence' | 'standalone' | 'paragraph';
/** Form grammar stays with its parser; this walker only owns nesting/order. */
type ReadFormPayload = (text: string, openStart: number) => ChatProtocolRange | null;
interface MarkdownLine {
  start: number;
  end: number;
  next: number;
  kind: LineKind;
  closesFence: boolean;
  nextBoundary: number;
  nextFenceClose: number;
}

function lineKind(line: string, hasNewline: boolean): LineKind {
  if (hasNewline && CHAT_PROTOCOL_FENCE_OPEN_RE.test(line)) return 'fence';
  if (/^\s*$/.test(line)) return 'blank';
  return isChatProtocolStandaloneLine(line) ? 'standalone' : 'paragraph';
}

/** Index line boundaries once; card payloads can then be jumped over safely. */
function markdownLines(text: string): MarkdownLine[] {
  const lines: MarkdownLine[] = [];
  let start = 0;
  while (start < text.length) {
    const eol = text.indexOf('\n', start);
    const end = eol < 0 ? text.length : eol;
    const line = text.slice(start, end);
    const next = eol < 0 ? end : end + 1;
    lines.push({
      start, end, next, kind: lineKind(line, eol >= 0),
      closesFence: eol >= 0 && CHAT_PROTOCOL_FENCE_CLOSE_RE.test(line),
      nextBoundary: text.length, nextFenceClose: text.length,
    });
    start = next;
  }
  let boundary = text.length;
  let fenceClose = text.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    line.nextBoundary = boundary;
    line.nextFenceClose = fenceClose;
    if (line.kind !== 'paragraph') boundary = line.start;
    if (line.closesFence) fenceClose = line.next;
  }
  return lines;
}

/**
 * Code and protocol payloads are data, never independent question/done markers.
 * Recognized cards/forms reset Markdown after their close: JSON field strings
 * cannot open code or cards in following prose. An unfinished card owns its
 * remaining payload until a later delta completes it.
 *
 * All indexes advance monotonically. In particular, a sequence of valid cards
 * does not rescan the entire remaining Markdown tail once per card.
 */
export function chatProtocolSkipRanges(text: string, readFormPayload: ReadFormPayload): ChatProtocolRange[] {
  const lines = markdownLines(text);
  const ticks = Array.from(text.matchAll(/`/g), (match) => match.index);
  const opens = Array.from(text.matchAll(/<od-card(?=\s|>)[^>]*>/gi), (match) => ({
    start: match.index, end: match.index + match[0].length,
  }));
  const closes = Array.from(text.matchAll(/<\/od-card>/gi), (match) => ({
    start: match.index, end: match.index + match[0].length,
  }));
  const forms = Array.from(text.matchAll(/<(?:question-form|ask-question)\b[^>]*>/gi), (match) => match.index);
  const result: ChatProtocolRange[] = [];
  let cursor = 0;
  let lineIndex = 0;
  let tickIndex = 0;
  let openIndex = 0;
  let closeIndex = 0;
  let formIndex = 0;
  while (cursor < text.length) {
    while (lines[lineIndex] && lines[lineIndex]!.next <= cursor) lineIndex++;
    const line = lines[lineIndex];
    if (!line) break;
    // A protocol block may end mid-line. Its suffix starts a fresh Markdown render,
    // while subsequent full-line boundaries remain usable from the index.
    const kind = cursor === line.start ? line.kind
      : lineKind(text.slice(cursor, line.end), line.next > line.end);
    if (kind === 'blank') {
      cursor = line.next;
      continue;
    }
    if (kind === 'fence') {
      result.push([cursor, line.nextFenceClose]);
      cursor = line.nextFenceClose;
      continue;
    }
    const blockEnd = kind === 'standalone' ? line.end : line.nextBoundary;
    let protocolEnded = false;
    while (cursor < blockEnd) {
      while (ticks[tickIndex] !== undefined && ticks[tickIndex]! < cursor) tickIndex++;
      while (opens[openIndex] && opens[openIndex]!.start < cursor) openIndex++;
      while (forms[formIndex] !== undefined && forms[formIndex]! < cursor) formIndex++;
      const tick = ticks[tickIndex] ?? text.length;
      const open = opens[openIndex];
      const openStart = open?.start ?? text.length;
      const formStart = forms[formIndex] ?? text.length;
      if (Math.min(tick, openStart, formStart) >= blockEnd) break;
      if (tick < openStart && tick < formStart) {
        const nextTick = ticks[tickIndex + 1] ?? text.length;
        // Same single-backtick grammar as INLINE_CODE_RE. Adjacent backticks
        // cannot form an empty span; the second may start a nonempty one.
        if (nextTick > tick + 1 && nextTick < blockEnd) {
          result.push([tick, nextTick + 1]);
          cursor = nextTick + 1;
        } else {
          cursor = tick + 1;
        }
        continue;
      }
      if (formStart < openStart) {
        formIndex++;
        const payload = readFormPayload(text, formStart);
        if (payload) {
          // Keep the real opener visible to form parsing / implicit done, but
          // its field strings cannot open cards or code in later siblings.
          result.push(payload);
          cursor = payload[1];
          protocolEnded = true;
          break;
        }
        cursor = formStart + 1;
        continue;
      }
      if (!open) break;
      openIndex++;
      while (closes[closeIndex] && closes[closeIndex]!.start < open.end) closeIndex++;
      const close = closes[closeIndex];
      const end = close?.end ?? text.length;
      const recognized = !close || splitOnOdCards(text.slice(open.start, end))
        .some((part) => part.kind === 'card');
      if (recognized) {
        result.push([open.start, end]);
        cursor = end;
        protocolEnded = true;
        break;
      }
      // Invalid card markup remains Markdown, including any backticks in its
      // attributes/body. Do not skip it or reset the paragraph boundary.
      cursor = open.start + 1;
    }
    if (!protocolEnded) cursor = blockEnd;
  }
  return result;
}

/** Equal-length search view only; the original text remains the rendered data. */
export function maskChatProtocolPayloads(text: string, readFormPayload: ReadFormPayload): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (const [start, end] of chatProtocolSkipRanges(text, readFormPayload)) {
    pieces.push(text.slice(cursor, start), ' '.repeat(end - start));
    cursor = end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join('');
}
