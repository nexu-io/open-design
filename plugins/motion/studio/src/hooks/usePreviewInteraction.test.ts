// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import { usePlayerStore } from "../player";
import { installReactActEnvironment, makeSelection } from "./domSelectionTestHarness";
import { usePreviewInteraction } from "./usePreviewInteraction";

installReactActEnvironment();

function createPreviewIframe(playerPause?: () => void): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  if (playerPause) {
    Object.defineProperty(iframe, "contentWindow", {
      configurable: true,
      value: {
        __player: {
          getTime: () => 3.25,
          pause: playerPause,
        },
      },
    });
  }
  return iframe;
}

interface HarnessArgs {
  previewIframe: HTMLIFrameElement | null;
  resolveDomSelectionFromPreviewPoint: (
    clientX: number,
    clientY: number,
    options?: { activeGroupElement?: HTMLElement | null },
  ) => Promise<DomEditSelection | null>;
  resolveAllDomSelectionsFromPreviewPoint?: (
    clientX: number,
    clientY: number,
  ) => Promise<DomEditSelection[]>;
  applyDomSelection: (
    selection: DomEditSelection | null,
    options?: { revealPanel?: boolean; additive?: boolean; preserveGroup?: boolean },
  ) => void;
  setActiveGroupElement?: (el: HTMLElement | null) => void;
  mouseDownOptions?: {
    preferClipAncestor?: boolean;
    hoverSelection?: DomEditSelection | null;
  };
}

function renderHarness(args: HarnessArgs): {
  canvas: HTMLDivElement;
  cleanup: () => void;
} {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);

  function Harness() {
    const interaction = usePreviewInteraction({
      captionEditMode: false,
      compositionLoading: false,
      previewIframeRef: { current: args.previewIframe },
      showToast: vi.fn(),
      applyDomSelection: args.applyDomSelection,
      resolveDomSelectionFromPreviewPoint: args.resolveDomSelectionFromPreviewPoint,
      resolveAllDomSelectionsFromPreviewPoint:
        args.resolveAllDomSelectionsFromPreviewPoint ?? vi.fn(async () => []),
      updateDomEditHoverSelection: vi.fn(),
      setActiveGroupElement: args.setActiveGroupElement ?? vi.fn(),
    });

    return React.createElement("div", {
      id: "canvas",
      onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => {
        void interaction.handlePreviewCanvasMouseDown(event, args.mouseDownOptions);
      },
    });
  }

  act(() => {
    root.render(React.createElement(Harness));
  });

  const canvas = host.querySelector("#canvas");
  if (!(canvas instanceof HTMLDivElement)) throw new Error("Expected canvas div");

  return {
    canvas,
    cleanup: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function dispatchMouseDown(canvas: HTMLDivElement, init: MouseEventInit): Promise<void> {
  await act(async () => {
    canvas.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: 50,
        clientY: 60,
        ...init,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("usePreviewInteraction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pauses playback before resolving a click and falls back to the tracked hover selection", async () => {
    const order: string[] = [];
    const playerPause = vi.fn(() => {
      order.push("pause");
    });
    const element = document.createElement("div");
    element.id = "headline";
    const hoverSelection = makeSelection("Headline", element);
    const applyDomSelection = vi.fn();
    const resolveDomSelectionFromPreviewPoint = vi.fn(async () => {
      order.push("resolve");
      return null;
    });
    const { canvas, cleanup } = renderHarness({
      previewIframe: createPreviewIframe(playerPause),
      resolveDomSelectionFromPreviewPoint,
      applyDomSelection,
      mouseDownOptions: { preferClipAncestor: false, hoverSelection },
    });

    await dispatchMouseDown(canvas, {});

    expect(order[0]).toBe("pause");
    expect(applyDomSelection).toHaveBeenCalledWith(hoverSelection);
    cleanup();
  });

  it("treats a double-click on a regular element as a plain selection", async () => {
    const element = document.createElement("div");
    element.id = "headline";
    const selection = makeSelection("Headline", element);
    const applyDomSelection = vi.fn();
    let resolveCount = 0;
    const resolveDomSelectionFromPreviewPoint = vi.fn(async () => {
      resolveCount += 1;
      return resolveCount === 1 ? selection : null;
    });
    const { canvas, cleanup } = renderHarness({
      previewIframe: null,
      resolveDomSelectionFromPreviewPoint,
      applyDomSelection,
    });

    await dispatchMouseDown(canvas, { detail: 2 });

    expect(applyDomSelection).toHaveBeenCalledWith(selection);
    expect(applyDomSelection).not.toHaveBeenCalledWith(null, { revealPanel: false });
    cleanup();
  });

  it("preserves group drill-in on double-click", async () => {
    const group = document.createElement("div");
    group.setAttribute("data-hf-group", "hero");
    const child = document.createElement("span");
    child.id = "headline";
    group.append(child);
    const groupSelection = makeSelection("Hero Group", group);
    const childSelection = makeSelection("Headline", child);
    const applyDomSelection = vi.fn();
    const setActiveGroupElement = vi.fn();
    const resolveDomSelectionFromPreviewPoint = vi.fn(
      async (
        _clientX: number,
        _clientY: number,
        options?: { activeGroupElement?: HTMLElement | null },
      ) => (options?.activeGroupElement === group ? childSelection : groupSelection),
    );
    const { canvas, cleanup } = renderHarness({
      previewIframe: null,
      resolveDomSelectionFromPreviewPoint,
      applyDomSelection,
      setActiveGroupElement,
    });

    await dispatchMouseDown(canvas, { detail: 2 });

    expect(setActiveGroupElement).toHaveBeenCalledWith(group);
    expect(applyDomSelection).toHaveBeenCalledWith(childSelection);
    cleanup();
  });

  it("cycles stacked candidates on a rapid second click at the same spot", async () => {
    const topElement = document.createElement("div");
    topElement.id = "top";
    const bottomElement = document.createElement("div");
    bottomElement.id = "bottom";
    const topSelection = makeSelection("Top", topElement);
    const bottomSelection = makeSelection("Bottom", bottomElement);
    const applyDomSelection = vi.fn();
    const resolveDomSelectionFromPreviewPoint = vi.fn(async () => topSelection);
    const resolveAllDomSelectionsFromPreviewPoint = vi.fn(async () => [
      topSelection,
      bottomSelection,
    ]);
    const { canvas, cleanup } = renderHarness({
      previewIframe: null,
      resolveDomSelectionFromPreviewPoint,
      resolveAllDomSelectionsFromPreviewPoint,
      applyDomSelection,
    });

    await dispatchMouseDown(canvas, { detail: 1 });
    await dispatchMouseDown(canvas, { detail: 2 });

    expect(applyDomSelection).toHaveBeenNthCalledWith(1, topSelection);
    expect(applyDomSelection).toHaveBeenNthCalledWith(2, bottomSelection);
    cleanup();
  });

  // The deselect resume asks the PLAYER to play; it must never move the store's
  // flag on its own. The runtime really was paused (playerPause below), so a bare
  // setIsPlaying(true) leaves the button reading "playing" over a stopped runtime
  // with nothing able to reconcile the two.
  it("requests a real resume when a click resolves to nothing (dead-zone / deselect)", async () => {
    usePlayerStore.setState({ isPlaying: true, playbackRequest: null });
    const playerPause = vi.fn();
    const applyDomSelection = vi.fn();
    const resolveDomSelectionFromPreviewPoint = vi.fn(async () => null);
    const { canvas, cleanup } = renderHarness({
      previewIframe: createPreviewIframe(playerPause),
      resolveDomSelectionFromPreviewPoint,
      applyDomSelection,
    });

    await dispatchMouseDown(canvas, {});

    expect(applyDomSelection).toHaveBeenCalledWith(null, { revealPanel: false });
    expect(playerPause).toHaveBeenCalled();
    expect(usePlayerStore.getState().playbackRequest).toMatchObject({ playing: true });
    // Only the player's own play() may raise this, once the runtime is running.
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    cleanup();
  });

  it("does not resume playback on deselect when it was already paused", async () => {
    usePlayerStore.setState({ isPlaying: false, playbackRequest: null });
    const applyDomSelection = vi.fn();
    const resolveDomSelectionFromPreviewPoint = vi.fn(async () => null);
    const { canvas, cleanup } = renderHarness({
      previewIframe: createPreviewIframe(vi.fn()),
      resolveDomSelectionFromPreviewPoint,
      applyDomSelection,
    });

    await dispatchMouseDown(canvas, {});

    expect(applyDomSelection).toHaveBeenCalledWith(null, { revealPanel: false });
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(usePlayerStore.getState().playbackRequest).toBeNull();
    cleanup();
  });
});

describe("a refused move's toast", () => {
  it("gives the refusal's own reason first, else the selection's", () => {
    const showToast = vi.fn();
    let blocked!: (selection: DomEditSelection, reason?: string) => void;
    function Harness() {
      blocked = usePreviewInteraction({
        captionEditMode: false,
        compositionLoading: false,
        previewIframeRef: { current: null },
        showToast,
        applyDomSelection: vi.fn(),
        resolveDomSelectionFromPreviewPoint: vi.fn(async () => null),
        resolveAllDomSelectionsFromPreviewPoint: vi.fn(async () => []),
        updateDomEditHoverSelection: vi.fn(),
        setActiveGroupElement: vi.fn(),
      }).handleBlockedDomMove;
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Harness)));
    const selection = makeSelection("Box", document.createElement("div"));
    selection.capabilities.reasonIfDisabled = "Locked layer.";
    blocked(selection, "Studio can't read it.");
    blocked(selection);
    act(() => root.unmount());
    expect(showToast.mock.calls).toEqual([
      ["Studio can't read it.", "info"],
      ["Locked layer.", "info"],
    ]);
  });
});

vi.mock("../utils/studioTelemetry", () => ({ trackStudioEvent: vi.fn() }));
import { trackStudioEvent } from "../utils/studioTelemetry";
it("counts additive preview selection only after resolving a hit", async () => {
  vi.mocked(trackStudioEvent).mockClear();
  const selection = makeSelection("Card", document.createElement("div"));
  const applyDomSelection = vi.fn();
  const { canvas, cleanup } = renderHarness({
    previewIframe: createPreviewIframe(vi.fn()),
    resolveDomSelectionFromPreviewPoint: vi.fn(async () => selection),
    applyDomSelection,
  });
  await dispatchMouseDown(canvas, { shiftKey: true });
  expect(applyDomSelection).toHaveBeenCalledWith(selection, { additive: true });
  expect(trackStudioEvent).toHaveBeenCalledExactlyOnceWith("feature_used", {
    feature: "multi_select",
    surface: "preview",
    method: "button",
  });
  cleanup();
});
