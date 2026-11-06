/**
 * One row in the timeline: a clip as Studio needs it, translated from the
 * runtime's manifest at createTimelineElementFromManifestClip.
 *
 * Split out of playerStore, which had reached the 600-line studio ceiling and
 * could not carry another field. Re-exported from there, so every existing
 * importer is unaffected.
 */

import type { ClipManifestClip } from "../lib/playbackTypes";
import { roundToCenti } from "../../utils/rounding";

export interface TimelineElement {
  id: string;
  label?: string;
  transitionLabel?: string;
  key?: string;
  kind?: ClipManifestClip["kind"];
  tag: string;
  start: number;
  duration: number;
  track: number;
  /**
   * The data-track-index as written in the source file. Set at the manifest
   * translation boundary (createTimelineElementFromManifestClip) from the
   * runtime clip's verbatim track, and preserved through display-lane remaps
   * (normalizeToZones packs sparse authored tracks onto contiguous display
   * lanes; expanded sub-comp children get synthetic display rows). Lane edits
   * must persist THIS space — writing a display-lane number into a sparse file
   * re-targets the wrong track. For an expanded child the value is in its OWN
   * source file's coordinate space, not the host timeline's.
   */
  authoredTrack?: number;
  /** Resolved z-index for stacking-aware timeline ordering. */
  zIndex?: number;
  /** True when the effective z-index was authored inline or through CSS, not auto. */
  hasExplicitZIndex?: boolean;
  /** Canonical CSS stacking context this element's z-index participates in. */
  stackingContextId?: string | null;
  /** Nearest parent composition context, matching RuntimeTimelineClip. */
  parentCompositionId?: string | null;
  /** Composition ancestry from root to nearest parent, matching RuntimeTimelineClip. */
  compositionAncestors?: string[];
  domId?: string;
  /** Stable `data-hf-id` attribute value — used as primary patch target when present */
  hfId?: string;
  /** Best-effort selector used when patching source HTML back from timeline edits */
  selector?: string;
  /** Zero-based occurrence index for non-unique selectors */
  selectorIndex?: number;
  /** Source composition file that owns this element, when known */
  sourceFile?: string;
  src?: string;
  playbackStart?: number;
  playbackStartAttr?: "media-start" | "playback-start";
  playbackRate?: number;
  sourceDuration?: number;
  volume?: number;
  /** A video with sound to mix (`data-has-audio`, or unmuted without it); `muted` silences it. */
  hasAudio?: boolean;
  muted?: boolean;
  /** Clip-edge fades from `data-fade-in` / `data-fade-out`, seconds; absent means none. */
  fadeIn?: number;
  fadeOut?: number;
  /** Verbatim `data-fx-chain` / `data-automation` (`masterChain`: the root's); see automationLaneData. */
  fxChain?: string;
  automation?: string;
  masterChain?: string;
  /** Path from data-composition-src — identifies sub-composition elements */
  compositionSrc?: string;
  /** Set by data-timeline-locked on the host element — disables move and trim in Studio. */
  timelineLocked?: boolean;
  /** Set by data-hidden on the host element — hides the clip in preview and render. */
  hidden?: boolean;
  /** Value of data-timeline-role attribute — used to identify music vs. voiceover. */
  timelineRole?: string;
  /** Verbatim `data-audio-group` — the id of the `<hf-audio-group>` this clip belongs to, when any. */
  audioGroup?: string;
  /** The owning group's `data-label` (falls back to its id) — resolved once per parse. */
  audioGroupLabel?: string;
  /** The owning group's `data-volume` (defaults to 1) — resolved once per parse. */
  audioGroupVolume?: number;
  /** The owning group's `data-hidden` (defaults to false) — resolved once per parse. */
  audioGroupHidden?: boolean;
  /** The owning group's serialized `data-fx-chain`, when set — resolved once per parse. */
  audioGroupFxChain?: string;
  audioGroupAutomation?: string;
  link?: string;
  compositionScope?: string;
  syncOrigin?: string;
  /**
   * Master start of the composition this row runs in, which its tweens and its
   * `data-start` are local to; 0 at the root. Writes go through toAuthoredStart.
   */
  parentCompositionStart?: number;
  /** A legacy root-global media start: its `data-start` is already master time. */
  authoredStartIsMasterTime?: boolean;
  /** Legacy marker for an inline sub-composition child; current rows never set it. */
  expandedHostKey?: string;
  /** A text layer's words and look, which its row draws live instead of a captured picture. */
  text?: TimelineText;
}

export interface TimelineText {
  value: string;
  fontFamily?: string;
  fontWeight?: string;
  color?: string;
  /** The layer's own opaque background colour, when it paints one. */
  background?: string;
}

type RowClock = Pick<
  TimelineElement,
  "start" | "parentCompositionStart" | "authoredStartIsMasterTime"
>;
type SavedClip = RowClock & Pick<TimelineElement, "duration">;
const authoredOffset = (element: RowClock) =>
  element.authoredStartIsMasterTime ? 0 : (element.parentCompositionStart ?? 0);

/**
 * Where a clip's edges sit once saved: its file stores the local start to the centisecond, and the
 * duration too when a resize writes it; a move keeps the authored duration.
 */
export function savedClipEdges(element: SavedClip, start: number, resizedDuration?: number) {
  const savedStart = authoredOffset(element) + roundToCenti(toAuthoredStart(element, start));
  const duration = resizedDuration === undefined ? element.duration : roundToCenti(resizedDuration);
  return { start: savedStart, end: savedStart + duration };
}

/** The earliest master start this row can take: its host's start, or its own if already earlier. */
export function clampToHostStart(element: RowClock, masterTime: number): number {
  return Math.max(Math.min(authoredOffset(element), element.start), masterTime);
}

/** A master-time position on this row, as the `data-start` its source file stores. */
export function toAuthoredStart(element: RowClock, masterTime: number): number {
  return Math.max(0, clampToHostStart(element, masterTime) - authoredOffset(element));
}

/** A master-time position on the clock this row's tweens run on. */
export function toCompositionTime(element: RowClock, masterTime: number): number {
  return masterTime - (element.parentCompositionStart ?? 0);
}

type CompositionScoped = Pick<TimelineElement, "sourceFile" | "compositionScope">;

export function sameCompositionScope(a: CompositionScoped, b: CompositionScoped): boolean {
  return (
    (a.sourceFile ?? "") === (b.sourceFile ?? "") &&
    (a.compositionScope ?? "") === (b.compositionScope ?? "")
  );
}

/**
 * The fields `updateElement` may write.
 *
 * Deliberately a narrow allow-list rather than `Partial<TimelineElement>`: most
 * of an element is derived from the document at parse time, and letting a
 * caller poke those would put the store out of step with the file it mirrors.
 *
 * The `audioGroup*` entries are the GROUP's state, mirrored onto every member —
 * a group row derives its label, fader, mute and chain from these, so a group
 * write has to be able to land here or the header goes on rendering whatever it
 * parsed at load.
 */
export type TimelineElementPatch = Partial<
  Pick<
    TimelineElement,
    | "start"
    | "duration"
    | "track"
    | "zIndex"
    | "hasExplicitZIndex"
    | "playbackStart"
    | "hidden"
    | "audioGroup"
    | "audioGroupLabel"
    | "audioGroupVolume"
    | "audioGroupHidden"
    | "audioGroupFxChain"
    | "audioGroupAutomation"
    | "text"
  >
>;

/**
 * The `data-*` state an expanded sub-composition child needs but cannot reach.
 *
 * A child row is synthesized from a manifest clip with no element to read, and
 * for a real sub-composition it has no flat store twin either: such clips are
 * dropped before the flat store is built. Read off the live preview instead
 * (`collectSubCompositionHostState`) and carried on the store by dom id.
 *
 * Without it the eye reported every hidden child visible, so clicking it wrote
 * `data-hidden` a second time instead of removing it, and the element could
 * never be shown again, not even after a reload, since the attribute is in the
 * source.
 */
export interface SubCompositionHostState {
  hidden?: boolean;
  timelineLocked?: boolean;
  timelineRole?: string;
  fxChain?: string;
  automation?: string;
}
