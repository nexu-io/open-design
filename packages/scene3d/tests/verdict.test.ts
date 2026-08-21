import { describe, expect, it } from "vitest";
import { assessVerdict, dimensionOf } from "../src/verdict.js";
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
