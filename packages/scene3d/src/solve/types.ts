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
   * A scene-relative Python RECIPE that authors a deterministic operator
   * trace, which the compiler's kernel evaluates into the box's geometry.
   *
   * Unlike `script`, a recipe never touches Blender: it runs in plain CPython
   * and its `ctx` verbs (box/cage/subdivide/mirror) RECORD exact rational
   * operators rather than build meshes. The compiler evaluates that trace
   * itself — one evaluator, exact rationals, no float until emit — so it can
   * PREDICT the built census (vertices, faces, triangles, watertightness,
   * genus) and adjudicate the prediction against what Blender measured
   * (S3D-E-702): the kernel is just another author whose claims are checked.
   * Fitted into the declared box like `file`/`script`; `material` overrides
   * wholesale. Mutually exclusive with shape/file/script — one filler per box.
   */
  recipe?: string;
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
   * A SCREW: one full turn per `seconds` (default 4) about `axis` (default
   * z) through the part's centre, composed with `rise` metres of travel
   * ALONG that same axis per turn. Chasles' theorem made authorable — every
   * rigid motion is a screw, and `spin` is only the pitch-zero one — so a
   * drill bit driving, an auger lifting grain, and a spiral stair descending
   * are all one primitive rather than three special cases.
   *
   * The loop is honest about what it is. A monotone rise cannot cycle back
   * invisibly the way a turn does (2π ≡ 0, which is why `spin` loops without
   * a seam), so the translation curve REPEATS: it advances 0 → rise over the
   * cycle and then snaps back to 0. That snap is visible, and it is the
   * truthful reading of a screw that keeps driving — a conveyor of thread,
   * correct for a drill bit or an endless spiral, wrong for a lid that
   * should unscrew once and stop. A one-shot advance is not this primitive;
   * it would be an unlooped clip, and this language only emits looped ones.
   *
   * Mutually exclusive with `spin` on the same part: a screw IS a spin with
   * a rise, and both would be two authorities over one rotation. Mutually
   * exclusive with `bob` when the screw axis is z, for the same reason one
   * axis-length lower: both would author z translation. A screw about x or y
   * composes with a bob freely.
   *
   * `rise` may be negative (a left-hand thread, a descent) but never zero —
   * a zero rise is a `spin` written the long way. Any finite nonzero rise
   * is legal: how far one turn travels is scale taste, and taste is the
   * author's — the cycle's snap-back is documented, not policed.
   */
  screw?: { axis?: Axis; seconds?: number; rise: number };
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
/**
 * What drives one material channel: a constant, or a baked shader output.
 *
 * The two forms are the same answer at different fidelities — `roughness:
 * 0.4` and `roughness: { shader: "shd_rust" }` both say what the roughness
 * IS. `output` names which of the shader's baked channels to read; omitted,
 * it is the channel being bound, which is what makes the common case short.
 */
export type ChannelBinding =
  | number
  | [number, number, number]
  | { shader: string; output?: string };

/**
 * A material: a set of bindings onto the surface model's inputs.
 *
 * Every channel in `MATERIAL_CHANNELS` (`solve/channels.ts`) is legal here
 * and takes either a constant or a shader binding — that table is the
 * vocabulary, and this type is declared against it rather than repeating it,
 * so a channel added there is authorable here with no second edit.
 *
 * The named fields below are the ones with defaults or extra rules worth
 * stating; they are not a different kind of field.
 */
export interface MaterialSpec {
  /**
   * A declared shader (from the spec's `shaders` block) whose baked outputs
   * drive this material's textures — the whole-material shorthand for binding
   * each of that shader's outputs to its matching channel. Per-channel
   * bindings win over it, so a material can wear a kernel and still pin one
   * channel to a constant.
   */
  shader?: string;
  /** Linear RGB, 0-1. Required unless `shader` is set. */
  baseColor?: ChannelBinding;
  /** Default 0.5. */
  roughness?: ChannelBinding;
  /** 0 (dielectric) or 1 (conductor); the pbr rule rejects in-betweens. */
  metallic?: ChannelBinding;
  /** Emission colour; presence makes the material glow. */
  emission?: ChannelBinding;
  /** Emission strength in watts; default 1 when `emission` is set. */
  emissionStrength?: ChannelBinding;
  /** Opacity, 0-1. Default 1. See `alphaMode` for how an engine reads it. */
  alpha?: ChannelBinding;
  /**
   * How a renderer should read `alpha`. `opaque` ignores it, `mask` is a
   * hard cut-out at `alphaCutoff` (leaves, chain-link, decals — sorts
   * correctly in every engine), `blend` is true translucency (glass, smoke).
   * Defaults to `blend` when an alpha below 1 is authored, which is what the
   * value alone used to mean.
   */
  alphaMode?: import("./channels.js").AlphaMode;
  /** The cut-off for `alphaMode: "mask"`, 0-1. Default 0.5. */
  alphaCutoff?: number;
  /** Render both faces. Default false — a single-sided surface is cheaper
   *  and catches inside-out geometry, which is why it is not the default. */
  doubleSided?: boolean;
  /**
   * A height field driving real displacement on export, bound like any other
   * channel. The same baked map also derives the normal; this is what makes
   * it move geometry rather than only shade it.
   */
  displacement?: ChannelBinding;
  /** Ambient occlusion, bound like any other channel. Carried on export
   *  rather than into the surface model, which has no AO input. */
  occlusion?: ChannelBinding;

  /* Every remaining channel in MATERIAL_CHANNELS — coat, sheen,
     transmission, subsurface, anisotropic, thin-film, specular, ior,
     normal, and their sub-channels. Declared open rather than listed twice:
     `solve/channels.ts` is the vocabulary and the validator enforces it, so
     an unknown key is still refused by name. */
  [channel: string]: unknown;
}

/**
 * Relations constrain a part's placement on specific axes. A part is solved
 * once every axis is determined; several relations commonly cooperate (one
 * fixes Z by stacking, another fixes X/Y by insetting).
 */
export type Relation =
  /** Absolute anchor. Every scene needs at least one. */
  | { type: "at"; part: string; center: Vec3 }
  /**
   * `part` rests on top of `on`, sunk into it by `embed` so faces overlap.
   *
   * `axis` is the world axis the stack climbs — the direction "on top of"
   * means. Default `z` (gravity), which also records a resting support for
   * grounding. Any other axis is an ATTACHMENT along that axis (a pommel
   * capping a Y-up grip, a finial ahead of a beam): the same face-to-face
   * placement, but it says nothing about gravity, so it records no resting
   * support and the grounding rules ignore it.
   */
  | { type: "sits_on"; part: string; on: string; embed?: number; axis?: Axis }
  /** `part`'s named faces pull in from `from`'s matching faces by `by`. */
  | { type: "inset_from"; part: string; from: string; faces: Face[]; by?: number }
  /** Centre `part` on `to` along the given axes. */
  | { type: "align"; part: string; to: string; axes: Axis[] }
  /** `part` stretches between `from` and `to` along `axis`, biting into both. */
  | { type: "span"; part: string; from: string; to: string; axis: Axis; embed?: number }
  /** `part` floats above `over` with a measured gap — a seating clearance. */
  /** `part` floats past `over` by `clearance`, along `axis` (default z). */
  | { type: "above"; part: string; over: string; clearance?: number; axis?: Axis }
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

/** The two shots that need no steering: an indoor key, or an outdoor sun. */
export type LightPreset = "studio" | "sun";

/**
 * How the scene is lit.
 *
 * The rig is derived from the subject — key power goes as the bounding
 * radius squared so illumination, not the lamp's number, is what stays
 * constant across scales. Every field here scales that derivation rather
 * than replacing it, which is why one spec reads the same on a 26cm lantern
 * and a 26m hangar.
 *
 * The two knobs that matter are `key` and `ambient`, and they are separate
 * because they answer different questions. `key` is the lamp: lower it and
 * shadows deepen. `ambient` is the world the subject sits in: lower it and
 * everything not directly lit goes toward black. A night shot needs BOTH
 * near zero — a dim key against a bright world is an overcast afternoon, and
 * a bright key against a black world is a subject in a void. Neither reads
 * as night, which is exactly what a scene lit only by its own lanterns
 * needs. Emissive materials are what fills that darkness back in.
 */
export interface LightSpec {
  /** Which derived rig to scale. Default `studio`. */
  preset?: LightPreset;
  /**
   * Multiplier on the derived key power. `1` is the calibrated default, `0`
   * removes the key entirely (leaving the world and any emissive surfaces as
   * the only light). Values below ~0.1 are where a lit sign or a lantern
   * starts to be the brightest thing in frame.
   */
  key?: number;
  /**
   * The world's own light, as a linear grey level or an RGB triple. The
   * default is a neutral fill bright enough that a PBR metal has an
   * environment to reflect — against a black world a real metal renders
   * near-black and reads as a broken pipeline. Lower it for night; give it a
   * colour for a dusk or moonlit cast.
   */
  ambient?: number | [number, number, number];
  /**
   * Where the key stands, in the SAME compass convention the camera and the
   * proof orbit use: azimuth 0 is the front (−Y), increasing toward +X.
   * Omitted, the key comes from the camera's own quarter, which is the
   * flattering default and the reason a derived shot never looks unlit.
   */
  azimuthDeg?: number;
  /** Elevation of the key above the horizon, degrees. */
  elevationDeg?: number;
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
  /** Two-sided, as the word means it: no part sinks THROUGH the ground
   *  plane, AND no part hangs unsupported — resting on the ground or
   *  transitively in contact with something that does. Floating stays a
   *  composition, not a defect, through DECLARED floats: a part placed by
   *  `above` hovers on purpose, so does anything in
   *  `conventions.grounding.exempt`, and everything hanging from a
   *  declared float inherits its licence. A hoverer placed with `at`
   *  must be exempted — the claim cannot read minds, only declarations.
   *  Adjudicated across the whole cycle where motion is measurable, at
   *  the rest pose otherwise; UNCHECKED, never failed, when the contact
   *  scan could not trace support. */
  grounded?: boolean;
  /** Ceiling on the scene's world-space height in metres. */
  maxHeight?: number;
  /** FLOOR on the scene's world-space height in metres — a one-line
   *  signature of real-world magnitude. A uniform unit slip has no
   *  intra-scene outliers, so no relative check catches it; this does. */
  minHeight?: number;
  /** Ceiling on the scene's world-space [x, y] footprint in metres. */
  footprint?: [number, number];
  /** Floor on the [x, y] footprint — minHeight's horizontal twin. */
  minFootprint?: [number, number];
  /** Every mesh is a closed manifold — no open edges, no non-manifold ones. */
  watertight?: boolean;
  /** Each named material is actually bound to at least one part. */
  materialsUsed?: string[];
  /** Total EXACT volume (unit density) of the scene's geometry, as a rational
   *  `"n/d"`. It names the fan-triangulated volume of the box-FITTED recipe
   *  solid — the geometry that actually ships — and is adjudicated by EXACT
   *  rational equality against the sum of the kernel's per-part exact volumes.
   *  (The kernel's exact value is itself proven against the build within a float
   *  bound, S3D-E-703, so exact-equality here is a claim about the real mesh.)
   *  Adjudicated only when every mesh part is a `recipe:` part the kernel
   *  evaluated as a single closed orientable solid; any Blender-primitive or
   *  imported part leaves it honestly UNCHECKED (no exact volume exists for
   *  geometry the kernel did not build). The certificate's `volumeAmbiguity`
   *  says how far a consumer's own re-triangulation of non-planar faces can
   *  move it (zero for a planar-faced solid). */
  volume?: string;
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
  /**
   * The light. A preset word for the two common shots, or a spec that steers
   * the same derived rig — the shape {@link CameraSpec} already has.
   */
  light?: LightPreset | LightSpec;
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
  /** Scene-relative Python recipe authoring the box's geometry via the kernel
   *  operator trace, when recipe-backed. */
  recipe?: string;
  material?: string;
  spin?: { axis?: Axis; seconds?: number };
  bob?: { amplitude: number; seconds?: number };
  /** Turn-plus-rise about one axis; see PartSpec.screw. */
  screw?: { axis?: Axis; seconds?: number; rise: number };
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
    /** Solved exactly as asked, but the result asserts something the author
     *  almost certainly did not mean (a span bridging air). Advisory. */
    | "SOLVE-SUSPECT"
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

/**
 * The DEFAULT backstop on a single instance count (`repeat`/`around`/`scatter`)
 * — a RUNAWAY guard, not a size cap, and RAISABLE via
 * `conventions.geometry.maxRepeatCount`. It sits far above any real instanced
 * field (a 200×200 grid fits) so `count: 9999999` — a typo or unit slip —
 * refuses with a diagnostic instead of handing Blender an unbuildable scene; an
 * author building a genuine crowd past it lifts the knob rather than being
 * walled. Build/census time below it is the author's own spend, and the real
 * bound on a truly enormous scene is downstream (Blender's memory), which fails
 * on its own resources.
 */
export const MAX_REPEAT_COUNT = 100_000;

/**
 * The DEFAULT backstop on total parts after expansion — same character as
 * MAX_REPEAT_COUNT, and RAISABLE via `conventions.geometry.maxParts`. The kit
 * viewer's tree payload truncates gracefully past its own display cap, so a
 * scene above that still compiles and ships; this is only the solver's guard
 * against minting an unbuildable count.
 */
export const MAX_PARTS = 100_000;

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

/* ------------------------------------------------------------------ */
/* Shape-aware rotated bounds                                          */
/* ------------------------------------------------------------------ */

/*
 * `rotatedBoxSize` is exact for a box and CONSERVATIVE for everything
 * rounder — and that conservatism was not hypothetical: rotating a cylinder
 * about its own axis (a rotation the shape cannot even perceive) inflated
 * its world box by up to 41%, so the solver placed the fat box flush and
 * the real meshes sat apart by the padding. An author doing the arithmetic
 * on their own numbers then saw "flush" boxes report a measured gap.
 *
 * The correct raw math is the support function. Every shape in the language
 * is convex (or bounded by a convex revolution surface), and for a convex
 * body S the world extent along a unit direction e after a rotation R is
 *
 *     width(e) = h_S(Rᵀe) + h_S(−Rᵀe)      where h_S(d) = max{ d·x : x ∈ S }
 *
 * — no trigonometric special cases, no per-axis folklore. The rotation is
 * applied as a quaternion sandwich, so a future compound `rotate` composes
 * by multiplication instead of growing an Euler-order convention.
 */

type Quat = [number, number, number, number]; // x, y, z, w

function quatFromAxisAngle(axis: Axis, deg: number): Quat {
  const half = (deg * Math.PI) / 360;
  const s = Math.sin(half);
  const q: Quat = [0, 0, 0, Math.cos(half)];
  q[AXES.indexOf(axis)] = s;
  return q;
}

/** v' = q · v · q⁻¹ for a unit quaternion, via the expanded sandwich. */
function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  // t = 2 · (q_vec × v)
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  // v' = v + w·t + q_vec × t
  return [
    v[0] + qw * tx + (qy * tz - qz * ty),
    v[1] + qw * ty + (qz * tx - qx * tz),
    v[2] + qw * tz + (qx * ty - qy * tx),
  ];
}

/** The shape facts the width function needs; a subset of Spec/SolvedPart. */
export interface ShapeFacts {
  shape?: PartShape;
  axis?: Axis;
  tip?: number;
  /**
   * Which end of a wedge's slope is the high one — the ONE shape whose
   * support width is not flip-symmetric (its top face rises to one end, so
   * a tipping rotation reaches a different corner depending on the end).
   * Every other shape here is centrally symmetric or a revolution, so flip
   * cannot change a total width and this is left unread.
   */
  flip?: boolean;
}

/**
 * Total extent of a shape (in its local box of `size`) along a LOCAL unit
 * direction `d` — support(d) + support(−d), evaluated in closed form.
 *
 * Exact for box, sphere (an ellipsoid when the box is not a cube),
 * cylinder, tube (its outer surface governs the bound), cone and frustum
 * (both rims tested), capsule, torus with circular sections, and WEDGE (a
 * right triangular prism — the convex hull of six known vertices);
 * conservative (the box hull) only for file/script parts, whose geometry
 * the solver cannot see. `flip` changes a width for the wedge alone (see
 * ShapeFacts.flip); no other shape consults it.
 */
export function shapeWidthAlong(facts: ShapeFacts, size: Vec3, d: Vec3): number {
  const a = [size[0]! / 2, size[1]! / 2, size[2]! / 2] as Vec3;
  const m = AXES.indexOf(facts.axis ?? "z");
  const [p, q] = [0, 1, 2].filter((i) => i !== m) as [number, number];
  const ellipse = Math.hypot(a[p]! * d[p]!, a[q]! * d[q]!);
  switch (facts.shape) {
    case "sphere":
      return 2 * Math.hypot(a[0]! * d[0]!, a[1]! * d[1]!, a[2]! * d[2]!);
    case "cylinder":
    case "tube":
      return 2 * (a[m]! * Math.abs(d[m]!) + ellipse);
    case "capsule": {
      // Spheroidal caps of the cross radii, shaft covering the remainder.
      const r = Math.min(a[p]!, a[q]!, a[m]!);
      const shaft = Math.max(a[m]! - r, 0);
      return 2 * (shaft * Math.abs(d[m]!) + Math.hypot(a[p]! * d[p]!, a[q]! * d[q]!, r * d[m]!));
    }
    case "cone": {
      // A frustum's extreme points lie on its two rims: the base ellipse at
      // −a_m and the tip ellipse (scaled by `tip`) at +a_m. Which end is
      // which (`flip`) cannot change a total width.
      const t = facts.tip ?? 0;
      const support = (dm: number, e: number) => Math.max(e - a[m]! * dm, t * e + a[m]! * dm);
      return support(d[m]!, ellipse) + support(-d[m]!, ellipse);
    }
    case "torus": {
      // Minor radius is the half-extent along the hole axis; the major
      // ellipse is what remains of the cross half-extents. This is the
      // support of (major ellipse) ⊕ (BALL of the minor radius): exact for
      // the circular-major torus every square box authors, and for an
      // anisotropic box a CONSERVATIVE bound — the ball contains the
      // per-angle oriented tube disc — never an under-estimate.
      const r = a[m]!;
      const major = Math.hypot(Math.max(a[p]! - r, 0) * d[p]!, Math.max(a[q]! - r, 0) * d[q]!);
      return 2 * (major + r);
    }
    case "wedge": {
      // A wedge is a right triangular prism: the convex hull of exactly SIX
      // vertices — the four bottom box corners plus the two top corners at
      // the HIGH end of the slope. The support width of a polytope is a max
      // over its vertices, so this is EXACT (max − min of d·v over the six),
      // and because the six are a strict SUBSET of the box's eight corners
      // it can never exceed the box hull the default branch gives — the same
      // "tighter, never looser" safety every support bound in this language
      // keeps. Mirrors _wedge_verts in emit-bpy.ts: `axis` names the slope
      // direction (the validator forbids z, so the slope is x or y and the
      // tall axis is always z), and `flip` moves the high end to the axis−
      // face. A rotation about z leaves the full-rectangle bottom footprint
      // and the z-extent untouched, so this returns the box hull there
      // exactly; only a tipping rotation (about the slope or across axis)
      // reaches a corner the wedge does not have and tightens the bound.
      const slope = AXES.indexOf(facts.axis ?? "x");
      // A wedge's slope is never z (the validator forbids it); if it somehow
      // is, the tall/slope frame collapses, so fall back to the box hull.
      if (slope === 2) {
        return 2 * (a[0]! * Math.abs(d[0]!) + a[1]! * Math.abs(d[1]!) + a[2]! * Math.abs(d[2]!));
      }
      const tall = 2;
      const across = slope === 0 ? 1 : 0;
      const high = facts.flip ? -1 : 1;
      let lo = Infinity;
      let hi = -Infinity;
      const consider = (su: number, sc: number, sz: number): void => {
        const proj = su * a[slope]! * d[slope]! + sc * a[across]! * d[across]! + sz * a[tall]! * d[tall]!;
        if (proj < lo) lo = proj;
        if (proj > hi) hi = proj;
      };
      // Four bottom corners (z−, both slope signs), two top corners (z+, the
      // high slope end only).
      for (const su of [-1, 1]) for (const sc of [-1, 1]) consider(su, sc, -1);
      for (const sc of [-1, 1]) consider(high, sc, 1);
      return hi - lo;
    }
    default:
      // box, file, script: the box hull.
      return 2 * (a[0]! * Math.abs(d[0]!) + a[1]! * Math.abs(d[1]!) + a[2]! * Math.abs(d[2]!));
  }
}

/**
 * Exact separating-axis verdict between two oriented boxes.
 *
 * The world-AABB penetration test is a strict OVER-approximation for
 * rotated parts: an oriented ring's turned bars can have AABBs that
 * interpenetrate by centimetres while the boxes themselves are cleanly
 * apart — and `SOLVE-INTERSECTION` then scolds a scene that is fine. For
 * two OBBs the 15 SAT axes (3 + 3 face normals, 9 edge cross products) are
 * COMPLETE: a positive gap on any axis proves disjoint, and if every axis
 * overlaps the boxes intersect, with the smallest overlap the exact
 * minimum translation distance. Orientations ride the same quaternion the
 * rotated-bounds math uses.
 *
 * Returns a signed separation: the MAXIMUM gap over all 15 axes. Positive =
 * the tightest SAT separation bound (a certified lower bound on the true
 * distance, exact for face-to-face closest features); negative = minus the
 * exact minimum translation distance. The search does NOT early-exit on the
 * first separating axis: that returns an arbitrary witness far below the true
 * separation (a 0.01°-tilted pair 49 m apart witnessed 0.03 m on its first
 * axis), which is fine for a "do they intersect" sign test but wrong for any
 * consumer reading the magnitude as a clearance — so the full max is taken.
 */
export function obbSeparation(
  a: { center: Vec3; size: Vec3; rotate?: { axis: Axis; deg: number } },
  b: { center: Vec3; size: Vec3; rotate?: { axis: Axis; deg: number } },
): number {
  const basis = (r: { axis: Axis; deg: number } | undefined): [Vec3, Vec3, Vec3] => {
    if (!r) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const q = quatFromAxisAngle(r.axis, r.deg);
    return [quatRotate(q, [1, 0, 0]), quatRotate(q, [0, 1, 0]), quatRotate(q, [0, 0, 1])];
  };
  const ua = basis(a.rotate);
  const ub = basis(b.rotate);
  const ha = [a.size[0]! / 2, a.size[1]! / 2, a.size[2]! / 2];
  const hb = [b.size[0]! / 2, b.size[1]! / 2, b.size[2]! / 2];
  const d: Vec3 = [
    b.center[0]! - a.center[0]!,
    b.center[1]! - a.center[1]!,
    b.center[2]! - a.center[2]!,
  ];
  const dot = (u: Vec3, v: Vec3) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  const cross = (u: Vec3, v: Vec3): Vec3 => [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  const axes: Vec3[] = [...ua, ...ub];
  for (const p of ua) for (const q of ub) axes.push(cross(p, q));
  let best = -Infinity;
  for (const axis of axes) {
    const len = Math.hypot(axis[0]!, axis[1]!, axis[2]!);
    // Parallel edges cross to ~zero; that direction is already covered by
    // the face normals, so it is skipped rather than divided by nothing.
    if (len < 1e-9) continue;
    const L: Vec3 = [axis[0]! / len, axis[1]! / len, axis[2]! / len];
    const ra = ha[0]! * Math.abs(dot(L, ua[0]!)) + ha[1]! * Math.abs(dot(L, ua[1]!)) + ha[2]! * Math.abs(dot(L, ua[2]!));
    const rb = hb[0]! * Math.abs(dot(L, ub[0]!)) + hb[1]! * Math.abs(dot(L, ub[1]!)) + hb[2]! * Math.abs(dot(L, ub[2]!));
    const gap = Math.abs(dot(L, d)) - (ra + rb);
    if (gap > best) best = gap;
    // No early exit: the first separating axis is only a witness, and its gap
    // can be orders of magnitude below the true separation. The tightest SAT
    // bound is the MAX over every axis, so the loop always finishes — 15 axes
    // is cheap, and the magnitude is now trustworthy as a distance.
  }
  return best;
}

/**
 * The world box a rotated shape actually occupies — `rotatedBoxSize`, made
 * shape-aware. Each world axis is carried into the shape's local frame by
 * the inverse rotation and measured with the exact width function above; a
 * cylinder turned about its own axis therefore keeps its box to the last
 * bit, and a turned frustum reserves exactly the space its rims sweep.
 */
export function rotatedShapeSize(
  facts: ShapeFacts,
  size: Vec3,
  rotate: { axis: Axis; deg: number } | undefined,
): Vec3 {
  if (!rotate) return [...size] as Vec3;
  const inverse = quatFromAxisAngle(rotate.axis, -rotate.deg);
  const out = [0, 0, 0] as Vec3;
  for (let i = 0; i < 3; i++) {
    const e: Vec3 = [0, 0, 0];
    e[i] = 1;
    out[i] = shapeWidthAlong(facts, size, quatRotate(inverse, e));
  }
  return out;
}
