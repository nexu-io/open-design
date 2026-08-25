// Presentation rules for compiled scene3d deliverables.
//
// The compiler emits paths; a user reads formats. `out/scene.usdc` and
// `out/scene.usda` are one line in an export menu ("OpenUSD"), eight
// turntable PNGs are one line ("Proof frames"), and a `.mtl` is not a
// deliverable at all — it is a file the `.obj` needs. Encoding that here
// keeps the panel declarative and makes the rules testable without a DOM.
//
// Pure module: no React, no fetch, no DOM. Everything is derived from the
// scene manifest and the artifact refs the compile already returned.

import {
  buildScene3dAssetUrl,
  type Scene3dArtifactRef,
  type Scene3dAssetKind,
  type Scene3dManifest,
} from '@open-design/contracts';
import type { ArtifactManifest } from '../artifacts/types';
import type { Dict } from '../i18n/types';

/** Export-menu groupings. One entry per thing a user would ask for. */
export type Scene3dDeliverableFormat = 'glb' | 'usd' | 'obj' | 'minecraft' | 'image' | 'other';

export interface Scene3dDeliverable {
  ref: Scene3dArtifactRef;
  format: Scene3dDeliverableFormat;
  /** Lowercase extension without the dot, e.g. `usdc`. */
  ext: string;
  /** Filename only — the path is context the menu does not need. */
  fileName: string;
}

export interface Scene3dDeliverableGroup {
  format: Scene3dDeliverableFormat;
  labelKey: keyof Dict;
  items: Scene3dDeliverable[];
}

/**
 * Sidecar files that exist only to support another deliverable. Offering an
 * `.mtl` on its own produces a download that cannot be opened, so it is
 * carried by the `.obj` rather than listed beside it.
 */
const COMPANION_EXTENSIONS = new Set(['mtl', 'bin']);

/**
 * Which deliverable each companion belongs to.
 *
 * A per-format archive has to carry the companions of THAT format and no
 * others: a GLB bundle has no use for an `.mtl`, and an OBJ bundle without
 * one ships geometry with no materials.
 */
const COMPANION_CARRIER: Record<string, string> = { mtl: 'obj', bin: 'gltf' };

const FORMAT_BY_EXTENSION: Record<string, Scene3dDeliverableFormat> = {
  glb: 'glb',
  gltf: 'glb',
  usda: 'usd',
  usdc: 'usd',
  usdz: 'usd',
  usd: 'usd',
  obj: 'obj',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  exr: 'image',
};

/** Menu order: the game-ready model first when there is one, then the
 *  containers you hand to an engine, then the pictures. The minecraft group is
 *  empty (and skipped) for every non-Minecraft compile. */
const FORMAT_ORDER: Scene3dDeliverableFormat[] = ['minecraft', 'glb', 'usd', 'obj', 'image', 'other'];

const FORMAT_LABEL_KEY: Record<Scene3dDeliverableFormat, keyof Dict> = {
  glb: 'scene3d.formatGlb',
  usd: 'scene3d.formatUsd',
  obj: 'scene3d.formatObj',
  minecraft: 'scene3d.formatMinecraft',
  image: 'scene3d.formatImage',
  other: 'scene3d.formatOther',
};

/**
 * The Minecraft block-model deliverable and its textures live under an
 * `out/minecraft/` directory. Grouped by that path rather than by extension,
 * so the `model.json` and its `.png` textures present as one export (and the
 * textures never scatter into the generic image list).
 */
function isMinecraftDeliverable(path: string): boolean {
  return /(^|\/)minecraft\//.test(path);
}

export function extensionOf(pathOrName: string): string {
  const name = pathOrName.split('/').pop() ?? pathOrName;
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function fileNameOf(pathOrName: string): string {
  return pathOrName.split('/').pop() ?? pathOrName;
}

/**
 * Turn compile output into the list an export menu should show: companions
 * dropped, formats resolved, order stable regardless of what the filesystem
 * happened to return.
 */
export function groupDeliverables(
  refs: readonly Scene3dArtifactRef[],
): Scene3dDeliverableGroup[] {
  const byFormat = new Map<Scene3dDeliverableFormat, Scene3dDeliverable[]>();
  for (const ref of refs) {
    const ext = extensionOf(ref.path);
    if (COMPANION_EXTENSIONS.has(ext)) continue;
    const format = isMinecraftDeliverable(ref.path) ? 'minecraft' : (FORMAT_BY_EXTENSION[ext] ?? 'other');
    const items = byFormat.get(format) ?? [];
    items.push({ ref, format, ext, fileName: fileNameOf(ref.path) });
    byFormat.set(format, items);
  }
  return FORMAT_ORDER.flatMap((format) => {
    const items = byFormat.get(format);
    if (!items || items.length === 0) return [];
    return [{ format, labelKey: FORMAT_LABEL_KEY[format], items }];
  });
}

const ASSET_KIND_LABEL_KEY: Record<Scene3dAssetKind, keyof Dict> = {
  scene: 'scene3d.kindScene',
  prop: 'scene3d.kindProp',
  kit: 'scene3d.kindKit',
  animation: 'scene3d.kindAnimation',
  sprite: 'scene3d.kindSprite',
  flipbook: 'scene3d.kindFlipbook',
  vfx: 'scene3d.kindVfx',
  skybox: 'scene3d.kindSkybox',
  texture: 'scene3d.kindTexture',
};

export function assetKindLabelKey(kind: Scene3dAssetKind): keyof Dict {
  return ASSET_KIND_LABEL_KEY[kind] ?? 'scene3d.kindScene';
}

/**
 * The asset kind for a manifest that predates the field.
 *
 * Mirrors `deriveAssetKind` in `packages/scene3d/src/manifest.ts` for the
 * facts a wire manifest still carries. Sheets are a contract concern and are
 * not on the wire, so sheet-derived kinds cannot be recovered here — those
 * manifests read as `texture` when they have no geometry, which is the
 * honest answer rather than a guessed one.
 */
export function resolveAssetKind(manifest: Scene3dManifest | null): Scene3dAssetKind {
  if (!manifest) return 'scene';
  if (manifest.assetKind) return manifest.assetKind;
  const meshes = manifest.partTree.filter((part) => part.mesh !== null);
  if (meshes.length === 0) return manifest.textures.length > 0 ? 'texture' : 'scene';
  if (manifest.animation.keyframedObjects.length > 0) return 'animation';
  // Staging exclusions MUST match STAGING_TYPES in
  // packages/scene3d/src/manifest.ts (deriveAssetKind) exactly — this
  // fallback only runs for manifests written before `assetKind` existed,
  // and a divergent copy mislabels exactly those.
  const geometryRoots = manifest.partTree.filter(
    (part) =>
      part.parent === null &&
      part.type !== 'CAMERA' &&
      part.type !== 'LIGHT' &&
      part.type !== 'SPEAKER',
  );
  if (geometryRoots.length === 1 && !manifest.camera.present) return 'prop';
  return 'scene';
}

/**
 * The scene a compiled artifact belongs to, as recorded by the compiler.
 *
 * Preferred over inferring one from the file path: the compiler knows which
 * scene it just built, and a path heuristic has to guess at directory
 * conventions it does not own.
 */
export function scenePathFromArtifactManifest(
  manifest: ArtifactManifest | null | undefined,
): string | null {
  const raw = manifest?.metadata?.['scenePath'];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Total triangles across a compile, or null when no census ran. */
export function totalTriangles(manifest: Scene3dManifest | null): number | null {
  return manifest?.metrics?.totalTriangles ?? null;
}

/* ------------------------------------------------------------------ */
/* Kits — many compiled scenes, read from the artifact sidecar alone.  */
/* ------------------------------------------------------------------ */

export interface Scene3dKitScene {
  name: string;
  scenePath: string;
  assetKind: Scene3dAssetKind;
  parts: number;
  triangles: number | null;
  errors: number;
  warnings: number;
}

export interface Scene3dKit {
  scenes: Scene3dKitScene[];
  /** The compiler had more scenes than the sidecar's cap could carry. */
  scenesTruncated: boolean;
  /** Project-relative deliverable paths across every listed scene. */
  deliverables: string[];
  deliverablesTruncated: boolean;
  parts: number;
  triangles: number;
  errors: number;
  warnings: number;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * Read a kit out of its artifact sidecar, or null when the manifest is not
 * one.
 *
 * A kit is the one compiled asset with no manifest of its own to fetch — it
 * is a view over scenes, not a scene — so the sidecar carries everything and
 * this is the only hydration step. Defensive throughout: the sidecar is a
 * file on disk that a person can edit, and a malformed one should degrade to
 * "not a kit" rather than crash the viewer.
 */
export function kitFromArtifactManifest(
  manifest: ArtifactManifest | null | undefined,
): Scene3dKit | null {
  const metadata = manifest?.metadata;
  if (!metadata || metadata['assetKind'] !== 'kit') return null;
  const rawScenes = Array.isArray(metadata['scenes']) ? metadata['scenes'] : [];
  const scenes: Scene3dKitScene[] = [];
  for (const entry of rawScenes) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const scenePath = record['scenePath'];
    if (typeof scenePath !== 'string' || scenePath.length === 0) continue;
    scenes.push({
      name: typeof record['name'] === 'string' ? record['name'] : scenePath,
      scenePath,
      assetKind: (record['assetKind'] as Scene3dAssetKind) ?? 'scene',
      parts: asNumber(record['parts']),
      triangles: typeof record['triangles'] === 'number' ? record['triangles'] : null,
      errors: asNumber(record['errors']),
      warnings: asNumber(record['warnings']),
    });
  }
  return {
    scenes,
    scenesTruncated: metadata['scenesTruncated'] === true,
    deliverables: asStringArray(metadata['deliverables']),
    deliverablesTruncated: metadata['deliverablesTruncated'] === true,
    parts: asNumber(metadata['parts']),
    triangles: asNumber(metadata['triangles']),
    errors: asNumber(metadata['errors']),
    warnings: asNumber(metadata['warnings']),
  };
}

/** Deliverable paths as renderable refs, using the shared URL shape. */
export function deliverableRefs(
  projectId: string,
  paths: readonly string[],
): Scene3dArtifactRef[] {
  return paths.map((path) => ({ path, url: buildScene3dAssetUrl(projectId, path) }));
}

/* ------------------------------------------------------------------ */
/* Model rows — deliverables presented the way a person thinks.        */
/* ------------------------------------------------------------------ */

/**
 * Rank for ordering format links inside one scene's row. Engine containers
 * first (GLB is the web-native answer), the OpenUSD family together, then
 * interchange formats, pictures last.
 */
const EXT_RANK: Record<string, number> = {
  glb: 0,
  gltf: 1,
  usda: 2,
  usdc: 3,
  usdz: 4,
  obj: 5,
  fbx: 6,
  png: 90,
  jpg: 91,
  jpeg: 92,
  webp: 93,
  exr: 94,
};

export interface Scene3dModelItem {
  ref: Scene3dArtifactRef;
  /**
   * Present when this chip is an ARCHIVE rather than a single file — the
   * bulk row's per-format chips, where "every scene as GLB" cannot arrive as
   * one mesh. A direct link is used when this is absent, because the bytes
   * already exist on disk and fetching them to re-emit would be theatre.
   */
  archive?: Scene3dArchiveFile[];
  /** Lowercase extension — also the visible chip text, uppercased. */
  ext: string;
  /**
   * Filename the browser saves as: `<scene>.<ext>`. Every scene's compiler
   * output is literally named `scene.glb`, so without the rename a kit's
   * downloads all collide as `scene.glb`, `scene (1).glb`, …
   */
  downloadName: string;
}

export interface Scene3dModelRow {
  /** Scene name — the identity a filename alone cannot carry. */
  label: string;
  items: Scene3dModelItem[];
  /**
   * Everything this scene produced, for the row's "all formats" chip.
   *
   * Distinct from `items` in two ways that matter. It KEEPS the companions —
   * an `.mtl` or a `.bin` is hidden from the format list because either one
   * alone is a download nobody can open, but an archive that drops them
   * ships an OBJ with no materials and a glTF with no buffer. And it is
   * per-row, so the chip means "this asset in every format" rather than
   * "the whole project", which is what someone reading one row is asking
   * for.
   */
  archive: Scene3dArchiveFile[];
  /** Filename for that archive. */
  archiveName: string;
  /** True for the gathered "every scene" row, which is not itself a scene. */
  bulk?: boolean;
}

/** One file destined for an archive: where to fetch it, what to call it. */
export interface Scene3dArchiveFile {
  url: string;
  zipPath: string;
}

function sceneKeyOf(path: string): string {
  // Deliverables live under `<scenePath>/out/…`; the prefix IS the scene.
  const index = path.indexOf('/out/');
  return index === -1 ? '.' : path.slice(0, index);
}

function lastSegment(path: string): string {
  const segments = path.split('/').filter((segment) => segment && segment !== '.');
  return segments[segments.length - 1] ?? '';
}

function safeDownloadStem(label: string): string {
  const stem = label.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  return stem || 'asset';
}

/**
 * Deliverables grouped BY SCENE, one row each — the presentation both
 * export menus share.
 *
 * A format-grouped list reads fine for one scene and collapses into
 * nonsense for a kit: four rows all named `scene.glb` with nothing saying
 * which scene each belongs to. People reach for "the crate as GLB", so the
 * scene is the row and the formats are the row's links.
 *
 * Scene names come from the sidecar's `metadata.scenes` when the compiler
 * recorded them; anything unattributed falls back to the directory name,
 * so a malformed sidecar degrades to honest-but-plain labels rather than
 * dropping files.
 */
export function modelRowsFromArtifactManifest(
  projectId: string,
  manifest: ArtifactManifest | null | undefined,
  /** Label for the gathered row; the caller owns the translation. */
  allLabel = 'All scenes',
): Scene3dModelRow[] {
  const metadata = manifest?.metadata;
  if (!metadata) return [];
  const raw = metadata['deliverables'];
  if (!Array.isArray(raw)) return [];
  const paths = raw.filter((item): item is string => typeof item === 'string');

  const labelByScene = new Map<string, string>();
  if (Array.isArray(metadata['scenes'])) {
    for (const entry of metadata['scenes']) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const record = entry as Record<string, unknown>;
      if (typeof record['scenePath'] === 'string' && typeof record['name'] === 'string') {
        labelByScene.set(record['scenePath'], record['name']);
      }
    }
  }
  // Single-scene sidecars carry `scenePath` + a title instead of a list.
  const soloScenePath = typeof metadata['scenePath'] === 'string' ? metadata['scenePath'] : null;
  const soloLabel = lastSegment(soloScenePath ?? '') || manifest?.title || 'Scene';

  const rows = new Map<string, Scene3dModelRow>();
  const labelFor = (sceneKey: string): string =>
    labelByScene.get(sceneKey)
    ?? (sceneKey === (soloScenePath ?? '.') ? soloLabel : lastSegment(sceneKey) || soloLabel);
  const rowFor = (sceneKey: string): Scene3dModelRow => {
    const existing = rows.get(sceneKey);
    if (existing) return existing;
    const label = labelFor(sceneKey);
    const created: Scene3dModelRow = {
      label,
      items: [],
      archive: [],
      archiveName: `${safeDownloadStem(label)}.zip`,
    };
    rows.set(sceneKey, created);
    return created;
  };

  for (const path of paths) {
    const ext = extensionOf(path);
    const sceneKey = sceneKeyOf(path);
    const row = rowFor(sceneKey);
    /* Every file goes into the archive, companions included; only the
       openable ones become chips. One pass, so the two can never disagree
       about which scene a file belongs to. */
    row.archive.push({
      url: buildScene3dAssetUrl(projectId, path),
      // Flat inside the archive: one scene's files, already grouped by being
      // in their own zip, and an `.obj` finds its `.mtl` by relative name so
      // the two must sit in the same directory.
      zipPath: path.split('/').filter(Boolean).pop() ?? path,
    });
    if (COMPANION_EXTENSIONS.has(ext)) continue;
    row.items.push({
      ref: { path, url: buildScene3dAssetUrl(projectId, path) },
      ext,
      downloadName: `${safeDownloadStem(row.label)}.${ext}`,
    });
  }

  const ordered = [...rows.values()];
  for (const row of ordered) {
    row.items.sort((a, b) => (EXT_RANK[a.ext] ?? 50) - (EXT_RANK[b.ext] ?? 50));
    row.archive.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
  }
  ordered.sort((a, b) => a.label.localeCompare(b.label));
  if (ordered.length > 1) ordered.push(bulkRow(ordered, allLabel));
  return ordered;
}

/**
 * A final row that gathers every scene, one chip per format.
 *
 * A kit's whole point is that the scenes belong together, so "give me the
 * set as GLB" is a real request and clicking twelve individual GLB links is
 * not an answer to it. Each chip is still a FORMAT — the thing being
 * downloaded has to be nameable, and a chip labelled "all" tells you a
 * quantity while saying nothing about what you are about to open.
 *
 * Every chip here is an archive, because N scenes cannot arrive as one
 * mesh file. Scenes are foldered inside it: a compiler names every scene's
 * output `scene.glb`, so a flat archive of a kit is a collision, and an
 * `.obj` finds its `.mtl` by relative name so the pair has to stay together.
 */
function bulkRow(rows: readonly Scene3dModelRow[], label: string): Scene3dModelRow {
  const byExt = new Map<string, Scene3dArchiveFile[]>();
  const everything: Scene3dArchiveFile[] = [];
  for (const row of rows) {
    const folder = safeDownloadStem(row.label);
    for (const file of row.archive) {
      const scoped = { url: file.url, zipPath: `${folder}/${file.zipPath}` };
      everything.push(scoped);
      const ext = extensionOf(file.zipPath);
      /* Companions ride with the format they serve, not as a bundle of their
         own: a GLB archive has no use for an `.mtl`, and an OBJ archive is
         broken without one. */
      const carrier = COMPANION_CARRIER[ext];
      if (carrier) {
        (byExt.get(carrier) ?? byExt.set(carrier, []).get(carrier)!).push(scoped);
        continue;
      }
      (byExt.get(ext) ?? byExt.set(ext, []).get(ext)!).push(scoped);
    }
  }
  const items: Scene3dModelItem[] = [...byExt.entries()]
    .filter(([, files]) => files.length > 0)
    .map(([ext, files]) => ({
      ref: { path: `bulk.${ext}`, url: '' },
      ext,
      downloadName: `${safeDownloadStem(label)}-${ext}.zip`,
      archive: files,
    }))
    .sort((a, b) => (EXT_RANK[a.ext] ?? 50) - (EXT_RANK[b.ext] ?? 50));
  everything.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
  return { label, items, archive: everything, archiveName: `${safeDownloadStem(label)}.zip`, bulk: true };
}

/** The same row shape for a live compile result (the scene panel). */
export function modelRowFromRefs(
  label: string,
  refs: readonly Scene3dArtifactRef[],
): Scene3dModelRow | null {
  const items = refs
    .filter((ref) => !COMPANION_EXTENSIONS.has(extensionOf(ref.path)))
    .map((ref) => ({
      ref,
      ext: extensionOf(ref.path),
      downloadName: `${safeDownloadStem(label)}.${extensionOf(ref.path)}`,
    }))
    .sort((a, b) => (EXT_RANK[a.ext] ?? 50) - (EXT_RANK[b.ext] ?? 50));
  if (items.length === 0) return null;
  return {
    label,
    items,
    archive: refs.map((ref) => ({
      url: ref.url,
      zipPath: ref.path.split('/').filter(Boolean).pop() ?? ref.path,
    })),
    archiveName: `${safeDownloadStem(label)}.zip`,
  };
}


/* ------------------------------------------------------------------ */
/* Proof-frame viewport transform                                      */
/* ------------------------------------------------------------------ */

/*
 * The frame player's screen-space pipeline, written the way the kit
 * runtime writes its own (worldToScreen): one definition each way, shared
 * by the selection reticle and click-picking, so the two can never
 * disagree about where a part is on the picture.
 *
 * Model → NDC happened at RENDER time: the runner projects every part's
 * world points through Blender's own camera (`world_to_camera_view`) and
 * ships the normalized rects in `manifest.proofRects` — ground truth from
 * the same transform that produced the pixels, which no re-implemented
 * camera can drift from. What remains web-side is the viewport transform:
 * frame-normalized coordinates ⇄ CSS pixels inside the stage, where the
 * square frame sits letterboxed by object-fit: contain.
 */

/** Part name → normalized [x0, y0, x1, y1], y down. One record per frame. */
export type Scene3dProofRect = [number, number, number, number];

/** Where the (square) proof frame actually renders inside the stage box. */
export interface Scene3dProofViewport {
  left: number;
  top: number;
  size: number;
}

/** object-fit: contain of a square image inside a stage of the given size. */
export function proofViewport(stageWidth: number, stageHeight: number): Scene3dProofViewport {
  const size = Math.max(0, Math.min(stageWidth, stageHeight));
  return { left: (stageWidth - size) / 2, top: (stageHeight - size) / 2, size };
}

/** Frame-normalized rect → CSS pixels within the stage. */
export function proofRectToStage(
  rect: Scene3dProofRect,
  viewport: Scene3dProofViewport,
): { left: number; top: number; width: number; height: number } {
  return {
    left: viewport.left + rect[0] * viewport.size,
    top: viewport.top + rect[1] * viewport.size,
    width: (rect[2] - rect[0]) * viewport.size,
    height: (rect[3] - rect[1]) * viewport.size,
  };
}

/**
 * The part under a stage-space point, or null.
 *
 * Inverse of proofRectToStage: the point is normalized into the frame,
 * then tested against every part's rect. Where rects nest or overlap the
 * SMALLEST containing rect wins — the specific part over the hull that
 * surrounds it, which is what a pointer means. A hairline slack keeps
 * one-pixel parts pickable at all.
 */
export function pickProofPart(
  rects: Record<string, Scene3dProofRect> | undefined,
  viewport: Scene3dProofViewport,
  stageX: number,
  stageY: number,
): string | null {
  if (!rects || viewport.size <= 0) return null;
  const u = (stageX - viewport.left) / viewport.size;
  const v = (stageY - viewport.top) / viewport.size;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const slack = 2 / viewport.size; // ~2 CSS px, in frame units
  let best: string | null = null;
  let bestArea = Infinity;
  for (const [name, rect] of Object.entries(rects)) {
    if (u < rect[0] - slack || u > rect[2] + slack) continue;
    if (v < rect[1] - slack || v > rect[3] + slack) continue;
    const area = (rect[2] - rect[0]) * (rect[3] - rect[1]);
    if (area < bestArea) {
      bestArea = area;
      best = name;
    }
  }
  return best;
}
