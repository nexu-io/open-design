// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import {
  applyStudioBoxSize,
  applyStudioPathOffset,
  applyStudioRotation,
  readStudioBoxSize,
  readStudioPathOffset,
  readStudioRotation,
} from "../components/editor/manualEdits";
import { useDomGeometryCommits, type UseDomGeometryCommitsParams } from "./useDomGeometryCommits";
import { reapplyPositionEditsAfterSeek } from "../components/editor/manualEdits";
import { writeTranslatePx } from "../components/editor/plainTranslate";
import { applyPatch } from "../utils/sourcePatcher";
import { DomEditCropHandles } from "../components/editor/DomEditCropHandles";
import { withInlineLayoutBox } from "./domSelectionTestHarness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mountCommits(
  commitPositionPatchToHtml: UseDomGeometryCommitsParams["commitPositionPatchToHtml"],
  readOnlyPreview = false,
) {
  let commits: ReturnType<typeof useDomGeometryCommits> | null = null;
  function Probe() {
    commits = useDomGeometryCommits({
      showToast: vi.fn(),
      commitPositionPatchToHtml,
      readOnlyPreview,
    });
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  return { commits: () => commits!, unmount: () => act(() => root.unmount()) };
}

describe("useDomGeometryCommits rollback", () => {
  it("restores every optimistic geometry mutation when persistence rejects", async () => {
    const element = document.createElement("div");
    element.id = "box";
    document.body.append(element);
    applyStudioPathOffset(element, { x: 10, y: 20 });
    applyStudioBoxSize(element, { width: 100, height: 80 });
    applyStudioRotation(element, { angle: 15 });
    const selection = {
      id: "box",
      selector: "#box",
      element,
    } as unknown as DomEditSelection;
    const failure = new Error("save failed");
    const commitPositionPatchToHtml = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockRejectedValue(failure);
    let commits: ReturnType<typeof useDomGeometryCommits> | null = null;
    const host = document.createElement("div");
    const root = createRoot(host);

    function Probe() {
      commits = useDomGeometryCommits({
        showToast: vi.fn(),
        commitPositionPatchToHtml,
        readOnlyPreview: false,
      });
      return null;
    }

    act(() => root.render(<Probe />));
    await expect(
      commits!.handleDomBoxSizeCommit(selection, { width: 200, height: 160 }, { x: 30, y: 40 }),
    ).rejects.toBe(failure);
    await expect(commits!.handleDomRotationCommit(selection, { angle: 45 })).rejects.toBe(failure);
    await expect(commits!.handleDomManualEditsReset(selection)).rejects.toBe(failure);

    expect(readStudioPathOffset(element)).toEqual({ x: 10, y: 20 });
    expect(readStudioBoxSize(element)).toEqual({ width: 100, height: 80 });
    expect(readStudioRotation(element)).toEqual({ angle: 15 });
    act(() => root.unmount());
  });
});

describe("useDomGeometryCommits read-only preview", () => {
  const selectionOn = (element: HTMLElement) =>
    ({ id: element.id, selector: `#${element.id}`, element }) as unknown as DomEditSelection;

  it("refuses a manual box-size commit: no write, no history entry", async () => {
    const element = document.createElement("div");
    element.id = "ro-size";
    document.body.append(element);
    applyStudioBoxSize(element, { width: 10, height: 20 });
    const commitPositionPatchToHtml =
      vi.fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>();
    const { commits, unmount } = mountCommits(commitPositionPatchToHtml, true);
    await commits().handleDomBoxSizeCommit(selectionOn(element), { width: 999, height: 999 });
    expect(readStudioBoxSize(element)).toEqual({ width: 10, height: 20 });
    expect(commitPositionPatchToHtml).not.toHaveBeenCalled();
    unmount();
  });

  it("refuses a manual rotation commit: no write, no history entry", async () => {
    const element = document.createElement("div");
    element.id = "ro-rotate";
    document.body.append(element);
    applyStudioRotation(element, { angle: 5 });
    const commitPositionPatchToHtml =
      vi.fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>();
    const { commits, unmount } = mountCommits(commitPositionPatchToHtml, true);
    await commits().handleDomRotationCommit(selectionOn(element), { angle: 350 });
    expect(readStudioRotation(element)).toEqual({ angle: 5 });
    expect(commitPositionPatchToHtml).not.toHaveBeenCalled();
    unmount();
  });
});

describe("useDomGeometryCommits element position offset", () => {
  it("persists left/top on a word a shared tween positions, and no translate offset", async () => {
    const element = Object.assign(document.createElement("span"), {
      _gsap: { renderTransform: () => {} },
    });
    Object.defineProperties(element, {
      offsetLeft: { get: () => 100 + (Number.parseFloat(element.style.left) || 0) },
      offsetTop: { get: () => 200 + (Number.parseFloat(element.style.top) || 0) },
    });
    document.body.append(element);
    const selection = { hfId: "w0", selector: ".w", element } as unknown as DomEditSelection;
    const commitPositionPatchToHtml = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const { commits, unmount } = mountCommits(commitPositionPatchToHtml);

    await commits().stageElementPositionOffset(selection, { x: 40, y: 20 }, false).save();

    const patches = commitPositionPatchToHtml.mock.calls[0]![1];
    expect(patches).toEqual([
      { type: "inline-style", property: "position", value: "relative" },
      { type: "inline-style", property: "left", value: "40px" },
      { type: "inline-style", property: "top", value: "20px" },
    ]);
    expect(element.style.getPropertyValue("translate")).toBe("");
    unmount();
  });
});

describe("useDomGeometryCommits resize anchor", () => {
  it("saves the anchor as the element's own plain px translate, sub-pixel, with the size", async () => {
    const element = document.createElement("div");
    element.id = "anchored";
    element.style.setProperty("translate", "40px 30px");
    document.body.append(element);
    const selection = {
      id: "anchored",
      selector: "#anchored",
      element,
    } as unknown as DomEditSelection;
    const commit = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const { commits, unmount } = mountCommits(commit);

    await commits().handleDomBoxSizeCommit(
      selection,
      { width: 340, height: 227 },
      { x: -10.25, y: 3.5 },
    );

    expect(commit).toHaveBeenCalledTimes(1);
    const patches = commit.mock.calls[0]![1];
    expect(patches).toContainEqual({ type: "inline-style", property: "width", value: "340px" });
    expect(patches).toContainEqual({
      type: "inline-style",
      property: "translate",
      value: "-10.25px 3.5px",
    });
    expect(patches.some((p) => p.property.startsWith("--hf-studio-offset"))).toBe(false);
    expect(element.style.getPropertyValue("translate")).toBe("-10.25px 3.5px");
    unmount();
  });
});

describe("useDomGeometryCommits resize rollback", () => {
  it("rolls the whole gesture back once when the resize save fails", async () => {
    const element = document.createElement("div");
    document.body.append(element);
    const selection = { id: "r", selector: "#r", element } as unknown as DomEditSelection;
    const failure = new Error("save failed");
    const commit = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockRejectedValue(failure);
    const restore = vi.fn();
    const { commits, unmount } = mountCommits(commit);
    await expect(
      commits().handleDomBoxSizeCommit(selection, { width: 50, height: 40 }, undefined, restore),
    ).rejects.toBe(failure);
    expect(restore).toHaveBeenCalledTimes(1);
    unmount();
  });
});

describe("a plain move of an element an older Studio moved by its offset vars", () => {
  function legacyMoved() {
    const element = document.createElement("div");
    element.id = "legacy";
    element.style.setProperty("translate", "10px 5px");
    document.body.append(element);
    applyStudioPathOffset(element, { x: 40, y: 30 });
    const selection = { id: "legacy", selector: "#legacy", element } as unknown as DomEditSelection;
    return { element, selection };
  }
  const legacyEnds = [
    { type: "inline-style", property: "--hf-studio-offset-x", value: null },
    { type: "inline-style", property: "--hf-studio-offset-y", value: null },
    { type: "attribute", property: "data-hf-studio-path-offset", value: null },
  ];
  const keptMarks = [
    "data-hf-studio-original-inline-translate",
    "data-hf-studio-original-translate",
  ];
  const studioMarks = (el: HTMLElement) =>
    el
      .getAttributeNames()
      .filter((name) => name.startsWith("data-hf-studio"))
      .sort();

  it("saves the move as its translate, ends the old offset, and a seek keeps it", async () => {
    const { element, selection } = legacyMoved();
    const commitPositionPatchToHtml = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const { commits, unmount } = mountCommits(commitPositionPatchToHtml);

    await commits().stageElementPositionOffset(selection, { x: 140, y: 30 }, true).save();
    reapplyPositionEditsAfterSeek(document);

    expect(element.style.getPropertyValue("translate")).toBe("140px 30px");
    expect(commitPositionPatchToHtml.mock.calls[0]![1]).toEqual([
      { type: "inline-style", property: "translate", value: "140px 30px" },
      {
        type: "attribute",
        property: "data-hf-studio-original-inline-translate",
        value: "10px 5px",
      },
      ...legacyEnds,
    ]);
    expect(studioMarks(element)).toEqual(keptMarks);
    unmount();
  });

  it("resizes with the anchor as its translate, ends the old offset, and a seek keeps it", async () => {
    const { element, selection } = legacyMoved();
    const commit = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const { commits, unmount } = mountCommits(commit);

    await commits().handleDomBoxSizeCommit(selection, { width: 80, height: 60 }, { x: 60, y: 40 });
    reapplyPositionEditsAfterSeek(document);

    expect(element.style.getPropertyValue("translate")).toBe("60px 40px");
    expect(commit.mock.calls[0]![1]).toEqual(expect.arrayContaining(legacyEnds));
    expect(studioMarks(element)).toEqual(expect.arrayContaining(keptMarks));
    expect(element.hasAttribute("data-hf-studio-path-offset")).toBe(false);
    unmount();
  });

  it.each(["move", "resize"])(
    "puts the old offset back whole when the %s save fails",
    async (kind) => {
      const { element, selection } = legacyMoved();
      const translate = element.style.getPropertyValue("translate");
      const { commits, unmount } = mountCommits(
        vi.fn().mockRejectedValue(new Error("save failed")),
      );

      const save =
        kind === "move"
          ? commits().stageElementPositionOffset(selection, { x: 140, y: 30 }, true).save()
          : commits().handleDomBoxSizeCommit(
              selection,
              { width: 80, height: 60 },
              { x: 60, y: 40 },
            );
      await expect(save).rejects.toThrow();
      expect(element.style.getPropertyValue("translate")).toBe(translate);
      expect(element.hasAttribute("data-hf-studio-path-offset")).toBe(true);
      expect(readStudioPathOffset(element)).toEqual({ x: 40, y: 30 });
      unmount();
    },
  );
});

describe("Reset after a plain move puts the author's translate back", () => {
  function authoredLayer(translate: string | null, legacy = false) {
    const element = document.createElement("div");
    element.id = "layer";
    if (translate) element.style.setProperty("translate", translate);
    document.body.append(element);
    if (legacy) applyStudioPathOffset(element, { x: 40, y: 30 });
    const project = { file: element.outerHTML, history: [] as string[] };
    const commit = vi.fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>(
      async (_selection, patches) => {
        project.history.push(project.file);
        project.file = patches.reduce((html, op) => applyPatch(html, "layer", op), project.file);
        return undefined;
      },
    );
    const selection = { id: "layer", selector: "#layer", element } as unknown as DomEditSelection;
    return { element, selection, project, ...mountCommits(commit) };
  }
  const saved = (html: string) =>
    new DOMParser().parseFromString(html, "text/html").getElementById("layer")!;
  const studioLeftovers = (el: Element) => [
    ...el.getAttributeNames().filter((name) => name.startsWith("data-hf-studio")),
    ...((el as HTMLElement).style.cssText.match(/--hf-studio-[\w-]+/g) ?? []),
  ];

  it("restores an older Studio's layer to its authored 50% 10px, in the file and live", async () => {
    const { element, selection, project, commits, unmount } = authoredLayer("50% 10px", true);

    await commits().stageElementPositionOffset(selection, { x: 140, y: 30 }, true).save();
    await commits().handleDomManualEditsReset(selection);

    expect(saved(project.file).style.getPropertyValue("translate")).toBe("50% 10px");
    expect(element.style.getPropertyValue("translate")).toBe("50% 10px");
    expect(studioLeftovers(saved(project.file))).toEqual([]);
    expect(studioLeftovers(element)).toEqual([]);
    unmount();
  });

  it("restores the authored 12px 4px after a drag and a second move", async () => {
    const { element, selection, project, commits, unmount } = authoredLayer("12px 4px");

    writeTranslatePx(element, { x: 90, y: 0 });
    await commits().stageElementPositionOffset(selection, { x: 140, y: 30 }, true).save();
    await commits().stageElementPositionOffset(selection, { x: 200, y: 50 }, true).save();
    await commits().handleDomManualEditsReset(selection);

    expect(saved(project.file).style.getPropertyValue("translate")).toBe("12px 4px");
    expect(element.style.getPropertyValue("translate")).toBe("12px 4px");
    expect(studioLeftovers(saved(project.file))).toEqual([]);
    unmount();
  });

  it("removes the translate of a layer that had none, in the file and live", async () => {
    const { element, selection, project, commits, unmount } = authoredLayer(null);

    await commits().stageElementPositionOffset(selection, { x: 140, y: 30 }, true).save();
    await commits().handleDomManualEditsReset(selection);

    expect(saved(project.file).style.getPropertyValue("translate")).toBe("");
    expect(element.style.getPropertyValue("translate")).toBe("");
    expect(studioLeftovers(saved(project.file))).toEqual([]);
    unmount();
  });

  it("undo of the Reset brings the move back, and Reset still restores the author's", async () => {
    const { selection, project, commits, unmount } = authoredLayer("12px 4px");

    await commits().stageElementPositionOffset(selection, { x: 140, y: 30 }, true).save();
    const moved = project.file;
    await commits().handleDomManualEditsReset(selection);
    project.file = project.history.pop()!;
    expect(project.file).toBe(moved);

    const reloaded = saved(project.file) as HTMLElement;
    document.body.append(reloaded);
    expect(reloaded.style.getPropertyValue("translate")).toBe("140px 30px");
    await commits().handleDomManualEditsReset({ ...selection, element: reloaded });
    expect(saved(project.file).style.getPropertyValue("translate")).toBe("12px 4px");
    expect(reloaded.style.getPropertyValue("translate")).toBe("12px 4px");
    unmount();
  });
});

describe("useDomGeometryCommits undo steps", () => {
  it("never merges a resize with the next size edit of the same element", async () => {
    const element = document.createElement("div");
    element.id = "box";
    document.body.append(element);
    const selection = { id: "box", selector: "#box", element } as unknown as DomEditSelection;
    const commitPositionPatchToHtml = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const { commits, unmount } = mountCommits(commitPositionPatchToHtml);

    await commits().handleDomBoxSizeCommit(selection, { width: 418, height: 200 });
    await commits().handleDomBoxSizeCommit(selection, { width: 280, height: 200 });

    const [resize, field] = commitPositionPatchToHtml.mock.calls.map(([, , options]) => options);
    expect(resize!.coalesceKey).not.toBe(field!.coalesceKey);
    unmount();
    element.remove();
  });
});

describe("useDomGeometryCommits resize of a cropped element", () => {
  it("saves the crop scaled per axis with the box in the resize's own commit", async () => {
    const element = withInlineLayoutBox(document.createElement("div"));
    element.id = "cropped";
    element.style.cssText = "width: 300px; height: 200px; clip-path: inset(8px 60px 16px 30px)";
    document.body.append(element);
    const selection = {
      id: "cropped",
      selector: "#cropped",
      element,
    } as unknown as DomEditSelection;
    const commitPositionPatchToHtml = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const { commits, unmount } = mountCommits(commitPositionPatchToHtml);
    const rect = { left: 0, top: 0, width: 300, height: 200, editScaleX: 1, editScaleY: 1 };
    const host = document.createElement("div");
    const crop = createRoot(host);
    act(() =>
      crop.render(
        <DomEditCropHandles selection={selection} overlayRect={rect} onStyleCommit={vi.fn()} />,
      ),
    );

    await commits().handleDomBoxSizeCommit(selection, { width: 450, height: 250 });

    const scaled = "inset(10px 90px 20px 45px)";
    expect(commitPositionPatchToHtml).toHaveBeenCalledTimes(1);
    expect(commitPositionPatchToHtml.mock.calls[0]![1]).toContainEqual({
      type: "inline-style",
      property: "clip-path",
      value: scaled,
    });
    act(() => crop.unmount());
    expect(element.style.getPropertyValue("clip-path")).toBe(scaled);
    unmount();
  });

  function mountCroppedSelection(id: string, authored: string) {
    const element = withInlineLayoutBox(document.createElement("div"));
    element.id = id;
    element.style.cssText = authored;
    document.body.append(element);
    const selection = { id, selector: `#${id}`, element } as unknown as DomEditSelection;
    const commitPositionPatchToHtml = vi
      .fn<UseDomGeometryCommitsParams["commitPositionPatchToHtml"]>()
      .mockResolvedValue(undefined);
    const mounted = mountCommits(commitPositionPatchToHtml);
    const onStyleCommit = vi.fn((property: string, value: string) => {
      element.style.setProperty(property, value);
    });
    const rect = { left: 0, top: 0, width: 300, height: 200, editScaleX: 1, editScaleY: 1 };
    const crop = createRoot(document.body.appendChild(document.createElement("div")));
    const draw = () =>
      act(() =>
        crop.render(
          <DomEditCropHandles
            selection={selection}
            overlayRect={rect}
            onStyleCommit={onStyleCommit}
          />,
        ),
      );
    draw();
    const dragRightEdge = (by: number) => {
      const handle = document.querySelector<HTMLButtonElement>('[aria-label="Crop right"]')!;
      const press = (type: string, clientX: number) =>
        act(() =>
          handle.dispatchEvent(
            new PointerEvent(type, {
              bubbles: true,
              pointerId: 3,
              buttons: type === "pointerup" ? 0 : 1,
              clientX,
            }),
          ),
        );
      press("pointerdown", 100);
      press("pointermove", 100 - by);
      press("pointerup", 100 - by);
    };
    const resize = () =>
      mounted.commits().handleDomBoxSizeCommit(selection, { width: 450, height: 300 });
    const done = () => {
      act(() => crop.unmount());
      mounted.unmount();
    };
    return { element, onStyleCommit, draw, dragRightEdge, resize, done };
  }

  it("after an undo while still selected, the next crop drag starts from the undone crop", async () => {
    const authored = "width: 300px; height: 200px; clip-path: inset(0px 60px 0px 0px)";
    const h = mountCroppedSelection("undone", authored);
    await h.resize();
    // Undo writes the file's style attribute back onto the same live element.
    h.element.setAttribute("style", authored);
    h.draw();
    h.dragRightEdge(20);

    expect(h.onStyleCommit).toHaveBeenCalledWith("clip-path", "inset(0px 80px 0px 0px)");
    h.done();
    expect(h.element.style.getPropertyValue("clip-path")).toBe("inset(0px 80px 0px 0px)");
  });

  it("a crop drag right after a resize, with no render between, starts from the scaled crop", async () => {
    const h = mountCroppedSelection(
      "resized",
      "width: 300px; height: 200px; clip-path: inset(0px 60px 0px 0px)",
    );
    await h.resize();
    h.dragRightEdge(20);

    expect(h.onStyleCommit).toHaveBeenCalledWith("clip-path", "inset(0px 110px 0px 0px)");
    h.done();
  });
});
