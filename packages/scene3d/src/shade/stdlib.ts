/**
 * The kernel stdlib — deterministic GPU noise, derived, not borrowed.
 *
 * Every function is prefixed `s3d_` and built on INTEGER hashing
 * (PCG2D over the raw float bits), never `fract(sin(dot(...)))`: the
 * sine-hash idiom depends on each driver's sin() precision and produces
 * different textures on different GPUs, which would make a baked texture
 * non-reproducible. PCG2D is pure 32-bit integer arithmetic — IEEE-exact
 * on every conforming GPU — so a kernel bakes the same texture on GL,
 * Vulkan, Metal, and in the WebGL2 viewer.
 *
 * Derivations:
 * - s3d_pcg2d: O'Neill's PCG family, 2D variant (Jarzynski & Olano,
 *   "Hash Functions for GPU Rendering", JCGT 2020) — the best
 *   quality/cost hash in their survey.
 * - s3d_vnoise: classic value noise — hash at the four cell corners,
 *   bilinear blend through a quintic fade (Perlin's 6t⁵-15t⁴+10t³, which
 *   has zero first AND second derivative at the endpoints, so cell seams
 *   have no visible derivative discontinuity).
 * - s3d_fbm: fractional Brownian motion, 5 octaves, lacunarity 2,
 *   gain 0.5, with a rotation between octaves so axis-aligned artifacts
 *   from the lattice cannot line up across octaves.
 * - s3d_voronoi: Worley cellular noise, F1 distance over a 3x3
 *   neighbourhood, jittered by the same hash.
 *
 * All periodic behaviour is over the 0-1 UV tile scaled by the caller,
 * so kernels compose them freely: `s3d_fbm(uv * 6.0)`.
 *
 * Those base fields are INFINITE — a texture baked from them does NOT tile,
 * because the lattice cell at u=0 and the cell at u=1 hash differently. For a
 * texture that must repeat (a wall, terrain detail, a trim strip) use the
 * `_tiled` variants: they wrap the integer lattice cell to a caller-given
 * period so opposite tile edges hash identically — seamless by construction.
 * The period is an integer cell count over the same span the caller samples:
 * `s3d_fbm_tiled(uv * 6.0, vec2(6.0))`. The tiled fbm doubles its period each
 * octave in step with the frequency (or higher octaves seam anyway) and drops
 * the inter-octave rotation, which is not periodic.
 */
export const SHADER_STDLIB = `
uvec2 s3d_pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

float s3d_hash21(vec2 p) {
  uvec2 q = s3d_pcg2d(floatBitsToUint(p));
  return float(q.x) * (1.0 / 4294967295.0);
}

vec2 s3d_hash22(vec2 p) {
  uvec2 q = s3d_pcg2d(floatBitsToUint(p));
  return vec2(q) * (1.0 / 4294967295.0);
}

float s3d_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = s3d_hash21(i);
  float b = s3d_hash21(i + vec2(1.0, 0.0));
  float c = s3d_hash21(i + vec2(0.0, 1.0));
  float d = s3d_hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float s3d_fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * s3d_vnoise(p);
    p = rot * p * 2.0;
    amplitude *= 0.5;
  }
  return value;
}

float s3d_voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float best = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));
      vec2 site = cell + s3d_hash22(i + cell) - f;
      best = min(best, dot(site, site));
    }
  }
  return sqrt(best);
}

// Wrap a lattice cell into [0, period): opposite tile edges land on the same
// integer cell, so their corner hashes match and the seam vanishes. mod() in
// GLSL returns a non-negative result for negative inputs, so this holds for
// uv < 0 too.
vec2 s3d_wrap_cell(vec2 cell, vec2 period) {
  vec2 p = max(period, vec2(1.0));
  return mod(mod(cell, p) + p, p);
}

float s3d_vnoise_tiled(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = s3d_hash21(s3d_wrap_cell(i, period));
  float b = s3d_hash21(s3d_wrap_cell(i + vec2(1.0, 0.0), period));
  float c = s3d_hash21(s3d_wrap_cell(i + vec2(0.0, 1.0), period));
  float d = s3d_hash21(s3d_wrap_cell(i + vec2(1.0, 1.0), period));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float s3d_fbm_tiled(vec2 p, vec2 period) {
  float value = 0.0;
  float amplitude = 0.5;
  vec2 per = max(period, vec2(1.0));
  for (int i = 0; i < 5; i++) {
    value += amplitude * s3d_vnoise_tiled(p, per);
    p *= 2.0;
    per *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

float s3d_voronoi_tiled(vec2 p, vec2 period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float best = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = vec2(float(x), float(y));
      vec2 site = cell + s3d_hash22(s3d_wrap_cell(i + cell, period)) - f;
      best = min(best, dot(site, site));
    }
  }
  return sqrt(best);
}
`;

/** Names the stdlib defines — kernels must not redefine them. */
export const STDLIB_NAMES = [
  "s3d_pcg2d",
  "s3d_hash21",
  "s3d_hash22",
  "s3d_vnoise",
  "s3d_fbm",
  "s3d_voronoi",
  "s3d_wrap_cell",
  "s3d_vnoise_tiled",
  "s3d_fbm_tiled",
  "s3d_voronoi_tiled",
] as const;
