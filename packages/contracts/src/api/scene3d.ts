// scene3d — the deterministic scene-compile wire contract.
//
// A 3D scene project is treated like a code project: sources are text (a
// declarative scene.json, bpy build scripts, USDA layers) or real asset
// files, and `POST /api/projects/:id/scene3d/compile` runs the whole
// pipeline — parse, build, proof, export, lint, manifest (export before
// lint, so the rules validate the artifact that ships) — in ONE call and
// returns one structured report. The agent never has to chain
// "compile" then "check z-fighting" then "check naming"; the compiler owns
// the checks, exactly as `cargo build` owns its lints.
//
// Issue codes are the contract. They are stable, they are pinned by the
// fixture corpus in `packages/scene3d/tests/fixtures/`, and the agent learns
// them once instead of re-reading prose every turn. The canonical taxonomy
// lives in `packages/scene3d/src/errors.ts`; this file mirrors only the wire
// shapes so the CLI (`od scene3d`) and the web viewer parse one contract.

export type Scene3dStageId = 'parse' | 'build' | 'lint' | 'proof' | 'export' | 'manifest';

/** `cached` means the stage's content hash matched and nothing re-ran. */
export type Scene3dStageStatus = 'ran' | 'cached' | 'skipped';

export type Scene3dSeverity = 'error' | 'warning' | 'info';

/** How the scene is authored. One entry point per project. `mc_model` is a
 *  dropped-in Minecraft model (Java `model.json` / Blockbench `.bbmodel`)
 *  converted to a spec on import. */
export type Scene3dSourceKind = 'usda' | 'bpy' | 'blend' | 'spec' | 'mesh' | 'mc_model';

/**
 * What a compile produced, as a category rather than a file list.
 *
 * The pipeline is general — anything headless Blender can build, it can
 * build — so "scene" is only one of the things that comes out of it. A
 * texture bake, a flipbook, a beam sheet, and a walk cycle all run the same
 * six stages, and a host that only knows "scene" describes every one of them
 * wrong: wrong label, wrong export menu, wrong empty state.
 *
 * DERIVED, never authored. `packages/scene3d` reads the census and the
 * declared sheets and decides; nothing has to be kept in sync by hand, and
 * an author who adds a keyframe gets an `animation` without editing config.
 * Mirrors `Scene3dAssetKind` in `packages/scene3d/src/types.ts`.
 */
export type Scene3dAssetKind =
  | 'scene'
  | 'prop'
  | 'kit'
  | 'animation'
  | 'sprite'
  | 'flipbook'
  | 'vfx'
  | 'skybox'
  | 'texture';

export interface Scene3dStageReport {
  id: Scene3dStageId;
  status: Scene3dStageStatus;
  durationMs: number;
}

export interface Scene3dSource {
  kind: Scene3dSourceKind;
  /** Project-relative paths that together describe the scene. */
  files: string[];
}

export interface Scene3dIssue {
  /** Stable code, e.g. `S3D-E-324` (z-fighting), `S3D-W-341` (default material). */
  code: string;
  severity: Scene3dSeverity;
  /** Terse summary — the code, not the prose, is the contract. */
  message: string;
  /** Actionable remediation, phrased for the generating agent. */
  hint?: string;
  /** Project-relative source file, when the issue can be located. */
  file?: string;
  /** Object / prim / material name the issue belongs to, when known. */
  target?: string;
  /** Machine-readable detail, e.g. `{ actual: 0.5 }`. */
  detail?: Record<string, unknown>;
}

export interface Scene3dIssueSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export interface Scene3dProofOptions {
  engine?: 'BLENDER_EEVEE' | 'CYCLES';
  resolution?: number;
  /** Orbit the auto-camera instead of rendering a single still. */
  turntable?: boolean;
  turntableSteps?: number;
  /** Render through the scene's authored camera rather than the auto-camera. */
  respectSceneCamera?: boolean;
}

/* ------------------------------------------------------------------ */
/* Manifest — the compiled scene's record, mirrored onto the wire.     */
/* ------------------------------------------------------------------ */

export interface Scene3dManifestPart {
  name: string;
  type: string;
  parent: string | null;
  depth: number;
  mesh: { verts: number; faces: number } | null;
}

export interface Scene3dManifestMaterial {
  name: string;
  usedByObjects: number;
  metallic: number | null;
  roughness: number | null;
  hasTexture: boolean;
  /** Measured base colour, LINEAR RGB — the hue the material carries. Absent
   *  when unmeasured (parse-only); on a textured surface it is a tint. */
  baseColor?: [number, number, number];
  /** Emission colour (linear RGB), when the surface emits. */
  emissionColor?: [number, number, number];
  /** Emission strength the build actually authored, when measured. */
  emissionStrength?: number;
  /** Measured alpha, present only when the surface is actually translucent
   *  (alpha < 1) — a glass material's whole identity. */
  alpha?: number;
}

/**
 * How many PARTS a part tree holds — mesh entries only.
 *
 * "Parts" is the noun the whole surface speaks (the CLI prints
 * "23 mesh · 1 camera · 1 light"; claims are written against the mesh
 * count), but the GUI counted every tree entry and read 25 on the same
 * scene — two numbers, one noun, and the claims block disagreed with the
 * header beside it. Every counter goes through this predicate.
 */
export function meshPartCount(partTree: ReadonlyArray<{ type: string }>): number {
  let count = 0;
  for (const part of partTree) if (part.type === 'MESH') count += 1;
  return count;
}

export interface Scene3dManifestTexture {
  name: string;
  /** PROJECT-RELATIVE path, like every other path in the manifest — build a
   *  URL with buildScene3dAssetUrl. For an `external` texture this is the
   *  BASENAME only: the file lives outside the project and has no
   *  project-relative form, and the manifest never publishes a host path.
   *  (It carried one once, the only field in the API that leaked the
   *  machine's filesystem.) */
  filepath: string;
  /** True when the texture lives outside the project — `filepath` is then a
   *  basename, not a fetchable path. */
  external?: true;
  resolution: [number, number];
}

export interface Scene3dManifest {
  schemaVersion: 1;
  generatedAt: string;
  source: Scene3dSource;
  blender: { version: string | null; used: boolean };
  partTree: Scene3dManifestPart[];
  materials: Scene3dManifestMaterial[];
  textures: Scene3dManifestTexture[];
  animation: {
    fps: number;
    frameStart: number;
    frameEnd: number;
    keyframedObjects: string[];
    /** The NAMED clips the build carries (the census's actionNames) — what a
     *  player or an agent can actually play. The frame range alone said "250
     *  frames" while refusing to name the three clips inside them. */
    actionNames?: string[];
  };
  /** Skeletons the build carries, when any — measured by the census. */
  armatures?: Array<{ name: string; bones: number }>;
  camera: { present: boolean; name: string | null };
  proofImages: string[];
  /**
   * Where each part landed in each proof frame: one record per frame,
   * part name → normalized `[x0, y0, x1, y1]` (y down). Projected through
   * the render camera at render time; this is what lets the panel draw a
   * selection reticle on the prerendered picture and resolve a click on
   * the picture back to a part name.
   */
  proofRects?: Array<Record<string, [number, number, number, number]>>;
  /**
   * Part names in id-map code order (code = index + 1). Present when the
   * proof rendered an object-index map beside every frame — the same path
   * with `.idx.png` in place of `.png` — whose pixels encode the part code
   * in 8-step-per-channel RGB (background alpha 0). The panel's x-ray
   * energize decodes them to find exactly which pixels a part occupies.
   */
  proofIdParts?: string[];
  /**
   * Where each proof frame was photographed from.
   *
   * Present only when the pose is derivable — a turntable's orbit is a
   * documented function of the frame index, but a still through a camera the
   * AUTHOR placed has a pose the compiler never measured. Absent therefore
   * means "not knowable", never "front": naming an unmeasured pose would be
   * a confident lie in exactly the case a reader most needs the truth.
   */
  proofViews?: Array<{
    index: number;
    azimuthDeg: number;
    elevationDeg: number;
    /** `front`, `back-right`, … prefixed `~` when between octants. */
    name: string;
  }>;
  /**
   * The contact sheet: every proof frame on one labelled page, with the
   * compass name and azimuth per frame, a projected world-axis gnomon, and
   * one numbered badge per part.
   *
   * `legend` is the badge↔part mapping AS DRAWN, so the numbers on the image
   * are resolvable from the manifest alone — by a reader with no image input,
   * and by any UI that wants to name a badge without re-decoding pixels.
   */
  contactSheet?: {
    path: string;
    legend: Array<{ badge: number; part: string }>;
    /** Parts no angle of the orbit shows a pixel of: enclosed, or hidden
     *  inside another part. A fact about the scene, not about the sheet. */
    neverVisible: string[];
  };
  exportedAssets: string[];
  issues: Scene3dIssueSummary;
  issueCodes: string[];
  /**
   * What this compile produced. Optional only because manifests written
   * before the field existed are still on disk; readers derive a fallback
   * rather than assuming `scene`.
   */
  assetKind?: Scene3dAssetKind;
  /**
   * The spec's claims ledger: properties the author asserted vs. how many
   * the measured census refuted. `declared > 0 && failed === 0` is the
   * proven badge; absent when the scene declares no claims.
   */
  claims?: {
    declared: number;
    failed: number;
    /** How many claims were actually ADJUDICATED (declared minus the ones
     *  the adjudicator marked unadjudicated — no census, no measurements).
     *  The proven badge requires `checked === declared`: a claim nobody
     *  measured is not held. Absent on manifests written before the field. */
    checked?: number;
    /** Budget usage per numeric claim, tightest first: `used` = measured/limit. */
    margins?: Array<{ claim: string; measured: number; limit: number; used: number }>;
    /** Parts a held grounded claim licensed as declared floats (`above`
     *  relations): "held" with entries here means "the hovering parts were
     *  declared as hovering on purpose", not "everything reaches the ground". */
    licensedFloats?: string[];
  };
  /** Scale readout, when the build stage produced a census. */
  metrics?: {
    worldSize: [number, number, number] | null;
    smallestPart: { name: string; minDimension: number } | null;
    largestPart: { name: string; maxDimension: number } | null;
    totalTriangles: number;
  };
}

/* ------------------------------------------------------------------ */
/* Requests and responses                                              */
/* ------------------------------------------------------------------ */

export interface Scene3dCompileRequest {
  /**
   * Project-relative directory holding the scene sources. Defaults to the
   * project root; a project may hold several scenes side by side.
   */
  scenePath?: string;
  /** Restrict the pipeline to these stages (default: all six). */
  stages?: Scene3dStageId[];
  proof?: Scene3dProofOptions;
  /** Bypass the per-stage content-hash cache. */
  noCache?: boolean;
  /**
   * Render the proof frames as text in the agent report even when no proof
   * rule fired. By default the ASCII ramps appear only when a finding is
   * ABOUT what the frames look like; this is the caller saying "show me
   * anyway" — the text-only reader's equivalent of opening the PNGs.
   */
  frames?: boolean;
  /**
   * Recipe-evaluation work budget (kernel work units). Omitted → the kernel's
   * generous default. NOT a size cap — it is the runaway guard's ceiling as a
   * RAISABLE input: a genuinely large kernel asset that trips the default
   * compiles by raising this. A positive finite number; anything else is
   * ignored and the default stands.
   */
  workBudget?: number;
  /**
   * Extra camera angles to photograph this compile from — the viewport.
   *
   * The turntable answers "what did I build"; a look answers "what does THAT
   * part look like from THERE". Each entry names a part and a direction rather
   * than carrying coordinates, and the compiler resolves it against the census
   * it just measured — so the caller aims by naming things it can see in the
   * report. The resolved pose of every look comes back in the response, which
   * is what lets the next request nudge it without the daemon remembering
   * anything between calls.
   */
  looks?: Scene3dLookSpec[];
  /**
   * The same viewport in its general form — station × gaze × lens × sweep.
   *
   * A `look` aims at something, which covers most questions but not all: a shot
   * that stands in a room and turns around has no subject to aim at, and a shot
   * that rides a moving part is one spec resolved many times. `looks` desugars
   * onto this, so both are one render queue with one arithmetic path behind it.
   *
   * Deliberately not re-validated at the wire: the compiler resolves every
   * field against the census it measured and rejects a bad one by NAMING the
   * parts that exist, which is an answer. A schema check here could only turn
   * that into an opaque 400.
   */
  shots?: Scene3dShotSpec[];
}

/**
 * One shot in the general form. Every field is optional: `{}` is a fitted front
 * view of the whole scene, the same subject the turntable photographs.
 */
export interface Scene3dShotSpec {
  /** Where the eye is. Exactly one form. */
  station?:
    | { orbit: { of?: string; azimuthDeg: number; elevationDeg?: number; distance?: number; margin?: number } }
    | { at: string; offset?: [number, number, number] }
    | { point: [number, number, number] };
  /** Where it points. Exactly one form. `heading` turns in place — no subject,
   *  no distance, no framing. */
  gaze?:
    | { at?: string }
    | { heading: string | number; pitchDeg?: number }
    | { toward: [number, number, number] };
  lens?: { fovDeg?: number };
  /** Resolve this shot `frames` times, advancing time and/or any pose scalar.
   *  Re-resolution, not interpolation — which is what lets a station attached
   *  to a moving part actually follow it. */
  sweep?: {
    frames: number;
    time?: true | [number, number];
    over?: Partial<
      Record<
        "azimuthDeg" | "elevationDeg" | "headingDeg" | "pitchDeg" | "distance" | "fovDeg",
        [number, number]
      >
    >;
  };
  label?: string;
}

/**
 * One aimed shot, in the semantic terms an author (or an agent) can actually
 * state. Every field is optional: `{}` is a fitted front view of the whole
 * scene, the same subject the turntable photographs.
 */
export interface Scene3dLookSpec {
  /** Census object name to aim at. Absent aims at the whole scene's bounds. */
  at?: string;
  /**
   * Where the camera stands: a compass word (`"front"`, `"front-left"`, …), an
   * explicit angle pair, or `{ part }` to stand AT another part — the "from the
   * doorway", "from the stool" shot a coordinate cannot express.
   */
  from?: string | { azimuthDeg: number; elevationDeg?: number } | { part: string };
  /** Elevation word (`"level"`, `"eye"`, `"high"`, `"top"`, `"low"`,
   *  `"bottom"`) when `from` is a compass word. */
  elevation?: string;
  /** Extra room around the subject; >1 pulls back, <1 crops in. */
  margin?: number;
  /** Horizontal field of view in degrees. */
  fovDeg?: number;
  /** Camera height above the standing part's top, metres — only with a
   *  `{ part }` viewpoint. */
  eyeHeight?: number;
  /** Explicit distance in metres, overriding the fitted framing. */
  distance?: number;
  /** A name carried through to the response so a batch stays identifiable. */
  label?: string;
}

/** A rendered look: the frame, plus the exact pose the request resolved to. */
export interface Scene3dLook {
  /** The caller's label, or a description of the resolved pose. */
  label: string;
  /** The rendered frame, absent when the pose resolved but the render failed. */
  image?: Scene3dArtifactRef;
  /** Where the eye is. Always present — a shot always stands somewhere. */
  eye: [number, number, number];
  /** Unit vector the camera looks along. Always present; the only thing the
   *  renderer strictly needs. */
  forward: [number, number, number];
  /** The gaze direction, in the compiler's one azimuth convention. */
  headingDeg: number;
  pitchDeg: number;
  /** Compass name for what the camera POINTS AT. */
  facing: string;
  /* --- present only when the shot was aimed at a subject. A shot that turns
     in place genuinely has none, and says so by their absence rather than by a
     zero that would read as a measurement. --- */
  targetName?: string;
  target?: [number, number, number];
  azimuthDeg?: number;
  elevationDeg?: number;
  distance?: number;
  /** Compass name for where the camera STANDS relative to its subject. */
  name?: string;
  fovDeg: number;
  /** Metres the frame spans at the aim depth — the one fact pixels cannot
   *  carry, since a 2mm screw and a 2m door make the same picture. */
  frameSpanM?: number;
  /** Index within a sweep, when this pose is one sample of many. */
  sampleIndex?: number;
  /** Measured on the rendered pixels: the fraction of frame the subject fills,
   *  and its mean luminance. A pose can resolve perfectly and photograph
   *  nothing; `coverage: 0` is how the caller learns that without guessing. */
  coverage?: number;
  meanLuminance?: number;
  /** What the resolver had to substitute or thought worth stating. */
  notes: string[];
}

/**
 * An artifact the compile produced, carried as both the on-disk project path
 * and a ready-to-render daemon URL so the viewer never has to build one.
 */
export interface Scene3dArtifactRef {
  /** Project-relative path, e.g. `out/proof/proof-<hash>-000.png`. */
  path: string;
  /** `/api/projects/:id/files/<path>` — served with the right mime type. */
  url: string;
}

export interface Scene3dCompileResponse {
  /** True only when the compile produced zero error-severity issues. */
  ok: boolean;
  scenePath: string;
  source: Scene3dSource;
  stages: Scene3dStageReport[];
  issues: Scene3dIssue[];
  summary: Scene3dIssueSummary;
  manifest: Scene3dManifest;
  proofImages: Scene3dArtifactRef[];
  exportedAssets: Scene3dArtifactRef[];
  /**
   * Per-material lit-sphere previews (`out/materials/ball-<name>.png`),
   * rendered during proof under the proof's own lighting/exposure — the
   * cheap gear between a raw baked texture and a full turntable for judging
   * how emission, alpha, and metallic compose. Never mixed into
   * `proofImages`: these are not frames of the scene.
   */
  materialBalls?: Scene3dArtifactRef[];
  /**
   * The aimed shots this compile was asked for, in request order, each with the
   * pose it actually resolved to. Never mixed into `proofImages`: those are one
   * orbit of one subject, and every consumer reads them that way.
   *
   * The pose travelling beside the image is the point — it is what tells the
   * caller where it was standing, and it is complete enough to re-issue or
   * nudge without the daemon holding any state between calls.
   */
  looks?: Scene3dLook[];
  /** Look specs that could not be resolved, with the reason (which names the
   *  parts that DO exist). Reported, never dropped: silence would read as
   *  "rendered, and there was nothing there". */
  looksRejected?: Array<{ index: number; reason: string }>;
  /**
   * The proof contact sheet (`out/contact.png`), resolved project-relative
   * with its asset URL.
   *
   * `manifest.contactSheet.path` is stored SCENE-relative like every other
   * manifest path; this is the same file addressed the way a consumer
   * outside the scene directory has to address it. Present whenever the
   * compile rendered proof frames.
   */
  contactSheet?: Scene3dArtifactRef;
  blender: { available: boolean; version: string | null };
  /**
   * The solver's output for spec-authored scenes: every part's solved box,
   * what it rests on, and which authored part each instance expanded from.
   * Present whenever solving ran — including parse-only compiles, where it
   * is the only placement information a fast loop gets.
   */
  solved?: {
    parts: Array<{
      id: string;
      size: [number, number, number];
      center: [number, number, number];
      shape: string;
      axis: 'x' | 'y' | 'z';
      flip: boolean;
      file?: string;
      script?: string;
      material?: string;
      role?: string;
      from?: string;
      restsOn?: string;
    }>;
    diagnostics: Array<{ code: string; message: string; part?: string }>;
  };
  /**
   * The report pre-rendered as a `<scene3d-report>` block, formatted to be
   * spliced into the generating agent's next turn. Mirrors the artifact-lint
   * `agentMessage` convention so both self-correction loops read alike.
   */
  agentMessage: string;
}

/** Severity threshold for `od scene3d compile`'s exit code. */
export type Scene3dFailOn = 'error' | 'warning' | 'none';

/** Machine envelope printed by `od scene3d compile --json`. */
export interface Scene3dCompileCliEnvelope {
  ok: boolean;
  projectId: string;
  scenePath: string;
  failOn: Scene3dFailOn;
  summary: Scene3dIssueSummary;
  stages: Scene3dStageReport[];
  issues: Scene3dIssue[];
  proofImages: string[];
  exportedAssets: string[];
  /** Project-relative path to `out/contact.png`, when the proof rendered. */
  contactSheet?: string;
  /**
   * The `<scene3d-report>` block, when `--agent-message` (or `--frames`) was
   * passed. Carried on the machine envelope for the same reason it is printed
   * on the prose one: the block exists for agent self-correction, and `--json`
   * is the surface an agent drives. Omitted without the flag so a scripted
   * `--json | jq` call does not pay for a report nothing reads.
   */
  agentMessage?: string;
  manifest: Scene3dManifest;
}

/**
 * URL for a compiled deliverable, given its project-relative path.
 *
 * The compile response already carries ready-made URLs, but anything reading
 * a path from somewhere else — an artifact sidecar, a kit index — needs to
 * build its own, and two hand-rolled encoders is how the daemon and the web
 * end up disagreeing about a filename with a space in it.
 */
export function buildScene3dAssetUrl(projectId: string, projectRelativePath: string): string {
  const segments = projectRelativePath
    .split('/')
    // Dot segments are dropped, not encoded: callers feed daemon-generated
    // manifest paths today, but a URL builder that passes ".." through is
    // a traversal primitive waiting for its first untrusted caller.
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
    .map(encodeURIComponent)
    .join('/');
  return `/api/projects/${encodeURIComponent(projectId)}/files/${segments}`;
}

/** Response of `GET /api/projects/:id/scene3d/manifest`. */
export interface Scene3dManifestResponse {
  scenePath: string;
  /** Null when the scene has never been compiled. */
  manifest: Scene3dManifest | null;
  proofImages: Scene3dArtifactRef[];
  exportedAssets: Scene3dArtifactRef[];
  /** The labelled contact sheet, resolved to a project-relative URL — the same
   *  ready reference the compile response carries, so a consumer hydrating from
   *  the manifest endpoint need not reconstruct a path for a nested scene.
   *  Absent when the last compile drew no sheet. */
  contactSheet?: Scene3dArtifactRef;
}

/** A scoped, on-demand re-describe of an already-compiled scene — the LOD
 *  digest the compile produced, but queryable by region/focus/budget so an
 *  agent working a 50k-part kit can ask "describe just the region around the
 *  door" or "expand the bracket group" without recompiling. A pure READ of the
 *  persisted census, same posture as the manifest endpoint (no Blender). */
export interface Scene3dDescribeResponse {
  scenePath: string;
  /** The scoped scene digest (plain text). Null when the scene has never been
   *  compiled — there is no census to describe. */
  describe: string | null;
}

/* ------------------------------------------------------------------ */
/* Viewer -> host selection protocol                                   */
/* ------------------------------------------------------------------ */

/** One part of the open asset, as the viewer knows it. */
export interface Scene3dSelectionPart {
  /** Object name, unique within the asset. This is what an agent addresses. */
  name: string;
  /** USD-style prim path, e.g. "/root/prp_crate_lid". */
  path: string;
  /** Census type: "MESH", "CAMERA", "LIGHT", "EMPTY", … */
  type: string;
}

/**
 * What the kit viewer tells its host when the selection changes.
 *
 * Broadcast as a `postMessage` to the parent frame and as a DOM
 * `CustomEvent` of the same name, so a host can listen whichever way suits
 * how it embeds the page.
 *
 * It carries the WHOLE part inventory, not only the selection. A host that
 * wants to offer parts for completion needs the list before the user has
 * clicked anything, and making it a property of every message means there
 * is one message shape to handle rather than a load event and a selection
 * event whose arrival order the host has to reason about. The inventory is
 * a few names per part; the round trip it saves is a real one.
 */
export interface Scene3dSelectionMessage {
  type: 'od:scene3d-select';
  /** The single selected part, or null for none or a multi-selection. */
  partId: string | null;
  /** Every selected part, in selection order. */
  partIds: string[];
  /** Project-relative scene directory, when the asset came from one. */
  scenePath: string | null;
  /** Display name of the open asset. */
  asset: string | null;
  /** Every part in the open asset, selected or not. */
  parts: Scene3dSelectionPart[];
}

/** The message name, shared so no caller has to spell it. */
export const SCENE3D_SELECTION_EVENT = 'od:scene3d-select';

/* ------------------------------------------------------------------ */
/* Viewer <-> host tweaks bridge                                       */
/* ------------------------------------------------------------------ */

/**
 * The kit page's tweaks proxy. In-host the page is a sandboxed srcdoc
 * document with an opaque origin, and the daemon's origin guard rejects
 * `Origin: null` API calls by design — so the page asks its HOST to make
 * the call from the app origin and post the result back. Request/response
 * are correlated by `requestId`; `op: 'save'` with an empty tweaks map and
 * no merge flag is how Reset clears the file.
 */
export interface Scene3dTweaksRequestMessage {
  type: 'od:scene3d-tweaks';
  /**
   * `load`/`save` move the tweaks file; `compile` asks the host to run the
   * scene's compile so saved tweaks actually bake — the page cannot call
   * the compile endpoint itself (opaque origin), and a viewer that can
   * save edits but never realize them is half a tool. The host answers
   * when the compile finishes; the refreshed artifacts then reach the
   * viewer through the host's normal file-change reload.
   */
  op: 'load' | 'save' | 'compile';
  requestId: string;
  /** Project-relative scene directory, when the asset came from one. */
  scenePath?: string | null;
  /** Save only: per-part transform tweaks, opaque to the host. */
  tweaks?: Record<string, unknown>;
  /** Save only: compose with what is on disk instead of replacing it. */
  merge?: boolean;
}

export interface Scene3dTweaksResultMessage {
  type: 'od:scene3d-tweaks-result';
  requestId: string;
  ok: boolean;
  /** Load only: the persisted tweaks map. */
  tweaks?: Record<string, unknown>;
  /** Why the operation failed, when it did. */
  error?: string;
}

export const SCENE3D_TWEAKS_EVENT = 'od:scene3d-tweaks';
export const SCENE3D_TWEAKS_RESULT_EVENT = 'od:scene3d-tweaks-result';

/**
 * Narrow an untrusted `postMessage` payload to a tweaks request. Anything
 * rendered in an iframe can post a lookalike, so every field is checked —
 * the host turns this into a real API call against the open project.
 */
export function isScene3dTweaksRequestMessage(
  value: unknown,
): value is Scene3dTweaksRequestMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (m.type !== SCENE3D_TWEAKS_EVENT) return false;
  if (m.op !== 'load' && m.op !== 'save' && m.op !== 'compile') return false;
  if (typeof m.requestId !== 'string' || m.requestId.length === 0) return false;
  if (m.scenePath != null && typeof m.scenePath !== 'string') return false;
  if (m.tweaks != null && (typeof m.tweaks !== 'object' || Array.isArray(m.tweaks))) return false;
  if (m.merge != null && typeof m.merge !== 'boolean') return false;
  return true;
}

/**
 * Narrow an untrusted `postMessage` payload to a selection message.
 *
 * The viewer is rendered in an iframe, so anything on the page can post a
 * lookalike. Every field is checked rather than cast: a host that trusted
 * the shape would hand unvalidated strings straight to the composer, and
 * the strings become part of a prompt.
 */
export function isScene3dSelectionMessage(value: unknown): value is Scene3dSelectionMessage {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  if (m.type !== SCENE3D_SELECTION_EVENT) return false;
  if (m.partId !== null && typeof m.partId !== 'string') return false;
  if (m.scenePath !== null && typeof m.scenePath !== 'string') return false;
  if (m.asset !== null && typeof m.asset !== 'string') return false;
  if (!Array.isArray(m.partIds) || m.partIds.some((p) => typeof p !== 'string')) return false;
  if (!Array.isArray(m.parts)) return false;
  return m.parts.every((p) => {
    if (!p || typeof p !== 'object') return false;
    const part = p as Record<string, unknown>;
    return (
      typeof part.name === 'string' &&
      typeof part.path === 'string' &&
      typeof part.type === 'string'
    );
  });
}
