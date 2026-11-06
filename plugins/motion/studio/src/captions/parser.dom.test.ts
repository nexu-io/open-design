// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { generateCaptionHtml } from "./generator";
import { parseCaptionComposition } from "./parser";

const transcript = "We asked what you needed. Forty-seven percent".split(" ").map((text, i) => ({
  id: `word-${i}`,
  text,
  start: i * 0.5,
  end: i * 0.5 + 0.4,
}));
const source = `const TRANSCRIPT = ${JSON.stringify(transcript)};`;

function createCaptionDocument(
  groupSizes: number[],
  groupClass = "caption-group",
  wordClass = "word",
) {
  const doc = document.implementation.createHTMLDocument();
  let offset = 0;
  for (const size of groupSizes) {
    const group = doc.createElement("div");
    group.className = groupClass;
    for (const word of transcript.slice(offset, offset + size)) {
      const span = doc.createElement("span");
      span.className = wordClass;
      span.textContent = word.text;
      group.appendChild(span);
    }
    doc.body.appendChild(group);
    offset += size;
  }
  return doc;
}

function importCaptions(doc: Document, captionSource = source) {
  const model = parseCaptionComposition(doc, window, captionSource, 1920, 1080, 4);
  expect(model).not.toBeNull();
  if (!model) throw new Error("Expected a caption model");
  const groups = model.groupOrder.map((id) =>
    model.groups.get(id)?.segmentIds.map((segmentId) => model.segments.get(segmentId)?.text),
  );
  return { model, groups };
}

describe("parseCaptionComposition grouping", () => {
  it.each([{ sizes: [5, 2] }, { sizes: [2, 4, 1] }])(
    "preserves authored group sizes $sizes",
    ({ sizes }) => {
      const { model, groups } = importCaptions(createCaptionDocument(sizes));
      expect(groups.map((group) => group?.length)).toEqual(sizes);
      expect(groups.flat()).toEqual(transcript.map((word) => word.text));
      expect(
        [...model.segments.values()].map(({ wordId, text, start, end }) => ({
          id: wordId,
          text,
          start,
          end,
        })),
      ).toEqual(transcript);
      for (const group of model.groups.values()) {
        expect(group.segmentIds.map((id) => model.segments.get(id)?.groupIndex)).toEqual(
          group.segmentIds.map((_, index) => index),
        );
      }
    },
  );

  it.each(["caption-line", "caption-block"])(
    "supports %s with caption-word spans",
    (groupClass) => {
      const { groups } = importCaptions(
        createCaptionDocument([2, 4, 1], groupClass, "caption-word"),
      );
      expect(groups.map((group) => group?.length)).toEqual([2, 4, 1]);
    },
  );

  it("does not count nested caption lines as additional groups", () => {
    const doc = createCaptionDocument([2, 4, 1]);
    for (const group of doc.querySelectorAll(".caption-group")) {
      const line = doc.createElement("div");
      line.className = "caption-line";
      line.append(...group.childNodes);
      group.appendChild(line);
    }
    expect(importCaptions(doc).groups.map((group) => group?.length)).toEqual([2, 4, 1]);
  });

  it.each([
    { name: "absent", sizes: [] },
    { name: "incomplete", sizes: [2, 1] },
    { name: "empty", sizes: [0, 0] },
  ])("uses default grouping without losing words when DOM groups are $name", ({ sizes }) => {
    const { groups } = importCaptions(createCaptionDocument(sizes));
    expect(groups).toEqual([
      transcript.slice(0, 5).map((word) => word.text),
      transcript.slice(5).map((word) => word.text),
    ]);
  });

  it("keeps authored boundaries when generated captions are imported again", () => {
    const original = importCaptions(createCaptionDocument([2, 4, 1]));
    const html = generateCaptionHtml(original.model);
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = html;
    const template = doc.querySelector("template");
    if (!template) throw new Error("Expected generated caption template");
    doc.body.replaceChildren(template.content.cloneNode(true));
    const script = doc.querySelector("script")?.textContent;
    if (!script) throw new Error("Expected generated caption script");
    // Execute only our generator's output to create its real group and word elements.
    new Function("document", "window", "gsap", script)(
      doc,
      {},
      {
        timeline: () => ({ to() {} }),
      },
    );
    expect(importCaptions(doc, html).groups).toEqual([
      transcript.slice(0, 2).map((word) => word.text),
      transcript.slice(2, 6).map((word) => word.text),
      transcript.slice(6).map((word) => word.text),
    ]);
  });
});
