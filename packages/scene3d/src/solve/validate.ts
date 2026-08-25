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
        declaredMaterials.add(name);
        if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(name)) {
          errors.push(
            `materials.${name}: material names must match [A-Za-z][A-Za-z0-9_]{2,63} — 3-64 characters, starting with a letter, then letters, digits or underscores`,
          );
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
      const part = validatePart(index, value, materials, declaredMaterials, errors);
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
    if (doc.light === "studio" || doc.light === "sun") light = doc.light;
    else errors.push('light must be "studio" or "sun"');
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
  for (const key of Object.keys(doc)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) {
      errors.push(
        `${key} is not a scene.json field — ${didYouMean(key, KNOWN_TOP_LEVEL_KEYS)}known fields: ${[...KNOWN_TOP_LEVEL_KEYS].join(", ")}`,
      );
    }
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

const SHAPES: readonly PartShape[] = [
  "box", "cylinder", "sphere", "cone", "torus", "wedge", "tube", "capsule",
];

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

  let rotate: PartSpec["rotate"];
  if (part.rotate !== undefined) {
    if (part.rotate === null || typeof part.rotate !== "object" || Array.isArray(part.rotate)) {
      errors.push(`${at}.rotate must be an object with an axis and a deg`);
    } else {
      const r = part.rotate as Record<string, unknown>;
      const rotateBefore = errors.length;
      const KNOWN_ROTATE_KEYS = new Set(["axis", "deg"]);
      for (const key of Object.keys(r)) {
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

  // A wedge slopes ALONG its axis, so the axis has to be a horizontal one.
  // Reported against the resolved axis, not the authored key, because the
  // default is z: a wedge with no axis at all is the same mistake as one
  // that names z, and both deserve the same sentence.
  if (shape === "wedge" && axis === "z") {
    errors.push(
      `${at}: a wedge's axis is the direction its top face slopes UP, so it must be x or y — the slope must run along a horizontal axis, and z (the default when no axis is written) is the direction the wedge is tall in`,
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
    const along = size[AXES.indexOf(axis)]!;
    if (Math.abs(across[0] - across[1]) > CIRCULAR_TOLERANCE) {
      errors.push(
        `${at}: a capsule must be circular across its axis — the two cross extents are ${across[0]} and ${across[1]}`,
      );
    } else if (along < across[0] - CIRCULAR_TOLERANCE) {
      errors.push(
        `${at}: capsule length ${along} along ${axis} is shorter than its ${across[0]} diameter — a capsule is a cylinder capped by two hemispheres, so it can never be shorter than it is wide; use shape "sphere" for a rounded blob`,
      );
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
    "id", "size", "shape", "file", "script", "axis", "flip", "tip", "thickness",
    "material", "role", "spin", "bob", "rotate",
  ]);
  for (const key of Object.keys(part)) {
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
    ...(shape !== "box" ? { shape } : {}),
    ...(axis !== "z" ? { axis } : {}),
    ...(part.flip === true ? { flip: true } : {}),
    ...(tip !== undefined ? { tip } : {}),
    ...(thickness !== undefined ? { thickness } : {}),
    ...(typeof part.material === "string" ? { material: part.material } : {}),
    ...(typeof part.role === "string" ? { role: part.role } : {}),
    ...(spin ? { spin } : {}),
    ...(bob ? { bob } : {}),
    ...(rotate ? { rotate } : {}),
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
    if (mat.metallic === 0 || mat.metallic === 1) {
      metallic = mat.metallic;
    } else {
      // Name the nearest legal value the same way W-972 names the nearest
      // legal angle — the author typed a plausible-looking number and the
      // refusal should hand back the one move that fixes it.
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

  // Unknown material keys are errors, never swallows, for the same reason
  // part keys are: `"offset"` typed where `"emissionStrength"` was meant
  // compiled clean and lit nothing, silently.
  const KNOWN_MATERIAL_KEYS = new Set([
    "shader", "baseColor", "roughness", "metallic", "emission", "emissionStrength", "alpha",
  ]);
  for (const key of Object.keys(mat)) {
    if (!KNOWN_MATERIAL_KEYS.has(key)) {
      errors.push(
        `${at}.${key} is not a material field — ${didYouMean(key, KNOWN_MATERIAL_KEYS)}known fields: ${[...KNOWN_MATERIAL_KEYS].join(", ")}`,
      );
    }
  }

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
  // Each relation type reads a different field set; a key that belongs to
  // one relation but is typed on another (`"offset"` for `"embed"` on
  // sits_on, `"to"` on an `align`-shaped `inset_from`) compiled clean and
  // was silently ignored. Checked per case, against exactly the fields that
  // case reads, so the refusal names the vocabulary the AUTHORED type has.
  const unknownRelationKeys = (known: readonly string[]): void => {
    const knownSet = new Set(known);
    for (const key of Object.keys(rel)) {
      if (!knownSet.has(key)) {
        errors.push(
          `${at}.${key} is not a field of relation '${rel.type as string}' — ${didYouMean(key, known)}known fields: ${known.join(", ")}`,
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
      unknownRelationKeys(["type", "part", "on", "embed"]);
      const part = str("part");
      const on = str("on");
      const embed = optNum("embed");
      if (errors.length > before || !part || !on) return undefined;
      return { type: "sits_on", part, on, ...(embed !== undefined ? { embed } : {}) };
    }
    case "above": {
      unknownRelationKeys(["type", "part", "over", "clearance"]);
      const part = str("part");
      const over = str("over");
      const clearance = optNum("clearance");
      if (errors.length > before || !part || !over) return undefined;
      return { type: "above", part, over, ...(clearance !== undefined ? { clearance } : {}) };
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
  // A claim key the language has no oracle for is refused, never swallowed:
  // `doorWidth` typed in good faith compiled clean and adjudicated nothing —
  // the author believed they had signed a door and had signed air. The error
  // names every claim that DOES adjudicate so the refusal teaches.
  const KNOWN_CLAIM_KEYS = new Set([
    "parts", "maxTriangles", "grounded", "maxHeight", "footprint", "watertight", "materialsUsed",
  ]);
  for (const key of Object.keys(claims)) {
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
