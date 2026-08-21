import { describe, expect, it } from "vitest";
import { parseUsda, UsdaParseError, walkPrims } from "../src/parse/usda.js";
import { Rng } from "../src/solve/rng.js";

/**
 * Property fuzzing for the USDA parser.
 *
 * The load-bearing invariant behind P-1/P-9/P-10 and the whole parser-
 * robustness batch: a parse either succeeds or fails as a UsdaParseError, and
 * ALWAYS terminates. A different thrown type (TypeError, RangeError, a stack
 * overflow) or a hang is a real defect — it blinds the entire lint stage for
 * that file. Hand-written cases cannot cover the input space; thousands of
 * adversarial strings can. Seeded via the repo's deterministic Rng so a
 * failure reproduces exactly and CI never flakes.
 */

const CHARSET = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  ..."(){}[]<>=@\"'#/*:;,.-+_ \t\n\\",
  "def ", "over ", "class ", "Xform", "Mesh", "Scope", "token", "float3[]",
  "variantSet", "references", "payload", "subLayers", "kind", "\"\"\"",
  "customData", "assetInfo", "@ref.usda@", "= ", "{", "}", "(", ")",
];

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng.next() * arr.length)]!;
}

/** Random soup drawn from USDA-significant fragments and raw characters. */
function soup(rng: Rng, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += pick(rng, CHARSET);
  return out;
}

/** Random raw bytes rendered as a string, to hit the lexer's char branches. */
function rawChars(rng: Rng, len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += String.fromCharCode(Math.floor(rng.next() * 128));
  return out;
}

const SEED = `#usda 1.0
(
    defaultPrim = "root"
    upAxis = "Y"
    assetInfo = { string name = "x" }
)
def Xform "root" (
    kind = "component"
    doc = """multi
line (paren"""
)
{
    variantSet "v" = { "a" { } }
    def Mesh "prp_a" {
        token outputs:surface
        float3[] extent = [(-1,-1,-1),(1,1,1)]
        matrix4d xformOp:transform.timeSamples = { 1: ((1,0,0,0),(0,1,0,0),(0,0,1,0),(0,0,0,1)) }
    }
}
`;

/** Mutate a valid stage: flip, insert, delete, or duplicate characters. */
function mutate(rng: Rng, src: string): string {
  const chars = [...src];
  const edits = 1 + Math.floor(rng.next() * 8);
  for (let e = 0; e < edits && chars.length > 0; e++) {
    const i = Math.floor(rng.next() * chars.length);
    const op = Math.floor(rng.next() * 4);
    if (op === 0) chars[i] = pick(rng, CHARSET)[0] ?? "x";
    else if (op === 1) chars.splice(i, 1);
    else if (op === 2) chars.splice(i, 0, pick(rng, CHARSET)[0] ?? "{");
    else chars[i] = chars[i]!.toUpperCase();
  }
  return chars.join("");
}

function assertParseInvariant(input: string): void {
  let tree;
  try {
    tree = parseUsda(input, "fuzz");
  } catch (err) {
    if (!(err instanceof UsdaParseError)) {
      throw new Error(
        `parseUsda threw ${(err as Error).constructor?.name ?? typeof err} (not UsdaParseError) on:\n<<<${input}>>>\n${(err as Error).stack}`,
      );
    }
    return;
  }
  // A returned tree must be structurally sane, and walkable without error.
  expect(Array.isArray(tree.prims)).toBe(true);
  expect(Array.isArray(tree.stage.subLayers)).toBe(true);
  let count = 0;
  walkPrims(tree.root, () => {
    count++;
    if (count > 1_000_000) throw new Error("walkPrims did not terminate");
  });
}

describe("fuzz: parseUsda never throws a non-UsdaParseError and always terminates", () => {
  it("survives token soup", () => {
    const rng = new Rng("fuzz-parser-soup");
    for (let i = 0; i < 4000; i++) assertParseInvariant(soup(rng, 1 + Math.floor(rng.next() * 200)));
  });

  it("survives raw character noise", () => {
    const rng = new Rng("fuzz-parser-raw");
    for (let i = 0; i < 4000; i++) assertParseInvariant(rawChars(rng, 1 + Math.floor(rng.next() * 200)));
  });

  it("survives mutations of a valid stage", () => {
    const rng = new Rng("fuzz-parser-mutate");
    for (let i = 0; i < 4000; i++) assertParseInvariant(mutate(rng, SEED));
  });

  it("survives deeply nested and unbalanced brackets without a stack overflow", () => {
    const rng = new Rng("fuzz-parser-nest");
    for (let i = 0; i < 400; i++) {
      const depth = 1 + Math.floor(rng.next() * 3000);
      const open = pick(rng, ["{", "(", "[", 'def Xform "x" {'] as const);
      assertParseInvariant(open.repeat(depth));
      assertParseInvariant('def Xform "x"\n' + "{\n".repeat(depth));
    }
  });
});
