// Presentation rules for compiled deliverables. These are what stand between
// "the compiler wrote some files" and an export menu a person can read.

import { describe, expect, it } from 'vitest';
import type { Scene3dArtifactRef, Scene3dManifest } from '@open-design/contracts';
import {
  groupDeliverables,
  modelRowFromRefs,
  modelRowsFromArtifactManifest,
  resolveAssetKind,
  scenePathFromArtifactManifest,
  totalTriangles,
} from '../src/runtime/scene3d-assets';
import type { ArtifactManifest } from '../src/artifacts/types';

const ref = (path: string): Scene3dArtifactRef => ({ path, url: `/api/x/${path}` });

const manifest = (over: Partial<Scene3dManifest> = {}): Scene3dManifest => ({
  schemaVersion: 1,
  generatedAt: '2026-08-18T00:00:00.000Z',
  source: { kind: 'bpy', files: ['build.py'] },
  blender: { version: '4.2', used: true },
  partTree: [],
  materials: [],
  textures: [],
  animation: { fps: 24, frameStart: 1, frameEnd: 1, keyframedObjects: [] },
  camera: { present: false, name: null },
  proofImages: [],
  exportedAssets: [],
  issues: { errors: 0, warnings: 0, infos: 0 },
  issueCodes: [],
  ...over,
});

const part = (name: string, over: Partial<Scene3dManifest['partTree'][number]> = {}) => ({
  name,
  type: 'MESH',
  parent: null,
  depth: 0,
  mesh: { verts: 8, faces: 6 },
  ...over,
});

describe('groupDeliverables', () => {
  it('collapses the OpenUSD family into one menu group', () => {
    const groups = groupDeliverables([ref('out/scene.usda'), ref('out/scene.usdc')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.format).toBe('usd');
    expect(groups[0]!.items.map((i) => i.fileName)).toEqual(['scene.usda', 'scene.usdc']);
  });

  it('drops companion files that cannot be opened on their own', () => {
    // A bare `.mtl` download is a file the user cannot do anything with; the
    // `.obj` carries it.
    const groups = groupDeliverables([ref('out/scene.obj'), ref('out/scene.mtl')]);
    expect(groups.flatMap((g) => g.items.map((i) => i.ext))).toEqual(['obj']);
  });

  it('orders engine containers ahead of pictures', () => {
    const groups = groupDeliverables([
      ref('out/proof/000.png'),
      ref('out/scene.obj'),
      ref('out/scene.glb'),
      ref('out/scene.usda'),
    ]);
    expect(groups.map((g) => g.format)).toEqual(['glb', 'usd', 'obj', 'image']);
  });

  it('keeps unknown extensions rather than hiding a real deliverable', () => {
    const groups = groupDeliverables([ref('out/scene.abc')]);
    expect(groups.map((g) => g.format)).toEqual(['other']);
  });

  it('returns nothing for a compile that exported nothing', () => {
    expect(groupDeliverables([])).toEqual([]);
  });
});

describe('resolveAssetKind', () => {
  it('trusts the compiler when the manifest states a kind', () => {
    expect(resolveAssetKind(manifest({ assetKind: 'flipbook' }))).toBe('flipbook');
  });

  it('derives a prop for a manifest written before the field existed', () => {
    expect(resolveAssetKind(manifest({ partTree: [part('crate')] }))).toBe('prop');
  });

  it('derives an animation from recorded keyframes', () => {
    expect(
      resolveAssetKind(
        manifest({
          partTree: [part('rig')],
          animation: { fps: 24, frameStart: 1, frameEnd: 48, keyframedObjects: ['rig'] },
        }),
      ),
    ).toBe('animation');
  });

  it('derives a texture for image maps with no geometry', () => {
    expect(
      resolveAssetKind(
        manifest({ textures: [{ name: 'bark', filepath: 'bark.png', resolution: [1024, 1024] }] }),
      ),
    ).toBe('texture');
  });

  it('excludes speakers from geometry roots, matching the compiler', () => {
    expect(
      resolveAssetKind(
        manifest({
          partTree: [
            part('crate'),
            part('spk_amb', { type: 'SPEAKER', mesh: null }),
          ],
        }),
      ),
    ).toBe('prop');
  });

  it('defaults to scene with no manifest at all', () => {
    expect(resolveAssetKind(null)).toBe('scene');
  });
});

describe('scenePathFromArtifactManifest', () => {
  const artifact = (metadata: Record<string, unknown>): ArtifactManifest =>
    ({
      version: 1,
      kind: 'scene3d',
      title: 'crate',
      entry: 'kit.html',
      renderer: 'scene3d',
      exports: ['glb'],
      metadata,
    }) as ArtifactManifest;

  it('reads the scene the compiler recorded', () => {
    expect(scenePathFromArtifactManifest(artifact({ scenePath: 'props/crate' }))).toBe(
      'props/crate',
    );
  });

  it('returns null rather than an empty path the caller would have to check', () => {
    expect(scenePathFromArtifactManifest(artifact({ scenePath: '' }))).toBeNull();
    expect(scenePathFromArtifactManifest(artifact({}))).toBeNull();
    expect(scenePathFromArtifactManifest(null)).toBeNull();
  });
});

describe('totalTriangles', () => {
  it('is null when no census ran, not zero', () => {
    // Zero would render as "0 tris" beside a full part tree, which reads as a
    // broken compile rather than an unmeasured one.
    expect(totalTriangles(manifest())).toBeNull();
    expect(
      totalTriangles(
        manifest({
          metrics: { worldSize: null, smallestPart: null, largestPart: null, totalTriangles: 1392 },
        }),
      ),
    ).toBe(1392);
  });
});

describe('modelRowsFromArtifactManifest', () => {
  const kitManifest = (): ArtifactManifest =>
    ({
      version: 1,
      kind: 'scene3d',
      title: 'Asset kit',
      entry: 'kit.html',
      renderer: 'html',
      exports: ['glb'],
      metadata: {
        assetKind: 'kit',
        scenes: [
          { name: 'crate', scenePath: 'scenes/crate' },
          { name: 'eyeball_jar', scenePath: 'scenes/eyeball_jar' },
        ],
        deliverables: [
          'scenes/crate/out/scene.usda',
          'scenes/crate/out/scene.glb',
          'scenes/crate/out/scene.mtl',
          'scenes/eyeball_jar/out/scene.glb',
          'scenes/eyeball_jar/out/scene.fbx',
        ],
      },
    }) as unknown as ArtifactManifest;

  it('groups by scene, not by format — the scene is what a person asks for', () => {
    const rows = modelRowsFromArtifactManifest('p1', kitManifest());
    /* A kit also gets a trailing gathered row, so the scenes are the rows
       that are not marked `bulk`. */
    expect(rows.filter((row) => !row.bulk).map((row) => row.label)).toEqual([
      'crate',
      'eyeball_jar',
    ]);
    expect(rows[0]!.items.map((item) => item.ext)).toEqual(['glb', 'usda']);
    expect(rows[1]!.items.map((item) => item.ext)).toEqual(['glb', 'fbx']);
  });

  it('renames downloads to <scene>.<ext> so a kit does not save four colliding scene.glb files', () => {
    const rows = modelRowsFromArtifactManifest('p1', kitManifest());
    expect(rows[0]!.items.map((item) => item.downloadName)).toEqual(['crate.glb', 'crate.usda']);
    expect(rows[1]!.items[1]!.downloadName).toBe('eyeball_jar.fbx');
  });

  it('drops companion files and keeps URL building on the shared helper', () => {
    const rows = modelRowsFromArtifactManifest('p1', kitManifest());
    const exts = rows.flatMap((row) => row.items.map((item) => item.ext));
    expect(exts).not.toContain('mtl');
    expect(rows[0]!.items[0]!.ref.url).toBe(
      '/api/projects/p1/files/scenes/crate/out/scene.glb',
    );
  });

  it('labels unlisted scenes by their directory instead of dropping their files', () => {
    const m = kitManifest();
    (m.metadata as Record<string, unknown>)['deliverables'] = [
      'scenes/mystery/out/scene.glb',
    ];
    (m.metadata as Record<string, unknown>)['scenes'] = [];
    const rows = modelRowsFromArtifactManifest('p1', m);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe('mystery');
  });

  it('handles single-scene sidecars via scenePath + title', () => {
    const m = kitManifest();
    const metadata = m.metadata as Record<string, unknown>;
    delete metadata['scenes'];
    metadata['scenePath'] = 'scenes/crate';
    metadata['deliverables'] = ['scenes/crate/out/scene.glb'];
    const rows = modelRowsFromArtifactManifest('p1', m);
    expect(rows).toEqual([
      expect.objectContaining({ label: 'crate' }),
    ]);
  });

  it('returns nothing without deliverables rather than a header over an empty list', () => {
    expect(modelRowsFromArtifactManifest('p1', null)).toEqual([]);
  });
});

describe('modelRowFromRefs', () => {
  it('builds one labeled row with format-ranked items and renamed downloads', () => {
    const row = modelRowFromRefs('crate', [
      ref('scenes/crate/out/scene.obj'),
      ref('scenes/crate/out/scene.mtl'),
      ref('scenes/crate/out/scene.glb'),
    ]);
    expect(row).not.toBeNull();
    expect(row!.items.map((item) => item.ext)).toEqual(['glb', 'obj']);
    expect(row!.items.map((item) => item.downloadName)).toEqual(['crate.glb', 'crate.obj']);
  });

  it('is null when nothing survives the companion filter — the trigger disables', () => {
    expect(modelRowFromRefs('crate', [ref('scenes/crate/out/scene.mtl')])).toBeNull();
  });
});
