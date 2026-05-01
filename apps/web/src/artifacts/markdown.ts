function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const LINK_TOKEN_PREFIX = 'ODMDLINKTOKEN';
const CODE_TOKEN_PREFIX = 'ODMDCODETOKEN';

function formatInline(raw: string): string {
  const linkTokens = new Map<string, string>();
  const codeTokens = new Map<string, string>();
  let linkTokenIndex = 0;
  let codeTokenIndex = 0;

  const withCodeTokens = raw.replace(/`([^`]+)`/g, (_m, code: string) => {
    const token = `${CODE_TOKEN_PREFIX}${codeTokenIndex++}X`;
    codeTokens.set(token, `<code>${escapeHtml(code)}</code>`);
    return token;
  });

  const withLinkTokens = withCodeTokens.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text: string, href: string) => {
    const normalizedHref = normalizeSafeHref(href);
    const safeText = escapeHtml(text);
    if (!normalizedHref) return safeText;
    const safeHref = escapeHtml(normalizedHref);
    const rel = safeHref.startsWith('#') ? '' : ' rel="noreferrer noopener" target="_blank"';
    const token = `${LINK_TOKEN_PREFIX}${linkTokenIndex++}X`;
    linkTokens.set(token, `<a href="${safeHref}"${rel}>${safeText}</a>`);
    return token;
  });

  let out = escapeHtml(withLinkTokens);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  out = out.replace(/ODMDCODETOKEN\d+X/g, (token) => codeTokens.get(token) ?? token);
  out = out.replace(/ODMDLINKTOKEN\d+X/g, (token) => linkTokens.get(token) ?? token);
  return out;
}

function normalizeSafeHref(href: string): string | null {
  const decoded = href.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  if (
    decoded.startsWith('#') ||
    decoded.startsWith('/') ||
    decoded.startsWith('./') ||
    decoded.startsWith('../') ||
    /^https?:\/\//i.test(decoded) ||
    /^mailto:/i.test(decoded)
  ) {
    return decoded;
  }
  return null;
}

function headingLevel(line: string): number {
  const m = /^(#{1,6})\s+/.exec(line);
  return m?.[1]?.length ?? 0;
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  // Intentionally small markdown subset for conservative preview rendering.
  // Supported: headings, paragraphs, blockquotes, ul/ol lists, fenced code,
  // inline code, bold/italic, and links.
  // Not supported on purpose: full CommonMark edge cases (nested lists,
  // escaped markdown syntax, raw HTML blocks, tables, etc.).
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    if (/^```/.test(line)) {
      i += 1;
      const code: string[] = [];
      while (i < lines.length) {
        const codeLine = lines[i];
        if (codeLine === undefined || /^```/.test(codeLine)) break;
        code.push(codeLine);
        i += 1;
      }
      if (i < lines.length) i += 1;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const h = headingLevel(line);
    if (h > 0) {
      out.push(`<h${h}>${formatInline(line.replace(/^#{1,6}\s+/, ''))}</h${h}>`);
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const block: string[] = [];
      while (i < lines.length) {
        const blockLine = lines[i];
        if (blockLine === undefined || !/^>\s?/.test(blockLine)) break;
        block.push(blockLine.replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${formatInline(block.join(' '))}</blockquote>`);
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined || !/^\s*[-*]\s+/.test(itemLine)) break;
        items.push(`<li>${formatInline(itemLine.replace(/^\s*[-*]\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length) {
        const itemLine = lines[i];
        if (itemLine === undefined || !/^\s*\d+\.\s+/.test(itemLine)) break;
        items.push(`<li>${formatInline(itemLine.replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const paraLine = lines[i];
      if (paraLine === undefined || /^\s*$/.test(paraLine)) break;
      if (
        /^```/.test(paraLine) ||
        headingLevel(paraLine) > 0 ||
        /^>\s?/.test(paraLine) ||
        /^\s*[-*]\s+/.test(paraLine) ||
        /^\s*\d+\.\s+/.test(paraLine)
      ) {
        break;
      }
      para.push(paraLine);
      i += 1;
    }
    out.push(`<p>${formatInline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}
