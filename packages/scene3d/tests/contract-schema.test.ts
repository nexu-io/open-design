import { describe, expect, it } from "vitest";
import {
  CONTRACT_FIELDS,
  describeField,
  validateFields,
  type FieldSpec,
} from "../src/contract-schema.js";
import {
  DEFAULT_CONTRACT,
  TARGET_PROFILES,
  contractCacheKey,
  normalizeContract,
  validateContract,
} from "../src/contract.js";
import type { Scene3dContract } from "../src/types.js";

/**
 * The anti-drift lock.
 *
 * `validateContract` (reject loudly) and `normalizeContract` (degrade safely)
 * are two correct behaviours that must agree about which fields exist. As two
 * hand-maintained cascades they had drifted: four whole convention blocks —
 * print, voxel, minecraft, coherence — were normalized but never validated, so
 * `{print:{minThicknessMm:"big"}}` validated clean, coerced to the default,
 * and left the thin-wall rule the author had just enabled silently OFF.
 *
 * These tests hold the two together from both directions: every declared field
 * really is rejected AND really does degrade, and every field the defaults or
 * target profiles mention really is declared.
 */

/** A value of the wrong type for each field kind — the primary drift symptom
 *  is a wrong-typed value sailing through, not an out-of-range one. */
function garbageFor(spec: FieldSpec): unknown {
  switch (spec.kind) {
    case "boolean":
      return "yes"; // truthy: `?? default` would adopt it
    case "string":
      return 42;
    case "enum":
      return "nope";
    case "object":
      return "nope";
    case "number":
      return "big";
    case "numberArray":
    case "stringArray":
      return "big";
  }
}

function withPath(path: string, value: unknown): Scene3dContract {
  const root: Record<string, unknown> = { schemaVersion: 1 };
  const keys = path.split(".");
  let cur = root;
  for (const key of keys.slice(0, -1)) {
    cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  if (value !== undefined) cur[keys[keys.length - 1]!] = value;
  return root as unknown as Scene3dContract;
}

/** Leaf paths mentioned by an object literal, e.g. `conventions.units.upAxis`. */
function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [prefix];
  const out: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out.push(...leafPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

describe("contract schema", () => {
  it("declares a unique, resolvable path for every field", () => {
    const paths = CONTRACT_FIELDS.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    for (const spec of CONTRACT_FIELDS) {
      expect(spec.path).toMatch(/^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/);
      expect(describeField(spec).length).toBeGreaterThan(0);
    }
  });

  it("rejects a wrong-typed value in every declared field", () => {
    const missed: string[] = [];
    for (const spec of CONTRACT_FIELDS) {
      const problems = validateContract(withPath(spec.path, garbageFor(spec)));
      if (!problems.some((p) => p.startsWith(`${spec.path} must be `))) missed.push(spec.path);
    }
    expect(missed).toEqual([]);
  });

  it("degrades a wrong-typed value to exactly the same contract as omitting it", () => {
    // "Reject loudly" and "degrade safely" are both required. If a garbage
    // value were ADOPTED rather than ignored, a contract that failed validation
    // would still change how the scene is judged — the worst of both.
    const adopted: string[] = [];
    for (const spec of CONTRACT_FIELDS) {
      const bad = contractCacheKey(normalizeContract(withPath(spec.path, garbageFor(spec))));
      const absent = contractCacheKey(normalizeContract(withPath(spec.path, undefined)));
      if (JSON.stringify(bad) !== JSON.stringify(absent)) adopted.push(spec.path);
    }
    expect(adopted).toEqual([]);
  });

  it("declares every field the defaults and target profiles mention", () => {
    const declared = new Set(CONTRACT_FIELDS.map((f) => f.path));
    const undeclared = new Set<string>();
    for (const path of leafPaths(DEFAULT_CONTRACT)) {
      if (path !== "schemaVersion" && !declared.has(path)) undeclared.add(path);
    }
    for (const profile of Object.values(TARGET_PROFILES)) {
      for (const path of leafPaths({ conventions: profile })) {
        if (!declared.has(path)) undeclared.add(path);
      }
    }
    expect([...undeclared]).toEqual([]);
  });

  it("accepts a fully-specified valid contract", () => {
    expect(
      validateContract({
        schemaVersion: 1,
        target: "minecraft",
        conventions: {
          print: { minThicknessMm: 0.8, maxOverhangAreaFraction: 0.15 },
          voxel: { grid: { size: 0.0625, tolerance: 0.004 }, pxPerBlock: 32 },
          minecraft: { dialect: "bedrock", elementBounds: { minBlocks: -1, maxBlocks: 2 } },
          coherence: { outlierZ: 3 },
        },
      }),
    ).toEqual([]);
  });

  it("rejects a non-object where a convention block is expected", () => {
    // A string `uv` block makes every leaf under it read as absent, so all the
    // UV rules would quietly revert to defaults instead of being reported.
    expect(validateFields({ conventions: { uv: "strict" } })).toContain(
      "conventions.uv must be an object",
    );
  });

  describe("the blocks that had drifted", () => {
    it("rejects malformed print thresholds", () => {
      expect(validateContract({ schemaVersion: 1, conventions: { print: { minThicknessMm: "big" } } })).toContain(
        "conventions.print.minThicknessMm must be a positive number",
      );
    });

    it("rejects a malformed voxel grid", () => {
      expect(
        validateContract({ schemaVersion: 1, conventions: { voxel: { grid: { size: "huge" } } } }),
      ).toContain("conventions.voxel.grid.size must be a positive number");
    });

    it("rejects an unknown Minecraft dialect", () => {
      expect(validateContract({ schemaVersion: 1, conventions: { minecraft: { dialect: "nope" } } })).toContain(
        "conventions.minecraft.dialect must be one of 'java', 'bedrock'",
      );
    });

    it("rejects a malformed outlier cutoff", () => {
      expect(
        validateContract({ schemaVersion: 1, conventions: { coherence: { outlierZ: -1 } } }),
      ).toContain("conventions.coherence.outlierZ must be a positive number");
    });
  });
});

/**
 * Unknown keys are refused with a suggestion, never silently ignored. The
 * failure this pins: `conventions.uv.texelDensityMaxRatio` (the wrong
 * nesting) used to validate clean while the default silently won.
 */
describe("unknown contract keys", () => {
  it("catches a wrong-nesting spelling with an exact rewrap suggestion", () => {
    const problems = validateFields({
      schemaVersion: 1,
      conventions: { uv: { texelDensityMaxRatio: 4 } },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("conventions.uv.texelDensityMaxRatio is not a contract field");
    expect(problems[0]).toContain("did you mean conventions.uv.texelDensity.maxRatio?");
  });

  it("catches a plain typo with a nearest-sibling suggestion", () => {
    const problems = validateFields({
      schemaVersion: 1,
      conventions: { geometry: { allowOpenMeshs: true } },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('did you mean "allowOpenMeshes"?');
  });

  it("says nothing helpful is near when nothing is", () => {
    const problems = validateFields({
      schemaVersion: 1,
      conventions: { geometry: { frobnicate: true } },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("conventions.geometry.frobnicate is not a contract field");
    expect(problems[0]).not.toContain("did you mean");
  });

  it("leaves author-vocabulary subtrees alone (role and part budget maps)", () => {
    const problems = validateFields({
      schemaVersion: 1,
      conventions: {
        budgets: {
          roles: { hero: { maxTriangles: 5000 } },
          parts: { prp_anything_at_all: { maxTriangles: 100 } },
        },
      },
    });
    expect(problems).toEqual([]);
  });

  it("accepts every legal spelling untouched", () => {
    expect(
      validateFields({
        schemaVersion: 1,
        target: "web",
        conventions: { uv: { texelDensity: { maxRatio: 4 } } },
        proof: { turntable: false },
        export: { formats: ["glb"] },
      }),
    ).toEqual([]);
  });
});

  it("keeps deprecated-but-declared spellings legal (legacy contracts still compile)", () => {
    // The unknown-key gate is a behavior change: keys that were silently
    // ignored now reject. Every LEGACY spelling the normalizer still reads
    // must therefore stay declared, or an old project breaks on upgrade.
    // The minecraft pxPerBlock/grid shorthand is the documented case.
    expect(
      validateFields({
        schemaVersion: 1,
        conventions: { minecraft: { pxPerBlock: 16, grid: { size: 0.0625 } } },
      }),
    ).toEqual([]);
  });

  it("catches a typo of the budget-map container names themselves", () => {
    // The maps' CHILDREN are author vocabulary (role/part names) and are
    // rightly opaque — but the container names are schema vocabulary, and a
    // misspelling of one silently dropped the whole budget block.
    const problems = validateFields({
      schemaVersion: 1,
      conventions: { budgets: { rolse: { hero: { maxTriangles: 5000 } } } },
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("conventions.budgets.rolse is not a contract field");
    expect(problems[0]).toContain('did you mean "roles"?');
  });
