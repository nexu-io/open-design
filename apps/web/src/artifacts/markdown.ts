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

type TableAlign = 'left' | 'right' | 'center' | null;

function splitCells(line: string): string[] {
  // Walk char-by-char so we can respect three GFM cell-content rules without
  // any placeholder substitution:
  //   - `\|` resolves to a literal `|` inside the current cell.
  //   - A `|` inside a backtick code span is cell content, not a column
  //     boundary (handles cells like `` | status | `a | b` | ``).
  //   - A single optional leading `|` and unescaped trailing `|` are row
  //     terminators, not empty cells.
  // Placeholder-based escaping was rejected in review for two reasons: a
  // string sentinel can collide with real cell text, and an earlier draft
  // used NUL bytes which made the file render as binary on GitHub.
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  if (line[i] === '|') i++;
  for (; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '\' && line[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (cells.length === 0 || tail !== '') cells.push(tail);
  return cells;
}

function parseTableAlignRow(line: string): TableAlign[] | null {
  if (!line.includes('|')) return null;
  const cells = splitCells(line);
  if (cells.length === 0) return null;
  const aligns: TableAlign[] = [];
  for (const cell of cells) {
    if (!/^:?-{1,}:?$/.test(cell)) return null;
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    aligns.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null);
  }
  return aligns;
}

function isTableStartAt(lines: string[], i: number): boolean {
  const header = lines[i];
  const sep = lines[i + 1];
  if (header === undefined || sep === undefined) return false;
  if (!header.includes('|')) return false;
  return parseTableAlignRow(sep) !== null;
}

function alignAttr(align: TableAlign): string {
  return align === null ? '' : ` style="text-align:${align}"`;
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  // Intentionally small markdown subset for conservative preview rendering.
  // Supported: headings, paragraphs, blockquotes, ul/ol lists, fenced code,
  // GFM pipe tables, inline code, bold/italic, and links.
  // Not supported on purpose: full CommonMark edge cases (nested lists,
  // escaped markdown syntax, raw HTML blocks, etc.).
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
      out.push(`<pre><code>${escapeHtml(code.join('
'))}</code></pre>`);
      continue;
    }

    if (isTableStartAt(lines, i)) {
      const header = lines[i] as string;
      const sep = lines[i + 1] as string;
      const aligns = parseTableAlignRow(sep) as TableAlign[];
      const headers = splitCells(header);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const row = lines[i];
        if (row === undefined || row.trim() === '' || !row.includes('|')) break;
        rows.push(splitCells(row));
        i++;
      }
      const columnCount = Math.max(headers.length, aligns.length, ...rows.map((row) => row.length));
      let tableHtml = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      for (let col = 0; col < columnCount; col++) {
        tableHtml += `<th${alignAttr(aligns[col] ?? null)}>${formatInline(headers[col] ?? '')}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';
      for (const row of rows) {
        tableHtml += '<tr>';
        for (let col = 0; col < columnCount; col++) {
          tableHtml += `<td${alignAttr(aligns[col] ?? null)}>${formatInline(row[col] ?? '')}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table></div>';
      out.push(tableHtml);
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

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next.trim() === '') break;
      if (/^```/.test(next)) break;
      if (/^#{1,6}\s+/.test(next)) break;
      if (/^\s*[-*+]\s+/.test(next)) break;
      if (/^\s*\d+\.\s+/.test(next)) break;
      if (isTableStartAt(lines, i)) break;
      buf.push(next);
      i++;
    }
    out.push(`<p>${formatInline(buf.join(' '))}</p>`);
  }

  return out.join('
');
}
