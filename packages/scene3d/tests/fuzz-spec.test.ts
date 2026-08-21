import { describe, expect, it } from "vitest";
import { validateSceneSpec } from "../src/solve/validate.js";
import { Rng } from "../src/solve/rng.js";

/**
 * Property fuzzing for scene.json validation (S-11 and the Kiln discipline:
 * "schema errors are parse errors, never a Blender traceback").
 *
 * Invariant: validateSceneSpec never throws for ANY input — it returns either
 * a {spec} or a non-empty {errors}. And a spec it ACCEPTS is well-formed: every
 * part has a positive, above-floor, finite size. A malformed input that
 * crashed the validator would surface as a traceback exactly where the design
 * promises a JSON-pathed error.
 */

const NUMBERS = [0, 1, -1, 0.5, 1e-12, 1e12, NaN, Infinity, -Infinity, 100];
const STRINGS = ["prp_a", "mtl_x", "cylinder", "sphere", "dodecahedron", "at", "on", "", "x/y"];

function randomValue(rng: Rng, depth: number): unknown {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng.next() * a.length)]!;
  const k = Math.floor(rng.next() * (depth > 3 ? 4 : 7));
  switch (k) {
    case 0: return pick(NUMBERS);
    case 1: return pick(STRINGS);
    case 2: return pick([true, false, null]);
    case 3: return Array.from({ length: Math.floor(rng.next() * 4) }, () => randomValue(rng, depth + 1));
    default: {
      const obj: Record<string, unknown> = {};
      const keys = ["schemaVersion", "parts", "relations", "materials", "shaders", "claims",
        "id", "size", "shape", "axis", "material", "type", "part", "center", "of", "to",
        "from", "by", "clearance", "embed", "repeat", "every", "count", "spin", "bob",
        "seconds", "amplitude", "metallic", "roughness", "emission", "emissionStrength"];
      const n = 1 + Math.floor(rng.next() * 6);
      for (let i = 0; i < n; i++) obj[pick(keys)] = randomValue(rng, depth + 1);
      return obj;
    }
  }
}

/** A structurally plausible spec, more likely to reach deep validation paths. */
function plausibleSpec(rng: Rng): unknown {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rng.next() * a.length)]!;
  const partCount = Math.floor(rng.next() * 4);
  const parts = Array.from({ length: partCount }, (_, i) => ({
    id: `prp_${i}`,
    size: [pick(NUMBERS), pick(NUMBERS), pick(NUMBERS)],
    ...(rng.next() < 0.5 ? { shape: pick(["cylinder", "sphere", "torus", "bad"]) } : {}),
  }));
  return {
    schemaVersion: 1,
    parts,
    relations: parts.map((p) => ({ type: pick(["at", "on", "span", "bad"]), part: p.id, center: [0, 0, 0] })),
  };
}

function assertValidateInvariant(input: unknown): void {
  let result;
  expect(() => { result = validateSceneSpec(input as never); }).not.toThrow();
  const { spec, errors } = result!;
  if (spec) {
    // An accepted spec must be well-formed: sizes finite, positive, above floor.
    for (const part of spec.parts) {
      for (const s of part.size) {
        expect(Number.isFinite(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(1e-5);
      }
    }
  } else {
    expect(errors.length).toBeGreaterThan(0);
  }
}

describe("fuzz: validateSceneSpec never throws and only accepts well-formed specs", () => {
  it("survives random objects", () => {
    const rng = new Rng("fuzz-spec-random");
    for (let i = 0; i < 5000; i++) assertValidateInvariant(randomValue(rng, 0));
  });

  it("survives structurally-plausible specs", () => {
    const rng = new Rng("fuzz-spec-plausible");
    for (let i = 0; i < 3000; i++) assertValidateInvariant(plausibleSpec(rng));
  });

  it("survives top-level primitives", () => {
    for (const v of [null, undefined, 1, "x", true, [], NaN]) assertValidateInvariant(v);
  });
});
