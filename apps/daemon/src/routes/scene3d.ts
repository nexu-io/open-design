import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Express } from 'express';
import type {
  Scene3dArtifactRef,
  Scene3dCompileRequest,
  Scene3dCompileResponse,
  Scene3dManifest,
  Scene3dManifestResponse,
  Scene3dProofOptions,
  Scene3dStageId,
} from '@open-design/contracts';
import { buildScene3dAssetUrl, scene3dIssueTitle } from '@open-design/contracts';
import { compile, renderAgentReport, probeBlender, writeProjectKit } from '@open-design/scene3d';
import type { RouteDeps } from '../server-context.js';
import type { AuthorizeProjectRequest } from '../collab/project-request-authority.js';

export interface RegisterScene3dRoutesDeps
  extends RouteDeps<'db' | 'http' | 'paths' | 'projectStore' | 'validation'> {
  authorizeProjectRequest: AuthorizeProjectRequest;
}

const STAGE_IDS: readonly Scene3dStageId[] = [
  'parse',
  'build',
  'lint',
  'proof',
  'export',
  'manifest',
];

/**
 * The whole scene-compile pipeline is one call, and one call is one Blender
 * process tree writing into one scene directory. Two concurrent
 * compiles of the same scene would race on the stage cache and the proof
 * PNGs, so a second request is refused with 409 rather than silently
 * producing a half-overwritten render set.
 */
const inFlight = new Set<string>();

/** Ceiling on a single compile so a pathological scene cannot pin a worker. */
const MAX_TIMEOUT_MS = 600_000;

/**
 * Error text as sent to the client: absolute host paths stripped. An fs
 * error's message embeds the full path it failed on, and a 500 body that
 * carries it hands every caller the daemon's directory layout. The full
 * error still reaches the server log at each call site.
 */
function redactedMessage(err: unknown): string {
  const msg = String((err as { message?: unknown })?.message || err);
  return msg.replace(/[A-Za-z]:[\\/][^\s'"`)]+|\/(?:Users|home|tmp|var|opt)\/[^\s'"`)]+/g, '<path>');
}

/**
 * `POST /api/projects/:id/scene3d/compile` — compile a 3D scene project the
 * way a build tool compiles code: parse, build through headless Blender,
 * lint deterministically, render proof frames, export USD/GLB, and emit a
 * manifest. One request, one structured report, stable issue codes.
 *
 * The route deliberately returns 200 with `ok:false` for a scene that fails
 * its own lint gate — a failing compile is a successful API call, and the
 * agent reads the verdict from `ok` and `issues`, not from HTTP status.
 * Non-200 is reserved for the request being wrong (bad project, bad scene
 * path, concurrent compile), which is the same split `cargo` makes between
 * "your code has errors" and "I could not run".
 *
 * `GET /api/projects/:id/scene3d/manifest` reads the last compile's manifest
 * without spending a Blender run, so the viewer can hydrate on open.
 */
export function registerScene3dRoutes(app: Express, ctx: RegisterScene3dRoutesDeps) {
  const { db } = ctx;
  const { sendApiError } = ctx.http;
  const { PROJECTS_DIR } = ctx.paths;
  const { getProject } = ctx.projectStore;
  const { isSafeId } = ctx.validation;
  const { authorizeProjectRequest } = ctx;

  app.post('/api/projects/:id/scene3d/compile', async (req, res) => {
    const body: Scene3dCompileRequest = req.body || {};
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      // Compiling writes `out/` and `.scene3d/` into the project, so it needs the same
      // capability as any other file-producing route.
      if (
        !(await authorizeProjectRequest(req, res, project.id, {
          mode: 'write',
          capability: 'writeFiles',
        }))
      ) {
        return;
      }

      const stages = parseStages(body.stages);
      if (stages === null) {
        return sendApiError(res, 400, 'BAD_REQUEST', `stages must be a subset of ${STAGE_IDS.join(', ')}`);
      }
      const proof = parseProof(body.proof);
      if (proof === null) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid proof options');
      }

      let sceneDir: string;
      let scenePath: string;
      try {
        const resolved = resolveSceneDir(PROJECTS_DIR, project, body.scenePath);
        sceneDir = resolved.absolute;
        scenePath = resolved.relative;
      } catch (err: any) {
        return sendApiError(res, 400, 'BAD_REQUEST', err?.message || 'invalid scenePath');
      }
      if (!fs.existsSync(sceneDir)) {
        return sendApiError(res, 404, 'SCENE_NOT_FOUND', `scene directory not found: ${scenePath}`);
      }

      if (inFlight.has(sceneDir)) {
        // The refusal tells the caller what to DO, not just what happened: a
        // blind agent that only hears "conflict" forks the scene directory
        // to route around it, which is worse than the race the 409 prevents.
        return sendApiError(
          res,
          409,
          'CONFLICT',
          'a compile is already running for this scene — wait for it and retry; its finished stages will come back cached, so nothing is wasted',
        );
      }
      inFlight.add(sceneDir);
      let result;
      try {
        // `exactOptionalPropertyTypes` is on: an omitted option and an
        // option explicitly set to `undefined` are different types, so the
        // optional fields are spread in only when the caller sent them.
        result = await compile({
          projectDir: sceneDir,
          scenePath,
          noCache: body.noCache === true,
          timeoutMs: MAX_TIMEOUT_MS,
          ...(stages ? { stages } : {}),
          ...(proof ? { proof } : {}),
        });
      } finally {
        inFlight.delete(sceneDir);
      }

      // Refresh the project-wide kit after every compile so the catalogue of
      // everything built in this project stays current without the caller
      // having to ask for it. Best-effort: a kit that failed to write must
      // never fail the compile that produced the asset.
      try {
        // Bake in the API root: the page may be rendered through an
        // iframe's srcDoc, where it cannot read its own URL and would
        // silently have nowhere to save edits back to.
        writeProjectKit(
          projectRootFor(PROJECTS_DIR, project),
          project.name || 'Asset kit',
          `/api/projects/${project.id}`,
          scene3dIssueTitle,
        );
      } catch (err) {
        console.warn('[scene3d] project kit refresh failed', err);
      }

      const probe = await probeBlender({});
      const response: Scene3dCompileResponse = {
        ok: result.ok,
        scenePath,
        source: result.source,
        stages: result.stages,
        issues: result.issues,
        summary: result.summary,
        manifest: result.manifest as Scene3dManifest,
        proofImages: result.proofImages.map((p) => artifactRef(project.id, scenePath, p)),
        exportedAssets: result.exportedAssets.map((p) => artifactRef(project.id, scenePath, p)),
        ...(result.materialBalls.length > 0
          ? { materialBalls: result.materialBalls.map((p) => artifactRef(project.id, scenePath, p)) }
          : {}),
        blender: { available: probe !== null, version: probe?.version ?? null },
        // The solver's own output: the parse loop's placement eyes.
        ...(result.solved ? { solved: result.solved } : {}),
        // The scene dir lets the report render its proof frames as text.
        // A model on this route may have no image input at all, so a
        // verdict about what a frame looks like is otherwise a verdict
        // about evidence the reader cannot reach.
        agentMessage: renderAgentReport(result, {
          projectDir: sceneDir,
          // "Show me the frames anyway" — the text reader's open-the-PNG.
          alwaysShowFrames: body.frames === true,
          // The titles live in contracts; the compiler package cannot
          // depend on it, so the catalog is injected at the seam.
          issueTitle: (code: string) => scene3dIssueTitle(code) ?? undefined,
        }),
      };
      res.json(response);
    } catch (err: any) {
      console.error('[scene3d]', err);
      return sendApiError(res, 500, 'INTERNAL_ERROR', redactedMessage(err));
    }
  });

  /**
   * `POST /api/projects/:id/scene3d/tweaks` — persist direct-manipulation
   * edits from the kit viewer.
   *
   * The viewer records world-space translate deltas per part; this writes
   * them to `tweaks.json` in the scene directory, where the compiler
   * replays them after the build script on every subsequent compile. The
   * file is plain source: the user can read it, the agent can read it and
   * fold it back into build.py, and deleting it is the undo. An empty
   * tweaks object deletes the file rather than leaving `{}` litter.
   */
  app.post('/api/projects/:id/scene3d/tweaks', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (
        !(await authorizeProjectRequest(req, res, project.id, {
          mode: 'write',
          capability: 'writeFiles',
        }))
      ) {
        return;
      }

      const body = req.body || {};
      let sceneDir: string;
      try {
        sceneDir = resolveSceneDir(PROJECTS_DIR, project, body.scenePath).absolute;
      } catch (err: any) {
        return sendApiError(res, 400, 'BAD_REQUEST', err?.message || 'invalid scenePath');
      }
      if (!fs.existsSync(sceneDir)) {
        return sendApiError(res, 404, 'SCENE_NOT_FOUND', 'scene directory not found');
      }

      const tweaks = sanitizeTweaks(body.tweaks);
      if (tweaks === null) {
        return sendApiError(
          res,
          400,
          'BAD_REQUEST',
          'tweaks must map part names to {translate|quat|scale|material} channels',
        );
      }

      const file = path.join(sceneDir, 'tweaks.json');

      /*
       * `merge` makes this the ONLY request a save has to get right.
       *
       * The viewer used to have to read the file first so it could send the
       * whole truth, because this route overwrites. That made a save
       * depend on a GET succeeding, and when the GET could not reach the
       * daemon from wherever the host had mounted the page, saving was
       * simply impossible — the write was never even attempted.
       *
       * The daemon owns this file, so the daemon composes it. The client
       * sends only what it changed, and cannot destroy what it never saw.
       */
      if (body.merge === true) {
        const existing = readTweaksFile(file);
        const merged = mergeTweaks(existing, tweaks);
        if (Object.keys(merged).length === 0) {
          try {
            fs.rmSync(file, { force: true });
          } catch {
            /* already gone */
          }
          return res.json({ ok: true, cleared: true });
        }
        fs.writeFileSync(file, JSON.stringify(merged, null, 2));
        return res.json({ ok: true, parts: Object.keys(merged).length, merged: true });
      }

      if (Object.keys(tweaks).length === 0) {
        try {
          fs.rmSync(file, { force: true });
        } catch {
          /* already gone */
        }
        return res.json({ ok: true, cleared: true });
      }
      fs.writeFileSync(file, JSON.stringify(tweaks, null, 2));
      res.json({ ok: true, parts: Object.keys(tweaks).length });
    } catch (err: any) {
      console.error('[scene3d]', err);
      return sendApiError(res, 500, 'INTERNAL_ERROR', redactedMessage(err));
    }
  });

  /*
   * Read the tweaks currently on disk.
   *
   * The viewer needs this before it can save safely. A tweak that was saved
   * in an earlier session is already baked into the GLB the browser loads,
   * so the page cannot recover it by inspecting geometry — without reading
   * the file, a save would write only the current session's deltas and
   * silently drop every earlier one.
   */
  app.get('/api/projects/:id/scene3d/tweaks', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!(await authorizeProjectRequest(req, res, project.id, { mode: 'read' }))) return;

      let sceneDir: string;
      try {
        sceneDir = resolveSceneDir(PROJECTS_DIR, project, req.query.scenePath as string | undefined)
          .absolute;
      } catch (err: any) {
        return sendApiError(res, 400, 'BAD_REQUEST', err?.message || 'invalid scenePath');
      }

      const file = path.join(sceneDir, 'tweaks.json');
      if (!fs.existsSync(file)) return res.json({ tweaks: {} });
      let parsed: unknown;
      try {
        parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        // A hand-corrupted file must not wedge the viewer; report it as
        // empty and let the next save replace it.
        return res.json({ tweaks: {}, unreadable: true });
      }
      res.json({ tweaks: sanitizeTweaks(parsed) ?? {} });
    } catch (err: any) {
      console.error('[scene3d]', err);
      return sendApiError(res, 500, 'INTERNAL_ERROR', redactedMessage(err));
    }
  });

  app.get('/api/projects/:id/scene3d/manifest', async (req, res) => {
    try {
      if (!isSafeId(req.params.id)) {
        return sendApiError(res, 400, 'BAD_REQUEST', 'invalid project id');
      }
      const project = getProject(db, req.params.id);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
      }
      if (!(await authorizeProjectRequest(req, res, project.id, { mode: 'read' }))) return;

      let sceneDir: string;
      let scenePath: string;
      try {
        const scenePathParam = typeof req.query.scenePath === 'string' ? req.query.scenePath : undefined;
        const resolved = resolveSceneDir(PROJECTS_DIR, project, scenePathParam);
        sceneDir = resolved.absolute;
        scenePath = resolved.relative;
      } catch (err: any) {
        return sendApiError(res, 400, 'BAD_REQUEST', err?.message || 'invalid scenePath');
      }

      const manifestFile = path.join(sceneDir, 'out', 'manifest.json');
      let manifest: Scene3dManifest | null = null;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Scene3dManifest;
      } catch {
        // Never compiled (or the manifest was hand-deleted) — an empty
        // manifest is the truthful answer, not a 404 on the project.
        manifest = null;
      }

      const response: Scene3dManifestResponse = {
        scenePath,
        manifest,
        proofImages: (manifest?.proofImages ?? []).map((p) => artifactRef(project.id, scenePath, p)),
        exportedAssets: (manifest?.exportedAssets ?? []).map((p) =>
          artifactRef(project.id, scenePath, p),
        ),
      };
      res.json(response);
    } catch (err: any) {
      console.error('[scene3d]', err);
      return sendApiError(res, 500, 'INTERNAL_ERROR', redactedMessage(err));
    }
  });
}

/**
 * Resolve `scenePath` against the project directory.
 *
 * A scene is a directory inside the project, so a project can hold several
 * scenes side by side. The resolved path must stay inside the project root:
 * absolute paths and `..` escapes are rejected here rather than relying on
 * the compile step to notice, because the compile writes files.
 */
export function resolveSceneDir(
  projectsRoot: string,
  project: { id: string; metadata?: unknown },
  scenePath: string | undefined,
): { absolute: string; relative: string } {
  const root = projectRootFor(projectsRoot, project);
  const raw = (scenePath ?? '').trim();
  if (raw === '' || raw === '.' || raw === './') {
    return { absolute: root, relative: '.' };
  }
  if (path.isAbsolute(raw) || /^[A-Za-z]:/.test(raw)) {
    throw new Error('scenePath must be project-relative');
  }
  const absolute = path.resolve(root, raw);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('scenePath escapes the project directory');
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}

/**
 * Imported-folder projects live at `metadata.baseDir`; managed projects live
 * under `PROJECTS_DIR/<id>` (see the daemon data directory contract).
 */
function projectRootFor(projectsRoot: string, project: { id: string; metadata?: unknown }): string {
  const baseDir = (project.metadata as { baseDir?: unknown } | undefined)?.baseDir;
  if (typeof baseDir === 'string' && baseDir.trim() !== '') return baseDir;
  return path.join(projectsRoot, project.id);
}

/**
 * Compile results are scene-relative; the file route is project-relative.
 * Joining them here means the viewer never has to know where a scene sits.
 */
export function artifactRef(
  projectId: string,
  scenePath: string,
  sceneRelativePath: string,
): Scene3dArtifactRef {
  const projectRelative =
    scenePath === '.' ? sceneRelativePath : `${scenePath}/${sceneRelativePath}`;
  return { path: projectRelative, url: buildScene3dAssetUrl(projectId, projectRelative) };
}

/**
 * Validate a viewer-supplied tweak map down to exactly the shape the
 * compiler replays: finite translate triples keyed by part name. Anything
 * else is rejected — this file is executed against geometry, so a NaN or an
 * injected key must never reach it.
 */
type Triple = [number, number, number];
export interface SanitizedTweak {
  translate?: Triple;
  /** Unit quaternion (x, y, z, w) in viewer space — the rotation channel
   *  the viewer writes and the runner replays. */
  quat?: [number, number, number, number];
  /** @deprecated Radians about each viewer axis; older viewers only. */
  rotate?: Triple;
  /** Multipliers per viewer axis; 1 is unchanged. */
  scale?: Triple;
  /**
   * The part's material as the viewer left it — ABSOLUTE state, unlike the
   * transform deltas. `assign` rebinds to an existing scene material; the
   * property keys override on top. An EMPTY object is meaningful on a merge:
   * it clears the saved material channel back to what the source authored.
   */
  material?: SanitizedMaterialTweak;
}

export interface SanitizedMaterialTweak {
  assign?: string;
  /** Linear RGB, each 0..1. */
  baseColor?: Triple;
  roughness?: number;
  metallic?: number;
  emission?: Triple;
  emissionStrength?: number;
  alpha?: number;
}

/**
 * Validate the material channel, or say why not.
 *
 * Names get the same charset gate as part names — this string reaches a
 * Python script that binds materials by name. Scalars are range-clamped
 * hard rather than trusted: a NaN roughness or a 1e30 emission strength is
 * a malformed write, not a bold artistic choice.
 */
function readMaterial(raw: unknown): SanitizedMaterialTweak | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  const out: SanitizedMaterialTweak = {};

  if (m.assign !== undefined) {
    if (typeof m.assign !== 'string' || !TWEAK_NAME_RE.test(m.assign)) return null;
    out.assign = m.assign;
  }
  const readColor = (v: unknown): Triple | null | undefined => {
    if (v === undefined) return undefined;
    if (!Array.isArray(v) || v.length !== 3) return null;
    const c = v.map(Number) as Triple;
    if (c.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) return null;
    return c;
  };
  const readScalar = (v: unknown, max: number): number | null | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) return null;
    return n;
  };

  const baseColor = readColor(m.baseColor);
  if (baseColor === null) return null;
  if (baseColor) out.baseColor = baseColor;
  const emission = readColor(m.emission);
  if (emission === null) return null;
  if (emission) out.emission = emission;
  const roughness = readScalar(m.roughness, 1);
  if (roughness === null) return null;
  if (roughness !== undefined) out.roughness = roughness;
  const metallic = readScalar(m.metallic, 1);
  if (metallic === null) return null;
  if (metallic !== undefined) out.metallic = metallic;
  // Emission strength is an open-ended energy, but a bounded one: 1000 is
  // already a small sun, and anything past it is a corrupted write.
  const emissionStrength = readScalar(m.emissionStrength, 1000);
  if (emissionStrength === null) return null;
  if (emissionStrength !== undefined) out.emissionStrength = emissionStrength;
  const alpha = readScalar(m.alpha, 1);
  if (alpha === null) return null;
  if (alpha !== undefined) out.alpha = alpha;

  return out;
}

/**
 * Read a triple, or say why not.
 *
 * `identity` is the value that means "no change" for this channel, and a
 * tweak equal to it is dropped rather than stored — otherwise every part
 * the user merely clicked would accumulate a no-op entry in tweaks.json.
 */
function readTriple(
  raw: unknown,
  limit: number,
  identity: number,
  positiveOnly = false,
): Triple | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const triple = raw.map(Number) as Triple;
  if (triple.some((v) => !Number.isFinite(v) || Math.abs(v) > limit)) return null;
  if (positiveOnly && triple.some((v) => v <= 0)) return null;
  if (triple.every((v) => v === identity)) return undefined;
  return triple;
}

/** Read tweaks.json, tolerating absence and corruption. */
export function readTweaksFile(file: string): Record<string, SanitizedTweak> {
  try {
    if (!fs.existsSync(file)) return {};
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Run it through the same validator as an incoming payload: a
    // hand-edited file must not be able to inject a shape the runner then
    // chokes on.
    return sanitizeTweaks(parsed) ?? {};
  } catch {
    return {};
  }
}

/** Quaternion product (x, y, z, w), applying `a` on top of `b`. */
function quatMul(
  a: [number, number, number, number],
  b: [number, number, number, number],
): [number, number, number, number] {
  const out: [number, number, number, number] = [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const n = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
  return [out[0] / n, out[1] / n, out[2] / n, out[3] / n];
}

/**
 * Compose incoming deltas onto what is already saved.
 *
 * Each channel by its own algebra — translation adds, rotation multiplies
 * as a quaternion, scale multiplies per axis. Treating them alike is wrong
 * in a different way for each, and an entry survives only if some channel
 * is still doing something.
 */
export function mergeTweaks(
  existing: Record<string, SanitizedTweak>,
  incoming: Record<string, SanitizedTweak>,
): Record<string, SanitizedTweak> {
  const IDENT_Q: [number, number, number, number] = [0, 0, 0, 1];
  const out: Record<string, SanitizedTweak> = {};
  for (const [name, v] of Object.entries(existing)) out[name] = { ...v };

  for (const [name, delta] of Object.entries(incoming)) {
    const base = out[name] ?? {};
    const translate: Triple = [0, 1, 2].map(
      (i) => (base.translate?.[i] ?? 0) + (delta.translate?.[i] ?? 0),
    ) as Triple;
    const quat = quatMul(delta.quat ?? IDENT_Q, base.quat ?? IDENT_Q);
    const scale: Triple = [0, 1, 2].map(
      (i) => (base.scale?.[i] ?? 1) * (delta.scale?.[i] ?? 1),
    ) as Triple;

    const moved = translate.some((n) => Math.abs(n) > 1e-6);
    const turned = !(
      Math.abs(quat[0]) < 1e-9 &&
      Math.abs(quat[1]) < 1e-9 &&
      Math.abs(quat[2]) < 1e-9 &&
      Math.abs(Math.abs(quat[3]) - 1) < 1e-9
    );
    const resized = scale.some((n) => Math.abs(n - 1) > 1e-9);

    /* The material channel is absolute state, so it does not compose — an
       incoming material REPLACES the saved one wholesale, and an incoming
       EMPTY object clears it. Per-key merging here would make "I put the
       roughness back" unsayable: the stale saved key would survive every
       save that no longer mentions it. */
    let material = base.material;
    if (delta.material !== undefined) {
      material = Object.keys(delta.material).length > 0 ? delta.material : undefined;
    }

    if (!moved && !turned && !resized && material === undefined) {
      delete out[name];
      continue;
    }
    out[name] = {
      ...(moved ? { translate } : {}),
      ...(turned ? { quat } : {}),
      ...(resized ? { scale } : {}),
      ...(material !== undefined ? { material } : {}),
    };
  }
  return out;
}

/**
 * Part and material names in a tweak payload.
 *
 * These are JSON dict keys the runner passes to Blender's objects.get()/
 * materials.get() — never interpolated into code, never used as a path —
 * so the gate's job is exactly: no control characters, no path
 * separators, bounded length. Imported assets carry their authors' names,
 * unicode included; an ASCII-only gate failed a whole save because one
 * imported part was not named in English.
 */
const TWEAK_NAME_RE = /^[^\u0000-\u001f\u007f/\\]{1,100}$/;

export function sanitizeTweaks(value: unknown): Record<string, SanitizedTweak> | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, SanitizedTweak> = {};
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    /* Part names come from Blender's census, and imported assets carry
       whatever their author named them — including non-ASCII. The name is
       only ever a JSON dict key the runner passes to objects.get(), never
       interpolated into code or a path, so the gate's real job is: no
       control characters, no path separators, bounded length. An ASCII-only
       gate here made a whole save fail because one imported part had a
       unicode name. */
    if (!TWEAK_NAME_RE.test(name)) return null;
    if (typeof entry !== 'object' || entry === null) return null;
    const e = entry as Record<string, unknown>;

    const translate = readTriple(e.translate, 1000, 0);
    if (translate === null) return null;
    // Angles are bounded well past a full turn rather than wrapped: a value
    // outside this is a bug in the caller, not a big rotation.
    const rotate = readTriple(e.rotate, Math.PI * 8, 0);
    if (rotate === null) return null;

    /* Rotation as a unit quaternion — what the viewer actually composes.
       Validated for unit length rather than merely finite: a non-unit
       quaternion does not just rotate, it scales, so accepting one would
       let a malformed write silently resize geometry. */
    let quat: [number, number, number, number] | undefined;
    if (e.quat !== undefined) {
      if (!Array.isArray(e.quat) || e.quat.length !== 4) return null;
      const raw = e.quat.map(Number) as [number, number, number, number];
      if (raw.some((v) => !Number.isFinite(v))) return null;
      const length = Math.hypot(raw[0], raw[1], raw[2], raw[3]);
      if (!(length > 0.9 && length < 1.1)) return null;
      const unit = raw.map((v) => v / length) as [number, number, number, number];
      // Identity means "not rotated"; drop it rather than storing a no-op.
      const identity =
        Math.abs(unit[0]) < 1e-9 && Math.abs(unit[1]) < 1e-9 &&
        Math.abs(unit[2]) < 1e-9 && Math.abs(Math.abs(unit[3]) - 1) < 1e-9;
      if (!identity) quat = unit;
    }
    // Scale is a multiplier, so its identity is 1 and it must stay
    // positive — a zero or negative factor collapses or mirrors geometry.
    const scale = readTriple(e.scale, 1000, 1, true);
    if (scale === null) return null;

    const material = readMaterial(e.material);
    if (material === null) return null;

    // Every channel at identity means the part was touched and put back.
    // An EMPTY material object is not identity: on a merge it is the
    // explicit "clear the saved material" directive, so it must survive
    // sanitisation to reach mergeTweaks (which then deletes the channel).
    if (!translate && !rotate && !scale && !quat && material === undefined) continue;
    out[name] = {
      ...(translate ? { translate } : {}),
      // The validated quaternion has to be WRITTEN, not merely accepted.
      // Omitting it here let a rotation pass every check, survive the
      // identity-skip, and then be dropped from the file — the save
      // reported success and the rotation was gone by the next compile.
      ...(quat ? { quat } : {}),
      ...(rotate ? { rotate } : {}),
      ...(scale ? { scale } : {}),
      ...(material !== undefined ? { material } : {}),
    };
  }
  return out;
}

/** Reject unknown stage ids rather than silently compiling everything. */
export function parseStages(value: unknown): Scene3dStageId[] | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: Scene3dStageId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !STAGE_IDS.includes(entry as Scene3dStageId)) return null;
    out.push(entry as Scene3dStageId);
  }
  return out;
}

/**
 * Proof options come from a client, and every one of them costs render time,
 * so each is range-checked here instead of being trusted into Blender.
 */
export function parseProof(value: unknown): Scene3dProofOptions | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const out: Scene3dProofOptions = {};
  if (v.engine !== undefined) {
    if (v.engine !== 'BLENDER_EEVEE' && v.engine !== 'CYCLES') return null;
    out.engine = v.engine;
  }
  if (v.resolution !== undefined) {
    if (typeof v.resolution !== 'number' || !Number.isInteger(v.resolution)) return null;
    if (v.resolution < 64 || v.resolution > 4096) return null;
    out.resolution = v.resolution;
  }
  if (v.turntable !== undefined) {
    if (typeof v.turntable !== 'boolean') return null;
    out.turntable = v.turntable;
  }
  if (v.turntableSteps !== undefined) {
    if (typeof v.turntableSteps !== 'number' || !Number.isInteger(v.turntableSteps)) return null;
    if (v.turntableSteps < 1 || v.turntableSteps > 64) return null;
    out.turntableSteps = v.turntableSteps;
  }
  if (v.respectSceneCamera !== undefined) {
    if (typeof v.respectSceneCamera !== 'boolean') return null;
    out.respectSceneCamera = v.respectSceneCamera;
  }
  return out;
}
