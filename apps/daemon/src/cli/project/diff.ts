// @ts-nocheck
/** @module cli/project/diff
 * Unified diff generator for text comparison (used by `od files diff`).
 * Implements LCS-based diff when line counts are reasonable; falls back to simple replace on large inputs.
 */
/**
 * Generates a unified diff between two text inputs.
 * Returns empty string if texts are identical.
 * Uses LCS algorithm when feasible; falls back to simple old/new listing for large diffs (>1M line product).
 * @param {string} leftLabel - Header label for left file (e.g. 'a/path').
 * @param {string} rightLabel - Header label for right file (e.g. 'b/path').
 * @param {string} leftText - Original text.
 * @param {string} rightText - Modified text.
 * @returns {string} Unified diff or empty string.
 */
export function createUnifiedDiff(leftLabel, rightLabel, leftText, rightText) {
  if (leftText === rightText) return '';
  const leftLines = splitDiffLines(leftText);
  const rightLines = splitDiffLines(rightText);
  let prefix = 0;
  while (
    prefix < leftLines.length
    && prefix < rightLines.length
    && leftLines[prefix] === rightLines[prefix]
  ) {
    prefix++;
  }
  let leftEnd = leftLines.length;
  let rightEnd = rightLines.length;
  while (
    leftEnd > prefix
    && rightEnd > prefix
    && leftLines[leftEnd - 1] === rightLines[rightEnd - 1]
  ) {
    leftEnd--;
    rightEnd--;
  }
  const oldMid = leftLines.slice(prefix, leftEnd);
  const newMid = rightLines.slice(prefix, rightEnd);
  const body = diffLineBody(oldMid, newMid);
  if (body.length === 0) {
    body.push(...oldMid.map((line) => diffLine('-', line)), ...newMid.map((line) => diffLine('+', line)));
  }
  const oldStart = oldMid.length === 0 ? prefix : prefix + 1;
  const newStart = newMid.length === 0 ? prefix : prefix + 1;
  return [
    `--- ${leftLabel}`,
    `+++ ${rightLabel}`,
    `@@ -${formatDiffRange(oldStart, oldMid.length)} +${formatDiffRange(newStart, newMid.length)} @@`,
    ...body,
  ].join('\n') + '\n';
}

/**
 * @internal Splits text by CR, LF, CRLF, or EOF; filters empty results.
 * @param {string} text - Input text.
 * @returns {Array<string>} Lines with line terminators included.
 */
function splitDiffLines(text) {
  const value = String(text);
  if (value.length === 0) return [];
  return value.match(/.*?(?:\r\n|\n|\r|$)/gs).filter((line) => line.length > 0);
}

/**
 * @internal Formats start line and length as either 'start' (length 1) or 'start,length'.
 * @param {number} start - Starting line number (1-based).
 * @param {number} length - Number of lines.
 * @returns {string} Formatted range.
 */
function formatDiffRange(start, length) {
  return length === 1 ? String(start) : `${start},${length}`;
}

/**
 * @internal Computes the diff body (list of +/- lines) using LCS when feasible.
 * Falls back to naive old/new if line product >1M.
 * @param {Array<string>} oldLines - Old text lines.
 * @param {Array<string>} newLines - New text lines.
 * @returns {Array<string>} Diff lines prefixed with +/-/space.
 */
function diffLineBody(oldLines, newLines) {
  if (oldLines.length === 0) return newLines.map((line) => diffLine('+', line));
  if (newLines.length === 0) return oldLines.map((line) => diffLine('-', line));
  if (oldLines.length * newLines.length > 1_000_000) {
    return [...oldLines.map((line) => diffLine('-', line)), ...newLines.map((line) => diffLine('+', line))];
  }
  const width = newLines.length + 1;
  const lcs = Array.from(
    { length: oldLines.length + 1 },
    () => new Uint32Array(width),
  );
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      out.push(diffLine(' ', oldLines[i]));
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(diffLine('-', oldLines[i]));
      i++;
    } else {
      out.push(diffLine('+', newLines[j]));
      j++;
    }
  }
  while (i < oldLines.length) out.push(diffLine('-', oldLines[i++]));
  while (j < newLines.length) out.push(diffLine('+', newLines[j++]));
  return out;
}

/**
 * @internal Formats one line with prefix (+/-/space) and handles missing final newline.
 * @param {string} prefix - One-char prefix.
 * @param {string} line - Line content (may include \r, \n, \r\n).
 * @returns {string} Formatted diff line.
 */
function diffLine(prefix, line) {
  const value = String(line);
  if (value.endsWith('\r\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\r')) return `${prefix}${renderDiffLineContent(value)}`;
  return `${prefix}${renderDiffLineContent(value)}\n\\ No newline at end of file`;
}

/**
 * @internal Escapes CR characters as \\r for readability in diff output.
 * @param {string} value - Line content.
 * @returns {string} Escaped content.
 */
function renderDiffLineContent(value) {
  return String(value).replace(/\r/g, '\\r');
}
