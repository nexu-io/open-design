// @vitest-environment happy-dom
import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";
import { useLinkedClipPreferences } from "../../utils/linkedClipPreferences";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { OutOfSyncBadge } from "./OutOfSyncBadge";
import { createHappyDomRootHarness } from "./testRootHarness";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = createHappyDomRootHarness();
const clip = (id: string, tag: string, start: number): TimelineElement => ({
  id,
  domId: id,
  tag,
  start,
  duration: 4,
  track: 0,
  playbackStart: 0,
  syncOrigin: "lk-1",
});
const video = clip("talk", "video", 1);
const lateAudio = clip("talk-audio", "audio", 1 + 51 / 30);

afterEach(() =>
  useLinkedClipPreferences.setState({ syncIndicatorsVisible: true, compositionFps: 30 }),
);

function render(el: TimelineElement, onLinkEdit = vi.fn()) {
  usePlayerStore.getState().setElements([video, lateAudio]);
  const host = document.body.appendChild(document.createElement("div"));
  act(() =>
    harness.mount(host).render(
      <TimelineEditProvider value={{ onLinkEdit }}>
        <OutOfSyncBadge el={el} />
      </TimelineEditProvider>,
    ),
  );
  const badge = () => document.querySelector('[data-testid="out-of-sync-badge"]');
  return { badge, onLinkEdit };
}

describe("OutOfSyncBadge", () => {
  it("shows the signed offset on both halves", () => {
    useLinkedClipPreferences.setState({ compositionFps: 30 });
    expect(render(lateAudio).badge()?.textContent).toBe("+1:21");
    document.body.innerHTML = "";
    expect(render(video).badge()?.textContent).toBe("-1:21");
  });

  it("hides when the preference is off", () => {
    useLinkedClipPreferences.setState({ syncIndicatorsVisible: false });
    expect(render(lateAudio).badge()).toBeNull();
  });

  it("opens Move / Slip into Sync from a click anywhere on the badge", () => {
    const { badge, onLinkEdit } = render(lateAudio);
    act(() => badge()?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const items = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(items.map((item) => item.textContent)).toEqual(["Move into Sync", "Slip into Sync"]);
    act(() => items[0]?.click());
    expect(onLinkEdit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "move-into-sync", element: lateAudio, start: 1 }),
    );
  });

  it("slips from a right-click, and the click never reaches the clip", () => {
    const clipClick = vi.fn();
    document.body.addEventListener("contextmenu", clipClick);
    const { badge, onLinkEdit } = render(lateAudio);
    act(() => badge()?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true })));
    expect(clipClick).not.toHaveBeenCalled();
    const slip = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1];
    act(() => slip?.click());
    const edit = onLinkEdit.mock.calls[0]?.[0];
    expect(edit.kind).toBe("slip-into-sync");
    expect(edit.mediaStart).toBeCloseTo(51 / 30);
    document.body.removeEventListener("contextmenu", clipClick);
  });

  it("flips the menu above the pointer near the bottom edge", () => {
    const { badge } = render(lateAudio);
    const y = window.innerHeight - 10;
    act(() => badge()?.dispatchEvent(new MouseEvent("click", { bubbles: true, clientY: y })));
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    const top = Number.parseFloat(menu?.style.top ?? "");
    expect(top).toBeLessThan(y);
    expect(top).toBeGreaterThanOrEqual(0);
  });
});
