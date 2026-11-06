// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { TimelineElement } from "../player/store/timelineElement";
import {
  mintElementHandle,
  parseElementHandle,
  resolveElementHandle,
  resolveLiveHandleSelection,
  timelineElementAddress,
} from "./handles";
import { previewDoc } from "./webmcpTestUtils";

function timelineElement(overrides: Partial<TimelineElement>): TimelineElement {
  return { id: "synthetic-id", tag: "div", start: 0, duration: 1, track: 0, ...overrides };
}

describe("mintElementHandle", () => {
  it("prefers data-hf-id, the stable patch target", () => {
    const handle = mintElementHandle(
      timelineElementAddress(
        timelineElement({ hfId: "abc123", domId: "headline", selector: ".title" }),
      ),
    );
    expect(handle).toBe("hf:v1:index.html:index.html:abc123");
  });

  it("falls back to the DOM id when there is no hf id", () => {
    expect(
      mintElementHandle(
        timelineElementAddress(timelineElement({ domId: "headline", selector: ".title" })),
      ),
    ).toBe("dom:v1:index.html:index.html:headline");
  });

  it("falls back to a selector with its occurrence index", () => {
    expect(
      mintElementHandle(
        timelineElementAddress(timelineElement({ selector: ".card", selectorIndex: 2 })),
      ),
    ).toBe("sel:v1:index.html:index.html:.card#2");
  });

  it("defaults a missing occurrence index to the first match", () => {
    expect(mintElementHandle(timelineElementAddress(timelineElement({ selector: ".card" })))).toBe(
      "sel:v1:index.html:index.html:.card#0",
    );
  });

  it("returns null when the element carries no way to address it", () => {
    // The synthesised `id` is deliberately NOT used: it cannot resolve.
    expect(mintElementHandle(timelineElementAddress(timelineElement({})))).toBeNull();
  });
});

describe("resolveLiveHandleSelection", () => {
  it("reports a transient change when the replacement preview has not rebuilt the target", async () => {
    const firstDoc = previewDoc('<div id="headline">before</div>');
    const replacementDoc = previewDoc("<main>reloading</main>");
    let currentDoc = firstDoc;

    const result = await resolveLiveHandleSelection(
      () => currentDoc,
      "dom:headline",
      async (element) => {
        currentDoc = replacementDoc;
        return { element };
      },
    );

    expect(result).toEqual({ status: "changed" });
  });

  it("reports a stable missing target as not found", async () => {
    const doc = previewDoc("<main>settled</main>");

    const result = await resolveLiveHandleSelection(
      () => doc,
      "dom:headline",
      async (element) => ({ element }),
    );

    expect(result).toEqual({ status: "not-found" });
  });
});

describe("parseElementHandle", () => {
  it("round-trips source ownership and the active composition", () => {
    expect(
      parseElementHandle(
        mintElementHandle({
          domId: "headline:hero",
          sourceFile: "compositions/hero.html",
          activeCompositionPath: "index.html",
        })!,
      ),
    ).toEqual({
      scheme: "dom",
      version: 1,
      value: "headline:hero",
      index: 0,
      sourceFile: "compositions/hero.html",
      activeCompositionPath: "index.html",
    });
  });

  it("encodes path, selector, colon, and hash delimiters without ambiguity", () => {
    const handle = mintElementHandle({
      selector: '#hero[data-label="a:b"] > .card:nth-child(2)',
      selectorIndex: 3,
      sourceFile: "compositions/a:b#hero.html",
      activeCompositionPath: "scenes/root:wide.html",
    });

    expect(parseElementHandle(handle!)).toEqual({
      scheme: "sel",
      version: 1,
      value: '#hero[data-label="a:b"] > .card:nth-child(2)',
      index: 3,
      sourceFile: "compositions/a:b#hero.html",
      activeCompositionPath: "scenes/root:wide.html",
    });
  });

  it("splits the index off the LAST hash, so id selectors survive", () => {
    expect(parseElementHandle("sel:#card > .title#3")).toEqual({
      scheme: "sel",
      version: 0,
      value: "#card > .title",
      index: 3,
    });
  });

  it("treats a selector with no index as the first match", () => {
    expect(parseElementHandle("sel:.card")).toEqual({
      scheme: "sel",
      version: 0,
      value: ".card",
      index: 0,
    });
  });

  it("round-trips the project identity in a writable v2 handle", () => {
    const handle = mintElementHandle({
      projectId: "project:demo",
      domId: "headline",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });

    expect(parseElementHandle(handle!)).toEqual({
      scheme: "dom",
      version: 2,
      projectId: "project:demo",
      value: "headline",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
      index: 0,
    });
  });

  it("rejects an unknown scheme", () => {
    expect(parseElementHandle("xpath://div")).toBeNull();
  });

  it("rejects a handle with no value", () => {
    expect(parseElementHandle("dom:")).toBeNull();
    expect(parseElementHandle("")).toBeNull();
    expect(parseElementHandle(":headline")).toBeNull();
  });
});

describe("resolveElementHandle", () => {
  it("round-trips every handle scheme a read can mint", () => {
    const doc = previewDoc(
      `<div id="headline" data-hf-id="abc123">A</div>
       <div class="card">first</div>
       <div class="card">second</div>`,
    );

    expect(resolveElementHandle(doc, "hf:abc123")?.id).toBe("headline");
    expect(resolveElementHandle(doc, "dom:headline")?.id).toBe("headline");
    expect(resolveElementHandle(doc, "sel:.card#1")?.textContent).toBe("second");
  });

  it("resolves across realms, where a naive instanceof check fails", () => {
    const doc = previewDoc('<div id="headline">A</div>');
    const resolved = resolveElementHandle(doc, "dom:headline");

    expect(resolved).not.toBeNull();
    // The preview element is NOT an instance of Studio's own HTMLElement.
    expect(resolved instanceof HTMLElement).toBe(false);
  });

  it("distinguishes duplicate authored ids by source file", () => {
    const doc = previewDoc(
      `<main data-composition-id="root" data-composition-file="index.html">
         <div id="duplicate">root</div>
         <section data-composition-id="nested" data-composition-file="compositions/nested.html">
           <div id="duplicate">nested</div>
         </section>
       </main>`,
    );
    const rootHandle = mintElementHandle({
      domId: "duplicate",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });
    const nestedHandle = mintElementHandle({
      domId: "duplicate",
      sourceFile: "compositions/nested.html",
      activeCompositionPath: "index.html",
    });

    expect(rootHandle).not.toBe(nestedHandle);
    expect(resolveElementHandle(doc, rootHandle!)?.textContent).toBe("root");
    expect(resolveElementHandle(doc, nestedHandle!)?.textContent).toBe("nested");
  });

  it("keeps selector occurrence indexes scoped to their source file", () => {
    const doc = previewDoc(
      `<main data-composition-id="root" data-composition-file="index.html">
         <div class="card">root first</div><div class="card">root second</div>
         <section data-composition-id="nested" data-composition-file="compositions/nested.html">
           <div class="card">nested first</div><div class="card">nested second</div>
         </section>
       </main>`,
    );
    const rootSecond = mintElementHandle({
      selector: ".card",
      selectorIndex: 1,
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });
    const nestedSecond = mintElementHandle({
      selector: ".card",
      selectorIndex: 1,
      sourceFile: "compositions/nested.html",
      activeCompositionPath: "index.html",
    });

    expect(resolveElementHandle(doc, rootSecond!)?.textContent).toBe("root second");
    expect(resolveElementHandle(doc, nestedSecond!)?.textContent).toBe("nested second");
  });

  it("re-resolves a scoped handle against the live document after reload", () => {
    const handle = mintElementHandle({
      domId: "headline",
      sourceFile: "index.html",
      activeCompositionPath: "index.html",
    });
    const firstDoc = previewDoc(
      '<main data-composition-id="root" data-composition-file="index.html"><div id="headline">before</div></main>',
    );
    const first = resolveElementHandle(firstDoc, handle!);
    const reloadedDoc = previewDoc(
      '<main data-composition-id="root" data-composition-file="index.html"><div id="headline">after</div></main>',
    );
    const reloaded = resolveElementHandle(reloadedDoc, handle!);

    expect(first?.textContent).toBe("before");
    expect(reloaded?.textContent).toBe("after");
    expect(reloaded).not.toBe(first);
    expect(reloaded?.ownerDocument).toBe(reloadedDoc);
  });

  it("returns null for a handle that no longer matches", () => {
    const doc = previewDoc('<div id="headline">A</div>');
    expect(resolveElementHandle(doc, "dom:deleted")).toBeNull();
    expect(resolveElementHandle(doc, "hf:missing")).toBeNull();
    expect(resolveElementHandle(doc, "sel:.card#0")).toBeNull();
  });

  it("returns null for an out-of-range occurrence rather than the wrong element", () => {
    const doc = previewDoc('<div class="card">only</div>');
    expect(resolveElementHandle(doc, "sel:.card#4")).toBeNull();
  });

  it("returns null for a selector that is invalid in this document", () => {
    const doc = previewDoc('<div class="card">only</div>');
    expect(resolveElementHandle(doc, "sel:>>>broken#0")).toBeNull();
  });

  it("returns null for a malformed handle", () => {
    const doc = previewDoc('<div id="headline">A</div>');
    expect(resolveElementHandle(doc, "nonsense")).toBeNull();
  });
});
