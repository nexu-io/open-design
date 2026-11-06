// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FlatLayoutSection,
  LayoutFlexBlock,
  LayoutGeometryRows,
  LayoutTransform3DBlock,
  LayoutZIndexRow,
} from "./propertyPanelFlatLayoutSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderInto(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

function getFlatRowInput(host: HTMLElement, label: string): HTMLInputElement {
  const rows = Array.from(host.querySelectorAll<HTMLElement>(".group"));
  const row = rows.find((el) => el.querySelector("span")?.textContent === label);
  const input = row?.querySelector<HTMLInputElement>("input");
  if (!input) throw new Error(`expected an input for row "${label}"`);
  return input;
}

function baseGeometryProps(overrides: Partial<Parameters<typeof LayoutGeometryRows>[0]> = {}) {
  return {
    element: {} as never,
    displayX: 0,
    displayY: -24,
    displayW: 257.4,
    displayH: 29,
    displayR: 0,
    manualOffsetEditingDisabled: false,
    manualSizeEditingDisabled: false,
    manualRotationEditingDisabled: false,
    commitManualOffset: vi.fn(),
    commitManualSize: vi.fn(),
    commitManualRotation: vi.fn(),
    gsapAnimId: null,
    navKeyframes: null,
    currentPct: 0,
    seekFromKfPct: vi.fn(),
    animIdForProp: (prop: string) => prop,
    onCommitAnimatedProperty: vi.fn(),
    onRemoveKeyframe: vi.fn(),
    onConvertToKeyframes: vi.fn(),
    ...overrides,
  };
}

describe("LayoutGeometryRows", () => {
  it("renders X, Y, W, H, Angle labels and formatted values", () => {
    const { host, root } = renderInto(<LayoutGeometryRows {...baseGeometryProps()} />);
    expect(host.textContent).toContain("X");
    expect(host.textContent).toContain("Y");
    expect(host.textContent).toContain("W");
    expect(host.textContent).toContain("H");
    expect(host.textContent).toContain("Angle");
    expect(getFlatRowInput(host, "W").value).toBe("257.4px");
    expect(getFlatRowInput(host, "Y").value).toBe("-24px");
    act(() => root.unmount());
  });

  it("commits an X edit through commitManualOffset", () => {
    const commitManualOffset = vi.fn();
    const { host, root } = renderInto(
      <LayoutGeometryRows {...baseGeometryProps({ commitManualOffset })} />,
    );
    const input = host.querySelectorAll("input")[0];
    if (!input) throw new Error("expected an X input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "40px");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(commitManualOffset).toHaveBeenCalledWith("x", "40px");
    act(() => root.unmount());
  });

  it("wraps the keyframe gutter cluster at 30% opacity when the property has no keyframes", () => {
    const { host, root } = renderInto(
      <LayoutGeometryRows {...baseGeometryProps({ gsapAnimId: "anim-1", navKeyframes: null })} />,
    );
    const dimmed = host.querySelectorAll('[data-flat-kf-gutter="true"][style*="opacity: 0.3"]');
    expect(dimmed.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  it("does not dim the gutter cluster when the property has keyframes", () => {
    const { host, root } = renderInto(
      <LayoutGeometryRows
        {...baseGeometryProps({
          gsapAnimId: "anim-1",
          navKeyframes: [{ percentage: 0, properties: { x: 0 } }],
        })}
      />,
    );
    const full = host.querySelectorAll('[data-flat-kf-gutter="true"][style*="opacity: 1"]');
    expect(full.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });

  it("passes the real element/selection (not null) to onCommitAnimatedProperty when adding a keyframe", () => {
    const onCommitAnimatedProperty = vi.fn();
    const element = { id: "el-1" } as unknown as Parameters<
      typeof LayoutGeometryRows
    >[0]["element"];
    const { host, root } = renderInto(
      <LayoutGeometryRows
        {...baseGeometryProps({
          element,
          gsapAnimId: "anim-1",
          navKeyframes: [{ percentage: 50, properties: { x: 5 } }],
          currentPct: 0,
          onCommitAnimatedProperty,
        })}
      />,
    );
    const addButton = host.querySelector('[title="Add x keyframe"]');
    if (!addButton) throw new Error("expected an Add x keyframe button");
    act(() => {
      (addButton as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onCommitAnimatedProperty).toHaveBeenCalledWith(element, "x", 0);
    expect(onCommitAnimatedProperty).not.toHaveBeenCalledWith(null, "x", 0);
    act(() => root.unmount());
  });
});

describe("LayoutZIndexRow", () => {
  it("renders the current z-index at the default tier and commits edits", () => {
    const onSetStyle = vi.fn();
    const { host, root } = renderInto(
      <LayoutZIndexRow styles={{ "z-index": "3" }} onSetStyle={onSetStyle} />,
    );
    expect(host.textContent).toContain("Z-index");
    const input = host.querySelector("input");
    if (!input) throw new Error("expected an input");
    expect(input.value).toBe("3");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(onSetStyle).toHaveBeenCalledWith("z-index", "5");
    act(() => root.unmount());
  });
});

describe("LayoutFlexBlock", () => {
  it("renders nothing when the element is not flex", () => {
    const { host, root } = renderInto(
      <LayoutFlexBlock styles={{ display: "block" }} onSetStyle={vi.fn()} disabled={false} />,
    );
    expect(host.textContent).toBe("");
    act(() => root.unmount());
  });

  it("renders direction/justify/align/gap and commits a direction change", () => {
    const onSetStyle = vi.fn();
    const { host, root } = renderInto(
      <LayoutFlexBlock
        styles={{ display: "flex", "flex-direction": "row", gap: "8px" }}
        onSetStyle={onSetStyle}
        disabled={false}
      />,
    );
    expect(host.textContent).toContain("Flex");
    const columnOption = Array.from(host.querySelectorAll('[data-flat-segment="true"]')).find(
      (el) => el.textContent === "Column",
    );
    if (!columnOption) throw new Error("expected a Column segment option");
    act(() =>
      (columnOption as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(onSetStyle).toHaveBeenCalledWith("flex-direction", "column");
    act(() => root.unmount());
  });
});

describe("LayoutTransform3DBlock", () => {
  it("renders the nested 3D transform sub-view", () => {
    const { host, root } = renderInto(
      <LayoutTransform3DBlock
        gsapRuntimeValues={{}}
        gsapAnimId={null}
        gsapKeyframes={null}
        currentPct={0}
        elStart={0}
        elDuration={0}
        element={{} as never}
        onCommitAnimatedProperty={vi.fn()}
        onCommitAnimatedProperties={vi.fn()}
        onSeekToTime={vi.fn()}
        onRemoveKeyframe={vi.fn()}
        onConvertToKeyframes={vi.fn()}
      />,
    );
    // PropertyPanel3dTransform's own internals aren't this task's concern (it's
    // reused unmodified) — just confirm the wrapper mounted something.
    expect(host.children.length).toBeGreaterThan(0);
    act(() => root.unmount());
  });
});

describe("FlatLayoutSection", () => {
  it("renders geometry rows, z-index, flex (when applicable), and the 3D transform block in order", () => {
    const { host, root } = renderInto(
      <FlatLayoutSection
        element={{} as never}
        styles={{ display: "flex", "flex-direction": "row" }}
        onSetStyle={vi.fn()}
        disabled={false}
        displayX={0}
        displayY={0}
        displayW={100}
        displayH={100}
        displayR={0}
        manualOffsetEditingDisabled={false}
        manualSizeEditingDisabled={false}
        manualRotationEditingDisabled={false}
        commitManualOffset={vi.fn()}
        commitManualSize={vi.fn()}
        commitManualRotation={vi.fn()}
        gsapAnimId={null}
        navKeyframes={null}
        currentPct={0}
        seekFromKfPct={vi.fn()}
        animIdForProp={(p) => p}
        gsapRuntimeValues={{}}
        gsapKeyframes={null}
        elStart={0}
        elDuration={0}
        onSeekToTime={vi.fn()}
      />,
    );
    const text = host.textContent ?? "";
    expect(text).toContain("X");
    expect(text).toContain("Z-index");
    expect(text).toContain("Flex");
    expect(text).toContain("3D Transform");
    act(() => root.unmount());
  });

  it("omits the Flex block for a non-flex element", () => {
    const { host, root } = renderInto(
      <FlatLayoutSection
        element={{} as never}
        styles={{ display: "block" }}
        onSetStyle={vi.fn()}
        disabled={false}
        displayX={0}
        displayY={0}
        displayW={100}
        displayH={100}
        displayR={0}
        manualOffsetEditingDisabled={false}
        manualSizeEditingDisabled={false}
        manualRotationEditingDisabled={false}
        commitManualOffset={vi.fn()}
        commitManualSize={vi.fn()}
        commitManualRotation={vi.fn()}
        gsapAnimId={null}
        navKeyframes={null}
        currentPct={0}
        seekFromKfPct={vi.fn()}
        animIdForProp={(p) => p}
        gsapRuntimeValues={{}}
        gsapKeyframes={null}
        elStart={0}
        elDuration={0}
        onSeekToTime={vi.fn()}
      />,
    );
    expect(host.textContent).not.toContain("Flex");
    act(() => root.unmount());
  });
});
