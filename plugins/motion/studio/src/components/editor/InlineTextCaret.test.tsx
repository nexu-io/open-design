// @vitest-environment happy-dom

import React, { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupMounted, trackedRoot } from "../ui/mountHost.testHelpers";
import { CARET_PX, InlineTextCaret } from "./InlineTextCaret";
import type { InlineTextEditSession } from "../../hooks/useInlineTextEdit";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  // Unmount before clearing the body: the caret is portaled there, so clearing first orphans React's node.
  cleanupMounted();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

/** A frame showing the composition at a quarter of its width, from 100,50 on Studio's screen. */
function fakeFrame() {
  const iframe = document.body.appendChild(document.createElement("iframe"));
  iframe.getBoundingClientRect = () =>
    ({ left: 100, top: 50, width: window.innerWidth / 4 }) as DOMRect;
  return iframe;
}

/** A text open for editing in a fake frame shown at a quarter of the composition's width, its caret after "Ti". */
function scene() {
  document.body.innerHTML = `<h1 contenteditable="true" style="color: rgb(250, 250, 250)">Title</h1>`;
  const element = document.body.firstElementChild as HTMLElement;
  const iframe = fakeFrame();
  vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([
    { left: 400, top: 200, height: 120 },
  ] as unknown as DOMRectList);
  element.focus();
  const text = element.firstChild as Text;
  window.getSelection()!.collapse(text, 2);
  const session: InlineTextEditSession = {
    element,
    original: "Title",
    outline: "",
    outlineOffset: "",
  };
  return { element, iframe, session, text };
}

function render(session: InlineTextEditSession | null, iframe: HTMLIFrameElement | null) {
  const root = trackedRoot(document.body.appendChild(document.createElement("div")));
  act(() => root.render(<InlineTextCaret session={session} iframe={iframe} />));
  return { root, caret: () => document.querySelector<HTMLElement>("[data-inline-text-caret]") };
}

const fire = (target: EventTarget, type: string) =>
  act(() => void target.dispatchEvent(new Event(type)));

describe("InlineTextCaret", () => {
  it("draws a 2 px caret on Studio's screen where the composition's caret stands, in the text's colour", () => {
    const { iframe, session } = scene();
    const caret = render(session, iframe).caret();
    expect(caret).not.toBeNull();
    expect(caret!.style.left).toBe(`${100 + 400 / 4 - CARET_PX / 2}px`);
    expect(caret!.style.top).toBe(`${50 + 200 / 4}px`);
    expect(caret!.style.height).toBe(`${120 / 4}px`);
    expect(caret!.style.width).toBe(`${CARET_PX}px`);
    expect(caret!.style.background).toBe("rgb(250, 250, 250)");
  });

  it("follows a pan or zoom of the preview, which moves the iframe with no event", async () => {
    const { iframe, session } = scene();
    const caret = render(session, iframe).caret;
    iframe.getBoundingClientRect = () =>
      ({ left: 140, top: 50, width: window.innerWidth / 4 }) as DOMRect;
    await act(() => new Promise((done) => requestAnimationFrame(() => done(undefined))));
    expect(caret()!.style.left).toBe(`${140 + 400 / 4 - CARET_PX / 2}px`);
  });

  it("after End at a soft wrap the caret stands at the earlier line's end; after Home, at the next line's start", () => {
    const { element, iframe, session } = scene();
    // A collapsed range at a wrap point has the next line's box; the character before it ends the earlier line.
    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      return (this.collapsed
        ? [{ left: 0, top: 320, height: 120 }]
        : [{ left: 300, right: 400, top: 200, height: 120 }]) as unknown as DOMRectList;
    });
    const caret = render(session, iframe).caret;
    const press = (key: string) => {
      act(() => void element.dispatchEvent(new KeyboardEvent("keydown", { key })));
      fire(document, "selectionchange");
    };
    press("End");
    expect([caret()!.style.left, caret()!.style.top]).toEqual([
      `${100 + 400 / 4 - CARET_PX / 2}px`,
      `${50 + 200 / 4}px`,
    ]);
    press("Shift");
    expect(caret()!.style.top, "a modifier alone keeps the side").toBe(`${50 + 200 / 4}px`);
    press("Home");
    expect([caret()!.style.left, caret()!.style.top]).toEqual([
      `${100 - CARET_PX / 2}px`,
      `${50 + 320 / 4}px`,
    ]);
  });

  it("shows no caret while a range is selected, and again once the selection collapses", () => {
    const { iframe, session, text } = scene();
    const { caret } = render(session, iframe);
    act(() => window.getSelection()!.setBaseAndExtent(text, 0, text, 3));
    fire(document, "selectionchange");
    expect(caret()).toBeNull();
    act(() => window.getSelection()!.collapse(text, 3));
    fire(document, "selectionchange");
    expect(caret()).not.toBeNull();
  });

  it("shows no caret while an input method composes, nor once the text loses focus", () => {
    const { element, iframe, session } = scene();
    const { caret } = render(session, iframe);
    fire(element, "compositionstart");
    expect(caret()).toBeNull();
    fire(element, "compositionend");
    expect(caret()).not.toBeNull();
    act(() => element.blur());
    fire(element, "blur");
    expect(caret()).toBeNull();
  });

  it("hides the browser's own caret while it draws one, and gives it back after", () => {
    const { element, iframe, session } = scene();
    element.style.caretColor = "red";
    const { root } = render(session, iframe);
    expect(element.style.caretColor).toBe("transparent");
    act(() => root.render(<InlineTextCaret session={null} iframe={iframe} />));
    expect(element.style.caretColor).toBe("red");
  });

  it("stands at the end of a bold word when the caret is past it, where no box of its own is drawn", () => {
    document.body.innerHTML = `<h1 contenteditable="true">Go <strong>bold</strong></h1>`;
    const element = document.body.firstElementChild as HTMLElement;
    const iframe = fakeFrame();
    vi.spyOn(Range.prototype, "getClientRects").mockImplementation(function (this: Range) {
      const rects = this.collapsed ? [] : [{ left: 300, right: 500, top: 200, height: 120 }];
      return rects as unknown as DOMRectList;
    });
    element.focus();
    window.getSelection()!.collapse(element, element.childNodes.length);
    const session = { element, original: "", outline: "", outlineOffset: "" };
    const caret = render(session, iframe).caret();
    expect(caret!.style.left).toBe(`${100 + 500 / 4 - CARET_PX / 2}px`);
    expect(caret!.style.top).toBe(`${50 + 200 / 4}px`);
  });
});
