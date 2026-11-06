// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayerStore, type TimelineElement } from "../../player/store/playerStore";
import { useAssetPreviewStore } from "../../utils/assetPreviewStore";
import { AssetCard } from "./AssetCard";
import { AudioRow } from "./AudioRow";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = "";
  usePlayerStore.getState().reset();
  useAssetPreviewStore.getState().clearPreviewAsset();
  vi.restoreAllMocks();
});

function mount(node: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
  return host;
}

function clip(input: Partial<TimelineElement> & { id: string; src: string }): TimelineElement {
  return { tag: "div", start: 0, duration: 5, track: 0, ...input };
}

/** Simulate a drag-free click: pointerdown + pointerup at the same point. */
function clickCard(host: HTMLElement): void {
  const card = host.querySelector('[draggable="true"]');
  if (!card) throw new Error("Expected a draggable card root");
  const PointerCtor = (window as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  act(() => {
    card.dispatchEvent(new PointerCtor("pointerdown", { bubbles: true, clientX: 5, clientY: 5 }));
    card.dispatchEvent(new PointerCtor("pointerup", { bubbles: true, clientX: 5, clientY: 5 }));
  });
}

describe("AssetCard click behavior", () => {
  const cardProps = {
    projectId: "p1",
    onCopy: vi.fn(),
    copyFeedback: null,
  };

  it("clears an open preview overlay when clicking an already-added asset (reveal branch)", () => {
    usePlayerStore.getState().setElements([clip({ id: "img1", src: "assets/logo.png" })]);
    // Preview overlay is open on ANOTHER asset — the reveal must dismiss it,
    // or it stays stuck over the canvas while the timeline reveals the clip.
    useAssetPreviewStore.getState().setPreviewAsset("assets/other.png", "p1");

    const host = mount(<AssetCard {...cardProps} asset="assets/logo.png" used />);
    clickCard(host);

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
    expect(usePlayerStore.getState().selectedElementId).toBe("img1");
  });

  it("opens the preview overlay for a not-yet-added asset", () => {
    const host = mount(<AssetCard {...cardProps} asset="assets/logo.png" used={false} />);
    clickCard(host);

    expect(useAssetPreviewStore.getState().previewAsset).toBe("assets/logo.png");
    expect(useAssetPreviewStore.getState().previewProjectId).toBe("p1");
  });
});

describe("AudioRow click behavior", () => {
  const rowProps = {
    projectId: "p1",
    onCopy: vi.fn(),
    copyFeedback: null,
  };

  it("clears an open preview overlay when clicking an already-added audio asset (reveal branch)", () => {
    usePlayerStore
      .getState()
      .setElements([clip({ id: "bgm1", tag: "audio", src: "assets/bgm.mp3" })]);
    useAssetPreviewStore.getState().setPreviewAsset("assets/other.mp3", "p1");

    const host = mount(<AudioRow {...rowProps} asset="assets/bgm.mp3" used />);
    clickCard(host);

    expect(useAssetPreviewStore.getState().previewAsset).toBeNull();
    expect(usePlayerStore.getState().selectedElementId).toBe("bgm1");
  });

  it("opens the preview overlay for a not-yet-added audio asset", () => {
    const host = mount(<AudioRow {...rowProps} asset="assets/bgm.mp3" used={false} />);
    clickCard(host);

    expect(useAssetPreviewStore.getState().previewAsset).toBe("assets/bgm.mp3");
  });
});
