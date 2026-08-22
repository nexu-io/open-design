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

export type SourceKind = "usda" | "bpy" | "blend" | "spec" | "mesh" | "mc_model";

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
export type EngineTarget = "unity" | "unreal" | "godot" | "web" | "3d_print" | "voxel" | "minecraft";

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
      /** The dark-metal realism heatmap: a dark base colour driven fully
       *  metallic and mirror-smooth is a black mirror, not a surface. Judged
       *  on scalar channels only. Set `enabled:false` to opt out entirely. */
      realism?: {
        enabled?: boolean;
        /** Rec709 luminance of the linear base colour, at or below which it is
         *  "dark" (0..1). */
        darkLuminanceMax?: number;
        /** Metallic at or above which the surface is "a metal". */
        metalMin?: number;
        /** Roughness at or below which the surface is "a mirror". */
        roughMax?: number;
      };
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
      /** Redefine what a role means for this project — overrides the built-in
       *  ROLE_PROFILES, keyed by role name (`{ hero: { triShare: {...} } }`). */
      roles?: Record<string, Budget>;
      /** Override a single part's budget by its id, winning over its role. */
      parts?: Record<string, Budget>;
    };
    /**
     * Design-for-manufacture gates for 3D printing. Set (by `target:"3d_print"`
     * or explicitly) they turn on the print census facts and their judgments;
     * absent, the compiler measures overhang cheaply but judges nothing.
     */
    print?: {
      /** Thinnest printable wall (mm) — under this a wall fails to form. */
      minThicknessMm?: number;
      /** Fraction of surface allowed to be a support-needing overhang. */
      maxOverhangAreaFraction?: number;
    };
    /**
     * Thresholds for the 2D sheet rules (S3D-*-6xx). Distinct from the
     * top-level `sheets` array, which DECLARES the sheets; this tunes how
     * they are judged. Defaults live in lint/sheet.ts beside their rationale.
     */
    sheets?: {
      /** Largest edge a sheet may have (px). */
      maxDimension?: number;
      /** Mean channel difference above which a tiling seam counts as broken. */
      seamTolerance?: number;
      /** Brightest channel a dark border may carry on an additive sheet. */
      additiveBorderMax?: number;
    };
    /**
     * Scene-coherence tuning. `outlierZ` is the robust z-score (median + MAD,
     * log scale) beyond which a part's size or triangle density is flagged as a
     * distribution outlier — a likely unit slip or an LOD absurdity. Default is
     * the conventional Iglewicz–Hoaglin cutoff 3.5; raise it to quiet a scene
     * that legitimately mixes scales.
     */
    coherence?: { outlierZ?: number };
    /**
     * Voxel / Minecraft discipline. Set (by `target:"minecraft"` or an
     * explicit block) it turns on the voxel census facts and their judgments;
     * absent, the compiler measures and judges nothing voxel-specific, so
     * every non-Minecraft scene is byte-identical. These are format and
     * consistency facts, never a style: they help a modeller emit a model the
     * game will load and iterate on it reliably — they never opine on what to
     * build. A block model is authored in metres where 1 block = 1 m, so the
     * existing px·m⁻¹ texel density IS px-per-block.
     */
    /**
     * Generic voxel / blocky-art discipline — engine-AGNOSTIC, for the whole
     * voxel ecosystem (MagicaVoxel, Goxel, Qubicle → Unity/Godot/Unreal via
     * OBJ/glTF), not just Minecraft. Set by `target:"voxel"` (or an explicit
     * block, or implied by `target:"minecraft"`). It turns on grid alignment,
     * grid-snapping of emergent placement, and the pixel-art texel density
     * authority — none of which are Minecraft-specific. Minecraft's own FORMAT
     * rules (cuboid elements, legal rotations, element bounds, model export)
     * live in the `minecraft` block and layer ON TOP of this.
     */
    voxel?: {
      /** The authoring grid vertices should land on. `size` in metres (default
       *  1/16 — one pixel at a 16-unit resolution); `tolerance` is the forgiven
       *  off-grid drift (m). A 32-unit author sets size 1/32 — the grid is data,
       *  not a house rule. */
      grid?: { size?: number; tolerance?: number };
      /** Declared texture resolution in pixels per grid-unit (per block, for
       *  Minecraft). When set, the density authority becomes pixel-art; omitted,
       *  only a relative consistency check fires — never asserts a fixed number. */
      pxPerBlock?: number | null;
    };
    minecraft?: {
      /** `java` (vanilla block/item models: cuboid-only, one restricted
       *  rotation) or `bedrock` (free-angle cubes, poly_mesh). Default `java`. */
      dialect?: "java" | "bedrock";
      /** Legal element extent in blocks (vanilla Java is −1..2 = −16..32 px).
       *  A model outside this the game refuses to load; the bound is contract
       *  data so a format change is a number edit, not a code change. */
      elementBounds?: { minBlocks?: number; maxBlocks?: number };
      /** @deprecated Use `conventions.voxel.grid`; accepted here for a bare
       *  Minecraft contract and folded into the voxel layer. */
      grid?: { size?: number; tolerance?: number };
      /** @deprecated Use `conventions.voxel.pxPerBlock`; folded into voxel. */
      pxPerBlock?: number | null;
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
      /**
       * Max allowed UV stretch anisotropy (σmax/σmin) on a textured mesh.
       * Opt-in: omitted means unconstrained, because real assets carry a wide
       * range of legitimate stretch. A trim-sheet or hero-prop project sets it
       * (e.g. 4) to catch smeared texturing.
       */
      maxStretch?: number;
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
    /** Proof-QUALITY lint thresholds (not render config). Overridable because
     *  a deliberately dark or flat-lit stylized asset has a legitimately
     *  different notion of "too dark", "too small", or "blown out". */
    emptyLuminance?: number;
    sparseCoverage?: number;
    blownRatio?: number;
  };
  /**
   * Deliverable formats. This is a *contract* concern: the author writes
   * geometry and materials; which containers the compiler emits is the
   * project's delivery policy, not something a build script should know.
   */
  export?: {
    formats?: Array<"usda" | "usdz" | "glb" | "obj" | "fbx" | "stl" | "ply">;
    /**
     * Decimated level-of-detail GLB variants, as triangle-keep ratios in
     * (0, 1) — `[0.5, 0.25]` ships `scene.lod1.glb` at half and
     * `scene.lod2.glb` at a quarter of the triangles. Opt-in (Blender cannot
     * author USD variantSets, so LODs are separate deliverables); omitted =
     * no LODs. Requires `glb` in `formats`.
     */
    lod?: number[];
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
/**
 * A per-part / per-role BUDGET: a set of optional bounds on measured facts,
 * the data half of the intent-judgment layer (see src/lint/budgets.ts). Absent
 * bound = ungated = the judge stays silent for that part.
 */
export interface Budget {
  /** Fraction of the SCENE's triangles a prototype family may own (0..1). */
  triShare?: { softMax?: number };
  /** Decoded texture VRAM (bytes) a part's bound maps may total. */
  textureBytes?: { softMax?: number };
  /** Part max-dimension as a ratio of the scene median — coherence bounds. */
  sizeRatio?: { min?: number; max?: number };
  /** Texel-density (px/m) window for the role. */
  texelDensity?: { min?: number; max?: number };
  /** Worst allowed triangle aspect ratio (sliver ceiling) for the role. */
  maxAspectRatio?: number;
  /** Ordinal detail tier, so ranks can be compared between parts. */
  rank?: 1 | 2 | 3;
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
  /**
   * Unrounded scale, each axis finite or null. The rounded `scale` above
   * collapses a near-zero axis (1e-9) to exactly 0, hiding the real magnitude
   * and firing degeneracy only by rounding accident; the linter judges
   * degeneracy on this.
   */
  scaleRaw?: Array<number | null>;
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
  /** The mesh carries a colour (vertex-colour) attribute — a shading source, so
   *  a material-less low-poly/voxel part is not "unshaded". Absent on an older
   *  census; readers treat absence as "no colour attribute". */
  hasColorAttribute?: boolean;
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
  /** Worst world-space triangle aspect ratio (longest_edge²/2·area): ~1.15
   *  equilateral, unbounded as a triangle degenerates into a sliver. */
  worstAspectRatio?: number | null;
  /** Fraction of surface area that is a support-needing print overhang (a
   *  downward face steeper than 45° from vertical, excluding the plate band). */
  overhangAreaFraction?: number | null;
  /** Thinnest wall (m), by inward ray-cast; absent when not measured (a
   *  non-print compile) or when the mesh has no opposing walls. */
  minWallThickness?: number;
  /**
   * Voxel/Minecraft facts — measured only when the contract asks for it
   * (`target: "minecraft"` or a `minecraft` conventions block); absent on
   * every other compile, so a non-voxel census is byte-identical. All of
   * these are cheap O(verts) arithmetic, judged in the contract, never here.
   */
  voxel?: {
    /** A single rectangular cuboid (8 corners, 6 axis-parallel quad faces in
     *  its own frame): a Java block-model `element` is representable iff true. */
    isBox: boolean;
    /** The box sits axis-aligned in world space (no rotation to recover). */
    axisAligned: boolean;
    /** Recovered single-axis rotation for an oriented box, or null. Java block
     *  models permit exactly one rotation axis at a restricted angle; this is
     *  what the dialect rule judges. */
    rotationAxis: "x" | "y" | "z" | null;
    rotationDeg: number | null;
    /** Largest distance (m) any vertex sits from the nearest point of the
     *  contract's voxel grid — the off-grid shimmer measured, not judged.
     *
     *  `null` when no grid was declared: this is the one fact here that is not
     *  intrinsic, since "off-grid" is meaningless without a grid to be off.
     *  Null rather than 0, because 0 reads as "perfectly aligned" — a verdict
     *  nobody measured. */
    gridDeviation: number | null;
    /** World-space centre of the box (its rotation pivot). Present for a box. */
    center?: [number, number, number];
    /** The box's OWN (un-rotated) extent, m — the world AABB for an axis-aligned
     *  box, or the true box size recovered by un-rotating an oriented one. Lets
     *  the Bedrock exporter emit a rotated cube: origin = centre − size/2,
     *  rotation applied about the centre. Present for a box. */
    localSize?: [number, number, number];
  };
  /** Vertex pairs within merge distance (1e-6 m) — split seams in disguise. */
  doubleVertices?: number;
  /**
   * Whether the doubles pass actually ran (false past the vertex cap). Absent
   * on an older census. `doublesSampled === false` means the count is omitted
   * because it was not measured, not because the mesh is clean.
   */
  doublesSampled?: boolean;
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
  /**
   * Sander-2001 UV stretch as per-triangle Jacobian anisotropy (σmax/σmin),
   * area-weighted. Scale-invariant: 1.0 is perfectly conformal, higher means
   * the texture is stretched more along one axis than the other. Null when no
   * non-degenerate textured triangle exists to measure.
   */
  stretch: { max: number; mean: number } | null;
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
  /** Structural fingerprint of the material's whole node graph — types,
   *  operations, unlinked values and link topology, excluding names and screen
   *  positions. Two materials that shade differently have different graphs;
   *  enumerating individual properties loses that race by construction, since
   *  every glTF extension adds a distinction the list does not carry. */
  graph?: string;
  /** The alpha CUTOFF a masked surface clips at, or null when it does not
   *  clip. glTF's alphaMode MASK survives import as a node chain rather than a
   *  material property, and it round-trips into the shipped GLB — so two
   *  materials identical in every Principled input can still clip at 0.25 and
   *  0.75 and render nothing alike. */
  alphaCutoff?: number | null;
  /** How the surface resolves alpha ("BLENDED"/"DITHERED" on EEVEE Next,
   *  "OPAQUE"/"CLIP"/"BLEND" on legacy). Part of the LOOK: two materials
   *  identical in every Principled input still render differently if one
   *  masks and the other blends. Empty when this Blender exposes neither. */
  blendMethod?: string;
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
  /* NOTE: there is deliberately no `upAxis` here. The census is measured in
     Blender's own space, which is Z-up, always — the field used to exist and
     was hardcoded to "Y" by the runner while every world-space fact beside it
     (worldMin/worldMax, groundGap, contacts, z-fighting axes) was raw Z-up.
     Nothing read it, so nothing was wrong today; a future reader trusting it
     would have been wrong twice. The real up-axis comparison is against the
     EXPORTED stage's header (lint/stage.ts, lint/units.ts), which is where a
     mismatch can actually exist. */
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
  /** Viewer edits the runner could not replay — a stale part name, or a value
   *  this Blender would not take. Dropping them is right (a bad edit must not
   *  wedge a compile); dropping them silently is not, which is what the bare
   *  catches around each channel used to do. */
  tweakNotes?: string[];
  /** What the GPU oracle could not see on the machine that baked, if
   *  anything — a platform limit reported rather than silently narrowing
   *  the S3D-E-804 guarantee. */
  shaderNotes?: string[];
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
    /** Whether the stage header carries an `assetInfo` dictionary — captured
     *  so the stage linter judges its presence from the parse, not raw text. */
    hasAssetInfo?: boolean;
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
  /**
   * Byte size of each exported asset, keyed by the same project-relative path
   * that appears in `exportedAssets`.
   *
   * The manifest reported triangle counts, texture resolutions, material and
   * bone counts — and not one file size, which is the number anyone shipping
   * to a browser or a mobile target answers for first. Measured from the
   * bytes on disk after export, so it is the delivered size and not an
   * estimate. An asset that could not be stat'd is absent rather than zero:
   * "not measured" and "empty" are not the same claim.
   */
  exportedAssetBytes?: Record<string, number>;
  /**
   * Content restored onto the re-imported stage before the delivery containers
   * were lowered, because the USD writer cannot author it: animation clips
   * filed as NLA strips, the occlusion binding (it lives in the importer's
   * extras group), backface culling, emissive strength.
   *
   * A RECORD, not a finding — it reports a repair that succeeded and asks
   * nothing of the reader, and a repair that FAILS shows up as an E-901 loss
   * instead. It lives here so an audit of the .usda can tell which of the
   * shipped capabilities the master does not actually account for.
   */
  carried?: { clips?: string[]; occlusion?: string[]; materials?: string[]; emission?: string[] };
  issues: IssueSummary;
  issueCodes: string[];
  /** The subset of issueCodes that fired at error or warning severity —
   *  what somebody is meant to act on, as distinct from what was noted.
   *  The kit roll-up ranks systemic PROBLEMS from this, so a relaxed note
   *  about third-party geometry can never read as one. */
  actionableCodes?: string[];
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
