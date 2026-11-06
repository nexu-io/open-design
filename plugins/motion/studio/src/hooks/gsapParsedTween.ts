import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { elementTargets } from "../utils/elementGsap";
import { resolveTweenStart } from "../utils/globalTimeCompiler";
import { KEYFRAME_PCT_MATCH } from "./gsapShared";
import type { ImplicitEndValue } from "./gsapValueAtPlayhead";
import type { ReadTween } from "./gsapRuntimeKeyframes";

// GSAP 3 internals: a property tween in a tween's `_pt` chain; CSSPlugin keeps its own under `d._pt`.
interface PropTween {
  p?: string;
  s?: number;
  c?: number;
  d?: { _pt?: PropTween };
  _next?: PropTween;
}
interface ParsedTween {
  _pt?: PropTween;
  _from?: boolean;
  _initted?: boolean;
  vars?: Record<string, unknown>;
  parent?: {
    vars?: { defaults?: { ease?: unknown } };
    time?: () => number;
    seek?: (time: number, suppressEvents?: boolean) => unknown;
    getChildren?: (nested?: boolean, tweens?: boolean, timelines?: boolean) => ParsedTween[];
  };
  timeline?: { getChildren?: () => ParsedTween[]; duration?: () => number };
  targets?: () => unknown[];
  startTime?: () => number;
  duration?: () => number;
}
interface GsapWindow {
  gsap?: {
    defaults?: () => { ease?: unknown };
    getProperty?: (target: Element, prop: string) => unknown;
    set?: (target: Element, vars: Record<string, unknown>) => void;
    parseEase?: (name: string) => unknown;
  };
  __timelines?: Record<string, { getChildren?: (nested: boolean) => ParsedTween[] }>;
}

// `scale` parses into the two longhands, which always share a start and end for a `scale` tween.
const PARSED_NAME: Record<string, string> = { scale: "scaleX", rotate: "rotation" };

function findPropTween(pt: PropTween | undefined, prop: string): PropTween | null {
  for (let node = pt; node; node = node._next) {
    if (node.p === prop && typeof node.s === "number" && typeof node.c === "number") return node;
    const nested = findPropTween(node.d?._pt, prop);
    if (nested) return nested;
  }
  return null;
}

/** `[start, end]` of `prop` in one initialised tween; a from() tween runs its pair backwards. */
function endsIn(tween: ParsedTween, prop: string): [number, number] | null {
  const pt = findPropTween(tween._pt, PARSED_NAME[prop] ?? prop);
  if (!pt) return null;
  const pair: [number, number] = [pt.s!, pt.s! + pt.c!];
  return tween._from ? [pair[1], pair[0]] : pair;
}

/** `read` plus GSAP's start for a step list or a first key past 0%, read per channel. */
export function withParsedStart(read: ReadTween, live: unknown): ReadTween {
  const tween = live as ParsedTween;
  const first = read.keyframes[0];
  if (!Array.isArray(tween.vars?.keyframes) && !((first?.percentage ?? 0) > 0)) return read;
  const children = tween.timeline?.getChildren?.() ?? [tween];
  const start: Record<string, number> = {};
  for (const prop of ["x", "y", "width", "height"]) {
    const ends = children.map((child) => endsIn(child, prop)).find(Boolean);
    if (ends) start[prop] = ends[0];
  }
  const moved = Object.entries(start).some(([prop, value]) => value !== first?.properties[prop]);
  return moved ? { ...read, start } : read;
}

/** The live tween GSAP built from `anim`: same element, start and channels, parsed. */
// fallow-ignore-next-line complexity
export function findParsedTween(
  iframe: HTMLIFrameElement | null,
  element: Element,
  anim: GsapAnimation,
): ParsedTween | null {
  const win = iframe?.contentWindow as GsapWindow | null;
  const start = resolveTweenStart(anim);
  if (!win?.__timelines || start == null) return null;
  const steps = anim.keyframes?.keyframes.map((kf) => kf.properties) ?? [anim.properties];
  const props = [...new Set(steps.flatMap((step) => Object.keys(step)))];
  const keyframed = Boolean(anim.keyframes);
  for (const timeline of Object.values(win.__timelines)) {
    for (const tween of timeline?.getChildren?.(true) ?? []) {
      const targets = (tween.targets?.() ?? []) as Array<{ id?: unknown }>;
      if (!targets.includes(element) && !targets.some((t) => element.id && t.id === element.id))
        continue;
      if (!startsAt(tween, start)) continue;
      const vars = tween.vars ?? {};
      const carries = keyframed ? "keyframes" in vars : props.some((p) => p in vars);
      if (!carries || !((tween.duration?.() ?? 0) > 0)) continue;
      parseUnplayed(win, element, tween, props);
      return tween;
    }
  }
  return null;
}

/** GSAP's startTime() counts the tween's `delay`; the file's parse does not. */
function startsAt(tween: ParsedTween, start: number): boolean {
  const delay = Number(tween.vars?.delay) || 0;
  return Math.abs((tween.startTime?.() ?? Number.NaN) - delay - start) <= 1e-3;
}

/** `anim` timed as GSAP runs it: its start with any delay, a duration it leaves to GSAP filled in. */
export function withLiveTiming(anim: GsapAnimation, tween: ParsedTween | null): GsapAnimation {
  const start = tween?.startTime?.();
  return {
    ...anim,
    ...(Number.isFinite(start) && { resolvedStart: start }),
    ...(anim.duration == null && tween && { duration: tween.duration?.() }),
  };
}

/** GSAP parses a to() tween only when the playhead first passes it, and a soft reload resets that.
 *  Play its timeline from the tween's start (so earlier tweens set its start value) to its end and
 *  back, its channels cleared first; then restore every styled element's attributes and GSAP cache. */
function parseUnplayed(win: GsapWindow, element: Element, tween: ParsedTween, props: string[]) {
  const seek = !isParsed(tween) && seekable(win, tween);
  if (!seek) return;
  const { parent, gsap } = seek;
  const before = layerStates(tween, element);
  const now = parent.time();
  const start = tween.startTime?.() ?? 0;
  gsap.set(element, { clearProps: props.join(",") });
  // Re-read now, so GSAP rebuilds its transform cache from the cleared element before the seek.
  for (const p of props) gsap.getProperty(element, p);
  try {
    parent.seek(start, true);
    parent.seek(start + (tween.duration?.() ?? 0), true);
  } finally {
    parent.seek(now, true);
    restore(before);
  }
}

function isParsed(tween: ParsedTween): boolean {
  const parts = tween.timeline?.getChildren?.() ?? [];
  return Boolean(tween._initted) && parts.every((part) => part._initted);
}

type GsapTools = {
  getProperty: (el: Element, p: string) => unknown;
  set: (el: Element, v: Record<string, unknown>) => void;
};

function seekable(win: GsapWindow, tween: ParsedTween) {
  const { parent } = tween;
  const gsap = win.gsap;
  if (!parent?.seek || !parent.time || !gsap?.getProperty || !gsap.set) return null;
  return {
    parent: { seek: parent.seek.bind(parent), time: parent.time.bind(parent) },
    gsap: { getProperty: gsap.getProperty.bind(gsap), set: gsap.set.bind(gsap) } as GsapTools,
  };
}

type Layer = Element & { _gsap?: Record<string, unknown> };

function layerStates(tween: ParsedTween, element: Element) {
  const layers = new Set<Layer>([element]);
  for (const child of tween.parent?.getChildren?.(true, true, false) ?? [])
    for (const target of elementTargets(child)) layers.add(target);
  return [...layers].map((layer) => ({
    layer,
    attributes: new Map([...layer.attributes].map((a) => [a.name, a.value])),
    cache: layer._gsap && { ...layer._gsap },
  }));
}

function restore(states: ReturnType<typeof layerStates>) {
  for (const { layer, attributes, cache } of states) {
    restoreAttributes(layer, attributes);
    if (cache && layer._gsap) restoreCache(layer._gsap, cache);
  }
}

function restoreAttributes(layer: Element, attributes: Map<string, string>) {
  for (const { name } of [...layer.attributes])
    if (!attributes.has(name)) layer.removeAttribute(name);
  for (const [name, value] of attributes)
    if (layer.getAttribute(name) !== value) layer.setAttribute(name, value);
}

function restoreCache(live: Record<string, unknown>, cache: Record<string, unknown>) {
  for (const key of Object.keys(live)) if (!(key in cache)) delete live[key];
  Object.assign(live, cache);
}

/** Start and end values from GSAP's own parse of the tween, as loaded from the file. Null when
 *  GSAP has not initialised that part of the tween yet: the caller refuses rather than guess. */
export function parsedImplicitEndValue(tween: ParsedTween | null): ImplicitEndValue {
  return (prop, end) => {
    if (!tween) return null;
    for (const part of partsFrom(tween, end)) {
      const pair = endsIn(part, prop);
      if (pair) return end === "start" ? pair[0] : pair[1];
      // The nearest part animating `prop` is not initialised: an earlier one would be a wrong value.
      if (prop in (part.vars ?? {})) return null;
    }
    return null;
  };
}

/** A keyframed tween's parts, nearest `end` first; a flat tween is its own one part. */
function partsFrom(tween: ParsedTween, end: "start" | "end"): ParsedTween[] {
  const parts = tween.timeline?.getChildren?.() ?? [];
  if (parts.length === 0) return [tween];
  return end === "start" ? parts : [...parts].reverse();
}

/** The ease GSAP resolved for a flat tween that authors none: its timeline's default, else GSAP's. */
export function parsedTweenEase(iframe: HTMLIFrameElement | null, tween: ParsedTween | null) {
  if (!tween) return null;
  const win = iframe?.contentWindow as GsapWindow | null;
  const ease =
    tween.vars?.ease ?? tween.parent?.vars?.defaults?.ease ?? win?.gsap?.defaults?.().ease;
  if (typeof ease === "string") return ease;
  const named = (name: string) => win?.gsap?.parseEase?.(name) === ease;
  return typeof ease === "function" ? (BUILT_IN_EASES.find(named) ?? null) : null;
}

// GSAP holds a resolved ease, its own default included, as the function parseEase returns.
const BUILT_IN_EASES = [
  "none",
  ...[
    "power1",
    "power2",
    "power3",
    "power4",
    "sine",
    "expo",
    "circ",
    "back",
    "elastic",
    "bounce",
  ].flatMap((e) => [`${e}.in`, `${e}.out`, `${e}.inOut`]),
];

/** An array of keyframe steps at the exact percentages GSAP times them; the parse rounds them. */
export function withExactStepTimes(anim: GsapAnimation, tween: ParsedTween | null): GsapAnimation {
  const data = anim.keyframes;
  const parts = tween?.timeline?.getChildren?.() ?? [];
  if (data?.format !== "object-array" || parts.length !== data.keyframes.length) return anim;
  const ends = parts.map((part) => (part.startTime?.() ?? 0) + (part.duration?.() ?? 0));
  const total = Math.max(...ends);
  if (!(total > 0) || ends.some((end) => !Number.isFinite(end))) return anim;
  const keyframes = data.keyframes.map((kf, i) => ({
    ...kf,
    percentage: Math.round((ends[i]! / total) * 100000) / 1000,
  }));
  return { ...anim, keyframes: { ...data, keyframes } };
}

/** The keyframe nearest `pct` within {@link KEYFRAME_PCT_MATCH}, or -1: two steps can sit under 1% apart. */
export function nearestKeyframeIndex(keyframes: { percentage: number }[], pct: number): number {
  let best = -1;
  keyframes.forEach((kf, i) => {
    const off = Math.abs(kf.percentage - pct);
    if (
      off <= KEYFRAME_PCT_MATCH &&
      (best < 0 || off < Math.abs(keyframes[best]!.percentage - pct))
    )
      best = i;
  });
  return best;
}

export function exactKeyframePct(anim: GsapAnimation, tween: ParsedTween | null, pct: number) {
  const authored = anim.keyframes?.keyframes ?? [];
  const i = nearestKeyframeIndex(authored, pct);
  return withExactStepTimes(anim, tween).keyframes?.keyframes[i]?.percentage ?? pct;
}
