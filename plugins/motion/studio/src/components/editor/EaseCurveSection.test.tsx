// @vitest-environment happy-dom

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSpringBounce } from "@hyperframes/core/spring-ease";
import { parseWiggleEase } from "@hyperframes/core/wiggle-ease";
import { EaseCurveSection, MiniCurveSvg } from "./EaseCurveSection";
import { resolveEaseCurveTuple } from "./gsapAnimationConstants";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderSection(
  ease = "none",
  onCustomEaseCommit = vi.fn(),
  collidingAnimationTargets?: AnimationKeyframeTarget[],
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <EaseCurveSection
        ease={ease}
        onCustomEaseCommit={onCustomEaseCommit}
        collidingAnimationTargets={collidingAnimationTargets}
      />,
    );
  });
  return { host, root, onCustomEaseCommit };
}

// The preset grid now lives behind the Figma-style ease-type dropdown; open it
// before querying preset tiles.
function openPresetGrid(host: HTMLElement): void {
  const dropdown = host.querySelector<HTMLButtonElement>("[data-ease-type-dropdown]");
  act(() => dropdown!.click());
}

function presetPath(host: HTMLElement, id: string): string | null | undefined {
  return host
    .querySelector<HTMLButtonElement>(`[data-ease-preset-id="${id}"]`)
    ?.querySelector("path")
    ?.getAttribute("d");
}

function countPathExtrema(path: string): number {
  const values = Array.from(path.matchAll(/[ML][^,]+,([^ ]+)/g), (match) => Number(match[1]));
  const directions = values
    .slice(1)
    .map((value, index) => Math.sign(value - values[index]!))
    .filter((direction) => direction !== 0);
  return directions.filter((direction, index) => index > 0 && direction !== directions[index - 1])
    .length;
}

function renderStatefulSection(initialEase = "none", onCustomEaseCommit = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const Harness = () => {
    const [ease, setEase] = useState(initialEase);
    return (
      <EaseCurveSection
        ease={ease}
        onCustomEaseCommit={(nextEase) => {
          onCustomEaseCommit(nextEase);
          setEase(nextEase);
        }}
      />
    );
  };
  act(() => root.render(<Harness />));
  return { host, root, onCustomEaseCommit };
}

function renderControlledSection(initialEase = "none", onCustomEaseCommit = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const renderEase = (ease: string) => {
    act(() =>
      root.render(<EaseCurveSection ease={ease} onCustomEaseCommit={onCustomEaseCommit} />),
    );
  };
  renderEase(initialEase);
  return { host, root, onCustomEaseCommit, renderEase };
}

function clickMode(host: HTMLElement, mode: "curve" | "spring" | "wiggle"): void {
  const toggle = host.querySelector<HTMLButtonElement>(`[data-ease-mode="${mode}"]`);
  expect(toggle).not.toBeNull();
  act(() => toggle!.click());
}

function presetIds(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-ease-preset-id]"), (preset) =>
    preset.getAttribute("data-ease-preset-id"),
  ).filter((id): id is string => id !== null);
}

function editorLabel(host: HTMLElement): string | null {
  return host.querySelector("[data-ease-type-dropdown] span")?.textContent ?? null;
}

describe("EaseCurveSection preset grid", () => {
  it("shows the number of animations for a multi-id segment", () => {
    const { host, root } = renderSection("power2.out", vi.fn(), [
      { animationId: "move-x", tweenPercentage: 20 },
      { animationId: "move-y", tweenPercentage: 50 },
      { animationId: "fade", tweenPercentage: 80 },
    ]);

    expect(host.textContent).toContain("Applies to 3 animations");

    act(() => root.unmount());
  });

  it.each([undefined, [{ animationId: "move-x", tweenPercentage: 20 }]])(
    "does not show a property count for a non-colliding segment",
    (collidingAnimationTargets) => {
      const { host, root } = renderSection("power2.out", vi.fn(), collidingAnimationTargets);

      expect(host.textContent).not.toContain("Applies to");

      act(() => root.unmount());
    },
  );

  it.each([
    ["curve", "none", "linear", ["flow-7", "spring-bouncy"]],
    ["spring", "spring(0.42)", "spring-bouncy", ["linear", "flow-7"]],
    ["wiggle", "wiggle(3,easeInOut,0.12)", "flow-7", ["linear", "spring-bouncy"]],
  ] as const)("shows only %s presets", (_mode, ease, includedPreset, excludedPresets) => {
    const { host, root } = renderSection(ease);
    openPresetGrid(host);
    const ids = presetIds(host);

    expect(ids).toContain(includedPreset);
    for (const id of excludedPresets) expect(ids).not.toContain(id);

    act(() => root.unmount());
  });

  it("renders a wiggle graph and fields without curve handles or fallback copy", () => {
    const { host, root } = renderSection("wiggle(3,easeInOut,0.12)");
    const graph = host.querySelector<SVGElement>('svg[viewBox="0 0 216 288"]');

    expect(graph?.querySelector("path")).not.toBeNull();
    expect(graph?.querySelectorAll(".cursor-grab")).toHaveLength(0);
    expect(host.querySelector('[aria-label="Wiggle count"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Wiggle type"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Wiggle amplitude"]')).not.toBeNull();
    expect(host.textContent).not.toContain("switch to");

    act(() => root.unmount());
  });

  it.each([
    ["spring(0.6)", "Bouncy"],
    ["spring(0.37)", "Custom spring"],
    ["wiggle(2,uniform,0.3)", "Custom wiggle"],
    ["custom(M0,0 C0.1,0.2 0.8,0.9 1,1)", "Custom bezier"],
  ])("labels %s as %s", (ease, expectedLabel) => {
    const { host, root } = renderSection(ease);

    expect(editorLabel(host)).toBe(expectedLabel);

    act(() => root.unmount());
  });

  it("commits the selected preset through the existing custom-ease callback", () => {
    const { host, root, onCustomEaseCommit } = renderSection("wiggle(3,easeInOut,0.12)");
    openPresetGrid(host);
    const tile = host.querySelector<HTMLButtonElement>('[data-ease-preset-id="flow-7"]');
    expect(tile).not.toBeNull();

    act(() => tile!.click());

    expect(onCustomEaseCommit).toHaveBeenCalledTimes(1);
    expect(onCustomEaseCommit).toHaveBeenCalledWith("wiggle(7,easeInOut,0.06)");
    act(() => root.unmount());
  });

  it("commits Hold as a segment ease", () => {
    const { host, root, onCustomEaseCommit } = renderSection();
    openPresetGrid(host);
    const tile = host.querySelector<HTMLButtonElement>('[data-ease-preset-id="hold"]');
    expect(tile).not.toBeNull();

    act(() => tile!.click());

    expect(onCustomEaseCommit).toHaveBeenCalledWith("hold");
    act(() => root.unmount());
  });

  it("draws Hold as a flat step with an end jump", () => {
    const { host, root } = renderSection();
    openPresetGrid(host);
    const path = presetPath(host, "hold");

    expect(path).toBe("M3,21 L21,21 L21,3");

    act(() => root.unmount());
  });

  it("draws Hold as the same flat step in the big editor graph", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(<EaseCurveSection ease="hold" onCustomEaseCommit={vi.fn()} />);
    });

    const path = host
      .querySelector<SVGElement>('svg[viewBox="0 0 216 288"]')
      ?.querySelector("path")
      ?.getAttribute("d");
    expect(path).toBe("M16,236 L200,236 L200,52");
    expect(host.querySelectorAll('[role="slider"]')).toHaveLength(0);

    act(() => root.unmount());
  });

  it("preserves negative custom-ease control points in both curve graphs", () => {
    const ease = "custom(M0,0 C0.3,-0.5 0.7,1.5 1,1)";
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <>
          <MiniCurveSvg ease={ease} active={false} />
          <EaseCurveSection ease={ease} onCustomEaseCommit={vi.fn()} />
        </>,
      );
    });

    const miniPath = host
      .querySelector<SVGElement>('svg[viewBox="0 0 24 24"]')
      ?.querySelector("path")
      ?.getAttribute("d");
    const editorPath = host
      .querySelector<SVGElement>('svg[viewBox="0 0 216 288"]')
      ?.querySelector("path")
      ?.getAttribute("d");
    expect(miniPath).toBe("M3,21 C8.399999999999999,30 15.6,-6 21,3");
    expect(editorPath).toBe("M16,236 C71.19999999999999,328 144.79999999999998,-40 200,52");

    act(() => root.unmount());
  });

  it("draws wiggle presets as sampled oscillating glyphs", () => {
    const { host, root } = renderSection("wiggle(3,easeInOut,0.12)");
    openPresetGrid(host);
    const flow = presetPath(host, "flow-7");
    const bounce = presetPath(host, "bounce-3");

    expect(flow).toMatch(/^M.* L/);
    expect(bounce).toMatch(/^M.* L/);
    expect(flow).not.toBe(bounce);
    expect(countPathExtrema(flow!)).toBeGreaterThan(8);
    expect(countPathExtrema(bounce!)).toBeGreaterThan(8);

    act(() => root.unmount());
  });

  it("draws Flow with increasing-frequency sampled glyphs", () => {
    const { host, root } = renderSection("wiggle(3,easeInOut,0.12)");
    openPresetGrid(host);
    const flow1 = presetPath(host, "flow-1");
    const flow7 = presetPath(host, "flow-7");

    expect(flow1).toMatch(/^M.* L/);
    expect(flow7).toMatch(/^M.* L/);
    expect(flow1).not.toBe(flow7);

    act(() => root.unmount());
  });

  it("draws explicit wiggle amplitudes in sampled glyphs", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <>
          <MiniCurveSvg ease="wiggle(3,easeInOut,0.1)" active={false} />
          <MiniCurveSvg ease="wiggle(3,easeInOut,0.2)" active={false} />
        </>,
      ),
    );
    const paths = Array.from(host.querySelectorAll("path"), (path) => path.getAttribute("d"));

    expect(paths[0]).not.toBe(paths[1]);

    act(() => root.unmount());
  });

  it("commits each mode default when switching modes", () => {
    const { host, root, onCustomEaseCommit } = renderStatefulSection();

    clickMode(host, "spring");
    expect(onCustomEaseCommit).toHaveBeenLastCalledWith("spring(0.42)");
    expect(parseSpringBounce(onCustomEaseCommit.mock.lastCall![0])).toBe(0.42);

    clickMode(host, "curve");
    expect(onCustomEaseCommit).toHaveBeenLastCalledWith("custom(M0,0 C0.16,1 0.3,1 1,1)");
    expect(resolveEaseCurveTuple(onCustomEaseCommit.mock.lastCall![0])).toEqual([0.16, 1, 0.3, 1]);

    clickMode(host, "wiggle");
    expect(onCustomEaseCommit).toHaveBeenLastCalledWith("wiggle(3,easeInOut,0.12)");
    expect(parseWiggleEase(onCustomEaseCommit.mock.lastCall![0])).toEqual({
      wiggles: 3,
      type: "easeInOut",
      amplitude: 0.12,
    });
    expect(onCustomEaseCommit).toHaveBeenCalledTimes(3);

    act(() => root.unmount());
  });

  it("keeps an optimistic mode visible through its canonical prop round-trip", () => {
    const { host, root, onCustomEaseCommit, renderEase } = renderControlledSection();

    clickMode(host, "spring");
    expect(host.querySelector('[data-ease-mode="spring"]')?.getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(host.querySelector('[aria-label="Spring bounce"]')).not.toBeNull();

    renderEase("spring(0.42)");
    expect(host.querySelector('[data-ease-mode="spring"]')?.getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(host.querySelector('[aria-label="Spring bounce"]')).not.toBeNull();
    expect(onCustomEaseCommit).toHaveBeenCalledExactlyOnceWith("spring(0.42)");

    act(() => root.unmount());
  });

  // Two switches before the first commit round-trips: the commits serialize, so
  // the older value arrives while the newer one is still in flight. Repainting
  // it would flash wiggle, spring, wiggle in the panel.
  it("ignores an older in-flight commit arriving after a newer switch", () => {
    const { host, root, renderEase } = renderControlledSection();

    clickMode(host, "spring");
    clickMode(host, "wiggle");
    renderEase("spring(0.42)");

    expect(host.querySelector('[data-ease-mode="wiggle"]')?.getAttribute("aria-checked")).toBe(
      "true",
    );

    renderEase("wiggle(3,easeInOut,0.12)");
    expect(host.querySelector('[data-ease-mode="wiggle"]')?.getAttribute("aria-checked")).toBe(
      "true",
    );

    act(() => root.unmount());
  });

  // The commit is fire-and-forget: a rejected write or one that lands as a
  // no-op never changes `ease`, so nothing else can retire the optimistic
  // value and the panel would keep claiming a curve that was never saved.
  it("falls back to the committed ease when the commit never round-trips", () => {
    vi.useFakeTimers();
    try {
      const { host, root } = renderControlledSection("power2.out");

      clickMode(host, "spring");
      expect(host.querySelector('[data-ease-mode="spring"]')?.getAttribute("aria-checked")).toBe(
        "true",
      );

      act(() => vi.advanceTimersByTime(2000));

      expect(host.querySelector('[data-ease-mode="spring"]')?.getAttribute("aria-checked")).toBe(
        "false",
      );
      expect(host.querySelector('[data-ease-mode="curve"]')?.getAttribute("aria-checked")).toBe(
        "true",
      );

      act(() => root.unmount());
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces an optimistic mode when the canonical prop changes externally", () => {
    const { host, root, renderEase } = renderControlledSection();

    clickMode(host, "spring");
    renderEase("wiggle(2,uniform,0.3)");

    expect(host.querySelector('[data-ease-mode="spring"]')?.getAttribute("aria-checked")).toBe(
      "false",
    );
    expect(host.querySelector('[data-ease-mode="wiggle"]')?.getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(host.querySelector('[aria-label="Wiggle count"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Spring bounce"]')).toBeNull();

    act(() => root.unmount());
  });

  it("keeps spring bounce editing wired to the custom-ease callback", () => {
    const { host, root, onCustomEaseCommit } = renderStatefulSection("spring(0.37)");
    const bounceInput = host.querySelector<HTMLInputElement>('[aria-label="Spring bounce"]');
    expect(bounceInput).not.toBeNull();

    act(() => {
      bounceInput!.focus();
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      valueSetter?.call(bounceInput, "0.7");
      bounceInput!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onCustomEaseCommit).not.toHaveBeenCalled();
    act(() => bounceInput!.blur());
    expect(onCustomEaseCommit).toHaveBeenLastCalledWith("spring(0.7)");

    act(() => root.unmount());
  });

  it("keeps curve handles draggable and commits the edited custom curve", () => {
    const { host, root, onCustomEaseCommit } = renderSection("power2.out");
    const graph = host.querySelector<SVGSVGElement>('svg[viewBox="0 0 216 288"]');
    const handle = graph?.querySelector<SVGCircleElement>(".cursor-grab");
    expect(graph).not.toBeNull();
    expect(handle).not.toBeNull();
    vi.spyOn(graph!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 216, 288));
    handle!.setPointerCapture = vi.fn();

    act(() => {
      handle!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 46, clientY: 52 }),
      );
    });
    act(() => {
      graph!.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 108,
          clientY: 144,
        }),
      );
    });
    act(() => {
      graph!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });

    expect(onCustomEaseCommit).toHaveBeenLastCalledWith("custom(M0,0 C0.5,0.5 0.3,1 1,1)");

    act(() => root.unmount());
  });

  it("nudges curve handles with the keyboard", () => {
    const { host, root, onCustomEaseCommit } = renderSection("power2.out");
    const firstHandle = host.querySelector<SVGCircleElement>('[role="slider"]');
    expect(firstHandle).not.toBeNull();

    act(() => {
      firstHandle!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
    });

    expect(onCustomEaseCommit).toHaveBeenLastCalledWith("custom(M0,0 C0.17,1 0.3,1 1,1)");
    act(() => root.unmount());
  });

  it("closes the preset menu with Escape and returns focus to its trigger", () => {
    const { host, root } = renderSection();
    const trigger = host.querySelector<HTMLButtonElement>("[data-ease-type-dropdown]")!;
    openPresetGrid(host);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    act(() => root.unmount());
  });
});
