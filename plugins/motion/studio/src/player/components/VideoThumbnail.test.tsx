// @vitest-environment happy-dom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockResizeObserver, reportResize } from "../../hooks/resizeObserverTestUtils";
import { thumbnailScheduler } from "../lib/thumbnailScheduler";
import { decodeVideoThumbnail } from "../lib/thumbnailVideoDecoder";
import { createHappyDomRootHarness } from "./testRootHarness";
import { VideoThumbnail } from "./VideoThumbnail";
import { markTimelineMotion } from "./timelineMotion";

vi.mock("../lib/thumbnailVideoDecoder", () => ({ decodeVideoThumbnail: vi.fn() }));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

let host: HTMLDivElement;

beforeEach(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  host = document.body.appendChild(document.createElement("div"));
});

afterEach(() => {
  vi.useRealTimers();
  thumbnailScheduler.invalidateProject("p");
  vi.clearAllMocks();
});

// Registered after the reset above, so each test's strip unmounts before the cache is cleared.
const harness = createHappyDomRootHarness();

function clip(
  videoSrc = "/api/projects/p/preview/assets/clip.mp4",
  priority: "visible" | "overscan" = "visible",
) {
  return (
    <VideoThumbnail
      videoSrc={videoSrc}
      label=""
      labelColor="#fff"
      projectId="p"
      sessionEpoch={1}
      priority={priority}
    />
  );
}

async function render(width = 0, height = 40) {
  Object.defineProperty(host, "clientWidth", { configurable: true, value: width });
  Object.defineProperty(host, "clientHeight", { configurable: true, value: height });
  const root = harness.mount(host);
  await act(async () => {
    root.render(clip());
    await Promise.resolve();
  });
  return root;
}

const shownSources = () => [...host.querySelectorAll("img")].map((img) => img.getAttribute("src"));

describe("VideoThumbnail", () => {
  it("does not acquire a thumbnail lease before the clip is measured", async () => {
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "image", url: "blob:poster", aspect: 16 / 9 },
      weight: 128,
    });

    await render();

    expect(decodeVideoThumbnail).not.toHaveBeenCalled();
  });

  it("requests a filmstrip sized by the measured clip height", async () => {
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
      weight: 256,
    });

    await render(440);

    expect(decodeVideoThumbnail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ frameCount: 1, contentVersion: "project=p&session=1" }),
      expect.any(AbortSignal),
    );
    expect(decodeVideoThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ frameCount: 8 }),
      expect.any(AbortSignal),
    );
    expect(host.querySelectorAll("img").length).toBeGreaterThan(0);
  });

  it("spreads the frames across every tile so the strip reaches the clip's end", async () => {
    const urls = Array.from({ length: 8 }, (_, index) => `blob:${index}`);
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "filmstrip", urls, aspect: 16 / 9 },
      weight: 256,
    });

    await render(300);

    const tiles = [...host.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    // Seven slices and the end frame: the last tile shows the end.
    expect(tiles).toEqual(["blob:0", "blob:2", "blob:3", "blob:4", "blob:7"]);
  });

  describe("on a 10-minute clip at full zoom", () => {
    const frames: FrameRequestCallback[] = [];
    const originalIntersectionObserver = globalThis.IntersectionObserver;
    let left = -432_000;
    let scrolled = 0;
    let reportGapNearScreen: () => void = () => {};

    beforeEach(() => {
      vi.mocked(decodeVideoThumbnail).mockResolvedValue({
        value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
        weight: 256,
      });
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => frames.push(frame));
      globalThis.IntersectionObserver = class {
        observed = new Set<Element>();
        constructor(private readonly callback: IntersectionObserverCallback) {
          reportGapNearScreen = () =>
            callback(
              [...this.observed].map(
                (target) => ({ isIntersecting: true, target }) as IntersectionObserverEntry,
              ),
              this as unknown as IntersectionObserver,
            );
        }
        observe(target: Element) {
          this.observed.add(target);
          queueMicrotask(() =>
            this.callback(
              [{ isIntersecting: true, target } as IntersectionObserverEntry],
              this as unknown as IntersectionObserver,
            ),
          );
        }
        unobserve(target: Element) {
          this.observed.delete(target);
        }
        disconnect() {
          this.observed.clear();
        }
      } as unknown as typeof IntersectionObserver;
      left = -432_000;
      scrolled = 0;
      host.getBoundingClientRect = () =>
        ({ left, top: 0, width: 600 * 1440, height: 40 }) as DOMRect;
      const scroller = document.body.appendChild(document.createElement("div"));
      scroller.setAttribute("data-timeline-scroll-viewport", "");
      Object.defineProperty(scroller, "scrollLeft", { configurable: true, get: () => scrolled });
      scroller.append(host);
    });

    const scrollTo = (nextLeft: number) => {
      scrolled += left - nextLeft;
      left = nextLeft;
      host.dispatchEvent(new Event("scroll"));
    };

    afterEach(() => {
      frames.length = 0;
      vi.restoreAllMocks();
      globalThis.IntersectionObserver = originalIntersectionObserver;
    });

    const settle = () =>
      act(async () => {
        await Promise.resolve();
        for (const frame of frames.splice(0)) frame(0);
      });

    const expectTilesCoverTheWindow = () => {
      const tiles = host.querySelectorAll("img").length;
      const skipped = parseFloat(
        (host.querySelector("img")!.closest(".flex") as HTMLElement).style.paddingLeft,
      );
      expect(tiles).toBeLessThan(60);
      expect(skipped).toBeLessThanOrEqual(-left);
      expect(skipped + tiles * 71).toBeGreaterThanOrEqual(-left + window.innerWidth);
    };

    it("mounts only the tiles in view, and follows each scroll", async () => {
      await render(600 * 1440, 40);
      expectTilesCoverTheWindow();

      for (const scrolledTo of [100_000, 300_000]) {
        scrollTo(-scrolledTo);
        await settle();
        expectTilesCoverTheWindow();
      }
    });

    it("mounts no tiles once the clip is wholly off screen", async () => {
      await render(600 * 1440, 40);

      scrollTo(-(600 * 1440 + 5_000));
      await settle();

      expect(host.querySelectorAll("img")).toHaveLength(0);
    });

    it("follows the strip when something else moves it, as a drag moves its ghost", async () => {
      await render(600 * 1440, 40);

      left = -430_500;
      reportGapNearScreen();
      await settle();

      expectTilesCoverTheWindow();
    });
  });

  it("issues a single decode job for a narrow clip", async () => {
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "image", url: "blob:poster", aspect: 16 / 9 },
      weight: 128,
    });

    await render(60);

    expect(decodeVideoThumbnail).toHaveBeenCalledTimes(1);
  });

  it("tiles a wide picture at the clip's measured height, whole", async () => {
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "image", url: "blob:wide", aspect: 2.7 },
      weight: 128,
    });

    await render(500, 40);

    expect(host.querySelector("img")?.parentElement?.style.width).toBe("108px");
  });

  it("re-tiles at the height the resize observer reports", async () => {
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "image", url: "blob:wide", aspect: 2.7 },
      weight: 128,
    });
    await render(0, 0);

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    act(() => reportResize(500, 40));
    await act(async () => {
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });

    expect(host.querySelector("img")?.parentElement?.style.width).toBe("108px");
  });

  it("clears the loading shimmer when the scheduled decode fails", async () => {
    vi.mocked(decodeVideoThumbnail).mockRejectedValue(new Error("decode failed"));

    await render();
    await vi.waitFor(() => expect(thumbnailScheduler.getDiagnostics().active).toBe(0));

    expect(host.querySelector(".animate-pulse")).toBeNull();
    expect(host.querySelector("img")).toBeNull();
  });
});

describe("VideoThumbnail during a zoom", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
      weight: 256,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const rest = () =>
    act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });

  it("decodes a clip that scrolls in mid-zoom only once the timeline rests", async () => {
    markTimelineMotion();
    await render(440);
    expect(decodeVideoThumbnail).not.toHaveBeenCalled();
    await rest();
    expect(decodeVideoThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ frameCount: 1 }),
      expect.any(AbortSignal),
    );
  });

  it("shows the strip it has, not the poster, while a zoom's new width decodes", async () => {
    vi.mocked(decodeVideoThumbnail).mockImplementation(async ({ frameCount }) =>
      frameCount === 1
        ? { value: { kind: "image", url: "blob:poster", aspect: 16 / 9 }, weight: 1 }
        : {
            value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
            weight: 2,
          },
    );
    await render(440);
    expect(
      new Set([...host.querySelectorAll("img")].map((img) => img.getAttribute("src"))),
    ).toEqual(new Set(["blob:a", "blob:b"]));
    // The new width's decode never lands during this test.
    vi.mocked(decodeVideoThumbnail).mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      reportResize(880, 40);
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    await rest();
    const shown = [...host.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown).not.toContain("blob:poster");
  });

  it("keeps holding the strip when the clip moves between on and off screen mid-decode", async () => {
    vi.mocked(decodeVideoThumbnail).mockImplementation(async ({ frameCount }) =>
      frameCount === 1
        ? { value: { kind: "image", url: "blob:poster", aspect: 16 / 9 }, weight: 1 }
        : { value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 }, weight: 2 },
    );
    const root = await render(440);
    vi.mocked(decodeVideoThumbnail).mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      reportResize(880, 40);
      vi.advanceTimersToNextFrame();
      root.render(clip(undefined, "overscan"));
      await Promise.resolve();
    });
    await rest();
    expect(new Set(shownSources())).toEqual(new Set(["blob:a", "blob:b"]));
  });

  it("holds the strip, and decodes only the new width, when the cache is over its budget", async () => {
    const disposed: number[] = [];
    vi.mocked(decodeVideoThumbnail).mockImplementation(async ({ frameCount }) =>
      frameCount === 1
        ? { value: { kind: "image", url: "blob:poster", aspect: 16 / 9 }, weight: 1 }
        : {
            value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
            weight: 2,
            dispose: () => disposed.push(frameCount),
          },
    );
    await render(440);
    const held = vi.mocked(decodeVideoThumbnail).mock.calls.at(-1)![0].frameCount;
    // Fill the project's cache past its entry budget, so a strip without a lease is evicted.
    await act(async () => {
      for (let i = 0; i < 100; i++) {
        const lease = thumbnailScheduler.acquire(
          {
            key: `filler-${i}`,
            projectId: "p",
            sessionEpoch: 1,
            kind: "image",
            priority: "visible",
            load: async () => ({
              value: { kind: "image", url: `blob:f${i}`, aspect: 1 },
              weight: 1,
            }),
          },
          () => {},
        );
        for (let tick = 0; tick < 5; tick++) await Promise.resolve();
        lease.release();
      }
    });
    const decodes = vi.mocked(decodeVideoThumbnail).mock.calls.length;
    vi.mocked(decodeVideoThumbnail).mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      reportResize(880, 40);
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    await rest();
    const newWidths = vi
      .mocked(decodeVideoThumbnail)
      .mock.calls.slice(decodes)
      .map(([r]) => r.frameCount);
    expect(newWidths).not.toContain(held);
    expect(disposed).toEqual([]);
    expect(new Set(shownSources())).toEqual(new Set(["blob:a", "blob:b"]));
  });

  it("never holds one clip's strip for another while the other decodes", async () => {
    vi.mocked(decodeVideoThumbnail).mockImplementation(({ source }) =>
      source.endsWith("clip.mp4")
        ? Promise.resolve({
            value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
            weight: 2,
          })
        : new Promise(() => {}),
    );
    const root = await render(440);
    expect(shownSources()).toContain("blob:a");
    await act(async () => {
      root.render(clip("/api/projects/p/preview/assets/other.mp4"));
      await Promise.resolve();
    });
    await rest();
    expect(shownSources()).toEqual([]);
  });

  it("lets go of the strip it held once the clip narrows to one frame", async () => {
    vi.mocked(decodeVideoThumbnail).mockImplementation(async ({ frameCount }) =>
      frameCount === 1
        ? { value: { kind: "image", url: "blob:poster", aspect: 16 / 9 }, weight: 1 }
        : { value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 }, weight: 2 },
    );
    await render(440);
    await act(async () => {
      reportResize(50, 40);
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    await rest();
    expect(new Set(shownSources())).toEqual(new Set(["blob:poster"]));
    // Widening again shows the poster until the new width lands, not the strip it once held.
    vi.mocked(decodeVideoThumbnail).mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      reportResize(880, 40);
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    await rest();
    expect(new Set(shownSources())).toEqual(new Set(["blob:poster"]));
  });

  it("keeps its filmstrip while the zoom resizes it, and decodes the new width at rest", async () => {
    await render(440);
    vi.mocked(decodeVideoThumbnail).mockClear();
    await act(async () => {
      markTimelineMotion();
      reportResize(880, 40);
      vi.advanceTimersToNextFrame();
      await Promise.resolve();
    });
    expect(decodeVideoThumbnail).not.toHaveBeenCalled();
    await rest();
    expect(decodeVideoThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ frameCount: 16 }),
      expect.any(AbortSignal),
    );
  });
});

describe("VideoThumbnail during a trim", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    vi.mocked(decodeVideoThumbnail).mockResolvedValue({
      value: { kind: "filmstrip", urls: ["blob:a", "blob:b"], aspect: 16 / 9 },
      weight: 256,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const trimmed = (duration: number, sourceStart: number) => (
    <VideoThumbnail
      videoSrc="/api/projects/p/preview/assets/clip.mp4"
      label=""
      labelColor="#fff"
      projectId="p"
      sessionEpoch={1}
      duration={duration}
      sourceStart={sourceStart}
      sourceRangeDuration={duration}
    />
  );

  it("keeps its strip through every move of a trim and decodes the new range once at rest", async () => {
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 440 });
    Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
    const root = harness.mount(host);
    await act(async () => {
      root.render(trimmed(10, 0));
      await Promise.resolve();
    });
    vi.mocked(decodeVideoThumbnail).mockClear();
    for (const [duration, start] of [
      [9.5, 0.5],
      [9, 1],
      [8.5, 1.5],
    ] as const) {
      await act(async () => {
        markTimelineMotion();
        root.render(trimmed(duration, start));
        await Promise.resolve();
      });
    }
    expect(decodeVideoThumbnail).not.toHaveBeenCalled();
    await act(async () => {
      vi.runOnlyPendingTimers();
      await Promise.resolve();
    });
    const ranges = vi
      .mocked(decodeVideoThumbnail)
      .mock.calls.map(([r]) => [r.sourceStart, r.sourceRangeDuration]);
    expect(new Set(ranges.map((r) => r.join()))).toEqual(new Set(["1.5,8.5"]));
  });
});
