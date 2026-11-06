// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { freezeDragStamp, restoreDragOffset } from "./draggedGsapPosition";
import { commitStaticGsapPosition } from "./gsapDragCommit";

function stamp(element: HTMLElement, base: { x: number; y: number }) {
  element.setAttribute("data-hf-drag-gsap-base-x", String(base.x));
  element.setAttribute("data-hf-drag-gsap-base-y", String(base.y));
  element.setAttribute("data-hf-drag-initial-offset-x", "0");
  element.setAttribute("data-hf-drag-initial-offset-y", "0");
}

// A resize released at x 60 moves its anchor by -50; the next drag presses before that write is planned.
it("a commit that outlives its gesture uses the gesture's stamp, not the next one's", async () => {
  const element = document.createElement("div");
  stamp(element, { x: 60, y: 37.5 });
  const frozen = freezeDragStamp(element);
  stamp(element, { x: 10, y: 4 });
  const commitMutation = vi.fn();

  await commitStaticGsapPosition(
    { id: "target", selector: "#target", element } as DomEditSelection,
    { x: -50, y: -33.5 },
    { x: 0, y: 0 },
    "#target",
    null,
    { commitMutation, stamp: frozen },
  );

  expect(commitMutation.mock.calls[0]![1].properties).toEqual({ x: 10, y: 4 });
  restoreDragOffset(element, frozen);
  expect(element.getAttribute("data-hf-drag-initial-offset-x")).toBe("0");
});
