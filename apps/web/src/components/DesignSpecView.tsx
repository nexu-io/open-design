import { useMemo } from 'react';

interface Props {
  source: string | null | undefined;
  loading?: boolean;
  loadingLabel: string;
}

// Render a DESIGN.md as a lightly syntax-coloured monospace source view —
// the right-hand panel of the preview modal, mirroring the layout used by
// styles.refero.design where the rendered showcase sits next to the spec
// text. Highlights are CSS-class only; no innerHTML for untrusted text.
export function DesignSpecView({ source, loading, loadingLabel }: Props) {
  const lines = useMemo(() => (source ? source.split(/\r?\n/) : []), [source]);

  if (loading || source === undefined || source === null) {
    return <div className="design-spec-empty">{loadingLabel}</div>;
  }

  return (
    <pre className="design-spec-pre">
      <code>
        {lines.map((line, idx) => (
          <span key={idx} className={`design-spec-line ${classifyLine(line)}`}>
            {renderInline(line)}
            {'\n'}
          </span>
        ))}
      </code>
    </pre>
  );
}

function classifyLine(line: string): string {
  if (/^#{1,6}\s+/.test(line)) {
    const hashes = /^(#+)\s/.exec(line)?.[1]?.length ?? 1;
    return `is-h${Math.min(hashes, 4)}`;
  }
  if (/^>\s/.test(line)) return 'is-quote';
  if (/^[-*+]\s/.test(line.trimStart())) return 'is-list';
  if (/^\|.*\|\s*$/.test(line)) return 'is-table';
  if (/^\s*```/.test(line)) return 'is-fence';
  if (/^\s*$/.test(line)) return 'is-blank';
  return '';
}

const TOKEN_RE = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|#[0-9a-fA-F]{3,8}\b)/g;

function renderInline(line: string) {
  if (!line) return null;
  const out: (string | JSX.Element)[] = [];
  let last = 0;
  let key = 0;
  for (const match of line.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(line.slice(last, start));
    const token = match[0];
    if (token.startsWith('**')) {
      out.push(
        <span key={key++} className="md-tk-bold">
          {token.slice(2, -2)}
        </span>,
      );
    } else if (token.startsWith('*')) {
      out.push(
        <span key={key++} className="md-tk-em">
          {token.slice(1, -1)}
        </span>,
      );
    } else if (token.startsWith('`')) {
      out.push(
        <span key={key++} className="md-tk-code">
          {token.slice(1, -1)}
        </span>,
      );
    } else if (token.startsWith('#')) {
      out.push(
        <span key={key++} className="md-tk-color" style={{ color: 'inherit' }}>
          <span
            className="md-tk-color-swatch"
            style={{ backgroundColor: token }}
            aria-hidden
          />
          {token}
        </span>,
      );
    } else {
      out.push(token);
    }
    last = start + token.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
