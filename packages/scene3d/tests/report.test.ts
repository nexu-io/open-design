import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { renderAgentReport } from "../src/report.js";
import { buildManifest } from "../src/manifest.js";
import { encodePng } from "../src/sheet/png.js";
import { CompileResult, Census, Issue } from "../src/types.js";

const source = { kind: "bpy" as const, files: ["build.py"] };

/** Minimal census carrying just what connectivity derivation reads. */
function censusWith(meshes: string[], contacts: Array<[string, string]> = []): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: meshes.map((name) => ({
      name,
      type: "MESH",
      parent: null,
      location: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      dimensions: [1, 1, 1],
      visible: true,
      hasMeshData: true,
    })),
    meshes: meshes.map((object) => ({
      object,
      verts: 8,
      faces: 6,
      ngons: 0,
      nonManifoldEdges: 0,
      zeroAreaFaces: 0,
      nan: false,
      uvLayers: [],
    })),
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    contacts: contacts.map(([a, b]) => ({
      a,
      b,
      gap: [0, 0, 0] as [number, number, number],
      separation: 0,
      intersects: false,
    })),
    camera: { present: false, name: null },
    lightCount: 0,
    animation: { fps: 24, frameStart: 1, frameEnd: 24, keyframedObjects: [] },
    offCameraObjects: [],
  };
}

function result(overrides: Partial<CompileResult> = {}): CompileResult {
  const issues: Issue[] = overrides.issues ?? [];
  const summary = {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
  };
  const source = { kind: "bpy" as const, files: ["build.py"] };
  return {
    ok: summary.errors === 0,
    source,
    stages: [
      { id: "parse", status: "ran", durationMs: 2 },
      { id: "build", status: "cached", durationMs: 0 },
      // Frames in a result mean proof ran; a result with frames and NO proof
      // stage is the stale case, which the staleness tests state explicitly.
      { id: "proof", status: "ran", durationMs: 5 },
    ],
    issues,
    manifest: buildManifest({
      source,
      issues,
      summary,
      proofImages: [],
      exportedAssets: [],
      blenderUsed: true,
      blenderVersion: "5.0.1",
    }),
    proofImages: [],
    exportedAssets: [],
    summary,
    ...overrides,
  } as CompileResult;
}

describe("renderAgentReport", () => {
  it("opens with the verdict attributes so the model sees pass/fail first", () => {
    const text = renderAgentReport(result());
    expect(text.split("\n")[0]).toBe('<scene3d-report ok="true" errors="0" warnings="0">');
    expect(text).toContain("verdict: compiles clean.");
    expect(text.endsWith("</scene3d-report>")).toBe(true);
  });

  it("groups issues by severity and prints code, target and fix", () => {
    const text = renderAgentReport(
      result({
        issues: [
          {
            code: "S3D-E-324",
            severity: "error",
            message: "coplanar overlap between 'a' and 'b' (6 face pair(s))",
            target: "a <-> b",
            hint: "offset one surface by at least 1e-3",
          },
          {
            code: "S3D-W-341",
            severity: "warning",
            message: "material 'mtl_x' is still at Principled factory defaults",
            target: "mtl_x",
          },
        ],
      }),
    );
    expect(text).toContain('<scene3d-report ok="false" errors="1" warnings="1">');
    expect(text).toContain("errors:\n  S3D-E-324 [a <-> b] coplanar overlap");
    expect(text).toContain("    fix: offset one surface by at least 1e-3");
    expect(text).toContain("warnings:\n  S3D-W-341 [mtl_x] material 'mtl_x' is still at Principled");
    expect(text).toContain("verdict: fix every error above, then compile again");
  });

  it("reports warnings as advisory when the compile still passes", () => {
    const text = renderAgentReport(
      result({
        issues: [{ code: "S3D-W-381", severity: "warning", message: "scene has no lights" }],
      }),
    );
    expect(text).toContain("verdict: compiles clean; warnings above are advisory");
  });

  it("renders the measured detail behind a finding, minus the origin it already printed", () => {
    const text = renderAgentReport(
      result({
        issues: [
          {
            code: "S3D-W-325",
            severity: "warning",
            message: "'prp_orb' floats 919mm above 'prp_floor'",
            target: "prp_orb",
            detail: {
              gapMeters: 0.919,
              nearestSupport: "prp_floor",
              origin: [{ at: "scene.json:41" }],
            },
          },
        ],
      }),
    );
    // The numbers the census computed reach the model as a data: line…
    expect(text).toContain("    data: gapMeters=0.919 nearestSupport=prp_floor");
    // …and origin stays on the issue line, not duplicated into data:.
    expect(text).toContain("(scene.json:41)");
    expect(text).not.toContain("data: gapMeters=0.919 nearestSupport=prp_floor origin");
  });

  it("caps a runaway detail payload instead of flooding the report", () => {
    const text = renderAgentReport(
      result({
        issues: [
          {
            code: "S3D-E-802",
            severity: "error",
            message: "driver rejected the shader",
            detail: { log: "x".repeat(2000) },
          },
        ],
      }),
    );
    const dataLine = text.split("\n").find((line) => line.trimStart().startsWith("data:"));
    expect(dataLine).toBeDefined();
    expect(dataLine!.length).toBeLessThanOrEqual(410);
    expect(dataLine).toContain("…");
  });

  it("does not depend on any volatile field — two compiles that differ only in timing render identically", () => {
    // The real determinism guard: the report must be a pure function of the
    // scene's measured state, NOT of how long the stages took or which of
    // them hit cache this run. Mutating only the volatile fields must not
    // move a single byte. Add a new volatile field to CompileResult → add it
    // here, or this test stops guarding it.
    const base = result({
      issues: [{ code: "S3D-E-381", severity: "error", message: "scene has no camera" }],
    });
    const volatile = result({
      issues: [{ code: "S3D-E-381", severity: "error", message: "scene has no camera" }],
      // The SAME stages, differing only in how long they took. Dropping a
      // stage would be a real difference in what ran, which is not what this
      // test is about.
      stages: [
        { id: "parse", status: "ran", durationMs: 9999 },
        { id: "build", status: "cached", durationMs: 12345 },
        { id: "proof", status: "ran", durationMs: 54321 },
      ],
    });
    expect(renderAgentReport(volatile)).toBe(renderAgentReport(base));
  });

  it("leaks no duration or absolute path into the block", () => {
    const text = renderAgentReport(
      result({
        proofImages: [".scene3d/proof/proof-abc-000.png"],
        exportedAssets: [".scene3d/work/scene.glb"],
      }),
    );
    // No millisecond count survives (durationMs is JSON/panel-only now)…
    expect(text).not.toMatch(/\b\d+ms\b/);
    // …and no absolute path (Windows drive or POSIX root) escapes the block.
    expect(text).not.toMatch(/[A-Za-z]:\\/);
    expect(text).not.toMatch(/\s\/(?:Users|home|tmp|var)\//);
  });

  it("states the delta since the previous compile: no baseline, unchanged, or what changed", () => {
    // No baseline — a first compile has nothing to have changed from.
    expect(renderAgentReport(result())).toContain("delta: first compile — no baseline");

    // Unchanged — the payoff line that tells the agent its edit was a no-op.
    const unchanged = {
      partsAdded: [],
      partsRemoved: [],
      partsMoved: [],
      partsResized: [],
      issuesAppeared: [],
      issuesResolved: [],
      contactsMade: [],
      contactsBroken: [],
      materialsChanged: [],
      animationChanged: [],
      unchanged: true,
    };
    expect(renderAgentReport(result({ impact: unchanged }))).toContain(
      "delta: unchanged since previous compile",
    );

    // Changed — and the broken-support line, the action-at-a-distance signal
    // this whole channel exists to surface, must lead the delta.
    const changed = {
      partsAdded: [],
      partsRemoved: [],
      partsMoved: [{ part: "prp_cliff", delta: [1, 0, 0] as [number, number, number], distance: 1 }],
      partsResized: [],
      issuesAppeared: [{ code: "S3D-W-325", target: "prp_path" }],
      issuesResolved: [],
      contactsMade: [],
      contactsBroken: [{ a: "prp_bridge", b: "prp_pillar", before: 0, after: null }],
      materialsChanged: [],
      animationChanged: [],
      unchanged: false,
    };
    const text = renderAgentReport(result({ impact: changed }));
    expect(text).toContain("delta (since previous compile):");
    expect(text).toContain("contact BROKEN: prp_bridge ↔ prp_pillar");
    expect(text).toContain("issue APPEARED: S3D-W-325 on prp_path");
    // Consequence before mechanics: the broken support outranks the move.
    expect(text.indexOf("contact BROKEN")).toBeLessThan(text.indexOf("moved: prp_cliff"));
  });

  it("compresses the solve delta to counts and spends its lines on residuals", () => {
    // The codec pass: authored edits and graph-predicted moves are one
    // count line; only a change nothing authored explains earns detail.
    const impact = {
      partsAdded: [], partsRemoved: [],
      partsMoved: [{ part: "prp_lid", delta: [0, 0, 0.1] as [number, number, number], distance: 0.1 }],
      partsResized: [], issuesAppeared: [], issuesResolved: [],
      contactsMade: [], contactsBroken: [],
      materialsChanged: [], animationChanged: [], unchanged: false,
    };
    const text = renderAgentReport(
      result({
        impact,
        solveDelta: {
          authored: ["prp_post_nw", "prp_post_ne"],
          added: [], removed: [],
          propagated: ["prp_lid"],
          residuals: [{ id: "prp_slat", kind: "support", from: "prp_base", to: "prp_post_nw" }],
          steady: 2,
        },
      }),
    );
    expect(text).toContain("solve: 2 authored · 1 moved with them (2 steady)");
    expect(text).toContain(
      "residual: prp_slat now rests on prp_post_nw (was prp_base) — no authored cause",
    );
    // An empty delta earns no line at all — silence is the compressed form.
    const quiet = renderAgentReport(
      result({
        impact,
        solveDelta: { authored: [], added: [], removed: [], propagated: [], residuals: [], steady: 5 },
      }),
    );
    expect(quiet).not.toContain("solve:");
    expect(quiet).not.toContain("residual:");
  });

  it("renders a residual even when the census reads as unchanged", () => {
    // "Unchanged" is a census verdict; a support switch moves no vertex,
    // and a census-less fast-gear run compares two undefined censuses.
    // The unchanged early-return used to swallow the residual on both
    // paths — the exact signal the codec module exists to surface.
    const unchanged = {
      partsAdded: [], partsRemoved: [], partsMoved: [], partsResized: [],
      issuesAppeared: [], issuesResolved: [], contactsMade: [], contactsBroken: [],
      materialsChanged: [], animationChanged: [], unchanged: true,
    };
    const text = renderAgentReport(
      result({
        impact: unchanged,
        solveDelta: {
          authored: [], added: [], removed: [], propagated: [],
          residuals: [{ id: "prp_slat", kind: "support", from: "prp_a", to: "prp_b" }],
          steady: 4,
        },
      }),
    );
    expect(text).toContain("delta: unchanged since previous compile");
    expect(text).toContain("residual: prp_slat now rests on prp_b (was prp_a) — no authored cause");
  });

  it("says 'no build to compare' when the compile measured nothing, keeping the issue delta", () => {
    // The delta an agent leans on hardest in an iterative loop must not
    // fabricate a catastrophe entering a failure or claim 'unchanged'
    // inside one — a census-less compile has exactly one honest diff: the
    // issues that stopped it.
    const noBuild = {
      partsAdded: [], partsRemoved: [], partsMoved: [], partsResized: [],
      issuesAppeared: [{ code: "S3D-E-105", target: "prp_a" }],
      issuesResolved: [],
      contactsMade: [], contactsBroken: [],
      materialsChanged: [], animationChanged: [],
      unchanged: false, noBuild: true,
    };
    const text = renderAgentReport(result({ impact: noBuild }));
    expect(text).toContain(
      "delta: no build to compare — this compile produced no measurements; baseline kept from the last successful build",
    );
    expect(text).toContain("issue APPEARED: S3D-E-105 on prp_a");
    expect(text).not.toContain("contact BROKEN");
    expect(text).not.toContain("unchanged since previous compile");
  });

  it("gives the frame set as an addressable pattern, not one path", () => {
    /* Naming ONE path and a count left the reader to infer a hash-bearing
       filename it had never been shown, so reaching frame 3 began with a
       guess and an ENOENT. The pattern plus the index range is addressable
       and still costs one line — the frames are not enumerated. */
    const text = renderAgentReport(
      result({
        proofImages: [
          ".scene3d/proof/proof-abc-000.png",
          ".scene3d/proof/proof-abc-001.png",
          ".scene3d/proof/proof-abc-002.png",
        ],
        exportedAssets: [".scene3d/work/scene.usda", ".scene3d/work/scene.glb"],
      }),
    );
    expect(text).toContain("proof: 3 frame(s) — .scene3d/proof/proof-abc-NNN.png, N = 000..002");
    expect(text).not.toContain("proof-abc-001.png");
    expect(text).toContain("assets: .scene3d/work/scene.usda, .scene3d/work/scene.glb");
  });

  it("maps every frame to the side it photographs, and says where 0° is", () => {
    /* The orientation half of the report. Without it a serial-numbered
       frame set says nothing about which side it shows, so every finding
       about "one side" is a finding about an unidentified side and no
       follow-up edit can be aimed. */
    const base = result({
      proofImages: ["p/f-000.png", "p/f-001.png", "p/f-002.png", "p/f-003.png"],
    });
    const text = renderAgentReport({
      ...base,
      manifest: {
        ...base.manifest,
        proofViews: [
          { index: 0, azimuthDeg: 0, elevationDeg: 30, name: "front" },
          { index: 1, azimuthDeg: 90, elevationDeg: 30, name: "right" },
          { index: 2, azimuthDeg: 180, elevationDeg: 30, name: "back" },
          { index: 3, azimuthDeg: 270, elevationDeg: 30, name: "left" },
        ],
        contactSheet: {
          path: "out/contact.png",
          legend: [{ badge: 1, part: "prp_lid" }],
          neverVisible: ["prp_core"],
        },
      },
    });
    expect(text).toContain("orbit: [0] front 0° · [1] right 90° · [2] back 180° · [3] left 270°");
    expect(text).toContain("azimuth 0° = front = camera on -Y");
    expect(text).toContain("contact sheet: out/contact.png");
    expect(text).toContain("badges: 1=prp_lid");
    // A part no angle shows is a fact about the scene, reported not dropped.
    expect(text).toContain("never visible: prp_core");
  });

  it("claims no compass name when the camera pose was never measured", () => {
    // A still through an authored camera has no derivable azimuth. Absent
    // beats wrong: labelling it `front` would mislead precisely where the
    // reader has no other way to check.
    const text = renderAgentReport(result({ proofImages: ["p/f-000.png"] }));
    expect(text).toContain("proof: 1 frame(s)");
    expect(text).not.toContain("orbit:");
    expect(text).not.toContain("azimuth 0°");
  });

  it("surfaces the user's viewport edits so the agent sees human intent", () => {
    // The co-studio loop: a human drags a part or restyles a material in
    // the kit viewer; the compile replays tweaks.json silently. Without
    // this section the agent keeps reasoning about a scene the user has
    // visibly changed — the report is where the two lanes meet.
    const source = { kind: "bpy" as const, files: ["build.py"] };
    const summary = { errors: 0, warnings: 0, infos: 0 };
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary,
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          bakedTweaks: {
            prp_lid: { translate: [0, 0.25, 0] },
            prp_fox: {
              material: { assign: "mtl_gold", roughness: 0.2, emissionStrength: 3 },
            },
          },
        }),
      }),
    );
    expect(text).toContain("user edits (tweaks.json, baked into this build):");
    expect(text).toContain("prp_lid: moved [0, 0.25, 0]");
    expect(text).toContain(
      "prp_fox: material assign=mtl_gold emissionStrength=3 roughness=0.2",
    );
    // The agent is told what the file MEANS, not just what it holds.
    expect(text).toContain("fold them in");
  });

  it("stays silent about tweaks when there are none — no empty sections", () => {
    const text = renderAgentReport(result());
    expect(text).not.toContain("user edits");
  });

  it("reports what the proof frames measured, even when no rule complained", () => {
    // The numbers used to reach the linter alone, so an author with no
    // image input could only infer "did my render work" from the absence
    // of complaints. The line exists precisely for the clean case.
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: ["out/proof/proof-000.png", "out/proof/proof-001.png"],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          proofFrames: [
            { path: "a.png", meanLuminance: 0.4, coverage: 0.3, blownRatio: 0 },
            { path: "b.png", meanLuminance: 0.2, coverage: 0.5, blownRatio: 0.1 },
          ],
        }),
        proofImages: ["out/proof/proof-000.png", "out/proof/proof-001.png"],
      }),
    );
    // Means over the frames, not the raw values of either one.
    expect(text).toContain("frames: 2 · subject 40% of frame · lum 0.30 · clipped 5.0%");
    expect(text).not.toContain("empty");
  });

  it("counts empty frames in the measured line instead of hiding them", () => {
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: ["out/proof/proof-000.png"],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          proofFrames: [
            { path: "a.png", meanLuminance: 0.4, coverage: 0.3, blownRatio: 0 },
            { path: "b.png", meanLuminance: 0, coverage: 0, blownRatio: 0 },
          ],
        }),
      }),
    );
    expect(text).toContain("· 1 empty");
  });

  it("stays silent about frames when the proof stage did not run", () => {
    const text = renderAgentReport(result());
    expect(text).not.toContain("frames:");
  });

  it("names isolated parts in a contact line, arithmetic without verdict", () => {
    // Floating is legitimate composition; the compiler has no standing to
    // call it wrong. But an author who cannot see the render has no other
    // way to learn their scene came out as islands.
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          census: censusWith(["prp_base", "prp_crate", "prp_orb"], [["prp_base", "prp_crate"]]),
        }),
      }),
    );
    expect(text).toContain(
      "contact: 2 part(s) touch another, 1 touch nothing — prp_orb",
    );
    // Arithmetic, not a finding: it must not appear among the issues.
    expect(text).not.toMatch(/S3D-\S-\d+.*touch nothing/);
  });

  it("summarises more isolated parts than it names with a +N tail", () => {
    const names = Array.from({ length: 14 }, (_, i) => `part_${i}`);
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          census: censusWith(names),
        }),
      }),
    );
    expect(text).toContain("contact: 0 part(s) touch another, 14 touch nothing");
    // The manifest caps its name list at 12; the report renders all of
    // them plus the true-count tail.
    expect(text).toMatch(
      /part_0, part_1, part_10, part_11, part_12, part_13, part_2.* \+2 more/,
    );
  });

  it("states the healthy contact case instead of implying it by silence", () => {
    // Absence-means-good was an unstated convention a field reader spent a
    // compile second-guessing ("did contacts fail to run?"); one short line
    // states it.
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          census: censusWith(["a", "b"], [["a", "b"]]),
        }),
      }),
    );
    expect(text).toContain("contact: all 2 part(s) touch another");
  });

  /* ---- the solved table: the parse loop's eyes ---------------------- */

  it("prints the solved boxes so a parse-only compile shows where parts land (H5)", () => {
    const text = renderAgentReport(
      result({
        solved: {
          parts: [
            {
              id: "prp_plinth",
              size: [3, 1, 0.1],
              center: [0, 0, 0.05],
              shape: "box",
              axis: "z",
              flip: false,
            },
            {
              id: "prp_column_2",
              size: [0.2, 0.2, 1.5],
              center: [1.2, 0, 0.85],
              shape: "cylinder",
              axis: "z",
              flip: false,
              from: "prp_column",
              restsOn: "prp_plinth",
            },
            {
              id: "prp_auger",
              size: [0.3, 0.3, 0.6],
              center: [0, 0.8, 0.3],
              shape: "box",
              axis: "z",
              flip: false,
              screw: { axis: "z", seconds: 4, rise: 0.25 },
            },
          ],
          diagnostics: [],
        },
      }),
    );
    expect(text).toContain("solved boxes (id · centre · world box · rests on):");
    expect(text).toContain("prp_plinth: (0mm, 0mm, 50mm) · 3m × 1m × 0.1m");
    // Provenance to the authored part and the resting fact ride the row —
    // this is what lets an agent audit placement without running Blender.
    expect(text).toContain("prp_column_2 (from prp_column)");
    expect(text).toContain("rests on prp_plinth");
    // A mover's row reserves its whole cycle: the asymmetric screwing box
    // grows its corner circle AND advances a quarter metre per turn.
    expect(text).toContain("prp_auger");
    expect(text).toMatch(/prp_auger.*sweeps ⌀.*z\+0\.25m\/turn/);
  });

  it("caps the solved table instead of flooding a 500-part scene", () => {
    const parts = Array.from({ length: 60 }, (_, i) => ({
      id: `prp_p${i}`,
      size: [1, 1, 1] as [number, number, number],
      center: [0, 0, 0.5] as [number, number, number],
      shape: "box" as const,
      axis: "z" as const,
      flip: false,
    }));
    const text = renderAgentReport(result({ solved: { parts, diagnostics: [] } }));
    expect(text).toContain("… +20 more parts");
  });

  it("renders exactly CAP rows at the boundary — no phantom fold-away line", () => {
    // The off-by-one that matters: at exactly 40 parts nothing is folded
    // away, so a "+0 more parts" row would be a lie about truncation. The
    // cap line only appears when something was actually dropped.
    const parts = Array.from({ length: 40 }, (_, i) => ({
      id: `prp_p${i}`,
      size: [1, 1, 1] as [number, number, number],
      center: [0, 0, 0.5] as [number, number, number],
      shape: "box" as const,
      axis: "z" as const,
      flip: false,
    }));
    const text = renderAgentReport(result({ solved: { parts, diagnostics: [] } }));
    expect(text).toContain("prp_p39"); // the last row IS rendered
    expect(text).not.toContain("more parts");
  });

  it("caps at exactly CAP+1 with a single folded row", () => {
    // One past the cap: the 41st part is dropped and counted, not silently
    // truncated — the reader must be able to trust "40 shown + 1 more".
    const parts = Array.from({ length: 41 }, (_, i) => ({
      id: `prp_p${i}`,
      size: [1, 1, 1] as [number, number, number],
      center: [0, 0, 0.5] as [number, number, number],
      shape: "box" as const,
      axis: "z" as const,
      flip: false,
    }));
    const text = renderAgentReport(result({ solved: { parts, diagnostics: [] } }));
    expect(text).toContain("prp_p39");
    expect(text).not.toContain("prp_p40:");
    expect(text).toContain("… +1 more parts");
  });

  it("names a static rotation on the row, so the world box is explicable", () => {
    // The size column is the WORLD box — the rotated bound — so without the
    // rotation named, a 15-degree sign board reads as a part nobody wrote.
    const text = renderAgentReport(
      result({
        solved: {
          parts: [
            {
              id: "prp_sign",
              size: [0.483, 0.276, 0.02],
              localSize: [0.4, 0.2, 0.02],
              rotate: { axis: "z", deg: 30 },
              center: [0, 0, 1],
              shape: "box",
              axis: "z",
              flip: false,
            },
          ],
          diagnostics: [],
        },
      }),
    );
    expect(text).toContain("· rot z 30°");
  });

  it("omits the solved table when there is no solve (non-spec sources)", () => {
    const text = renderAgentReport(result());
    expect(text).not.toContain("solved boxes");
  });

  /* ---- asset kind, claims ledger, and loud success ------------------ */

  it("names the derived asset kind on its own line, right after source", () => {
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          // One mesh root, no camera, no keyframes -> derives to "prop".
          census: censusWith(["prp_orb"]),
        }),
      }),
    );
    expect(text).toContain("asset: prop");
    expect(text.indexOf("asset: prop")).toBeGreaterThan(text.indexOf("source:"));
  });

  it("prints the claims ledger, holding and failing", () => {
    const held = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          claimsDeclared: 6,
        }),
      }),
    );
    expect(held).toContain("claims: 6/6 held");

    const failedIssues: Issue[] = [
      { code: "S3D-E-701", severity: "error", message: "claim failed", detail: { claim: "a" } },
      { code: "S3D-E-701", severity: "error", message: "claim failed", detail: { claim: "b" } },
    ];
    const summary = {
      errors: failedIssues.length,
      warnings: 0,
      infos: 0,
    };
    const failing = renderAgentReport(
      result({
        issues: failedIssues,
        manifest: buildManifest({
          source,
          issues: failedIssues,
          summary,
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          claimsDeclared: 6,
        }),
      }),
    );
    expect(failing).toContain("claims: 4/6 held — 2 failed (S3D-E-701 below)");
  });

  it("stays silent about claims when the spec declared none", () => {
    const text = renderAgentReport(result());
    expect(text).not.toContain("claims:");
  });

  it("keeps summary and headroom on a clean pass instead of going silent", () => {
    const text = renderAgentReport(
      result({
        manifest: buildManifest({
          source,
          issues: [],
          summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: true,
          blenderVersion: "5.0.1",
          census: censusWith(["a", "b"], [["a", "b"]]),
        }),
      }),
    );
    expect(text).toContain("summary: pass");
    expect(text).toContain("built:");
    expect(text).toContain("tris");
  });

  /* ---- carried-proof label ------------------------------------------- */

  it("labels frames carried from a previous compile when the proof stage did not run this time", () => {
    const text = renderAgentReport(
      result({
        proofImages: [".scene3d/proof/proof-abc-000.png"],
        stages: [
          { id: "parse", status: "ran", durationMs: 2 },
          { id: "build", status: "cached", durationMs: 0 },
        ],
      }),
    );
    expect(text).toContain("proof: STALE");
    expect(text).toContain("PREVIOUS compile");
    // The derived facts are withheld, not merely footnoted: they describe the
    // scene as it was when those frames were made.
    expect(text).not.toContain("orbit:");
    expect(text).not.toContain("contact sheet:");
  });

  it("also labels frames carried when the proof stage is present but skipped", () => {
    const text = renderAgentReport(
      result({
        proofImages: [".scene3d/proof/proof-abc-000.png"],
        stages: [
          { id: "parse", status: "ran", durationMs: 2 },
          { id: "proof", status: "skipped", durationMs: 0 },
        ],
      }),
    );
    expect(text).toContain("proof: STALE");
    expect(text).not.toContain("orbit:");
  });

  it("does not call frames carried when the proof stage actually ran or hit cache", () => {
    const ran = renderAgentReport(
      result({
        proofImages: [".scene3d/proof/proof-abc-000.png"],
        stages: [
          { id: "parse", status: "ran", durationMs: 2 },
          { id: "proof", status: "ran", durationMs: 5 },
        ],
      }),
    );
    expect(ran).not.toContain("carried from a previous compile");

    const cached = renderAgentReport(
      result({
        proofImages: [".scene3d/proof/proof-abc-000.png"],
        stages: [
          { id: "parse", status: "ran", durationMs: 2 },
          { id: "proof", status: "cached", durationMs: 0 },
        ],
      }),
    );
    expect(cached).not.toContain("carried from a previous compile");
  });

  /* ---- the digest pointer -------------------------------------------- */

  it("points to the digest once the manifest stage has actually run", () => {
    // Every read: line is gated on the file EXISTING this compile — a
    // block that can name an absent file teaches the reader to stop
    // following it. No census here, so no ortho; no frames, so no player.
    const text = renderAgentReport(
      result({
        stages: [
          { id: "parse", status: "ran", durationMs: 2 },
          { id: "manifest", status: "ran", durationMs: 1 },
        ],
      }),
    );
    expect(text).toContain("read:");
    expect(text).toContain("out/digest.md");
    expect(text).toContain("out/read-model.json");
    expect(text).not.toContain("out/ortho.svg");
    expect(text).not.toContain("out/index.html");
  });

  it("names ortho and the frame player only when this compile produced them", () => {
    const text = renderAgentReport(
      result({
        stages: [
          { id: "parse", status: "ran", durationMs: 2 },
          { id: "proof", status: "ran", durationMs: 3 },
          { id: "manifest", status: "ran", durationMs: 1 },
        ],
        census: censusWith(["prp_a"]),
        proofImages: ["out/proof/proof-abc-000.png"],
      }),
    );
    expect(text).toContain("out/ortho.txt — plan/front/side as ASCII box-art");
    expect(text).toContain("out/ortho.svg — the same three elevations");
    expect(text).toContain("out/index.html (frame player)");
  });

  it("stays silent about the digest pointer when the manifest stage did not run", () => {
    const text = renderAgentReport(result());
    expect(text).not.toContain("read:");
  });

  /* ---- issueTitle injection ------------------------------------------- */

  it("names an issue code with its title in the fix-first line when issueTitle is supplied", () => {
    const issues: Issue[] = [
      {
        code: "S3D-E-324",
        severity: "error",
        message: "coplanar overlap between 'a' and 'b' (6 face pair(s))",
        target: "a <-> b",
      },
    ];
    const issueTitle = (code: string) => (code === "S3D-E-324" ? "Z-fighting overlap" : undefined);
    const text = renderAgentReport(result({ issues }), { issueTitle });
    expect(text).toContain("1. S3D-E-324 (Z-fighting overlap)");
    // The per-severity sections carry the title too — the fix-first line is
    // a curation of the same lines, not the only place the catalog shows.
    expect(text).toContain("errors:\n  S3D-E-324 (Z-fighting overlap) [a <-> b]");
  });

  it("renders the bare code when issueTitle is absent or returns nothing", () => {
    const issues: Issue[] = [
      {
        code: "S3D-E-324",
        severity: "error",
        message: "coplanar overlap between 'a' and 'b' (6 face pair(s))",
        target: "a <-> b",
      },
    ];
    const withoutOption = renderAgentReport(result({ issues }));
    expect(withoutOption).toContain("errors:\n  S3D-E-324 [a <-> b]");
    expect(withoutOption).toContain("1. S3D-E-324 ");
    expect(withoutOption).not.toContain("S3D-E-324 (");

    const unresolvedTitle = renderAgentReport(result({ issues }), { issueTitle: () => undefined });
    expect(unresolvedTitle).not.toContain("S3D-E-324 (");
  });

  /* ---- ascii frame sampling: evenly around the orbit, not the first N -- */

  it("samples ascii frames evenly around the orbit rather than the first N", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-report-frames-"));
    const relPaths: string[] = [];
    for (let i = 0; i < 8; i++) {
      const rel = `proof-${String(i).padStart(3, "0")}.png`;
      const png = encodePng({
        width: 4,
        height: 4,
        data: new Uint8Array(4 * 4 * 4).fill(255),
      });
      fs.writeFileSync(path.join(dir, rel), png);
      relPaths.push(rel);
    }
    const text = renderAgentReport(
      result({ proofImages: relPaths }),
      { projectDir: dir, alwaysShowFrames: true },
    );
    // 8 frames, MAX_ASCII_FRAMES=4 shown -> indices 0,2,4,6, not 0,1,2,3.
    expect(text).toContain("proof-000.png");
    expect(text).toContain("proof-002.png");
    expect(text).toContain("proof-004.png");
    expect(text).toContain("proof-006.png");
    expect(text).not.toContain("proof-001.png");
    expect(text).not.toContain("proof-003.png");
    expect(text).not.toContain("proof-005.png");
    expect(text).not.toContain("proof-007.png");

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

/**
 * Terminal guidance: one forward-pointing line, matched to where the loop
 * actually stands, and NEVER advice that is wrong for the state (the
 * skipped-proof-without-Blender case shipped exactly that once).
 */
describe("terminal guidance", () => {
  it("points at the proofs and ortho when the compile photographed the scene", () => {
    const text = renderAgentReport(
      result({
        stages: [
          { id: "parse", status: "ran", durationMs: 1 },
          { id: "proof", status: "ran", durationMs: 1 },
        ],
      }),
    );
    expect(text).toContain("next: before calling it done, walk one proof frame and out/ortho.svg");
  });

  it("points at a full compile after a restricted pass — without naming any flag", () => {
    const text = renderAgentReport(
      result({
        stages: [
          { id: "parse", status: "ran", durationMs: 1 },
          { id: "build", status: "ran", durationMs: 1 },
        ],
        manifest: buildManifest({
          source, issues: [], summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [], exportedAssets: [], blenderUsed: true, blenderVersion: "5.0.1",
        }),
      }),
    );
    expect(text).toContain("next: structure settled? run a full compile");
    expect(text).not.toContain("--fast");
  });

  it("gives no full-compile advice when Blender itself was absent", () => {
    const text = renderAgentReport(
      result({
        stages: [
          { id: "parse", status: "ran", durationMs: 1 },
          { id: "proof", status: "skipped", durationMs: 0 },
        ],
        manifest: buildManifest({
          source, issues: [], summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [], exportedAssets: [], blenderUsed: false, blenderVersion: null,
        }),
      }),
    );
    expect(text).not.toContain("next: structure settled?");
  });

  it("nudges a claimless spec toward claims exactly once, and only a spec", () => {
    const specSource = { kind: "spec" as const, files: ["scene.json"] };
    const claimless = renderAgentReport(
      result({
        source: specSource,
        manifest: buildManifest({
          source: specSource, issues: [], summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [], exportedAssets: [], blenderUsed: true, blenderVersion: "5.0.1",
        }),
      }),
    );
    expect(claimless).toContain("tip: this spec declares no claims");

    const claimed = renderAgentReport(
      result({
        source: specSource,
        manifest: buildManifest({
          source: specSource, issues: [], summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [], exportedAssets: [], blenderUsed: true, blenderVersion: "5.0.1",
          claimsDeclared: 3,
        }),
      }),
    );
    expect(claimed).not.toContain("tip: this spec declares no claims");
    // And a bpy scene is never nudged: claims are spec vocabulary.
    expect(renderAgentReport(result())).not.toContain("tip: this spec declares no claims");
  });
});

  it("still offers the full-compile step after a parse-only pass with no Blender involved", () => {
    // A parse-only look at the solved boxes never probes Blender, so
    // blender.used is false — but "run a full compile" is exactly the next
    // step there. Suppression is only for a WANTED Blender stage that had
    // no runtime to run on.
    const text = renderAgentReport(
      result({
        stages: [{ id: "parse", status: "ran", durationMs: 1 }],
        manifest: buildManifest({
          source, issues: [], summary: { errors: 0, warnings: 0, infos: 0 },
          proofImages: [], exportedAssets: [], blenderUsed: false, blenderVersion: null,
        }),
      }),
    );
    expect(text).toContain("next: structure settled? run a full compile");
  });

describe("field-audit report honesty", () => {
  it("marks a demoted code visibly so the letter never contradicts the severity", () => {
    const text = renderAgentReport(
      result({
        issues: [
          {
            code: "S3D-E-321",
            severity: "info",
            message: "mesh 'prp_fox' has 1728 non-manifold edge(s)",
            target: "prp_fox",
          },
        ],
      }),
    );
    expect(text).toContain("S3D-E-321→info");
    // A grep for lines that READ as errors finds none on this clean compile.
    expect(text).not.toMatch(/S3D-E-321 \[/);
  });

  it("reports an unadjudicated ledger as checked-count, never as held", () => {
    const issues: Issue[] = [
      {
        code: "S3D-W-701",
        severity: "warning",
        message: "claim parts could not be adjudicated: no census — unchecked is not passed",
        detail: { claim: "parts", unadjudicated: true },
      },
      {
        code: "S3D-W-701",
        severity: "warning",
        message: "claim grounded could not be adjudicated: no census — unchecked is not passed",
        detail: { claim: "grounded", unadjudicated: true },
      },
    ];
    const text = renderAgentReport(
      result({
        issues,
        manifest: buildManifest({
          source,
          issues,
          summary: { errors: 0, warnings: 2, infos: 0 },
          proofImages: [],
          exportedAssets: [],
          blenderUsed: false,
          blenderVersion: null,
          claimsDeclared: 2,
        }),
      }),
    );
    expect(text).toContain("claims: 0/2 checked");
    expect(text).not.toContain("2/2 held");
  });
});
