// @vitest-environment happy-dom
/**
 * Round-trip proof for Design-panel promote-to-variable: a bind written by
 * applyBind against a real SDK session must be detected by readBindingFrom off
 * the resulting element snapshot — the same read the Design controls rely on to
 * show bound state.
 */
import { describe, expect, it } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { createMemoryAdapter } from "@hyperframes/sdk/adapters/memory";
import { applyBind, type BindAction } from "../components/panels/VariablesBindElement";
import { readBindingFrom } from "./variablePromoteHelpers";

const HTML = /* html */ `<!DOCTYPE html>
<html>
  <body>
    <div data-hf-id="hf-title" style="color: rgb(255, 0, 0)">Hello</div>
    <img data-hf-id="hf-logo" src="logo.png" />
  </body>
</html>`;

function open() {
  return openComposition(HTML, { persist: createMemoryAdapter() });
}

const styleAction: BindAction = {
  key: "color",
  label: "Text color",
  kind: "style",
  styleProp: "color",
  suggestedId: "title-color",
  declaration: (id) => ({ id, type: "color", label: "Title color", default: "#ff0000" }),
};

const textAction: BindAction = {
  key: "text",
  label: "Text",
  kind: "text",
  suggestedId: "title-text",
  declaration: (id) => ({ id, type: "string", label: "Title text", default: "Hello" }),
};

const srcAction: BindAction = {
  key: "src",
  label: "Image source",
  kind: "src",
  suggestedId: "logo",
  declaration: (id) => ({ id, type: "image", label: "Logo", default: "logo.png" }),
};

describe("promote round-trip", () => {
  it("style bind writes var() and reads back the id", async () => {
    const comp = await open();
    applyBind(comp, "hf-title", styleAction, "title-color");
    const snap = comp.getElement("hf-title")!;
    expect(readBindingFrom(snap, { kind: "style", prop: "color" })).toBe("title-color");
    expect(comp.getVariableDeclarations().some((d) => d.id === "title-color")).toBe(true);
  });

  it("text bind writes data-var-text and reads back the id", async () => {
    const comp = await open();
    applyBind(comp, "hf-title", textAction, "title-text");
    const snap = comp.getElement("hf-title")!;
    expect(readBindingFrom(snap, { kind: "text" })).toBe("title-text");
  });

  it("src bind writes data-var-src and reads back the id", async () => {
    const comp = await open();
    applyBind(comp, "hf-logo", srcAction, "logo");
    const snap = comp.getElement("hf-logo")!;
    expect(readBindingFrom(snap, { kind: "src" })).toBe("logo");
  });

  it("does not report a binding before promote", async () => {
    const comp = await open();
    const snap = comp.getElement("hf-title")!;
    expect(readBindingFrom(snap, { kind: "style", prop: "color" })).toBeNull();
    expect(readBindingFrom(snap, { kind: "text" })).toBeNull();
  });
});
