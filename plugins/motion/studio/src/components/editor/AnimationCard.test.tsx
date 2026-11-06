// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { AnimationCard } from "./AnimationCard";
import { EASE_PRESETS } from "./easePresetLibrary";
import type { AnimationKeyframeTarget } from "../../hooks/gsapTweenSynth";

const trackStudioSegmentEaseEdit = vi.hoisted(() => vi.fn());
vi.mock("../../telemetry/events", () => ({ trackStudioSegmentEaseEdit }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANIMATION: GsapAnimation = {
  id: "position-tween",
  targetSelector: "#clip-1",
  method: "to",
  position: 0,
  duration: 2,
  ease: "power1.out",
  properties: { x: 200 },
  keyframes: {
    format: "percentage",
    keyframes: [
      { percentage: 0, properties: { x: 0 } },
      { percentage: 50, properties: { x: 100 } },
      { percentage: 100, properties: { x: 200 } },
    ],
  },
};

const FLAT_ANIMATION: GsapAnimation = {
  ...ANIMATION,
  id: "flat-position-tween",
  keyframes: undefined,
};

afterEach(() => {
  document.body.innerHTML = "";
  trackStudioSegmentEaseEdit.mockClear();
});

function renderFocusCard(
  focusedSegment: {
    tweenPercentage: number;
    collidingAnimationTargets?: AnimationKeyframeTarget[];
  } | null,
  onEaseCommit = vi.fn(),
  defaultExpanded = false,
  animation = ANIMATION,
  onUpdateMeta = vi.fn(),
  onUpdateSegmentEase = vi.fn(),
) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (nextFocusedSegment: { tweenPercentage: number } | null) => {
    act(() => {
      root.render(
        <AnimationCard
          animation={animation}
          defaultExpanded={defaultExpanded}
          focusedSegment={nextFocusedSegment}
          onFocusSegmentConsumed={vi.fn()}
          onUpdateProperty={vi.fn()}
          onUpdateMeta={onUpdateMeta}
          onDeleteAnimation={vi.fn()}
          onAddProperty={vi.fn()}
          onRemoveProperty={vi.fn()}
          onUpdateKeyframeEase={onEaseCommit}
          onUpdateSegmentEase={onUpdateSegmentEase}
        />,
      );
    });
  };
  render(focusedSegment);
  return { host, root, render };
}

function findButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(text),
  );
}

function openSegment(host: HTMLElement, label: string): void {
  const segment = findButton(host, label);
  expect(segment).toBeDefined();
  act(() => segment?.click());
}

function selectPreset(host: HTMLElement, presetId: string): string {
  const presetConfig = EASE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!presetConfig) throw new Error(`Missing ease preset: ${presetId}`);
  const dropdown = host.querySelector<HTMLButtonElement>("[data-ease-type-dropdown]");
  expect(dropdown).not.toBeNull();
  act(() => dropdown?.click());

  const preset = host.querySelector<HTMLButtonElement>(`[data-ease-preset-id="${presetId}"]`);
  expect(preset).not.toBeNull();
  act(() => preset?.click());
  return presetConfig.ease;
}

const noop = () => {};

/** Every test mounts the same card; only expansion, flat mode, and the spies differ. */
function renderCard({
  animation = baseAnimation(),
  defaultExpanded = true,
  flat,
  onUpdateMeta = vi.fn(),
  onUpdateKeyframeEase = vi.fn(),
  onDeleteAnimation = noop,
}: {
  animation?: GsapAnimation;
  defaultExpanded?: boolean;
  flat?: boolean;
  onUpdateMeta?: Mock;
  onUpdateKeyframeEase?: Mock;
  onDeleteAnimation?: (id: string) => void;
} = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <AnimationCard
        animation={animation}
        defaultExpanded={defaultExpanded}
        flat={flat}
        onUpdateProperty={noop}
        onUpdateMeta={onUpdateMeta}
        onDeleteAnimation={onDeleteAnimation}
        onAddProperty={noop}
        onRemoveProperty={noop}
        onUpdateKeyframeEase={onUpdateKeyframeEase}
      />,
    );
  });
  return { host, root };
}

function restoreScrollIntoView(descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", descriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
}

describe("AnimationCard", () => {
  it("heads a keyframed card with the segment ease and names the run ease on its own line", () => {
    const view = renderFocusCard(null, vi.fn(), true);
    expect(view.host.querySelector("[data-card-ease]")?.textContent).toBe("power1.inOut");
    expect(view.host.querySelector("[data-card-run-ease]")?.textContent).toBe(
      "Run ease: power1.out",
    );
    act(() => view.root.unmount());
  });

  it("heads a keyframed card Mixed when its segments differ, with no run line for a linear run", () => {
    const animation: GsapAnimation = {
      ...ANIMATION,
      ease: undefined,
      keyframes: {
        format: "percentage",
        keyframes: [
          { percentage: 0, properties: { x: 0 } },
          { percentage: 50, properties: { x: 100 }, ease: "expo.in" },
          { percentage: 100, properties: { x: 200 } },
        ],
      },
    };
    const view = renderFocusCard(null, vi.fn(), true, animation);
    expect(view.host.querySelector("[data-card-ease]")?.textContent).toBe("Mixed");
    expect(view.host.querySelector("[data-card-run-ease]")).toBeNull();
    act(() => view.root.unmount());
  });

  it("labels segments with rounded percentages, never float noise or exponents", () => {
    const animation: GsapAnimation = {
      ...ANIMATION,
      keyframes: {
        format: "percentage",
        keyframes: [
          { percentage: 0, properties: { x: 0 } },
          { percentage: 1.2860082304526747e-7, properties: { x: 1 } },
          { percentage: 0.13484773662551455, properties: { x: 2 } },
          { percentage: 100, properties: { x: 200 } },
        ],
      },
    };
    const view = renderFocusCard(null, vi.fn(), true, animation);
    const labels = [
      ...view.host.querySelectorAll("[data-ease-segment-pct] button span:first-child"),
    ];
    expect(labels.map((label) => label.textContent)).toEqual([
      "0% → <0.001%",
      "<0.001% → 0.135%",
      "0.135% → 100%",
    ]);
    act(() => view.root.unmount());
  });

  it("labels an unset segment with the ease GSAP plays, not the tween's run ease", () => {
    const view = renderFocusCard(null, vi.fn(), true);
    const labels = [...view.host.querySelectorAll("[data-ease-segment-pct] button span.ml-auto")];
    expect(labels.map((label) => label.textContent)).toEqual(["power1.inOut", "power1.inOut"]);
    act(() => view.root.unmount());
  });

  it("scrolls a focused segment into view but not a manually toggled segment", () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    const view = renderFocusCard({ tweenPercentage: 50 });
    try {
      expect(scrollIntoView).toHaveBeenCalledOnce();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", behavior: "smooth" });

      view.render(null);
      const manualToggle = findButton(view.host, "50% → 100%");
      expect(manualToggle).toBeDefined();
      act(() => manualToggle?.click());
      expect(scrollIntoView).toHaveBeenCalledOnce();
    } finally {
      act(() => view.root.unmount());
      restoreScrollIntoView(originalScrollIntoView);
    }
  });

  it("tracks a committed segment ease alongside the existing update", () => {
    const onEaseCommit = vi.fn();
    const view = renderFocusCard(null, onEaseCommit, true);
    openSegment(view.host, "0% → 50%");
    const ease = selectPreset(view.host, "quad-out");

    expect(onEaseCommit).toHaveBeenCalledWith(ANIMATION.id, 50, ease);
    expect(trackStudioSegmentEaseEdit).toHaveBeenCalledWith({ action: "commit", ease });
    act(() => view.root.unmount());
  });

  it("commits a focused multi-id segment ease through the bulk callback", () => {
    const onUpdateKeyframeEase = vi.fn();
    const onUpdateSegmentEase = vi.fn();
    const collidingAnimationTargets = [
      { animationId: ANIMATION.id, tweenPercentage: 50 },
      { animationId: "scale-tween", tweenPercentage: 75 },
      { animationId: "opacity-tween", tweenPercentage: 25 },
    ];
    const view = renderFocusCard(
      { tweenPercentage: 50, collidingAnimationTargets },
      onUpdateKeyframeEase,
      false,
      ANIMATION,
      vi.fn(),
      onUpdateSegmentEase,
    );
    const ease = selectPreset(view.host, "quad-out");

    expect(onUpdateSegmentEase).toHaveBeenCalledExactlyOnceWith(collidingAnimationTargets, ease);
    expect(onUpdateKeyframeEase).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });

  it("keeps a focused single-id segment ease on the single callback", () => {
    const onUpdateKeyframeEase = vi.fn();
    const onUpdateSegmentEase = vi.fn();
    const view = renderFocusCard(
      {
        tweenPercentage: 50,
        collidingAnimationTargets: [{ animationId: ANIMATION.id, tweenPercentage: 50 }],
      },
      onUpdateKeyframeEase,
      false,
      ANIMATION,
      vi.fn(),
      onUpdateSegmentEase,
    );
    const ease = selectPreset(view.host, "quad-out");

    expect(onUpdateKeyframeEase).toHaveBeenCalledExactlyOnceWith(ANIMATION.id, 50, ease);
    expect(onUpdateSegmentEase).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });

  it("commits a focused flat tween segment ease through tween metadata", () => {
    const onUpdateMeta = vi.fn();
    const onUpdateKeyframeEase = vi.fn();
    const view = renderFocusCard(
      { tweenPercentage: 100 },
      onUpdateKeyframeEase,
      false,
      FLAT_ANIMATION,
      onUpdateMeta,
    );
    const ease = selectPreset(view.host, "quad-out");

    expect(onUpdateMeta).toHaveBeenCalledExactlyOnceWith(FLAT_ANIMATION.id, { ease });
    expect(onUpdateKeyframeEase).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });
});

function baseAnimation(overrides: Partial<GsapAnimation> = {}): GsapAnimation {
  return {
    id: "anim-1",
    method: "to",
    position: 0.8,
    duration: 1.2,
    ease: "power2.out",
    properties: { opacity: 1 },
    ...overrides,
  } as GsapAnimation;
}

describe("AnimationCard ease editing", () => {
  it.each([
    ["spring", "power2.out", "spring(0.42)", "Spring bounce"],
    ["wiggle", "power2.out", "wiggle(3,easeInOut,0.12)", "Wiggle count"],
    ["curve", "spring(0.6)", "custom(M0,0 C0.16,1 0.3,1 1,1)", "Cubic bezier control points"],
  ] as const)(
    "commits and immediately displays the %s default when a keyframe segment switches mode",
    (mode, currentEase, ease, fieldLabel) => {
      const onUpdateKeyframeEase = vi.fn();
      const animation = baseAnimation({
        keyframes: {
          format: "percentage",
          keyframes: [
            { percentage: 0, properties: { opacity: 0 } },
            { percentage: 50, properties: { opacity: 0.5 }, ease: currentEase },
            { percentage: 100, properties: { opacity: 1 } },
          ],
        },
      });
      const view = renderFocusCard(null, onUpdateKeyframeEase, true, animation);

      openSegment(view.host, "0% → 50%");
      const modeButton = view.host.querySelector<HTMLButtonElement>(`[data-ease-mode="${mode}"]`);
      expect(modeButton).not.toBeNull();
      act(() => modeButton?.click());

      expect(onUpdateKeyframeEase).toHaveBeenCalledExactlyOnceWith(animation.id, 50, ease);
      expect(modeButton?.getAttribute("aria-checked")).toBe("true");
      expect(view.host.querySelector(`[aria-label="${fieldLabel}"]`)).not.toBeNull();
      act(() => view.root.unmount());
    },
  );

  it("commits one preset change to the selected keyframe segment", () => {
    const onUpdateKeyframeEase = vi.fn();
    const animation = baseAnimation({
      keyframes: {
        format: "percentage",
        keyframes: [
          { percentage: 0, properties: { opacity: 0 } },
          { percentage: 50, properties: { opacity: 0.5 } },
          { percentage: 100, properties: { opacity: 1 } },
        ],
      },
    });
    const view = renderCard({ animation, onUpdateKeyframeEase });

    openSegment(view.host, "0% → 50%");
    const ease = selectPreset(view.host, "quad-out");

    expect(onUpdateKeyframeEase).toHaveBeenCalledExactlyOnceWith(animation.id, 50, ease);
    expect(trackStudioSegmentEaseEdit).toHaveBeenCalledExactlyOnceWith({
      action: "commit",
      ease,
    });
    act(() => view.root.unmount());
  });

  it("commits one preset change through flat tween metadata", () => {
    const onUpdateMeta = vi.fn();
    const onUpdateKeyframeEase = vi.fn();
    const animation = baseAnimation({ id: "flat-tween" });
    const view = renderCard({
      animation,
      flat: true,
      onUpdateMeta,
      onUpdateKeyframeEase,
    });

    const ease = selectPreset(view.host, "quad-out");

    expect(onUpdateMeta).toHaveBeenCalledExactlyOnceWith(animation.id, { ease });
    expect(onUpdateKeyframeEase).not.toHaveBeenCalled();
    expect(trackStudioSegmentEaseEdit).not.toHaveBeenCalled();
    act(() => view.root.unmount());
  });
});

describe("AnimationCard flat branch", () => {
  it("renders a mint border-left and panel-token colors when flat", () => {
    const { host, root } = renderCard({ defaultExpanded: false, flat: true });
    const card = host.querySelector('[data-flat-effect-card="true"]');
    expect(card).not.toBeNull();
    expect(card?.className).toContain("border-panel-accent");
    act(() => root.unmount());
  });

  it("still renders the legacy (non-flat) appearance when flat is omitted", () => {
    const { host, root } = renderCard({ defaultExpanded: false });
    expect(host.querySelector('[data-flat-effect-card="true"]')).toBeNull();
    expect(host.textContent).toContain("power2.out");
    act(() => root.unmount());
  });

  it("toggles expanded state when the collapsed header button is clicked, in both modes", () => {
    for (const flat of [false, true]) {
      const { host, root } = renderCard({ defaultExpanded: false, flat: flat || undefined });
      expect(host.textContent).not.toContain("Remove");
      const button = host.querySelector("button");
      expect(button).not.toBeNull();
      act(() => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(host.textContent).toContain("Remove");
      act(() => root.unmount());
    }
  });

  it("invokes onDeleteAnimation with the animation id when Remove is clicked, in flat mode", () => {
    const onDeleteAnimation = vi.fn();
    const { host, root } = renderCard({ flat: true, onDeleteAnimation });
    const buttons = Array.from(host.querySelectorAll("button"));
    const removeButton = buttons.find((b) => b.textContent === "Remove");
    expect(removeButton).not.toBeUndefined();
    act(() => {
      removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onDeleteAnimation).toHaveBeenCalledWith("anim-1");
    act(() => root.unmount());
  });
});
