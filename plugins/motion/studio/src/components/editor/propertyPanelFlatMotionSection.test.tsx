// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlatMotionSection, FlatTimingRow } from "./propertyPanelFlatMotionSection";
import type { DomEditSelection } from "./domEditing";
import { usePlayerStore } from "../../player";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  // The store is module-global, so a test that parks a focused ease segment
  // would otherwise leak it into every test that runs after it.
  usePlayerStore.getState().reset();
});

function baseElement(overrides: Partial<DomEditSelection> = {}): DomEditSelection {
  return {
    element: document.createElement("div"),
    id: "hero",
    selector: "#hero",
    label: "Hero",
    tagName: "div",
    sourceFile: "index.html",
    compositionPath: "index.html",
    isCompositionHost: false,
    isInsideLockedComposition: false,
    boundingBox: { x: 0, y: 0, width: 100, height: 100 },
    textContent: "",
    dataAttributes: { start: "8", duration: "4" },
    inlineStyles: {},
    computedStyles: {},
    textFields: [],
    capabilities: {
      canSelect: true,
      canEditStyles: true,
      canCrop: true,
      canMove: true,
      canResize: true,
      canApplyManualOffset: true,
      canApplyManualSize: true,
      canApplyManualRotation: true,
    },
    ...overrides,
  } as DomEditSelection;
}

function renderInto(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

describe("FlatTimingRow", () => {
  it("renders Start, End, and Duration from the element's data attributes", () => {
    const { host, root } = renderInto(
      <FlatTimingRow element={baseElement()} onSetAttribute={vi.fn()} />,
    );
    expect(host.textContent).toContain("Start");
    expect(host.textContent).toContain("End");
    expect(host.textContent).toContain("Duration");
    // Values render inside <input>s (CommitField), not as text nodes, so they
    // don't show up in textContent — assert on the rendered input values,
    // in the same Start/End/Duration order the row is built in.
    const inputs = host.querySelectorAll<HTMLInputElement>("input");
    expect(inputs[0]?.value).toBe("8.00s");
    expect(inputs[1]?.value).toBe("12.00s");
    expect(inputs[2]?.value).toBe("4.00s");
    act(() => root.unmount());
  });

  it("shows the inferred note when duration is derived from animations, not authored", () => {
    const onSetAttribute = vi.fn();
    const element = baseElement({ dataAttributes: { start: "0", duration: "0" } });
    const { host, root } = renderInto(
      <FlatTimingRow
        element={element}
        animations={[{ position: 2, duration: 3 } as never]}
        onSetAttribute={onSetAttribute}
      />,
    );
    expect(host.textContent).toContain("Inferred");
    act(() => root.unmount());
  });

  it("commits a Start edit through onSetAttribute", () => {
    const onSetAttribute = vi.fn();
    const { host, root } = renderInto(
      <FlatTimingRow element={baseElement()} onSetAttribute={onSetAttribute} />,
    );
    const startInput = host.querySelectorAll("input")[0];
    if (!startInput) throw new Error("expected a Start input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(startInput, "10s");
      startInput.dispatchEvent(new Event("input", { bubbles: true }));
      startInput.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(onSetAttribute).toHaveBeenCalledWith("start", "10.00");
    act(() => root.unmount());
  });

  it("pins an inferred range through ONE atomic onSetAttributes call when provided, instead of two sequential onSetAttribute calls", async () => {
    const onSetAttribute = vi.fn();
    const onSetAttributes = vi.fn().mockResolvedValue(undefined);
    const element = baseElement({ dataAttributes: { start: "0", duration: "0" } });
    const { host, root } = renderInto(
      <FlatTimingRow
        element={element}
        animations={[{ position: 2, duration: 3 } as never]}
        onSetAttribute={onSetAttribute}
        onSetAttributes={onSetAttributes}
      />,
    );
    // Range is inferred (start=2, duration=3) — editing Start alone must pin
    // the WHOLE range (both attrs), not just data-start.
    const startInput = host.querySelectorAll("input")[0];
    if (!startInput) throw new Error("expected a Start input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(startInput, "5s");
      startInput.dispatchEvent(new Event("input", { bubbles: true }));
      startInput.dispatchEvent(new Event("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onSetAttributes).toHaveBeenCalledTimes(1);
    expect(onSetAttributes).toHaveBeenCalledWith(element, { start: "5.00", duration: "3.00" });
    expect(onSetAttribute).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("falls back to two sequential onSetAttribute calls to pin an inferred range when onSetAttributes is not provided", async () => {
    const onSetAttribute = vi.fn().mockResolvedValue(undefined);
    const element = baseElement({ dataAttributes: { start: "0", duration: "0" } });
    const { host, root } = renderInto(
      <FlatTimingRow
        element={element}
        animations={[{ position: 2, duration: 3 } as never]}
        onSetAttribute={onSetAttribute}
      />,
    );
    const startInput = host.querySelectorAll("input")[0];
    if (!startInput) throw new Error("expected a Start input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(startInput, "5s");
      startInput.dispatchEvent(new Event("input", { bubbles: true }));
      startInput.dispatchEvent(new Event("focusout", { bubbles: true }));
      await Promise.resolve();
    });
    expect(onSetAttribute).toHaveBeenNthCalledWith(1, "start", "5.00");
    expect(onSetAttribute).toHaveBeenNthCalledWith(2, "duration", "3.00");
    act(() => root.unmount());
  });
});

describe("FlatMotionSection", () => {
  it("renders Timing when showTiming is true and the effect list when showEffects is true", () => {
    const { host, root } = renderInto(
      <FlatMotionSection
        element={baseElement()}
        animations={[
          {
            id: "a1",
            method: "to",
            position: 0.8,
            duration: 1.2,
            ease: "power2.out",
            properties: { opacity: 1 },
          } as never,
        ]}
        showTiming
        showEffects
        onSetAttribute={vi.fn()}
        onAddAnimation={vi.fn()}
        onUpdateProperty={vi.fn()}
        onUpdateMeta={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onAddProperty={vi.fn()}
        onRemoveProperty={vi.fn()}
      />,
    );
    expect(host.textContent).toContain("Start");
    expect(host.textContent).toContain("power2.out");
    act(() => root.unmount());
  });

  it("omits Timing entirely when showTiming is false", () => {
    const { host, root } = renderInto(
      <FlatMotionSection
        element={baseElement()}
        animations={[]}
        showTiming={false}
        showEffects
        onSetAttribute={vi.fn()}
        onAddAnimation={vi.fn()}
        onUpdateProperty={vi.fn()}
        onUpdateMeta={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onAddProperty={vi.fn()}
        onRemoveProperty={vi.fn()}
      />,
    );
    expect(host.textContent).not.toContain("Start");
    act(() => root.unmount());
  });

  it("omits the effect list entirely when showEffects is false", () => {
    const { host, root } = renderInto(
      <FlatMotionSection
        element={baseElement()}
        animations={[
          {
            id: "a1",
            method: "to",
            position: 0.8,
            duration: 1.2,
            ease: "power2.out",
            properties: { opacity: 1 },
          } as never,
        ]}
        showTiming
        showEffects={false}
        onSetAttribute={vi.fn()}
        onAddAnimation={vi.fn()}
        onUpdateProperty={vi.fn()}
        onUpdateMeta={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onAddProperty={vi.fn()}
        onRemoveProperty={vi.fn()}
      />,
    );
    expect(host.textContent).not.toContain("power2.out");
    act(() => root.unmount());
  });

  it("opens the add-method menu on '+ Add effect' and calls onAddAnimation with the chosen method", () => {
    const onAddAnimation = vi.fn();
    const { host, root } = renderInto(
      <FlatMotionSection
        element={baseElement()}
        animations={[]}
        showTiming
        showEffects
        onSetAttribute={vi.fn()}
        onAddAnimation={onAddAnimation}
        onUpdateProperty={vi.fn()}
        onUpdateMeta={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onAddProperty={vi.fn()}
        onRemoveProperty={vi.fn()}
      />,
    );
    const buttons = () => Array.from(host.querySelectorAll("button"));
    const addTrigger = buttons().find((b) => b.textContent === "+ Add effect");
    if (!addTrigger) throw new Error("expected an '+ Add effect' trigger button");
    act(() => {
      addTrigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const animateButton = buttons().find((b) => b.textContent === "Animate");
    if (!animateButton) throw new Error("expected an 'Animate' method button");
    act(() => {
      animateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onAddAnimation).toHaveBeenCalledWith("to");
    // The menu closes back to the trigger after a selection.
    expect(buttons().some((b) => b.textContent === "+ Add effect")).toBe(true);
    act(() => root.unmount());
  });

  it("forwards focused bulk segment easing through the flat animation card", () => {
    const onUpdateKeyframeEase = vi.fn();
    const onUpdateSegmentEase = vi.fn();
    const store = usePlayerStore.getState();
    store.beginTimelineSession("project-a");
    store.setSelectedElementId("index.html#hero");
    store.setFocusedEaseSegment({
      elementId: "index.html#hero",
      animationId: "a1",
      tweenPercentage: 50,
      collidingAnimationTargets: [
        { animationId: "a1", tweenPercentage: 50 },
        { animationId: "a2", tweenPercentage: 75 },
      ],
    });
    const { host, root } = renderInto(
      <FlatMotionSection
        element={baseElement()}
        animations={[
          {
            id: "a1",
            method: "to",
            position: 0,
            duration: 1,
            properties: { x: 100 },
            keyframes: {
              format: "percentage",
              keyframes: [
                { percentage: 0, properties: { x: 0 } },
                { percentage: 50, properties: { x: 100 } },
              ],
            },
          } as never,
        ]}
        showTiming={false}
        showEffects
        onSetAttribute={vi.fn()}
        onAddAnimation={vi.fn()}
        onUpdateProperty={vi.fn()}
        onUpdateMeta={vi.fn()}
        onDeleteAnimation={vi.fn()}
        onAddProperty={vi.fn()}
        onRemoveProperty={vi.fn()}
        onUpdateKeyframeEase={onUpdateKeyframeEase}
        onUpdateSegmentEase={onUpdateSegmentEase}
      />,
    );

    const dropdown = host.querySelector<HTMLButtonElement>("[data-ease-type-dropdown]");
    expect(dropdown).not.toBeNull();
    act(() => dropdown?.click());
    const preset = host.querySelector<HTMLButtonElement>('[data-ease-preset-id="quad-out"]');
    expect(preset).not.toBeNull();
    act(() => preset?.click());

    expect(onUpdateSegmentEase).toHaveBeenCalledExactlyOnceWith(
      [
        { animationId: "a1", tweenPercentage: 50 },
        { animationId: "a2", tweenPercentage: 75 },
      ],
      "power2.out",
    );
    expect(onUpdateKeyframeEase).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
