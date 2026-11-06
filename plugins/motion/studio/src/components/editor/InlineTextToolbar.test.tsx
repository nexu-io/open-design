// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupMounted, trackedRoot } from "../ui/mountHost.testHelpers";
import { InlineTextToolbar, swatchBackground } from "./InlineTextToolbar";
import type { InlineTextEditSession } from "../../hooks/useInlineTextEdit";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  // Unmount before clearing the body: the bar is portaled there, so clearing first orphans React's node.
  cleanupMounted();
  document.body.innerHTML = "";
});

/** An element standing in for one in the preview, and a fake frame around it. */
function scene(html: string) {
  document.body.innerHTML = `<h1 contenteditable="true">${html}</h1>`;
  const element = document.body.firstElementChild as HTMLElement;
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  // The composition is drawn scaled, so the toolbar has to map out of it.
  iframe.getBoundingClientRect = () => ({ left: 100, top: 50, width: 400 }) as DOMRect;
  Object.defineProperty(iframe, "contentWindow", { value: window });
  const session: InlineTextEditSession = {
    element,
    original: html,
    outline: "",
    outlineOffset: "",
  };
  return { element, iframe, session };
}

function render(session: InlineTextEditSession | null, iframe: HTMLIFrameElement | null) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = trackedRoot(host);
  act(() => root.render(<InlineTextToolbar session={session} iframe={iframe} />));
  return { host, root, rerender: () => act(() => root.render(<div />)) };
}

function selectAll(element: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(element);
  const selection = document.getSelection()!;
  act(() => {
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

function selectAt(element: HTMLElement, top: number) {
  const range = document.createRange();
  range.selectNodeContents(element);
  range.getBoundingClientRect = () =>
    ({ left: 20, top, width: 100, height: 10 }) as unknown as DOMRect;
  const selection = document.getSelection()!;
  act(() => {
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}

function toolbarIn(host: HTMLElement): HTMLElement | null {
  return host.ownerDocument.querySelector<HTMLElement>('[data-inline-text-toolbar="true"]');
}

function renderSelected(html = "hello world") {
  const { element, session, iframe } = scene(html);
  const { host } = render(session, iframe);
  selectAll(element);
  return { element, host };
}

describe("InlineTextToolbar", () => {
  it("stays out of the way until characters are actually selected", () => {
    const { session, iframe } = scene("hello world");
    const { host } = render(session, iframe);

    expect(toolbarIn(host)).toBeNull();
  });

  it("appears once a run of characters is selected", () => {
    const { element, session, iframe } = scene("hello world");
    const { host } = render(session, iframe);

    selectAll(element);

    expect(toolbarIn(host)?.getAttribute("role")).toBe("toolbar");
    expect(toolbarIn(host)?.getAttribute("aria-label")).toBe("Text formatting");
  });

  it("goes away when the selection collapses again", () => {
    const { element, session, iframe } = scene("hello world");
    const { host } = render(session, iframe);
    selectAll(element);

    const selection = document.getSelection()!;
    act(() => {
      selection.collapseToEnd();
      document.dispatchEvent(new Event("selectionchange"));
    });

    expect(toolbarIn(host)).toBeNull();
  });

  it("shows nothing at all when no text is being edited", () => {
    const { iframe } = scene("hello");
    const { host } = render(null, iframe);

    expect(toolbarIn(host)).toBeNull();
  });

  it("keeps the press, so clicking a control does not collapse the selection", () => {
    const { element, session, iframe } = scene("hello world");
    const { host } = render(session, iframe);
    selectAll(element);

    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => void toolbarIn(host)!.dispatchEvent(press));

    expect(press.defaultPrevented).toBe(true);
  });

  // It renders inside the canvas overlay, so a press it lets through is read as
  // a click on the composition: the element deselects and the edit commits out
  // from under the button that was just pressed.
  it("keeps its presses away from the canvas underneath", () => {
    const { element, session, iframe } = scene("hello world");
    const seen: string[] = [];
    // A stand-in for the canvas overlay: the toolbar renders inside it, and
    // these are the handlers that would deselect the element.
    const host = document.createElement("div");
    document.body.append(host);
    const root = trackedRoot(host);
    act(() =>
      root.render(
        <div
          onPointerDown={() => seen.push("pointerdown")}
          onMouseDown={() => seen.push("mousedown")}
          onClick={() => seen.push("click")}
        >
          <InlineTextToolbar session={session} iframe={iframe} />
        </div>,
      ),
    );
    selectAll(element);

    const toolbar = toolbarIn(host)!;
    act(() => {
      for (const type of ["pointerdown", "mousedown", "click"]) {
        toolbar.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      }
    });

    expect(seen).toEqual([]);
  });

  // A colour input has a user-agent minimum width, so an invisible one pinned
  // only by `inset-0` spills across its neighbours: hovering bold opened the
  // colour picker.
  it("keeps the invisible colour input inside its own swatch", () => {
    const { element, session, iframe } = scene("hello world");
    const { host } = render(session, iframe);
    selectAll(element);

    const input = host.ownerDocument.querySelector<HTMLInputElement>('input[type="color"]')!;
    expect(input.className).toContain("w-full");
    expect(input.className).toContain("h-full");
    expect(input.className).toContain("min-w-0");
  });

  it("styles the selected characters when a control is used", () => {
    const { element, host } = renderSelected();

    act(() => host.ownerDocument.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!.click());

    expect(element.innerHTML).toBe('<span style="font-weight: 700">hello world</span>');
  });

  it("ignores a click when the selection disappeared before React hid the toolbar", () => {
    const { element, host } = renderSelected();
    const bold = host.ownerDocument.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!;

    expect(() => {
      act(() => {
        document.getSelection()!.removeAllRanges();
        bold.click();
      });
    }).not.toThrow();
    expect(element.innerHTML).toBe("hello world");
  });

  it("reads back the styling it applied, so the control shows the truth", () => {
    const { element, session, iframe } = scene('<span style="font-style: italic">words</span>');
    const { host } = render(session, iframe);

    selectAll(element);

    expect(
      host.ownerDocument.querySelector('[aria-label="Italic"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      host.ownerDocument.querySelector('[aria-label="Bold"]')?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("turns a style back off when the control is used again", () => {
    const { element, session, iframe } = scene('<span style="font-weight: 700">words</span>');
    const { host } = render(session, iframe);
    selectAll(element);

    act(() => host.ownerDocument.querySelector<HTMLButtonElement>('[aria-label="Bold"]')!.click());

    expect(element.innerHTML).toBe("words");
  });

  it("places itself over the selection, mapped out of the scaled composition", () => {
    const { element, session, iframe } = scene("hello world");
    const { host } = render(session, iframe);
    selectAt(element, 40);

    const toolbar = toolbarIn(host)!;
    // Frame at 100,50; scale 400/innerWidth; centre of the range, above it.
    const scale = 400 / window.innerWidth;
    expect(toolbar.style.left).toBe(`${100 + (20 + 50) * scale}px`);
    expect(toolbar.style.top).toBe(`${50 + 40 * scale - 10}px`);
  });
  it("moves below a selection that leaves no room above the viewport", () => {
    const { element, session, iframe } = scene("hello world");
    iframe.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400 }) as DOMRect;
    const { host } = render(session, iframe);
    selectAt(element, 0);

    const toolbar = toolbarIn(host)!;
    const scale = 400 / window.innerWidth;
    expect(toolbar.style.top).toBe(`${10 * scale + 10}px`);
    expect(toolbar.style.transform).toBe("translate(-50%, 0)");
  });

  it("shows the selection's colours in the swatch when they differ", () => {
    const { element, session, iframe } = scene(
      '<span style="color: red">Hello</span><span style="color: lime">world</span>',
    );
    const { host } = render(session, iframe);

    selectAll(element);

    const swatch = toolbarIn(host)!.querySelector<HTMLElement>("span[aria-hidden]")!;
    expect(swatch.style.backgroundImage).toBe("linear-gradient(135deg, red 0.00%, lime 100.00%)");
    // Without this the gradient repeats under the border, painting the end
    // colour along the leading edge and the start colour along the trailing one.
    expect(swatch.style.backgroundOrigin).toBe("border-box");
  });

  it("shows a plain swatch when the whole selection is one colour", () => {
    const { element, session, iframe } = scene('<span style="color: red">Hello world</span>');
    const { host } = render(session, iframe);

    selectAll(element);

    const swatch = toolbarIn(host)!.querySelector<HTMLElement>("span[aria-hidden]")!;
    expect(swatch.style.backgroundColor).toBe("red");
  });

  it("opens the colour input on a shorthand hex selection", () => {
    const { element, session, iframe } = scene('<span style="color: #f00">Hello world</span>');
    const { host } = render(session, iframe);

    selectAll(element);

    expect(host.ownerDocument.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe(
      "#ff0000",
    );
  });
});

describe("swatchBackground", () => {
  it("sweeps through each distinct colour, evenly spaced", () => {
    expect(swatchBackground(["red", "lime"], undefined)).toBe(
      "linear-gradient(135deg, red 0.00%, lime 100.00%)",
    );
    expect(swatchBackground(["red", "lime", "cyan"], undefined)).toBe(
      "linear-gradient(135deg, red 0.00%, lime 50.00%, cyan 100.00%)",
    );
  });

  it("stays a plain swatch when the selection is one colour", () => {
    expect(swatchBackground(["red"], "red")).toBe("red");
  });

  it("falls back to the agreed colour when the characters carry none", () => {
    expect(swatchBackground([], "rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(swatchBackground([], undefined)).toBe("#ffffff");
  });
});
