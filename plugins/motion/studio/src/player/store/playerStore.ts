import { create } from "zustand";
import { attachPlayerStoreDevHandle } from "./playerStoreDevHandle";
import { nextSelectionSet, revealTargetsSelection } from "./playerStoreSelection";
import type { MusicBeatAnalysis } from "@hyperframes/core/beats";
import type { BeatEditState } from "../../utils/beatEditing";
import type { ClipManifestClip } from "../lib/playbackTypes";
import {
  readStudioUiPreferences,
  writeStudioUiPreferences,
  type TimelineTimeDisplayMode,
} from "../../utils/studioUiPreferences";
import { clampTimelineZoomPercent, computePinnedZoomPercent } from "../components/timelineZoom";
import { createKeyframeSlice, type KeyframeSlice } from "./keyframeSlice";
import {
  createAutomationSelectionSlice,
  type AutomationSelectionSlice,
} from "./automationSelectionSlice";
import { createEditingModeSlice, type EditingModeSlice } from "./editingModeSlice";
import { createPreviewQualitySlice, type PreviewQualitySlice } from "./previewQualitySlice";
import { createTimelineFocusRequest, type TimelineFocusRequest } from "./timelineFocusState";
import { createThumbnailSlice, type ThumbnailSlice } from "./thumbnailSlice";
import { createPlaybackReadinessSlice } from "./readinessSlice";
import { createRangeSelectionSlice, type RangeSelectionSlice } from "./rangeSelectionSlice";
import { createTimelineResetState } from "./timelineResetState";
import { patchElements, queueElementPatch } from "./elementPatchQueue";
export type { KeyframeCacheEntry } from "./keyframeSlice";
export { liveTime } from "./liveTime";
import { liveTime } from "./liveTime";
export { createTimelineResetState };

import type {
  TimelineElement,
  TimelineElementPatch,
  SubCompositionHostState,
} from "./timelineElement";

export type { TimelineElement, SubCompositionHostState };
export type ZoomMode = "fit" | "manual";
type TimelineTool = "select" | "razor";

export interface SelectElementOptions {
  preserveSet?: boolean;
}

function resolveElementSelection(
  ids: Iterable<string>,
  anchor?: string | null,
): { selectedElementIds: Set<string>; selectedElementId: string | null } {
  const selectedElementIds = new Set(ids);
  if (selectedElementIds.size === 0) {
    return { selectedElementIds, selectedElementId: null };
  }
  if (anchor && selectedElementIds.has(anchor)) {
    return { selectedElementIds, selectedElementId: anchor };
  }
  return {
    selectedElementIds,
    selectedElementId: selectedElementIds.values().next().value ?? null,
  };
}

type PlayerStoreSlices = KeyframeSlice &
  AutomationSelectionSlice &
  ThumbnailSlice &
  EditingModeSlice &
  PreviewQualitySlice &
  ReturnType<typeof createPlaybackReadinessSlice> &
  RangeSelectionSlice;
interface PlayerState extends PlayerStoreSlices {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  /** Increments exactly once when the Studio switches to a different project. */
  timelineSessionEpoch: number;
  /** Project owning the current timeline session; null outside a project-scoped reset. */
  timelineProjectId: string | null;
  /** True while a beat dot is being dragged — hides the playhead guideline. */
  beatDragging: boolean;
  elements: TimelineElement[];
  selectedElementId: string | null;
  playbackRate: number;
  audioMuted: boolean;
  audioVolume: number;
  loopEnabled: boolean;
  /** Timeline zoom: 'fit' auto-scales to viewport, 'manual' uses manualZoomPercent */
  zoomMode: ZoomMode;
  /** Timeline zoom percent relative to the fit width when in manual mode */
  manualZoomPercent: number;
  userZoomCount: number;
  /**
   * Bumped on every live z-index edit (handleDomZIndexReorderCommit apply AND
   * rollback). Flashless z commits (skipReload) never reload the iframe or
   * bump refreshKey, so DOM-derived views (the Layers panel's z-sorted tree)
   * subscribe to this to re-read the live DOM while playback is paused.
   */
  zEditVersion: number;
  /** Work-area in-point (seconds). When set, loop starts here and A jumps here. */
  inPoint: number | null;
  /** Work-area out-point (seconds). When set, loop ends here and E jumps here. */
  outPoint: number | null;
  activeTool: TimelineTool;
  setActiveTool: (tool: TimelineTool) => void;
  selectLeftward: () => void;
  selectRightward: () => void;
  /** Tween-relative percentage of the last-clicked keyframe diamond. Operations
   *  (drag, resize, rotate) target this instead of recomputing from playhead. */
  activeKeyframePct: number | null;
  setActiveKeyframePct: (pct: number | null) => void;

  /** Multi-select: additional selected elements beyond selectedElementId. */
  selectedElementIds: Set<string>;
  clearSelectedElementIds: () => void;
  /** Replace the whole multi-selection at once (marquee live updates). */
  setSelectedElementIds: (ids: Set<string>) => void;
  /** Timeline magnet toggle — when false, clip drags/trims/drops never snap. */
  timelineSnapEnabled: boolean;
  setTimelineSnapEnabled: (enabled: boolean) => void;
  /** Keeps the main track gapless on delete; distinct from the magnet above. */
  rippleEditEnabled: boolean;
  setRippleEditEnabled: (enabled: boolean) => void;
  /** Transport + ruler readout: timecode ("time") or frame number ("frame"). */
  timeDisplayMode: TimelineTimeDisplayMode;
  setTimeDisplayMode: (mode: TimelineTimeDisplayMode) => void;
  /** Pin the timeline zoom to its current scale before a duration change, so
   *  it stops rescaling every clip. No-op once already pinned. */
  pinTimelineZoom: (currentPixelsPerSecond: number, fitPixelsPerSecond: number) => void;
  /** The timeline's live pixels-per-second + fit basis, published by <Timeline>. */
  timelinePps: number;
  timelineFitPps: number;
  setTimelineScale: (pps: number, fitPps: number) => void;
  setSelection: (ids: Iterable<string>, anchor?: string | null) => void;
  addSelectedElementId: (id: string) => void;
  toggleSelectedElementId: (id: string) => void;
  clearSelection: () => void;

  setIsPlaying: (playing: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioMuted: (muted: boolean) => void;
  setAudioVolume: (volume: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setBeatDragging: (dragging: boolean) => void;
  setElements: (elements: TimelineElement[]) => void;
  setSelectedElementId: (id: string | null, options?: SelectElementOptions) => void;
  /** Move the selection anchor within an active multi-selection without collapsing it. */
  setSelectionAnchor: (id: string | null) => void;
  updateElement: (elementId: string, updates: TimelineElementPatch) => void;
  setZoomMode: (mode: ZoomMode) => void;
  setManualZoomPercent: (percent: number) => void;
  bumpZEditVersion: () => void;
  setInPoint: (time: number | null) => void;
  setOutPoint: (time: number | null) => void;
  /** Owns the hard project boundary; repeated calls for one project are no-ops. */
  beginTimelineSession: (projectId: string) => void;
  /** Clears project data without creating a new hard-project session. */
  reset: () => void;

  /** Request a seek from outside the player loop (e.g. Layers panel);
   *  useTimelinePlayer subscribes and calls adapter.seek() + liveTime.notify(). */
  requestedSeekTime: number | null;
  requestSeek: (time: number) => void;
  clearSeekRequest: () => void;

  /** Request the transport start or stop from outside the player loop: the FX
   *  rack starts playback to audition a preset (silent while paused) and
   *  restores the playhead on leave, without costing the author their place.
   *  A nonce, not a bare boolean, so two hovers in a row both register. */
  playbackRequest: { playing: boolean; returnTo: number | null; nonce: number } | null;
  requestPlayback: (playing: boolean, returnTo?: number | null) => void;
  clearPlaybackRequest: () => void;

  /**
   * Request the timeline to scroll a clip into view (e.g. clicking an
   * already-added asset card in the sidebar). Consumed and cleared by
   * useTimelineRevealClip. The nonce makes repeat requests for the same
   * clip observable so a second click re-reveals after the user scrolls away.
   */
  clipRevealRequest: { elementId: string; nonce: number } | null;
  requestClipReveal: (elementId: string) => void;
  clearClipRevealRequest: () => void;

  timelineFocus: TimelineFocusRequest | null;
  timelineFocusNonce: number;
  requestTimelineFocus: (id: string) => void;
  clearTimelineFocus: (nonce: number) => void;

  lintFindingsByElement: Map<string, { count: number; messages: string[] }>;
  setLintFindingsByElement: (map: Map<string, { count: number; messages: string[] }>) => void;

  beatAnalysis: MusicBeatAnalysis | null;
  setBeatAnalysis: (analysis: MusicBeatAnalysis | null) => void;

  /** User edits (add/move/delete) layered over the detected beat grid. */
  beatEdits: BeatEditState | null;
  setBeatEdits: (edits: BeatEditState | null) => void;
  /** Undo/redo stacks for beat edits (in-memory, session-only). */
  beatUndo: BeatHistoryEntry[];
  beatRedo: BeatHistoryEntry[];
  commitBeatEdits: (next: BeatEditState | null, label: string) => void;
  undoBeatEdits: () => string | null;
  redoBeatEdits: () => string | null;
  resetBeatHistory: () => void;
  beatPersist: (() => void) | null;
  setBeatPersist: (fn: (() => void) | null) => void;

  clipManifest: ClipManifestClip[] | null;
  setClipManifest: (clips: ClipManifestClip[] | null) => void;
  clipParentMap: Map<string, string>;
  setClipParentMap: (map: Map<string, string>) => void;
  /**
   * Sub-composition DOM descendants (groups + their children) that have no
   * `data-start`, so they're absent from the clip manifest/tree. Collected
   * studio-side from the live preview so the timeline can expand a sub-comp row
   * to show its DOM-only children. Keeps the manifest lean (timed clips only).
   */
  domClipChildren: DomClipChild[];
  setDomClipChildren: (children: DomClipChild[]) => void;
  /**
   * Host-element state for every id'd element inside a sub-composition, keyed by
   * dom id. Collected from the live preview because it is the only place that
   * sees it: these elements are filtered out of `elements` before the flat store
   * is built, and the clip manifest carries timing, not attributes.
   */
  subCompositionHostState: Map<string, SubCompositionHostState>;
  setSubCompositionHostState: (state: Map<string, SubCompositionHostState>) => void;
}

/** A sub-comp DOM-only timeline child (no data-start) and its nesting context. */
export interface DomClipChild {
  id: string;
  parentId: string;
  /** The manifest sub-comp host clip id this descendant ultimately lives under. */
  hostId: string;
  label: string;
  stackingContextId: string;
  /**
   * The child's audio-group state, read off its live element during the DOM
   * walk — the only place that sees it. A sub-composition can declare a group
   * and its members entirely within itself, and those members never reach the
   * flat store, so an expanded child has no twin to inherit membership from.
   */
  audioGroup?: string;
  audioGroupLabel?: string;
  audioGroupVolume?: number;
  audioGroupHidden?: boolean;
  audioGroupFxChain?: string;
  /** The group element's `data-automation`, mirrored the same way. */
  audioGroupAutomation?: string;
}

interface BeatHistoryEntry {
  restore: BeatEditState | null;
  at: number;
  label: string;
}

/** Selects like the marquee: the primary first, so its resets run, then the whole set. */
function selectAroundPlayhead(
  state: PlayerState,
  keep: (el: TimelineElement, playhead: number) => boolean,
): void {
  const playhead = state.isPlaying ? liveTime.latest() : state.currentTime;
  const ids = state.elements.filter((el) => keep(el, playhead)).map((el) => el.key ?? el.id);
  state.setSelectedElementId(ids[0] ?? null);
  state.setSelectedElementIds(new Set(ids));
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  timelineSessionEpoch: 0,
  timelineProjectId: null,
  beatDragging: false,
  elements: [],
  selectedElementId: null,
  playbackRate: readStudioUiPreferences().playbackRate ?? 1,
  audioMuted: readStudioUiPreferences().audioMuted ?? false,
  audioVolume: readStudioUiPreferences().audioVolume ?? 1,
  loopEnabled: false,
  zoomMode: "fit",
  manualZoomPercent: 100,
  userZoomCount: 0,
  zEditVersion: 0,
  timelinePps: 100,
  timelineFitPps: 100,
  inPoint: null,
  outPoint: null,

  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),
  selectLeftward: () => selectAroundPlayhead(get(), (el, t) => el.start < t),
  selectRightward: () => selectAroundPlayhead(get(), (el, t) => el.start + el.duration > t),

  ...createKeyframeSlice(set, () => ({
    timelineProjectId: get().timelineProjectId,
    timelineSessionEpoch: get().timelineSessionEpoch,
  })),
  ...createThumbnailSlice(set),

  ...createAutomationSelectionSlice(set),
  ...createEditingModeSlice(set),
  ...createPreviewQualitySlice(set, get),
  ...createRangeSelectionSlice(),
  ...createPlaybackReadinessSlice(set),

  activeKeyframePct: null,
  setActiveKeyframePct: (pct) => set({ activeKeyframePct: pct }),

  selectedElementIds: new Set<string>(),
  setSelection: (ids, anchor) => set(resolveElementSelection(ids, anchor)),
  addSelectedElementId: (id: string) =>
    set((s) => {
      const next = new Set(s.selectedElementIds);
      next.add(id);
      return resolveElementSelection(next, s.selectedElementId);
    }),
  toggleSelectedElementId: (id: string) =>
    set((s) => {
      const next = new Set(s.selectedElementIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return resolveElementSelection(next, s.selectedElementId);
    }),
  clearSelection: () => set({ selectedElementId: null, selectedElementIds: new Set() }),

  requestedSeekTime: null,
  requestSeek: (time) => set({ requestedSeekTime: time }),
  clearSeekRequest: () => set({ requestedSeekTime: null }),

  playbackRequest: null,
  requestPlayback: (playing, returnTo = null) =>
    set((s) => ({
      playbackRequest: { playing, returnTo, nonce: (s.playbackRequest?.nonce ?? 0) + 1 },
    })),
  clearPlaybackRequest: () => set({ playbackRequest: null }),

  clipRevealRequest: null,
  requestClipReveal: (elementId) =>
    set((s) => ({
      clipRevealRequest: { elementId, nonce: (s.clipRevealRequest?.nonce ?? 0) + 1 },
    })),
  clearClipRevealRequest: () => set({ clipRevealRequest: null }),

  timelineFocus: null,
  timelineFocusNonce: 0,
  requestTimelineFocus: (id) =>
    set((s) => {
      const nonce = s.timelineFocusNonce + 1;
      return {
        timelineFocusNonce: nonce,
        timelineFocus: createTimelineFocusRequest(
          id,
          s.timelineProjectId,
          s.timelineSessionEpoch,
          nonce,
        ),
      };
    }),
  clearTimelineFocus: (nonce) =>
    set((s) => (s.timelineFocus?.nonce === nonce ? { timelineFocus: null } : s)),

  lintFindingsByElement: new Map(),
  setLintFindingsByElement: (map) => set({ lintFindingsByElement: map }),

  beatAnalysis: null,
  setBeatAnalysis: (analysis) => set({ beatAnalysis: analysis }),

  beatEdits: null,
  setBeatEdits: (edits) => set({ beatEdits: edits }),

  beatUndo: [],
  beatRedo: [],
  beatPersist: null,
  setBeatPersist: (fn) => set({ beatPersist: fn }),
  commitBeatEdits: (next, label) => {
    set((s) => ({
      beatEdits: next,
      beatUndo: [...s.beatUndo, { restore: s.beatEdits, at: Date.now(), label }],
      beatRedo: [],
    }));
    get().beatPersist?.();
  },
  undoBeatEdits: () => {
    const s = get();
    const entry = s.beatUndo[s.beatUndo.length - 1];
    if (!entry) return null;
    set({
      beatEdits: entry.restore,
      beatUndo: s.beatUndo.slice(0, -1),
      beatRedo: [...s.beatRedo, { restore: s.beatEdits, at: entry.at, label: entry.label }],
    });
    get().beatPersist?.();
    return entry.label;
  },
  resetBeatHistory: () => set({ beatUndo: [], beatRedo: [] }),
  redoBeatEdits: () => {
    const s = get();
    const entry = s.beatRedo[s.beatRedo.length - 1];
    if (!entry) return null;
    set({
      beatEdits: entry.restore,
      beatRedo: s.beatRedo.slice(0, -1),
      beatUndo: [...s.beatUndo, { restore: s.beatEdits, at: entry.at, label: entry.label }],
    });
    get().beatPersist?.();
    return entry.label;
  },

  clipManifest: null,
  setClipManifest: (clips) => set({ clipManifest: clips }),
  clipParentMap: new Map(),
  setClipParentMap: (map) => set({ clipParentMap: map }),
  domClipChildren: [],
  setDomClipChildren: (children) => set({ domClipChildren: children }),
  subCompositionHostState: new Map(),
  setSubCompositionHostState: (state) => set({ subCompositionHostState: state }),

  setIsPlaying: (playing) => {
    if (get().isPlaying === playing) return;
    set({ isPlaying: playing });
  },
  setPlaybackRate: (rate) => {
    writeStudioUiPreferences({ playbackRate: rate });
    set({ playbackRate: rate });
  },
  setAudioMuted: (muted) => {
    writeStudioUiPreferences({ audioMuted: muted });
    set({ audioMuted: muted });
  },
  setAudioVolume: (volume) => {
    const nextVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1;
    writeStudioUiPreferences({ audioVolume: nextVolume });
    set({ audioVolume: nextVolume });
  },
  setLoopEnabled: (enabled) => set({ loopEnabled: enabled }),
  setZoomMode: (mode) => set({ zoomMode: mode }),
  clearSelectedElementIds: () => set({ selectedElementIds: new Set() }),
  setSelectedElementIds: (ids: Set<string>) => set({ selectedElementIds: new Set(ids) }),
  timelineSnapEnabled: readStudioUiPreferences().timelineSnapEnabled ?? true,
  setTimelineSnapEnabled: (enabled) => {
    writeStudioUiPreferences({ timelineSnapEnabled: enabled });
    set({ timelineSnapEnabled: enabled });
  },
  rippleEditEnabled: readStudioUiPreferences().rippleEditEnabled ?? true, // default on
  setRippleEditEnabled: (enabled) => {
    writeStudioUiPreferences({ rippleEditEnabled: enabled });
    set({ rippleEditEnabled: enabled });
  },
  timeDisplayMode: readStudioUiPreferences().timeDisplayMode ?? "time",
  setTimeDisplayMode: (mode) => {
    writeStudioUiPreferences({ timeDisplayMode: mode });
    set({ timeDisplayMode: mode });
  },
  pinTimelineZoom: (currentPixelsPerSecond, fitPixelsPerSecond) =>
    set((s) => {
      // Already pinned (or the user manually zoomed) — never clobber that.
      if (s.zoomMode === "manual") return {};
      const percent = computePinnedZoomPercent(currentPixelsPerSecond, fitPixelsPerSecond);
      writeStudioUiPreferences({
        timelineZoomMode: "manual",
        timelineManualZoomPercent: percent,
      });
      return { zoomMode: "manual", manualZoomPercent: percent };
    }),
  setTimelineScale: (pps, fitPps) => {
    const state = get();
    if (state.timelinePps === pps && state.timelineFitPps === fitPps) return;
    set({ timelinePps: pps, timelineFitPps: fitPps });
  },
  setInPoint: (time) =>
    set((state) => {
      const t = time !== null && Number.isFinite(time) ? time : null;
      return {
        inPoint: t,
        outPoint:
          t !== null && state.outPoint !== null && t >= state.outPoint ? null : state.outPoint,
        // Setting a work-area marker implies the user wants playback bounded by it.
        // Auto-enable loop so the playhead respects the marker instead of running past.
        loopEnabled: t !== null ? true : state.loopEnabled,
      };
    }),
  setOutPoint: (time) =>
    set((state) => {
      const t = time !== null && Number.isFinite(time) ? time : null;
      return {
        outPoint: t,
        inPoint: t !== null && state.inPoint !== null && t <= state.inPoint ? null : state.inPoint,
        loopEnabled: t !== null ? true : state.loopEnabled,
      };
    }),
  setManualZoomPercent: (percent) =>
    set((state) => ({
      manualZoomPercent: clampTimelineZoomPercent(percent, state.timelineFitPps),
    })),
  bumpZEditVersion: () => set((state) => ({ zEditVersion: state.zEditVersion + 1 })),
  setCurrentTime: (time) => set({ currentTime: Number.isFinite(time) ? time : 0 }),
  setDuration: (duration) => set({ duration: Number.isFinite(duration) ? duration : 0 }),
  setBeatDragging: (dragging) => set({ beatDragging: dragging }),
  setElements: (elements) => set({ elements }),
  // A genuine single selection: always collapse the set to just this element. User
  // intent (timeline click, preview click via applyDomSelection) flows here; DOM sync
  // echoes that must preserve a group go through setSelectionAnchor instead.
  setSelectedElementId: (id, options) =>
    set((s) => {
      const selectedElementIds = nextSelectionSet(s.selectedElementIds, id, options?.preserveSet);
      // Selecting a different element drops any active keyframe selection — otherwise
      // a stale activeKeyframePct from a prior diamond click would force the next drag
      // to "modify" a keyframe on the new element. A diamond click sets the pct AFTER
      // calling setSelectedElementId, so this never clobbers a genuine keyframe select.
      // A reveal request survives the selection it is FOR. `openClipFxRack`
      // raises the request and then selects the clip asynchronously, so the
      // selection lands afterwards and used to clear the very request that
      // caused it — the panel then read null and the section never opened.
      // Any OTHER selection still drops it: a request aimed elsewhere is stale.
      //
      // Compared across the ID-SPACE BOUNDARY, which is why this needs saying:
      // a request carries the BARE dom id (`runtimeAudioId`, because the panel
      // and the runtime speak that), while this store's ids are
      // `sourceFile#domId`. A direct `===` was silently never true — the exact
      // shape of failure the id-space split produces.
      const revealSurvives = revealTargetsSelection(s.revealedAudioFxTarget, id);
      return id !== s.selectedElementId
        ? {
            selectedElementId: id,
            selectedElementIds,
            activeKeyframePct: null,
            motionPathArmed: false,
            focusedEaseSegment: null,
            ...(revealSurvives ? {} : { revealedAudioFxTarget: null }),
          }
        : { selectedElementId: id, selectedElementIds };
    }),
  // Move the anchor within an active multi-selection WITHOUT collapsing it — used by
  // DOM->store sync echoes while a group gesture re-patches the preview. A non-member
  // id is treated as a genuine new single selection.
  setSelectionAnchor: (id) =>
    set((s) => {
      if (id != null && s.selectedElementIds.size > 1 && s.selectedElementIds.has(id)) {
        return {
          selectedElementId: id,
          focusedEaseSegment: id === s.selectedElementId ? s.focusedEaseSegment : null,
        };
      }
      return {
        selectedElementId: id,
        selectedElementIds: id ? new Set([id]) : new Set<string>(),
        focusedEaseSegment: id === s.selectedElementId ? s.focusedEaseSegment : null,
      };
    }),
  updateElement: (elementId, updates) => {
    if (queueElementPatch(elementId, updates)) return;
    set((state) => ({ elements: patchElements(state.elements, new Map([[elementId, updates]])) }));
  },
  // UI preferences intentionally survive reset. So do timelineSessionEpoch and
  // focusedEaseRequestNonce: the epoch advances only when project identity
  // changes, while a monotonic nonce prevents collisions with stale consumers.
  beginTimelineSession: (projectId) =>
    set((state) => {
      if (state.timelineProjectId === projectId) return state;
      return {
        ...createTimelineResetState(),
        timelineSessionEpoch: state.timelineSessionEpoch + 1,
        timelineProjectId: projectId,
      };
    }),
  reset: () => set(createTimelineResetState()),
}));

attachPlayerStoreDevHandle(usePlayerStore);

export function isPreviewBooted(projectId: string): boolean {
  const { previewBooted, timelineProjectId } = usePlayerStore.getState();
  return previewBooted && timelineProjectId === projectId;
}

/** True once projectId's live preview has booted, false once another project replaces it.
 * Open-time work the first frame does not need (server parses, lint) waits on it. */
export function whenPreviewBooted(projectId: string): Promise<boolean> {
  const openedFrom = usePlayerStore.getState().timelineProjectId;
  let seen = false;
  const settle = (state: PlayerState): boolean | null => {
    if (state.timelineProjectId === projectId) {
      seen = true;
      return state.previewBooted ? true : null;
    }
    return seen || state.timelineProjectId !== openedFrom ? false : null;
  };
  return new Promise((resolve) => {
    const now = settle(usePlayerStore.getState());
    if (now !== null) return resolve(now);
    const stop = usePlayerStore.subscribe((state) => {
      const result = settle(state);
      if (result === null) return;
      stop();
      resolve(result);
    });
  });
}
