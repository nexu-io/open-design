/**
 * The declarative scene language — say what you mean, not where things go.
 *
 * A scene is authored as parts plus *relationships between parts*, never as
 * absolute coordinates. `post sits_on base, inset 4mm from its outer edge` is
 * the thing a modeller is actually reasoning about; `x = 0.4 - 0.025 - 0.004`
 * is arithmetic done by hand, and hand arithmetic is where the bugs live.
 *
 * Three properties fall out of resolving relations instead of typing numbers:
 *
 *   1. Coplanarity is structurally impossible. Every contact relation carries
 *      a signed offset the solver owns and floors — surfaces either overlap
 *      (`embed`) or separate (`clearance`), never land exactly flush. The
 *      z-fighting rule stops being a category of mistake you can make.
 *   2. A bad helper cannot silently halve the world. Nothing is an absolute
 *      number, so a scale error has no place to hide.
 *   3. "Make it 30% taller" re-solves the whole model. You edit one size and
 *      everything anchored to it moves, instead of hand-editing thirty
 *      literals and missing four.
 *
 * The language deliberately reasons about every part as its axis-aligned
 * bounding box. A part's `shape` says what fills that box — a box, a
 * cylinder, a sphere, a cone, a torus, a wedge, a tube, a capsule — and
 * every shape fills its box exactly, so the solver's spatial reasoning is
 * correct for all of them without knowing any of them exist. Shape is a
 * rendering fact; the box is the structural fact.
 *
 * This layer is engine-agnostic on purpose. Solving is pure arithmetic over a
 * part graph with no Blender, no Python, and no I/O, so it is unit-testable
 * on any machine; a backend emitter turns the solved result into whatever
 * executor is in play (bpy today, direct USD authoring or a WebGL previewer
 * later). The executor is a detail. The relations are the language.
 *
 * The `claims` block is the other half of the design (the Kiln principle:
 * the author is never the authority on whether they succeeded). A claim is a
 * property the BUILT ARTIFACT must have — part count, triangle budget,
 * grounding, watertightness — and it is adjudicated against the measured
 * census, never against the spec that made the claim. A failed claim fails
 * the compile.
 */

export type Axis = "x" | "y" | "z";

/** A face of an axis-aligned box, named by the axis and the direction. */
export type Face = "x-" | "x+" | "y-" | "y+" | "z-" | "z+";

export const AXES: readonly Axis[] = ["x", "y", "z"];

export type Vec3 = [number, number, number];

/**
 * What fills a part's solved box. Every shape occupies its AABB exactly —
 * a `cylinder` of size [0.2, 0.2, 1] is a 0.2m-diameter, 1m-tall column —
 * so relations behave identically for all of them.
 *
 * `wedge` is a right triangular prism: a ramp whose top face rises across
 * the box. `tube` is a hollow cylinder — a pipe, a ring wall, a socket.
 * `capsule` is a cylinder with hemispherical ends — a pill, a tank, a limb
 * blank. All three still fill their box exactly, so nothing above them
 * needs to know they were added.
 */
export type PartShape =
  | "box"
  | "cylinder"
  | "sphere"
  | "cone"
  | "torus"
  | "wedge"
  | "tube"
  | "capsule";

export interface PartSpec {
  /** Stable identifier; becomes the object name the linter checks. */
  id: string;
  /** Axis-aligned extents in metres. A `span` relation may override one axis. */
  size: Vec3;
  /** What fills the box. Default: "box". */
  shape?: PartShape;
  /**
   * A real asset file (`.glb`/`.gltf`/`.obj`/`.fbx`, scene-relative) that
   * fills the box instead of a primitive. The compiler imports it, joins
   * its meshes into one named part, drops non-mesh scaffolding it carried
   * (cameras, lights, empties), and fits it INSIDE the declared box —
   * uniform scale, centred on x/y, resting on the box's bottom — so
   * relations behave exactly as for primitives: the box is the placement
   * envelope, the file is what fills it. Its own materials and textures
   * are kept; `material` must not be set alongside `file`.
   */
  file?: string;
  /**
   * A scene-relative Python file that fills the box with arbitrary geometry.
   *
   * This is freeform as a SHAPE KIND, not a parallel path: the script runs
   * inside the same deterministic build, and its output is fitted into the
   * declared box exactly like an imported asset — uniform scale, centred on
   * x/y, resting on the box's bottom — so every relation, claim, contact
   * fact and provenance line behaves identically. The JSON declares intent
   * (box, relations, material); the script only fills geometry behind that
   * contract. The compiler executes it with a fixed seed and hashes its
   * bytes into the content cache, so the same source always bakes the same
   * part.
   *
   * Constraints, all structural: the script must define `def build(ctx)`
   * where ctx exposes `size` (the declared box) and `material(name)`; it
   * must create exactly one mesh object; `material` on a script part is a
   * wholesale override of whatever the script bound, mirroring `file`.
   */
  script?: string;
  /**
   * The axis a cylinder/cone/tube/capsule runs along, the axis a torus's
   * hole faces, and the axis a wedge slopes UP along (its low end at the
   * axis- face, its high end at the axis+ face). Default "z" (a standing
   * column, a ring lying flat) — which a wedge must override, since a ramp
   * cannot climb the axis it is tall along. Ignored for box and sphere,
   * whose boxes are orientation-complete already.
   */
  axis?: Axis;
  /**
   * Point a cone the other way along its axis (a funnel, a stalactite), or
   * reverse which end of a wedge is the high one.
   */
  flip?: boolean;
  /**
   * Cut a cone off flat instead of bringing it to a point: the top diameter
   * as a RATIO of the base diameter. 0 (the default) is today's cone; 0.6 is
   * a bucket, a lamp shade, a plant pot. A ratio rather than a metre value
   * so the frustum keeps its proportions when the box is resized, which is
   * the whole reason the language has no absolute numbers.
   *
   * Cone only — 0 <= tip < 1. At 1 the shape is a cylinder, and the language
   * already has a word for that.
   */
  tip?: number;
  /**
   * Wall thickness of a `tube`, in metres, measured inward from the outer
   * surface. Required on a tube and meaningless anywhere else: it is the one
   * fact a hollow shape carries that its bounding box cannot express, since
   * the box only ever says how much space the part occupies.
   */
  thickness?: number;
  /**
   * Material name; must be declared in the spec's `materials` block. On a
   * `file` part this is a deliberate OVERRIDE: the imported asset's own
   * materials are replaced wholesale (the retexture-a-download move).
   */
  material?: string;
  /** Free-form role tag carried through to the manifest (e.g. "lid", "post"). */
  role?: string;
  /**
   * Continuous rotation about an axis. The compiler owns the keyframes:
   * linear interpolation, cycles-modifier looped, one full turn per
   * `seconds` (default 4). A scene with any motion derives as an
   * `animation` asset and its GLB carries the clip.
   */
  spin?: { axis?: Axis; seconds?: number };
  /**
   * Vertical sine bob around the solved position: `amplitude` metres up
   * and down over `seconds` (default 3) per cycle, looped.
   */
  bob?: { amplitude: number; seconds?: number };
  /**
   * A STATIC rotation of the finished part about one world axis, applied at
   * its solved position — a tilted sign, a canted buttress, a ramp turned to
   * face the door.
   *
   * The language's AABB invariant survives this by splitting the box in two.
   * `size` stays the part's LOCAL extents (the box its shape still fills
   * exactly); the box the SOLVER reasons in is the rotated bound of that
   * local box — for an angle θ about axis k, the two cross extents become
   *
   *     w' = w·|cos θ| + h·|sin θ|
   *     h' = w·|sin θ| + h·|cos θ|
   *
   * and the extent along k is unchanged. That is EXACT for a box and
   * conservative for anything rounder inside it — the same honest
   * conservatism a sphere's box corners have carried since day one. Every
   * relation, repeat, scatter, intersection report and coplanar check then
   * operates on the world box unmodified, so nothing above this field has to
   * learn that rotation exists.
   *
   * `deg` is a finite angle strictly between -360 and 360, and never a whole
   * number of turns (that rotates the part onto itself). A multiple of 90 is
   * perfectly useful — it reorients a wedge or a hinge — and is allowed.
   *
   * Not composable with `span`: a span solves the part's extent on a WORLD
   * axis, which a rotation would immediately un-solve.
   */
  rotate?: { axis: Axis; deg: number };
}

/**
 * A named PBR material, mapped 1:1 onto a Principled BSDF by the emitter.
 * Everything the pbr lint rules judge is authorable here and nowhere else,
 * so a spec-built scene can never contain an untouched default material.
 */
export interface MaterialSpec {
  /**
   * A declared shader (from the spec's `shaders` block) whose baked
   * outputs drive this material's textures. When set, `baseColor` may be
   * omitted — the shader owns the surface — while `roughness`, `metallic`
   * and emission knobs still apply unless the shader bakes that channel.
   */
  shader?: string;
  /** Linear RGB, 0-1. Required unless `shader` is set. */
  baseColor?: [number, number, number];
  /** Default 0.5. */
  roughness?: number;
  /** 0 (dielectric) or 1 (conductor); the pbr rule rejects in-betweens. */
  metallic?: number;
  /** Emission colour; presence makes the material glow. */
  emission?: [number, number, number];
  /** Emission strength in watts; default 1 when `emission` is set. */
  emissionStrength?: number;
  /** Opacity, 0-1. Default 1. Values below 1 enable alpha blending. */
  alpha?: number;
}

/**
 * Relations constrain a part's placement on specific axes. A part is solved
 * once every axis is determined; several relations commonly cooperate (one
 * fixes Z by stacking, another fixes X/Y by insetting).
 */
export type Relation =
  /** Absolute anchor. Every scene needs at least one. */
  | { type: "at"; part: string; center: Vec3 }
  /** `part` rests on top of `on`, sunk into it by `embed` so faces overlap. */
  | { type: "sits_on"; part: string; on: string; embed?: number }
  /** `part`'s named faces pull in from `from`'s matching faces by `by`. */
  | { type: "inset_from"; part: string; from: string; faces: Face[]; by?: number }
  /** Centre `part` on `to` along the given axes. */
  | { type: "align"; part: string; to: string; axes: Axis[] }
  /** `part` stretches between `from` and `to` along `axis`, biting into both. */
  | { type: "span"; part: string; from: string; to: string; axis: Axis; embed?: number }
  /** `part` floats above `over` with a measured gap — a seating clearance. */
  | { type: "above"; part: string; over: string; clearance?: number }
  /**
   * Array `part` into `count` instances along an axis at a centre-to-centre
   * pitch. Instance ids are `part_2`..`part_N`; the base keeps its id and
   * its solved position. The pitch is floored away from the part's own
   * extent so adjacent instances can never land face-flush — the same
   * z-fighting guarantee every other relation carries.
   */
  | { type: "repeat"; part: string; count: number; along: Axis; every: number }
  /**
   * Scatter `count` instances of `part` across the top face of `on` —
   * rocks on a slab, trees on a terrain tile, debris on a floor. This
   * relation OWNS the part's whole placement (all three axes), so the part
   * needs no other placement relation. Placement is deterministic: the
   * layout is a pure function of (seed, part, on) via a path-addressed
   * stream, so the same spec always scatters identically and adding
   * unrelated parts or relations cannot reshuffle it. Instances keep
   * `minGap` of clear air between their boxes (never flush, never
   * intersecting) and sink `embed` into the support like `sits_on`.
   * `sizeJitter` varies each instance's uniform scale by up to that
   * fraction. A region too small to fit the count is a loud failure,
   * never a silent shortfall.
   */
  | {
      type: "scatter";
      part: string;
      on: string;
      count: number;
      seed?: number;
      minGap?: number;
      sizeJitter?: number;
      embed?: number;
    }
  /**
   * Array `part` into `count` instances evenly around a circle centred on
   * another part — a ring of posts, bars around a hub, bolts on a flange.
   *
   * The relation that already existed for this was four hand-computed `at`
   * positions, which is precisely the arithmetic the language exists to
   * delete: the author knows "eight of these, evenly, half a metre out",
   * and every trigonometric literal between that sentence and the scene is
   * somewhere a sign or a radian can go wrong.
   *
   * `around` OWNS the part's placement in the circle's plane, and nothing
   * else. The coordinate along the circle's normal keeps coming from the
   * part's own other relations, so `sits_on floor` + `around hub` is a ring
   * standing on the floor, and every clone inherits that resting height
   * exactly like a repeat clone does. The base part is instance 0 (at
   * `startDeg`); clones `part_2`..`part_N` take the remaining angles and
   * record the base in `from`, so provenance points at the authored line.
   *
   * `orient` additionally turns each instance about the circle's axis by its
   * own angle, which is what makes a ring of bars point outward instead of
   * all facing the same way. It composes with an authored `rotate` about the
   * SAME axis by summing the degrees; a rotation about a different axis is
   * refused rather than silently reconciled.
   */
  | {
      type: "around";
      part: string;
      /** The part whose solved box centre the circle is centred on. */
      center: string;
      /** The circle's normal. Default "z" — a ring of posts on the ground. */
      axis?: Axis;
      /** Circle radius in metres, centre-to-centre. */
      radius: number;
      /** Instances around the full turn, including the base. */
      count: number;
      /** The first instance's angle. Default 0. */
      startDeg?: number;
      /** Turn each instance to face its own angle. Default false. */
      orient?: boolean;
    };

/**
 * Camera intent. The emitter derives the actual position from the solved
 * scene bounds, so the shot always contains the subject at any scale;
 * these knobs steer the derivation rather than replacing it with numbers.
 */
export interface CameraSpec {
  /** Orbit angle in degrees; default 45 (three-quarter view). */
  azimuthDeg?: number;
  /** Elevation in degrees above the horizon; default 30. */
  elevationDeg?: number;
  /**
   * Distance as a MULTIPLE OF THE SCENE'S BOUNDING RADIUS — never metres.
   *
   * That unit is the whole point: it is what makes one number frame a
   * 26cm lantern and a 26m hangar identically. It is also what makes the
   * knob easy to misread, and the field reports show exactly how the
   * misreading goes — a small subject "wanted 0.6m", the floor of 1 looked
   * like a 1m minimum, and the author climbed 1 → 2 → 3 → 3.5 → 4 wondering
   * why nothing moved much. In radii, 1 puts the camera ON the bounding
   * sphere (inside the subject, for any lens under 90°), which is why every
   * value near the floor looks broken.
   *
   * Omit it. The default is not a constant: it is derived from the emitted
   * camera's own field of view so the subject fills CAMERA_FILL of the
   * frame height at every orbit angle — see AUTOFIT_DISTANCE below.
   * The knob is for deliberately tighter or wider shots than that.
   */
  distance?: number;
}

/**
 * The lens the compiler's derived camera is authored with, in millimetres,
 * and the sensor it exposes — emitted EXPLICITLY by the backend rather than
 * inherited from a host default, because the framing arithmetic below reads
 * them. A default that can change under the formula is not an input the
 * formula may use.
 */
export const CAMERA_LENS_MM = 50;
export const CAMERA_SENSOR_MM = 36;

/**
 * Half the derived camera's field of view, in radians. Proof renders are
 * square, so this is the half-angle in BOTH directions and framing needs only
 * one number.
 */
export const CAMERA_HALF_FOV = Math.atan(CAMERA_SENSOR_MM / 2 / CAMERA_LENS_MM);

/**
 * How much of the frame's half-height the subject's bounding radius fills at
 * the derived distance. 0.8 leaves a fifth of the frame as air on every side,
 * which is what a subject looks composed in rather than cropped — and because
 * the radius is the bounding SPHERE's, it holds at every orbit angle instead
 * of only at the one the still was framed from.
 */
export const CAMERA_FILL = 0.8;

/**
 * The default `camera.distance`, in bounding radii — DERIVED, not chosen.
 *
 * A subject of radius r at distance d subtends r / (d·tan(fov/2)) of the
 * frame's half-height, so asking for a fill fraction f fixes the distance:
 *
 *     d = r / (tan(fov/2) · f)
 *
 * which at 50mm on a 36mm sensor and f = 0.8 is about 3.47 radii. The old
 * default was the literal 3.2, and a literal is exactly what cannot answer
 * the field report: an author whose subject did not fit had no way to compute
 * the value that would, so they iterated. This number now moves with the lens,
 * and `camera.distance`'s refusal quotes it.
 */
export const AUTOFIT_DISTANCE = 1 / (Math.tan(CAMERA_HALF_FOV) * CAMERA_FILL);

/**
 * Properties the BUILT scene must prove, adjudicated against the census.
 * Kiln's rule, adopted whole: the build produces an asset AND a claim, and
 * the validator — never the author — decides whether the claim held. A
 * failed claim is a compile error; a claim the census cannot adjudicate is
 * reported as unchecked, never silently passed.
 */
export interface ClaimsSpec {
  /** Exact number of mesh parts in the built scene (repeat instances count). */
  parts?: number;
  /** Ceiling on total triangles across all meshes. */
  maxTriangles?: number;
  /** No part sinks THROUGH the ground plane (within tolerance). One
   *  direction only: floating is a composition, not a defect — a lantern
   *  hangs, an orb hovers — and the compiler has no standing to call that
   *  wrong. A project that wants floating reported opts into
   *  `conventions.grounding`, where S3D-W-325 names the nearest support below.
   *  Honours `conventions.grounding.exempt`; adjudicated at the rest pose. */
  grounded?: boolean;
  /** Ceiling on the scene's world-space height in metres. */
  maxHeight?: number;
  /** Ceiling on the scene's world-space [x, y] footprint in metres. */
  footprint?: [number, number];
  /** Every mesh is a closed manifold — no open edges, no non-manifold ones. */
  watertight?: boolean;
  /** Each named material is actually bound to at least one part. */
  materialsUsed?: string[];
}

export interface SceneSpec {
  schemaVersion: 1;
  /** Optional asset name, recorded for provenance only. */
  name?: string;
  /**
   * Raw GPU shader kernels, compiled and executed by the pipeline (see
   * src/shade/). Materials reference them by name; their baked outputs
   * become the material's textures.
   */
  shaders?: Record<string, import("../shade/types.js").ShaderSpec>;
  /** Named materials parts may reference. */
  materials?: Record<string, MaterialSpec>;
  parts: PartSpec[];
  relations: Relation[];
  camera?: CameraSpec;
  /** Lighting style: derived studio key (default) or an outdoor sun. */
  light?: "studio" | "sun";
  claims?: ClaimsSpec;
}

export interface SolvedPart {
  id: string;
  /**
   * The part's WORLD box — what every consumer downstream means by "the
   * box": placement, contacts, footprint, intersection reports, framing.
   * For an unrotated part this is the authored size; for a rotated one it
   * is the rotated bound of `localSize` (see PartSpec.rotate), so those
   * consumers stay correct without knowing rotation exists.
   */
  size: Vec3;
  /** World-space centre resolved from the relation graph. */
  center: Vec3;
  shape: PartShape;
  axis: Axis;
  flip: boolean;
  /** Frustum ratio for a cone; see PartSpec.tip. */
  tip?: number;
  /** Wall thickness for a tube, in metres; see PartSpec.thickness. */
  thickness?: number;
  /** Real asset file filling the box, when the part is file-backed. */
  file?: string;
  /** Scene-relative Python script filling the box, when script-backed. */
  script?: string;
  material?: string;
  spin?: { axis?: Axis; seconds?: number };
  bob?: { amplitude: number; seconds?: number };
  /**
   * The part's own extents before rotation — the box the SHAPE fills exactly,
   * and the size the emitter builds the primitive at. Present only when
   * `rotate` is authored; absent means `size` is already both.
   */
  localSize?: Vec3;
  /** Static single-axis rotation about the solved centre; see PartSpec.rotate. */
  rotate?: { axis: Axis; deg: number };
  role?: string;
  /**
   * For repeat instances, the id of the authored part this was expanded
   * from — the hook provenance and issue attribution use to point the
   * reader at the line that exists rather than one that doesn't.
   */
  from?: string;
  /**
   * The part this one was placed to rest ON, when a `sits_on` put it there.
   *
   * A solved fact rather than a re-reading of the relation list: the solver
   * is the one place that decides what rests on what, and consumers that
   * re-derive it from relations drift from it the moment repeat or scatter
   * expands an instance the author never wrote. Compiler-owned vertical
   * motion reads this to know whether the solved position is a contact it
   * must not descend through.
   */
  restsOn?: string;
}

export interface SolveDiagnostic {
  /** Stable code so the compiler can surface these like any other issue. */
  code:
    | "SOLVE-UNRESOLVED"
    | "SOLVE-CONFLICT"
    | "SOLVE-UNKNOWN-PART"
    | "SOLVE-EPSILON-FLOOR"
    | "SOLVE-INTERSECTION"
    | "SOLVE-LIMIT";
  message: string;
  part?: string;
}

export interface SolvedScene {
  parts: SolvedPart[];
  diagnostics: SolveDiagnostic[];
}

/**
 * Minimum contact offset, in metres.
 *
 * Renderers resolve depth in finite precision, so two surfaces at exactly the
 * same coordinate flicker. Rather than ask the author to remember an epsilon
 * at every joint — which is precisely the arithmetic that goes wrong — the
 * solver floors every contact offset to this value and reports when it had to.
 * 1mm is comfortably above float32 depth resolution at furniture scale and
 * far below what reads visually.
 */
export const MIN_CONTACT = 0.001;

/** Loud ceiling on repeat expansion — a runaway count is a bug, not a world. */
export const MAX_REPEAT_COUNT = 200;

/** Loud ceiling on total parts after expansion. */
export const MAX_PARTS = 500;

/**
 * The axis-aligned bound of a local box turned `deg` degrees about `axis`.
 *
 * ONE predicate for the language's rotated box, so the solver, the emitter's
 * framing and any future consumer cannot each derive a slightly different
 * one. The extent along the rotation axis is untouched; the two cross
 * extents each pick up the other's contribution:
 *
 *     w' = w·|cos θ| + h·|sin θ|      h' = w·|sin θ| + h·|cos θ|
 *
 * Exact for a box (its four rotated corners are what those terms measure),
 * conservative for a rounder shape inside the same box — which is the
 * conservatism the language has always had, since a sphere never touches its
 * box corners either. Conservative is the safe direction: the solver reserves
 * at least the space the part occupies, never less.
 */
/**
 * An angle folded back into the (-360, 360) window `rotate.deg` is validated
 * against, keeping its sign.
 *
 * ONE predicate, for the same reason `rotatedBoxSize` is one: `around`'s
 * `orient` composes angles the author never wrote (start + i·step, plus any
 * authored rotation), and those sums routinely leave the window an authored
 * angle may not. Every consumer downstream reads `rotate.deg` as an angle in
 * that window — the emitter's radian conversion, the reports, the kit page —
 * so the composition has to land there too, in one place rather than at each
 * call site with a slightly different modulo.
 */
export function normalizeTurn(deg: number): number {
  const folded = deg % 360;
  // -0 is a legal float and an illegible number in a message or a script.
  return Object.is(folded, -0) ? 0 : folded;
}

export function rotatedBoxSize(size: Vec3, rotate: { axis: Axis; deg: number } | undefined): Vec3 {
  if (!rotate) return [...size] as Vec3;
  const along = AXES.indexOf(rotate.axis);
  const cross = [0, 1, 2].filter((i) => i !== along) as [number, number];
  const theta = (rotate.deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(theta));
  const s = Math.abs(Math.sin(theta));
  const [u, v] = cross;
  const w = size[u]!;
  const h = size[v]!;
  const out = [...size] as Vec3;
  out[u] = w * c + h * s;
  out[v] = w * s + h * c;
  return out;
}
