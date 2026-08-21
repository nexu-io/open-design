import { describe, expect, it, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { discoverSources } from "../src/parse/sources.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * Source discovery for Minecraft models. A dropped-in Java `model.json` or a
 * `.bbmodel` is recognised as the `mc_model` source kind — but never at the
 * expense of a real scene.json, and never mistaking an unrelated `.json`.
 */
describe("discoverSources — mc_model", () => {
  let seq = 0;
  const dirs: string[] = [];
  const mkDir = (files: Record<string, string>): string => {
    const dir = path.join(__dirname, ".work", `mcsrc-${++seq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content, "utf8");
    dirs.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const d of dirs.splice(0)) rmForSetup(d);
  });

  const MODEL = JSON.stringify({ elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} }], textures: {} });

  it("detects a Java block-model .json by its `elements` array", () => {
    const src = discoverSources(mkDir({ "model.json": MODEL }));
    expect(src.kind).toBe("mc_model");
    expect(src.files).toEqual(["model.json"]);
  });

  it("detects a .bbmodel by extension", () => {
    const src = discoverSources(mkDir({ "creeper.bbmodel": MODEL }));
    expect(src.kind).toBe("mc_model");
    expect(src.files).toEqual(["creeper.bbmodel"]);
  });

  it("lets a real scene.json win over a model.json in the same dir", () => {
    const scene = JSON.stringify({ schemaVersion: 1, parts: [{ id: "prp_a", size: [1, 1, 1] }], relations: [] });
    const src = discoverSources(mkDir({ "scene.json": scene, "model.json": MODEL }));
    expect(src.kind).toBe("spec");
  });

  it("never mistakes scene3d.json or an unrelated .json for a model", () => {
    const src = discoverSources(mkDir({ "scene3d.json": JSON.stringify({ schemaVersion: 1 }), "data.json": JSON.stringify({ foo: [1, 2, 3] }) }));
    expect(src.kind).not.toBe("mc_model");
  });

  it("survives a malformed .json without throwing", () => {
    const src = discoverSources(mkDir({ "broken.json": "{ not valid json" }));
    expect(src.kind).not.toBe("mc_model");
  });
});
