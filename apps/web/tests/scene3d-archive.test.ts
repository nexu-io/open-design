import { describe, expect, it } from 'vitest';
import { modelRowsFromArtifactManifest } from '../src/runtime/scene3d-assets';
import { buildZip } from '../src/runtime/zip';

const deliverablesFor = (scene: string) => [
  `${scene}/out/scene.usda`,
  `${scene}/out/scene.glb`,
  `${scene}/out/scene.obj`,
  `${scene}/out/scene.mtl`,
  `${scene}/out/scene.fbx`,
  `${scene}/out/scene.usdz`,
];

/** A single compiled scene, as its sidecar describes it. */
const singleScene = {
  kind: 'scene3d',
  title: 'crate',
  metadata: {
    scenePath: 'scenes/crate',
    deliverables: deliverablesFor('scenes/crate'),
  },
} as never;

/** A kit: several scenes, each producing identically named files. */
const kit = {
  kind: 'scene3d',
  title: 'Asset kit',
  metadata: {
    scenes: [
      { scenePath: 'scenes/crate', name: 'crate' },
      { scenePath: 'scenes/lantern', name: 'lantern' },
    ],
    deliverables: [...deliverablesFor('scenes/crate'), ...deliverablesFor('scenes/lantern')],
  },
} as never;

const rowsOf = (manifest: never) => modelRowsFromArtifactManifest('p1', manifest, 'All scenes');

describe('scene3d model rows and bulk archives', () => {
  /**
   * The per-format chips hide `.mtl` and `.bin` because either one alone is a
   * download nobody can open. An archive that inherited that filter would
   * ship an OBJ with no materials — a subtler kind of broken, because the
   * file opens and the asset is simply wrong.
   */
  it('shows openable formats as chips while the archive keeps the companions', () => {
    const [crate] = rowsOf(singleScene);
    expect(crate!.items.map((i) => i.ext)).not.toContain('mtl');
    expect(crate!.items).toHaveLength(5);
    expect(crate!.archive).toHaveLength(6);
    expect(crate!.archive.map((f) => f.zipPath)).toContain('scene.mtl');
  });

  it('gives a single scene no redundant folder inside its archive', () => {
    const [crate] = rowsOf(singleScene);
    expect(crate!.archive.every((f) => !f.zipPath.includes('/'))).toBe(true);
    expect(crate!.archiveName).toBe('crate.zip');
  });

  it('adds no gathered row when there is only one scene', () => {
    expect(rowsOf(singleScene)).toHaveLength(1);
  });

  /**
   * A kit's whole point is that the scenes belong together, so "give me the
   * set as GLB" is a real request that clicking twelve individual links does
   * not answer.
   */
  describe('the gathered row', () => {
    const rows = rowsOf(kit);
    const bulk = rows[rows.length - 1]!;

    it('comes last, labelled, and marked as not being a scene', () => {
      expect(rows).toHaveLength(3);
      expect(bulk.label).toBe('All scenes');
      expect(bulk.bulk).toBe(true);
    });

    /**
     * Every chip names a FORMAT. A chip labelled "all" reports a quantity
     * and says nothing about what you are about to open.
     */
    it('offers one chip per format, each an archive of that format', () => {
      expect(bulk.items.map((i) => i.ext)).toEqual(['glb', 'usda', 'usdz', 'obj', 'fbx']);
      for (const item of bulk.items) {
        expect(item.archive).toBeDefined();
        expect(item.downloadName).toBe(`All_scenes-${item.ext}.zip`);
      }
    });

    it('puts every scene into each format archive, foldered so names cannot collide', () => {
      const glb = bulk.items.find((i) => i.ext === 'glb')!;
      expect(glb.archive!.map((f) => f.zipPath)).toEqual(['crate/scene.glb', 'lantern/scene.glb']);
    });

    /**
     * Companions ride with the format they serve. A GLB bundle has no use
     * for an `.mtl`; an OBJ bundle without one is geometry with no
     * materials.
     */
    it('routes each companion into the archive of the format it supports', () => {
      const obj = bulk.items.find((i) => i.ext === 'obj')!;
      expect(obj.archive!.map((f) => f.zipPath).sort()).toEqual([
        'crate/scene.mtl',
        'crate/scene.obj',
        'lantern/scene.mtl',
        'lantern/scene.obj',
      ]);
      const glb = bulk.items.find((i) => i.ext === 'glb')!;
      expect(glb.archive!.some((f) => f.zipPath.endsWith('.mtl'))).toBe(false);
    });

    it('still offers everything at once, foldered by scene', () => {
      expect(bulk.archive).toHaveLength(12);
      expect(bulk.archive.every((f) => /^(crate|lantern)\//.test(f.zipPath))).toBe(true);
    });
  });

  it('is empty when nothing is compiled', () => {
    expect(rowsOf(null as never)).toEqual([]);
    expect(rowsOf({ metadata: { deliverables: 'nope' } } as never)).toEqual([]);
  });

  /**
   * The archive carries binary containers — GLB, USDZ, FBX. The writer used
   * to accept only strings and UTF-8 encode them, which does not encode a
   * GLB so much as destroy it: every byte that is not valid UTF-8 becomes
   * U+FFFD. This reads the bytes back out of the archive it produced.
   */
  it('round-trips binary bytes without corrupting them', async () => {
    const payload = new Uint8Array([
      0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
      0xff, 0xfe, 0x80, 0x81, 0xc0, 0xc1, 0x00, 0xed, 0xa0, 0x80,
    ]);
    const blob = buildZip([
      { path: 'crate/scene.glb', content: payload },
      { path: 'notes.txt', content: 'héllo' },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);

    const view = new DataView(bytes.buffer);
    const nameLen = view.getUint16(26, true);
    expect(view.getUint32(22, true)).toBe(payload.length);
    const stored = bytes.slice(30 + nameLen, 30 + nameLen + payload.length);
    expect([...stored]).toEqual([...payload]);
  });
});
