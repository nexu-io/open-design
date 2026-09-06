// The x-ray mode catalogue, MIRRORED from the canonical source at
// `packages/scene3d/src/viewer/xray-modes.ts` — the same split the issue
// codes use (scene3d is the bottom layer; the web app can only see this
// package). The kit page injects the canonical values; the host compile
// panel renders these. A daemon test
// (`apps/daemon/tests/scene3d-xray-modes.test.ts`) pins mirror ↔ canonical
// entry for entry, so editing one without the other goes red instead of
// letting the two menus drift.

export interface Scene3dXrayModeEntry {
  /** Menu row title; also the vocabulary users speak ("normals mode"). */
  name: string;
  /** Ramp end labels — what the LOW end of the strip means. */
  lo: string;
  /** …and the HIGH end. */
  hi: string;
  /** One-line answer to "what question does this view answer". */
  desc: string;
  /** CSS gradient for the row's ramp strip. */
  ramp: string;
}

/** The kit page's GL viewer modes — real normals and measured clearance. */
export const SCENE3D_XRAY_MODES: readonly Scene3dXrayModeEntry[] = [
  {
    name: 'Curvature',
    lo: 'cavity',
    hi: 'ridge',
    desc: 'How the form is built — hollows to ridges',
    ramp: 'linear-gradient(90deg, #123a5a, #8fa6a3, #c8963c)',
  },
  {
    name: 'Normals',
    lo: 'outward',
    hi: 'flipped',
    desc: 'Faces pointing the wrong way',
    ramp: 'linear-gradient(90deg, #1e7a8c 0 50%, #e5594a 50% 100%)',
  },
  {
    name: 'Clearance',
    lo: 'clear',
    hi: 'touching',
    desc: 'Gaps, contacts and buried parts',
    ramp: 'linear-gradient(90deg, #0b1026, #123a5a, #1e7a8c, #8fa6a3, #c8963c, #e5594a)',
  },
];

/**
 * The compile panel's ghost triple over prerendered frames: curvature is
 * the kit entry verbatim; the other two describe what pixels + the
 * object-index map can honestly show (no per-pixel facing or clearance in
 * a prerendered frame — the canonical module documents the divergence).
 */
export const SCENE3D_XRAY_GHOST_MODES: readonly Scene3dXrayModeEntry[] = [
  SCENE3D_XRAY_MODES[0]!,
  {
    name: 'Normals',
    lo: 'shadow',
    hi: 'lit',
    desc: 'Translucent ghost, cool structure lines',
    ramp: 'linear-gradient(90deg, #0b1026, #1e7a8c, #bfe4e9)',
  },
  {
    name: 'Structure',
    lo: 'body',
    hi: 'contour',
    desc: 'Contours only — the wireframe read',
    ramp: 'linear-gradient(90deg, #0b1026 0 55%, #8fd0dc 55% 100%)',
  },
];
