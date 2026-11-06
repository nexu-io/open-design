// @vitest-environment happy-dom

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { TIMELINE_COMPOSITION_MIME } from "../../utils/timelineCompositionDrop";
import { mountCompositionsTab } from "./compositionsTabTestUtils";

function mount(onSelect = vi.fn(), onAddToTimeline = vi.fn()) {
  const host = mountCompositionsTab({ onSelect, onAddToTimeline });
  const card = host.querySelector<HTMLElement>('[draggable="true"]');
  if (!card) throw new Error("composition card did not render");
  return { host, card, onSelect, onAddToTimeline };
}

describe("composition card drag", () => {
  it("mounts one live preview only after sustained hover and removes it on leave", () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { host, card } = mount();
      act(() => {
        card.dispatchEvent(new Event("pointerover", { bubbles: true }));
        vi.advanceTimersByTime(300);
      });
      expect(host.querySelectorAll("iframe")).toHaveLength(1);

      act(() => {
        card.dispatchEvent(new Event("pointerout", { bubbles: true }));
      });
      expect(host.querySelector("iframe")).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      consoleError.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps ordinary click navigation", () => {
    const { card, onSelect } = mount();
    act(() => card.click());
    expect(onSelect).toHaveBeenCalledWith("compositions/headline.html");
  });

  it("emits only source identity and suppresses the click following a drag", () => {
    const { card, onSelect } = mount();
    const data = new Map<string, string>();
    const event = new Event("dragstart", { bubbles: true });
    Object.defineProperty(event, "dataTransfer", {
      value: {
        effectAllowed: "none",
        setData: (type: string, value: string) => data.set(type, value),
      },
    });
    act(() => {
      card.dispatchEvent(event);
      card.click();
    });

    expect(JSON.parse(data.get(TIMELINE_COMPOSITION_MIME) ?? "null")).toEqual({
      sourcePath: "compositions/headline.html",
    });
    expect(card.className).toContain("select-none");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers pointer and keyboard add-at-playhead actions without opening the card", () => {
    const { host, onSelect, onAddToTimeline } = mount();
    const add = host.querySelector<HTMLButtonElement>(
      '[aria-label="Add headline to timeline at playhead"]',
    );
    if (!add) throw new Error("add action did not render");
    act(() => {
      add.click();
      add.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      add.click();
    });

    expect(onAddToTimeline).toHaveBeenCalledTimes(2);
    expect(onAddToTimeline).toHaveBeenLastCalledWith("compositions/headline.html");
    expect(onSelect).not.toHaveBeenCalled();
  });
});
