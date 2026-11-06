import { useCallback, useEffect, useRef } from "react";
import { usePlayerStore } from "../player";
import type { TimelineElement } from "../player";
import type { DomEditSelection } from "../components/editor/domEditing";
import { dispatchLinkShortcut, type LinkShortcutCallbacks } from "./linkShortcuts";
import { useCaptionStore } from "../captions/store";
import {
  applyCaptionModelToIframe,
  isCaptionPreviewVisible,
} from "../captions/components/CaptionOverlayUtils";
import { type HotkeyCallbacks, dispatchModifierKey, dispatchPlainKey } from "./appHotkeysDispatch";
import {
  useEditHistoryActions,
  type EditHistoryHandle,
  type UseEditHistoryActionsOptions,
} from "./useEditHistoryActions";
import { useStableHandlers } from "./useStableHandlers";

function iframeContentWindow(iframe: HTMLIFrameElement | null): Window | null {
  try {
    return iframe?.contentWindow ?? null;
  } catch {
    return null;
  }
}

function safeAddListener(t: EventTarget | null, type: string, h: EventListener, capture = false) {
  try {
    t?.addEventListener(type, h, capture);
  } catch {
    /* cross-origin */
  }
}
function safeRemoveListener(
  t: EventTarget | null,
  type: string,
  h: EventListener,
  capture = false,
) {
  try {
    t?.removeEventListener(type, h, capture);
  } catch {
    /* cross-origin */
  }
}

// Beat edits live in an in-memory stack interleaved with file history by
// timestamp. Undo steps to the NEWER op (beatAt >= fileAt); redo replays the
// inverse, stepping to the OLDER op (beatAt <= fileAt). Returns true when it
// handled the keystroke (so the file-history path is skipped).
// fallow-ignore-next-line complexity
function tryApplyBeatHistory(
  direction: "undo" | "redo",
  fileState: {
    undo: ReadonlyArray<{ createdAt: number }>;
    redo: ReadonlyArray<{ createdAt: number }>;
  },
  showToast: (message: string, tone?: "error" | "info") => void,
): boolean {
  const ps = usePlayerStore.getState();
  const beatStack = direction === "undo" ? ps.beatUndo : ps.beatRedo;
  const beatAt = beatStack[beatStack.length - 1]?.at ?? null;
  if (beatAt === null) return false;
  const fileStack = fileState[direction];
  const fileAt = fileStack[fileStack.length - 1]?.createdAt ?? null;
  if (fileAt !== null && (direction === "undo" ? beatAt < fileAt : beatAt > fileAt)) return false;
  const label = direction === "undo" ? ps.undoBeatEdits() : ps.redoBeatEdits();
  if (label) showToast(`${direction === "undo" ? "Undid" : "Redid"} ${label}`, "info");
  return true;
}

// ── Types ──

interface UseAppHotkeysParams {
  projectId?: string | null;
  handleTimelineElementsDelete: (elements: TimelineElement[]) => Promise<void>;
  handleLinkEdit?: LinkShortcutCallbacks["handleLinkEdit"];
  handleTimelineElementDeleteOnly?: LinkShortcutCallbacks["handleTimelineElementDeleteOnly"];
  handleTimelineElementSplit: (element: TimelineElement, splitTime: number) => Promise<void>;
  handleDomEditElementDelete: (
    selection: DomEditSelection,
    options?: { expandGroup?: boolean },
  ) => Promise<void>;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  clearDomSelectionRef: React.MutableRefObject<() => void>;
  editHistory: EditHistoryHandle;
  readOptionalProjectFile: (path: string) => Promise<string>;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  showToast: (message: string, tone?: "error" | "info") => void;
  syncHistoryPreviewAfterApply: UseEditHistoryActionsOptions["syncHistoryPreviewAfterApply"];
  showHistoryRestoreNow?: UseEditHistoryActionsOptions["showHistoryRestoreNow"];
  settlePendingEdits: () => Promise<void>;
  handleCopy: () => boolean;
  handlePaste: () => Promise<void>;
  handleCut: () => Promise<boolean>;
  handleDuplicate: () => Promise<boolean>;
  onResetKeyframes: () => boolean;
  onDeleteSelectedKeyframes: () => void;
  onAfterUndoRedo?: UseEditHistoryActionsOptions["onAfterUndoRedo"];
  onToggleRecording?: () => void;
  /** Group the current multi-selection into a data-hf-group wrapper (⌘G). */
  onGroupSelection?: () => void;
  /** Ungroup the selected group wrapper (⌘⇧G). */
  onUngroupSelection?: () => void;
  /** Active composition path — used to decide whether undo/redo must resync the SDK session. */
  activeCompPath?: string | null;
  /** Clicks still select and report; the preview cannot move, edit or delete anything. */
  readOnlyPreview: boolean;
  /**
   * Force-reload the SDK session after undo/redo reverts the active comp file,
   * bypassing the self-write suppress window. Without this, the suppress window
   * blocks the file-change reload and the SDK session stays on pre-undo content.
   */
  forceReloadSdkSession?: () => void;
}

// ── Hook ──

export function useAppHotkeys({
  projectId,
  handleTimelineElementsDelete,
  handleLinkEdit,
  handleTimelineElementDeleteOnly,
  handleTimelineElementSplit,
  handleDomEditElementDelete,
  domEditSelectionRef,
  editHistory,
  readOptionalProjectFile,
  readProjectFile,
  writeProjectFile,
  showToast,
  syncHistoryPreviewAfterApply,
  showHistoryRestoreNow,
  settlePendingEdits,
  handleCopy,
  handlePaste,
  handleCut,
  handleDuplicate,
  onResetKeyframes,
  onDeleteSelectedKeyframes,
  onAfterUndoRedo,
  onToggleRecording,
  onGroupSelection,
  onUngroupSelection,
  activeCompPath,
  forceReloadSdkSession,
  readOnlyPreview,
}: UseAppHotkeysParams) {
  const previewHistoryCleanupRef = useRef<(() => void) | null>(null);

  // ── Undo / Redo ──

  const fileHistory = useEditHistoryActions({
    editHistory,
    readOptionalProjectFile,
    readProjectFile,
    writeProjectFile,
    showToast,
    syncHistoryPreviewAfterApply,
    showHistoryRestoreNow,
    waitForPendingDomEditSaves: settlePendingEdits,
    onAfterUndoRedo,
    activeCompPath,
    forceReloadSdkSession,
  });

  const applyHistory = useCallback(
    async (direction: "undo" | "redo") => {
      // Caption edits live in their own in-memory stack. While caption edit
      // mode is active, ⌘Z must revert the caption edit — not an unrelated
      // earlier file edit (which would ALSO leave the caption change intact).
      const captionState = useCaptionStore.getState();
      // Only when the caption preview is actually visible: isEditMode stays
      // true while the preview is hidden, and eating ⌘Z
      // there would pop invisible caption edits instead of file history.
      if (captionState.isEditMode && isCaptionPreviewVisible()) {
        const restored = direction === "undo" ? captionState.undo() : captionState.redo();
        if (restored) {
          applyCaptionModelToIframe(restored);
          showToast(`${direction === "undo" ? "Undid" : "Redid"} caption edit`, "info");
          return;
        }
        // Empty caption stack: fall through to beat/file history as usual.
      }

      // Beat edits interleave with file history by timestamp; handle them first.
      if (tryApplyBeatHistory(direction, editHistory.state, showToast)) return;

      await fileHistory[direction]();
    },
    [editHistory.state, fileHistory, showToast],
  );

  const handleUndo = useCallback(() => applyHistory("undo"), [applyHistory]);
  const handleRedo = useCallback(() => applyHistory("redo"), [applyHistory]);

  // ── Stable callback ref (one ref replaces fifteen) ──

  const cbRef = useRef<HotkeyCallbacks>(null!);
  cbRef.current = {
    handleTimelineElementsDelete,
    handleLinkEdit,
    handleTimelineElementDeleteOnly,
    handleTimelineElementSplit,
    handleDomEditElementDelete,
    handleUndo,
    handleRedo,
    handleCopy,
    handlePaste,
    handleCut,
    handleDuplicate,
    onResetKeyframes,
    onDeleteSelectedKeyframes,
    onToggleRecording,
    onGroupSelection,
    onUngroupSelection,
    domEditSelectionRef,
    showToast,
    readOnlyPreview,
  };

  // ── Keydown dispatch ──

  const handleAppKeyDown = useCallback((event: KeyboardEvent) => {
    const cb = cbRef.current;
    const key = event.key.toLowerCase();
    if (dispatchLinkShortcut(event, cb)) return;
    if (dispatchModifierKey(event, key, cb)) return;
    dispatchPlainKey(event, key, cb);
  }, []);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    window.addEventListener("keydown", handleAppKeyDown, true);
    return () => window.removeEventListener("keydown", handleAppKeyDown, true);
  }, [handleAppKeyDown]);

  // ── Preview iframe forwarding ──

  /**
   * Give the preview iframe the app's hotkeys: clicking the canvas puts focus in there.
   * Runs on every iframe LOAD: a reload keeps the element and WindowProxy but replaces the
   * inner window holding the listeners, which once left Delete dead after the first reload.
   */
  const syncPreviewHotkeys = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      previewHistoryCleanupRef.current?.();
      previewHistoryCleanupRef.current = null;
      const win = iframeContentWindow(iframe);
      if (!win) return;
      const appHandler = handleAppKeyDown as EventListener;
      // Window only: a capture listener on the document too would run it twice per press.
      safeAddListener(win, "keydown", appHandler, true);
      previewHistoryCleanupRef.current = () => safeRemoveListener(win, "keydown", appHandler, true);
    },
    [handleAppKeyDown],
  );

  useEffect(
    () => () => {
      previewHistoryCleanupRef.current?.();
      previewHistoryCleanupRef.current = null;
    },
    [],
  );

  return useStableHandlers(
    {
      handleUndo,
      handleRedo,
      syncPreviewHotkeys,
    },
    projectId,
  );
}
