// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import { TimelineFxPopover } from "./TimelineFxPopover.js";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EMPTY_CHAIN: HfAudioFxChain = { version: 1, nodes: [] };
const RECT = { left: 0, top: 0, right: 0, bottom: 0 } as DOMRect;

function rect(top: number, bottom: number): DOMRect {
  return { left: 0, top, right: 0, bottom } as DOMRect;
}

/** Pin the viewport height: every expected number below is derived from it, and
 *  happy-dom's 768 default is not something this file should silently inherit. */
function withViewportHeight<T>(value: number, run: () => T): T {
  const previous = window.innerHeight;
  Object.defineProperty(window, "innerHeight", { value, configurable: true });
  try {
    return run();
  } finally {
    Object.defineProperty(window, "innerHeight", { value: previous, configurable: true });
  }
}

function dialogOf(host: HTMLElement): HTMLElement {
  const el = host.querySelector('[role="dialog"]');
  if (!el) throw new Error("no dialog");
  return el as HTMLElement;
}

function byTextButton(host: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));
}

function mount(overrides: Partial<Parameters<typeof TimelineFxPopover>[0]> = {}) {
  const onClose = vi.fn();
  const onChainChange = vi.fn();
  const onChainPreview = vi.fn();
  const onOpenRack = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  act(() => {
    createRoot(host).render(
      <TimelineFxPopover
        anchorRect={RECT}
        chain={EMPTY_CHAIN}
        onClose={onClose}
        onChainChange={onChainChange}
        onChainPreview={onChainPreview}
        onOpenRack={onOpenRack}
        {...overrides}
      />,
    );
  });
  return { host, onClose, onChainChange, onChainPreview, onOpenRack };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TimelineFxPopover", () => {
  it("applies a preset with exactly one onChainChange write, and closes", () => {
    const { host, onChainChange, onClose } = mount();
    const button = byTextButton(host, "Chipmunk");
    expect(button).toBeDefined();
    act(() => button?.click());
    expect(onChainChange).toHaveBeenCalledTimes(1);
    const written = onChainChange.mock.calls[0]?.[0] as HfAudioFxChain;
    expect(written.nodes.length).toBeGreaterThan(0);
    expect(onClose).toHaveBeenCalled();
  });

  it("auditions on hover (focus is the keyboard's hover) and reverts on leave", () => {
    const { host, onChainPreview } = mount();
    const button = byTextButton(host, "Chipmunk");
    expect(button).toBeDefined();
    act(() => (button as HTMLButtonElement).focus());
    expect(onChainPreview).toHaveBeenCalled();
    const previewed = onChainPreview.mock.calls.at(-1)?.[0] as HfAudioFxChain;
    expect(previewed.nodes.length).toBeGreaterThan(0);
    onChainPreview.mockClear();
    act(() => {
      button?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onChainPreview).toHaveBeenCalledWith(EMPTY_CHAIN, true);
  });

  it("Escape closes without letting the keystroke propagate past the popover", () => {
    const { host, onClose } = mount();
    const outer = vi.fn();
    document.body.addEventListener("keydown", outer);
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    act(() => {
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
    document.body.removeEventListener("keydown", outer);
  });

  it("dismisses on an outside pointerdown", () => {
    const { onClose } = mount();
    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not dismiss on a pointerdown inside the popover", () => {
    const { host, onClose } = mount();
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    act(() => {
      dialog?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  // These guard the regression that shipped once already: an uncapped
  // popover grew past the gap it opened into, ran under the timeline chrome and
  // took its footer with it, and nothing scrolled.
  it("caps its height to the space below when it opens downward", () => {
    // spaceBelow 738 > spaceAbove 10, so it opens down: 738 - margin(8) - gap(4).
    const dialog = withViewportHeight(768, () =>
      dialogOf(mount({ anchorRect: rect(10, 30) }).host),
    );
    expect(dialog.style.top).toBe("34px");
    expect(dialog.style.maxHeight).toBe("726px");
  });

  it("caps its height to the space above when it flips upward", () => {
    // spaceBelow 48 < 260 and spaceAbove 700 is larger, so it flips up.
    const dialog = withViewportHeight(768, () =>
      dialogOf(mount({ anchorRect: rect(700, 720) }).host),
    );
    expect(dialog.style.bottom).toBe("72px");
    expect(dialog.style.maxHeight).toBe("688px");
  });

  it("never caps below a usable minimum, however tight the gap", () => {
    // Both gaps are tiny (80 below / 100 above); the cap must not collapse.
    const dialog = withViewportHeight(200, () =>
      dialogOf(mount({ anchorRect: rect(100, 120) }).host),
    );
    expect(dialog.style.maxHeight).toBe("160px");
  });

  it("keeps both edges in the viewport when the minimum exceeds the gap", () => {
    // The case the minimum used to lose: at 200px of viewport (roughly 400% zoom
    // on a laptop) neither gap can hold 160px, so honouring the floor has to
    // slide the box in rather than hang its top edge off-screen.
    const dialog = withViewportHeight(200, () =>
      dialogOf(mount({ anchorRect: rect(100, 120) }).host),
    );
    // bottom:32 + maxHeight:160 puts the box at y = 8..168 — a margin on each side.
    expect(dialog.style.bottom).toBe("32px");
    const bottom = Number.parseFloat(dialog.style.bottom);
    const height = Number.parseFloat(dialog.style.maxHeight);
    expect(bottom).toBeGreaterThanOrEqual(8);
    expect(200 - bottom - height).toBeGreaterThanOrEqual(8);
  });

  it("shrinks below the minimum only when the whole window is shorter", () => {
    // A floor against a tight gap is not a floor against a tight window: 120px of
    // viewport cannot hold 160px, and hanging off the edge is worse than short.
    const dialog = withViewportHeight(120, () =>
      dialogOf(mount({ anchorRect: rect(60, 80) }).host),
    );
    expect(dialog.style.maxHeight).toBe("104px");
    expect(dialog.style.bottom).toBe("8px");
  });

  it("scrolls the preset list and leaves the footer outside the scroller", () => {
    const { host } = mount();
    const dialog = dialogOf(host);
    const scroller = dialog.querySelector(".overflow-y-auto");
    expect(scroller).toBeTruthy();
    // The footer must be a SIBLING of the scroller, not inside it — otherwise it
    // scrolls away instead of staying put, which is the original bug.
    const footer = byTextButton(host, "Open rack");
    expect(footer).toBeDefined();
    expect(scroller?.contains(footer as Node)).toBe(false);
    expect(dialog.contains(footer as Node)).toBe(true);
  });

  it("the footer opens the rack and closes the popover", () => {
    const { host, onOpenRack, onClose } = mount();
    const openRack = byTextButton(host, "Open rack");
    expect(openRack).toBeDefined();
    act(() => openRack?.click());
    expect(onOpenRack).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
