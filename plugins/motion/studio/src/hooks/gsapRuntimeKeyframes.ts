/**
 * Read GSAP keyframe data from the live runtime in the preview iframe.
 * Used to discover dynamic keyframes that the AST parser can't resolve
 * (data-driven loops, fetched values, computed selectors).
 *
 * Keyframe percentages returned here are TWEEN-RELATIVE (0–100 within the
 * tween), matching the static parser. Callers convert to clip-relative via
 * `toAbsoluteTime` + the element's clip start/duration. `scanAllRuntimeKeyframes`
 * does that conversion itself when given a `clipById` map.
 */
import type { ArcPathConfig } from "@hyperframes/core/gsap-parser-acorn";
import { parsePercentageKeyframes, toAbsoluteTime } from "./gsapShared";
import { timeAtProgress } from "../utils/gsapKeyframeEases";
import { readMotionPathTween } from "./gsapRuntimeMotionPath";
import { roundTo3 } from "../utils/rounding";
import { matchesElement, tweensTargeting } from "./gsapRuntimeTweenIndex";
import { withParsedStart } from "./gsapParsedTween";
import { BOX_SIZE_STYLE_PROPS } from "../components/editor/manualEditsDomPatches";
import { gsapRendersTransform } from "../components/editor/gsapAnimatesProperty";

/**
 * A GSAP tween's `vars` object — intentionally open: it mixes channel values
 * (numbers), easing (strings), flags (booleans), nested keyframes (objects) and
 * callbacks. Named so call sites read as "GSAP config", not an untyped escape hatch.
 */
export type GsapVars = Record<string, unknown>;

export interface RuntimeTween {
  targets?: () => Element[];
  vars?: GsapVars;
  duration?: () => number;
  startTime?: () => number;
  invalidate?: () => RuntimeTween;
  /** Remove this tween from its parent timeline (GSAP `kill()`). */
  kill?: () => void;
  /** The timeline this tween lives in — used to re-insert a rebuilt tween. */
  parent?: RuntimeTimeline;
}

export interface RuntimeTimeline {
  getChildren?: (deep: boolean) => RuntimeTween[];
  duration?: () => number;
  time?: () => number;
  invalidate?: () => RuntimeTimeline;
  /** Add a tween at an absolute position — used to rebuild a keyframe tween in place. */
  to?: (targets: Element[], vars: GsapVars, position?: number) => RuntimeTween;
}

type Pct = { percentage: number; properties: Record<string, number | string>; step?: number };
export type ReadTween = {
  keyframes: Pct[];
  easeEach?: string;
  arcPath?: ArcPathConfig;
  runEase?: string;
  /** GSAP's start values when the first keyframe is after 0%. */
  start?: Record<string, number>;
};

export interface RuntimeKeyframeEntry {
  keyframes: Pct[];
  easeEach?: string;
  /** Present when the live tween uses motionPath — drives the Arc Motion panel. */
  arcPath?: ArcPathConfig;
  /** Absolute start time of the source tween (seconds). */
  tweenStart: number;
  /** Duration of the source tween (seconds). */
  tweenDuration: number;
}

/** Clip start/duration per element id, to convert tween-relative % to clip-relative. */
export type ClipDims = Map<string, { start: number; duration: number }>;

const FLAT_SKIP_KEYS = new Set([
  "ease",
  "duration",
  "delay",
  "stagger",
  "motionPath",
  "overwrite",
  "immediateRender",
  "onComplete",
  "onUpdate",
  "onStart",
  "keyframes",
]);

function timelinesOf(iframe: HTMLIFrameElement | null): Record<string, RuntimeTimeline> | null {
  if (!iframe?.contentWindow) return null;
  try {
    return (
      (iframe.contentWindow as unknown as { __timelines?: Record<string, RuntimeTimeline> })
        .__timelines ?? null
    );
  } catch {
    return null;
  }
}

/**
 * A tween we must skip when reading keyframes: a zero-duration `set`/hold (incl.
 * the studio pre-keyframe position hold, tagged `data: STUDIO_HOLD_MARKER`).
 * These sit before the real keyframed tween and otherwise shadow it — `readTween`
 * would fall back to a degenerate 2-point flat path from the set's values, hiding
 * the actual multi-keyframe motion. `!(duration > 0)` also rejects NaN durations.
 */
function isZeroDurationSet(duration: number): boolean {
  return !(duration > 0);
}

function flatTweenKeyframes(vars: Record<string, unknown>): Pct[] | null {
  const properties: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(vars)) {
    if (FLAT_SKIP_KEYS.has(k)) continue;
    if (typeof v === "number") properties[k] = roundTo3(v);
    else if (typeof v === "string") properties[k] = v;
  }
  if (Object.keys(properties).length === 0) return null;
  return [
    { percentage: 0, properties },
    { percentage: 100, properties },
  ];
}

const stringOr = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Tween-relative keyframes + optional arcPath for one live tween, or null. */
function readTween(vars: Record<string, unknown>): ReadTween | null {
  const runEase = stringOr(vars.ease);
  if (vars.keyframes && typeof vars.keyframes === "object") {
    const parsed = parsePercentageKeyframes(vars.keyframes as Record<string, unknown>);
    const keyframesEase = stringOr((vars.keyframes as { ease?: unknown }).ease);
    if (parsed) return { ...parsed, runEase: keyframesEase ?? runEase };
  }
  const path = readMotionPathTween(vars, runEase);
  if (path) return path;
  const flat = flatTweenKeyframes(vars);
  return flat ? { keyframes: flat } : null;
}

function tweenTiming(tween: RuntimeTween): { start: number; duration: number } {
  const rawStart = typeof tween.startTime === "function" ? tween.startTime() : 0;
  const rawDur = typeof tween.duration === "function" ? tween.duration() : 0;
  return {
    start: Number.isFinite(rawStart) ? rawStart : 0,
    duration: Number.isFinite(rawDur) ? rawDur : 0,
  };
}

export interface ResolvedRuntimeTween {
  /** The live GSAP tween targeting the selector. */
  tween: RuntimeTween;
  /** The composition timeline that owns it. */
  timeline: RuntimeTimeline;
}

/**
 * Whether a tween's `vars` carry at least one of `channels` as an OWN property.
 * Used to disambiguate co-located `set`s: an element can have separate
 * `tl.set("#el",{x,y})` and `tl.set("#el",{rotation})` tweens, and a position
 * patch must land on the {x,y} set — never the rotation-only one.
 */
function varsCarryChannel(vars: Record<string, unknown> | undefined, channels: string[]): boolean {
  if (!vars) return false;
  for (const ch of channels) {
    if (Object.prototype.hasOwnProperty.call(vars, ch)) return true;
  }
  return false;
}

/**
 * Like `varsCarryChannel` but for a keyframe tween: the channels live inside the
 * keyframe steps (`vars.keyframes`), not as own props of `vars`. Handles the object
 * form (`{ "0%": {...} }`), the array form (`[{...}, ...]`) and the object-of-arrays form.
 */
function keyframeVarsCarryChannel(
  vars: Record<string, unknown> | undefined,
  channels: string[],
): boolean {
  const kf = vars?.keyframes;
  if (!kf || typeof kf !== "object") return false;
  if (!Array.isArray(kf) && channels.some((ch) => Object.prototype.hasOwnProperty.call(kf, ch)))
    return true;
  const steps = Array.isArray(kf) ? kf : Object.values(kf);
  return steps.some(
    (step) =>
      step != null &&
      typeof step === "object" &&
      channels.some((ch) => Object.prototype.hasOwnProperty.call(step, ch)),
  );
}

/**
 * Resolve the live tween targeting `selector` using the SAME all-timelines scan
 * `readRuntimeKeyframes` uses, so read and write agree on "which tween". With
 * `kind: "keyframe"` it skips zero-duration `set`s and prefers the tween whose
 * range contains the playhead (matching the reader). With `kind: "set"` it picks
 * the zero-duration `set`/hold instead. Returns null when none matches.
 *
 * `channels` disambiguates co-located `set`s (CHANNEL-BLIND otherwise): when
 * provided with `kind: "set"`, a set carrying ONE of those channels wins, and a
 * set carrying ONLY disjoint channels is skipped (so patching {x,y} never lands
 * on a rotation-only set). With no channel-matching set, it falls back to the
 * first matching set (back-compat). `channels` is ignored for `kind: "keyframe"`.
 */
// fallow-ignore-next-line complexity
export function resolveRuntimeTween(
  iframe: HTMLIFrameElement | null,
  selector: string,
  kind: "keyframe" | "set",
  compositionId?: string,
  channels?: string[],
  // fallow-ignore-next-line code-duplication
): ResolvedRuntimeTween | null {
  const timelines = timelinesOf(iframe);
  if (!timelines) return null;

  let targetEl: Element | null = null;
  try {
    targetEl = iframe?.contentDocument?.querySelector(selector) ?? null;
  } catch {
    return null;
  }
  if (!targetEl) return null;

  const tlIds = compositionId
    ? [compositionId]
    : Object.keys(timelines).filter((k) => typeof timelines[k]?.getChildren === "function");

  // Channels disambiguate co-located tweens for BOTH kinds: a `set` carries them as
  // own vars props, a keyframe tween carries them inside its keyframe steps. An
  // element can have a rotation keyframe tween AND a position keyframe tween; a
  // rotation edit must land on the former. The reader passes no channels, so its
  // playhead-containment path below is unchanged.
  const wantChannels = channels && channels.length > 0 ? channels : null;

  let first: ResolvedRuntimeTween | null = null;
  // fallow-ignore-next-line code-duplication
  let channelMatch: ResolvedRuntimeTween | null = null;
  for (const tlId of tlIds) {
    const timeline = timelines[tlId];
    if (!timeline?.getChildren) continue;
    const now = typeof timeline.time === "function" ? timeline.time() : null;
    for (const tween of timeline.getChildren(true)) {
      if (!tween.vars || !matchesElement(tween, targetEl)) continue;
      const dur = typeof tween.duration === "function" ? tween.duration() : 0;
      const isSet = !(dur > 0);
      if (kind === "set" ? !isSet : isSet) continue;
      if (wantChannels) {
        const carries =
          kind === "set"
            ? varsCarryChannel(tween.vars, wantChannels)
            : keyframeVarsCarryChannel(tween.vars, wantChannels);
        if (carries) {
          if (channelMatch === null) channelMatch = { tween, timeline };
        } else if (first === null) {
          // A tween carrying only disjoint channels: remember as last-resort
          // fallback, but never prefer it over a channel-matching one.
          first = { tween, timeline };
        }
        continue;
      }
      if (first === null) first = { tween, timeline };
      if (kind === "keyframe" && now != null) {
        const start = typeof tween.startTime === "function" ? tween.startTime() : 0;
        if (now >= start - 1e-3 && now <= start + dur + 1e-3) return { tween, timeline };
      }
    }
  }
  return channelMatch ?? first;
}

/** Whether a read carries at least one of `channels` as a keyframe property. */
function readCarriesChannel(read: ReadTween, channels: string[]): boolean {
  return read.keyframes.some((kf) => channels.some((c) => kf.properties[c] != null));
}

/**
 * Read keyframes (incl. motionPath arcs) for one selector from the live timeline.
 * Returns tween-relative percentages; callers convert to clip-relative.
 *
 * `requireChannels` restricts the scan to tweens whose read carries one of those
 * properties — e.g. the motion-path overlay passes `["x","y"]` so it never picks
 * up a co-located size/scale tween (which has no x/y and would blank the path
 * whenever the playhead sits in that tween's range but outside the position
 * tween's). Omitted → any keyframed tween qualifies (back-compat).
 */
// fallow-ignore-next-line complexity
export function readRuntimeKeyframes(
  iframe: HTMLIFrameElement | null,
  selector: string,
  compositionId?: string,
  requireChannels?: string[],
  // fallow-ignore-next-line code-duplication
): ReadTween | null {
  const timelines = timelinesOf(iframe);
  if (!timelines) return null;

  let targetEl: Element | null = null;
  try {
    targetEl = iframe?.contentDocument?.querySelector(selector) ?? null;
  } catch {
    return null;
  }
  if (!targetEl) return null;

  // Search the element's OWN composition timeline. With inlined subcompositions the
  // preview has multiple timelines (one per composition), and the element belongs to
  // exactly one — so we can't assume the first key (order isn't stable across soft
  // reloads, which delete+re-add the rebuilt key). Scan every timeline for tweens
  // targeting this element; only its composition's timeline matches. An explicit
  // compositionId still pins the search. (`__proxied` and other non-timeline markers
  // are skipped by the getChildren guard.)
  const tlIds = compositionId
    ? [compositionId]
    : Object.keys(timelines).filter((k) => typeof timelines[k]?.getChildren === "function");
  if (tlIds.length === 0) return null;

  // The element can have MORE THAN ONE keyframed tween at disjoint time ranges
  // (e.g. two non-overlapping gesture recordings → two separate `to()`s). The
  // overlay must draw the segment under the PLAYHEAD, not blindly the first one
  // — otherwise recording a second gesture leaves the path stuck on the first.
  // fallow-ignore-next-line code-duplication
  let firstRead: ReadTween | null = null;
  for (const tlId of tlIds) {
    const timeline = timelines[tlId];
    if (!timeline?.getChildren) continue;
    const now = typeof timeline.time === "function" ? timeline.time() : null;
    // fallow-ignore-next-line code-duplication
    for (const tween of timeline.getChildren(true)) {
      if (!tween.vars || !matchesElement(tween, targetEl)) continue;
      const dur = typeof tween.duration === "function" ? tween.duration() : 0;
      if (isZeroDurationSet(dur)) continue; // skip hold/set tweens (see isZeroDurationSet)
      const read = readTween(tween.vars);
      if (!read) continue;
      if (requireChannels && !readCarriesChannel(read, requireChannels)) continue;
      if (firstRead === null) firstRead = withParsedStart(read, tween);
      // Prefer the tween whose [start, start+dur] contains the playhead.
      if (now != null) {
        const start = typeof tween.startTime === "function" ? tween.startTime() : 0;
        if (now >= start - 1e-3 && now <= start + dur + 1e-3) return withParsedStart(read, tween);
      }
    }
  }
  // Playhead outside every tween's range (or timeline has no clock): the element
  // still has motion, so fall back to the first keyframed tween.
  return firstRead;
}

/**
 * Whether any live timeline has at least one NON-HOLD tween (non-zero duration,
 * not the studio position-hold `set`) targeting `selector`. Every timeline is read:
 * a soft reload re-adds the rebuilt composition's key last. Stricter than a
 * truthy `readRuntimeKeyframes`: that returns a flat read for any property-bearing
 * tween, so it can't distinguish a real animation from a leftover hold/marker.
 * The drag's stale-parse guard needs this exact distinction — after a delete-all
 * only a hold may remain, and resurrecting the deleted tween from the stale parse
 * must be avoided.
 * When `channels` is provided, only tweens carrying one of those keyframe
 * properties count as non-hold motion (e.g. position channels), so a sibling
 * rotation/scale tween doesn't make a static position hold enter the keyframe
 * branch.
 */
export function hasNonHoldTweenForElement(
  iframe: HTMLIFrameElement | null,
  selector: string,
  compositionId?: string,
  channels?: string[],
): boolean {
  let targetEl: Element | null = null;
  try {
    targetEl = iframe?.contentDocument?.querySelector(selector) ?? null;
  } catch {
    return false;
  }
  return !!targetEl && hasNonHoldTween(timelinesOf(iframe), targetEl, channels, compositionId);
}

// A sibling rotation/scale tween must never push a static position hold into the keyframe branch.
export const POSITION_CHANNELS: string[] = [
  "x",
  "y",
  "xPercent",
  "yPercent",
  "left",
  "top",
  // readTween reads the authored translateX/Y; GSAP normalizes them to x/y only at play time.
  "translateX",
  "translateY",
];
const MOVE_CHANNELS = [...POSITION_CHANNELS, "motionPath"];

export const GSAP_TRANSFORM_KEYS = new Set(
  "x,y,z,scale,scaleX,scaleY,xPercent,yPercent,rotation,rotationX,rotationY,skewX,skewY,transformOrigin,svgOrigin,force3D,smoothOrigin,transformPerspective,translateX,translateY,translateZ,rotate,rotationZ,rotateZ,rotateX,rotateY".split(
    ",",
  ),
);

/** Whether a live timeline tween or hold writes any of `channels` on `el`. Sync, no fetch. */
export function gsapWritesChannels(el: Element, channels: string[]): boolean {
  const win = el.ownerDocument.defaultView as { __timelines?: Record<string, RuntimeTimeline> };
  return Object.values(win?.__timelines ?? {}).some((tl) =>
    tweensTargeting(tl, el).some(
      (tween) =>
        !!tween.vars &&
        (channels.some((ch) => ch in tween.vars!) ||
          keyframeVarsCarryChannel(tween.vars, channels)),
    ),
  );
}

// GSAP's CSSPlugin also takes rotate, rotateX/Y/Z for rotation.
export const ROTATION_CHANNELS: string[] = [
  ...["rotation", "rotationX", "rotationY", "rotationZ"],
  ...["rotate", "rotateX", "rotateY", "rotateZ"],
];

/** GSAP owns this element's position: a tween or hold writes it, or GSAP already renders its
 *  transform (a CSS translate would then apply twice). Everything else moves by plain CSS. */
function gsapWritesPosition(el: Element): boolean {
  return gsapRendersTransform(el) || gsapWritesChannels(el, MOVE_CHANNELS);
}

/** `gsapWritesPosition` for a rotate: everything else turns by its own CSS `rotate`. */
function gsapWritesRotation(el: Element): boolean {
  return gsapRendersTransform(el) || gsapWritesChannels(el, ROTATION_CHANNELS);
}

export function gsapHoldsTranslate(el: Element): boolean {
  const cache = (el as { _gsap?: Record<string, unknown> })._gsap;
  return ["x", "y", "xPercent", "yPercent"].some(
    (key) => !!Number.parseFloat(String(cache?.[key])),
  );
}

const BOX_CHANNELS = [
  ...BOX_SIZE_STYLE_PROPS.map((prop) =>
    prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()),
  ),
  "scaleX",
  "scaleY",
];

/** GSAP owns this element's box: its position, or any property the CSS box writer sets. Else a resize writes CSS. */
function gsapWritesBox(el: Element): boolean {
  return gsapWritesPosition(el) || gsapWritesChannels(el, BOX_CHANNELS);
}

export type EditGesture = "move" | "resize" | "rotate";
const GSAP_OWNS: Record<EditGesture, (el: Element) => boolean> = {
  move: gsapWritesPosition,
  resize: gsapWritesBox,
  rotate: gsapWritesRotation,
};

/** The one GSAP-or-CSS route decision. Make it when an edit starts and carry it: mid-gesture
 *  writes make GSAP render the element, so asking again at commit can flip the route. */
export function editsPlainCss(el: Element, gesture: EditGesture): boolean {
  return !GSAP_OWNS[gesture](el);
}

/** `hasNonHoldTweenForElement` for an element in hand, read from its own window's timelines. */
export function elementHasNonHoldTween(el: Element, channels?: string[]): boolean {
  const win = el.ownerDocument.defaultView as {
    __timelines?: Record<string, RuntimeTimeline>;
  } | null;
  return hasNonHoldTween(win?.__timelines ?? null, el, channels);
}

// fallow-ignore-next-line complexity
function hasNonHoldTween(
  timelines: Record<string, RuntimeTimeline> | null,
  targetEl: Element,
  channels?: string[],
  compositionId?: string,
): boolean {
  if (!timelines) return false;
  for (const tlId of compositionId ? [compositionId] : Object.keys(timelines)) {
    for (const tween of tweensTargeting(timelines[tlId], targetEl)) {
      if (!tween.vars) continue;
      const dur = typeof tween.duration === "function" ? tween.duration() : 0;
      if (isZeroDurationSet(dur)) continue; // skip hold/set tweens (see isZeroDurationSet)
      if (channels && keyframeVarsCarryChannel(tween.vars, channels)) return true;
      const read = readTween(tween.vars);
      if (read && (!channels || readCarriesChannel(read, channels))) return true;
    }
  }
  return false;
}

/** Convert tween-relative keyframes to clip-relative % using the element's clip dims. */
function toClipRelative(
  read: ReadTween,
  tweenStart: number,
  tweenDuration: number,
  clip: { start: number; duration: number } | undefined,
): Pct[] {
  const { keyframes, runEase } = read;
  if (!clip || clip.duration <= 0) return keyframes;
  return keyframes.map((kf) => {
    const abs = toAbsoluteTime(tweenStart, tweenDuration, timeAtProgress(runEase, kf.percentage));
    return { ...kf, percentage: Math.round(((abs - clip.start) / clip.duration) * 100000) / 1000 };
  });
}

function buildEntry(
  read: ReadTween,
  start: number,
  duration: number,
  clip: { start: number; duration: number } | undefined,
): RuntimeKeyframeEntry {
  return {
    keyframes: toClipRelative(read, start, duration, clip),
    tweenStart: start,
    tweenDuration: duration,
    ...(read.easeEach ? { easeEach: read.easeEach } : {}),
    ...(read.arcPath ? { arcPath: read.arcPath } : {}),
  };
}

/** Record one tween's keyframes under each target id (first-tween-per-id wins). */
function addScanEntry(
  result: Map<string, RuntimeKeyframeEntry>,
  tween: RuntimeTween,
  clipById?: ClipDims,
): void {
  if (!tween.targets || !tween.vars) return;
  const { start, duration } = tweenTiming(tween);
  if (isZeroDurationSet(duration)) return; // skip hold/set tweens (see isZeroDurationSet)
  const read = readTween(tween.vars);
  if (!read) return;
  for (const target of tween.targets()) {
    const id = (target as HTMLElement).id;
    if (id && !result.has(id)) result.set(id, buildEntry(read, start, duration, clipById?.get(id)));
  }
}

/**
 * Scan every live tween, grouping keyframes by element id. Percentages are
 * tween-relative unless `clipById` is supplied, in which case each entry's
 * keyframes are converted to clip-relative. First keyframe-bearing tween per
 * element wins (the common single-primary-tween case).
 */
export function scanAllRuntimeKeyframes(
  iframe: HTMLIFrameElement | null,
  clipById?: ClipDims,
): Map<string, RuntimeKeyframeEntry> {
  const result = new Map<string, RuntimeKeyframeEntry>();
  const timelines = timelinesOf(iframe);
  if (!timelines) return result;
  for (const timeline of Object.values(timelines)) {
    if (!timeline?.getChildren) continue;
    for (const tween of timeline.getChildren(true)) addScanEntry(result, tween, clipById);
  }
  return result;
}
