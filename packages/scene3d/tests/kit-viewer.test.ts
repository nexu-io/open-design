import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { KIT_RUNTIME_JS } from "../src/viewer/kit-runtime.js";
import { renderKitHtml } from "../src/viewer/kit.js";
import { writeViewer } from "../src/manifest.js";
import { compile, probeBlender } from "../src/index.js";
import { rmRetry } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

/**
 * The kit runtime ships as an inlined string, so it never passes through
 * `tsc`. Evaluating the real string here — rather than a re-implementation —
 * is the only way a test can speak for the code the browser actually runs.
 * The container and accessor readers are the part that would fail silently
 * (a wrong stride renders a shredded mesh, not an error), so they are what
 * gets exercised.
 */
function loadRuntime(): {
  parseGlb: (buffer: ArrayBuffer) => { json: any; bin: ArrayBuffer };
  readAccessor: (gltf: any, bin: ArrayBuffer, index: number) => ArrayLike<number>;
  textureSourceInfo: (
    gltf: any,
    bin: ArrayBuffer,
    index: number,
  ) => { mime: string; bytes: Uint8Array; sampler: unknown } | null;
} {
  const factory = new Function(
    `${KIT_RUNTIME_JS}\nreturn { parseGlb: parseGlb, readAccessor: readAccessor, textureSourceInfo: textureSourceInfo };`,
  );
  return factory() as ReturnType<typeof loadRuntime>;
}

// A real (tiny) PNG: 1x1 opaque white. Byte-for-byte what an encoder
// emits, so the texture path is tested against an actual image container.
const WHITE_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

/** A minimal but structurally valid GLB: one indexed triangle, one material. */
function makeGlb(textured = false): ArrayBuffer {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0]); // padded to 4-byte alignment
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1]);
  const pngPadded = new Uint8Array(Math.ceil(WHITE_PNG.length / 4) * 4);
  pngPadded.set(WHITE_PNG);
  const binParts = textured
    ? [new Uint8Array(positions.buffer), new Uint8Array(indices.buffer), new Uint8Array(uvs.buffer), pngPadded]
    : [new Uint8Array(positions.buffer), new Uint8Array(indices.buffer)];
  const binLength = binParts.reduce((n, p) => n + p.byteLength, 0);
  const uvOffset = positions.byteLength + indices.byteLength;
  const pngOffset = uvOffset + uvs.byteLength;
  const gltf: Record<string, unknown> = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "prp_tri" }],
    meshes: [{
      primitives: [{
        attributes: textured ? { POSITION: 0, TEXCOORD_0: 2 } : { POSITION: 0 },
        indices: 1, material: 0, mode: 4,
      }],
    }],
    materials: [
      textured
        ? { name: "mtl_test", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.7 } }
        : { name: "mtl_test", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1], metallicFactor: 1, roughnessFactor: 0.3 } },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      ...(textured ? [{ bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }] : []),
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
      ...(textured
        ? [
            { buffer: 0, byteOffset: uvOffset, byteLength: uvs.byteLength },
            { buffer: 0, byteOffset: pngOffset, byteLength: WHITE_PNG.length },
          ]
        : []),
    ],
    buffers: [{ byteLength: binLength }],
    ...(textured
      ? {
          images: [{ bufferView: 3, mimeType: "image/png", name: "tex_white" }],
          samplers: [{ wrapS: 10497, wrapT: 10497 }],
          textures: [{ sampler: 0, source: 0 }],
        }
      : {}),
  };

  const jsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const binPad = (4 - (binLength % 4)) % 4;
  const total = 12 + 8 + jsonBytes.byteLength + jsonPad + 8 + binLength + binPad;
  const out = new ArrayBuffer(total);
  const view = new DataView(out);
  const bytes = new Uint8Array(out);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  let at = 12;
  view.setUint32(at, jsonBytes.byteLength + jsonPad, true);
  view.setUint32(at + 4, 0x4e4f534a, true);
  bytes.set(jsonBytes, at + 8);
  for (let i = 0; i < jsonPad; i++) bytes[at + 8 + jsonBytes.byteLength + i] = 0x20;
  at += 8 + jsonBytes.byteLength + jsonPad;
  view.setUint32(at, binLength + binPad, true);
  view.setUint32(at + 4, 0x004e4942, true);
  let cursor = at + 8;
  for (const part of binParts) {
    bytes.set(part, cursor);
    cursor += part.byteLength;
  }
  return out;
}

describe("kit runtime — GLB container", () => {
  it("parses the JSON and BIN chunks", () => {
    const { parseGlb } = loadRuntime();
    const parsed = parseGlb(makeGlb());
    expect(parsed.json.asset.version).toBe("2.0");
    expect(parsed.json.nodes[0].name).toBe("prp_tri");
    expect(parsed.bin.byteLength).toBeGreaterThan(0);
  });

  it("rejects a buffer that is not a GLB rather than rendering nothing", () => {
    const { parseGlb } = loadRuntime();
    expect(() => parseGlb(new ArrayBuffer(32))).toThrow(/not a GLB/);
  });

  it("reads the embedded texture image, its UVs, and its sampler back out", () => {
    // This is the exact container shape Blender's exporter writes for a
    // textured asset (verified against a real compile) — an embedded PNG
    // bufferView, a baseColorTexture, and TEXCOORD_0.
    const { parseGlb, readAccessor, textureSourceInfo } = loadRuntime();
    const parsed = parseGlb(makeGlb(true));
    expect(parsed.json.materials[0].pbrMetallicRoughness.baseColorTexture.index).toBe(0);
    const uvs = readAccessor(parsed.json, parsed.bin, 2);
    expect(Array.from(uvs)).toEqual([0, 0, 1, 0, 0, 1]);
    const info = textureSourceInfo(parsed.json, parsed.bin, 0)!;
    expect(info).not.toBeNull();
    expect(info.mime).toBe("image/png");
    // PNG magic survives the container round trip byte-for-byte.
    expect(Array.from(info.bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(info.bytes.length).toBe(WHITE_PNG.length);
    expect(info.sampler).toEqual({ wrapS: 10497, wrapT: 10497 });
  });

  it("returns null texture info rather than throwing on an untextured model", () => {
    const { parseGlb, textureSourceInfo } = loadRuntime();
    const parsed = parseGlb(makeGlb());
    expect(textureSourceInfo(parsed.json, parsed.bin, 0)).toBeNull();
  });

  it("reads vertex positions and indices back out of the accessors", () => {
    const { parseGlb, readAccessor } = loadRuntime();
    const parsed = parseGlb(makeGlb());
    const positions = readAccessor(parsed.json, parsed.bin, 0);
    expect(Array.from(positions).slice(0, 9)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = readAccessor(parsed.json, parsed.bin, 1);
    expect(Array.from(indices).slice(0, 3)).toEqual([0, 1, 2]);
  });
});

describe("renderKitHtml", () => {
  it("is self-contained — no external script or style host", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb" }],
    });
    expect(html).not.toMatch(/<script[^>]+src=/i);
    // What matters is that nothing is *fetched* from a host: no src, href,
    // CSS url() or @import pointing off-origin. An `xmlns` URI is an XML
    // identifier the browser never dereferences, so matching bare
    // "https://" anywhere would fail the moment inline SVG is used — as it
    // did once the viewer's icons and gizmo became SVG.
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?https?:\/\//i);
    expect(html).not.toMatch(/url\(\s*["']?https?:\/\//i);
    expect(html).not.toMatch(/@import/i);
    for (const url of html.match(/https?:\/\/[^\s"'<>)]+/g) ?? []) {
      expect(url).toMatch(/^http:\/\/www\.w3\.org\//);
    }
  });

  /* The viewer's script is authored inside a TS template literal, so a
     stray backtick or dollar-brace in a comment is a syntax error in the
     shipped page rather than in this repo. That has bitten more than once
     and is invisible until the page is opened, so parse what we emit. */
  it("emits a script body that actually parses", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb" }],
    });
    const bodies = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) expect(() => new Function(body)).not.toThrow();
  });

  /* The template that carries this script must be String.raw. A plain
     literal eats backslashes, so a regex written as \d ships as d — it
     still parses, still runs, and silently matches the wrong text. The
     length parser is the canary: it is the only place a dropped backslash
     changes a user-visible answer rather than throwing. */
  it("keeps regex escapes intact through the template", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toContain(String.raw`\d`);
    expect(html).not.toMatch(/\(-\?d\*\.\?d\+\)/);
  });

  /*
   * The viewer's script is a string, so these behaviours cannot be imported.
   * Pulling the two functions out of the emitted page and running them is
   * the only way to test what the browser will actually execute — and both
   * of these are functions where being wrong costs the user real work.
   */
  function extractFn(html: string, fnName: string): string {
    const src = html.slice(html.indexOf("function " + fnName));
    const end = src.indexOf("\n}\n");
    return src.slice(0, end + 3);
  }

  /**
   * Pull real functions out of the emitted page and run them.
   *
   * `deps` names other functions the subject calls, extracted from the same
   * page rather than re-implemented here — a stub would let the test pass
   * while the shipped composition was wrong, which is the one outcome that
   * makes the test worse than useless.
   */
  function evalFromPage(fnName: string, preamble = "", deps: string[] = []) {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    const bodies = [...deps, fnName].map((n) => extractFn(html, n)).join("\n");
    return new Function(preamble + "\n" + bodies + "\nreturn " + fnName + ";")();
  }

  /*
   * The bug this pins: tweaks saved in an earlier session are already baked
   * into the GLB, so the page cannot see them in the geometry. Saving only
   * the current session's deltas made the daemon's whole-file write erase
   * every earlier nudge — with a "Saved ✓" both times.
   */
  const QUAT_DEPS = ["qMul", "qNorm"];

  it("folds prior on-disk tweaks into a save instead of replacing them", () => {
    const mergedTweaks = evalFromPage(
      "mergedTweaks",
      "let bakedTweaks = { a: { translate: [1, 0, 0] }, b: { translate: [0, 2, 0] } };" +
        "let edits = { b: { translate: [0, 1, 0] }, c: { translate: [0, 0, 3] } };",
      QUAT_DEPS,
    );
    const out = mergedTweaks();
    // Untouched this session — must survive.
    expect(out.a.translate).toEqual([1, 0, 0]);
    // Touched this session — the delta composes with what was already saved.
    expect(out.b.translate).toEqual([0, 3, 0]);
    // New this session.
    expect(out.c.translate).toEqual([0, 0, 3]);
  });

  /*
   * Rotation and scale must survive a save exactly as translation does.
   * They did not: the merge handled only translation, so every rotation and
   * resize was discarded the moment the user pressed Save, and any already
   * on disk was erased with it. The original test passed throughout —
   * it only ever asked about translation.
   */
  it("carries rotation and scale through a save, not just translation", () => {
    const mergedTweaks = evalFromPage(
      "mergedTweaks",
      // a: rotated on disk, untouched this session.
      // b: scaled on disk, scaled again now — must multiply, not replace.
      "let bakedTweaks = { a: { quat: [0, 0.7071068, 0, 0.7071068] }, b: { scale: [2, 1, 1] } };" +
        "let edits = { b: { scale: [3, 1, 1] } };",
      QUAT_DEPS,
    );
    const out = mergedTweaks();
    expect(out.a, "a rotation on disk was dropped by the merge").toBeDefined();
    expect(out.a.quat[1]).toBeCloseTo(0.7071068, 6);
    // Scale composes multiplicatively: 2 then 3 is 6, not 5 and not 3.
    expect(out.b.scale[0]).toBeCloseTo(6, 6);
  });

  it("composes rotations as quaternions rather than replacing them", () => {
    // Two 90° turns about the same axis make 180°: quat becomes (0,1,0,0).
    const q90 = "[0, 0.7071067811865476, 0, 0.7071067811865476]";
    const mergedTweaks = evalFromPage(
      "mergedTweaks",
      `let bakedTweaks = { a: { quat: ${q90} } }; let edits = { a: { quat: ${q90} } };`,
      QUAT_DEPS,
    );
    const out = mergedTweaks();
    expect(Math.abs(out.a.quat[1])).toBeCloseTo(1, 5);
    expect(Math.abs(out.a.quat[3])).toBeCloseTo(0, 5);
  });

  it("keeps a part that was only rotated, and only drops true no-ops", () => {
    const rotated = evalFromPage(
      "mergedTweaks",
      "let bakedTweaks = {}; let edits = { a: { translate: [0,0,0], quat: [0, 0.3826834, 0, 0.9238795], scale: [1,1,1] } };",
      QUAT_DEPS,
    );
    // Zero translation is not "no edit" once rotation exists.
    expect(rotated().a, "a purely rotated part was deleted as a no-op").toBeDefined();

    const untouched = evalFromPage(
      "mergedTweaks",
      "let bakedTweaks = {}; let edits = { a: { translate: [0,0,0], quat: [0,0,0,1], scale: [1,1,1] } };",
      QUAT_DEPS,
    );
    expect(untouched()).toEqual({});
  });

  it("survives a tweak that carries no translate at all", () => {
    // An older writer, or a rotation-only entry, has no translate array.
    const mergedTweaks = evalFromPage(
      "mergedTweaks",
      "let bakedTweaks = { a: { quat: [0, 0, 0, 1], scale: [2, 2, 2] } }; let edits = {};",
      QUAT_DEPS,
    );
    expect(() => mergedTweaks()).not.toThrow();
    expect(mergedTweaks().a.scale).toEqual([2, 2, 2]);
  });

  it("drops a tweak that nets back to zero rather than accumulating no-ops", () => {
    const mergedTweaks = evalFromPage(
      "mergedTweaks",
      "let bakedTweaks = { a: { translate: [0, 0.5, 0] } };" +
        "let edits = { a: { translate: [0, -0.5, 0] } };",
      QUAT_DEPS,
    );
    expect(mergedTweaks()).toEqual({});
  });

  it("parses lengths in the notations a person actually types", () => {
    const parseLength = evalFromPage("parseLength", "const MAX_TRANSLATE = 1000;");
    expect(parseLength("0.4")).toBeCloseTo(0.4);
    expect(parseLength("40cm")).toBeCloseTo(0.4);
    expect(parseLength("400mm")).toBeCloseTo(0.4);
    expect(parseLength("1ft")).toBeCloseTo(0.3048);
    expect(parseLength('6"')).toBeCloseTo(0.1524);
    // Comma decimals: most of the world, and whatever the keypad emits.
    expect(parseLength("1,5")).toBeCloseTo(1.5);
    expect(parseLength("-2m")).toBeCloseTo(-2);
    expect(parseLength("")).toBeNull();
    expect(parseLength("-")).toBeNull();
    expect(parseLength("abc")).toBeNull();
    // Beyond what the daemon will store: reject here, while the value can
    // still be retyped, rather than at save time with the part off-screen.
    expect(parseLength("1000000")).toBeNull();
  });

  it("groups entries by category and escapes the title", () => {
    const html = renderKitHtml({
      title: '<script>x</script>',
      entries: [
        { name: "Crate", category: "Built", glb: "a.glb" },
        { name: "Tower", category: "Structures", glb: "b.glb" },
      ],
    });
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('"category":"Built"');
    expect(html).toContain('"category":"Structures"');
  });

  it("keeps counts visible and folds only the verdict into the name's colour", () => {
    // This is a modelling viewer: parts/tris are the reading on the dial and
    // stay on screen. The verdict PHRASE is the one thing the colour already
    // says, so it alone moves to hover — no separate verdict span.
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb", ok: true }],
    });
    expect(html).toContain('id="meta"');
    expect(html).not.toContain('id="verdict"');
    // The page hands the same line up to a hosting parent; on ack the page
    // enters hosted layout — chip hidden, rail anchored to the top so no
    // dead band is left where the chip used to sit.
    expect(html).toContain("od:scene3d-ident");
    expect(html).toContain("od:scene3d-ident-ack");
    // Only the embedding parent may flip hosted mode.
    expect(html).toContain("e.source === window.parent");
    expect(html).toContain(".hosted .rail { top: 12px;");
  });

  it("keeps the idle hint to navigation — edit verbs appear only with a selection", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    const idle = html.match(/id="hint">([^<]*(?:<b>[^<]*<\/b>[^<]*)*)<\/span>/);
    expect(idle).not.toBeNull();
    expect(html).not.toMatch(/id="hint">[\s\S]{0,200}snaps flush/);
    // Both hint variants exist in the script; the selected-state one carries
    // the edit verbs.
    expect(html).toContain("esc</b> done");
  });

  it("inlines each entry's part tree for the rail's USD breakdown", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [
        {
          name: "Crate",
          category: "Built",
          glb: "a.glb",
          parts: 2,
          tree: [
            { n: "crate", p: null, t: "MESH", f: 128 },
            { n: "lid", p: "crate", t: "MESH", f: 64 },
          ],
        },
      ],
    });
    expect(html).toContain('"tree":[{"n":"crate"');
    // The tree renderer and its prim-path builder ship in the page script.
    expect(html).toContain("function buildTree");
    expect(html).toContain("function primPaths");
  });

  it("ships no in-page download control — the host's Export menu owns downloads", () => {
    // The artifact sidecar carries `metadata.deliverables`, and the host
    // serves them from its Export menu. A second download surface inside
    // the page would drift from the host's the first time either changed,
    // so the page carries exactly one job: the viewport.
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "out/scene.glb" }],
    });
    expect(html).not.toContain('id="dlBtn"');
    expect(html).not.toContain('id="dlMenu"');
    expect(html).not.toContain("Download all");
  });

  it("ships the edit affordances: save, reset, and the tweaks write-back", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "out/scene.glb", scenePath: "scenes/crate" }],
    });
    expect(html).toContain("Save changes");
    expect(html).toContain("/scene3d/tweaks");
    expect(html).toContain("suppressOrbit");
  });

  it("keeps the asset rail narrow — the viewport is the point of the page", () => {
    // Regression guard for a real defect: the rail once reserved ~430px of
    // a 780px panel to list eight short words.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    const width = /\.rail\s*\{[^}]*width:\s*(\d+)px/.exec(html);
    expect(width).toBeTruthy();
    expect(Number(width![1])).toBeLessThanOrEqual(180);
    // It must hug its content rather than stretch to the viewport height.
    expect(/\.rail\s*\{[^}]*max-height:/.test(html)).toBe(true);
  });

  it("gives list rows room for descenders", () => {
    // Clipping the line box for the ellipsis ate the tail off every name
    // with a j, y, g or p — eyeball_jar, supply_shed, relay_mast.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    const lh = /\.chip \.label\s*\{[^}]*line-height:\s*([\d.]+)/.exec(html);
    expect(lh).toBeTruthy();
    expect(Number(lh![1])).toBeGreaterThanOrEqual(1.4);
  });

  it("carries the part-facts card, nature glyphs, and float whisper", () => {
    // The selected-part card (.tfacts) and the tree's census-earned
    // details: tiny SVG nature glyphs, the bone-count type badge, the
    // floating-gap whisper, and the click-to-copy source line. All data
    // rides the tree payload, so an entry without facts renders the same
    // page it always did.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toContain('class="tfacts"');
    expect(html).toContain("tglyphs");
    expect(html).toContain("tfloat");
    expect(html).toContain("' bones'");
    expect(html).toContain("'scene.json:' + node.o");
    // Nature glyphs are inline SVG (the no-font-glyphs rule), quiet color.
    expect(html).toMatch(/\.tree-row \.tglyphs svg \{[^}]*fill: currentColor/);
    // The claims shield renders only when every declared claim held.
    expect(html).toContain("entry.claims.failed === 0");
  });

  it("keeps the facts card single-selection only", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    // The card is about ONE part; a multi-selection shows combined bounds
    // and nothing that would attribute one part's facts to many.
    expect(html).toContain("names.length === 1 && currentEntry && currentEntry.tree");
  });

  it("carries the material panel: chip door, picker, native controls", () => {
    // The material chip on the facts row is a BUTTON that expands the card
    // into the material panel — picker (assign) plus customizer (Principled
    // overrides), all built from native primitives, live-previewed in GL and
    // saved through the same tweaks channel as the transforms.
    const html = renderKitHtml({
      title: "Kit",
      entries: [
        {
          name: "Beam",
          category: "Built",
          glb: "a.glb",
          tree: [{ n: "prp_beam_cone", p: null, t: "MESH", m: ["mtl_beam_energy"] }],
          mats: { mtl_beam_energy: { c: [0.1, 0.8, 0.4], r: 0.3, e: [0, 1, 0.5], s: 4, u: 1 } },
        },
      ],
    });
    // The census facts reach the page payload.
    expect(html).toContain('"mats":{"mtl_beam_energy"');
    // The chip is a real button with the panel behind it.
    expect(html).toContain("'tmatchip'");
    expect(html).toContain('class="tmat"');
    expect(html).toContain("function buildMatPanel");
    // Native primitives, not reinvented widgets.
    expect(html).toContain("'color'");
    expect(html).toContain("'range'");
    // Overrides ride the SAME save funnel as transforms — one channel.
    expect(html).toContain("material");
  });

  it("morphs the collapse chevron into the back button while in depth", () => {
    // One control, two directions of the same journey: the fold chevron
    // pivots (the same transform transition that animates a collapse) into
    // a back arrow while the material panel is open. This is the design
    // language for anything in-depth within a part.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toMatch(/\.tip\.mat \.tbtn-fold svg \{ transform: rotate\(90deg\); \}/);
    expect(html).toContain("btn.title = 'Back'");
    // Going deeper never stacks a second window: the shallow facts hide.
    expect(html).toMatch(/\.tip\.mat [^{]*\.tfacts[^{]*\{\s*display: none/);
  });

  it("keeps material identity honest — a value put back is not an edit", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    // The equality predicate is shared by dirty/history/save, and a
    // property returned to its census value is deleted, not stored.
    expect(html).toContain("function matEq");
    expect(html).toContain("function setMatProp");
  });

  it("renders real material balls and the surface pad, not abstract widgets", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    // Previews are RENDERED spheres through the viewport's own shader —
    // real factors, real textures — not colour dots.
    expect(html).toContain("function matBallGeometry");
    expect(html).toContain("function renderMatBall");
    // The ball render must never leave the FBO's own colour texture bound
    // to the sampler: that is a feedback loop and a silently blank ball.
    expect(html).toContain("gl.bindTexture(gl.TEXTURE_2D, null)");
    // Roughness x metallic is ONE appearance plane: the draggable pad.
    expect(html).toContain("mpad");
    expect(html).toContain("'Surface'");
    // glTF omits default-valued factors and the DEFAULT is metallic 1 —
    // mapping absent to 0 rendered exported gold as plastic once.
    expect(html).toContain("material ? 1 : 0");
  });

  it("samples the metallic-roughness and emissive maps, gated per channel", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    // Data maps upload LINEAR (roughness values are not colours);
    // baseColor and emissive upload sRGB — colour space is part of a
    // texture's identity, so the cache keys on it.
    expect(html).toContain("uMrMap");
    expect(html).toContain("uMrGate");
    expect(html).toContain("uEmMap");
    expect(html).toMatch(/textureIndex \+ \(srgb \? ":s" : ":l"\)/);
    // Override semantics shared with the runner: a scalar override gates
    // that channel's map off; a tint keeps multiplying the base map.
    expect(html).toContain("mrGate = [0, mrGate[1]]");
    expect(html).toContain("mrGate = [mrGate[0], 0]");
  });

  it("shelves the whole kit's materials — foreign picks copy values", () => {
    // The first rung of a shared material library: materials from OTHER
    // scenes in the kit sit past a divider; this scene's build never
    // authored them, so picking one applies its census-measured values as
    // overrides rather than an assignment the runner could not honour.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toContain("mshelf-div");
    expect(html).toContain("Copy values of ");
    // The shelf dedupes by LOOK — a creature kit's hundreds of same-colour
    // per-part materials are one choice, with the alike-count on the tip.
    expect(html).toContain("alike");
  });

  it("closes the loop: Save, then Compile, from the same overlay", () => {
    // Save writes tweaks.json; only a compile makes it geometry. The bake
    // button appears once everything is saved-but-unbaked, rides the same
    // host bridge as save (op "compile", long timeout — Blender takes
    // minutes), and the refreshed artifacts return through the host's
    // normal reload.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toContain('id="bake"');
    expect(html).toContain("function bakeScene");
    expect(html).toContain("op === 'compile' ? 600000 : 5000");
    expect(html).toContain("'Save first'");
    // Picking a shelf/gallery ball REPLACES the channel — the way back to
    // the original material that override-preserving assignment never gave.
    expect(html).toContain("wear THIS material, as authored");
    // Depth breadcrumb: a second chevron per level below the panel.
    expect(html).toContain('class="chev2"');
    expect(html).toMatch(/\.tip\.gal \.tbtn-fold \.chev2 \{ opacity: 1; \}/);
    // The head name carries the edit state.
    expect(html).toContain("' · edited'");
  });

  it("holds a steady footprint and honours the pin", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    // FIXED width in panel/gallery modes: a content-sized card re-measured
    // itself on every live readout change and the whole panel flickered.
    expect(html).toMatch(/\.tip\.mat \{ width: 246px; max-width: 246px; \}/);
    expect(html).toMatch(/\.tip\.gal \{ width: 268px; max-width: 268px; \}/);
    // The pin: deselects are ignored while something is selected; part
    // switches keep the current depth; an entry switch force-clears.
    expect(html).toContain('id="tipPin"');
    expect(html).toContain("function setTipPinned");
    expect(html).toContain("mode !== 'force' && tipPinned");
    expect(html).toContain("selectPart(null, 'force')");
    expect(html).toContain("if (tipPinned && state.selection.size > 0) buildMatPanel()");
  });

  it("opens a browsable gallery of every material — the shelf is a taste", () => {
    // Depth three of the same journey: card -> panel -> gallery, the
    // chevron the single way back at every level. Grouped by scene under
    // sticky headers, filtered by a native search input WITHOUT
    // rebuilding (focus and scroll survive typing), balls painted in rAF
    // chunks so hundreds of materials never block a frame.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toContain("function buildMatGallery");
    expect(html).toContain("Browse all materials");
    expect(html).toContain("'mgal-head'");
    expect(html).toContain("Find a material…");
    expect(html).toContain("function queueGalleryPaint");
    // Filter hides, never rebuilds.
    expect(html).toContain("item.hidden = !hit");
    // Cached balls die with the model that painted them.
    expect(html).toContain("matGalleryCanvases.clear()");
  });

  it("uses inline SVG for icons, never font glyphs", () => {
    // A box-drawing or arrow character renders as a tofu box wherever the
    // font lacks it, and the control then looks broken rather than plain.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    for (const glyph of ["☰", "‹", "▾", "▸", "✕"]) {
      expect(html.includes(glyph)).toBe(false);
    }
    expect(html).toContain("<svg class=\"icon\"");
  });

  it("restates display:none for the hidden toggle", () => {
    // An author display value beats the UA sheet's [hidden] rule, so a
    // grid-displayed control stays visible after being hidden.
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toMatch(/\.rail-toggle\[hidden\]\s*\{\s*display:\s*none/);
  });

  it("only fades the rail when it actually scrolls", () => {
    const html = renderKitHtml({ title: "Kit", entries: [] });
    expect(html).toMatch(/\.rail-scroll\.scrollable\s*\{[^}]*mask-image/);
    // The base rule must not carry the mask, or a list that fits gets its
    // last row dimmed for no reason.
    const base = /\.rail-scroll\s*\{([^}]*)\}/.exec(html);
    expect(base![1]).not.toContain("mask-image");
  });

  it("references meshes by URL instead of embedding them", () => {
    // A kit of eighty assets must not become an eighty-mesh HTML file.
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "scenes/crate/out/scene.glb" }],
    });
    expect(html).toContain("scenes/crate/out/scene.glb");
    // Assert the actual invariant rather than a byte count that drifts with
    // every legitimate feature: no mesh may be inlined as a data URI, and
    // the page must stay in the tens of kilobytes that a hand-written
    // renderer plus editor costs — not the megabytes one embedded GLB does.
    expect(html).not.toMatch(/data:(model|application\/octet-stream)/i);
    // Headroom over today's ~420KB: renderer + editor + host tweaks bridge +
    // gizmo readout/modifier chips + the inlined S3DMath engine + the
    // material panel/gallery (matballs, surface pad, pin, bake button, the
    // no-modal discard ask). An embedded GLB would still blow through this
    // by megabytes, so the ceiling catches the failure mode it exists for
    // while leaving room for incremental page features.
    expect(html.length).toBeLessThan(470_000);
  });

  /**
   * "Has this changed?" must have exactly ONE answer.
   *
   * It used to have two. The Save button asked whether the edits OBJECT
   * differed from the last saved copy, while the request asked whether any
   * transform CHANNEL differed from the identity — and they disagreed the
   * moment a gesture merely touched a part, because touching one creates an
   * identity edit record. Save appeared, the user pressed it, an empty body
   * went to the daemon, nothing was written, the response was 200 and the
   * button hid itself. An edit reported as saved that had never existed.
   *
   * Reproduced live against a real daemon before this was pinned.
   */
  it("treats an identity transform as no change, whatever the record looks like", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb" }],
    });
    const from = html.indexOf("function transformDelta");
    expect(from).toBeGreaterThan(-1);
    let depth = 0;
    let end = from;
    for (let i = html.indexOf("{", from); i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}" && --depth === 0) { end = i + 1; break; }
    }
    // qMul/qNorm are the quaternion helpers transformDelta leans on.
    const helpers = ["function qMul", "function qNorm"].map((name) => {
      const at = html.indexOf(name);
      let d = 0;
      let stop = at;
      for (let i = html.indexOf("{", at); i < html.length; i++) {
        if (html[i] === "{") d++;
        else if (html[i] === "}" && --d === 0) { stop = i + 1; break; }
      }
      return html.slice(at, stop);
    });
    const transformDelta = new Function(
      helpers.join(String.fromCharCode(10)) + String.fromCharCode(10) + html.slice(from, end) + "; return transformDelta;",
    )() as (current: unknown, previous: unknown) => { changed: boolean };

    const identity = { translate: [0, 0, 0], quat: [0, 0, 0, 1], scale: [1, 1, 1] };

    // The exact record a gesture leaves behind when it changes nothing.
    expect(transformDelta(identity, undefined).changed).toBe(false);
    expect(transformDelta(identity, identity).changed).toBe(false);
    expect(transformDelta({}, undefined).changed).toBe(false);
    expect(transformDelta(undefined, undefined).changed).toBe(false);

    // Sub-tolerance noise is not an edit either: a micrometre is not a move
    // and a quaternion a rounding error from identity is not a turn.
    expect(transformDelta({ translate: [0, 1e-9, 0] }, undefined).changed).toBe(false);
    expect(transformDelta({ scale: [1, 1 + 1e-12, 1] }, undefined).changed).toBe(false);

    // Real edits are real.
    expect(transformDelta({ translate: [0, 0.26, 0] }, undefined).changed).toBe(true);
    expect(transformDelta({ scale: [1, 1.5, 1] }, undefined).changed).toBe(true);
    expect(
      transformDelta({ quat: [0, 0.3826834, 0, 0.9238795] }, undefined).changed,
    ).toBe(true);

    // And measured against a baseline: the same pose as what is already
    // saved is nothing left to save.
    const moved = { translate: [0, 0.26, 0], quat: [0, 0, 0, 1], scale: [1, 1, 1] };
    expect(transformDelta(moved, moved).changed).toBe(false);
    expect(transformDelta({ translate: [0, 0.52, 0] }, moved).changed).toBe(true);
  });

  /**
   * Every element the script reaches for by id must exist in the markup.
   *
   * The page script is a string: `tsc` never sees it, so a getElementById
   * for an element that was renamed or deleted is a runtime TypeError with
   * no build-time signal. That is exactly how the empty-kit branch broke —
   * it still cleared an id that had been folded into a hover title, threw
   * on the first line, and took the whole empty state down with it, so a
   * kit with nothing compiled rendered as a dead page with stale chrome.
   */
  it("never reaches for an element id the markup does not define", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb" }],
    });
    const defined = new Set(
      [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]),
    );
    const used = new Set(
      [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]),
    );
    expect(used.size).toBeGreaterThan(5);
    expect([...used].filter((id) => !defined.has(id))).toEqual([]);
  });

  /**
   * The one-line issue summary is checked against the message shapes
   * src/lint actually emits, evaluated from the shipped page source rather
   * than a copy — a re-implementation here would pass while the browser ran
   * something else.
   */
  it("summarises real lint messages without corrupting part names", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb" }],
    });
    // Sliced out by brace matching rather than by a newline sentinel: the
    // page script is one long generated string and its exact formatting is
    // not something a test should depend on.
    const from = html.indexOf("function shortIssue");
    let depth = 0;
    let end = from;
    for (let i = html.indexOf("{", from); i < html.length; i++) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}" && --depth === 0) { end = i + 1; break; }
    }
    const shortIssue = new Function(
      html.slice(from, end) + "; return shortIssue;",
    )() as (message: string, self: string) => string;

    // Pairwise overlap names the OTHER part, whichever side we are on.
    expect(
      shortIssue("coplanar overlap between 'prp_body' and 'prp_batten_l' (4 face pair(s))", "prp_body"),
    ).toBe("overlaps prp_batten_l");
    expect(
      shortIssue("coplanar overlap between 'prp_body' and 'prp_batten_l' (4 face pair(s))", "prp_batten_l"),
    ).toBe("overlaps prp_body");

    // Subject dropped behind a kind word, and bare — both shapes ship.
    expect(shortIssue("mesh 'prp_body' has 2 ngon face(s)", "prp_body")).toBe("2 ngon face");
    expect(shortIssue("object 'prp_lid' is outside the camera frustum", "prp_lid")).toBe(
      "outside the camera frustum",
    );
    expect(shortIssue("'prp_lid' floats 0.012m above the ground plane", "prp_lid")).toBe(
      "floats 0.012m above the ground plane",
    );

    // A message about a DIFFERENT object keeps its subject, or the line
    // would read as though it were about the selected part.
    expect(shortIssue("mesh 'prp_other' has 2 ngon face(s)", "prp_body")).toBe(
      "mesh 'prp_other' has 2 ngon face",
    );

    // Part names are identifiers: case must survive verbatim so the name
    // on screen is one the user can search the source for.
    for (const message of [
      "mesh 'prp_body' has 2 ngon face(s)",
      "coplanar overlap between 'prp_body' and 'prp_batten_l' (4 face pair(s))",
      "'prp_lid' floats 0.012m above the ground plane",
    ]) {
      expect(shortIssue(message, "prp_body")).not.toMatch(/Prp_|Mesh '|Coplanar/);
    }
  });
});

const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("kit runtime against a real export", () => {
  it("parses the GLB the pipeline actually produces", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-kit-"));
    fs.cpSync(path.join(__dirname, "fixtures", "good", "prop_crate"), work, { recursive: true });
    const result = await compile({ projectDir: work, proof: { turntable: false }, timeoutMs: 240_000 });
    const glb = result.exportedAssets.find((a) => a.endsWith(".glb"))!;
    expect(glb).toBeTruthy();

    const buffer = fs.readFileSync(path.join(work, glb));
    const { parseGlb, readAccessor } = loadRuntime();
    const parsed = parseGlb(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    );
    expect(parsed.json.meshes.length).toBeGreaterThan(0);

    // Walk the real primitives the way the renderer does; a stride mistake
    // shows up here as a wrong element count rather than a broken picture.
    let vertices = 0;
    for (const mesh of parsed.json.meshes) {
      for (const prim of mesh.primitives) {
        const positions = readAccessor(parsed.json, parsed.bin, prim.attributes.POSITION);
        expect(positions.length % 3).toBe(0);
        vertices += positions.length / 3;
        if (prim.indices !== undefined) {
          const indices = readAccessor(parsed.json, parsed.bin, prim.indices);
          expect(indices.length % 3).toBe(0);
          for (let i = 0; i < indices.length; i++) {
            expect(indices[i]!).toBeLessThan(positions.length / 3);
          }
        }
      }
    }
    expect(vertices).toBeGreaterThan(0);

    // The kit page the compile wrote must point at that same mesh.
    const kit = fs.readFileSync(path.join(work, "out", "kit.html"), "utf8");
    expect(kit).toContain("scene.glb");

    // Retrying, non-throwing cleanup: the Blender child this test spawned
    // can still hold the directory handle for a moment on Windows, and a
    // teardown that throws turns a fully-passing test red.
    rmRetry(work);
  }, 300_000);
});

/*
 * View-state persistence: the host reloads kit.html on every recompile and
 * file refresh, and the page's answer is a window.name snapshot (the one
 * storage an opaque-origin srcdoc can reach) restored at boot. These pin the
 * mechanism at the two ends that can silently rot: the reader must survive
 * junk, and the emitted page must actually carry the save/restore wiring.
 */
describe("kit view-state persistence", () => {
  function pageHtml() {
    return renderKitHtml({
      title: "Kit",
      entries: [{ name: "Crate", category: "Built", glb: "a.glb" }],
    });
  }

  it("ships the save/restore wiring in the emitted page", () => {
    const html = pageHtml();
    // The tag is the contract between save and load; losing either side
    // silently turns every reload back into a hard reset.
    expect(html).toContain("s3dview:");
    expect(html).toContain("function saveViewState");
    expect(html).toContain("function loadViewState");
    // Boot consumes the saved entry against the rail it just built.
    expect(html).toContain("railRows");
    expect(html).toContain("pendingViewCam");
  });

  it("loadViewState survives junk and foreign window.name values", () => {
    const html = pageHtml();
    const src = html.slice(html.indexOf("function loadViewState"));
    const body = src.slice(0, src.indexOf("\n}\n") + 3);
    // The tag const lives beside the function in the page; carry it in, but
    // read its VALUE from the page so this test cannot drift from the ship.
    const tag = html.match(/const VIEW_STATE_TAG = '([^']+)';/)?.[1];
    expect(tag).toBe("s3dview:");
    const load = (name: unknown) =>
      new Function(
        `const VIEW_STATE_TAG = '${tag}';\nconst window = { name: arguments[0] };\n${body}\nreturn loadViewState();`,
      )(name);
    expect(load("")).toBeNull();
    expect(load("some other page's name")).toBeNull();
    expect(load("s3dview:{not json")).toBeNull();
    expect(load('s3dview:"a string, not an object"')).toBeNull();
    const state = load('s3dview:{"entry":"fox","cam":[1,2,3,0,0,0],"rail":true}');
    expect(state).toEqual({ entry: "fox", cam: [1, 2, 3, 0, 0, 0], rail: true });
  });
});

/*
 * The generated out/index.html frame player. Three behaviours earned by
 * field complaints: an `animation` autoplays (its frames sample the clip —
 * a static player under that label is the label lying), the picture answers
 * the same drag-to-rotate gesture as the host panel, and the square stage
 * caps to the viewport so the controls never fall below the fold.
 */
describe("turntable viewer page", () => {
  function viewerHtml(assetKind?: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "s3d-viewer-"));
    try {
      writeViewer(
        dir,
        {
          schemaVersion: 1,
          generatedAt: "2026-01-01T00:00:00.000Z",
          source: { kind: "spec", files: ["scene.json"] },
          blender: { version: null, used: false },
          partTree: [],
          materials: [],
          textures: [],
          animation: { fps: 24, frameStart: 1, frameEnd: 48, keyframedObjects: [] },
          camera: { present: false, name: null },
          proofImages: [],
          exportedAssets: [],
          issues: { errors: 0, warnings: 0, infos: 0 },
          issueCodes: [],
          ...(assetKind ? { assetKind } : {}),
        } as never,
        ["out/proof/a.png", "out/proof/b.png"],
      );
      return fs.readFileSync(path.join(dir, "out", "index.html"), "utf8");
    } finally {
      rmRetry(dir);
    }
  }

  it("carries the asset kind and gates autoplay on `animation`", () => {
    const anim = viewerHtml("animation");
    expect(anim).toContain('"assetKind":"animation"');
    expect(anim).toContain("if (D.assetKind === 'animation') start();");
    // The default (no kind recorded) falls back to scene, which never
    // autoplays — a spinning prop is noise, not information.
    expect(viewerHtml()).toContain('"assetKind":"scene"');
  });

  it("answers drag-to-rotate on the stage and keeps controls above the fold", () => {
    const html = viewerHtml();
    // The same gesture the host panel answers with.
    expect(html).toContain("stage.addEventListener('pointerdown'");
    expect(html).toContain("stage.addEventListener('pointermove'");
    // The stage caps to the viewport height; a scrubber below the fold
    // reads as a broken page (this shipped once).
    expect(html).toMatch(/\.stage, \.bar \{ width: min\(100%, calc\(100vh/);
    // Its script parses — the page is authored inside a TS template
    // literal, where a stray backtick is a shipped syntax error.
    for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      expect(() => new Function(m[1]!)).not.toThrow();
    }
  });
});

/*
 * Per-entry kind glyphs: the rail differentiates a mixed kit (prop vs
 * animation vs texture) with the same drawn vocabulary the host panel's
 * kind chip uses, and the ident message hands the kind to the host.
 */
describe("kit kind glyphs", () => {
  it("ships the glyph map, the mixed-kind gate, and the entries' kinds", () => {
    const html = renderKitHtml({
      title: "Kit",
      entries: [
        { name: "crate", category: "x", glb: "a.glb", kind: "prop" },
        { name: "fox", category: "x", glb: "b.glb", kind: "animation" },
      ],
    });
    expect(html).toContain("KIND_GLYPHS");
    expect(html).toContain("mixedKinds");
    expect(html).toContain('"kind":"prop"');
    expect(html).toContain('"kind":"animation"');
    // The ident hands the kind up so the host chip can draw the glyph.
    expect(html).toContain("kind: entry.kind || null");
  });
});
