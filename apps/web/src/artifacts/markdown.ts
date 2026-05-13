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

type TableAlign = 'left' | 'center' | 'right';

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  let inCodeSpan = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] ?? '';
    const next = trimmed[i + 1] ?? '';
    if (ch === '`') {
      inCodeSpan = !inCodeSpan;
      current += ch;
      continue;
    }
    if (ch === '\\' && next === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|' && !inCodeSpan) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function parseTableAlign(cell: string): TableAlign | null {
  const trimmed = cell.trim();
  if (!/^:?-{3,}:?$/.test(trimmed)) return null;
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (left) return 'left';
  if (right) return 'right';
  return 'left';
}

function isTableSeparatorLine(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => parseTableAlign(cell) !== null);
}

function isTableStart(line: string, nextLine: string | undefined): boolean {
  return line.includes('|') && nextLine !== undefined && isTableSeparatorLine(nextLine);
}

function renderTableHtml(headerLine: string, separatorLine: string, bodyLines: string[]): string | null {
  const headers = splitTableRow(headerLine);
  const aligns = splitTableRow(separatorLine).map((cell) => parseTableAlign(cell));
  if (headers.length < 1 || aligns.length < 1) return null;

  const rows = bodyLines.map((line) => splitTableRow(line));
  const columnCount = Math.max(headers.length, aligns.length, ...rows.map((row) => row.length));

  let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
  for (let col = 0; col < columnCount; col += 1) {
    const align = aligns[col] ?? null;
    const style = align ? ` style="text-align:${align}"` : '';
    html += `<th${style}>${formatInline(headers[col] ?? '')}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of rows) {
    html += '<tr>';
    for (let col = 0; col < columnCount; col += 1) {
      const align = aligns[col] ?? null;
      const style = align ? ` style="text-align:${align}"` : '';
      html += `<td${style}>${formatInline(row[col] ?? '')}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table></div>';
  return html;
}

export function renderMarkdownToSafeHtml(markdown: string): string {
  // Intentionally small markdown subset for conservative preview rendering.
  // Supported: headings, paragraphs, blockquotes, ul/ol lists, fenced code,
  // tables, inline code, bold/italic, and links.
  // Not supported on purpose: full CommonMark edge cases (nested lists,
  // raw HTML blocks, etc.).
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

    if (isTableStart(line, lines[i + 1])) {
      const bodyLines: string[] = [];
      let j = i + 2;
      while (j < lines.length) {
        const rowLine = lines[j];
        if (rowLine === undefined || /^\s*$/.test(rowLine)) break;
        if (
          /^```/.test(rowLine) ||
          headingLevel(rowLine) > 0 ||
          /^>\s?/.test(rowLine) ||
          /^\s*[-*]\s+/.test(rowLine) ||
          /^\s*\d+\.\s+/.test(rowLine) ||
          !/\|/.test(rowLine)
        ) {
          break;
        }
        bodyLines.push(rowLine);
        j += 1;
      }

      const tableHtml = renderTableHtml(line, lines[i + 1] ?? '', bodyLines);
      if (tableHtml) {
        out.push(tableHtml);
        i = j;
        continue;
      }
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
        /^\s*\d+\.\s+/.test(paraLine) ||
        isTableStart(paraLine, lines[i + 1])
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
