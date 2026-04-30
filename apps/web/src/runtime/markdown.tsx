/**
 * A pocket-sized markdown renderer for assistant chat messages.
 *
 * We deliberately avoid a full parser library — chat output rarely uses
 * the long tail of markdown features and a hand-rolled walker keeps the
 * bundle slim. Block-level: ATX headings (# … ###), fenced code (```),
 * ordered (1.) and unordered (- / *) lists, paragraphs, blank-line
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
  | { kind: 'code'; lang: string | null; body: string }
  | { kind: 'hr' };

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
  // Order matters: inline code first so its contents are not re-tokenized
  // as bold/italic.
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|\[([^\]]+)\]\(([^)\s]+)\)/g;
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
    } else if (m[2]) {
      out.push(<strong key={key++}>{m[2].slice(2, -2)}</strong>);
    } else if (m[3]) {
      out.push(<strong key={key++}>{m[3].slice(2, -2)}</strong>);
    } else if (m[4]) {
      out.push(<em key={key++}>{m[4].slice(1, -1)}</em>);
    } else if (m[5]) {
      out.push(<em key={key++}>{m[5].slice(1, -1)}</em>);
    } else if (m[6] && m[7]) {
      out.push(
        <a
          key={key++}
          className="md-link"
          href={m[7]}
          target="_blank"
          rel="noreferrer noopener"
        >
          {m[6]}
        </a>,
      );
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
