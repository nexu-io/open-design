import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { rmForSetup } from "./helpers/fs.js";

/**
 * The declarative pipeline against REAL Blender.
 *
 * spec.test.ts proves the language's rules in isolation; this suite proves
 * the whole chain — scene.json is discovered, validated, solved, emitted,
 * built, measured, and adjudicated — using real geometry. The pavilion is
 * the calibration control: every shape the language offers, materials with
 * emission, a repeat colonnade, and a full claims block, compiling to zero
 * issues. A language whose own showcase trips its own linter is broken.
 */
const hasBlender = (await probeBlender({})) !== null;

describe.skipIf(!hasBlender)("declarative spec pipeline (real Blender)", () => {
  const fixture = (name: string) => path.join(__dirname, "fixtures", name);
  let workSeq = 0;
  const workDir = (name: string) => {
    const dir = path.join(__dirname, ".work", `${name.replace(/[\\/]/g, "_")}-spec-${++workSeq}`);
    rmForSetup(dir);
    fs.cpSync(fixture(name), dir, { recursive: true });
    return dir;
  };
  const LONG = 300_000;

  it("compiles the pavilion through all six stages with zero issues", async () => {
    const dir = workDir("good/spec_pavilion");
    const result = await compile({ projectDir: dir, timeoutMs: LONG, noCache: true });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.source.kind).toBe("spec");

    // The build really expanded the repeats: 1 plinth + 4 columns + roof +
    // lamp + ring + finial = 9 mesh parts, exactly as claimed.
    expect(result.census!.meshes).toHaveLength(9);
    const names = result.census!.meshes.map((m) => m.object).sort();
    expect(names).toContain("prp_column_4");

    // Shapes came out as real geometry, not boxes with labels: the sphere
    // and torus are far past box vertex counts, and every part is closed.
    const byName = new Map(result.census!.meshes.map((m) => [m.object, m]));
    expect(byName.get("prp_lamp")!.verts).toBeGreaterThan(1000);
    expect(byName.get("prp_ring")!.verts).toBeGreaterThan(1000);
    for (const mesh of result.census!.meshes) {
      expect(mesh.nonManifoldEdges, `${mesh.object} is not watertight`).toBe(0);
      expect(mesh.ngons, `${mesh.object} has ngons`).toBe(0);
    }

    // The columns solved where the relations put them: a 2x2 colonnade
    // inset 0.15 from the plinth corners.
    const column = result.census!.objects.find((o) => o.name === "prp_column")!;
    expect(column.location[0]).toBeCloseTo(-0.99, 3);
    expect(column.location[1]).toBeCloseTo(-0.59, 3);

    // Provenance points at the scene.json line the author wrote — repeat
    // instances at their base part's declaration, not a generated script.
    const provenance = result.census!.provenance!;
    expect(provenance.prp_column_3!.file).toBe("scene.json");
    expect(provenance.prp_column_3!.line).toBe(provenance.prp_column!.line);
    const specText = fs.readFileSync(path.join(dir, "scene.json"), "utf8").split("\n");
    expect(specText[provenance.prp_column!.line! - 1]).toContain('"prp_column"');

    // The emission material carried through to the Blender scene.
    const lamp = result.census!.materials.find((m) => m.name === "mtl_lamp");
    expect(lamp).toBeTruthy();
    expect(lamp!.principled.untouchedDefault).toBe(false);

    // Deliverables exist: proof frames rendered, GLB and USD exported.
    expect(result.proofImages.length).toBeGreaterThan(0);
    expect(result.exportedAssets.some((a) => a.endsWith(".glb"))).toBe(true);
    expect(result.manifest.assetKind).toBe("scene");

    // The generated script is a real on-disk artifact of the compile.
    expect(fs.existsSync(path.join(dir, ".scene3d", "spec.build.py"))).toBe(true);

    // The manifest wears the claims ledger, and the kit page carries the
    // census-derived part facts: watertight glyph flags, provenance lines,
    // material swatch colours, and the proven-claims badge data.
    expect(result.manifest.claims).toEqual({ declared: 7, failed: 0 });
    const kitHtml = fs.readFileSync(path.join(dir, "out", "kit.html"), "utf8");
    expect(kitHtml).toContain('"claims":{"declared":7,"failed":0}');
    expect(kitHtml).toMatch(/"y":"w"/); // watertight primitives earn the glyph
    expect(kitHtml).toMatch(/"o":\d+/); // scene.json provenance lines
    expect(kitHtml).toMatch(/"matColors":\{[^}]*"mtl_stone":"#[0-9a-f]{6}"/);
    expect(kitHtml).toMatch(/"d":\[/); // measured dimensions ride along
  }, 400_000);

  it("compiles the scattered rock garden clean, with every claim proven", async () => {
    // Scatter through the whole real pipeline: 12 rocks + 8 shoots from a
    // path-addressed stream, cross-scatter collision-free, claims
    // adjudicated against real measured geometry.
    const dir = workDir("good/spec_rock_garden");
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.census!.meshes).toHaveLength(21);
    // The census's own coplanar scan agrees with the solver's guarantee.
    expect(result.census!.zFightingPairs).toEqual([]);
    // Determinism across a fresh compile of the same spec: identical
    // placements, byte for byte.
    const again = await compile({
      projectDir: workDir("good/spec_rock_garden"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    const positions = (r: typeof result) =>
      r.census!.objects.filter((o) => o.name.startsWith("prp_")).map((o) => [o.name, o.location]);
    expect(positions(again)).toEqual(positions(result));
  }, 400_000);

  it("hits the build cache on an unchanged spec", async () => {
    const dir = workDir("good/spec_pavilion");
    const first = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
    });
    expect(first.ok).toBe(true);
    const second = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
    });
    expect(second.stages.find((s) => s.id === "build")!.status).toBe("cached");
    expect(second.census!.meshes).toHaveLength(9);
  });

  it("fails every false claim with the measured truth, and only those", async () => {
    const result = await compile({
      projectDir: workDir("poisoned/spec-claims"),
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
    });
    expect(result.ok).toBe(false);
    const failures = result.issues.filter((i) => i.code === ISSUE_CODES.CLAIM_FAILED);
    const failedClaims = new Set(failures.map((i) => (i.detail as { claim: string }).claim));
    expect(failedClaims).toEqual(
      new Set(["parts", "maxTriangles", "grounded", "maxHeight", "footprint", "materialsUsed"]),
    );
    // The one true claim stays unflagged: a cube IS watertight.
    expect(failedClaims.has("watertight")).toBe(false);
    // Failures carry the measured value, not just a verdict.
    const parts = failures.find((i) => (i.detail as { claim: string }).claim === "parts")!;
    expect(parts.message).toContain("1 mesh parts, not 3");
  });

  it("rejects an invalid spec at parse time with JSON paths, before Blender runs", async () => {
    const dir = path.join(__dirname, ".work", `spec-invalid-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        parts: [{ id: "prp_a", size: [1, 0, 1] }],
        relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      }),
      "utf8",
    );
    const result = await compile({ projectDir: dir, timeoutMs: LONG });
    expect(result.ok).toBe(false);
    const invalid = result.issues.filter((i) => i.code === ISSUE_CODES.SPEC_INVALID);
    expect(invalid.some((i) => i.message.includes("parts[0].size[1]"))).toBe(true);
    // No geometry stage ran on an invalid spec.
    expect(result.census).toBeUndefined();
  });

  it("reports scene.json + build.py as ambiguous rather than picking one", async () => {
    const dir = path.join(__dirname, ".work", `spec-ambiguous-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(fixture("good/spec_pavilion/scene.json"), path.join(dir, "scene.json"));
    fs.writeFileSync(path.join(dir, "build.py"), "import bpy\n", "utf8");
    const result = await compile({ projectDir: dir, stages: ["parse"], timeoutMs: LONG });
    expect(result.issues.some((i) => i.code === ISSUE_CODES.AMBIGUOUS_SOURCES)).toBe(true);
  });
});
