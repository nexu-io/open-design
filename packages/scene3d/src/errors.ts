/**
 * scene3d issue taxonomy.
 *
 * Every issue carries a stable code. The codes are the contract between the
 * pipeline and the agent: the agent learns the codes, the linter emits them,
 * and the test corpus pins them. Codes never drift without a versioned
 * change in this file and the fixtures that assert them.
 *
 * Ranges:
 *   E1xx  parse   — source discovery and USDA structure
 *   E2xx  build   — Blender execution, census, export, proof
 *   E3xx  lint    — 300 naming, 320 topology, 340 pbr, 360 units, 380 integrity
 *   W3xx  warnings (same subranges as lint)
 *   I5xx  info
 */

// NOTE: an E-3xx and a W-3xx sharing a number are DIFFERENT codes for
// different rules (E-321 non-manifold vs W-321 ngons) — the severity prefix
// is part of the identity. A numeric-only collision scan false-positives
// here; do not "fix" these.
export const ISSUE_CODES = {
  /* parse */
  NO_SOURCES: "S3D-E-101",
  AMBIGUOUS_SOURCES: "S3D-E-102",
  USDA_PARSE_ERROR: "S3D-E-103",
  INVALID_CONTRACT: "S3D-E-104",
  /* The declarative scene.json failed schema validation — reported with
     JSON paths BEFORE any geometry exists, never as a Blender traceback. */
  SPEC_INVALID: "S3D-E-105",
  /* The relation graph could not place every part (unresolved axis, cycle,
     conflicting constraints, unknown reference, expansion over a limit). */
  SPEC_UNRESOLVED: "S3D-E-106",
  /* The spec is VALID but says something almost certainly unintended — a
     kilometre-scale size (millimetres read as metres?), a rotation about a
     shape's own symmetry axis that provably does nothing, a span whose body
     never reaches the anchors it names. Warnings, never errors: each of
     these CAN be meant, and the compiler names the suspicion instead of
     refusing the sentence. */
  SPEC_SUSPECT: "S3D-W-105",
  /* The solver adjusted an authored offset (contact floor, repeat pitch)
     to keep coplanar faces structurally impossible. The scene builds; this
     names what was changed and why. */
  SPEC_ADJUSTED: "S3D-W-106",
  /* Instances the SOLVER generated (repeat clones, scatter samples) landed
     inside each other. The scene builds, so this is not unsolvable — but one
     authored decision produced geometry that interpenetrates itself, which
     nobody writes on purpose: they would have authored one larger shape. */
  SPEC_INSTANCES_INTERSECT: "S3D-W-107",
  /* The kinematic linter: a moving part's SWEPT envelope (spin = the box's
     corner circle unless the shape is symmetric about the spin axis; bob =
     an exact translation) presses deeper into a neighbour mid-cycle than
     the rest pose does. W-107 and the claims judge the rest pose; a blade
     that cleared its post at frame 1 and split it at 90 degrees used to
     compile clean. Conservative bound, so a warning — may-collide, with
     the measured envelope in the detail. */
  MOTION_ENVELOPE_CROSSES: "S3D-W-108",
  /* Minkowski clearance: two parts closer than the project's declared
     assembly tolerance without being in designed contact — a pinch point
     that fuses on a printer or grazes under animation. Only fires when
     conventions.geometry.minClearance is declared; boxes, so conservative
     for round shapes, never an under-report. */
  CLEARANCE_THIN: "S3D-W-109",

  /* build */
  BLENDER_NOT_FOUND: "S3D-E-201",
  BLENDER_FAILED: "S3D-E-202",
  /* A Blender was found but its major version is below what the runner is
     written against. Gated up front with the measured version, because the
     alternative is a crash deep inside the runner that reads as "your scene
     is broken" when the scene was never the problem. */
  BLENDER_UNSUPPORTED: "S3D-E-207",
  STAGE_TIMEOUT: "S3D-E-203",
  INVALID_CENSUS: "S3D-E-204",
  EXPORT_FAILED: "S3D-E-205",
  /* One requested container could not be written, but the rest were. The
     export as a whole succeeded — this names what is missing from it. */
  EXPORT_FORMAT_UNAVAILABLE: "S3D-W-205",
  PROOF_FAILED: "S3D-E-206",
  /* A real asset file imported, but degraded: a missing .mtl companion, a
     file with no geometry. Detect-and-name, never mutate-and-guess. */
  IMPORT_DEGRADED: "S3D-W-207",

  /* The viewer edit sidecar (tweaks.json) was unreadable in whole or in
     part, so those edits were not applied. Dropping a bad viewer write is
     right; dropping it silently made the scene snap back to its rest pose
     with nothing in the report to explain why. */
  TWEAKS_IGNORED: "S3D-W-208",

  /* A derived deliverable (manifest, read model, digest, viewer) could not
     be written — disk full, permissions. The compile itself finished; the
     issues and census in the response are real. Throwing here used to
     discard a completed compile as a bare 500. */
  DELIVERABLE_WRITE_FAILED: "S3D-W-209",

  /* The solver rested one part on another — their boxes are flush by
     construction (the contact floor) — but the BUILT scene's measured
     contact never happened. The box touched; the shape did not. Found by a
     field build whose cage bars stood beside the ring they were meant to
     carry, through a compile with zero errors: the plan and the build
     disagreed and nothing said so. */
  REST_NOT_TOUCHING: "S3D-W-337",

  /* A file/script part's built geometry fills a small fraction of its
     declared box: the fit is uniform-scale to the tightest axis, so a
     declared aspect ratio the asset does not have shrinks the whole part
     and leaves the rest of the box empty. Found by a field build whose
     fox shrank to a sixth of its requested volume through a compile with
     zero errors — the report printed the plan and the proof showed a
     mouse, with nothing between them saying which was real. */
  FILE_PART_UNDERFILLS: "S3D-W-338",

  /* lint: naming */
  NAME_DEFAULT: "S3D-E-301",
  NAME_PATTERN: "S3D-E-302",
  NAME_PREFIX: "S3D-E-303",
  COLLECTION_NAME_DEFAULT: "S3D-E-304",
  COLLECTION_NAME_PATTERN: "S3D-E-305",
  DEPTH_LIMIT: "S3D-E-306",
  NAME_DEFAULT_WARN: "S3D-W-301",

  /* lint: topology */
  NON_MANIFOLD: "S3D-E-321",
  NAN_TRANSFORM: "S3D-E-322",
  DEGENERATE_SCALE: "S3D-E-323",
  Z_FIGHTING: "S3D-E-324",
  NGONS: "S3D-W-321",
  ZERO_AREA_FACES: "S3D-W-322",
  /* Engine hygiene (327-330): facts Blender's viewport hides and every
     importer punishes. */
  NEGATIVE_SCALE: "S3D-E-327",
  LOOSE_GEOMETRY: "S3D-W-327",
  DOUBLE_VERTICES: "S3D-W-328",
  INCONSISTENT_WINDING: "S3D-W-329",
  UNAPPLIED_SCALE: "S3D-W-330",
  /* The doubles pass was skipped past the vertex cap: "not measured" must
     never read as "clean" — same discipline as Z_FIGHTING_UNCHECKED. */
  DOUBLE_VERTICES_UNCHECKED: "S3D-W-331",
  /* A mesh object hidden in the scene still exports, counts against budget,
     and can z-fight — yet the master exporter may drop it, so a hidden mesh
     is both a silent shipper and a likely parity-loss source. */
  HIDDEN_MESH: "S3D-W-332",
  /* Print DfM (target:"3d_print"): manufacturability the geometry rules cannot
     see. A support-needing overhang past the contract's fraction, and a wall
     thinner than the nozzle can lay down. Both advisory — the author may print
     with support or a finer nozzle. */
  OVERHANG_UNSUPPORTED: "S3D-W-333",
  WALL_TOO_THIN: "S3D-W-334",
  /* The coplanar search hit a cap, so silence about z-fighting is not
     evidence of its absence for this scene. */
  Z_FIGHTING_UNCHECKED: "S3D-W-323",
  /* The contact scan was skipped past its mesh cap, so `contacts: []` in the
     census means "we did not look", never "nothing touches". An empty contact
     list that reads as a clean bill of health is how an interior went blind:
     every joint the author cared about was above the cap, and the report said
     nothing. Same discipline as Z_FIGHTING_UNCHECKED — a skipped oracle is a
     verdict, not silence. */
  CONTACTS_UNCHECKED: "S3D-W-336",

  /* lint: uv (440-459) — UV facts measured by the census, judged by
     conventions.uv. The one place "compiles clean" was blind to the thing
     game assets live or die on. */
  UV_MISSING: "S3D-E-441",
  UV_OVERLAP: "S3D-W-441",
  UV_FLIPPED: "S3D-W-442",
  UV_OUT_OF_BOUNDS: "S3D-W-443",
  TEXEL_DENSITY_SPREAD: "S3D-W-444",
  TEXEL_DENSITY_TARGET: "S3D-W-445",
  /* The raster budget was exceeded, so silence about this mesh's UVs is
     not evidence they are fine — same discipline as Z_FIGHTING_UNCHECKED. */
  UV_UNCHECKED: "S3D-W-446",
  UV_STRETCH: "S3D-W-447",

  /* lint: pbr */
  METALLIC_VALUE: "S3D-E-341",
  ROUGHNESS_RANGE: "S3D-E-342",
  UNTOUCHED_DEFAULT_MATERIAL: "S3D-W-341",
  IOR_RANGE: "S3D-W-342",
  TEXTURE_WITHOUT_UV: "S3D-W-343",
  MATERIAL_UNUSED: "S3D-W-344",
  OBJECT_WITHOUT_MATERIAL: "S3D-W-345",
  /* Textures as FILES: a node graph can reference an image that renders
     magenta in Blender and fails outright on engine import. */
  TEXTURE_FILE_MISSING: "S3D-E-346",
  TEXTURE_NOT_POWER_OF_TWO: "S3D-W-346",
  TEXTURE_TOO_LARGE: "S3D-W-347",
  DUPLICATE_MATERIALS: "S3D-W-348",
  FACES_WITHOUT_MATERIAL: "S3D-W-349",
  /* The PBR-combo heatmap's one-line equivalent: a dark base colour driven
     fully metallic and mirror-smooth reads as a black mirror, not a surface —
     the combination is unphysical even though each value alone is legal.
     Thresholds live in conventions.pbr; the check judges scalars only, so a
     texture-driven channel (metallic == null) never trips it. */
  UNREALISTIC_DARK_METAL: "S3D-W-350",

  /* lint: units */
  UNITS_MISMATCH: "S3D-E-361",
  UP_AXIS_MISMATCH: "S3D-E-362",
  NON_UNIFORM_SCALE: "S3D-W-361",

  /* lint: integrity */
  MISSING_CAMERA: "S3D-E-381",
  MISSING_LIGHTS: "S3D-W-381",
  EMPTY_MESH: "S3D-E-382",
  OFF_CAMERA: "S3D-W-382",
  EMPTY_PROOF: "S3D-E-383",
  SPARSE_PROOF: "S3D-W-383",
  STATIC_TURNTABLE: "S3D-W-384",
  OVEREXPOSED_PROOF: "S3D-W-385",
  /* One turntable angle where the subject leaves frame is a warning, not the
     compile-failing error that EVERY frame black is — 7 of 8 good angles is a
     materially milder defect. */
  PARTIAL_EMPTY_PROOF: "S3D-W-386",
  /* Proof frames exist but their pixels could not be measured (unreadable
     PNG, a stats pass that returned nulls) — unmeasured is not evidence the
     render is fine. Same discipline as Z_FIGHTING_UNCHECKED. */
  PROOF_UNCHECKED: "S3D-W-387",

  /* lint: world placement + budgets (325-339) */
  NOT_GROUNDED: "S3D-W-325",
  SUNK_BELOW_GROUND: "S3D-E-325",
  MESH_BUDGET: "S3D-E-326",
  SCENE_BUDGET: "S3D-W-326",
  /* Triangle budgets were judged from FACE counts because this census carries
     no triangle counts — an n-gon mesh reads smaller than it is, so a budget
     can pass a scene that breaks it. The check still runs; it says it
     approximated rather than leaving that silent. */
  TRIANGLE_COUNT_APPROXIMATE: "S3D-W-335",

  /* lint: exported stage (400-419) — checks the artifact we SHIP, not the
     scene we built. Everything above validates the Blender scene; these
     validate the USD that actually leaves the building. */
  STAGE_NO_KIND: "S3D-E-401",
  STAGE_UPAXIS_MISMATCH: "S3D-E-402",
  STAGE_UNITS_MISMATCH: "S3D-E-403",
  STAGE_PRIM_DEFAULT_NAME: "S3D-E-404",
  STAGE_NO_DEFAULT_PRIM: "S3D-E-405",
  STAGE_NO_ASSET_INFO: "S3D-W-401",
  STAGE_MISSING_EXTENT: "S3D-W-402",
  STAGE_PRIM_NAME_MISMATCH: "S3D-W-403",
  /* The compiler's own proof rig — camera, key light, environment — leaking
     into the asset. USD has a word for "present but not part of what
     renders", and using it is strictly better than the GLB's answer of
     deleting the rig outright: the framing stays readable. */
  STAGE_RIG_NOT_GUIDE: "S3D-W-404",
  /* The model hierarchy disagrees with what was shipped: a component that
     contains models, or an arrangement claiming to be one atomic asset. */
  STAGE_MODEL_HIERARCHY: "S3D-W-405",

  /* lint: 2D sheets (600-619) — sprite sheets, flipbooks, particles,
     tileable strips, and skybox faces. Pixel facts, same discipline as the
     proof-frame rules: measured, not assumed. */
  SHEET_MISSING: "S3D-E-601",
  SHEET_UNREADABLE: "S3D-E-602",
  SHEET_NOT_POWER_OF_TWO: "S3D-E-603",
  SHEET_TOO_LARGE: "S3D-E-604",
  SHEET_EMPTY: "S3D-E-605",
  SHEET_NO_FULL_ALPHA: "S3D-E-606",
  SHEET_TINTABLE_HAS_HUE: "S3D-E-607",
  SHEET_GRID_MISMATCH: "S3D-E-608",
  SHEET_BLANK_FRAMES: "S3D-E-609",
  SHEET_CELL_BLEED: "S3D-E-610",
  SHEET_BORDER_TOUCH: "S3D-E-611",
  SHEET_NOT_TILEABLE: "S3D-E-612",
  SHEET_LONG_EDGE_TOUCH: "S3D-E-613",
  SHEET_SKY_NOT_OPAQUE: "S3D-E-614",
  SHEET_SEAM_BREAK: "S3D-E-615",
  SHEET_CUBE_INCOMPLETE: "S3D-E-616",
  SHEET_STATIC_FLIPBOOK: "S3D-W-601",
  SHEET_SKY_CLIPPED: "S3D-W-602",
  SHEET_SPARSE: "S3D-W-603",
  SHEET_CELL_NOT_POWER_OF_TWO: "S3D-W-604",
  SHEET_ADDITIVE_BRIGHT_BORDER: "S3D-W-605",

  /* shaders (800-819) — raw GPU kernels as compiled sources. Structural
     verdicts come from the pure validator; 802-804 come from the actual
     GPU driver, because the driver is the only authority on GPU code. */
  SHADER_INVALID: "S3D-E-801",
  /* The driver rejected the assembled program; the message carries the
     driver's own compile log. */
  SHADER_COMPILE_FAILED: "S3D-E-802",
  SHADER_BAKE_FAILED: "S3D-E-803",
  /* The kernel executed but produced NaN/Inf pixels — the GPU equivalent
     of a plausible-looking script with broken output. Counted, located,
     and failed loudly. */
  SHADER_NONFINITE: "S3D-E-804",
  /* A declared shader no material references — authored but unreachable. */
  SHADER_UNUSED: "S3D-W-801",
  /* The GPU could not deliver non-finite pixels through the readback on
     THIS machine (drivers differ in whether they flush NaN), so E-804's
     guarantee does not hold here. Unchecked is not clean. */
  SHADER_ORACLE_UNCHECKED: "S3D-W-804",

  /* master parity (900-919) — USD is the core format: the stage is
     authored first and every delivery container is lowered from a
     re-import of it. These codes police that inversion. */
  /* Something the build contained did not survive into the master stage —
     the writer failed to author it. The master must be TOTAL. */
  MASTER_INCOMPLETE: "S3D-E-901",
  /* The lowering parity check could not run (master unreadable, importer
     missing). Unchecked is never passed. */
  MASTER_UNCHECKED: "S3D-W-901",
  /* The set of bones/morph-targets survived the round-trip but their ORDER
     changed. Counts and names match (so E-901 stays silent), yet animation
     that indexes joints/shapekeys by position may bind to the wrong one.
     A warning, not an error: whether it actually misaligns depends on
     whether skin weights / morph drivers were remapped in step, which is
     downstream of what the fingerprint can see. Surfaced so a rigged or
     morph asset is never silently reordered. */
  MASTER_ORDER_DRIFT: "S3D-W-902",
  /* A material CAPABILITY the source declared is absent from the shipped
     deliverable. The parity fingerprint counts materials, so a material that
     survives as a shell — glass that stopped refracting, iridescence that
     stopped shifting — passes it. UsdPreviewSurface cannot express most of
     the modern PBR extension surface, and the master round-trip is where the
     loss happens. Detect and name it; never mutate and never hide it. */
  MASTER_MATERIAL_CAPABILITY: "S3D-W-903",
  /* A USDZ was produced from a stage that is not Y-up. USDZ is consumed by
     ARKit / AR Quick Look and Android Scene Viewer, which take Y as up; a
     Z-up package arrives rotated onto its back in every one of them. The
     package is not wrong as USD — the stage says what it is — so this is a
     warning about the DESTINATION, not a defect in the file. */
  USDZ_UP_AXIS: "S3D-W-904",

  /* lint: intent budgets (950-969) — judgment gated on a part's authored
     `role`. Every threshold is data (budgets.ts / the contract), every check
     is a descriptor evaluated by one engine; these are always advisory
     warnings, never compile-blocking. RELATIVE judgments a per-part threshold
     cannot make: a family's share of the scene, a rank inversion, a scale
     outlier. */
  OVER_ROLE_TRI_SHARE: "S3D-W-951",
  ROLE_RANK_INVERSION: "S3D-W-952",
  PART_TEXTURE_BUDGET: "S3D-W-953",
  SIZE_INCOHERENT: "S3D-W-954",
  SLIVER_TRIANGLES: "S3D-W-955",
  UNDER_ROLE_TEXEL: "S3D-W-956",
  /* Distribution-relative outliers (robust z over the scene's own spread): a
     part many robust deviations out in SIZE is a likely unit slip (I-952); in
     TRIANGLE DENSITY it is an LOD-magnitude oddity (I-951). Both are INFO: a
     statistic cannot tell a real unit slip from a legitimately large ground or
     a deliberately dense hero, so it hints ("verify this") rather than asserts.
     No fixed ratio — the scene defines its own normal. */
  SIZE_OUTLIER: "S3D-I-952",
  TRI_DENSITY_OUTLIER: "S3D-I-951",

  /* lint: voxel / Minecraft (970-979) — format-correctness for the vanilla
     model formats, on only under `target:"minecraft"` (or a `minecraft`
     conventions block). Measured in Blender (census `voxel` facts), judged in
     the contract, mapped here. All advisory: the linter WARNS while a modeller
     iterates; the block-model exporter is what hard-refuses an unrepresentable
     model. These are format and consistency facts, never a style. */
  VOXEL_OFF_GRID: "S3D-W-970",
  VOXEL_NOT_CUBOID: "S3D-W-971",
  VOXEL_ILLEGAL_ROTATION: "S3D-W-972",
  VOXEL_OUT_OF_BOUNDS: "S3D-W-973",
  /* A mesh larger than the whole element space is not an element at all — it
     is multi-block structure/terrain. The element-format rules do not apply;
     this is the info that says so, so the author is not told to "fit" a floor
     into a block. */
  VOXEL_STRUCTURE_SCALE: "S3D-I-970",

  /* lint: external conformance oracles (500-519) — verdicts adopted from the
     industry-standard validators run against the EXPORTED deliverable, not
     from our own parser. The compiler measures nothing here; it maps the
     oracle's judgement onto stable codes so a second, independent authority
     signs off on the bytes that ship. */
  GLTF_INVALID: "S3D-E-501",
  GLTF_WARNING: "S3D-W-501",
  /* USD stage judged by OpenUSD's own runtime (pxr): E for a stage that does
     not compose, W for a material binding that resolves to a missing prim —
     which USD silently ignores, shipping the surface unshaded. */
  USD_COMPOSITION_ERROR: "S3D-E-502",
  USD_BINDING_UNRESOLVED: "S3D-W-502",
  /* An oracle could not run (validator absent/failed to load). Additive and
     never fatal: an unrun check is a warning about the check, not the asset. */
  GLTF_UNCHECKED: "S3D-W-509",
  USD_UNCHECKED: "S3D-W-508",

  /* lint: claims (700-719) — the spec's own contract with reality. A claim
     is adjudicated against the CENSUS, never against the spec that made it:
     the author is not the authority on whether the build succeeded. */
  CLAIM_FAILED: "S3D-E-701",
  /* A claim the census could not adjudicate. Reported, never silently
     passed — a check that silently did not run is worse than no check. */
  CLAIM_UNCHECKED: "S3D-W-701",

  /* info */
  STAGE_SKIPPED: "S3D-I-501",
  /* A Minecraft model was imported and converted to a scene.json spec. */
  MODEL_IMPORTED: "S3D-I-502",
} as const;

export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

export function summarize(issues: { severity: "error" | "warning" | "info" }[]) {
  return {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
  };
}