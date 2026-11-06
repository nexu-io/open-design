/**
 * Centralized "Enable keyframes" logic that handles ALL scenarios:
 * - Element has explicit keyframes → add/remove at seeked time
 * - Element has a flat tween → convert + add at seeked time + propagate to end
 * - Element has no animation (deleted) → create new tween with correct position + keyframes
 *
 * Always fetches fresh animation data to avoid stale session state.
 * Reads GSAP runtime values only (no CSS offset — it applies separately via translate).
 */
import { useCallback } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { fetchParsedAnimations, getAnimationsForElement } from "./useGsapTweenCache";
import {
  existingTweenTargetSelector,
  computeElementPercentage,
  keyframeEases,
  KEYFRAME_PCT_MATCH,
  isInstantHold,
  playsNear,
  writeTargetSelector,
} from "./gsapShared";
import {
  absoluteToPercentage,
  absoluteToPercentageForAnimation,
  resolveTweenStart,
  resolveTweenDuration,
  isTimeWithinTween,
} from "../utils/globalTimeCompiler";
import { POSITION_PROPS } from "./gsapRuntimeReaders";
import { findParsedTween, withLiveTiming } from "./gsapParsedTween";
import { roundTo3 } from "../utils/rounding";
import { readTranslatePxLeavingPercent } from "../components/editor/plainTranslate";
import type { CommitMutationOptions } from "./gsapScriptCommitTypes";
import {
  buildExtendedKeyframes,
  buildTemporalArcKeyframes,
  linearArcKeyframes,
} from "./gsapDragPositionCommit";

let enableKeyframesTransactionCounter = 0;

export interface EnableKeyframesSession {
  domEditSelection: DomEditSelection | null;
  selectedGsapAnimations: GsapAnimation[];
  previewIframeRef?: React.RefObject<HTMLIFrameElement | null>;
  handleGsapAddAnimation: (method: "to" | "from" | "set" | "fromTo") => void;
  handleGsapConvertToKeyframes: (
    animId: string,
    resolvedFromValues?: Record<string, number | string>,
    duration?: number,
    commitOverrides?: Partial<CommitMutationOptions>,
  ) => void | Promise<void>;
  handleGsapRemoveKeyframe: (animId: string, pct: number) => void;
  handleGsapAddKeyframeBatch?: (
    animId: string,
    pct: number,
    properties: Record<string, number | string>,
    commitOverrides?: Partial<CommitMutationOptions>,
  ) => Promise<void>;
  commitMutation?: (
    mutation: Record<string, unknown>,
    options: CommitMutationOptions,
  ) => Promise<void>;
}

/**
 * Which animated properties to capture from the live element. Array-form keyframe
 * tweens (`keyframes: [{x,y},…]`) leave `anim.properties` empty — the props live in
 * the keyframe stops — so fall back to the union of the stops' keys, then to x/y.
 */
export function animatedProps(anim: GsapAnimation | null): string[] {
  if (!anim) return ["x", "y"];
  const own = Object.keys(anim.properties ?? {});
  if (own.length > 0) return own;
  const stops = anim.keyframes?.keyframes;
  if (stops?.length) {
    const keys = new Set<string>();
    for (const stop of stops) for (const k of Object.keys(stop.properties ?? {})) keys.add(k);
    if (keys.size > 0) return [...keys];
  }
  return ["x", "y"];
}

/**
 * Whether the playhead sits inside an animation's tween range. When the tween's
 * start can't be resolved we don't block (the percentage falls back to clip range,
 * preserving prior behavior for elements without explicit timing).
 */
export function isPlayheadWithinTween(anim: GsapAnimation, currentTime: number): boolean {
  const start = resolveTweenStart(anim);
  if (start === null) return true;
  return isTimeWithinTween(currentTime, start, resolveTweenDuration(anim));
}

async function replaceSetWithSingleKeyframe(
  session: EnableKeyframesSession,
  sel: DomEditSelection,
  setAnim: GsapAnimation,
  t: number,
  iframe: HTMLIFrameElement | null,
  selector: string,
): Promise<void> {
  const position = readElementPosition(iframe, sel, setAnim);
  if (Object.keys(position).length === 0) {
    for (const [key, held] of Object.entries(setAnim.properties ?? {})) {
      if (typeof held === "number") position[key] = held;
    }
  }
  if (Object.keys(position).length === 0 || !session.commitMutation) return;
  const range = resolveNewTweenRange(sel.dataAttributes?.start, sel.dataAttributes?.duration, t);
  await session.commitMutation(
    {
      type: "replace-with-keyframes",
      animationId: setAnim.id,
      targetSelector: selector,
      position: roundTo3(range.start),
      duration: roundTo3(range.duration),
      keyframes: [{ percentage: 0, properties: position }],
      ease: setAnim.ease,
    },
    { label: "Enable keyframes", keyframeAction: "add", softReload: true },
  );
}

// fallow-ignore-next-line complexity
function readElementPosition(
  iframe: HTMLIFrameElement | null,
  sel: DomEditSelection,
  anim: GsapAnimation | null,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!iframe?.contentWindow) return result;

  let gsap: { getProperty?: (el: Element, prop: string) => number } | undefined;
  try {
    gsap = (iframe.contentWindow as Window & { gsap?: typeof gsap }).gsap;
  } catch {
    return result;
  }

  const element = sel.element;
  if (!element?.isConnected || !gsap?.getProperty) return result;

  // ponytail: a brand-new tween captures position only — bundling opacity made it
  // a mixed group that the position-only drag intercept couldn't resolve.
  const props = animatedProps(anim);
  for (const prop of props) {
    const val = Number(gsap.getProperty(element, prop));
    if (!Number.isFinite(val)) continue;
    result[prop] = POSITION_PROPS.has(prop) ? Math.round(val) : roundTo3(val);
  }

  return result;
}

/**
 * Range for a brand-new keyframe tween created via "Enable keyframes" on an element
 * with no existing animation. "Add a keyframe" must land at the PLAYHEAD.
 *
 * The runtime auto-stamps `data-start="0"` + `data-duration=<rootDuration>` on every
 * timeline element, so we can't treat `data-start` as authored timing (doing so put
 * the keyframe at 0). Instead, clamp the playhead into the element's [start, end]
 * range: the auto-stamp's full-composition range passes the playhead through
 * unchanged, while a genuinely narrow authored clip still clamps sensibly.
 */
export function resolveNewTweenRange(
  authoredStart: string | undefined,
  authoredDuration: string | undefined,
  currentTime: number,
): { start: number; duration: number } {
  const t = Math.max(0, roundTo3(currentTime));
  const start = authoredStart != null ? Number.parseFloat(authoredStart) : Number.NaN;
  const duration = authoredDuration != null ? Number.parseFloat(authoredDuration) : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(duration) || duration <= 0) {
    return { start: t, duration: 1 };
  }
  const end = start + duration;
  const clampedStart = Math.min(Math.max(t, start), end);
  return { start: clampedStart, duration: Math.max(0.5, roundTo3(end - clampedStart)) };
}

export function singleKeyTweenMutation(
  sel: DomEditSelection,
  properties: Record<string, number>,
  currentTime: number,
): Record<string, unknown> | null {
  // A brand-new tween: author it against the one element the user selected.
  // The bare class selectorFromSelection hands back for an id-less element
  // animates every sibling sharing the class (see writeTargetSelector).
  const targetSelector = writeTargetSelector(sel);
  if (!targetSelector) return null;
  const { start, duration } = resolveNewTweenRange(
    sel.dataAttributes?.start,
    sel.dataAttributes?.duration,
    currentTime,
  );
  // One keyframe at the playhead, a single diamond capturing the current value;
  // motion comes from the keyframes the user adds or drags later.
  return {
    type: "add-with-keyframes",
    targetSelector,
    position: roundTo3(start),
    duration: roundTo3(duration),
    keyframes: [{ percentage: 0, properties }],
  };
}

// Authoritative parse of the current source for `sel`. Returns `null` when the
// fetch can't run (no projectId / request failed) so callers can distinguish
// "unavailable" from a genuine empty result (e.g. after a delete-all). An empty
// array means the source was read and the element has no animations.
async function tryFetchAnimationsForElement(
  sel: DomEditSelection,
): Promise<GsapAnimation[] | null> {
  const projectId = window.location.hash.match(/project\/([^?/]+)/)?.[1];
  if (!projectId) return null;
  const sourceFile = sel.sourceFile || "index.html";
  const parsed = await fetchParsedAnimations(projectId, sourceFile);
  if (!parsed) return null;
  return getAnimationsForElement(parsed.animations, {
    id: sel.id,
    selector: sel.selector,
  });
}

async function fetchAnimationsForElement(sel: DomEditSelection): Promise<GsapAnimation[]> {
  return (await tryFetchAnimationsForElement(sel)) ?? [];
}

async function extendKeyframedTweenToPlayhead(
  session: EnableKeyframesSession,
  sel: DomEditSelection,
  anim: GsapAnimation,
  currentTime: number,
  duration: number,
  iframe: HTMLIFrameElement | null,
  commitOverrides?: Partial<CommitMutationOptions>,
): Promise<void> {
  // Re-authoring an EXISTING tween: keep the target it already writes rather
  // than re-deriving one from the selection, which would widen a tween already
  // narrowed to one element back onto its class siblings (existingTweenTargetSelector).
  const selector = existingTweenTargetSelector(anim, sel);
  const position = readElementPosition(iframe, sel, anim);
  if (!selector || Object.keys(position).length === 0 || !session.commitMutation) return;
  const extended = buildExtendedKeyframes(anim, currentTime, position, duration);
  await session.commitMutation(
    {
      type: "replace-with-keyframes",
      animationId: anim.id,
      targetSelector: selector,
      position: extended.position,
      duration: extended.duration,
      keyframes: extended.keyframes,
      ...keyframeEases(anim),
    },
    {
      label: "Add keyframe",
      keyframeAction: "add",
      softReload: true,
      ...commitOverrides,
    },
  );
}

/**
 * Apply "add keyframe at playhead" to a tween that already has x/y keyframes:
 * toggle off an existing stop, add one at the playhead's tween-relative %, or —
 * when the playhead sits outside the tween — extend the range to reach it (see
 * buildExtendedKeyframes). Shared by native keyframe tweens and flat tweens that
 * were just converted, so both behave identically.
 */
export async function applyKeyframeAtPlayhead(
  session: EnableKeyframesSession,
  sel: DomEditSelection,
  kfAnim: GsapAnimation,
  t: number,
  iframe: HTMLIFrameElement | null,
  commitOverrides?: Partial<CommitMutationOptions>,
  liveTween?: ReturnType<typeof findParsedTween>,
): Promise<void> {
  const keepAuthoredDuration = kfAnim.durationUnresolved === true;
  if (keepAuthoredDuration) {
    kfAnim = withLiveTiming(kfAnim, liveTween ?? findParsedTween(iframe, sel.element, kfAnim));
  }
  if (keepAuthoredDuration && kfAnim.duration == null) return;
  const duration = resolveTweenDuration(kfAnim);
  const start = resolveTweenStart(kfAnim);
  if (start !== null && !isTimeWithinTween(t, start, duration)) {
    if (keepAuthoredDuration) return;
    await extendKeyframedTweenToPlayhead(
      session,
      sel,
      kfAnim,
      t,
      duration,
      iframe,
      commitOverrides,
    );
    return;
  }
  const pct =
    start === null
      ? computeElementPercentage(t, sel)
      : (absoluteToPercentageForAnimation(t, kfAnim) ?? 0);
  const existing = kfAnim.keyframes?.keyframes.find((k) => playsNear(kfAnim, k.percentage, pct));
  if (existing) {
    session.handleGsapRemoveKeyframe(kfAnim.id, existing.percentage);
    return;
  }
  if (session.handleGsapAddKeyframeBatch) {
    const position = readElementPosition(iframe, sel, kfAnim);
    if (Object.keys(position).length > 0) {
      await session.handleGsapAddKeyframeBatch(kfAnim.id, pct, position, commitOverrides);
    }
  }
}

/**
 * A set() is an instantaneous hold. "Add keyframe at playhead" promotes it to a
 * two-stop tween from the set's time to the playhead — the held value at 0%, the
 * live value at 100% — giving the user something to animate. No-op if the playhead
 * is at or before the set.
 *
 * The 0% endpoint is the held start, which the user didn't choose — mark it `auto`
 * so it tracks the nearest keyframe until edited directly. The 100% is the real
 * keyframe being placed at the playhead, so it stays fixed.
 */
export async function promoteSetToKeyframes(
  session: EnableKeyframesSession,
  sel: DomEditSelection,
  setAnim: GsapAnimation,
  t: number,
  iframe: HTMLIFrameElement | null,
): Promise<void> {
  // Re-authoring an EXISTING tween: keep the target it already writes rather
  // than re-deriving one from the selection, which would widen a tween already
  // narrowed to one element back onto its class siblings (existingTweenTargetSelector).
  const selector = existingTweenTargetSelector(setAnim, sel);
  const setStart = resolveTweenStart(setAnim) ?? 0;
  if (!selector || !session.commitMutation) return;
  // Playhead at or before the set → there's no forward range to promote into.
  // Instead of doing nothing (which read as "can't add a keyframe at 0"), replace
  // the set with a single keyframe at the playhead holding its value, matching the
  // no-animation branch: one diamond the user can build motion from.
  if (t <= setStart) {
    await replaceSetWithSingleKeyframe(session, sel, setAnim, t, iframe, selector);
    return;
  }
  const endPosition = readElementPosition(iframe, sel, setAnim);
  if (Object.keys(endPosition).length === 0) return;
  const startPosition: Record<string, number> = {};
  for (const key of Object.keys(endPosition)) {
    const held = setAnim.properties?.[key];
    if (typeof held === "number") startPosition[key] = held;
  }
  await session.commitMutation(
    {
      type: "replace-with-keyframes",
      animationId: setAnim.id,
      targetSelector: selector,
      position: roundTo3(setStart),
      duration: roundTo3(t - setStart),
      keyframes: [
        {
          percentage: 0,
          properties: Object.keys(startPosition).length > 0 ? startPosition : endPosition,
          auto: true,
        },
        { percentage: 100, properties: endPosition },
      ],
      ease: setAnim.ease,
    },
    { label: "Add keyframe", keyframeAction: "add", softReload: true },
  );
}

/**
 * Convert an arc (motionPath) tween to temporal x/y keyframes before toggling the
 * playhead stop. A toolbar command named "Add keyframe at playhead" must preserve
 * every authored stop's time; inserting a spatial waypoint instead redistributes
 * the path and can silently compress the animation.
 */
// fallow-ignore-next-line complexity
export async function applyArcKeyframeAtPlayhead(
  session: EnableKeyframesSession,
  sel: DomEditSelection,
  arcAnim: GsapAnimation,
  t: number,
  iframe: HTMLIFrameElement | null,
): Promise<void> {
  if (!session.commitMutation) return;
  // Re-authoring an EXISTING tween: keep the target it already writes rather
  // than re-deriving one from the selection, which would widen a tween already
  // narrowed to one element back onto its class siblings (existingTweenTargetSelector).
  const targetSelector = existingTweenTargetSelector(arcAnim, sel);
  if (!targetSelector) return;
  const start = resolveTweenStart(arcAnim) ?? 0;
  const duration = resolveTweenDuration(arcAnim);
  if (!isTimeWithinTween(t, start, duration)) {
    const held = readElementPosition(iframe, sel, arcAnim);
    if (t <= start || typeof held.x !== "number" || typeof held.y !== "number") return;
    const extended = buildExtendedKeyframes(arcAnim, t, { x: held.x, y: held.y }, duration, "none");
    await session.commitMutation(
      {
        type: "replace-with-keyframes",
        animationId: arcAnim.id,
        targetSelector,
        position: extended.position,
        duration: extended.duration,
        keyframes: extended.keyframes,
        ease: "none",
      },
      { label: "Add keyframe", keyframeAction: "add", softReload: true },
    );
    return;
  }
  // The arc is rewritten linear: compare and write at the times GSAP plays each node.
  const nodes = linearArcKeyframes(arcAnim);
  const playheadPercentage = absoluteToPercentage(t, start, duration);
  const timedNodeIndex = nodes.findIndex(
    (node) => Math.abs(node.percentage - playheadPercentage) <= KEYFRAME_PCT_MATCH,
  );
  if (timedNodeIndex !== -1) {
    if (timedNodeIndex > 0 && timedNodeIndex < nodes.length - 1) {
      await session.commitMutation(
        {
          type: "replace-with-keyframes",
          animationId: arcAnim.id,
          targetSelector,
          position: roundTo3(start),
          duration: roundTo3(duration),
          keyframes: nodes.filter((_, index) => index !== timedNodeIndex),
          ease: "none",
        },
        { label: "Remove keyframe", softReload: true },
      );
    }
    return;
  }

  const live = readElementPosition(iframe, sel, arcAnim);
  if (typeof live.x !== "number" || typeof live.y !== "number") return;
  await session.commitMutation(
    {
      type: "replace-with-keyframes",
      animationId: arcAnim.id,
      targetSelector,
      position: roundTo3(start),
      duration: roundTo3(duration),
      keyframes: buildTemporalArcKeyframes(arcAnim, playheadPercentage, {
        x: live.x,
        y: live.y,
      }),
      ease: "none",
    },
    { label: "Add keyframe", keyframeAction: "add", softReload: true },
  );
}

export function useEnableKeyframes(
  sessionRef: React.RefObject<EnableKeyframesSession | undefined>,
) {
  // fallow-ignore-next-line complexity
  return useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const sel = session.domEditSelection;
    if (!sel) return;

    const t = usePlayerStore.getState().currentTime;
    const iframe = session.previewIframeRef?.current ?? null;

    // `selectedGsapAnimations` is a studio-side selection cache that can lag a
    // mutation — e.g. right after a delete-all it may still hold the just-removed
    // tween, which would route us into the wrong branch below (editing a tween
    // that no longer exists in source). Prefer the authoritative parse of the
    // current source; an empty parse is a valid "no animations" result and is
    // honored. Fall back to the cache only when the fetch couldn't run at all
    // (no projectId / request failed), preserving prior behavior offline.
    const fetched = await tryFetchAnimationsForElement(sel);
    const anims = fetched ?? session.selectedGsapAnimations;

    // An arc/motionPath tween carries reconstructed x/y keyframes too, so match it
    // first and edit it as waypoints — treating it as plain keyframes would break
    // the curve.
    const arcAnim = anims.find((a) => a.arcPath);
    const kfAnim = anims.find((a) => a.keyframes && !a.arcPath);
    const setAnim = anims.find((a) => isInstantHold(a) && !a.keyframes && !a.arcPath);
    const flatAnim = anims.find((a) => !a.keyframes && !a.arcPath && !isInstantHold(a));

    if (arcAnim) {
      await applyArcKeyframeAtPlayhead(session, sel, arcAnim, t, iframe);
    } else if (kfAnim) {
      await applyKeyframeAtPlayhead(session, sel, kfAnim, t, iframe);
    } else if (setAnim) {
      await promoteSetToKeyframes(session, sel, setAnim, t, iframe);
    } else if (flatAnim) {
      // Convert the flat tween (to/from/fromTo) to its natural keyframes — no
      // resolvedFromValues, so the 0%/100% stops keep the real start→end motion
      // (passing the playhead value would flatten it). Then apply uniformly so an
      // out-of-range playhead extends the range just like a keyframe tween.
      const flatLive = flatAnim.durationUnresolved
        ? findParsedTween(iframe, sel.element, flatAnim)
        : undefined;
      enableKeyframesTransactionCounter += 1;
      const coalesceKey = `enable-keyframes:${flatAnim.id}:${enableKeyframesTransactionCounter}`;
      const convertCommitOverrides: Partial<CommitMutationOptions> = {
        keyframeTelemetry: false,
        skipReload: true,
        coalesceKey,
        coalesceMs: Number.POSITIVE_INFINITY,
      };
      await session.handleGsapConvertToKeyframes(
        flatAnim.id,
        undefined,
        undefined,
        convertCommitOverrides,
      );
      const converted = (await fetchAnimationsForElement(sel)).find((a) => a.keyframes);
      if (converted) {
        const applyCommitOverrides: Partial<CommitMutationOptions> = {
          softReload: true,
          coalesceKey,
          // Must match the convert phase's window: editHistory keys coalescing
          // off the incoming entry, so without Infinity here the apply (landing
          // after two POSTs + a fetch) falls back to the 300ms default and the
          // conversion splits into two undo entries under real latency.
          coalesceMs: Number.POSITIVE_INFINITY,
        };
        await applyKeyframeAtPlayhead(
          session,
          sel,
          converted,
          t,
          iframe,
          applyCommitOverrides,
          flatLive,
        );
      }
    } else {
      const position = readElementPosition(iframe, sel, null);
      if (Object.keys(position).length === 0)
        Object.assign(position, readTranslatePxLeavingPercent(sel.element));
      const mutation = singleKeyTweenMutation(sel, position, t);
      if (mutation && session.commitMutation) {
        await session.commitMutation(mutation, { label: "Enable keyframes", softReload: true });
      } else {
        session.handleGsapAddAnimation("to");
      }
    }
  }, [sessionRef]);
}
