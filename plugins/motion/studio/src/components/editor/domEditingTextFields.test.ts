import { describe, expect, it } from "vitest";
import { Window } from "happy-dom";
import {
  PREVIEW_RASTER_ATTR,
  STUDIO_PREVIEW_UPCOMING_ATTR,
} from "@hyperframes/core/studio-preview-mark";
import { serializeDomEditTextFields } from "./domEditing";
import { collectDomEditTextFields } from "./domEditingLayers";

describe("serializeDomEditTextFields — mixed content", () => {
  it("round-trips text-node + child element fields", () => {
    expect(
      serializeDomEditTextFields([
        {
          key: "text-node:0",
          label: "Text 1",
          value: "If you're ",
          tagName: "#text",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "text-node",
        },
        {
          key: "child:1:span",
          label: "Text 2",
          value: "turning 65",
          tagName: "span",
          attributes: [{ name: "class", value: "accent" }],
          inlineStyles: { color: "red" },
          computedStyles: {},
          source: "child",
        },
        {
          key: "text-node:2",
          label: "Text 3",
          value: " soon...",
          tagName: "#text",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "text-node",
        },
      ]),
    ).toBe(
      `If you're <span class="accent" data-hf-text-key="child:1:span" style="color: red">turning 65</span> soon...`,
    );
  });

  it("escapes HTML entities in text-node values", () => {
    expect(
      serializeDomEditTextFields([
        {
          key: "text-node:0",
          label: "Text 1",
          value: "A < B & C > D",
          tagName: "#text",
          attributes: [],
          inlineStyles: {},
          computedStyles: {},
          source: "text-node",
        },
      ]),
    ).toBe("A &lt; B &amp; C &gt; D");
  });
});

describe("collectDomEditTextFields — preview marks", () => {
  it("keeps preview-only attributes out of a saved text edit", () => {
    const { document } = new Window();
    document.body.innerHTML = `<h1>Hello <span class="word" ${PREVIEW_RASTER_ATTR} ${STUDIO_PREVIEW_UPCOMING_ATTR}>world</span></h1>`;
    const heading = document.querySelector("h1") as unknown as HTMLElement;
    const saved = serializeDomEditTextFields(collectDomEditTextFields(heading));
    expect(saved).toContain('<span class="word" data-hf-text-key=');
    expect(saved).not.toContain(PREVIEW_RASTER_ATTR);
    expect(saved).not.toContain(STUDIO_PREVIEW_UPCOMING_ATTR);
  });
});
