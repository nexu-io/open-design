// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchElementInHtml,
  type PatchOperation,
  type SourceMutationTarget,
} from "@hyperframes/studio-server/source-mutation";
import { describe, expect, it } from "vitest";
import {
  collectDomEditTextFields,
  buildDomEditPatchTarget,
  buildDomEditStylePatchOperation,
  buildDomEditTextPatchOperation,
} from "./domEditingLayers";
import { makeSelection } from "../../hooks/domSelectionTestHarness";
import { buildTextFieldChildOperations } from "../../hooks/domEditTextFieldCommitOps";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(testDir, "../../../tests/e2e/fixtures/design-panel-qa");

function readFixture(relativePath: string): string {
  return readFileSync(join(fixtureDir, relativePath), "utf-8");
}

function createSelection(input: {
  id: string;
  hfId: string;
  tagName: string;
}): ReturnType<typeof makeSelection> {
  const element = document.createElement(input.tagName);
  element.id = input.id;
  element.setAttribute("data-hf-id", input.hfId);
  return {
    ...makeSelection(input.id, element),
    hfId: input.hfId,
  };
}

function clientTarget(input: { id: string; hfId: string; tagName: string }): SourceMutationTarget {
  return buildDomEditPatchTarget(createSelection(input));
}

function patchAndExpectChange(
  sourceHtml: string,
  target: SourceMutationTarget,
  operations: PatchOperation[],
): string {
  const result = patchElementInHtml(sourceHtml, target, operations);
  expect(result.matched).toBe(true);
  expect(result.html).not.toBe(sourceHtml);
  return result.html;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function findElementInHtml(html: string, selector: string): Element {
  const document = parseHtml(html);
  const directMatch = document.querySelector(selector);
  if (directMatch) return directMatch;

  for (const template of Array.from(document.querySelectorAll("template"))) {
    const templateMatch = template.content.querySelector(selector);
    if (templateMatch) return templateMatch;
  }

  throw new Error(`Expected selector ${selector} to match`);
}

function findByHfId(html: string, hfId: string): Element {
  return findElementInHtml(html, `[data-hf-id="${hfId}"]`);
}

function countOccurrences(value: string, needle: string): number {
  return value.split(needle).length - 1;
}

describe("persist seam source mutation", () => {
  const indexHtml = readFixture("index.html");
  const subHtml = readFixture("compositions/qa-sub.html");

  it("persists qa-headline text font-size style operation", () => {
    const html = patchAndExpectChange(
      indexHtml,
      clientTarget({ id: "qa-headline", hfId: "qa-headline", tagName: "h1" }),
      [buildDomEditStylePatchOperation("font-size", "64px")],
    );

    expect(findByHfId(html, "qa-headline").getAttribute("style")).toContain("font-size: 64px");
  });

  it("persists qa-shape fill style operation", () => {
    const html = patchAndExpectChange(
      indexHtml,
      clientTarget({ id: "qa-shape", hfId: "qa-shape", tagName: "div" }),
      [buildDomEditStylePatchOperation("background-color", "#ff0000")],
    );

    expect(findByHfId(html, "qa-shape").getAttribute("style")).toContain(
      "background-color: #ff0000",
    );
  });

  it("persists qa-multi text color style operation", () => {
    const html = patchAndExpectChange(
      indexHtml,
      clientTarget({ id: "qa-multi", hfId: "qa-multi", tagName: "div" }),
      [buildDomEditStylePatchOperation("color", "#00ff00")],
    );

    expect(findByHfId(html, "qa-multi").getAttribute("style")).toContain("color: #00ff00");
  });

  it("persists qa-image opacity style operation", () => {
    const html = patchAndExpectChange(
      indexHtml,
      clientTarget({ id: "qa-image", hfId: "qa-image", tagName: "img" }),
      [buildDomEditStylePatchOperation("opacity", "0.4")],
    );

    expect(findByHfId(html, "qa-image").getAttribute("style")).toContain("opacity: 0.4");
  });

  it("persists timeline data-start attribute operation", () => {
    const html = patchAndExpectChange(
      indexHtml,
      clientTarget({ id: "qa-zone-headline", hfId: "qa-zone-headline", tagName: "div" }),
      [{ type: "attribute", property: "start", value: "2.5" }],
    );

    expect(findByHfId(html, "qa-zone-headline").getAttribute("data-start")).toBe("2.5");
    expect(countOccurrences(html, 'data-start="2.5"')).toBe(1);
  });

  it("persists media volume data attribute operation", () => {
    const html = patchAndExpectChange(
      indexHtml,
      clientTarget({ id: "qa-video", hfId: "qa-video", tagName: "video" }),
      [{ type: "attribute", property: "volume", value: "0.75" }],
    );

    expect(findByHfId(html, "qa-video").getAttribute("data-volume")).toBe("0.75");
    expect(html).not.toContain('data-volume="0.5"');
  });

  it("returns matched false and unchanged html for a missing hfId target", () => {
    const result = patchElementInHtml(indexHtml, { hfId: "qa-does-not-exist" }, [
      buildDomEditStylePatchOperation("font-size", "64px"),
    ]);

    expect(result.matched).toBe(false);
    expect(result.html).toBe(indexHtml);
  });

  it("persists sub-composition child style operation inside a template", () => {
    const html = patchAndExpectChange(
      subHtml,
      clientTarget({ id: "qa-sub-title", hfId: "qa-sub-title", tagName: "h2" }),
      [buildDomEditStylePatchOperation("font-size", "50px")],
    );

    expect(findByHfId(html, "qa-sub-title").getAttribute("style")).toContain("font-size: 50px");
  });

  it("returns matched false for runtime-generated caption words absent from static source", () => {
    const result = patchElementInHtml(
      indexHtml,
      { selector: "#qa-caption-host span", selectorIndex: 0 },
      [buildDomEditStylePatchOperation("color", "#ffffff")],
    );

    expect(result.matched).toBe(false);
    expect(result.html).toBe(indexHtml);
  });

  it("fixes U4: child text-field style persists as an inline style on the correct child span", () => {
    const html = patchAndExpectChange(indexHtml, { hfId: "qa-multi" }, [
      buildDomEditStylePatchOperation("color", "#0000ff", {
        childSelector: ":scope > span",
        childIndex: 0,
      }),
    ]);

    const lineA = findElementInHtml(html, ".qa-line-a");
    const lineB = findElementInHtml(html, ".qa-line-b");
    expect(lineA.getAttribute("style")).toContain("color: #0000ff");
    expect(lineB.getAttribute("style")).toBeNull();
    expect(lineB.textContent).toBe("Second styled line");
    expect(html).not.toContain("&lt;span");
  });

  it("targets the second direct child when siblings share the same tag and class", () => {
    const source = `<div data-hf-id="dups"><span class="dup">First</span><span class="dup">Second</span></div>`;
    const html = patchAndExpectChange(source, { hfId: "dups" }, [
      buildDomEditStylePatchOperation("color", "#0000ff", {
        childSelector: ":scope > span",
        childIndex: 1,
      }),
    ]);

    const document = parseHtml(html);
    const spans = Array.from(document.querySelectorAll(".dup"));
    expect(spans[0]?.getAttribute("style")).toBeNull();
    expect(spans[1]?.getAttribute("style")).toContain("color: #0000ff");
  });

  it("persists a child text-field content edit as plain text", () => {
    const value = "A < B & C";
    const html = patchAndExpectChange(indexHtml, { hfId: "qa-multi" }, [
      buildDomEditTextPatchOperation(value, {
        childSelector: ":scope > span",
        childIndex: 0,
      }),
    ]);

    expect(findElementInHtml(html, ".qa-line-a").textContent).toBe(value);
    expect(findElementInHtml(html, ".qa-line-b").textContent).toBe("Second styled line");
    expect(html).not.toContain("&lt;span");
  });

  it("uses same-tag source child indexes when a non-leaf sibling sits between fields", () => {
    const source = `<div data-hf-id="mixed"><span class="leaf-a">First</span><span class="wrapper"><b>Wrapper</b></span><span class="leaf-b">Second</span></div>`;
    const previewHost = document.createElement("div");
    previewHost.innerHTML = source;
    const previewTarget = previewHost.querySelector('[data-hf-id="mixed"]');
    if (!(previewTarget instanceof HTMLElement)) throw new Error("Expected preview target");

    const originalFields = collectDomEditTextFields(previewTarget);
    const secondField = originalFields.find((field) => field.value === "Second");
    if (!secondField) throw new Error("Expected second text field");
    const nextFields = originalFields.map((field) =>
      field.key === secondField.key ? { ...field, value: "Second updated" } : field,
    );
    const operations = buildTextFieldChildOperations(originalFields, nextFields);
    if (!operations) throw new Error("Expected child operations");

    const html = patchAndExpectChange(source, { hfId: "mixed" }, operations);

    expect(findElementInHtml(html, ".leaf-a").textContent).toBe("First");
    expect(findElementInHtml(html, ".wrapper").textContent).toBe("Wrapper");
    expect(findElementInHtml(html, ".leaf-b").textContent).toBe("Second updated");
  });
});
