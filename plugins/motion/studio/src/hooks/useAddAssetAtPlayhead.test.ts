// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore } from "../player";
import { useAddAssetAtPlayhead } from "./useAddAssetAtPlayhead";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useAddAssetAtPlayhead", () => {
  it("drops the asset on track 0 at the current playhead time", () => {
    usePlayerStore.getState().setCurrentTime(4.5);
    const handleTimelineAssetDrop = vi.fn();
    let addAsset: (assetPath: string) => unknown = () => undefined;

    function Harness() {
      addAsset = useAddAssetAtPlayhead(handleTimelineAssetDrop);
      return null;
    }

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(Harness));
    });

    act(() => {
      addAsset("assets/clip.mp4");
    });

    expect(handleTimelineAssetDrop).toHaveBeenCalledWith("assets/clip.mp4", {
      start: 4.5,
      track: 0,
    });

    act(() => root.unmount());
  });
});
