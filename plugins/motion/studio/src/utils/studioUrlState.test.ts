// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildStudioHash,
  normalizeStudioCompositionPath,
  normalizeStudioUrlPanelTab,
  parseStudioUrlStateFromHash,
  resolveMasterCompositionPath,
} from "./studioUrlState";
import { useStudioUrlState } from "../hooks/useStudioUrlState";
import { usePlayerStore } from "../player";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("resolveMasterCompositionPath", () => {
  it("prefers index.html when present", () => {
    expect(resolveMasterCompositionPath(["frames/a.html", "index.html", "b.html"])).toBe(
      "index.html",
    );
  });

  it("falls back to the first .html when there is no index.html", () => {
    expect(resolveMasterCompositionPath(["notes.md", "card.html", "hero.html"])).toBe("card.html");
  });

  it("returns null when the project carries no composition", () => {
    expect(resolveMasterCompositionPath(["notes.md", "styles.css"])).toBeNull();
    expect(resolveMasterCompositionPath([])).toBeNull();
  });
});

describe("normalizeStudioUrlPanelTab", () => {
  it("accepts slideshow and variables as valid tabs", () => {
    expect(normalizeStudioUrlPanelTab("slideshow")).toBe("slideshow");
    expect(normalizeStudioUrlPanelTab("variables")).toBe("variables");
  });
});

function resetPlayerStore() {
  usePlayerStore.setState({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    timelineReady: false,
    elements: [],
    selectedElementId: null,
    requestedSeekTime: null,
  });
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
  resetPlayerStore();
});

function renderStudioUrlStateHarness(
  props: Partial<React.ComponentProps<typeof StudioUrlStateHarness>> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const baseProps: React.ComponentProps<typeof StudioUrlStateHarness> = {
    projectId: "demo",
    activeCompPath: null,
    currentTime: 0,
    duration: 30,
    isPlaying: false,
    compositionLoading: false,
    refreshKey: 0,
    previewIframeRef: { current: null },
    rightPanelTab: "renders",
    rightCollapsed: true,
    activeCompPathHydrated: true,
    domEditSelection: null,
    domEditGroupSelections: [],
    applyMarqueeSelection: () => {},
    buildDomSelectionFromTarget: () => Promise.resolve(null),
    applyDomSelection: () => {},
    setRightPanelTab: () => {},
    initialState: {
      activeCompPath: null,
      currentTime: 4.2,
      rightPanelTab: null,
      rightCollapsed: null,
      timelineVisible: null,
      selection: null,
    },
  };

  const render = (nextProps: Partial<React.ComponentProps<typeof StudioUrlStateHarness>> = {}) => {
    act(() => {
      root.render(
        React.createElement(StudioUrlStateHarness, {
          ...baseProps,
          ...props,
          ...nextProps,
        }),
      );
    });
  };

  render();
  return {
    rerender: render,
    unmount: () =>
      act(() => {
        root.unmount();
      }),
  };
}

function StudioUrlStateHarness(props: Parameters<typeof useStudioUrlState>[0]) {
  useStudioUrlState(props);
  return null;
}

function previewIframeFor(contentDocument: Document): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  Object.defineProperty(iframe, "contentDocument", { value: contentDocument });
  return iframe;
}

describe("studio url state", () => {
  it("parses persisted studio state from project hash", () => {
    const state = parseStudioUrlStateFromHash(
      "#project/demo?v=1&comp=compositions%2Ftitle.html&t=4.25&tab=design&rc=0&tv=1&selFile=index.html&selId=hero",
    );

    expect(state.activeCompPath).toBe("compositions/title.html");
    expect(state.currentTime).toBe(4.25);
    expect(state.rightPanelTab).toBe("design");
    expect(state.rightCollapsed).toBe(false);
    expect(state.timelineVisible).toBe(true);
    expect(state.selection).toEqual({
      sourceFile: "index.html",
      id: "hero",
      selector: undefined,
      selectorIndex: undefined,
      group: undefined,
    });
  });

  /**
   * A link to a bug hit while several elements were selected has to carry the
   * whole selection. Without the group the URL reopens one element, the report
   * cannot be reproduced from it, and it reads as "works for me".
   */
  it("round-trips a multi-selection through the hash", () => {
    const hash = buildStudioHash("demo", {
      activeCompPath: null,
      currentTime: null,
      rightPanelTab: null,
      rightCollapsed: null,
      timelineVisible: null,
      selection: {
        sourceFile: "index.html",
        id: "chip",
        group: [
          { sourceFile: "index.html", id: "card" },
          { sourceFile: "index.html", selector: ".dot", selectorIndex: 1 },
        ],
      },
    });

    expect(parseStudioUrlStateFromHash(hash).selection?.group).toEqual([
      { sourceFile: "index.html", id: "card" },
      { sourceFile: "index.html", selector: ".dot", selectorIndex: 1 },
    ]);
  });

  it("reads a single selection as having no group", () => {
    const hash = parseStudioUrlStateFromHash("#project/demo?v=1&selFile=index.html&selId=hero");
    expect(hash.selection?.group).toBeUndefined();
  });

  it("restores selector-based multi-selection members from the hash", async () => {
    const previewDoc = document.implementation.createHTMLDocument("preview");
    const primaryElement = previewDoc.createElement("div");
    primaryElement.id = "hero";
    const memberElement = previewDoc.createElement("div");
    memberElement.className = "dot";
    previewDoc.body.append(primaryElement, memberElement);
    const primary = { element: primaryElement, id: "hero", sourceFile: "index.html" };
    const member = {
      element: memberElement,
      selector: ".dot",
      selectorIndex: 0,
      sourceFile: "index.html",
    };
    const applyMarqueeSelection = vi.fn();

    const harness = renderStudioUrlStateHarness({
      previewIframeRef: {
        current: previewIframeFor(previewDoc),
      },
      applyMarqueeSelection,
      buildDomSelectionFromTarget: (target) =>
        Promise.resolve(target === primaryElement ? primary : member),
      initialState: {
        activeCompPath: null,
        currentTime: null,
        rightPanelTab: null,
        rightCollapsed: null,
        timelineVisible: null,
        selection: {
          sourceFile: "index.html",
          id: "hero",
          group: [{ sourceFile: "index.html", selector: ".dot", selectorIndex: 0 }],
        },
      },
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(applyMarqueeSelection).toHaveBeenCalledWith([primary, member], false);
    harness.unmount();
  });

  it("does not let an older async URL selection overwrite a newer hash", async () => {
    const previewDoc = document.implementation.createHTMLDocument("preview");
    const firstElement = previewDoc.createElement("div");
    firstElement.id = "first";
    const secondElement = previewDoc.createElement("div");
    secondElement.id = "second";
    previewDoc.body.append(firstElement, secondElement);
    const first = { element: firstElement, id: "first", sourceFile: "index.html" };
    const second = { element: secondElement, id: "second", sourceFile: "index.html" };
    let resolveFirst = (_selection: typeof first) => undefined;
    const firstResolution = new Promise<typeof first>((resolve) => {
      resolveFirst = resolve;
    });
    const applyDomSelection = vi.fn();
    const harness = renderStudioUrlStateHarness({
      previewIframeRef: { current: previewIframeFor(previewDoc) },
      applyDomSelection,
      buildDomSelectionFromTarget: (target) =>
        target === firstElement ? firstResolution : Promise.resolve(second),
      initialState: {
        activeCompPath: null,
        currentTime: null,
        rightPanelTab: null,
        rightCollapsed: null,
        timelineVisible: null,
        selection: null,
      },
    });

    act(() => {
      window.history.replaceState(null, "", "#project/demo?v=1&selId=first");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      window.history.replaceState(null, "", "#project/demo?v=1&selId=second");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(applyDomSelection).toHaveBeenCalled();
    expect(applyDomSelection.mock.calls.every(([selection]) => selection === second)).toBe(true);
    const appliedBeforeOlderResolution = applyDomSelection.mock.calls.length;

    await act(async () => {
      resolveFirst(first);
      await firstResolution;
    });
    expect(applyDomSelection).toHaveBeenCalledTimes(appliedBeforeOlderResolution);
    harness.unmount();
  });

  it("builds a project hash with persisted studio state", () => {
    expect(
      buildStudioHash("demo", {
        activeCompPath: "compositions/title.html",
        currentTime: 4.2571,
        rightPanelTab: "layers",
        rightCollapsed: true,
        timelineVisible: false,
        selection: {
          sourceFile: "index.html",
          selector: ".card",
          selectorIndex: 2,
        },
      }),
    ).toBe(
      "#project/demo?v=1&comp=compositions%2Ftitle.html&t=4.257&tab=layers&rc=1&tv=0&selFile=index.html&selSelector=.card&selIndex=2",
    );
  });

  it("falls back cleanly on invalid values", () => {
    const state = parseStudioUrlStateFromHash("#project/demo?tab=nope&t=abc&rc=9&tv=7");

    expect(state.activeCompPath).toBeNull();
    expect(state.currentTime).toBeNull();
    expect(state.rightPanelTab).toBeNull();
    expect(state.rightCollapsed).toBeNull();
    expect(state.timelineVisible).toBeNull();
    expect(state.selection).toBeNull();
  });

  it("normalizes stale composition paths to the master composition", () => {
    expect(
      normalizeStudioCompositionPath("compositions/missing.html", [
        "index.html",
        "compositions/title.html",
      ]),
    ).toBeNull();
    expect(
      normalizeStudioCompositionPath("compositions/title.html", [
        "index.html",
        "compositions/title.html",
      ]),
    ).toBe("compositions/title.html");
  });

  it("passes through every valid tab and rejects unknown ones", () => {
    expect(normalizeStudioUrlPanelTab("renders")).toBe("renders");
    expect(normalizeStudioUrlPanelTab("layers")).toBe("layers");
    expect(normalizeStudioUrlPanelTab("nope" as never)).toBeNull();
  });

  it("hydrates seek first, preserves the initial url state, then restores selection", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "#project/demo?t=4.2&tab=design&selId=hero");
    const requestSeek = vi.fn();
    usePlayerStore.setState({ requestSeek });
    const selectedElement = document.createElement("div");
    selectedElement.id = "hero";
    document.body.append(selectedElement);
    const previewDoc = document.implementation.createHTMLDocument("preview");
    previewDoc.body.append(selectedElement);
    const applyDomSelection = vi.fn();
    const restoredSelection = {
      element: selectedElement,
      id: "hero",
      selector: "#hero",
      selectorIndex: 0,
      sourceFile: "index.html",
      tagName: "div",
      label: "Hero",
      textContent: "",
      textFields: [],
      capabilities: {
        canEditText: false,
        canEditLayout: true,
        canApplyManualOffset: true,
        canApplyManualSize: true,
        canApplyManualRotation: true,
        canAdjustOpacity: true,
        canAdjustFill: true,
        canAdjustBorderRadius: true,
        canAdjustStroke: true,
        canAdjustShadow: true,
        canAdjustZIndex: true,
      },
      computedStyle: {
        display: "block",
        position: "absolute",
      },
    };

    const harness = renderStudioUrlStateHarness({
      previewIframeRef: {
        current: previewIframeFor(previewDoc),
      },
      rightPanelTab: "design",
      rightCollapsed: false,
      applyDomSelection,
      buildDomSelectionFromTarget: () => Promise.resolve(restoredSelection),
      initialState: {
        activeCompPath: null,
        currentTime: 4.2,
        rightPanelTab: "design",
        rightCollapsed: false,
        timelineVisible: true,
        selection: { id: "hero" },
      },
    });

    expect(requestSeek).toHaveBeenCalledWith(4.2);
    expect(applyDomSelection).not.toHaveBeenCalled();
    expect(window.location.hash).toContain("t=4.2");
    expect(window.location.hash).toContain("tab=design");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(window.location.hash).toContain("t=4.2");
    expect(applyDomSelection).not.toHaveBeenCalled();

    // Drive the hook's internal currentTime read. Per #1311 the hook stopped
    // taking currentTime as a prop and now subscribes to the player store
    // directly (usePlayerStore((s) => s.currentTime)). The harness prop is a
    // no-op; the selection-hydration useEffect's time-stability guard
    // (`Math.abs(currentTime - stableTimeRef.current) > 0.05`) only passes
    // once the store's currentTime catches up to the seek target.
    act(() => {
      usePlayerStore.setState({ currentTime: 4.2 });
    });
    harness.rerender({ currentTime: 4.2 });
    await act(async () => {
      vi.advanceTimersByTime(250);
      // Flush microtasks so the async buildDomSelectionFromTarget Promise resolves
      await Promise.resolve();
    });
    expect(applyDomSelection).toHaveBeenCalledWith(restoredSelection, { revealPanel: false });

    harness.rerender({ currentTime: 4.2, domEditSelection: restoredSelection });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(window.location.hash).toContain("t=4.2");
    expect(window.location.hash).toContain("selId=hero");

    const selectorMember = {
      ...restoredSelection,
      element: document.createElement("div"),
      id: "",
      selector: ".dot",
      selectorIndex: 1,
      label: "Dot",
    };
    harness.rerender({
      currentTime: 4.2,
      domEditSelection: restoredSelection,
      domEditGroupSelections: [restoredSelection, selectorMember],
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(parseStudioUrlStateFromHash(window.location.hash).selection?.group).toEqual([
      {
        sourceFile: "index.html",
        id: undefined,
        selector: ".dot",
        selectorIndex: 1,
      },
    ]);

    harness.unmount();
  });
});
