// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import {
  changedEdits,
  findCompositionRoot,
  readPreviewRootAttributes,
  sameAttributes,
  levelOf,
  patchForLevel,
  settingsOf,
  withEdits,
} from "./motionBlurPanelModel";

const html = (attrs = "") =>
  `<!DOCTYPE html><html><body><div data-composition-id="main" data-hf-root data-duration="5" data-width="1920" data-height="1080"${attrs}></div></body></html>`;

async function rootOf(attrs?: string) {
  const session = await openComposition(html(attrs), { history: false });
  const root = findCompositionRoot(session.getRootElements());
  if (!root) throw new Error("no root");
  return root;
}

describe("findCompositionRoot and settingsOf", () => {
  it("finds the composition root and reads its settings", async () => {
    const root = await rootOf(' data-motion-blur="on" data-motion-blur-shutter="360"');
    expect(settingsOf(root.attributes)).toMatchObject({
      enabled: true,
      shutterDeg: 360,
      tier: "auto",
    });
  });

  it("reads defaults from a root that has no blur attributes", async () => {
    expect(settingsOf((await rootOf()).attributes)).toMatchObject({
      enabled: false,
      shutterDeg: 240,
    });
  });

  it("is null for a document with nothing in it", async () => {
    const session = await openComposition("<!DOCTYPE html><html><body></body></html>", {
      history: false,
    });
    expect(findCompositionRoot(session.getRootElements())).toBeNull();
  });
});

describe("changedEdits", () => {
  it("lists only the attributes that would change", async () => {
    const root = await rootOf(' data-motion-blur="on"');
    const base = settingsOf(root.attributes);
    expect(changedEdits(root.attributes, base)).toEqual([]);
    expect(changedEdits(root.attributes, { ...base, shutterDeg: 360, tier: "filter" })).toEqual([
      { name: "data-motion-blur-shutter", value: "360" },
      { name: "data-motion-blur-tier", value: "filter" },
    ]);
    expect(changedEdits(root.attributes, { ...base, enabled: false })).toEqual([
      { name: "data-motion-blur", value: null },
    ]);
  });
});

describe("withEdits and sameAttributes", () => {
  it("applies sets and removals without touching the input", () => {
    const before = { "data-motion-blur": "on", "data-motion-blur-shutter": "360" };
    const after = withEdits(before, [
      { name: "data-motion-blur-shutter", value: null },
      { name: "data-motion-blur-tier", value: "filter" },
    ]);
    expect(after).toEqual({ "data-motion-blur": "on", "data-motion-blur-tier": "filter" });
    expect(before).toEqual({ "data-motion-blur": "on", "data-motion-blur-shutter": "360" });
  });

  it("compares attribute sets by content", () => {
    expect(sameAttributes({ a: "1" }, { a: "1" })).toBe(true);
    expect(sameAttributes({ a: "1" }, { a: "2" })).toBe(false);
    expect(sameAttributes({ a: "1" }, {})).toBe(false);
    expect(sameAttributes(null, {})).toBe(false);
    expect(sameAttributes(null, null)).toBe(true);
  });
});

describe("readPreviewRootAttributes", () => {
  it("reads only the blur attributes from the preview's composition root", () => {
    const doc = document.implementation.createHTMLDocument("p");
    doc.body.innerHTML =
      '<div data-composition-id="main" data-width="1920" data-motion-blur="on" data-motion-blur-shutter="360"></div>';
    const frame = { contentDocument: doc } as unknown as HTMLIFrameElement;
    expect(readPreviewRootAttributes(frame)).toEqual({
      "data-motion-blur": "on",
      "data-motion-blur-shutter": "360",
    });
  });

  it("is null when there is no preview, no root, or the document cannot be read", () => {
    expect(readPreviewRootAttributes(null)).toBeNull();
    const empty = document.implementation.createHTMLDocument("p");
    expect(
      readPreviewRootAttributes({ contentDocument: empty } as unknown as HTMLIFrameElement),
    ).toBeNull();
    const blocked = {
      get contentDocument(): never {
        throw new Error("cross-origin");
      },
    } as unknown as HTMLIFrameElement;
    expect(readPreviewRootAttributes(blocked)).toBeNull();
  });
});

describe("levelOf and patchForLevel", () => {
  const on = (shutterDeg: number, enabled = true) => ({
    enabled,
    shutterDeg,
    samples: null,
    events: false,
    tier: "auto" as const,
  });

  it("reads off, subtle and strong from the root's settings", () => {
    expect(levelOf(on(240, false))).toBe("off");
    expect(levelOf(on(240))).toBe("subtle");
    expect(levelOf(on(180))).toBe("subtle");
    expect(levelOf(on(360))).toBe("subtle");
    expect(levelOf(on(480))).toBe("subtle");
    expect(levelOf(on(481))).toBe("strong");
    expect(levelOf(on(720))).toBe("strong");
  });

  it("sets Subtle to the default blur and Strong to the maximum, and leaves the rest alone for Off", () => {
    expect(patchForLevel("subtle")).toEqual({
      enabled: true,
      events: true,
      shutterDeg: 240,
      samples: null,
    });
    expect(patchForLevel("strong")).toEqual({
      enabled: true,
      events: true,
      shutterDeg: 720,
      samples: 64,
    });
    expect(patchForLevel("off")).toEqual({ enabled: false, events: false });
  });

  it("reads back as the level that was chosen", () => {
    for (const level of ["subtle", "strong"] as const) {
      expect(levelOf({ ...on(300), ...patchForLevel(level) })).toBe(level);
    }
  });
});
