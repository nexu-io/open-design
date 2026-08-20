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
 * cylinder, a sphere, a cone, a torus — and every shape fills its box
 * exactly, so the solver's spatial reasoning is correct for all of them
 * without knowing any of them exist. Shape is a rendering fact; the box is
 * the structural fact.
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
 */
export type PartShape = "box" | "cylinder" | "sphere" | "cone" | "torus";

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
   * The axis a cylinder/cone runs along, and the axis a torus's hole faces.
   * Default "z" (a standing column, a ring lying flat). Ignored for box and
   * sphere, whose boxes are orientation-complete already.
   */
  axis?: Axis;
  /** Point a cone the other way along its axis (a funnel, a stalactite). */
  flip?: boolean;
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
  /** Distance as a multiple of the scene's bounding radius; default 3.2. */
  distance?: number;
}

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
  /** Every part rests on or above the ground plane (within tolerance). */
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
  size: Vec3;
  /** World-space centre resolved from the relation graph. */
  center: Vec3;
  shape: PartShape;
  axis: Axis;
  flip: boolean;
  /** Real asset file filling the box, when the part is file-backed. */
  file?: string;
  material?: string;
  spin?: { axis?: Axis; seconds?: number };
  bob?: { amplitude: number; seconds?: number };
  role?: string;
  /**
   * For repeat instances, the id of the authored part this was expanded
   * from — the hook provenance and issue attribution use to point the
   * reader at the line that exists rather than one that doesn't.
   */
  from?: string;
}

export interface SolveDiagnostic {
  /** Stable code so the compiler can surface these like any other issue. */
  code:
    | "SOLVE-UNRESOLVED"
    | "SOLVE-CONFLICT"
    | "SOLVE-UNKNOWN-PART"
    | "SOLVE-EPSILON-FLOOR"
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
