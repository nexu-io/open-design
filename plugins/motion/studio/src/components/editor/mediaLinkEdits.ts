import { HF_AUDIO_AUTOMATION_ATTR } from "@hyperframes/core/audio-automation";
import {
  MEDIA_LINK_ATTR,
  SYNC_ORIGIN_ATTR,
  mintLinkId,
  sourceZeroTime,
} from "@hyperframes/core/media-link";
import { sameCompositionScope, type TimelineElement } from "../../player/store/timelineElement";
import { mediaAssetIdentity, sharesLinkGroup } from "../../player/components/audioClipLink";
import {
  applyPatchByTarget,
  findTagByTarget,
  readAttributeByTarget,
  type PatchOperation,
  type PatchTarget,
} from "../../utils/sourcePatcher";
import { collectHtmlIds } from "../../utils/studioHelpers";
import { generateId } from "../../utils/generateId";
import {
  COPIED_TIMING_ATTRS,
  MOVED_SOUND_ATTRS,
  firstFreeName,
  formatAttrs,
  insertBeforeTarget,
  readAuthoredSrc,
  splitAutomation,
} from "./mediaAudioEdits";

const LINK_PROPERTY = MEDIA_LINK_ATTR.slice("data-".length);
const HIDDEN_ATTR = "data-hidden";
const SYNC_ORIGIN_PROPERTY = SYNC_ORIGIN_ATTR.slice("data-".length);
const SYNC_TOLERANCE_S = 1e-3;

const dataOp = (property: string, value: string | null): PatchOperation => ({
  type: "attribute",
  property: property.startsWith("data-") ? property.slice("data-".length) : property,
  value,
});

const htmlOp = (property: string, value: string | null): PatchOperation => ({
  type: "html-attribute",
  property,
  value,
});

function applyOps(source: string, target: PatchTarget, ops: readonly PatchOperation[]): string {
  return ops.reduce((html, op) => applyPatchByTarget(html, target, op), source);
}

function mintLinkIdForSource(source: string): string {
  const links = Array.from(
    source.matchAll(/\bdata-(?:link|sync-origin)=["']([^"']+)["']/g),
    (match) => match[1] ?? "",
  );
  return mintLinkId([...collectHtmlIds(source), ...links]);
}

/** Write (or with `null`, remove) `data-link` on every target. */
export function setLinkInSource(
  source: string,
  targets: readonly PatchTarget[],
  linkId: string | null,
): string {
  return targets.reduce(
    (html, target) => applyPatchByTarget(html, target, dataOp(LINK_PROPERTY, linkId)),
    source,
  );
}

/** Link the targets under one fresh id, also their sync origin when they share a source file. */
export function linkInSource(
  source: string,
  targets: readonly PatchTarget[],
  options: { syncOrigin: boolean } = { syncOrigin: true },
): string {
  const linkId = mintLinkIdForSource(source);
  const ops = options.syncOrigin
    ? [dataOp(LINK_PROPERTY, linkId), dataOp(SYNC_ORIGIN_PROPERTY, linkId)]
    : [dataOp(LINK_PROPERTY, linkId)];
  return targets.reduce((html, target) => applyOps(html, target, ops), source);
}

/** Remove one element (open tag through its matching close tag) and its line's indentation. */
export function removeElementInSource(source: string, target: PatchTarget): string {
  const match = findTagByTarget(source, target);
  if (!match) return source;
  const tagName = /^<([a-zA-Z][\w-]*)/.exec(match.tag)?.[1]?.toLowerCase() ?? "";
  const closing = `</${tagName}>`;
  const closeAt = match.tag.endsWith("/>")
    ? -1
    : source.toLowerCase().indexOf(closing, match.end + 1);
  let end = closeAt >= 0 ? closeAt + closing.length : match.end + 1;
  let start = match.start;
  const lineStart = source.lastIndexOf("\n", start) + 1;
  if (/^[ \t]*$/.test(source.slice(lineStart, start)) && source[end] === "\n") {
    start = lineStart;
    end += 1;
  }
  return source.slice(0, start) + source.slice(end);
}

function hasBooleanAttr(source: string, target: PatchTarget, name: string): boolean {
  const tag = findTagByTarget(source, target)?.tag ?? "";
  return new RegExp(`\\s${name}(?=[\\s=/>]|$)`, "i").test(tag);
}

export interface DetachAudioResult {
  html: string;
  audioId: string;
  linkId: string;
}

/**
 * Detach audio: insert a linked `<audio>` over the same file and window, move the
 * sound attributes onto it, and mute the video. Renders identically.
 */
export function detachAudioInSource(
  source: string,
  input: { target: PatchTarget; videoId: string | null; track: number },
): DetachAudioResult | null {
  const { target } = input;
  if (!findTagByTarget(source, target)) return null;
  const linkId = mintLinkIdForSource(source);
  const audioId = firstFreeName(
    `${input.videoId || "video"}-audio`,
    new Set(collectHtmlIds(source)),
  );

  const moved: Array<[string, string]> = [];
  const videoOps: PatchOperation[] = [htmlOp("muted", "true"), dataOp("has-audio", null)];
  for (const name of MOVED_SOUND_ATTRS) {
    const value = readAttributeByTarget(source, target, name);
    if (value === undefined) continue;
    moved.push([name, value]);
    videoOps.push(dataOp(name, null));
  }
  const automation = readAttributeByTarget(source, target, HF_AUDIO_AUTOMATION_ATTR);
  if (automation !== undefined) {
    const { videoKeeps, audioTakes } = splitAutomation(automation);
    moved.push([HF_AUDIO_AUTOMATION_ATTR, audioTakes]);
    videoOps.push(dataOp(HF_AUDIO_AUTOMATION_ATTR, videoKeeps));
  }
  videoOps.push(dataOp(LINK_PROPERTY, linkId), dataOp(SYNC_ORIGIN_PROPERTY, linkId));

  const timing: Array<[string, string]> = [];
  for (const name of COPIED_TIMING_ATTRS) {
    const value = readAttributeByTarget(source, target, name);
    if (value !== undefined) timing.push([`data-${name}`, value]);
  }
  const attrs: Array<[string, string]> = [
    ["id", audioId],
    ["data-hf-id", `hf-${generateId()}`],
    ["class", "clip"],
    ["src", readAuthoredSrc(source, target)],
    ...timing,
    ["data-track-index", String(input.track)],
    [MEDIA_LINK_ATTR, linkId],
    [SYNC_ORIGIN_ATTR, linkId],
    ...moved,
  ];
  if (hasBooleanAttr(source, target, "loop")) attrs.push(["loop", ""]);
  if (hasBooleanAttr(source, target, HIDDEN_ATTR)) attrs.push([HIDDEN_ATTR, ""]);
  const inserted = insertBeforeTarget(source, target, `<audio ${formatAttrs(attrs)}></audio>`);
  return { html: applyOps(inserted, target, videoOps), audioId, linkId };
}

/**
 * Merge back: move the audio's sound attributes onto its video, unmute the
 * video, drop the link, and delete the audio. The inverse of detach.
 */
export function mergeAudioInSource(
  source: string,
  input: { videoTarget: PatchTarget; audioTarget: PatchTarget },
): string | null {
  const { videoTarget, audioTarget } = input;
  if (!findTagByTarget(source, videoTarget) || !findTagByTarget(source, audioTarget)) return null;
  const assetOf = (target: PatchTarget) =>
    mediaAssetIdentity({ src: readAuthoredSrc(source, target) });
  const videoAsset = assetOf(videoTarget);
  if (!videoAsset || videoAsset !== assetOf(audioTarget)) return null;
  const hiddenOf = (target: PatchTarget) => hasBooleanAttr(source, target, HIDDEN_ATTR);
  if (hiddenOf(videoTarget) !== hiddenOf(audioTarget)) return null;
  const videoOps: PatchOperation[] = [];
  for (const name of MOVED_SOUND_ATTRS) {
    const value = readAttributeByTarget(source, audioTarget, name);
    videoOps.push(dataOp(name, value ?? null));
  }
  const automation = readAttributeByTarget(source, audioTarget, HF_AUDIO_AUTOMATION_ATTR);
  if (automation !== undefined) videoOps.push(dataOp(HF_AUDIO_AUTOMATION_ATTR, automation));
  videoOps.push(
    htmlOp("muted", null),
    dataOp(LINK_PROPERTY, null),
    dataOp(SYNC_ORIGIN_PROPERTY, null),
    dataOp("has-audio", "true"),
  );
  return applyOps(removeElementInSource(source, audioTarget), videoTarget, videoOps);
}

type TimedElement = Pick<
  TimelineElement,
  "id" | "key" | "tag" | "src" | "start" | "duration" | "playbackStart" | "playbackRate" | "link"
> &
  Pick<TimelineElement, "muted" | "hasAudio" | "hidden" | "sourceFile" | "compositionScope">;

const tagOf = (el: Pick<TimelineElement, "tag">) => el.tag.trim().toLowerCase();
const keyOf = (el: Pick<TimelineElement, "id" | "key">) => el.key ?? el.id;
const near = (a: number, b: number) => Math.abs(a - b) <= SYNC_TOLERANCE_S;

function hasIdenticalTiming(a: TimedElement, b: TimedElement): boolean {
  return (
    near(a.start, b.start) &&
    near(a.duration, b.duration) &&
    near(a.playbackStart ?? 0, b.playbackStart ?? 0) &&
    near(a.playbackRate ?? 1, b.playbackRate ?? 1)
  );
}

const sameAssetInScope = (a: TimedElement, b: TimedElement) => {
  const asset = mediaAssetIdentity(a);
  return asset !== null && asset === mediaAssetIdentity(b) && sameCompositionScope(a, b);
};

/** A video whose sound is on the video itself: what Detach audio acts on. */
export function canDetachAudio(el: TimedElement): boolean {
  return tagOf(el) === "video" && el.muted !== true && el.hasAudio === true;
}

/**
 * The (muted video, audio) pair Merge back acts on, found from either member:
 * same file, and linked to each other or with identical timing.
 */
export function findMergePair<T extends TimedElement>(
  element: T,
  elements: readonly T[],
): { video: T; audio: T } | null {
  const isVideo = tagOf(element) === "video";
  if (!isVideo && tagOf(element) !== "audio") return null;
  const partnerTag = isVideo ? "audio" : "video";
  const candidates = elements.filter(
    (el) =>
      keyOf(el) !== keyOf(element) && tagOf(el) === partnerTag && sameAssetInScope(el, element),
  );
  const partner =
    candidates.find((el) => sharesLinkGroup(el, element)) ??
    candidates.find((el) => hasIdenticalTiming(el, element));
  if (!partner) return null;
  const video = isVideo ? element : partner;
  const audio = isVideo ? partner : element;
  if ((video.hidden === true) !== (audio.hidden === true)) return null;
  return video.muted === true ? { video, audio } : null;
}

/** One video and one audio in one composition, neither linked: timing and file don't matter. */
export function canLinkPair(selected: readonly TimedElement[]): boolean {
  if (selected.length !== 2) return false;
  const [a, b] = selected;
  if (!a || !b || a.link || b.link) return false;
  const tags = new Set([tagOf(a), tagOf(b)]);
  return tags.has("video") && tags.has("audio") && sameCompositionScope(a, b);
}

export function sharesSourceFile(selected: readonly TimedElement[]): boolean {
  const [a, b] = selected;
  return selected.length === 2 && !!a && !!b && sameAssetInScope(a, b);
}

export function isPairInSync(a: TimedElement, b: TimedElement): boolean {
  const timing = (el: TimedElement) => ({
    start: el.start,
    mediaStart: el.playbackStart ?? 0,
    playbackRate: el.playbackRate ?? 1,
  });
  const [x, y] = [timing(a), timing(b)];
  return near(x.playbackRate, y.playbackRate) && near(sourceZeroTime(x), sourceZeroTime(y));
}

type TrackedElement = Pick<TimelineElement, "tag" | "track" | "start" | "duration"> & {
  authoredTrack?: number;
};

/**
 * The detached audio's track: the first audio-only track below every visual
 * track that is free for the clip's window, else a new track at the bottom.
 */
export function pickDetachedAudioTrack(
  elements: readonly TrackedElement[],
  window: { start: number; duration: number },
): number {
  const trackOf = (el: TrackedElement) => el.authoredTrack ?? el.track;
  const visualTracks = elements.filter((el) => tagOf(el) !== "audio").map(trackOf);
  const lowestAudio = Math.max(-1, ...visualTracks) + 1;
  const end = window.start + window.duration;
  const allTracks = elements.map(trackOf);
  const bottom = Math.max(lowestAudio - 1, ...allTracks) + 1;
  for (let track = lowestAudio; track < bottom; track += 1) {
    const occupants = elements.filter((el) => trackOf(el) === track);
    const free = occupants.every(
      (el) => tagOf(el) === "audio" && (el.start >= end || el.start + el.duration <= window.start),
    );
    if (free) return track;
  }
  return bottom;
}
