import { describe, expect, it } from 'vitest';
import {
  buildPartTreeLayout,
  primPaths,
  protoStem,
  type Scene3dTreeNodeInput,
  type Scene3dTreePrototypeRow,
  type Scene3dTreeInstanceRow,
} from '../src/api/scene3d-tree.js';

describe('protoStem', () => {
  it('strips trailing ordinals and indices', () => {
    expect(protoStem('prp_cap_1')).toBe('prp_cap');
    expect(protoStem('prp_cap_2')).toBe('prp_cap');
    expect(protoStem('prp_cap_3')).toBe('prp_cap');
    expect(protoStem('blade_3')).toBe('blade');
  });

  it('strips positional suffix tokens', () => {
    expect(protoStem('bracket_left')).toBe('bracket');
    expect(protoStem('bracket_right')).toBe('bracket');
    expect(protoStem('bracket_bl_side')).toBe('bracket');
    expect(protoStem('bracket_fr_top')).toBe('bracket');
    expect(protoStem('prp_batten_l')).toBe('prp_batten');
    expect(protoStem('prp_batten_r')).toBe('prp_batten');
  });

  it('preserves stems shorter than 4 characters', () => {
    expect(protoStem('box_1')).toBe('box_1');
    expect(protoStem('a_1')).toBe('a_1');
  });

  it('leaves clean names unchanged', () => {
    expect(protoStem('cam_hero')).toBe('cam_hero');
    expect(protoStem('lgt_key')).toBe('lgt_key');
    expect(protoStem('prp_collar')).toBe('prp_collar');
  });
});

describe('primPaths', () => {
  it('constructs hierarchical USD prim paths', () => {
    const parts = [
      { name: 'crate', parent: null },
      { name: 'lid', parent: 'crate' },
      { name: 'prp_handle', parent: 'lid' },
    ];
    const paths = primPaths(parts);
    expect(paths.get('crate')).toBe('/crate');
    expect(paths.get('lid')).toBe('/crate/lid');
    expect(paths.get('prp_handle')).toBe('/crate/lid/prp_handle');
  });

  it('guards against cycles gracefully', () => {
    const parts = [
      { name: 'a', parent: 'b' },
      { name: 'b', parent: 'a' },
    ];
    const paths = primPaths(parts);
    expect(paths.get('a')).toBeDefined();
    expect(paths.get('b')).toBeDefined();
  });

  it('handles orphaned parents as roots', () => {
    const parts = [
      { name: 'orphan', parent: 'missing_parent' },
    ];
    const paths = primPaths(parts);
    expect(paths.get('orphan')).toBe('/orphan');
  });
});

describe('buildPartTreeLayout', () => {
  const node = (
    name: string,
    parent: string | null = null,
    over: Partial<Scene3dTreeNodeInput> = {},
  ): Scene3dTreeNodeInput => ({
    name,
    parent,
    type: 'MESH',
    mesh: { verts: 8, faces: 6 },
    ...over,
  });

  it('returns empty array for empty input', () => {
    expect(buildPartTreeLayout([])).toEqual([]);
  });

  it('emits instance rows for singleton parts with correct depth', () => {
    const input: Scene3dTreeNodeInput[] = [
      node('cam_hero', null, { type: 'CAMERA', mesh: null }),
      node('lgt_key', null, { type: 'LIGHT', mesh: null }),
      node('crate', null),
      node('lid', 'crate'),
      node('handle', 'lid'),
    ];
    const rows = buildPartTreeLayout(input);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => [r.kind, r.depth, r.path])).toEqual([
      ['instance', 0, '/cam_hero'],
      ['instance', 0, '/lgt_key'],
      ['instance', 0, '/crate'],
      ['instance', 1, '/crate/lid'],
      ['instance', 2, '/crate/lid/handle'],
    ]);
  });

  it('collapses 3 or more clone instances into a prototype row', () => {
    const input: Scene3dTreeNodeInput[] = [
      node('prp_cap', null, { glyphs: 'w' }),
      node('prp_cap_2', null, { glyphs: 'a' }),
      node('prp_cap_3', null, { glyphs: 'x' }),
      node('prp_cap_4', null, { groundGap: 0.012 }),
    ];
    const rows = buildPartTreeLayout(input);
    expect(rows).toHaveLength(1);
    const proto = rows[0] as Scene3dTreePrototypeRow;
    expect(proto.kind).toBe('prototype');
    expect(proto.stem).toBe('prp_cap');
    expect(proto.count).toBe(4);
    expect(proto.memberNames).toEqual(['prp_cap', 'prp_cap_2', 'prp_cap_3', 'prp_cap_4']);
    expect(proto.glyphs).toBe('awx');
    expect(proto.worstGroundGap).toBe(0.012);
  });

  it('does not collapse 1 or 2 sibling lookalikes', () => {
    const input: Scene3dTreeNodeInput[] = [
      node('prp_batten_l', null),
      node('prp_batten_r', null),
    ];
    const rows = buildPartTreeLayout(input);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.kind).toBe('instance');
    expect((rows[0] as Scene3dTreeInstanceRow).name).toBe('prp_batten_l');
    expect(rows[1]!.kind).toBe('instance');
    expect((rows[1] as Scene3dTreeInstanceRow).name).toBe('prp_batten_r');
  });

  it('walks first instance subtree beneath prototype row once', () => {
    const input: Scene3dTreeNodeInput[] = [
      // Assembly 1
      node('arrow_0', null, { type: 'EMPTY', mesh: null }),
      node('arrow_shaft_0', 'arrow_0'),
      node('arrow_head_0', 'arrow_0'),
      // Assembly 2
      node('arrow_1', null, { type: 'EMPTY', mesh: null }),
      node('arrow_shaft_1', 'arrow_1'),
      node('arrow_head_1', 'arrow_1'),
      // Assembly 3
      node('arrow_2', null, { type: 'EMPTY', mesh: null }),
      node('arrow_shaft_2', 'arrow_2'),
      node('arrow_head_2', 'arrow_2'),
    ];
    const rows = buildPartTreeLayout(input);
    // 1 prototype row for arrow ×3, plus shaft and head inside arrow_0
    expect(rows).toHaveLength(3);
    expect(rows[0]!.kind).toBe('prototype');
    expect((rows[0] as Scene3dTreePrototypeRow).stem).toBe('arrow');
    expect((rows[0] as Scene3dTreePrototypeRow).count).toBe(3);
    expect(rows[1]!.kind).toBe('instance');
    expect((rows[1] as Scene3dTreeInstanceRow).name).toBe('arrow_shaft_0');
    expect(rows[1]!.depth).toBe(1);
    expect(rows[2]!.kind).toBe('instance');
    expect((rows[2] as Scene3dTreeInstanceRow).name).toBe('arrow_head_0');
    expect(rows[2]!.depth).toBe(1);
  });
});
