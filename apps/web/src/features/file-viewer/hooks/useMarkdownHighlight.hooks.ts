// Feature-local hook for the markdown viewer's rendered-article behavior:
// shiki syntax highlighting of fenced code blocks (re-triggered on an OS/app
// theme change), the per-block copy-button DOM injection, and the click
// handler that copies a block's source and toggles its copied/toast state.
// Takes `baseHtml` (the viewer hook's rendered-but-unhighlighted output) as
// an input and produces the final `html` to render.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
} from 'react';
import {
  markdownCodeBlocksPort as realMarkdownCodeBlocksPort,
  shareLinkClipboardPort as realShareLinkClipboardPort,
  themeWatchPort as realThemeWatchPort,
} from '../dependencies';
import type { MarkdownCodeBlocksPort, ShareLinkClipboardPort, ThemeWatchPort } from '../ports';
import { MARKDOWN_COPY_BLOCK_ATTR } from '../constants';
import type { TranslateFn } from '../types';

export interface MarkdownHighlightController {
  /** The shiki-highlighted HTML when available, else `baseHtml` unchanged. */
  html: string | null;
  markdownArticleRef: MutableRefObject<HTMLElement | null>;
  handleMarkdownBodyClick: (event: ReactMouseEvent<HTMLElement>) => Promise<void>;
}

export function useMarkdownHighlight(
  codeBlocksPort: MarkdownCodeBlocksPort,
  themeWatchPort: ThemeWatchPort,
  clipboardPort: ShareLinkClipboardPort,
  baseHtml: string | null,
  t: TranslateFn,
): MarkdownHighlightController {
  const [highlightedHtml, setHighlightedHtml] = useState<{ source: string; html: string; themeRevision: number } | null>(null);
  const [highlightThemeRevision, setHighlightThemeRevision] = useState(0);
  const markdownArticleRef = useRef<HTMLElement | null>(null);
  const copyBlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedMarkdownBlockRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return themeWatchPort.subscribeThemeChange(() => {
      setHighlightThemeRevision((revision) => revision + 1);
    });
  }, [themeWatchPort]);

  useEffect(() => {
    if (!baseHtml) {
      setHighlightedHtml(null);
      return undefined;
    }
    let cancelled = false;
    codeBlocksPort.highlightCodeBlocks(baseHtml).then((nextHtml) => {
      if (cancelled) return;
      setHighlightedHtml(nextHtml === baseHtml ? null : { source: baseHtml, html: nextHtml, themeRevision: highlightThemeRevision });
    }).catch(() => {
      if (!cancelled) setHighlightedHtml(null);
    });
    return () => {
      cancelled = true;
    };
  }, [baseHtml, codeBlocksPort, highlightThemeRevision]);

  const html = highlightedHtml?.source === baseHtml && highlightedHtml.themeRevision === highlightThemeRevision
    ? highlightedHtml.html
    : baseHtml;

  useEffect(() => {
    const article = markdownArticleRef.current;
    if (!article) return;
    codeBlocksPort.ensureCodeBlockControls(article, t);
    if (copiedMarkdownBlockRef.current?.isConnected) {
      codeBlocksPort.setCodeBlockCopiedState(copiedMarkdownBlockRef.current, true, t);
    }
  }, [codeBlocksPort, html, t]);

  useEffect(() => {
    return () => {
      copiedMarkdownBlockRef.current = null;
      if (copyBlockTimerRef.current) {
        clearTimeout(copyBlockTimerRef.current);
      }
    };
  }, []);

  const handleMarkdownBodyClick = useCallback(async (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>(`button[${MARKDOWN_COPY_BLOCK_ATTR}]`);
    if (!button) return;
    const block = button.closest('.markdown-code-block');
    if (!(block instanceof HTMLElement)) return;
    const pre = block.querySelector('pre');
    if (!pre) return;
    const didCopy = await clipboardPort.copyToClipboard((pre.textContent ?? '').replace(/\n$/, ''));
    if (!didCopy) return;
    if (copiedMarkdownBlockRef.current && copiedMarkdownBlockRef.current !== block) {
      codeBlocksPort.setCodeBlockCopiedState(copiedMarkdownBlockRef.current, false, t);
    }
    copiedMarkdownBlockRef.current = block;
    codeBlocksPort.setCodeBlockCopiedState(block, true, t);
    if (copyBlockTimerRef.current) {
      clearTimeout(copyBlockTimerRef.current);
    }
    copyBlockTimerRef.current = setTimeout(() => {
      if (copiedMarkdownBlockRef.current) {
        codeBlocksPort.setCodeBlockCopiedState(copiedMarkdownBlockRef.current, false, t);
      }
      copiedMarkdownBlockRef.current = null;
      copyBlockTimerRef.current = null;
    }, 1800);
  }, [clipboardPort, codeBlocksPort, t]);

  return { html, markdownArticleRef, handleMarkdownBodyClick };
}

export function useWiredMarkdownHighlight(baseHtml: string | null, t: TranslateFn): MarkdownHighlightController {
  return useMarkdownHighlight(
    realMarkdownCodeBlocksPort,
    realThemeWatchPort,
    realShareLinkClipboardPort,
    baseHtml,
    t,
  );
}
