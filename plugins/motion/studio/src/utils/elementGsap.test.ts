// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { elementTargets } from "./elementGsap";

it("keeps only the targets GSAP styles: not a plain object, not an XML-namespace element", () => {
  const box = document.createElement("div");
  const item = document.createElementNS("urn:x", "item");
  expect(elementTargets({ targets: () => [{}, item, box, null] })).toEqual([box]);
});
