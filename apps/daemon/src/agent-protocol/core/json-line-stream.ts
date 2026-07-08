/** @module agent-protocol/core/json-line-stream
 * Streaming JSON-line parser that reassembles pretty-printed and multiline
 * JSON-RPC messages across chunk boundaries. Shared transport used by both the
 * acp/ and pi-rpc/ protocol adapters; this file has no dependencies on any
 * other agent-protocol sibling.
 */

/**
 * Creates a streaming JSON-line parser over a raw byte/string stream.
 * Buffers incoming chunks, splits on newline boundaries, and attempts
 * `JSON.parse` on each line. Accumulates pretty-printed (multiline) JSON across
 * up to 256 lines and 128 kB before abandoning and re-trying the current line
 * as a fresh candidate.
 *
 * Used as the shared ACP transport: both the acp/ and pi-rpc/ adapters call
 * this to decode JSON-RPC frames from a subprocess's stdout.
 *
 * @param onMessage - Called for each successfully parsed JSON value along with
 *   the raw reassembled line string as a second argument.
 * @returns An object with `feed(chunk)` for incremental input and `flush()` to
 *   drain any residual buffered content at stream end.
 */
export function createJsonLineStream(onMessage: (message: unknown, rawLine: string) => void) {
  let buffer = '';
  let pendingJson = '';
  let pendingJsonLineCount = 0;

  const emit = (candidate: string): boolean => {
    try {
      onMessage(JSON.parse(candidate), candidate);
      return true;
    } catch {
      return false;
    }
  };

  const startPendingJson = (line: string) => {
    pendingJson = line;
    pendingJsonLineCount = 1;
  };

  const resetPendingJson = () => {
    pendingJson = '';
    pendingJsonLineCount = 0;
  };

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (pendingJson) {
      const nextCandidate = `${pendingJson}\n${trimmed}`;
      if (emit(nextCandidate)) {
        resetPendingJson();
        return;
      }
      pendingJsonLineCount += 1;
      const state = classifyJsonCandidate(nextCandidate);
      if (
        state === 'incomplete' &&
        nextCandidate.length <= 128_000 &&
        pendingJsonLineCount <= 256
      ) {
        pendingJson = nextCandidate;
        return;
      }
      resetPendingJson();
      handleLine(trimmed);
      return;
    }
    if (emit(trimmed)) return;
    // ACP is line-delimited JSON-RPC, but a few bridges have emitted
    // pretty-printed JSON during startup. Keep a bounded aggregate so an
    // otherwise valid multiline initialize response does not get discarded
    // line-by-line and leave the session stuck in spawn pending.
    if (
      (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
      classifyJsonCandidate(trimmed) === 'incomplete'
    ) {
      startPendingJson(trimmed);
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        handleLine(line);
      }
    },
    flush() {
      const trimmed = buffer.trim();
      buffer = '';
      if (trimmed) {
        handleLine(trimmed);
      }
      if (pendingJson && emit(pendingJson)) {
        pendingJson = '';
      }
      // Ignore trailing non-JSON log lines on stdout.
    },
  };
}
/**
 * Incremental JSON completeness classifier used by `createJsonLineStream` to
 * decide whether an accumulating multiline candidate can still resolve into
 * valid JSON.
 *
 * Performs a single-pass character-level parse, tracking object and array
 * frames on a stack. Returns:
 * - `'complete'`   — a syntactically valid, fully closed JSON value.
 * - `'incomplete'` — valid so far but the document is still open (unclosed
 *   strings, objects, or arrays).
 * - `'invalid'`    — an irrecoverable syntax error was encountered.
 *
 * @param value - A string candidate to classify, typically one or more
 *   accumulated stdout lines from an ACP subprocess.
 */
export function classifyJsonCandidate(value: string): 'complete' | 'incomplete' | 'invalid' {
  type Frame =
    | { kind: 'object'; expect: 'keyOrEnd' | 'colon' | 'value' | 'commaOrEnd' }
    | { kind: 'array'; expect: 'valueOrEnd' | 'commaOrEnd' };
  const stack: Frame[] = [];
  let rootComplete = false;

  const afterValue = () => {
    const parent = stack.at(-1);
    if (!parent) {
      rootComplete = true;
      return;
    }
    parent.expect = 'commaOrEnd';
  };

  const closeFrame = (kind: 'object' | 'array'): boolean => {
    const current = stack.pop();
    if (!current || current.kind !== kind) return false;
    afterValue();
    return true;
  };

  const parseString = (start: number): number | null => {
    for (let index = start + 1; index < value.length; index += 1) {
      const char = value[index];
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === '"') return index;
    }
    return null;
  };

  const parseLiteral = (start: number, literal: string): number | null | false => {
    for (let offset = 0; offset < literal.length; offset += 1) {
      const char = value[start + offset];
      if (char === undefined) return null;
      if (char !== literal[offset]) return false;
    }
    return start + literal.length - 1;
  };

  const parseNumber = (start: number): number | false => {
    let index = start;
    if (value[index] === '-') index += 1;
    if (value[index] === '0') {
      index += 1;
    } else if (/[1-9]/.test(value[index] ?? '')) {
      while (/[0-9]/.test(value[index] ?? '')) index += 1;
    } else {
      return false;
    }
    if (value[index] === '.') {
      index += 1;
      if (!/[0-9]/.test(value[index] ?? '')) return false;
      while (/[0-9]/.test(value[index] ?? '')) index += 1;
    }
    if (value[index] === 'e' || value[index] === 'E') {
      index += 1;
      if (value[index] === '+' || value[index] === '-') index += 1;
      if (!/[0-9]/.test(value[index] ?? '')) return false;
      while (/[0-9]/.test(value[index] ?? '')) index += 1;
    }
    return index - 1;
  };

  const parseValue = (index: number): number | null | false => {
    const char = value[index];
    if (char === '"') {
      const end = parseString(index);
      if (end === null) return null;
      afterValue();
      return end;
    }
    if (char === '{') {
      stack.push({ kind: 'object', expect: 'keyOrEnd' });
      return index;
    }
    if (char === '[') {
      stack.push({ kind: 'array', expect: 'valueOrEnd' });
      return index;
    }
    if (char === 't') {
      const end = parseLiteral(index, 'true');
      if (end === false || end === null) return end;
      afterValue();
      return end;
    }
    if (char === 'f') {
      const end = parseLiteral(index, 'false');
      if (end === false || end === null) return end;
      afterValue();
      return end;
    }
    if (char === 'n') {
      const end = parseLiteral(index, 'null');
      if (end === false || end === null) return end;
      afterValue();
      return end;
    }
    if (char === '-' || /[0-9]/.test(char ?? '')) {
      const end = parseNumber(index);
      if (end === false) return false;
      afterValue();
      return end;
    }
    return false;
  };

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === undefined) break;
    if (/\s/.test(char)) continue;

    const current = stack.at(-1);
    if (!current) {
      if (rootComplete) return 'invalid';
      const end = parseValue(index);
      if (end === false) return 'invalid';
      if (end === null) return 'incomplete';
      index = end;
      continue;
    }

    if (current.kind === 'object') {
      if (current.expect === 'keyOrEnd') {
        if (char === '}') {
          if (!closeFrame('object')) return 'invalid';
          continue;
        }
        if (char !== '"') return 'invalid';
        const end = parseString(index);
        if (end === null) return 'incomplete';
        current.expect = 'colon';
        index = end;
        continue;
      }
      if (current.expect === 'colon') {
        if (char !== ':') return 'invalid';
        current.expect = 'value';
        continue;
      }
      if (current.expect === 'value') {
        const end = parseValue(index);
        if (end === false) return 'invalid';
        if (end === null) return 'incomplete';
        index = end;
        continue;
      }
      if (char === '}') {
        if (!closeFrame('object')) return 'invalid';
        continue;
      }
      if (char !== ',') return 'invalid';
      current.expect = 'keyOrEnd';
      continue;
    }

    if (current.expect === 'valueOrEnd') {
      if (char === ']') {
        if (!closeFrame('array')) return 'invalid';
        continue;
      }
      const end = parseValue(index);
      if (end === false) return 'invalid';
      if (end === null) return 'incomplete';
      index = end;
      continue;
    }
    if (char === ']') {
      if (!closeFrame('array')) return 'invalid';
      continue;
    }
    if (char !== ',') return 'invalid';
    current.expect = 'valueOrEnd';
  }

  return rootComplete && stack.length === 0 ? 'complete' : 'incomplete';
}
