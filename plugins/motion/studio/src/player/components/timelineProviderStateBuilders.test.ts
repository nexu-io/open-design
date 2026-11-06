// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import {
  buildTimelineMeta,
  resolveResizingElementIds,
  shouldIgnoreTimelinePointerDown,
  type TimelineMetaBuilderInputs,
} from "./timelineProviderStateBuilders";

function inputs(overrides: Partial<TimelineMetaBuilderInputs> = {}): TimelineMetaBuilderInputs {
  return {
    emptyState: {} as TimelineMetaBuilderInputs["emptyState"],
    container: {
      ref: vi.fn(),
      "aria-label": "Timeline track view",
      "data-timeline-element-count": 2,
      isDragOver: false,
      activeTool: "select",
      shiftHeld: false,
      accentClass: "ring",
      onMouseMove: vi.fn(),
      onMouseLeave: vi.fn(),
      style: {},
    },
    viewport: {
      ref: vi.fn(),
      tabIndex: -1,
      labelMode: false,
      contentOrigin: 80,
      zoomMode: "fit",
      onScroll: vi.fn(),
      onFocus: vi.fn(),
      onBlur: vi.fn(),
      onDragOver: vi.fn(),
      onDragLeave: vi.fn(),
      onDrop: vi.fn(),
      onPointerDown: vi.fn(),
      onPointerMove: vi.fn(),
      onPointerUp: vi.fn(),
      onPointerCancel: vi.fn(),
      onLostPointerCapture: vi.fn(),
    },
    elementCount: 2,
    labelColumnWidth: 120,
    razorGuide: null,
    ...overrides,
  };
}

describe("buildTimelineMeta", () => {
  it("uses the razor branch for the container class", () => {
    const meta = buildTimelineMeta(
      inputs({
        container: {
          ...inputs().container,
          activeTool: "razor",
        },
      }),
    );
    expect(meta.containerProps.className).toContain("cursor-crosshair");
  });

  it("uses the shift branch for the container class", () => {
    const meta = buildTimelineMeta(
      inputs({ container: { ...inputs().container, shiftHeld: true } }),
    );
    expect(meta.containerProps.className).toContain("cursor-crosshair");
  });

  it("uses the default container class without an accent", () => {
    const meta = buildTimelineMeta(inputs());
    expect(meta.containerProps.className).toContain("cursor-default");
    expect(meta.containerProps.className).not.toContain("ring");
  });

  it("uses the label-column inset only in label mode", () => {
    const fit = buildTimelineMeta(inputs());
    const labels = buildTimelineMeta(
      inputs({ viewport: { ...inputs().viewport, labelMode: true } }),
    );
    expect(fit.viewportProps["data-timeline-auto-scroll-left-inset"]).toBe(0);
    expect(labels.viewportProps["data-timeline-auto-scroll-left-inset"]).toBe(120);
  });
});

describe("timeline provider branch helpers", () => {
  it("resolves resizing element ids", () => {
    expect(resolveResizingElementIds(null)).toBeUndefined();
    expect(resolveResizingElementIds({ element: { id: "clip" } } as never)).toEqual(["clip"]);
    expect(resolveResizingElementIds({ groupPreview: [{ key: "group::clip" }] } as never)).toEqual([
      "group::clip",
    ]);
  });

  it("ignores pointer downs on interactive descendants only", () => {
    const button = document.createElement("button");
    const div = document.createElement("div");
    expect(shouldIgnoreTimelinePointerDown(button)).toBe(true);
    expect(shouldIgnoreTimelinePointerDown(div)).toBe(false);
    expect(shouldIgnoreTimelinePointerDown(null)).toBe(false);
  });
});
