// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mintElementHandle } from "../../webmcp/handles";
import { previewDoc } from "../../webmcp/webmcpTestUtils";
import { resolveTopologyLensElements } from "./topologyLensGeometry";

describe("Topology Lens scene geometry", () => {
  it("reveals the nearest same-source context while preserving the exact target", () => {
    const doc = previewDoc(`
      <main data-composition-id="root" data-composition-file="index.html">
        <section id="duplicate"><span id="root-child">root</span></section>
        <section data-composition-id="nested" data-composition-file="compositions/nested.html">
          <article id="nested-context">
            <div id="duplicate"><strong id="nested-child">nested</strong></div>
            <aside id="unrelated">outside target</aside>
          </article>
        </section>
      </main>
    `);
    const handle = mintElementHandle({
      domId: "duplicate",
      sourceFile: "compositions/nested.html",
      activeCompositionPath: "index.html",
    });
    if (!handle) throw new Error("expected source-safe handle");

    const resolved = resolveTopologyLensElements(doc, "index.html", handle);

    expect(resolved?.target.textContent).toBe("nested");
    expect(resolved?.context.getAttribute("data-composition-file")).toBe(
      "compositions/nested.html",
    );
    expect(resolved?.contours.map((element) => element.id)).toEqual(["nested-child", "unrelated"]);
  });

  it("returns no geometry for a stale handle", () => {
    const doc = previewDoc(
      '<main data-composition-id="root" data-composition-file="index.html"></main>',
    );

    expect(resolveTopologyLensElements(doc, "index.html", "dom:missing")).toBeNull();
  });
});
