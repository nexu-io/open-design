import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Every measured proof fact survives a cache hit.
 *
 * The proof cache is written field by field, so each new fact needs a
 * hand-written write/restore pair — and forgetting one fails ONLY on the warm
 * path, which is the path a working loop spends nearly all its time on. Three
 * facts have shipped with exactly that omission: `lookStats`, the material-ball
 * statistics, and `colourNotes`. Each was found by a separate audit, months
 * apart, because nothing structural connected the two paths.
 *
 * This is the structural connection. It reads the pipeline source, extracts the
 * names the cold path produces and the names the cache carries, and fails when
 * a produced fact is not cached — so the FOURTH omission is caught when it is
 * written, rather than by a fourth audit.
 */
const PIPELINE = path.join(__dirname, "..", "src", "pipeline.ts");

describe("proof cache parity (static)", () => {
  const src = fs.readFileSync(PIPELINE, "utf8");

  /** The object literal the proof stage writes into its cache entry. */
  function cachedFactNames(): Set<string> {
    const at = src.indexOf("frames: proofFrames ?? null,");
    expect(at, "the proof cache literal must be findable").toBeGreaterThan(0);
    // Walk to the end of the enclosing object literal.
    let depth = 1;
    let i = at;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      i++;
    }
    const block = src.slice(at, i);
    const names = new Set<string>();
    for (const m of block.matchAll(/^\s*(?:\.\.\.\([^)]*\?\s*\{\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) {
      names.add(m[1]!);
    }
    return names;
  }

  it("carries every proof fact the cold path measures", () => {
    /*
     * The facts the runner returns and the pipeline unpacks. Each is a
     * MEASUREMENT of the render — losing one on a warm compile means the
     * report silently says less than it did a moment ago, about a scene that
     * did not change.
     */
    const mustCache = [
      "frames",
      "lookStats",
      "offByFrame",
      "colourNotes",
    ];
    const cached = cachedFactNames();
    const missing = mustCache.filter((n) => !cached.has(n));
    expect(
      missing,
      "these proof facts are measured on the cold path but not written to the cache, " +
        "so they vanish on every cache hit",
    ).toEqual([]);
  });

  it("restores from the cache everything it writes to it", () => {
    // A fact written but never read back is the same bug wearing the other
    // shoe: the cache carries it and the warm path still reports nothing.
    for (const name of ["lookStats", "colourNotes", "screenRects", "idParts"]) {
      expect(
        src.includes(`?.${name}`) || src.includes(`{ ${name}?:`) || src.includes(`${name}?: unknown`),
        `${name} is written to the proof cache but never read back out of it`,
      ).toBe(true);
    }
  });
});
