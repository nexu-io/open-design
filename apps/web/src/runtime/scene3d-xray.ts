/*
 * The kit x-ray, applied to prerendered pixels.
 *
 * A faithful 2D port of the spectral pass in
 * `packages/scene3d/src/viewer/kit-runtime.ts` (FRAG) — the SAME inspection
 * ramp stops, the SAME thin-film cosine arc, the same rim blend
 * (mix toward skin·0.45 + film·0.85 by rim·0.32), the same structure-line
 * tint (0.55, 0.72, 0.80)·0.16, the same stage ink (0.03, 0.035, 0.05),
 * and the same front-pass contract: the REAL pixels crossfade into the
 * spectral skin. Keep every constant in step with the shader.
 *
 * What differs is the DATA a prerendered frame can offer. The GL pass reads
 * normals and view angles; a frame offers its own shading and, through the
 * runner's object-index map (`<frame>.idx.png`), its exact per-part
 * silhouette. The emphasis is the one the kit's x-ray gives a selection:
 * the SELECTED part stays the real render, and the REST of the world drops
 * into the spectral ghost — ink stage, translucent teal bodies lit by
 * their own shading, cool structure lines (Sobel feature lines + the id
 * map's exact part outlines), and a film-arc rim where the ghost world
 * meets the selection. Occlusion is free — the id map only marks pixels a
 * part actually won in the render.
 */

/** Channel quantisation of the id map — MUST match ID_STEPS in runner.py. */
export const XRAY_ID_STEPS = [0, 36, 73, 109, 146, 182, 219, 255] as const;

/* Nearest-step lookup per byte, built once: the decode has to survive
   dithering and codec rounding, and ±18 of slack per channel does. */
const STEP_OF: Uint8Array = (() => {
  const table = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    let best = 0;
    let bestDist = Infinity;
    for (let k = 0; k < XRAY_ID_STEPS.length; k++) {
      const d = Math.abs(XRAY_ID_STEPS[k]! - v);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    table[v] = best;
  }
  return table;
})();

/** Per-pixel part codes (0 = background) decoded from an id-map frame. */
export function decodeIdMap(map: ImageData): Uint16Array {
  const { data, width, height } = map;
  const out = new Uint16Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    if (data[p + 3]! < 128) continue; // background: film is transparent there
    out[i] = STEP_OF[data[p]!]! * 64 + STEP_OF[data[p + 1]!]! * 8 + STEP_OF[data[p + 2]!]!;
  }
  return out;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* inspectionRamp — verbatim stops from the shader: ink indigo → deep teal →
   steel neutral → amber gold → cream white-hot. Luminance climbs
   monotonically so it reads as data. */
const RAMP: ReadonlyArray<readonly [number, number, number]> = [
  [0.043, 0.063, 0.149],
  [0.07, 0.227, 0.353],
  [0.118, 0.478, 0.549],
  [0.561, 0.651, 0.639],
  [0.784, 0.588, 0.235],
  [0.961, 0.902, 0.784],
];
const RAMP_STOPS = [
  [0.0, 0.22],
  [0.22, 0.45],
  [0.45, 0.65],
  [0.65, 0.82],
  [0.82, 1.0],
] as const;

export function inspectionRamp(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  let r = RAMP[0]![0];
  let g = RAMP[0]![1];
  let b = RAMP[0]![2];
  for (let k = 0; k < RAMP_STOPS.length; k++) {
    const s = smoothstep(RAMP_STOPS[k]![0], RAMP_STOPS[k]![1], x);
    const c = RAMP[k + 1]!;
    r += (c[0] - r) * s;
    g += (c[1] - g) * s;
    b += (c[2] - b) * s;
  }
  return [r, g, b];
}

/* filmArc — verbatim: a compressed thin-film cosine, teal → magenta → gold. */
export function filmArc(p: number): [number, number, number] {
  const TWO_PI = 6.28318;
  return [
    0.6 + 0.28 * Math.cos(TWO_PI * (0.8 * p + 0.0)),
    0.56 + 0.24 * Math.cos(TWO_PI * (0.8 * p + 0.2)),
    0.58 + 0.3 * Math.cos(TWO_PI * (0.8 * p + 0.45)),
  ];
}

/** The stage ink the kit's clear colour energizes to, as display bytes. */
const INK: readonly [number, number, number] = [8, 9, 13]; // (0.03, 0.035, 0.05) × 255

/** The kit x-ray's ghost teal — inspectionRamp's deep-teal stop, the body
 *  colour of the normals-mode ghost. */
const GHOST_TEAL: readonly [number, number, number] = [0.118, 0.478, 0.549];
/** The cool structure-line tint, verbatim from the shader's edge term. */
const EDGE_TINT: readonly [number, number, number] = [0.55, 0.72, 0.8];

/**
 * How the ghosted world is styled — the same three-view grammar the kit's
 * x-ray menu speaks, driven by the same X+1/2/3 chord:
 *   0 · curvature — the inspection ramp over the geometry's own shading
 *       (ink indigo → teal → steel → amber → cream), dark structure lines;
 *   1 · normals   — the translucent teal ghost, cool edge lines;
 *   2 · structure — lines only: near-ink bodies, bright contours (the
 *       wireframe read; the honest 2D stand-in for the clearance slot,
 *       whose per-pixel data a prerendered frame does not carry).
 */
export type XrayGhostMode = 0 | 1 | 2;

/**
 * Compose the full-energize frame with the emphasis the kit's x-ray puts on
 * a selection: the SELECTED part keeps its real rendered pixels — it is the
 * one thing in the scene that stays matter — while everything else drops
 * into the spectral ghost: the dark stage ink, translucent teal bodies lit
 * by their own shading, cool structure lines (Sobel feature lines plus the
 * id map's exact part-boundary lines — sharper outlines than the GL pass
 * itself can draw), and a thin film-arc rim where the world meets the
 * selection. Returns pixels at mix = 1; the caller crossfades with the
 * kit's own 200ms-in / 140ms-out ease-out-cubic (canvas opacity IS uXray).
 */
export function renderXrayComposite(
  beauty: ImageData,
  codes: Uint16Array,
  selected: ReadonlySet<number>,
  out: ImageData,
  mode: XrayGhostMode = 1,
): void {
  const { width, height } = beauty;
  const src = beauty.data;
  const dst = out.data;
  const n = width * height;

  /* Luminance field + ghost-side statistics: the ghost's body brightness is
     the geometry's own shading, normalized over the GHOSTED pixels so the
     translucent world keeps its light and form. */
  const lum = new Float32Array(n);
  const histogram = new Uint32Array(256);
  let ghostCount = 0;
  let anySelected = false;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const L = 0.2126 * src[p]! + 0.7152 * src[p + 1]! + 0.0722 * src[p + 2]!;
    lum[i] = L;
    const code = codes[i]!;
    if (code !== 0 && selected.has(code)) {
      anySelected = true;
    } else if (code !== 0) {
      histogram[Math.min(255, L | 0)]!++;
      ghostCount++;
    }
  }
  if (!anySelected) {
    dst.set(src);
    return;
  }
  /* Percentile normalization (5th–95th), not min/max: a handful of hot
     highlight pixels used to own the top of the range and pin every real
     surface to the ramp's middle — the curvature view then never reached
     its amber-cream end. Letting the extremes saturate is what makes the
     ramp SPEAK. */
  let ghostMin = 0;
  let ghostMax = 255;
  {
    const lowTarget = ghostCount * 0.05;
    const highTarget = ghostCount * 0.95;
    let running = 0;
    let lowFound = false;
    for (let v = 0; v < 256; v++) {
      running += histogram[v]!;
      if (!lowFound && running >= lowTarget) {
        ghostMin = v;
        lowFound = true;
      }
      if (running >= highTarget) {
        ghostMax = v;
        break;
      }
    }
  }
  const ghostSpan = Math.max(8, ghostMax - ghostMin);

  /* Separable 3×3 box smooth: the beauty pass carries EEVEE sampling noise,
     and raw luminance speckles both the ghost body and the feature lines. */
  const lumH = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const a = x > 0 ? lum[i - 1]! : lum[i]!;
      const c = x < width - 1 ? lum[i + 1]! : lum[i]!;
      lumH[i] = (a + lum[i]! + c) / 3;
    }
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = row + x;
      const a = y > 0 ? lumH[i - width]! : lumH[i]!;
      const c = y < height - 1 ? lumH[i + width]! : lumH[i]!;
      lum[i] = (a + lumH[i]! + c) / 3;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      const code = codes[i]!;
      const isSelected = code !== 0 && selected.has(code);

      /* Boundary structure from the id map: a pixel whose 4-neighbourhood
         crosses into a different part (or the void) is an OUTLINE pixel —
         the exact contour the wireframe look wants. Selection boundaries
         are remembered separately for the film rim. */
      let boundary = false;
      let touchesSelection = false;
      if (x > 0 && codes[i - 1] !== code) {
        boundary = true;
        if (selected.has(codes[i - 1]!)) touchesSelection = true;
      }
      if (x < width - 1 && codes[i + 1] !== code) {
        boundary = true;
        if (selected.has(codes[i + 1]!)) touchesSelection = true;
      }
      if (y > 0 && codes[i - width] !== code) {
        boundary = true;
        if (selected.has(codes[i - width]!)) touchesSelection = true;
      }
      if (y < height - 1 && codes[i + width] !== code) {
        boundary = true;
        if (selected.has(codes[i + width]!)) touchesSelection = true;
      }

      if (isSelected) {
        /* The selection is the one real thing on the stage: its pixels pass
           through untouched, with a whisper of lift so it reads lit against
           the dark ghost world. */
        dst[p] = Math.min(255, src[p]! * 1.06);
        dst[p + 1] = Math.min(255, src[p + 1]! * 1.06);
        dst[p + 2] = Math.min(255, src[p + 2]! * 1.06);
        dst[p + 3] = 255;
        continue;
      }

      if (code === 0 && src[p + 3]! < 32) {
        // The stage itself: the kit's deep ink, full stop.
        dst[p] = INK[0];
        dst[p + 1] = INK[1];
        dst[p + 2] = INK[2];
        dst[p + 3] = 255;
        continue;
      }

      /* Ghosted geometry, styled by the active view. All three read the
         same data — the part's own smoothed shading and the id map's
         outlines — they differ only in the language the colours speak. */
      const t = Math.min(1, Math.max(0, code === 0 ? 0.3 : (lum[i]! - ghostMin) / ghostSpan));

      // Feature lines inside a part (Sobel over smoothed luminance)…
      let edge = 0;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const gx =
          lum[i - width + 1]! + 2 * lum[i + 1]! + lum[i + width + 1]! -
          lum[i - width - 1]! - 2 * lum[i - 1]! - lum[i + width - 1]!;
        const gy =
          lum[i + width - 1]! + 2 * lum[i + width]! + lum[i + width + 1]! -
          lum[i - width - 1]! - 2 * lum[i - width]! - lum[i - width + 1]!;
        edge = smoothstep(0.14, 0.55, Math.hypot(gx, gy) / (4 * ghostSpan));
      }
      // …and the id map's exact outlines — the wireframe bones.
      if (boundary) edge = Math.max(edge, 0.85);

      let r: number;
      let g: number;
      let b: number;
      if (mode === 0) {
        // Curvature: the FULL inspection ramp over the form's own shading —
        // dark hollows read ink-indigo, bright ridges climb through amber
        // to cream, exactly the arc the kit's curvature view walks.
        // Structure lines DARKEN toward the ink so they read on the warm
        // bright end.
        const fill = inspectionRamp(0.05 + 0.9 * t);
        const keep = 1 - edge * 0.6;
        r = fill[0] * keep;
        g = fill[1] * keep;
        b = fill[2] * keep;
      } else if (mode === 2) {
        // Structure: lines are the picture — bodies barely lift off the
        // ink, contours carry everything.
        const body = 0.05 + 0.1 * t;
        r = INK[0] / 255 + (GHOST_TEAL[0] - INK[0] / 255) * body + EDGE_TINT[0] * edge * 0.95;
        g = INK[1] / 255 + (GHOST_TEAL[1] - INK[1] / 255) * body + EDGE_TINT[1] * edge * 0.95;
        b = INK[2] / 255 + (GHOST_TEAL[2] - INK[2] / 255) * body + EDGE_TINT[2] * edge * 0.95;
      } else {
        // Normals: the translucent teal ghost, cool edge lines.
        const body = 0.16 + 0.5 * t;
        r = INK[0] / 255 + (GHOST_TEAL[0] - INK[0] / 255) * body + EDGE_TINT[0] * edge * 0.55;
        g = INK[1] / 255 + (GHOST_TEAL[1] - INK[1] / 255) * body + EDGE_TINT[1] * edge * 0.55;
        b = INK[2] / 255 + (GHOST_TEAL[2] - INK[2] / 255) * body + EDGE_TINT[2] * edge * 0.55;
      }

      // Where the ghost world meets the SELECTION, a thin film-arc rim —
      // the spectral jewellery, marking exactly what stayed real.
      if (touchesSelection) {
        const film = filmArc(0.35);
        r = r * 0.35 + film[0] * 0.85;
        g = g * 0.35 + film[1] * 0.85;
        b = b * 0.35 + film[2] * 0.85;
      }

      dst[p] = Math.min(255, r * 255);
      dst[p + 1] = Math.min(255, g * 255);
      dst[p + 2] = Math.min(255, b * 255);
      dst[p + 3] = 255;
    }
  }
}

/** The id-map URL for a beauty frame URL — the runner's naming contract. */
export function idMapUrlFor(frameUrl: string): string {
  return frameUrl.replace(/\.png(\?|$)/i, '.idx.png$1');
}
