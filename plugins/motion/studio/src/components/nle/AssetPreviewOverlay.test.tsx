// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { usePlayerStore } from "../../player/store/playerStore";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { AssetPreviewOverlay } from "./AssetPreviewOverlay";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  // reset() does not cover the out-of-loop seek request; clear it explicitly
  // so a pending-seek test can't leak into the next one.
  usePlayerStore.getState().clearSeekRequest();
  useAssetPreviewStore.getState().clearPreviewAsset();
});

function mountOverlay(): void {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<AssetPreviewOverlay />);
  });
}

describe("AssetPreviewOverlay playback dismissal", () => {
  it("dismisses immediately when opened while playback is ALREADY running", () => {
    // The RAF playback loop bypasses the store, so no post-open store change
    // will arrive — the dismiss check must be level-triggered, not edge-triggered.
    usePlayerStore.setState({ isPlaying: true });
    mountOverlay();

    act(() => {
      useAssetPreviewStore.getState().setPreviewAsset("assets/clip.mp3", "p1");
    });

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("dismisses immediately when opened while a seek is ALREADY in flight", () => {
    // A pending out-of-loop seek (requestedSeekTime set, not yet consumed) may
    // produce no further store change before currentTime settles — the on-open
    // check must evaluate the full shared dismiss predicate, not just isPlaying.
    usePlayerStore.setState({ isPlaying: false, requestedSeekTime: 3.2 });
    mountOverlay();

    act(() => {
      useAssetPreviewStore.getState().setPreviewAsset("assets/clip.mp3", "p1");
    });

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("stays open when the playhead is idle", () => {
    mountOverlay();

    act(() => {
      useAssetPreviewStore.getState().setPreviewAsset("assets/clip.mp3", "p1");
    });

    expect(useAssetPreviewStore.getState().previewAsset).toBe("assets/clip.mp3");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("still dismisses when playback starts AFTER the preview opened", () => {
    mountOverlay();

    act(() => {
      useAssetPreviewStore.getState().setPreviewAsset("assets/clip.mp3", "p1");
    });
    expect(useAssetPreviewStore.getState().previewAsset).toBe("assets/clip.mp3");

    act(() => {
      usePlayerStore.setState({ isPlaying: true });
    });

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
  });

  it("still dismisses when the playhead is scrubbed after opening", () => {
    usePlayerStore.setState({ currentTime: 2 });
    mountOverlay();

    act(() => {
      useAssetPreviewStore.getState().setPreviewAsset("assets/clip.mp3", "p1");
    });

    act(() => {
      usePlayerStore.setState({ currentTime: 4.5 });
    });

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
  });
});
