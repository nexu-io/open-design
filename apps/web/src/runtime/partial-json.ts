/**
 * Truncation-tolerant JSON parsing for streamed LLM output. The
 * `<question-form>` discovery / clarification form needs to render a JSON
 * *prefix* that grows one token at a time, so it relies on this repair pass.
 *
 * It deliberately handles only the shapes a streaming model emits — balanced
 * structure that simply hasn't finished — not arbitrary corruption. Callers
 * still wrap the `JSON.parse` in try/catch and keep their last good result.
 */

/**
 * Repair a truncated JSON prefix into the largest valid JSON text we can
 * parse, by walking the buffer once to track string/escape state and the
 * open-container stack, then closing whatever is still open.
 */
export function repairJsonPrefix(buf: string): string {
  const stack: string[] = []; // closers owed, e.g. ['}', ']']
  let inStr = false;
  let esc = false;
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') stack.push('}');
    else if (c === '[') stack.push(']');
    else if (c === '}' || c === ']') stack.pop();
  }

  let out = buf;
  // 1. Close a string cut off mid-value (or mid-key). First neutralize a
  //    dangling escape at the cut point, otherwise the closing quote would be
  //    swallowed (`...x\` + `"` → escaped quote) or a partial `\uXXXX` would
  //    be an invalid escape — either makes JSON.parse fail and collapses the
  //    live preview. Common in prompts that mention Windows paths, regexes,
  //    or escaped quotes.
  if (inStr) {
    out = out.replace(/\\u[0-9a-fA-F]{0,3}$/, ''); // incomplete \uXXXX
    if (/(?:^|[^\\])(?:\\\\)*\\$/.test(out)) out = out.slice(0, -1); // lone trailing backslash
    out += '"';
  }
  // 2. Trim trailing structural noise that can't be completed into a value:
  //    a dangling comma, a `"key":` with no value yet, and an unfinished
  //    *scalar* value cut mid-token (a partial `true`/`false`/`null`, or a
  //    number ending on `.`/`e`/sign). Leaving those makes `{… :f}` etc.
  //    unparseable, collapsing the live preview whenever a literal splits
  //    across deltas. Each trim leaves a `"key":` / `,` / `[` boundary that
  //    the next loop iteration cleans up. Complete literals (`true`, `12`,
  //    `1.5`, `1e3`) are not prefixes of these patterns, so they survive.
  const valueStart = '([:[,]\\s*)';
  let prev: string;
  do {
    prev = out;
    out = out.replace(/[,\s]+$/, '');
    out = out.replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, ''); // key + colon, no value
    out = out.replace(new RegExp(`${valueStart}(?:tru|tr|t|fals|fal|fa|f|nul|nu|n)$`), '$1'); // partial bool/null
    out = out.replace(new RegExp(`${valueStart}-?(?:\\d+\\.?\\d*|\\d*\\.\\d+)?[eE][+-]?$`), '$1'); // dangling exponent
    out = out.replace(new RegExp(`${valueStart}-?\\d*\\.$`), '$1'); // number ending in '.'
    out = out.replace(new RegExp(`${valueStart}-$`), '$1'); // lone minus
    out = out.replace(/"(?:[^"\\]|\\.)*"\s*:\s*$/, ''); // key + colon exposed by the trims above
    out = out.replace(/[,\s]+$/, '');
  } while (out !== prev);
  // A bare trailing key (string with no following colon) only happens when
  // the *innermost* open container is an object. Drop it so we don't emit
  // `{"hea"}` which is invalid (key without value).
  if (stack[stack.length - 1] === '}' && /"(?:[^"\\]|\\.)*"\s*$/.test(out)) {
    const trimmed = out.replace(/"(?:[^"\\]|\\.)*"\s*$/, '');
    // Only drop it if what precedes is a container/comma boundary (i.e. the
    // string really is a pending key, not a completed value like `:"x"`).
    if (/[{,]\s*$/.test(trimmed)) {
      out = trimmed.replace(/[,\s]+$/, '');
    }
  }
  // 3. Close every still-open container, innermost first.
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i];
  return out;
}

/** Best-effort parse of a (possibly truncated) JSON prefix. Returns null on
 *  failure so callers fall back to their last good value. */
export function parsePartialJson(buf: string): unknown {
  const trimmed = buf.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(repairJsonPrefix(trimmed));
  } catch {
    return null;
  }
}
