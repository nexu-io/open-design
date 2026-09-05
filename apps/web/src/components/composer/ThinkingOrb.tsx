/**
 * ThinkingOrb — the composer's running glyph.
 *
 * Vendored from `thinking-orbs@0.3.1` (© Jakub Antalik, MIT licence,
 * https://github.com/Jakubantalik/thinking-orbs), reduced to the one state
 * and size the composer uses: the `solving` orb (the `rubik` draw — bands of a
 * dotted sphere scramble in quarter turns, then click back) at the 20px inline
 * preset, pinned to the dark palette (light ink on a transparent canvas).
 *
 * The geometry, painter, preset scaling and frame loop are the package's own
 * code, transcribed with readable names and no behavioural change, so the
 * canvas output is identical to the published build. Kept local rather than
 * added as a runtime dependency: the composer needs one animation out of the
 * nine the package ships, and the theme detection / preset registry that
 * surrounds them would only ever resolve to these constants here.
 */
import { useEffect, useRef, type CanvasHTMLAttributes } from 'react';

interface Dot {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Ink value: 0 = darkest ink on paper. Mirrored on the dark substrate. */
  white: number;
  a?: number;
}

type ModeOpts = Record<string, number | undefined>;

/** Deterministic hash in [0, 1). */
function hashD(a: number, b: number): number {
  const t = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return t - Math.floor(t);
}

type Projector = (x: number, y: number, z: number) => [number, number, number];

/** Shared spin + tilt + orthographic projection. */
function makeProj(yaw: number, tilt: number, cx: number, cy: number, scale: number): Projector {
  const st = Math.sin(tilt);
  const ct = Math.cos(tilt);
  const sy = Math.sin(yaw);
  const cy2 = Math.cos(yaw);
  return (x, y, z) => {
    const rx = x * cy2 + z * sy;
    const rz = -x * sy + z * cy2;
    const ty = y * ct - rz * st;
    const tz = y * st + rz * ct;
    return [cx + rx * scale, cy - ty * scale, tz];
  };
}

/**
 * Painter: z-sort far→near, matte grayscale dots. On the dark substrate the
 * ink value is mirrored (1 - white) so near dots read bright.
 */
function paint(ctx: CanvasRenderingContext2D, dots: Dot[], dark: boolean): void {
  for (const dot of dots) {
    const alpha = dot.a ?? 1;
    const ink = Math.min(1, Math.max(0, dot.white));
    const v = Math.round((dark ? 1 - ink : ink) * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Turn raw mode output into a finished frame: drop invisible marks, clamp
 * radii to the mode's floor, and z-sort far→near into draw order.
 */
function finalizeFrame(dots: Dot[], rMin = 0.3): Dot[] {
  const kept: Dot[] = [];
  for (const dot of dots) {
    if ((dot.a ?? 1) < 0.02) continue;
    dot.r = Math.max(rMin, dot.r);
    kept.push(dot);
  }
  return kept.sort((a, b) => a.z - b.z);
}

/**
 * Dot radii were tuned for a 300pt frame; sub-linear scaling keeps small
 * spinners legible. Lower pow = radii shrink less with size.
 */
function radiusScale(size: number, pow: number): number {
  return (size / 300) ** pow;
}

interface RubikMove {
  axis: number;
  lo: number;
  hi: number;
  ang: number;
}

/** Where the move schedule stands at time `t`: per-move progress + the live move. */
function rubikPhase(t: number, moveCount: number, moveDur: number, restDur: number) {
  const cycle = 2 * moveCount * moveDur + restDur;
  const local = t % cycle;
  const amount = new Array<number>(moveCount).fill(0);
  let active = -1;
  if (local < 2 * moveCount * moveDur) {
    const step = Math.floor(local / moveDur);
    const frac = (local - step * moveDur) / moveDur;
    const eased = 1 - (1 - Math.min(1, frac / 0.7)) ** 3;
    if (step < moveCount) {
      for (let i = 0; i < step; i++) amount[i] = 1;
      amount[step] = eased;
      active = step;
    } else {
      const back = 2 * moveCount - 1 - step;
      for (let i = 0; i < back; i++) amount[i] = 1;
      amount[back] = 1 - eased;
      active = back;
    }
  }
  return { amount, active };
}

/** Apply every (partially) turned band to one point on the unit sphere. */
function rubikTwist(
  point: [number, number, number],
  moves: RubikMove[],
  phase: { amount: number[]; active: number },
): [number, number, number, boolean] {
  let [x, y, z] = point;
  let onActive = false;
  for (let i = 0; i < moves.length; i++) {
    const amount = phase.amount[i] ?? 0;
    if (amount <= 0) continue;
    const move = moves[i]!;
    const coord = move.axis === 0 ? x : move.axis === 1 ? y : z;
    if (coord < move.lo || coord >= move.hi) continue;
    if (i === phase.active) onActive = true;
    const ang = move.ang * amount;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    if (move.axis === 0) {
      const ny = y * c - z * s;
      z = y * s + z * c;
      y = ny;
    } else if (move.axis === 1) {
      const nx = x * c + z * s;
      z = -x * s + z * c;
      x = nx;
    } else {
      const nx = x * c - y * s;
      y = x * s + y * c;
      x = nx;
    }
  }
  return [x, y, z, onActive];
}

/** The deterministic move list: axis, band and direction per move. */
function rubikMoves(count: number): RubikMove[] {
  const moves: RubikMove[] = [];
  for (let i = 0; i < count; i++) {
    const axis = Math.min(2, Math.floor(hashD(i, 2.3) * 3));
    const lo = -1 + 0.5 * Math.min(3, Math.floor(hashD(i, 5.9) * 4));
    const dir = hashD(i, 7.7) < 0.5 ? 1 : -1;
    moves.push({ axis, lo, hi: lo + 0.5, ang: (dir * Math.PI) / 2 });
  }
  return moves;
}

/** Geometry for one instant of the `rubik` draw (the `solving` state). */
function rubikFrame(size: number, t: number, opts: ModeOpts): Dot[] {
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size / 2) * 0.82;
  const proj = makeProj(t * 0.55, 0.35 + 0.1 * Math.sin(t * 0.9), cx, cy, radius);
  const rs = radiusScale(size, opts.rsPow ?? 0.6);
  const moveCount = opts.moveCount ?? 14;
  const moves = rubikMoves(moveCount);
  const phase = rubikPhase(t, moveCount, 0.42, 1.2);
  const dots: Dot[] = [];
  const latRings = opts.latRings ?? 15;
  const lonDensity = opts.lonDensity ?? 40;
  for (let ring = 0; ring <= latRings; ring++) {
    const lat = -Math.PI / 2 + (ring / latRings) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const count = Math.max(1, Math.round(Math.abs(cosLat) * lonDensity));
    for (let i = 0; i < count; i++) {
      const lon = (i / count) * 2 * Math.PI;
      const [tx, ty, tz, onActive] = rubikTwist(
        [cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)],
        moves,
        phase,
      );
      const [px, py, pz] = proj(tx, ty, tz);
      const depth = (pz + 1) / 2;
      dots.push({
        x: px,
        y: py,
        z: pz,
        r:
          ((opts.rBase ?? 0.6) + (opts.rDepth ?? 1.7) * depth + (onActive ? opts.rActive ?? 0.3 : 0))
          * rs,
        white: (opts.inkFar ?? 0.62) - (opts.inkSpan ?? 0.54) * depth - (onActive ? 0.14 : 0),
      });
    }
  }
  return finalizeFrame(dots, opts.rMin);
}

/* Preset resolution for (`solving`, 20): the base `rubik` profile, then the
   20px preset's count and size multipliers, applied exactly as the package's
   `resolvePreset` applies them so every derived number matches to the bit. */
const RUBIK_BASE: ModeOpts = {
  latRings: 15,
  lonDensity: 40,
  moveCount: 14,
  rBase: 0.6,
  rDepth: 1.7,
  rActive: 0.3,
  inkFar: 0.62,
  inkSpan: 0.54,
  rsPow: 0.6,
  rMin: 0.3,
};
const RUBIK_20 = { speed: 1.95, count: 0.088, size: 1.9 };
const COUNT_PAIRS: Array<[string, string]> = [
  ['latRings', 'lonDensity'],
  ['rings', 'lonDensity'],
  ['lanes', 'segs'],
];
const COUNT_KEYS = ['orbitN', 'ghostN', 'nodeN', 'strandN', 'signals'];
const DENSITY_KEYS = ['iconD'];
const RADIUS_KEYS = [
  'rBase',
  'rDepth',
  'rActive',
  'rDot',
  'ghostR',
  'partR',
  'partRDepth',
  'nodeR',
  'nodeRDepth',
];

function scaleCounts(opts: ModeOpts, scale: number): ModeOpts {
  const next = { ...opts };
  const seen = new Set<string>();
  const sqrt = Math.sqrt(scale);
  for (const [a, b] of COUNT_PAIRS) {
    const va = next[a];
    const vb = next[b];
    if (va != null && vb != null && !seen.has(a) && !seen.has(b)) {
      next[a] = Math.max(2, Math.round(va * sqrt));
      next[b] = Math.max(2, Math.round(vb * sqrt));
      seen.add(a);
      seen.add(b);
    }
  }
  for (const key of COUNT_KEYS) {
    const v = next[key];
    if (v != null && v !== 0 && !seen.has(key)) next[key] = Math.max(1, Math.round(v * scale));
  }
  for (const key of DENSITY_KEYS) {
    const v = next[key];
    if (v != null) next[key] = Math.max(0.02, v * scale);
  }
  return next;
}

function scaleRadii(opts: ModeOpts, scale: number): ModeOpts {
  const next = { ...opts };
  for (const key of RADIUS_KEYS) {
    const v = next[key];
    if (v != null) next[key] = v * scale;
  }
  next.rSizeMul = (next.rSizeMul ?? 1) * scale;
  return next;
}

function resolveSolving20(): { speed: number; opts: ModeOpts } {
  let opts: ModeOpts = { ...RUBIK_BASE };
  if (RUBIK_20.count !== 1) opts = scaleCounts(opts, RUBIK_20.count);
  if (RUBIK_20.size !== 1) opts = scaleRadii(opts, RUBIK_20.size);
  return { speed: RUBIK_20.speed, opts };
}

const SOLVING_20 = resolveSolving20();
const ORB_SIZE = 20;
/** The frame a reduced-motion reader sees; the package holds this instant. */
const STATIC_FRAME_T = 0.6;

type Props = Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'style'>;

/**
 * The `solving` orb at 20px on the dark palette. Draws to a `<canvas>`, parks
 * itself while the tab is hidden or the element is scrolled out of view, and
 * holds a single frame under `prefers-reduced-motion`.
 */
export function ThinkingOrb(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' && devicePixelRatio) || 1);
    canvas.width = Math.round(ORB_SIZE * dpr);
    canvas.height = Math.round(ORB_SIZE * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { speed, opts } = SOLVING_20;
    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, ORB_SIZE, ORB_SIZE);
      paint(ctx, rubikFrame(ORB_SIZE, t, opts), true);
    };
    const reduceMotion =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      draw(STATIC_FRAME_T);
      return;
    }
    let raf = 0;
    let running = false;
    const loop = () => {
      draw((performance.now() / 1e3) * speed);
      if (running) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };
    draw((performance.now() / 1e3) * speed);
    let visible = true;
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            if (visible && document.visibilityState !== 'hidden') start();
            else stop();
          })
        : null;
    observer?.observe(canvas);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (visible) start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (!observer) start();
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Solving…"
      style={{ width: ORB_SIZE, height: ORB_SIZE, display: 'block' }}
      {...props}
    />
  );
}
