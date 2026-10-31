import {
  findQuestionFormCloseTag,
  QUESTION_FORM_OPEN_RE,
} from '../api/question-form-markup.js';
import { chatProtocolSkipRanges, type ChatProtocolRange } from './chat-protocol-context.js';

function readFormJson(body: string): unknown {
  const trimmed = body.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/i.exec(trimmed);
  const value: unknown = JSON.parse(fenced?.[1] ?? trimmed, (_key, item: unknown) => {
    // A history formatter must not round identifiers or turn an exponent into
    // Infinity. An unsupported representation falls back to the original form.
    if (typeof item === 'number' && (!Number.isFinite(item)
      || (Number.isInteger(item) && !Number.isSafeInteger(item)))) {
      throw new Error('Preserve the original numeric representation');
    }
    return item;
  });
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { questions?: unknown }).questions)) {
    return value;
  }
  throw new Error('Not a JSON question form');
}

/** Preserve every field as ordinary historical text, including unfamiliar ones. */
function describeFields(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    return value.length
      ? value.map((item, index) => `${indent}Item ${index + 1}:\n${describeFields(item, `${indent}  `)}`).join('\n')
      : `${indent}(empty list)`;
  }
  if (value && typeof value === 'object') {
    const fields = Object.entries(value);
    return fields.length
      ? fields.map(([key, item]) => `${indent}${key}:\n${describeFields(item, `${indent}  `)}`).join('\n')
      : `${indent}(empty object)`;
  }
  return `${indent}${String(value)}`;
}

function readFormPayload(text: string, start: number): ChatProtocolRange | null {
  const open = QUESTION_FORM_OPEN_RE.exec(text.slice(start));
  if (!open || open.index !== 0) return null;
  const end = start + open[0].length;
  const closeTag = `</${open[1]!.toLowerCase()}>`;
  const close = findQuestionFormCloseTag(text, end, closeTag);
  if (close < 0) return null;
  try {
    readFormJson(text.slice(end, close));
    return [end, close + closeTag.length];
  } catch {
    return null;
  }
}

function contains(ranges: readonly ChatProtocolRange[], position: number): boolean {
  return ranges.some(([start, end]) => position >= start && position < end);
}

/** Treat an unfamiliar JSON body as opaque, including tag examples in strings. */
function opaqueFormEnd(text: string, start: number, closeTag: string): number {
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (escaped) {
      escaped = false;
    } else if (quoted && character === '\\') {
      escaped = true;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && text.slice(index, index + closeTag.length).toLowerCase() === closeTag) {
      return index + closeTag.length;
    }
  }
  return text.length;
}

/** Unpersisted artifact bodies remain the only copy; do not rewrite their contents. */
function artifactPayloadRanges(text: string, protectedRanges: readonly ChatProtocolRange[]): ChatProtocolRange[] {
  const ranges: ChatProtocolRange[] = [];
  const opens = /<artifact(?=\s)[^>]*>/gi;
  let open: RegExpExecArray | null;
  while ((open = opens.exec(text))) {
    if (contains(protectedRanges, open.index)) continue;
    const bodyStart = open.index + open[0].length;
    const close = findQuestionFormCloseTag(text, bodyStart, '</artifact>');
    const end = close < 0 ? text.length : close + '</artifact>'.length;
    ranges.push([open.index, end]);
    opens.lastIndex = end;
  }
  return ranges;
}

/**
 * Represent old assistant forms as historical information rather than reusable
 * UI templates. This does not infer whether the user answered, interpret their
 * answers, constrain future questions, or validate newly generated output.
 * Unrecognized forms and code examples remain intact. User messages never call
 * this helper; their answers, skips and later changes retain their original text.
 */
export function summarizeHistoricalQuestionForms(content: string): string {
  const protectedRanges = chatProtocolSkipRanges(content, readFormPayload);
  const ranges = [...protectedRanges, ...artifactPayloadRanges(content, protectedRanges)];
  let result = '';
  let cursor = 0;
  let searchFrom = 0;
  while (searchFrom < content.length) {
    const open = QUESTION_FORM_OPEN_RE.exec(content.slice(searchFrom));
    if (!open) break;
    const start = searchFrom + open.index;
    const bodyStart = start + open[0].length;
    if (contains(ranges, start)) {
      searchFrom = bodyStart;
      continue;
    }
    const closeTag = `</${open[1]!.toLowerCase()}>`;
    const close = findQuestionFormCloseTag(content, bodyStart, closeTag);
    if (close < 0) {
      break;
    }
    try {
      const fields = describeFields(readFormJson(content.slice(bodyStart, close)));
      const attributes = open[0].replace(/^<(question-form|ask-question)\b/i, '').slice(0, -1).trim();
      result += content.slice(cursor, start)
        + '[Previous assistant question form — historical context]\n'
        + (attributes ? `Form attributes: ${attributes}\n` : '')
        + fields + '\n[End previous assistant question form]';
      cursor = close + closeTag.length;
      searchFrom = cursor;
    } catch {
      // Formatting is best effort. Preserve the original text on any failure.
      searchFrom = opaqueFormEnd(content, bodyStart, closeTag);
    }
  }
  return result + content.slice(cursor);
}
