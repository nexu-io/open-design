// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { useManualEditDisabledFlags } from "./previewReadOnlyContext";
import type { DomEditSelection } from "./domEditingTypes";
import { GsapEditBlockedError } from "../../hooks/gsapEditOutcome";
import { createTransformCommitHandlers } from "./propertyPanelTransformCommit";
import { readMoveOffset, UNREADABLE_TRANSLATE } from "./plainTranslate";

describe("createTransformCommitHandlers", () => {
  it.each([
    [
      "position",
      (handlers: ReturnType<typeof createTransformCommitHandlers>) =>
        handlers.commitManualOffset("x", "20px"),
    ],
    [
      "size",
      (handlers: ReturnType<typeof createTransformCommitHandlers>) =>
        handlers.commitManualSize("width", "200px"),
    ],
    [
      "rotation",
      (handlers: ReturnType<typeof createTransformCommitHandlers>) =>
        handlers.commitManualRotation("45"),
    ],
  ])("propagates blocked %s edits so the field can roll back", async (_name, commit) => {
    const blocked = new GsapEditBlockedError("unroll-required");
    const onCommitAnimatedProperty = vi.fn().mockRejectedValue(blocked);
    const onSetManualOffset = vi.fn();
    const onSetManualSize = vi.fn();
    const onSetManualRotation = vi.fn();
    const element = {
      id: "box",
      selector: "#box",
      element: document.createElement("div"),
      boundingBox: { width: 100, height: 100 },
    } as unknown as DomEditSelection;
    const handlers = createTransformCommitHandlers({
      element,
      styles: {},
      hasGsapAnimation: true,
      gsapAnimId: "#box-to-position",
      gsapKeyframes: null,
      currentPct: 0,
      onCommitAnimatedProperty,
      onAddKeyframe: undefined,
      onSetManualOffset,
      onSetManualSize,
      onSetManualRotation,
      showToast: vi.fn(),
    });

    await expect(commit(handlers)).rejects.toBe(blocked);
    expect(onSetManualOffset).not.toHaveBeenCalled();
    expect(onSetManualSize).not.toHaveBeenCalled();
    expect(onSetManualRotation).not.toHaveBeenCalled();
  });
});

describe("the panel's position fields on a translate Studio can't read", () => {
  it("are disabled", () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const box = document.createElement("div");
    box.style.setProperty("translate", "abs(10% - 50px) 30px");
    const seen: boolean[] = [];
    function Probe({ element }: { element: HTMLElement }) {
      seen.push(
        useManualEditDisabledFlags({ canApplyManualOffset: true } as never, readMoveOffset(element))
          .manualOffsetEditingDisabled,
      );
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(React.createElement(Probe, { element: box })));
    box.style.setProperty("translate", "40px 30px");
    act(() => root.render(React.createElement(Probe, { element: box })));
    act(() => root.unmount());
    expect(seen).toEqual([true, false]);
  });

  it("commit nothing and say why", async () => {
    const onSetManualOffset = vi.fn();
    const showToast = vi.fn();
    const box = document.createElement("div");
    box.style.setProperty("translate", "abs(10% - 50px) 30px");
    const element = { id: "box", selector: "#box", element: box } as unknown as DomEditSelection;
    const handlers = createTransformCommitHandlers({
      element,
      styles: {},
      hasGsapAnimation: false,
      gsapAnimId: null,
      gsapKeyframes: null,
      currentPct: 0,
      onCommitAnimatedProperty: undefined,
      onAddKeyframe: undefined,
      onSetManualOffset,
      onSetManualSize: vi.fn(),
      onSetManualRotation: vi.fn(),
      showToast,
    });
    await handlers.commitManualOffset("y", "20px");
    expect(onSetManualOffset).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(UNREADABLE_TRANSLATE);
  });
});

describe("the panel's position fields", () => {
  it("read and move an element without GSAP by its CSS translate, on the route they chose", async () => {
    const onSetManualOffset = vi.fn();
    const box = document.createElement("div");
    box.style.setProperty("translate", "40px 30px");
    const element = { id: "box", selector: "#box", element: box } as unknown as DomEditSelection;
    const handlers = createTransformCommitHandlers({
      element,
      styles: {},
      hasGsapAnimation: false,
      gsapAnimId: null,
      gsapKeyframes: null,
      currentPct: 0,
      onCommitAnimatedProperty: undefined,
      onAddKeyframe: undefined,
      onSetManualOffset,
      onSetManualSize: vi.fn(),
      onSetManualRotation: vi.fn(),
      showToast: vi.fn(),
    });
    await handlers.commitManualOffset("x", "100px");
    expect(onSetManualOffset).toHaveBeenCalledWith(
      element,
      { x: 100, y: 30 },
      { plainTranslate: true },
    );
  });
});
