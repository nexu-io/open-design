// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const { leaseSpy } = vi.hoisted(() => ({
  leaseSpy: vi.fn((_request: unknown) => ({ status: "loading" as const })),
}));

vi.mock("../../hooks/useThumbnailLease", () => ({
  useThumbnailLease: leaseSpy,
}));

// One observer serves every waveform; it reports each one near as it is watched, unless a test
// reports by hand.
const nearScreen = {
  auto: true,
  watched: [] as Element[],
  report: (_target: Element, _near: boolean) => {},
};
globalThis.IntersectionObserver = class {
  constructor(callback: IntersectionObserverCallback) {
    nearScreen.report = (target, near) =>
      callback(
        [{ target, isIntersecting: near } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
  }
  observe(target: Element) {
    nearScreen.watched.push(target);
    if (nearScreen.auto) nearScreen.report(target, true);
  }
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver;

const EMPTY_STRIP = { width: 0, height: 0, inViewStart: 0, inViewEnd: 0 };
const watchGap = vi.hoisted(() => vi.fn());
const strip = vi.hoisted(() => ({
  size: { width: 0, height: 0, inViewStart: 0, inViewEnd: 0 },
  listeners: new Set<() => void>(),
}));
// The strip hook's own tests cover scrolls and moves; here it reports what the test sets.
vi.mock("../../hooks/useThumbnailStripSize", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    strip.listeners.add(listener);
    return () => strip.listeners.delete(listener);
  };
  return {
    useThumbnailStripSize: () => [
      useSyncExternalStore(subscribe, () => strip.size),
      () => {},
      watchGap,
    ],
  };
});

const setStrip = (size: typeof EMPTY_STRIP) =>
  act(() => {
    strip.size = size;
    strip.listeners.forEach((listener) => listener());
  });

import { AudioWaveform, drawWaveformCanvas } from "./AudioWaveform";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<ReturnType<typeof createRoot>> = [];

afterEach(() => {
  act(() => mounted.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
  vi.useRealTimers();
  leaseSpy.mockReset();
  leaseSpy.mockImplementation(() => ({ status: "loading" as const }));
  strip.size = EMPTY_STRIP;
  nearScreen.auto = true;
  watchGap.mockClear();
  document.body.innerHTML = "";
});

/** Renders a ready waveform for a two-peak sound into `parent`. */
function renderReadyWaveform(parent: HTMLElement = document.body) {
  // One snapshot, as the lease returns, so a re-render alone does not redraw.
  const ready = { status: "ready", value: { kind: "waveform", peaks: [0.5, 1] } } as never;
  leaseSpy.mockImplementation(() => ready);
  const host = document.createElement("div");
  parent.append(host);
  const root = createRoot(host);
  mounted.push(root);
  act(() => {
    root.render(
      <AudioWaveform
        audioUrl="/media/voice.wav"
        label=""
        labelColor="#fff"
        projectId="project-a"
        sessionEpoch={1}
        priority="visible"
      />,
    );
  });
}

/** A 6 x 20 canvas whose 2D context records every fill as [style, x, y, width, height]. */
function recordingCanvas() {
  const fills: Array<[string, number, number, number, number]> = [];
  const context = {
    scale: vi.fn(),
    clearRect: vi.fn(),
    fillStyle: "",
    fillRect: (x: number, y: number, width: number, height: number) =>
      fills.push([String(context.fillStyle), x, y, width, height]),
  } as unknown as CanvasRenderingContext2D;
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, {
    clientWidth: { value: 6 },
    clientHeight: { value: 20 },
  });
  vi.spyOn(canvas, "getContext").mockReturnValue(context);
  return { canvas, fills };
}

describe("AudioWaveform", () => {
  it("paints a baseline and peak bar for every mapped waveform bin", () => {
    const { canvas, fills } = recordingCanvas();
    drawWaveformCanvas(canvas, [0.25, 1], false, 0, 1);
    expect(fills.map(([, x, y, width, height]) => [x, y, width, height])).toEqual([
      [0, 18, 3, 2],
      [0, 15, 3, 5],
      [3, 18, 3, 2],
      [3, 0, 3, 20],
    ]);
  });

  it("draws only the span of the clip it is given", () => {
    const { canvas, fills } = recordingCanvas();
    // The clip's second half holds the loud peak only.
    drawWaveformCanvas(canvas, [0.25, 1], false, 0, 1, null, { from: 0.5, to: 1 });
    const bars = fills.filter(([, , y, , height]) => !(y === 18 && height === 2));
    expect(bars.map(([, , y, , height]) => [y, height])).toEqual([
      [0, 20],
      [0, 20],
    ]);
  });

  it("draws only the stretch of a long clip near the screen, and follows it as the clip moves", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    setStrip({ width: 10_000, height: 40, inViewStart: 2048, inViewEnd: 4096 });
    renderReadyWaveform();
    const canvas = document.querySelector("canvas")!;
    const placed = () => [parseFloat(canvas.style.left), parseFloat(canvas.style.width)];
    expect(placed()[0]).toBeCloseTo(20.48);
    expect(placed()[1]).toBeCloseTo(20.48);
    // A move or scroll carries the clip: the hook reports a new stretch and the bars follow.
    setStrip({ width: 10_000, height: 40, inViewStart: 4096, inViewEnd: 6144 });
    expect(placed()[0]).toBeCloseTo(40.96);
    expect(placed()[1]).toBeCloseTo(20.48);
  });

  it("watches no ends of a clip drawn whole", () => {
    setStrip({ width: 1000, height: 40, inViewStart: 0, inViewEnd: 1000 });
    renderReadyWaveform();
    expect(watchGap.mock.calls.filter(([gap]) => gap)).toEqual([]);
  });

  it("leaves a waveform off screen undrawn through a zoom, and draws it once it comes near", () => {
    nearScreen.auto = false;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    setStrip({ width: 1000, height: 40, inViewStart: 0, inViewEnd: 1000 });
    renderReadyWaveform();
    const root = nearScreen.watched.at(-1)!;
    expect(getContext).not.toHaveBeenCalled();
    act(() => nearScreen.report(root, true));
    const drawn = getContext.mock.calls.length;
    expect(drawn).toBeGreaterThan(0);
    act(() => nearScreen.report(root, false));
    setStrip({ width: 2000, height: 40, inViewStart: 0, inViewEnd: 2000 });
    expect(getContext.mock.calls.length).toBe(drawn);
    act(() => nearScreen.report(root, true));
    expect(getContext.mock.calls.length).toBe(drawn + 1);
  });

  it("redraws a short clip, drawn whole, when a zoom changes its width", () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    setStrip({ width: 1000, height: 40, inViewStart: 0, inViewEnd: 1000 });
    renderReadyWaveform();
    const drawn = getContext.mock.calls.length;
    setStrip({ width: 2000, height: 40, inViewStart: 0, inViewEnd: 2000 });
    expect(getContext.mock.calls.length).toBe(drawn + 1);
  });

  it("watches both undrawn ends of a long clip, so a move without a scroll re-measures it", () => {
    setStrip({ width: 10_000, height: 40, inViewStart: 2048, inViewEnd: 4096 });
    renderReadyWaveform();
    const gaps = [
      ...new Set(watchGap.mock.calls.map(([gap]) => gap).filter(Boolean)),
    ] as HTMLElement[];
    expect(gaps.map((gap) => [gap.style.width, gap.style.left])).toEqual([
      ["20.48%", ""],
      ["", "40.96%"],
    ]);
  });

  it("shrinks each bar to the fade's gain and keeps the cut-away part as a ghost", () => {
    const { canvas, fills } = recordingCanvas();
    // A 1 s fade-in on a 2 s clip: the first bar's centre (0.5 s) plays at half gain.
    drawWaveformCanvas(canvas, [1, 1], false, 0, 1, { fadeIn: 1, fadeOut: 0, duration: 2 });
    const bars = fills.filter(([, , y, , height]) => !(y === 18 && height === 2));
    // The heard half, then the ghost only above it, so the two never stack.
    expect(bars.map(([, x, y, width, height]) => [x, y, width, height])).toEqual([
      [0, 10, 3, 10],
      [0, 0, 3, 10],
      [3, 0, 3, 20],
    ]);
    const alpha = (style: string) => Number(style.split(",").at(-1)?.replace(")", ""));
    expect(alpha(bars[1][0])).toBeCloseTo(alpha(bars[0][0]) * 0.27, 2);
  });

  it("leases waveform decoding with the clip's project, session, and viewport priority", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <AudioWaveform
          audioUrl="/media/voice.wav"
          label=""
          labelColor="#fff"
          projectId="project-a"
          sessionEpoch={9}
          priority="interaction"
        />,
      );
    });

    expect(leaseSpy).toHaveBeenCalled();
    expect(leaseSpy.mock.calls.at(-1)?.[0]).toMatchObject({
      projectId: "project-a",
      sessionEpoch: 9,
      kind: "waveform",
      priority: "interaction",
      rich: false,
    });

    act(() => root.unmount());
  });

  it("greys the clip in place when muted", () => {
    const host = document.createElement("div");
    host.className = "timeline-clip is-audio";
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <AudioWaveform
          audioUrl="/media/voice.wav"
          label=""
          labelColor="#fff"
          projectId="project-a"
          sessionEpoch={1}
          priority="visible"
          muted
        />,
      );
    });

    expect(host.getAttribute("data-audio-muted")).toBe("true");

    act(() => root.unmount());
    expect(host.hasAttribute("data-audio-muted")).toBe(false);
  });

  it("fills a short sound strip when the label band is dropped", () => {
    const heights = [16, 0].map((labelInset) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      act(() => {
        root.render(
          <AudioWaveform
            audioUrl="/media/talk.mp4"
            label=""
            labelColor="#fff"
            projectId="project-a"
            sessionEpoch={1}
            priority="visible"
            {...(labelInset === 16 ? {} : { labelInset })}
          />,
        );
      });
      const canvas = host.querySelector("canvas");
      const box = { top: canvas?.style.top, height: canvas?.style.height };
      act(() => root.unmount());
      return box;
    });
    expect(heights).toEqual([
      { top: "16px", height: "calc(100% - 16px)" },
      { top: "0px", height: "calc(100% - 0px)" },
    ]);
  });
});
