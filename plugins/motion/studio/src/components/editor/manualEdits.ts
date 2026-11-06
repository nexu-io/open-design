// Public re-exports — consumers import from this file as before.
export {
  STUDIO_OFFSET_X_PROP,
  STUDIO_OFFSET_Y_PROP,
  STUDIO_WIDTH_PROP,
  STUDIO_ROTATION_PROP,
  type StudioBoxSizeSnapshot,
  type StudioRotationSnapshot,
  type StudioPathOffsetSnapshot,
} from "./manualEditsTypes";

export {
  mergeFileChangePayloads,
  readFileChangeAffectedCompositions,
  readFileChangeAffectsPreview,
  readFileChangeField,
  readStudioFileChangePath,
} from "./manualEditsParsing";

export {
  beginStudioManualEditGesture,
  endStudioManualEditGesture,
  isStudioManualEditGestureCurrent,
  readStudioPathOffset,
  readAppliedStudioPathOffset,
  readStudioBoxSize,
  readStudioRotation,
  applyStudioPathOffset,
  applyStudioPathOffsetDraft,
  applyStudioBoxSize,
  applyStudioBoxSizeDraft,
  applyStudioRotation,
} from "./manualEditsDom";

export { reapplyPositionEditsAfterSeek } from "./manualEditsSeekReapply";

export {
  captureStudioBoxSize,
  captureStudioRotation,
  captureStudioPathOffset,
  restoreStudioBoxSize,
  restoreStudioRotation,
  restoreStudioPathOffset,
  clearStudioPathOffset,
  clearStudioRotation,
  clearStudioBoxSize,
} from "./manualEditsSnapshot";

import type { StudioManualEditSeekWindow } from "./manualEditsTypes";
import {
  STUDIO_MANUAL_EDITS_APPLY_PROP,
  STUDIO_MANUAL_EDITS_WRAPPED_PROP,
  STUDIO_MANUAL_EDITS_PLAYBACK_FRAME_PROP,
} from "./manualEditsTypes";
import { finiteNumber } from "./manualEditsParsing";

/* ── Seek/play reapply wrappers ───────────────────────────────────── */
function markWrapped(fn: (...args: unknown[]) => unknown): void {
  try {
    Object.defineProperty(fn, STUDIO_MANUAL_EDITS_WRAPPED_PROP, {
      configurable: false,
      enumerable: false,
      value: true,
    });
  } catch {
    try {
      (fn as unknown as Record<string, unknown>)[STUDIO_MANUAL_EDITS_WRAPPED_PROP] = true;
    } catch {
      // Ignore non-extensible functions.
    }
  }
}

function isWrapped(fn: (...args: unknown[]) => unknown): boolean {
  return Boolean((fn as unknown as Record<string, unknown>)[STUDIO_MANUAL_EDITS_WRAPPED_PROP]);
}

function wrapSeekReapplyFunction(
  win: StudioManualEditSeekWindow,
  owner: Record<string, unknown> | undefined,
  key: string,
  reapplyWhenHeldSeekLands = false,
): boolean {
  const fn = owner?.[key];
  if (!owner || typeof fn !== "function") return false;
  const seek = fn as (...args: unknown[]) => unknown;
  if (isWrapped(seek)) return true;

  const wrappedSeek = function (this: unknown, ...args: unknown[]): unknown {
    const result = seek.apply(this, args);
    win.__hfStudioManualEditsApply?.();
    const held = reapplyWhenHeldSeekLands ? (result as PromiseLike<void> | undefined) : undefined;
    if (typeof held?.then === "function") void held.then(() => win.__hfStudioManualEditsApply?.());
    return result;
  };
  markWrapped(wrappedSeek);
  try {
    owner[key] = wrappedSeek;
  } catch {
    return false;
  }
  return true;
}

function readOwnerNumber(owner: Record<string, unknown>, key: string): number | null {
  const fn = owner[key];
  if (typeof fn !== "function") return null;
  try {
    return finiteNumber(fn.call(owner));
  } catch {
    return null;
  }
}

function hasRemainingTimelineTime(owner: Record<string, unknown>): boolean {
  const duration = readOwnerNumber(owner, "duration") ?? readOwnerNumber(owner, "getDuration");
  if (duration == null) return true;
  if (duration <= 0) return false;

  const time =
    readOwnerNumber(owner, "time") ??
    readOwnerNumber(owner, "totalTime") ??
    readOwnerNumber(owner, "getTime");
  if (time == null) return true;
  return time < duration;
}

function hasPausedAncestor(owner: Record<string, unknown>): boolean {
  let ancestor = owner.parent;
  for (let depth = 0; depth < 32 && ancestor && typeof ancestor === "object"; depth++) {
    const node = ancestor as Record<string, unknown>;
    const paused = node.paused;
    try {
      if (typeof paused === "function" && paused.call(node)) return true;
    } catch {
      return false;
    }
    ancestor = node.parent;
  }
  return false;
}

function isTimelinePlaying(owner: Record<string, unknown> | undefined): boolean {
  if (!owner) return false;
  const isPlaying = owner.isPlaying;
  if (typeof isPlaying === "function") {
    try {
      return Boolean(isPlaying.call(owner));
    } catch {
      return false;
    }
  }

  const paused = owner.paused;
  if (typeof paused === "function") {
    try {
      if (paused.call(owner)) return false;
    } catch {
      return false;
    }

    const isActive = owner.isActive;
    if (typeof isActive === "function") {
      try {
        if (isActive.call(owner)) return true;
      } catch {
        return false;
      }
    }

    // A GSAP child of a paused timeline reads unpaused with time left; only its ancestors know.
    if (hasPausedAncestor(owner)) return false;
    return hasRemainingTimelineTime(owner);
  }

  const isActive = owner.isActive;
  if (typeof isActive === "function") {
    try {
      return Boolean(isActive.call(owner));
    } catch {
      return false;
    }
  }

  return false;
}

function isStudioManualEditPlaybackActive(win: StudioManualEditSeekWindow): boolean {
  if (isTimelinePlaying(win.__player)) return true;
  if (isTimelinePlaying(win.__timeline)) return true;
  return Object.values(win.__timelines ?? {}).some(isTimelinePlaying);
}

function startStudioManualEditPlaybackReapply(win: StudioManualEditSeekWindow): void {
  win.__hfStudioManualEditsApply?.();
  if (win[STUDIO_MANUAL_EDITS_PLAYBACK_FRAME_PROP] != null) return;

  const tick = () => {
    win.__hfStudioManualEditsApply?.();
    if (!isStudioManualEditPlaybackActive(win)) {
      win[STUDIO_MANUAL_EDITS_PLAYBACK_FRAME_PROP] = null;
      return;
    }
    win[STUDIO_MANUAL_EDITS_PLAYBACK_FRAME_PROP] = win.requestAnimationFrame(tick);
  };

  win[STUDIO_MANUAL_EDITS_PLAYBACK_FRAME_PROP] = win.requestAnimationFrame(tick);
}

function wrapPlayReapplyFunction(
  win: StudioManualEditSeekWindow,
  owner: Record<string, unknown> | undefined,
  key: string,
): boolean {
  const fn = owner?.[key];
  if (!owner || typeof fn !== "function") return false;
  const play = fn as (...args: unknown[]) => unknown;
  if (isWrapped(play)) return true;

  const wrappedPlay = function (this: unknown, ...args: unknown[]): unknown {
    const result = play.apply(this, args);
    startStudioManualEditPlaybackReapply(win);
    return result;
  };
  markWrapped(wrappedPlay);
  try {
    owner[key] = wrappedPlay;
  } catch {
    return false;
  }
  return true;
}

function wrapApplyAfterFunction(
  win: StudioManualEditSeekWindow,
  owner: Record<string, unknown> | undefined,
  key: string,
): boolean {
  const fn = owner?.[key];
  if (!owner || typeof fn !== "function") return false;
  const applyAfter = fn as (...args: unknown[]) => unknown;
  if (isWrapped(applyAfter)) return true;

  const wrappedApplyAfter = function (this: unknown, ...args: unknown[]): unknown {
    const result = applyAfter.apply(this, args);
    win.__hfStudioManualEditsApply?.();
    return result;
  };
  markWrapped(wrappedApplyAfter);
  try {
    owner[key] = wrappedApplyAfter;
  } catch {
    return false;
  }
  return true;
}

export function installStudioManualEditSeekReapply(win: Window, apply: () => void): boolean {
  const studioWin = win as StudioManualEditSeekWindow;
  studioWin[STUDIO_MANUAL_EDITS_APPLY_PROP] = apply;

  const wrappedHfSeek = wrapSeekReapplyFunction(studioWin, studioWin.__hf, "seek");
  const wrappedPlayerSeek = wrapSeekReapplyFunction(studioWin, studioWin.__player, "seek", true);
  const wrappedPlayerRenderSeek = wrapSeekReapplyFunction(
    studioWin,
    studioWin.__player,
    "renderSeek",
  );
  const wrappedTimelineSeek = wrapSeekReapplyFunction(studioWin, studioWin.__timeline, "seek");
  wrapSeekReapplyFunction(studioWin, studioWin.__timeline, "totalTime");
  const wrappedPlayerPlay = wrapPlayReapplyFunction(studioWin, studioWin.__player, "play");
  const wrappedTimelinePlay = wrapPlayReapplyFunction(studioWin, studioWin.__timeline, "play");
  const wrappedPlayerPause = wrapApplyAfterFunction(studioWin, studioWin.__player, "pause");
  const wrappedTimelinePause = wrapApplyAfterFunction(studioWin, studioWin.__timeline, "pause");
  let wrappedNamedTimelineSeek = false;
  let wrappedNamedTimelinePlay = false;
  let wrappedNamedTimelinePause = false;
  for (const timeline of Object.values(studioWin.__timelines ?? {})) {
    wrappedNamedTimelineSeek =
      wrapSeekReapplyFunction(studioWin, timeline, "seek") || wrappedNamedTimelineSeek;
    wrapSeekReapplyFunction(studioWin, timeline, "totalTime");
    wrappedNamedTimelinePlay =
      wrapPlayReapplyFunction(studioWin, timeline, "play") || wrappedNamedTimelinePlay;
    wrappedNamedTimelinePause =
      wrapApplyAfterFunction(studioWin, timeline, "pause") || wrappedNamedTimelinePause;
  }

  // Auto-wrap timelines registered AFTER this install runs. GSAP compositions
  // register via `window.__timelines[id] = tl` which may happen after the
  // Studio hook runs. The Proxy intercepts new registrations and wraps
  // seek/play/pause immediately, closing the gap that causes translate doubling.
  if (studioWin.__timelines && !(studioWin.__timelines as Record<string, unknown>).__proxied) {
    const original = studioWin.__timelines;
    studioWin.__timelines = new Proxy(original, {
      set(target, prop, value) {
        target[prop as string] = value;
        if (typeof value === "object" && value !== null) {
          const tl = value as Record<string, unknown>;
          wrapSeekReapplyFunction(studioWin, tl, "seek");
          wrapSeekReapplyFunction(studioWin, tl, "totalTime");
          wrapPlayReapplyFunction(studioWin, tl, "play");
          wrapApplyAfterFunction(studioWin, tl, "pause");
          studioWin.__hfStudioManualEditsApply?.();
        }
        return true;
      },
    });
    (studioWin.__timelines as Record<string, unknown>).__proxied = true;
  }

  if (isStudioManualEditPlaybackActive(studioWin)) {
    startStudioManualEditPlaybackReapply(studioWin);
  }

  return (
    wrappedHfSeek ||
    wrappedPlayerSeek ||
    wrappedPlayerRenderSeek ||
    wrappedTimelineSeek ||
    wrappedPlayerPlay ||
    wrappedTimelinePlay ||
    wrappedPlayerPause ||
    wrappedTimelinePause ||
    wrappedNamedTimelineSeek ||
    wrappedNamedTimelinePlay ||
    wrappedNamedTimelinePause
  );
}
