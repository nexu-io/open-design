// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import { resolvePlaybackAdapter } from "./playbackAdapterResolution";

function timeline(duration: number) {
  return {
    duration: vi.fn(() => duration),
    time: vi.fn(() => 0),
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    isActive: vi.fn(() => false),
  };
}

describe("resolvePlaybackAdapter", () => {
  it("uses the __timelines key matching the document root, not the first key", () => {
    const first = timeline(12);
    const second = timeline(12);
    const third = timeline(12);
    const iframe = document.createElement("iframe");
    const doc = document.implementation.createHTMLDocument("preview");
    doc.body.innerHTML = '<div data-composition-id="second" data-duration="10"></div>';
    Object.defineProperty(iframe, "contentDocument", { configurable: true, value: doc });
    const win = {
      __timelines: { first, second, third },
    } as never;

    const adapter = resolvePlaybackAdapter(iframe, win, {
      cache: { current: null },
      warned: { current: false },
    });

    expect(adapter).not.toBeNull();
    adapter?.seek(7);
    expect(second.seek).toHaveBeenCalledWith(7);
    expect(first.seek).not.toHaveBeenCalled();
    expect(third.seek).not.toHaveBeenCalled();
  });
});
