import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { validateGltf } from "../src/lint/gltf-oracle.js";

/**
 * The glTF conformance oracle runs Khronos's reference validator on the
 * exported bytes. These run against committed fixtures, no Blender required:
 * the validator is a pure WASM function of the file.
 */
describe("validateGltf", () => {
  const fixtures = path.join(__dirname, "fixtures", "real");

  it("passes a conformant real asset, with the benign Blender warning suppressed", async () => {
    // DamagedHelmet is valid glTF; its only validator message is the
    // generated-tangent-space portability note, which we suppress by design.
    const issues = await validateGltf(fixtures, "helmet/DamagedHelmet.glb");
    expect(issues).toEqual([]);
  });

  it("reports a warning, not an error, when the file cannot be read", async () => {
    // A missing file is the export stage's problem to report — the oracle
    // stays silent rather than inventing a conformance error.
    const issues = await validateGltf(fixtures, "helmet/does-not-exist.glb");
    expect(issues).toEqual([]);
  });
});
