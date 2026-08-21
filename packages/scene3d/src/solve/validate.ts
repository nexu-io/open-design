import {
  AXES,
  Axis,
  ClaimsSpec,
  Face,
  MAX_PARTS,
  MaterialSpec,
  PartShape,
  PartSpec,
  Relation,
  SceneSpec,
  Vec3,
} from "./types.js";
import { validateShaderSpec } from "../shade/validate.js";
import type { ShaderSpec } from "../shade/types.js";

/**
 * Validate a raw `scene.json` document into a typed SceneSpec.
 *
 * This runs BEFORE any geometry exists — the Kiln discipline: a recipe is
 * schema-checked before execution, so a malformed spec is a parse error with
 * a path ("parts[2].size[1] must be a positive number"), never a Blender
 * traceback. Every message names the JSON path that produced it, because
 * the reader's next action is always to go to that path.
 *
 * The validator is total: it collects every error it can see rather than
 * stopping at the first, so one compile round-trip reports the whole
 * distance to a valid spec.
 */
export function validateSceneSpec(
  raw: unknown,
  /** Contract-derived shader bake bounds (pixel-art scenes lower the floor to
   *  pxPerBlock). Omitted = the PBR default [64, 4096], so non-voxel callers and
   *  the language's own tests are unaffected. */
  opts: { bake?: { min: number; max: number } } = {},
): { spec?: SceneSpec; errors: string[] } {
  const errors: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["scene.json must be a JSON object"] };
  }
  const doc = raw as Record<string, unknown>;

  if (doc.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (doc.name !== undefined && typeof doc.name !== "string") {
    errors.push("name must be a string");
  }

  /* ---- shaders ----------------------------------------------------- */
  // Validated before materials so a material's `shader` reference can be
  // checked against the declared set. Kernel-text checks happen in the
  // pipeline, which owns file I/O; this layer owns the declaration shape.
  const shaders: Record<string, ShaderSpec> = {};
  if (doc.shaders !== undefined) {
    if (doc.shaders === null || typeof doc.shaders !== "object" || Array.isArray(doc.shaders)) {
      errors.push("shaders must be an object of name -> shader");
    } else {
      for (const [name, value] of Object.entries(doc.shaders as Record<string, unknown>)) {
        const result = validateShaderSpec(name, value, undefined, errors, opts.bake);
        if (result) shaders[name] = result.spec;
      }
    }
  }

  /* ---- materials -------------------------------------------------- */
  const materials: Record<string, MaterialSpec> = {};
  if (doc.materials !== undefined) {
    if (doc.materials === null || typeof doc.materials !== "object" || Array.isArray(doc.materials)) {
      errors.push("materials must be an object of name -> material");
    } else {
      for (const [name, value] of Object.entries(doc.materials as Record<string, unknown>)) {
        if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(name)) {
          errors.push(`materials.${name}: material names must match [A-Za-z][A-Za-z0-9_]{2,63}`);
          continue;
        }
        const mat = validateMaterial(name, value, new Set(Object.keys(shaders)), errors);
        if (mat) materials[name] = mat;
      }
    }
  }

  /* ---- parts ------------------------------------------------------ */
  const parts: PartSpec[] = [];
  const partIds = new Set<string>();
  if (!Array.isArray(doc.parts) || doc.parts.length === 0) {
    errors.push("parts must be a non-empty array");
  } else {
    if (doc.parts.length > MAX_PARTS) {
      errors.push(`parts has ${doc.parts.length} entries — the ceiling is ${MAX_PARTS}`);
    }
    doc.parts.forEach((value, index) => {
      const part = validatePart(index, value, materials, errors);
      if (part) {
        if (partIds.has(part.id)) {
          errors.push(`parts[${index}].id '${part.id}' is declared twice`);
        } else {
          partIds.add(part.id);
          parts.push(part);
        }
      }
    });
  }

  /* ---- relations --------------------------------------------------- */
  const relations: Relation[] = [];
  if (!Array.isArray(doc.relations)) {
    errors.push("relations must be an array");
  } else {
    doc.relations.forEach((value, index) => {
      const relation = validateRelation(index, value, errors);
      if (relation) relations.push(relation);
    });
  }

  // A scatter OWNS its part's placement; a repeat translating the same
  // part duplicates the scatter base while squatting the id slots the
  // real scatter instances need — two authorities, garbage out (found by
  // adversarial review). Statically impossible, so statically rejected.
  const repeatTargets = new Set(
    relations.filter((r) => r.type === "repeat").map((r) => (r as { part: string }).part),
  );
  for (const relation of relations) {
    if (relation.type === "scatter" && repeatTargets.has(relation.part)) {
      errors.push(
        `relations: part '${relation.part}' is targeted by both repeat and scatter — scatter owns its part's whole placement; pick one`,
      );
    }
  }

  /* ---- camera / light / claims ------------------------------------ */
  let camera: SceneSpec["camera"];
  if (doc.camera !== undefined) {
    camera = validateCamera(doc.camera, errors);
  }
  let light: SceneSpec["light"];
  if (doc.light !== undefined) {
    if (doc.light === "studio" || doc.light === "sun") light = doc.light;
    else errors.push('light must be "studio" or "sun"');
  }
  let claims: ClaimsSpec | undefined;
  if (doc.claims !== undefined) {
    claims = validateClaims(doc.claims, errors);
  }

  if (errors.length > 0) return { errors };
  return {
    spec: {
      schemaVersion: 1,
      ...(typeof doc.name === "string" ? { name: doc.name } : {}),
      ...(Object.keys(shaders).length > 0 ? { shaders } : {}),
      ...(Object.keys(materials).length > 0 ? { materials } : {}),
      parts,
      relations,
      ...(camera ? { camera } : {}),
      ...(light ? { light } : {}),
      ...(claims ? { claims } : {}),
    },
    errors,
  };
}

const SHAPES: readonly PartShape[] = ["box", "cylinder", "sphere", "cone", "torus"];
const FACES: readonly Face[] = ["x-", "x+", "y-", "y+", "z-", "z+"];

function validatePart(
  index: number,
  value: unknown,
  materials: Record<string, MaterialSpec>,
  errors: string[],
): PartSpec | undefined {
  const at = `parts[${index}]`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${at} must be an object`);
    return undefined;
  }
  const part = value as Record<string, unknown>;
  const before = errors.length;

  // Ids become Blender object names AND string literals in the generated
  // build script; the charset gate is what makes that embedding inert by
  // construction (a raw newline in an id was a Python SyntaxError — found
  // by adversarial review), the same discipline as shader uniform names.
  if (typeof part.id !== "string" || !/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(part.id)) {
    errors.push(`${at}.id must match [A-Za-z][A-Za-z0-9_]{2,63}`);
  }
  const size = validateVec3(`${at}.size`, part.size, errors, { positive: true, min: 1e-5 });
  let shape: PartShape = "box";
  if (part.shape !== undefined) {
    if (SHAPES.includes(part.shape as PartShape)) shape = part.shape as PartShape;
    else errors.push(`${at}.shape must be one of ${SHAPES.join(", ")}`);
  }
  let file: string | undefined;
  if (part.file !== undefined) {
    if (typeof part.file !== "string" || part.file.length === 0) {
      errors.push(`${at}.file must be a non-empty string`);
    } else if (!/\.(glb|gltf|obj|fbx)$/i.test(part.file)) {
      errors.push(`${at}.file '${part.file}' must be a .glb, .gltf, .obj or .fbx asset`);
    } else if (/^([a-zA-Z]:|[\\/])/.test(part.file) || part.file.split(/[\\/]/).includes("..")) {
      errors.push(`${at}.file must be a scene-relative path with no '..'`);
    } else {
      file = part.file.replace(/\\/g, "/");
    }
    if (part.shape !== undefined) {
      errors.push(`${at}: file and shape are mutually exclusive — the file IS the shape`);
    }
    // `material` on a file part is a deliberate OVERRIDE: the imported
    // asset's own materials are replaced wholesale — the retexture-a-
    // download move. Omit it and the asset keeps what it shipped with.
  }
  let axis: Axis = "z";
  if (part.axis !== undefined) {
    if (AXES.includes(part.axis as Axis)) axis = part.axis as Axis;
    else errors.push(`${at}.axis must be x, y or z`);
  }
  if (part.flip !== undefined && typeof part.flip !== "boolean") {
    errors.push(`${at}.flip must be a boolean`);
  }
  if (part.material !== undefined) {
    if (typeof part.material !== "string") {
      errors.push(`${at}.material must be a string`);
    } else if (!(part.material in materials)) {
      errors.push(
        `${at}.material '${part.material}' is not declared in materials — declare it or fix the name`,
      );
    }
  }
  if (part.role !== undefined && typeof part.role !== "string") {
    errors.push(`${at}.role must be a string`);
  }
  let spin: PartSpec["spin"];
  if (part.spin !== undefined) {
    if (part.spin === null || typeof part.spin !== "object" || Array.isArray(part.spin)) {
      errors.push(`${at}.spin must be an object`);
    } else {
      const s = part.spin as Record<string, unknown>;
      const ok =
        (s.axis === undefined || AXES.includes(s.axis as Axis)) &&
        (s.seconds === undefined ||
          (typeof s.seconds === "number" && Number.isFinite(s.seconds) && s.seconds > 0.1));
      if (!ok) errors.push(`${at}.spin: axis must be x/y/z, seconds a number > 0.1`);
      else {
        spin = {
          ...(s.axis !== undefined ? { axis: s.axis as Axis } : {}),
          ...(s.seconds !== undefined ? { seconds: s.seconds as number } : {}),
        };
      }
    }
  }
  let bob: PartSpec["bob"];
  if (part.bob !== undefined) {
    if (part.bob === null || typeof part.bob !== "object" || Array.isArray(part.bob)) {
      errors.push(`${at}.bob must be an object`);
    } else {
      const b = part.bob as Record<string, unknown>;
      const ok =
        typeof b.amplitude === "number" &&
        Number.isFinite(b.amplitude) &&
        b.amplitude > 0 &&
        (b.seconds === undefined ||
          (typeof b.seconds === "number" && Number.isFinite(b.seconds) && b.seconds > 0.1));
      if (!ok) errors.push(`${at}.bob: amplitude must be a positive number, seconds > 0.1`);
      else {
        bob = {
          amplitude: b.amplitude as number,
          ...(b.seconds !== undefined ? { seconds: b.seconds as number } : {}),
        };
      }
    }
  }

  // A torus's cross-section must fit inside its box: the tube diameter is
  // the extent along its axis, and the ring needs room for tube on both
  // sides across the other two.
  if (shape === "torus" && size) {
    const across = AXES.filter((a) => a !== axis).map((a) => size[AXES.indexOf(a)]!);
    const tube = size[AXES.indexOf(axis)]!;
    if (Math.abs(across[0]! - across[1]!) > 1e-9) {
      errors.push(
        `${at}: a torus must be circular across its axis — the two cross extents are ${across[0]} and ${across[1]}`,
      );
    }
    if (across[0]! <= 2 * tube) {
      errors.push(
        `${at}: torus tube diameter ${tube} does not fit its ring diameter ${across[0]} — the ring extent must exceed twice the tube extent`,
      );
    }
  }

  if (errors.length > before || !size) return undefined;
  return {
    id: part.id as string,
    size,
    ...(file !== undefined ? { file } : {}),
    ...(shape !== "box" ? { shape } : {}),
    ...(axis !== "z" ? { axis } : {}),
    ...(part.flip === true ? { flip: true } : {}),
    ...(typeof part.material === "string" ? { material: part.material } : {}),
    ...(typeof part.role === "string" ? { role: part.role } : {}),
    ...(spin ? { spin } : {}),
    ...(bob ? { bob } : {}),
  };
}

function validateMaterial(
  name: string,
  value: unknown,
  shaderNames: Set<string>,
  errors: string[],
): MaterialSpec | undefined {
  const at = `materials.${name}`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${at} must be an object`);
    return undefined;
  }
  const mat = value as Record<string, unknown>;
  const before = errors.length;
  let shader: string | undefined;
  if (mat.shader !== undefined) {
    if (typeof mat.shader !== "string") {
      errors.push(`${at}.shader must be a string`);
    } else if (!shaderNames.has(mat.shader)) {
      errors.push(`${at}.shader '${mat.shader}' is not declared in shaders — declare it or fix the name`);
    } else {
      shader = mat.shader;
    }
  }
  // A shader material's surface comes from the bake; without a shader the
  // base colour is the material, so it is required.
  let baseColor: [number, number, number] | undefined;
  if (mat.baseColor !== undefined || shader === undefined) {
    baseColor = validateColor(`${at}.baseColor`, mat.baseColor, errors);
  }
  const roughness = validateUnit(`${at}.roughness`, mat.roughness, errors);
  let metallic: number | undefined;
  if (mat.metallic !== undefined) {
    if (mat.metallic === 0 || mat.metallic === 1) metallic = mat.metallic;
    else errors.push(`${at}.metallic must be 0 or 1 — in-between metallic is physically meaningless and the pbr rule rejects it`);
  }
  let emission: [number, number, number] | undefined;
  if (mat.emission !== undefined) emission = validateColor(`${at}.emission`, mat.emission, errors);
  let emissionStrength: number | undefined;
  if (mat.emissionStrength !== undefined) {
    if (typeof mat.emissionStrength === "number" && mat.emissionStrength >= 0 && Number.isFinite(mat.emissionStrength)) {
      emissionStrength = mat.emissionStrength;
    } else {
      errors.push(`${at}.emissionStrength must be a non-negative number`);
    }
  }
  // A shader material may bake its emission colour, making a strength
  // without an authored colour legitimate; a plain material glowing at
  // strength N with no colour is still a mistake.
  if (emissionStrength !== undefined && emission === undefined && shader === undefined) {
    errors.push(`${at}.emissionStrength is set but emission is not — set the emission colour`);
  }
  const alpha = validateUnit(`${at}.alpha`, mat.alpha, errors);

  if (errors.length > before || (!baseColor && shader === undefined)) return undefined;
  return {
    ...(shader !== undefined ? { shader } : {}),
    ...(baseColor ? { baseColor } : {}),
    ...(roughness !== undefined ? { roughness } : {}),
    ...(metallic !== undefined ? { metallic } : {}),
    ...(emission ? { emission } : {}),
    ...(emissionStrength !== undefined ? { emissionStrength } : {}),
    ...(alpha !== undefined ? { alpha } : {}),
  };
}

function validateRelation(index: number, value: unknown, errors: string[]): Relation | undefined {
  const at = `relations[${index}]`;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${at} must be an object`);
    return undefined;
  }
  const rel = value as Record<string, unknown>;
  const before = errors.length;
  const str = (key: string): string | undefined => {
    if (typeof rel[key] === "string" && (rel[key] as string).length > 0) return rel[key] as string;
    errors.push(`${at}.${key} must be a non-empty string`);
    return undefined;
  };
  const optNum = (key: string): number | undefined => {
    if (rel[key] === undefined) return undefined;
    if (typeof rel[key] === "number" && Number.isFinite(rel[key] as number)) return rel[key] as number;
    errors.push(`${at}.${key} must be a finite number`);
    return undefined;
  };
  const axisOf = (key: string): Axis | undefined => {
    if (AXES.includes(rel[key] as Axis)) return rel[key] as Axis;
    errors.push(`${at}.${key} must be x, y or z`);
    return undefined;
  };

  switch (rel.type) {
    case "at": {
      const part = str("part");
      const center = validateVec3(`${at}.center`, rel.center, errors);
      if (errors.length > before || !part || !center) return undefined;
      return { type: "at", part, center };
    }
    case "sits_on": {
      const part = str("part");
      const on = str("on");
      const embed = optNum("embed");
      if (errors.length > before || !part || !on) return undefined;
      return { type: "sits_on", part, on, ...(embed !== undefined ? { embed } : {}) };
    }
    case "above": {
      const part = str("part");
      const over = str("over");
      const clearance = optNum("clearance");
      if (errors.length > before || !part || !over) return undefined;
      return { type: "above", part, over, ...(clearance !== undefined ? { clearance } : {}) };
    }
    case "align": {
      const part = str("part");
      const to = str("to");
      let axes: Axis[] | undefined;
      if (!Array.isArray(rel.axes) || rel.axes.length === 0 || !rel.axes.every((a) => AXES.includes(a as Axis))) {
        errors.push(`${at}.axes must be a non-empty array of x/y/z`);
      } else {
        axes = rel.axes as Axis[];
      }
      if (errors.length > before || !part || !to || !axes) return undefined;
      return { type: "align", part, to, axes };
    }
    case "inset_from": {
      const part = str("part");
      const from = str("from");
      const by = optNum("by");
      let faces: Face[] | undefined;
      if (!Array.isArray(rel.faces) || rel.faces.length === 0 || !rel.faces.every((f) => FACES.includes(f as Face))) {
        errors.push(`${at}.faces must be a non-empty array of x-/x+/y-/y+/z-/z+`);
      } else {
        faces = rel.faces as Face[];
      }
      if (errors.length > before || !part || !from || !faces) return undefined;
      return { type: "inset_from", part, from, faces, ...(by !== undefined ? { by } : {}) };
    }
    case "span": {
      const part = str("part");
      const from = str("from");
      const to = str("to");
      const axis = axisOf("axis");
      const embed = optNum("embed");
      if (errors.length > before || !part || !from || !to || !axis) return undefined;
      return { type: "span", part, from, to, axis, ...(embed !== undefined ? { embed } : {}) };
    }
    case "repeat": {
      const part = str("part");
      const along = axisOf("along");
      let count: number | undefined;
      if (typeof rel.count === "number" && Number.isInteger(rel.count) && rel.count >= 2) {
        count = rel.count;
      } else {
        errors.push(`${at}.count must be an integer >= 2`);
      }
      let every: number | undefined;
      if (typeof rel.every === "number" && Number.isFinite(rel.every) && rel.every > 0) {
        every = rel.every;
      } else {
        errors.push(`${at}.every must be a positive number (centre-to-centre pitch in metres)`);
      }
      if (errors.length > before || !part || !along || count === undefined || every === undefined) {
        return undefined;
      }
      return { type: "repeat", part, count, along, every };
    }
    case "scatter": {
      const part = str("part");
      const on = str("on");
      let count: number | undefined;
      if (typeof rel.count === "number" && Number.isInteger(rel.count) && rel.count >= 1) {
        count = rel.count;
      } else {
        errors.push(`${at}.count must be an integer >= 1`);
      }
      let seed: number | undefined;
      if (rel.seed !== undefined) {
        if (typeof rel.seed === "number" && Number.isInteger(rel.seed)) seed = rel.seed;
        else errors.push(`${at}.seed must be an integer`);
      }
      let minGap: number | undefined;
      if (rel.minGap !== undefined) {
        if (typeof rel.minGap === "number" && Number.isFinite(rel.minGap) && rel.minGap >= 0) {
          minGap = rel.minGap;
        } else {
          errors.push(`${at}.minGap must be a non-negative number`);
        }
      }
      let sizeJitter: number | undefined;
      if (rel.sizeJitter !== undefined) {
        if (
          typeof rel.sizeJitter === "number" &&
          Number.isFinite(rel.sizeJitter) &&
          rel.sizeJitter >= 0 &&
          rel.sizeJitter < 0.9
        ) {
          sizeJitter = rel.sizeJitter;
        } else {
          errors.push(`${at}.sizeJitter must be a number in [0, 0.9)`);
        }
      }
      const embed = optNum("embed");
      if (errors.length > before || !part || !on || count === undefined) return undefined;
      return {
        type: "scatter",
        part,
        on,
        count,
        ...(seed !== undefined ? { seed } : {}),
        ...(minGap !== undefined ? { minGap } : {}),
        ...(sizeJitter !== undefined ? { sizeJitter } : {}),
        ...(embed !== undefined ? { embed } : {}),
      };
    }
    default:
      errors.push(
        `${at}.type '${String(rel.type)}' is not a relation — expected at, sits_on, above, align, inset_from, span, repeat or scatter`,
      );
      return undefined;
  }
}

function validateCamera(value: unknown, errors: string[]): SceneSpec["camera"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push("camera must be an object");
    return undefined;
  }
  const cam = value as Record<string, unknown>;
  const before = errors.length;
  const num = (key: string, min: number, max: number): number | undefined => {
    if (cam[key] === undefined) return undefined;
    const v = cam[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) return v;
    errors.push(`camera.${key} must be a number in [${min}, ${max}]`);
    return undefined;
  };
  const azimuthDeg = num("azimuthDeg", -360, 360);
  const elevationDeg = num("elevationDeg", -89, 89);
  const distance = num("distance", 1, 20);
  if (errors.length > before) return undefined;
  return {
    ...(azimuthDeg !== undefined ? { azimuthDeg } : {}),
    ...(elevationDeg !== undefined ? { elevationDeg } : {}),
    ...(distance !== undefined ? { distance } : {}),
  };
}

function validateClaims(value: unknown, errors: string[]): ClaimsSpec | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push("claims must be an object");
    return undefined;
  }
  const claims = value as Record<string, unknown>;
  const before = errors.length;
  const out: ClaimsSpec = {};
  if (claims.parts !== undefined) {
    if (typeof claims.parts === "number" && Number.isInteger(claims.parts) && claims.parts > 0) {
      out.parts = claims.parts;
    } else {
      errors.push("claims.parts must be a positive integer");
    }
  }
  if (claims.maxTriangles !== undefined) {
    if (typeof claims.maxTriangles === "number" && claims.maxTriangles > 0) {
      out.maxTriangles = claims.maxTriangles;
    } else {
      errors.push("claims.maxTriangles must be a positive number");
    }
  }
  if (claims.grounded !== undefined) {
    if (typeof claims.grounded === "boolean") out.grounded = claims.grounded;
    else errors.push("claims.grounded must be a boolean");
  }
  if (claims.maxHeight !== undefined) {
    if (typeof claims.maxHeight === "number" && claims.maxHeight > 0) out.maxHeight = claims.maxHeight;
    else errors.push("claims.maxHeight must be a positive number");
  }
  if (claims.footprint !== undefined) {
    if (
      Array.isArray(claims.footprint) &&
      claims.footprint.length === 2 &&
      claims.footprint.every((v) => typeof v === "number" && v > 0)
    ) {
      out.footprint = claims.footprint as [number, number];
    } else {
      errors.push("claims.footprint must be [x, y] with positive numbers");
    }
  }
  if (claims.watertight !== undefined) {
    if (typeof claims.watertight === "boolean") out.watertight = claims.watertight;
    else errors.push("claims.watertight must be a boolean");
  }
  if (claims.materialsUsed !== undefined) {
    if (Array.isArray(claims.materialsUsed) && claims.materialsUsed.every((v) => typeof v === "string")) {
      out.materialsUsed = claims.materialsUsed as string[];
    } else {
      errors.push("claims.materialsUsed must be an array of material names");
    }
  }
  if (errors.length > before) return undefined;
  return out;
}

function validateVec3(
  at: string,
  value: unknown,
  errors: string[],
  options: { positive?: boolean; min?: number } = {},
): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    errors.push(`${at} must be [x, y, z]`);
    return undefined;
  }
  for (let i = 0; i < 3; i++) {
    const v = value[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${at}[${i}] must be a finite number`);
      return undefined;
    }
    if (options.positive && v <= 0) {
      errors.push(`${at}[${i}] must be a positive number`);
      return undefined;
    }
    // A floor below any real-world part catches a unit slip (a 1e-9 or 1e-12
    // "metre" that meant millimetres, or a stray exponent) at validation time,
    // with a JSON path, instead of as a degenerate-geometry cascade after the
    // build. Well below a fine detail part (0.01mm), well above the slips.
    if (options.min !== undefined && v > 0 && v < options.min) {
      errors.push(
        `${at}[${i}] is ${v}m, below the ${options.min}m minimum — this is almost certainly a unit slip (metres vs millimetres?)`,
      );
      return undefined;
    }
  }
  return [value[0], value[1], value[2]] as Vec3;
}

function validateColor(at: string, value: unknown, errors: string[]): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3) {
    errors.push(`${at} must be [r, g, b] with components in 0-1`);
    return undefined;
  }
  for (let i = 0; i < 3; i++) {
    const v = value[i];
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      errors.push(`${at}[${i}] must be a number in 0-1`);
      return undefined;
    }
  }
  return [value[0], value[1], value[2]] as [number, number, number];
}

function validateUnit(at: string, value: unknown, errors: string[]): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) return value;
  errors.push(`${at} must be a number in 0-1`);
  return undefined;
}

/**
 * Line number of each part and material declaration in the raw scene.json
 * text, for issue provenance: a lint finding about `prp_post_3` should point
 * at the `"id": "prp_post"` line that exists, not at a generated script the
 * author never wrote. Best-effort by design — a formatting the scan cannot
 * see costs a line number, never a compile.
 */
export function specDeclarationLines(text: string): Record<string, number> {
  const lines = text.split(/\r?\n/);
  const out: Record<string, number> = {};
  let inMaterials = false;
  let materialsDepth = 0;
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // Part ids: `"id": "name"` anywhere in the document.
    const id = line.match(/"id"\s*:\s*"([^"]+)"/);
    if (id) out[id[1]!] = i + 1;
    // Material names: keys nested directly inside the `materials` object.
    if (/"materials"\s*:\s*\{/.test(line)) {
      inMaterials = true;
      materialsDepth = depth + 1;
    }
    for (const ch of line) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (inMaterials && depth < materialsDepth) inMaterials = false;
      }
    }
    if (inMaterials) {
      const key = line.match(/^\s*"([^"]+)"\s*:\s*\{/);
      if (key && key[1] !== "materials") out[key[1]!] = i + 1;
    }
  }
  return out;
}
