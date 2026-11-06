/**
 * Shared GSAP primitives used across multiple hook files.
 * Centralises duplicated interfaces, constants, and small utilities
 * to reduce drift risk.
 */
import { isHtmlElement } from "@hyperframes/core/runtime/dom-realm";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { getObjectArrayKeyframeTiming } from "@hyperframes/parsers/gsap-parser";
import { progressAtTime, runEaseOf, timeAtProgress } from "../utils/gsapKeyframeEases";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import {
  absoluteToPercentage,
  resolveTweenStart,
  resolveTweenDuration,
} from "../utils/globalTimeCompiler";
import { toCompositionTime } from "../player/store/timelineElement";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Canonical interface for the iframe-hosted GSAP runtime. */
export interface IframeGsap {
  getProperty: (el: Element, prop: string) => number;
  set?: (target: string, vars: Record<string, number | string>) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export { KEYFRAME_PROPERTY_DEFAULTS as PROPERTY_DEFAULTS } from "@hyperframes/core/keyframe-defaults";

/** A tween's eases for re-writing it as keyframes: a flat tween's ease must become easeEach,
 *  since GSAP eases each percentage segment power1.inOut whatever the tween-level ease says. */
export function keyframeEases(anim: GsapAnimation): { ease?: string; easeEach?: string } {
  if (!anim.keyframes) return { easeEach: anim.ease };
  return { ease: runEaseOf(anim), easeEach: anim.keyframes.easeEach };
}

/**
 * A timeline write that applies an instantaneous value and then holds it.
 * `set()` is always a hold; authored `to()` / `fromTo()` tweens are holds only
 * when their resolved duration is exactly zero.
 */
export function isInstantHold(animation: GsapAnimation): boolean {
  return (
    animation.method === "set" ||
    ((animation.method === "to" || animation.method === "fromTo") &&
      resolveTweenDuration(animation) === 0)
  );
}

// ── Selector resolution ───────────────────────────────────────────────────────

/**
 * Get a CSS selector string from a DomEditSelection.
 * Returns `#id` if the selection has an id, otherwise the raw selector,
 * or null if neither exists.
 */
/**
 * A CSS-valid selector for an element id. `#id` for a valid CSS identifier,
 * otherwise an `[id="..."]` attribute selector. IDs that start with a digit
 * (e.g. "01-hook-hero-word") make `#id` an invalid selector, so
 * `document.querySelector("#01-...")` / GSAP's `querySelectorAll` throw a
 * SyntaxError — which surfaces as a masked cross-origin "Script error." and
 * crashes the preview the moment such a target is committed (e.g. dragging).
 */
// Conservative: matches only ids that are unquestionably safe as a `#id`
// selector — ASCII identifier, starts with a letter/underscore (or a single
// leading hyphen), no dots/colons/spaces/digits-first. Anything it rejects
// (digit-leading like "01-hook-...", dots, spaces, non-ASCII, …) falls through
// to the attribute selector below, which is always valid. It can only ever err
// toward the safe form, never toward a `#id` that throws — and, unlike
// `CSS.escape`, it needs no browser global (this runs in node tests too).
const SAFE_HASH_ID = /^-?[A-Za-z_][\w-]*$/;

/**
 * How close (in tween-%) a playhead has to be to count as sitting ON an existing
 * keyframe. Every "is there already a keyframe here?" test shares this: with two
 * different tolerances in play, one path decided "no keyframe here, append one"
 * while another decided "yes, edit that one", and a drag near a waypoint left two
 * keyframes a fraction of a percent apart.
 */
export const KEYFRAME_PCT_MATCH = 1;

/** Whether the keyframe at `percentage` plays within KEYFRAME_PCT_MATCH of the time where GSAP shows `progress`. */
export function playsNear(anim: GsapAnimation, percentage: number, progress: number): boolean {
  const runEase = runEaseOf(anim);
  const gap = timeAtProgress(runEase, percentage) - timeAtProgress(runEase, progress);
  return Math.abs(gap) <= KEYFRAME_PCT_MATCH;
}

export function idSelector(id: string): string {
  // A `#id` selector is only valid for a CSS identifier. IDs that start with a
  // digit (e.g. "01-hook-hero-word") make `document.querySelector("#01-...")` and
  // GSAP's `querySelectorAll` throw a SyntaxError — surfacing as a masked
  // cross-origin "Script error." that crashes the preview the moment such a
  // target is committed (e.g. dragging the element). Address those via an
  // attribute selector instead (quotes/backslashes escaped for the string).
  return SAFE_HASH_ID.test(id) ? `#${id}` : `[id="${id.replace(/(["\\])/g, "\\$1")}"]`;
}

/**
 * Inverse of {@link idSelector}: the element id a target selector addresses, or
 * null for a selector that is not id-based (a class, a tag, a descendant path).
 *
 * Both shapes have to be read back, not just `#id`. Every writer emits through
 * `idSelector`, so a digit-leading, dotted or otherwise CSS-unsafe id lands in
 * the source as `[id="01-hook-hero"]`. A reader that only matched `#id` saw no
 * id at all for those elements and skipped them — which is how the post-commit
 * keyframe-cache refresh silently stopped running for exactly the ids
 * `idSelector` was added to support.
 */
export function idFromSelector(selector: string | undefined | null): string | null {
  if (!selector) return null;
  const hash = selector.match(/^#([\w-]+)/);
  if (hash) return hash[1] ?? null;
  const attribute = selector.match(/^\[id="((?:\\.|[^"\\])*)"\]/);
  if (!attribute) return null;
  // Undo the quote/backslash escaping idSelector applies.
  return (attribute[1] ?? "").replace(/\\(["\\])/g, "$1");
}

/** Either shape {@link idSelector} emits, anchored to the WHOLE selector. */
const WHOLE_SELECTOR_ID = /^(#[\w-]+|\[id="(?:\\.|[^"\\])*"\])$/;

/**
 * The id a selector addresses **as a whole**, or null. `"#stat3 .block"` animates
 * the `.block` INSIDE `#stat3`, not `#stat3`, so the unanchored leading-id match
 * of {@link idFromSelector} is wrong for attribution: it files the child's
 * keyframes under its ancestor. `idFromSelector` stays unanchored on purpose
 * (two non-attribution callers want the leading id); attribution goes through
 * here, or through the DOM (see resolveSelectorElementIds).
 */
function wholeSelectorElementId(selector: string): string | null {
  const trimmed = selector.trim();
  return WHOLE_SELECTOR_ID.test(trimmed) ? idFromSelector(trimmed) : null;
}

/**
 * Resolve a tween's target selector to the ids of the element(s) it animates.
 * A whole-selector `#id` resolves directly; anything else (a class like `.dot`,
 * a group `.a, .b`, or a descendant selector) is matched against the live
 * preview DOM so class/selector tweens (e.g. `gsap.from(".dot", {stagger})`)
 * attribute to every element they animate — not just one parsed from the string.
 * With no DOM, only whole-selector ids resolve: a descendant selector has no
 * answer that isn't a guess at its ancestor.
 */
export function resolveSelectorElementIds(
  selector: string,
  doc: Document | null | undefined,
): string[] {
  const bareId = wholeSelectorElementId(selector);
  if (bareId) return [bareId];
  const ids = new Set<string>();
  for (const part of selector.split(",")) {
    const sel = part.trim();
    if (!sel) continue;
    if (!doc) {
      const whole = wholeSelectorElementId(sel);
      if (whole) ids.add(whole);
      continue;
    }
    try {
      for (const el of Array.from(doc.querySelectorAll(sel))) {
        if (el.id) ids.add(el.id);
      }
    } catch {
      // An unsupported/invalid selector never reached the DOM, so the leading id
      // is the best available answer (`[id="01-hook"]:has(>*)` still names it).
      const lead = idFromSelector(sel);
      if (lead) ids.add(lead);
    }
  }
  return Array.from(ids);
}

/**
 * The clip start in the frame the element's OWN tweens are measured in. A nested
 * row sits on the master timeline at a master `start`, but its tweens are local
 * to its composition, so the two must be brought into one frame before any clip-%
 * math — or every keyframe rebases to a percentage far outside the clip.
 */
export function clipTimingStart(element: {
  start: number;
  parentCompositionStart?: number;
}): number {
  return toCompositionTime(element, element.start);
}

export function selectorFromSelection(selection: DomEditSelection): string | null {
  if (selection.id) return idSelector(selection.id);
  if (selection.selector) return selection.selector;
  return null;
}

/** `[name="value"]`, with the quote/backslash escaping a CSS string needs. */
function attributeSelector(name: string, value: string): string {
  return `[${name}="${value.replace(/(["\\])/g, "\\$1")}"]`;
}

/**
 * Whether `selector` addresses `element` AND NOTHING ELSE. The single test for
 * "this string is safe to author a new tween against": a selector that also
 * hits siblings writes a tween that animates all of them.
 */
export function matchesExactlyOne(doc: Document, selector: string, element: Element): boolean {
  try {
    const matches = doc.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

/**
 * A structural address for an element that carries no identity of its own:
 * `:nth-child` steps up to the nearest ancestor that IS uniquely addressable
 * (an id or a data-hf-id). This is the `selector` + `selectorIndex` pair the
 * selection already carries, resolved through the live DOM the index was
 * counted in — an index can't be spelled in CSS, but the element's position can.
 */
function structuralSelector(element: Element): string | null {
  const doc = element.ownerDocument;
  if (!doc) return null;
  const parts: string[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node !== element) {
      const id = isHtmlElement(node) ? node.id : "";
      const hfId = node.getAttribute("data-hf-id");
      if (id) {
        parts.unshift(idSelector(id));
        break;
      }
      if (hfId) {
        parts.unshift(attributeSelector("data-hf-id", hfId));
        break;
      }
    }
    const parent = node.parentElement;
    if (!parent) break;
    const index = [...parent.children].indexOf(node) + 1;
    if (index < 1) return null;
    parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${index})`);
  }
  if (parts.length === 0) return null;
  const selector = parts.join(" > ");
  return matchesExactlyOne(doc, selector, element) ? selector : null;
}

/**
 * The selector to author a NEW tween with. Distinct from
 * {@link selectorFromSelection}, which must keep returning the exact string an
 * already-authored tween is string-matched against (findTweenAtTime): this one
 * has to ADDRESS ONE ELEMENT.
 *
 * `buildStableSelector` hands back a bare class for any element without an id,
 * so "add keyframe at playhead" on one of five `.group` siblings wrote
 * `tl.set(".group", …)` — a tween that animates all five and that
 * {@link resolveSelectorElementIds} reads back as all five, collapsing their
 * timeline rows into one. Every rung below resolves to exactly one element.
 *
 * Null means "no string here addresses one element". With a live DOM to check
 * against, a failed structural walk (detached between select and commit, a
 * shadow-root boundary, a chain that no longer re-resolves) IS that evidence,
 * so returning the bare selector anyway would hand back the exact input this
 * function exists to replace. Every caller treats the null as "do not author
 * this tween": falling back to the selection's own selector would write the
 * group-collapsing target this function exists to prevent, and a gesture that
 * does not persist reverts visibly on the next reload, where a tween silently
 * aimed at five elements does not. The bare selector comes back only with no DOM
 * to disambiguate against, where refusing would be guessing rather than knowing.
 */
export function writeTargetSelector(selection: DomEditSelection): string | null {
  if (selection.id) return idSelector(selection.id);
  if (selection.hfId) return attributeSelector("data-hf-id", selection.hfId);
  const element = selection.element;
  const doc = element?.ownerDocument;
  if (element && doc) {
    if (selection.selector && matchesExactlyOne(doc, selection.selector, element)) {
      return selection.selector;
    }
    return structuralSelector(element);
  }
  return selection.selector ?? null;
}

/**
 * The selector a `replace-with-keyframes` mutation must re-author an EXISTING
 * tween against. The server deletes the tween and adds it back, so this string
 * REWRITES its target: deriving it from the selection instead discards whatever
 * the author aimed at, and silently widens a tween {@link writeTargetSelector}
 * had already narrowed to one element back onto every class sibling.
 *
 * The selection is the fallback only for a target the parser could not resolve
 * statically, where there is no authored string to preserve.
 */
export function existingTweenTargetSelector(
  animation: Pick<GsapAnimation, "targetSelector" | "hasUnresolvedSelector">,
  selection: DomEditSelection,
): string | null {
  if (animation.targetSelector && !animation.hasUnresolvedSelector) {
    return animation.targetSelector;
  }
  return selectorFromSelection(selection);
}

/**
 * The read half of {@link writeTargetSelector}: does an already-authored tween
 * write THIS element?
 *
 * String equality against `selectorFromSelection` alone is not enough once new
 * tweens are authored with a narrowed one-element selector: the next edit would
 * miss the write it just made and append a second, conflicting one. Falling back
 * to the live DOM keeps the pair consistent.
 *
 * That fallback is `matchesExactlyOne`, not a bare `element.matches`. A target
 * the element merely shares with its siblings is a GROUP tween, and the callers
 * here MUTATE what they find: an individual nudge on one of five `.group`
 * siblings would rewrite the group's own tween and move all five. Only the
 * selection that IS the group (string equality above, where the author selected
 * `.group` itself) may edit it; every other element authors its own write.
 */
export function tweenTargetsElement(
  targetSelector: string,
  selector: string,
  element: Element | null | undefined,
): boolean {
  if (targetSelector === selector) return true;
  const doc = element?.ownerDocument;
  if (!element || !doc) return false;
  return matchesExactlyOne(doc, targetSelector, element);
}

// ── Percentage computation ────────────────────────────────────────────────────

/**
 * Compute the current playback percentage within an element's animation range.
 * Uses the animation's resolved timing if available, otherwise falls back to
 * the element's data-start / data-duration attributes.
 */
export function computeElementPercentage(
  currentTime: number,
  selection: DomEditSelection,
  animation?: GsapAnimation | null,
): number {
  if (animation) {
    const start = resolveTweenStart(animation);
    const duration = resolveTweenDuration(animation);
    if (duration <= 0) return 0;
    if (start !== null) {
      return progressAtTime(
        runEaseOf(animation),
        absoluteToPercentage(currentTime, start, duration),
      );
    }
  }
  const elStart = Number.parseFloat(selection.dataAttributes?.start ?? "0") || 0;
  const elDuration = Number.parseFloat(selection.dataAttributes?.duration ?? "1") || 1;
  return absoluteToPercentage(currentTime, elStart, elDuration);
}

// ── Iframe accessors ──────────────────────────────────────────────────────────

/** Safely retrieve the GSAP runtime from the preview iframe. */
export function getIframeGsap(iframe: HTMLIFrameElement | null): IframeGsap | null {
  if (!iframe?.contentWindow) return null;
  try {
    const gsap = (iframe.contentWindow as unknown as { gsap?: IframeGsap }).gsap;
    return gsap?.getProperty ? gsap : null;
  } catch {
    return null;
  }
}

/** Safely query an element inside the preview iframe's document. */
export function queryIframeElement(
  iframe: HTMLIFrameElement | null,
  selector: string,
): Element | null {
  try {
    return iframe?.contentDocument?.querySelector(selector) ?? null;
  } catch {
    return null;
  }
}

// ── Keyframe parsing ──────────────────────────────────────────────────────────

export interface ParsedPercentageKeyframes {
  keyframes: Array<{
    percentage: number;
    properties: Record<string, number | string>;
    step?: number;
  }>;
  easeEach?: string;
}

function collectAnimatableKeyframeProperties(entry: object): Record<string, number | string> {
  const properties: Record<string, number | string> = {};
  for (const [property, value] of Object.entries(entry)) {
    if (property === "ease") continue;
    if (typeof value === "number") properties[property] = Math.round(value * 1000) / 1000;
    else if (typeof value === "string") properties[property] = value;
  }
  return properties;
}

/**
 * Parse a GSAP percentage-keyframe object (`{ "0%": { x: 10 }, "100%": { x: 200 } }`)
 * into a sorted array of `{ percentage, properties }` entries.
 * Returns `null` when the object contains no valid keyframe entries.
 */
export function parsePercentageKeyframes(
  kfObj: Record<string, unknown>,
): ParsedPercentageKeyframes | null {
  const keyframes: ParsedPercentageKeyframes["keyframes"] = [];
  let easeEach: string | undefined;

  // GSAP array-form keyframes — `keyframes: [{x,y}, {x,y}, ...]` — place each step at
  // its cumulative end, the parser's rule (getObjectArrayKeyframeTiming). Spacing counts
  // EVERY array slot, so dropping an entry with no animatable prop must NOT shift the others.
  // A per-entry `ease` is a segment ease, not a keyframe value, so it's skipped as
  // a property; there is no array-form `easeEach` (that's an object-form sibling key).
  // (The object form further down uses explicit "0%" keys instead.) Without this
  // branch, array-keyframed tweens (e.g. a multi-point shuttle) read as null → no
  // motion path.
  if (Array.isArray(kfObj)) {
    const steps = kfObj as unknown[];
    const timing = getObjectArrayKeyframeTiming(
      steps.map((entry) => (entry as { duration?: unknown } | null)?.duration),
    );
    if (!timing) return null;
    steps.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") return;
      const properties = collectAnimatableKeyframeProperties(entry);
      if (Object.keys(properties).length > 0) {
        keyframes.push({ percentage: timing.percentages[i]!, properties, step: i });
      }
    });
    return keyframes.length > 0 ? { keyframes } : null;
  }

  for (const [key, val] of Object.entries(kfObj)) {
    if (key === "easeEach") {
      if (typeof val === "string") easeEach = val;
      continue;
    }
    const pctMatch = key.match(/^(\d+(?:\.\d+)?)%$/);
    if (!pctMatch || !val || typeof val !== "object") continue;
    const percentage = parseFloat(pctMatch[1]);
    const properties = collectAnimatableKeyframeProperties(val);
    if (Object.keys(properties).length > 0) {
      keyframes.push({ percentage, properties });
    }
  }

  if (keyframes.length === 0) return null;
  keyframes.sort((a, b) => a.percentage - b.percentage);
  return { keyframes, easeEach };
}

// ── Time conversion ───────────────────────────────────────────────────────────

/** Convert a tween-relative percentage to an absolute time. */
export function toAbsoluteTime(tweenPos: number, tweenDur: number, percentage: number): number {
  return tweenPos + (percentage / 100) * tweenDur;
}

/**
 * Timing basis for an element's keyframes, expressed in the TWEEN's own time
 * frame. Sub-composition internals (e.g. pills inside a scene) aren't timeline
 * clips themselves — they're derived at expand time — so they're absent from
 * `elements`. Without a basis, elDuration defaulted to 1 and clip-relative
 * keyframe percentages blew past 100% (rendering off the clip). Fall back to the
 * sub-comp HOST's bounds, resolved via domClipChildren (the host's
 * data-composition-src is stripped in the rendered DOM, so we can't query it).
 *
 * `elStart` is the clip's start in the frame the tween's own times are measured
 * in. A sub-composition tween's resolvedStart is composition-local while a
 * timeline element's start is main-timeline absolute, so passing the raw element
 * start subtracted two different frames from each other: a host mounted at 1.5s
 * cached its 0s tween at -12%, and a clip-relative percentage can never be
 * negative. The composition's mount is the row's `parentCompositionStart` when
 * set, the parent composition clip's start otherwise, and 0 for a
 * root-composition element, whose start already IS the tween frame.
 */
export function resolveClipTimingBasis(
  elementId: string,
  sourceFile: string,
  elements: ReadonlyArray<{
    domId?: string;
    key?: string;
    id: string;
    start: number;
    duration: number;
    parentCompositionStart?: number;
    parentCompositionId?: string | null;
  }>,
  domClipChildren: ReadonlyArray<{ id: string; hostId: string }>,
): { elStart: number; elDuration: number } {
  const direct = elements.find(
    (el) => el.domId === elementId || (el.key ?? el.id) === `${sourceFile}#${elementId}`,
  );
  if (direct) {
    const parentId = direct.parentCompositionId;
    const parent = parentId
      ? elements.find((el) => el.domId === parentId || el.id === parentId)
      : undefined;
    if (direct.parentCompositionStart !== undefined)
      return { elStart: clipTimingStart(direct), elDuration: direct.duration };
    if (parent) return { elStart: direct.start - parent.start, elDuration: direct.duration };
    // No parent composition named, so this IS a main-timeline clip and its own
    // start is already the basis.
    if (!parentId) return { elStart: direct.start, elDuration: direct.duration };
    // It named a parent we cannot find, so the mount is unknowable. Its tweens
    // are still composition-local, so treat its own window as the frame rather
    // than subtracting nothing and handing back a main-timeline start, which is
    // exactly the mixed-frame subtraction this function exists to prevent.
    return { elStart: 0, elDuration: direct.duration };
  }
  const hostId = domClipChildren.find((c) => c.id === elementId)?.hostId;
  const host = hostId
    ? elements.find((el) => el.domId === hostId || (el.key ?? el.id) === `index.html#${hostId}`)
    : undefined;
  // The inner element is not a clip of its own: the host's window IS the frame
  // its tweens are timed in, so the start in that frame is 0, not the host's
  // main-timeline mount.
  return { elStart: 0, elDuration: host?.duration ?? 1 };
}

/**
 * An absolute time as a percentage of a timeline clip, at the one precision every
 * keyframe-cache writer must share. 0.001% keeps a beat-snapped keyframe centered
 * on the beat dot, and because selection keys embed this number, a writer that
 * rounds coarser would orphan a live selection the moment it rewrites the cache.
 * A zero-length clip has no percentage to give, so the tween-% passes through.
 */
export function toClipPercentage(
  absoluteTime: number,
  clipStart: number,
  clipDuration: number,
  fallbackPercentage: number,
): number {
  if (clipDuration <= 0) return fallbackPercentage;
  return Math.round(((absoluteTime - clipStart) / clipDuration) * 100000) / 1000;
}

/**
 * One keyframe-cache row per tween keyframe: the percentage re-based onto the
 * clip, the original tween percentage kept alongside it, and the animation
 * identity every lane and selection key needs. Shared by the cache writers so
 * they cannot drift in precision or in which identity fields they record.
 */
export function toClipKeyframes<T extends { percentage: number }>(
  source: readonly T[],
  anim: GsapAnimation,
  clipStart: number,
  clipDuration: number,
): Array<
  T & {
    tweenPercentage: number;
    propertyGroup: GsapAnimation["propertyGroup"];
    animationId: string;
  }
> {
  const tweenStart = anim.resolvedStart ?? (typeof anim.position === "number" ? anim.position : 0);
  const tweenDuration = resolveTweenDuration(anim);
  return source.map((keyframe) => ({
    ...keyframe,
    percentage: toClipPercentage(
      toAbsoluteTime(
        tweenStart,
        tweenDuration,
        timeAtProgress(runEaseOf(anim), keyframe.percentage),
      ),
      clipStart,
      clipDuration,
      keyframe.percentage,
    ),
    tweenPercentage: keyframe.percentage,
    propertyGroup: anim.propertyGroup,
    animationId: anim.id,
  }));
}
