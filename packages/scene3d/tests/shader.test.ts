import { describe, expect, it } from "vitest";
import { validateShaderSpec, validateKernelText } from "../src/shade/validate.js";
import {
  assembleBakeFragment,
  assembleShaderJob,
  assembleWebgl2Fragment,
} from "../src/shade/emit.js";
import { SHADER_STDLIB, STDLIB_NAMES } from "../src/shade/stdlib.js";
import { PUSH_CONSTANT_BUDGET } from "../src/shade/types.js";
import { validateSceneSpec } from "../src/solve/validate.js";
import { Rng } from "../src/solve/rng.js";

/**
 * The shader layer without a GPU: declaration validation, kernel
 * structural checks, wrapper assembly, and — most importantly — the
 * injection-safety property, fuzzed. The GPU-side complement (driver
 * compile, execution, NaN oracle) lives in shader-pipeline.test.ts.
 */

const KERNEL = `vec4 kernel(vec2 uv) {
  return vec4(vec3(s3d_fbm(uv * uScale)), 1.0);
}
`;

const spec = (over: Record<string, unknown> = {}) => ({
  kernel: "k.glsl",
  uniforms: { uScale: 4 },
  ...over,
});

const run = (raw: unknown, kernel?: string) => {
  const errors: string[] = [];
  const result = validateShaderSpec("shd_test", raw, kernel, errors);
  return { result, errors };
};

describe("validateShaderSpec", () => {
  it("accepts any power-of-two frame count from 2 to 256, rejects the rest", () => {
    // The POT-ness is structural (the atlas grid and mip-safe cells depend
    // on it); the 256 top is where a 16-wide grid meets the 16384px encode
    // boundary at production cell sizes. Both edges pinned from both sides.
    for (const frames of [2, 4, 8, 16, 32, 64, 128, 256]) {
      const ok = run(spec({ frames }), KERNEL);
      expect(ok.errors, `frames: ${frames} is legal`).toEqual([]);
      expect(ok.result!.frames).toBe(frames);
    }
    for (const frames of [1, 3, 48, 100, 512, 1.5, -8]) {
      const bad = run(spec({ frames }), KERNEL);
      expect(
        bad.errors.some((e) => /frames must be a power of two from 2 to 256/.test(e)),
        `frames: ${frames} is refused`,
      ).toBe(true);
    }
  });

  it("bounds the JOINT atlas edge, not just each factor", () => {
    // 16 columns × 1024 = 16384 sits exactly on the encode boundary; the
    // same grid at 2048 is a 32768px edge the runner would allocate in
    // full before anything could refuse it. Each factor is legal alone.
    expect(run(spec({ frames: 256, size: 1024 }), KERNEL).errors).toEqual([]);
    const over = run(spec({ frames: 256, size: 2048 }), KERNEL);
    expect(over.errors.some((e) => /32768px atlas edge, past the 16384px encode boundary/.test(e))).toBe(true);
    // The old ceiling had the same hole: 8 columns × 4096 = 32768.
    const legacy = run(spec({ frames: 64, size: 4096 }), KERNEL);
    expect(legacy.errors.some((e) => /past the 16384px encode boundary/.test(e))).toBe(true);
  });

  it("accepts motionVectors on a flipbook and rejects it without frames", () => {
    // Motion vectors describe motion BETWEEN frames, so they are meaningless
    // on a static texture.
    const withFrames = run(spec({ frames: 8, motionVectors: true }), KERNEL);
    expect(withFrames.errors).toEqual([]);
    expect(withFrames.result!.motionVectors).toBe(true);
    expect(withFrames.result!.spec.motionVectors).toBe(true);

    const noFrames = run(spec({ motionVectors: true }), KERNEL);
    expect(noFrames.result).toBeUndefined();
    expect(noFrames.errors.some((e) => /motionVectors needs a flipbook/.test(e))).toBe(true);

    // Flow is derived from baseColor, so an output set without it is rejected
    // rather than baking a silent no-op.
    const noBase = run(spec({ frames: 8, motionVectors: true, outputs: ["emission"] }), KERNEL);
    expect(noBase.result).toBeUndefined();
    expect(noBase.errors.some((e) => /derived from the baseColor frames/.test(e))).toBe(true);

    // Off by default.
    const plain = run(spec({ frames: 8 }), KERNEL);
    expect(plain.result!.motionVectors).toBe(false);
  });

  it("accepts a well-formed shader and types its uniforms", () => {
    const { result, errors } = run(
      spec({ uniforms: { uScale: 4, uTint: [1, 0.5, 0.2], uSteps: 3 }, ints: ["uSteps"] }),
      KERNEL,
    );
    expect(errors).toEqual([]);
    expect(result!.uniforms).toEqual([
      { name: "uScale", type: "float", value: [4] },
      { name: "uSteps", type: "int", value: [3] },
      { name: "uTint", type: "vec3", value: [1, 0.5, 0.2] },
    ]);
    expect(result!.size).toBe(512);
    expect(result!.outputs).toEqual(["baseColor"]);
  });

  it("rejects bad names, sizes, outputs, and non-finite values with reasons", () => {
    expect(run(spec({ size: 500 })).errors.some((e) => e.includes("power of two"))).toBe(true);
    expect(run(spec({ outputs: ["albedo"] })).errors.some((e) => e.includes("outputs"))).toBe(true);
    expect(run(spec({ uniforms: { uBad: Infinity } })).errors.some((e) => e.includes("finite"))).toBe(true);
    expect(run(spec({ uniforms: { scale: 1 } })).errors.some((e) => e.includes("uCamelCase"))).toBe(true);
    expect(run(spec({ kernel: "../../evil.glsl" })).errors.some((e) => e.includes("no '..'"))).toBe(true);
    const badName: string[] = [];
    expect(validateShaderSpec("Rust", spec(), KERNEL, badName)).toBeUndefined();
    expect(badName.some((e) => e.includes("shd_"))).toBe(true);
  });

  it("refuses an unknown shader key instead of swallowing it", () => {
    const { result, errors } = run(spec({ format: "png" }));
    expect(result).toBeUndefined();
    expect(errors.some((e) => e.includes("shaders.shd_test.format is not a shader field"))).toBe(true);
    expect(errors.some((e) => e.includes("known fields"))).toBe(true);
  });

  it("enforces the push-constant budget with the byte count", () => {
    const uniforms: Record<string, number[]> = {};
    for (let i = 0; i < 10; i++) uniforms[`uVec${String.fromCharCode(65 + i)}`] = [1, 2, 3, 4];
    const { errors } = run(spec({ uniforms }));
    expect(errors.some((e) => e.includes(`${PUSH_CONSTANT_BUDGET}-byte push-constant budget`))).toBe(true);
  });

  it("FUZZ: hostile uniform names can never reach assembled source", () => {
    // The injection property: whatever an attacker puts in a uniform NAME,
    // either validation rejects it, or (having matched the identifier
    // regex) it is inert as code. 500 hostile and random names.
    const rng = new Rng(99).at("shader-fuzz");
    const hostile = [
      "uA; } void main() { fragColor = vec4(1.0); } //",
      "uB\nuniform sampler2D uSneaky;",
      "uC/*",
      "uD#include <evil>",
      'uE"; system("rm -rf")',
      "u\u0000Null",
      "uF()",
      "gl_FragColor",
      "s3d_hash21",
    ];
    for (let i = 0; i < 500; i++) {
      const name =
        i < hostile.length
          ? hostile[i]!
          : Array.from({ length: 1 + Math.floor(rng.next() * 24) }, () =>
              String.fromCharCode(32 + Math.floor(rng.next() * 95)),
            ).join("");
      const errors: string[] = [];
      const result = validateShaderSpec(
        "shd_fuzz",
        { kernel: "k.glsl", uniforms: { [name]: 1 } },
        KERNEL,
        errors,
      );
      if (result) {
        if (name.startsWith("//")) {
          // A margin note: legal, silently DROPPED, and provably absent
          // from the assembled source — the injection property holds by
          // omission rather than by the identifier gate.
          expect(result.uniforms.some((u) => u.name === name)).toBe(false);
          const source = assembleWebgl2Fragment(KERNEL, ["baseColor"], result.uniforms);
          expect(source).not.toContain(name);
        } else {
          // Accepted names are pure identifiers — inert by construction.
          expect(name).toMatch(/^u[A-Z][A-Za-z0-9]{0,30}$/);
          const source = assembleWebgl2Fragment(KERNEL, ["baseColor"], result.uniforms);
          expect(source).toContain(`uniform float ${name};`);
        }
      } else {
        expect(errors.length).toBeGreaterThan(0);
      }
    }
  });

  it("FUZZ: malformed declaration shapes never throw, always explain", () => {
    const rng = new Rng(7).at("shape-fuzz");
    const junk = [null, [], 42, "kernel", { kernel: null }, { kernel: "k.glsl", size: "big" },
      { kernel: "k.glsl", outputs: "baseColor" }, { kernel: "k.glsl", uniforms: [] },
      { kernel: "k.glsl", ints: "uX" }, { kernel: "k.glsl", uniforms: { uA: [1] } },
      { kernel: "k.glsl", uniforms: { uA: [1, 2, 3, 4, 5] } }];
    for (let i = 0; i < 200; i++) {
      const raw = i < junk.length ? junk[i] : { kernel: "k.glsl", size: Math.floor(rng.next() * 9000) - 200 };
      const errors: string[] = [];
      const result = validateShaderSpec("shd_x", raw, undefined, errors);
      if (!result) expect(errors.length).toBeGreaterThan(0);
    }
  });
});

describe("validateKernelText", () => {
  const check = (text: string, outputs: Parameters<typeof validateKernelText>[2] = ["baseColor"]) => {
    const errors: string[] = [];
    validateKernelText("shaders.shd_t", text, outputs, errors);
    return errors;
  };

  it("accepts a pure kernel", () => {
    expect(check(KERNEL)).toEqual([]);
  });

  it("rejects scaffolding the compiler owns, naming the reason", () => {
    expect(check("#version 300 es\n" + KERNEL).some((e) => e.includes("#version"))).toBe(true);
    expect(check("void main() {}\n" + KERNEL).some((e) => e.includes("main()"))).toBe(true);
    expect(check("uniform float uX;\n" + KERNEL).some((e) => e.includes("scene.json"))).toBe(true);
    expect(check(KERNEL.replace("return", "gl_FragColor = vec4(1.0); return")).some((e) => e.includes("gl_FragColor"))).toBe(true);
    expect(check("vec4 kernel(vec2 uv) { return texture2D(uMap, uv); }").some((e) => e.includes("samplers"))).toBe(true);
  });

  it("requires a kernel function per declared output", () => {
    const errors = check(KERNEL, ["baseColor", "emission"]);
    expect(errors.some((e) => e.includes("kernel_emission"))).toBe(true);
  });

  it("rejects stdlib redefinition", () => {
    const errors = check("float s3d_fbm(vec2 p) { return 0.0; }\n" + KERNEL);
    expect(errors.some((e) => e.includes("redefines stdlib"))).toBe(true);
  });
});

describe("assembly", () => {
  it("is byte-stable and carries stdlib + kernel + dispatch", () => {
    const job = () =>
      assembleShaderJob("shd_test", KERNEL, ["baseColor"], [{ name: "uScale", type: "float", value: [4] }], 256);
    expect(job()).toEqual(job());
    const source = job().fragmentSource;
    expect(source).toContain("s3d_pcg2d");
    expect(source).toContain("vec4 kernel(vec2 uv)");
    expect(source).toContain("if (uS3dOutput == 0) { fragColor = kernel(vUv); }");
  });

  it("emits a complete standalone WebGL2 program for the future editor", () => {
    const source = assembleWebgl2Fragment(
      KERNEL,
      ["baseColor"],
      [{ name: "uScale", type: "float", value: [4] }],
    );
    expect(source.startsWith("#version 300 es")).toBe(true);
    expect(source).toContain("precision highp float;");
    expect(source).toContain("uniform float uScale;");
    expect(source).toContain("out vec4 fragColor;");
    for (const name of STDLIB_NAMES) expect(source).toContain(name);
  });

  it("stdlib never uses the sine-hash idiom", () => {
    // fract(sin(...)) is driver-dependent; the stdlib's whole reason to
    // exist is bit-determinism via integer hashing.
    expect(SHADER_STDLIB).not.toMatch(/fract\s*\(\s*sin/);
    expect(SHADER_STDLIB).toContain("floatBitsToUint");
  });
});

describe("scene.json integration", () => {
  it("validates shader references from materials", () => {
    const { errors } = validateSceneSpec({
      schemaVersion: 1,
      shaders: { shd_a: { kernel: "a.glsl" } },
      materials: { mtl_x: { shader: "shd_ghost" } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(errors.some((e) => e.includes("shd_ghost") && e.includes("not declared"))).toBe(true);
  });

  it("lets a shader material omit baseColor, and requires it otherwise", () => {
    const good = validateSceneSpec({
      schemaVersion: 1,
      shaders: { shd_a: { kernel: "a.glsl" } },
      materials: { mtl_x: { shader: "shd_a" } },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(good.errors).toEqual([]);
    expect(good.spec!.materials!.mtl_x!.shader).toBe("shd_a");

    const bad = validateSceneSpec({
      schemaVersion: 1,
      materials: { mtl_x: {} },
      parts: [{ id: "prp_a", size: [1, 1, 1], material: "mtl_x" }],
      relations: [{ type: "at", part: "prp_a", center: [0, 0, 0.5] }],
    });
    expect(bad.errors.some((e) => e.includes("mtl_x.baseColor"))).toBe(true);
  });
});

describe("margin notes in the uniforms map", () => {
  it("ignores a // key beside real uniforms", () => {
    // The last name map in the shader block: a note here was refused as a
    // badly named uniform, with an error that never named the real cause.
    const errors: string[] = [];
    const result = validateShaderSpec(
      "shd_rust",
      {
        kernel: "rust.glsl",
        size: 128,
        outputs: ["baseColor"],
        uniforms: { "//": "6 cells across the trim", uScale: 6 },
      },
      undefined,
      errors,
    );
    expect(errors).toEqual([]);
    expect(result?.uniforms.map((u) => u.name)).toEqual(["uScale"]);
  });
});
