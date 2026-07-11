// Feature-local hook for the markdown viewer's split-pane scroll sync:
// anchors each top-level markdown block's source line to its rendered
// element and piecewise-linearly interpolates scroll position between those
// anchors (falling back to proportional/ratio sync when block anchors are
// unavailable). Takes `mode`/`editorRef` (owned by `useMarkdownViewer`) and
// `text`/`html` as inputs since the sync target depends on both panes' content.
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { markdownEditorMeasurePort as realMarkdownEditorMeasurePort } from '../dependencies';
import type { MarkdownEditorMeasurePort } from '../ports';
import {
  buildScrollAnchors,
  extractMarkdownBlockLines,
  mapScrollPosition,
  markdownScrollRange,
  markdownScrollRatio,
  markdownScrollTopForRatio,
  measurePreviewBlockOffsets,
} from '../rules';
import type { MarkdownScrollPane, MarkdownViewerMode } from '../types';

export interface MarkdownScrollSyncController {
  markdownPreviewPaneRef: MutableRefObject<HTMLElement | null>;
  handleMarkdownEditorScroll: () => void;
  handleMarkdownPreviewScroll: () => void;
  activateMarkdownScrollPane: (pane: MarkdownScrollPane) => void;
}

export function useMarkdownScrollSync(
  measurePort: MarkdownEditorMeasurePort,
  mode: MarkdownViewerMode,
  editorRef: MutableRefObject<HTMLTextAreaElement | null>,
  text: string | null,
  html: string | null,
): MarkdownScrollSyncController {
  const markdownPreviewPaneRef = useRef<HTMLElement | null>(null);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const programmaticScrollClearFrameRef = useRef<number | null>(null);
  const pendingScrollSyncRef = useRef<{ sourcePane: MarkdownScrollPane; targetPane: MarkdownScrollPane } | null>(null);
  const programmaticScrollRef = useRef<{ pane: MarkdownScrollPane; top: number } | null>(null);
  const activeMarkdownScrollPaneRef = useRef<MarkdownScrollPane>('editor');
  const editorBlockOffsetsRef = useRef<{ width: number; offsets: number[] } | null>(null);
  const previousModeRef = useRef<MarkdownViewerMode>('split');

  const markdownBlockLines = useMemo(() => extractMarkdownBlockLines(text ?? ''), [text]);

  // The cached editor block offsets become stale whenever the source text
  // changes (line positions move) — drop them so the next sync remeasures.
  useEffect(() => {
    editorBlockOffsetsRef.current = null;
  }, [text]);

  useEffect(() => {
    return () => {
      if (scrollSyncFrameRef.current) {
        cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
      if (programmaticScrollClearFrameRef.current) {
        cancelAnimationFrame(programmaticScrollClearFrameRef.current);
        programmaticScrollClearFrameRef.current = null;
      }
      pendingScrollSyncRef.current = null;
      programmaticScrollRef.current = null;
      activeMarkdownScrollPaneRef.current = 'editor';
    };
  }, []);

  const clearProgrammaticScrollSoon = useCallback(() => {
    if (programmaticScrollClearFrameRef.current) {
      cancelAnimationFrame(programmaticScrollClearFrameRef.current);
    }
    programmaticScrollClearFrameRef.current = requestAnimationFrame(() => {
      programmaticScrollClearFrameRef.current = requestAnimationFrame(() => {
        programmaticScrollRef.current = null;
        programmaticScrollClearFrameRef.current = null;
      });
    });
  }, []);

  const getEditorBlockOffsets = useCallback((): number[] | null => {
    const editor = editorRef.current;
    if (!editor || markdownBlockLines.length === 0) return null;
    const width = editor.clientWidth;
    const cached = editorBlockOffsetsRef.current;
    if (cached && cached.width === width && cached.offsets.length === markdownBlockLines.length) {
      return cached.offsets;
    }
    const offsets = measurePort.measureEditorBlockOffsets(editor, markdownBlockLines, text ?? '');
    if (!offsets) return null;
    editorBlockOffsetsRef.current = { width, offsets };
    return offsets;
  }, [editorRef, markdownBlockLines, measurePort, text]);

  // Align the panes by matching each top-level markdown block's source line to
  // its rendered element, then interpolating scroll position between those
  // anchors. Falls back to proportional (ratio) sync when block anchors are
  // unavailable (e.g. raw-HTML blocks change the rendered child count).
  const computeMarkdownSyncTarget = useCallback(
    (sourcePane: MarkdownScrollPane, source: HTMLElement, target: HTMLElement): number => {
      const previewPane = markdownPreviewPaneRef.current;
      if (markdownBlockLines.length > 0 && previewPane) {
        const editorOffsets = getEditorBlockOffsets();
        const previewOffsets = editorOffsets
          ? measurePreviewBlockOffsets(previewPane, markdownBlockLines.length)
          : null;
        if (editorOffsets && previewOffsets) {
          const isEditorSource = sourcePane === 'editor';
          const sourceOffsets = isEditorSource ? editorOffsets : previewOffsets;
          const targetOffsets = isEditorSource ? previewOffsets : editorOffsets;
          const sourceAnchors = buildScrollAnchors(sourceOffsets, source.scrollHeight);
          const targetAnchors = buildScrollAnchors(targetOffsets, target.scrollHeight);
          const mapped = mapScrollPosition(source.scrollTop, sourceAnchors, targetAnchors);
          return Math.max(0, Math.min(markdownScrollRange(target), mapped));
        }
      }
      return markdownScrollTopForRatio(target, markdownScrollRatio(source));
    },
    [getEditorBlockOffsets, markdownBlockLines],
  );

  const applyMarkdownScrollSync = useCallback(
    (sourcePane: MarkdownScrollPane, targetPane: MarkdownScrollPane) => {
      const source = sourcePane === 'editor' ? editorRef.current : markdownPreviewPaneRef.current;
      const target = targetPane === 'editor' ? editorRef.current : markdownPreviewPaneRef.current;
      if (mode !== 'split' || !source || !target) return;
      const targetTop = computeMarkdownSyncTarget(sourcePane, source, target);
      if (Math.abs(target.scrollTop - targetTop) < 1) return;
      programmaticScrollRef.current = { pane: targetPane, top: targetTop };
      target.scrollTop = targetTop;
      clearProgrammaticScrollSoon();
    },
    [clearProgrammaticScrollSoon, computeMarkdownSyncTarget, editorRef, mode],
  );

  const scheduleMarkdownScrollSync = useCallback(
    (sourcePane: MarkdownScrollPane, targetPane: MarkdownScrollPane) => {
      if (mode !== 'split') {
        pendingScrollSyncRef.current = null;
        return;
      }
      pendingScrollSyncRef.current = { sourcePane, targetPane };
      if (scrollSyncFrameRef.current !== null) return;
      scrollSyncFrameRef.current = requestAnimationFrame(() => {
        scrollSyncFrameRef.current = null;
        const pending = pendingScrollSyncRef.current;
        pendingScrollSyncRef.current = null;
        if (!pending) return;
        applyMarkdownScrollSync(pending.sourcePane, pending.targetPane);
      });
    },
    [applyMarkdownScrollSync, mode],
  );

  const shouldIgnoreMarkdownScroll = useCallback((pane: MarkdownScrollPane, element: HTMLElement): boolean => {
    const programmatic = programmaticScrollRef.current;
    if (programmatic?.pane !== pane) return false;
    if (Math.abs(element.scrollTop - programmatic.top) > 1 && activeMarkdownScrollPaneRef.current === pane) {
      return false;
    }
    programmaticScrollRef.current = null;
    return true;
  }, []);

  const handleMarkdownEditorScroll = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || shouldIgnoreMarkdownScroll('editor', editor)) return;
    activeMarkdownScrollPaneRef.current = 'editor';
    scheduleMarkdownScrollSync('editor', 'preview');
  }, [editorRef, scheduleMarkdownScrollSync, shouldIgnoreMarkdownScroll]);

  const handleMarkdownPreviewScroll = useCallback(() => {
    const previewPane = markdownPreviewPaneRef.current;
    if (!previewPane || shouldIgnoreMarkdownScroll('preview', previewPane)) return;
    if (activeMarkdownScrollPaneRef.current !== 'preview') return;
    scheduleMarkdownScrollSync('preview', 'editor');
  }, [scheduleMarkdownScrollSync, shouldIgnoreMarkdownScroll]);

  const activateMarkdownScrollPane = useCallback((pane: MarkdownScrollPane) => {
    activeMarkdownScrollPaneRef.current = pane;
  }, []);

  useEffect(() => {
    if (mode !== 'split') {
      if (scrollSyncFrameRef.current !== null) {
        cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
      if (programmaticScrollClearFrameRef.current !== null) {
        cancelAnimationFrame(programmaticScrollClearFrameRef.current);
        programmaticScrollClearFrameRef.current = null;
      }
      pendingScrollSyncRef.current = null;
      programmaticScrollRef.current = null;
      activeMarkdownScrollPaneRef.current = 'editor';
      previousModeRef.current = mode;
      return;
    }
    const sourcePane = activeMarkdownScrollPaneRef.current ?? (previousModeRef.current === 'preview' ? 'preview' : 'editor');
    const targetPane = sourcePane === 'preview' ? 'editor' : 'preview';
    scheduleMarkdownScrollSync(sourcePane, targetPane);
    previousModeRef.current = mode;
  }, [html, mode, scheduleMarkdownScrollSync]);

  return {
    markdownPreviewPaneRef,
    handleMarkdownEditorScroll,
    handleMarkdownPreviewScroll,
    activateMarkdownScrollPane,
  };
}

export function useWiredMarkdownScrollSync(
  mode: MarkdownViewerMode,
  editorRef: MutableRefObject<HTMLTextAreaElement | null>,
  text: string | null,
  html: string | null,
): MarkdownScrollSyncController {
  return useMarkdownScrollSync(realMarkdownEditorMeasurePort, mode, editorRef, text, html);
}
