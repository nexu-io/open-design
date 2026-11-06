/**
 * HTML Editor — Utility functions for parsing and manipulating HyperFrame HTML source.
 */

/**
 * Parse a CSS inline style string into a key-value map.
 * e.g. "opacity: 0.5; transform: matrix(1,0,0,1,0,0)" →
 *      { opacity: "0.5", transform: "matrix(1,0,0,1,0,0)" }
 */
export function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx < 0) continue;
    const key = decl.slice(0, colonIdx).trim();
    const value = decl.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

/**
 * Merge `newStyles` into an opening tag string's `style` attribute.
 * - New values win over existing ones.
 * - If no `style` attribute is present, one is added before the closing `>`.
 */
export function mergeStyleIntoTag(tag: string, newStyles: string): string {
  if (!newStyles.trim()) return tag;

  const incoming = parseStyleString(newStyles);

  // Match each quote-delimited form explicitly, including multi-line values.
  const styleAttrRe = /style=(")([^"]*)"|style=(')([^']*)'/;
  const match = tag.match(styleAttrRe);

  if (match) {
    const quote = match[1] ?? match[3];
    const existing = parseStyleString(match[2] ?? match[4]);
    const merged = { ...existing, ...incoming };
    const serialized = Object.entries(merged)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    return tag.replace(styleAttrRe, `style=${quote}${serialized}${quote}`);
  }

  // No style attribute — insert one before the closing `>`
  const serialized = Object.entries(incoming)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
  // Handle self-closing tags (`/>`) and regular closing (`>`)
  return tag.replace(/(\/?>)$/, ` style="${serialized}"$1`);
}

/**
 * Find the full element block (opening tag through closing tag) in the source.
 * Uses quote-aware scanning to handle attributes containing >.
 * Uses depth counting to handle nested same-name tags.
 */
export function findElementBlock(
  html: string,
  elementId: string,
): {
  start: number;
  end: number;
  openTag: string;
  tagName: string;
  indent: string;
  innerContent: string;
  isSelfClosing: boolean;
} | null {
  let idIdx = html.indexOf(`id="${elementId}"`);
  if (idIdx < 0) idIdx = html.indexOf(`id='${elementId}'`);
  if (idIdx < 0) return null;

  // Walk backward to find < and capture indent
  let tagStart = idIdx;
  while (tagStart > 0 && html[tagStart] !== "<") tagStart--;

  let indentStart = tagStart;
  while (indentStart > 0 && html[indentStart - 1] !== "\n") indentStart--;
  const indent = html.slice(indentStart, tagStart);

  // Walk forward from id to find the closing > of the opening tag
  let tagEnd = idIdx;
  let inQuote: string | null = null;
  while (tagEnd < html.length) {
    const ch = html[tagEnd];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
    } else {
      if (ch === '"' || ch === "'") inQuote = ch;
      if (ch === ">") {
        tagEnd++;
        break;
      }
    }
    tagEnd++;
  }

  const openTag = html.slice(tagStart, tagEnd);
  const tagNameMatch = openTag.match(/^<([a-z][a-z0-9]*)/i);
  if (!tagNameMatch) return null;

  const tagName = tagNameMatch[1];
  const isSelfClosing =
    openTag.trimEnd().endsWith("/>") ||
    ["img", "br", "hr", "input", "meta", "link", "source"].includes(tagName.toLowerCase());

  if (isSelfClosing) {
    return {
      start: tagStart,
      end: tagStart + openTag.length,
      openTag,
      tagName,
      indent: /^[\t ]*$/.test(indent) ? indent : "",
      innerContent: "",
      isSelfClosing: true,
    };
  }

  // Find matching closing tag using depth counting
  const closeTag = `</${tagName.toLowerCase()}>`;
  const openPattern = `<${tagName.toLowerCase()}`;
  let depth = 0;
  let pos = tagStart;
  const lower = html.toLowerCase();

  while (pos < html.length) {
    if (lower.startsWith("<!--", pos)) {
      const commentEnd = lower.indexOf("-->", pos + 4);
      pos = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }

    if (lower.startsWith(openPattern, pos) && /[\s>/]/.test(html[pos + openPattern.length] || "")) {
      depth++;
      pos += openPattern.length;
      continue;
    }

    if (lower.startsWith(closeTag, pos)) {
      depth--;
      if (depth === 0) {
        const end = pos + closeTag.length;
        const innerContent = html.slice(tagStart + openTag.length, pos);
        return {
          start: tagStart,
          end,
          openTag,
          tagName,
          indent: /^[\t ]*$/.test(indent) ? indent : "",
          innerContent,
          isSelfClosing: false,
        };
      }
      pos += closeTag.length;
      continue;
    }

    pos++;
  }

  return null;
}
