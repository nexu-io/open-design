/**
 * Streaming parser for <artifact identifier="..." type="..." title="...">...</artifact>
 * tags. Simplified from packages/artifacts/src/parser.ts in the reference
 * repo: handles one artifact at a time, ignores nesting.
 *
 * Feed deltas in, iterate events. Every event type here has a direct
 * counterpart in the reference parser — the shape is intentionally preserved
 * so you can upgrade later without rewriting consumers.
 */

export type ArtifactEvent =
  | { type: 'text'; delta: string }
  | { type: 'artifact:start'; identifier: string; artifactType: string; title: string }
  | { type: 'artifact:chunk'; identifier: string; delta: string }
  | { type: 'artifact:end'; identifier: string; fullContent: string };

const OPEN_PREFIX = '<artifact';
const CLOSE_TAG = '</artifact>';

interface ParserState {
  inside: boolean;
  buffer: string;
  identifier: string;
  artifactType: string;
  title: string;
  content: string;
}

function parseAttrs(raw: string): Record<string, string> {
  const re = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null = re.exec(raw);
  while (m !== null) {
    out[m[1] as string] = (m[2] ?? m[3] ?? '') as string;
    m = re.exec(raw);
  }
  return out;
}

type OpenTagMatch =
  | { kind: 'complete'; start: number; end: number; attrs: string }
  | { kind: 'partial'; start: number }
  | { kind: 'none' };

import { computeSkipRanges, FENCE_OPEN_RE, isRealArtifactOpenAt, rangeContains } from './markdown-context';

// Scan the buffer for `<artifact …>` while skipping any positions that the
// chat markdown renderer would render as a fenced code block or inline code
// span — see ./markdown-context.ts for the shared classification used by both
// the streaming parser and the post-stream `<artifact>` stripper.
//
// Streaming caveats handled here on top of the shared ranges:
//   * Open fence with no close yet → hold back from its opening line.
//   * Unterminated tail line that could still resolve into a fence delimiter
//     (e.g. "```", "```ht") → hold back from the line start.
//   * Unmatched opening backtick after the last \n → hold back from it; a
//     future chunk may turn it into an inline code span.
function findOpenTag(buffer: string): OpenTagMatch {
  const len = buffer.length;
  const { ranges, unclosedFenceStart } = computeSkipRanges(buffer);

  // Pass 1: scan for the earliest *complete* real `<artifact …>` open outside
  // any skip range. Done before any hold-back decision, otherwise a stray
  // backtick or fence-opener prefix on a tail line would suppress an already
  // self-contained artifact earlier in the buffer.
  let earliestPartialOpen = -1;
  let from = 0;
  while (from < len) {
    const idx = buffer.indexOf(OPEN_PREFIX, from);
    if (idx === -1) break;
    if (rangeContains(ranges, idx)) {
      from = idx + OPEN_PREFIX.length;
      continue;
    }
    if (unclosedFenceStart !== null && idx >= unclosedFenceStart) {
      // Anything past an unclosed fence opener is inside a code block that
      // will close in a later chunk (or at end-of-buffer for the stripper);
      // treat as skip range, not a real tag.
      break;
    }
    const after = idx + OPEN_PREFIX.length;
    const next = buffer.charAt(after);
    if (next === '') {
      // `<artifact` at very end of buffer — could become real with the next
      // chunk. Remember the earliest one and keep looking for a complete tag.
      if (earliestPartialOpen === -1) earliestPartialOpen = idx;
      break;
    }
    if (!isRealArtifactOpenAt(buffer, idx)) {
      // Not a real <artifact ...> open (e.g. "<artifactual"). Keep scanning.
      from = after;
      continue;
    }
    let j = after;
    let quote: '"' | "'" | null = null;
    while (j < len) {
      const c = buffer.charAt(j);
      if (quote !== null) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        return { kind: 'complete', start: idx, end: j + 1, attrs: buffer.slice(after, j) };
      }
      j++;
    }
    // Ran out of buffer before the closing `>` arrived — this is an open tag
    // mid-stream. Remember and stop scanning (any later `<artifact` would be
    // a second tag we'd reach next chunk).
    if (earliestPartialOpen === -1) earliestPartialOpen = idx;
    break;
  }

  // Pass 2: no complete open found. Decide whether to hold back, and if so,
  // from which position. Earliest hold-back wins so the text-flush boundary
  // never crosses something that might still resolve into a tag/fence/span.
  let holdback = -1;
  const note = (pos: number | null) => {
    if (pos !== null && pos !== -1 && (holdback === -1 || pos < holdback)) holdback = pos;
  };
  note(earliestPartialOpen);
  note(unclosedFenceStart);

  const lastNl = buffer.lastIndexOf('\n');
  if (lastNl < len - 1) {
    const tailLineStart = lastNl + 1;
    const tail = buffer.slice(tailLineStart);
    if (FENCE_OPEN_RE.test(tail) || /^`{1,2}$/.test(tail)) {
      note(tailLineStart);
    }
  }

  let firstUnmatched = -1;
  let parity = 0;
  for (let k = lastNl + 1; k < len; k++) {
    if (buffer.charAt(k) !== '`') continue;
    if (rangeContains(ranges, k)) continue;
    if (parity === 0) {
      firstUnmatched = k;
      parity = 1;
    } else {
      firstUnmatched = -1;
      parity = 0;
    }
  }
  note(firstUnmatched);

  // Strict prefix at the tail (e.g. "<art") — hold back.
  const tailLt = buffer.lastIndexOf('<');
  if (tailLt !== -1 && !rangeContains(ranges, tailLt)) {
    const slice = buffer.slice(tailLt);
    if (OPEN_PREFIX.startsWith(slice) && slice.length < OPEN_PREFIX.length) {
      note(tailLt);
    }
  }

  if (holdback !== -1) return { kind: 'partial', start: holdback };
  return { kind: 'none' };
}

export function createArtifactParser() {
  const state: ParserState = {
    inside: false,
    buffer: '',
    identifier: '',
    artifactType: '',
    title: '',
    content: '',
  };

  function* feed(delta: string): Generator<ArtifactEvent> {
    state.buffer += delta;

    while (state.buffer.length > 0) {
      if (!state.inside) {
        const open = findOpenTag(state.buffer);
        if (open.kind === 'none') {
          yield { type: 'text', delta: state.buffer };
          state.buffer = '';
          return;
        }
        if (open.kind === 'partial') {
          if (open.start > 0) {
            yield { type: 'text', delta: state.buffer.slice(0, open.start) };
            state.buffer = state.buffer.slice(open.start);
          }
          return;
        }
        if (open.start > 0) {
          yield { type: 'text', delta: state.buffer.slice(0, open.start) };
        }
        const attrs = parseAttrs(open.attrs);
        state.inside = true;
        state.identifier = attrs['identifier'] ?? '';
        state.artifactType = attrs['type'] ?? '';
        state.title = attrs['title'] ?? '';
        state.content = '';
        state.buffer = state.buffer.slice(open.end);
        yield {
          type: 'artifact:start',
          identifier: state.identifier,
          artifactType: state.artifactType,
          title: state.title,
        };
        continue;
      }

      const closeIdx = state.buffer.indexOf(CLOSE_TAG);
      if (closeIdx === -1) {
        // Hold back enough bytes to detect a partial close tag at the tail.
        const flushUpTo = state.buffer.length - (CLOSE_TAG.length - 1);
        if (flushUpTo > 0) {
          const chunk = state.buffer.slice(0, flushUpTo);
          state.content += chunk;
          state.buffer = state.buffer.slice(flushUpTo);
          yield { type: 'artifact:chunk', identifier: state.identifier, delta: chunk };
        }
        return;
      }
      const finalChunk = state.buffer.slice(0, closeIdx);
      if (finalChunk.length > 0) {
        state.content += finalChunk;
        yield { type: 'artifact:chunk', identifier: state.identifier, delta: finalChunk };
      }
      yield { type: 'artifact:end', identifier: state.identifier, fullContent: state.content };
      state.buffer = state.buffer.slice(closeIdx + CLOSE_TAG.length);
      state.inside = false;
      state.identifier = '';
      state.artifactType = '';
      state.title = '';
      state.content = '';
    }
  }

  function* flush(): Generator<ArtifactEvent> {
    if (state.inside) {
      if (state.buffer.length > 0) {
        state.content += state.buffer;
        yield { type: 'artifact:chunk', identifier: state.identifier, delta: state.buffer };
        state.buffer = '';
      }
      yield { type: 'artifact:end', identifier: state.identifier, fullContent: state.content };
    } else if (state.buffer.length > 0) {
      yield { type: 'text', delta: state.buffer };
    }
    state.buffer = '';
    state.inside = false;
  }

  return { feed, flush };
}
