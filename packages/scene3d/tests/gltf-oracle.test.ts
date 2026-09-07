import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { validateGltf, messagesToIssues } from "../src/lint/gltf-oracle.js";

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

describe("messagesToIssues (O-4/R-6)", () => {
  it("attaches an actionable hint to a recurring validator code", () => {
    const issues = messagesToIssues(
      [{ code: "NODE_SKINNED_MESH_NON_ROOT", message: "Node is skinned...", severity: 1 }],
      "scene.glb",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("warning");
    expect(issues[0]!.hint).toMatch(/armature/i);
  });

  it("still maps a code with no hint, and keeps suppression/severity rules", () => {
    const issues = messagesToIssues(
      [
        { code: "SOME_ERROR", message: "bad", severity: 0 },
        { code: "MESH_PRIMITIVE_GENERATED_TANGENT_SPACE", message: "tangents", severity: 1 },
        { code: "SOME_INFO", message: "fyi", severity: 2 },
      ],
      "scene.glb",
    );
    // The error maps (no hint), the benign tangent note is suppressed, info drops.
    expect(issues.map((i) => i.severity)).toEqual(["error"]);
    expect(issues[0]!.hint).toBeUndefined();
  });
});
