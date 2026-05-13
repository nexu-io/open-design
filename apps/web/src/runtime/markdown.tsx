/**
 * A pocket-sized markdown renderer for assistant chat messages.
 *
 * We deliberately avoid a full parser library — chat output rarely uses
 * the long tail of markdown features and a hand-rolled walker keeps the
 * bundle slim. Block-level: ATX headings (# … ###), fenced code (```),
 * ordered (1.) and unordered (- / *) lists, GFM pipe tables, paragraphs,
 * blank-line separation. Inline: backtick code spans, **bold**,
 * *italic* / _italic_, and bare links (autolinked URLs).
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

type TableAlign = 'left' | 'right' | 'center' | null;

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'h'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'code'; lang: string | null; body: string }
  | { kind: 'table'; aligns: TableAlign[]; headers: string[]; rows: string[][] }
  | { kind: 'hr' };

function splitTableCells(line: string): string[] {
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
    if (ch === '\\' && line[i + 1] === '|') {
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
  // A trailing unescaped `|` leaves `cur` empty — that's a row terminator,
  // not a final empty cell. Anything else (content after the last `|`, or a
  // row with no pipes at all) gets pushed.
  const tail = cur.trim();
  if (cells.length === 0 || tail !== '') cells.push(tail);
  return cells;
}

function parseTableAlignRow(line: string): TableAlign[] | null {
  if (!line.includes('|')) return null;
  const cells = splitTableCells(line);
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
    // GFM pipe table: header row + alignment row + body rows.
    if (isTableStartAt(lines, i)) {
      const header = lines[i] as string;
      const sep = lines[i + 1] as string;
      const aligns = parseTableAlignRow(sep) as TableAlign[];
      const headers = splitTableCells(header);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length) {
        const row = lines[i];
        if (row === undefined || row.trim() === '' || !row.includes('|')) break;
        rows.push(splitTableCells(row));
        i++;
      }
      out.push({ kind: 'table', aligns, headers, rows });
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
      if (isTableStartAt(lines, i)) break;
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
  if (block.kind === 'code') {
    return (
      <pre key={key} className="md-code">
        <code data-lang={block.lang ?? undefined}>{block.body}</code>
      </pre>
    );
  }
  if (block.kind === 'table') {
    const { aligns, headers, rows } = block;
    const cellStyle = (idx: number): { textAlign: 'left' | 'right' | 'center' } | undefined => {
      const a = aligns[idx];
      return a ? { textAlign: a } : undefined;
    };
    return (
      <div key={key} className="md-table-wrap">
        <table className="md-table">
          <thead>
            <tr>
              {headers.map((cell, idx) => (
                <th key={idx} style={cellStyle(idx)}>{renderInline(cell)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx}>
                {headers.map((_, cIdx) => (
                  <td key={cIdx} style={cellStyle(cIdx)}>{renderInline(row[cIdx] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
