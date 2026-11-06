/**
 * Patch ONE tween's values in the preview iframe's runtime timeline in place, so a
 * value-only manual edit (a `tl.set` position/rotation/scale, or a keyframe
 * value/position change) is reflected INSTANTLY — without re-running the whole
 * composition.
 *
 * Defensive by default: the caller (`runCommit`) falls back to the existing soft
 * reload whenever this returns `false`. It returns `false` (never silently
 * mis-patches) when the tween can't be confidently located or the requested change
 * can't be safely expressed (dynamic/computed values, motionPath arcs, shape
 * mismatch), and never throws.
 *
 * "Which tween" is resolved by the same all-timelines scan `readRuntimeKeyframes`
 * uses (`resolveRuntimeTween`), so read and write agree on the target.
 */
import { applyAuthoredInlineOpacity, readStampedAuthoredOpacity } from "../utils/authoredOpacity";
import {
  resolveRuntimeTween,
  type RuntimeTween,
  type RuntimeTimeline,
} from "./gsapRuntimeKeyframes";
import { recordLiveSet } from "../utils/softReloadTargets";

/** Value-only channels a `tl.set(...)` patch may touch. */
export interface SetPatchProps {
  x?: number;
  y?: number;
  rotation?: number;
  rotationX?: number;
  rotationY?: number;
  rotationZ?: number;
  z?: number;
  transformPerspective?: number;
  scaleX?: number;
  scaleY?: number;
  scale?: number;
  opacity?: number;
  width?: number;
  height?: number;
}

/** A single keyframe step's numeric channels (the GSAP array-keyframe form). */
export type KeyframeStep = Record<string, number>;

export type RuntimeTweenChange =
  | { kind: "set"; props: SetPatchProps }
  | { kind: "keyframes"; keyframes: KeyframeStep[] }
  // Edit ONE step (at `pct`) of an object-form keyframe tween — the form the studio
  // writes (`keyframes: { "0%": {...} }`). GSAP pre-compiles those into sub-tweens
  // and won't re-read `vars.keyframes` on `invalidate()`, so this REBUILDS the tween
  // (kill + recreate at the same position) instead of mutating it. Lets a design-panel
  // keyframe edit show instantly rather than soft-reloading the iframe (a flash).
  | { kind: "keyframe-rebuild"; pct: number; props: KeyframeStep }
  // Apply a base `gsap.set` value to the element directly (`gsap.set(el, props)`).
  // A base set lives OFF the timeline, so there's no runtime tween to patch — but
  // the element is static on these channels, so setting them immediately reflects
  // the edit with no soft reload (no flash) and leaves no keyframe marker.
  | { kind: "global-set"; props: SetPatchProps };

const SET_CHANNELS: Array<keyof SetPatchProps> = [
  "x",
  "y",
  "rotation",
  "rotationX",
  "rotationY",
  "rotationZ",
  "z",
  "transformPerspective",
  "scaleX",
  "scaleY",
  "scale",
  "opacity",
];

type IframeWindow = Window & {
  __player?: { getTime?: () => number; seek?: (t: number) => void };
  gsap?: { set?: (target: Element, vars: Record<string, number>) => void };
};

/**
 * Apply a base `gsap.set` value to the element in the live runtime. Returns `true`
 * if applied. Used for off-timeline static holds (position / 3D transform) — there's
 * no tween to patch, so we set the channels directly. Safe because the element is
 * static on these channels (the caller only uses this for non-animated values).
 */
/** The props as finite numbers, or null if any value is non-finite / none present. */
function finiteNumericProps(props: SetPatchProps): Record<string, number> | null {
  const numeric: Record<string, number> = {};
  for (const [k, v] of Object.entries(props)) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    numeric[k] = v;
  }
  return Object.keys(numeric).length > 0 ? numeric : null;
}

function applyGlobalSet(
  iframe: HTMLIFrameElement,
  selector: string,
  props: SetPatchProps,
): boolean {
  try {
    const gsapLib = (iframe.contentWindow as IframeWindow | null)?.gsap;
    const el = iframe.contentDocument?.querySelector(selector) ?? null;
    const numeric = finiteNumericProps(props);
    if (!gsapLib?.set || !el || !numeric) return false;
    gsapLib.set(el, numeric);
    recordLiveSet(el, numeric);
    return true;
  } catch {
    return false;
  }
}

function playerOf(iframe: HTMLIFrameElement): IframeWindow["__player"] | null {
  try {
    return (iframe.contentWindow as IframeWindow | null)?.__player ?? null;
  } catch {
    return null;
  }
}

/** Every step value must be a finite number — string/computed values can't round-trip. */
function keyframesAreStatic(keyframes: KeyframeStep[]): boolean {
  if (keyframes.length === 0) return false;
  for (const step of keyframes) {
    if (!step || typeof step !== "object") return false;
    for (const v of Object.values(step)) {
      if (typeof v !== "number" || !Number.isFinite(v)) return false;
    }
  }
  return true;
}

function patchSet(tween: RuntimeTween, props: SetPatchProps): boolean {
  const vars = tween.vars;
  if (!vars) return false;
  // A `set` carrying a motionPath isn't a plain value set — defer.
  if ("motionPath" in vars) return false;
  let touched = false;
  for (const ch of SET_CHANNELS) {
    const next = props[ch];
    if (next === undefined) continue;
    if (typeof next !== "number" || !Number.isFinite(next)) return false;
    // A string value here is a dynamic/computed GSAP expression (e.g. "+=100",
    // "random(...)"). Overwriting it with a plain number would silently drop the
    // dynamic intent — decline so the caller soft-reloads from the (edited) source.
    if (typeof vars[ch] === "string") return false;
    vars[ch] = next;
    touched = true;
  }
  return touched;
}

function patchKeyframes(tween: RuntimeTween, keyframes: KeyframeStep[]): boolean {
  const vars = tween.vars;
  if (!vars) return false;
  // motionPath arc tweens express motion as a path, not channel keyframes — defer.
  if ("motionPath" in vars) return false;
  // Only the array-keyframe form is patched in place; the existing tween must
  // already carry array keyframes (shape match), or this is a structural change.
  if (!Array.isArray(vars.keyframes)) return false;
  if (!keyframesAreStatic(keyframes)) return false;
  vars.keyframes = keyframes.map((step) => ({ ...step }));
  return true;
}

/** The object-form keyframes map with `props` merged into the step at `pct`. */
function mergeKeyframeStep(
  map: Record<string, Record<string, number>>,
  pct: number,
  props: KeyframeStep,
): Record<string, Record<string, number>> {
  const next: Record<string, Record<string, number>> = {};
  for (const [k, step] of Object.entries(map)) next[k] = { ...step };
  // Match the existing percentage key numerically ("50%" ≡ pct 50), else add one.
  let key: string | null = null;
  for (const k of Object.keys(next)) {
    const n = parseFloat(k);
    if (Number.isFinite(n) && Math.abs(n - pct) < 0.05) {
      key = k;
      break;
    }
  }
  if (key === null) key = `${pct}%`;
  next[key] = { ...(next[key] ?? {}), ...props };
  return next;
}

/**
 * Rebuild an object-form keyframe tween with `props` merged into the step at `pct`,
 * in place: kill the old tween and recreate it on the SAME parent timeline at the
 * SAME position, with all other vars (duration, ease, repeat, …) preserved. This
 * is the only way to reflect an object-form keyframe edit live — GSAP compiles
 * those keyframes into sub-tweens at creation and ignores later `vars.keyframes`
 * mutations. Declines (→ caller soft-reloads) for array-form, motionPath arcs,
 * non-finite/dynamic values, or a tween whose parent/targets can't be resolved.
 */
// fallow-ignore-next-line complexity
function rebuildKeyframeTween(tween: RuntimeTween, pct: number, props: KeyframeStep): boolean {
  const vars = tween.vars;
  if (!vars || "motionPath" in vars) return false;
  const kf = vars.keyframes;
  if (!kf || typeof kf !== "object" || Array.isArray(kf)) return false;
  for (const v of Object.values(props)) {
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  const parent = tween.parent;
  const targets = tween.targets?.();
  if (!parent?.to || !targets || targets.length === 0) return false;
  if (typeof tween.startTime !== "function" || typeof tween.kill !== "function") return false;

  const next = mergeKeyframeStep(kf as Record<string, Record<string, number>>, pct, props);
  const newVars = { ...vars, keyframes: next };
  const position = tween.startTime();
  tween.kill();
  parent.to(targets, newVars, position);
  return true;
}

/** The channels a change writes, for the resolver to disambiguate co-located tweens. */
function changeChannels(change: RuntimeTweenChange): string[] | undefined {
  if (change.kind === "set") {
    return Object.keys(change.props).filter(
      (k) => change.props[k as keyof SetPatchProps] !== undefined,
    );
  }
  if (change.kind === "keyframe-rebuild") return Object.keys(change.props);
  return undefined;
}

/** Re-render the timeline at the current playhead after an in-place edit. */
function seekToCurrent(iframe: HTMLIFrameElement, timeline: RuntimeTimeline): void {
  const player = playerOf(iframe);
  const currentTime =
    typeof player?.getTime === "function"
      ? player.getTime()
      : typeof timeline.time === "function"
        ? timeline.time()
        : 0;
  player?.seek?.(Number.isFinite(currentTime) ? currentTime : 0);
}

/** Does this change touch the opacity channel (whose re-init reads inline style)? */
function changeTouchesOpacity(change: RuntimeTweenChange): boolean {
  if (change.kind === "set" || change.kind === "global-set")
    return change.props.opacity !== undefined;
  if (change.kind === "keyframes") return change.keyframes.some((step) => "opacity" in step);
  return "opacity" in change.props;
}

/**
 * A tween re-initialization (invalidate, or kill+recreate for keyframe-rebuild)
 * captures opacity from the element's CURRENT inline style — for a color-graded
 * source (hidden with `opacity: 0 !important`) or a mid-flight tween that's a
 * runtime transient, not the authored value, and the capture makes it permanent.
 * Restore the runtime's parse-time authored capture (data-hf-authored-opacity)
 * first; the re-seek after the patch re-renders the animated value anyway.
 * Duck-typed (no instanceof): the targets live in the preview iframe's realm.
 */
function restoreAuthoredOpacityForCapture(tween: RuntimeTween): void {
  const targets = typeof tween.targets === "function" ? tween.targets() : [];
  for (const target of targets ?? []) {
    const el = target as HTMLElement | null;
    if (!el?.style || typeof el.getAttribute !== "function") continue;
    const authored = readStampedAuthoredOpacity(el);
    if (authored === null) continue;
    applyAuthoredInlineOpacity(el.style, authored);
  }
}

/** Apply `change` to the resolved tween. `true` if applied, `false` to soft-reload.
 *  `global-set` is handled before this (no tween) and never reaches here. */
function applyChange(tween: RuntimeTween, change: RuntimeTweenChange): boolean {
  if (change.kind === "set") return patchSet(tween, change.props);
  if (change.kind === "keyframes") return patchKeyframes(tween, change.keyframes);
  if (change.kind === "keyframe-rebuild")
    return rebuildKeyframeTween(tween, change.pct, change.props);
  return false;
}

/**
 * Edit one tween in `window.__timelines` in place + re-seek to the current playhead.
 * Returns `true` on a confident patch, `false` otherwise (caller soft-reloads).
 *
 * `deferSeek` skips the re-render, for a caller patching several tweens in a row
 * that will render once after the last one.
 */
export function patchRuntimeTweenInPlace(
  iframe: HTMLIFrameElement | null,
  selector: string,
  change: RuntimeTweenChange,
  compositionId?: string,
  deferSeek = false,
): boolean {
  if (!iframe) return false;
  // A base `gsap.set` has no timeline tween to resolve — apply the value straight
  // to the element so the edit shows instantly (no soft reload, no flash).
  if (change.kind === "global-set") return applyGlobalSet(iframe, selector, change.props);
  try {
    const resolved = resolveRuntimeTween(
      iframe,
      selector,
      change.kind === "set" ? "set" : "keyframe",
      compositionId,
      changeChannels(change),
    );
    if (!resolved) return false;
    const { tween, timeline } = resolved;

    if (changeTouchesOpacity(change)) restoreAuthoredOpacityForCapture(tween);
    if (!applyChange(tween, change)) return false;

    // A rebuild already recreated the tween; set/keyframes mutate vars in place, so
    // invalidate to make GSAP re-read them on the next render. Either way, re-seek.
    // Invalidate ONLY the edited tween — never the whole timeline. A timeline-wide
    // invalidate re-initializes every from() tween against the CURRENT inline
    // styles, and the color-grading engine hides its source elements with
    // `opacity: 0 !important` — so every graded element's from(opacity) re-captures
    // 0 as its end value and animates 0→0 forever (all graded elements vanish).
    if (change.kind !== "keyframe-rebuild") {
      tween.invalidate?.();
    }
    // A seek re-renders the WHOLE timeline, not just the tween we patched. Under a
    // multi-element commit that is a visible jump: the members still queued behind
    // this one get repainted from their un-patched tweens, back to where they were
    // before the gesture, and stay there until their own patch lands. Deferring
    // leaves them showing the gesture's own transform, and the caller's last patch
    // seeks once for the whole group.
    if (!deferSeek) seekToCurrent(iframe, timeline);
    return true;
  } catch {
    return false;
  }
}
