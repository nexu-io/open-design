// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHappyDomRootHarness } from "../player/components/testRootHarness";
import { NearScreenIntersectionObserver } from "./intersectionObserverTestUtils";
import { MockResizeObserver, reportResize } from "./resizeObserverTestUtils";
import { useThumbnailStripSize } from "./useThumbnailStripSize";

const zoom = vi.hoisted(() => ({ previewing: false, listeners: new Set<() => void>() }));
vi.mock("../player/components/timelineZoomInput", () => ({
  isTimelineZoomPreviewing: () => zoom.previewing,
  subscribeTimelineZoomPreview: (listener: () => void) => {
    zoom.listeners.add(listener);
    return () => zoom.listeners.delete(listener);
  },
}));

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

/** Runs the frames the hook asked for, as the browser does after the observer's delivery. */
function nextFrames() {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  return () => act(() => vi.advanceTimersToNextFrame());
}

// A strip that re-rendered inside the observer's delivery resized the timeline Chromium had already measured that
// frame, which it reported as a ResizeObserver loop on every frame of a trim.
it("applies a reported size on the next frame, never inside the observer's delivery", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const runFrames = nextFrames();
  const host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(host, "clientWidth", { configurable: true, value: 300 });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
  const root = createRoot(host);
  function Harness() {
    const [size, ref] = useThumbnailStripSize();
    return <div ref={ref}>{`${size.width}x${size.height}`}</div>;
  }
  try {
    act(() => root.render(<Harness />));
    reportResize(310, 40);
    reportResize(320, 40);
    expect(vi.getTimerCount()).toBe(1);
    expect(host.textContent).toBe("300x40");
    runFrames();
    expect(host.textContent).toBe("320x40");
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

it("cancels a pending resize frame when the last strip unmounts", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const runFrames = nextFrames();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [, ref] = useThumbnailStripSize();
    return <div ref={ref} />;
  }
  try {
    act(() => root.render(<Harness />));
    reportResize(320, 40);
    expect(vi.getTimerCount()).toBe(1);
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    runFrames();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

it("drops a pending size when its strip unmounts, so a strip remounted on that box keeps its own", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const runFrames = nextFrames();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  function Strip() {
    const [size, ref] = useThumbnailStripSize();
    return <div ref={ref}>{`${size.width}x${size.height}`}</div>;
  }
  function Box({ id }: { id: string }) {
    const box = (element: HTMLDivElement | null) => {
      if (!element) return;
      Object.defineProperty(element, "clientWidth", { configurable: true, value: 300 });
      Object.defineProperty(element, "clientHeight", { configurable: true, value: 40 });
    };
    return (
      <div ref={box} data-testid="box">
        <Strip key={id} />
      </div>
    );
  }
  // The other strip keeps the shared observer alive across the remount.
  const render = (id: string) =>
    act(() =>
      root.render(
        <>
          <div>
            <Strip />
          </div>
          <Box id={id} />
        </>,
      ),
    );
  try {
    render("a");
    reportResize(320, 40);
    render("b");
    runFrames();
    expect(host.querySelector('[data-testid="box"]')?.textContent).toBe("300x40");
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

it("does not re-render the strip when the observer reports the size it already holds", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const runFrames = nextFrames();
  const host = document.createElement("div");
  document.body.append(host);
  Object.defineProperty(host, "clientWidth", { configurable: true, value: 300 });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
  const root = createRoot(host);
  let stripRenders = 0;
  function Strip({ label }: { label: string }) {
    stripRenders += 1;
    return label;
  }
  function Harness() {
    const [size, ref] = useThumbnailStripSize();
    return (
      <div ref={ref}>
        <Strip label={`${size.width}x${size.height}`} />
      </div>
    );
  }
  try {
    act(() => root.render(<Harness />));
    expect(host.textContent).toBe("300x40");
    const settled = stripRenders;

    act(() => reportResize(300, 40));
    runFrames();
    expect(stripRenders).toBe(settled);

    act(() => reportResize(320, 40));
    runFrames();
    expect(stripRenders).toBe(settled + 1);
    expect(host.textContent).toBe("320x40");
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

it("measures a strip once a zoom preview ends, not while the preview scales it", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const runFrames = nextFrames();
  const host = document.createElement("div");
  document.body.append(host);
  let width = 300;
  Object.defineProperty(host, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
  const root = createRoot(host);
  function Harness() {
    const [size, ref] = useThumbnailStripSize();
    return <div ref={ref}>{`${size.width}x${size.height}`}</div>;
  }
  try {
    act(() => root.render(<Harness />));
    zoom.previewing = true;
    width = 600;
    act(() => reportResize(600, 40));
    runFrames();
    expect(host.textContent).toBe("300x40");
    zoom.previewing = false;
    act(() => zoom.listeners.forEach((listener) => listener()));
    expect(host.textContent).toBe("600x40");
  } finally {
    zoom.previewing = false;
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

it("measures again each time a preview is laid out, though nothing was read during it", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  const host = document.createElement("div");
  document.body.append(host);
  let width = 300;
  Object.defineProperty(host, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
  const root = createRoot(host);
  function Harness() {
    const [size, ref] = useThumbnailStripSize();
    return <div ref={ref}>{`${size.width}x${size.height}`}</div>;
  }
  try {
    act(() => root.render(<Harness />));
    // A zoom-out lays its target out mid-ease; the resize is reported only later.
    width = 600;
    act(() => zoom.listeners.forEach((listener) => listener()));
    expect(host.textContent).toBe("600x40");
  } finally {
    act(() => root.unmount());
    host.remove();
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

describe("on a scroll", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const frames: FrameRequestCallback[] = [];
  const harness = createHappyDomRootHarness();
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let left = 0;
  let top = 0;
  let scrolled = 0;
  let scrolledDown = 0;
  let stripWidth = 1_000_000;
  let renders = 0;

  function Strip() {
    renders += 1;
    const [size, ref] = useThumbnailStripSize();
    return (
      <div>
        <div ref={ref} data-in-view={`${size.inViewStart}-${size.inViewEnd}`} />
      </div>
    );
  }

  const mountStrips = (count: number) =>
    act(async () =>
      root.render(Array.from({ length: count }, (_, index) => <Strip key={index} />)),
    );

  const spans = () =>
    [...host.querySelectorAll("[data-in-view]")].map((strip) => strip.getAttribute("data-in-view"));

  /** The timeline scrolls so the strips' left edge lands at `nextLeft`, then one frame runs. */
  const scrollTo = (nextLeft: number) => {
    scrolled += left - nextLeft;
    left = nextLeft;
    act(() => host.dispatchEvent(new Event("scroll")));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);
    act(() => frames.splice(0).forEach((frame) => frame(0)));
  };

  const neverReportedNear = () => {
    globalThis.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
  };

  beforeEach(() => {
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    globalThis.IntersectionObserver =
      NearScreenIntersectionObserver as unknown as typeof IntersectionObserver;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => frames.push(frame));
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ left, top, width: stripWidth, height: 40 }) as DOMRect,
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => stripWidth);
    left = 0;
    top = 0;
    scrolled = 0;
    scrolledDown = 0;
    stripWidth = 1_000_000;
    renders = 0;
    host = document.body.appendChild(document.createElement("div"));
    host.setAttribute("data-timeline-scroll-viewport", "");
    Object.defineProperty(host, "scrollLeft", { configurable: true, get: () => scrolled });
    Object.defineProperty(host, "scrollTop", { configurable: true, get: () => scrolledDown });
    root = harness.mount(host);
  });

  afterEach(() => {
    frames.length = 0;
    vi.restoreAllMocks();
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.IntersectionObserver = originalIntersectionObserver;
  });

  it("re-measures every near strip in one shared frame, so a full timeline lays out once", async () => {
    await mountStrips(50);

    scrollTo(-10_000);

    expect(spans()).toEqual(Array(50).fill("9216-11776"));
  });

  it("keeps a visible strip measured when it is read after a scroll but before that scroll's frame", async () => {
    stripWidth = 5_000;
    left = -1_000;
    await mountStrips(1);

    scrolled += 3_000;
    left = -4_000;
    act(() => reportResize(stripWidth, 40));
    act(() => host.dispatchEvent(new Event("scroll")));
    act(() => frames.splice(0).forEach((frame) => frame(0)));

    expect(spans()).toEqual(["3072-5000"]);
  });

  it("keeps a strip on screen measured after a move without a scroll, then a scroll", async () => {
    await mountStrips(1);
    expect(spans()).toEqual(["0-1536"]);

    left = -3_000;
    scrollTo(-1_000);
    expect(spans()).toEqual(["0-2560"]);
  });

  it("measures a strip a vertical scroll brings on screen in that same frame", async () => {
    neverReportedNear();
    top = 5_000;
    await mountStrips(1);
    expect(spans()).toEqual(["0-0"]);

    scrolledDown += 4_900;
    top = 100;
    act(() => host.dispatchEvent(new Event("scroll")));
    act(() => frames.splice(0).forEach((frame) => frame(0)));

    expect(spans()).toEqual(["0-1536"]);
  });

  it("keeps the tiles of a strip that ends just off screen", async () => {
    await mountStrips(1);

    scrollTo(-(stripWidth + 100));

    expect(spans()).toEqual(["999424-1000000"]);
  });

  it("measures the strips a jump brings on screen in that same frame", async () => {
    neverReportedNear();
    left = 50_000;
    await mountStrips(50);
    expect(spans()).toEqual(Array(50).fill("0-0"));

    scrollTo(0);

    expect(spans()).toEqual(Array(50).fill("0-1536"));
  });

  it("does not re-render a strip wholly on screen when it moves", async () => {
    stripWidth = 300;
    left = 100;
    await mountStrips(1);
    const settled = renders;

    scrollTo(700);

    expect(renders).toBe(settled);
  });

  it("does not re-render strips that a jump carries from one side of the screen to the other", async () => {
    left = 50_000;
    await mountStrips(50);
    const settled = renders;

    scrollTo(-2_000_000);

    expect(renders).toBe(settled);
  });

  it("keeps every tile of a short clip, even far from the screen", async () => {
    stripWidth = 4_096;
    top = 5_000;
    await mountStrips(1);

    expect(spans()).toEqual(["0-4096"]);
  });

  it("never re-measures a short clip on a scroll", async () => {
    stripWidth = 300;
    left = 100;
    await mountStrips(1);
    const reads = vi.mocked(Element.prototype.getBoundingClientRect);
    reads.mockClear();

    scrollTo(50);

    expect(reads).not.toHaveBeenCalled();
  });

  it("mounts nothing for a strip far above or below the screen", async () => {
    top = 5_000;
    await mountStrips(1);

    expect(spans()).toEqual(["0-0"]);
  });

  it("measures a strip as it comes near the screen, without waiting for a frame", async () => {
    const reports: IntersectionObserverCallback[] = [];
    globalThis.IntersectionObserver = class {
      constructor(callback: IntersectionObserverCallback) {
        reports.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;
    await mountStrips(1);
    const strip = host.querySelector("[data-in-view]")!;

    left = -10_000;
    const [presence] = reports;
    act(() =>
      presence!(
        [
          {
            isIntersecting: true,
            target: strip.parentElement!,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );

    expect(frames).toHaveLength(0);
    expect(strip.getAttribute("data-in-view")).toBe("9216-11776");
  });

  it("reads no strip far from the screen, however many clips the timeline mounts", async () => {
    left = 50_000;
    await mountStrips(50);
    const reads = vi.mocked(Element.prototype.getBoundingClientRect);
    reads.mockClear();

    scrollTo(49_900);

    expect(reads).not.toHaveBeenCalled();
  });
});
