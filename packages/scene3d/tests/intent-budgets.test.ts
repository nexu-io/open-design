import { describe, expect, it } from "vitest";
import { lintIntent } from "../src/lint/judge.js";
import { resolveBudgets } from "../src/lint/budgets.js";
import { normalizeContract } from "../src/contract.js";
import { ISSUE_CODES } from "../src/errors.js";
import { Census, CensusMesh, Issue } from "../src/types.js";
import type { SolvedPart, SolvedScene } from "../src/solve/types.js";

function part(id: string, extra: Partial<SolvedPart> = {}): SolvedPart {
  return { id, size: [1, 1, 1], center: [0, 0, 0], shape: "box", axis: "z", flip: false, ...extra };
}
function scene(...parts: SolvedPart[]): SolvedScene {
  return { parts, diagnostics: [] };
}
function mesh(object: string, m: Partial<CensusMesh> = {}): CensusMesh {
  return {
    object,
    verts: 8,
    faces: 6,
    tris: 12,
    ngons: 0,
    nonManifoldEdges: 0,
    zeroAreaFaces: 0,
    nan: false,
    uvLayers: ["UVMap"],
    ...m,
  };
}
function census(meshes: CensusMesh[], extra: Partial<Census> = {}): Census {
  return {
    blenderVersion: "5.0.1",
    sceneName: "Scene",
    objects: [],
    meshes,
    materials: [],
    textures: [],
    uvObjectsWithoutLayers: [],
    objectsWithoutMaterial: [],
    zFightingPairs: [],
    camera: { present: true, name: "cam" },
    lightCount: 1,
    animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
    offCameraObjects: [],
    ...extra,
  };
}
function run(c: Census, s: SolvedScene, contract = normalizeContract()): Issue[] {
  const issues: Issue[] = [];
  lintIntent(c, contract, s, issues);
  return issues;
}

const withSpatial = (object: string, tris: number, maxDim: number, m: Partial<CensusMesh> = {}) =>
  mesh(object, {
    tris,
    spatial: {
      worldMin: [0, 0, 0],
      worldMax: [maxDim, 1, 1],
      size: [maxDim, 1, 1],
      bboxCenter: [maxDim / 2, 0.5, 0.5],
      centroid: [maxDim / 2, 0.5, 0.5],
      groundGap: 0,
    },
    ...m,
  });

describe("lintIntent — inert by default (byte-identical guarantee)", () => {
  it("emits nothing for free-form / unknown roles", () => {
    const s = scene(part("prp_roof", { role: "roof" }), part("prp_post", { role: "post" }));
    expect(run(census([mesh("prp_roof", { tris: 5000 }), mesh("prp_post")]), s)).toEqual([]);
  });

  it("emits nothing when there is no solved scene or no roles at all", () => {
    const s = scene(part("prp_a"), part("prp_b"));
    expect(run(census([mesh("prp_a"), mesh("prp_b")]), s)).toEqual([]);
  });
});

describe("lintIntent — distribution outliers (I-952 size / robust-z)", () => {
  it("flags a gross size outlier as info, sparing the normal parts", () => {
    const s = scene(part("prp_a"), part("prp_b"), part("prp_c"), part("prp_d"), part("prp_giant"));
    const c = census([
      withSpatial("prp_a", 12, 1), withSpatial("prp_b", 12, 1.1), withSpatial("prp_c", 12, 0.9),
      withSpatial("prp_d", 12, 1.05), withSpatial("prp_giant", 12, 100),
    ]);
    const out = run(c, s).filter((i) => i.code === "S3D-I-952");
    expect(out.map((i) => i.target)).toEqual(["prp_giant"]);
    expect(out[0]!.severity).toBe("info"); // a heuristic hint, never a defect
  });

  it("spares a merely-different part when a majority share one size (MAD=0 fallback)", () => {
    // b,c,d identical (MAD among them is 0); a is a bit smaller; giant is the
    // real outlier. The mean-AD fallback must not read `a` as Infinity.
    const s = scene(part("prp_a"), part("prp_b"), part("prp_c"), part("prp_d"), part("prp_giant"));
    const c = census([
      withSpatial("prp_a", 12, 0.5), withSpatial("prp_b", 12, 0.6), withSpatial("prp_c", 12, 0.6),
      withSpatial("prp_d", 12, 0.6), withSpatial("prp_giant", 12, 50),
    ]);
    expect(run(c, s).filter((i) => i.code === "S3D-I-952").map((i) => i.target)).toEqual(["prp_giant"]);
  });

  it("stays silent when the role already declares an explicit sizeRatio", () => {
    const contract = normalizeContract({ schemaVersion: 1, conventions: { budgets: { roles: { hero: { sizeRatio: { max: 200 } } } } } } as never);
    const s = scene(part("prp_a"), part("prp_b"), part("prp_c"), part("prp_giant", { role: "hero" }));
    const c = census([withSpatial("prp_a", 12, 1), withSpatial("prp_b", 12, 1), withSpatial("prp_c", 12, 1), withSpatial("prp_giant", 12, 100)]);
    expect(run(c, s, contract).filter((i) => i.code === "S3D-I-952").map((i) => i.target)).not.toContain("prp_giant");
  });

  it("needs at least three measurable parts to have a distribution", () => {
    const s = scene(part("prp_a"), part("prp_giant"));
    const c = census([withSpatial("prp_a", 12, 1), withSpatial("prp_giant", 12, 100)]);
    expect(run(c, s).filter((i) => i.code === "S3D-I-952")).toEqual([]);
  });
});

describe("lintIntent — relative judgments over the census (W-951/952/953)", () => {
  it("flags a background family that owns more than its triangle share (W-951)", () => {
    // background budget triShare.softMax = 0.15; give it 90% of the tris.
    const s = scene(part("prp_wall", { role: "background" }), part("prp_hero", { role: "hero" }));
    const c = census([mesh("prp_wall", { tris: 90_000 }), mesh("prp_hero", { tris: 10_000 })]);
    const codes = run(c, s).map((i) => i.code);
    expect(codes).toContain(ISSUE_CODES.OVER_ROLE_TRI_SHARE);
  });

  it("flags a hero less detailed than a lower-rank family (W-952), with no absolute number", () => {
    const s = scene(part("prp_hero", { role: "hero" }), part("prp_wall", { role: "background" }));
    // hero (rank 3) has FEWER tris than the background (rank 1).
    const c = census([mesh("prp_hero", { tris: 500 }), mesh("prp_wall", { tris: 50_000 })]);
    const inversion = run(c, s).filter((i) => i.code === ISSUE_CODES.ROLE_RANK_INVERSION);
    expect(inversion).toHaveLength(1);
    expect(inversion[0]!.target).toBe("prp_hero");
  });

  it("does NOT flag rank inversion when the hero is the most detailed", () => {
    const s = scene(part("prp_hero", { role: "hero" }), part("prp_wall", { role: "background" }));
    const c = census([mesh("prp_hero", { tris: 50_000 }), mesh("prp_wall", { tris: 500 })]);
    // (background still over its share, but no inversion.)
    expect(run(c, s).some((i) => i.code === ISSUE_CODES.ROLE_RANK_INVERSION)).toBe(false);
  });

  it("flags a background part over its texture VRAM budget (W-953)", () => {
    // background textureBytes.softMax = 4 MiB; a 2048² RGBA is 16 MiB.
    const s = scene(part("prp_wall", { role: "background" }));
    const c = census([mesh("prp_wall", { materials: ["mtl_wall"] })], {
      materials: [
        {
          name: "mtl_wall",
          usedByObjectCount: 1,
          textureNames: ["tex_big"],
          principled: { present: true, metallic: 0, roughness: 0.5, ior: 1.45, baseColor: [0.8, 0.8, 0.8], hasTexture: true, untouchedDefault: false },
        },
      ],
      textures: [{ name: "tex_big", filepath: "", colorSpace: "sRGB", width: 2048, height: 2048 }],
    });
    expect(run(c, s).some((i) => i.code === ISSUE_CODES.PART_TEXTURE_BUDGET)).toBe(true);
  });
});

describe("lintIntent — sliver triangles by role (W-955)", () => {
  it("flags a hero mesh whose worst triangle is a sliver", () => {
    // hero maxAspectRatio = 20; give it a 50:1 sliver.
    const s = scene(part("prp_hero", { role: "hero" }));
    const c = census([mesh("prp_hero", { worstAspectRatio: 50 })]);
    expect(run(c, s).some((i) => i.code === ISSUE_CODES.SLIVER_TRIANGLES)).toBe(true);
  });

  it("does NOT flag a background mesh (no sliver ceiling for that role)", () => {
    const s = scene(part("prp_wall", { role: "background" }));
    const c = census([mesh("prp_wall", { worstAspectRatio: 500 })]);
    expect(run(c, s).some((i) => i.code === ISSUE_CODES.SLIVER_TRIANGLES)).toBe(false);
  });

  it("does NOT flag a clean hero mesh under the ceiling", () => {
    const s = scene(part("prp_hero", { role: "hero" }));
    const c = census([mesh("prp_hero", { worstAspectRatio: 8 })]);
    expect(run(c, s).some((i) => i.code === ISSUE_CODES.SLIVER_TRIANGLES)).toBe(false);
  });
});

describe("lintIntent — under-textured for role (W-956)", () => {
  const textured = (object: string, mean: number) =>
    mesh(object, { uv: { texelDensity: { min: mean, max: mean, mean } } as CensusMesh["uv"] });

  it("flags a hero textured below its role's texel floor", () => {
    // hero texelDensity.min = 512; render it at 200 px/m.
    const s = scene(part("prp_hero", { role: "hero" }));
    expect(run(census([textured("prp_hero", 200)]), s).some((i) => i.code === ISSUE_CODES.UNDER_ROLE_TEXEL)).toBe(true);
  });

  it("does NOT double-report when the scene texel target already covers it", () => {
    const contract = normalizeContract({
      schemaVersion: 1,
      conventions: { uv: { texelDensity: { target: 512 } } },
    });
    const s = scene(part("prp_hero", { role: "hero" }));
    // Scene target 512 >= role min 512 → uv.ts owns it, the role check suppresses.
    expect(
      run(census([textured("prp_hero", 200)]), s, contract).some((i) => i.code === ISSUE_CODES.UNDER_ROLE_TEXEL),
    ).toBe(false);
  });

  it("does NOT flag an untextured hero (no texel density measured)", () => {
    const s = scene(part("prp_hero", { role: "hero" }));
    expect(run(census([mesh("prp_hero")]), s).some((i) => i.code === ISSUE_CODES.UNDER_ROLE_TEXEL)).toBe(false);
  });
});

describe("lintIntent — size coherence is opt-in (W-954)", () => {
  it("stays silent without a sizeRatio bound, even for an outlier", () => {
    const s = scene(part("prp_big", { role: "prop" }), part("prp_small", { role: "prop" }));
    const c = census([withSpatial("prp_big", 12, 100), withSpatial("prp_small", 12, 1)]);
    expect(run(c, s).some((i) => i.code === ISSUE_CODES.SIZE_INCOHERENT)).toBe(false);
  });

  it("flags an outlier once the contract sets a sizeRatio bound", () => {
    const contract = normalizeContract({
      schemaVersion: 1,
      conventions: { budgets: { roles: { prop: { sizeRatio: { min: 0.1, max: 10 } } } } },
    });
    const s = scene(part("prp_big", { role: "prop" }), part("prp_med", { role: "prop" }), part("prp_small", { role: "prop" }));
    // median maxDim is 1 (prp_med); prp_big is 100× → over max 10.
    const c = census([withSpatial("prp_big", 12, 100), withSpatial("prp_med", 12, 1), withSpatial("prp_small", 12, 1)]);
    const hits = run(c, s, contract).filter((i) => i.code === ISSUE_CODES.SIZE_INCOHERENT);
    expect(hits.map((i) => i.target)).toContain("prp_big");
  });
});

describe("lintIntent — repeat clones do not flood, and overrides compose", () => {
  it("judges a repeat family once, not per instance", () => {
    // A 40-clone fence: base + clones, all role background, family owns all tris.
    const parts = [part("prp_fence", { role: "background" })];
    for (let i = 2; i <= 40; i++) parts.push(part(`prp_fence_${i}`, { role: "background", from: "prp_fence" }));
    const meshes = parts.map((p) => mesh(p.id, { tris: 3000 }));
    // plus a hero so triShare has a denominator that trips the background budget
    parts.push(part("prp_hero", { role: "hero" }));
    meshes.push(mesh("prp_hero", { tris: 1000 }));
    const share = run(census(meshes), scene(...parts)).filter((i) => i.code === ISSUE_CODES.OVER_ROLE_TRI_SHARE);
    // Exactly ONE finding for the whole fence family, targeting the base.
    expect(share).toHaveLength(1);
    expect(share[0]!.target).toBe("prp_fence");
  });

  it("lets a contract override redefine what a role budgets", () => {
    const relaxed = normalizeContract({
      schemaVersion: 1,
      conventions: { budgets: { roles: { background: { triShare: { softMax: 0.99 } } } } },
    });
    const s = scene(part("prp_wall", { role: "background" }), part("prp_hero", { role: "hero" }));
    const c = census([mesh("prp_wall", { tris: 90_000 }), mesh("prp_hero", { tris: 10_000 })]);
    // The relaxed 0.99 share no longer trips at 90%.
    expect(run(c, s, relaxed).some((i) => i.code === ISSUE_CODES.OVER_ROLE_TRI_SHARE)).toBe(false);
  });
});

describe("lintIntent — material realism (W-350 dark metal), no role needed", () => {
  const material = (name: string, p: Partial<Census["materials"][number]["principled"]>) => ({
    name,
    usedByObjectCount: 1,
    principled: {
      present: true,
      metallic: 0,
      roughness: 0.5,
      ior: 1.45,
      baseColor: [0.8, 0.8, 0.8] as [number, number, number],
      hasTexture: false,
      untouchedDefault: false,
      ...p,
    },
  });
  const matScene = (...mats: Census["materials"]) =>
    ({ ...census([mesh("prp_a")]), materials: mats });
  const runMat = (mats: Census["materials"], contract = normalizeContract()) => {
    const issues: Issue[] = [];
    // No solved scene: material realism still runs on any census.
    lintIntent(matScene(...mats), contract, undefined, issues);
    return issues.map((i) => i.code);
  };

  it("flags a near-black, fully-metallic, mirror-smooth material", () => {
    expect(
      runMat([material("mtl_void", { baseColor: [0.01, 0.01, 0.01], metallic: 1, roughness: 0.05 })]),
    ).toContain(ISSUE_CODES.UNREALISTIC_DARK_METAL);
  });

  it("carries no nonsense overrun on a below-a-max failure (would render [+-50%])", () => {
    const issues: Issue[] = [];
    lintIntent(
      matScene(material("mtl_void", { baseColor: [0.01, 0.01, 0.01], metallic: 1, roughness: 0.05 })),
      normalizeContract(),
      undefined,
      issues,
    );
    const dm = issues.find((i) => i.code === ISSUE_CODES.UNREALISTIC_DARK_METAL);
    expect(dm?.detail?.overrun).toBeUndefined();
  });

  it("does NOT flag a bright metal (gold)", () => {
    expect(
      runMat([material("mtl_gold", { baseColor: [1, 0.76, 0.33], metallic: 1, roughness: 0.1 })]),
    ).not.toContain(ISSUE_CODES.UNREALISTIC_DARK_METAL);
  });

  it("does NOT flag when the channel is texture-driven (metallic null)", () => {
    expect(
      runMat([material("mtl_mapped", { baseColor: [0.01, 0.01, 0.01], metallic: null, roughness: 0.05 })]),
    ).not.toContain(ISSUE_CODES.UNREALISTIC_DARK_METAL);
  });

  it("does NOT flag a dark rough dielectric (not a metal, not a mirror)", () => {
    expect(
      runMat([material("mtl_coal", { baseColor: [0.01, 0.01, 0.01], metallic: 0, roughness: 0.9 })]),
    ).not.toContain(ISSUE_CODES.UNREALISTIC_DARK_METAL);
  });

  it("respects conventions.pbr.realism.enabled:false", () => {
    const off = normalizeContract({ schemaVersion: 1, conventions: { pbr: { realism: { enabled: false } } } });
    expect(
      runMat([material("mtl_void", { baseColor: [0.01, 0.01, 0.01], metallic: 1, roughness: 0.05 })], off),
    ).not.toContain(ISSUE_CODES.UNREALISTIC_DARK_METAL);
  });
});

describe("lintIntent — print DfM, gated on a 3d_print contract (W-333/334)", () => {
  const printContract = normalizeContract({ schemaVersion: 1, target: "3d_print" });
  const runMesh = (m: Partial<CensusMesh>, contract = printContract) => {
    const issues: Issue[] = [];
    lintIntent(census([mesh("prp_part", m)]), contract, undefined, issues);
    return issues.map((i) => i.code);
  };

  it("flags an overhang past the print budget", () => {
    // 3d_print maxOverhangAreaFraction = 0.15; give it 40%.
    expect(runMesh({ overhangAreaFraction: 0.4 })).toContain(ISSUE_CODES.OVERHANG_UNSUPPORTED);
  });

  it("flags a wall thinner than the print minimum", () => {
    // 3d_print minThicknessMm = 0.8; a 0.5mm wall = 0.0005 m.
    expect(runMesh({ minWallThickness: 0.0005 })).toContain(ISSUE_CODES.WALL_TOO_THIN);
  });

  it("does NOT flag a printable part (thick wall, little overhang)", () => {
    expect(runMesh({ overhangAreaFraction: 0.02, minWallThickness: 0.003 })).not.toContain(
      ISSUE_CODES.OVERHANG_UNSUPPORTED,
    );
    expect(runMesh({ overhangAreaFraction: 0.02, minWallThickness: 0.003 })).not.toContain(
      ISSUE_CODES.WALL_TOO_THIN,
    );
  });

  it("is INERT on a non-print contract, even with a thin wall and big overhang", () => {
    const codes = runMesh({ overhangAreaFraction: 0.9, minWallThickness: 0.0001 }, normalizeContract());
    expect(codes).not.toContain(ISSUE_CODES.OVERHANG_UNSUPPORTED);
    expect(codes).not.toContain(ISSUE_CODES.WALL_TOO_THIN);
  });

  it("does not measure thickness for a non-print contract", () => {
    expect(normalizeContract().print.measureThickness).toBe(false);
    expect(normalizeContract({ schemaVersion: 1, target: "3d_print" }).print.measureThickness).toBe(true);
  });
});

describe("resolveBudgets — clone inherits family + role", () => {
  it("resolves a clone's family to its base and shares its role", () => {
    const s = scene(part("prp_rock", { role: "background" }), part("prp_rock_2", { role: "background", from: "prp_rock" }));
    const map = resolveBudgets(s, normalizeContract());
    expect(map.get("prp_rock_2")!.familyId).toBe("prp_rock");
    expect(map.get("prp_rock_2")!.role).toBe("background");
  });
});

describe("lintIntent — outlier population is designs, not instances", () => {
  it("does not let repeat clones own the median and flag the structure (I-952)", () => {
    /*
     * The red-team exhibit: 74 identical clones defined the size median, so
     * every structural part read as an outlier (19 info lines, up to 31σ).
     * With one representative per family, this scene has a healthy spread
     * and nothing fires.
     */
    const clones = Array.from({ length: 8 }, (_, i) =>
      part(i === 0 ? "prp_tooth" : `prp_tooth_${i + 1}`, i === 0 ? {} : { from: "prp_tooth" }),
    );
    const s = scene(...clones, part("prp_plinth"), part("prp_stem"), part("prp_dial"), part("prp_knop"));
    const c = census([
      ...clones.map((p) => withSpatial(p.id, 12, 0.4)),
      withSpatial("prp_plinth", 12, 0.46),
      withSpatial("prp_stem", 12, 0.5),
      withSpatial("prp_dial", 12, 0.3),
      withSpatial("prp_knop", 12, 0.35),
    ]);
    expect(run(c, s).filter((i) => i.code === "S3D-I-952")).toEqual([]);
  });

  it("never prints an astronomically degenerate robust z (I-951)", () => {
    /*
     * Three densities identical up to R6 rounding noise plus one genuinely
     * different: the noise is not a spread, and dividing by it once printed
     * "35,012,300.7 robust deviations". The clamp routes this into the
     * meanAD fallback, whose z is bounded by the sample count.
     */
    const s = scene(part("prp_a"), part("prp_b"), part("prp_c"), part("prp_d"));
    const c = census([
      withSpatial("prp_a", 12, 1, { triDensity: 1000.000001 }),
      withSpatial("prp_b", 12, 1, { triDensity: 1000.000002 }),
      withSpatial("prp_c", 12, 1, { triDensity: 1000.000003 }),
      withSpatial("prp_d", 12, 1, { triDensity: 30 }),
    ]);
    for (const issue of run(c, s).filter((i) => i.code === "S3D-I-951")) {
      expect(Math.abs(issue.detail?.robustZ as number)).toBeLessThan(100);
    }
  });
});
