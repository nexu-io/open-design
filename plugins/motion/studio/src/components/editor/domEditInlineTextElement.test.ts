// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { canEditElementTextInline } from "./domEditInlineText";

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

describe("canEditElementTextInline", () => {
  it("opens a plain piece of copy", () => {
    expect(canEditElementTextInline(mount("<h1>hello world</h1>"))).toBe(true);
  });

  // The trap this exists for: styling a run of characters puts a span inside
  // the element, and a rule of "no element children" would have let the editor
  // lock every element it had ever styled out of itself, permanently.
  it("still opens an element that has been styled", () => {
    const element = mount('<h1>hell<span style="color: red">o</span> world</h1>');
    expect(canEditElementTextInline(element)).toBe(true);
  });

  it("opens an element whose formatting is nested", () => {
    const element = mount('<h1><b><span style="color: red">deep</span></b></h1>');
    expect(canEditElementTextInline(element)).toBe(true);
  });

  it("opens styled copy whose formatting comes from another window", () => {
    const element = mount("<h1>a <strong>bold</strong></h1>");
    // happy-dom shares classes across windows; drop this window's HTMLElement as a foreign realm would.
    Object.setPrototypeOf(element.firstElementChild, Element.prototype);
    expect(canEditElementTextInline(element)).toBe(true);
  });

  it("keeps out an element with a structural child, which the panel edits field by field", () => {
    expect(canEditElementTextInline(mount("<div><h1>a</h1><p>b</p></div>"))).toBe(false);
  });

  it("keeps out an element hiding something structural inside its formatting", () => {
    expect(canEditElementTextInline(mount("<h1><span><div>a</div></span></h1>"))).toBe(false);
  });

  it("keeps out the document itself", () => {
    expect(canEditElementTextInline(document.body)).toBe(false);
    expect(canEditElementTextInline(document.documentElement)).toBe(false);
  });

  it("keeps out an element that is already being edited", () => {
    const element = mount("<h1>hello</h1>");
    element.setAttribute("contenteditable", "true");
    expect(canEditElementTextInline(element)).toBe(false);
  });

  it("keeps out an element with no words in it", () => {
    expect(canEditElementTextInline(mount("<h1>   </h1>"))).toBe(false);
  });

  it("keeps out nothing at all", () => {
    expect(canEditElementTextInline(null)).toBe(false);
  });
});
