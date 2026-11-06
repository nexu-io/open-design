// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import {
  dropElementCropLift,
  hugRectForElement,
  liftElementCrop,
  readElementCropInsets,
} from "./domEditOverlayCrop";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

function cropped(style: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-hf-id", "hf-a");
  el.style.cssText = style;
  document.body.append(el);
  return el;
}

describe("crop lift", () => {
  it("shows the element uncropped over its inline clip, and drop takes the rule away", () => {
    const el = cropped("clip-path: inset(0px 60px 0px 0px)");
    liftElementCrop(el);
    expect(getComputedStyle(el).clipPath).toBe("none");
    expect(el.style.getPropertyValue("clip-path")).toBe("inset(0px 60px 0px 0px)");
    dropElementCropLift(el);
    expect(document.head.querySelectorAll("style")).toHaveLength(0);
    expect(getComputedStyle(el).clipPath).toBe("inset(0px 60px 0px 0px)");
  });

  it("still reads a stylesheet crop while lifted, and the hover hug shows the full box", () => {
    const sheet = document.createElement("style");
    sheet.textContent = '[data-hf-id="hf-a"] { clip-path: inset(0px 60px 0px 0px); }';
    document.head.append(sheet);
    const el = cropped("width: 300px");
    liftElementCrop(el);
    expect(readElementCropInsets(el)).toMatchObject({ right: 60 });
    const rect = { left: 0, top: 0, width: 300, height: 200, editScaleX: 1, editScaleY: 1 };
    expect(hugRectForElement(rect, el)).toEqual(rect);
  });
});
