import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { compile, probeBlender } from "../src/index.js";
import { rmRetry } from "./helpers/fs.js";
import { assertBlenderIfRequired } from "./helpers/blender-gate.js";
import { loadRuntime } from "./helpers/kit-runtime-loader.js";

/**
 * The kit runtime against a REAL export. Every other kit-viewer assertion is
 * pure TS over synthetic containers and lives in kit-viewer.test.ts (the
 * unit project, so CI runs it); this file holds the one suite that needs a
 * real compile, so the Blender gate never costs the pure half its CI lane.
 */

const hasBlender = (await probeBlender({})) !== null;
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)("kit runtime against a real export", () => {
  it("parses the GLB the pipeline actually produces", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "scene3d-kit-"));
    fs.cpSync(path.join(__dirname, "fixtures", "good", "prop_crate"), work, { recursive: true });
    const result = await compile({ projectDir: work, proof: { turntable: false }, timeoutMs: 240_000 });
    const glb = result.exportedAssets.find((a) => a.endsWith(".glb"))!;
    expect(glb).toBeTruthy();

    const buffer = fs.readFileSync(path.join(work, glb));
    const { parseGlb, readAccessor } = loadRuntime();
    const parsed = parseGlb(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    );
    expect(parsed.json.meshes.length).toBeGreaterThan(0);

    // Walk the real primitives the way the renderer does; a stride mistake
    // shows up here as a wrong element count rather than a broken picture.
    let vertices = 0;
    for (const mesh of parsed.json.meshes) {
      for (const prim of mesh.primitives) {
        const positions = readAccessor(parsed.json, parsed.bin, prim.attributes.POSITION);
        expect(positions.length % 3).toBe(0);
        vertices += positions.length / 3;
        if (prim.indices !== undefined) {
          const indices = readAccessor(parsed.json, parsed.bin, prim.indices);
          expect(indices.length % 3).toBe(0);
          for (let i = 0; i < indices.length; i++) {
            expect(indices[i]!).toBeLessThan(positions.length / 3);
          }
        }
      }
    }
    expect(vertices).toBeGreaterThan(0);

    // The kit page the compile wrote must point at that same mesh.
    const kit = fs.readFileSync(path.join(work, "out", "kit.html"), "utf8");
    expect(kit).toContain("scene.glb");

    // Retrying, non-throwing cleanup: the Blender child this test spawned
    // can still hold the directory handle for a moment on Windows, and a
    // teardown that throws turns a fully-passing test red.
    rmRetry(work);
  }, 300_000);
});
