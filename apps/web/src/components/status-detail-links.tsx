import type { ReactNode } from 'react';

export function renderLinkedStatusDetail(detail: string): ReactNode {
  const segments: ReactNode[] = [];
  const urlRe = /(https?:\/\/[^\s)<>"}\]]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = urlRe.exec(detail))) {
    if (match.index > lastIndex) {
      segments.push(detail.slice(lastIndex, match.index));
    }
    const [href, suffix] = splitStatusDetailUrlPunctuation(match[1]!);
    segments.push(
      <a
        key={`url-${key++}`}
        className="md-link md-link-bare"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
      >
        {href}
      </a>,
    );
    if (suffix) segments.push(suffix);
    lastIndex = urlRe.lastIndex;
  }

  if (lastIndex < detail.length) {
    segments.push(detail.slice(lastIndex));
  }

  return <>{segments}</>;
}

function splitStatusDetailUrlPunctuation(url: string): [string, string] {
  const match = /([.,!?;:，。！？；：、'"」』】》〉）}\]]+)$/.exec(url);
  if (!match?.[1]) return [url, ''];
  const trimmed = url.slice(0, -match[1].length);
  return trimmed ? [trimmed, match[1]] : [url, ''];
}
