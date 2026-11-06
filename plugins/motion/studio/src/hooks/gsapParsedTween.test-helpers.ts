import { vi } from "vitest";
import { classifyTweenPropertyGroup } from "@hyperframes/core/gsap-parser";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { usePlayerStore } from "../player/store/playerStore";

/** A property's `[start, end]` as GSAP parsed it from the file when the tween first rendered. */
type Ends = Record<string, [number, number]>;

/** A GSAP 3 tween as the preview runtime holds it, with the property tweens the parse readers walk. */
export function liveTween(
  target: Element,
  tween: { start: number; duration: number; vars: Record<string, unknown>; ends?: Ends },
  { from = false, parts }: { from?: boolean; parts?: unknown[] } = {},
) {
  let head: Record<string, unknown> | undefined;
  for (const [p, [s, e]] of Object.entries(tween.ends ?? {}).reverse())
    head = from ? { p, s: e, c: s - e, _next: head } : { p, s, c: e - s, _next: head };
  return {
    targets: () => [target],
    startTime: () => tween.start,
    duration: () => tween.duration,
    vars: tween.vars,
    _from: from,
    ...(head && { _pt: { d: { _pt: head } } }),
    ...(parts && { timeline: { getChildren: () => parts, duration: () => tween.duration } }),
  };
}

/** A preview iframe whose one timeline holds `tweens`, answering `getProperty` from `live`. */
export function previewWith(
  element: Element,
  tweens: unknown[],
  live: Record<string, number> = {},
): HTMLIFrameElement {
  return {
    contentWindow: {
      __timelines: { main: { getChildren: () => tweens, duration: () => 10 } },
      gsap: {
        getProperty: (_el: Element, prop: string) => live[prop] ?? 0,
        defaults: () => ({ ease: "power1.out" }),
      },
    },
    contentDocument: element.ownerDocument,
  } as unknown as HTMLIFrameElement;
}

export const tween = (fields: Partial<GsapAnimation>): GsapAnimation =>
  ({ targetSelector: "#box", propertyGroup: "position", ...fields }) as GsapAnimation;

/** `#box`'s position as a keyframe step list, parsed and run by GSAP (step `[duration, props]`). */
export function boxSteps(steps: Array<[number, Record<string, number | string>]>) {
  const duration = steps.reduce((sum, [d]) => sum + d, 0);
  let end = 0;
  const keyframes = steps.map(([d, properties]) => {
    end += d;
    return { percentage: Math.round((end / duration) * 1000) / 10, properties };
  });
  const keys = tween({
    id: "#box-to-0-position",
    method: "to",
    properties: {},
    resolvedStart: 0,
    duration,
    keyframes: { format: "object-array", keyframes },
  });
  let start = 0;
  const parts = steps.map(([d]) => {
    const at = start;
    start += d;
    return { startTime: () => at, duration: () => d };
  });
  const live = (el: Element) =>
    liveTween(el, { start: 0, duration, vars: { keyframes: [] } }, { parts });
  return { keys, live };
}

/** A `to` tween on `#el` from 0, grouped as the parser would; duration 0 is an immediate-render hold. */
export function elTween(
  id: string,
  properties: Record<string, number>,
  duration: number,
  ease?: string,
): GsapAnimation {
  return {
    id,
    targetSelector: "#el",
    propertyGroup: classifyTweenPropertyGroup(properties),
    method: "to",
    properties,
    position: 0,
    resolvedStart: 0,
    duration,
    ...(duration === 0 ? { extras: { immediateRender: "__raw:true" } } : ease && { ease }),
  } as unknown as GsapAnimation;
}

/** Per-test cleanup for the intercept sweeps: mocks, the playhead store and the document. */
export function resetGsapEditState(): void {
  vi.restoreAllMocks();
  usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null });
  document.body.innerHTML = "";
}
