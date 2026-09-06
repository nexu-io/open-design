// Off-thread evaluation: `compileInWorker` runs the whole compile on a worker
// thread so a CPU-heavy exact-rational evaluation never stalls the caller's
// event loop. These pin the two invariants that matter: it is a faithful
// drop-in for `compile` (same result, whichever path runs), and the genuine
// off-thread path preserves the result byte-for-byte across the thread
// boundary.
//
// A subtlety this file is built around: the REAL worker only exists against the
// BUILT dist. In the vitest source context `import.meta.url` points at
// src/compile-in-worker.ts, so the sibling bundled `compile-worker.mjs` isn't
// there and `compileInWorker` falls back to an inline compile. So the drop-in
// contract is tested on the source import (fallback path), and the genuine
// worker is tested by loading the built dist entry.

import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { compile as srcCompile, compileInWorker as srcCompileInWorker } from "../src/index.js";
import { rmForSetup } from "./helpers/fs.js";

// These stay Blender-free on purpose: an invalid scene fails at validation
// (S3D-E-105) before any build, so the boundary is exercised end to end without
// a real Blender. The full Blender-through-worker path (census, manifest,
// deliverables surviving the thread boundary) is covered by the recipe suite's
// "identical whether compiled inline or off-thread" test and by the daemon
// route tests — so this file runs in the fast CI lane.

const distDir = path.join(__dirname, "..", "dist");
const distIndex = path.join(distDir, "index.mjs");
const distBuilt =
  fs.existsSync(distIndex) && fs.existsSync(path.join(distDir, "compile-worker.mjs"));

/** A scene that fails at validation (S3D-E-105) BEFORE any Blender work, so the
 *  boundary can be exercised end to end without a real build. */
function invalidScene(tag: string): string {
  const dir = path.join(__dirname, ".work", `worker-${tag}`);
  rmForSetup(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "scene.json"),
    JSON.stringify({ parts: [{ id: "x", shape: "not-a-real-shape", size: [1, 1, 1] }] }),
    "utf8",
  );
  return dir;
}

/** Normalise a result to JSON semantics and drop wall-clock fields, so a live
 *  object and one that round-tripped through the worker (JSON) compare cleanly.
 *  `generatedAt` and per-stage `durationMs` differ between any two independent
 *  compiles — worker or not — so they are not part of "the boundary preserved
 *  the result". */
const VOLATILE = new Set(["generatedAt", "durationMs"]);
const scrub = (v: unknown): unknown => {
  const j = JSON.parse(JSON.stringify(v));
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      for (const k of Object.keys(o as Record<string, unknown>)) {
        if (VOLATILE.has(k)) delete (o as Record<string, unknown>)[k];
        else walk((o as Record<string, unknown>)[k]);
      }
    }
  };
  walk(j);
  return j;
};

describe("compileInWorker", () => {
  it("is a faithful drop-in for compile() (inline fallback preserves the result)", async () => {
    // Source context: no sibling .mjs, so this deliberately falls back inline —
    // and the fallback must be LOUD (a silent one would quietly reintroduce the
    // event-loop stall the worker exists to remove).
    const dir = invalidScene("fallback");
    let fallbackReason: string | undefined;
    const viaWorker = await srcCompileInWorker(
      { projectDir: dir, stages: ["parse"], proof: { turntable: false } },
      { onFallback: (r) => (fallbackReason = r) },
    );
    const viaInline = await srcCompile({
      projectDir: dir,
      stages: ["parse"],
      proof: { turntable: false },
    });

    expect(fallbackReason).toBeDefined();
    expect(fallbackReason).toMatch(/inline/);
    expect(viaWorker.ok).toBe(viaInline.ok);
    expect(viaWorker.issues.map((i) => i.code)).toEqual(viaInline.issues.map((i) => i.code));
  });

  it.skipIf(!distBuilt)(
    "runs the genuine off-thread worker with a result identical to inline",
    async () => {
      const dist = (await import(pathToFileURL(distIndex).href)) as typeof import("../src/index.js");
      // The built entry finds its sibling worker — the real thread runs.
      expect(dist.workerEvalAvailable).toBe(true);

      const dir = invalidScene("real");
      let fellBack = false;
      const viaWorker = await dist.compileInWorker(
        { projectDir: dir, stages: ["parse"], proof: { turntable: false } },
        { onFallback: () => (fellBack = true) },
      );
      const viaInline = await dist.compile({
        projectDir: dir,
        stages: ["parse"],
        proof: { turntable: false },
      });

      expect(fellBack).toBe(false); // the genuine worker path, not the fallback
      // Full deep parity across the thread boundary — nothing lost or mangled
      // (bar the wall-clock generatedAt, which differs between any two compiles).
      expect(scrub(viaWorker)).toEqual(scrub(viaInline));
    },
  );

  it("rejects an already-aborted signal with a standard AbortError", async () => {
    // The abort contract at its cheapest: an aborted signal short-circuits
    // before spawning anything, and rejects with the same AbortError shape
    // fetch and every other AbortSignal consumer uses.
    const dir = invalidScene("preabort");
    const ac = new AbortController();
    ac.abort();
    await expect(
      srcCompileInWorker(
        { projectDir: dir, stages: ["parse"], proof: { turntable: false } },
        { signal: ac.signal },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
