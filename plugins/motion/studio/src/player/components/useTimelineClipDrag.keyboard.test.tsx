// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useTimelineClipDrag } from "./useTimelineClipDrag";
import { createTimelineRowGeometry } from "./timelineLayout";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { configureTimelineTestViewport } from "./timelineTestViewport";
import { buildTimelineTrackInsertLayout } from "./timelineTrackInsertLayout";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  usePlayerStore.getState().reset();
  document.body.replaceChildren();
});

function mount(order = [0, 1, 2]) {
  const elements: TimelineElement[] = [
    { id: "top", tag: "div", start: 0, duration: 3, track: 0 },
    { id: "hero", domId: "hero", tag: "div", start: 2, duration: 3, track: 1 },
    { id: "tail", tag: "div", start: 6, duration: 3, track: 1 },
    { id: "bottom", tag: "div", start: 0, duration: 3, track: 2 },
  ];
  const groups = order.includes(0.5) ? [{ anchorKey: 0.5, memberTracks: [1, 3] }] : [];
  if (groups.length) {
    for (const element of elements) element.tag = "audio";
    elements[1].audioGroup = "voice";
    elements[2].audioGroup = "voice";
    elements.push({
      id: "member",
      tag: "audio",
      start: 0,
      duration: 2,
      track: 3,
      audioGroup: "voice",
    });
    elements.push({ id: "extra", tag: "audio", start: 0, duration: 2, track: 4 });
  }
  for (const element of elements) element.domId = element.id;
  usePlayerStore.getState().setElements(elements);
  const scroll = document.createElement("div");
  configureTimelineTestViewport(scroll, 400);
  const clip = document.createElement("div");
  clip.dataset.elId = "hero";
  clip.dataset.timelineFocusId = "clip-hero";
  clip.tabIndex = 0;
  scroll.append(clip);
  document.body.append(scroll);
  const host = document.createElement("div");
  const root = createRoot(host);
  const onMoveElements = vi.fn();
  const onBlockedEditAttempt = vi.fn();
  const trackOrderRef = { current: order };
  const trackInsertLayoutRef = { current: buildTimelineTrackInsertLayout(order, groups) };
  let state: ReturnType<typeof useTimelineClipDrag>;
  function Probe() {
    state = useTimelineClipDrag({
      scrollRef: { current: scroll },
      ppsRef: { current: 100 },
      durationRef: { current: 12 },
      trackOrderRef,
      trackInsertLayoutRef,
      rowGeometryRef: {
        current: createTimelineRowGeometry(
          trackOrderRef.current,
          trackOrderRef.current.map(() => 48),
          { top: 0 },
        ),
      },
      onMoveElement: vi.fn(),
      onMoveElements,
      onBlockedEditAttempt,
      setShowPopover: () => {},
      setRangeSelectionRef: { current: null },
    });
    return null;
  }
  act(() => root.render(<Probe />));
  clip.focus();
  const key = (key: string) =>
    act(() => {
      clip.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
  return {
    key,
    clip,
    onMoveElements,
    onBlockedEditAttempt,
    root,
    elements,
    changeOrder(next: number[]) {
      trackOrderRef.current = next;
      trackInsertLayoutRef.current = buildTimelineTrackInsertLayout(next, groups);
      act(() => root.render(<Probe />));
    },
    get drag() {
      return state.draggedClip;
    },
  };
}

function expectCanceledPickup(view: ReturnType<typeof mount>) {
  expect(view.drag).toBeNull();
  expect(view.onMoveElements).not.toHaveBeenCalled();
  expect(usePlayerStore.getState().elements).toEqual(view.elements);
}

it("cancels pickup when collapsing a group changes the displayed seam", () => {
  const view = mount([0, 0.5, 1, 3, 2, 4]);
  view.key(" ");
  view.key("ArrowDown");
  expect(view.drag?.insertRow).toBe(4);
  view.changeOrder([0, 0.5, 2, 4]);
  expect(view.drag).toBeNull();
  view.key("Enter");
  expectCanceledPickup(view);
  act(() => view.root.unmount());
});

it("picks up with Space, chooses a seam, then commits at that index once with Enter", async () => {
  const view = mount();
  view.key(" ");
  expect(view.drag).toMatchObject({
    pointerId: null,
    started: true,
    insertRow: 1,
    previewStart: 2,
  });
  view.key("ArrowUp");
  expect(view.drag?.insertRow).toBe(0);
  await act(async () => view.key("Enter"));
  expect(view.drag).toBeNull();
  expect(view.onMoveElements).toHaveBeenCalledTimes(1);
  const moved = usePlayerStore.getState().elements;
  expect(moved.find((e) => e.id === "hero")?.track).toBe(0);
  expect(moved.find((e) => e.id === "top")?.track).toBe(1);
  view.key("Enter");
  expect(view.onMoveElements).toHaveBeenCalledTimes(1);
  act(() => view.root.unmount());
});

it("Escape cancels the opened lane without moving a clip or adding a track", () => {
  const view = mount();
  view.key(" ");
  view.key("ArrowDown");
  expect(view.drag?.insertRow).toBe(2);
  view.key("Escape");
  expectCanceledPickup(view);
  act(() => view.root.unmount());
});

it("leaves Space on a nested fade slider to the slider", () => {
  const view = mount();
  const slider = document.createElement("div");
  slider.setAttribute("role", "slider");
  slider.tabIndex = 0;
  view.clip.append(slider);
  slider.focus();
  const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
  act(() => {
    slider.dispatchEvent(event);
  });
  expect(view.drag).toBeNull();
  expect(event.defaultPrevented).toBe(false);
  act(() => view.root.unmount());
});

it("picks up a clip held in a selection of any size", () => {
  const view = mount();
  usePlayerStore.getState().setSelection(["top", "hero", "tail", "bottom"], "hero");
  view.key(" ");
  expect(view.drag).not.toBeNull();
  expect(view.onBlockedEditAttempt).not.toHaveBeenCalled();
  act(() => view.root.unmount());
});
