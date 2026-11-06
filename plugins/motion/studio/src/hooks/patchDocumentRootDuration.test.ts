// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { patchDocumentRootDuration } from "./timelineEditingHelpers";

// The regression these guard against: timing edits now soft-reload instead of
// full-reloading the iframe, so the runtime recomputes the composition length
// from the ROOT's `data-duration` and posts it back — overwriting the studio's
// optimistic duration readout. Patching the live root's `data-duration` in the
// same tick keeps the runtime's post-soft-reload report in agreement, so the
// readout stays live on grow AND shrink instead of snapping back.
function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("patchDocumentRootDuration", () => {
  it("writes the content end onto the TOP-LEVEL composition root (grow)", () => {
    const doc = parse(`
      <div data-composition-id="root" data-duration="15.18">
        <div data-composition-id="scene" data-start="0" data-duration="8"></div>
        <div data-start="12" data-duration="8"></div>
      </div>
    `);
    expect(patchDocumentRootDuration(doc, 20)).toBe(true);
    const root = doc.querySelector('[data-composition-id="root"]');
    expect(root?.getAttribute("data-duration")).toBe("20");
    // Nested sub-composition is untouched — only the outermost root is the length.
    expect(doc.querySelector('[data-composition-id="scene"]')?.getAttribute("data-duration")).toBe(
      "8",
    );
  });

  it("shrinks the root duration too (not grow-only)", () => {
    const doc = parse(`<div data-composition-id="root" data-duration="15.18"></div>`);
    expect(patchDocumentRootDuration(doc, 6.5)).toBe(true);
    expect(doc.querySelector("[data-composition-id]")?.getAttribute("data-duration")).toBe("6.5");
  });

  it("picks the composition with no ancestor composition as the root", () => {
    // Root appears AFTER a nested one in document order — selection must be by
    // ancestry, not first-match, matching the runtime's own root resolver.
    const doc = parse(`
      <section data-composition-id="root" data-duration="10">
        <div data-composition-id="inner" data-duration="4"></div>
      </section>
    `);
    patchDocumentRootDuration(doc, 12);
    expect(doc.querySelector('[data-composition-id="root"]')?.getAttribute("data-duration")).toBe(
      "12",
    );
    expect(doc.querySelector('[data-composition-id="inner"]')?.getAttribute("data-duration")).toBe(
      "4",
    );
  });

  it("no-ops on a non-positive or non-finite content end (never collapses to 0)", () => {
    const doc = parse(`<div data-composition-id="root" data-duration="15.18"></div>`);
    expect(patchDocumentRootDuration(doc, 0)).toBe(false);
    expect(patchDocumentRootDuration(doc, -3)).toBe(false);
    expect(patchDocumentRootDuration(doc, Number.NaN)).toBe(false);
    expect(doc.querySelector("[data-composition-id]")?.getAttribute("data-duration")).toBe("15.18");
  });

  it("no-ops when there is no composition root and reports false", () => {
    const doc = parse(`<div data-start="0" data-duration="5"></div>`);
    expect(patchDocumentRootDuration(doc, 10)).toBe(false);
  });

  it("returns false for a null document", () => {
    expect(patchDocumentRootDuration(null, 10)).toBe(false);
  });
});
