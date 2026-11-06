import { describe, expect, it } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { patchElementInHtml } from "@hyperframes/studio-server/source-mutation";
import type { PatchOperation } from "./sourcePatcher";
import { patchOpsToSdkEditOps } from "./sdkOpMapping";

const shell = (body: string) => `<!DOCTYPE html>
<html><head></head><body>${body}</body></html>`;

async function applySdkDomCutover(source: string, ops: PatchOperation[]): Promise<string> {
  const session = await openComposition(source, { history: false });
  session.batch(() => {
    for (const op of patchOpsToSdkEditOps("hf-target", ops)) {
      session.dispatch(op);
    }
  });
  return session.serialize();
}

const cases: Array<{ name: string; source: string; ops: PatchOperation[] }> = [
  {
    name: "coalesces multi-property inline style including transform and custom props",
    source: shell(
      '<div data-hf-id="hf-target" style="opacity: 0.5; inset: 0; transform-origin: 0 0">Old<span data-hf-id="hf-child">Child</span></div>',
    ),
    ops: [
      { type: "inline-style", property: "transform", value: "translateX(10px)" },
      { type: "inline-style", property: "transform-origin", value: "50% 50%" },
      { type: "inline-style", property: "--x", value: "12px" },
    ],
  },
  {
    name: "removes one inline style from a multi-property declaration",
    source: shell(
      '<div data-hf-id="hf-target" style="opacity: 0.5; inset: 0; transform-origin: 0 0">Old</div>',
    ),
    ops: [{ type: "inline-style", property: "opacity", value: null }],
  },
  {
    name: "preserves semicolon-bearing CSS values when updating another style",
    source: shell(
      '<div data-hf-id="hf-target" style="background: url(data:image/svg+xml;utf8,<svg></svg>); color: red; opacity: 0.5">Old</div>',
    ),
    ops: [{ type: "inline-style", property: "color", value: "blue" }],
  },
  {
    name: "sets direct text content",
    source: shell('<div data-hf-id="hf-target">Old</div>'),
    ops: [{ type: "text-content", property: "text", value: "New" }],
  },
  {
    name: "sets text on the single child target used by the legacy path",
    source: shell('<button data-hf-id="hf-target"><span data-hf-id="hf-child">Old</span></button>'),
    ops: [{ type: "text-content", property: "text", value: "New" }],
  },
  {
    name: "sets text on the single child target while preserving parent text",
    source: shell('<div data-hf-id="hf-target">Lead <span data-hf-id="hf-child">Old</span></div>'),
    ops: [{ type: "text-content", property: "text", value: "New" }],
  },
  {
    name: "sets data attributes through attribute ops",
    source: shell('<div data-hf-id="hf-target" data-old="1">Old</div>'),
    ops: [{ type: "attribute", property: "mode", value: "hero" }],
  },
  {
    name: "removes data attributes through attribute ops",
    source: shell('<div data-hf-id="hf-target" data-mode="hero">Old</div>'),
    ops: [{ type: "attribute", property: "mode", value: null }],
  },
  {
    name: "sets allowed html attributes",
    source: shell('<a data-hf-id="hf-target" href="https://example.com">Old</a>'),
    ops: [{ type: "html-attribute", property: "aria-label", value: "Primary link" }],
  },
  {
    name: "sets shorthand over existing longhands (inset over top/right/bottom/left)",
    source: shell(
      '<div data-hf-id="hf-target" style="top: 10px; right: 10px; bottom: 10px; left: 10px; opacity: 1">Old</div>',
    ),
    ops: [{ type: "inline-style", property: "inset", value: "0" }],
  },
  {
    name: "sets longhand over existing shorthand (top over inset)",
    source: shell('<div data-hf-id="hf-target" style="inset: 0; opacity: 1">Old</div>'),
    ops: [{ type: "inline-style", property: "top", value: "10px" }],
  },
  {
    name: "mixed-type batch: inline-style + text-content in one op list",
    source: shell('<div data-hf-id="hf-target" style="color: red">Old</div>'),
    ops: [
      { type: "inline-style", property: "color", value: "blue" },
      { type: "text-content", property: "text", value: "New" },
    ],
  },
  {
    name: "mixed-type batch: inline-style + attribute in one op list",
    source: shell('<div data-hf-id="hf-target" style="opacity: 0.5" data-mode="default">Old</div>'),
    ops: [
      { type: "inline-style", property: "opacity", value: "1" },
      { type: "attribute", property: "mode", value: "hero" },
    ],
  },
];

describe("SDK cutover DOM serialization parity", () => {
  it.each(cases)("$name", async ({ source, ops }) => {
    const legacy = patchElementInHtml(source, { hfId: "hf-target" }, ops);
    expect(legacy.matched).toBe(true);

    await expect(applySdkDomCutover(source, ops)).resolves.toBe(legacy.html);
  });
});
