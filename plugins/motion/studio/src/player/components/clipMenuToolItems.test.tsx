// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TimelineElement } from "../store/playerStore";
import { TimelineEditProvider } from "../../contexts/TimelineEditContext";
import { useCropPresetBarStore } from "../../components/editor/cropPresetStore";
import { ClipMenuToolItems, type ClipMenuToolGroup } from "./clipMenuToolItems";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

let root: Root | null = null;

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  useCropPresetBarStore.getState().close();
});

const video: TimelineElement = {
  id: "talk",
  tag: "video",
  start: 0,
  duration: 6,
  track: 0,
  hasAudio: true,
};

function renderItems(
  group: ClipMenuToolGroup,
  element: TimelineElement,
  currentTime = 2,
  withLive = true,
) {
  const setLive = vi.fn((_el: TimelineElement, _attr: string, _value: string | null) => undefined);
  const revertLive = vi.fn((_el: TimelineElement, _attr: string) => undefined);
  const setQuiet = vi.fn(
    async (_el: TimelineElement, _attr: string, _value: string | null, _label: string) => undefined,
  );
  const onClose = vi.fn();
  const freeze = vi.fn((_el: TimelineElement, _time: number) => undefined);
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <TimelineEditProvider
        value={{
          onSetElementAttributeQuiet: setQuiet,
          onFreezeFrame: freeze,
          ...(withLive
            ? { onSetElementAttributeLive: setLive, onRevertElementAttributeLive: revertLive }
            : {}),
        }}
      >
        <ClipMenuToolItems
          group={group}
          element={element}
          currentTime={currentTime}
          onClose={onClose}
        />
      </TimelineEditProvider>,
    );
  });
  return { setQuiet, onClose, freeze, setLive, revertLive };
}

function openSubmenu(label: string) {
  const row = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(
    (button) => button.textContent?.startsWith(label),
  );
  act(() => row?.click());
}

function pick(text: string) {
  const item = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
  ).find((button) => button.textContent?.endsWith(text));
  act(() => item?.click());
}

describe("ClipMenuToolItems", () => {
  it("Voice writes a single-choice data-fx-chain on a video with sound", () => {
    const { setQuiet, onClose } = renderItems("sound", video);
    openSubmenu("Voice");
    pick("Clean");
    const [element, attr, value] = setQuiet.mock.calls[0] ?? [];
    expect(element).toBe(video);
    expect(attr).toBe("data-fx-chain");
    expect(String(value)).toContain('"fromPreset":"voice-clean"');
    expect(onClose).toHaveBeenCalled();
  });

  it("opens its submenu at the row's edge in window pixels, and flips left near the window's right edge", () => {
    const rowAt = (rect: { top: number; left: number; right: number }) =>
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(rect as DOMRect);
    const spy = rowAt({ top: 50, left: 100, right: 300 });
    renderItems("sound", video);
    openSubmenu("Voice");
    let menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.className).toContain("fixed");
    expect([menu.style.top, menu.style.left]).toEqual(["50px", "300px"]);
    act(() => root?.unmount());
    document.body.innerHTML = "";
    spy.mockReturnValue({
      top: 50,
      left: window.innerWidth - 200,
      right: window.innerWidth - 10,
    } as DOMRect);
    renderItems("sound", video);
    openSubmenu("Voice");
    menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    expect([menu.style.top, menu.style.right, menu.style.left]).toEqual(["50px", "200px", ""]);
    spy.mockRestore();
  });

  it("Voice None drops the attribute", () => {
    const { setQuiet } = renderItems("sound", video);
    openSubmenu("Voice");
    pick("None");
    expect(setQuiet.mock.calls[0]?.slice(1, 3)).toEqual(["data-fx-chain", null]);
  });

  it("has no Voice on a video without sound", () => {
    renderItems("sound", { ...video, hasAudio: false });
    expect(document.body.textContent).toBe("");
  });

  it("Look writes the preset form and None removes it", () => {
    const { setQuiet } = renderItems("picture", video);
    openSubmenu("Look");
    pick("Warm daylight");
    openSubmenu("Look");
    pick("None");
    expect(setQuiet.mock.calls.map((call) => call.slice(1, 3))).toEqual([
      ["data-color-grading", '{"preset":"warm-daylight","intensity":1}'],
      ["data-color-grading", null],
    ]);
  });

  it("Crop opens the preset bar for this clip", () => {
    renderItems("picture", video);
    const crop = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Crop",
    );
    act(() => crop?.click());
    expect(useCropPresetBarStore.getState().openFor).toEqual({ hfId: undefined, id: "talk" });
  });

  it("offers no picture tools on an audio clip", () => {
    renderItems("picture", { ...video, tag: "audio" });
    expect(document.body.textContent).toBe("");
  });

  it("Freeze frame calls the freeze mutation at the playhead on a video", () => {
    const { freeze } = renderItems("time", video, 3.2);
    const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]');
    expect(item?.textContent).toBe("Freeze frame");
    act(() => item?.click());
    expect(freeze).toHaveBeenCalledWith(video, 3.2);
  });

  it("Freeze frame is disabled outside the clip and absent on images", () => {
    renderItems("time", video, 9);
    expect(document.querySelector<HTMLButtonElement>('[role="menuitem"]')?.disabled).toBe(true);
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = "";
    renderItems("time", { ...video, tag: "img" });
    expect(document.body.textContent).toBe("");
  });

  describe("Look hover preview", () => {
    function option(text: string) {
      const found = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
      ).find((button) => button.textContent?.endsWith(text));
      if (!found) throw new Error(`no option ${text}`);
      return found;
    }
    const enter = (text: string) =>
      option(text).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const hover = (text: string) => {
      act(() => {
        enter(text);
        vi.advanceTimersByTime(100);
      });
    };
    const leave = () => {
      const wrapper = document.querySelector('[role="menu"]')?.parentElement;
      act(() => {
        wrapper?.dispatchEvent(
          new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }),
        );
      });
    };

    it("hover applies the look live after the debounce, without saving", () => {
      const { setLive, setQuiet } = renderItems("picture", video);
      openSubmenu("Look");
      act(() => {
        enter("Warm daylight");
        vi.advanceTimersByTime(40);
      });
      expect(setLive).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(60));
      expect(setLive).toHaveBeenCalledWith(
        video,
        "data-color-grading",
        '{"preset":"warm-daylight","intensity":1}',
      );
      expect(setQuiet).not.toHaveBeenCalled();
    });

    it("opening the submenu by click does not preview the auto-focused first option", () => {
      const { setLive } = renderItems("picture", video);
      openSubmenu("Look");
      act(() => vi.advanceTimersByTime(200));
      expect(setLive).not.toHaveBeenCalled();
    });

    it("keyboard focus previews and None previews no look", () => {
      const { setLive } = renderItems("picture", video);
      openSubmenu("Look");
      act(() => {
        option("None").dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        vi.advanceTimersByTime(100);
      });
      expect(setLive).toHaveBeenCalledWith(video, "data-color-grading", null);
    });

    it("leaving the submenu reverts to the saved look", () => {
      const { revertLive } = renderItems("picture", video);
      openSubmenu("Look");
      hover("Warm daylight");
      leave();
      expect(revertLive).toHaveBeenCalledWith(video, "data-color-grading");
    });

    it("leaving before the debounce fires never previews or reverts", () => {
      const { setLive, revertLive } = renderItems("picture", video);
      openSubmenu("Look");
      act(() => enter("Warm daylight"));
      leave();
      act(() => vi.advanceTimersByTime(200));
      expect(setLive).not.toHaveBeenCalled();
      expect(revertLive).not.toHaveBeenCalled();
    });

    it("clicking commits once and does not revert afterwards", () => {
      const { setQuiet, revertLive } = renderItems("picture", video);
      openSubmenu("Look");
      hover("Warm daylight");
      act(() => option("Warm daylight").click());
      act(() => root?.unmount());
      root = null;
      expect(setQuiet).toHaveBeenCalledTimes(1);
      expect(revertLive).not.toHaveBeenCalled();
    });

    it("closing the menu while previewing reverts", () => {
      const { revertLive } = renderItems("picture", video);
      openSubmenu("Look");
      hover("Warm daylight");
      act(() => root?.unmount());
      root = null;
      expect(revertLive).toHaveBeenCalledWith(video, "data-color-grading");
    });

    it("does nothing when the host has no live callbacks", () => {
      const { setQuiet } = renderItems("picture", video, 2, false);
      openSubmenu("Look");
      expect(() => {
        hover("Warm daylight");
        leave();
      }).not.toThrow();
      expect(setQuiet).not.toHaveBeenCalled();
    });
  });
});
