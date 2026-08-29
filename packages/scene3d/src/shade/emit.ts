import { SHADER_STDLIB } from "./stdlib.js";
import {
  CompiledShaderJob,
  ShaderOutput,
  TypedUniform,
  kernelFunctionFor,
} from "./types.js";

/**
 * Assemble the runnable shader programs from a validated kernel.
 *
 * Two wrappers, one kernel:
 * - Blender GPUShaderCreateInfo sources (the bake pipeline, now): no
 *   version header or in/out declarations — the create-info API declares
 *   those, and Blender cross-compiles to the active backend (Vulkan, GL,
 *   Metal). Uniforms ride push constants declared by the caller from the
 *   same TypedUniform list, so declaration and use cannot diverge.
 * - WebGL2 GLSL 300 es (the interactive viewer editor, next): a complete
 *   standalone fragment shader with the same stdlib and uniform block.
 *
 * Assembly is deterministic: uniforms in sorted order, fixed section
 * order, no timestamps — the assembled text participates in the stage
 * content hash, so editing a kernel recompiles exactly what changed.
 *
 * Injection safety: the only author-controlled strings entering the
 * wrapper are uniform NAMES (identifier-regex-gated in validate.ts) and
 * the kernel BODY (which is the thing being compiled — it can only break
 * itself, and the driver reports that as S3D-E-802 with its own log).
 */

/** Fullscreen triangle; UVs cover 0-1 across the offscreen target. */
export const BAKE_VERTEX_SOURCE = `void main() {
  vUv = pos * 0.5 + 0.5;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

/**
 * The dispatch main() for the bake target, selecting the output pass.
 *
 * Flipbook cells (frames > 1, cell resolution `size`) get a structural
 * 2px transparent inset: the kernel's full 0-1 frame is mapped into the
 * cell interior and the border rim renders transparent, so bilinear
 * filtering can never sample a neighbouring frame. The sheet rule
 * S3D-E-610 polices exactly this; generated output must pass it by
 * construction, like TRIFAN caps pass the ngon rule. Constants are baked
 * at assembly time — no runtime knobs to desync.
 */
function bakeDispatch(outputs: ShaderOutput[], frames: number, size: number): string {
  const cases = (uv: string) =>
    outputs
      .map(
        (output, index) =>
          `  ${index === 0 ? "if" : "else if"} (uS3dOutput == ${index}) { fragColor = ${kernelFunctionFor(output)}(${uv}); }`,
      )
      .join("\n");
  if (frames <= 1) {
    return `void main() {\n${cases("vUv")}\n  else { fragColor = vec4(1.0, 0.0, 1.0, 1.0); }\n}\n`;
  }
  return `void main() {
  vec2 s3dPx = vUv * ${size.toFixed(1)};
  vec2 s3dCellUv = (s3dPx - 2.5) / ${(size - 5).toFixed(1)};
  if (s3dCellUv.x < 0.0 || s3dCellUv.x > 1.0 || s3dCellUv.y < 0.0 || s3dCellUv.y > 1.0) {
    fragColor = vec4(0.0);
    return;
  }
${cases("s3dCellUv")}
  else { fragColor = vec4(1.0, 0.0, 1.0, 1.0); }
}
`;
}

/** Blender create-info fragment source: stdlib + kernel + dispatch. */
export function assembleBakeFragment(
  kernelText: string,
  outputs: ShaderOutput[],
  frames = 1,
  size = 512,
): string {
  return `${SHADER_STDLIB}\n${kernelText}\n${bakeDispatch(outputs, frames, size)}`;
}

export function assembleShaderJob(
  name: string,
  kernelText: string,
  outputs: ShaderOutput[],
  uniforms: TypedUniform[],
  size: number,
  normalStrength = 1,
  frames = 1,
  motionVectors = false,
): CompiledShaderJob {
  return {
    name,
    size,
    outputs,
    normalStrength,
    frames,
    ...(motionVectors ? { motionVectors: true } : {}),
    uniforms: [...uniforms].sort((a, b) => (a.name < b.name ? -1 : 1)),
    fragmentSource: assembleBakeFragment(kernelText, outputs, frames, size),
    vertexSource: BAKE_VERTEX_SOURCE,
    // stdlib lines + the joining newline: where the author's own text starts.
    kernelLine: SHADER_STDLIB.split("\n").length + 1,
  };
}

/**
 * The same kernel as a complete WebGL2 (GLSL 300 es) fragment shader —
 * the contract the future in-viewer shader editor loads live. Emitted and
 * tested now so every authored kernel is already browser-runnable, and a
 * kernel that compiles in the bake pipeline compiles in the panel.
 */
export function assembleWebgl2Fragment(
  kernelText: string,
  outputs: ShaderOutput[],
  uniforms: TypedUniform[],
  frames = 1,
  size = 512,
): string {
  const decls = [...uniforms]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((u) => `uniform ${u.type} ${u.name};`)
    .join("\n");
  return [
    "#version 300 es",
    "precision highp float;",
    "precision highp int;",
    "in vec2 vUv;",
    "out vec4 fragColor;",
    "uniform int uS3dOutput;",
    ...(frames > 1 ? ["uniform float uS3dTime;"] : []),
    decls,
    SHADER_STDLIB,
    kernelText,
    bakeDispatch(outputs, frames, size),
  ].join("\n");
}
