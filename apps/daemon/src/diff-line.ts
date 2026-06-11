// Rendering of a single unified-diff line. Extracted from cli.ts (a
// dispatch-on-import script that can't be imported by tests) so the
// line-ending handling can be unit-tested directly.
//
// A diff line carries its own trailing newline from `splitDiffLines`, which
// preserves the original terminator (`\r\n`, `\n`, `\r`, or none). We strip the
// terminator before rendering the body and surface a literal `\r` so a stray
// carriage return is visible in the output rather than corrupting the line.

/** Replace carriage returns with a visible escape so they don't hide in output. */
export function renderDiffLineContent(value: string): string {
  return String(value).replace(/\r/g, '\\r');
}

/**
 * Render one unified-diff line: `<prefix><content>` with the line's own
 * terminator stripped. A CRLF terminator must drop *both* characters — slicing
 * only the final `\n` would leave a trailing `\r` that renders as a spurious
 * `\r` on every Windows-style line.
 */
export function diffLine(prefix: string, line: string): string {
  const value = String(line);
  if (value.endsWith('\r\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -2))}`;
  if (value.endsWith('\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\r')) return `${prefix}${renderDiffLineContent(value)}`;
  return `${prefix}${renderDiffLineContent(value)}\n\\ No newline at end of file`;
}
