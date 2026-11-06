// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { vi } from "vitest";
import { readLiveSelectionBox, resizeSelectionFromAgent } from "./StudioAgentTools";

function rect(width: number, height: number): DOMRect {
  return { x: 10, y: 20, width, height } as DOMRect;
}

describe("readLiveSelectionBox", () => {
  it("measures the replacement preview node after a commit reload", () => {
    const oldElement = document.createElement("h1");
    oldElement.id = "headline";
    oldElement.getBoundingClientRect = () => rect(300, 50);
    const selection = {
      id: "headline",
      sourceFile: "index.html",
      element: oldElement,
    } as DomEditSelection;

    const liveDocument = document.implementation.createHTMLDocument();
    const replacement = liveDocument.createElement("h1");
    replacement.id = "headline";
    replacement.getBoundingClientRect = () => rect(280, 60);
    liveDocument.body.append(replacement);

    expect(readLiveSelectionBox(liveDocument, selection, "index.html")).toEqual({
      x: 10,
      y: 20,
      width: 280,
      height: 60,
    });
  });

  it("does not hide a stale target behind its detached old node", () => {
    const oldElement = document.createElement("h1");
    oldElement.id = "headline";
    const selection = {
      id: "headline",
      sourceFile: "index.html",
      element: oldElement,
    } as DomEditSelection;
    const liveDocument = document.implementation.createHTMLDocument();

    expect(() => readLiveSelectionBox(liveDocument, selection, "index.html")).toThrow(
      "target is missing",
    );
  });
});

describe("resizeSelectionFromAgent", () => {
  it("applies the same live draft a pointer gesture shows before persistence", async () => {
    const element = document.createElement("div");
    element.style.width = "300px";
    element.style.height = "50px";
    const selection = { element } as DomEditSelection;
    const commit = vi.fn(async (_selection, _next, _offset, restore: () => void) => {
      expect(element.style.width).toBe("280px");
      expect(element.style.height).toBe("60px");
      restore();
    });

    await resizeSelectionFromAgent(selection, { width: 280, height: 60 }, commit);

    expect(commit).toHaveBeenCalledOnce();
    expect(element.style.width).toBe("300px");
    expect(element.style.height).toBe("50px");
  });
});
