/**
 * scene3d domain types.
 *
 * The scene3d subsystem treats a 3D scene project like a code project:
 * sources are text (USDA layers or bpy build scripts), the daemon compiles
 * them through a deterministic pipeline (parse -> build -> lint -> proof ->
 * export -> manifest), and every stage reports structured issues with stable
 * codes instead of prose. This file owns the shapes that cross stage
 * boundaries; nothing in here imports daemon or web code.
 */

// Type-only, so the circular reference between this file and the read
// module costs nothing at runtime — impact.ts imports Census from here.
import type { ImpactReport } from "./read/impact.js";

export type StageId = "parse" | "build" | "lint" | "proof" | "export" | "manifest";

export interface StageReport {
  id: StageId;
  status: "ran" | "cached" | "skipped";
  durationMs: number;
}

export type SourceKind = "usda" | "bpy" | "blend" | "spec" | "mesh";

export interface SceneSource {
  kind: SourceKind;
  /** Project-relative paths that together describe the scene. */
  files: string[];
}

/** The conventions contract (`scene3d.json`) — the single source of truth
 *  that both the agent and the linter read. */
/**
 * A target engine/runtime. Selecting one preloads the conventions that engine
 * expects — up axis, triangle budgets, texture caps, UV posture — so the
 * linter's verdict reads as "authoritative for YOUR engine" instead of "our
 * house opinions". A preset only sets DEFAULTS: any explicit convention in the
 * same file overrides it, and omitting `target` keeps the neutral defaults.
 */
export type EngineTarget = "unity" | "unreal" | "godot" | "web" | "3d_print";

export interface Scene3dContract {
  schemaVersion: 1;
  /** Preset conventions for a delivery target; explicit conventions win. */
  target?: EngineTarget;
  conventions?: {
    naming?: {
      /** Regex applied to every object/prim name. */
      objectPattern?: string;
      /** Blender default names (Cube, Cube.001, Empty, ...) are errors. */
      forbidDefaultNames?: boolean;
      /** When set, every name must start with one of these prefixes. */
      partPrefixes?: string[];
      /** Regex applied to collection/scope names. */
      collectionPattern?: string;
    };
    hierarchy?: {
      /** Maximum depth of the object/prim tree below the root scope. */
      maxDepth?: number;
    };
    units?: {
      /** Meters per unit of the composed stage. */
      metersPerUnit?: number;
      /** Up axis: "Y" (Blender convention) or "Z" (common DCC convention). */
      upAxis?: "Y" | "Z";
    };
    pbr?: {
      /**
       * Allowed metallic values; anything else is an error. An empty
       * array means unconstrained — the inspection posture for ingested
       * third-party assets, which use fractional metallic freely.
       */
      metallicValues?: number[];
      /** Inclusive roughness range. */
      roughnessRange?: [number, number];
      /** Inclusive IOR range (warn outside). */
      iorRange?: [number, number];
    };
    animation?: {
      fps?: number;
      maxFrames?: number;
    };
    /**
     * Grounding: a prop should rest on the ground plane, not float above it
     * or sink through it. Exemptions are declared per part rather than
     * hardcoded, so an asset that deliberately dips below zero — a bedded
     * rock, a wall-mounted lantern, a skybox — has to say so out loud. The
     * flags become the documentation.
     */
    grounding?: {
      enabled?: boolean;
      /** Forgiven float/sink in metres (chamfer bleed). */
      tolerance?: number;
      /** Part-name prefixes or exact names exempt from the rule. */
      exempt?: string[];
    };
    /** Triangle budgets, checked against the census rather than estimated. */
    budgets?: {
      maxTrianglesPerMesh?: number;
      maxTrianglesTotal?: number;
    };
    /**
     * UV discipline. Everything is measured by the census; these knobs are
     * the project's policy about the measurements. `require` is the core:
     * "textured" (default) demands UVs wherever an image texture is bound,
     * "all" demands them on every mesh, "off" disables UV verdicts.
     */
    uv?: {
      require?: "textured" | "all" | "off";
      /** Overlapping-island tolerance as a fraction of covered texels. */
      maxOverlapFraction?: number;
      /** Mirrored islands allowed? Deliberate mirroring sets this true. */
      allowFlipped?: boolean;
      /**
       * Fraction of UV verts allowed outside 0-1. Defaults to 1 (anything)
       * because tiling is a legitimate technique; trim-sheet or atlas
       * projects tighten it to ~0.
       */
      maxOutOfBoundsFraction?: number;
      texelDensity?: {
        /** Target px/m; deviations beyond maxRatio from it are flagged. */
        target?: number;
        /** Allowed max/min density spread within and across meshes. */
        maxRatio?: number;
      };
    };
    /** Texture-file discipline — checked against the files, not the nodes. */
    textures?: {
      requirePowerOfTwo?: boolean;
      /** Longest allowed edge in pixels. */
      maxSize?: number;
      /** Flag materials with identical parameters and textures (draw calls). */
      flagDuplicateMaterials?: boolean;
      /** Flag faces whose material slot is empty. */
      requireFaceAssignment?: boolean;
    };
    /** Engine-hygiene geometry rules beyond basic topology. */
    geometry?: {
      /**
       * Permit non-manifold (open) meshes. Real game assets are routinely
       * open — single-sided cards, non-closed character skins — so scenes
       * that ingest third-party files set this; authored scenes keep the
       * watertight default.
       */
      allowOpenMeshes?: boolean;
      allowLooseGeometry?: boolean;
      allowDoubleVertices?: boolean;
      allowInconsistentWinding?: boolean;
      /** Negative scale flips normals on import; an error unless allowed. */
      allowNegativeScale?: boolean;
      /** Non-1 object scale must be applied before export. */
      requireAppliedScale?: boolean;
    };
  };
  /**
   * 2D sheets this project ships alongside its geometry. Declaring a sheet
   * is what makes it checkable: the kind determines which rules apply, and
   * flags like `tint` are the asset's own statement of intent.
   */
  sheets?: Array<{
    file: string;
    kind: "sprite" | "flipbook" | "particle" | "beam" | "sky";
    /**
     * Compositing mode. `additive` (fire, beams, sparks) sums RGB and ignores
     * alpha, so the alpha-carries-the-silhouette checks are gated off and a
     * dark-border check stands in; omitted/`alpha` keeps the default alpha
     * rules. See the `blend` field on the sheet linter's `SheetSpec`.
     */
    blend?: "alpha" | "additive";
    grid?: [number, number];
    tint?: boolean;
    inset?: number;
    face?: "ft" | "bk" | "lf" | "rt" | "up" | "dn";
    set?: string;
  }>;
  proof?: {
    engine?: "BLENDER_EEVEE" | "CYCLES";
    resolution?: number;
    turntable?: boolean;
    turntableSteps?: number;
    respectSceneCamera?: boolean;
    /** World background as a hex colour, authored by the compiler so the
     *  scene never has to defensively build a world node graph itself. */
    background?: string;
  };
  /**
   * Deliverable formats. This is a *contract* concern: the author writes
   * geometry and materials; which containers the compiler emits is the
   * project's delivery policy, not something a build script should know.
   */
  export?: {
    formats?: Array<"usda" | "usdz" | "glb" | "obj" | "fbx" | "stl" | "ply">;
  };
}

export interface ProofOptions {
  engine?: "BLENDER_EEVEE" | "CYCLES";
  resolution?: number;
  turntable?: boolean;
  turntableSteps?: number;
  respectSceneCamera?: boolean;
  background?: string;
}

export interface CompileRequest {
  /** Absolute path to the project directory holding the scene sources. */
  projectDir: string;
  /**
   * Project-relative label for this scene ("props/crate"). Purely
   * informational to the pipeline, but it is what the compiled artifact
   * records so the host can reopen the right scene without inferring one
   * from a file path.
   */
  scenePath?: string;
  /** Loaded contract; when omitted, `scene3d.json` in projectDir is used. */
  contract?: Scene3dContract;
  /** Restrict the pipeline to these stages (default: all). */
  stages?: StageId[];
  proof?: ProofOptions;
  /** Absolute path to a Blender executable (or `python` when bpy is used). */
  blenderBin?: string;
  /** Use the python-module (pip `bpy`) path instead of a Blender executable. */
  pythonBin?: string;
  /** Disable the per-stage content-hash cache. */
  noCache?: boolean;
  /** Per-stage wall-clock timeout in milliseconds. */
  timeoutMs?: number;
  /** Extra environment variables for the Blender/python child process. */
  env?: Record<string, string>;
}

export interface CompileResult {
  ok: boolean;
  source: SceneSource;
  stages: StageReport[];
  issues: Issue[];
  census?: Census;
  primTree?: UsdaPrimTree;
  manifest: Scene3dManifest;
  /** Project-relative paths of rendered proof images. */
  proofImages: string[];
  /** Project-relative paths of exported assets. */
  exportedAssets: string[];
  summary: IssueSummary;
  /**
   * A budgeted, hierarchical summary of what the scene IS — as opposed to
   * the issue list, which says what is wrong with it. Present whenever the
   * manifest stage ran.
   */
  digest?: string;
  /**
   * What this compile changed relative to the previous one, including
   * relationships that changed without either part moving. Absent on a
   * first compile, when there is nothing to have changed from.
   */
  impact?: ImpactReport;
}

export type Severity = "error" | "warning" | "info";

export interface Issue {
  code: string;
  severity: Severity;
  /** Human-readable summary, kept terse — the code is the contract. */
  message: string;
  /** Stable hint pointing at the fix. */
  hint?: string;
  /** Project-relative file the issue belongs to, when known. */
  file?: string;
  /** Object / prim / material name the issue belongs to, when known. */
  target?: string;
  /** Machine-readable detail, e.g. { actual: 0.5 }. */
  detail?: Record<string, unknown>;
}

export interface IssueSummary {
  errors: number;
  warnings: number;
  infos: number;
}

/* ------------------------------------------------------------------ */
/* Census — deterministic scene facts dumped by the Blender runner.    */
/* ------------------------------------------------------------------ */

export interface CensusObject {
  name: string;
  type: string;
  parent: string | null;
  location: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  dimensions: [number, number, number];
  visible: boolean;
  hasMeshData: boolean;
  /** World-space AABB. Null when the runner could not compute it. */
  worldMin?: [number, number, number] | null;
  worldMax?: [number, number, number] | null;
}

export interface CensusMesh {
  object: string;
  verts: number;
  faces: number;
  /** Triangle count after triangulation — the unit budgets are stated in. */
  tris?: number;
  ngons: number;
  nonManifoldEdges: number;
  zeroAreaFaces: number;
  nan: boolean;
  uvLayers: string[];
  /** Material names bound to this mesh's slots, sorted. */
  materials?: string[];
  /**
   * Measured UV facts for the active layer, or null when the mesh has no
   * UV layer. Optional because a census from an older runner will not
   * carry it — readers treat absence as "not measured", never as "fine".
   */
  uv?: CensusUv | null;
  /** Vertices belonging to no face — invisible, but exported and picked. */
  looseVerts?: number;
  /** Edges belonging to no face. */
  looseEdges?: number;
  /** Vertex pairs within merge distance (1e-6 m) — split seams in disguise. */
  doubleVertices?: number;
  /**
   * Manifold edges whose two faces disagree in winding. Engines light one
   * side of that seam inside-out; Blender's viewport hides it.
   */
  inconsistentWindingEdges?: number;
  /** Faces whose material slot is empty or out of range. */
  facesWithoutMaterial?: number;
  /** Total world-space surface area, m². */
  surfaceArea?: number;
  /**
   * Triangles per m² of actual surface — the density-allocation number
   * that says whether a budget was spent sensibly. Null on zero-area
   * meshes. Compare across parts: a 100x spread inside one scene is the
   * classic generated-asset failure.
   */
  triDensity?: number | null;
  /**
   * Bilateral symmetry error about the mesh's own bbox-centre X plane:
   * nearest-mirror distance in metres over sampled vertices. Renders hide
   * asymmetry ruthlessly; this is the number that doesn't. A measured
   * fact, not a verdict — deliberately asymmetric parts simply read high.
   * Null when unmeasured (empty or over-cap mesh) — never "fine".
   */
  symmetry?: { axis: "x"; maxError: number; meanError: number; sampled: boolean } | null;
  /**
   * World-space measurements of this object, or null if it has no
   * vertices. Optional because a census from an older runner will not
   * carry it.
   */
  spatial?: CensusSpatial | null;
}

/**
 * UV facts for one mesh, measured on the active UV layer.
 *
 * Everything here is a measurement; whether a number is acceptable is the
 * contract's call (`conventions.uv`). Grid statistics (coverage, overlap)
 * come from rasterising the UV triangles onto a fixed 64x64 occupancy
 * grid — deterministic, resolution-bounded, and honest about its own
 * limits via `sampled`.
 */
export interface CensusUv {
  /** Active layer name. */
  layer: string;
  /** Fraction of the 0-1 tile covered by at least one island. */
  coverage: number | null;
  /** Fraction of covered texels claimed by more than one face. */
  overlapFraction: number | null;
  /** Faces whose UV winding is negative — mirrored islands. */
  flippedFaces: number;
  /**
   * Fraction of UV vertices outside the layer's own tile (tiling reads as
   * high). Tile-relative, not absolute: GPUs sample with wrap, and
   * Blender's glTF importer parks every imported layout in V [-1, 0], so
   * the layer is first shifted by the integer tile of its mean. Coverage
   * and overlap are likewise measured per-face-tile.
   */
  outOfBoundsFraction: number;
  /**
   * Texels per metre across textured faces, from world-space face area and
   * the largest texture bound to the face's material slot. Null when no
   * face has a textured material — density without a texture is undefined,
   * and reporting a made-up number would be worse than none.
   */
  texelDensity: { min: number; max: number; mean: number } | null;
  /** False when the mesh exceeded the raster budget and grid facts are null. */
  sampled: boolean;
}

/**
 * What a part actually occupies, measured rather than inferred.
 *
 * These are the numbers that answer proportion and placement questions
 * without a render: how big is this, where does it sit, is it above the
 * floor. They exist because an agent reading a single framed screenshot is
 * guessing at exactly this, and guessing is where placement bugs come from.
 */
export interface CensusSpatial {
  worldMin: [number, number, number];
  worldMax: [number, number, number];
  /** Extent along each world axis. */
  size: [number, number, number];
  bboxCenter: [number, number, number];
  /**
   * Mean vertex position. Not a centre of mass: that would require uniform
   * density and a closed manifold, neither of which this pipeline can
   * promise, so it is named for what it measures.
   */
  centroid: [number, number, number];
  /**
   * Height of the lowest vertex above the z=0 ground plane (Blender is
   * Z-up). Zero is resting on the floor, positive is floating, negative is
   * buried. Numerically this is worldMin's z — it exists as its own field
   * because it is the SEMANTIC readout the digest and grounding reasoning
   * consume, not a second coordinate.
   */
  groundGap: number;
}

/** Axis-wise separation between two nearby parts. */
export interface CensusContact {
  a: string;
  b: string;
  /** Per-axis separation; negative where the two spans overlap. */
  gap: [number, number, number];
  /** The largest per-axis gap — the distance apart, or <=0 if intersecting. */
  separation: number;
  intersects: boolean;
}

export interface CensusMaterial {
  name: string;
  usedByObjectCount: number;
  /** Image names bound in this material's node tree, sorted. */
  textureNames?: string[];
  principled: {
    present: boolean;
    metallic: number | null;
    roughness: number | null;
    ior: number | null;
    baseColor: [number, number, number] | null;
    hasTexture: boolean;
    untouchedDefault: boolean;
    /** Linear RGB; absent on censuses taken before the material panel. */
    emission?: [number, number, number];
    emissionStrength?: number;
    alpha?: number;
  };
}

export interface CensusTexture {
  name: string;
  filepath: string;
  colorSpace: string;
  width: number;
  height: number;
  /**
   * The file path resolves to nothing on disk (and the image is not packed
   * into the blend). Blender renders it magenta; an engine import fails.
   */
  fileMissing?: boolean;
}

export interface ZFightingPair {
  a: string;
  b: string;
  faceCount: number;
  area: number;
  /**
   * Geometry of the worst overlapping pair: the world axis the shared
   * plane faces, where along that axis it sits, and the overlap patch's
   * 2D extent — the numbers that turn "these z-fight" into a fix.
   */
  worst?: { axis: "x" | "y" | "z"; at: number; extent: [number, number] };
}

export interface CensusCamera {
  present: boolean;
  name: string | null;
  /**
   * True when the camera is the COMPILER'S own staging (ensure_staging
   * framing a bare imported asset), not something the author placed.
   * Optional: censuses taken before the flag read as authored, which
   * keeps their classification exactly what it was.
   */
  staging?: boolean;
}

export interface CensusAnimation {
  fps: number;
  frameStart: number;
  frameEnd: number;
  keyframedObjects: string[];
  /** Names of actions that actually animate something (both action APIs). */
  actionNames?: string[];
}

/** A skeleton in the scene — a census fact, not a DCC discovery. */
export interface CensusArmature {
  name: string;
  bones: number;
}

/**
 * Coverage statistics for one rendered proof frame. The proof stage is the
 * loop's vision feedback, so "did the render actually show anything" has to
 * be a measured fact rather than an assumption.
 */
export interface ProofFrameStats {
  /** Absolute path the runner wrote. */
  path: string;
  /** Mean Rec.709 luminance across a fixed sample grid, or null if unread. */
  meanLuminance: number | null;
  /** Fraction of sampled pixels above the background threshold. */
  coverage: number | null;
  /** Fraction of LIT pixels near pure white — the overexposure signal. */
  blownRatio?: number | null;
}

export interface Census {
  blenderVersion: string;
  sceneName: string;
  upAxis: "Y" | "Z";
  objects: CensusObject[];
  meshes: CensusMesh[];
  materials: CensusMaterial[];
  textures: CensusTexture[];
  uvObjectsWithoutLayers: string[];
  objectsWithoutMaterial: string[];
  zFightingPairs: ZFightingPair[];
  /**
   * Parts of the scene the coplanar search deliberately did not examine,
   * each with the reason. Empty means the search was exhaustive, so an
   * empty `zFightingPairs` genuinely means "none found" rather than "not
   * looked for". Optional because a census written by an older runner will
   * not carry it.
   */
  zFightingSkipped?: string[];
  /**
   * Every pair of parts near enough to be in a relationship, with the
   * measured gap between them. This is what makes "does A actually touch
   * B" and "is C clear of D" answerable from the compile output instead of
   * from a screenshot.
   */
  contacts?: CensusContact[];
  /** Pairs the contact scan did not examine, and why. */
  contactsSkipped?: string[];
  /**
   * Object name to the build-script line that created it.
   *
   * Turns "these two parts z-fight" into "these two parts z-fight, both
   * from build.py:47". Without it the reader has to work backwards from
   * geometry to the loop that emitted it, which is the most expensive
   * debugging step in this pipeline and the one a viewport click solves
   * for a human but nothing solves for an agent.
   */
  provenance?: Record<string, { file: string; line: number | null }>;
  camera: CensusCamera;
  lightCount: number;
  animation: CensusAnimation;
  /** Skeletons present in the scene, with bone counts. Optional because a
   *  census from an older runner will not carry it. */
  armatures?: CensusArmature[];
  /**
   * Degraded-import facts detected while loading real asset files: a
   * missing .mtl companion, a file that imported no geometry. The
   * deterministic repair posture — detect and name the gap with its fix,
   * never mutate or guess.
   */
  importNotes?: string[];
  offCameraObjects: string[];
}

/* ------------------------------------------------------------------ */
/* USDA — the pure-TS parse tree (structure-only, no composition).     */
/* ------------------------------------------------------------------ */

export interface UsdaPrim {
  name: string;
  kind: "def" | "over" | "class" | "scope";
  typeName: string | null;
  parent: string | null;
  children: UsdaPrim[];
  /** Authored attribute names -> raw value strings. */
  attributes: Map<string, string>;
  /**
   * Prim METADATA names -> raw value strings: the `( ... )` block, where
   * `kind`, `assetInfo`, `customData` and `apiSchemas` live. Distinct from
   * attributes, which are the `{ ... }` body.
   */
  metadata: Map<string, string>;
  /** Reference / payload / sublayer target paths as authored. */
  references: string[];
  payloads: string[];
  /** Line number in the source file, for issue reporting. */
  line: number;
  /** Source file path (project-relative when requested). */
  sourceFile: string;
}

export interface UsdaPrimTree {
  root: UsdaPrim;
  /** All prims flattened, depth-first. */
  prims: UsdaPrim[];
  /** Stage header metadata (defaultPrim, metersPerUnit, upAxis, subLayers). */
  stage: {
    defaultPrim?: string;
    metersPerUnit?: number;
    upAxis?: "Y" | "Z";
    subLayers: string[];
    startTimeCode?: number;
    endTimeCode?: number;
  };
}

/* ------------------------------------------------------------------ */
/* Manifest — the RecordAsset-equivalent for a compiled scene.         */
/* ------------------------------------------------------------------ */

/**
 * What the compile actually produced, as a category rather than a file list.
 *
 * The pipeline is general — anything Blender can build, it can build — so the
 * deliverable is not always "a scene". A texture bake, a flipbook, a beam
 * sheet, and a walk cycle all come out of the same six stages, and a host
 * that only knows "scene" has to describe every one of them wrong.
 *
 * The kind is DERIVED, never authored: it reads what the census and the
 * declared sheets already say. An author who adds a keyframe gets an
 * `animation`; one who declares a flipbook sheet gets a `flipbook`. Nothing
 * to keep in sync, and nothing to get wrong in a config file.
 */
export type Scene3dAssetKind =
  /** Several named parts, usually staged together with a camera. */
  | "scene"
  /** One self-contained object — a prop, a part, a single mesh tree. */
  | "prop"
  /** Several compiled scenes browsed as one collection. */
  | "kit"
  /** Geometry that moves: keyframes across a frame range. */
  | "animation"
  /** A sprite sheet: a grid of stills. */
  | "sprite"
  /** A flipbook: a grid meant to play as a loop. */
  | "flipbook"
  /** Particle and beam sheets — the VFX inputs. */
  | "vfx"
  /** Cubemap faces for a sky. */
  | "skybox"
  /** Image maps with no geometry of their own. */
  | "texture";


/**
 * One part's viewer-authored offset from the geometry the source describes.
 *
 * Every channel is optional and composes by its own operation: translation
 * adds, rotation multiplies as a quaternion, scale multiplies per axis. The
 * shape was previously written inline as translate-only, which quietly
 * understated what the daemon writes and what Blender applies.
 */
export interface PartTweak {
  translate?: [number, number, number];
  /** [x, y, z, w], unit length. */
  quat?: [number, number, number, number];
  scale?: [number, number, number];
  /**
   * The part's material, as the viewer's material panel left it.
   *
   * Unlike the transform channels this is ABSOLUTE state, not a delta:
   * `assign` rebinds the part to an existing scene material by name (the
   * picker), and the property keys override on top of whatever is bound
   * (the customizer). Overriding a material that other parts share makes a
   * per-part instance copy — Unreal's material-instance semantics — so one
   * part's tweak can never silently restyle thirty others. Colours are
   * LINEAR floats, matching Blender's Principled inputs and the glTF
   * factors; the viewer owns the sRGB conversion for display.
   */
  material?: PartMaterialTweak;
}

/** The material channel of a {@link PartTweak}. All keys optional. */
export interface PartMaterialTweak {
  /** Rebind to this existing scene material (stale names are ignored). */
  assign?: string;
  /** Linear RGB, each 0..1. */
  baseColor?: [number, number, number];
  roughness?: number;
  metallic?: number;
  /** Linear RGB, each 0..1; strength carries the energy. */
  emission?: [number, number, number];
  emissionStrength?: number;
  alpha?: number;
}

export interface Scene3dManifest {
  schemaVersion: 1;
  generatedAt: string;
  source: SceneSource;
  blender: { version: string | null; used: boolean };
  partTree: ManifestPart[];
  materials: ManifestMaterial[];
  textures: ManifestTexture[];
  animation: { fps: number; frameStart: number; frameEnd: number; keyframedObjects: string[] };
  camera: { present: boolean; name: string | null };
  proofImages: string[];
  exportedAssets: string[];
  issues: IssueSummary;
  issueCodes: string[];
  /**
   * The viewer edits this build actually baked into the geometry.
   *
   * Saving an edit writes an offset to `tweaks.json`; Blender applies it on
   * the NEXT compile. Between those two moments the file says the part has
   * moved and the mesh the browser downloads says it has not, and nothing
   * recorded which of the two was true — so the viewer had to guess, and it
   * guessed that everything on disk was already baked. It is not, right
   * after a save: reopening the page showed the part back where it started,
   * with no unsaved marker and no way to tell that the edit had in fact been
   * written. The work looked lost.
   *
   * Recording what was baked makes the difference computable rather than
   * assumed: whatever is in the file and not in here has yet to reach the
   * geometry.
   */
  bakedTweaks?: Record<string, PartTweak>;
  /**
   * What this compile produced, derived from the census and the declared
   * sheets. Optional only for manifests written before the field existed;
   * readers should fall back to deriving it rather than assuming "scene".
   */
  assetKind?: Scene3dAssetKind;
  /**
   * The spec's claims ledger: how many properties the author asserted and
   * how many the census refuted. `declared > 0 && failed === 0` is the
   * strongest statement a compile can make about itself — the artifact
   * PROVED what it says it is — and the UI may wear it as a quiet badge.
   * Absent when the scene declares no claims (which is not a failure).
   */
  claims?: { declared: number; failed: number };
  /**
   * Scale sanity readout. Authors derive dimensions by arithmetic and the
   * mistakes (a 2mm straw tuft, a 40m crate) are invisible until rendered;
   * echoing the measured extremes back turns them into numbers you can
   * check against intent before ever opening a PNG.
   */
  metrics?: {
    /** World bounding box of all mesh parts, metres. */
    worldSize: [number, number, number] | null;
    smallestPart: { name: string; minDimension: number } | null;
    largestPart: { name: string; maxDimension: number } | null;
    totalTriangles: number;
  };
}

export interface ManifestPart {
  name: string;
  type: string;
  parent: string | null;
  depth: number;
  mesh: { verts: number; faces: number } | null;
}

export interface ManifestMaterial {
  name: string;
  usedByObjects: number;
  metallic: number | null;
  roughness: number | null;
  hasTexture: boolean;
}

export interface ManifestTexture {
  name: string;
  filepath: string;
  resolution: [number, number];
}

export type { ImpactReport, PartMove, ContactChange } from "./read/impact.js";
