// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioEditLifecycle, type StudioWriteResult } from "../../webmcp/writeCoordinator";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import { announcePreviewDocumentLoaded } from "../../player/sceneSwap";
import { TopologyLens } from "./TopologyLens";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const geometryMock = vi.hoisted(() => ({ measure: vi.fn() }));
vi.mock("./topologyLensGeometry", () => ({
  measureTopologyLensGeometry: geometryMock.measure,
}));

const target = { handle: "dom:target", sourceFile: "index.html" };
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let iframe: HTMLIFrameElement | null = null;

function matchMedia(reducedMotion: boolean): typeof window.matchMedia {
  return vi.fn().mockReturnValue({
    matches: reducedMotion,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

function mount(reducedMotion = false, strictMode = false): void {
  window.matchMedia = matchMedia(reducedMotion);
  host = document.createElement("div");
  iframe = document.createElement("iframe");
  document.body.append(host, iframe);
  root = createRoot(host);
  act(() => {
    const lens = (
      <TopologyLens iframeRef={{ current: iframe }} activeCompositionPath="index.html" />
    );
    root?.render(strictMode ? <React.StrictMode>{lens}</React.StrictMode> : lens);
  });
}

function begin(): string {
  let callId = "";
  act(() => {
    callId = studioEditLifecycle.begin("project-a", target, "set-text");
  });
  return callId;
}

function finish(
  callId: string,
  stage: "dispatched" | "saved" | "verified" | "failed",
  changed = true,
): void {
  const result: StudioWriteResult<object> =
    stage === "failed"
      ? {
          ok: false,
          kind: "failed",
          reason: "save failed",
          stage,
          target,
          operation: "set-text",
        }
      : {
          ok: true,
          stage,
          target,
          operation: "set-text",
          changed,
          evidence:
            stage === "dispatched"
              ? { kind: "dispatch", followUp: "studio_inspect" }
              : { kind: "content-version", sourceFile: "index.html", version: "v1" },
        };
  act(() => studioEditLifecycle.finish(callId, result));
}

beforeEach(() => {
  vi.useFakeTimers();
  geometryMock.measure.mockReset().mockReturnValue({
    field: {
      label: "section",
      rect: { left: 5, top: 10, width: 320, height: 180, editScaleX: 1, editScaleY: 1 },
    },
    target: {
      label: "h1",
      rect: { left: 10, top: 20, width: 200, height: 100, editScaleX: 1, editScaleY: 1 },
    },
    contours: [
      {
        label: "p",
        rect: { left: 20, top: 30, width: 80, height: 20, editScaleX: 1, editScaleY: 1 },
      },
      {
        label: "aside",
        rect: { left: 110, top: 30, width: 60, height: 50, editScaleX: 1, editScaleY: 1 },
      },
    ],
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  act(() => vi.runOnlyPendingTimers());
  root = null;
  host = null;
  iframe = null;
  studioEditLifecycle.reset();
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("TopologyLens", () => {
  it("reveals real contours for a new target and seals only a durable receipt", () => {
    mount();
    const callId = begin();

    expect(host?.querySelector('[data-topology-lens="acquiring"]')).not.toBeNull();
    expect(
      host?.querySelector('[data-topology-field="true"][data-topology-node="section"]'),
    ).not.toBeNull();
    expect(host?.querySelector('[data-topology-target][data-topology-node="h1"]')).not.toBeNull();
    expect(host?.querySelectorAll('[data-topology-contour="true"]')).toHaveLength(2);
    expect(
      [...(host?.querySelectorAll<HTMLElement>("[data-topology-contour]") ?? [])].map(
        (element) => element.dataset.topologyNode,
      ),
    ).toEqual(["p", "aside"]);
    expect(host?.querySelector('[data-topology-scan="true"]')).not.toBeNull();

    finish(callId, "saved");
    expect(host?.querySelector('[data-topology-lens="sealing"]')).not.toBeNull();
    expect(
      host
        ?.querySelector('[data-topology-field][data-topology-phase="sealing"]')
        ?.querySelector('[data-topology-seal="saved"]'),
    ).not.toBeNull();
    expect(host?.querySelector("[data-topology-target] [data-topology-seal]")).toBeNull();
    expect(geometryMock.measure).toHaveBeenCalledTimes(2);

    act(() => vi.advanceTimersByTime(240));
    expect(host?.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();
    expect(studioEditLifecycle.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("remeasures the post-write target before drawing the persistence seal", () => {
    geometryMock.measure
      .mockReturnValueOnce({
        field: {
          label: "section",
          rect: { left: 5, top: 10, width: 300, height: 180, editScaleX: 1, editScaleY: 1 },
        },
        target: {
          label: "h1",
          rect: { left: 10, top: 20, width: 200, height: 100, editScaleX: 1, editScaleY: 1 },
        },
        contours: [],
      })
      .mockReturnValueOnce({
        field: {
          label: "section",
          rect: { left: 50, top: 20, width: 360, height: 220, editScaleX: 1, editScaleY: 1 },
        },
        target: {
          label: "h1",
          rect: { left: 70, top: 40, width: 240, height: 120, editScaleX: 1, editScaleY: 1 },
        },
        contours: [],
      });
    mount();
    const callId = begin();
    expect(host?.querySelector<HTMLElement>("[data-topology-target]")?.style.left).toBe("10px");

    finish(callId, "verified");

    const sealedTarget = host?.querySelector<HTMLElement>("[data-topology-target]");
    expect(sealedTarget?.style.left).toBe("70px");
    expect(sealedTarget?.style.width).toBe("240px");
    expect(host?.querySelector('[data-topology-seal="verified"]')).not.toBeNull();
  });

  it("skips acquisition when the coordinator identifies a repeated target", () => {
    mount();
    const firstCall = begin();
    finish(firstCall, "saved");
    act(() => vi.advanceTimersByTime(240));

    begin();

    expect(host?.querySelector('[data-topology-lens="localizing"]')).not.toBeNull();
    expect(host?.querySelector('[data-topology-contour="true"]')).toBeNull();
  });

  it.each(["dispatched", "failed"] as const)("retracts %s without a seal", (stage) => {
    mount();
    const callId = begin();

    finish(callId, stage);

    expect(host?.querySelector('[data-topology-lens="localizing"]')).not.toBeNull();
    expect(host?.querySelector("[data-topology-seal]")).toBeNull();
    act(() => vi.advanceTimersByTime(180));
    expect(host?.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();
    expect(studioEditLifecycle.getSnapshot()).toEqual({ phase: "idle" });
  });

  it.each(["saved", "verified"] as const)("retracts a %s no-op without a seal", (stage) => {
    mount();
    const callId = begin();

    finish(callId, stage, false);

    expect(host?.querySelector('[data-topology-lens="localizing"]')).not.toBeNull();
    expect(host?.querySelector('[data-topology-terminal="no-change"]')).not.toBeNull();
    expect(host?.querySelector("[data-topology-seal]")).toBeNull();
    act(() => vi.advanceTimersByTime(180));
    expect(host?.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();
  });

  it("does not replay a terminal seal after the overlay remounts", () => {
    mount();
    const callId = begin();
    finish(callId, "saved");
    act(() => vi.advanceTimersByTime(240));
    expect(studioEditLifecycle.getSnapshot()).toEqual({ phase: "idle" });

    act(() => root?.unmount());
    root = null;
    host?.remove();
    iframe?.remove();
    mount();

    expect(host?.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();
    expect(host?.querySelector("[data-topology-seal]")).toBeNull();
  });

  it("keeps an active invocation through StrictMode effect replay", () => {
    const callId = begin();

    mount(false, true);
    act(() => vi.advanceTimersByTime(0));

    expect(studioEditLifecycle.getSnapshot()).toMatchObject({
      callId,
      phase: "dispatching",
    });
    expect(host?.querySelector('[data-topology-lens="acquiring"]')).not.toBeNull();
  });

  it("clears on iframe reload and project switch", () => {
    mount();
    begin();

    act(() => announcePreviewDocumentLoaded(iframe!));
    expect(host?.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();

    begin();
    act(() => studioEditLifecycle.activateProject("project-b"));
    expect(host?.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();
  });

  it("removes spatial travel in reduced motion while preserving target state", () => {
    mount(true);
    begin();

    expect(host?.querySelector('[data-topology-lens="acquiring"]')).not.toBeNull();
    expect(host?.querySelector('[data-topology-contour="true"]')).not.toBeNull();
    expect(host?.querySelector('[data-topology-scan="true"]')).toBeNull();
  });

  it("cleans its timer and iframe listener on unmount", () => {
    mount();
    const removeListener = vi.spyOn(iframe!, "removeEventListener");
    begin();
    expect(vi.getTimerCount()).toBe(1);

    act(() => root?.unmount());
    root = null;

    expect(vi.getTimerCount()).toBe(1);
    expect(removeListener).toHaveBeenCalledWith("hf-preview-document-loaded", expect.any(Function));
    expect(studioEditLifecycle.getSnapshot()).toMatchObject({ phase: "dispatching" });
    act(() => vi.advanceTimersByTime(0));
    expect(vi.getTimerCount()).toBe(0);
    expect(studioEditLifecycle.getSnapshot()).toEqual({ phase: "idle" });
  });

  it("dismisses on the promoted iframe's load, not the replaced one", () => {
    const a = document.createElement("iframe");
    const b = document.createElement("iframe");
    document.body.append(a, b);
    const ref = { current: a as HTMLIFrameElement | null };
    usePreviewIframeStore.setState({ iframe: a });
    window.matchMedia = matchMedia(false);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(<TopologyLens iframeRef={ref} activeCompositionPath="index.html" />);
    });
    begin();

    act(() => {
      ref.current = b;
      usePreviewIframeStore.getState().setIframe(b);
    });
    act(() => announcePreviewDocumentLoaded(a));
    expect(host.querySelector('[data-topology-lens="hidden"]')).toBeNull();

    act(() => announcePreviewDocumentLoaded(b));
    expect(host.querySelector('[data-topology-lens="hidden"]')).not.toBeNull();
    usePreviewIframeStore.setState({ iframe: null });
  });
});
