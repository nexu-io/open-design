// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MotionPathOverlay } from "./MotionPathOverlay";
import { usePlayerStore } from "../../player/store/playerStore";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import type { DomEditSelection } from "./domEditing";
import { commitCreatePath } from "./motionPathCommit";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

vi.mock("../../contexts/DomEditContext", () => ({
  useDomEditContext: () => ({ selectedGsapAnimations: [] }),
}));
vi.mock("./motionPathCommit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./motionPathCommit")>()),
  commitCreatePath: vi.fn(),
}));
vi.mock("./motionPathSelection", () => ({
  selectorFor: () => "#box",
  editableAnimationId: () => null,
}));
vi.mock("./useMotionPathData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useMotionPathData")>()),
  useMotionPathData: () => ({
    rect: null,
    geometry: null,
    geometryResolved: true,
    visibleInPreview: true,
    home: null,
    pScale: 1,
  }),
}));

it("re-evaluates set-destination availability when a reload swaps the live iframe", () => {
  const host = document.createElement("div");
  const before = document.createElement("iframe");
  const after = document.createElement("iframe");
  document.body.append(host, before, after);
  Reflect.set(after.contentWindow as object, "MotionPathPlugin", {});
  const ref = { current: before };
  const root = createRoot(host);
  const selection = { element: document.createElement("div") } as unknown as DomEditSelection;
  try {
    act(() => usePreviewIframeStore.getState().setIframe(before));
    act(() =>
      root.render(
        <MotionPathOverlay
          iframeRef={ref}
          selection={selection}
          compositionSize={{ width: 1920, height: 1080 }}
          isPlaying={false}
        />,
      ),
    );
    expect(usePlayerStore.getState().motionPathCreateAvailable).toBe(false);

    act(() => {
      usePreviewIframeStore.getState().setIframe(after);
    });
    expect(usePlayerStore.getState().motionPathCreateAvailable).toBe(true);
  } finally {
    act(() => root.unmount());
    usePreviewIframeStore.setState({ iframe: null });
    host.remove();
    before.remove();
    after.remove();
  }
});

it("sets a destination on a layer whichever window built its node", () => {
  const host = document.createElement("div");
  const surface = document.createElement("div");
  surface.setAttribute("data-preview-pan-surface", "");
  const frame = document.createElement("iframe");
  document.body.append(host, surface, frame);
  Reflect.set(frame.contentWindow as object, "MotionPathPlugin", {});
  frame.getBoundingClientRect = () => new DOMRect(0, 0, 1920, 1080);
  // As on the loads that hid the path, the layer's node carries the editor window's prototypes.
  const box = document.createElement("div");
  box.id = "box";
  frame.contentDocument!.body.append(box);
  const root = createRoot(host);
  const selection = { element: box } as unknown as DomEditSelection;
  try {
    act(() => usePreviewIframeStore.getState().setIframe(frame));
    act(() =>
      root.render(
        <MotionPathOverlay
          iframeRef={{ current: frame }}
          selection={selection}
          compositionSize={{ width: 1920, height: 1080 }}
          isPlaying={false}
        />,
      ),
    );
    act(() => usePlayerStore.getState().setMotionPathArmed(true));
    const press = { bubbles: true, button: 0, clientX: 100, clientY: 100 };
    act(() => void surface.dispatchEvent(new PointerEvent("pointerdown", press)));
    expect(commitCreatePath).toHaveBeenCalledTimes(1);
  } finally {
    act(() => usePlayerStore.getState().setMotionPathArmed(false));
    act(() => root.unmount());
    usePreviewIframeStore.setState({ iframe: null });
    host.remove();
    surface.remove();
    frame.remove();
  }
});
