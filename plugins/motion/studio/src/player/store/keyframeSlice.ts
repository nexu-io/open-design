import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { StoreApi } from "zustand";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

/** Minimal keyframe cache types — mirrors GsapKeyframesData without pulling in Node-only gsap-parser. */
export interface KeyframeCacheEntry {
  format: string;
  keyframes: Array<{
    percentage: number;
    /** Original tween-relative percentage (server mutations need this, not the clip-relative `percentage`). */
    tweenPercentage?: number;
    /** Which property group the source tween belongs to (position, scale, rotation, visual, etc.). */
    propertyGroup?: string;
    /** Source tween id — lets the inline clip-row ease button target a specific segment. */
    animationId?: string;
    properties: Record<string, number | string>;
    ease?: string;
    /** Source animation/keyframe targets that collide at this clip percentage. */
    collidingAnimationTargets?: AnimationKeyframeTarget[];
  }>;
  ease?: string;
  easeEach?: string;
}

export interface FocusedEaseSegment {
  animationId: string;
  collidingAnimationTargets?: AnimationKeyframeTarget[];
  tweenPercentage: number;
  elementId: string;
  projectId: string | null;
  sessionEpoch: number;
  nonce: number;
}

type FocusedEaseSegmentTarget = Omit<FocusedEaseSegment, "projectId" | "sessionEpoch" | "nonce">;

/**
 * A request to reveal one automated parameter in the audio FX rack.
 *
 * `elementKey` is the timeline element whose rack it belongs to — a group's own
 * id for a group lane, the clip's key otherwise — so the panel can refuse a
 * request aimed at something it is not showing.
 */
export interface RevealedAudioFxTarget {
  elementKey: string;
  /** The lane's own `fx.<node>.<param>` / `volume` target. */
  automationTarget: string;
  projectId: string | null;
  sessionEpoch: number;
  nonce: number;
}

export type RevealedAudioFxTargetRequest = Omit<
  RevealedAudioFxTarget,
  "projectId" | "sessionEpoch" | "nonce"
>;

/** Whether a reveal request still belongs to what is on screen. */
export function isRevealedAudioFxRequestCurrent(
  request: RevealedAudioFxTarget,
  state: TimelineSessionIdentity,
): boolean {
  return (
    request.projectId === state.timelineProjectId &&
    request.sessionEpoch === state.timelineSessionEpoch
  );
}

interface TimelineSessionIdentity {
  timelineProjectId: string | null;
  timelineSessionEpoch: number;
}

export function isFocusedEaseRequestCurrent(
  request: FocusedEaseSegment,
  state: TimelineSessionIdentity & { selectedElementId: string | null },
): boolean {
  return (
    request.projectId === state.timelineProjectId &&
    request.sessionEpoch === state.timelineSessionEpoch &&
    request.elementId === state.selectedElementId
  );
}

export interface KeyframeSlice {
  /** Selected collapsed (`element:pct`) or expanded (`element:group:animation:clipPct`) diamonds. */
  selectedKeyframes: Set<string>;
  toggleSelectedKeyframe: (key: string) => void;
  clearSelectedKeyframes: () => void;

  /** Clips whose keyframe property lanes are expanded in the timeline. */
  expandedClipIds: Set<string>;
  toggleClipExpanded: (id: string) => void;
  setClipExpanded: (id: string, expanded: boolean) => void;
  /** Union-expand clips (keyframed clips are expanded by default on load). */
  expandClips: (ids: readonly string[]) => void;

  /**
   * Groups whose member rows the caret has HIDDEN (structural, not lanes).
   *
   * Inverted deliberately. As an expanded-set, "not in the set" could not tell
   * never-touched from deliberately-collapsed, so every group defaulted to
   * collapsed — and since nothing seeds the set on create, grouping three
   * tracks made all three vanish behind a header the user had not yet learned
   * to open. Groups are expanded until someone closes one.
   */
  collapsedGroupIds: Set<string>;
  toggleGroupExpanded: (id: string) => void;

  /** Rows (clip id or group id) whose automation-lane rows the `∿` button opened. */
  expandedLaneOwnerIds: Set<string>;
  toggleLaneOwnerExpanded: (id: string) => void;

  /**
   * Project/session/element-scoped request. Its nonce is monotonic across store
   * resets so a stale consumer can never collide with a later request.
   */
  focusedEaseSegment: FocusedEaseSegment | null;
  focusedEaseRequestNonce: number;
  setFocusedEaseSegment: (target: FocusedEaseSegmentTarget) => void;
  clearFocusedEaseSegment: (nonce: number) => void;

  /**
   * "Show me this automated parameter in the rack" — raised by clicking an
   * automation lane's label in the timeline, consumed by the property panel.
   *
   * Session-stamped and nonce-guarded exactly like `focusedEaseSegment`: a
   * request outlives the click, so one made against a different project or
   * before a reload must not reopen a rack on whatever is mounted later.
   */
  revealedAudioFxTarget: RevealedAudioFxTarget | null;
  revealedAudioFxNonce: number;
  setRevealedAudioFxTarget: (target: RevealedAudioFxTargetRequest) => void;
  clearRevealedAudioFxTarget: (nonce: number) => void;

  /** Keyframe data per element id, populated from parsed GSAP animations. */
  keyframeCache: Map<string, KeyframeCacheEntry>;
  /** Unmerged source tweens per element; expanded property lanes read this, never keyframeCache. */
  gsapAnimations: Map<string, GsapAnimation[]>;
  setGsapAnimations: (elementId: string, animations: GsapAnimation[] | undefined) => void;
  setKeyframeCache: (elementId: string, data: KeyframeCacheEntry | undefined) => void;
}

export function createKeyframeSlice(
  set: StoreApi<KeyframeSlice>["setState"],
  getTimelineSessionIdentity: () => TimelineSessionIdentity,
): KeyframeSlice {
  return {
    selectedKeyframes: new Set(),
    toggleSelectedKeyframe: (key) =>
      set((state) => {
        const next = new Set(state.selectedKeyframes);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return { selectedKeyframes: next };
      }),
    clearSelectedKeyframes: () => set({ selectedKeyframes: new Set() }),

    expandedClipIds: new Set(),
    toggleClipExpanded: (id) =>
      set((state) => {
        const next = new Set(state.expandedClipIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { expandedClipIds: next };
      }),
    setClipExpanded: (id, expanded) =>
      set((state) => {
        if (state.expandedClipIds.has(id) === expanded) return state;
        const next = new Set(state.expandedClipIds);
        if (expanded) next.add(id);
        else next.delete(id);
        return { expandedClipIds: next };
      }),
    expandClips: (ids) =>
      set((state) => {
        if (ids.every((id) => state.expandedClipIds.has(id))) return state;
        const next = new Set(state.expandedClipIds);
        for (const id of ids) next.add(id);
        return { expandedClipIds: next };
      }),

    collapsedGroupIds: new Set(),
    toggleGroupExpanded: (id) =>
      set((state) => {
        const next = new Set(state.collapsedGroupIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { collapsedGroupIds: next };
      }),

    expandedLaneOwnerIds: new Set(),
    toggleLaneOwnerExpanded: (id) =>
      set((state) => {
        const next = new Set(state.expandedLaneOwnerIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { expandedLaneOwnerIds: next };
      }),

    focusedEaseSegment: null,
    focusedEaseRequestNonce: 0,
    setFocusedEaseSegment: (target) =>
      set((state) => {
        const nonce = state.focusedEaseRequestNonce + 1;
        const { timelineProjectId, timelineSessionEpoch } = getTimelineSessionIdentity();
        return {
          focusedEaseRequestNonce: nonce,
          focusedEaseSegment: {
            ...target,
            projectId: timelineProjectId,
            sessionEpoch: timelineSessionEpoch,
            nonce,
          },
        };
      }),
    clearFocusedEaseSegment: (nonce) =>
      set((state) =>
        state.focusedEaseSegment?.nonce === nonce ? { focusedEaseSegment: null } : state,
      ),

    revealedAudioFxTarget: null,
    revealedAudioFxNonce: 0,
    setRevealedAudioFxTarget: (target) =>
      set((state) => {
        const nonce = state.revealedAudioFxNonce + 1;
        const { timelineProjectId, timelineSessionEpoch } = getTimelineSessionIdentity();
        return {
          revealedAudioFxNonce: nonce,
          revealedAudioFxTarget: {
            ...target,
            projectId: timelineProjectId,
            sessionEpoch: timelineSessionEpoch,
            nonce,
          },
        };
      }),
    clearRevealedAudioFxTarget: (nonce) =>
      set((state) =>
        state.revealedAudioFxTarget?.nonce === nonce ? { revealedAudioFxTarget: null } : state,
      ),

    keyframeCache: new Map(),
    setKeyframeCache: (elementId, data) =>
      set((state) => {
        // A write that changes nothing must not emit a new Map: the cache has
        // several hot writers (per-element effect, file populate, post-commit
        // updater, delete) and every no-op re-rendered every subscriber.
        if (
          data ? state.keyframeCache.get(elementId) === data : !state.keyframeCache.has(elementId)
        )
          return state;
        const next = new Map(state.keyframeCache);
        if (data) next.set(elementId, data);
        else next.delete(elementId);
        return { keyframeCache: next };
      }),
    gsapAnimations: new Map(),
    setGsapAnimations: (elementId, animations) =>
      set((state) => {
        if (
          animations
            ? state.gsapAnimations.get(elementId) === animations
            : !state.gsapAnimations.has(elementId)
        )
          return state;
        const next = new Map(state.gsapAnimations);
        if (animations) next.set(elementId, animations);
        else next.delete(elementId);
        return { gsapAnimations: next };
      }),
  };
}
