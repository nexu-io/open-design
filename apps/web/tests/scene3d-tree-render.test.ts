import { describe, expect, it } from 'vitest';
import { buildPartTreeLayout, primPaths, type Scene3dManifest, type Scene3dTreeNodeInput } from '@open-design/contracts';
import { orderPartsForMention, setScene3dSelection, getScene3dSelection, resetScene3dSelection } from '../src/runtime/scene3d-selection';

const manifestFixture = (): Scene3dManifest => ({
  schemaVersion: 1,
  generatedAt: '2026-08-22T00:00:00.000Z',
  source: { kind: 'bpy', files: ['build.py'] },
  blender: { version: '5.0.1', used: true },
  partTree: [
    { name: 'cam_hero', type: 'CAMERA', parent: null, depth: 0, mesh: null },
    { name: 'lgt_key', type: 'LIGHT', parent: null, depth: 0, mesh: null },
    { name: 'prp_cap', type: 'MESH', parent: null, depth: 0, mesh: { verts: 24, faces: 44 } },
    { name: 'prp_cap_2', type: 'MESH', parent: null, depth: 0, mesh: { verts: 24, faces: 44 } },
    { name: 'prp_cap_3', type: 'MESH', parent: null, depth: 0, mesh: { verts: 24, faces: 44 } },
    { name: 'prp_cap_4', type: 'MESH', parent: null, depth: 0, mesh: { verts: 24, faces: 44 } },
    { name: 'prp_collar', type: 'MESH', parent: null, depth: 0, mesh: { verts: 768, faces: 768 } },
    { name: 'prp_kiln', type: 'MESH', parent: null, depth: 0, mesh: { verts: 98, faces: 144 } },
    { name: 'prp_door', type: 'MESH', parent: 'prp_kiln', depth: 1, mesh: { verts: 12, faces: 18 } },
  ],
  materials: [],
  textures: [],
  animation: { fps: 24, frameStart: 1, frameEnd: 24, keyframedObjects: ['prp_door'] },
  camera: { present: true, name: 'cam_hero' },
  proofImages: [],
  exportedAssets: [],
  issues: { errors: 0, warnings: 0, infos: 0 },
  issueCodes: [],
});

describe('Scene3d tree transformation from manifest', () => {
  it('builds hierarchical tree rows with prototype collapsing and glyphs', () => {
    const manifest = manifestFixture();
    const keyframed = new Set(manifest.animation?.keyframedObjects ?? []);
    const hasTextures = (manifest.textures?.length ?? 0) > 0;

    const treeInput: Scene3dTreeNodeInput[] = manifest.partTree.map((part) => {
      let glyphs = '';
      if (keyframed.has(part.name)) glyphs += 'a';
      if (part.mesh && part.mesh.faces > 0) glyphs += 'w';
      if (hasTextures && part.mesh) glyphs += 'x';

      return {
        name: part.name,
        parent: part.parent,
        type: part.type,
        mesh: part.mesh,
        glyphs: glyphs || undefined,
      };
    });

    const rows = buildPartTreeLayout(treeInput);

    // cam_hero (instance), lgt_key (instance), prp_cap (proto x4), prp_collar (instance), prp_kiln (instance), prp_door (instance depth 1)
    expect(rows).toHaveLength(6);

    expect(rows[0]).toMatchObject({
      kind: 'instance',
      name: 'cam_hero',
      type: 'CAMERA',
      depth: 0,
      path: '/cam_hero',
    });

    expect(rows[1]).toMatchObject({
      kind: 'instance',
      name: 'lgt_key',
      type: 'LIGHT',
      depth: 0,
      path: '/lgt_key',
    });

    expect(rows[2]).toMatchObject({
      kind: 'prototype',
      stem: 'prp_cap',
      count: 4,
      depth: 0,
      path: '/prp_cap',
      targetNames: ['prp_cap', 'prp_cap_2', 'prp_cap_3', 'prp_cap_4'],
    });

    expect(rows[3]).toMatchObject({
      kind: 'instance',
      name: 'prp_collar',
      depth: 0,
      path: '/prp_collar',
    });

    expect(rows[4]).toMatchObject({
      kind: 'instance',
      name: 'prp_kiln',
      depth: 0,
      path: '/prp_kiln',
    });

    expect(rows[5]).toMatchObject({
      kind: 'instance',
      name: 'prp_door',
      depth: 1,
      path: '/prp_kiln/prp_door',
      glyphs: 'aw',
    });
  });

  it('updates and synchronizes selection state for mention ranking', () => {
    resetScene3dSelection();
    const manifest = manifestFixture();
    const paths = primPaths(manifest.partTree);
    const selectionParts = manifest.partTree.map((p) => ({
      name: p.name,
      path: paths.get(p.name) ?? `/${p.name}`,
      type: p.type,
    }));

    setScene3dSelection('breathkiln', 'scenes/breathkiln', selectionParts, ['prp_door']);

    const state = getScene3dSelection();
    expect(state.selected).toEqual(['prp_door']);
    expect(state.asset).toBe('breathkiln');

    // Selected item is ranked first for @ autocomplete mentions
    const ordered = orderPartsForMention(state.parts, state.selected);
    expect(ordered[0]?.name).toBe('prp_door');
  });
});
