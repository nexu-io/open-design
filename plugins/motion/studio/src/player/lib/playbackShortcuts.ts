/**
 * Keyboard shortcut filtering logic for playback controls.
 *
 * Determines whether a keydown event should be handled as a playback shortcut
 * or ignored (e.g. when focus is in an input field, or when caption edit mode
 * is active and the user is navigating caption segments).
 */

import { ownsPlainKeys } from "../../utils/typingTarget";
import type { ComboEvent } from "../components/studioCombo";
import { matchesKey } from "../components/studioShortcuts";
import { usePlayerStore } from "../store/playerStore";

const FRAME_STEP_ACTIONS = [
  "frameBack",
  "frameForward",
  "frameBackTen",
  "frameForwardTen",
] as const;

const PLAYBACK_SHORTCUT_IGNORED_SELECTOR = [
  "button",
  "a[href]",
  "[role='button']",
  "[role='checkbox']",
  "[role='menuitem']",
  // Base UI's menu radio item is a `<div>`, so `button` above no longer catches it.
  "[role='menuitemradio']",
  "[role='radio']",
  "[role='spinbutton']",
].join(",");

export function shouldIgnorePlaybackShortcutTarget(target: EventTarget | null): boolean {
  // Anything the user is typing into owns its keys outright, editable elements
  // included: a letter claimed here never reaches the text. So does a native player.
  if (ownsPlainKeys(target)) return true;
  if (!target || typeof target !== "object") return false;
  const candidate = target as { closest?: unknown };
  if (typeof candidate.closest !== "function") return false;
  return (
    (candidate.closest as (selector: string) => Element | null).call(
      target,
      PLAYBACK_SHORTCUT_IGNORED_SELECTOR,
    ) !== null
  );
}

const MODAL_DIALOG_SELECTOR = "[role=dialog][aria-modal=true]";

// An open modal owns the keyboard wherever focus sits, preview iframe included. It counts only
// when shown: visible, not inert, and not behind a fullscreen element that leaves it out.
function isModalDialogOpen(): boolean {
  const doc = globalThis.document;
  if (!doc) return false;
  const fullscreen = doc.fullscreenElement;
  return Array.from(doc.querySelectorAll(MODAL_DIALOG_SELECTOR)).some(
    (dialog) =>
      (!fullscreen || fullscreen.contains(dialog)) &&
      !dialog.closest("[inert]") &&
      (typeof dialog.checkVisibility !== "function" ||
        dialog.checkVisibility({ visibilityProperty: true })),
  );
}

interface PlaybackShortcutCaptionState {
  isCaptionEditMode: boolean;
  selectedCaptionSegmentCount: number;
}

type PlaybackShortcutEvent = ComboEvent & Pick<KeyboardEvent, "target">;

export function shouldIgnorePlaybackShortcutEvent(
  event: PlaybackShortcutEvent,
  captionState: PlaybackShortcutCaptionState = {
    isCaptionEditMode: false,
    selectedCaptionSegmentCount: 0,
  },
): boolean {
  if (shouldIgnorePlaybackShortcutTarget(event.target)) return true;
  if (isModalDialogOpen()) return true;
  return (
    FRAME_STEP_ACTIONS.some((action) => matchesKey(event, action)) &&
    captionState.isCaptionEditMode &&
    captionState.selectedCaptionSegmentCount > 0
  );
}

/** JKL shuttle speeds (×1, ×2, ×4). */
export const SHUTTLE_SPEEDS = [1, 2, 4] as const;

/** The exit-razor combo while the razor is armed: the razor owns it, playback must leave it alone. */
export function razorClaimsKey(e: KeyboardEvent): boolean {
  return matchesKey(e, "exitRazor") && usePlayerStore.getState().activeTool === "razor";
}
