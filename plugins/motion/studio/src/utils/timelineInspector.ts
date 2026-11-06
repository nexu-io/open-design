import { HF_AUDIO_GROUP_TAG } from "@hyperframes/core/audio-groups";
import type { TimelineElement } from "../player";

const AUDIO_TIMELINE_TAGS = new Set(["audio", "music", "sfx", "sound", "narration"]);
const AUDIO_SOURCE_EXT_RE = /\.(aac|flac|m4a|mp3|ogg|opus|wav)(?:[?#].*)?$/i;
const MUSIC_ID_RE = /\b(music|bgm|soundtrack|background[-_]?music)\b/i;

/**
 * Is this DOM node an audio clip, judged the way `isAudioTimelineElement`
 * judges a timeline element?
 *
 * The selection layer holds real elements rather than timeline records, and
 * layout grouping is decided there — so it needs the same question asked of a
 * node. Same tag set and same source-extension fallback, so the two cannot
 * drift into disagreeing about what counts as audio.
 */
export function isAudioDomElement(node: Element | null | undefined): boolean {
  if (!node) return false;
  // A group bus counts: it is audio-only, and the panel's single-select path
  // already treats `<hf-audio-group>` as audio for exactly these decisions.
  if (node.tagName.toLowerCase() === HF_AUDIO_GROUP_TAG) return true;
  return isAudioTimelineElement({
    tag: node.tagName,
    src: node.getAttribute("src") ?? undefined,
  });
}

export function isAudioTimelineElement(
  element: Pick<TimelineElement, "tag" | "src"> | null | undefined,
): boolean {
  if (!element) return false;
  const tag = element.tag.trim().toLowerCase();
  if (AUDIO_TIMELINE_TAGS.has(tag)) return true;
  return Boolean(element.src && AUDIO_SOURCE_EXT_RE.test(element.src));
}

/** A track whose hide toggle reads as mute: the header button and its undo entry. */
export function isAudioOnlyTrack(
  elements: readonly Pick<TimelineElement, "tag" | "src">[],
): boolean {
  return elements.length > 0 && elements.every(isAudioTimelineElement);
}

/** The two tags the property panel lets you put a volume automation lane on.
 * Single owner: `groupAutomationLanes`, `automationLaneCountOf` and
 * `TimelineAutomationLaneSlot`'s clip filter all have to agree on this set. */
export function isAudioOrVideoTimelineElement(
  element: Pick<TimelineElement, "tag" | "src"> | null | undefined,
): boolean {
  if (!element) return false;
  return isAudioTimelineElement(element) || element.tag.trim().toLowerCase() === "video";
}

type MusicSourceFacts = Pick<TimelineElement, "tag" | "src" | "hasAudio" | "muted">;

/** Can carry the music: an audio clip, or a video whose own sound plays. Lane zoning is unaffected. */
export function isMusicSourceElement(element: MusicSourceFacts): boolean {
  if (isAudioTimelineElement(element)) return true;
  return (
    element.tag.trim().toLowerCase() === "video" &&
    element.hasAudio === true &&
    element.muted !== true
  );
}

/** True for the music track: an audio element with data-timeline-role="music",
 *  or — when no role is set — an id matching the music regex. Voiceover/other
 *  audio (explicit non-music role) is excluded. */
export function isMusicTrack(
  element:
    | Pick<TimelineElement, "tag" | "src" | "id" | "domId" | "timelineRole" | "hasAudio" | "muted">
    | null
    | undefined,
): boolean {
  if (!element) return false;
  if (!isMusicSourceElement(element)) return false;
  if (element.timelineRole === "music") return true;
  if (element.timelineRole && element.timelineRole !== "music") return false;
  const id = element.domId ?? element.id ?? "";
  return MUSIC_ID_RE.test(id);
}

/**
 * Resolve the best audio source for beat analysis. An explicitly tagged or
 * named music track wins; when none is present (e.g. an audio file dropped
 * from Finder with a generic id), the LONGEST untagged audio clip is used as a
 * fallback. Ties on duration resolve to the FIRST such clip encountered (the loop
 * keeps the current best on `>` only), i.e. discovery/DOM order wins.
 * Returns the element and whether it was found via the fallback path.
 *
 * The `isMusicTrack` predicate is unchanged so beat-snap and drag-exclusion
 * logic remain unaffected by this fallback.
 */
export function resolveBeatSourceTrack(
  elements: readonly Pick<
    TimelineElement,
    "tag" | "src" | "id" | "domId" | "timelineRole" | "duration" | "hasAudio" | "muted"
  >[],
): { element: (typeof elements)[number]; isFallback: boolean } | null {
  const explicit = elements.find(isMusicTrack);
  if (explicit) return { element: explicit, isFallback: false };

  // Fallback: pick the longest audio clip (skipping explicitly non-music roles
  // like "sfx" or "voiceover" to avoid triggering beat analysis on those).
  let best: (typeof elements)[number] | null = null;
  for (const el of elements) {
    if (!isMusicSourceElement(el)) continue;
    if (el.timelineRole && el.timelineRole !== "music") continue;
    if (!best || el.duration > best.duration) best = el;
  }
  return best ? { element: best, isFallback: true } : null;
}

/**
 * May this multi-selection be hidden as one action?
 *
 * Audio has no visual to hide, and `data-hidden` on an audio element is what
 * mutes it: preview silences it and the render drops it from the mix. The timeline
 * and the single-selection panel offer it as a mute; "Hide all" would reach it on a
 * control whose label promises visibility.
 *
 * A shared predicate rather than a check in the handler so the panel's button
 * and the handler's refusal cannot disagree — the button is not the only caller.
 */
export function canHideSelections(selections: readonly { element?: Element | null }[]): boolean {
  return !selections.some((selection) => isAudioDomElement(selection.element));
}
