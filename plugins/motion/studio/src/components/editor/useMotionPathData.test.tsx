// @vitest-environment happy-dom
import { gsap } from "gsap";
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { elementHome } from "./motionPathHome";
import { useMotionPathData } from "./useMotionPathData";
import { resetOverlayFrameLoopForTests } from "./overlayFrameLoop";
import { usePlayerStore } from "../../player/store/playerStore";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const runtime = vi.hoisted(() => ({ read: null as unknown, gsapPosition: null as unknown }));
vi.mock("../../hooks/gsapRuntimeKeyframes", () => ({ readRuntimeKeyframes: () => runtime.read }));
vi.mock("../../hooks/gsapPositionDetection", () => ({
  readGsapPositionFromIframe: () => runtime.gsapPosition,
}));

const originalRaf = window.requestAnimationFrame;
let frames: Array<() => void> = [];
const runFrames = (count: number) => {
  for (let i = 0; i < count; i++) {
    const batch = frames;
    frames = [];
    act(() => {
      for (const frame of batch) frame();
      vi.advanceTimersByTime(16);
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"],
  });
  window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
    frames.push(() => callback(performance.now()))) as typeof window.requestAnimationFrame;
  usePlayerStore.setState({ previewBooted: true, motionPathArmed: false });
});

afterEach(() => {
  resetOverlayFrameLoopForTests();
  window.requestAnimationFrame = originalRaf;
  vi.useRealTimers();
  usePlayerStore.setState({ previewBooted: false, motionPathArmed: false });
  document.body.innerHTML = "";
  runtime.read = runtime.gsapPosition = null;
});

it("draws an axis the tween leaves alone where GSAP renders it, so the playhead node sits on the layer", () => {
  runtime.read = {
    keyframes: [
      { percentage: 66.667, properties: { x: 60 } },
      { percentage: 100, properties: { x: 120 } },
    ],
  };
  runtime.gsapPosition = { x: 60, y: 30 };
  let points: string | undefined;
  function Probe() {
    const ref = useRef(document.createElement("iframe"));
    points = useMotionPathData(ref, "#box").geometry?.points;
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  try {
    act(() => root.render(<Probe />));
    expect(points).toBe("60,30 120,30");
  } finally {
    act(() => root.unmount());
  }
});

it("reads no layout per frame until there is a path or a create ring to draw", () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const reads = vi.spyOn(iframe, "getBoundingClientRect");
  function Probe() {
    const ref = useRef(iframe);
    useMotionPathData(ref, "#box");
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(<Probe />));
    runFrames(10);
    expect(reads).not.toHaveBeenCalled();

    act(() => usePlayerStore.setState({ motionPathArmed: true }));
    runFrames(10);
    expect(reads).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});

it("finds the layer whichever window built its node, so the path draws on every load", () => {
  runtime.read = {
    keyframes: [
      { percentage: 0, properties: { x: 0, y: 0 } },
      { percentage: 100, properties: { x: 100, y: 0 } },
    ],
  };
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const box = iframe.contentDocument!.createElement("div");
  box.id = "box";
  iframe.contentDocument!.body.append(box);
  // happy-dom shares one realm, so the frame's own constructor stands in for another window's.
  Object.defineProperty(iframe.contentWindow!, "HTMLElement", { value: class {} });
  let home: unknown = null;
  function Probe() {
    const ref = useRef(iframe);
    home = useMotionPathData(ref, "#box").home;
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  try {
    act(() => root.render(<Probe />));
    runFrames(3);
    expect(home).not.toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it("redraws a node whose keyframe changes only its size", () => {
  const read = (width: number) => ({
    keyframes: [
      { percentage: 66.667, properties: { x: 60, width } },
      { percentage: 100, properties: { x: 120, width: 320 } },
    ],
  });
  runtime.read = read(280);
  runtime.gsapPosition = { x: 50, y: 30 };
  let w: number | undefined;
  function Probe() {
    const ref = useRef(document.createElement("iframe"));
    w = useMotionPathData(ref, "#box").geometry?.nodes[0]?.w;
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  try {
    act(() => root.render(<Probe />));
    expect(w).toBe(280);
    runtime.read = read(300);
    act(() => vi.advanceTimersByTime(250));
    expect(w).toBe(300);
  } finally {
    act(() => root.unmount());
  }
});

/** A layer laid out at (960, 540), 240 x 160, with `css` inline and `cache` as GSAP's `_gsap`. */
function layer(css: Partial<CSSStyleDeclaration>, cache?: Record<string, number>) {
  const el = document.body.appendChild(document.createElement("div"));
  Object.assign(el.style, css);
  const box = {
    offsetLeft: 960,
    offsetTop: 540,
    offsetWidth: 240,
    offsetHeight: 160,
    offsetParent: null,
  };
  for (const [key, value] of Object.entries(box)) Object.defineProperty(el, key, { value });
  return cache ? Object.assign(el, { _gsap: cache }) : el;
}

it("anchors a layer GSAP centres with xPercent/yPercent -50 on its centre", () => {
  const el = layer(
    { position: "absolute", left: "50%", top: "50%" },
    { x: 0, y: 0, xPercent: -50, yPercent: -50 },
  );
  expect(elementHome(el)).toEqual({ x: 960, y: 540, w: 240, h: 160, ax: 0, ay: 0 });
});

it("moves a resized layer's centre by half the change from a set left, against it from a set right, and not in flow", () => {
  const fromLeft = layer({ position: "absolute", left: "10px", top: "10px" });
  expect(elementHome(fromLeft)).toMatchObject({ x: 1080, y: 620, ax: 0.5, ay: 0.5 });
  const fromRight = layer({ position: "absolute", right: "10px", bottom: "10px" });
  const auto = new Set(["left", "top"]);
  fromRight.computedStyleMap = () =>
    ({
      get: (side: string) => (auto.has(side) ? "auto" : "10px"),
    }) as unknown as StylePropertyMapReadOnly;
  expect(elementHome(fromRight)).toMatchObject({ ax: -0.5, ay: -0.5 });
  expect(elementHome(layer({}))).toMatchObject({ x: 1080, ax: 0, ay: 0 });
});

const resolved = (style: CSSStyleDeclaration) =>
  (style.translate ?? "").replace(/var\((--[\w-]+)\)/g, (_, name) =>
    style.getPropertyValue(name),
  ) || "none";

/** Computes `translate` and `transform` as Chromium does (happy-dom does not), so GSAP's parse would fold them. */
function computeTranslate() {
  const real = window.getComputedStyle.bind(window);
  const computed = (node: Element, pseudo?: string | null) =>
    new Proxy(real(node, pseudo), {
      get(style, key) {
        if (key === "translate") return resolved((node as HTMLElement).style);
        if (key === "transform") return (node as HTMLElement).style.transform || "none";
        if (key === "scale" || key === "rotate") return "none";
        const value = Reflect.get(style, key);
        return typeof value === "function" ? value.bind(style) : value;
      },
    });
  vi.stubGlobal("getComputedStyle", computed);
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    computed as typeof window.getComputedStyle,
  );
}

it("leaves a layer's CSS translate alone and anchors where GSAP's parse will put it (real GSAP)", () => {
  vi.stubGlobal("gsap", gsap);
  computeTranslate();
  try {
    const offset = "var(--hf-studio-offset-x) var(--hf-studio-offset-y)";
    const cases: [string, number, number][] = [
      // GSAP folds these into x, which a created path sets.
      ["40px 30px", 1080, 620],
      [offset, 1080, 620],
      // Minus half the size becomes xPercent/yPercent -50.
      ["-50% -50%", 960, 540],
      ["-120px -80px", 960, 540],
    ];
    // GSAP sums the layer's own transform with its translate: Chromium's matrix for translate(-50%, -50%).
    const centred = layer({ position: "absolute", transform: "matrix(1, 0, 0, 1, -120, -80)" });
    expect(elementHome(centred)).toMatchObject({ x: 960, y: 540 });
    for (const [translate, x, y] of cases) {
      const el = layer({ position: "absolute", left: "10px", top: "10px", translate });
      el.style.setProperty("--hf-studio-offset-x", "40px");
      el.style.setProperty("--hf-studio-offset-y", "30px");
      expect(elementHome(el), translate).toMatchObject({ x, y });
      expect([el.style.translate, el.style.transform]).toEqual([translate, ""]);
    }
    // A drag's offset on a layer GSAP already parsed composes with its transform.
    const dragged = layer({ position: "absolute", left: "10px", top: "10px" });
    gsap.set(dragged, { x: 20 });
    dragged.style.setProperty("--hf-studio-offset-x", "40px");
    dragged.style.setProperty("--hf-studio-offset-y", "30px");
    dragged.style.translate = offset;
    expect(elementHome(dragged)).toMatchObject({ x: 1120, y: 650 });
    // After clearProps GSAP marks its cache uncache and its next parse folds the translate again.
    const css = { position: "absolute", left: "10px", top: "10px", translate: "40px 30px" };
    expect(elementHome(layer(css, { x: 0, y: 0, uncache: 1 }))).toMatchObject({ x: 1080, y: 620 });
    // A fade gives GSAP a cache with no transform in it yet, so its next parse still folds.
    expect(elementHome(layer(css, { opacity: 1 }))).toMatchObject({ x: 1080, y: 620 });
    const owned = layer({ position: "absolute", left: "50%", top: "50%" });
    gsap.set(owned, { xPercent: -50, yPercent: -50 });
    expect(elementHome(owned)).toMatchObject({ x: 960, y: 540, ax: 0, ay: 0 });
  } finally {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
});

it("redraws the start ring when only GSAP's start changes", () => {
  const read = (start?: Record<string, number>) => ({
    keyframes: [
      { percentage: 50, properties: { x: 60 } },
      { percentage: 100, properties: { x: 120 } },
    ],
    ...(start && { start }),
  });
  runtime.read = read();
  runtime.gsapPosition = { x: 50, y: 30 };
  let start: unknown;
  function Probe() {
    const ref = useRef(document.createElement("iframe"));
    start = useMotionPathData(ref, "#box").geometry?.start;
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  try {
    act(() => root.render(<Probe />));
    expect(start).toBeUndefined();
    runtime.read = read({ x: 40 });
    act(() => vi.advanceTimersByTime(250));
    expect(start).toEqual({ x: 40, y: 30 });
  } finally {
    act(() => root.unmount());
  }
});

it("updates the home when the layer's size or anchoring changes but its centre does not", () => {
  runtime.read = {
    keyframes: [
      { percentage: 0, properties: { x: 0, width: 200 } },
      { percentage: 100, properties: { x: 100, width: 240 } },
    ],
  };
  const iframe = document.body.appendChild(document.createElement("iframe"));
  const layout = { offsetLeft: 100, offsetWidth: 200 };
  const box = iframe.contentDocument!.body.appendChild(
    iframe.contentDocument!.createElement("div"),
  );
  box.id = "box";
  for (const key of ["offsetLeft", "offsetWidth"] as const)
    Object.defineProperty(box, key, { get: () => layout[key] });
  let w: number | undefined;
  let ax: number | undefined;
  function Probe() {
    const ref = useRef(iframe);
    ({ w, ax } = useMotionPathData(ref, "#box").home ?? {});
    return null;
  }
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  try {
    act(() => root.render(<Probe />));
    runFrames(2);
    expect(w).toBe(200);
    Object.assign(layout, { offsetLeft: 80, offsetWidth: 240 });
    runFrames(2);
    expect(w).toBe(240);
    // Re-anchored from the left to the right edge without moving: the share a size change moves changes.
    Object.assign(box.style, { position: "absolute", left: "10px" });
    runFrames(2);
    expect(ax).toBe(0.5);
    box.computedStyleMap = () =>
      ({
        get: (side: string) => (side === "left" ? "auto" : "0px"),
      }) as unknown as StylePropertyMapReadOnly;
    runFrames(2);
    expect(ax).toBe(-0.5);
  } finally {
    act(() => root.unmount());
  }
});
