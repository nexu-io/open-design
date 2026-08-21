import {
  PUSH_CONSTANT_BUDGET,
  RESERVED_UNIFORMS,
  SHADER_OUTPUTS,
  ShaderOutput,
  ShaderSpec,
  TypedUniform,
  kernelFunctionFor,
  pushConstantBytes,
} from "./types.js";
import { STDLIB_NAMES } from "./stdlib.js";

/**
 * Validate one shader declaration and its kernel text — everything that
 * can be judged WITHOUT a GPU. The GPU compile is a later, separate gate
 * (S3D-E-802 with the driver's own log); this layer exists so structural
 * mistakes are parse errors with paths and reasons, and so that the
 * assembled source is injection-proof by construction: uniform names are
 * the only author-controlled text that enters the wrapper, and they pass
 * an identifier regex that cannot contain GLSL.
 */
export function validateShaderSpec(
  name: string,
  raw: unknown,
  kernelText: string | undefined,
  errors: string[],
):
  | {
      spec: ShaderSpec;
      uniforms: TypedUniform[];
      outputs: ShaderOutput[];
      size: number;
      normalStrength: number;
      frames: number;
      motionVectors: boolean;
    }
  | undefined {
  const at = `shaders.${name}`;
  if (!/^shd_[a-z][a-z0-9_]{0,40}$/.test(name)) {
    errors.push(`${at}: shader names are shd_<lower_snake>, 5-45 chars`);
    return undefined;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push(`${at} must be an object`);
    return undefined;
  }
  const doc = raw as Record<string, unknown>;
  const before = errors.length;

  if (typeof doc.kernel !== "string" || !/\.glsl$/i.test(doc.kernel)) {
    errors.push(`${at}.kernel must be a scene-relative .glsl file path`);
  } else if (/^([a-zA-Z]:|[\\/])/.test(doc.kernel) || doc.kernel.split(/[\\/]/).includes("..")) {
    errors.push(`${at}.kernel must be a scene-relative path with no '..'`);
  }

  let size = 512;
  if (doc.size !== undefined) {
    if (
      typeof doc.size === "number" &&
      Number.isInteger(doc.size) &&
      doc.size >= 64 &&
      doc.size <= 4096 &&
      (doc.size & (doc.size - 1)) === 0
    ) {
      size = doc.size;
    } else {
      errors.push(`${at}.size must be a power of two in [64, 4096]`);
    }
  }

  let outputs: ShaderOutput[] = ["baseColor"];
  if (doc.outputs !== undefined) {
    if (
      Array.isArray(doc.outputs) &&
      doc.outputs.length > 0 &&
      doc.outputs.every((o) => SHADER_OUTPUTS.includes(o as ShaderOutput)) &&
      new Set(doc.outputs).size === doc.outputs.length
    ) {
      outputs = doc.outputs as ShaderOutput[];
    } else {
      errors.push(`${at}.outputs must be unique entries from ${SHADER_OUTPUTS.join(", ")}`);
    }
  }

  let frames = 1;
  if (doc.frames !== undefined) {
    if ([2, 4, 8, 16, 32, 64].includes(doc.frames as number)) {
      frames = doc.frames as number;
    } else {
      errors.push(`${at}.frames must be one of 2, 4, 8, 16, 32, 64 (power-of-two atlas grids)`);
    }
  }

  if (frames > 1 && Array.isArray(doc.outputs) && (doc.outputs as string[]).includes("height")) {
    errors.push(
      `${at}: height cannot be baked per-frame yet — normal derivation is per-tile; drop frames or height`,
    );
  }

  let motionVectors = false;
  if (doc.motionVectors !== undefined) {
    if (typeof doc.motionVectors !== "boolean") {
      errors.push(`${at}.motionVectors must be a boolean`);
    } else if (doc.motionVectors && frames <= 1) {
      errors.push(
        `${at}: motionVectors needs a flipbook to have motion — set "frames" (2, 4, 8, 16, 32, 64)`,
      );
    } else if (doc.motionVectors && !outputs.includes("baseColor")) {
      // The flow is block-matched on the baseColor frames, so without that
      // output there is nothing to track — fail loudly rather than bake a
      // silent no-op the author never sees.
      errors.push(
        `${at}: motionVectors is derived from the baseColor frames — include "baseColor" in outputs`,
      );
    } else {
      motionVectors = doc.motionVectors;
    }
  }

  let normalStrength = 1;
  if (doc.normalStrength !== undefined) {
    if (
      typeof doc.normalStrength === "number" &&
      Number.isFinite(doc.normalStrength) &&
      doc.normalStrength >= 0 &&
      doc.normalStrength <= 10
    ) {
      normalStrength = doc.normalStrength;
    } else {
      errors.push(`${at}.normalStrength must be a number in [0, 10]`);
    }
  }

  const ints = new Set<string>();
  if (doc.ints !== undefined) {
    if (Array.isArray(doc.ints) && doc.ints.every((v) => typeof v === "string")) {
      for (const v of doc.ints as string[]) ints.add(v);
    } else {
      errors.push(`${at}.ints must be an array of uniform names`);
    }
  }

  const uniforms: TypedUniform[] = [];
  if (doc.uniforms !== undefined) {
    if (doc.uniforms === null || typeof doc.uniforms !== "object" || Array.isArray(doc.uniforms)) {
      errors.push(`${at}.uniforms must be an object of name -> value`);
    } else {
      for (const [uname, value] of Object.entries(doc.uniforms as Record<string, unknown>)) {
        // The identifier gate: this regex is what makes the assembled
        // GLSL injection-proof. Nothing outside it ever reaches source.
        if (!/^u[A-Z][A-Za-z0-9]{0,30}$/.test(uname)) {
          errors.push(`${at}.uniforms.${uname}: uniform names are uCamelCase, 2-32 chars`);
          continue;
        }
        if ((RESERVED_UNIFORMS as readonly string[]).includes(uname)) {
          errors.push(`${at}.uniforms.${uname} is a system uniform the compiler owns`);
          continue;
        }
        if (typeof value === "number") {
          if (!Number.isFinite(value)) {
            errors.push(`${at}.uniforms.${uname} must be finite`);
            continue;
          }
          if (ints.has(uname)) {
            if (!Number.isInteger(value)) {
              errors.push(`${at}.uniforms.${uname} is declared int but is not an integer`);
              continue;
            }
            uniforms.push({ name: uname, type: "int", value: [value] });
          } else {
            uniforms.push({ name: uname, type: "float", value: [value] });
          }
        } else if (
          Array.isArray(value) &&
          value.length >= 2 &&
          value.length <= 4 &&
          value.every((v) => typeof v === "number" && Number.isFinite(v))
        ) {
          uniforms.push({
            name: uname,
            type: value.length === 2 ? "vec2" : value.length === 3 ? "vec3" : "vec4",
            value: value as number[],
          });
        } else {
          errors.push(`${at}.uniforms.${uname} must be a finite number or a 2-4 number array`);
        }
      }
    }
  }
  for (const intName of ints) {
    if (!uniforms.some((u) => u.name === intName)) {
      errors.push(`${at}.ints names '${intName}', which is not in uniforms`);
    }
  }

  // Push-constant budget: Vulkan guarantees 128 bytes and Blender's gpu
  // module routes uniforms through push constants. Failing here is a
  // parse error with a number; failing on the driver is a crash report.
  // Computed with std430 running-offset alignment in the DECLARED order
  // (sorted — the same order the runner pushes them), including the two
  // system fields that precede the author's.
  uniforms.sort((a, b) => (a.name < b.name ? -1 : 1));
  const bytes = pushConstantBytes(["int", "float", ...uniforms.map((u) => u.type)]);
  if (bytes > PUSH_CONSTANT_BUDGET) {
    errors.push(
      `${at}: uniforms occupy ${bytes} bytes of the ${PUSH_CONSTANT_BUDGET}-byte push-constant budget — pack values into vec4s or drop some`,
    );
  }

  /* ---- kernel text ------------------------------------------------- */
  if (kernelText !== undefined) {
    validateKernelText(at, kernelText, outputs, errors);
    const strippedKernel = kernelText
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\/\/[^\n]*/g, " ");
    if (frames === 1 && /\buS3dTime\b/.test(strippedKernel)) {
      errors.push(
        `${at}: the kernel reads uS3dTime but declares no frames — time only exists for flipbook shaders; add "frames"`,
      );
    }
  }

  if (errors.length > before) return undefined;
  const spec: ShaderSpec = {
    kernel: doc.kernel as string,
    size,
    outputs,
    ...(normalStrength !== 1 ? { normalStrength } : {}),
    ...(frames !== 1 ? { frames } : {}),
    ...(motionVectors ? { motionVectors: true } : {}),
    ...(uniforms.length > 0
      ? { uniforms: Object.fromEntries(uniforms.map((u) => [u.name, u.value.length === 1 ? u.value[0]! : u.value])) }
      : {}),
    ...(ints.size > 0 ? { ints: [...ints].sort() } : {}),
  };
  uniforms.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { spec, uniforms, outputs, size, normalStrength, frames, motionVectors };
}

/**
 * Structural checks on the kernel text itself. The compiler owns the
 * scaffolding, so scaffolding in the kernel is an error with the reason —
 * the alternative is two authorities over one shader program.
 */
export function validateKernelText(
  at: string,
  text: string,
  outputs: ShaderOutput[],
  errors: string[],
): void {
  // Structural checks run on COMMENT-STRIPPED text, because GLSL replaces
  // each comment with a single space before tokenising: `uniform/**/float`
  // is a live declaration to the driver but invisible to a raw-text regex
  // (found by adversarial review). Stripping also fixes the inverse hole —
  // a commented-out `vec4 kernel(...)` no longer counts as defined.
  text = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const forbidden: Array<[RegExp, string]> = [
    [/#\s*version/, "the compiler owns the #version header"],
    [/void\s+main\s*\(/, "the compiler owns main() — write vec4 kernel(vec2 uv)"],
    [/\buniform\s/, "uniforms are declared in scene.json, never in the kernel"],
    [/\bgl_FragColor\b/, "write the return value of kernel(), not gl_FragColor"],
    [/\b(texture|sampler)2D\b/, "kernels are pure procedural functions — no samplers in v1"],
    [/#\s*(include|extension)/, "no preprocessor includes or extensions in kernels"],
  ];
  for (const [pattern, why] of forbidden) {
    if (pattern.test(text)) {
      errors.push(`${at}: kernel must not contain ${pattern.source.replace(/\\[bs]/g, "")} — ${why}`);
    }
  }
  for (const output of outputs) {
    const fn = kernelFunctionFor(output);
    if (!new RegExp(`vec4\\s+${fn}\\s*\\(\\s*vec2\\s+\\w+\\s*\\)`).test(text)) {
      errors.push(`${at}: kernel file must define 'vec4 ${fn}(vec2 uv)' for output '${output}'`);
    }
  }
  for (const stdName of STDLIB_NAMES) {
    if (new RegExp(`(float|vec2|vec3|vec4|uvec2)\\s+${stdName}\\s*\\(`).test(text)) {
      errors.push(`${at}: kernel redefines stdlib function '${stdName}'`);
    }
  }
}
