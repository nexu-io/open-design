/** Pure geometry for the edit accuracy bench. Points are [x, y]; a quad is 4 points, clockwise from top-left. */

export const toPoints = (flat) => [0, 2, 4, 6].map((i) => [flat[i], flat[i + 1]]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const scale = (a, k) => [a[0] * k, a[1] * k];
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const mid = (a, b) => scale(add(a, b), 0.5);
export const centre = (q) => scale(q.reduce(add, [0, 0]), 0.25);

/** Affine frame of a quad: origin plus the two edge vectors for a box of `size` local px. */
function frameOf(q, size) {
  return {
    o: q[0],
    ex: scale(sub(q[1], q[0]), 1 / size.width),
    ey: scale(sub(q[3], q[0]), 1 / size.height),
  };
}

export function localToQuad(q, size, [u, v]) {
  const f = frameOf(q, size);
  return add(f.o, add(scale(f.ex, u), scale(f.ey, v)));
}

export function quadToLocal(q, size, p) {
  const { o, ex, ey } = frameOf(q, size);
  const d = sub(p, o);
  const det = ex[0] * ey[1] - ex[1] * ey[0];
  return [(d[0] * ey[1] - d[1] * ey[0]) / det, (ex[0] * d[1] - ex[1] * d[0]) / det];
}

/** Screen to composition px through the root composition's rendered quad. */
export function compositionMapper(rootQuad, composition) {
  return {
    toComp: (p) => quadToLocal(rootQuad, composition, p),
    toScreen: (p) => localToQuad(rootQuad, composition, p),
  };
}

/** The visible quad: the element box shrunk by its clip-path insets, in the element's local frame. */
export function visibleQuad(q, size, inset) {
  const r = size.width - inset.right;
  const b = size.height - inset.bottom;
  return [
    [inset.left, inset.top],
    [r, inset.top],
    [r, b],
    [inset.left, b],
  ].map((p) => localToQuad(q, size, p));
}

export const quadDistance = (a, b) => Math.max(...a.map((p, i) => dist(p, b[i])));
export const angleOf = (q) => Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]);
export const normalizeAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function aabb(q) {
  const xs = q.map((p) => p[0]);
  const ys = q.map((p) => p[1]);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

export const boxDistance = (a, b) =>
  Math.max(...["left", "top", "right", "bottom"].map((k) => Math.abs(a[k] - b[k])));

/** `inset(t r b l [round ...])` in px, as getComputedStyle reports it; none means no crop. */
export function parseInset(clipPath) {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const m = /^inset\(([^)]*)\)/.exec(clipPath ?? "");
  if (!m) return zero;
  const v = m[1]
    .split(/\s+round\s+/)[0]
    .trim()
    .split(/\s+/)
    .map((s) => Number.parseFloat(s));
  const [t, r = t, b = t, l = r] = v;
  return { top: t, right: r, bottom: b, left: l };
}

export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
