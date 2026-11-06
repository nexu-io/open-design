// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GridOverlay } from "./GridOverlay";
import { PreviewOverlayProvider } from "./PreviewOverlayProvider";
import { SnapToolbar } from "./SnapToolbar";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import { usePlayerStore } from "../../player/store/playerStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  usePreviewIframeStore.getState().setIframe(null);
});

function compositionFrame() {
  const iframe = document.createElement("iframe");
  iframe.getBoundingClientRect = () => new DOMRect(12, 18, 640, 360);
  const root = iframe.contentDocument?.createElement("div");
  root?.setAttribute("data-composition-id", "main");
  root?.setAttribute("data-width", "1280");
  root?.setAttribute("data-height", "720");
  if (root) iframe.contentDocument?.body.append(root);
  document.body.append(iframe);
  return iframe;
}

beforeEach(() => {
  usePlayerStore.setState({ previewBooted: true });
});

describe("PreviewOverlayProvider", () => {
  it("derives grid geometry after the iframe prop becomes available", async () => {
    window.localStorage.setItem(
      "hf-studio-ui-preferences",
      JSON.stringify({ gridVisible: true, gridSpacing: 20 }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <PreviewOverlayProvider iframe={null}>
          <GridOverlay />
        </PreviewOverlayProvider>,
      );
    });
    expect(host.querySelector('[aria-hidden="true"]')).not.toBeNull();

    const iframe = compositionFrame();
    act(() => {
      root.render(
        <PreviewOverlayProvider iframe={iframe}>
          <GridOverlay />
        </PreviewOverlayProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    const grid = host.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect([grid?.style.left, grid?.style.top, grid?.style.width, grid?.style.height]).toEqual([
      "12px",
      "18px",
      "640px",
      "360px",
    ]);
    expect(grid?.style.backgroundSize).toBe("20px 20px");
    act(() => root.unmount());
  });

  it("does not clear an iframe store entry owned elsewhere on unmount", () => {
    const ownerIframe = compositionFrame();
    usePreviewIframeStore.getState().setIframe(ownerIframe);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <PreviewOverlayProvider iframe={null}>
          <GridOverlay />
        </PreviewOverlayProvider>,
      );
    });
    act(() => root.unmount());

    expect(usePreviewIframeStore.getState().iframe).toBe(ownerIframe);
  });

  it("lets presses reach the preview beneath it, except on children that opt in", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <PreviewOverlayProvider iframe={null}>
          <SnapToolbar />
        </PreviewOverlayProvider>,
      );
    });

    const layer = host.firstElementChild;
    expect(layer?.classList.contains("pointer-events-none")).toBe(true);
    expect(layer?.firstElementChild?.classList.contains("pointer-events-auto")).toBe(true);
    act(() => root.unmount());
  });
});
