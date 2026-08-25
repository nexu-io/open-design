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
 * silhouette. So: the fill drives the ramp with the part's normalized
 * luminance (shading encodes form), grazing angle becomes proximity to the
 * silhouette, and the structure lines come from a Sobel over the part's own
 * pixels. Occlusion is free — the id map only marks pixels the part
 * actually won in the render.
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

/** Grazing band width, in px of the frame — the 2D stand-in for fresnel. */
const RIM_PX = 7;

/**
 * Compose the full-energize x-ray frame: selected parts wear the spectral
 * skin, everything else recedes toward the stage ink so the energized part
 * reads as lit from within the world. Returns pixels at mix = 1; the caller
 * animates the crossfade by compositing this over the real frame with the
 * kit's own 200ms-in / 140ms-out ease-out-cubic (opacity IS the front
 * pass's uXray: over the beauty pixels, alpha-blending this equals
 * mix(disp, skin, a)).
 */
export function renderXrayComposite(
  beauty: ImageData,
  codes: Uint16Array,
  selected: ReadonlySet<number>,
  out: ImageData,
): void {
  const { width, height } = beauty;
  const src = beauty.data;
  const dst = out.data;
  const n = width * height;

  /* Mask + the part's own luminance statistics: the ramp is driven by
     shading normalized across the PART, the way curvature centres on the
     steel midpoint — a dark part and a bright part both use the full arc. */
  const mask = new Uint8Array(n);
  const lum = new Float32Array(n);
  let lumMin = Infinity;
  let lumMax = -Infinity;
  let any = false;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const L = 0.2126 * src[p]! + 0.7152 * src[p + 1]! + 0.0722 * src[p + 2]!;
    lum[i] = L;
    if (codes[i] !== 0 && selected.has(codes[i]!)) {
      mask[i] = 1;
      any = true;
      if (L < lumMin) lumMin = L;
      if (L > lumMax) lumMax = L;
    }
  }
  if (!any) {
    dst.set(src);
    return;
  }
  const lumSpan = Math.max(8, lumMax - lumMin);

  /* Separable 3×3 box smooth of the luminance field. The beauty pass
     carries EEVEE sampling noise, and feeding it raw into the ramp made
     the fill speckle; the GL pass never had this problem because normals
     are smooth. One blur, used for both the fill and the structure lines. */
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

  /* Distance to the silhouette (two-pass chamfer, capped at the rim band):
     the 2D grazing angle. */
  const BIG = RIM_PX + 1;
  const dist = new Float32Array(n).fill(BIG);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) {
        dist[i] = 0;
        continue;
      }
      let d = dist[i]!;
      if (x > 0) d = Math.min(d, dist[i - 1]! + 1);
      if (y > 0) d = Math.min(d, dist[i - width]! + 1, x > 0 ? dist[i - width - 1]! + 1.4 : BIG, x < width - 1 ? dist[i - width + 1]! + 1.4 : BIG);
      dist[i] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let d = dist[i]!;
      if (x < width - 1) d = Math.min(d, dist[i + 1]! + 1);
      if (y < height - 1) d = Math.min(d, dist[i + width]! + 1, x < width - 1 ? dist[i + width + 1]! + 1.4 : BIG, x > 0 ? dist[i + width - 1]! + 1.4 : BIG);
      dist[i] = d;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      if (!mask[i]) {
        /* The rest of the world recedes — the kit energizes its stage to a
           deep near-black for the same reason: additive spectral light
           needs a dark ground to bloom against. Geometry keeps more of
           itself than empty backdrop so the scene stays legible. */
        const keep = src[p + 3]! >= 32 ? 0.5 : 0.3;
        dst[p] = src[p]! * keep + INK[0] * (1 - keep);
        dst[p + 1] = src[p + 1]! * keep + INK[1] * (1 - keep);
        dst[p + 2] = src[p + 2]! * keep + INK[2] * (1 - keep);
        dst[p + 3] = Math.max(src[p + 3]!, 200);
        continue;
      }

      // 1. FILL — the ramp, driven by the part's own normalized shading.
      const t = (lum[i]! - lumMin) / lumSpan;
      const fill = inspectionRamp(0.12 + 0.76 * t);

      // 2. SILHOUETTE SHEEN — grazing from silhouette proximity; the same
      //    rim window and blend weights as the shader.
      const graze = 1 - Math.min(1, dist[i]! / RIM_PX);
      const rim = smoothstep(0.55, 0.98, graze);
      const film = filmArc(0.15 + 0.55 * graze);
      let r = fill[0] + (fill[0] * 0.45 + film[0] * 0.85 - fill[0]) * rim * 0.32;
      let g = fill[1] + (fill[1] * 0.45 + film[1] * 0.85 - fill[1]) * rim * 0.32;
      let b = fill[2] + (fill[2] * 0.45 + film[2] * 0.85 - fill[2]) * rim * 0.32;

      // 3. EDGES — thin cool structure lines from the part's own pixels
      //    (Sobel over luminance), the shader's fwidth(n) analogue.
      let edge = 0;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const gx =
          lum[i - width + 1]! + 2 * lum[i + 1]! + lum[i + width + 1]! -
          lum[i - width - 1]! - 2 * lum[i - 1]! - lum[i + width - 1]!;
        const gy =
          lum[i + width - 1]! + 2 * lum[i + width]! + lum[i + width + 1]! -
          lum[i - width - 1]! - 2 * lum[i - width]! - lum[i - width + 1]!;
        edge = smoothstep(0.12, 0.5, Math.hypot(gx, gy) / (4 * lumSpan));
      }
      r += 0.55 * edge * 0.16;
      g += 0.72 * edge * 0.16;
      b += 0.8 * edge * 0.16;

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
