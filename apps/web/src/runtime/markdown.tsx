/**
 * A pocket-sized markdown renderer for assistant chat messages.
 *
 * We deliberately avoid a full parser library — chat output rarely uses
 * the long tail of markdown features and a hand-rolled walker keeps the
 * bundle slim. Block-level: ATX headings (# … ###), fenced code (```),
 * tables, ordered (1.) and unordered (- / *) lists, paragraphs, blank-line
 * separation. Inline: backtick code spans, **bold**, *italic* / _italic_,
 * and bare links (autolinked URLs).
 *
 * Output is a React fragment of typed elements — no dangerouslySetInnerHTML,
 * so untrusted text can't smuggle markup through.
 */
import { Fragment, type ReactNode } from 'react';

export function renderMarkdown(input: string): ReactNode {
  const blocks = parseBlocks(input);
  return (
    <>
      {blocks.map((b, i) => renderBlock(b, i))}
    </>
  );
}

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; headers: string[]; aligns: TableAlign[]; rows: string[][] }
  | { kind: 'code'; lang: string | null; body: string }
  | { kind: 'hr' };

type TableAlign = 'left' | 'center' | 'right';

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i] ?? '';
    const next = trimmed[i + 1] ?? '';
    if (ch === '\\' && next === '|') {
      current += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
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

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    // Fenced code block.
    const fence = /^```(\w[\w+-]*)?\s*$/.exec(line);
    if (fence) {
      const lang = fence[1] ?? null;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i] ?? '')) {
        buf.push(lines[i] ?? '');
        i++;
      }
      // Skip the closing fence (if present).
      if (i < lines.length) i++;
      out.push({ kind: 'code', lang, body: buf.join('\n') });
      continue;
    }
    // Table.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1] ?? '')
    ) {
      const headers = splitTableRow(line);
      const aligns = splitTableRow(lines[i + 1] ?? '').map((cell) => parseTableAlign(cell) ?? 'left');
      if (headers.length >= 1 && aligns.length >= 1) {
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length) {
          const rowLine = lines[i] ?? '';
          if (rowLine.trim() === '') break;
          if (
            /^```/.test(rowLine) ||
            /^(#{1,4})\s+/.test(rowLine) ||
            /^\s*[-*+]\s+/.test(rowLine) ||
            /^\s*\d+\.\s+/.test(rowLine) ||
            /^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(rowLine) ||
            /^>\s?/.test(rowLine) ||
            !rowLine.includes('|')
          ) {
            break;
          }
          rows.push(splitTableRow(rowLine));
          i++;
        }
        out.push({ kind: 'table', headers, aligns, rows });
        continue;
      }
    }
    // ATX heading.
    const heading = /^(#{1,4})\s+(.*\S)\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3 | 4;
      out.push({ kind: 'h', level, text: heading[2]! });
      i++;
      continue;
    }
    // Horizontal rule.
    if (/^\s*(-{3,}|_{3,}|\*{3,})\s*$/.test(line)) {
      out.push({ kind: 'hr' });
      i++;
      continue;
    }
    // Unordered list. Group consecutive items.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      out.push({ kind: 'ul', items });
      continue;
    }
    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      out.push({ kind: 'ol', items });
      continue;
    }
    // Paragraph: greedy until a blank line or another block-starter.
    const buf: string[] = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next.trim() === '') break;
      if (/^```/.test(next)) break;
      if (/^#{1,4}\s+/.test(next)) break;
      if (/^\s*[-*+]\s+/.test(next)) break;
      if (/^\s*\d+\.\s+/.test(next)) break;
      buf.push(next);
      i++;
    }
    out.push({ kind: 'p', text: buf.join('\n') });
  }
  return out;
}

function renderBlock(block: Block, key: number): ReactNode {
  if (block.kind === 'p') {
    return <p key={key} className="md-p">{renderInline(block.text)}</p>;
  }
  if (block.kind === 'h') {
    const Tag = (`h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4');
    return <Tag key={key} className={`md-h md-h${block.level}`}>{renderInline(block.text)}</Tag>;
  }
  if (block.kind === 'ul') {
    return (
      <ul key={key} className="md-ul">
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  if (block.kind === 'ol') {
    return (
      <ol key={key} className="md-ol">
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  if (block.kind === 'table') {
    const columnCount = Math.max(block.headers.length, block.aligns.length, ...block.rows.map((row) => row.length));
    return (
      <div key={key} className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              {Array.from({ length: columnCount }, (_v, i) => (
                <th key={i} style={block.aligns[i] ? { textAlign: block.aligns[i] } : undefined}>
                  {renderInline(block.headers[i] ?? '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i}>
                {Array.from({ length: columnCount }, (_v, j) => (
                  <td key={j} style={block.aligns[j] ? { textAlign: block.aligns[j] } : undefined}>
                    {renderInline(row[j] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (block.kind === 'code') {
    return (
      <pre key={key} className="md-code">
        <code data-lang={block.lang ?? undefined}>{block.body}</code>
      </pre>
    );
  }
  if (block.kind === 'hr') {
    return <hr key={key} className="md-hr" />;
  }
  return null;
}

// Inline pass: tokenize into runs of `code`, **bold**, *italic*, links,
// and plain text. We walk the string with a regex that matches whichever
// delimiter shows up next; everything between delimiters becomes a text
// span (which itself still gets autolink scanning).
function renderInline(text: string): ReactNode {
  const out: ReactNode[] = [];
  // Order matters:
  //  1. inline code first so its contents are not re-tokenized as bold/italic.
  //  2. explicit `[text](url)` markdown links before bare URL autolink so the
  //     autolink does not greedily swallow the closing paren.
  //  3. bare http(s) URL autolink BEFORE italic markers — chat output often
  //     contains OAuth-style links with `_type=` / `_id=` query params, and
  //     leaving italic to win turns the URL into an italic-fragmented mess.
  //  4. bold (**a** / __a__) before italic (*a* / _a_).
  const re =
    /(`[^`]+`)|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s)<>]+)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    if (m.index > lastIndex) {
      pushText(out, text.slice(lastIndex, m.index), key++);
    }
    if (m[1]) {
      out.push(
        <code key={key++} className="md-inline-code">
          {m[1].slice(1, -1)}
        </code>,
      );
    } else if (m[2] && m[3]) {
      out.push(
        <a
          key={key++}
          className="md-link"
          href={m[3]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {m[2]}
        </a>,
      );
    } else if (m[4]) {
      // Bare URL — autolink with the URL as both href and visible text,
      // matching the Markdown `<https://…>` autolink convention.
      out.push(
        <a
          key={key++}
          className="md-link md-link-bare"
          href={m[4]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {m[4]}
        </a>,
      );
    } else if (m[5]) {
      out.push(<strong key={key++}>{m[5].slice(2, -2)}</strong>);
    } else if (m[6]) {
      out.push(<strong key={key++}>{m[6].slice(2, -2)}</strong>);
    } else if (m[7]) {
      out.push(<em key={key++}>{m[7].slice(1, -1)}</em>);
    } else if (m[8]) {
      out.push(<em key={key++}>{m[8].slice(1, -1)}</em>);
    }
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    pushText(out, text.slice(lastIndex), key++);
  }
  return <Fragment>{out}</Fragment>;
}

// Walk a plain text run, autolinking bare URLs and preserving the rest as
// text nodes. Newlines inside a paragraph become explicit <br />s — the
// upstream parser has already left them in place because chat output
// often relies on hard line breaks rather than blank-line separation.
function pushText(out: ReactNode[], text: string, baseKey: number): void {
  if (!text) return;
  const urlRe = /(https?:\/\/[^\s)]+)/g;
  const segments: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = urlRe.exec(text))) {
    if (m.index > lastIndex) {
      segments.push(...withBreaks(text.slice(lastIndex, m.index), `${baseKey}-${k++}`));
    }
    segments.push(
      <a
        key={`${baseKey}-${k++}`}
        className="md-link"
        href={m[1]}
        target="_blank"
        rel="noreferrer noopener"
      >
        {m[1]}
      </a>,
    );
    lastIndex = urlRe.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push(...withBreaks(text.slice(lastIndex), `${baseKey}-${k++}`));
  }
  out.push(<Fragment key={baseKey}>{segments}</Fragment>);
}

function withBreaks(text: string, baseKey: string): ReactNode[] {
  const parts = text.split('\n');
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) out.push(<br key={`${baseKey}-br-${i}`} />);
    if (part) out.push(<Fragment key={`${baseKey}-t-${i}`}>{part}</Fragment>);
  });
  return out;
}
