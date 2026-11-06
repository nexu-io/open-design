// @vitest-environment happy-dom
import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Timeline } from "./Timeline";
import { usePlayerStore } from "../store/playerStore";
import { installReactActEnvironment, mountReactHarness } from "../../hooks/domSelectionTestHarness";

installReactActEnvironment();
for (const [prop, px] of [
  ["clientWidth", 1000],
  ["clientHeight", 400],
  ["offsetWidth", 1000],
  ["offsetHeight", 400],
] as const) {
  vi.spyOn(HTMLElement.prototype, prop, "get").mockReturnValue(px);
}

const pointer = (type: string, clientX: number, clientY: number) =>
  new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX, clientY });
const band = () => document.querySelector('[style*="dashed"]');

let root: Root;
let viewport: HTMLElement;
let hostEscapes: KeyboardEvent[];
const hostListener = (e: KeyboardEvent) => {
  if (e.key === "Escape") hostEscapes.push(e);
};

beforeEach(async () => {
  usePlayerStore.setState({
    duration: 20,
    timelineReady: true,
    elements: [{ id: "intro", key: "intro", tag: "div", start: 0, duration: 1, track: 0 }],
  });
  usePlayerStore.getState().setSelectedElementId("intro");
  root = mountReactHarness(<Timeline />);
  await act(async () => new Promise((r) => setTimeout(r, 50)));
  viewport = document.querySelector<HTMLElement>("[data-timeline-scroll-viewport]")!;
  hostEscapes = [];
  document.addEventListener("keydown", hostListener);
});

afterEach(() => {
  document.removeEventListener("keydown", hostListener);
  act(() => root.unmount());
  usePlayerStore.setState({ elements: [], timelineReady: false, selectedElementId: null });
  document.body.innerHTML = "";
});

const escape = () => {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => void document.body.dispatchEvent(event));
  return event;
};

it("an escape that cancels a marquee band stops there and never reaches the host", () => {
  act(() => void viewport.dispatchEvent(pointer("pointerdown", 800, 200)));
  act(() => void viewport.dispatchEvent(pointer("pointermove", 860, 260)));
  expect(band()).not.toBeNull();

  const event = escape();

  expect(hostEscapes).toHaveLength(0);
  expect(event.defaultPrevented).toBe(true);
  expect(band()).toBeNull();
  expect(usePlayerStore.getState().selectedElementId).toBe("intro");
});

it("an escape with no band in flight still reaches the host", () => {
  const event = escape();

  expect(event.defaultPrevented).toBe(false);
  expect(hostEscapes).toHaveLength(1);
});
