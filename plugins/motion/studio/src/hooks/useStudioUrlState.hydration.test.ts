// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { resolveUrlSelections } from "./useStudioUrlState";

describe("restoring a selection from the URL", () => {
  it("probes the source for the primary only, never for the group", async () => {
    // Each probe is its own request and they are awaited one after another,
    // while the URL carries the whole selection — so a marquee over a captured
    // page turned every later reload into hundreds of serial round trips before
    // the canvas answered anything.
    const doc = document.implementation.createHTMLDocument();
    const ids = ["a", "b", "c", "d"];
    for (const id of ids) {
      const el = doc.createElement("div");
      el.id = id;
      doc.body.append(el);
    }
    const probed: (boolean | undefined)[] = [];
    const buildDomSelection = vi.fn(
      async (element: HTMLElement, options?: { skipSourceProbe?: boolean }) => {
        probed.push(options?.skipSourceProbe);
        return { element, id: element.id } as never;
      },
    );

    await resolveUrlSelections({
      doc,
      primaryElement: doc.getElementById("a") as HTMLElement,
      selection: { sourceFile: "index.html" } as never,
      group: ids.slice(1).map((id) => ({ id, sourceFile: "index.html" })) as never,
      activeCompPath: "index.html",
      isCurrent: () => true,
      buildDomSelection,
    });

    expect(probed[0]).toBeUndefined();
    expect(probed.slice(1)).toEqual([true, true, true]);
  });
});
