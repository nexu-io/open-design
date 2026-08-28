import {
  AUTOFIT_DISTANCE,
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
import { didYouMean } from "./did-you-mean.js";
import { shapeViolations } from "./shape-sanity.js";
import {
  ALPHA_MODES,
  MATERIAL_CHANNELS,
  SHADER_OUTPUTS,
  type ChannelDef,
} from "./channels.js";
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
/**
 * The JSON comment convention: a key that is (or begins with) `//` is the
 * author talking to the next reader, not vocabulary — the golem fixture and
 * real field scenes both carry them. Ignored by every unknown-key check, so
 * strictness about typos never costs the language its margin notes.
 */
export function isCommentKey(key: string): boolean {
  return key.startsWith("//");
}

export function validateSceneSpec(
  raw: unknown,
  /** Contract-derived shader bake bounds (pixel-art scenes lower the floor to
   *  pxPerBlock). Omitted = the PBR default [64, 4096], so non-voxel callers and
   *  the language's own tests are unaffected. */
  opts: { bake?: { min: number; max: number } } = {},
): { spec?: SceneSpec; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  /** Valid-but-suspect authoring (mapped to S3D-W-105 by the pipeline):
   *  the spec compiles exactly as written; each entry names something the
   *  author almost certainly did not mean. */
  const warnings: string[] = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["scene.json must be a JSON object"], warnings };
  }
  const doc = raw as Record<string, unknown>;

  if (doc.schemaVersion !== 1) {
    // Missing and wrong are different edits; say which one this is.
    errors.push(
      doc.schemaVersion === undefined
        ? 'schemaVersion is missing — add "schemaVersion": 1'
        : `schemaVersion must be 1 (got ${JSON.stringify(doc.schemaVersion)})`,
    );
  }
  if (doc.name !== undefined && typeof doc.name !== "string") {
    errors.push("name must be a string");
  }

  /* ---- shaders ----------------------------------------------------- */
  // Validated before materials so a material's `shader` reference can be
  // checked against the declared set. Kernel-text checks happen in the
  // pipeline, which owns file I/O; this layer owns the declaration shape.
  // Null-prototype for the same reason as `materials` below.
  const shaders: Record<string, ShaderSpec> = Object.create(null);
  // Every shader name the author WROTE, valid or not — the same split the
  // materials below keep. "Is this declared" and "is the declaration well-
  // formed" are different questions: a material referencing a shader whose
  // own block just failed used to be told "not declared — declare it or fix
  // the name", advice for a problem the author did not have, and then got a
  // second false error demanding the baseColor fallback the (declared!)
  // shader makes unnecessary. One wrong key produced three errors, two of
  // them pointing away from the cause.
  const declaredShaders = new Set<string>();
  if (doc.shaders !== undefined) {
    if (doc.shaders === null || typeof doc.shaders !== "object" || Array.isArray(doc.shaders)) {
      errors.push("shaders must be an object of name -> shader");
    } else {
      for (const [name, value] of Object.entries(doc.shaders as Record<string, unknown>)) {
        // The margin-note convention holds inside the NAME MAPS too: a `//`
        // sibling of shd_rust used to be refused as a badly named shader,
        // steering the author toward renaming their own comment.
        if (isCommentKey(name)) continue;
        declaredShaders.add(name);
        const result = validateShaderSpec(name, value, undefined, errors, opts.bake);
        if (result) shaders[name] = result.spec;
      }
    }
  }

  /* ---- materials -------------------------------------------------- */
  // NULL-prototype: every membership test on this map (`in`, indexing,
  // hasOwnProperty via a part's material reference) must see only what the
  // author declared. A plain `{}` inherits Object.prototype, so a part
  // whose material was named `toString` or `constructor` validated against
  // a declaration that does not exist and then resolved to an inherited
  // FUNCTION downstream.
  const materials: Record<string, MaterialSpec> = Object.create(null);
  // Every name the author WROTE, valid or not. Kept apart from `materials`,
  // which holds only the ones that survived validation, because "did you
  // declare this" and "is this declaration well-formed" are different
  // questions and only the first one belongs in a part's error message.
  const declaredMaterials = new Set<string>();
  if (doc.materials !== undefined) {
    if (doc.materials === null || typeof doc.materials !== "object" || Array.isArray(doc.materials)) {
      errors.push("materials must be an object of name -> material");
    } else {
      for (const [name, value] of Object.entries(doc.materials as Record<string, unknown>)) {
        if (isCommentKey(name)) continue;
        declaredMaterials.add(name);
        if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(name)) {
          errors.push(
            `materials.${name}: material names must match [A-Za-z][A-Za-z0-9_]{2,63} — 3-64 characters, starting with a letter, then letters, digits or underscores`,
          );
          continue;
        }
        const mat = validateMaterial(name, value, new Set(Object.keys(shaders)), declaredShaders, errors);
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
      const part = validatePart(index, value, materials, declaredMaterials, errors);
      if (part) {
        if (partIds.has(part.id)) {
          errors.push(`parts[${index}].id '${part.id}' is declared twice`);
        } else {
          partIds.add(part.id);
          parts.push(part);
          // The MIRROR of the tiny-size unit-slip floor: metres-read-as-
          // millimetres is an error at 1e-5m, but millimetres-read-as-
          // metres sailed through with no comment at any size. A warning,
          // not an error — a 15km terrain can be meant — with the same
          // hint the floor carries.
          const hugeAxis = part.size.findIndex((v) => v > MAX_SANE_DIMENSION);
          if (hugeAxis >= 0) {
            warnings.push(
              `parts[${index}].size[${hugeAxis}] is ${part.size[hugeAxis]}m — ${(part.size[hugeAxis]! / 1000).toFixed(0)}km of one part; verify the units (millimetres written as metres?)`,
            );
          }
          // A rotation about a shape's own continuous symmetry axis maps
          // the shape onto itself — the box is unchanged, the geometry is
          // unchanged, nothing downstream can see it. The same "you wrote
          // something that does nothing" family as W-801 (unused shader).
          if (part.rotate && rotationIsInert(part)) {
            warnings.push(
              `parts[${index}].rotate does nothing — a ${part.shape ?? "box"} is rotationally symmetric about its ${part.rotate.axis} axis, so this rotation has no geometric effect; delete it or rotate about a different axis`,
            );
          }
        }
      }
    });
  }

  /* ---- relations --------------------------------------------------- */
  // Every part id the author WROTE, valid or not — the declared/validated
  // split again, so a relation referencing a part whose own declaration
  // failed is not also told the part "is not declared" (the D4 cascade
  // class, at the parts layer).
  const declaredPartIds = new Set<string>(
    Array.isArray(doc.parts)
      ? doc.parts
          .map((p) => (p as { id?: unknown } | null)?.id)
          .filter((id): id is string => typeof id === "string")
      : [],
  );
  const relations: Relation[] = [];
  if (!Array.isArray(doc.relations)) {
    errors.push("relations must be an array");
  } else {
    doc.relations.forEach((value, index) => {
      const relation = validateRelation(index, value, errors);
      if (relation) {
        relations.push(relation);
        // Reference integrity at SCHEMA time, matching materials: a
        // relation naming a part that does not exist is the same class of
        // mistake as a part naming an undeclared material, and it used to
        // earn a different code (E-106) a stage later, plus a cascade.
        // Same code, same shape, same did-you-mean, right here.
        const refs: Array<[string, string]> = [["part", relation.part]];
        if (relation.type === "sits_on") refs.push(["on", relation.on]);
        if (relation.type === "above") refs.push(["over", relation.over]);
        if (relation.type === "align") refs.push(["to", relation.to]);
        if (relation.type === "inset_from") refs.push(["from", relation.from]);
        if (relation.type === "span") refs.push(["from", relation.from], ["to", relation.to]);
        if (relation.type === "scatter") refs.push(["on", relation.on]);
        if (relation.type === "around") refs.push(["center", relation.center]);
        for (const [field, id] of refs) {
          if (declaredPartIds.has(id)) continue;
          const known = [...declaredPartIds];
          const shown = known.slice(0, 8).join(", ");
          const more = known.length > 8 ? ` +${known.length - 8} more` : "";
          errors.push(
            `relations[${index}].${field} '${id}' is not a declared part — ${didYouMean(id, declaredPartIds)}declared parts: ${shown}${more}`,
          );
        }
      }
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

  // `around` owns its part's placement in the circle's plane AND mints the
  // ring's instances from it, so every other authority over either of those
  // is the repeat×scatter situation again: two generators, colliding id
  // slots, and a base pulled in two directions. Statically impossible, so
  // statically refused rather than resolved in whichever ran last.
  const aroundCounts = new Map<string, number>();
  for (const relation of relations) {
    if (relation.type === "around") {
      aroundCounts.set(relation.part, (aroundCounts.get(relation.part) ?? 0) + 1);
    }
  }
  for (const [part, times] of aroundCounts) {
    if (times > 1) {
      errors.push(
        `relations: part '${part}' is targeted by ${times} around relations — a part sits on one ring; compose rings by ringing different parts`,
      );
    }
  }
  for (const relation of relations) {
    if (!aroundCounts.has(relation.part)) continue;
    if (relation.type === "repeat") {
      errors.push(
        `relations: part '${relation.part}' is targeted by both around and repeat — both mint instances from the same base and both claim its position; pick one`,
      );
    } else if (relation.type === "scatter") {
      errors.push(
        `relations: part '${relation.part}' is targeted by both around and scatter — scatter owns its part's whole placement; pick one`,
      );
    } else if (relation.type === "span") {
      errors.push(
        `relations: part '${relation.part}' is both spanned and placed around a centre — a span solves the part's extent and position between two anchors, which the ring would immediately un-solve; ring a part that is not spanned`,
      );
    }
  }
  // `orient` composes a rotation the author did not write onto every instance.
  // Composing it with an authored rotation about the SAME axis is arithmetic
  // (the degrees add); composing it with a DIFFERENT axis is a second rotation
  // axis, which this language does not carry — so it is named, not guessed at.
  const rotationAxis = new Map(
    parts.filter((p) => p.rotate !== undefined).map((p) => [p.id, p.rotate!.axis]),
  );
  for (const relation of relations) {
    if (relation.type !== "around" || relation.orient !== true) continue;
    const circleAxis = relation.axis ?? "z";
    const authored = rotationAxis.get(relation.part);
    if (authored !== undefined && authored !== circleAxis) {
      errors.push(
        `relations: orient composes a rotation about ${circleAxis} onto the clones, and '${relation.part}' already rotates about ${authored} — one axis per part for now`,
      );
    }
  }

  // A span SOLVES one of the part's extents on a world axis; a rotation
  // turns the part off that axis, so the extent the span computed is no
  // longer the extent the part has. Two authorities over one number, and no
  // arithmetic reconciles them — statically impossible, so statically
  // refused rather than silently resolved in the solver's favour.
  const rotatedParts = new Set(parts.filter((p) => p.rotate !== undefined).map((p) => p.id));
  for (const relation of relations) {
    if (relation.type === "span" && rotatedParts.has(relation.part)) {
      errors.push(
        `relations: part '${relation.part}' is both spanned and rotated — a span solves the part's size on a world axis, which a rotation would un-solve; rotate the parts it spans between instead, or place this one without a span`,
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
    light = validateLight(doc.light, errors);
  }
  let claims: ClaimsSpec | undefined;
  if (doc.claims !== undefined) {
    claims = validateClaims(doc.claims, errors);
  }

  // Unknown top-level keys are refused for the same reason unknown part keys
  // are: a top-level typo (`"claim"` instead of `"claims"`, `"cam"` instead
  // of `"camera"`) compiled clean and adjudicated nothing, silently.
  const KNOWN_TOP_LEVEL_KEYS = new Set([
    "schemaVersion", "name", "shaders", "materials", "parts", "relations", "camera", "light", "claims",
  ]);
  /* Keys that are real vocabulary in the OTHER file. `target` written into
     scene.json is the likeliest cross-file slip (the voxel/minecraft switch
     lives in the contract), and no within-file did-you-mean can rescue it —
     nothing in this file's vocabulary is near it. Say which file wants it. */
  const CONTRACT_KEYS = new Set(["target", "conventions", "proof", "export", "sheets"]);
  for (const key of Object.keys(doc)) {
    if (isCommentKey(key)) continue;
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      errors.push(
        CONTRACT_KEYS.has(key)
          ? `${key} is not a scene.json field — it belongs in scene3d.json (the contract) beside this file; move it there and compile again`
          : `${key} is not a scene.json field — ${didYouMean(key, KNOWN_TOP_LEVEL_KEYS)}known fields: ${[...KNOWN_TOP_LEVEL_KEYS].join(", ")}`,
      );
    }
  }

  if (errors.length > 0) return { errors, warnings };
  return {
    warnings,
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

const SHAPES: readonly PartShape[] = [
  "box", "cylinder", "sphere", "cone", "torus", "wedge", "tube", "capsule",
];

/**
 * One part dimension past this (in metres) is almost always millimetres
 * written as metres — the mirror of the 1e-5m floor, warned rather than
 * refused because a 15km terrain CAN be meant.
 */
const MAX_SANE_DIMENSION = 10_000;

/**
 * True when the authored `rotate` maps the shape's occupied volume onto
 * itself — a continuous symmetry, so the rotation is provably invisible to
 * every downstream consumer. The exact mirror of the sweep module's
 * spinSymmetric, over the authored (local) box: revolution solids about
 * their own axis with a circular cross-section, and spheroids about any
 * principal axis with equal cross extents. `file`/`script` parts never
 * qualify (their content is not the declared shape).
 */
function rotationIsInert(part: PartSpec): boolean {
  const rotate = part.rotate;
  if (!rotate || part.file || part.script) return false;
  const shape = part.shape ?? "box";
  const equalCross = (about: Axis): boolean => {
    const [u, v] = crossExtents(part.size, about);
    return Math.abs(u - v) <= CIRCULAR_TOLERANCE;
  };
  if (shape === "sphere") return equalCross(rotate.axis);
  if (
    shape === "cylinder" ||
    shape === "cone" ||
    shape === "tube" ||
    shape === "capsule" ||
    shape === "torus"
  ) {
    const own = part.axis ?? "z";
    return rotate.axis === own && equalCross(own);
  }
  return false;
}

/**
 * How far two extents may differ and still count as the same measurement.
 *
 * The round shapes (torus, tube, capsule) have a CIRCULAR cross-section, so
 * the two box extents across their axis are the same physical quantity
 * written twice. This tolerance exists only to forgive the last bit of a
 * decimal literal, never to accept an ellipse the author meant.
 */
const CIRCULAR_TOLERANCE = 1e-9;

/** The two box extents across a part's axis, in AXES order. */
function crossExtents(size: Vec3, axis: Axis): [number, number] {
  const across = AXES.filter((a) => a !== axis).map((a) => size[AXES.indexOf(a)]!);
  return [across[0]!, across[1]!];
}
const FACES: readonly Face[] = ["x-", "x+", "y-", "y+", "z-", "z+"];

/** Every word `relations[].type` accepts, in the order the refusal lists them. */
const RELATION_TYPES = [
  "at", "sits_on", "above", "align", "inset_from", "span", "repeat", "scatter", "around",
] as const;

function validatePart(
  index: number,
  value: unknown,
  materials: Record<string, MaterialSpec>,
  /** Names the author wrote, including ones whose declaration was rejected. */
  declaredMaterials: Set<string>,
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
    errors.push(
      `${at}.id must match [A-Za-z][A-Za-z0-9_]{2,63} — 3-64 characters, starting with a letter, then letters, digits or underscores`,
    );
  }
  const size = validateVec3(`${at}.size`, part.size, errors, { positive: true, min: 1e-5 });
  let shape: PartShape = "box";
  if (part.shape !== undefined) {
    if (SHAPES.includes(part.shape as PartShape)) shape = part.shape as PartShape;
    else {
      // Enum VALUES deserve the same near-miss rescue field names get:
      // "cylindar" is one character from a listed shape, and a message
      // that only recites the list makes the author diff it by eye.
      const guess = typeof part.shape === "string" ? didYouMean(part.shape, SHAPES).trim() : "";
      errors.push(`${at}.shape must be one of ${SHAPES.join(", ")}${guess ? ` — ${guess}` : ""}`);
    }
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
  let script: string | undefined;
  if (part.script !== undefined) {
    if (typeof part.script !== "string" || part.script.length === 0) {
      errors.push(`${at}.script must be a non-empty string`);
    } else if (!/\.py$/i.test(part.script)) {
      errors.push(`${at}.script '${part.script}' must be a .py file`);
    } else if (/^([a-zA-Z]:|[\\/])/.test(part.script) || part.script.split(/[\\/]/).includes("..")) {
      errors.push(`${at}.script must be a scene-relative path with no '..'`);
    } else {
      script = part.script.replace(/\\/g, "/");
    }
    // One authority per part: the box is filled by a primitive OR an asset
    // OR a script, never two. A silent winner would make "which geometry
    // shipped" unanswerable from the source.
    if (part.shape !== undefined) {
      errors.push(`${at}: script and shape are mutually exclusive — the script IS the shape`);
    }
    if (file !== undefined || part.file !== undefined) {
      errors.push(`${at}: script and file are mutually exclusive — one filler per box`);
    }
    if (part.axis !== undefined) {
      errors.push(`${at}: axis has no meaning on a script part — the script owns its own orientation`);
    }
    if (part.flip !== undefined) {
      errors.push(`${at}: flip has no meaning on a script part — flip the geometry in the script`);
    }
  }
  let recipe: string | undefined;
  if (part.recipe !== undefined) {
    if (typeof part.recipe !== "string" || part.recipe.length === 0) {
      errors.push(`${at}.recipe must be a non-empty string`);
    } else if (!/\.py$/i.test(part.recipe)) {
      errors.push(`${at}.recipe '${part.recipe}' must be a .py file`);
    } else if (/^([a-zA-Z]:|[\\/])/.test(part.recipe) || part.recipe.split(/[\\/]/).includes("..")) {
      errors.push(`${at}.recipe must be a scene-relative path with no '..'`);
    } else {
      recipe = part.recipe.replace(/\\/g, "/");
    }
    // One authority per box: a recipe authors the geometry through the kernel,
    // so it cannot share the box with a primitive, an imported asset, or a
    // bpy script — a silent winner would make "which geometry shipped"
    // unanswerable from the source.
    if (part.shape !== undefined) {
      errors.push(`${at}: recipe and shape are mutually exclusive — the recipe IS the shape`);
    }
    if (file !== undefined || part.file !== undefined) {
      errors.push(`${at}: recipe and file are mutually exclusive — one filler per box`);
    }
    if (script !== undefined || part.script !== undefined) {
      errors.push(`${at}: recipe and script are mutually exclusive — one filler per box`);
    }
    if (part.axis !== undefined) {
      errors.push(`${at}: axis has no meaning on a recipe part — the recipe owns its own orientation`);
    }
    if (part.flip !== undefined) {
      errors.push(`${at}: flip has no meaning on a recipe part — flip the geometry in the recipe`);
    }
  }
  let axis: Axis = "z";
  if (part.axis !== undefined) {
    if (AXES.includes(part.axis as Axis)) axis = part.axis as Axis;
    else errors.push(`${at}.axis must be x, y or z`);
  }
  if (part.flip !== undefined && typeof part.flip !== "boolean") {
    errors.push(`${at}.flip must be a boolean`);
  }
  // Shape parameters belong to ONE shape each. A `tip` on a box or a
  // `thickness` on a sphere is a sentence the author believes they said —
  // the same reason unknown keys are refused below — so the refusal names
  // the shape the word belongs to rather than quietly ignoring it.
  let tip: number | undefined;
  if (part.tip !== undefined) {
    if (shape !== "cone") {
      errors.push(
        `${at}.tip is a cone field — this part's shape is '${shape}', and only a cone has a tip to cut off`,
      );
    } else if (
      typeof part.tip !== "number" ||
      !Number.isFinite(part.tip) ||
      part.tip < 0 ||
      part.tip >= 1
    ) {
      errors.push(
        `${at}.tip must be a number from 0 up to but not including 1 — it is the top diameter as a fraction of the base diameter, so 0 is a point and 0.6 is a truncated cone; at 1 the shape is a cylinder, which is its own shape`,
      );
    } else {
      tip = part.tip;
    }
  }
  let thickness: number | undefined;
  if (shape === "tube") {
    if (part.thickness === undefined) {
      errors.push(
        `${at}.thickness is required on a tube — a hollow shape's wall thickness in metres, measured inward from the outer surface, is the one fact its bounding box cannot carry`,
      );
    } else if (
      typeof part.thickness !== "number" ||
      !Number.isFinite(part.thickness) ||
      part.thickness <= 0
    ) {
      errors.push(`${at}.thickness must be a positive number of metres`);
    } else {
      thickness = part.thickness;
    }
  } else if (part.thickness !== undefined) {
    errors.push(
      `${at}.thickness is a tube field — this part's shape is '${shape}', and only a hollow shape has a wall`,
    );
  }
  if (part.material !== undefined) {
    if (typeof part.material !== "string") {
      errors.push(`${at}.material must be a string`);
    } else if (!(part.material in materials) && !declaredMaterials.has(part.material)) {
      // Only when the name appears NOWHERE. A material that was declared and
      // then rejected already produced its own precise error; adding "is not
      // declared in materials — declare it or fix the name" on top of it told
      // the author to do something they had already done, and pointed away
      // from the real fault.
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
      const spinBefore = errors.length;
      // The unknown-key gate every sub-object carries (rotate and screw
      // already did) — without it `spin: { rpm: 30 }`, the natural first
      // guess, compiled clean and spun at the default speed, and the
      // documented "did you mean" promise was false for exactly the two
      // motion objects an author reaches for first.
      const KNOWN_SPIN_KEYS = new Set(["axis", "seconds"]);
      for (const key of Object.keys(s)) {
        if (isCommentKey(key)) continue;
        if (!KNOWN_SPIN_KEYS.has(key)) {
          errors.push(
            `${at}.spin.${key} is not a spin field — ${didYouMean(key, KNOWN_SPIN_KEYS)}known fields: axis, seconds (one full turn per "seconds" about "axis"; for a turn rate, seconds = 60 / rpm)`,
          );
        }
      }
      // Each field reports for itself — a bad axis and a bad seconds value
      // are two separate mistakes, and a combined message left the author
      // unsure which of the two they actually got wrong.
      if (s.axis !== undefined && !AXES.includes(s.axis as Axis)) {
        errors.push(`${at}.spin.axis must be x, y or z`);
      }
      if (
        s.seconds !== undefined &&
        !(typeof s.seconds === "number" && Number.isFinite(s.seconds) && s.seconds > 0.1)
      ) {
        errors.push(`${at}.spin.seconds must be a number greater than 0.1`);
      }
      if (errors.length === spinBefore) {
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
      const bobBefore = errors.length;
      // The same unknown-key gate spin carries, for the same reason.
      const KNOWN_BOB_KEYS = new Set(["amplitude", "seconds"]);
      for (const key of Object.keys(b)) {
        if (isCommentKey(key)) continue;
        if (!KNOWN_BOB_KEYS.has(key)) {
          errors.push(
            `${at}.bob.${key} is not a bob field — ${didYouMean(key, KNOWN_BOB_KEYS)}known fields: amplitude, seconds (a vertical sine of "amplitude" metres per "seconds")`,
          );
        }
      }
      if (!(typeof b.amplitude === "number" && Number.isFinite(b.amplitude) && b.amplitude > 0)) {
        errors.push(`${at}.bob.amplitude must be a positive number`);
      }
      if (
        b.seconds !== undefined &&
        !(typeof b.seconds === "number" && Number.isFinite(b.seconds) && b.seconds > 0.1)
      ) {
        errors.push(`${at}.bob.seconds must be a number greater than 0.1`);
      }
      if (errors.length === bobBefore) {
        bob = {
          amplitude: b.amplitude as number,
          ...(b.seconds !== undefined ? { seconds: b.seconds as number } : {}),
        };
      }
    }
  }

  let screw: PartSpec["screw"];
  if (part.screw !== undefined) {
    if (part.screw === null || typeof part.screw !== "object" || Array.isArray(part.screw)) {
      errors.push(`${at}.screw must be an object with a rise`);
    } else {
      const w = part.screw as Record<string, unknown>;
      const screwBefore = errors.length;
      const KNOWN_SCREW_KEYS = new Set(["axis", "seconds", "rise"]);
      for (const key of Object.keys(w)) {
        if (isCommentKey(key)) continue;
        if (!KNOWN_SCREW_KEYS.has(key)) {
          errors.push(
            `${at}.screw.${key} is not a screw field — ${didYouMean(key, KNOWN_SCREW_KEYS)}known fields: axis, seconds, rise`,
          );
        }
      }
      if (w.axis !== undefined && !AXES.includes(w.axis as Axis)) {
        errors.push(`${at}.screw.axis must be x, y or z`);
      }
      if (
        w.seconds !== undefined &&
        !(typeof w.seconds === "number" && Number.isFinite(w.seconds) && w.seconds > 0.1)
      ) {
        errors.push(`${at}.screw.seconds must be a number greater than 0.1`);
      }
      if (!(typeof w.rise === "number" && Number.isFinite(w.rise))) {
        errors.push(
          `${at}.screw.rise must be a finite number of metres travelled along the axis per turn`,
        );
      } else if (w.rise === 0) {
        // Refused for the reason rotate.deg refuses a whole turn: it is a
        // sentence the author believes they said. A screw with no rise is a
        // spin, and the language already has that word. The rise carries no
        // ceiling on purpose: how far one turn travels is scale taste (a
        // crane's auger is not a wristwatch's), and taste is the author's.
        errors.push(
          `${at}.screw.rise is 0, which is a spin written the long way — write the metres the part advances per turn, or use spin`,
        );
      }
      if (errors.length === screwBefore) {
        screw = {
          rise: w.rise as number,
          ...(w.axis !== undefined ? { axis: w.axis as Axis } : {}),
          ...(w.seconds !== undefined ? { seconds: w.seconds as number } : {}),
        };
      }
    }
  }

  // Two authorities over one degree of freedom, refused where the author can
  // still see both sentences. A screw IS a spin with a rise; and a screw
  // about z translates on z, which is the only axis a bob has.
  if (screw && spin) {
    errors.push(
      `${at} declares both spin and screw — a screw IS a spin with a rise along its axis, so drop the spin and let screw.seconds carry the turn`,
    );
  }
  if (screw && bob && (screw.axis ?? "z") === "z") {
    errors.push(
      `${at} declares a screw about z and a bob — both author z travel, and two authorities over one axis is not a composition; screw about x or y composes with bob, or drop one of the two`,
    );
  }

  let rotate: PartSpec["rotate"];
  if (part.rotate !== undefined) {
    if (part.rotate === null || typeof part.rotate !== "object" || Array.isArray(part.rotate)) {
      errors.push(`${at}.rotate must be an object with an axis and a deg`);
    } else {
      const r = part.rotate as Record<string, unknown>;
      const rotateBefore = errors.length;
      const KNOWN_ROTATE_KEYS = new Set(["axis", "deg"]);
      for (const key of Object.keys(r)) {
        if (isCommentKey(key)) continue;
        if (!KNOWN_ROTATE_KEYS.has(key)) {
          errors.push(
            `${at}.rotate.${key} is not a rotate field — ${didYouMean(key, KNOWN_ROTATE_KEYS)}known fields: axis, deg`,
          );
        }
      }
      if (!AXES.includes(r.axis as Axis)) {
        errors.push(`${at}.rotate.axis must be x, y or z`);
      }
      if (typeof r.deg !== "number" || !Number.isFinite(r.deg)) {
        errors.push(`${at}.rotate.deg must be a finite number of degrees`);
      } else if (r.deg % 360 === 0) {
        // Refused for the same reason an unknown key is: it is a sentence
        // the author believes they said. A whole number of turns puts the
        // part back exactly where it started, so the spec reads as rotated
        // and the asset ships un-rotated, silently.
        errors.push(
          `${at}.rotate.deg is ${r.deg}, a whole number of turns — that puts the part back exactly where it started and rotates nothing; write the angle you mean, or drop the rotate`,
        );
      } else if (r.deg <= -360 || r.deg >= 360) {
        const equivalent = r.deg % 360;
        errors.push(
          `${at}.rotate.deg must be greater than -360 and less than 360 — ${r.deg} is more than a full turn; write the angle it actually reaches (${equivalent})`,
        );
      }
      if (errors.length === rotateBefore) {
        rotate = { axis: r.axis as Axis, deg: r.deg as number };
      }
    }
  }

  // A torus's cross-section must fit inside its box: the tube diameter is
  // the extent along its axis, and the ring needs room for tube on both
  // sides across the other two.
  if (shape === "torus" && size) {
    const across = crossExtents(size, axis);
    const tube = size[AXES.indexOf(axis)]!;
    if (Math.abs(across[0] - across[1]) > CIRCULAR_TOLERANCE) {
      errors.push(
        `${at}: a torus must be circular across its axis — the two cross extents are ${across[0]} and ${across[1]}`,
      );
    }
    if (across[0] <= 2 * tube) {
      errors.push(
        `${at}: torus tube diameter ${tube} does not fit its ring diameter ${across[0]} — the ring extent must exceed twice the tube extent`,
      );
    }
  }

  // A wedge slopes ALONG its axis, so the axis has to be a horizontal one —
  // which makes the z DEFAULT always invalid for a wedge. The two roads
  // here are different mistakes and deserve different sentences: an absent
  // axis is a required field ("write one"), an explicit z is a wrong value
  // ("change it"). The old single sentence explained a default the author
  // may never have invoked.
  if (shape === "wedge" && axis === "z") {
    errors.push(
      part.axis === undefined
        ? `${at}.axis is required for a wedge — x or y, the direction its top face slopes UP (there is no usable default: z is the direction the wedge is tall in)`
        : `${at}.axis: a wedge's axis is the direction its top face slopes UP, so it must be x or y — z is the direction the wedge is tall in`,
    );
  }

  // A tube is a circular pipe: its cross-section must be round, and its wall
  // must leave a hole. Same circularity precedent as the torus, same shape of
  // message — the reader's next action is to compare two numbers.
  if (shape === "tube" && size) {
    const across = crossExtents(size, axis);
    if (Math.abs(across[0] - across[1]) > CIRCULAR_TOLERANCE) {
      errors.push(
        `${at}: a tube must be circular across its axis — the two cross extents are ${across[0]} and ${across[1]}`,
      );
    } else if (thickness !== undefined && thickness >= across[0] / 2) {
      errors.push(
        `${at}: tube wall thickness ${thickness} does not fit its outer diameter ${across[0]} — the wall must be thinner than half the diameter, or the walls meet in the middle and there is no hole left`,
      );
    }
  }

  // A capsule is a cylinder with a hemisphere on each end, so its length
  // along the axis is at least its diameter BY CONSTRUCTION. Shorter than
  // that is not a squashed capsule, it is a different shape — and the
  // language already has the word for it.
  if (shape === "capsule" && size) {
    const across = crossExtents(size, axis);
    if (Math.abs(across[0] - across[1]) > CIRCULAR_TOLERANCE) {
      errors.push(
        `${at}: a capsule must be circular across its axis — the two cross extents are ${across[0]} and ${across[1]}`,
      );
    }
  }
  /* Whether the box can be built as this shape at all, through the SAME
     predicate the solver re-runs on what it derives. A torus builds its ring
     from `across / 2 - tube`, so a ring no wider than its own tube is a
     negative radius handed to Blender — and nothing checked it, authored or
     solved. One predicate, two askers: here the author's own numbers, with
     their JSON path; there the numbers a relation produced. */
  if (size) {
    for (const violation of shapeViolations(shape, size, axis, thickness)) {
      errors.push(`${at}: ${violation}`);
    }
  }

  /* ---- unknown keys are ERRORS, never swallows ---------------------- */
  //
  // A key this language has not built is a sentence the author believes they
  // said. A swallow lets them ship a cube believing it is a pitched roof, a
  // subject camera, or a claimed door width — parse reported zero errors and
  // the geometry silently ignored their intent. Every field that IS read is
  // listed here; anything else refuses loudly with the vocabulary named, so
  // the author learns what exists instead of trusting what does not.
  const KNOWN_PART_KEYS = new Set([
    "id", "size", "shape", "file", "script", "recipe", "axis", "flip", "tip", "thickness",
    "material", "role", "spin", "bob", "screw", "rotate",
  ]);
  for (const key of Object.keys(part)) {
    if (isCommentKey(key)) continue;
    if (!KNOWN_PART_KEYS.has(key)) {
      errors.push(
        `${at}.${key} is not a part field — ${didYouMean(key, KNOWN_PART_KEYS)}known fields: ${[...KNOWN_PART_KEYS].join(", ")}`,
      );
    }
  }

  if (errors.length > before || !size) return undefined;
  return {
    id: part.id as string,
    size,
    ...(file !== undefined ? { file } : {}),
    ...(script !== undefined ? { script } : {}),
    ...(recipe !== undefined ? { recipe } : {}),
    ...(shape !== "box" ? { shape } : {}),
    ...(axis !== "z" ? { axis } : {}),
    ...(part.flip === true ? { flip: true } : {}),
    ...(tip !== undefined ? { tip } : {}),
    ...(thickness !== undefined ? { thickness } : {}),
    ...(typeof part.material === "string" ? { material: part.material } : {}),
    ...(typeof part.role === "string" ? { role: part.role } : {}),
    ...(spin ? { spin } : {}),
    ...(bob ? { bob } : {}),
    ...(screw ? { screw } : {}),
    ...(rotate ? { rotate } : {}),
  };
}

function validateMaterial(
  name: string,
  value: unknown,
  shaderNames: Set<string>,
  /** Every shader name the author wrote, including invalid declarations —
   *  see the note at the declaration site: a reference to a declared-but-
   *  broken shader is POISONED, not missing, and must produce no error of
   *  its own (the shader's own errors already name the cause). */
  declaredShaders: Set<string>,
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
  let shaderPoisoned = false;
  if (mat.shader !== undefined) {
    if (typeof mat.shader !== "string") {
      errors.push(`${at}.shader must be a string`);
    } else if (shaderNames.has(mat.shader)) {
      shader = mat.shader;
    } else if (declaredShaders.has(mat.shader)) {
      // Declared, but its declaration failed above. Say nothing here — the
      // real errors carry the shader's own JSON path — and suppress the
      // baseColor fallback demand below: the binding will be fine the
      // moment the shader itself is fixed.
      shaderPoisoned = true;
    } else {
      errors.push(`${at}.shader '${mat.shader}' is not declared in shaders — declare it or fix the name`);
    }
  }
  /* Every channel is validated the same way: a CONSTANT of the channel's
     own kind, or a BINDING onto a declared shader's baked output. That
     symmetry is the primitive — it is why coat, sheen, transmission and a
     directly authored normal map need no code of their own here. */
  const out: Record<string, unknown> = {};
  const isBinding = (v: unknown): v is { shader: string; output?: string } =>
    typeof v === "object" && v !== null && !Array.isArray(v) && "shader" in v;

  const channelValue = (
    chan: { name: string; kind: ChannelDef["kind"]; min?: number; max?: number; note: string },
    raw: unknown,
  ): unknown => {
    const where = `${at}.${chan.name}`;
    if (isBinding(raw)) {
      const b = raw as { shader?: unknown; output?: unknown };
      if (typeof b.shader !== "string") {
        errors.push(`${where}.shader must be the name of a declared shader`);
        return undefined;
      }
      if (!shaderNames.has(b.shader)) {
        // A shader whose own declaration failed is not re-reported: its real
        // errors carry its JSON path, and this binding is fine once it is
        // fixed. The poison flag travels so the required-field checks below
        // stay quiet too — otherwise a baseColor BOUND to a broken shader also
        // collects "set the base colour", pointing the author at a constant
        // their binding already supplies.
        if (!declaredShaders.has(b.shader)) {
          errors.push(
            `${where}.shader '${b.shader}' is not declared in shaders — declare it or fix the name`,
          );
        } else {
          shaderPoisoned = true;
        }
        return undefined;
      }
      // Unknown keys INSIDE a binding are errors for the same reason unknown
      // material keys are: `{ shader, ouput }` would otherwise validate and
      // then drive the channel's default output, which is a silent wrong
      // answer rather than a refusal.
      const BINDING_KEYS = new Set(["shader", "output"]);
      for (const k of Object.keys(b as Record<string, unknown>)) {
        if (isCommentKey(k)) continue;
        if (!BINDING_KEYS.has(k)) {
          errors.push(
            `${where}.${k} is not a binding field — ${didYouMean(k, BINDING_KEYS)}known fields: ${[...BINDING_KEYS].join(", ")}`,
          );
          return undefined;
        }
      }
      // The default output is the channel's own name, which is what makes the
      // common case short — except where the channel is DRIVEN by a different
      // baked thing. Displacement is a height field; nothing bakes a
      // "displacement", so defaulting to the channel name would validate and
      // then wire nothing at all.
      let output: string = chan.name === "displacement" ? "height" : chan.name;
      if (!(SHADER_OUTPUTS as readonly string[]).includes(output)) {
        errors.push(
          `${where} has no bakeable output of its own — bind it explicitly with { "shader": "...", "output": "..." } from ${SHADER_OUTPUTS.join(", ")}`,
        );
        return undefined;
      }
      if (b.output !== undefined) {
        if (typeof b.output !== "string" || !(SHADER_OUTPUTS as readonly string[]).includes(b.output)) {
          errors.push(
            `${where}.output must be one of ${SHADER_OUTPUTS.join(", ")} — it names which of the shader's baked channels drives this one`,
          );
          return undefined;
        }
        output = b.output;
      }
      return { shader: b.shader, output };
    }
    // A constant. `map` channels have none: their value is a per-texel
    // direction, so a number could not mean anything.
    if (chan.kind === "map") {
      errors.push(
        `${where} takes a shader binding, not a value — ${chan.note}`,
      );
      return undefined;
    }
    if (chan.kind === "color") return validateColor(where, raw, errors);
    if (chan.kind === "vector") {
      if (
        Array.isArray(raw) &&
        raw.length === 3 &&
        raw.every((n) => typeof n === "number" && Number.isFinite(n) && n >= (chan.min ?? -Infinity) && n <= (chan.max ?? Infinity))
      ) {
        return [raw[0], raw[1], raw[2]];
      }
      errors.push(`${where} must be three numbers in [${chan.min}, ${chan.max}] — ${chan.note}`);
      return undefined;
    }
    if (
      typeof raw === "number" &&
      Number.isFinite(raw) &&
      raw >= (chan.min ?? -Infinity) &&
      raw <= (chan.max ?? Infinity)
    ) {
      return raw;
    }
    errors.push(`${where} must be a number in [${chan.min}, ${chan.max}] — ${chan.note}`);
    return undefined;
  };

  for (const chan of MATERIAL_CHANNELS) {
    if (mat[chan.name] === undefined) continue;
    // Metallic keeps its own refusal: the pbr rule rejects in-between
    // CONSTANTS, and naming the nearest legal value is the one move that
    // fixes it. A bound metallic is a texture and is not range-checked.
    if (chan.name === "metallic" && !isBinding(mat.metallic)) {
      if (mat.metallic === 0 || mat.metallic === 1) {
        out.metallic = mat.metallic;
      } else {
        const suggestion =
          typeof mat.metallic === "number" && Number.isFinite(mat.metallic)
            ? mat.metallic < 0.5
              ? 0
              : 1
            : undefined;
        errors.push(
          `${at}.metallic must be 0 or 1 — in-between metallic is physically meaningless and the pbr rule rejects it${
            suggestion !== undefined ? ` (use ${suggestion})` : ""
          }`,
        );
      }
      continue;
    }
    const v = channelValue(chan, mat[chan.name]);
    if (v !== undefined) out[chan.name] = v;
  }

  // A shader material's surface comes from the bake; without a shader — and
  // without a binding that supplies it — the base colour IS the material.
  if (
    out.baseColor === undefined &&
    mat.baseColor === undefined &&
    shader === undefined &&
    !shaderPoisoned
  ) {
    // Only when it is ABSENT. A malformed one was already refused by the
    // channel loop above, and validating it twice collects the same
    // diagnostic twice for one mistake.
    validateColor(`${at}.baseColor`, mat.baseColor, errors);
  }
  // A plain material glowing at strength N with no colour is a mistake; a
  // shader material may bake the colour, which makes the strength alone fine.
  if (
    out.emissionStrength !== undefined &&
    out.emission === undefined &&
    shader === undefined
  ) {
    errors.push(`${at}.emissionStrength is set but emission is not — set the emission colour`);
  }

  /* Facts about how the surface is READ rather than what it is. They are not
     channels: no shader bakes them, and an engine consumes them as material
     state. */
  if (mat.alphaMode !== undefined) {
    if (typeof mat.alphaMode === "string" && (ALPHA_MODES as readonly string[]).includes(mat.alphaMode)) {
      out.alphaMode = mat.alphaMode;
    } else {
      errors.push(
        `${at}.alphaMode must be one of ${ALPHA_MODES.join(", ")} — 'mask' is a hard cut-out at alphaCutoff (leaves, chain-link) and sorts correctly in every engine; 'blend' is true translucency`,
      );
    }
  }
  if (mat.alphaCutoff !== undefined) {
    const c = validateUnit(`${at}.alphaCutoff`, mat.alphaCutoff, errors);
    if (c !== undefined) out.alphaCutoff = c;
  }
  if (mat.doubleSided !== undefined) {
    if (typeof mat.doubleSided === "boolean") out.doubleSided = mat.doubleSided;
    else errors.push(`${at}.doubleSided must be true or false`);
  }
  /* `occlusion` is NOT bindable. The surface model has no ambient-occlusion
     input, and the only route a glTF exporter reads — the "glTF Material
     Output" node group — is invisible to the USD writer, so binding it fails
     the master-parity check (S3D-E-901) instead of shipping AO. A kernel may
     still BAKE an occlusion map; what a material may not do is claim to wear
     one. Refused with the way that does work, rather than accepted and lost. */
  if (mat.occlusion !== undefined) {
    errors.push(
      `${at}.occlusion cannot be bound to a material — the surface model has no ambient-occlusion input, and the glTF-only route does not survive the USD master. Bake it as a shader output and multiply it into baseColor inside the kernel`,
    );
  }
  // Displacement is bound like a channel but is not a surface input: it drives
  // the material output's displacement, which is what USD carries and what an
  // engine tessellates against. Texture-only, since a constant displacement is
  // just a translation.
  for (const extra of ["displacement"] as const) {
    if (mat[extra] === undefined) continue;
    if (!isBinding(mat[extra])) {
      errors.push(
        `${at}.${extra} takes a shader binding like { "shader": "shd_x" }, not a value`,
      );
      continue;
    }
    const v = channelValue(
      { name: extra, kind: "map", note: `${extra} is driven by a baked map` },
      mat[extra],
    );
    if (v !== undefined) out[extra] = v;
  }

  // Unknown material keys are errors, never swallows, for the same reason
  // part keys are: `"offset"` typed where `"emissionStrength"` was meant
  // compiled clean and lit nothing, silently.
  const KNOWN_MATERIAL_KEYS = new Set<string>([
    "shader",
    ...MATERIAL_CHANNELS.map((c) => c.name),
    "alphaMode",
    "alphaCutoff",
    "doubleSided",
    "displacement",
    "occlusion",
  ]);
  for (const key of Object.keys(mat)) {
    if (isCommentKey(key)) continue;
    if (!KNOWN_MATERIAL_KEYS.has(key)) {
      errors.push(
        `${at}.${key} is not a material field — ${didYouMean(key, KNOWN_MATERIAL_KEYS)}known fields: ${[...KNOWN_MATERIAL_KEYS].join(", ")}`,
      );
    }
  }

  if (errors.length > before || (out.baseColor === undefined && shader === undefined)) {
    return undefined;
  }
  return {
    ...(shader !== undefined ? { shader } : {}),
    ...out,
  } as MaterialSpec;
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
  // Each relation type reads a different field set; a key that belongs to
  // one relation but is typed on another (`"offset"` for `"embed"` on
  // sits_on, `"to"` on an `align`-shaped `inset_from`) compiled clean and
  // was silently ignored. Checked per case, against exactly the fields that
  // case reads, so the refusal names the vocabulary the AUTHORED type has.
  /* Field names another relation (or plain English) uses for the same
     concept: Levenshtein cannot bridge `of` → `over` or `gap` →
     `clearance`, so the mapping is named. Keyed by relation type so `on`
     stays legal where it IS the field. */
  const RELATION_FIELD_ALIASES: Record<string, string> = {
    "above.of": "over",
    "above.on": "over",
    "above.gap": "clearance",
    "sits_on.over": "on",
    "sits_on.gap": "embed",
    "span.between": "from",
  };
  const unknownRelationKeys = (known: readonly string[]): void => {
    const knownSet = new Set(known);
    for (const key of Object.keys(rel)) {
      if (isCommentKey(key)) continue;
      if (!knownSet.has(key)) {
        const alias = RELATION_FIELD_ALIASES[`${rel.type as string}.${key}`];
        const suggestion = alias ? `did you mean "${alias}"? ` : didYouMean(key, known);
        errors.push(
          `${at}.${key} is not a field of relation '${rel.type as string}' — ${suggestion}known fields: ${known.join(", ")}`,
        );
      }
    }
  };

  switch (rel.type) {
    case "at": {
      unknownRelationKeys(["type", "part", "center"]);
      const part = str("part");
      const center = validateVec3(`${at}.center`, rel.center, errors);
      if (errors.length > before || !part || !center) return undefined;
      return { type: "at", part, center };
    }
    case "sits_on": {
      unknownRelationKeys(["type", "part", "on", "embed", "axis"]);
      const part = str("part");
      const on = str("on");
      const embed = optNum("embed");
      const axis = rel.axis === undefined ? undefined : axisOf("axis");
      if (errors.length > before || !part || !on) return undefined;
      return {
        type: "sits_on",
        part,
        on,
        ...(embed !== undefined ? { embed } : {}),
        ...(axis !== undefined ? { axis } : {}),
      };
    }
    case "above": {
      unknownRelationKeys(["type", "part", "over", "clearance", "axis"]);
      const part = str("part");
      const over = str("over");
      const clearance = optNum("clearance");
      const axis = rel.axis === undefined ? undefined : axisOf("axis");
      if (errors.length > before || !part || !over) return undefined;
      return {
        type: "above",
        part,
        over,
        ...(clearance !== undefined ? { clearance } : {}),
        ...(axis !== undefined ? { axis } : {}),
      };
    }
    case "align": {
      unknownRelationKeys(["type", "part", "to", "axes"]);
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
      unknownRelationKeys(["type", "part", "from", "faces", "by"]);
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
      unknownRelationKeys(["type", "part", "from", "to", "axis", "embed"]);
      const part = str("part");
      const from = str("from");
      const to = str("to");
      const axis = axisOf("axis");
      const embed = optNum("embed");
      if (errors.length > before || !part || !from || !to || !axis) return undefined;
      return { type: "span", part, from, to, axis, ...(embed !== undefined ? { embed } : {}) };
    }
    case "repeat": {
      unknownRelationKeys(["type", "part", "count", "along", "every"]);
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
    case "around": {
      unknownRelationKeys(["type", "part", "center", "axis", "radius", "count", "startDeg", "orient"]);
      const part = str("part");
      const hub = str("center");
      let axis: Axis | undefined;
      if (rel.axis !== undefined) {
        if (AXES.includes(rel.axis as Axis)) axis = rel.axis as Axis;
        else errors.push(`${at}.axis must be x, y or z`);
      }
      let radius: number | undefined;
      if (typeof rel.radius === "number" && Number.isFinite(rel.radius) && rel.radius > 0) {
        radius = rel.radius;
      } else {
        errors.push(
          `${at}.radius must be a positive number — metres from the centre part's box centre to each instance's box centre`,
        );
      }
      let count: number | undefined;
      if (typeof rel.count === "number" && Number.isInteger(rel.count) && rel.count >= 2) {
        count = rel.count;
      } else {
        errors.push(`${at}.count must be an integer >= 2 — a ring of one is just a part`);
      }
      let startDeg: number | undefined;
      if (rel.startDeg !== undefined) {
        if (
          typeof rel.startDeg === "number" &&
          Number.isFinite(rel.startDeg) &&
          rel.startDeg > -360 &&
          rel.startDeg < 360
        ) {
          startDeg = rel.startDeg;
        } else {
          // Same window `rotate.deg` is held to, for the same reason: an
          // angle past a full turn reads as a bigger rotation than the one
          // it reaches, and `orient` composes this straight into a rotate.
          errors.push(
            `${at}.startDeg must be greater than -360 and less than 360 — it is the first instance's angle around the circle, measured from the ${axis === "x" ? "y" : axis === "y" ? "z" : "x"} axis`,
          );
        }
      }
      let orient: boolean | undefined;
      if (rel.orient !== undefined) {
        if (typeof rel.orient === "boolean") orient = rel.orient;
        else errors.push(`${at}.orient must be a boolean`);
      }
      if (errors.length > before || !part || !hub || radius === undefined || count === undefined) {
        return undefined;
      }
      return {
        type: "around",
        part,
        center: hub,
        ...(axis !== undefined ? { axis } : {}),
        radius,
        count,
        ...(startDeg !== undefined ? { startDeg } : {}),
        ...(orient !== undefined ? { orient } : {}),
      };
    }
    case "scatter": {
      unknownRelationKeys(["type", "part", "on", "count", "seed", "minGap", "sizeJitter", "embed"]);
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
          // Not an arbitrary round number: the solver samples each instance's
          // scale as 1 ± sizeJitter (solver.ts sampleScatter), so the smallest
          // possible sample is (1 - sizeJitter) of the authored size. Jitter
          // approaching 1 lets that floor approach zero — a part that can
          // sample down to nothing. 0.9 keeps the smallest sample at 10% of
          // the authored size, the last size a scattered instance can still
          // be considered the same part.
          errors.push(
            `${at}.sizeJitter must be a number in [0, 0.9) — the sampled scale is 1 ± sizeJitter, so 0.9 is the ceiling that keeps the smallest possible sample at 10% of the part's size instead of letting it collapse toward zero`,
          );
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
        `${at}.type '${String(rel.type)}' is not a relation — ${didYouMean(String(rel.type), RELATION_TYPES)}expected ${RELATION_TYPES.join(", ")}`,
      );
      return undefined;
  }
}

/**
 * The light: a preset word, or a spec that scales the same derived rig.
 *
 * The word stays legal because it is the whole answer for the two shots that
 * need no steering. The object exists because the rig is otherwise
 * unreachable, and an author who wants a dark scene has nothing to turn —
 * `emission` on a material makes a surface glow, but against a full-power key
 * and a bright world it can only ever blow out.
 */
function validateLight(value: unknown, errors: string[]): SceneSpec["light"] {
  if (value === "studio" || value === "sun") return value;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(
      'light must be "studio", "sun", or an object like { "preset": "studio", "key": 0.05, "ambient": 0.01 } — the object scales the same derived rig, which is what a night shot needs',
    );
    return undefined;
  }
  const spec = value as Record<string, unknown>;
  const before = errors.length;

  let preset: "studio" | "sun" | undefined;
  if (spec.preset !== undefined) {
    if (spec.preset === "studio" || spec.preset === "sun") preset = spec.preset;
    else errors.push('light.preset must be "studio" or "sun"');
  }

  const num = (key: string, min: number, max: number): number | undefined => {
    if (spec[key] === undefined) return undefined;
    const v = spec[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) return v;
    errors.push(`light.${key} must be a number in [${min}, ${max}]`);
    return undefined;
  };
  // `key` is a MULTIPLIER on the derived power, not watts: the derivation is
  // what keeps one number correct at every subject scale, so an absolute
  // wattage here would be right for exactly one size of scene.
  const key = num("key", 0, 100);
  const azimuthDeg = num("azimuthDeg", -360, 360);
  const elevationDeg = num("elevationDeg", -89, 89);

  let ambient: number | [number, number, number] | undefined;
  if (spec.ambient !== undefined) {
    const v = spec.ambient;
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) {
      ambient = v;
    } else if (
      Array.isArray(v) &&
      v.length === 3 &&
      v.every((c) => typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 100)
    ) {
      ambient = [v[0] as number, v[1] as number, v[2] as number];
    } else {
      errors.push(
        "light.ambient must be a linear grey level (a number) or an [r, g, b] triple — it is the world the subject sits in, so 0 is a void and the default is bright enough for a metal to have something to reflect",
      );
    }
  }

  const KNOWN_LIGHT_KEYS = new Set(["preset", "key", "ambient", "azimuthDeg", "elevationDeg"]);
  for (const k of Object.keys(spec)) {
    if (isCommentKey(k)) continue;
    if (!KNOWN_LIGHT_KEYS.has(k)) {
      errors.push(
        `light.${k} is not a light field — ${didYouMean(k, KNOWN_LIGHT_KEYS)}known fields: ${[...KNOWN_LIGHT_KEYS].join(", ")}`,
      );
    }
  }
  if (errors.length > before) return undefined;
  return {
    ...(preset !== undefined ? { preset } : {}),
    ...(key !== undefined ? { key } : {}),
    ...(ambient !== undefined ? { ambient } : {}),
    ...(azimuthDeg !== undefined ? { azimuthDeg } : {}),
    ...(elevationDeg !== undefined ? { elevationDeg } : {}),
  };
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
  // `distance` gets its own refusal because its UNIT is the thing authors get
  // wrong, and the generic "must be a number in [1, 20]" says nothing about
  // it. The reported symptom is always the same: a small subject "wanted 0.6",
  // the floor looked like a 1-metre minimum, and the author walked the knob up
  // in whole steps that each moved the camera by one bounding radius. Naming
  // the unit, what the floor physically means, and the value that fits is the
  // difference between one edit and five compiles.
  let distance: number | undefined;
  if (cam.distance !== undefined) {
    const v = cam.distance;
    if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 20) {
      distance = v;
    } else {
      errors.push(
        `camera.distance must be a number in [1, 20] — it is a MULTIPLE OF THE SCENE'S BOUNDING RADIUS, not metres: 1 puts the camera on the bounding sphere itself (inside the subject), and ${AUTOFIT_DISTANCE.toFixed(2)} is the distance that fits the whole subject in frame, which is exactly what you get by omitting this field`,
      );
    }
  }
  // Unknown camera keys are errors, not swallows: `include`/`target` typed in
  // good faith produced zero parse errors and a photograph of the whole AABB
  // — the author believed they had aimed the shot and had not.
  const KNOWN_CAMERA_KEYS = new Set(["azimuthDeg", "elevationDeg", "distance"]);
  for (const key of Object.keys(cam)) {
    if (isCommentKey(key)) continue;
    if (!KNOWN_CAMERA_KEYS.has(key)) {
      errors.push(
        `camera.${key} is not a camera field — ${didYouMean(key, KNOWN_CAMERA_KEYS)}known fields: ${[...KNOWN_CAMERA_KEYS].join(", ")}`,
      );
    }
  }
  if (errors.length > before) return undefined;
  return {
    ...(azimuthDeg !== undefined ? { azimuthDeg } : {}),
    ...(elevationDeg !== undefined ? { elevationDeg } : {}),
    ...(distance !== undefined ? { distance } : {}),
  };
}

/** A volume needs a handful of digits; even a very finely subdivided limit
 *  surface stays well under this. The cap exists only to bar a numerator or
 *  denominator crafted to exhaust the exact path — BigInt construction is O(n²)
 *  in the digit count, and the value then flows into gcd reduction and the
 *  rational sum in `lintClaims`. Generous enough to never reject a real claim,
 *  small enough that the whole exact pipeline stays trivially fast. */
const MAX_CLAIM_RATIONAL_DIGITS = 512;

/** A canonical positive rational `"n"` or `"n/d"` — a volume is a magnitude,
 *  so no sign and a non-zero numerator/denominator. Rejects the float and the
 *  malformed string before Rational.parse would throw on them downstream, and
 *  the over-long string BEFORE a BigInt is built from it (an untrusted scene
 *  must not be able to hang the compiler with a million-digit numerator). */
function isPositiveRational(s: string): boolean {
  const m = /^(\d+)(?:\/(\d+))?$/.exec(s.trim());
  if (!m) return false;
  if (m[1]!.length > MAX_CLAIM_RATIONAL_DIGITS || (m[2]?.length ?? 0) > MAX_CLAIM_RATIONAL_DIGITS) return false;
  return BigInt(m[1]!) > 0n && (m[2] === undefined || BigInt(m[2]!) > 0n);
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
  // The FLOOR claims, mirrors of the two ceilings. A uniformly wrong scene
  // has no intra-scene outliers, so a 100× unit slip downward sails past
  // every relative check — these are the author's one-line way to sign the
  // scene's real-world magnitude. Both directions declared together bound
  // the scene's scale outright.
  if (claims.minHeight !== undefined) {
    if (typeof claims.minHeight === "number" && claims.minHeight > 0) out.minHeight = claims.minHeight;
    else errors.push("claims.minHeight must be a positive number");
  }
  if (
    out.minHeight !== undefined &&
    out.maxHeight !== undefined &&
    out.minHeight > out.maxHeight
  ) {
    errors.push(
      `claims.minHeight (${out.minHeight}) exceeds claims.maxHeight (${out.maxHeight}) — no scene can hold both`,
    );
  }
  if (claims.minFootprint !== undefined) {
    if (
      Array.isArray(claims.minFootprint) &&
      claims.minFootprint.length === 2 &&
      claims.minFootprint.every((v) => typeof v === "number" && v > 0)
    ) {
      out.minFootprint = claims.minFootprint as [number, number];
    } else {
      errors.push("claims.minFootprint must be [x, y] with positive numbers");
    }
  }
  if (
    out.minFootprint !== undefined &&
    out.footprint !== undefined &&
    (out.minFootprint[0] > out.footprint[0] || out.minFootprint[1] > out.footprint[1])
  ) {
    errors.push(
      `claims.minFootprint [${out.minFootprint.join(", ")}] exceeds claims.footprint [${out.footprint.join(", ")}] — no scene can hold both`,
    );
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
  // Volume is an EXACT claim, so it is a rational STRING (like a trace scalar),
  // never a float that would already have lost the exactness the claim tests.
  if (claims.volume !== undefined) {
    if (typeof claims.volume === "string" && isPositiveRational(claims.volume)) {
      out.volume = claims.volume.trim();
    } else {
      errors.push(`claims.volume must be a positive rational string, e.g. "4/3" or "2" (numerator and denominator at most ${MAX_CLAIM_RATIONAL_DIGITS} digits)`);
    }
  }
  // A claim key the language has no oracle for is refused, never swallowed:
  // `doorWidth` typed in good faith compiled clean and adjudicated nothing —
  // the author believed they had signed a door and had signed air. The error
  // names every claim that DOES adjudicate so the refusal teaches.
  const KNOWN_CLAIM_KEYS = new Set([
    "parts", "maxTriangles", "grounded", "maxHeight", "minHeight",
    "footprint", "minFootprint", "watertight", "materialsUsed", "volume",
  ]);
  for (const key of Object.keys(claims)) {
    if (isCommentKey(key)) continue;
    if (!KNOWN_CLAIM_KEYS.has(key)) {
      errors.push(
        `claims.${key} has no oracle — ${didYouMean(key, KNOWN_CLAIM_KEYS)}it would compile unchecked forever. Claims that adjudicate: ${[...KNOWN_CLAIM_KEYS].join(", ")}`,
      );
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
  // Every component is checked, not just the first bad one — the collect-
  // every-error contract this whole file promises. A vector with two bad
  // components used to report only the first and hide the second until
  // the next round trip.
  const before = errors.length;
  for (let i = 0; i < 3; i++) {
    const v = value[i];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      errors.push(`${at}[${i}] must be a finite number`);
      continue;
    }
    if (options.positive && v <= 0) {
      errors.push(`${at}[${i}] must be a positive number`);
      continue;
    }
    // A floor below any real-world part catches a unit slip (a 1e-9 or 1e-12
    // "metre" that meant millimetres, or a stray exponent) at validation time,
    // with a JSON path, instead of as a degenerate-geometry cascade after the
    // build. Well below a fine detail part (0.01mm), well above the slips.
    if (options.min !== undefined && v > 0 && v < options.min) {
      errors.push(
        `${at}[${i}] is ${v}m, below the ${options.min}m minimum — this is almost certainly a unit slip (metres vs millimetres?)`,
      );
    }
  }
  if (errors.length > before) return undefined;
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
