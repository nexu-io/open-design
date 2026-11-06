import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { KeyframeCacheEntry } from "./keyframeSlice";
import { resetPlaybackReadinessState } from "./readinessSlice";
import type { SubCompositionHostState } from "./timelineElement";

export function createTimelineResetState() {
  return {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    ...resetPlaybackReadinessState(),
    beatDragging: false,
    elements: [],
    selectedElementId: null,
    zEditVersion: 0,
    inPoint: null,
    outPoint: null,
    rangeSelection: null,
    activeTool: "select" as const,
    activeKeyframePct: null,
    motionPathArmed: false,
    motionPathCreateAvailable: false,
    selectedKeyframes: new Set<string>(),
    // Ephemeral like every other selection here. A range surviving a project
    // switch can match a same-keyed clip in the new project and redirect a
    // paste through `sel.elementKey === paste.elementKey` to a stale t0.
    automationSelection: null,
    expandedClipIds: new Set<string>(),
    // Per-composition: ids from comp A match nothing in B, silencing all of it.
    collapsedGroupIds: new Set<string>(),
    expandedLaneOwnerIds: new Set<string>(),
    focusedEaseSegment: null,
    revealedAudioFxTarget: null,
    selectedElementIds: new Set<string>(),
    requestedSeekTime: null,
    lintFindingsByElement: new Map<string, { count: number; messages: string[] }>(),
    timelineFocus: null,
    keyframeCache: new Map<string, KeyframeCacheEntry>(),
    gsapAnimations: new Map<string, GsapAnimation[]>(),
    beatAnalysis: null,
    beatEdits: null,
    beatUndo: [],
    beatRedo: [],
    beatPersist: null,
    clipManifest: null,
    clipParentMap: new Map<string, string>(),
    domClipChildren: [],
    subCompositionHostState: new Map<string, SubCompositionHostState>(),
  };
}
