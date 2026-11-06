import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { parseGsapScriptAcorn, scriptShape } from "@hyperframes/parsers/gsap-parser-acorn";
import { hasExplicitTime } from "@hyperframes/parsers/gsap-writer-acorn";
import { RUNTIME_FILLER } from "@hyperframes/core/runtime/protocol";
import {
  applySoftReloadFinalization,
  findGsapScriptElements,
  scriptsRegistering,
  timelineKeys,
} from "./gsapSoftReload";

interface TweenTiming {
  selector: string;
  start: number;
  duration: number;
  wasStart: number;
  wasDuration: number;
  moved: boolean;
  /** Its place in the script, which is the order a fresh run adds it to the timeline. */
  source: number;
}

/**
 * How a saved script differs from the live one: `retime` when only tween starts and lengths moved
 * (`tweens` in the live timeline's child order), `rerun` for anything only a re-run reproduces.
 */
export type LiveRetimePlan =
  | { kind: "retime"; key: string; after: string; tweens: TweenTiming[] }
  | { kind: "rerun" };

const RERUN = { kind: "rerun" } as const;

function untimedShape(animation: GsapAnimation): string {
  const { id: _id, position: _p, resolvedStart: _s, duration: _d, ...rest } = animation;
  // An offset into the text, which moves when the preview reformats its copy of the script.
  const provenance = rest.provenance && { ...rest.provenance, sourceRange: undefined };
  return JSON.stringify({ ...rest, provenance }, (_key, value) =>
    typeof value === "string" && value.startsWith("__raw:")
      ? (scriptShape(`(${value.slice(6)}\n)`) ?? value)
      : value,
  );
}

const onTimeline = (animation: GsapAnimation) => !animation.global;

const placedAlone = (animation: GsapAnimation) =>
  hasExplicitTime(animation) && typeof animation.resolvedStart === "number";

/** Undefined when only GSAP knows it: an unwritten length takes `gsap.defaults`, which a script may change. */
const lengthOf = (animation: GsapAnimation) =>
  animation.method === "set" ? 0 : animation.durationUnresolved ? undefined : animation.duration;

/** The last two script shapes, by text: a repeat drag starts from the script the last one saved. */
const shapes = new Map<string, string | null>();

function shapeOf(code: string): string | null {
  const shape = shapes.has(code) ? (shapes.get(code) as string | null) : scriptShape(code, true);
  shapes.delete(code);
  shapes.set(code, shape);
  if (shapes.size > 2) shapes.delete(shapes.keys().next().value!);
  return shape;
}

/** Decides, from the two scripts alone, whether a saved edit moved tweens and nothing else. */
export function planLiveRetime(before: string, after: string): LiveRetimePlan {
  // The preview runs the script re-printed by the bundler; a timing edit rewrites numbers only.
  const shape = shapeOf(before);
  if (shape === null || shape !== shapeOf(after)) return RERUN;
  const keys = timelineKeys(after);
  if (keys.length !== 1 || timelineKeys(before).join() !== keys.join()) return RERUN;
  const was = parseGsapScriptAcorn(before).animations.filter(onTimeline);
  const now = parseGsapScriptAcorn(after).animations.filter(onTimeline);
  if (was.length !== now.length) return RERUN;
  const tweens: TweenTiming[] = [];
  for (const [index, next] of now.entries()) {
    const prev = was[index]!;
    if (untimedShape(prev) !== untimedShape(next)) return RERUN;
    // A relative position follows the parser's playhead, which is not GSAP's; only numbers place a tween alone.
    if (!placedAlone(next) || !placedAlone(prev)) return RERUN;
    const duration = lengthOf(next);
    const wasDuration = lengthOf(prev);
    if (duration === undefined || wasDuration === undefined) return RERUN;
    tweens.push({
      selector: next.targetSelector,
      start: next.resolvedStart!,
      duration,
      wasStart: prev.resolvedStart!,
      wasDuration,
      moved: next.resolvedStart !== prev.resolvedStart || duration !== wasDuration,
      source: index,
    });
  }
  // A GSAP timeline keeps its children sorted by start, an equal start after the earlier one: pair in that order.
  tweens.sort((x, y) => x.wasStart - y.wasStart || x.source - y.source);
  return { kind: "retime", key: keys[0]!, after, tweens };
}

export type LiveRetime = Extract<LiveRetimePlan, { kind: "retime" }> & {
  script: HTMLScriptElement;
};

/** Plans against the script the preview is running now; `rerun` when no single live script owns the timeline. */
export function planLiveRetimeFromPreview(
  iframe: HTMLIFrameElement | null,
  after: string,
): LiveRetime | typeof RERUN {
  const doc = iframe?.contentDocument;
  const [key] = timelineKeys(after);
  if (!doc || !key) return RERUN;
  const [script, ...extra] = scriptsRegistering(findGsapScriptElements(doc), [key]);
  if (!script || extra.length > 0) return RERUN;
  const plan = planLiveRetime(script.textContent ?? "", after);
  return plan.kind === "retime" ? { ...plan, script } : RERUN;
}

interface LiveTween {
  duration: (value?: number) => number;
  startTime: () => number;
  delay: () => number;
  repeatDelay?: () => number;
  data?: unknown;
  targets?: () => unknown[];
}
interface LiveTimeline {
  getChildren(nested: boolean, tweens: true, timelines: false): LiveTween[];
  getChildren(nested: false, tweens: false, timelines: true): LiveTimeline[];
  remove: (child: LiveTween) => unknown;
  add: (child: LiveTween, position: number) => unknown;
  time: () => number;
  progress: (value: number, suppressEvents: boolean) => unknown;
  totalTime: (time: number, suppressEvents: boolean) => unknown;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const targetsMatch = (tween: LiveTween, selector: string) => {
  const targets = tween.targets?.() ?? [];
  try {
    return targets.length > 0 && targets.every((t) => (t as Element).matches?.(selector) === true);
  } catch {
    return false;
  }
};

/** The live tweens, one per planned tween, when each sits exactly where the parser says it did. */
function pairedLiveTweens(timeline: LiveTimeline, plan: LiveRetime): LiveTween[] | null {
  // The script's tweens only: the runtime also nests sub-composition timelines and adds filler tweens here.
  const children = timeline
    .getChildren(false, true, false)
    .filter((tween) => tween.data !== RUNTIME_FILLER);
  if (children.length !== plan.tweens.length) return null;
  const paired = plan.tweens.every((t, i) => {
    const live = children[i]!;
    return (
      targetsMatch(live, t.selector) &&
      same(live.startTime() - live.delay(), t.wasStart) &&
      same(live.duration(), t.wasDuration)
    );
  });
  return paired ? children : null;
}

/** The writer rounds every time it writes to 3 decimals. */
const near = (a: number, b: number) => Math.abs(a - b) <= 2e-3;

/** One stretch for every tween (start = shift + stretch × old start, length = stretch × old length), in old order. */
function sharesOneStretch(tweens: TweenTiming[]): boolean {
  const first = tweens[0]!;
  const last = tweens.at(-1)!;
  const longest = tweens.reduce((x, y) => (y.wasDuration > x.wasDuration ? y : x));
  const spread = last.wasStart - first.wasStart;
  // Taken over the widest span, so the writer's rounding cannot push it past `near`.
  const stretch =
    spread > longest.wasDuration
      ? (last.start - first.start) / spread
      : longest.wasDuration > 0
        ? longest.duration / longest.wasDuration
        : 1;
  const fits = tweens.every(
    (t) =>
      near(t.start, first.start + stretch * (t.wasStart - first.wasStart)) &&
      near(t.duration, stretch * t.wasDuration),
  );
  return stretch > 0 && fits;
}

/** Tweens on one element still start in the order they did, an equal start in script order. */
const keepsOrder = (tweens: TweenTiming[]) =>
  tweens.every(
    (t, k) => k === 0 || (tweens[k - 1]!.start - t.start || tweens[k - 1]!.source - t.source) < 0,
  );

/**
 * A tween keeps the start values it recorded when it first played, so every element a move touches
 * must keep its tweens' spacing, and no timeline the script does not own may animate it.
 */
function movesKeepEachElementsHistory(
  timeline: LiveTimeline,
  plan: LiveRetime,
  children: LiveTween[],
  registry: unknown[],
): boolean {
  const byElement = new Map<unknown, number[]>();
  children.forEach((child, i) => {
    for (const target of child.targets?.() ?? []) {
      const indexes = byElement.get(target);
      if (indexes) indexes.push(i);
      else byElement.set(target, [i]);
    }
  });
  const moved = new Set<unknown>();
  for (const [target, indexes] of byElement) {
    if (!indexes.some((i) => plan.tweens[i]!.moved)) continue;
    const tweens = indexes.map((i) => plan.tweens[i]!);
    // GSAP adds delays to the schedule unstretched; a shift keeps every length.
    const shifted = tweens.every((t) => t.duration === t.wasDuration);
    const undelayed = indexes.every((i) => !children[i]!.delay() && !children[i]!.repeatDelay?.());
    if (!keepsOrder(tweens) || !sharesOneStretch(tweens) || !(shifted || undelayed)) return false;
    moved.add(target);
  }
  return !animatedElsewhere(timeline, registry, moved);
}

/** Whether a timeline other than `own` (nested in it, or another registered one) animates any of `targets`. */
function animatedElsewhere(own: LiveTimeline, registry: unknown[], targets: Set<unknown>): boolean {
  const seen = new Set<unknown>([own]);
  const visit = (timeline: LiveTimeline): boolean => {
    if (seen.has(timeline)) return false;
    seen.add(timeline);
    return (
      timeline
        .getChildren(false, true, false)
        .some((tween) => tween.targets?.().some((target) => targets.has(target))) ||
      timeline.getChildren(false, false, true).some(visit)
    );
  };
  const timelines = registry.filter(
    (entry): entry is LiveTimeline => typeof (entry as LiveTimeline)?.getChildren === "function",
  );
  return own.getChildren(false, false, true).some(visit) || timelines.some(visit);
}

/**
 * Moves the live tweens a `retime` plan names and records the saved script as the live one.
 * False, with nothing changed, when the live timeline is not exactly what the parser read.
 */
export function applyLiveRetime(iframe: HTMLIFrameElement | null, plan: LiveRetime): boolean {
  const win = iframe?.contentWindow as { __timelines?: Record<string, unknown> } | null;
  const timeline = win?.__timelines?.[plan.key] as LiveTimeline | undefined;
  if (typeof timeline?.getChildren !== "function") return false;
  // Paired before anything moves: moving a tween re-sorts the timeline's children.
  const children = pairedLiveTweens(timeline, plan);
  if (!children) return false;
  if (plan.tweens.some((t) => t.moved)) {
    const registry = Object.values(win?.__timelines ?? {});
    if (!movesKeepEachElementsHistory(timeline, plan, children, registry)) return false;
    // Re-added in script order: GSAP orders equal starts by when they were added, as a fresh run does.
    const bySource = plan.tweens
      .map((t, i) => ({ ...t, tween: children[i]! }))
      .sort((a, b) => a.source - b.source);
    for (const { tween } of bySource) timeline.remove(tween);
    for (const { tween, start, duration } of bySource) {
      if (tween.duration() !== duration) tween.duration(duration);
      timeline.add(tween, start);
    }
    // Replayed to the playhead as the runtime binds a fresh load, callbacks included.
    const at = timeline.time();
    timeline.progress(0.0001, true);
    timeline.totalTime(at, false);
  }
  // A script element runs once, so this only keeps the next comparison honest; nothing re-executes.
  plan.script.textContent = plan.after;
  return true;
}

/** Syncs a saved timing edit by moving the live tweens; false when only re-running the script can. */
export function moveLiveTweens(
  iframe: HTMLIFrameElement,
  scriptText: string,
  currentTime: number,
  reloadPreview: () => void,
): boolean {
  const plan = planLiveRetimeFromPreview(iframe, scriptText);
  if (plan.kind !== "retime") return false;
  try {
    if (!applyLiveRetime(iframe, plan)) return false;
  } catch (error) {
    console.error("[Studio] Moving the live tweens threw; reloading the preview", error);
    reloadPreview();
    return true;
  }
  if (!applySoftReloadFinalization(iframe, currentTime)) reloadPreview();
  return true;
}
