// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockResizeObserver, reportResize } from "../../hooks/resizeObserverTestUtils";
import { thumbnailScheduler } from "../lib/thumbnailScheduler";
import { buildCompositionThumbnailUrl, CompositionThumbnail } from "./CompositionThumbnail";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

class MockImage {
  static instances: MockImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  src = "";

  constructor() {
    MockImage.instances.push(this);
  }
}

const originalResizeObserver = globalThis.ResizeObserver;
const originalImage = globalThis.Image;
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  globalThis.Image = MockImage as unknown as typeof Image;
  globalThis.fetch = vi.fn(async () => new Response(new Blob(["thumbnail"]), { status: 200 }));
  URL.createObjectURL = vi.fn(() => "blob:composition-thumbnail");
  URL.revokeObjectURL = vi.fn();
  MockImage.instances = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  thumbnailScheduler.invalidateProject("/api/projects/demo/preview");
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.Image = originalImage;
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
  document.body.replaceChildren();
});

describe("buildCompositionThumbnailUrl", () => {
  it("includes selector and occurrence index for precise element thumbnails", () => {
    expect(
      buildCompositionThumbnailUrl({
        previewUrl: "/api/projects/demo/preview",
        seekTime: 1,
        duration: 2,
        selector: ".card",
        selectorIndex: 2,
        origin: "http://localhost:3000",
      }),
    ).toBe(
      "http://localhost:3000/api/projects/demo/thumbnail/index.html?t=2.00&v=v3&revision=0&selector=.card&selectorIndex=2",
    );
  });

  it("asks for source density only when a caller opts in", () => {
    const base = {
      previewUrl: "/api/projects/demo/preview",
      seekTime: 1,
      duration: 0,
      origin: "http://localhost:3000",
    };

    expect(buildCompositionThumbnailUrl(base)).not.toContain("output=");
    expect(buildCompositionThumbnailUrl({ ...base, output: "source" })).toContain("output=source");
  });

  it("includes the persisted content revision in the cache identity", () => {
    const url = buildCompositionThumbnailUrl({
      previewUrl: "/api/projects/demo/preview",
      origin: "http://localhost:3000",
      contentRevision: 7,
    });

    expect(new URL(url).searchParams.get("revision")).toBe("7");
  });
});

describe("CompositionThumbnail", () => {
  async function renderThumbnail(): Promise<MockImage> {
    root = createRoot(host);
    await act(async () => {
      root!.render(
        React.createElement(CompositionThumbnail, {
          previewUrl: "/api/projects/demo/preview",
          label: "",
          labelColor: "#fff",
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const probe = MockImage.instances[0];
    if (!probe) throw new Error("Expected an image probe");
    return probe;
  }

  it("renders visible tiles after the scheduled off-DOM probe loads", async () => {
    const probe = await renderThumbnail();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/projects/demo/thumbnail/index.html"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(probe.src).toBe("blob:composition-thumbnail");

    await act(async () => {
      probe.naturalWidth = 1920;
      probe.naturalHeight = 1080;
      probe.onload?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const tiles = [...host.querySelectorAll("img")];
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((tile) => !tile.classList.contains("hidden"))).toBe(true);
    // Pictures read untinted by default, like video filmstrips; the theme tokens own any dimming.
    expect(
      tiles.every((tile) => tile.style.opacity === "var(--timeline-composition-thumbnail-opacity)"),
    ).toBe(true);
    expect(tiles[0]?.parentElement?.parentElement?.style.mixBlendMode).toBe(
      "var(--timeline-composition-thumbnail-blend)",
    );
  });

  it.each([
    { name: "a wide", width: 2700, height: 1000, tileWidth: 108 },
    { name: "a square", width: 1000, height: 1000, tileWidth: 48 },
    { name: "a portrait", width: 1080, height: 1920, tileWidth: 48 },
  ])(
    "shows $name picture whole at the clip's measured height",
    async ({ width, height, tileWidth }) => {
      Object.defineProperty(host, "clientWidth", { configurable: true, value: 500 });
      Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
      const probe = await renderThumbnail();

      await act(async () => {
        probe.naturalWidth = width;
        probe.naturalHeight = height;
        probe.onload?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      const img = host.querySelector("img")!;
      expect(img.parentElement?.style.width).toBe(`${tileWidth}px`);
      // A tile held at its minimum width letterboxes the picture instead of cropping it.
      expect(img.classList.contains("object-contain")).toBe(true);
    },
  );

  it("re-tiles at the height the resize observer reports", async () => {
    const probe = await renderThumbnail();
    await act(async () => {
      probe.naturalWidth = 2700;
      probe.naturalHeight = 1000;
      probe.onload?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    act(() => reportResize(500, 40));
    act(() => vi.advanceTimersToNextFrame());

    expect(host.querySelector("img")?.parentElement?.style.width).toBe("108px");
  });

  it("aborts its scheduled off-DOM image probe when unmounted", async () => {
    const probe = await renderThumbnail();
    expect(host.querySelector("img")).toBeNull();
    expect(probe.src).toBe("blob:composition-thumbnail");

    await act(async () => {
      root?.unmount();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    root = null;

    expect(probe.onload).toBeNull();
    expect(probe.onerror).toBeNull();
    expect(probe.src).toBe("");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:composition-thumbnail");
  });

  it("releases the old request and ignores its late result when persisted content changes", async () => {
    const signals: AbortSignal[] = [];
    const resolveFetches: Array<(response: Response) => void> = [];
    globalThis.fetch = vi.fn((_url, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((resolve) => resolveFetches.push(resolve));
    });
    root = createRoot(host);

    await act(async () => {
      root!.render(
        React.createElement(CompositionThumbnail, {
          previewUrl: "/api/projects/demo/preview",
          label: "",
          labelColor: "#fff",
          projectId: "demo",
          contentRevision: 0,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      root!.render(
        React.createElement(CompositionThumbnail, {
          previewUrl: "/api/projects/demo/preview",
          label: "",
          labelColor: "#fff",
          projectId: "demo",
          contentRevision: 1,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]).toContain(
      "revision=1",
    );

    await act(async () => {
      resolveFetches[0]?.(new Response(new Blob(["stale"]), { status: 200 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(MockImage.instances).toHaveLength(0);

    await act(async () => {
      resolveFetches[1]?.(new Response(new Blob(["fresh"]), { status: 200 }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(MockImage.instances).toHaveLength(1);
    expect(MockImage.instances[0]?.src).toBe("blob:composition-thumbnail");
  });
});
