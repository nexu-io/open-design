// @vitest-environment happy-dom
/**
 * The scale-route resize invariant, swept over the shapes a composition
 * actually produces: WHERE THE USER DROPS THE BOX IS WHERE IT LANDS.
 *
 * Each case builds the geometry the browser reports — a CSS box at a layout
 * position, transformed by GSAP's translate/rotate/scale about the element
 * centre — drives one resize through the real intercept, then re-renders the
 * committed scale and the PERSISTED position and checks the box is still on
 * the drop point. Asserting on the persisted values rather than the live ones
 * is the point: every bug in this class showed as a correct-looking drop frame
 * followed by the element sliding to whatever got written to disk.
 *
 * The model is calibrated against real `hf-resize-debug` output: the same
 * inputs reproduce the drop rect, the post-commit rect and the rect width the
 * browser reported to three decimal places.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { usePlayerStore } from "../player/store/playerStore";
import { tryGsapResizeIntercept } from "./gsapResizeIntercept";

afterEach(() => {
  vi.restoreAllMocks();
  usePlayerStore.setState({ currentTime: 0, activeKeyframePct: null });
  document.body.innerHTML = "";
});

interface Pose {
  /** Untransformed CSS box, in px. */
  box: { w: number; h: number };
  /** GSAP translate. */
  pos: { x: number; y: number };
  /** GSAP scale, per axis. */
  scale: { x: number; y: number };
}

/** Layout position of the untransformed box, shared by every pose in a case. */
const LAYOUT = { left: 120, top: 520 };

/**
 * The AABB a browser reports for `translate() rotate() scale()` about the
 * element centre — the same rect `getBoundingClientRect` returns, which is why
 * a rotated element's anchor is approximate rather than corner-exact.
 */
function renderRect(
  pose: Pose,
  rotationDeg: number,
): { x: number; y: number; w: number; h: number } {
  const rad = (rotationDeg * Math.PI) / 180;
  const [cos, sin] = [Math.abs(Math.cos(rad)), Math.abs(Math.sin(rad))];
  const [sw, sh] = [pose.box.w * pose.scale.x, pose.box.h * pose.scale.y];
  const w = sw * cos + sh * sin;
  const h = sw * sin + sh * cos;
  const cx = LAYOUT.left + pose.box.w / 2 + pose.pos.x;
  const cy = LAYOUT.top + pose.box.h / 2 + pose.pos.y;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

interface ResizeCase {
  name: string;
  /** Untransformed box the stylesheet (or an inline style) gives the element. */
  box: { w: number; h: number };
  /** Where the element sat before the gesture. */
  base: { x: number; y: number };
  /** Scale already on the element — 1 for a never-resized one. */
  liveScale: { x: number; y: number };
  rotation?: number;
  /** The box the user dragged to, and where the draft put it. */
  drop: { w: number; h: number; x: number; y: number };
  /** Sized inline rather than by a stylesheet. */
  inlineSized?: boolean;
  /** The tween states scaleX/scaleY rather than the shorthand. */
  longhandTween?: boolean;
  /** What already writes this element's position. */
  positionWrite?: "static-set" | "keyframed-tween" | "none";
  /** Undo paints the box back to its press look while the animations load. */
  paintedBackWhileLoading?: boolean;
}

function createResizeElement(testCase: ResizeCase): HTMLElement {
  const el = document.createElement("div");
  el.id = "clip";
  if (testCase.inlineSized) {
    el.setAttribute("data-hf-studio-original-width", `${testCase.box.w}px`);
    el.setAttribute("data-hf-studio-original-height", `${testCase.box.h}px`);
  } else {
    el.setAttribute("data-hf-studio-original-box-width", `${testCase.box.w}`);
    el.setAttribute("data-hf-studio-original-box-height", `${testCase.box.h}`);
    el.setAttribute("data-hf-studio-original-width", "");
    el.setAttribute("data-hf-studio-original-height", "");
  }
  return el;
}

function scaleTween(longhand: boolean): GsapAnimation {
  const at = (v: number) => (longhand ? { scaleX: v, scaleY: v } : { scale: v });
  return {
    id: "#clip-to-0-scale",
    targetSelector: "#clip",
    propertyGroup: "scale",
    method: "to",
    properties: at(1),
    position: 0,
    resolvedStart: 0,
    duration: 2,
    keyframes: {
      keyframes: [
        { percentage: 0, properties: at(1) },
        { percentage: 100, properties: at(1.08) },
      ],
    },
  } as unknown as GsapAnimation;
}

function positionAnimation(
  kind: NonNullable<ResizeCase["positionWrite"]>,
  base: { x: number; y: number },
) {
  if (kind === "none") return null;
  if (kind === "static-set") {
    return {
      id: "#clip-set-0-position",
      targetSelector: "#clip",
      propertyGroup: "position",
      method: "set",
      properties: { x: base.x, y: base.y },
      position: 0,
      resolvedStart: 0,
      duration: 0,
      global: true,
    } as unknown as GsapAnimation;
  }
  return {
    id: "#clip-to-0-position",
    targetSelector: "#clip",
    propertyGroup: "position",
    method: "to",
    properties: { x: base.x, y: base.y },
    position: 0,
    resolvedStart: 0,
    duration: 2,
    keyframes: {
      keyframes: [
        { percentage: 0, properties: { x: base.x, y: base.y } },
        { percentage: 100, properties: { x: base.x + 40, y: base.y + 40 } },
      ],
    },
  } as unknown as GsapAnimation;
}

/** Every x/y a run wrote AT THE PLAYHEAD (percentage 0 here), in commit order. */
function persistedPositions(calls: unknown[][]): Array<{ x?: number; y?: number }> {
  const written: Array<{ x?: number; y?: number }> = [];
  for (const call of calls) {
    const mutation = call[1] as {
      properties?: Record<string, number>;
      keyframes?: Array<{ percentage: number; properties: Record<string, number> }>;
      x?: number;
      y?: number;
    };
    const atPlayhead = (mutation.keyframes ?? []).filter((k) => k.percentage === 0);
    const sources = [mutation.properties, ...atPlayhead.map((k) => k.properties)];
    if (mutation.x != null || mutation.y != null) written.push({ x: mutation.x, y: mutation.y });
    for (const source of sources) {
      if (source && (source.x != null || source.y != null))
        written.push({ x: source.x, y: source.y });
    }
  }
  return written;
}

/** The scale the run committed AT THE PLAYHEAD (percentage 0 here). */
function persistedScale(calls: unknown[][]): { x: number; y: number } | null {
  let found: { x: number; y: number } | null = null;
  const take = (source: Record<string, number> | undefined) => {
    if (!source) return;
    const x = source.scaleX ?? source.scale;
    const y = source.scaleY ?? source.scale;
    if (x != null && y != null) found = { x, y };
  };
  for (const call of calls) {
    const mutation = call[1] as {
      properties?: Record<string, number>;
      percentage?: number;
      keyframes?: Array<{ percentage: number; properties: Record<string, number> }>;
    };
    if (mutation.keyframes) {
      for (const frame of mutation.keyframes) if (frame.percentage === 0) take(frame.properties);
      continue;
    }
    if (mutation.percentage != null && mutation.percentage !== 0) continue;
    take(mutation.properties);
  }
  return found;
}

async function runCase(testCase: ResizeCase) {
  const rotation = testCase.rotation ?? 0;
  const el = createResizeElement(testCase);
  // What the gesture stamps at drag start, and the draft it leaves applied.
  el.setAttribute("data-hf-drag-gsap-base-x", `${testCase.base.x}`);
  el.setAttribute("data-hf-drag-gsap-base-y", `${testCase.base.y}`);
  el.setAttribute("data-hf-studio-box-size", "true");
  el.style.width = `${testCase.drop.w}px`;
  el.style.height = `${testCase.drop.h}px`;
  document.body.append(el);

  // The live pose the intercept reads and mutates.
  const live: Pose = {
    box: { ...testCase.box },
    pos: { x: testCase.drop.x, y: testCase.drop.y },
    scale: { ...testCase.liveScale },
  };
  el.getBoundingClientRect = () => {
    // The draft's inline box while it is applied, the real one once cleared.
    const w = Number.parseFloat(el.style.width) || live.box.w;
    const h = Number.parseFloat(el.style.height) || live.box.h;
    const rect = renderRect({ ...live, box: { w, h } }, rotation);
    return { ...rect, width: rect.w, height: rect.h } as unknown as DOMRect;
  };
  const gsapStub = {
    set: (_target: Element, vars: Record<string, number>) => {
      if (vars.x != null) live.pos.x = vars.x;
      if (vars.y != null) live.pos.y = vars.y;
      if (vars.scaleX != null) live.scale.x = vars.scaleX;
      if (vars.scaleY != null) live.scale.y = vars.scaleY;
    },
    getProperty: (_target: Element, prop: string) =>
      ({
        scaleX: live.scale.x,
        scaleY: live.scale.y,
        x: live.pos.x,
        y: live.pos.y,
        rotation,
      })[prop] ?? 0,
  };
  Object.assign(window, { gsap: gsapStub });
  const iframe = {
    contentWindow: { gsap: gsapStub, __timelines: { main: { getChildren: () => [] } } },
    contentDocument: document,
  } as unknown as HTMLIFrameElement;

  const dropPoint = el.getBoundingClientRect();
  // A painted-back edit: undone on screen, shown again only inside a draw (as `drawKeepingUndone` does).
  const look = () => ({
    w: el.style.width,
    h: el.style.height,
    pos: { ...live.pos },
    scale: { ...live.scale },
  });
  const show = (shown: ReturnType<typeof look>) => {
    el.style.width = shown.w;
    el.style.height = shown.h;
    Object.assign(live, { pos: { ...shown.pos }, scale: { ...shown.scale } });
  };
  let shownEdit: ReturnType<typeof look> | null = null;
  const paintBack = () => {
    shownEdit = look();
    show({ w: "", h: "", pos: { ...testCase.base }, scale: { ...testCase.liveScale } });
  };
  const draw = <T>(run: () => T): T => {
    if (!shownEdit) return run();
    show(shownEdit);
    const drawn = run();
    paintBack();
    return drawn;
  };
  const position = positionAnimation(testCase.positionWrite ?? "static-set", testCase.base);
  const animations = [scaleTween(!!testCase.longhandTween), ...(position ? [position] : [])];
  const commitMutation = vi.fn();
  usePlayerStore.setState({ currentTime: 0 });

  await tryGsapResizeIntercept(
    { id: "clip", selector: "#clip", element: el } as DomEditSelection,
    { width: testCase.drop.w, height: testCase.drop.h },
    animations,
    iframe,
    commitMutation,
    async () => {
      if (testCase.paintedBackWhileLoading) paintBack();
      return animations;
    },
    undefined,
    draw,
  );

  // Re-render what the file now says: the committed scale, the persisted
  // position (or the pre-gesture one when nothing was written), the real box.
  const scale = persistedScale(commitMutation.mock.calls) ?? testCase.liveScale;
  const writes = persistedPositions(commitMutation.mock.calls);
  const last = writes.at(-1);
  const settled: Pose = {
    box: testCase.box,
    pos: { x: last?.x ?? testCase.base.x, y: last?.y ?? testCase.base.y },
    scale,
  };
  return {
    dropPoint: { x: dropPoint.x, y: dropPoint.y, w: dropPoint.width, h: dropPoint.height },
    settled: renderRect(settled, rotation),
    writes,
  };
}

const CASES: ResizeCase[] = [
  {
    name: "shrinks a stylesheet-sized element",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 1.648, y: 1.648 },
    drop: { w: 320, h: 128, x: 587, y: 235 },
  },
  {
    name: "grows a stylesheet-sized element",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 0.837, y: 0.837 },
    drop: { w: 1319, h: 527, x: -67, y: -26 },
  },
  {
    name: "resizes an element for the first time (no scale of its own yet)",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 1, y: 1 },
    drop: { w: 900, h: 360, x: 300, y: 100 },
  },
  {
    name: "resizes a rotated element",
    box: { w: 630, h: 200 },
    base: { x: 329, y: 129 },
    liveScale: { x: 0.94, y: 0.939 },
    rotation: -8,
    longhandTween: true,
    drop: { w: 350, h: 111, x: 609, y: 219 },
  },
  {
    name: "resizes a steeply rotated element",
    box: { w: 630, h: 252 },
    base: { x: 17, y: -69 },
    liveScale: { x: 1.192, y: 1.2 },
    rotation: -47,
    longhandTween: true,
    drop: { w: 491, h: 196, x: 120, y: 40 },
  },
  {
    name: "takes a non-uniform drag",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 1, y: 1 },
    longhandTween: true,
    drop: { w: 1200, h: 300, x: -80, y: 60 },
  },
  {
    name: "shrinks almost to nothing",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 1, y: 1 },
    drop: { w: 13, h: 5, x: 800, y: 320 },
  },
  {
    name: "resizes an inline-sized element",
    box: { w: 500, h: 252 },
    base: { x: 100, y: 100 },
    liveScale: { x: 0.5, y: 0.5 },
    inlineSized: true,
    drop: { w: 700, h: 353, x: -40, y: -30 },
  },
  {
    name: "resizes an element with no position write at all",
    box: { w: 630, h: 252 },
    base: { x: 0, y: 0 },
    liveScale: { x: 1, y: 1 },
    positionWrite: "none",
    drop: { w: 900, h: 360, x: 140, y: 55 },
  },
  {
    name: "resizes an element whose position is animated",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 1.648, y: 1.648 },
    positionWrite: "keyframed-tween",
    drop: { w: 320, h: 128, x: 587, y: 235 },
  },
];

describe("a scale resize lands the element on the drop point", () => {
  for (const testCase of CASES) {
    it(testCase.name, async () => {
      const { dropPoint, settled } = await runCase(testCase);
      // 1px: the commit rounds position to whole pixels and scale to 3dp.
      expect(settled.x).toBeCloseTo(dropPoint.x, 0);
      expect(settled.y).toBeCloseTo(dropPoint.y, 0);
      expect(settled.w).toBeCloseTo(dropPoint.w, 0);
      expect(settled.h).toBeCloseTo(dropPoint.h, 0);
    });
  }
});

/**
 * Two drags in a row on the same element. The first bug in this class only
 * showed on the second one, because the wrong value the first wrote then
 * counted as the element's live pose.
 */
it("holds the drop point across a second drag", async () => {
  const first = await runCase({
    name: "first",
    box: { w: 630, h: 252 },
    base: { x: 489, y: 195 },
    liveScale: { x: 1, y: 1 },
    drop: { w: 900, h: 360, x: 300, y: 100 },
  });
  const settledPos = first.writes.at(-1);
  document.body.innerHTML = "";
  const second = await runCase({
    name: "second",
    box: { w: 630, h: 252 },
    base: { x: settledPos?.x ?? 489, y: settledPos?.y ?? 195 },
    // What the first drag committed: 900/630.
    liveScale: { x: 1.429, y: 1.429 },
    drop: { w: 420, h: 168, x: 640, y: 260 },
  });
  expect(second.settled.x).toBeCloseTo(second.dropPoint.x, 0);
  expect(second.settled.y).toBeCloseTo(second.dropPoint.y, 0);
  expect(second.settled.w).toBeCloseTo(second.dropPoint.w, 0);
});

it("lands on the drop point when undo paints the box back while its animations load", async () => {
  const { dropPoint, settled } = await runCase({ ...CASES[0]!, paintedBackWhileLoading: true });
  expect(settled.x).toBeCloseTo(dropPoint.x, 0);
  expect(settled.y).toBeCloseTo(dropPoint.y, 0);
  expect(settled.w).toBeCloseTo(dropPoint.w, 0);
});
