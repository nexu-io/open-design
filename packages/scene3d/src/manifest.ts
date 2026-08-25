import * as fs from "node:fs";
import * as path from "node:path";
import {
  Census,
  CensusMesh,
  CensusObject,
  CompileRequest,
  Issue,
  IssueSummary,
  PartTweak,
  Scene3dAssetKind,
  Scene3dManifest,
  SceneSource,
} from "./types.js";
import { compilerIdentity } from "./build/blender.js";
import { renderKitHtml, type KitEntry } from "./viewer/kit.js";
import { summariseKit } from "./verdict.js";

/**
 * Delivered size of every exported asset, in bytes.
 *
 * Stat'd rather than accumulated during export: the export path has several
 * writers (the runner, the USDZ packager, the sheet baker) and a size summed
 * across them would be a different number from what the user downloads, which
 * is the only number worth reporting.
 */
function measureExportedBytes(
  projectDir: string | undefined,
  assets: string[],
): Record<string, number> | undefined {
  if (!projectDir) return undefined;
  const sizes: Record<string, number> = {};
  for (const rel of assets) {
    try {
      const stat = fs.statSync(path.join(projectDir, rel));
      if (stat.isFile()) sizes[rel] = stat.size;
    } catch {
      // Absent, not zero — see the field's docs.
    }
  }
  return Object.keys(sizes).length > 0 ? sizes : undefined;
}

/**
 * Emit the scene manifest — the RecordAsset-equivalent for a compiled
 * scene. It is written as `.scene3d/manifest.json` inside the project and
 * mirrors HyperFrames' deterministic artifact output: everything the viewer
 * and the agent need to know about the scene lands in one JSON file.
 */
export function buildManifest(input: {
  source: SceneSource;
  /** Where the exported assets live, so their delivered size can be measured. */
  projectDir?: string;
  /** Per-frame proof measurements, for readers who cannot open a PNG. */
  proofFrames?: Scene3dManifest["proofFrames"];
  /** Per-frame per-part projected screen rects (see Scene3dManifest.proofRects). */
  proofRects?: Scene3dManifest["proofRects"];
  /** Part names in id-map code order (see Scene3dManifest.proofIdParts). */
  proofIdParts?: Scene3dManifest["proofIdParts"];
  /** What the lowering had to restore because the master could not hold it. */
  carried?: Scene3dManifest["carried"];
  census?: Census;
  issues: Issue[];
  summary: IssueSummary;
  proofImages: string[];
  exportedAssets: string[];
  blenderUsed: boolean;
  blenderVersion: string | null;
  /**
   * The viewer edits Blender applied during THIS build.
   *
   * Recorded so a reader can tell what the geometry already contains.
   * `tweaks.json` is the cumulative record of every saved edit; this is the
   * subset that has actually reached the mesh. Anything in the file and not
   * in here is saved but not yet built, and a viewer that cannot tell the
   * difference shows a part back at its old position and looks as though it
   * lost the edit.
   */
  bakedTweaks?: Record<string, PartTweak> | undefined;
  /**
   * Sheets the contract declared. They are what makes a flipbook a flipbook
   * rather than "a PNG that happened to be in the folder", so the derived
   * asset kind reads them rather than guessing from file extensions.
   */
  sheets?: ReadonlyArray<{ kind: "sprite" | "flipbook" | "particle" | "beam" | "sky" }>;
  /** How many claims the spec declared, when it declared any. */
  claimsDeclared?: number;
  /** Budget usage per numeric claim, from the adjudicator's own
   *  measurements (lint/claims.ts claimMargins). Tightest first. */
  claimMargins?: Array<{ claim: string; measured: number; limit: number; used: number }>;
}): Scene3dManifest {
  const { census } = input;
  const issueCodes = [...new Set(input.issues.map((i) => i.code))].sort();
  // Codes that fired at a severity somebody is meant to ACT on. `issueCodes`
  // is the factual list of everything reported, including notes — and the kit
  // roll-up must not read a note as a problem. Once imported geometry started
  // being reclassified rather than suppressed (lint/provenance.ts), findings
  // about a downloaded asset's UVs became visible, correctly, as info; ranking
  // the kit's systemic problems by code frequency alone then promoted them to
  // "systemic across the kit", which is precisely the reading the relaxation
  // exists to prevent.
  const actionableCodes = [
    ...new Set(input.issues.filter((i) => i.severity !== "info").map((i) => i.code)),
  ].sort();
  // The claims ledger: failures counted from the adjudicator's own code so
  // the badge can never disagree with the issue list it summarises. The
  // `checked` count is the other half of that honesty: a claim the
  // adjudicator marked UNADJUDICATED (W-701 with detail.unadjudicated —
  // no census, no measurements) is not held, and the ledger a reader scans
  // must never say "3/3 held" about a build that never ran.
  const claims = (() => {
    if (input.claimsDeclared === undefined || input.claimsDeclared <= 0) return undefined;
    const declared = input.claimsDeclared;
    const failed = new Set(
      input.issues
        .filter((i) => i.code === "S3D-E-701")
        // Distinct by the claim KEY when the detail names one; an
        // adjudication issue without it must still count rather than
        // collapse into a single fabricated "undefined" claim.
        .map((i, index) => (i.detail?.claim != null ? String(i.detail.claim) : `#${index}`)),
    ).size;
    const unadjudicated = new Set(
      input.issues
        .filter((i) => i.code === "S3D-W-701" && i.detail?.unadjudicated === true)
        .map((i) => String(i.detail?.claim ?? "")),
    ).size;
    return {
      declared,
      failed,
      checked: Math.max(0, declared - unadjudicated),
      ...(input.claimMargins && input.claimMargins.length > 0
        ? { margins: input.claimMargins }
        : {}),
    };
  })();

  // Index both collections once. Every part used to cost three linear scans of
  // `meshes` (a `some` and two `find`s returning the same row) plus a scan per
  // parent hop; on the full inventory this tree is built from, that is
  // quadratic work to produce a lookup that is a Map.
  const objectByName = new Map<string, CensusObject>(census?.objects.map((o) => [o.name, o]) ?? []);
  const meshByObject = new Map<string, CensusMesh>(census?.meshes.map((m) => [m.object, m]) ?? []);

  const partTree =
    census?.objects.map((obj) => {
      const mesh = obj.hasMeshData ? meshByObject.get(obj.name) : undefined;
      return {
        name: obj.name,
        type: obj.type,
        parent: obj.parent,
        depth: objectDepth(objectByName, obj.name),
        mesh: mesh ? { verts: mesh.verts, faces: mesh.faces } : null,
      };
    }) ?? [];

  // Scale readout: measured extremes so "is that rivet really 12mm?" is a
  // manifest read, not a render inspection.
  let metrics: Scene3dManifest["metrics"];
  if (census) {
    let lo: [number, number, number] | null = null;
    let hi: [number, number, number] | null = null;
    let smallest: { name: string; minDimension: number } | null = null;
    let largest: { name: string; maxDimension: number } | null = null;
    for (const obj of census.objects) {
      if (obj.type !== "MESH") continue;
      const dims = obj.dimensions.filter((d) => Number.isFinite(d) && d > 0);
      if (dims.length > 0) {
        const min = Math.min(...dims);
        const max = Math.max(...dims);
        if (!smallest || min < smallest.minDimension) smallest = { name: obj.name, minDimension: round6(min) };
        if (!largest || max > largest.maxDimension) largest = { name: obj.name, maxDimension: round6(max) };
      }
      if (obj.worldMin && obj.worldMax) {
        if (!lo) { lo = [...obj.worldMin] as [number, number, number]; hi = [...obj.worldMax] as [number, number, number]; }
        else {
          for (let axis = 0; axis < 3; axis++) {
            const mn = obj.worldMin[axis];
            const mx = obj.worldMax[axis];
            if (mn !== null && mn !== undefined && mn < lo[axis]!) lo[axis] = mn;
            if (mx !== null && mx !== undefined && mx > hi![axis]!) hi![axis] = mx;
          }
        }
      }
    }
    metrics = {
      worldSize:
        lo && hi ? ([round6(hi[0]! - lo[0]!), round6(hi[1]! - lo[1]!), round6(hi[2]! - lo[2]!)] as [number, number, number]) : null,
      smallestPart: smallest,
      largestPart: largest,
      totalTriangles: census.meshes.reduce((sum, m) => sum + (m.tris ?? m.faces), 0),
    };
  }

  // Stat'd ONCE: the spread used to call this twice, testing truthiness
  // with one call and taking the value with another, so every deliverable
  // was stat'd twice per manifest.
  const exportedAssetBytes = measureExportedBytes(input.projectDir, input.exportedAssets);

  // Connectivity from the contacts the census already measured. A part in the
  // contact list touches something; a mesh absent from every pair touches
  // nothing. No new measurement, no new Blender work.
  let connectivity: Scene3dManifest["connectivity"];
  if (census && census.contacts) {
    const touching = new Set<string>();
    for (const contact of census.contacts) {
      touching.add(contact.a);
      touching.add(contact.b);
    }
    const isolatedParts = census.meshes
      .map((m) => m.object)
      .filter((name) => !touching.has(name))
      .sort();
    connectivity = {
      touching: census.meshes.length - isolatedParts.length,
      isolated: isolatedParts.length,
      // Bounded: the point is the COUNT plus enough names to start looking.
      isolatedParts: isolatedParts.slice(0, 12),
    };
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: input.source,
    blender: { version: input.blenderVersion, used: input.blenderUsed },
    compiler: compilerIdentity(),
    ...(claims ? { claims } : {}),
    partTree,
    materials:
      census?.materials.map((m) => ({
        name: m.name,
        usedByObjects: m.usedByObjectCount,
        metallic: m.principled.metallic,
        roughness: m.principled.roughness,
        hasTexture: m.principled.hasTexture,
        // The look's third lever, next to metallic/roughness: an author
        // verifying "is my lantern actually glowing" should not have to
        // open Blender — the census measured it, so the manifest carries it.
        ...(m.principled.emissionStrength !== undefined
          ? { emissionStrength: m.principled.emissionStrength }
          : {}),
        // ...and the fourth: a glass material's whole identity is its
        // alpha, and the report's materials line used to print exactly the
        // two properties that needed no review while omitting this one.
        ...(m.principled.alpha !== undefined && m.principled.alpha < 1
          ? { alpha: m.principled.alpha }
          : {}),
      })) ?? [],
    textures:
      census?.textures.map((t) => ({
        name: t.name,
        filepath: t.filepath,
        resolution: [t.width, t.height] as [number, number],
      })) ?? [],
    animation: census
      ? {
          fps: census.animation.fps,
          frameStart: census.animation.frameStart,
          frameEnd: census.animation.frameEnd,
          keyframedObjects: census.animation.keyframedObjects,
        }
      : { fps: 0, frameStart: 0, frameEnd: 0, keyframedObjects: [] },
    camera: census?.camera ?? { present: false, name: null },
    proofImages: input.proofImages,
    ...(connectivity ? { connectivity } : {}),
    ...(input.proofFrames && input.proofFrames.length > 0
      ? { proofFrames: input.proofFrames }
      : {}),
    ...(input.proofRects && input.proofRects.length > 0
      ? { proofRects: input.proofRects }
      : {}),
    ...(input.proofIdParts && input.proofIdParts.length > 0
      ? { proofIdParts: input.proofIdParts }
      : {}),
    exportedAssets: input.exportedAssets,
    // Present whenever the lowering RECORDED one, empty lists included. An
    // all-empty carry says "the master held everything"; an absent field says
    // "nobody measured", which is what a compile from before this existed —
    // or a cache entry written by one — actually leaves behind. Collapsing
    // both into absence is the same conflation the rest of this package
    // refuses to make.
    ...(input.carried ? { carried: input.carried } : {}),
    ...(exportedAssetBytes ? { exportedAssetBytes } : {}),
    issues: input.summary,
    issueCodes,
    actionableCodes,
    assetKind: deriveAssetKind({
      partTree,
      keyframedObjects: census?.animation.keyframedObjects ?? [],
      textureCount: census?.textures.length ?? 0,
      // The compiler's own staging camera is not authorship: framing a
      // bare imported crate must not demote it from prop to scene.
      cameraPresent: (census?.camera.present ?? false) && !census?.camera.staging,
      sheets: input.sheets ?? [],
    }),
    ...(input.bakedTweaks && Object.keys(input.bakedTweaks).length > 0
      ? { bakedTweaks: input.bakedTweaks }
      : {}),
    ...(metrics ? { metrics } : {}),
  };
}

/** Object types that stage a scene rather than being part of its geometry. */
const STAGING_TYPES = new Set(["CAMERA", "LIGHT", "SPEAKER"]);

/**
 * Classify what a compile produced.
 *
 * Read top-down; the first rule that matches wins, and the order encodes
 * which fact is the strongest statement of intent. Declared sheets beat
 * everything when there is no geometry, because a project whose only output
 * is a beam sheet is a VFX asset no matter what else is in the folder.
 * Geometry beats sheets when both exist, because a scene that also ships a
 * flipbook is still a scene.
 */
export function deriveAssetKind(input: {
  partTree: ReadonlyArray<{ type: string; parent: string | null; mesh: unknown }>;
  keyframedObjects: readonly string[];
  textureCount: number;
  cameraPresent: boolean;
  sheets: ReadonlyArray<{ kind: string }>;
}): Scene3dAssetKind {
  const meshes = input.partTree.filter((p) => p.mesh !== null);
  const sheetKinds = new Set(input.sheets.map((sheet) => sheet.kind));

  if (meshes.length === 0) {
    if (sheetKinds.has("sky")) return "skybox";
    if (sheetKinds.has("particle") || sheetKinds.has("beam")) return "vfx";
    if (sheetKinds.has("flipbook")) return "flipbook";
    if (sheetKinds.has("sprite")) return "sprite";
    if (input.textureCount > 0) return "texture";
    return "scene";
  }

  if (input.keyframedObjects.length > 0) return "animation";

  // A prop is one thing. Staging objects don't count toward that — a crate
  // lit by a key light is still a crate — but a second geometry root means
  // the deliverable is an arrangement, which is a scene.
  const geometryRoots = input.partTree.filter(
    (p) => p.parent === null && !STAGING_TYPES.has(p.type),
  );
  if (geometryRoots.length === 1 && !input.cameraPresent) return "prop";
  return "scene";
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Hierarchy depth, walked through a prebuilt index.
 *
 * This used to take the census and `.find()` the parent on every hop, while
 * the caller invoked it once per object — quadratic in object count, times
 * depth. The tree payload deliberately carries the WHOLE inventory (the
 * 4000-part cap is a backstop, not a display limit), so the input size this
 * runs against is a real scene's part list, not a sample of one.
 *
 * The `seen` set is not an optimisation: a parent cycle would otherwise spin
 * forever, and the census is data crossing a process boundary.
 */
function objectDepth(byName: Map<string, CensusObject>, name: string): number {
  let depth = 0;
  let current = byName.get(name);
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.parent)) {
    seen.add(current.parent);
    depth++;
    current = byName.get(current.parent);
    if (!current) break;
  }
  return depth;
}

/** Persist the manifest; returns the manifest AS PERSISTED — generatedAt
 *  stabilised — so a caller can hand out the same object the disk holds.
 *  Returning the pre-stabilised input made the compile response and
 *  `out/manifest.json` disagree about `generatedAt` on an unchanged
 *  recompile, and the two surfaces hydrate from different sides. */
export function writeManifest(projectDir: string, manifest: Scene3dManifest): Scene3dManifest {
  const dir = path.join(projectDir, "out");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "manifest.json");
  const persisted = stableGeneratedAt(file, manifest);
  fs.writeFileSync(file, JSON.stringify(persisted, null, 2));
  return persisted;
}

/**
 * Keep `generatedAt` stable across a recompile that changed nothing else, so
 * `out/manifest.json` is byte-identical when its content is — the determinism
 * discipline the rest of the pipeline holds. It still advances the instant any
 * other field changes, which preserves its "last changed" meaning for the kit
 * sidecar's createdAt/updatedAt. Without this, `new Date()` alone made the
 * manifest the one artifact that could never reproduce byte-for-byte.
 */
function stableGeneratedAt(file: string, manifest: Scene3dManifest): Scene3dManifest {
  const withoutStamp = (m: Scene3dManifest) => JSON.stringify({ ...m, generatedAt: "" });
  try {
    const prev = JSON.parse(fs.readFileSync(file, "utf8")) as Scene3dManifest;
    if (prev?.generatedAt && withoutStamp(prev) === withoutStamp(manifest)) {
      return { ...manifest, generatedAt: prev.generatedAt };
    }
  } catch {
    /* no previous manifest, or unreadable — stamp fresh */
  }
  return manifest;
}

/**
 * Write `out/index.html` — a self-contained turntable player for the frames
 * this compile rendered.
 *
 * The proof frames are the whole point of the loop and they were being
 * written to disk where nothing could open them. A plain HTML file next to
 * them means the host's own file viewer previews the asset with a scrub bar
 * and a replay control, with no host-side integration and no 3D runtime: the
 * frames already came out of the same headless Blender that produced the
 * mesh, so replaying them shows the real asset rather than a second,
 * differently-wrong picture of it.
 *
 * Frames are referenced by relative path, not inlined, so the file stays a
 * couple of kilobytes no matter how long the turntable is.
 */
export function writeViewer(
  projectDir: string,
  manifest: Scene3dManifest,
  proofImages: string[],
  scenePath?: string,
): string {
  const dir = path.join(projectDir, "out");
  fs.mkdirSync(dir, { recursive: true });
  // Paths are stored project-relative ("out/proof/x.png"); the viewer sits
  // inside `out/`, so strip that prefix to keep the src relative to itself.
  const frames = proofImages.map((p) => p.replace(/^out\//, ""));
  // Escaped at the boundary where data meets markup: JSON.stringify does
  // NOT escape "<", so a part/material/texture name carrying "</script>"
  // — imported third-party assets name their own nodes — would close the
  // viewer's script block and run as markup. Same rule the kit page
  // applies to its payload.
  const payload = JSON.stringify({
    frames,
    partTree: manifest.partTree,
    materials: manifest.materials,
    issues: manifest.issues,
    issueCodes: manifest.issueCodes,
    exportedAssets: manifest.exportedAssets.map((a) => a.replace(/^out\//, "")),
    camera: manifest.camera,
    // The player autoplays an `animation` (its frames sample the clip);
    // every other kind waits to be scrubbed.
    assetKind: manifest.assetKind ?? "scene",
  })
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
  const file = path.join(dir, "index.html");
  fs.writeFileSync(file, renderViewerHtml(payload), "utf8");
  const assetKind = manifest.assetKind ?? "scene";
  // Deliverables as the HOST addresses them: manifest paths are scene-
  // relative ("out/x.glb"), but the sidecar's consumer builds project-file
  // URLs, so an unscoped scene passes them through and a nested one gets
  // its scenePath prefix.
  const projectRelative = (asset: string): string =>
    scenePath === undefined || scenePath === "." ? asset : `${scenePath}/${asset}`;
  // The frame player renders natively in the host's compile panel: it is a
  // record of the compile, and the panel already is that record's UI.
  writeArtifactSidecar(file, {
    title: sceneLabel(scenePath),
    entry: "index.html",
    manifest,
    assetKind,
    renderer: "scene3d",
    ...(scenePath === undefined ? {} : { scenePath }),
  });

  // The kit page is the real deliverable: an orbitable mesh, not eight
  // stills. It sits beside the frame player rather than replacing it,
  // because the frames remain the honest record of what the compiler
  // actually measured (S3D-E-383 reads those pixels, not this render).
  const glb = manifest.exportedAssets.find((a) => a.endsWith(".glb"));
  if (glb) {
    const facts = readPartFacts(dir);
    fs.writeFileSync(
      path.join(dir, "kit.html"),
      renderKitHtml({
        title: "Scene 3D — kit",
        entries: [
          {
            name: "Scene",
            category: "This scene",
            glb: glb.replace(/^out\//, ""),
            parts: manifest.partTree.length,
            /* What this build already baked. The viewer subtracts it from
               the saved-edits file to find the edits the mesh does not yet
               contain, instead of assuming the two always agree. */
            ...(manifest.bakedTweaks ? { bakedTweaks: manifest.bakedTweaks } : {}),
            tree: entryTree(manifest, facts),
            ...(facts && Object.keys(facts.matColors).length > 0
              ? { matColors: facts.matColors }
              : {}),
            ...(facts && Object.keys(facts.mats).length > 0 ? { mats: facts.mats } : {}),
            ...(facts && facts.clips.length > 0 ? { clips: facts.clips } : {}),
            ...(manifest.claims ? { claims: manifest.claims } : {}),
            ok: manifest.issues.errors === 0,
            issueCodes: manifest.issueCodes,
            kind: assetKind,
          },
        ],
      }),
      "utf8",
    );
    // The live viewport draws through the host's HTML viewer (`renderer:
    // "html"`), which reads `deliverables` to stock its Export menu — the
    // page itself has no download control.
    writeArtifactSidecar(path.join(dir, "kit.html"), {
      title: sceneLabel(scenePath),
      entry: "kit.html",
      manifest,
      assetKind,
      renderer: "html",
      deliverables: manifest.exportedAssets.map(projectRelative),
      ...(scenePath === undefined ? {} : { scenePath }),
      scenes: 1,
    });
  }
  return "out/index.html";
}

/**
 * A scene's part hierarchy in the kit page's compact wire shape.
 *
 * The payload carries the WHOLE inventory: the rail renders it as
 * prototype rows (instances grouped by stem with a count), so row count
 * scales with the number of DISTINCT things in the scene, not with clone
 * multiplicity — a truncated payload was what produced the dead
 * "+N more parts" row. The cap that remains is a backstop against a
 * pathological hundred-thousand-part scene inflating kit.html, far above
 * anything the pipeline actually produces.
 */
const MAX_TREE_PARTS = 4000;
function entryTree(
  manifest: Scene3dManifest,
  facts?: PartFacts,
): NonNullable<KitEntry["tree"]> {
  return manifest.partTree.slice(0, MAX_TREE_PARTS).map((part) => ({
    n: part.name,
    p: part.parent,
    t: part.type,
    ...(part.mesh ? { f: part.mesh.faces } : {}),
    ...(facts?.rows[part.name] ?? {}),
  }));
}

interface PartFacts {
  rows: Record<
    string,
    {
      d?: [number, number, number];
      r?: number;
      m?: string[];
      y?: string;
      o?: number;
      g?: number;
      b?: number;
      x?: number;
    }
  >;
  matColors: Record<string, string>;
  mats: NonNullable<KitEntry["mats"]>;
  clips: string[];
}

/** Ground gap below which a part reads as seated, not floating (matches the
 *  grounding convention's default tolerance). */
const FLOAT_WHISPER = 0.005;

/**
 * Per-part display facts, distilled from the compile's read model.
 *
 * This is the data behind the rail's small details — nature glyphs, the
 * selected-part card, the float whisper — so every field is census-measured
 * and every absence is deliberate: a part with no spatial block simply has
 * no dimensions line, a mesh past the census caps has no glyphs it did not
 * earn, and a missing or old read model degrades to the plain tree rather
 * than an error. Nothing here invents; it only carries.
 */
function readPartFacts(outDir: string): PartFacts | undefined {
  let census: Census;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(outDir, "read-model.json"), "utf8"));
    if (!parsed?.census || typeof parsed.census !== "object") return undefined;
    census = parsed.census as Census;
  } catch {
    return undefined;
  }

  const texturedMaterials = new Set(
    (census.materials ?? [])
      .filter((mat) => mat.principled?.hasTexture)
      .map((mat) => mat.name),
  );
  const matColors: Record<string, string> = {};
  for (const mat of census.materials ?? []) {
    const rgb = mat.principled?.baseColor;
    if (!rgb || rgb.some((v) => typeof v !== "number" || !Number.isFinite(v))) continue;
    // Linear → sRGB so the swatch matches what renders, not the raw float.
    const hex = rgb
      .map((v) => {
        const c = Math.max(0, Math.min(1, v));
        const srgb = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
        return Math.round(srgb * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("");
    matColors[mat.name] = `#${hex}`;
  }

  /* The material panel's data: census-measured PBR facts per material, in
     LINEAR floats (what the glTF factors and Principled inputs speak — the
     page owns display conversion). Keys are omitted, not zeroed, when the
     census did not measure them, so an older read model degrades to a
     panel with fewer sliders rather than one full of invented defaults. */
  const mats: PartFacts["mats"] = {};
  const round3 = (v: number) => Number(v.toFixed(3));
  for (const mat of census.materials ?? []) {
    const p = mat.principled;
    if (!p?.present) continue;
    const entry: PartFacts["mats"][string] = {};
    const rgb = p.baseColor;
    if (rgb && rgb.every((v) => typeof v === "number" && Number.isFinite(v))) {
      entry.c = rgb.map(round3) as [number, number, number];
    }
    if (typeof p.roughness === "number" && Number.isFinite(p.roughness)) {
      entry.r = round3(p.roughness);
    }
    if (typeof p.metallic === "number" && Number.isFinite(p.metallic)) {
      entry.m = round3(p.metallic);
    }
    // Emission only when it actually emits: strength alone is not light
    // (Blender defaults strength 1 over a black colour), so the fact is
    // the PRODUCT being non-zero.
    const em = p.emission;
    const strength = p.emissionStrength;
    if (
      em &&
      em.every((v) => typeof v === "number" && Number.isFinite(v)) &&
      typeof strength === "number" &&
      Number.isFinite(strength) &&
      strength > 0 &&
      em.some((v) => v > 1e-4)
    ) {
      entry.e = em.map(round3) as [number, number, number];
      entry.s = round3(strength);
    }
    if (typeof p.alpha === "number" && Number.isFinite(p.alpha) && p.alpha < 1) {
      entry.a = round3(p.alpha);
    }
    if (p.hasTexture) entry.t = 1;
    if (typeof mat.usedByObjectCount === "number" && mat.usedByObjectCount > 0) {
      entry.u = mat.usedByObjectCount;
    }
    mats[mat.name] = entry;
  }

  const keyframed = new Set(census.animation?.keyframedObjects ?? []);
  const provenance = census.provenance ?? {};
  const bonesByName = new Map((census.armatures ?? []).map((a) => [a.name, a.bones]));

  const rows: PartFacts["rows"] = {};
  for (const mesh of census.meshes ?? []) {
    const row: PartFacts["rows"][string] = {};
    const size = mesh.spatial?.size;
    if (size && size.every((v) => Number.isFinite(v))) {
      row.d = size.map((v) => Number(v.toFixed(3))) as [number, number, number];
    }
    if (typeof mesh.tris === "number" && mesh.tris > 0) row.r = mesh.tris;
    if (mesh.materials && mesh.materials.length > 0) row.m = mesh.materials.slice(0, 4);
    let glyphs = "";
    if (keyframed.has(mesh.object)) glyphs += "a";
    // Watertight is a positive fact only a real closed mesh earns.
    if (mesh.faces > 0 && mesh.nonManifoldEdges === 0) glyphs += "w";
    if ((mesh.materials ?? []).some((name) => texturedMaterials.has(name))) glyphs += "x";
    if (glyphs) row.y = glyphs;
    const density = mesh.uv?.texelDensity?.mean;
    if (typeof density === "number" && Number.isFinite(density) && density > 0) {
      row.x = Math.round(density);
    }
    const gap = mesh.spatial?.groundGap;
    if (typeof gap === "number" && Number.isFinite(gap) && gap > FLOAT_WHISPER) {
      row.g = Number(gap.toFixed(4));
    }
    const origin = provenance[mesh.object];
    if (origin?.file === "scene.json" && typeof origin.line === "number") {
      row.o = origin.line;
    }
    if (Object.keys(row).length > 0) rows[mesh.object] = row;
  }
  for (const [name, bones] of bonesByName) {
    rows[name] = { ...(rows[name] ?? {}), b: bones, ...(keyframed.has(name) ? { y: "a" } : {}) };
  }

  return {
    rows,
    matColors,
    mats,
    clips: (census.animation?.actionNames ?? []).slice(0, 6),
  };
}

/**
 * Per-part findings, read from the compile's read model.
 *
 * Only issues that name a single part are kept. A pairwise target like
 * "a <-> b" is recorded against BOTH parts, because selecting either one
 * should reveal that they overlap — the finding belongs to the relationship,
 * and the reader can only ever have one of its ends selected.
 */
function readPartIssues(
  outDir: string,
): Record<string, Array<{ code: string; severity: string; message: string }>> | undefined {
  let issues: Array<{ code: string; severity: string; message: string; target?: string }>;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(outDir, "read-model.json"), "utf8"));
    issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
  } catch {
    return undefined;
  }
  const out: Record<string, Array<{ code: string; severity: string; message: string }>> = {};
  for (const issue of issues) {
    if (!issue?.target) continue;
    for (const name of issue.target.split("<->").map((s) => s.trim()).filter(Boolean)) {
      (out[name] ??= []).push({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      });
    }
  }
  // Errors first within each part, so the worst is what the card shows.
  for (const list of Object.values(out)) {
    list.sort((a, b) => (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Last path segment as a display name; the project name when unscoped. */
function sceneLabel(scenePath?: string): string {
  const segments = (scenePath ?? "").split("/").filter((s) => s && s !== ".");
  return segments[segments.length - 1] ?? "Scene";
}

/**
 * Collect every compiled scene in a project into one browsable kit.
 *
 * This is the view the work actually wants: a session that produced a crate,
 * a lantern, and a watchtower should present as a parts bin you pan around,
 * not three separate file tabs. Scenes are discovered by their manifests, so
 * the kit reflects what has genuinely compiled rather than what someone
 * remembered to register.
 */
export function writeProjectKit(
  projectRoot: string,
  title = "Asset kit",
  /**
   * `/api/projects/<id>`, when the caller knows it. Baked into the page so
   * saving works even when the host renders the preview through an
   * iframe's srcDoc, where the page cannot read its own URL.
   */
  apiBase?: string,
  /**
   * Resolve a code to its human title. scene3d is the lower layer and does not
   * own the title catalog (contracts does), so a caller that has it — the
   * daemon — passes `scene3dIssueTitle` here. Absent ⇒ the roll-up shows codes.
   */
  titleFor?: (code: string) => string | null,
): string | null {
  const entries: KitEntry[] = [];
  const scenes: KitSceneRecord[] = [];
  for (const scenePath of findCompiledScenes(projectRoot)) {
    const manifestFile = path.join(projectRoot, scenePath, "out", "manifest.json");
    let manifest: Scene3dManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as Scene3dManifest;
    } catch {
      continue;
    }
    const glb = manifest.exportedAssets.find((a) => a.endsWith(".glb"));
    if (!glb) continue;
    /*
     * Findings for individual parts, so the viewer can say "this part is the
     * broken one" at the moment it is selected.
     *
     * The manifest keeps only a count and the set of codes — enough for a
     * verdict, not enough to point at a part. The read model keeps the full
     * issue list with targets, so it is read here. Absent on a scene
     * compiled before the read model existed, which simply means no
     * per-part findings rather than an error.
     */
    const partIssues = readPartIssues(path.join(projectRoot, scenePath, "out"));
    const facts = readPartFacts(path.join(projectRoot, scenePath, "out"));
    /* A root-level scene arrives as ".", whose split yields ["."] — which
       used to become a kit entry literally NAMED "." with "./"-prefixed
       paths no URL builder treats like the nested ones. Root scenes read
       as "scene" and their paths carry no prefix. */
    const isRoot = scenePath === ".";
    const segments = isRoot ? [] : scenePath.split("/").filter(Boolean);
    const sceneRel = (rel: string) => (isRoot ? rel : `${scenePath}/${rel}`);
    scenes.push({
      name: segments[segments.length - 1] ?? "scene",
      scenePath,
      assetKind: manifest.assetKind ?? "scene",
      parts: manifest.partTree.length,
      ...(manifest.bakedTweaks ? { bakedTweaks: manifest.bakedTweaks } : {}),
      triangles: manifest.metrics?.totalTriangles ?? null,
      errors: manifest.issues.errors,
      warnings: manifest.issues.warnings,
      issueCodes: manifest.issueCodes,
      actionableCodes: manifest.actionableCodes ?? manifest.issueCodes,
      deliverables: manifest.exportedAssets.map(sceneRel),
    });
    entries.push({
      name: segments[segments.length - 1] ?? "scene",
      // Group by the parent directory, so `props/crate` and `props/barrel`
      // land together without anyone maintaining a category list.
      category: segments.length > 1 ? segments[segments.length - 2]! : "Scenes",
      glb: sceneRel(glb),
      ...(partIssues ? { partIssues } : {}),
      parts: manifest.partTree.length,
      tree: entryTree(manifest, facts),
      ...(facts && Object.keys(facts.matColors).length > 0 ? { matColors: facts.matColors } : {}),
      ...(facts && Object.keys(facts.mats).length > 0 ? { mats: facts.mats } : {}),
      ...(facts && facts.clips.length > 0 ? { clips: facts.clips } : {}),
      ...(manifest.claims ? { claims: manifest.claims } : {}),
      scenePath,
      ok: manifest.issues.errors === 0,
      issueCodes: manifest.issueCodes,
      kind: manifest.assetKind ?? "scene",
    });
  }
  if (entries.length === 0) return null;
  // localeCompare: the ternary form returned 1 for EQUAL keys, an
  // inconsistent comparator that makes the order engine-defined.
  entries.sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));

  // Catalog roll-up — the kit's grade and its systemic codes — built ONCE over
  // the whole catalog and shared by the page banner and the sidecar, so the two
  // never disagree. Titles are resolved here if the caller can.
  const kv = summariseKit(scenes);
  const rollup = {
    grade: kv.grade,
    systemic: kv.systemic.slice(0, 12).map((s) => {
      const t = titleFor?.(s.code);
      return { ...s, ...(t ? { title: t } : {}) };
    }),
  };

  const file = path.join(projectRoot, "kit.html");
  fs.writeFileSync(
    file,
    renderKitHtml({ title, entries, rollup, ...(apiBase === undefined ? {} : { apiBase }) }),
    "utf8",
  );
  // The kit's record is self-contained on purpose.
  //
  // A scene's panel hydrates by asking the daemon for that scene's manifest.
  // A kit cannot: there is no manifest at the project root and no single
  // thing to recompile. So everything the host needs to render a kit —
  // its scenes, their counts, and every deliverable path — is written into
  // the sidecar here, and the panel reads it without a round trip.
  writeKitSidecar(file, { title, scenes, rollup });
  return "kit.html";
}

/** The catalog roll-up shape the sidecar and the page banner share. */
interface KitRollup {
  grade: string;
  systemic: Array<{ code: string; scenes: number; title?: string }>;
}

/** One compiled scene, as the kit's sidecar records it. */
interface KitSceneRecord {
  name: string;
  scenePath: string;
  assetKind: Scene3dAssetKind;
  parts: number;
  triangles: number | null;
  errors: number;
  warnings: number;
  /** The scene's issue codes — the roll-up needs them to find systemic ones. */
  issueCodes: string[];
  /** …ranked from the ones above `info`, so a note is never a "problem". */
  actionableCodes?: string[];
  deliverables: string[];
}

/**
 * Bounds on what the kit sidecar carries. The host caps artifact metadata at
 * 16KB and drops the whole manifest when it overflows, which would silently
 * demote a large kit back to a plain HTML page. Truncating loudly beats
 * losing the record: `scenesTruncated` tells the panel it is showing a
 * subset, so it can say so rather than quietly under-reporting.
 */
const MAX_KIT_SCENES = 48;
const MAX_KIT_DELIVERABLES = 192;

function writeKitSidecar(
  file: string,
  input: { title: string; scenes: KitSceneRecord[]; rollup: KitRollup },
): void {
  const kept = input.scenes.slice(0, MAX_KIT_SCENES);
  const deliverables = kept.flatMap((scene) => scene.deliverables).slice(0, MAX_KIT_DELIVERABLES);
  const exports = [
    ...new Set(deliverables.map(exportKindFor).filter((k): k is string => k !== null)),
  ];
  if (exports.length === 0) exports.push("html");

  const totals = kept.reduce(
    (acc, scene) => ({
      parts: acc.parts + scene.parts,
      triangles: acc.triangles + (scene.triangles ?? 0),
      errors: acc.errors + scene.errors,
      warnings: acc.warnings + scene.warnings,
    }),
    { parts: 0, triangles: 0, errors: 0, warnings: 0 },
  );

  const sidecar = {
    version: 1,
    kind: "scene3d",
    // Drawn by the HTML viewer, not the compile panel. The page is a live
    // WebGL viewport with its own editing overlays; the host's job is to give
    // it a toolbar that fits a 3D asset, not to re-frame it. The `scene3d`
    // KIND is what tells the host to do that.
    renderer: "html",
    title: input.title,
    entry: "kit.html",
    status: "complete",
    exports,
    metadata: {
      assetKind: "kit",
      scenes: kept.map((scene) => ({
        name: scene.name,
        scenePath: scene.scenePath,
        assetKind: scene.assetKind,
        parts: scene.parts,
        triangles: scene.triangles,
        errors: scene.errors,
        warnings: scene.warnings,
      })),
      scenesTruncated: input.scenes.length > kept.length,
      deliverables,
      deliverablesTruncated:
        kept.flatMap((scene) => scene.deliverables).length > deliverables.length,
      parts: totals.parts,
      triangles: totals.triangles,
      errors: totals.errors,
      warnings: totals.warnings,
      // The at-a-glance catalog verdict: grade + the systemic codes worth
      // fixing once, built over the whole catalog and shared with the page.
      grade: input.rollup.grade,
      systemic: input.rollup.systemic,
      generator: "scene3d",
    },
  };
  fs.writeFileSync(`${file}.artifact.json`, JSON.stringify(sidecar, null, 2), "utf8");
}


/**
 * Map a deliverable's extension onto the host's export vocabulary. The host
 * offers a FORMAT, not a container: `.usda` and `.usdc` are both "OpenUSD" in
 * a menu, and which one ships is the scene contract's decision.
 */
function exportKindFor(asset: string): string | null {
  switch (asset.split(".").pop()?.toLowerCase()) {
    case "glb":
    case "gltf":
      return "glb";
    case "usda":
    case "usdc":
    case "usdz":
      return "usd";
    case "obj":
      return "obj";
    case "png":
      return "png";
    default:
      return null;
  }
}

/**
 * Declare a compiled file to the host as a first-class artifact.
 *
 * Open Design reads `<file>.artifact.json` beside any project file and uses
 * it to pick a renderer, so writing one is how a compiled asset stops being
 * "some HTML that happened to appear" and becomes a typed deliverable the UI
 * can give its own chrome. Without it the kit page renders as a generic web
 * prototype, complete with a mobile-viewport switcher for a turntable.
 *
 * Kept deliberately small: the scene manifest is the record of what was
 * built, and duplicating it here would just create two things to disagree.
 * Only what the host needs to LABEL and EXPORT the asset lives in metadata.
 */
function writeArtifactSidecar(
  file: string,
  input: {
    title: string;
    entry: string;
    manifest: Scene3dManifest;
    assetKind: Scene3dAssetKind;
    /**
     * How the host draws the file. `"html"` for the interactive kit page —
     * a live viewport the host wraps with a scene3d toolbar; `"scene3d"`
     * for records the host renders natively in its compile panel. The KIND
     * stays `scene3d` either way; kind is what the file is, renderer is how
     * it is shown.
     */
    renderer: "scene3d" | "html";
    /**
     * Project-relative deliverable paths. The host's Export menu is fed by
     * this — it is what replaced the page's own Download control — so any
     * sidecar whose page users will download from must carry it.
     */
    deliverables?: string[];
    scenePath?: string;
    scenes?: number;
  },
): void {
  const exports = [
    ...new Set(input.manifest.exportedAssets.map(exportKindFor).filter((k): k is string => k !== null)),
  ];
  if (input.manifest.proofImages.length > 0 && !exports.includes("png")) exports.push("png");
  // `exports` must be non-empty for the host to accept the manifest, and an
  // asset that compiled but shipped nothing is still openable as a page.
  if (exports.length === 0) exports.push("html");

  const sidecar = {
    version: 1,
    kind: "scene3d",
    renderer: input.renderer,
    title: input.title,
    entry: input.entry,
    status: "complete",
    exports,
    createdAt: input.manifest.generatedAt,
    updatedAt: input.manifest.generatedAt,
    metadata: {
      assetKind: input.assetKind,
      ...(input.deliverables === undefined ? {} : { deliverables: input.deliverables }),
      ...(input.scenePath === undefined ? {} : { scenePath: input.scenePath }),
      ...(input.scenes === undefined ? {} : { scenes: input.scenes }),
      parts: input.manifest.partTree.length,
      triangles: input.manifest.metrics?.totalTriangles ?? null,
      errors: input.manifest.issues.errors,
      warnings: input.manifest.issues.warnings,
      // Bounded: the code list is a fingerprint for the UI badge, not the
      // issue log. The full list lives in the scene manifest.
      issueCodes: input.manifest.issueCodes.slice(0, 32),
      generator: "scene3d",
    },
  };
  fs.writeFileSync(`${file}.artifact.json`, JSON.stringify(sidecar, null, 2), "utf8");
}

/** Project-relative directories holding an `out/manifest.json`. */
function findCompiledScenes(projectRoot: string, depth = 4): string[] {
  const found: string[] = [];
  const walk = (dir: string, rel: string, left: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isDirectory() && e.name === "out")) {
      if (fs.existsSync(path.join(dir, "out", "manifest.json"))) {
        found.push(rel === "" ? "." : rel);
      }
    }
    if (left === 0) return;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "out" || entry.name.startsWith(".") || entry.name === "node_modules") continue;
      walk(path.join(dir, entry.name), rel === "" ? entry.name : `${rel}/${entry.name}`, left - 1);
    }
  };
  walk(projectRoot, "", depth);
  return found;
}

function renderViewerHtml(payload: string): string {
  // Kept in step with the host's native frame player (Scene3dPanel): same
  // hairline scrubber with a played-portion fill, same ghost play control,
  // same corner orbit glyph instead of a text hint, same drag-to-rotate
  // gesture over the picture. This page is the standalone fallback for the
  // same frames, and two visual dialects for one artifact read as neglect.
  return `<!doctype html>
<meta charset="utf-8" />
<title>Scene 3D — turntable</title>
<style>
  :root { color-scheme: light dark; --ink: #14181d; --muted: #667081; --line: #e3e6ea; --panel: #f6f7f9; --raised: #fff; --accent: #353535; }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #e6edf3; --muted: #8b949e; --line: #262d36; --panel: #161b22; --raised: #0d1117; --accent: #adbac7; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--ink); font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; }
  .wrap { display: grid; grid-template-columns: minmax(0,1fr) 260px; gap: 16px; padding: 16px; }
  @media (max-width: 780px) { .wrap { grid-template-columns: minmax(0,1fr); } }
  /* The stage is square (the frames are), but the VIEWPORT is not: capped
     to the window height so the scrubber never falls below the fold — a
     player whose controls need a scroll to reach reads as a broken page. */
  .stage, .bar { width: min(100%, calc(100vh - 90px)); margin-inline: auto; }
  .stage { position: relative; aspect-ratio: 1/1; border: 1px solid var(--line); border-radius: 10px;
           background: radial-gradient(120% 90% at 50% 0%,
             color-mix(in srgb, var(--raised) 55%, var(--panel)), var(--panel) 78%);
           display: grid; place-items: center; overflow: hidden;
           user-select: none; touch-action: pan-y; cursor: grab; }
  .stage.drag { cursor: grabbing; }
  .stage img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
  .hint { position: absolute; right: 10px; bottom: 8px; color: var(--muted); opacity: .55;
          pointer-events: none; transition: opacity 200ms cubic-bezier(0.23, 1, 0.32, 1); }
  .hint.off { opacity: 0; }
  .bar { display: flex; align-items: center; gap: 10px; padding-top: 10px; }
  .play { display: inline-grid; place-items: center; width: 26px; height: 26px; flex: none; padding: 0;
          border: 0; border-radius: 999px; background: transparent; color: var(--muted); cursor: pointer;
          transition: background 200ms cubic-bezier(0.23, 1, 0.32, 1), color 200ms cubic-bezier(0.23, 1, 0.32, 1); }
  .play:hover { background: var(--panel); color: inherit; }
  input[type=range] { flex: 1; min-width: 0; margin: 0; height: 16px; appearance: none;
    -webkit-appearance: none; background: transparent; cursor: pointer; }
  input[type=range]::-webkit-slider-runnable-track { height: 3px; border-radius: 999px;
    background: linear-gradient(to right, var(--accent) var(--p, 0%), var(--line) var(--p, 0%)); }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
    width: 11px; height: 11px; margin-top: -4px; border-radius: 999px; background: var(--raised);
    border: 1.5px solid var(--accent); box-shadow: 0 1px 3px rgb(0 0 0 / 18%); }
  input[type=range]::-moz-range-track { height: 3px; border-radius: 999px; background: var(--line); }
  input[type=range]::-moz-range-progress { height: 3px; border-radius: 999px; background: var(--accent); }
  input[type=range]::-moz-range-thumb { width: 11px; height: 11px; border-radius: 999px;
    background: var(--raised); border: 1.5px solid var(--accent); }
  output { color: var(--muted); font-variant-numeric: tabular-nums; min-width: 5ch; text-align: right; font-size: 11.5px; }
  h2 { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0 0 6px; }
  ul { list-style: none; margin: 0 0 14px; padding: 0; max-height: 190px; overflow: auto; }
  li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; }
  li span:last-child { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  a { display: block; color: inherit; padding: 2px 0; }
</style>
<div class="wrap">
  <main>
    <div class="stage" id="stage">
      <img id="f" alt="Turntable frame" draggable="false" />
      <span class="hint" id="hint" title="Drag to rotate" aria-hidden="true"><svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="3.1"/><path d="M14.6 8a6.6 6.6 0 1 1-2.1-4.85"/><path d="M12.1 1.4l.4 1.75 1.75-.4"/></svg></span>
    </div>
    <div class="bar">
      <button id="play" class="play" type="button" aria-label="Play"></button>
      <input id="s" type="range" min="0" value="0" aria-label="Turntable frame" />
      <output id="c"></output>
    </div>
  </main>
  <aside>
    <h2>Parts</h2><ul id="parts"></ul>
    <h2>Assets</h2><div id="assets"></div>
  </aside>
</div>
<script>
const D = ${payload};
const img = document.getElementById('f'), s = document.getElementById('s'),
      c = document.getElementById('c'), play = document.getElementById('play'),
      stage = document.getElementById('stage'), hint = document.getElementById('hint');
const PLAY_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M4.6 2.9l8.2 5.1-8.2 5.1z"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><rect x="3.6" y="2.8" width="3.1" height="10.4" rx="1.1"/><rect x="9.3" y="2.8" width="3.1" height="10.4" rx="1.1"/></svg>';
s.max = String(Math.max(0, D.frames.length - 1));
for (const src of D.frames) new Image().src = src;
let timer = null;
function show(i) {
  if (!D.frames.length) return;
  const n = ((i % D.frames.length) + D.frames.length) % D.frames.length;
  s.value = String(n); img.src = D.frames[n]; c.textContent = (n + 1) + '/' + D.frames.length;
  const pct = D.frames.length > 1 ? (n / (D.frames.length - 1)) * 100 : 0;
  s.style.setProperty('--p', pct + '%');
}
function setPlayIcon() {
  play.innerHTML = timer !== null ? STOP_ICON : PLAY_ICON;
  play.setAttribute('aria-label', timer !== null ? 'Stop' : 'Play');
}
function stop() { if (timer !== null) { clearInterval(timer); timer = null; setPlayIcon(); } }
function start() {
  if (timer !== null || D.frames.length < 2) return;
  timer = setInterval(() => show(Number(s.value) + 1), 110);
  setPlayIcon();
  hint.classList.add('off');
}
play.addEventListener('click', () => { if (timer !== null) stop(); else start(); });
s.addEventListener('input', () => { stop(); show(Number(s.value)); });
/* Drag over the picture scrubs the orbit — the same gesture the host's
   native player answers with. The slider stays as the precise control. */
let drag = null;
stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || D.frames.length < 2) return;
  const per = Math.max(10, (stage.clientWidth * 0.65) / D.frames.length);
  drag = { id: e.pointerId, x: e.clientX, at: Number(s.value), per: per };
  stage.setPointerCapture(e.pointerId);
  stage.classList.add('drag');
  stop();
});
stage.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const steps = Math.round((e.clientX - drag.x) / drag.per);
  if (steps !== 0) hint.classList.add('off');
  show(drag.at + steps);
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  stage.classList.remove('drag');
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
show(0);
setPlayIcon();
/* A single still cannot rotate: no grab affordance, no orbit hint. */
if (D.frames.length < 2) { hint.classList.add('off'); stage.style.cursor = 'default'; }
/* An animation's frames sample the clip, so the honest default is motion. */
if (D.assetKind === 'animation') start();
const parts = document.getElementById('parts');
for (const p of D.partTree) {
  const li = document.createElement('li');
  const a = document.createElement('span'); a.textContent = p.name;
  const b = document.createElement('span');
  b.textContent = p.mesh ? p.mesh.verts + 'v/' + p.mesh.faces + 'f' : String(p.type).toLowerCase();
  li.append(a, b); parts.appendChild(li);
}
const assets = document.getElementById('assets');
for (const a of D.exportedAssets) {
  const link = document.createElement('a');
  link.href = a; link.textContent = a; assets.appendChild(link);
}
</script>
`;
}

export function isRequestWritable(request: CompileRequest): boolean {
  try {
    fs.accessSync(request.projectDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}