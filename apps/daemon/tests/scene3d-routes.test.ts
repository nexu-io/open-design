import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertBlenderIfRequired, probeBlender } from '@open-design/scene3d';
import {
  artifactRef,
  CompileGate,
  parseDescribeQuery,
  parseProof,
  parseStages,
  registerScene3dRoutes,
  resolveSceneDir,
  sanitizeTweaks,
  mergeTweaks,
} from '../src/routes/scene3d.js';

let server: http.Server | null = null;
const tempRoots: string[] = [];

afterEach(async () => {
  if (server) {
    const toClose = server;
    server = null;
    await new Promise<void>((resolve) => toClose.close(() => resolve()));
  }
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a killed Blender child can hold the handle briefly on win32 */
    }
  }
});

function tempProjectsRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-scene3d-'));
  tempRoots.push(root);
  return root;
}

/** A crate that passes every scene3d lint rule, authored inline so the
 *  daemon test never reaches into another package's fixture corpus. */
const GOOD_CRATE = `import bpy, math

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
body = bpy.context.object
body.name = "prp_crate_body"

mat = bpy.data.materials.new("mtl_crate_wood")
mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.55, 0.35, 0.15, 1.0)
bsdf.inputs["Roughness"].default_value = 0.75
body.data.materials.append(mat)

bpy.ops.object.camera_add(location=(5.5, -5.0, 3.5))
cam = bpy.context.object
cam.name = "cam_crate_shot"
cam.rotation_euler = (math.radians(63), 0, math.radians(45))
bpy.context.scene.camera = cam

bpy.ops.object.light_add(type="AREA", location=(4, 4, 6))
light = bpy.context.object
light.name = "lgt_key"
light.data.energy = 200
`;

/** Same crate with the camera removed and the material left at factory
 *  defaults — the compile must succeed and report S3D-E-381 / S3D-W-341. */
const POISONED_CRATE = `import bpy

bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
body = bpy.context.object
body.name = "prp_crate_body"

mat = bpy.data.materials.new("mtl_untouched")
mat.use_nodes = True
body.data.materials.append(mat)
`;

async function startServer(options: {
  projectsRoot: string;
  project?: { id: string; metadata?: unknown } | null;
  authorize?: boolean;
}) {
  const app = express();
  app.use(express.json());
  const project = options.project === undefined ? { id: 'proj1' } : options.project;
  registerScene3dRoutes(app, {
    db: {},
    http: {
      sendApiError: (res: any, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    } as any,
    paths: { PROJECTS_DIR: options.projectsRoot } as any,
    projectStore: { getProject: (_db: unknown, id: string) => (project?.id === id ? project : null) },
    validation: { isSafeId: (id: string) => /^[A-Za-z0-9_-]+$/.test(id) },
    // Annotated explicitly: the deps object is cast to `any` below, which
    // removes the contextual typing this callback would otherwise inherit.
    authorizeProjectRequest: async (
      _req: unknown,
      res: { status: (code: number) => { json: (body: unknown) => void } },
      _id: string,
      _opts: unknown,
    ) => {
      if (options.authorize === false) {
        res.status(403).json({ error: { code: 'FORBIDDEN', message: 'denied' } });
        return false;
      }
      return true;
    },
  } as any);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind to a TCP port');
  const base = `http://127.0.0.1:${address.port}`;
  return {
    async req(route: string, init: { method?: string; body?: unknown } = {}) {
      const request: RequestInit = { method: init.method ?? 'GET' };
      if (init.body !== undefined) {
        request.headers = { 'content-type': 'application/json' };
        request.body = JSON.stringify(init.body);
      }
      const response = await fetch(`${base}${route}`, request);
      return { status: response.status, body: (await response.json()) as Record<string, any> };
    },
    base,
  };
}

describe('CompileGate', () => {
  // The gate is what keeps off-thread compiles from fanning out an unbounded
  // number of worker threads + Blender children under a burst. Pin both halves
  // of the contract: the ceiling holds, and a rejecting task frees its slot.
  const flush = () => new Promise<void>((r) => setImmediate(r));

  it('never runs more than `limit` at once and admits queued work FIFO as slots free', async () => {
    const gate = new CompileGate(2);
    let active = 0;
    let peak = 0;
    const entered: number[] = [];
    const release: Array<() => void> = [];
    const run = (i: number) =>
      gate.run(async () => {
        active++;
        peak = Math.max(peak, active);
        entered.push(i);
        await new Promise<void>((r) => release.push(r));
        active--;
        return i;
      });
    const tasks = [0, 1, 2, 3].map(run);

    await flush();
    expect(entered).toEqual([0, 1]); // only `limit` admitted; 2 and 3 queued
    expect(peak).toBe(2);

    release[0]!();
    await flush();
    expect(entered).toEqual([0, 1, 2]); // a freed slot admits the next in order
    expect(peak).toBe(2); // never exceeds the ceiling

    release[1]!();
    await flush();
    expect(entered).toEqual([0, 1, 2, 3]);

    release[2]!();
    release[3]!();
    expect(await Promise.all(tasks)).toEqual([0, 1, 2, 3]);
    expect(peak).toBe(2);
  });

  it('holds the ceiling under a synchronous burst of run() calls', async () => {
    // Slots are transferred to waiters, not decremented-then-reincremented, so
    // no in-tick burst can transiently breach the limit.
    const gate = new CompileGate(2);
    let active = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const tasks = Array.from({ length: 8 }, () =>
      gate.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((r) => release.push(r));
        active--;
      }),
    );
    await flush();
    expect(peak).toBe(2); // eight fired at once, only two admitted
    for (let i = 0; i < 8; i++) {
      release[i]!();
      await flush();
    }
    await Promise.all(tasks);
    expect(peak).toBe(2);
  });

  it('frees the slot when a task rejects, so the gate does not wedge', async () => {
    const gate = new CompileGate(1);
    await expect(
      gate.run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    // If the finally did not release, this second task would hang forever.
    await expect(gate.run(async () => 'after')).resolves.toBe('after');
  });

  it('drops a queued task the moment its signal aborts, without ever admitting it', async () => {
    const gate = new CompileGate(1);
    const release: Array<() => void> = [];
    // Occupy the only slot.
    const holding = gate.run(async () => {
      await new Promise<void>((r) => release.push(r));
    });
    await flush();

    const ac = new AbortController();
    let admitted = false;
    const queued = gate.run(async () => {
      admitted = true;
    }, ac.signal);
    await flush(); // it is waiting behind `holding`, not running

    ac.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(admitted).toBe(false); // it never got a slot

    release[0]!();
    await holding; // and dropping the queued one didn't strand the gate
  });
});

describe('parseDescribeQuery', () => {
  it('parses region/focus/budget and rejects malformed input', () => {
    expect(parseDescribeQuery({})).toEqual({});
    expect(parseDescribeQuery({ focus: 'prp_door' })).toEqual({ focus: 'prp_door' });
    expect(parseDescribeQuery({ budget: '2000' })).toEqual({ budgetTokens: 2000 });
    expect(parseDescribeQuery({ region: '-1,-1,-1,2,3,4' })).toEqual({
      region: { min: [-1, -1, -1], max: [2, 3, 4] },
    });
    // An inverted box still selects its interior (normalised per axis).
    expect(parseDescribeQuery({ region: '2,3,4,-1,-1,-1' })).toEqual({
      region: { min: [-1, -1, -1], max: [2, 3, 4] },
    });
    // Malformed → null (not a silent default that would describe the whole scene).
    expect(parseDescribeQuery({ region: '1,2,3' })).toBeNull();
    expect(parseDescribeQuery({ region: '1,2,3,4,5,x' })).toBeNull();
    expect(parseDescribeQuery({ budget: '0' })).toBeNull();
    expect(parseDescribeQuery({ budget: '12.5' })).toBeNull();
    // A present-but-non-string value (a duplicated ?region=/?focus= arrives as an
    // array) is malformed, not absent — rejected, consistent with budget.
    expect(parseDescribeQuery({ region: ['1,2,3,4,5,6', '7,8,9,1,2,3'] as unknown as string })).toBeNull();
    expect(parseDescribeQuery({ focus: ['a', 'b'] as unknown as string })).toBeNull();
    // An empty string is treated as "not provided", not malformed.
    expect(parseDescribeQuery({ region: '', focus: '' })).toEqual({});
  });
});

describe('resolveSceneDir', () => {
  // Resolved, not just joined: on win32 `path.resolve` prefixes the current
  // drive letter, so a bare `\projects` would never equal the resolved path.
  const projectsRoot = path.resolve(path.sep, 'projects');
  const project = { id: 'p1' };

  it('defaults to the project root', () => {
    const resolved = resolveSceneDir(projectsRoot, project, undefined);
    expect(resolved.relative).toBe('.');
    expect(resolved.absolute).toBe(path.join(projectsRoot, 'p1'));
  });

  it('resolves a nested scene directory and normalizes separators', () => {
    const resolved = resolveSceneDir(projectsRoot, project, 'scenes/crate');
    expect(resolved.relative).toBe('scenes/crate');
    expect(resolved.absolute).toBe(path.join(projectsRoot, 'p1', 'scenes', 'crate'));
  });

  it('rejects a path that escapes the project directory', () => {
    expect(() => resolveSceneDir(projectsRoot, project, '../other')).toThrow(/escapes/);
    expect(() => resolveSceneDir(projectsRoot, project, 'scenes/../../other')).toThrow(/escapes/);
  });

  it('rejects an absolute path', () => {
    expect(() => resolveSceneDir(projectsRoot, project, '/etc')).toThrow(/project-relative/);
    expect(() => resolveSceneDir(projectsRoot, project, 'C:/Windows')).toThrow(/project-relative/);
  });

  it('honours the imported-folder baseDir instead of PROJECTS_DIR', () => {
    const baseDir = path.resolve(path.sep, 'work', 'mine');
    const imported = { id: 'p2', metadata: { baseDir } };
    const resolved = resolveSceneDir(projectsRoot, imported, 'scene');
    expect(resolved.absolute).toBe(path.join(baseDir, 'scene'));
  });
});

describe('artifactRef', () => {
  it('joins the scene path onto compile-relative artifact paths', () => {
    expect(artifactRef('p1', 'scenes/crate', 'out/proof/proof-abc-000.png')).toEqual({
      path: 'scenes/crate/out/proof/proof-abc-000.png',
      url: '/api/projects/p1/files/scenes/crate/out/proof/proof-abc-000.png',
    });
  });

  it('leaves root-level scenes unprefixed', () => {
    expect(artifactRef('p1', '.', 'out/scene.glb').path).toBe('out/scene.glb');
  });

  it('percent-encodes each segment without eating the separators', () => {
    expect(artifactRef('p 1', 'my scenes', 'a b.png').url).toBe(
      '/api/projects/p%201/files/my%20scenes/a%20b.png',
    );
  });
});

describe('request validation', () => {
  it('accepts an omitted stage list and rejects unknown stage ids', () => {
    expect(parseStages(undefined)).toBeUndefined();
    expect(parseStages(['parse', 'lint'])).toEqual(['parse', 'lint']);
    expect(parseStages([])).toBeNull();
    expect(parseStages(['parse', 'render'])).toBeNull();
    expect(parseStages('parse')).toBeNull();
  });

  it('range-checks proof options against RESOURCE ceilings, not UI walls', () => {
    expect(parseProof(undefined)).toBeUndefined();
    expect(parseProof({ resolution: 512, turntableSteps: 4 })).toEqual({
      resolution: 512,
      turntableSteps: 4,
    });
    // An 8K hero shot and a 120-frame turntable are legitimate — the old 4096/64
    // walls are gone; the ceilings are now GPU memory (16384) and disk (2048).
    expect(parseProof({ resolution: 8192 })).toEqual({ resolution: 8192 });
    expect(parseProof({ turntableSteps: 120 })).toEqual({ turntableSteps: 120 });
    expect(parseProof({ resolution: 32 })).toBeNull(); // below the meaningful floor
    expect(parseProof({ resolution: 20000 })).toBeNull(); // past the GPU-memory ceiling
    expect(parseProof({ resolution: 512.5 })).toBeNull();
    expect(parseProof({ turntableSteps: 0 })).toBeNull();
    expect(parseProof({ turntableSteps: 4096 })).toBeNull(); // past the disk ceiling
    expect(parseProof({ engine: 'UNREAL' })).toBeNull();
    expect(parseProof({ turntable: 'yes' })).toBeNull();
  });
});

describe('sanitizeTweaks', () => {
  it('passes clean translate deltas and drops zero-deltas', () => {
    expect(
      sanitizeTweaks({
        prp_lid: { translate: [0, 0, 0.05] },
        prp_noop: { translate: [0, 0, 0] },
      }),
    ).toEqual({ prp_lid: { translate: [0, 0, 0.05] } });
  });

  it('treats absent tweaks as an empty set', () => {
    expect(sanitizeTweaks(undefined)).toEqual({});
    expect(sanitizeTweaks(null)).toEqual({});
  });

  it('rejects NaN, non-finite, absurd magnitudes and malformed shapes', () => {
    // This file is replayed against geometry on every compile; a NaN here
    // is a poisoned scene forever.
    expect(sanitizeTweaks({ p: { translate: [Number.NaN, 0, 0] } })).toBeNull();
    expect(sanitizeTweaks({ p: { translate: [Infinity, 0, 0] } })).toBeNull();
    expect(sanitizeTweaks({ p: { translate: [5000, 0, 0] } })).toBeNull();
    expect(sanitizeTweaks({ p: { translate: [1, 2] } })).toBeNull();
    expect(sanitizeTweaks({ p: 'up a bit' })).toBeNull();
    expect(sanitizeTweaks([1, 2, 3])).toBeNull();
  });

  it('rejects part names that could not have come from the census', () => {
    // Path separators and control characters are out; the name is a JSON
    // dict key for objects.get(), never a path or interpolated code.
    expect(sanitizeTweaks({ '../escape': { translate: [1, 0, 0] } })).toBeNull();
    expect(sanitizeTweaks({ 'a\\b': { translate: [1, 0, 0] } })).toBeNull();
    expect(sanitizeTweaks({ 'a\nb': { translate: [1, 0, 0] } })).toBeNull();
    expect(sanitizeTweaks({ ['x'.repeat(120)]: { translate: [1, 0, 0] } })).toBeNull();
  });

  it('accepts the names imported assets actually carry — unicode included', () => {
    // A whole save once failed because one imported part was not named in
    // English. Names are dict keys, not code; the census is the authority.
    expect(sanitizeTweaks({ 'コーン_01': { translate: [0, 0, 0.1] } })).toEqual({
      'コーン_01': { translate: [0, 0, 0.1] },
    });
    expect(sanitizeTweaks({ p: { material: { assign: 'Métal doré' } } })).toEqual({
      p: { material: { assign: 'Métal doré' } },
    });
  });

  it('passes a clean material channel through intact', () => {
    expect(
      sanitizeTweaks({
        prp_cone: {
          material: {
            assign: 'mtl_gold',
            baseColor: [0.8, 0.6, 0.1],
            roughness: 0.25,
            metallic: 1,
            emission: [1, 0.4, 0.1],
            emissionStrength: 4,
            alpha: 0.5,
          },
        },
      }),
    ).toEqual({
      prp_cone: {
        material: {
          assign: 'mtl_gold',
          baseColor: [0.8, 0.6, 0.1],
          roughness: 0.25,
          metallic: 1,
          emission: [1, 0.4, 0.1],
          emissionStrength: 4,
          alpha: 0.5,
        },
      },
    });
  });

  it('keeps an empty material object — it is the clear directive, not a no-op', () => {
    expect(sanitizeTweaks({ prp_cone: { material: {} } })).toEqual({
      prp_cone: { material: {} },
    });
  });

  it('rejects malformed material channels', () => {
    // Injection safety is STRUCTURAL — names travel as JSON into
    // materials.get(), never interpolated — so the name gate only rejects
    // control characters, separators and unbounded length. Values are
    // range-clamped hard.
    expect(sanitizeTweaks({ p: { material: { assign: 'a/b' } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { assign: 'a\nb' } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { assign: 'x'.repeat(120) } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { baseColor: [2, 0, 0] } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { baseColor: [Number.NaN, 0, 0] } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { roughness: -0.1 } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { metallic: 2 } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { emissionStrength: 1e9 } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: { alpha: 1.5 } } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: 'gold please' } })).toBeNull();
    expect(sanitizeTweaks({ p: { material: ['mtl_gold'] } })).toBeNull();
  });
});

describe('mergeTweaks — material channel', () => {
  it('replaces the saved material wholesale rather than merging keys', () => {
    // Per-key merging would make "I put the roughness back" unsayable: the
    // stale saved key would survive every save that no longer mentions it.
    const merged = mergeTweaks(
      { p: { material: { assign: 'mtl_gold', roughness: 0.2 } } },
      { p: { material: { assign: 'mtl_gold' } } },
    );
    expect(merged).toEqual({ p: { material: { assign: 'mtl_gold' } } });
  });

  it('clears the material channel on an incoming empty object', () => {
    const merged = mergeTweaks(
      { p: { translate: [0, 0, 1], material: { assign: 'mtl_gold' } } },
      { p: { material: {} } },
    );
    expect(merged).toEqual({ p: { translate: [0, 0, 1] } });
  });

  it('drops the whole entry when clearing the material leaves nothing', () => {
    const merged = mergeTweaks(
      { p: { material: { assign: 'mtl_gold' } } },
      { p: { material: {} } },
    );
    expect(merged).toEqual({});
  });

  it('carries a saved material through a transform-only save untouched', () => {
    const merged = mergeTweaks(
      { p: { material: { roughness: 0.9 } } },
      { p: { translate: [0, 0, 0.1] } },
    );
    expect(merged).toEqual({ p: { translate: [0, 0, 0.1], material: { roughness: 0.9 } } });
  });
});

describe('POST /api/projects/:id/scene3d/tweaks', () => {
  it('writes tweaks.json into the scene directory', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1', 'scenes', 'crate');
    fs.mkdirSync(sceneDir, { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/tweaks', {
      method: 'POST',
      body: { scenePath: 'scenes/crate', tweaks: { prp_lid: { translate: [0, 0, 0.1] } } },
    });
    expect(res.status).toBe(200);
    const written = JSON.parse(fs.readFileSync(path.join(sceneDir, 'tweaks.json'), 'utf8'));
    expect(written).toEqual({ prp_lid: { translate: [0, 0, 0.1] } });
  });

  it('clears the file when the tweak set is empty — reset is a real undo', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1');
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, 'tweaks.json'), '{"prp_a":{"translate":[1,0,0]}}');
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/tweaks', {
      method: 'POST',
      body: { tweaks: {} },
    });
    expect(res.status).toBe(200);
    expect(res.body.cleared).toBe(true);
    expect(fs.existsSync(path.join(sceneDir, 'tweaks.json'))).toBe(false);
  });

  it('400s malformed tweaks instead of persisting them', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/tweaks', {
      method: 'POST',
      body: { tweaks: { p: { translate: ['a', 'b', 'c'] } } },
    });
    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(root, 'proj1', 'tweaks.json'))).toBe(false);
  });

  it('refuses a caller without write capability', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root, authorize: false });
    const res = await api.req('/api/projects/proj1/scene3d/tweaks', {
      method: 'POST',
      body: { tweaks: { p: { translate: [1, 0, 0] } } },
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/projects/:id/scene3d/compile', () => {
  it('404s an unknown project', async () => {
    const api = await startServer({ projectsRoot: tempProjectsRoot(), project: null });
    const res = await api.req('/api/projects/nope/scene3d/compile', { method: 'POST', body: {} });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJECT_NOT_FOUND');
  });

  it('400s an unsafe project id before touching the filesystem', async () => {
    const api = await startServer({ projectsRoot: tempProjectsRoot() });
    const res = await api.req('/api/projects/..%2Fescape/scene3d/compile', {
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it('refuses a caller without write capability', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root, authorize: false });
    const res = await api.req('/api/projects/proj1/scene3d/compile', { method: 'POST', body: {} });
    expect(res.status).toBe(403);
  });

  it('400s a scenePath that escapes the project directory', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { scenePath: '../../etc' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/escapes/);
  });

  it('400s an unknown stage id', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { stages: ['parse', 'raytrace'] },
    });
    expect(res.status).toBe(400);
  });

  it('404s a scene directory that does not exist', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { scenePath: 'scenes/missing' },
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SCENE_NOT_FOUND');
  });

  it('reports a source-less scene as ok:false with S3D-E-101 rather than an HTTP error', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      // Lint-only: a scene with no sources needs no Blender to fail parse.
      body: { stages: ['parse', 'lint', 'manifest'] },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.issues.map((i: any) => i.code)).toContain('S3D-E-101');
    expect(res.body.agentMessage).toContain('<scene3d-report ok="false"');
  });
});

describe('GET /api/projects/:id/scene3d/manifest', () => {
  it('returns a null manifest for a scene that has never compiled', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/manifest');
    expect(res.status).toBe(200);
    expect(res.body.manifest).toBeNull();
    expect(res.body.proofImages).toEqual([]);
  });

  it('400s a scenePath that escapes the project directory', async () => {
    const root = tempProjectsRoot();
    fs.mkdirSync(path.join(root, 'proj1'), { recursive: true });
    const api = await startServer({ projectsRoot: root });
    const res = await api.req('/api/projects/proj1/scene3d/manifest?scenePath=..%2F..%2Fetc');
    expect(res.status).toBe(400);
  });
});

const hasBlender = (await probeBlender({})) !== null;
// SCENE3D_REQUIRE_BLENDER turns a missing runtime into a failure instead of
// a green skip on environments that promised real coverage - same hatch the
// package's own Blender suites arm.
assertBlenderIfRequired(hasBlender);

describe.skipIf(!hasBlender)('scene3d compile over HTTP (real Blender)', () => {
  const LONG = 300_000;

  it('compiles a clean scene, exposes artifact URLs, and hydrates the manifest', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1', 'scenes', 'crate');
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, 'build.py'), GOOD_CRATE);
    fs.writeFileSync(
      path.join(sceneDir, 'scene3d.json'),
      JSON.stringify({ schemaVersion: 1, proof: { resolution: 256, turntableSteps: 2 } }),
    );
    const api = await startServer({ projectsRoot: root });

    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { scenePath: 'scenes/crate' },
    });
    expect(res.status).toBe(200);
    expect(res.body.issues.filter((i: any) => i.severity === 'error')).toEqual([]);
    expect(res.body.ok).toBe(true);
    expect(res.body.scenePath).toBe('scenes/crate');
    expect(res.body.blender.available).toBe(true);
    expect(res.body.proofImages).toHaveLength(2);
    // Artifact refs are project-relative so the existing project file route
    // serves them without the viewer knowing where the scene lives.
    expect(res.body.proofImages[0].path.startsWith('scenes/crate/out/proof/')).toBe(true);
    expect(res.body.proofImages[0].url.startsWith('/api/projects/proj1/files/scenes/crate/')).toBe(
      true,
    );
    expect(res.body.exportedAssets.some((a: any) => a.path.endsWith('.glb'))).toBe(true);
    expect(res.body.manifest.partTree.map((p: any) => p.name).sort()).toEqual([
      'cam_crate_shot',
      'lgt_key',
      'prp_crate_body',
    ]);
    expect(res.body.agentMessage).toContain('<scene3d-report ok="true"');

    const manifest = await api.req('/api/projects/proj1/scene3d/manifest?scenePath=scenes/crate');
    expect(manifest.status).toBe(200);
    expect(manifest.body.manifest.partTree).toHaveLength(3);
    expect(manifest.body.proofImages).toHaveLength(2);

    // The describe query surface reads the same compile's census — no Blender.
    const describe = await api.req('/api/projects/proj1/scene3d/describe?scenePath=scenes/crate');
    expect(describe.status).toBe(200);
    expect(typeof describe.body.describe).toBe('string');
    expect(describe.body.describe).toContain('prp_crate_body');
    // A focus is honoured (the query surface works, not just the default digest).
    const focused = await api.req(
      '/api/projects/proj1/scene3d/describe?scenePath=scenes/crate&focus=prp_crate_body',
    );
    expect(focused.status).toBe(200);
    expect(focused.body.describe).toContain('prp_crate_body');
    // A malformed region is a 400, not a silent whole-scene describe.
    const bad = await api.req(
      '/api/projects/proj1/scene3d/describe?scenePath=scenes/crate&region=1,2,3',
    );
    expect(bad.status).toBe(400);
    // A scene DIRECTORY that does not exist is a typo, not "never
    // compiled" — the two used to share a 200 {describe: null}, making a
    // mistyped path indistinguishable from a scene awaiting its first
    // build, while compile on the same path correctly refused.
    const missing = await api.req('/api/projects/proj1/scene3d/describe?scenePath=scenes/nope');
    expect(missing.status).toBe(404);
    // A directory that EXISTS but was never compiled keeps the truthful null.
    fs.mkdirSync(path.join(root, 'proj1', 'scenes', 'uncompiled'), { recursive: true });
    const uncompiled = await api.req(
      '/api/projects/proj1/scene3d/describe?scenePath=scenes/uncompiled',
    );
    expect(uncompiled.status).toBe(200);
    expect(uncompiled.body.describe).toBeNull();

    // The USD scene-graph dump ships beside the exported .usda: a legible prim
    // tree, not the vertex-array black box the raw stage is.
    const treeFile = path.join(root, 'proj1', 'scenes', 'crate', 'out', 'scene.tree.txt');
    expect(fs.existsSync(treeFile)).toBe(true);
    const graph = fs.readFileSync(treeFile, 'utf8');
    expect(graph).toContain('stage:');
    expect(graph).toContain('prp_crate_body');
    expect(graph).not.toContain('faceVertexIndices');

    // The ASCII ortho triptych ships beside ortho.svg — plan/front/side an LLM
    // reads directly.
    const orthoTxt = path.join(root, 'proj1', 'scenes', 'crate', 'out', 'ortho.txt');
    expect(fs.existsSync(orthoTxt)).toBe(true);
    expect(fs.readFileSync(orthoTxt, 'utf8')).toContain('Plan · top');
  }, LONG);

  it('returns 200 with the failing codes for a poisoned scene', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1');
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, 'build.py'), POISONED_CRATE);
    fs.writeFileSync(
      path.join(sceneDir, 'scene3d.json'),
      JSON.stringify({ schemaVersion: 1, proof: { resolution: 256, turntableSteps: 1 } }),
    );
    const api = await startServer({ projectsRoot: root });

    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { stages: ['parse', 'build', 'lint', 'manifest'] },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    const codes = res.body.issues.map((i: any) => i.code);
    expect(codes).toContain('S3D-E-381'); // no camera
    expect(codes).toContain('S3D-W-341'); // material at factory defaults
    expect(res.body.agentMessage).toContain('verdict: fix every error above');
  }, LONG);

  it('409s a second compile of the same scene while one is in flight', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1');
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, 'build.py'), GOOD_CRATE);
    const api = await startServer({ projectsRoot: root });

    const body = { stages: ['parse', 'build', 'lint'], noCache: true };
    // Two concurrent posts, no stagger: the in-flight lock is acquired
    // synchronously when a request enters the handler, so exactly one of
    // the pair wins regardless of arrival order, and the seconds-long
    // Blender compile makes a both-200 interleaving impossible. A fixed
    // sleep here used to ORDER the pair instead, which trusted the
    // scheduler on a loaded box; the contract only promises that the loser
    // is told to retry rather than racing the same `.scene3d` directory,
    // so that is what is asserted, order-agnostically.
    const [a, b] = await Promise.all([
      api.req('/api/projects/proj1/scene3d/compile', { method: 'POST', body }),
      api.req('/api/projects/proj1/scene3d/compile', { method: 'POST', body }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('CONFLICT');
  }, LONG);
});

/*
 * The rotation channel had no coverage here, and that is exactly how it
 * came to be validated and then dropped: sanitizeTweaks checked the
 * quaternion, let the entry through the identity-skip, and then built its
 * result without it. Every save reported success and wrote a part with no
 * rotation, so the turn vanished at the next compile.
 */
/*
 * Saving used to require the viewer to READ tweaks.json first, so it could
 * send the whole file back. That made a save depend on a GET succeeding —
 * and when the page could not reach the daemon from wherever the host had
 * mounted it, the write was never attempted at all. The daemon owns the
 * file, so the daemon composes it: the client sends only what it changed.
 */
describe('mergeTweaks', () => {
  const q90: [number, number, number, number] = [0, 0.7071067811865476, 0, 0.7071067811865476];

  it('adds translation, multiplies scale, composes rotation', () => {
    const out = mergeTweaks(
      { a: { translate: [1, 0, 0], scale: [2, 1, 1], quat: q90 } },
      { a: { translate: [0.5, 0, 0], scale: [3, 1, 1], quat: q90 } },
    );
    expect(out.a!.translate).toEqual([1.5, 0, 0]);
    expect(out.a!.scale![0]).toBeCloseTo(6, 9);
    // Two 90° turns about the same axis make 180°.
    expect(Math.abs(out.a!.quat![1])).toBeCloseTo(1, 6);
  });

  it('leaves parts the client never mentioned untouched', () => {
    const out = mergeTweaks({ a: { translate: [1, 0, 0] } }, { b: { translate: [0, 1, 0] } });
    expect(out.a!.translate).toEqual([1, 0, 0]);
    expect(out.b!.translate).toEqual([0, 1, 0]);
  });

  it('drops a part whose channels cancel back to identity', () => {
    const out = mergeTweaks({ a: { translate: [0, 1, 0] } }, { a: { translate: [0, -1, 0] } });
    expect(out.a).toBeUndefined();
  });

  it('treats an empty prior file as a first save', () => {
    const out = mergeTweaks({}, { a: { quat: q90 } });
    expect(out.a!.quat).toBeDefined();
  });
});

describe('sanitizeTweaks rotation channel', () => {
  const q90: [number, number, number, number] = [0, 0.7071067811865476, 0, 0.7071067811865476];

  it('returns a validated quaternion rather than silently dropping it', () => {
    const out = sanitizeTweaks({ prp_lid: { quat: q90 } });
    expect(out).not.toBeNull();
    expect(out!.prp_lid, 'the rotated part was dropped entirely').toBeDefined();
    expect(out!.prp_lid!.quat, 'the quaternion was validated but never written').toBeDefined();
    expect(out!.prp_lid!.quat![1]).toBeCloseTo(q90[1], 9);
  });

  it('keeps every channel when a part is moved, turned and resized at once', () => {
    const out = sanitizeTweaks({
      prp_body: { translate: [0, 0.25, 0], quat: q90, scale: [2, 1, 1] },
    })!;
    expect(out.prp_body!.translate).toEqual([0, 0.25, 0]);
    expect(out.prp_body!.quat).toBeDefined();
    expect(out.prp_body!.scale).toEqual([2, 1, 1]);
  });

  it('drops an identity rotation but keeps a real one', () => {
    expect(sanitizeTweaks({ a: { quat: [0, 0, 0, 1] } })).toEqual({});
    expect(Object.keys(sanitizeTweaks({ a: { quat: q90 } })!)).toEqual(['a']);
  });

  /* A non-unit quaternion does not merely rotate — it scales. Accepting one
     would let a malformed write silently resize geometry. */
  it('rejects a quaternion that is not unit length', () => {
    expect(sanitizeTweaks({ a: { quat: [0, 0, 0, 2] } })).toBeNull();
    expect(sanitizeTweaks({ a: { quat: [0, 0, 0] as never } })).toBeNull();
    expect(sanitizeTweaks({ a: { quat: [0, Number.NaN, 0, 1] } })).toBeNull();
  });
});

describe('scene3d compile response contract (real Blender)', () => {
  const LONG = 300_000;

  /**
   * The route is the seam between the compiler's rich result and every
   * consumer (web panel, CLI, external agents). Its response is typed as
   * Scene3dCompileResponse, but nothing pinned that the route actually
   * POPULATES the fields the contract promises — `solved` in particular was
   * added to the type and the route together, and only an HTTP-level test
   * catches the two drifting apart. These pins read the REAL JSON off the
   * wire so a field dropped from the route (or renamed) fails here, not in
   * some viewer three layers up.
   */
  it('carries solved placement for a spec-authored scene over HTTP', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1', 'scenes', 'pavilion');
    fs.mkdirSync(sceneDir, { recursive: true });
    // Minimal two-part spec: a plinth with a post seated on it. The solve
    // runs at parse time — no Blender build needed to have placement facts.
    fs.writeFileSync(
      path.join(sceneDir, 'scene.json'),
      JSON.stringify({
        schemaVersion: 1,
        parts: [
          { id: 'prp_plinth', size: [1, 1, 0.1] },
          { id: 'prp_post', size: [0.1, 0.1, 0.5] },
        ],
        relations: [
          { type: 'at', part: 'prp_plinth', center: [0, 0, 0.05] },
          { type: 'sits_on', part: 'prp_post', on: 'prp_plinth' },
        ],
      }),
    );
    const api = await startServer({ projectsRoot: root });

    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { scenePath: 'scenes/pavilion', stages: ['parse'] },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // The contract's optional-but-promised field: present on any spec scene.
    const solved = res.body.solved;
    expect(solved, 'route dropped the solved field the contract declares').toBeTruthy();
    const ids = solved.parts.map((p: any) => p.id);
    expect(ids).toContain('prp_plinth');
    expect(ids).toContain('prp_post');
    const post = solved.parts.find((p: any) => p.id === 'prp_post');
    // Placement facts, not just names: the post sits ON the plinth.
    expect(post.restsOn).toBe('prp_plinth');
    expect(post.size).toEqual([0.1, 0.1, 0.5]);
    const plinth = solved.parts.find((p: any) => p.id === 'prp_plinth');
    // Post bottom rests on plinth top floored by MIN_CONTACT (1mm): centre
    // z = 0.1 + 0.25 - 0.001. The floor is the language's z-fight guarantee.
    expect(post.center[2]).toBeCloseTo(0.349, 6);
    expect(plinth.center[2]).toBeCloseTo(0.05, 6);
    // Diagnostics ride along even when empty — shape, not just presence.
    expect(Array.isArray(solved.diagnostics)).toBe(true);
  }, LONG);

  it('omits solved for a build.py scene where no solving ran', async () => {
    const root = tempProjectsRoot();
    const sceneDir = path.join(root, 'proj1');
    fs.mkdirSync(sceneDir, { recursive: true });
    fs.writeFileSync(path.join(sceneDir, 'build.py'), GOOD_CRATE);
    const api = await startServer({ projectsRoot: root });

    const res = await api.req('/api/projects/proj1/scene3d/compile', {
      method: 'POST',
      body: { stages: ['parse'] },
    });
    expect(res.status).toBe(200);
    // Absent, not null and not {}: the contract says "present whenever
    // solving ran", and a build.py scene never solves.
    expect(res.body.solved).toBeUndefined();
  }, LONG);
});
