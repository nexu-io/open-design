import { Issue } from "../types.js";
import { ISSUE_CODES } from "../errors.js";
import { SheetMeasurement, edgeDifference } from "../sheet/measure.js";
import { DecodedImage } from "../sheet/png.js";
import { edgeOf } from "../sheet/measure.js";

/**
 * Rules for the 2D asset class.
 *
 * These are the defects that are invisible in the asset and obvious in the
 * engine: a flipbook cell that bleeds into its neighbour, a strip that will
 * not tile, a tintable particle that secretly carries hue, a cubemap whose
 * faces do not meet. Every one is a pixel measurement, so every one is a
 * fact rather than a judgement — the same reason the proof-frame rules
 * exist on the 3D side.
 */

export type SheetKind = "sprite" | "flipbook" | "particle" | "beam" | "sky";

export interface SheetSpec {
  /** Project-relative path. */
  file: string;
  kind: SheetKind;
  /**
   * How the engine composites this art. `alpha` (the default) blends on the
   * alpha channel, so the silhouette must reach full alpha and the checks
   * assume it. `additive` sums RGB into the framebuffer and ignores alpha —
   * a fire or beam sheet legitimately never reaches full alpha, so the
   * alpha-carries-the-silhouette rules are gated off and the dark-border
   * rule (a bright frame flashes as a rectangle when summed) takes over.
   */
  blend?: "alpha" | "additive";
  /** Flipbook grid, `[cols, rows]`. */
  grid?: [number, number];
  /** The engine tints this art, so it must ship neutral. */
  tint?: boolean;
  /** Fraction that must stay clear of the outer border (particles). */
  inset?: number;
  /** Cube face this image is, for sky sets. */
  face?: "ft" | "bk" | "lf" | "rt" | "up" | "dn";
  /** Cube set this face belongs to. */
  set?: string;
}

export interface SheetLintInput {
  specs: SheetSpec[];
  /** Measurements keyed by spec file; absent means the file was unreadable. */
  measurements: Map<string, SheetMeasurement>;
  /** Decoded images, needed for cross-face seam comparison. */
  images?: Map<string, DecodedImage>;
  /** Files that were declared but could not be found. */
  missing?: string[];
  /** Files that were found but failed to decode, with the reason. */
  unreadable?: Map<string, string>;
  /** Largest edge a sheet may have. From `conventions.sheets` — every other
   *  lint family takes its thresholds from the contract, and this one only
   *  looked like it did: the field existed, nothing ever set it. */
  maxDimension?: number;
  /** Mean channel difference above which a seam counts as broken. */
  seamTolerance?: number;
  /** Brightest channel a dark border may carry before it reads as a lit
   *  rectangle once summed additively. */
  additiveBorderMax?: number;
  /** Lowest acceptable peak alpha before the hot core is judged missing. */
  fullAlphaMin?: number;
  /** Smallest drawn fraction before the sheet is judged sparse. */
  sparseCoverageMin?: number;
  /** Largest hue fraction a tintable sheet may carry. */
  tintHueMax?: number;
  /** Most pixels a flipbook cell's inner border may carry before it bleeds. */
  cellBleedMax?: number;
  /** Largest mean channel difference before a beam is judged not tileable. */
  beamSeamMax?: number;
  /** Most border-touching pixels a particle sheet may have. */
  particleBorderTouchMax?: number;
  /** Largest non-opaque fraction a sky face may have. */
  skyNonOpaqueMax?: number;
  /** Largest clipped fraction a sky face may have. */
  skyClipMax?: number;
}

/**
 * Defaults for the 2D sheet rules, in ONE place so the contract and this
 * module cannot drift apart. `normalizeContract` reads them for
 * `conventions.sheets`; the `??` below is for direct callers (tests).
 *
 * 4096 is the production ceiling: UE Niagara and Effekseer routinely bake
 * 2048–4096² flipbooks, so a 1024 default would flag real work. 16384 is the
 * hard cap several runtimes impose (Godot's Basis limit); above it the texture
 * simply will not load. The additive border max is small but above dither and
 * codec noise.
 *
 * These used to be module constants with an override field nothing ever
 * populated — the comment invited users to "reach for the override" that did
 * not exist, and this was the one lint family in the range that judged by a
 * number the project could not set.
 */
export const SHEET_DEFAULTS = {
  maxDimension: 4096,
  seamTolerance: 6,
  additiveBorderMax: 24,
  // The rest were module constants with no contract path at all — the least
  // contract-governed rule family in the range. Each default below is the
  // exact number that shipped as a hardcoded literal; only the ability to
  // author it is new.
  /** 250/255: a couple of dither/codec-noise levels short of true 255, so a
   *  legitimately opaque core is not flagged for lossy compression. */
  fullAlphaMin: 250,
  /** 0.5% of the sheet: below this the texture is mostly empty space the
   *  GPU still samples every frame. */
  sparseCoverageMin: 0.005,
  /** 0.1% of visible pixels: a couple of anti-aliased fringe pixels are
   *  tolerated before tinted art is judged to fight the engine's multiply. */
  tintHueMax: 0.001,
  /** Zero tolerance: any pixel inside a cell's border is a real bleed risk
   *  once the GPU filters across the cell boundary. */
  cellBleedMax: 0,
  /** 2: a couple of dither/codec-noise levels of first/last-column
   *  difference are tolerated before a beam is judged not tileable. */
  beamSeamMax: 2,
  /** Zero tolerance: a particle sheet is meant to sit inset from the atlas
   *  edge, so any border-touching pixel will clip once atlased. */
  particleBorderTouchMax: 0,
  /** Zero tolerance: a sky face is meant to be fully opaque, so any
   *  non-opaque pixel shows the void behind it. */
  skyNonOpaqueMax: 0,
  /** 0.2% of the face: a small clipped fraction reads as legitimate
   *  highlight/shadow rather than posterisation. */
  skyClipMax: 0.002,
} as const;

type Edge = "top" | "bottom" | "left" | "right";

/**
 * Cube adjacency for the `ft/bk/lf/rt/up/dn` naming — all TWELVE edges.
 *
 * The horizontal ring (4 vertical edges) is unambiguous: looking outward,
 * front's right edge meets right's left edge, and so on around. The eight cap
 * edges — each side's top row to the `up` face and its bottom row to the `dn`
 * face — carry a real orientation ambiguity: which way the shared row runs
 * differs between the GL/DX/RenderMan conventions, and a flat fixture cannot
 * tell them apart. So cap seams are matched with `cap: true`, which compares
 * the two rows under BOTH pixel orderings and keeps the smaller difference:
 * a genuinely continuous cap passes whatever the convention, and only a face
 * that meets its neighbour under NEITHER ordering is a real seam. The ring
 * stays exact, because there the convention is fixed.
 */
const CUBE_SEAMS: Array<{ a: SheetSpec["face"]; aEdge: Edge; b: SheetSpec["face"]; bEdge: Edge; cap?: boolean }> = [
  // Vertical ring — exact.
  { a: "ft", aEdge: "right", b: "rt", bEdge: "left" },
  { a: "rt", aEdge: "right", b: "bk", bEdge: "left" },
  { a: "bk", aEdge: "right", b: "lf", bEdge: "left" },
  { a: "lf", aEdge: "right", b: "ft", bEdge: "left" },
  // Bottom cap — each side's bottom row meets the `dn` face.
  { a: "ft", aEdge: "bottom", b: "dn", bEdge: "top", cap: true },
  { a: "bk", aEdge: "bottom", b: "dn", bEdge: "bottom", cap: true },
  { a: "rt", aEdge: "bottom", b: "dn", bEdge: "right", cap: true },
  { a: "lf", aEdge: "bottom", b: "dn", bEdge: "left", cap: true },
  // Top cap — each side's top row meets the `up` face.
  { a: "ft", aEdge: "top", b: "up", bEdge: "bottom", cap: true },
  { a: "bk", aEdge: "top", b: "up", bEdge: "top", cap: true },
  { a: "rt", aEdge: "top", b: "up", bEdge: "right", cap: true },
  { a: "lf", aEdge: "top", b: "up", bEdge: "left", cap: true },
];

export function lintSheets(input: SheetLintInput, issues: Issue[]): void {
  const maxDimension = input.maxDimension ?? SHEET_DEFAULTS.maxDimension;
  const seamTolerance = input.seamTolerance ?? SHEET_DEFAULTS.seamTolerance;
  const additiveBorderMax = input.additiveBorderMax ?? SHEET_DEFAULTS.additiveBorderMax;
  const fullAlphaMin = input.fullAlphaMin ?? SHEET_DEFAULTS.fullAlphaMin;
  const sparseCoverageMin = input.sparseCoverageMin ?? SHEET_DEFAULTS.sparseCoverageMin;
  const tintHueMax = input.tintHueMax ?? SHEET_DEFAULTS.tintHueMax;
  const cellBleedMax = input.cellBleedMax ?? SHEET_DEFAULTS.cellBleedMax;
  const beamSeamMax = input.beamSeamMax ?? SHEET_DEFAULTS.beamSeamMax;
  const particleBorderTouchMax = input.particleBorderTouchMax ?? SHEET_DEFAULTS.particleBorderTouchMax;
  const skyNonOpaqueMax = input.skyNonOpaqueMax ?? SHEET_DEFAULTS.skyNonOpaqueMax;
  const skyClipMax = input.skyClipMax ?? SHEET_DEFAULTS.skyClipMax;

  for (const file of input.missing ?? []) {
    issues.push({
      code: ISSUE_CODES.SHEET_MISSING,
      severity: "error",
      message: `declared sheet '${file}' does not exist`,
      hint: "fix the path in the contract or produce the sheet",
      file,
    });
  }
  for (const [file, reason] of input.unreadable ?? []) {
    issues.push({
      code: ISSUE_CODES.SHEET_UNREADABLE,
      severity: "error",
      message: `sheet '${file}' could not be decoded: ${reason}`,
      file,
    });
  }

  for (const spec of input.specs) {
    const m = input.measurements.get(spec.file);
    if (!m) continue;
    // The [subject] slot carries the sheet's IDENTITY — its file stem, which
    // for a kernel-baked atlas is the shader id — the way every other rule
    // family brackets its subject. The path stays in `file`. Without a
    // target, a scene with two flipbooks printed findings no reader could
    // attribute from the terse stream, where only the brackets survive.
    /* The subject is the sheet's PATH, not its stem. A stem is a display
       convenience, and two sheets in different directories share one —
       which made two independent defects one identity, so the second was
       deduped away and never reported. A subject is what a finding is
       ABOUT, so it has to be the thing that is unique. */
    const at = { file: spec.file, target: spec.file };

    // POT is judged on the addressing unit. For a flipbook whose grid divides
    // evenly the shader addresses CELLS, so a 768² sheet of 256² cells is
    // fine even though 768 is not a power of two — the atlas-POT rule below is
    // a false positive there, and cell-POT (W-604 in the flipbook branch) is
    // the invariant that actually governs mip sampling. Every other sheet is
    // addressed whole, so the atlas itself must be power-of-two.
    const cellAddressed = spec.kind === "flipbook" && m.cells?.divides === true;
    if (!cellAddressed && !m.powerOfTwo) {
      issues.push({
        code: ISSUE_CODES.SHEET_NOT_POWER_OF_TWO,
        severity: "error",
        message: `${m.width}x${m.height} is not power-of-two`,
        hint: "GPUs sample power-of-two textures without padding; resize to the nearest power of two",
        ...at,
      });
    }
    if (m.width > maxDimension || m.height > maxDimension) {
      issues.push({
        code: ISSUE_CODES.SHEET_TOO_LARGE,
        severity: "error",
        message: `${m.width}x${m.height} exceeds the ${maxDimension}px cap`,
        ...at,
      });
    }
    // Additive art carries its silhouette in RGB, so "drawn" is measured by
    // luminance, not alpha — an alpha read would call a bright flame empty.
    const additive = spec.blend === "additive";
    const drawnRatio = additive ? m.litRatio : m.opaqueRatio;

    if (drawnRatio === 0) {
      issues.push({
        code: ISSUE_CODES.SHEET_EMPTY,
        severity: "error",
        message: "nothing is drawn — the image is empty",
        ...at,
      });
      continue;
    }

    if (spec.kind !== "sky") {
      // E-606 asserts alpha carries the silhouette. That is false for an
      // additive sheet, which is why declaring additive is a trade: this
      // check is gated off, and the dark-border check below stands in.
      if (!additive && m.maxAlpha < fullAlphaMin) {
        issues.push({
          code: ISSUE_CODES.SHEET_NO_FULL_ALPHA,
          severity: "error",
          message: `never reaches full alpha (max ${m.maxAlpha}) — the hot core is missing`,
          hint: "an effect that never hits opaque reads as washed out at every intensity; governed by conventions.sheets.fullAlphaMin",
          ...at,
        });
      }
      if (drawnRatio < sparseCoverageMin) {
        issues.push({
          code: ISSUE_CODES.SHEET_SPARSE,
          severity: "warning",
          message: `only ${(drawnRatio * 100).toFixed(2)}% of the sheet is drawn`,
          hint: "most of this texture is empty space the GPU still samples; governed by conventions.sheets.sparseCoverageMin",
          ...at,
        });
      }
    }

    // The compensating check for the E-606 opt-out: additive summing turns a
    // bright border into a visible lit rectangle at the quad's edge.
    if (additive && m.borderMaxLuminance > additiveBorderMax) {
      issues.push({
        code: ISSUE_CODES.SHEET_ADDITIVE_BRIGHT_BORDER,
        severity: "warning",
        message: `additive sheet's border reaches luminance ${m.borderMaxLuminance} — the quad edge will flash as a lit rectangle`,
        hint: "fade the art to black before it reaches the edge",
        detail: { borderMaxLuminance: m.borderMaxLuminance },
        ...at,
      });
    }

    // Tintable art must be neutral: the engine multiplies a colour through
    // it, and baked hue fights whatever the engine asks for.
    if (spec.tint && m.hueRatio > tintHueMax) {
      issues.push({
        code: ISSUE_CODES.SHEET_TINTABLE_HAS_HUE,
        severity: "error",
        message: `${(m.hueRatio * 100).toFixed(1)}% of visible pixels carry hue, but this sheet is tinted by the engine`,
        hint: "author it neutral grey; the engine supplies the colour; governed by conventions.sheets.tintHueMax",
        ...at,
      });
    }

    if (spec.kind === "flipbook") {
      const cells = m.cells;
      if (!cells || !spec.grid) {
        issues.push({
          code: ISSUE_CODES.SHEET_GRID_MISMATCH,
          severity: "error",
          message: "flipbook declares no grid",
          hint: "set `grid: [cols, rows]` so the frames can be sliced",
          ...at,
        });
      } else if (!cells.divides) {
        issues.push({
          code: ISSUE_CODES.SHEET_GRID_MISMATCH,
          severity: "error",
          message: `${m.width}x${m.height} does not divide evenly into ${cells.cols}x${cells.rows}`,
          hint: "a fractional cell size tears every frame",
          ...at,
        });
      } else {
        if (cells.blank.length > 0) {
          issues.push({
            code: ISSUE_CODES.SHEET_BLANK_FRAMES,
            severity: "error",
            message: `${cells.blank.length} of ${cells.cols * cells.rows} frames are blank (${cells.blank.slice(0, 6).join(", ")})`,
            hint: "a blank cell plays as a dropped frame",
            detail: { blank: cells.blank },
            ...at,
          });
        }
        if (cells.bleed > cellBleedMax) {
          issues.push({
            code: ISSUE_CODES.SHEET_CELL_BLEED,
            severity: "error",
            message: `${cells.bleed} pixels sit inside a cell's 2px border — frames will bleed into each other`,
            hint: "inset each frame so filtering cannot sample its neighbour; governed by conventions.sheets.cellBleedMax",
            ...at,
          });
        }
        if (cells.distinct <= 1) {
          issues.push({
            code: ISSUE_CODES.SHEET_STATIC_FLIPBOOK,
            severity: "warning",
            message: "every frame is identical — this flipbook does not animate",
            // The uniform's NAME must reach the reader here: a kernel-baked
            // flipbook goes static precisely when the author never read
            // uS3dTime, and no other message will ever utter that word to
            // someone who does not already know it.
            hint: "for a kernel-baked sheet, animate from uS3dTime (0..1 across the frames) — loop on the unit circle (cos/sin(uS3dTime * 6.2832)) so the last frame flows into the first; for hand-drawn art, vary the cells",
            ...at,
          });
        }
        if (!cells.cellPowerOfTwo) {
          const cellW = m.width / cells.cols;
          const cellH = m.height / cells.rows;
          issues.push({
            code: ISSUE_CODES.SHEET_CELL_NOT_POWER_OF_TWO,
            severity: "warning",
            message: `${cellW}x${cellH} cells are not power-of-two — frames tear under mip sampling even though the atlas is ${m.width}x${m.height}`,
            hint: "size the sheet so width/cols and height/rows are each a power of two",
            detail: { cellW, cellH, cols: cells.cols, rows: cells.rows },
            ...at,
          });
        }
      }
    }

    if (spec.kind === "particle" && m.borderTouch > particleBorderTouchMax) {
      issues.push({
        code: ISSUE_CODES.SHEET_BORDER_TOUCH,
        severity: "error",
        message: `${m.borderTouch} pixels touch the outer border and will clip once atlased`,
        hint: "inset the art away from the edge; governed by conventions.sheets.particleBorderTouchMax",
        ...at,
      });
    }

    if (spec.kind === "beam") {
      if (m.seamLeftRight > beamSeamMax) {
        issues.push({
          code: ISSUE_CODES.SHEET_NOT_TILEABLE,
          severity: "error",
          message: `first and last columns differ by ${m.seamLeftRight.toFixed(1)} — the strip will not tile`,
          // The stdlib's answer is NAMED here for the same reason the static-
          // flipbook hint names uS3dTime: no other message will ever utter
          // "_tiled" to an author who does not already know the family exists.
          hint: "make the two ends identical so the repeat is seamless — for a kernel bake, use the two-argument tiled stdlib, e.g. s3d_fbm_tiled(uv * 6.0, vec2(6.0)) with the period matching your pre-scale; governed by conventions.sheets.beamSeamMax",
          ...at,
        });
      }
      if (m.longEdgeTouch > 0) {
        issues.push({
          code: ISSUE_CODES.SHEET_LONG_EDGE_TOUCH,
          severity: "error",
          message: `${m.longEdgeTouch} pixels sit on the strip's long edge`,
          hint: "a ribbon that touches its own edge shows a hard cut where it ends",
          ...at,
        });
      }
    }

    if (spec.kind === "sky") {
      if (m.nonOpaqueRatio > skyNonOpaqueMax) {
        issues.push({
          code: ISSUE_CODES.SHEET_SKY_NOT_OPAQUE,
          severity: "error",
          message: `${(m.nonOpaqueRatio * 100).toFixed(2)}% of the face is not fully opaque`,
          hint: "a transparent skybox face shows the void behind it; governed by conventions.sheets.skyNonOpaqueMax",
          ...at,
        });
      }
      if (m.clippedRatio > skyClipMax) {
        issues.push({
          code: ISSUE_CODES.SHEET_SKY_CLIPPED,
          severity: "warning",
          message: `${(m.clippedRatio * 100).toFixed(1)}% of the face clips to pure black or white`,
          hint: "clipped sky bands read as posterised in-engine; governed by conventions.sheets.skyClipMax",
          ...at,
        });
      }
    }
  }

  lintCubeSets(input, issues, seamTolerance);
}

/** Cross-face checks: completeness of the set, then seam continuity. */
function lintCubeSets(input: SheetLintInput, issues: Issue[], tolerance: number): void {
  const sets = new Map<string, Map<string, SheetSpec>>();
  for (const spec of input.specs) {
    if (spec.kind !== "sky" || !spec.set || !spec.face) continue;
    if (!sets.has(spec.set)) sets.set(spec.set, new Map());
    sets.get(spec.set)!.set(spec.face, spec);
  }

  for (const [name, faces] of sets) {
    const required = ["ft", "bk", "lf", "rt", "up", "dn"];
    const absent = required.filter((face) => !faces.has(face));
    if (absent.length > 0) {
      issues.push({
        code: ISSUE_CODES.SHEET_CUBE_INCOMPLETE,
        severity: "error",
        message: `sky set '${name}' is missing ${absent.length} face(s): ${absent.join(", ")}`,
        hint: "a cube needs all six faces or the consumer sees holes",
        target: name,
      });
      continue;
    }

    const images = input.images;
    if (!images) continue;
    for (const seam of CUBE_SEAMS) {
      const a = faces.get(seam.a!);
      const b = faces.get(seam.b!);
      if (!a || !b) continue;
      const imageA = images.get(a.file);
      const imageB = images.get(b.file);
      if (!imageA || !imageB) continue;
      const ea = edgeOf(imageA, seam.aEdge);
      const eb = edgeOf(imageB, seam.bEdge);
      // Cap edges carry an orientation ambiguity, so accept the better of the
      // two pixel orderings; ring edges are exact (forward only).
      const difference = seam.cap
        ? Math.min(edgeDifference(ea, eb), edgeDifference(ea, eb, true))
        : edgeDifference(ea, eb);
      if (difference > tolerance) {
        issues.push({
          code: ISSUE_CODES.SHEET_SEAM_BREAK,
          severity: "error",
          message: `sky set '${name}': ${seam.a}.${seam.aEdge} does not meet ${seam.b}.${seam.bEdge} (mean difference ${difference.toFixed(1)})`,
          hint: "the two faces must agree along the edge they share, or the seam shows as a line in the sky",
          target: name,
          detail: { difference },
        });
      }
    }
  }
}
