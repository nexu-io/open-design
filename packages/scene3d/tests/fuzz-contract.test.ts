import { describe, expect, it } from "vitest";
import {
  validateContract,
  normalizeContract,
  contractCacheKey,
} from "../src/contract.js";
import { hashJson } from "../src/build/blender.js";
import { Rng } from "../src/solve/rng.js";

/**
 * Property fuzzing for the contract layer (C-1/C-2/C-3).
 *
 * Invariants a programmatic contract must uphold no matter how malformed:
 *   - validateContract never throws (it REPORTS problems, never crashes).
 *   - normalizeContract never throws and every numeric field it returns is
 *     FINITE — the whole point of C-1/C-2 was that a string/NaN budget must
 *     not flow through as a NaN threshold that silently disables a rule.
 *   - the two RegExp fields always compile.
 *   - contractCacheKey is JSON-serialisable and deterministic — a
 *     non-serialisable value there would silently collapse the cache key.
 */

const NUMBERS = [0, 1, -1, 0.5, 1e-9, 1e9, NaN, Infinity, -Infinity, 100000, 99999, 2.5];
const STRINGS = ["big", "yes", "Y", "Z", "textured", "off", "", "é", "^[\\p{L}]+$", "["];
const BOOLS = [true, false];

function randomValue(rng: Rng, depth: number): unknown {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng.next() * a.length)]!;
  const kind = Math.floor(rng.next() * (depth > 3 ? 5 : 8));
  switch (kind) {
    case 0: return pick(NUMBERS);
    case 1: return pick(STRINGS);
    case 2: return pick(BOOLS);
    case 3: return null;
    case 4: return undefined;
    case 5: return Array.from({ length: Math.floor(rng.next() * 5) }, () => randomValue(rng, depth + 1));
    default: {
      const obj: Record<string, unknown> = {};
      const keys = ["schemaVersion", "target", "conventions", "naming", "objectPattern",
        "collectionPattern", "units", "upAxis", "metersPerUnit", "budgets",
        "maxTrianglesPerMesh", "maxTrianglesTotal", "grounding", "enabled", "tolerance",
        "exempt", "uv", "require", "maxStretch", "texelDensity", "target", "maxRatio",
        "proof", "resolution", "turntableSteps", "emptyLuminance", "geometry",
        "allowOpenMeshes", "export", "lod", "hierarchy", "maxDepth", "pbr", "metallicValues"];
      const n = 1 + Math.floor(rng.next() * 6);
      for (let i = 0; i < n; i++) obj[pick(keys)] = randomValue(rng, depth + 1);
      return obj;
    }
  }
}

function assertNormalizeInvariant(input: unknown): void {
  // validateContract must never throw.
  expect(() => validateContract(input)).not.toThrow();

  let n;
  expect(() => { n = normalizeContract(input as never); }).not.toThrow();
  const norm = n!;

  // Every numeric threshold must be finite — no NaN/Infinity leaking through.
  const finite = (v: number) => expect(Number.isFinite(v)).toBe(true);
  finite(norm.maxDepth);
  finite(norm.metersPerUnit);
  finite(norm.fps);
  finite(norm.maxFrames);
  finite(norm.grounding.tolerance);
  finite(norm.uv.maxOverlapFraction);
  finite(norm.uv.maxOutOfBoundsFraction);
  finite(norm.uv.texelDensityMaxRatio);
  finite(norm.textures.maxSize);
  finite(norm.proofThresholds.emptyLuminance);
  finite(norm.proofThresholds.sparseCoverage);
  finite(norm.proofThresholds.blownRatio);
  if (norm.uv.maxStretch !== null) finite(norm.uv.maxStretch);
  if (norm.uv.texelDensityTarget !== null) finite(norm.uv.texelDensityTarget);
  for (const b of Object.values(norm.budgets)) if (b !== undefined) finite(b as number);
  for (const r of norm.lodRatios) {
    finite(r);
    expect(r > 0 && r < 1).toBe(true);
  }

  // Patterns always compile and are usable.
  expect(() => norm.objectPattern.test("prp_x")).not.toThrow();
  expect(() => norm.collectionPattern.test("prp_x")).not.toThrow();

  // The cache key is JSON-serialisable and stable across two calls.
  const key = contractCacheKey(norm);
  expect(() => hashJson(key)).not.toThrow();
  expect(hashJson(key)).toBe(hashJson(contractCacheKey(normalizeContract(input as never))));
}

describe("fuzz: contract normalization never yields a non-finite threshold or throws", () => {
  it("survives random contract objects", () => {
    const rng = new Rng("fuzz-contract");
    for (let i = 0; i < 6000; i++) assertNormalizeInvariant(randomValue(rng, 0));
  });

  it("survives random top-level primitives", () => {
    const rng = new Rng("fuzz-contract-prim");
    for (const v of [null, undefined, 1, "x", true, [], NaN, Infinity]) assertNormalizeInvariant(v);
    for (let i = 0; i < 500; i++) assertNormalizeInvariant(randomValue(rng, 4));
  });
});
