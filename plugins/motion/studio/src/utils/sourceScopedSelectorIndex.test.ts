// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { getSourceScopedSelectorIndex, withSelectorIndexPass } from "./sourceScopedSelectorIndex";

// The per-element algorithm this helper used before it grew a per-pass index,
// transcribed verbatim. It is the independent source the memoized results are
// checked against — including the misses, which are `indexOf` returning -1.
function referenceIndex(
  doc: Document,
  el: Element,
  selector: string | undefined,
  sourceFile: string | undefined,
  resolveSourceFile: (candidate: Element) => string | undefined,
): number | undefined {
  if (!selector || selector.startsWith("#") || selector.startsWith("[data-composition-id=")) {
    return undefined;
  }
  try {
    const scope = sourceFile ?? "index.html";
    const matches = Array.from(doc.querySelectorAll(selector)).filter(
      (candidate) => (resolveSourceFile(candidate) ?? "index.html") === scope,
    );
    const matchIndex = matches.indexOf(el);
    return matchIndex >= 0 ? matchIndex : undefined;
  } catch {
    return undefined;
  }
}

const bySourceFile = (candidate: Element): string | undefined =>
  candidate.closest("[data-composition-file]")?.getAttribute("data-composition-file") ?? undefined;

// Two source files sharing one class, plus an unscoped element, is the case
// source-file scoping exists for: raw document order would number these 0..4.
function mixedSourceDocument(): Document {
  const doc = document.implementation.createHTMLDocument("mixed");
  doc.body.innerHTML = `
    <div data-composition-id="root">
      <section data-composition-file="a.html">
        <p class="box" id="a0">a0</p>
        <p class="box" id="a1">a1</p>
      </section>
      <section data-composition-file="b.html">
        <p class="box" id="b0">b0</p>
        <p class="box" id="b1">b1</p>
      </section>
      <p class="box" id="root0">root0</p>
    </div>
  `;
  return doc;
}

describe("getSourceScopedSelectorIndex", () => {
  it("numbers occurrences within each source file, not across the flattened document", () => {
    const doc = mixedSourceDocument();
    const read = (id: string, sourceFile: string | undefined) =>
      getSourceScopedSelectorIndex(doc, doc.getElementById(id)!, ".box", sourceFile, bySourceFile);

    expect(read("a0", "a.html")).toBe(0);
    expect(read("a1", "a.html")).toBe(1);
    expect(read("b0", "b.html")).toBe(0);
    expect(read("b1", "b.html")).toBe(1);
    expect(read("root0", undefined)).toBe(0);
    // Asking for an element under the wrong scope is a miss, not a neighbour's index.
    expect(read("b0", "a.html")).toBeUndefined();
  });

  it("matches the per-element reference for every element, inside a pass and outside it", () => {
    const doc = mixedSourceDocument();
    const boxes = Array.from(doc.querySelectorAll(".box"));
    const scopes = [undefined, "index.html", "a.html", "b.html", "missing.html"];
    const cases = boxes.flatMap((el) => scopes.map((scope) => ({ el, scope })));

    const expected = cases.map(({ el, scope }) =>
      referenceIndex(doc, el, ".box", scope, bySourceFile),
    );

    const outsidePass = cases.map(({ el, scope }) =>
      getSourceScopedSelectorIndex(doc, el, ".box", scope, bySourceFile),
    );
    const insidePass = withSelectorIndexPass(doc, () =>
      cases.map(({ el, scope }) =>
        getSourceScopedSelectorIndex(doc, el, ".box", scope, bySourceFile),
      ),
    );

    expect(outsidePass).toEqual(expected);
    expect(insidePass).toEqual(expected);
  });

  it("returns undefined for the selectors that carry their own identity", () => {
    const doc = mixedSourceDocument();
    const el = doc.getElementById("a0")!;
    for (const selector of [undefined, "#a0", '[data-composition-id="root"]']) {
      expect(
        getSourceScopedSelectorIndex(doc, el, selector, "a.html", bySourceFile),
      ).toBeUndefined();
      expect(
        withSelectorIndexPass(doc, () =>
          getSourceScopedSelectorIndex(doc, el, selector, "a.html", bySourceFile),
        ),
      ).toBeUndefined();
    }
  });

  it("returns undefined for an invalid selector rather than throwing", () => {
    const doc = mixedSourceDocument();
    const el = doc.getElementById("a0")!;
    expect(getSourceScopedSelectorIndex(doc, el, ".((", "a.html", bySourceFile)).toBeUndefined();
    expect(
      withSelectorIndexPass(doc, () =>
        getSourceScopedSelectorIndex(doc, el, ".((", "a.html", bySourceFile),
      ),
    ).toBeUndefined();
  });

  it("does not reuse one document's index for another, and restores the outer pass", () => {
    const inner = mixedSourceDocument();
    const outer = mixedSourceDocument();
    // A nested pass over a different document must not answer from, or poison,
    // the outer document's index.
    const nested = withSelectorIndexPass(outer, () =>
      withSelectorIndexPass(inner, () =>
        getSourceScopedSelectorIndex(
          inner,
          inner.getElementById("b1")!,
          ".box",
          "b.html",
          bySourceFile,
        ),
      ),
    );
    expect(nested).toBe(1);

    const afterNested = withSelectorIndexPass(outer, () => {
      withSelectorIndexPass(inner, () => undefined);
      return getSourceScopedSelectorIndex(
        outer,
        outer.getElementById("a1")!,
        ".box",
        "a.html",
        bySourceFile,
      );
    });
    expect(afterNested).toBe(1);
  });
});
