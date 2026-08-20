/**
 * The shader language — raw GPU kernels as compiled scene sources.
 *
 * The author writes a PURE KERNEL: `vec4 kernel(vec2 uv)` in a `.glsl`
 * file, plus declared uniforms in the scene spec. The compiler owns
 * everything else — uniform declarations, the deterministic stdlib, the
 * per-target wrapper, the dispatch main() — exactly the scene.json
 * philosophy applied to GPU code: author intent, never scaffolding.
 *
 * Execution is real: the runner compiles the assembled source on the
 * actual GPU driver (through Blender's gpu module, which cross-compiles
 * to the active backend — Vulkan/GL/Metal), draws it over the UV domain
 * offscreen, scans the readback for non-finite pixels, and bakes the
 * result to textures that feed real materials. A shader error is a
 * compile error with the driver's own log, at compile time — never a
 * magenta surprise in a render.
 *
 * The kernel text is the portable artifact. The same kernel assembles
 * under two wrappers: Blender GPUShaderCreateInfo (bake pipeline, now)
 * and WebGL2 GLSL 300 es (the interactive viewer editor, next) — so a
 * shader authored today is already runnable live in a browser panel.
 */

export type ShaderUniformType = "float" | "int" | "vec2" | "vec3" | "vec4";

export type ShaderUniformValue = number | number[];

/**
 * Bakeable output channels and the Principled sockets they wire into.
 * `height` is special: the kernel authors a height field (in .r), and the
 * compiler ALSO derives a tangent-space normal map from it (Sobel over
 * the baked field, wrap-aware) — the author writes "how bumpy", the
 * compiler owns the vector calculus.
 */
export type ShaderOutput = "baseColor" | "emission" | "roughness" | "metallic" | "height";

export interface ShaderSpec {
  /** Scene-relative path of the kernel file (`.glsl`). */
  kernel: string;
  /** Bake resolution (square, power of two, 64-4096). Default 512. */
  size?: number;
  /**
   * Uniform values, keyed by name (`^u[A-Za-z][A-Za-z0-9_]*$`). The type
   * is derived from the value shape: number → float, int when integral
   * AND named `uCount`-style? No — numbers are float unless declared via
   * the `ints` list; arrays of 2/3/4 → vec2/vec3/vec4.
   */
  uniforms?: Record<string, ShaderUniformValue>;
  /** Names in `uniforms` that are ints rather than floats. */
  ints?: string[];
  /** Output channels to bake. Default ["baseColor"]. */
  outputs?: ShaderOutput[];
  /**
   * Strength of the normal map derived from the `height` output, 0-10.
   * Default 1. Only meaningful when `height` is baked.
   */
  normalStrength?: number;
  /**
   * Bake the kernel over TIME as well as UV: `frames` cells, each with
   * the system uniform `uS3dTime` at cell/frames ∈ [0,1), assembled into
   * one atlas whose grid the compiler derives (power-of-two so the atlas
   * stays power-of-two). The atlas is adjudicated by the 2D sheet rules —
   * a kernel that ignores uS3dTime fails the static-flipbook rule, blank
   * cells fail the blank-frame rule — and the compile derives as a
   * `flipbook` asset. A frames shader is a sheet product: materials may
   * not reference it. Allowed values: 2, 4, 8, 16, 32, 64.
   */
  frames?: number;
}

/** System uniforms the compiler owns; author uniforms may not claim them. */
export const RESERVED_UNIFORMS = ["uS3dOutput", "uS3dTime"] as const;

/** Derived atlas grid for a frame count: power-of-two columns and rows. */
export function flipbookGrid(frames: number): [number, number] {
  const cols = 2 ** Math.ceil(Math.log2(Math.sqrt(frames)));
  return [cols, frames / cols];
}

/** A validated, typed uniform ready for emission. */
export interface TypedUniform {
  name: string;
  type: ShaderUniformType;
  value: number[];
}

/** Everything the runner needs to compile, draw, and bake one shader. */
export interface CompiledShaderJob {
  name: string;
  size: number;
  outputs: ShaderOutput[];
  /** Normal-map strength for the height-derived normal. */
  normalStrength: number;
  /** Time cells to bake (1 = static texture). */
  frames: number;
  uniforms: TypedUniform[];
  /** Assembled fragment source for Blender's GPUShaderCreateInfo. */
  fragmentSource: string;
  /** Assembled vertex source (fullscreen triangle, UV passthrough). */
  vertexSource: string;
}

/** Material-to-shader wiring the runner applies after baking. */
export interface ShaderBinding {
  material: string;
  shader: string;
  outputs: ShaderOutput[];
}

/**
 * Push-constant budget, bytes. Vulkan guarantees only 128; Blender's gpu
 * module routes uniforms through push constants, and `uOutputIndex` plus
 * driver padding need headroom. Validated per shader, loudly.
 */
export const PUSH_CONSTANT_BUDGET = 112;

/** std430 size and alignment per type. vec3 aligns AND sizes as 16. */
export function uniformByteSize(type: ShaderUniformType): number {
  switch (type) {
    case "float":
    case "int":
      return 4;
    case "vec2":
      return 8;
    case "vec3":
    case "vec4":
      return 16;
  }
}

/**
 * Bytes a push-constant block occupies for uniforms declared IN THIS
 * ORDER, with std430 field alignment: each field starts at the next
 * multiple of its own alignment, so a vec3 after an odd number of floats
 * costs padding a naive size-sum misses (adversarial review found the
 * naive sum could pass a block that overflows the driver's real limit).
 */
export function pushConstantBytes(types: ShaderUniformType[]): number {
  let offset = 0;
  for (const type of types) {
    const size = uniformByteSize(type);
    const align = size === 4 ? 4 : size === 8 ? 8 : 16;
    offset = Math.ceil(offset / align) * align + size;
  }
  return offset;
}

export const SHADER_OUTPUTS: readonly ShaderOutput[] = [
  "baseColor",
  "emission",
  "roughness",
  "metallic",
  "height",
];

/** Kernel entry point required per output ("baseColor" uses plain `kernel`). */
export function kernelFunctionFor(output: ShaderOutput): string {
  return output === "baseColor" ? "kernel" : `kernel_${output}`;
}
