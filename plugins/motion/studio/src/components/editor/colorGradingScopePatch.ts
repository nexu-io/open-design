const MEDIA_TAG_RE = /<\s*(video|img)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const COLOR_GRADING_ATTR_RE = /\sdata-color-grading=(?:"[^"]*"|'[^']*')/i;
const IGNORED_HTML_RANGE_RE = /<!--[\s\S]*?-->|<(script|style)\b[\s\S]*?<\/\1\s*>/gi;

interface TextRange {
  start: number;
  end: number;
}

function collectIgnoredRanges(html: string): TextRange[] {
  const ranges: TextRange[] = [];
  let match: RegExpExecArray | null;
  IGNORED_HTML_RANGE_RE.lastIndex = 0;
  while ((match = IGNORED_HTML_RANGE_RE.exec(html)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges;
}

function isInsideRange(offset: number, ranges: TextRange[]): boolean {
  return ranges.some((range) => offset >= range.start && offset < range.end);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function patchMediaTag(tag: string, value: string | null): string {
  if (value === null || value === "") {
    return tag.replace(COLOR_GRADING_ATTR_RE, "");
  }

  const nextAttr = ` data-color-grading="${escapeHtmlAttribute(value)}"`;
  if (COLOR_GRADING_ATTR_RE.test(tag)) {
    return tag.replace(COLOR_GRADING_ATTR_RE, nextAttr);
  }
  return tag.replace(/\s*\/?>$/, (end) => `${nextAttr}${end}`);
}

export function patchMediaColorGradingInHtml(
  html: string,
  value: string | null,
): { html: string; count: number } {
  let count = 0;
  const ignoredRanges = collectIgnoredRanges(html);
  const patched = html.replace(MEDIA_TAG_RE, (tag, _tagName, offset: number) => {
    if (isInsideRange(offset, ignoredRanges)) return tag;
    const next = patchMediaTag(tag, value);
    if (next !== tag) count += 1;
    return next;
  });
  return { html: patched, count };
}
