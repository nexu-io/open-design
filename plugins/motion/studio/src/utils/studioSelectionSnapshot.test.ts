import { describe, expect, it } from "vitest";
import { buildStudioSelectionSnapshot } from "./studioSelectionSnapshot";
import type { DomEditSelection } from "../components/editor/domEditing";

describe("buildStudioSelectionSnapshot", () => {
  it("serializes a DOM edit selection without the live HTMLElement", () => {
    const selection = {
      element: { tagName: "H1" } as HTMLElement,
      id: null,
      hfId: "hero-title",
      selector: ".title",
      selectorIndex: 0,
      label: "Hero title",
      tagName: "h1",
      sourceFile: "index.html",
      compositionPath: "index.html",
      isCompositionHost: false,
      isInsideLockedComposition: false,
      boundingBox: { x: 10, y: 20, width: 300, height: 64 },
      textContent: "Launch faster",
      dataAttributes: { "data-hf-id": "hero-title" },
      inlineStyles: { color: "white" },
      computedStyles: { "font-size": "48px" },
      textFields: [],
      capabilities: { canSelect: true, canEditStyles: true },
    } as DomEditSelection;

    const snapshot = buildStudioSelectionSnapshot({
      projectId: "demo",
      selection,
      currentTime: 1.25,
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      projectId: "demo",
      compositionPath: "index.html",
      sourceFile: "index.html",
      currentTime: 1.25,
      target: { hfId: "hero-title", selector: ".title", selectorIndex: 0 },
      thumbnailUrl:
        "/api/projects/demo/thumbnail/index.html?t=1.25&format=png&output=source&selector=.title&selectorIndex=0",
    });
    expect(JSON.stringify(snapshot)).not.toContain("HTMLElement");
    expect(snapshot).not.toHaveProperty("element");
  });

  it("links a selection inside a sub-composition to its own thumbnail", () => {
    const snapshot = buildStudioSelectionSnapshot({
      projectId: "demo",
      selection: {
        element: { tagName: "H1" } as HTMLElement,
        id: null,
        hfId: "intro-title",
        selector: ".title",
        selectorIndex: 0,
        label: "Intro title",
        tagName: "h1",
        sourceFile: "compositions/intro #1.html",
        compositionPath: "compositions/intro #1.html",
        isCompositionHost: false,
        isInsideLockedComposition: false,
        boundingBox: { x: 0, y: 0, width: 10, height: 10 },
        textContent: "Intro",
        dataAttributes: {},
        inlineStyles: {},
        computedStyles: {},
        textFields: [],
        capabilities: { canSelect: true, canEditStyles: true },
      } as DomEditSelection,
      currentTime: 0,
    });

    expect(snapshot.thumbnailUrl).toMatch(
      /^\/api\/projects\/demo\/thumbnail\/compositions%2Fintro%20%231\.html\?/,
    );
  });
});
