// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditing";
import {
  applyStudioRotation,
  reapplyPositionEditsAfterSeek,
} from "../components/editor/manualEdits";
import { STUDIO_ROTATION_ATTR } from "../components/editor/manualEditsTypes";
import type { ElementOffsetStagerDeps } from "./elementOffsetStager";
import { savePlainRotation } from "./plainRotation";
import { readShownRotation } from "../components/editor/plainTranslate";

function rotate(
  element: HTMLElement,
  angle: number,
  options: { save?: () => Promise<void>; readOnlyPreview?: boolean } = {},
) {
  element.id = "box";
  document.body.append(element);
  const commitPositionPatchToHtml = vi.fn<ElementOffsetStagerDeps["commitPositionPatchToHtml"]>(
    options.save ?? (() => Promise.resolve()),
  );
  const selection = { element, id: "box", selector: "#box" } as unknown as DomEditSelection;
  const saved = savePlainRotation(
    { commitPositionPatchToHtml, readOnlyPreview: options.readOnlyPreview },
    selection,
    { angle },
  );
  return { saved, commitPositionPatchToHtml, selection };
}

describe("savePlainRotation", () => {
  it("saves the element's own rotate, less what its transform turns, with no Studio marks", async () => {
    const element = document.createElement("div");
    element.style.transform = "rotate(10deg)";
    const { saved, commitPositionPatchToHtml, selection } = rotate(element, 55);
    await saved;
    expect(element.style.getPropertyValue("rotate")).toBe("45deg");
    expect(commitPositionPatchToHtml).toHaveBeenCalledWith(
      selection,
      [{ type: "inline-style", property: "rotate", value: "45deg" }],
      expect.objectContaining({ label: "Rotate layer" }),
    );
    expect(element.hasAttribute(STUDIO_ROTATION_ATTR)).toBe(false);
  });

  it("drops a legacy Studio rotation in the same write, so a seek does not put its angle back", async () => {
    const element = document.createElement("div");
    applyStudioRotation(element, { angle: 15 });
    const { saved, commitPositionPatchToHtml } = rotate(element, 40);
    await saved;
    const patches = commitPositionPatchToHtml.mock.calls[0]![1];
    expect(patches).toContainEqual({
      type: "attribute",
      property: STUDIO_ROTATION_ATTR,
      value: null,
    });
    expect(patches.at(-1)).toEqual({ type: "inline-style", property: "rotate", value: "40deg" });
    reapplyPositionEditsAfterSeek(document);
    expect(element.style.getPropertyValue("rotate")).toBe("40deg");
  });

  it("puts the live rotate back when the save fails", async () => {
    const element = document.createElement("div");
    element.style.setProperty("rotate", "12deg");
    const { saved } = rotate(element, 30, { save: () => Promise.reject(new Error("offline")) });
    await expect(saved).rejects.toThrow("offline");
    expect(element.style.getPropertyValue("rotate")).toBe("12deg");
  });

  it("writes nothing in a read-only preview", async () => {
    const element = document.createElement("div");
    const { saved, commitPositionPatchToHtml } = rotate(element, 30, { readOnlyPreview: true });
    await saved;
    expect(element.style.getPropertyValue("rotate")).toBe("");
    expect(commitPositionPatchToHtml).not.toHaveBeenCalled();
  });

  it("saves a transform-centred element's turn in its transform and puts it back on a failed save", async () => {
    const element = document.createElement("div");
    element.style.transform = "translate(-120px, -80px)";
    const { saved, commitPositionPatchToHtml } = rotate(element, 25, {
      save: () => Promise.reject(new Error("offline")),
    });
    expect(commitPositionPatchToHtml.mock.calls[0]![1]).toEqual([
      {
        type: "inline-style",
        property: "transform",
        value: "translate(-120px, -80px) rotate(25deg)",
      },
    ]);
    await expect(saved).rejects.toThrow("offline");
    expect(element.style.getPropertyValue("transform")).toBe("translate(-120px, -80px)");
  });

  it("makes an inline element inline-block, as a turn needs, and puts it back on a failed save", async () => {
    const element = document.createElement("span");
    element.style.setProperty("display", "inline");
    const { saved, commitPositionPatchToHtml } = rotate(element, 20, {
      save: () => Promise.reject(new Error("offline")),
    });
    expect(commitPositionPatchToHtml.mock.calls[0]![1]).toEqual([
      { type: "inline-style", property: "display", value: "inline-block" },
      { type: "inline-style", property: "rotate", value: "20deg" },
    ]);
    await expect(saved).rejects.toThrow("offline");
    expect(element.style.getPropertyValue("display")).toBe("inline");
  });
});

describe("readShownRotation", () => {
  it("shows an element's own CSS turn, and GSAP's legacy reading once GSAP turns it", () => {
    const element = document.createElement("div");
    document.body.append(element);
    element.style.setProperty("rotate", "25deg");
    expect(readShownRotation(element)).toEqual({ angle: 25 });
    Object.assign(element, { _gsap: { renderTransform: () => {} } });
    applyStudioRotation(element, { angle: 15 });
    expect(readShownRotation(element)).toEqual({ angle: 15 });
  });
});
