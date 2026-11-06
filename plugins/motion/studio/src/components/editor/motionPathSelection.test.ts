// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountGroupSiblings, stableSelectionFor } from "../../hooks/domSelectionTestHarness";
import { selectorFor } from "./motionPathSelection";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("selectorFor", () => {
  it("addresses one element for a class-only sibling", () => {
    const groups = mountGroupSiblings(3);
    const selector = selectorFor(stableSelectionFor(groups[2]!));

    // The bare ".group" both measured home off the FIRST sibling and wrote the
    // new motion path onto all three.
    expect(selector).not.toBe(".group");
    expect(document.querySelectorAll(selector!)).toHaveLength(1);
    expect(document.querySelector(selector!)).toBe(groups[2]);
  });

  it("keeps a unique id target", () => {
    document.body.innerHTML = `<div id="hero"></div>`;
    const el = document.querySelector<HTMLElement>("#hero")!;

    expect(selectorFor(stableSelectionFor(el))).toBe("#hero");
  });

  it("returns null with no selection", () => {
    expect(selectorFor(null)).toBeNull();
  });

  it("returns null when no rung addresses one element", () => {
    const groups = mountGroupSiblings(3);
    const selection = stableSelectionFor(groups[1]!);
    groups[1]!.remove();

    expect(selectorFor(selection)).toBeNull();
  });
});
