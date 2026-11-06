// @vitest-environment happy-dom

import React, { act, Profiler } from "react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutsButton, ShortcutsPanel } from "./ShortcutsPanel";
import { PlayerControls } from "./PlayerControls";
import { DEFAULT_SHORTCUT_SECTIONS, type ShortcutSection } from "./studioShortcuts";
import { createHappyDomRootHarness } from "./testRootHarness";
import { usePlayerStore } from "../store/playerStore";
import { POPUP_LAYER } from "../../components/ui/Menu";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { mount } = createHappyDomRootHarness();

function renderPanel(onRender = vi.fn()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = mount(host);
  act(() => {
    root.render(
      <Profiler id="shortcuts-panel" onRender={onRender}>
        <ShortcutsPanel
          disabled={false}
          duration={10}
          inPoint={null}
          outPoint={null}
          setInPoint={vi.fn()}
          setOutPoint={vi.fn()}
          onSeek={vi.fn()}
        />
      </Profiler>,
    );
  });

  const trigger = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Shortcuts and tools"]',
  )!;
  return { host, trigger, onRender };
}

function pressAndClick(target: HTMLElement): void {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }),
  );
  target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
}

function openPanel(trigger: HTMLButtonElement): void {
  act(() => pressAndClick(trigger));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
}

/** The open popover a trigger controls; it portals out of the trigger's host. */
function panelOf(trigger: HTMLButtonElement): HTMLElement {
  return document.getElementById(trigger.getAttribute("aria-controls")!)!;
}

describe("ShortcutsPanel", () => {
  it.each(["page", "button", "panel"] as const)(
    "closes with Escape from the %s-focused position",
    async (focusPosition) => {
      const { trigger } = renderPanel();
      openPanel(trigger);

      let eventTarget: Document | HTMLElement;
      if (focusPosition === "page") {
        document.body.tabIndex = -1;
        document.body.focus();
        eventTarget = document;
        expect(document.activeElement).toBe(document.body);
      } else if (focusPosition === "button") {
        trigger.focus();
        eventTarget = trigger;
        expect(document.activeElement).toBe(trigger);
      } else {
        const panelInput = document.querySelector<HTMLInputElement>(
          '[aria-label="Jump to frame"]',
        )!;
        panelInput.focus();
        eventTarget = panelInput;
        expect(document.activeElement).toBe(panelInput);
      }

      act(() => {
        eventTarget.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      });

      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      await vi.waitFor(() => expect(document.querySelector('[aria-label="Jump to frame"]')).toBeNull());
    },
  );

  it("closes on an outside press whose pointerdown a canvas gesture prevented", async () => {
    const preventDefault = (event: Event) => event.preventDefault();
    document.addEventListener("pointerdown", preventDefault, true);
    // The canvas exists before the panel opens, as in the editor.
    const outside = document.createElement("div");
    document.body.append(outside);
    const { trigger } = renderPanel();
    openPanel(trigger);
    const pointerDown = new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });

    // A prevented pointerdown suppresses mousedown and mouseup; the browser still sends the click.
    act(() => {
      outside.dispatchEvent(pointerDown);
      outside.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }),
      );
    });

    document.removeEventListener("pointerdown", preventDefault, true);
    expect(pointerDown.defaultPrevented).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Jump to frame"]')).toBeNull());
  });

  it("does not close on a click inside the panel", () => {
    const { trigger } = renderPanel();
    openPanel(trigger);
    const panelInput = document.querySelector<HTMLInputElement>('[aria-label="Jump to frame"]')!;

    act(() => pressAndClick(panelInput));

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.querySelector('[aria-label="Jump to frame"]')).not.toBeNull();
  });

  it("toggles once per trigger click", () => {
    const { trigger } = renderPanel();

    act(() => pressAndClick(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    act(() => pressAndClick(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("does not re-render when Escape is pressed while closed", () => {
    const { trigger, onRender } = renderPanel();
    expect(onRender).toHaveBeenCalledTimes(1);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it("connects the trigger to the dialog with aria-controls", () => {
    const { trigger } = renderPanel();
    openPanel(trigger);
    const panelId = trigger.getAttribute("aria-controls");
    const panel = panelId ? document.querySelector<HTMLElement>(`#${CSS.escape(panelId)}`) : null;

    expect(panelId).not.toBeNull();
    expect(panel?.getAttribute("role")).toBe("dialog");
    // Non-modal on purpose: focus is not trapped and the editor behind stays
    // operable, so aria-modal would lie to assistive tech about inertness.
    expect(panel?.getAttribute("aria-modal")).toBeNull();
    expect(panel?.id).toBe(panelId);
  });

  it("opens on the popup layer, above its button and outside the boxes that hold it", async () => {
    const { host, trigger } = renderPanel();
    // A button at the window's top edge: the panel must not flip down over the timeline.
    trigger.getBoundingClientRect = () => new DOMRect(900, 0, 28, 28);
    openPanel(trigger);
    await act(async () => {});
    const panel = panelOf(trigger);

    expect(host.contains(panel)).toBe(false);
    expect(panel.closest(`.${POPUP_LAYER}`)).not.toBeNull();
    expect(panel.dataset.side).toBe("top");
    expect(panel.dataset.align).toBe("end");
    expect(panel.classList).toContain("max-h-[min(280px,var(--available-height))]");
  });

  it("lists what an embedder passes to PlayerControls instead of Studio's defaults", () => {
    const listed = (sections?: readonly ShortcutSection[]) => {
      const host = document.createElement("div");
      document.body.append(host);
      act(() => {
        mount(host).render(
          <PlayerControls onTogglePlay={vi.fn()} onSeek={vi.fn()} shortcutSections={sections} />,
        );
      });
      const trigger = host.querySelector<HTMLButtonElement>(
        'button[aria-label="Shortcuts and tools"]',
      )!;
      openPanel(trigger);
      return panelOf(trigger).textContent ?? "";
    };
    const withoutSplit = DEFAULT_SHORTCUT_SECTIONS.map((section) => ({
      ...section,
      hints: section.hints.filter((hint) => hint.label !== "Split clip at playhead"),
    }));

    expect(listed()).toContain("Split clip at playhead");
    expect(listed(withoutSplit)).not.toContain("Split clip at playhead");
    expect(listed(withoutSplit)).toContain("Toggle fullscreen");
  });

  it("renders an embedder list that repeats a key or a section title without key clashes", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);
    const sections = [
      {
        title: "Keys",
        hints: [
          { key: "S", label: "Select" },
          { key: "S", label: "Snap" },
        ],
      },
      { title: "Keys", hints: [{ key: "V", label: "Move" }] },
    ];
    act(() => {
      mount(host).render(
        <PlayerControls onTogglePlay={vi.fn()} onSeek={vi.fn()} shortcutSections={sections} />,
      );
    });
    openPanel(host.querySelector<HTMLButtonElement>('button[aria-label="Shortcuts and tools"]')!);

    expect(document.body.textContent).toContain("Select");
    expect(document.body.textContent).toContain("Snap");
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key/);
    errors.mockRestore();
  });

  it("ties the shortcuts button to its tooltip for screen readers", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    act(() => {
      mount(host).render(<ShortcutsButton sections={[{ title: "Host", hints: [] }]} />);
    });
    const button = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Shortcuts and tools"]',
    )!;

    act(() => button.focus());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const tip = document.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tip?.textContent).toBe("Shortcuts and tools");
    expect(button.getAttribute("aria-describedby")).toBe(tip?.id);
  });

  it("renders standalone for a host toolbar, reading the player store", () => {
    const { duration, inPoint, requestSeek: storeSeek } = usePlayerStore.getState();
    const requestSeek = vi.fn();
    usePlayerStore.setState({ duration: 10, inPoint: 2, requestSeek });
    try {
      const host = document.createElement("div");
      document.body.append(host);
      act(() => {
        mount(host).render(<ShortcutsButton sections={[{ title: "Host", hints: [] }]} />);
      });
      openPanel(host.querySelector<HTMLButtonElement>('button[aria-label="Shortcuts and tools"]')!);
      expect(document.body.textContent).toContain("Host");
      expect(document.body.textContent).toContain("00:02");

      const input = document.querySelector<HTMLInputElement>('input[aria-label="Jump to frame"]')!;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
          input,
          "30",
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      act(() => {
        input.form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      expect(requestSeek).toHaveBeenCalledWith(1);
    } finally {
      usePlayerStore.setState({ duration, inPoint, requestSeek: storeSeek });
    }
  });
});
