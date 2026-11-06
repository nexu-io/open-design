import { automationOwnsKey } from "./useAutomationSelectionKeyboard";
import { usePlayerStore } from "../player";
import type { TimelineElement } from "../player";
import type { DomEditSelection } from "../components/editor/domEditing";
import { useDockLayoutStore } from "../components/dock/dockLayoutStore";
import { isTypingTarget, ownsPlainKeys } from "../utils/typingTarget";
import { isEditableTarget } from "../utils/timelineDiscovery";
import { shouldIgnoreHistoryShortcut } from "../utils/studioHelpers";
import { canSplitElement } from "../utils/timelineElementSplit";
import { trackStudioEvent } from "../utils/studioTelemetry";
import { razorClaimsKey } from "../player/lib/playbackShortcuts";
import { getStudioKeys, keyHint, matchesKey } from "../player/components/studioShortcuts";
import { zoomTimelineToSelectedClips } from "../player/components/timelineZoomInput";
import { openAudioGainDialog } from "../player/components/audioGainDialogStore";
import type { LinkShortcutCallbacks } from "./linkShortcuts";

// Extracted from useAppHotkeys.ts to keep it under the studio 600-line cap,
// following useTimelineDeleteOps's precedent. Pure functions, no hooks — the
// hook still owns the actual keydown listeners and calls into these.

function handleUndoRedoKey(event: KeyboardEvent, onUndo: () => void, onRedo: () => void): boolean {
  const isUndo = matchesKey(event, "undo");
  if (!isUndo && !matchesKey(event, "redo") && !matchesKey(event, "redoAlt")) return false;
  event.preventDefault();
  (isUndo ? onUndo : onRedo)();
  return true;
}

export interface HotkeyCallbacks extends LinkShortcutCallbacks {
  handleTimelineElementsDelete: (elements: TimelineElement[]) => Promise<void>;
  handleTimelineElementSplit: (element: TimelineElement, splitTime: number) => Promise<void>;
  handleDomEditElementDelete: (
    selection: DomEditSelection,
    options?: { expandGroup?: boolean },
  ) => Promise<void>;
  handleUndo: () => Promise<void>;
  handleRedo: () => Promise<void>;
  handleCopy: () => boolean;
  handlePaste: () => Promise<void>;
  handleCut: () => Promise<boolean>;
  handleDuplicate: () => Promise<boolean>;
  onResetKeyframes: () => boolean;
  onDeleteSelectedKeyframes: () => void;
  onToggleRecording?: () => void;
  onGroupSelection?: () => void;
  onUngroupSelection?: () => void;
  domEditSelectionRef: React.MutableRefObject<DomEditSelection | null>;
  showToast: (message: string, tone?: "error" | "info") => void;
  readOnlyPreview: boolean;
}

function timelineOwnsKey(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest("[data-studio-timeline]") !== null;
}

function dispatchTabKey(event: KeyboardEvent): boolean {
  const tab = matchesKey(event, "tabCompositions")
    ? ["tab_compositions", "compositions"]
    : matchesKey(event, "tabAssets")
      ? ["tab_assets", "assets"]
      : null;
  if (!tab) return false;
  event.preventDefault();
  trackStudioEvent("keyboard_shortcut", { action: tab[0] });
  useDockLayoutStore.getState().activatePanel(tab[1] as "compositions" | "assets");
  return true;
}

function dispatchGroupKey(event: KeyboardEvent, cb: HotkeyCallbacks): boolean {
  const group = matchesKey(event, "group");
  if (!group && !matchesKey(event, "ungroup")) return false;
  if (isTypingTarget(event.target)) return false;
  event.preventDefault();
  if (cb.readOnlyPreview) return true;
  if (group) cb.onGroupSelection?.();
  else cb.onUngroupSelection?.();
  return true;
}

function dispatchClipboardKey(event: KeyboardEvent, cb: HotkeyCallbacks): boolean {
  if (isEditableTarget(event.target)) return false;
  const copy = matchesKey(event, "copy");
  const paste = matchesKey(event, "paste");
  const cut = matchesKey(event, "cut");
  const duplicate = matchesKey(event, "duplicate");
  if (!copy && !paste && !cut && !duplicate) return false;
  // An active automation range owns copy/paste: this capture listener runs before its own, so without
  // this both clipboards raced the same key. No preventDefault, so the downstream handler still sees it.
  if (automationOwnsKey(event)) return true;
  if (copy) {
    if (cb.handleCopy()) {
      event.preventDefault();
      trackStudioEvent("keyboard_shortcut", { action: "copy" });
    }
    return true;
  }
  if (cb.readOnlyPreview && cb.domEditSelectionRef.current !== null && !timelineOwnsKey(event)) {
    event.preventDefault();
    return true;
  }
  const hasSelection =
    usePlayerStore.getState().selectedElementId || cb.domEditSelectionRef.current;
  if (paste) {
    event.preventDefault();
    trackStudioEvent("keyboard_shortcut", { action: "paste" });
    void cb.handlePaste();
  } else if (cut && hasSelection) {
    event.preventDefault();
    trackStudioEvent("keyboard_shortcut", { action: "cut" });
    void cb.handleCut();
  } else if (duplicate) {
    // Own this key even with nothing selected, or the browser's bookmark shortcut fires over the editor.
    event.preventDefault();
    if (usePlayerStore.getState().selectedElementId) {
      trackStudioEvent("keyboard_shortcut", { action: "duplicate" });
      void cb.handleDuplicate();
    }
  }
  return true;
}

/** Exported for tests: the shortcuts that act on the editor, each read as a combo at event time. */
export function dispatchModifierKey(
  event: KeyboardEvent,
  _key: string,
  cb: HotkeyCallbacks,
): boolean {
  if (!shouldIgnoreHistoryShortcut(event.target)) {
    const handled = handleUndoRedoKey(
      event,
      () => {
        trackStudioEvent("keyboard_shortcut", { action: "undo" });
        void cb.handleUndo();
      },
      () => {
        trackStudioEvent("keyboard_shortcut", { action: "redo" });
        void cb.handleRedo();
      },
    );
    if (handled) return true;
  }
  return dispatchTabKey(event) || dispatchGroupKey(event, cb) || dispatchClipboardKey(event, cb);
}

// fallow-ignore-next-line complexity
/** Exported for tests: the unmodified-key half of the dispatcher, so the
 *  Delete arbitration between keyframes, an automation range and the clip can
 *  be asserted without standing up the whole hook. */
export function dispatchPlainKey(event: KeyboardEvent, _key: string, cb: HotkeyCallbacks): void {
  if (ownsPlainKeys(event.target)) return;
  const keys = getStudioKeys();
  if (matchesKey(event, "zoomSelection")) {
    if (!zoomTimelineToSelectedClips()) return;
    event.preventDefault();
    return;
  }

  if (matchesKey(event, "fullscreen")) {
    event.preventDefault();
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      document.querySelector<HTMLElement>("[data-studio-fullscreen-target]")?.requestFullscreen();
    return;
  }

  if (matchesKey(event, "split")) {
    // Reserve bare `s` for Split even when the current selection cannot split,
    // so secondary listeners do not reinterpret the same key as Snap toggle.
    event.preventDefault();
    if (cb.readOnlyPreview) return;
    const { selectedElementId, elements, currentTime } = usePlayerStore.getState();
    if (selectedElementId) {
      const el = elements.find((e) => (e.key ?? e.id) === selectedElementId);
      if (
        el &&
        canSplitElement(el) &&
        currentTime > el.start &&
        currentTime < el.start + el.duration
      ) {
        void cb.handleTimelineElementSplit(el, currentTime);
        return;
      }
      // Expanded sub-comp children carry a qualified `sourceFile#id` selection
      // that isn't in the raw `elements` list, so the s-key can't resolve them.
      // Nudge toward the razor tool instead of failing silently.
      if (!el && selectedElementId.includes("#")) {
        cb.showToast(
          `Use the razor tool (${keyHint("razorTool", keys)}) to split clips inside a sub-composition`,
          "info",
        );
        return;
      }
    }
  }

  // Only with a sound clip selected, so bare G still reaches the canvas grid toggle otherwise.
  if (matchesKey(event, "audioGain")) {
    if (!cb.readOnlyPreview && openAudioGainDialog()) {
      event.preventDefault();
      return;
    }
  }

  if (matchesKey(event, "razorTool")) {
    event.preventDefault();
    const { activeTool, setActiveTool } = usePlayerStore.getState();
    setActiveTool(activeTool === "razor" ? "select" : "razor");
    return;
  }

  if (matchesKey(event, "selectTool")) {
    event.preventDefault();
    usePlayerStore.getState().setActiveTool("select");
    return;
  }

  const leftward = matchesKey(event, "selectLeftward");
  if (leftward || matchesKey(event, "selectRightward")) {
    event.preventDefault();
    const store = usePlayerStore.getState();
    if (leftward) store.selectLeftward();
    else store.selectRightward();
    return;
  }

  // CapCut returns to the select tool with "A"; playback's seek-to-in asks the same razorClaimsKey.
  if (razorClaimsKey(event)) {
    event.preventDefault();
    usePlayerStore.getState().setActiveTool("select");
    return;
  }

  if (matchesKey(event, "cancel")) {
    const { activeTool, selectedElementId, setActiveTool, setSelectedElementId } =
      usePlayerStore.getState();
    if (activeTool === "razor") {
      if (selectedElementId) setSelectedElementId(null);
      else setActiveTool("select");
      event.preventDefault();
      return;
    }
  }

  if (matchesKey(event, "deleteSelected") || matchesKey(event, "deleteSelectedAlt")) {
    if (usePlayerStore.getState().selectedKeyframes.size > 0) {
      cb.onDeleteSelectedKeyframes();
      usePlayerStore.getState().clearSelectedKeyframes();
      event.preventDefault();
      return;
    }
    // An active automation range owns Delete (empties the range in place).
    // No preventDefault: this capture listener runs first, so falling through
    // is what lets the document-level handler still see the key instead of
    // the press reaching the clip delete below.
    if (usePlayerStore.getState().automationSelection) return;
    if (matchesKey(event, "resetKeyframes")) {
      const { selectedElementId, keyframeCache } = usePlayerStore.getState();
      if (selectedElementId && keyframeCache.has(selectedElementId) && cb.onResetKeyframes()) {
        event.preventDefault();
        return;
      }
    }
    // The canvas selection owns Delete first: the timeline mirror of it is
    // lossy (drops a member with no timeline row of its own), so deleting via
    // the timeline left other selected elements behind. Timeline stays as the
    // fallback for rows with no canvas node (audio, an inactive comp).
    const domSel = cb.domEditSelectionRef.current;
    const timelineOwnsDelete = timelineOwnsKey(event);
    if (domSel && !timelineOwnsDelete) {
      event.preventDefault();
      if (cb.readOnlyPreview) return;
      // The whole marquee group, not just the primary the ref holds.
      void cb.handleDomEditElementDelete(domSel, { expandGroup: true });
      return;
    }
    // Takes the WHOLE selection: `find` returned the first match, so selecting
    // every clip and pressing Delete removed exactly one of them.
    const { selectedElementId, selectedElementIds, elements } = usePlayerStore.getState();
    const selectionKeys = new Set(selectedElementIds);
    if (selectedElementId) selectionKeys.add(selectedElementId);
    const selected = elements.filter((e) => selectionKeys.has(e.key ?? e.id));
    if (selected.length > 0) {
      event.preventDefault();
      void cb.handleTimelineElementsDelete(selected);
    }
    return;
  }

  if (matchesKey(event, "record") && cb.onToggleRecording) {
    event.preventDefault();
    cb.onToggleRecording();
  }
}
