// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import {
  KeyframeDiamondContextMenu,
  type KeyframeDiamondContextMenuState,
} from "./KeyframeDiamondContextMenu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

const element = { id: "box", start: 0, duration: 2, track: 0 } as unknown as TimelineElement;

const state: KeyframeDiamondContextMenuState = {
  x: 10,
  y: 10,
  element,
  elementId: "box",
  percentage: 50,
  tweenPercentage: 25,
  propertyGroup: "position",
  animationId: "box-to-1-position",
};

function clickMenuItem(label: string, props: Partial<Record<string, unknown>>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <KeyframeDiamondContextMenu
        state={state}
        onClose={() => {}}
        onDelete={vi.fn()}
        onDeleteAll={vi.fn()}
        {...props}
      />,
    ),
  );
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  );
  act(() => button?.click());
  act(() => root.unmount());
  host.remove();
}

describe("KeyframeDiamondContextMenu", () => {
  // Two animations can carry a keyframe at the same clip percentage. Dropping the
  // property group / tween percentage / animation id here sends the mutation back
  // to first-match-by-percentage, which retimes or deletes the wrong tween.
  it("hands every action the full keyframe identity, not just the percentage", () => {
    const onDelete = vi.fn();
    const onMoveToPlayhead = vi.fn();

    clickMenuItem("Delete Keyframe", { onDelete });
    clickMenuItem("Move to Playhead", { onMoveToPlayhead });

    const target = {
      percentage: 50,
      tweenPercentage: 25,
      propertyGroup: "position",
      animationId: "box-to-1-position",
    };
    expect(onDelete).toHaveBeenCalledWith("box", target);
    expect(onMoveToPlayhead).toHaveBeenCalledWith(element, target);
  });

  // An arc waypoint on a two-anchor path cannot be dropped on its own, so the
  // caller withholds onDelete rather than offering an entry that does nothing.
  it("hides the single-node delete when no handler is given", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <KeyframeDiamondContextMenu state={state} onClose={() => {}} onDeleteAll={vi.fn()} />,
      ),
    );

    const labels = Array.from(document.body.querySelectorAll("button")).map(
      (button) => button.textContent,
    );
    expect(labels).toEqual(["Delete All Keyframes"]);

    act(() => root.unmount());
    host.remove();
  });

  // The layer-wide delete takes every keyframed tween. Opened from a diamond it
  // has to stay on that diamond's own lane, or right-clicking the opacity lane
  // silently clears position too.
  it("deletes all keyframes from the animation that opened the menu", () => {
    const onDeleteAll = vi.fn();

    clickMenuItem("Delete All Keyframes", { onDeleteAll });

    expect(onDeleteAll).toHaveBeenCalledExactlyOnceWith(element, "box-to-1-position");
  });
});
