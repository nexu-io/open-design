// @vitest-environment happy-dom

import { expect, it, vi } from "vitest";
import { toVisibleOverlayRects } from "./domEditOverlayGeometry";

it("does not fall back to per-element basis reads when the shared basis is unavailable", () => {
  const overlay = document.createElement("div");
  const iframe = document.createElement("iframe");
  document.body.append(overlay, iframe);
  const doc = iframe.contentDocument;
  if (!doc) throw new Error("expected iframe document");
  doc.body.innerHTML = '<main data-composition-id="root"><div id="target"></div></main>';
  const target = doc.getElementById("target") as HTMLElement;
  const targetRead = vi.spyOn(target, "getBoundingClientRect");

  expect(toVisibleOverlayRects(overlay, iframe, [target])).toEqual([null]);
  expect(targetRead).not.toHaveBeenCalled();
});
