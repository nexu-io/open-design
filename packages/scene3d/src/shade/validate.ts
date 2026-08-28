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
// Pure string arithmetic with no imports of its own, so the shader validator
// can share the language's suggestion helper without a cycle back through
// solve/validate.ts (which calls into this file).
import { didYouMean } from "../solve/did-you-mean.js";

/**
 * Validate one shader declaration and its kernel text — everything that
 * can be judged WITHOUT a GPU. The GPU compile is a later, separate gate
 * (S3D-E-802 with the driver's own log); this layer exists so structural
 * mistakes are parse errors with paths and reasons, and so that the
 * assembled source is injection-proof by construction: uniform names are
 * the only author-controlled text that enters the wrapper, and they pass
 * an identifier regex that cannot contain GLSL.
 */
/** RGBA, float32: what the bake target actually is (the RGBA8 default clamps
 *  Inf/NaN to bytes and blinds the non-finite oracle, so this is not a knob). */
const ATLAS_CHANNELS = 4;
const ATLAS_BYTES_PER_CHANNEL = 4;

/**
 * Default largest float32 atlas a bake may allocate, in bytes.
 *
 * Resource-denominated rather than a frame cap: what hurts is the allocation,
 * and the same number of frames is harmless at a small cell size and fatal at
 * a large one. 1 GiB is the working set a bake can take without putting a
 * developer machine into swap, and it clears every legitimate sheet — a
 * 64-frame 512px flipbook is 64 MiB. Overridable per project through
 * `conventions.shade.maxAtlasBytes`: a wall you can raise is a resource
 * negotiation, not a refusal.
 */
const MAX_ATLAS_BYTES = 1024 ** 3;

export function validateShaderSpec(
  name: string,
  raw: unknown,
  kernelText: string | undefined,
  errors: string[],
  /** Power-of-two bake resolution bounds, from the contract. The lower bound is
   *  data (64 for pbr; the declared pxPerBlock under pixel-art), so a legitimate
   *  16-px voxel bake is not rejected by a kernel-side constant. */
  bake: { min: number; max: number; maxAtlasBytes?: number } = { min: 64, max: 4096 },
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

  // Unknown shader keys are refused, never swallowed — the same doctrine as
  // scene.json's part/material/relation keys: a typo here (`"format"`
  // instead of `"outputs"`) compiled clean and baked nothing the author
  // asked for.
  const KNOWN_SHADER_KEYS = new Set([
    "kernel", "size", "outputs", "frames", "motionVectors", "normalStrength", "ints", "uniforms",
  ]);
  for (const key of Object.keys(doc)) {
    // The `//` margin-note convention holds here as everywhere: a comment
    // key is the author talking to the next reader, never vocabulary.
    if (key.startsWith("//")) continue;
    if (!KNOWN_SHADER_KEYS.has(key)) {
      // The one cross-vocabulary trap: a part's asset is `file:`, a
      // shader's source is `kernel:`. Levenshtein cannot bridge that gap,
      // so the alias is named explicitly — the exact mistake a field run
      // paid three misleading downstream errors to decode.
      const alias =
        key === "file" || key === "path" || key === "src"
          ? `did you mean "kernel"? (a part's asset is "file"; a shader's source is "kernel") — `
          : didYouMean(key, KNOWN_SHADER_KEYS);
      errors.push(
        `${at}.${key} is not a shader field — ${alias}known fields: ${[...KNOWN_SHADER_KEYS].join(", ")}`,
      );
    }
  }

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
      doc.size >= bake.min &&
      doc.size <= bake.max &&
      (doc.size & (doc.size - 1)) === 0
    ) {
      size = doc.size;
    } else if (typeof doc.size !== "number") {
      // Say the ACTUAL violation. `[512, 512]` failed the old one-size-fits-
      // all message, which told the author to re-check power-of-two
      // arithmetic that was never wrong — the value's SHAPE was.
      errors.push(
        `${at}.size is one number — bakes are square (e.g. "size": 512)${Array.isArray(doc.size) ? ", not a [w, h] pair" : ""}`,
      );
    } else {
      errors.push(`${at}.size must be a power of two in [${bake.min}, ${bake.max}]`);
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
    // Power-of-two is STRUCTURAL (the atlas grid and its mip-safe cells depend
    // on it) — the only constraint on the COUNT. There is no arbitrary upper
    // limit: how many frames fit is a RESOURCE fact, decided by the joint
    // atlas-edge check below (grid columns × cell size vs the 16384px encode
    // boundary), which allows many small-cell frames and few large-cell ones.
    const f = doc.frames as number;
    if (typeof f === "number" && Number.isInteger(f) && f >= 2 && Number.isInteger(Math.log2(f))) {
      frames = f;
    } else {
      errors.push(`${at}.frames must be a power of two ≥ 2 (power-of-two atlas grids)`);
    }
  }

  if (frames > 1 && Array.isArray(doc.outputs) && (doc.outputs as string[]).includes("height")) {
    errors.push(
      `${at}: height cannot be baked per-frame yet — normal derivation is per-tile; drop frames or height`,
    );
  }

  // The JOINT bound: the atlas edge is grid columns × cell size, and 16384px
  // is where PNG encode and common GPU texture limits both end. Checked
  // HERE, at declaration, because the runner allocates the full float32
  // atlas before anything measures it — an over-limit combination used to
  // burn the whole bake and then fail at encode. Each factor was legal
  // alone (size ≤ 4096, any power-of-two frame count); only the product breaks.
  // `frames` and `size` only hold non-default values that already passed
  // their own checks (POT frames, size ≤ 4096), so this never fires on garbage
  // — and it must not be gated on the whole error list, or an unrelated typo
  // would hide it. This is the SOLE upper bound on the frame count: a resource
  // fact (the encodable atlas edge), not an arbitrary number.
  if (frames > 1) {
    const cols = 2 ** Math.ceil(Math.log2(Math.sqrt(frames)));
    const atlasEdge = cols * size;
    if (atlasEdge > 16384) {
      errors.push(
        `${at}: ${frames} frames at size ${size} makes a ${atlasEdge}px atlas edge, past the 16384px encode boundary — shrink "size" or "frames" so grid columns (${cols}) × size stays within it`,
      );
    }
    /* The edge alone is not a memory bound. A 16384px edge is legal and is
       ~4 GiB of RGBA float32 — the runner allocates the whole atlas before
       anything measures it, so an edge-legal declaration can still take the
       machine down. The real currency is BYTES, which is why this is the
       binding check: resource-denominated, so it scales with the declaration
       instead of capping the frame count at a number someone picked. */
    const budget = bake.maxAtlasBytes ?? MAX_ATLAS_BYTES;
    const bytes = atlasEdge * atlasEdge * ATLAS_CHANNELS * ATLAS_BYTES_PER_CHANNEL;
    if (bytes > budget) {
      const gib = (n: number): string => `${Math.round((n / 1024 ** 3) * 100) / 100}GiB`;
      errors.push(
        `${at}: ${frames} frames at size ${size} allocates a ${gib(bytes)} float32 atlas, past the ${gib(budget)} bake budget — the whole atlas is allocated before it is measured, so shrink "size" or "frames", or raise conventions.shade.maxAtlasBytes on a machine with the memory`,
      );
    }
  }

  let motionVectors = false;
  if (doc.motionVectors !== undefined) {
    if (typeof doc.motionVectors !== "boolean") {
      errors.push(`${at}.motionVectors must be a boolean`);
    } else if (doc.motionVectors && frames <= 1) {
      errors.push(
        `${at}: motionVectors needs a flipbook to have motion — set "frames" (any power of two ≥ 2; the ceiling is the atlas edge, not a fixed count)`,
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
        // The margin-note convention reaches the last name map in the
        // shader block: a `//` note here was refused as a badly named
        // uniform, with an error that never revealed the real cause.
        if (uname.startsWith("//")) continue;
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
          // The ints declaration is a TYPE contract, and a vector cannot
          // honour it: this branch used to accept `ints: ["uTint"]` with a
          // vec2 value and hand the kernel the wrong type entirely.
          if (ints.has(uname)) {
            errors.push(
              `${at}.uniforms.${uname} is declared int but is a ${value.length}-component vector — ints declares scalar integers only`,
            );
            continue;
          }
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
    // The hardened scanner, not a second implementation of it. Stripping
    // in two independent regex passes — block comments first, then line
    // comments — is the exact approach `stripGlslComments` was written to
    // replace: a `/*` inside a line comment pairs with a LATER real block
    // comment and splices out the live code between them, so a kernel that
    // reads a reserved uniform it never declared could pass this check.
    const strippedKernel = stripGlslComments(kernelText);
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
 * Replace every GLSL comment with a single space, the way the driver's lexer
 * does — in ONE left-to-right pass where the first comment opener wins.
 *
 * This must NOT be two independent regex passes (a block-comment strip then a
 * line-comment strip): GLSL lexes comments in a single scan, so a block-open
 * that sits inside a line ("//") comment is inert, and a block-close inside a
 * LATER line comment closes nothing. A block-first regex would instead splice
 * out the live code BETWEEN those two lines, hiding e.g. an injected `uniform`
 * from the structural gate while the driver still compiles it (found by
 * adversarial review). A single scanner that, once inside a line comment,
 * ignores any block-open until the newline is what closes that hole.
 */
export function stripGlslComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      // Line comment → one space; consume up to (not including) the newline.
      out += " ";
      i += 2;
      while (i < n && src[i] !== "\n") i++;
    } else if (c === "/" && next === "*") {
      // Block comment → one space; consume through the closing */ (or EOF).
      out += " ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
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
  text = stripGlslComments(text);
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
    // The signature must open a BODY: `vec4 kernel(vec2 uv);` is a bare
    // prototype that satisfies a signature-only regex, passes "structural
    // validation", and then dies at GPU link with a far less actionable
    // driver message. Requiring the brace keeps the failure at this layer.
    if (!new RegExp(`vec4\\s+${fn}\\s*\\(\\s*vec2\\s+\\w+\\s*\\)\\s*\\{`).test(text)) {
      errors.push(
        `${at}: kernel file must define 'vec4 ${fn}(vec2 uv) { ... }' (with a body) for output '${output}'`,
      );
    }
  }
  for (const stdName of STDLIB_NAMES) {
    if (new RegExp(`(float|vec2|vec3|vec4|uvec2)\\s+${stdName}\\s*\\(`).test(text)) {
      errors.push(`${at}: kernel redefines stdlib function '${stdName}'`);
    }
  }
}
