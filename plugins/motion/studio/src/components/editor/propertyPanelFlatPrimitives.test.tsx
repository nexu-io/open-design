// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FlatGroupHeader,
  FlatRow,
  FlatSegmentedRow,
  FlatSelectRow,
  FlatSlider,
} from "./propertyPanelFlatPrimitives";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

function renderInto(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return { host, root };
}

describe("FlatRow", () => {
  it("renders the default tier with no reset button", () => {
    const { host, root } = renderInto(
      <FlatRow label="Weight" value="400 · Regular" tier="default" onCommit={vi.fn()} />,
    );
    const value = host.querySelector('[data-flat-row-value="true"]');
    expect(value?.className).toContain("text-panel-text-3");
    expect(host.querySelector('[data-flat-row-reset="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("right-aligns the value input — the flat inspector's justify-between row layout leaves a left-aligned value looking stranded at the edge of its own box", () => {
    const { host, root } = renderInto(
      <FlatRow label="Size" value="72px" tier="explicitCustom" onCommit={vi.fn()} />,
    );
    const input = host.querySelector("input");
    expect(input?.className).toContain("text-right");
    expect(input?.className).not.toContain("text-left");
    act(() => root.unmount());
  });

  it("renders the explicitCustom tier with a mint value and a reset button", () => {
    const onReset = vi.fn();
    const { host, root } = renderInto(
      <FlatRow
        label="Letter spacing"
        value="3.96px"
        tier="explicitCustom"
        onCommit={vi.fn()}
        onReset={onReset}
      />,
    );
    const value = host.querySelector('[data-flat-row-value="true"]');
    expect(value?.className).toContain("text-accent-ink");
    const reset = host.querySelector<HTMLButtonElement>('[data-flat-row-reset="true"]');
    expect(reset).not.toBeNull();
    act(() => reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("commits edits through the underlying CommitField input", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatRow label="Size" value="22px" tier="explicitDefault" onCommit={onCommit} />,
    );
    const input = host.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("expected an input");
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "24px");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith("24px");
    act(() => root.unmount());
  });

  it("restores its durable value when an async commit rejects", async () => {
    let rejectCommit: ((error: Error) => void) | null = null;
    const onCommit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCommit = reject;
        }),
    );
    const row = (value: string) => (
      <FlatRow label="X" value={value} tier="explicitDefault" onCommit={onCommit} />
    );
    const { host, root } = renderInto(row("22px"));
    const input = host.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("expected an input");
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "99px");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    // The parent can echo the preview before persistence settles. That is not a
    // durable acknowledgement and must not invalidate the pending rollback.
    act(() => root.render(row("99px")));
    await act(async () => {
      rejectCommit?.(new Error("save failed"));
      await Promise.resolve();
    });

    expect(onCommit).toHaveBeenCalledWith("99px");
    expect(input.value).toBe("22px");
    act(() => root.unmount());
  });

  it("does not let an older rejected commit overwrite a newer draft", async () => {
    let rejectCommit: ((error: Error) => void) | null = null;
    const onCommit = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCommit = reject;
        }),
    );
    const { host, root } = renderInto(
      <FlatRow label="X" value="22px" tier="explicitDefault" onCommit={onCommit} />,
    );
    const input = host.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("expected an input");
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      nativeInputValueSetter?.call(input, "99px");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("focusout", { bubbles: true }));
      nativeInputValueSetter?.call(input, "100px");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      rejectCommit?.(new Error("old save failed"));
      await Promise.resolve();
    });

    expect(input.value).toBe("100px");
    act(() => root.unmount());
  });

  it("persists a rapid numeric arrow-key burst as one commit", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    const { host, root } = renderInto(
      <FlatRow
        label="Size"
        value="22px"
        tier="explicitDefault"
        liveCommit
        onPreview={onPreview}
        onCommit={onCommit}
      />,
    );
    const input = host.querySelector<HTMLInputElement>("input");
    if (!input) throw new Error("expected an input");

    for (let step = 0; step < 8; step += 1) {
      act(() => {
        input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowUp" }));
      });
    }

    expect(input.value).toBe("30px");
    expect(onPreview).toHaveBeenLastCalledWith("30px");
    expect(onCommit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("30px");

    act(() => root.unmount());
    vi.useRealTimers();
  });
});

describe("FlatSegmentedRow", () => {
  it("underlines the active option in mint and leaves others muted", () => {
    const onChange = vi.fn();
    const { host, root } = renderInto(
      <FlatSegmentedRow
        label="Align"
        options={[
          { key: "left", node: "L", label: "left", active: false },
          { key: "right", node: "R", label: "right", active: true },
        ]}
        onChange={onChange}
      />,
    );
    const options = host.querySelectorAll('[data-flat-segment="true"]');
    expect(options).toHaveLength(2);
    expect((options[0] as HTMLElement).className).toContain("text-panel-text-4");
    expect((options[1] as HTMLElement).className).toContain("border-panel-accent");
    act(() =>
      (options[0] as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    expect(onChange).toHaveBeenCalledWith("left");
    act(() => root.unmount());
  });

  it("gives each option an accessible name and pressed state — glyphs alone (e.g. two 'A' buttons) aren't a valid accessible name", () => {
    const { host, root } = renderInto(
      <FlatSegmentedRow
        label="Case · Style"
        options={[
          { key: "normal", node: "A", label: "upright", active: true },
          { key: "italic", node: "A", label: "italic", active: false },
        ]}
        onChange={vi.fn()}
      />,
    );
    const options = host.querySelectorAll<HTMLButtonElement>('[data-flat-segment="true"]');
    expect(options[0]?.getAttribute("aria-label")).toBe("upright");
    expect(options[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(options[1]?.getAttribute("aria-label")).toBe("italic");
    expect(options[1]?.getAttribute("aria-pressed")).toBe("false");
    act(() => root.unmount());
  });
});

describe("FlatGroupHeader", () => {
  it("renders the open header (name + caret), with no sticky-related props required", () => {
    const onToggleOpen = vi.fn();
    const { host, root } = renderInto(
      <FlatGroupHeader title="Text" isOpen onToggleOpen={onToggleOpen} />,
    );
    expect(host.textContent).toContain("Text");
    const collapse = host.querySelector<HTMLButtonElement>('button[title="Collapse"]');
    act(() => collapse?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("renders the collapsed row (name + summary + caret-right) with no sticky positioning", () => {
    const onToggleOpen = vi.fn();
    const { host, root } = renderInto(
      <FlatGroupHeader
        title="Style"
        isOpen={false}
        onToggleOpen={onToggleOpen}
        summary="fill none · 100%"
      />,
    );
    expect(host.textContent).toContain("fill none · 100%");
    const row = host.querySelector<HTMLButtonElement>('[data-flat-group-collapsed="true"]');
    expect(row?.style.position).toBe("");
    act(() => row?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onToggleOpen).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("applies the entrance animation class to both states, only when animateEntrance is set", () => {
    const { host: openHost, root: openRoot } = renderInto(
      <FlatGroupHeader title="Text" isOpen onToggleOpen={vi.fn()} animateEntrance />,
    );
    expect(openHost.firstElementChild?.className).toContain("hf-flat-group-enter");
    act(() => openRoot.unmount());

    const { host: collapsedHost, root: collapsedRoot } = renderInto(
      <FlatGroupHeader title="Style" isOpen={false} onToggleOpen={vi.fn()} animateEntrance />,
    );
    const row = collapsedHost.querySelector('[data-flat-group-collapsed="true"]');
    expect(row?.className).toContain("hf-flat-group-enter");
    act(() => collapsedRoot.unmount());
  });

  it("omits the entrance animation class in both states when animateEntrance is not set", () => {
    const { host: openHost, root: openRoot } = renderInto(
      <FlatGroupHeader title="Text" isOpen onToggleOpen={vi.fn()} />,
    );
    expect(openHost.firstElementChild?.className).not.toContain("hf-flat-group-enter");
    act(() => openRoot.unmount());

    const { host: collapsedHost, root: collapsedRoot } = renderInto(
      <FlatGroupHeader title="Style" isOpen={false} onToggleOpen={vi.fn()} />,
    );
    const row = collapsedHost.querySelector('[data-flat-group-collapsed="true"]');
    expect(row?.className).not.toContain("hf-flat-group-enter");
    act(() => collapsedRoot.unmount());
  });

  it("renders no inline position styling in either state (collapsed headers never move)", () => {
    const { host: collapsedHost, root: collapsedRoot } = renderInto(
      <FlatGroupHeader title="Layout" isOpen={false} onToggleOpen={vi.fn()} />,
    );
    const row = collapsedHost.querySelector<HTMLButtonElement>(
      '[data-flat-group-collapsed="true"]',
    );
    expect(row?.getAttribute("style")).toBeNull();
    act(() => collapsedRoot.unmount());

    const { host: openHost, root: openRoot } = renderInto(
      <FlatGroupHeader title="Motion" isOpen onToggleOpen={vi.fn()} />,
    );
    expect(openHost.textContent).toContain("Motion");
    expect(openHost.querySelector("[style]")).toBeNull();
    act(() => openRoot.unmount());
  });
});

describe("FlatSlider", () => {
  it("renders the default tier with a dim knob at the correct position", () => {
    const { host, root } = renderInto(
      <FlatSlider
        label="Layer blur"
        value={0}
        min={0}
        max={40}
        tier="default"
        displayValue="0px"
        onCommit={vi.fn()}
      />,
    );
    const knob = host.querySelector<HTMLElement>('[data-flat-slider-knob="true"]');
    expect(knob).not.toBeNull();
    expect(knob?.className).toContain("bg-panel-text-4");
    expect(knob?.style.left).toBe("0%");
    const value = host.querySelector('[data-flat-slider-value="true"]');
    expect(value?.className).toContain("text-panel-text-3");
    expect(value?.textContent).toBe("0px");
    act(() => root.unmount());
  });

  it("renders the explicitCustom tier with a filled track and bright knob", () => {
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={100}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="100%"
        onCommit={vi.fn()}
      />,
    );
    const fill = host.querySelector<HTMLElement>('[data-flat-slider-fill="true"]');
    expect(fill?.style.width).toBe("100%");
    const knob = host.querySelector<HTMLElement>('[data-flat-slider-knob="true"]');
    expect(knob?.className).toContain("bg-text-0");
    act(() => root.unmount());
  });

  it("commits a value on track click, proportional to click position", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 2, right: 200, bottom: 2 }),
    });
    act(() => {
      track.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 100 }));
      track.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 100 }));
    });
    expect(onCommit).toHaveBeenCalledWith(50);
    act(() => root.unmount());
  });

  it("widens the click/drag hit area vertically beyond the thin visible line", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={50}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="50%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, clientX: 20, clientY: 18 }),
      );
      track.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 20 }));
    });
    expect(onCommit).toHaveBeenCalledWith(10);
    act(() => root.unmount());
  });

  it("tracks the knob instantly on every pointermove during a drag (draft state)", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={50}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="50%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 20, pointerId: 1 }),
      );
    });
    // Instant, un-throttled knob feedback via aria-valuenow (draft state) —
    // this must update on every pointermove regardless of the commit throttle.
    expect(track.getAttribute("aria-valuenow")).toBe("10");
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 160, pointerId: 1 }),
      );
    });
    expect(track.getAttribute("aria-valuenow")).toBe("80");
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 100, pointerId: 1 }),
      );
    });
    expect(track.getAttribute("aria-valuenow")).toBe("50");
    act(() => {
      track.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });
    act(() => root.unmount());
  });

  it("throttles rapid drag commits to leading edge + final value on release, not every step", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={5}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="5%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      // pointerdown fires the leading-edge commit immediately — a live
      // preview needs to move the instant the drag starts, not wait 40ms.
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 20, pointerId: 1 }),
      );
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 160, pointerId: 1 }),
      );
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 100, pointerId: 1 }),
      );
    });
    // The leading-edge commit (10) fired; the rapid intermediate position (80)
    // from the first pointermove never committed — it's within the 40ms
    // throttle window, so only the trailing flush or the pointerup release
    // gets to send the next value.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(10);
    act(() => {
      // Real pointerup events always carry the pointer's true release position
      // (matches the last pointermove) — the handler recomputes from this
      // rather than trusting a possibly-stale `draft` closure.
      track.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientX: 100, pointerId: 1 }),
      );
    });
    // Release flushes immediately with the LAST position only.
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenNthCalledWith(2, 50);
    act(() => root.unmount());
  });

  it("ignores pointermove once a drag has ended (pointer capture released)", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={50}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="50%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 20, pointerId: 1 }),
      );
      track.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    });
    onCommit.mockClear();
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 160, pointerId: 1 }),
      );
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("still commits the release position when releasePointerCapture synchronously fires lostpointercapture (real-browser behavior happy-dom doesn't replicate)", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    // Real browsers fire lostpointercapture SYNCHRONOUSLY, mid-call, when
    // releasePointerCapture() is invoked — happy-dom does not replicate this,
    // so patch it in to reproduce the exact reentrancy hazard onPointerUp
    // must guard against.
    const originalRelease = track.releasePointerCapture.bind(track);
    track.releasePointerCapture = (pointerId: number) => {
      originalRelease(pointerId);
      track.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
    };
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 30, pointerId: 1 }),
      );
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientX: 80, pointerId: 1 }),
      );
    });
    // The real release position (80), not a rollback to the pre-drag value (10)
    // caused by onLostPointerCapture resyncing mid-handler.
    expect(onCommit).toHaveBeenLastCalledWith(80);
    expect(track.getAttribute("aria-valuenow")).toBe("80");
    act(() => root.unmount());
  });

  it("Escape during a drag reverts to the pre-drag value and releases pointer capture, instead of leaving the last dragged-to position committed", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 30, pointerId: 1 }),
      );
    });
    // The leading-edge commit already applied the dragged-to value (30).
    expect(onCommit).toHaveBeenLastCalledWith(30);
    act(() => {
      track.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(onCommit).toHaveBeenLastCalledWith(10);
    expect(track.getAttribute("aria-valuenow")).toBe("10");
    expect(track.hasPointerCapture(1)).toBe(false);
    // A subsequent pointermove for the now-released pointer must not resume
    // the cancelled drag.
    onCommit.mockClear();
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 80, pointerId: 1 }),
      );
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("right-click (contextmenu) during a drag cancels it and reverts to the pre-drag value, instead of committing the last dragged-to position", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 65, pointerId: 1 }),
      );
    });
    expect(onCommit).toHaveBeenLastCalledWith(65);
    const contextMenuEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      track.dispatchEvent(contextMenuEvent);
    });
    expect(contextMenuEvent.defaultPrevented).toBe(true);
    expect(onCommit).toHaveBeenLastCalledWith(10);
    expect(track.getAttribute("aria-valuenow")).toBe("10");
    expect(track.hasPointerCapture(1)).toBe(false);
    act(() => root.unmount());
  });

  it("a native pointercancel during a drag reverts to the pre-drag value, instead of leaving the last dragged-to position committed", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 65, pointerId: 1 }),
      );
    });
    expect(onCommit).toHaveBeenLastCalledWith(65);
    act(() => {
      track.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 }));
    });
    expect(onCommit).toHaveBeenLastCalledWith(10);
    expect(track.getAttribute("aria-valuenow")).toBe("10");
    expect(track.hasPointerCapture(1)).toBe(false);
    act(() => root.unmount());
  });
});

describe("FlatSlider — Grade extensions", () => {
  it("renders a center tick when centerTick is true, and omits it by default", () => {
    const { host: withTick, root: rootA } = renderInto(
      <FlatSlider
        label="Exposure"
        value={0}
        min={-100}
        max={100}
        tier="default"
        displayValue="+0.00"
        centerTick
        onCommit={vi.fn()}
      />,
    );
    expect(withTick.querySelector('[data-flat-slider-center-tick="true"]')).not.toBeNull();
    act(() => rootA.unmount());

    const { host: withoutTick, root: rootB } = renderInto(
      <FlatSlider
        label="Layer blur"
        value={0}
        min={0}
        max={100}
        tier="default"
        displayValue="0px"
        onCommit={vi.fn()}
      />,
    );
    expect(withoutTick.querySelector('[data-flat-slider-center-tick="true"]')).toBeNull();
    act(() => rootB.unmount());
  });

  it("always reserves a 14px reset slot, showing the icon only when set and onReset is provided", () => {
    const onReset = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Contrast"
        value={12}
        min={-100}
        max={100}
        tier="explicitCustom"
        displayValue="+12%"
        centerTick
        onReset={onReset}
        onCommit={vi.fn()}
      />,
    );
    const slot = host.querySelector('[data-flat-slider-reset-slot="true"]');
    expect(slot).not.toBeNull();
    const resetButton = host.querySelector<HTMLButtonElement>('[data-flat-slider-reset="true"]');
    expect(resetButton).not.toBeNull();
    act(() => resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => root.unmount());

    const { host: unsetHost, root: rootB } = renderInto(
      <FlatSlider
        label="Contrast"
        value={0}
        min={-100}
        max={100}
        tier="default"
        displayValue="0%"
        centerTick
        onCommit={vi.fn()}
      />,
    );
    expect(unsetHost.querySelector('[data-flat-slider-reset-slot="true"]')).not.toBeNull();
    expect(unsetHost.querySelector('[data-flat-slider-reset="true"]')).toBeNull();
    act(() => rootB.unmount());
  });

  it("renders no reset slot at all when neither centerTick nor onReset is provided", () => {
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={100}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="100%"
        onCommit={vi.fn()}
      />,
    );
    expect(host.querySelector('[data-flat-slider-reset-slot="true"]')).toBeNull();
    expect(host.querySelector('[data-flat-slider-reset="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("shows a reachable reset button on a non-centerTick slider that passes onReset (Grade Vignette/Effects)", () => {
    const onReset = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Vignette"
        value={18}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="18%"
        onReset={onReset}
        onCommit={vi.fn()}
      />,
    );
    const resetButton = host.querySelector<HTMLButtonElement>('[data-flat-slider-reset="true"]');
    expect(resetButton).not.toBeNull();
    act(() => resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("never commits from a click released on a disabled slider", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={100}
        min={0}
        max={100}
        tier="default"
        displayValue="100%"
        disabled
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 50, pointerId: 1 }),
      );
      track.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientX: 50, pointerId: 1 }),
      );
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("disables the reset button when the slider itself is disabled", () => {
    const onReset = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Exposure"
        value={20}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="20"
        disabled
        onReset={onReset}
        onCommit={vi.fn()}
      />,
    );
    const resetButton = host.querySelector<HTMLButtonElement>('[data-flat-slider-reset="true"]');
    expect(resetButton?.disabled).toBe(true);
    act(() => resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("a trailing throttled commit uses the current render's onCommit, not the one captured when it was scheduled", () => {
    vi.useFakeTimers();
    const onCommitA = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Exposure"
        value={0}
        min={-100}
        max={100}
        tier="explicitCustom"
        displayValue="0"
        onCommit={onCommitA}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      // Leading-edge commit fires synchronously with onCommitA (clientX 150
      // on a -100..100 track maps to 50, distinct from the initial value 0).
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 150, pointerId: 1 }),
      );
    });
    expect(onCommitA).toHaveBeenCalledTimes(1);
    act(() => {
      // Within the 40ms throttle window — queues a trailing commit (to 80,
      // distinct from the just-committed 50) instead of firing immediately.
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 180, pointerId: 1 }),
      );
    });
    expect(onCommitA).toHaveBeenCalledTimes(1);
    // Simulate the real-world race: something else causes this slider to
    // re-render with a NEW onCommit closure before the queued timer fires
    // (e.g. Grade's per-detail onCommit spreads the render-time whole
    // grading object, so a different control committing in between produces
    // a fresh closure). The stale closure must not win.
    const onCommitB = vi.fn();
    act(() => {
      root.render(
        <FlatSlider
          label="Exposure"
          value={0}
          min={-100}
          max={100}
          tier="explicitCustom"
          displayValue="0"
          onCommit={onCommitB}
        />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(45);
    });
    expect(onCommitB).toHaveBeenCalledTimes(1);
    expect(onCommitB).toHaveBeenCalledWith(80);
    expect(onCommitA).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("flushes a still-queued trailing commit on unmount instead of dropping it", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={5}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="5%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 200, top: 0, height: 20, right: 200, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 20, pointerId: 1 }),
      );
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    act(() => {
      // Queues a trailing commit that never gets to fire before unmount.
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 160, pointerId: 1 }),
      );
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenNthCalledWith(2, 80);
    vi.useRealTimers();
  });

  it("supports keyboard operation: focusable, arrow keys step, Home/End clamp to range", () => {
    const onCommit = vi.fn();
    const { host, root } = renderInto(
      <FlatSlider
        label="Volume"
        value={50}
        min={0}
        max={100}
        tier="default"
        displayValue="50%"
        onCommit={onCommit}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    expect(track.getAttribute("tabindex")).toBe("0");
    expect(track.getAttribute("aria-valuemin")).toBe("0");
    expect(track.getAttribute("aria-valuemax")).toBe("100");
    act(() => {
      track.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(onCommit).toHaveBeenLastCalledWith(51);
    act(() => {
      track.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    });
    expect(onCommit).toHaveBeenLastCalledWith(0);
    act(() => root.unmount());
  });

  it("ignores the committed prop echoing back mid-drag (no knob snap-back)", () => {
    const onCommit = vi.fn();
    function Harness() {
      const [value, setValue] = React.useState(10);
      return (
        <FlatSlider
          label="Opacity"
          value={value}
          min={0}
          max={100}
          tier="explicitCustom"
          displayValue={`${value}%`}
          onCommit={(next) => {
            onCommit(next);
            setValue(next);
          }}
        />
      );
    }
    const { host, root } = renderInto(<Harness />);
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    act(() => {
      // Leading-edge commit fires at 30 and echoes back through the parent's
      // state — mid-drag, that echo must NOT reset the draft.
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 30, pointerId: 1 }),
      );
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true, clientX: 80, pointerId: 1 }),
      );
    });
    // Draft tracks the pointer (80), not the stale committed echo (30).
    expect(track.getAttribute("aria-valuenow")).toBe("80");
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, clientX: 80, pointerId: 1 }),
      );
    });
    expect(onCommit).toHaveBeenLastCalledWith(80);
    expect(track.getAttribute("aria-valuenow")).toBe("80");
    act(() => root.unmount());
  });

  it("resets the dragging state on lostpointercapture even without a prior pointerup/pointercancel", () => {
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={vi.fn()}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 30, pointerId: 1 }),
      );
    });
    expect(track.getAttribute("aria-valuenow")).toBe("30");
    act(() => {
      // Capture lost WITHOUT a pointerup/pointercancel first — e.g. another
      // element steals it, or the browser reclaims it for a scroll gesture.
      track.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
    });
    act(() => {
      root.render(
        <FlatSlider
          label="Opacity"
          value={99}
          min={0}
          max={100}
          tier="explicitCustom"
          displayValue="99%"
          onCommit={vi.fn()}
        />,
      );
    });
    // If lostpointercapture hadn't cleared the dragging flag, this external
    // value change would be silently ignored (mid-drag echo suppression)
    // forever — the knob would be stuck at 30.
    expect(track.getAttribute("aria-valuenow")).toBe("99");
    act(() => root.unmount());
  });

  it("resyncs immediately from the latest value on lostpointercapture, even when the value changed WHILE still dragging", () => {
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="explicitCustom"
        displayValue="10%"
        onCommit={vi.fn()}
      />,
    );
    const track = host.querySelector<HTMLElement>('[data-flat-slider-track="true"]');
    if (!track) throw new Error("expected a track element");
    Object.defineProperty(track, "getBoundingClientRect", {
      value: () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 }),
    });
    act(() => {
      track.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: 30, pointerId: 1 }),
      );
    });
    expect(track.getAttribute("aria-valuenow")).toBe("30");
    // Value changes to 99 WHILE still dragging — the [value] sync effect
    // must skip it (draggingRef is still true), so draft stays at 30.
    act(() => {
      root.render(
        <FlatSlider
          label="Opacity"
          value={99}
          min={0}
          max={100}
          tier="explicitCustom"
          displayValue="99%"
          onCommit={vi.fn()}
        />,
      );
    });
    expect(track.getAttribute("aria-valuenow")).toBe("30");
    act(() => {
      // Capture lost with NO further render afterward — if the resync
      // depended on a subsequent [value] effect run rather than reading
      // latestValueRef directly, this would leave the knob stuck at 30.
      track.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
    });
    expect(track.getAttribute("aria-valuenow")).toBe("99");
    act(() => root.unmount());
  });
});

describe("FlatSelectRow", () => {
  it("renders the default tier with no reset button", () => {
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Blend"
        value="normal"
        options={["normal", "multiply", "screen"]}
        tier="default"
        onChange={vi.fn()}
      />,
    );
    const select = host.querySelector("select");
    expect(select?.value).toBe("normal");
    expect(host.querySelector('[data-flat-select-reset="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("renders the explicitCustom tier with a reset button and fires onReset", () => {
    const onReset = vi.fn();
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Shadow"
        value="soft"
        options={["none", "soft", "lift", "glow"]}
        tier="explicitCustom"
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );
    const select = host.querySelector<HTMLSelectElement>("select");
    expect(select?.className).toContain("text-accent-ink");
    const reset = host.querySelector<HTMLButtonElement>('[data-flat-select-reset="true"]');
    act(() => reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("disables the reset button (and gives the select an accessible name) when the row itself is disabled", () => {
    const onReset = vi.fn();
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Shadow"
        value="soft"
        options={["none", "soft", "lift", "glow"]}
        tier="explicitCustom"
        disabled
        onChange={vi.fn()}
        onReset={onReset}
      />,
    );
    const select = host.querySelector<HTMLSelectElement>("select");
    expect(select?.getAttribute("aria-label")).toBe("Shadow");
    const reset = host.querySelector<HTMLButtonElement>('[data-flat-select-reset="true"]');
    expect(reset?.disabled).toBe(true);
    act(() => reset?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReset).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("fires onChange when the select value changes", () => {
    const onChange = vi.fn();
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Overflow"
        value="visible"
        options={["visible", "hidden", "clip", "auto", "scroll"]}
        tier="default"
        onChange={onChange}
      />,
    );
    const select = host.querySelector<HTMLSelectElement>("select");
    if (!select) throw new Error("expected a select");
    act(() => {
      select.value = "hidden";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("hidden");
    act(() => root.unmount());
  });
});

describe("FlatSelectRow — label/value options", () => {
  it("renders distinct labels for entries with a different display label than value", () => {
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Preset"
        value="clean-studio"
        options={[
          { value: "neutral", label: "Neutral" },
          { value: "clean-studio", label: "Clean Studio" },
          { value: "bright-pop", label: "Bright Pop" },
        ]}
        tier="explicitCustom"
        onChange={vi.fn()}
      />,
    );
    const select = host.querySelector("select");
    expect(select?.value).toBe("clean-studio");
    const options = Array.from(host.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["Neutral", "Clean Studio", "Bright Pop"]);
    act(() => root.unmount());
  });

  it("still treats a bare string array as value===label (Plan 2 behavior unchanged)", () => {
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Blend"
        value="multiply"
        options={["normal", "multiply", "screen"]}
        tier="explicitCustom"
        onChange={vi.fn()}
      />,
    );
    const options = Array.from(host.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toEqual(["normal", "multiply", "screen"]);
    act(() => root.unmount());
  });

  it("preserves a valid authored value outside the preset list instead of misrepresenting it as the first option", () => {
    const onChange = vi.fn();
    const { host, root } = renderInto(
      <FlatSelectRow
        label="Blend"
        value="difference"
        options={["normal", "multiply", "screen", "overlay"]}
        tier="explicitCustom"
        onChange={onChange}
      />,
    );
    const select = host.querySelector<HTMLSelectElement>("select");
    // A native <select> whose `value` matches no <option> falls back to
    // selectedIndex 0 — silently showing "normal" as selected even though
    // the real persisted value is "difference". The row must add an option
    // for the current value so it's genuinely representable.
    expect(select?.value).toBe("difference");
    const options = Array.from(host.querySelectorAll("option")).map((o) => o.textContent);
    expect(options).toContain("difference");
    // And reselecting the (still-present) first preset must be an explicit
    // user choice, not something that already happened silently.
    expect(onChange).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe("FlatSlider — typed value", () => {
  it("keeps the readout inert without onCommitText", () => {
    const { host, root } = renderInto(
      <FlatSlider
        label="Opacity"
        value={10}
        min={0}
        max={100}
        tier="default"
        displayValue="10%"
        onCommit={vi.fn()}
      />,
    );
    const readout = host.querySelector<HTMLElement>('[data-flat-slider-value="true"]');
    expect(readout?.getAttribute("role")).toBeNull();
    act(() => readout?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(host.querySelector('[data-flat-slider-input="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("turns the readout into an input on click and commits the typed text on Enter", () => {
    const onCommitText = vi.fn().mockReturnValue(true);
    const { host, root } = renderInto(
      <FlatSlider
        label="Volume"
        value={0}
        min={-100}
        max={100}
        tier="default"
        displayValue="0 dB"
        onCommit={vi.fn()}
        onCommitText={onCommitText}
      />,
    );
    const readout = host.querySelector<HTMLElement>('[data-flat-slider-value="true"]');
    expect(readout?.getAttribute("role")).toBe("button");
    act(() => readout?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const input = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    if (!input) throw new Error("expected the readout to become an input");
    expect(input.value).toBe("0 dB");
    act(() => {
      setReactInputValue(input, "-6 dB");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onCommitText).toHaveBeenCalledWith("-6 dB");
    expect(host.querySelector('[data-flat-slider-input="true"]')).toBeNull();
    act(() => root.unmount());
  });

  it("stays open and marks itself invalid when the text is refused, and closes on Escape", () => {
    const onCommitText = vi.fn().mockReturnValue(false);
    const { host, root } = renderInto(
      <FlatSlider
        label="Speed"
        value={500}
        min={0}
        max={1000}
        tier="default"
        displayValue="1x"
        onCommit={vi.fn()}
        onCommitText={onCommitText}
      />,
    );
    act(() =>
      host
        .querySelector<HTMLElement>('[data-flat-slider-value="true"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    const input = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    if (!input) throw new Error("expected an input");
    act(() => {
      setReactInputValue(input, "fast");
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(onCommitText).toHaveBeenCalledWith("fast");
    const still = host.querySelector<HTMLInputElement>('[data-flat-slider-input="true"]');
    expect(still).not.toBeNull();
    expect(still?.getAttribute("aria-invalid")).toBe("true");
    expect(still?.className).toContain("border-dashed");
    act(() => still?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[data-flat-slider-input="true"]')).toBeNull();
    expect(host.querySelector('[data-flat-slider-value="true"]')?.textContent).toBe("1x");
    act(() => root.unmount());
  });
});

/** Drives React's controlled input the way a keystroke would. */
function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
