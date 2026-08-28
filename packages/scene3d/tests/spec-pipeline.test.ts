import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { compile, probeBlender, renderAgentReport } from "../src/index.js";
import { ISSUE_CODES } from "../src/errors.js";
import { deriveFacts } from "../src/lint/facts.js";
import { rmForSetup } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";

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
assertBlenderIfRequired(hasBlender);

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
    // The deliverable assertions below need proof frames to EXIST and a GLB
    // to ship — not a turntable. One still frame carries the same fact.
    const result = await compile({
      projectDir: dir,
      proof: { turntable: false },
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.source.kind).toBe("spec");

    // The build really expanded the repeats: 1 plinth + 4 columns + roof +
    // lamp + ring + finial + planter + ramp + socket + lantern = 13 mesh
    // parts, exactly as claimed.
    expect(result.census!.meshes).toHaveLength(13);
    const names = result.census!.meshes.map((m) => m.object).sort();
    expect(names).toContain("prp_column_4");

    // Shapes came out as real geometry, not boxes with labels: the sphere
    // and torus are far past box vertex counts, and every part is closed.
    //
    // Compared against a BOX rather than a fixed number. These once asserted
    // >1000 verts, which was the old fixed 48x24 tessellation written down as
    // a proxy for "is it curved" — so the assertion failed the moment segment
    // counts began deriving from part size, while the geometry it was meant
    // to police was perfectly correct.
    const byName = new Map(result.census!.meshes.map((m) => [m.object, m]));
    // Twice a box, which even the COARSEST curved primitive clears: at the
    // minSegments floor a cylinder is 12+12 rim verts plus 2 cap centres. Any
    // higher bound would be a statement about tessellation policy, which is
    // the next assertion's job, not this one's.
    const BOX_VERTS = 8;
    for (const curved of [
      "prp_lamp", "prp_ring", "prp_column", "prp_finial",
      // The second wave: a frustum, a hollow pipe and a stretched sphere.
      "prp_planter", "prp_socket", "prp_lantern",
    ]) {
      expect(byName.get(curved)!.verts, `${curved} should be curved geometry`).toBeGreaterThan(
        BOX_VERTS * 2,
      );
    }
    // And detail follows SIZE: the 0.5m ring carries more geometry than the
    // 0.16m lamp, which is the tessellation policy itself — one chord
    // tolerance, segment counts derived per part — rather than a count
    // somebody chose. A fixed-segment emitter fails this.
    expect(byName.get("prp_ring")!.verts).toBeGreaterThan(byName.get("prp_lamp")!.verts);
    // The wedge is the one shape with a FIXED vertex count: a right
    // triangular prism is six corners at any size or tolerance.
    expect(byName.get("prp_ramp")!.verts).toBe(6);
    for (const mesh of result.census!.meshes) {
      expect(mesh.nonManifoldEdges, `${mesh.object} is not watertight`).toBe(0);
      expect(mesh.ngons, `${mesh.object} has ngons`).toBe(0);
    }

    // Topology as pure counting: the Euler characteristic χ = V − E + F is
    // TESSELLATION-INDEPENDENT — these numbers cannot move when segment
    // counts, chord tolerances, or the whole emitter change, only when the
    // shape's genus does. A sphere-like closed solid is 2; each handle
    // (torus ring, tube bore) costs exactly 2. This is watertightness
    // cross-checked through an entirely different mathematics than the
    // edge-manifold scan above: two independent oracles on one property.
    const chi = (name: string) => {
      const m = byName.get(name)!;
      expect(m.edges, `${name} census carries edge counts`).toBeDefined();
      return m.verts - m.edges! + m.faces;
    };
    expect(chi("prp_lamp"), "sphere is genus 0").toBe(2);
    expect(chi("prp_planter"), "frustum is genus 0").toBe(2);
    expect(chi("prp_ramp"), "wedge is genus 0").toBe(2);
    expect(chi("prp_lantern"), "capsule is genus 0").toBe(2);
    expect(chi("prp_ring"), "torus is genus 1 — one handle costs χ exactly 2").toBe(0);
    expect(chi("prp_socket"), "tube is genus 1 — a bore is a handle").toBe(0);

    // ---- spectral shape-DNA -------------------------------------------
    // Every primitive here is one solid, so `shells` is 1 — and that is what
    // makes the χ above usable as genus: genus = (2·shells − χ) / 2 is only
    // "χ/2 off 1" when the shell count is known rather than assumed.
    for (const m of result.census!.meshes) {
      expect(m.spectrum, `${m.object} carries spectral shape-DNA`).toBeDefined();
      expect(m.spectrum!.shells, `${m.object} is one shell`).toBe(1);
      // The genus identity, closed with a measured shell count instead of
      // an assumption: a non-negative integer for every closed mesh here.
      const genus = (2 * m.spectrum!.shells - (m.verts - m.edges! + m.faces)) / 2;
      expect(Number.isInteger(genus), `${m.object} genus ${genus} is an integer`).toBe(true);
      expect(genus, `${m.object} genus is non-negative`).toBeGreaterThanOrEqual(0);
      // The eigen solve is capped; under the cap it must have RUN, and over it
      // must say why it did not. Silence is not one of the options.
      // (2000 mirrors SPECTRUM_VERT_CAP in runner.py — move them together.)
      if (m.verts <= 2000) {
        expect(m.spectrum!.eigenvalues, `${m.object} is under the cap so it must carry eigenvalues`)
          .toBeDefined();
        expect(m.spectrum!.eigenvalues!.length).toBeGreaterThan(0);
        expect(m.spectrum!.eigenvalues!.length).toBeLessThanOrEqual(12);
        // Normalised by the first nonzero eigenvalue, so the vector opens at 1
        // and rises — the size-invariance that makes this a SHAPE fingerprint.
        expect(m.spectrum!.eigenvalues![0]).toBeCloseTo(1, 6);
      } else {
        expect(m.spectrum!.skipped, `${m.object} is over the cap so it must say so`).toBeTruthy();
      }
    }

    // The measured families. The four repeat clones of one column are the
    // self-check: identical geometry MUST land in one family, or the
    // fingerprint does not fingerprint.
    const spectral = deriveFacts(result.census!, new Map());
    const familyOf = (name: string) => spectral.spectralFamilyByPart.get(name);
    const columnFamily = familyOf("prp_column");
    expect(columnFamily, "the column's spectrum was measured").toBeTruthy();
    for (const clone of ["prp_column_2", "prp_column_3", "prp_column_4"]) {
      expect(familyOf(clone), `${clone} shares the base column's shape family`).toBe(columnFamily);
    }
    // And it discriminates, phrased against MEASUREMENT rather than a cap
    // value — a pin on one named mesh's family goes undefined the moment
    // tessellation pushes that mesh over the eigen cap. So: the
    // always-measured pair — an 8-vertex box against the sphere, the two
    // tessellation extremes — must never merge; EVERY measured genus-1 mesh
    // must land outside the sphere's family; and the genus-1 set may not be
    // empty, or a cap regression would silently vacate this loop.
    expect(familyOf("prp_lamp")).toBeTruthy();
    expect(familyOf("prp_plinth")).toBeTruthy();
    expect(familyOf("prp_plinth"), "box and sphere are not one family").not.toBe(
      familyOf("prp_lamp"),
    );
    const measuredGenus1 = result.census!.meshes.filter(
      (m) => m.spectrum?.eigenvalues && m.verts - m.edges! + m.faces === 0,
    );
    expect(
      measuredGenus1.length,
      "at least one genus-1 mesh is under the eigen cap",
    ).toBeGreaterThan(0);
    for (const handled of measuredGenus1) {
      expect(
        familyOf(handled.object),
        `${handled.object} (genus 1) shares no family with the sphere`,
      ).not.toBe(familyOf("prp_lamp"));
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
    // toMatchObject, not toEqual: the ledger now also carries `margins`
    // (budget usage per numeric claim) — the badge facts are what this pins.
    expect(result.manifest.claims).toMatchObject({ declared: 7, failed: 0 });
    const kitHtml = fs.readFileSync(path.join(dir, "out", "kit.html"), "utf8");
    expect(kitHtml).toMatch(/"claims":\{"declared":7,"failed":0/);
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
    // Clean of DEFECTS. The garden bed is a legitimately large, flat ground
    // among many small rocks/shoots, so the compositional outlier hints (I-952
    // size, I-951 tri-density) fire as info — a "verify units" nudge a statistic
    // cannot suppress without knowing intent. A showcase is clean of errors and
    // warnings; info hints are FYI, not defects.
    expect(result.issues.filter((i) => i.severity !== "info")).toEqual([]);
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

  it("fills a declared box from an agent-authored script, freeform as a shape kind", async () => {
    // The unification: a .py file fills one part's box INSIDE the
    // declarative pipeline — no parallel path, no mode switch. The script's
    // geometry is fitted into the box exactly like an imported asset, so
    // relations place it, claims adjudicate it, and provenance points at
    // the scene.json line that declared it.
    const dir = workDir("good/spec_script_part");
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.census!.meshes).toHaveLength(2);

    const hull = result.census!.meshes.find((m) => m.object === "prp_hull")!;
    // Real freeform geometry: far more verts than a box, and closed — the
    // script faces the same watertight bar as every primitive.
    expect(hull.verts).toBeGreaterThan(8);
    expect(hull.nonManifoldEdges).toBe(0);

    // Fitted INTO the declared box: uniform scale, centred on x/y, resting
    // on its support. The relations placed it; the script only filled it.
    const obj = result.census!.objects.find((o) => o.name === "prp_hull")!;
    expect(obj.location[0]).toBeCloseTo(0, 3);
    expect(obj.location[1]).toBeCloseTo(0, 3);
    // Box is 0.8 x 0.8 x 0.5 sitting on a 0.12 plinth: centre z = 0.12 + 0.25 - embed.
    expect(obj.dimensions[2]).toBeCloseTo(0.5, 2);

    // The material override reached the script geometry.
    expect(hull.materials).toContain("mtl_brass");

    // Provenance points at scene.json, not at any script line.
    expect(result.manifest.partTree.some((p) => p.name === "prp_hull")).toBe(true);

    // The solved table rides the result — parse-loop eyes.
    expect(result.solved!.parts.find((p) => p.id === "prp_hull")!.script).toBe("hull.py");
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
    expect(second.census!.meshes).toHaveLength(13);
  });

  it("keeps a grounded bob's frame-1 pose on its solved contact", async () => {
    // Red before _animate_bob anchored the FIRST keyframe: a resting bob
    // used to open its cycle at mid (+amplitude), and since an animated
    // object's evaluated pose comes from its fcurves — not from a location
    // write after keying — the census measured the part a full amplitude
    // off the contact the solver had floored. Phantom W-337, false E-701.
    // The amplitude here is far above the grounding tolerance on purpose.
    const dir = path.join(__dirname, ".work", `spec-bob-rest-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: { mtl_mat: { baseColor: [0.5, 0.5, 0.5], roughness: 0.8 } },
        parts: [
          { id: "prp_pad", size: [1, 1, 0.1], material: "mtl_mat" },
          {
            id: "prp_buoy", size: [0.3, 0.3, 0.3], material: "mtl_mat",
            bob: { amplitude: 0.1, seconds: 2 },
          },
        ],
        relations: [
          { type: "at", part: "prp_pad", center: [0, 0, 0.05] },
          { type: "sits_on", part: "prp_buoy", on: "prp_pad" },
        ],
        claims: { grounded: true },
      }),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    const buoy = result.census!.meshes.find((m) => m.object === "prp_buoy")!;
    // Rest = the solved contact: pad top 0.1 minus the 1mm embed.
    expect(buoy.spatial!.groundGap).toBeCloseTo(0.099, 3);
    // The rested pair really touches, and the grounded claim holds all cycle.
    expect(result.issues.map((i) => i.code)).not.toContain("S3D-W-337");
    expect(result.issues.map((i) => i.code)).not.toContain(ISSUE_CODES.CLAIM_FAILED);
    expect(result.ok).toBe(true);
  });

  it("classifies the second compile's solve against the first, codec-style", async () => {
    // Two compiles of a three-part stack with one edit between: the edit
    // itself is `authored`, the part the graph moves in response is
    // `propagated`, and nothing is a residual — a deterministic solver
    // moving a part for no authored reason would be the actual news.
    const dir = path.join(__dirname, ".work", `spec-delta-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    const scene = (plinthHeight: number) =>
      JSON.stringify({
        schemaVersion: 1,
        parts: [
          { id: "prp_ground", size: [2, 2, 0.1] },
          { id: "prp_plinth", size: [0.5, 0.5, plinthHeight] },
          { id: "prp_orb", shape: "sphere", size: [0.3, 0.3, 0.3] },
        ],
        relations: [
          { type: "at", part: "prp_ground", center: [0, 0, 0.05] },
          { type: "sits_on", part: "prp_plinth", on: "prp_ground" },
          { type: "sits_on", part: "prp_orb", on: "prp_plinth" },
        ],
      });
    fs.writeFileSync(path.join(dir, "scene.json"), scene(0.4), "utf8");
    const first = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: LONG });
    expect(first.ok).toBe(true);
    // First compile: no baseline, so no delta — silence, not a guess.
    expect(first.solveDelta).toBeUndefined();

    fs.writeFileSync(path.join(dir, "scene.json"), scene(0.6), "utf8");
    const second = await compile({ projectDir: dir, proof: { turntable: false }, timeoutMs: LONG });
    expect(second.ok).toBe(true);
    expect(second.solveDelta).toBeDefined();
    expect(second.solveDelta!.authored).toEqual(["prp_plinth"]);
    expect(second.solveDelta!.propagated).toEqual(["prp_orb"]);
    expect(second.solveDelta!.residuals).toEqual([]);
    expect(second.solveDelta!.steady).toBe(1);
    // And the report carries the compressed line, not a part-by-part dump.
    const report = renderAgentReport(second);
    expect(report).toContain("solve: 1 authored · 1 moved with them (1 steady)");
    expect(report).not.toContain("residual:");
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

  it("gates print DfM on a 3d_print target: measures thickness and flags a sub-nozzle wall", async () => {
    // The 3d_print contract turns on the wall-thickness ray-cast and its
    // judgment. A 0.6mm shell is under the 0.8mm FDM floor; a 20mm block is not.
    // Census + lint assertions only — no render or export is consumed.
    const dir = workDir("print/thin_shell");
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: LONG,
      noCache: true,
    });
    const byName = new Map(result.census!.meshes.map((m) => [m.object, m]));

    // The ray-cast ran (only because target is 3d_print) and measured the wall
    // to sub-millimetre accuracy: a 0.6mm box reads ~0.6mm.
    const shell = byName.get("prp_shell")!;
    expect(shell.minWallThickness).toBeGreaterThan(0.00055);
    expect(shell.minWallThickness).toBeLessThan(0.00065);
    // Overhang is measured for every mesh (it is cheap and always on).
    expect(typeof shell.overhangAreaFraction).toBe("number");

    // The thin shell is judged too thin; the thick block is fine.
    const thin = result.issues.filter((i) => i.code === ISSUE_CODES.WALL_TOO_THIN).map((i) => i.target);
    expect(thin).toContain("prp_shell");
    expect(thin).not.toContain("prp_block");
    // Advisory only — a warning, never a compile-blocking error.
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([]);
  });
  it("names the pose the AUTHOR'S camera actually has, not a default front", async () => {
    /*
     * With no turntable and a scene that owns a camera, the runner renders
     * through THAT camera and never re-aims it. The label was derived from the
     * `respectSceneCamera` flag alone, so the frame came back as `front, az 0`
     * while the camera sat at 45 — and the wrong bearing travelled to the
     * manifest, the contact sheet, its gnomon and the web scrubber. The pose
     * is measured by the runner; the label must come from the measurement.
     */
    const dir = workDir("good/spec_pavilion");
    const r = await compile({
      projectDir: dir,
      stages: ["parse", "build", "proof", "manifest"],
      proof: { turntable: false, resolution: 160 },
      noCache: true,
      timeoutMs: 300_000,
    });
    const measured = r.census?.camera?.azimuthDeg;
    expect(measured, "the runner must measure the placed camera").toBeTypeOf("number");
    const view = r.manifest.proofViews?.[0];
    expect(view, "a measured pose must be named").toBeTruthy();
    expect(view!.azimuthDeg).toBeCloseTo(measured as number, 3);
    // The fixture's hero camera is not at the front; a `front` here is the bug.
    expect(view!.name).not.toBe("front");
  }, 300_000);

  it("a declared proof.background does not turn coverage into a lie", async () => {
    /*
     * Coverage is derived from the alpha mask, and the backdrop branch used to
     * skip `film_transparent` — so with a background declared, every frame
     * reported 100% covered, the empty and sparse proof rules could not fire,
     * and an aimed shot at a blank wall came back as a perfect catch. The
     * author's colour is written under the transparent pixels instead, so the
     * backdrop survives and the mask stays real.
     */
    const dir = workDir("good/spec_pavilion");
    const shoot = async (background?: string): Promise<number> => {
      const r = await compile({
        projectDir: dir,
        stages: ["parse", "build", "proof"],
        proof: { turntable: false, resolution: 160, ...(background ? { background } : {}) },
        noCache: true,
        timeoutMs: 300_000,
      });
      const cov = r.manifest.proofFrames?.[0]?.coverage;
      expect(cov, "the proof must report a measured coverage").toBeTypeOf("number");
      return cov as number;
    };
    const plain = await shoot();
    const withBackdrop = await shoot("#100c0a");
    expect(withBackdrop).toBeLessThan(0.95);
    // The subject did not change, so neither may the measurement of it.
    expect(Math.abs(withBackdrop - plain)).toBeLessThan(0.02);

    /* And the author's colour still reaches the file. Keeping the film
       transparent is only half the trade: the backdrop is written UNDER the
       transparent pixels, so a reader that drops alpha still sees the colour
       that was asked for instead of a void. Asserted on the bytes, because
       "the code calls save()" is not the same fact. */
    const r = await compile({
      projectDir: dir,
      stages: ["parse", "build", "proof"],
      proof: { turntable: false, resolution: 64, background: "#FF0000" },
      noCache: true,
      timeoutMs: 300_000,
    });
    const png = fs.readFileSync(path.join(dir, r.proofImages[0]!));
    const chunks: Buffer[] = [];
    let at = 8;
    let colorType = 0;
    while (at < png.length) {
      const len = png.readUInt32BE(at);
      const type = png.toString("ascii", at + 4, at + 8);
      if (type === "IHDR") colorType = png[at + 17]!;
      if (type === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + len));
      at += 12 + len;
    }
    expect(colorType, "the proof must carry an alpha channel").toBe(6);
    const raw = zlib.inflateSync(Buffer.concat(chunks));
    // Row 0, pixel 0, past the scanline's filter byte: a corner is backdrop.
    const [red, green, blue, alpha] = [raw[1]!, raw[2]!, raw[3]!, raw[4]!];
    expect(red).toBeGreaterThan(200);
    expect(green).toBeLessThan(40);
    expect(blue).toBeLessThan(40);
    expect(alpha, "the backdrop must stay transparent so coverage is a mask").toBe(0);
  }, 900_000);

  it("a cache hit does not drop what the shot measured", async () => {
    /*
     * The frames were cached and their MEASUREMENTS were not, so the second
     * compile returned a shot with no `caught:` line — losing it exactly when
     * the loop iterates fastest, and losing the one fact that stops a
     * photograph of a wall reading as a framed subject.
     */
    const dir = workDir("good/spec_pavilion");
    const opts = {
      projectDir: dir,
      stages: ["parse", "build", "proof", "manifest"] as const,
      proof: { turntable: false, resolution: 160 },
      looks: [{ at: "prp_lamp", from: "left" }],
      timeoutMs: 300_000,
    };
    const cold = await compile({ ...opts, stages: [...opts.stages] });
    const warm = await compile({ ...opts, stages: [...opts.stages] });
    expect(warm.stages.find((s) => s.id === "proof")?.status).toBe("cached");
    const a = cold.looks[0]!.pose;
    const b = warm.looks[0]!.pose;
    expect(a.coverage).toBeTypeOf("number");
    expect(b.coverage, "coverage must survive the cache").toBe(a.coverage);
    expect(b.meanLuminance, "luminance must survive the cache").toBe(a.meanLuminance);
  }, 600_000);

  /** A scene written inline, for cases no fixture covers. */
  const sceneDir = (name: string, spec: unknown) => {
    const dir = path.join(__dirname, ".work", `${name}-spec-${++workSeq}`);
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(spec, null, 2));
    return dir;
  };

  it("calls a dark frame unlit, not empty, when the subject is measurably in it", async () => {
    /*
     * One predicate used to OR "luminance below the floor" with "no lit pixels
     * at all" and then print the framing hint for both, so a night scene whose
     * camera was aimed correctly got told to move the camera. They are two
     * faults with two different repairs; coverage is the measurement that
     * separates them.
     */
    const dir = sceneDir("unlit", {
      schemaVersion: 1,
      light: { preset: "studio", key: 0, ambient: [0, 0, 0] },
      materials: { mtl_stone: { baseColor: [0.4, 0.4, 0.42], roughness: 0.8 } },
      parts: [{ id: "prp_block", size: [1, 1, 1], material: "mtl_stone" }],
      relations: [{ type: "at", part: "prp_block", center: [0, 0, 0.5] }],
    });
    const r = await compile({ projectDir: dir, noCache: true, timeoutMs: 600_000 });
    const unlit = r.issues.find((i) => i.code === ISSUE_CODES.UNLIT_PROOF);
    expect(unlit, "an unlit-but-framed scene must report UNLIT_PROOF").toBeTruthy();
    expect(r.issues.some((i) => i.code === ISSUE_CODES.EMPTY_PROOF)).toBe(false);
    // The claim is only honest if the subject really is in frame: assert the
    // measurement the diagnosis rests on, not just the code.
    const d = unlit!.detail as { coverage: number; meanLuminance: number };
    expect(d.coverage).toBeGreaterThan(0.1);
    expect(d.meanLuminance).toBeLessThanOrEqual(0.002);
    expect(unlit!.hint).toContain("light");
    // It must not send the author to fix the framing, which was already right.
    expect(unlit!.message).not.toContain("empty");
    expect(unlit!.hint).toContain("not the fault");
  }, 900_000);

  it("gives compiler-authored tube and wedge meshes the UVs its own linter demands", async () => {
    /*
     * The ops-based primitives come out of Blender unwrapped; meshes authored
     * from explicit vertices did not, so a shader on a tube failed S3D-E-441
     * with a fix — unwrap the mesh — that this language has no word for. The
     * compiler authored the geometry, so the compiler owes it coordinates.
     */
    const dir = sceneDir("tube_uv", {
      schemaVersion: 1,
      shaders: { shd_rust: { kernel: "rust.glsl", size: 256 } },
      materials: { mtl_iron: { baseColor: { shader: "shd_rust" }, roughness: 0.7 } },
      parts: [
        { id: "prp_cage", shape: "tube", thickness: 0.012, size: [0.3, 0.3, 0.4], material: "mtl_iron" },
        { id: "prp_ramp", shape: "wedge", axis: "x", size: [0.4, 0.3, 0.2], material: "mtl_iron" },
      ],
      relations: [
        { type: "at", part: "prp_cage", center: [0, 0, 0.2] },
        { type: "at", part: "prp_ramp", center: [0.6, 0, 0.1] },
      ],
    });
    fs.writeFileSync(
      path.join(dir, "rust.glsl"),
      `vec4 kernel(vec2 uv) {
  float n = fract(sin(dot(floor(uv * 8.0), vec2(3.0, 7.0))) * 43.0);
  return vec4(0.45 + 0.25 * n, 0.22 + 0.10 * n, 0.10, 1.0);
}
`,
    );
    const r = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      noCache: true,
      timeoutMs: 900_000,
    });
    expect(r.issues.filter((i) => i.code === "S3D-E-441")).toEqual([]);
    expect(r.ok).toBe(true);
  }, 900_000);

  it("orbits the turntable at the authored camera elevation, and says so", async () => {
    /*
     * `camera.elevationDeg` placed the scene camera object and was ignored by
     * the turntable, which orbited at a constant 30 in the runner. The pixels
     * are asserted, not just the label: the same value reaches the runner and
     * the view describer, so a caption that changed while the render did not
     * would be the exact bug this pins against.
     */
    const build = async (elevationDeg: number) => {
      const dir = sceneDir(`orbit${elevationDeg}`, {
        schemaVersion: 1,
        camera: { elevationDeg },
        materials: { mtl_a: { baseColor: [0.6, 0.6, 0.6] } },
        parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_a" }],
        relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
      });
      const r = await compile({ projectDir: dir, noCache: true, timeoutMs: 900_000 });
      const frame = (r.manifest?.proofImages ?? [])[0]!;
      return {
        elevations: (r.manifest?.proofViews ?? []).map((v) => v.elevationDeg),
        bytes: fs.readFileSync(path.join(dir, frame)),
      };
    };
    const low = await build(18);
    const high = await build(30);
    expect(new Set(low.elevations)).toEqual(new Set([18]));
    expect(new Set(high.elevations)).toEqual(new Set([30]));
    // The render moved, not merely its caption.
    expect(low.bytes.equals(high.bytes)).toBe(false);
  }, 1_800_000);

  it("conventions.animation.maxFrames is a budget the built clip is measured against", async () => {
    /*
     * The knob was validated, normalized, and then read by nothing — a project
     * could declare a clip-length budget and never be told it was passed. It
     * is measured against the BUILT frame range, like the triangle budgets:
     * the author is not the authority on how long the animation turned out.
     */
    const dir = workDir("good/spec_pavilion");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.parts[0].spin = { seconds: 4 };
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene, null, 2));
    const withBudget = async (maxFrames: number) => {
      fs.writeFileSync(
        path.join(dir, "scene3d.json"),
        JSON.stringify({ schemaVersion: 1, conventions: { animation: { maxFrames } } }, null, 2),
      );
      const r = await compile({
        projectDir: dir,
        stages: ["parse", "build", "lint"],
        noCache: true,
        timeoutMs: 300_000,
      });
      return r.issues.find((i) => i.code === "S3D-W-388");
    };
    const over = await withBudget(30);
    expect(over, "a 4s clip must exceed a 30-frame budget").toBeTruthy();
    expect((over!.detail as { frames: number }).frames).toBeGreaterThan(30);
    // The duration it prints is the SPAN, matching how the clip's length is
    // measured everywhere else — not the inclusive frame count over fps.
    const d = over!.detail as { frames: number; fps: number };
    expect(over!.message).toContain(`${d.frames} frames`);
    expect(over!.message).toContain(`at ${d.fps}fps`);
    // …and the rule stays silent when the clip fits, or it is just noise.
    expect(await withBudget(10_000)).toBeUndefined();
    // Exactly at the budget is within it — a budget is a ceiling, not a wall
    // one short of itself.
    expect(await withBudget(d.frames)).toBeUndefined();
  }, 600_000);

  it("conventions.animation.fps sets the clip's real duration", async () => {
    /*
     * The rate was validated and cache-keyed, then overridden by a constant,
     * so a project asking for 30 got 24. Fixing only the frame COUNT would
     * have been worse: 60 frames played at 24 is a 2.5s clip for two seconds
     * of authored motion. The census measures both, so the duration is the
     * assertion.
     */
    const dir = workDir("good/spec_pavilion");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.parts[0].spin = { seconds: 2 };
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene, null, 2));
    fs.writeFileSync(
      path.join(dir, "scene3d.json"),
      JSON.stringify({ schemaVersion: 1, conventions: { animation: { fps: 30 } } }, null, 2),
    );
    const r = await compile({
      projectDir: dir,
      stages: ["parse", "build"],
      noCache: true,
      timeoutMs: 300_000,
    });
    const anim = r.census?.animation;
    expect(anim?.fps).toBe(30);
    expect((anim!.frameEnd - anim!.frameStart) / anim!.fps).toBeCloseTo(2, 3);
  }, 300_000);

  it("light.ambient actually reaches the pixels", async () => {
    /*
     * The one test that can catch this: two compiles differing ONLY in
     * `ambient`, compared on MEASURED luminance. The emitter authored the
     * world correctly all along and the runner's neutral default overwrote it
     * afterwards, so the value reached no pixel — and every cheaper check
     * passed, because a dark material under a grey world still looks dark.
     * Assert the rendered result, not the emitted script.
     */
    const dir = workDir("good/spec_pavilion");
    const p = path.join(dir, "scene.json");
    const shoot = async (ambient: number): Promise<number> => {
      const scene = JSON.parse(fs.readFileSync(p, "utf8"));
      scene.light = { key: 0, ambient };
      fs.writeFileSync(p, JSON.stringify(scene, null, 2));
      const r = await compile({
        projectDir: dir,
        stages: ["parse", "build", "proof"],
        proof: { turntable: false, resolution: 128 },
        noCache: true,
        timeoutMs: 300_000,
      });
      const lum = r.manifest.proofFrames?.[0]?.meanLuminance;
      expect(lum, "the proof must report a measured luminance").toBeTypeOf("number");
      return lum as number;
    };
    const dark = await shoot(0.002);
    const bright = await shoot(3);
    // A 1500x change in world light must move the picture. The bug produced
    // byte-identical luminance for both.
    expect(bright).toBeGreaterThan(dark * 5);
  }, 600_000);

  it("reports lost material channels PER MATERIAL, not per scene", async () => {
    /*
     * An extension is not a scene-wide capability. One material carrying
     * `KHR_materials_clearcoat` says nothing about whether a different
     * material's sheen survived — and a check that reads `extensionsUsed`
     * alone reports no loss for a real loss whenever any other material
     * happens to use the same extension. Two materials, two different
     * channels, one of which travels and one of which does not, is the case
     * that separates the two implementations.
     */
    const dir = workDir("good/spec_pavilion");
    const scene = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8"));
    scene.materials.mtl_coated = {
      baseColor: [0.4, 0.05, 0.05], roughness: 0.3, metallic: 1, coat: 1, coatRoughness: 0.05,
    };
    scene.materials.mtl_velvet = {
      baseColor: [0.2, 0.1, 0.3], roughness: 0.9, metallic: 0, sheen: 1, sheenRoughness: 0.3,
    };
    scene.parts[0].material = "mtl_coated";
    scene.parts[1].material = "mtl_velvet";
    fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(scene, null, 2));

    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "export", "lint"],
      noCache: true,
      timeoutMs: 300_000,
    });
    const lost = result.issues.find((i) => i.code === "S3D-W-903");
    expect(lost, "expected a deliverable-parity finding").toBeTruthy();
    const names = (lost!.detail as { lost?: string[] }).lost ?? [];
    // Sheen has no carrier in the lowered glTF and is named WITH its material.
    expect(names).toContain("mtl_velvet.sheen");
    // Clearcoat DOES travel, so it must not be reported as lost — and the
    // scene-wide check could not tell these two apart.
    expect(names.some((n) => n.startsWith("mtl_coated."))).toBe(false);
  }, 300_000);
});

describe.skipIf(!hasBlender)("script parts vs a hostile selection", () => {
  it("fits a script part even when the script sabotages the selection", async () => {
    // transform_apply acts on the SELECTION, and build(ctx) is arbitrary bpy:
    // a script that deselects its mesh and activates a bystander used to
    // leave the part unfitted (unapplied transforms) while the harness
    // transformed the wrong object. The emitter now claims the selection
    // explicitly; this is the adversarial pin.
    const dir = path.join(__dirname, ".work", "spec-script-hostile");
    rmForSetup(dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "scene.json"),
      JSON.stringify({
        schemaVersion: 1,
        materials: { mtl_slab: { baseColor: [0.5, 0.5, 0.5], roughness: 0.7, metallic: 0 } },
        parts: [
          { id: "prp_base", size: [1, 1, 0.12], material: "mtl_slab" },
          { id: "prp_blob", size: [0.4, 0.4, 0.3], script: "blob.py", material: "mtl_slab" },
        ],
        relations: [
          { type: "at", part: "prp_base", center: [0, 0, 0.06] },
          { type: "sits_on", part: "prp_blob", on: "prp_base" },
        ],
      }),
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "blob.py"),
      [
        "import bpy, bmesh",
        "",
        "def build(ctx):",
        "    # Both context spellings hold: the documented attribute form and",
        "    # the item form early scripts used.",
        '    assert ctx.size == ctx["size"] and ctx.size[0] > 0',
        '    mesh = bpy.data.meshes.new("blob")',
        "    bm = bmesh.new()",
        "    bmesh.ops.create_cube(bm, size=2.0)",
        "    bm.to_mesh(mesh)",
        "    bm.free()",
        '    obj = bpy.data.objects.new("blob", mesh)',
        "    bpy.context.collection.objects.link(obj)",
        "    # Authored transform the harness must bake:",
        "    obj.scale = (0.5, 0.25, 0.125)",
        "    # Adversarial: hand the harness the WRONG selection.",
        '    bpy.ops.object.select_all(action="DESELECT")',
        '    other = bpy.data.objects.get("prp_base")',
        "    if other is not None:",
        "        other.select_set(True)",
        "        bpy.context.view_layer.objects.active = other",
      ].join("\n"),
      "utf8",
    );
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint"],
      timeoutMs: 300_000,
      noCache: true,
    });
    expect(result.ok).toBe(true);
    // No unapplied-transform residue on either object.
    expect(result.issues.map((i) => i.code)).not.toContain("S3D-W-330");
    const blob = result.census!.objects.find((o) => o.name === "prp_blob")!;
    // 2m cube scaled (0.5, 0.25, 0.125) = 1.0 x 0.5 x 0.25, uniformly fitted
    // into the 0.4 x 0.4 x 0.3 box: s = 0.4, so 0.4 x 0.2 x 0.1.
    expect(blob.dimensions[0]).toBeCloseTo(0.4, 3);
    expect(blob.dimensions[1]).toBeCloseTo(0.2, 3);
    expect(blob.dimensions[2]).toBeCloseTo(0.1, 3);
    // The bystander the script selected was not transformed.
    const base = result.census!.objects.find((o) => o.name === "prp_base")!;
    expect(base.dimensions[0]).toBeCloseTo(1, 3);
    expect(base.dimensions[2]).toBeCloseTo(0.12, 3);
  }, 400_000);
});

describe.skipIf(!hasBlender)("claim margins against the real build", () => {
  it("reports margins the census independently confirms", async () => {
    // Anti-confirmation check: the ledger's numbers are recomputed HERE from
    // the raw census, by different arithmetic than claimMargins owns. If the
    // two ever disagree, one of them is lying about the same scene.
    const dir = path.join(__dirname, ".work", "margins-pavilion");
    rmForSetup(dir);
    fs.cpSync(path.join(__dirname, "fixtures", "good/spec_pavilion"), dir, { recursive: true });
    const result = await compile({
      projectDir: dir,
      stages: ["parse", "build", "lint", "manifest"],
      timeoutMs: 300_000,
      noCache: true,
    });
    expect(result.ok).toBe(true);
    const margins = result.manifest.claims?.margins ?? [];
    expect(margins.length).toBeGreaterThan(0);

    const spatials = result.census!.meshes
      .map((m) => m.spatial)
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    const measuredTop = Math.max(...spatials.map((s) => s.worldMax[2]!));
    const height = margins.find((m) => m.claim === "maxHeight");
    expect(height).toBeDefined();
    expect(height!.measured).toBeCloseTo(measuredTop, 5);
    expect(height!.used).toBeCloseTo(measuredTop / height!.limit, 5);
    // Every margin of a held claim sits at or under its bound.
    for (const m of margins) {
      expect(m.used).toBeLessThanOrEqual(1 + 1e-6);
    }
    // Tightest-first ordering is a property of the data, not the printer.
    for (let i = 1; i < margins.length; i++) {
      expect(margins[i - 1]!.used).toBeGreaterThanOrEqual(margins[i]!.used);
    }
  }, 400_000);

});
