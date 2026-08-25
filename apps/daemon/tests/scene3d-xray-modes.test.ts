import { describe, expect, it } from 'vitest';
import { XRAY_MODES, XRAY_GHOST_MODES } from '@open-design/scene3d';
import { SCENE3D_XRAY_MODES, SCENE3D_XRAY_GHOST_MODES } from '@open-design/contracts';

/**
 * The x-ray mode catalogue (packages/scene3d/src/viewer/xray-modes.ts —
 * injected into the kit page) and its contracts mirror
 * (packages/contracts/src/api/scene3d-xray-modes.ts — rendered by the
 * host compile panel) live in different packages on purpose: the web app
 * may not import the compiler. The daemon depends on both, so this is the
 * seam where drift is caught — same discipline as the issue-title pin
 * beside this file. Editing a name, description or ramp on one side goes
 * red here instead of quietly forking the two menus.
 */
describe('scene3d x-ray mode catalogue parity', () => {
  it('mirrors the GL viewer modes entry for entry', () => {
    expect(SCENE3D_XRAY_MODES).toEqual(XRAY_MODES);
  });

  it('mirrors the ghost modes entry for entry', () => {
    expect(SCENE3D_XRAY_GHOST_MODES).toEqual(XRAY_GHOST_MODES);
  });

  it('shares the curvature entry by value across the two triples', () => {
    // The one slot whose meaning is identical on both surfaces must be the
    // SAME entry, not a retyped twin.
    expect(XRAY_GHOST_MODES[0]).toEqual(XRAY_MODES[0]);
    expect(SCENE3D_XRAY_GHOST_MODES[0]).toEqual(SCENE3D_XRAY_MODES[0]);
  });
});
