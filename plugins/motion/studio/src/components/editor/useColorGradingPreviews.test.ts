// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeHfColorGrading } from "@hyperframes/core/color-grading";
import { usePreviewIframeStore } from "../../player/store/previewIframeStore";
import { useColorGradingPreviews } from "./useColorGradingPreviews";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  usePreviewIframeStore.setState({ iframe: null });
  document.body.innerHTML = "";
});

function createFrame() {
  return document.body.appendChild(document.createElement("iframe"));
}

function installRenderer(iframe: HTMLIFrameElement) {
  const renderPreviews = vi.fn().mockResolvedValue({
    width: 160,
    height: 90,
    images: [{ id: "bright-pop", dataUrl: "data:image/png;base64,x" }],
  });
  (iframe.contentWindow as unknown as { __hf: unknown }).__hf = {
    colorGrading: { renderPreviews },
  };
  return renderPreviews;
}

describe("useColorGradingPreviews after the preview iframe is replaced", () => {
  it("requests preset previews from the new iframe's runtime", async () => {
    vi.useFakeTimers();
    const a = createFrame();
    const b = createFrame();
    const renderOnB = installRenderer(b);
    const ref = { current: a as HTMLIFrameElement | null };
    usePreviewIframeStore.getState().setIframe(a);
    const grading = normalizeHfColorGrading({ preset: "neutral" });
    if (!grading) throw new Error("expected neutral grading");
    const gradingRef = { current: grading };
    const target = { selector: "#v" } as never;
    const postColorGrading = vi.fn();
    let requestPresetPreviews: () => void = () => {};
    function Host() {
      requestPresetPreviews = useColorGradingPreviews({
        grading,
        gradingRef,
        identityKey: "k",
        target,
        previewIframeRef: ref,
        postColorGrading,
      }).requestPresetPreviews;
      return null;
    }
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    act(() => root.render(React.createElement(Host)));
    act(() => requestPresetPreviews());
    act(() => vi.advanceTimersByTime(0));

    act(() => {
      ref.current = b;
      usePreviewIframeStore.getState().setIframe(b);
    });
    act(() => vi.advanceTimersByTime(0));
    await act(async () => {
      await Promise.resolve();
    });

    expect(renderOnB).toHaveBeenCalled();
    act(() => root.unmount());
    vi.useRealTimers();
  });
});
