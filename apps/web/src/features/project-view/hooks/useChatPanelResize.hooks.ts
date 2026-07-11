// Feature-local hook for the chat/workspace split-panel resize interaction:
// owns the panel-width state, the drag/keyboard resize math, and the
// saved-width persistence. Every DOM side-effect (ResizeObserver / window
// resize fallback, computed-style RTL detection, pointer-capture drag
// listeners) is reached through the injected `ProjectViewTransportPort`, so
// the hook stays DOM-free and unit-tests against a fake.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CHAT_PANEL_KEYBOARD_STEP,
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  MIN_WORKSPACE_PANEL_WIDTH,
} from '../constants';
import {
  applySplitChatPanelWidth,
  clampChatPanelWidth,
  clampPreferredChatPanelWidth,
  maxChatPanelWidthForSplit,
  workspacePanelMinWidthForSplit,
  workspacePanelTrackFor,
} from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface ChatPanelResizeController {
  splitRef: MutableRefObject<HTMLDivElement | null>;
  chatPanelWidth: number;
  /** Mirrors `chatPanelWidth` but updates synchronously on every drag frame
   *  (a drag applies its width via a direct DOM mutation, skipping a
   *  `chatPanelWidth` state commit, for performance) — read this instead of
   *  `chatPanelWidth` wherever a mid-drag re-render must not redraw a stale
   *  committed width over the live one. */
  chatPanelWidthRef: MutableRefObject<number>;
  chatPanelMaxWidth: number;
  workspacePanelMinWidth: number;
  workspacePanelTrack: string;
  resizingChatPanel: boolean;
  chatPanelAriaMinWidth: number;
  handleChatResizePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleChatResizeBlur: () => void;
  handleChatResizeKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

export function useChatPanelResize(port: ProjectViewTransportPort): ChatPanelResizeController {
  const [chatPanelWidth, setChatPanelWidth] = useState(() => port.readSavedChatPanelWidth());
  const [chatPanelMaxWidth, setChatPanelMaxWidth] = useState(MAX_CHAT_PANEL_WIDTH);
  const [workspacePanelMinWidth, setWorkspacePanelMinWidth] = useState(MIN_WORKSPACE_PANEL_WIDTH);
  const [resizingChatPanel, setResizingChatPanel] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const chatPanelWidthRef = useRef(chatPanelWidth);
  const preferredChatPanelWidthRef = useRef(chatPanelWidth);
  const resizeStartPreferredWidthRef = useRef(chatPanelWidth);
  const chatPanelMaxWidthRef = useRef(chatPanelMaxWidth);
  const resizeStateRef = useRef<{
    startClientX: number;
    startWidth: number;
    isRtl: boolean;
    hasMoved: boolean;
  } | null>(null);
  const stopPointerDragRef = useRef<(() => void) | null>(null);

  const workspacePanelTrack = workspacePanelTrackFor(workspacePanelMinWidth);

  const renderPreferredChatPanelWidth = useCallback(
    (
      preferredWidth: number,
      maxWidth = chatPanelMaxWidthRef.current,
      options: { commitState?: boolean } = {},
    ): number => {
      const next = clampChatPanelWidth(preferredWidth, maxWidth);
      chatPanelWidthRef.current = next;
      applySplitChatPanelWidth(splitRef.current, next, workspacePanelTrack);
      if (options.commitState !== false) setChatPanelWidth(next);
      return next;
    },
    [workspacePanelTrack],
  );

  const applyChatPanelWidth = useCallback(
    (width: number, options: { commitState?: boolean } = {}): number => {
      const nextPreferred = clampPreferredChatPanelWidth(
        clampChatPanelWidth(width, chatPanelMaxWidthRef.current),
      );
      preferredChatPanelWidthRef.current = nextPreferred;
      return renderPreferredChatPanelWidth(nextPreferred, chatPanelMaxWidthRef.current, options);
    },
    [renderPreferredChatPanelWidth],
  );

  const finishChatPanelResize = useCallback(
    (saveFinalWidth = true) => {
      stopPointerDragRef.current?.();
      stopPointerDragRef.current = null;
      resizeStateRef.current = null;
      setResizingChatPanel(false);
      if (saveFinalWidth) {
        const finalWidth = renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current);
        port.saveChatPanelWidth(finalWidth);
      }
    },
    [port, renderPreferredChatPanelWidth],
  );

  useEffect(() => {
    chatPanelWidthRef.current = chatPanelWidth;
    applySplitChatPanelWidth(splitRef.current, chatPanelWidth, workspacePanelTrack);
  }, [chatPanelWidth, workspacePanelTrack]);

  useEffect(() => {
    chatPanelMaxWidthRef.current = chatPanelMaxWidth;
  }, [chatPanelMaxWidth]);

  useLayoutEffect(() => {
    const split = splitRef.current;
    if (!split) return undefined;
    return port.subscribeSplitResize(split, (splitWidth) => {
      const nextWorkspaceMin = workspacePanelMinWidthForSplit(splitWidth);
      const nextMax = maxChatPanelWidthForSplit(splitWidth);
      chatPanelMaxWidthRef.current = nextMax;
      setWorkspacePanelMinWidth(nextWorkspaceMin);
      setChatPanelMaxWidth(nextMax);
      renderPreferredChatPanelWidth(preferredChatPanelWidthRef.current, nextMax);
    });
  }, [port, renderPreferredChatPanelWidth]);

  useEffect(() => () => finishChatPanelResize(false), [finishChatPanelResize]);

  const handleChatResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      const split = splitRef.current;
      if (!split) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      stopPointerDragRef.current?.();
      setResizingChatPanel(true);
      resizeStartPreferredWidthRef.current = preferredChatPanelWidthRef.current;

      resizeStateRef.current = {
        startClientX: event.clientX,
        startWidth: chatPanelWidthRef.current,
        isRtl: port.getSplitIsRtl(split),
        hasMoved: false,
      };

      stopPointerDragRef.current = port.subscribeChatPanelPointerDrag({
        onMove: (clientX) => {
          const state = resizeStateRef.current;
          if (!state) return;
          const delta = clientX - state.startClientX;
          if (delta === 0 && !state.hasMoved) return;
          state.hasMoved = true;
          const rawWidth = state.startWidth + (state.isRtl ? -delta : delta);
          applyChatPanelWidth(rawWidth, { commitState: false });
        },
        onEnd: () => finishChatPanelResize(true),
        onCancel: () => {
          preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
          renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
          finishChatPanelResize(false);
        },
      });
    },
    [applyChatPanelWidth, finishChatPanelResize, port, renderPreferredChatPanelWidth],
  );

  const handleChatResizeBlur = useCallback(() => {
    if (!stopPointerDragRef.current) return;
    preferredChatPanelWidthRef.current = resizeStartPreferredWidthRef.current;
    renderPreferredChatPanelWidth(resizeStartPreferredWidthRef.current);
    finishChatPanelResize(false);
  }, [finishChatPanelResize, renderPreferredChatPanelWidth]);

  const handleChatResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      let nextWidth: number | null = null;
      const isRtl = port.getSplitIsRtl(splitRef.current);
      if (event.key === 'ArrowLeft') {
        nextWidth = chatPanelWidthRef.current + (isRtl ? 1 : -1) * CHAT_PANEL_KEYBOARD_STEP;
      } else if (event.key === 'ArrowRight') {
        nextWidth = chatPanelWidthRef.current + (isRtl ? -1 : 1) * CHAT_PANEL_KEYBOARD_STEP;
      } else if (event.key === 'Home') {
        nextWidth = MIN_CHAT_PANEL_WIDTH;
      } else if (event.key === 'End') {
        nextWidth = chatPanelMaxWidthRef.current;
      }
      if (nextWidth === null) return;
      event.preventDefault();
      const next = applyChatPanelWidth(nextWidth);
      port.saveChatPanelWidth(next);
    },
    [applyChatPanelWidth, port],
  );

  const chatPanelAriaMinWidth = Math.min(MIN_CHAT_PANEL_WIDTH, chatPanelMaxWidth);

  return {
    splitRef,
    chatPanelWidth,
    chatPanelWidthRef,
    chatPanelMaxWidth,
    workspacePanelMinWidth,
    workspacePanelTrack,
    resizingChatPanel,
    chatPanelAriaMinWidth,
    handleChatResizePointerDown,
    handleChatResizeBlur,
    handleChatResizeKeyDown,
  };
}

/** Wirer: binds the real chat-panel-resize transport port; swap in tests. */
export function useWiredChatPanelResize(): ChatPanelResizeController {
  return useChatPanelResize(projectViewTransportPort);
}
