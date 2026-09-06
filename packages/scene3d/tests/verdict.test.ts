import { describe, expect, it } from "vitest";
import { assessVerdict, dimensionOf, summariseKit } from "../src/verdict.js";
import { CompileResult, Issue } from "../src/types.js";

function result(issues: Issue[], extra: Partial<CompileResult> = {}): CompileResult {
  return {
    ok: !issues.some((i) => i.severity === "error"),
    source: { kind: "spec", files: ["scene.json"] },
    stages: [],
    issues,
    manifest: { metrics: { totalTriangles: 45231 } } as CompileResult["manifest"],
    proofImages: [],
    exportedAssets: [],
    summary: {
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      infos: issues.filter((i) => i.severity === "info").length,
    },
    ...extra,
  } as CompileResult;
}

const issue = (code: string, severity: Issue["severity"], extra: Partial<Issue> = {}): Issue => ({
  code,
  severity,
  message: `${code} happened`,
  ...extra,
});

describe("assessVerdict", () => {
  it("grades fail on any error, attention on any warning, else pass", () => {
    expect(assessVerdict(result([])).grade).toBe("pass");
    expect(assessVerdict(result([issue("S3D-W-951", "warning")])).grade).toBe("attention");
    expect(assessVerdict(result([issue("S3D-E-321", "error")])).grade).toBe("fail");
  });

  it("ranks errors before warnings, then warnings by measured overrun", () => {
    const v = assessVerdict(
      result([
        issue("S3D-W-951", "warning", { target: "prp_a", detail: { overrun: 0.2 } }),
        issue("S3D-W-953", "warning", { target: "prp_b", detail: { overrun: 3.0 } }),
        issue("S3D-E-321", "error", { target: "prp_c" }),
      ]),
    );
    expect(v.actions.map((a) => a.code)).toEqual(["S3D-E-321", "S3D-W-953", "S3D-W-951"]);
  });

  it("collapses repeated codes into one action with a count", () => {
    const v = assessVerdict(
      result([
        issue("S3D-W-442", "warning", { target: "prp_a" }),
        issue("S3D-W-442", "warning", { target: "prp_b" }),
        issue("S3D-W-442", "warning", { target: "prp_c" }),
      ]),
    );
    const flipped = v.actions.find((a) => a.code === "S3D-W-442");
    expect(flipped?.count).toBe(3);
  });

  it("reports honest headroom facts (tris + texture VRAM)", () => {
    const v = assessVerdict(
      result([], {
        census: {
          textures: [
            { name: "t1", filepath: "", colorSpace: "sRGB", width: 1024, height: 1024 },
            { name: "t2", filepath: "", colorSpace: "sRGB", width: 512, height: 512 },
          ],
        } as CompileResult["census"],
      }),
    );
    expect(v.headroom.totalTriangles).toBe(45231);
    // 1024²·4 + 512²·4 = 4,194,304 + 1,048,576
    expect(v.headroom.totalTextureBytes).toBe(1024 * 1024 * 4 + 512 * 512 * 4);
  });

  it("summarises only the failing dimensions, worst-first", () => {
    const v = assessVerdict(
      result([issue("S3D-W-951", "warning"), issue("S3D-E-321", "error")]),
    );
    // geometry (has an error → fail) before intent (warning → attention)
    expect(v.dimensions.map((d) => d.dimension)).toEqual(["geometry", "intent"]);
  });
});

describe("summariseKit (catalog roll-up)", () => {
  it("ranks systemic PROBLEMS from actionable codes, not from notes", () => {
    // Once imported geometry started being reclassified rather than
    // suppressed, findings about a downloaded asset's UVs became visible —
    // correctly — as info. Ranking systemic codes by frequency alone then
    // promoted them to "systemic across the kit", which is exactly the
    // reading the relaxation exists to prevent: a note recurring across a
    // corpus of third-party assets is a fact about the corpus, not work.
    const kit = summariseKit([
      {
        errors: 0,
        warnings: 1,
        issueCodes: ["S3D-W-323", "S3D-W-441", "S3D-W-442"],
        actionableCodes: ["S3D-W-323"],
      },
      {
        errors: 0,
        warnings: 0,
        issueCodes: ["S3D-W-441", "S3D-W-442"],
        actionableCodes: [],
      },
    ]);
    expect(kit.systemic.map((s) => s.code)).toEqual([]);
  });

  it("still reports a genuinely systemic warning", () => {
    const kit = summariseKit([
      { errors: 0, warnings: 1, issueCodes: ["S3D-W-323"], actionableCodes: ["S3D-W-323"] },
      { errors: 0, warnings: 1, issueCodes: ["S3D-W-323"], actionableCodes: ["S3D-W-323"] },
    ]);
    expect(kit.systemic).toEqual([{ code: "S3D-W-323", scenes: 2 }]);
  });

  it("falls back to issueCodes for a manifest written before the distinction", () => {
    const kit = summariseKit([
      { errors: 0, warnings: 1, issueCodes: ["S3D-W-323"] },
      { errors: 0, warnings: 1, issueCodes: ["S3D-W-323"] },
    ]);
    expect(kit.systemic).toEqual([{ code: "S3D-W-323", scenes: 2 }]);
  });

  it("grades the kit as its weakest scene", () => {
    expect(summariseKit([{ errors: 0, warnings: 0, issueCodes: [] }]).grade).toBe("pass");
    expect(
      summariseKit([
        { errors: 0, warnings: 0, issueCodes: [] },
        { errors: 0, warnings: 2, issueCodes: ["S3D-W-441"] },
      ]).grade,
    ).toBe("attention");
    expect(
      summariseKit([
        { errors: 0, warnings: 0, issueCodes: [] },
        { errors: 1, warnings: 0, issueCodes: ["S3D-E-321"] },
      ]).grade,
    ).toBe("fail");
  });

  it("surfaces only codes that recur across scenes, most-widespread first", () => {
    const kit = summariseKit([
      { errors: 1, warnings: 1, issueCodes: ["S3D-E-321", "S3D-W-441"] },
      { errors: 1, warnings: 0, issueCodes: ["S3D-E-321"] },
      { errors: 1, warnings: 1, issueCodes: ["S3D-E-321", "S3D-W-441"] },
      { errors: 0, warnings: 1, issueCodes: ["S3D-W-328"] }, // only once → not systemic
    ]);
    expect(kit.systemic).toEqual([
      { code: "S3D-E-321", scenes: 3 },
      { code: "S3D-W-441", scenes: 2 },
    ]);
  });

  it("counts each code once per scene, not per occurrence", () => {
    // A scene can list a code once in issueCodes; systemic is about SPREAD.
    const kit = summariseKit([
      { errors: 2, warnings: 0, issueCodes: ["S3D-E-321"] },
      { errors: 3, warnings: 0, issueCodes: ["S3D-E-321"] },
    ]);
    expect(kit.systemic).toEqual([{ code: "S3D-E-321", scenes: 2 }]);
  });
});

describe("dimensionOf", () => {
  it("maps code ranges to concerns", () => {
    expect(dimensionOf("S3D-E-321")).toBe("geometry");
    expect(dimensionOf("S3D-E-341")).toBe("materials");
    expect(dimensionOf("S3D-W-441")).toBe("uv");
    expect(dimensionOf("S3D-W-951")).toBe("intent");
    expect(dimensionOf("S3D-E-701")).toBe("claims");
    expect(dimensionOf("S3D-E-501")).toBe("conformance");
  });
});

describe("assessVerdict hardening (bug-shaker round)", () => {
  it("keeps an error's action at error severity even when a warning carries the bigger overrun", () => {
    // Red before the fix: the max-overrun member became the representative
    // regardless of severity, so the one BLOCKING finding sorted below
    // every warning and the action list read as advisory.
    const v = assessVerdict(
      result([
        issue("S3D-E-326", "error", { message: "mesh over budget", target: "prp_big" }),
        issue("S3D-E-326", "warning", { message: "scene near budget", detail: { overrun: 5.63 } }),
      ]),
    );
    const action = v.actions.find((a) => a.code === "S3D-E-326")!;
    expect(action.severity).toBe("error");
    expect(action.message).toBe("mesh over budget");
    // The magnitude tag comes from the SAME tier as the sentence — a
    // warning's +563% must not decorate the error's message.
    expect(action.overrun).toBeUndefined();
  });

  it("survives a malformed string origin instead of throwing the whole verdict away", () => {
    const v = assessVerdict(
      result([
        issue("S3D-W-325", "warning", {
          file: "scene.json",
          detail: { origin: "scene.json:41" as never },
        }),
      ]),
    );
    expect(v.grade).toBe("attention");
    expect(v.actions[0]!.origin).toBe("scene.json");
  });

  it("never summarises a result that claims failure as pass", () => {
    // ok and the error count agree at the one real construction site; this
    // exported API must hold the invariant for callers that do not.
    const v = assessVerdict(result([], { ok: false }));
    expect(v.grade).toBe("fail");
  });
});
