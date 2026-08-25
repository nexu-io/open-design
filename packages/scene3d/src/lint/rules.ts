import { Issue, ProofFrameStats, UsdaPrimTree, Census } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { NormalizedContract } from "../contract.js";
import { lintNaming } from "./naming.js";
import { lintTopology, lintEmptyMeshes } from "./topology.js";
import { lintPbr } from "./pbr.js";
import { lintUv } from "./uv.js";
import { lintUnits } from "./units.js";
import { lintIntegrity } from "./integrity.js";
import { lintProof } from "./proof.js";
import { lintExportedStage } from "./stage.js";
import { lintWorld } from "./world.js";
import { lintVoxel } from "./voxel.js";
import { lintSheets, type SheetLintInput } from "./sheet.js";
import { lintClaims } from "./claims.js";
import { lintIntent } from "./judge.js";
import { applyImportedPosture, importedObjects } from "./provenance.js";
import type { ClaimsSpec, SolvedScene } from "../solve/types.js";

export interface LintInput {
  contract: NormalizedContract;
  census?: Census;
  primTree?: UsdaPrimTree;
  /** Coverage stats from the proof stage, when it ran. */
  proofFrames?: ProofFrameStats[];
  /**
   * Per-frame off-camera facts from the proof turntable: which meshes fell
   * out of which orbit frame. The census's own off-camera check measures
   * ONE camera pose; this is the honest version across all N frames a
   * turntable renders.
   */
  offByFrame?: Array<{ frame: number; objects: string[] }>;
  /** Raw text of the exported USD stage, when the export stage ran. */
  exportedUsda?: { text: string; file: string };
  /** Decoded and measured 2D sheets declared by the contract. */
  sheets?: Omit<SheetLintInput, "specs"> & { specs: SheetLintInput["specs"] };
  /** The scene spec's claims block, adjudicated against the census. */
  claims?: ClaimsSpec;
  /** Parts the author placed with an `above` relation — declared floats the
   *  two-sided grounded claim treats as supported on purpose. */
  declaredFloating?: readonly string[];
  /** The solved scene, when authored from scene.json — carries each part's
   *  `role`, the intent the budget judge resolves to a standard. */
  solved?: SolvedScene;
  /**
   * How the scene's sources were discovered. Provenance is read from it —
   * a bare mesh file is imported in its entirety — alongside the `file:` parts
   * in `solved`; both rules live in lint/provenance.ts. It is a FACT about the
   * input, not a switch: a new source kind states its provenance here rather
   * than growing another boolean.
   */
  sourceKind?: string;
  /**
   * Contract leaf paths the author wrote EXPLICITLY in scene3d.json
   * (`"geometry.allowOpenMeshes"`, `"uv.maxOverlapFraction"`, …) — not leaves
   * a target preset filled in. Writing a leaf is a statement that you meant
   * ITS rule, and cancels the imported-provenance relaxation for that rule
   * alone (lint/provenance.ts) — never for unrelated sibling rules in the
   * same block.
   */
  authoredKeys?: ReadonlySet<string>;
}

/**
 * Run every deterministic rule over the census + USDA parse tree.
 * Order is fixed; dedupe is by code+target+message so overlapping sources
 * (a Blender object and the same-named USD prim) cannot double-report.
 */
/**
 * Largest world dimension of the scene, metres, or undefined when nothing
 * measurable is present. Reads the same per-object world bounds every other
 * world-space rule reads rather than re-deriving extents.
 */
function sceneSizeMetres(census: Census | undefined): number | undefined {
  if (!census) return undefined;
  let lo: number[] | null = null;
  let hi: number[] | null = null;
  for (const obj of census.objects) {
    if (obj.type !== "MESH" || !obj.worldMin || !obj.worldMax) continue;
    if (!lo || !hi) {
      lo = [...obj.worldMin];
      hi = [...obj.worldMax];
      continue;
    }
    for (let axis = 0; axis < 3; axis++) {
      const mn = obj.worldMin[axis];
      const mx = obj.worldMax[axis];
      if (typeof mn === "number" && mn < lo[axis]!) lo[axis] = mn;
      if (typeof mx === "number" && mx > hi[axis]!) hi[axis] = mx;
    }
  }
  if (!lo || !hi) return undefined;
  const size = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
  return Number.isFinite(size) && size > 0 ? size : undefined;
}

export function runLint(input: LintInput): Issue[] {
  const issues: Issue[] = [];
  // Geometry the author did not build: a `file:`-backed spec part, or — when
  // the whole source IS an imported asset — every mesh in the scene. The rules
  // still RUN over it; `applyImportedPosture` below reclassifies what they find
  // rather than suppressing it, so the report can always explain itself.
  const imported = importedObjects(input);
  const ctx = { ...input, imported };
  lintNaming(ctx, issues);
  lintTopology(ctx, issues);
  if (input.census) lintEmptyMeshes(input.census, issues);
  lintPbr(ctx, issues);
  lintUv(ctx, issues);
  lintUnits(ctx, issues);
  lintIntegrity(ctx, issues);
  lintWorld(input.contract, input.census, issues, input.solved);
  // The turntable's own framing facts: which mesh fell out of which orbit
  // frame. An object off the CENSUS camera is (near-always) off turntable
  // frames too, and ordering alone does not stop both findings from firing
  // for it — the messages differ, so the final dedup pass would keep both
  // and print the same fix twice under two spellings. One finding per
  // object, carrying the richest evidence: the turntable row names the
  // failing frames (which the census cannot know), so where both fired the
  // frame-carrying row stands and the census-level row is dropped.
  if (input.offByFrame) {
    const turntableFlagged = lintTurntableFraming(input.offByFrame, issues);
    if (turntableFlagged.size > 0) {
      for (let i = issues.length - 1; i >= 0; i--) {
        const issue = issues[i]!;
        if (
          issue.code === ISSUE_CODES.OFF_CAMERA &&
          issue.detail?.frames === undefined &&
          issue.target !== undefined &&
          turntableFlagged.has(issue.target)
        ) {
          issues.splice(i, 1);
        }
      }
    }
  }
  lintVoxel(input.contract, input.census, issues, input.solved);
  // Thresholds come from the contract, not from whatever the caller happened
  // to build, so the sheet family is tunable like every other one.
  if (input.sheets) lintSheets({ ...input.sheets, ...input.contract.sheetRules }, issues);
  if (input.claims) {
    lintClaims(input.claims, input.census, issues, {
      groundTolerance: input.contract.grounding.tolerance,
      groundExempt: input.contract.grounding.exempt,
      // The analytic layer: swept envelopes over the solved boxes, the
      // closed-form oracle that works with or without a census.
      ...(input.solved ? { solved: input.solved.parts } : {}),
      ...(input.declaredFloating ? { declaredFloating: input.declaredFloating } : {}),
    });
  }
  // Scene size comes from the census the rest of the linter already uses:
  // the empty-frame error needs it to tell 'aimed wrong' from 'too small
  // to render'.
  lintProof(input.proofFrames, issues, input.contract.proofThresholds, sceneSizeMetres(input.census));
  lintIntent(input.census, input.contract, input.solved, issues);
  if (input.exportedUsda) {
    lintExportedStage(
      {
        usda: input.exportedUsda.text,
        contract: input.contract,
        file: input.exportedUsda.file,
        ...(input.census ? { objectNames: input.census.objects.map((o) => o.name) } : {}),
      },
      issues,
    );
  }

  // Last, over the finished set: a finding about somebody else's asset is a
  // note, not a defect its new owner must fix — but it is still SAID. Runs
  // after every rule so no module has to know about provenance.
  // Which objects wear each material, so a material-scoped relaxation can
  // ask whether everything using it is imported. Built from the census the
  // rules already read, not from a second source of truth.
  const materialUsers = new Map<string, Set<string>>();
  for (const mesh of input.census?.meshes ?? []) {
    for (const material of mesh.materials ?? []) {
      const users = materialUsers.get(material) ?? new Set<string>();
      users.add(mesh.object);
      materialUsers.set(material, users);
    }
  }
  applyImportedPosture(issues, imported, input.authoredKeys ?? new Set(), materialUsers);

  // A `material:` override on a `file:` part is DOCUMENTED wholesale
  // replacement — the import's own materials are orphaned by design, and
  // W-344 ("bind the material or delete it") is then advice the author can
  // neither take (the material lives inside a third-party GLB) nor needs.
  // Reclassify those orphans to info with the reason; a spec-authored
  // material that ends up unused keeps the real warning.
  {
    const overrideParts = (input.solved?.parts ?? []).filter((p) => p.file && p.material);
    if (overrideParts.length > 0) {
      const authored = new Set(
        (input.solved?.parts ?? []).map((p) => p.material).filter((m): m is string => Boolean(m)),
      );
      // Attribution is honest, not guessed: the census cannot say WHICH
      // import an orphaned material came from, so the message only names a
      // part when every file part carries an override (then the source set
      // is unambiguous). With a mix of overridden and plain file parts the
      // orphan may equally be an unused material the plain import shipped;
      // the demotion still holds (a non-authored material on the spec path
      // can only come from an import — somebody else's asset either way)
      // but the blame is left open instead of pinned on the wrong part.
      const fileParts = (input.solved?.parts ?? []).filter((p) => p.file);
      const unambiguous = overrideParts.length === fileParts.length;
      const overrideIds = overrideParts.map((p) => `'${p.id}'`).join(", ");
      for (const issue of issues) {
        if (issue.code !== ISSUE_CODES.MATERIAL_UNUSED || issue.severity === "info") continue;
        const name = issue.target ?? "";
        const isAuthored =
          authored.has(name) || [...authored].some((a) => name.startsWith(`${a}__`));
        if (isAuthored) continue;
        issue.severity = "info";
        issue.message += unambiguous
          ? ` — orphaned by the material override on ${overrideIds}: wholesale replacement is the documented behaviour for a file part's material`
          : ` — it ships inside an imported asset: either orphaned by the material override on ${overrideIds}, or never bound by its own import`;
        issue.hint =
          "nothing to fix — the imported asset's own material ships nowhere in this build";
        issue.detail = { ...issue.detail, provenance: "imported, overridden" };
      }
    }
  }

  const seen = new Set<string>();
  const deduped: Issue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.target ?? ""}|${issue.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(issue);
  }
  return deduped;
}

/**
 * Turntable framing: which mesh fell out of which orbit frame.
 *
 * The census's off-camera check measures ONE camera pose — the authored or
 * staged camera at census time. A turntable renders N poses, and a part that
 * clears the hero still can fall out of orbit frame 3. That gap made W-382
 * read as nonsense ("it's right there in the render!") and cost an author
 * two compiles to diagnose as camera tuning rather than geometry. The proof
 * stage now measures every frame it renders; this turns those measurements
 * into the finding, with the failing frame named.
 */
function lintTurntableFraming(
  offByFrame: ReadonlyArray<{ frame: number; objects: string[] }>,
  issues: Issue[],
): Set<string> {
  // One issue per object naming every frame that lost it — not one per
  // (frame, object) pair, which would print the same fix four times.
  const byObject = new Map<string, number[]>();
  for (const { frame, objects } of offByFrame) {
    for (const name of objects) {
      const frames = byObject.get(name) ?? [];
      frames.push(frame);
      byObject.set(name, frames);
    }
  }
  for (const [name, frames] of [...byObject].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    issues.push({
      code: ISSUE_CODES.OFF_CAMERA,
      severity: "warning",
      message:
        `object '${name}' falls outside the frustum in ${frames.length} turntable frame(s)` +
        ` (${frames.map((f) => `#${f}`).join(", ")})`,
      // The reflex fix ("move the part") is often wrong: the part may be
      // exactly where the author wants it and the FRAMING is what lost it —
      // a wider subject needs the camera pulled back or the lens widened,
      // not geometry dragged toward a shot. Name both levers.
      hint:
        "widen the framing so every orbit angle keeps the subject in view: pull the camera back / reduce the lens",
      target: name,
      detail: { frames },
    });
  }
  return new Set(byObject.keys());
}