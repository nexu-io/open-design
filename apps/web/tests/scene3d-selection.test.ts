// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isScene3dSelectionMessage, SCENE3D_SELECTION_EVENT } from '@open-design/contracts';
import {
  getScene3dSelection,
  orderPartsForMention,
  resetScene3dSelection,
  subscribeScene3dSelection,
} from '../src/runtime/scene3d-selection';

/** A well-formed broadcast, as the viewer emits it. */
function message(overrides: Record<string, unknown> = {}) {
  return {
    type: SCENE3D_SELECTION_EVENT,
    partId: 'prp_crate_lid',
    partIds: ['prp_crate_lid'],
    scenePath: 'scenes/crate',
    asset: 'crate',
    parts: [
      { name: 'prp_crate_body', path: '/root/prp_crate_body', type: 'MESH' },
      { name: 'prp_crate_lid', path: '/root/prp_crate_lid', type: 'MESH' },
      { name: 'cam_hero', path: '/root/cam_hero', type: 'CAMERA' },
    ],
    ...overrides,
  };
}

afterEach(() => {
  resetScene3dSelection();
  vi.restoreAllMocks();
});

describe('scene3d viewer selection', () => {
  /**
   * The viewer runs in an iframe, so anything on the page can post a
   * lookalike message — and these strings end up inside a prompt. Every
   * field is checked rather than cast.
   */
  describe('payload validation', () => {
    it('accepts a well-formed broadcast', () => {
      expect(isScene3dSelectionMessage(message())).toBe(true);
      // No selection is a real state, not a malformed one.
      expect(isScene3dSelectionMessage(message({ partId: null, partIds: [] }))).toBe(true);
    });

    it('rejects anything that is not exactly the expected shape', () => {
      const bad: unknown[] = [
        null,
        undefined,
        'od:scene3d-select',
        42,
        { type: 'something-else', partId: null, partIds: [], scenePath: null, asset: null, parts: [] },
        // partIds must be strings, not objects that stringify to something.
        message({ partIds: [{ toString: () => 'evil' }] }),
        // A part missing its path would produce a mention with no identity.
        message({ parts: [{ name: 'x', type: 'MESH' }] }),
        message({ parts: [{ name: 1, path: '/x', type: 'MESH' }] }),
        message({ parts: 'not-an-array' }),
        message({ partId: 7 }),
        message({ scenePath: {} }),
      ];
      for (const value of bad) {
        expect(isScene3dSelectionMessage(value)).toBe(false);
      }
    });
  });

  describe('store', () => {
    it('starts empty and records a broadcast', () => {
      expect(getScene3dSelection().parts).toEqual([]);

      const seen: number[] = [];
      const unsubscribe = subscribeScene3dSelection(() => seen.push(1));
      window.dispatchEvent(new MessageEvent('message', { data: message() }));

      const state = getScene3dSelection();
      expect(state.asset).toBe('crate');
      expect(state.scenePath).toBe('scenes/crate');
      expect(state.selected).toEqual(['prp_crate_lid']);
      expect(state.parts).toHaveLength(3);
      // Exactly one dispatch, exactly one notification: > 0 would also
      // pass a duplicate-listener double-invoke, the classic pub/sub bug.
      expect(seen.length).toBe(1);
      unsubscribe();
    });

    it('ignores a message that does not validate', () => {
      subscribeScene3dSelection(() => {});
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'od:scene3d-select' } }));
      expect(getScene3dSelection().parts).toEqual([]);

      window.dispatchEvent(new MessageEvent('message', { data: 'nonsense' }));
      expect(getScene3dSelection().asset).toBeNull();
    });

    /**
     * The viewer also dispatches a DOM CustomEvent, which is how it reaches
     * a host that renders it inline rather than in an iframe. Both paths
     * have to land in the same store or the composer's behaviour would
     * depend on how the page happens to be embedded.
     */
    it('accepts the DOM event path as well as postMessage', () => {
      subscribeScene3dSelection(() => {});
      document.dispatchEvent(
        new CustomEvent(SCENE3D_SELECTION_EVENT, { detail: message({ asset: 'lantern' }) }),
      );
      expect(getScene3dSelection().asset).toBe('lantern');
    });
  });

  describe('completion order', () => {
    const parts = [
      { name: 'zzz_last', path: '/root/zzz_last', type: 'MESH' },
      { name: 'lgt_key', path: '/root/lgt_key', type: 'LIGHT' },
      { name: 'aaa_first', path: '/root/aaa_first', type: 'MESH' },
      { name: 'cam_hero', path: '/root/cam_hero', type: 'CAMERA' },
    ];

    /**
     * What someone has just clicked is overwhelmingly what they are about to
     * talk about. That is the whole point of the feature — selection is the
     * noun — so it must not be buried wherever the alphabet puts it.
     */
    it('puts the selection first', () => {
      const ordered = orderPartsForMention(parts, ['zzz_last']);
      expect(ordered[0]!.name).toBe('zzz_last');
    });

    it('puts meshes before the compiler rig, and sorts each group by name', () => {
      const ordered = orderPartsForMention(parts, []).map((p) => p.name);
      expect(ordered).toEqual(['aaa_first', 'zzz_last', 'cam_hero', 'lgt_key']);
    });

    it('does not mutate its input', () => {
      const input = [...parts];
      orderPartsForMention(input, ['cam_hero']);
      expect(input.map((p) => p.name)).toEqual(parts.map((p) => p.name));
    });

    it('handles an empty asset', () => {
      expect(orderPartsForMention([], [])).toEqual([]);
    });
  });
});
