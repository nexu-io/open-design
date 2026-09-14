import { memo, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { renderMarkdown } from '../../runtime/markdown';
import { useCharReveal } from './useCharReveal';
import styles from './ThinkingMarkdown.module.css';

/**
 * A live model can produce dozens of thinking deltas per second. Parsing the
 * entire accumulated Markdown for every delta makes a long stream quadratic
 * and replaces a large React subtree more often than a display can paint.
 * Ten commits per second is still visibly live while placing a hard ceiling on
 * full-document Markdown parses and DOM commits.
 */
export const THINKING_MARKDOWN_COMMIT_MS = 100;

export interface ThinkingMarkdownProps {
  texts: readonly string[];
  live: boolean;
}

export function ThinkingMarkdown({ texts, live }: ThinkingMarkdownProps): ReactElement | null {
  const source = texts.join('\n\n').trim();
  const snapshot = useCoalescedSnapshot(source, live);
  if (!snapshot) return null;
  return <RenderedThinkingMarkdown text={snapshot} live={live} />;
}

/**
 * Keep the scheduler separate from the parsed subtree. The outer component is
 * intentionally cheap and may receive every delta; this memoized child only
 * renders when the coalesced string changes, so neither Markdown parsing nor
 * `useCharReveal` walks the DOM for discarded intermediate deltas.
 */
const RenderedThinkingMarkdown = memo(function RenderedThinkingMarkdown({
  text,
  live,
}: {
  text: string;
  live: boolean;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  useCharReveal(rootRef, live);
  const content = useMemo(
    () => renderMarkdown(text, { syntaxHighlight: !live }),
    [live, text],
  );

  return (
    <div ref={rootRef} className={styles.think} data-testid="thinking-markdown">
      {content}
    </div>
  );
});

function useCoalescedSnapshot(source: string, live: boolean): string {
  const [snapshot, setSnapshot] = useState(source);
  const latestRef = useRef(source);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  latestRef.current = source;

  useEffect(() => {
    if (!live) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Keep state aligned with the immediately rendered final source. This
      // matters if the same component instance becomes live again (preview
      // replay / status correction): it must resume from the final text, not
      // from the last throttled snapshot that preceded completion.
      if (snapshot !== source) setSnapshot(source);
      return;
    }
    if (snapshot === source || timerRef.current !== null) return;

    // This is a fixed-window throttle, not a debounce: a continuous ds-v4-flash
    // stream still becomes visible every 100ms instead of being starved until
    // the model stops.
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setSnapshot(latestRef.current);
    }, THINKING_MARKDOWN_COMMIT_MS);
  }, [live, snapshot, source]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  // The completion frame must never wait behind the throttle. It also enables
  // syntax highlighting, which is deliberately skipped while the fence grows.
  return live ? snapshot : source;
}
