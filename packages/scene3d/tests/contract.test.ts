import { describe, expect, it } from "vitest";
import { validateContract, normalizeContract, DEFAULT_CONTRACT } from "../src/contract.js";

describe("contract validation", () => {
  it("accepts the default contract", () => {
    expect(validateContract(DEFAULT_CONTRACT)).toEqual([]);
  });

  it("rejects bad schema versions and up axes", () => {
    expect(validateContract({ schemaVersion: 2 })).toContain("schemaVersion must be 1");
    expect(
      validateContract({ schemaVersion: 1, conventions: { units: { upAxis: "X" } } }),
    ).toContain("conventions.units.upAxis must be 'Y' or 'Z'");
  });

  it("rejects non-objects", () => {
    expect(validateContract(null)).toContain("contract must be an object");
  });

  it("validates uv.maxStretch loudly and sanitizes a bad programmatic value", () => {
    // Loud rejection for file contracts (surfaces S3D-E-104 via the pipeline).
    expect(validateContract({ schemaVersion: 1, conventions: { uv: { maxStretch: 4 } } })).toEqual(
      [],
    );
    expect(
      validateContract({ schemaVersion: 1, conventions: { uv: { maxStretch: "yes" } } }),
    ).toContain("conventions.uv.maxStretch must be a positive number");
    expect(
      validateContract({ schemaVersion: 1, conventions: { uv: { maxStretch: -1 } } }),
    ).toContain("conventions.uv.maxStretch must be a positive number");
    // Defensive sanitization for a programmatic contract that skipped validation.
    expect(
      normalizeContract({ schemaVersion: 1, conventions: { uv: { maxStretch: "yes" as never } } }).uv
        .maxStretch,
    ).toBe(null);
    expect(
      normalizeContract({ schemaVersion: 1, conventions: { uv: { maxStretch: 4 } } }).uv.maxStretch,
    ).toBe(4);
  });

  it("validates and normalizes LOD ratios, dropping out-of-range ones", () => {
    expect(validateContract({ schemaVersion: 1, export: { lod: [0.5, 0.25] } })).toEqual([]);
    expect(validateContract({ schemaVersion: 1, export: { lod: [1.5] } })).toContain(
      "export.lod must be an array of triangle-keep ratios in (0, 1)",
    );
    // Normalization keeps only reducing ratios.
    const n = normalizeContract({ schemaVersion: 1, export: { lod: [0.5, 1, 0.25, 0] } });
    expect(n.lodRatios).toEqual([0.5, 0.25]);
    expect(normalizeContract().lodRatios).toEqual([]);
  });

  it("rejects an unknown target profile", () => {
    expect(validateContract({ schemaVersion: 1, target: "playstation" })).toContain(
      "target must be one of 'unity', 'unreal', 'godot', 'web', '3d_print'",
    );
    expect(validateContract({ schemaVersion: 1, target: "unreal" })).toEqual([]);
  });
});

describe("target profiles", () => {
  it("applies a target's conventions as defaults", () => {
    const unreal = normalizeContract({ schemaVersion: 1, target: "unreal" });
    expect(unreal.upAxis).toBe("Z"); // Unreal is Z-up, unlike the neutral Y default

    const web = normalizeContract({ schemaVersion: 1, target: "web" });
    expect(web.textures.maxSize).toBe(2048); // tighter than the 4096 default
    expect(web.budgets.maxTrianglesTotal).toBe(200_000);

    const print = normalizeContract({ schemaVersion: 1, target: "3d_print" });
    expect(print.uv.require).toBe("off");
    expect(print.geometry.allowOpenMeshes).toBe(false);
  });

  it("lets an explicit convention override the target preset", () => {
    // web presets Y-up, but the author says Z — the author wins.
    const n = normalizeContract({
      schemaVersion: 1,
      target: "web",
      conventions: { units: { upAxis: "Z" }, textures: { maxSize: 4096 } },
    });
    expect(n.upAxis).toBe("Z");
    expect(n.textures.maxSize).toBe(4096);
  });

  it("leaves conventions the target does not mention at the neutral default", () => {
    const n = normalizeContract({ schemaVersion: 1, target: "unity" });
    expect(n.metallicValues).toEqual([0, 1]);
    expect(n.uv.require).toBe("textured");
    expect(n.maxDepth).toBe(8);
  });
});

describe("contract normalization", () => {
  it("applies defaults for empty contracts", () => {
    const n = normalizeContract();
    expect(n.maxDepth).toBe(8);
    expect(n.metersPerUnit).toBe(1);
    expect(n.upAxis).toBe("Y");
    expect(n.metallicValues).toEqual([0, 1]);
    expect(n.roughnessRange).toEqual([0, 1]);
    expect(n.objectPattern.test("prp_crate_body")).toBe(true);
    expect(n.objectPattern.test("Bad Name!")).toBe(false);
    expect(n.objectPattern.test("x")).toBe(false);
  });

  it("falls back to defaults on invalid regex", () => {
    const n = normalizeContract({
      schemaVersion: 1,
      conventions: { naming: { objectPattern: "[" } },
    });
    expect(n.objectPattern.test("anything")).toBe(true);
  });
});