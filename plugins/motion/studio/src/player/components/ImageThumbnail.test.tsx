// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockResizeObserver, reportResize } from "../../hooks/resizeObserverTestUtils";
import { thumbnailScheduler } from "../lib/thumbnailScheduler";
import { ImageThumbnail } from "./ImageThumbnail";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

// --- Observer stubs: fire "intersecting" immediately on observe ---
class MockIntersectionObserver {
  private cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
  }
  observe() {
    this.cb(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  disconnect() {}
  unobserve() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

// --- Image stub: captures instances so tests fire load/error deterministically ---
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

const originalIO = globalThis.IntersectionObserver;
const originalRO = globalThis.ResizeObserver;
const originalImage = globalThis.Image;

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  globalThis.IntersectionObserver =
    MockIntersectionObserver as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  globalThis.Image = MockImage as unknown as typeof Image;
  MockImage.instances = [];
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.useRealTimers();
  thumbnailScheduler.invalidateProject("p");
  globalThis.IntersectionObserver = originalIO;
  globalThis.ResizeObserver = originalRO;
  globalThis.Image = originalImage;
  document.body.innerHTML = "";
});

function render(props: { imageSrc: string; label?: string; labelColor?: string }) {
  root = createRoot(host);
  act(() => {
    root!.render(
      <ImageThumbnail
        imageSrc={props.imageSrc}
        label={props.label ?? ""}
        labelColor={props.labelColor ?? "#fff"}
        projectId="p"
        sessionEpoch={1}
        priority="visible"
        rich={false}
      />,
    );
  });
}

function lastProbe(): MockImage {
  const probe = MockImage.instances.at(-1);
  expect(probe).toBeDefined();
  return probe!;
}

async function resolveProbe(update: (probe: MockImage) => void): Promise<void> {
  await act(async () => {
    update(lastProbe());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Assert at least one tile rendered and the first tile serves `expectedSrc`. */
function expectFirstTileSrc(expectedSrc: string): void {
  const imgs = [...host.querySelectorAll("img")];
  expect(imgs.length).toBeGreaterThanOrEqual(1);
  expect(imgs[0].getAttribute("src")).toBe(expectedSrc);
}

describe("ImageThumbnail", () => {
  it("shows the loading shimmer before the image resolves", () => {
    render({ imageSrc: "/api/projects/p/preview/assets/pic.png" });
    expect(host.querySelector(".animate-pulse")).not.toBeNull();
    expect(host.querySelectorAll("img").length).toBe(0);
  });

  it("probes the resolved src and renders repeated object-cover tiles on load", async () => {
    render({ imageSrc: "/api/projects/p/preview/assets/pic.png" });
    const probe = lastProbe();
    expect(probe.src).toBe("/api/projects/p/preview/assets/pic.png");

    await resolveProbe((current) => {
      current.naturalWidth = 1920;
      current.naturalHeight = 1080;
      current.onload?.();
    });

    const imgs = [...host.querySelectorAll("img")];
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    for (const img of imgs) {
      expect(img.getAttribute("src")).toBe("/api/projects/p/preview/assets/pic.png");
      expect(img.className).toContain("object-cover");
    }
    expect(host.querySelector(".animate-pulse")).toBeNull();
  });

  it("drops the shimmer and renders no tiles when a raster image fails to load", async () => {
    render({ imageSrc: "/api/projects/p/preview/assets/missing.png" });
    await resolveProbe((probe) => probe.onerror?.());
    expect(host.querySelectorAll("img").length).toBe(0);
    expect(host.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders tiles at 16:9 when an SVG has no intrinsic dimensions (naturalWidth=0)", async () => {
    render({ imageSrc: "/api/projects/p/preview/assets/logo.svg" });
    const probe = lastProbe();

    await resolveProbe(() => {
      // naturalWidth stays 0 — SVG with no width/height attribute
      probe.onload?.();
    });

    expectFirstTileSrc("/api/projects/p/preview/assets/logo.svg");
    expect(host.querySelector(".animate-pulse")).toBeNull();
  });

  it("renders SVG tiles at 16:9 fallback even when the probe fires onerror", async () => {
    // Some browser/sandbox environments fire onerror for SVGs even though the
    // <img> element itself can render the file — we must not blank the strip.
    render({ imageSrc: "/api/projects/p/preview/assets/icon.svg" });

    await resolveProbe((probe) => probe.onerror?.());

    expectFirstTileSrc("/api/projects/p/preview/assets/icon.svg");
    expect(host.querySelector(".animate-pulse")).toBeNull();
  });

  it("tiles a wide picture at the clip's measured height, whole", async () => {
    Object.defineProperty(host, "clientWidth", { configurable: true, value: 500 });
    Object.defineProperty(host, "clientHeight", { configurable: true, value: 40 });
    render({ imageSrc: "/api/projects/p/preview/assets/wide.png" });
    await resolveProbe((probe) => {
      probe.naturalWidth = 2700;
      probe.naturalHeight = 1000;
      probe.onload?.();
    });

    expect(host.querySelector("img")?.parentElement?.style.width).toBe("108px");
  });

  it("re-tiles at the height the resize observer reports", async () => {
    render({ imageSrc: "/api/projects/p/preview/assets/wide.png" });
    await resolveProbe((probe) => {
      probe.naturalWidth = 2700;
      probe.naturalHeight = 1000;
      probe.onload?.();
    });

    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    act(() => reportResize(500, 40));
    act(() => vi.advanceTimersToNextFrame());

    expect(host.querySelector("img")?.parentElement?.style.width).toBe("108px");
  });

  it("renders the label above the strip when provided", async () => {
    render({ imageSrc: "/x.png", label: "hero", labelColor: "#abc" });
    await resolveProbe((probe) => {
      probe.naturalWidth = 100;
      probe.naturalHeight = 100;
      probe.onload?.();
    });
    const label = [...host.querySelectorAll("span")].find((s) => s.textContent === "hero");
    expect(label).toBeDefined();
    expect(label!.closest(".z-10")).not.toBeNull();
  });
});
