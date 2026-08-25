/**
 * The x-ray mode vocabulary — the ONE place the names, descriptions, ramp
 * strips and end labels live.
 *
 * Two surfaces draw this menu: the kit page's GL viewer (kit.ts injects
 * `XRAY_MODES` into the generated page) and the host compile panel's
 * prerendered-frame energize (via the contracts mirror,
 * `packages/contracts/src/api/scene3d-xray-modes.ts` — scene3d is the
 * bottom layer and cannot be imported by the web app, the same split the
 * issue-code titles use). A daemon test pins mirror ↔ canonical, so the
 * two menus can never drift apart silently.
 *
 * The catalogues share entries where the DATA is genuinely the same and
 * diverge where it is not: a prerendered frame has no per-pixel facing or
 * clearance, so the ghost triple keeps the kit's curvature entry verbatim,
 * re-describes "Normals" as what the ghost actually shows, and fills the
 * third slot with the structure view instead of clearance. One module, so
 * the divergence is a documented decision instead of two drifting copies.
 */

export interface XrayModeEntry {
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

/** The GL viewer's three modes — real normals and measured clearance. */
export const XRAY_MODES: readonly XrayModeEntry[] = [
  {
    name: "Curvature",
    lo: "cavity",
    hi: "ridge",
    desc: "How the form is built — hollows to ridges",
    ramp: "linear-gradient(90deg, #123a5a, #8fa6a3, #c8963c)",
  },
  {
    name: "Normals",
    lo: "outward",
    hi: "flipped",
    desc: "Faces pointing the wrong way",
    ramp: "linear-gradient(90deg, #1e7a8c 0 50%, #e5594a 50% 100%)",
  },
  {
    name: "Clearance",
    lo: "clear",
    hi: "touching",
    desc: "Gaps, contacts and buried parts",
    ramp: "linear-gradient(90deg, #0b1026, #123a5a, #1e7a8c, #8fa6a3, #c8963c, #e5594a)",
  },
];

/**
 * The compile panel's ghost triple, over prerendered frames. Curvature is
 * the kit's entry BY REFERENCE; the other two describe what the ghost can
 * honestly show from pixels + the object-index map.
 */
export const XRAY_GHOST_MODES: readonly XrayModeEntry[] = [
  XRAY_MODES[0]!,
  {
    name: "Normals",
    lo: "shadow",
    hi: "lit",
    desc: "Translucent ghost, cool structure lines",
    ramp: "linear-gradient(90deg, #0b1026, #1e7a8c, #bfe4e9)",
  },
  {
    name: "Structure",
    lo: "body",
    hi: "contour",
    desc: "Contours only — the wireframe read",
    ramp: "linear-gradient(90deg, #0b1026 0 55%, #8fd0dc 55% 100%)",
  },
];
