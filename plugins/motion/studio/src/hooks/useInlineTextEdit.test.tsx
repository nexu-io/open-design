// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewReadOnlyProvider } from "../components/editor/previewReadOnlyContext";
import { useInlineTextEdit, type InlineTextEditControls } from "./useInlineTextEdit";
import { applyUndoRestoreToPreview } from "../utils/gsapUndoRestore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** A heading in the document, standing in for one in the preview. */
function heading(text = "Motion Playground"): HTMLElement {
  const element = document.createElement("h1");
  element.textContent = text;
  document.body.append(element);
  return element;
}

function mount(onCommit = vi.fn(), onPause = vi.fn(), readOnly = false) {
  const controls: { current: InlineTextEditControls | null } = { current: null };
  function Probe() {
    controls.current = useInlineTextEdit({ onCommit, onPause });
    return null;
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <PreviewReadOnlyProvider readOnly={readOnly}>
        <Probe />
      </PreviewReadOnlyProvider>,
    ),
  );
  return { controls: () => controls.current!, root, onCommit, onPause };
}

describe("useInlineTextEdit", () => {
  // Selecting the whole text would mean the next keystroke destroys it, which
  // is a bad thing to do to someone who double-clicked to fix a typo.
  it("leaves the caret after the last character, with nothing selected", async () => {
    const element = heading("Motion Playground");
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    const selection = document.getSelection()!;
    expect(selection.toString()).toBe("");
    expect(selection.isCollapsed).toBe(true);
    expect(selection.anchorOffset).toBe(element.textContent!.length);
    act(() => root.unmount());
  });

  /**
   * Removing contenteditable and blurring does not drop the browser's own
   * highlight, so a word picked with a double press stayed painted grey after
   * the click that closed the edit — text that reads as selected in an element
   * that is no longer being edited.
   */
  it("drops the highlight when the edit closes", () => {
    const element = heading("Hello world, style me");
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    // Select "world", the way a double press inside the text does.
    const text = element.firstChild!;
    const range = document.createRange();
    range.setStart(text, 6);
    range.setEnd(text, 11);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(selection.toString()).toBe("world");

    act(() => controls().commit());

    expect(selection.toString()).toBe("");
    act(() => root.unmount());
  });

  it("leaves a selection outside the edited element alone", () => {
    const element = heading("Hello world, style me");
    const outsider = heading("somewhere else entirely");
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    const range = document.createRange();
    range.selectNodeContents(outsider);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    act(() => controls().commit());

    expect(selection.toString()).toBe("somewhere else entirely");
    act(() => root.unmount());
  });

  it("drops a selection dragged across the edited element's boundary", () => {
    const element = heading("Hello world");
    const outsider = heading("somewhere else");
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    const range = document.createRange();
    range.setStart(element.firstChild!, 6);
    range.setEnd(outsider.firstChild!, 4);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);

    act(() => controls().commit());

    expect(selection.toString()).toBe("");
    act(() => root.unmount());
  });

  it("makes the element editable, and focuses it once the press has finished", async () => {
    const element = heading();
    const { controls, root, onPause } = mount();

    act(() => {
      controls().start(element);
    });

    // Not `plaintext-only`: that would make it impossible to give three
    // characters a colour, which is the point of editing in the composition.
    expect(element.getAttribute("contenteditable")).toBe("true");
    expect(controls().session?.element).toBe(element);
    // The frame being edited is the one the user chose to edit on.
    expect(onPause).toHaveBeenCalledTimes(1);

    // Focus lands on the next frame, after the press that opened this and the
    // click that follows it have both been and gone.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    expect(document.activeElement).toBe(element);
    act(() => root.unmount());
  });

  it("cancels a pending focus frame when the editor unmounts", () => {
    const element = heading();
    vi.spyOn(window, "requestAnimationFrame").mockReturnValue(42);
    const cancelFrame = vi.spyOn(window, "cancelAnimationFrame");
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    act(() => root.unmount());

    expect(cancelFrame).toHaveBeenCalledWith(42);
    expect(element.hasAttribute("contenteditable")).toBe(false);
  });

  it("saves an open edit when the editor unmounts", () => {
    const element = heading();
    const { controls, root, onCommit } = mount();

    act(() => {
      controls().start(element);
    });
    element.textContent = "Motion Playground Live";
    act(() => root.unmount());

    expect(onCommit.mock.calls).toEqual([
      [{ element, html: "Motion Playground Live", previousHtml: "Motion Playground" }],
    ]);
    expect(element.hasAttribute("contenteditable")).toBe(false);
  });

  it("keeps the edit open when the commit function changes", () => {
    const element = heading();
    const controls: { current: InlineTextEditControls | null } = { current: null };
    function Probe({ onCommit }: { onCommit: () => void }) {
      controls.current = useInlineTextEdit({ onCommit });
      return null;
    }
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    const first = vi.fn();
    const second = vi.fn();
    act(() => root.render(<Probe onCommit={first} />));
    act(() => {
      controls.current!.start(element);
    });
    act(() => root.render(<Probe onCommit={second} />));

    expect(controls.current!.session?.element).toBe(element);
    expect(first).not.toHaveBeenCalled();
    act(() => root.unmount());
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("hands the current text over exactly once when it commits", () => {
    const element = heading();
    const { controls, root, onCommit } = mount();

    act(() => {
      controls().start(element);
    });
    element.textContent = "Motion Playground Live";
    act(() => controls().commit());

    expect(onCommit.mock.calls).toEqual([
      [{ element, html: "Motion Playground Live", previousHtml: "Motion Playground" }],
    ]);
    act(() => root.unmount());
  });

  // Cancelling must leave the preview exactly as it found it: the element was
  // being mutated live, and nothing was persisted.
  it("puts the original text back on cancel, and commits nothing", () => {
    const element = heading("Motion Playground");
    const { controls, root, onCommit } = mount();

    act(() => {
      controls().start(element);
    });
    element.textContent = "half-typed";
    act(() => controls().cancel());

    expect(element.textContent).toBe("Motion Playground");
    expect(onCommit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it.each([
    ["commit", (c: InlineTextEditControls) => c.commit()],
    ["cancel", (c: InlineTextEditControls) => c.cancel()],
  ])("stops being editable after %s", (_name, close) => {
    const element = heading();
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    act(() => close(controls()));

    expect(element.hasAttribute("contenteditable")).toBe(false);
    expect(controls().session).toBeNull();
    act(() => root.unmount());
  });

  // A session that failed to close would leave the canvas unable to select.
  it("tears down once when it is closed twice", () => {
    const element = heading();
    const { controls, root, onCommit } = mount();

    act(() => {
      controls().start(element);
    });
    act(() => controls().commit());
    act(() => controls().commit());

    expect(onCommit).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("refuses to open a second session over an open one", () => {
    const first = heading("first");
    const second = heading("second");
    const { controls, root } = mount();

    let opened = false;
    act(() => {
      controls().start(first);
      opened = controls().start(second);
    });

    expect(opened).toBe(false);
    expect(controls().session?.element).toBe(first);
    expect(second.hasAttribute("contenteditable")).toBe(false);
    act(() => root.unmount());
  });

  // The composition reloads while an edit is open often enough to matter.
  it("closes without throwing when the element has left the document", () => {
    const element = heading();
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    element.remove();

    expect(() => act(() => controls().cancel())).not.toThrow();
    expect(controls().session).toBeNull();
    act(() => root.unmount());
  });

  describe("the keys that end it", () => {
    function press(element: HTMLElement, key: string, shiftKey = false) {
      act(() => {
        element.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }));
      });
    }

    it("commits on Enter", () => {
      const element = heading();
      const { controls, root, onCommit } = mount();
      act(() => {
        controls().start(element);
      });

      element.textContent = "Renamed";
      press(element, "Enter");

      expect(onCommit.mock.calls).toEqual([
        [{ element, html: "Renamed", previousHtml: "Motion Playground" }],
      ]);
      expect(controls().session).toBeNull();
      act(() => root.unmount());
    });

    // A multi-line element still needs a way to get a line break.
    it("leaves Shift+Enter alone", () => {
      const element = heading();
      const { controls, root, onCommit } = mount();
      act(() => {
        controls().start(element);
      });

      press(element, "Enter", true);

      expect(onCommit).not.toHaveBeenCalled();
      expect(controls().session).not.toBeNull();
      act(() => root.unmount());
    });

    it("commits on Escape", () => {
      const element = heading("Original");
      const { controls, root, onCommit } = mount();
      act(() => {
        controls().start(element);
      });

      element.textContent = "half-typed";
      press(element, "Escape");

      expect(element.textContent).toBe("half-typed");
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(controls().session).toBeNull();
      act(() => root.unmount());
    });

    // The save carries the styled markup it replaced, which is what undo puts back.
    it("saves typing ended by Escape once, with the markup it replaced", async () => {
      const element = heading();
      element.innerHTML = 'Hello <span style="color: red">world</span>';
      const { controls, root, onCommit } = mount();
      act(() => {
        controls().start(element);
      });
      await act(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });
      expect(document.activeElement).toBe(element);

      element.innerHTML = 'Hello <span style="color: red">world</span>!';
      press(element, "Escape");

      expect(onCommit.mock.calls).toEqual([
        [
          {
            element,
            html: 'Hello <span style="color: red">world</span>!',
            previousHtml: 'Hello <span style="color: red">world</span>',
          },
        ],
      ]);
      expect(element.innerHTML).toBe('Hello <span style="color: red">world</span>!');
      act(() => root.unmount());
    });

    it("commits when the element loses focus", () => {
      const element = heading();
      const { controls, root, onCommit } = mount();
      act(() => {
        controls().start(element);
      });

      element.textContent = "Clicked away";
      act(() => element.dispatchEvent(new FocusEvent("blur")));

      expect(onCommit.mock.calls).toEqual([
        [{ element, html: "Clicked away", previousHtml: "Motion Playground" }],
      ]);
      act(() => root.unmount());
    });

    it("stops listening once the session is over", () => {
      const element = heading();
      const { controls, root, onCommit } = mount();
      act(() => {
        controls().start(element);
      });
      act(() => controls().commit());

      press(element, "Enter");

      expect(onCommit).toHaveBeenCalledTimes(1);
      act(() => root.unmount());
    });
  });

  // The mark that says the caret is in the text, not that the element is
  // selected. It has to live in the same document as the caret to read so.
  it("outlines the element while it is being edited, and puts it back after", () => {
    const element = heading();
    element.style.outline = "1px dotted red";
    element.style.outlineOffset = "6px";
    const { controls, root } = mount();

    act(() => {
      controls().start(element);
    });
    // Serialisation order is the browser's; what matters is that it is the
    // accent, solid, and thicker than whatever it replaced.
    expect(element.style.outline).toContain("#3CE6AC");
    expect(element.style.outline).toContain("2px");

    act(() => controls().cancel());
    expect(element.style.outline).toContain("dotted");
    expect(element.style.outline).toContain("red");
    expect(element.style.getPropertyValue("outline-offset")).toBe("6px");
    act(() => root.unmount());
  });

  // Opening on a point is what makes this feel like text rather than a dialog.
  it("opens the caret where the press landed when it can resolve one", async () => {
    const element = heading("Motion Playground");
    const range = document.createRange();
    range.setStart(element.firstChild!, 6);
    range.collapse(true);
    const doc = document as Document & { caretRangeFromPoint?: unknown };
    const original = doc.caretRangeFromPoint;
    doc.caretRangeFromPoint = () => range;

    const { controls, root } = mount();
    act(() => {
      controls().start(element, { x: 120, y: 40 });
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    expect(document.getSelection()?.anchorOffset).toBe(6);
    doc.caretRangeFromPoint = original;
    act(() => root.unmount());
  });

  // A point that resolves outside the element (a rotated glyph, a gap) must
  // not put the caret in someone else's text.
  it("falls back to the end when the point lands outside the element", async () => {
    const element = heading("Motion Playground");
    const stranger = heading("Somewhere else");
    const strayRange = document.createRange();
    strayRange.setStart(stranger.firstChild!, 3);
    strayRange.collapse(true);
    const doc = document as Document & { caretRangeFromPoint?: unknown };
    const original = doc.caretRangeFromPoint;
    doc.caretRangeFromPoint = () => strayRange;

    const { controls, root } = mount();
    act(() => {
      controls().start(element, { x: 9999, y: 9999 });
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });

    const selection = document.getSelection()!;
    expect(selection.anchorNode?.parentElement).toBe(element);
    expect(selection.anchorOffset).toBe(element.textContent!.length);
    doc.caretRangeFromPoint = original;
    act(() => root.unmount());
  });

  // Double click takes the word and triple click takes the lot, in this element
  // exactly as in any other text field, because nothing here interferes with
  // either. Claiming the double click for select-all cost the word selection.
  it("leaves double and triple click to the browser", async () => {
    const element = heading("Motion Playground");
    const { controls, root } = mount();
    act(() => {
      controls().start(element);
    });
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    });
    const before = document.getSelection()?.toString();

    act(() => element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));

    // No handler ran, so the selection is untouched: the real browser would
    // have set it to the word under the pointer before this ever fired.
    expect(document.getSelection()?.toString()).toBe(before);
    act(() => root.unmount());
  });
});

// Styling a run of characters is what the element is edited in place for, and
// it only counts once the markup survives the trip out of the element.
describe("useInlineTextEdit with styled runs", () => {
  it("hands over the markup, not just the words", () => {
    const element = heading("hello");
    const { controls, onCommit, root } = mount();

    act(() => {
      controls().start(element);
    });
    element.innerHTML = 'hell<span style="color: red">o</span>';
    act(() => controls().commit());

    expect(onCommit).toHaveBeenCalledWith({
      element,
      html: 'hell<span style="color: red">o</span>',
      previousHtml: "hello",
    });
    act(() => root.unmount());
  });

  it("cleans what it hands over, so the preview shows what will be saved", () => {
    const element = heading("hello");
    const { controls, onCommit, root } = mount();

    act(() => {
      controls().start(element);
    });
    element.innerHTML = '<span onclick="steal()" style="position: fixed">hi</span>';
    act(() => controls().commit());

    expect(onCommit).toHaveBeenCalledWith({
      element,
      html: "<span>hi</span>",
      previousHtml: "hello",
    });
    // Cleaned in the element too, not only on the way out.
    expect(element.innerHTML).toBe("<span>hi</span>");
    act(() => root.unmount());
  });

  it("puts the styling back on cancel, not just the letters", () => {
    const element = heading();
    element.innerHTML = '<span style="color: red">before</span>';
    const { controls, onCommit, root } = mount();

    act(() => {
      controls().start(element);
    });
    element.innerHTML = "after";
    act(() => controls().cancel());

    expect(element.innerHTML).toBe('<span style="color: red">before</span>');
    expect(onCommit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("keeps the element markup-free when nothing was styled", () => {
    const element = heading("plain words");
    const { controls, onCommit, root } = mount();

    act(() => {
      controls().start(element);
    });
    act(() => controls().commit());

    expect(onCommit).toHaveBeenCalledWith({
      element,
      html: "plain words",
      previousHtml: "plain words",
    });
    act(() => root.unmount());
  });

  const plainTextTransfers: Array<{
    label: string;
    eventType: "paste" | "drop";
    transferProperty: "clipboardData" | "dataTransfer";
  }> = [
    { label: "pastes", eventType: "paste", transferProperty: "clipboardData" },
    { label: "drops", eventType: "drop", transferProperty: "dataTransfer" },
  ];

  it.each(plainTextTransfers)("$label the words without accepting markup", (testCase) => {
    const element = heading("hi");
    const { controls, root } = mount();
    act(() => {
      controls().start(element);
    });
    const insertText = vi.fn();
    Object.defineProperty(document, "execCommand", { configurable: true, value: insertText });
    const transfer = {
      getData: (type: string) =>
        type === "text/plain" ? "plain words" : '<img src="x" onerror="steal()">',
    };
    const event = new Event(testCase.eventType, { bubbles: true, cancelable: true });
    Object.defineProperty(event, testCase.transferProperty, { value: transfer });

    act(() => {
      if (testCase.eventType === "drop") {
        const dragover = new Event("dragover", { bubbles: true, cancelable: true });
        element.dispatchEvent(dragover);
        expect(dragover.defaultPrevented).toBe(true);
      }
      element.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(insertText).toHaveBeenCalledWith("insertText", false, "plain words");
    act(() => root.unmount());
  });

  it("refuses to open an edit while the preview is read-only", () => {
    const element = heading();
    const { controls, root, onCommit, onPause } = mount(vi.fn(), vi.fn(), true);
    let opened = true;
    act(() => {
      opened = controls().start(element);
    });
    expect(opened).toBe(false);
    expect(element.hasAttribute("contenteditable")).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

describe("an undo that lands while a text edit is open", () => {
  it("marks the edit as drawing nothing, so the undo reverts the move and keeps the edit", () => {
    const wrap = (body: string) => `<html><body>${body}</body></html>`;
    const moved = `<h1 id="t" style="translate: 90px 60px">Title</h1>`;
    document.body.innerHTML = moved;
    const element = document.getElementById("t")!;
    const { controls, root } = mount();
    act(() => {
      controls().start(element);
    });
    const contentWindow = { __player: { seek: vi.fn() }, __hfStudioManualEditsApply: vi.fn() };
    const iframe = { contentWindow, contentDocument: document } as unknown as HTMLIFrameElement;
    const files = {
      "index.html": { previous: wrap(moved), restored: wrap(`<h1 id="t">Title</h1>`) },
    };

    expect(element.getAttribute("data-hf-studio-manual-edit-gesture")).toMatch(/:edit$/);
    expect(applyUndoRestoreToPreview(iframe, "index.html", files, 0, vi.fn())).toBe("soft");

    expect(element.style.getPropertyValue("translate")).toBe("");
    expect(element.getAttribute("contenteditable")).toBe("true");
    expect(element.style.getPropertyValue("outline")).not.toBe("");
    act(() => root.unmount());
  });
});
