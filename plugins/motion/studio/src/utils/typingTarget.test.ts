// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { isTypingTarget, ownsPlainKeys } from "./typingTarget";
import { isEditableTarget } from "./timelineDiscovery";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe("isTypingTarget", () => {
  it("keeps the legacy import on the same canonical decision", () => {
    expect(isEditableTarget).toBe(isTypingTarget);
  });

  // The bug this exists for: inline text editing uses plaintext-only, an
  // attribute selector for 'true' missed it, and the playback shortcuts ate
  // every letter typed into the composition.
  it("recognises a plaintext-only editable, not just contenteditable=true", () => {
    expect(isTypingTarget(mount('<h1 contenteditable="plaintext-only">Hi</h1>'))).toBe(true);
    expect(isTypingTarget(mount('<h1 contenteditable="true">Hi</h1>'))).toBe(true);
    expect(isTypingTarget(mount("<h1 contenteditable>Hi</h1>"))).toBe(true);
  });

  it("recognises a child of an editable, which a selector on the target alone misses", () => {
    const host = mount('<div contenteditable="true"><span>inner</span></div>');
    expect(isTypingTarget(host.querySelector("span"))).toBe(true);
  });

  it("recognises the ordinary fields too", () => {
    expect(isTypingTarget(mount("<input />"))).toBe(true);
    expect(isTypingTarget(mount("<textarea></textarea>"))).toBe(true);
    expect(isTypingTarget(mount("<select></select>"))).toBe(true);
    expect(isTypingTarget(mount('<div role="textbox"></div>'))).toBe(true);
    expect(isTypingTarget(mount('<div role="searchbox"></div>'))).toBe(true);
    expect(isTypingTarget(mount('<div role="combobox"></div>'))).toBe(true);
  });

  it("gives a focused slider its plain keys but leaves Cmd shortcuts to the app", () => {
    const slider = mount('<div role="slider" tabindex="0"></div>');
    expect(ownsPlainKeys(slider)).toBe(true);
    // Undo, copy and group still reach the app while a slider has focus.
    expect(isTypingTarget(slider)).toBe(false);
  });

  it("leaves the keys alone for anything that is not being typed into", () => {
    expect(isTypingTarget(mount("<div>plain</div>"))).toBe(false);
    expect(isTypingTarget(mount("<button>press</button>"))).toBe(false);
    expect(isTypingTarget(mount('<h1 contenteditable="false">Hi</h1>'))).toBe(false);
  });

  it("keeps a modal dialog's buttons out of the global shortcuts", () => {
    const host = mount('<div role="dialog" aria-modal="true"><button>OK</button></div>');
    expect(isTypingTarget(host.querySelector("button"))).toBe(true);
    expect(
      isTypingTarget(mount('<div role="dialog"><button>OK</button></div>').querySelector("button")),
    ).toBe(false);
  });

  it("says no to nothing at all", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});

describe("ownsPlainKeys", () => {
  it("is true for a native player with controls and for anything typing claims", () => {
    expect(ownsPlainKeys(mount("<video controls></video>"))).toBe(true);
    expect(ownsPlainKeys(mount("<audio controls></audio>"))).toBe(true);
    expect(ownsPlainKeys(mount("<input />"))).toBe(true);
  });

  it("is false for a player without controls and for plain elements", () => {
    expect(ownsPlainKeys(mount("<video></video>"))).toBe(false);
    expect(ownsPlainKeys(mount("<div></div>"))).toBe(false);
  });
});
