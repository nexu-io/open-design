// @ts-nocheck
/**
 * @module cli/project/diff
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

function splitDiffLines(text) {
  const value = String(text);
  if (value.length === 0) return [];
  return value.match(/.*?(?:\r\n|\n|\r|$)/gs).filter((line) => line.length > 0);
}

function formatDiffRange(start, length) {
  return length === 1 ? String(start) : `${start},${length}`;
}

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

function diffLine(prefix, line) {
  const value = String(line);
  if (value.endsWith('\r\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\n')) return `${prefix}${renderDiffLineContent(value.slice(0, -1))}`;
  if (value.endsWith('\r')) return `${prefix}${renderDiffLineContent(value)}`;
  return `${prefix}${renderDiffLineContent(value)}\n\\ No newline at end of file`;
}

function renderDiffLineContent(value) {
  return String(value).replace(/\r/g, '\\r');
}
