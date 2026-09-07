import { describe, expect, it } from "vitest";
import { lintClaims } from "../src/lint/claims.js";
import { predictCensus, meshOf } from "../src/kernel/mesh.js";
import type { KernelMesh } from "../src/kernel/mesh.js";
import type { EmbedResult } from "../src/kernel/embed.js";
import type { Census, Issue } from "../src/types.js";

/**
 * The `volume` claim: the author asserts an EXACT total volume as a rational,
 * and the compiler proves or refutes it by summing the kernel's exact per-part
 * volumes — rational arithmetic, no float, no tolerance. Adjudicable only when
 * every mesh part is recipe geometry the kernel built; otherwise honestly
 * unchecked (a Blender-primitive or import has no exact volume). The kernel's
 * exact value is itself proven against the build within a float bound
 * (S3D-E-703), so exact equality here is a claim about the shipped mesh.
 */

function box(a: number, b: number, c: number): KernelMesh {
  return meshOf(
    [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]],
    [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
  );
}
const vol = (a: number, b: number, c: number) => predictCensus(box(a, b, c), { mass: true }).mass!.volumeExact;
// The census names each built object after its recipe part id, so the claim's
// per-mesh lookup can match them by name.
// ngons: 0 by default (quad/tri meshes — the case where the ambiguity band is
// EXACT); a case can override it to model a mesh with a ≥5-gon face.
const censusOf = (names: string[], ngons = 0): Census =>
  ({ meshes: names.map((n) => ({ object: n, nonManifoldEdges: 0, ngons })) } as unknown as Census);

// Each part is planar (facesPlanar true, ambiguity "0") unless a case overrides
// it — a box has flat faces, so its volume is triangulation-independent and the
// claim is adjudicable; a non-planar part sets facesPlanar false (the exact
// gate) and carries a positive ambiguity band. `confirmed` defaults to EVERY
// part (the build volume matched within E-703's bound); pass a narrower set to
// model a part the self-check did not confirm.
const run = (
  claimVolume: string,
  meshNames: string[],
  kernelVolumes: Array<{ partId: string; volumeExact: string | null; ambiguityExact?: string | null; facesPlanar?: boolean; embed?: EmbedResult }>,
  confirmed: Set<string> = new Set(meshNames),
  ngons = 0,
): Issue[] => {
  const issues: Issue[] = [];
  lintClaims({ volume: claimVolume }, censusOf(meshNames, ngons), issues, {
    // Planar and embedded by default (a box); a case overrides facesPlanar/embed
    // to model a non-planar or self-intersecting part.
    kernelVolumes: kernelVolumes.map((k) => ({ ambiguityExact: "0", facesPlanar: true, embed: { kind: "embedded" } as EmbedResult, ...k })),
    volumeConfirmed: confirmed,
  });
  return issues;
};

describe("volume claim (exact)", () => {
  it("passes when the summed exact volume equals the claim", () => {
    expect(vol(1, 1, 1)).toBe("1");
    expect(run("1", ["a"], [{ partId: "a", volumeExact: vol(1, 1, 1) }])).toEqual([]);
  });

  it("refutes E-701 when the claim is wrong, naming the exact value", () => {
    const f = run("2", ["a"], [{ partId: "a", volumeExact: vol(1, 1, 1) }]).find((i) => i.code === "S3D-E-701");
    expect(f).toBeDefined();
    expect(f!.message).toContain("volume is 1");
  });

  it("sums several recipe parts EXACTLY (1 + 2 = 3), no float drift", () => {
    const parts = [{ partId: "a", volumeExact: vol(1, 1, 1) }, { partId: "b", volumeExact: vol(2, 1, 1) }];
    expect(run("3", ["a", "b"], parts).filter((i) => i.code === "S3D-E-701")).toEqual([]);
    expect(run("4", ["a", "b"], parts).some((i) => i.code === "S3D-E-701")).toBe(true);
  });

  it("holds exactness a float would lose: 1/3 + 1/3 + 1/3 == 1", () => {
    expect(run("1", ["a", "b", "c"], [
      { partId: "a", volumeExact: "1/3" },
      { partId: "b", volumeExact: "1/3" },
      { partId: "c", volumeExact: "1/3" },
    ]).filter((i) => i.code === "S3D-E-701")).toEqual([]);
  });

  it("is UNCHECKED (W-701) when a mesh part is not recipe geometry", () => {
    // Two built meshes, only one is a recipe part — no exact total.
    const u = run("1", ["a", "prim"], [{ partId: "a", volumeExact: vol(1, 1, 1) }]).find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
    expect(u!.message).toContain("not recipe geometry");
    expect(u!.message).toContain("'prim'");
  });

  it("is UNCHECKED when a prediction is stale/misnamed (does not match a built mesh)", () => {
    // recipe names 'ghost' but the built mesh is 'a' — a bare count would pass;
    // the by-name match refuses it.
    const u = run("1", ["a"], [{ partId: "ghost", volumeExact: vol(1, 1, 1) }]).find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
  });

  it("is UNCHECKED when a recipe part is not a single closed solid", () => {
    const u = run("1", ["open"], [{ partId: "open", volumeExact: null }]).find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
    expect(u!.message).toContain("closed solid");
  });

  it("is UNCHECKED — never a crash — when there is no build census at all", () => {
    // A volume claim on a compile whose build produced no census must report the
    // documented unchecked result, not throw on `census.meshes`. The early
    // no-census guard marks every claim key unchecked before the volume block is
    // reached; this pins that so a refactor cannot let the block see `undefined`.
    const issues: Issue[] = [];
    expect(() => lintClaims({ volume: "1" }, undefined, issues, { kernelVolumes: [] })).not.toThrow();
    const u = issues.find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
    expect(u!.message).toContain("no census");
  });

  it("is UNCHECKED with the ℚ band when the mesh has non-planar faces (triangulation-dependent)", () => {
    // A part whose faces are non-planar (ambiguity 3/10): the exact fan volume is
    // 1, but an exporter's diagonal choice moves the shipped volume within
    // [7/10, 13/10]. The exact claim is not a theorem about the deliverable, so
    // it is unchecked — WITH the band, whether the claim sits inside it, and the
    // triangulate exit named. Even a claim that equals the fan volume is unchecked.
    const u = run("1", ["a"], [{ partId: "a", volumeExact: "1", ambiguityExact: "3/10", facesPlanar: false }]).find(
      (i) => i.code === "S3D-W-701",
    );
    expect(u).toBeDefined();
    expect(u!.message).toContain("triangulation-dependent");
    expect(u!.message).toContain("[7/10, 13/10]");
    expect(u!.message).toContain("ctx.triangulate()");
    expect(u!.detail).toMatchObject({ band: ["7/10", "13/10"], ambiguity: "3/10", claimInsideBand: true });
    // A claim OUTSIDE the band is reported as such (still unchecked, not failed).
    const outside = run("2", ["a"], [{ partId: "a", volumeExact: "1", ambiguityExact: "3/10", facesPlanar: false }]).find(
      (i) => i.code === "S3D-W-701",
    );
    expect(outside!.message).toContain("is OUTSIDE");
    expect(outside!.detail).toMatchObject({ claimInsideBand: false });
    // Never a fail: a non-planar mesh's volume claim cannot be refuted either.
    expect(run("2", ["a"], [{ partId: "a", volumeExact: "1", ambiguityExact: "3/10", facesPlanar: false }]).some((i) => i.code === "S3D-E-701")).toBe(false);
  });

  it("is UNCHECKED WITHOUT a precise band when a non-planar face is an NGON (v0-fan can't bound it)", () => {
    // A non-planar mesh with a ≥5-gon face (ngons > 0): the corner-tet ambiguity
    // walks only the v0-fan, so alternate triangulations use diagonals it never
    // visits and `sum ± amb` is NOT a valid bound. The claim stays unchecked, but
    // the message must state the dependence WITHOUT the untrustworthy band.
    const issues = run("1", ["a"], [{ partId: "a", volumeExact: "1", ambiguityExact: "3/10", facesPlanar: false }], new Set(["a"]), 1);
    const u = issues.find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
    expect(u!.message).toContain("triangulation-dependent");
    expect(u!.message).not.toContain("["); // no numeric band claimed
    expect(u!.detail).not.toHaveProperty("band");
    expect(u!.detail).not.toHaveProperty("claimInsideBand");
    expect(issues.some((i) => i.code === "S3D-E-701")).toBe(false); // still never a fail
  });

  it("is UNCHECKED (never silently collapses) when a part has duplicate predictions", () => {
    // Two predictions for 'a' would let a Map keep only the last, swapping the
    // volume/embed witness. Part ids are unique, so this is malformed — refused.
    const u = run("1", ["a"], [
      { partId: "a", volumeExact: "1", ambiguityExact: "0" },
      { partId: "a", volumeExact: "2", ambiguityExact: "0" },
    ]).find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
    expect(u!.message).toContain("more than one");
  });

  it("REFUTES a self-intersecting mesh, naming the witness faces (signed ≠ solid volume)", () => {
    // The mesh is planar (ambiguity 0) and its build volume confirmed, but it
    // SELF-INTERSECTS: the signed volume double-counts the overlap, so it does
    // not bound the claimed solid. Refuted (not merely unchecked), with the two
    // crossing faces named — the witness is the feature.
    const f = run("1", ["a"], [
      { partId: "a", volumeExact: "1", ambiguityExact: "0", embed: { kind: "selfIntersects", faceA: 3, faceB: 7 } },
    ]).find((i) => i.code === "S3D-E-701");
    expect(f).toBeDefined();
    expect(f!.message).toContain("self-intersects");
    expect(f!.message).toContain("faces 3 and 7");
    expect(f!.detail).toMatchObject({ selfIntersects: [3, 7] });
  });

  it("is UNCHECKED when the embedding could not be certified (over the face cap)", () => {
    const u = run("1", ["a"], [
      { partId: "a", volumeExact: "1", ambiguityExact: "0", embed: { kind: "unchecked", reason: "over the embedding-test cap" } },
    ]).find((i) => i.code === "S3D-W-701");
    expect(u).toBeDefined();
    expect(u!.message).toContain("embedding");
    expect(u!.message).toContain("'a'");
    // Never a silent pass on an unproven immersion.
    expect(run("1", ["a"], [
      { partId: "a", volumeExact: "1", ambiguityExact: "0", embed: { kind: "unchecked", reason: "x" } },
    ]).some((i) => i.code === "S3D-E-701")).toBe(false);
  });

  it("is UNCHECKED when the exact sum matches but the build volume was NOT CONFIRMED", () => {
    // E-701's ℚ sum equals the claim AND the part is a planar closed solid, but
    // the self-check did not confirm its build volume — the part is unmeasured or
    // diverged (E-703), so it is absent from `volumeConfirmed`. The claim is about
    // the SHIPPED mesh; without the E-703 bridge it must be unchecked, not passed
    // (a scaled bake matches topology but not volume). Composed from the self-
    // check's verdict, per the fable-5 ruling — not re-derived here.
    const u = run("1", ["a"], [{ partId: "a", volumeExact: "1", ambiguityExact: "0" }], new Set()).find(
      (i) => i.code === "S3D-W-701",
    );
    expect(u).toBeDefined();
    expect(u!.message).toContain("not confirmed");
    expect(u!.message).toContain("'a'");
    // Crucially: it did NOT pass — no silent acceptance of an unconfirmed claim.
    expect(run("1", ["a"], [{ partId: "a", volumeExact: "1", ambiguityExact: "0" }], new Set()).some((i) => i.code === "S3D-E-701")).toBe(false);
  });
});
