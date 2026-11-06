// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import { DesignPanelInputProvider } from "../../contexts/DesignPanelInputContext";
import { usePlayerStore } from "../../player/store/playerStore";
import { GsapAnimationSection } from "./GsapAnimationSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const animationCardMock = vi.hoisted(() => ({
  consumers: [] as Array<{ tweenPercentage: number | null; consume: () => void }>,
}));

vi.mock("./AnimationCard", () => ({
  AnimationCard: ({
    animation,
    focusedSegment,
    onFocusSegmentConsumed,
  }: {
    animation: GsapAnimation;
    focusedSegment: { tweenPercentage: number } | null;
    onFocusSegmentConsumed: () => void;
  }) => {
    animationCardMock.consumers.push({
      tweenPercentage: focusedSegment?.tweenPercentage ?? null,
      consume: onFocusSegmentConsumed,
    });
    return (
      <button
        type="button"
        data-testid={`animation-${animation.id}`}
        data-focused={focusedSegment ? String(focusedSegment.tweenPercentage) : ""}
        onClick={onFocusSegmentConsumed}
      />
    );
  },
}));

vi.mock("./GsapAddAnimationControl", () => ({ GsapAddAnimationControl: () => null }));

afterEach(() => {
  document.body.innerHTML = "";
  animationCardMock.consumers = [];
  usePlayerStore.getState().reset();
});

const sharedAnimation: GsapAnimation = {
  id: "shared-animation",
  targetSelector: ".shared",
  method: "to",
  position: 0,
  properties: { x: 100 },
};

const requiredCallbacks = {
  onAddAnimation: vi.fn(),
  onUpdateProperty: vi.fn(),
  onUpdateMeta: vi.fn(),
  onDeleteAnimation: vi.fn(),
  onAddProperty: vi.fn(),
  onRemoveProperty: vi.fn(),
};

function renderSection(elementId: string) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (nextElementId: string) => {
    act(() => {
      root.render(
        <DesignPanelInputProvider section="test">
          <GsapAnimationSection
            {...requiredCallbacks}
            elementId={nextElementId}
            animations={[sharedAnimation]}
          />
        </DesignPanelInputProvider>,
      );
    });
  };
  render(elementId);
  return { host, root, render };
}

function focusSharedAnimation(elementId: string, tweenPercentage: number) {
  const store = usePlayerStore.getState();
  store.beginTimelineSession("project-a");
  store.setSelectedElementId(elementId);
  store.setFocusedEaseSegment({
    elementId,
    animationId: sharedAnimation.id,
    tweenPercentage,
  });
  return store;
}

describe("GsapAnimationSection", () => {
  it("consumes a shared animation id only for the focused element", () => {
    usePlayerStore.getState().beginTimelineSession("project-a");
    usePlayerStore.getState().setSelectedElementId("index.html#second");
    usePlayerStore.getState().setFocusedEaseSegment({
      elementId: "index.html#second",
      animationId: sharedAnimation.id,
      tweenPercentage: 50,
    });
    const view = renderSection("index.html#first");
    const card = view.host.querySelector<HTMLButtonElement>(
      "[data-testid='animation-shared-animation']",
    );
    if (!card) throw new Error("expected animation card");

    expect(card.dataset.focused).toBe("");
    act(() => card.click());
    expect(usePlayerStore.getState().focusedEaseSegment?.elementId).toBe("index.html#second");

    view.render("index.html#second");
    expect(card.dataset.focused).toBe("50");
    act(() => card.click());
    expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
    act(() => view.root.unmount());
  });

  it("does not let an older consumer clear a newer request", () => {
    const store = focusSharedAnimation("index.html#first", 25);
    const view = renderSection("index.html#first");
    const staleConsumer = animationCardMock.consumers.at(-1)?.consume;
    if (!staleConsumer) throw new Error("expected first focus consumer");

    act(() => {
      store.setFocusedEaseSegment({
        elementId: "index.html#first",
        animationId: sharedAnimation.id,
        tweenPercentage: 75,
      });
    });
    const current = usePlayerStore.getState().focusedEaseSegment;
    if (!current) throw new Error("expected replacement request");

    act(() => staleConsumer());
    expect(usePlayerStore.getState().focusedEaseSegment).toBe(current);

    const currentConsumer = animationCardMock.consumers.at(-1)?.consume;
    if (!currentConsumer) throw new Error("expected replacement focus consumer");
    act(() => currentConsumer());
    expect(usePlayerStore.getState().focusedEaseSegment).toBeNull();
    act(() => view.root.unmount());
  });

  it("keeps the focus consumer stable across unrelated parent renders", () => {
    focusSharedAnimation("index.html#first", 25);
    const view = renderSection("index.html#first");
    const firstConsumer = animationCardMock.consumers.at(-1)?.consume;
    if (!firstConsumer) throw new Error("expected focus consumer");

    view.render("index.html#first");

    expect(animationCardMock.consumers.at(-1)?.consume).toBe(firstConsumer);
    act(() => view.root.unmount());
  });

  it("rejects a request from an earlier project session", () => {
    const store = usePlayerStore.getState();
    store.beginTimelineSession("project-a");
    store.setSelectedElementId("index.html#first");
    store.setFocusedEaseSegment({
      elementId: "index.html#first",
      animationId: sharedAnimation.id,
      tweenPercentage: 50,
    });
    const staleRequest = usePlayerStore.getState().focusedEaseSegment;
    if (!staleRequest) throw new Error("expected request");

    const view = renderSection("index.html#first");

    act(() => {
      store.beginTimelineSession("project-b");
      store.setSelectedElementId("index.html#first");
      usePlayerStore.setState({ focusedEaseSegment: staleRequest });
    });

    const card = view.host.querySelector<HTMLButtonElement>(
      "[data-testid='animation-shared-animation']",
    );
    expect(card?.dataset.focused).toBe("");
    expect(usePlayerStore.getState().focusedEaseSegment).toBe(staleRequest);
    act(() => view.root.unmount());
  });
});
