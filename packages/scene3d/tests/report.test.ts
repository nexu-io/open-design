import { describe, expect, it } from "vitest";
import { renderAgentReport } from "../src/report.js";
import { buildManifest } from "../src/manifest.js";
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
    expect(text).toContain("verdict: fix every error above, then compile again.");
  });

  it("reports warnings as advisory when the compile still passes", () => {
    const text = renderAgentReport(
      result({
        issues: [{ code: "S3D-W-381", severity: "warning", message: "scene has no lights" }],
      }),
    );
    expect(text).toContain("verdict: compiles clean; warnings above are advisory.");
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
      stages: [
        { id: "parse", status: "ran", durationMs: 9999 },
        { id: "build", status: "cached", durationMs: 12345 },
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
      unchanged: false,
    };
    const text = renderAgentReport(result({ impact: changed }));
    expect(text).toContain("delta (since previous compile):");
    expect(text).toContain("contact BROKEN: prp_bridge ↔ prp_pillar");
    expect(text).toContain("issue APPEARED: S3D-W-325 on prp_path");
    // Consequence before mechanics: the broken support outranks the move.
    expect(text.indexOf("contact BROKEN")).toBeLessThan(text.indexOf("moved: prp_cliff"));
  });

  it("summarises artifacts without dumping every proof frame path", () => {
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
    expect(text).toContain("proof: 3 frame(s) — .scene3d/proof/proof-abc-000.png");
    expect(text).not.toContain("proof-abc-001.png");
    expect(text).toContain("assets: .scene3d/work/scene.usda, .scene3d/work/scene.glb");
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

  it("says nothing about contact when every part touches something", () => {
    // A healthy scene gains no chrome — same discipline as the kit banner.
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
    expect(text).not.toContain("contact:");
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
          ],
          diagnostics: [],
        },
      }),
    );
    expect(text).toContain("solved boxes (id · centre · size · rests on):");
    expect(text).toContain("prp_plinth: (0mm, 0mm, 50mm) · 3m × 1m × 0.1m");
    // Provenance to the authored part and the resting fact ride the row —
    // this is what lets an agent audit placement without running Blender.
    expect(text).toContain("prp_column_2 (from prp_column)");
    expect(text).toContain("rests on prp_plinth");
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

  it("omits the solved table when there is no solve (non-spec sources)", () => {
    const text = renderAgentReport(result());
    expect(text).not.toContain("solved boxes");
  });
});
