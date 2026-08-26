import { Rational } from "./rational.js";
import {
  edgeKey,
  edgesOf,
  KernelMesh,
  meshOf,
  mirror,
  PredictedCensus,
  predictCensus,
  RVec3,
  subdivide,
} from "./mesh.js";

/**
 * The operator trace — the kernel's language-neutral IR.
 *
 * A recipe is not a mesh and not code; it is a SERIALIZED SEQUENCE OF EXACT
 * OPERATORS. That indirection is the whole architecture:
 *
 *  - Every scalar is a rational STRING (`"3/4"`, `"-1"`), so the IR carries no
 *    float and re-parses to the same value on every machine. The trace is the
 *    only thing that crosses a boundary; the mesh is a projection of it.
 *  - There is exactly ONE evaluator (`evalTrace`, below), in the compiler. A
 *    front-end — the raw-path `recipe:` Python recorder today, a declarative
 *    kernel shape later — only PRODUCES a trace; it never runs the kernel. So
 *    the author writes ordinary imperative code and the compiler still owns
 *    the geometry, which is what lets it predict the census and adjudicate it.
 *  - The canonical serialization is content-hashed into the existing stage
 *    cache exactly like a build script's bytes, so an unchanged recipe is a
 *    cache hit and a changed one is not — determinism the whole pipeline
 *    already relies on.
 *
 * The opset is deliberately small and extensible: `cage` seeds geometry,
 * `subdivide` and `mirror` transform it. `crease`, `delta` (path-keyed vertex
 * moves — the blendshape opcode) and per-identity attributes (skin weights)
 * are future rows in the same union, needing new opcodes, never a new
 * architecture.
 */

/**
 * A coordinate region — a conjunction of per-axis inclusive rational bounds.
 * A vertex is IN the region when, for every axis a bound is given, its
 * coordinate lies within [min, max]. Exact rational comparison, so a vertex
 * exactly on a bound is deterministically included and the selection is the
 * same on every machine. An axis omitted is unconstrained, so `{}` is the
 * whole mesh and `{ z: ["1", "1"] }` is exactly the plane z = 1.
 */
export interface Region {
  x?: [string, string];
  y?: [string, string];
  z?: [string, string];
}

export type TraceOp =
  | {
      op: "cage";
      /** Each point is three rational strings; welded by exact coordinate. */
      points: Array<[string, string, string]>;
      faces: number[][];
      ids?: string[];
    }
  | { op: "subdivide"; levels: number }
  | { op: "mirror"; axis: 0 | 1 | 2 }
  | {
      /**
       * Translate every vertex inside `region` by `offset` (three rational
       * strings). A pure deformation: topology is untouched, so counts,
       * watertightness and genus are invariant and the predicted census still
       * adjudicates. Because subdivision is linear, a delta on a cage
       * propagates to the limit surface EXACTLY (the KILN S·Δ property) — a
       * localized move here composes with a later `subdivide` with no fitting
       * and no residual.
       */
      op: "move";
      region: Region;
      offset: [string, string, string];
    }
  | {
      /**
       * Mark every edge whose BOTH endpoints lie in `region` as infinitely
       * sharp. A later `subdivide` keeps those edges (and the corners where
       * three meet) crisp instead of rounding them — the difference between a
       * subdivided box that melts toward a sphere and one that keeps a flat
       * base or hard rim. Creases propagate through subdivision.
       */
      op: "crease";
      region: Region;
    }
  | {
      /**
       * Scale the vertices in `region` about `pivot` by a per-axis `factor`:
       * v -> pivot + factor .* (v - pivot). The multiplicative sibling of
       * `move` — taper, bulge, or squash a region. Exact and topology-
       * preserving, like every deformation here.
       */
      op: "scale";
      region: Region;
      factor: [string, string, string];
      pivot: [string, string, string];
    };

export interface Trace {
  version: 1;
  ops: TraceOp[];
}

/* ------------------------------------------------------------------ */
/* The one evaluator                                                   */
/* ------------------------------------------------------------------ */

/**
 * Replay a trace into an exact mesh. Pure: no I/O, no Blender, no float until
 * a caller asks for one. A trace must begin by establishing geometry (a
 * `cage`); a transform before any geometry is a malformed recipe, reported
 * rather than guessed.
 */
export function evalTrace(trace: Trace): KernelMesh {
  if (trace.version !== 1) {
    throw new Error(`evalTrace: unsupported trace version ${trace.version}`);
  }
  let mesh: KernelMesh | null = null;
  trace.ops.forEach((op, i) => {
    switch (op.op) {
      case "cage": {
        const points: RVec3[] = op.points.map((p) => [
          Rational.parse(p[0]),
          Rational.parse(p[1]),
          Rational.parse(p[2]),
        ]);
        mesh = meshOf(points, op.faces, op.ids);
        break;
      }
      case "subdivide":
        if (!mesh) throw new Error(`evalTrace: op ${i} 'subdivide' before any geometry`);
        if (!Number.isInteger(op.levels) || op.levels < 0) {
          throw new Error(`evalTrace: op ${i} 'subdivide' levels must be a non-negative integer`);
        }
        mesh = subdivide(mesh, op.levels);
        break;
      case "mirror":
        if (!mesh) throw new Error(`evalTrace: op ${i} 'mirror' before any geometry`);
        mesh = mirror(mesh, op.axis);
        break;
      case "move": {
        if (!mesh) throw new Error(`evalTrace: op ${i} 'move' before any geometry`);
        const region = parseRegion(op.region);
        const dx = Rational.parse(op.offset[0]);
        const dy = Rational.parse(op.offset[1]);
        const dz = Rational.parse(op.offset[2]);
        // A pure translation of the selected vertices — topology and ids ride
        // through untouched. Not re-welded: moving a vertex onto another is
        // the author's deformation, not a merge, so identity is preserved.
        const verts: RVec3[] = mesh.verts.map((v) =>
          inRegion(v, region) ? [v[0].add(dx), v[1].add(dy), v[2].add(dz)] : v,
        );
        mesh = { ...mesh, verts };
        break;
      }
      case "crease": {
        if (!mesh) throw new Error(`evalTrace: op ${i} 'crease' before any geometry`);
        const region = parseRegion(op.region);
        const marked = new Set<string>(mesh.creases ?? []);
        for (const e of edgesOf(mesh).values()) {
          if (inRegion(mesh.verts[e.a]!, region) && inRegion(mesh.verts[e.b]!, region)) {
            marked.add(edgeKey(e.a, e.b));
          }
        }
        mesh = { ...mesh, creases: marked };
        break;
      }
      case "scale": {
        if (!mesh) throw new Error(`evalTrace: op ${i} 'scale' before any geometry`);
        const region = parseRegion(op.region);
        const f: RVec3 = [Rational.parse(op.factor[0]), Rational.parse(op.factor[1]), Rational.parse(op.factor[2])];
        const p: RVec3 = [Rational.parse(op.pivot[0]), Rational.parse(op.pivot[1]), Rational.parse(op.pivot[2])];
        const verts: RVec3[] = mesh.verts.map((v) =>
          inRegion(v, region)
            ? [
                p[0].add(f[0].mul(v[0].sub(p[0]))),
                p[1].add(f[1].mul(v[1].sub(p[1]))),
                p[2].add(f[2].mul(v[2].sub(p[2]))),
              ]
            : v,
        );
        mesh = { ...mesh, verts };
        break;
      }
      default: {
        const bad = op as { op: string };
        throw new Error(`evalTrace: unknown op '${bad.op}'`);
      }
    }
  });
  if (!mesh) throw new Error("evalTrace: empty trace produced no geometry");
  return mesh;
}

interface ParsedRegion {
  x?: [Rational, Rational];
  y?: [Rational, Rational];
  z?: [Rational, Rational];
}

function parseRegion(region: Region): ParsedRegion {
  const axis = (b: [string, string] | undefined): [Rational, Rational] | undefined =>
    b ? [Rational.parse(b[0]), Rational.parse(b[1])] : undefined;
  const out: ParsedRegion = {};
  const x = axis(region.x);
  const y = axis(region.y);
  const z = axis(region.z);
  if (x) out.x = x;
  if (y) out.y = y;
  if (z) out.z = z;
  return out;
}

/** A vertex is in the region when every present axis-bound contains it —
 *  inclusive, exact rational comparison. */
function inRegion(v: RVec3, region: ParsedRegion): boolean {
  const bounds = [region.x, region.y, region.z] as const;
  for (let i = 0; i < 3; i++) {
    const b = bounds[i];
    if (!b) continue;
    if (v[i]!.cmp(b[0]) < 0 || v[i]!.cmp(b[1]) > 0) return false;
  }
  return true;
}

/** A trace's exact mesh AND the census predicted from it — the two projections
 *  of one exact object the pipeline hands forward (geometry to emit, census to
 *  adjudicate as a claim). */
export function evalTraceWithCensus(trace: Trace): { mesh: KernelMesh; census: PredictedCensus } {
  const mesh = evalTrace(trace);
  return { mesh, census: predictCensus(mesh) };
}

/* ------------------------------------------------------------------ */
/* Canonical serialization + content hash                              */
/* ------------------------------------------------------------------ */

/** Deterministic JSON: object keys sorted recursively, so the SAME trace is
 *  the SAME bytes regardless of how a producer happened to order fields. */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${body}}`;
}

export function canonicalize(trace: Trace): string {
  return canonicalJson(trace);
}

/** 64-bit FNV-1a over the canonical bytes, hex — a stable content id for the
 *  stage cache. Not cryptographic; it only has to be collision-free enough to
 *  key a cache and identical on every machine. */
export function traceHash(trace: Trace): string {
  const s = canonicalize(trace);
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = (1n << 64n) - 1n;
  for (let i = 0; i < s.length; i++) {
    h = (h ^ BigInt(s.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return h.toString(16).padStart(16, "0");
}

/* ------------------------------------------------------------------ */
/* The recording ctx — a trace producer                               */
/* ------------------------------------------------------------------ */

/**
 * The reference recording context: the verbs an author calls, each APPENDING
 * an exact op rather than performing it. This TS class is the contract the
 * solve-time Python `ctx` mirrors verb-for-verb — the author writes ordinary
 * imperative code (loops, helpers, halves-then-mirror) and what comes out is a
 * trace, which the compiler alone evaluates.
 *
 * Coordinates are given as rational strings or integers, never floats, so the
 * recipe is exact from the first keystroke; `box`/`grid` mint their cages in
 * exact rationals for the common seeds.
 */
export type Coord = string | number | Rational;

const coordStr = (c: Coord): string =>
  c instanceof Rational ? c.toString() : typeof c === "number" ? Rational.of(c).toString() : Rational.parse(c).toString();

export class Recorder {
  private readonly ops: TraceOp[] = [];

  /** Seed arbitrary geometry. Points are welded by exact coordinate. */
  cage(points: Array<[Coord, Coord, Coord]>, faces: number[][], ids?: string[]): this {
    this.ops.push({
      op: "cage",
      points: points.map((p) => [coordStr(p[0]), coordStr(p[1]), coordStr(p[2])]),
      faces: faces.map((f) => [...f]),
      ...(ids ? { ids: [...ids] } : {}),
    });
    return this;
  }

  /** The unit cube cage centred at the origin — the canonical CC seed. */
  box(half: Coord = 1): this {
    const h = coordStr(half);
    const n = Rational.parse(h).neg().toString();
    const c = (x: string, y: string, z: string): [Coord, Coord, Coord] => [x, y, z];
    return this.cage(
      [
        c(n, n, n), c(h, n, n), c(h, h, n), c(n, h, n),
        c(n, n, h), c(h, n, h), c(h, h, h), c(n, h, h),
      ],
      [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]],
    );
  }

  subdivide(levels = 1): this {
    this.ops.push({ op: "subdivide", levels });
    return this;
  }

  mirror(axis: 0 | 1 | 2): this {
    this.ops.push({ op: "mirror", axis });
    return this;
  }

  /** Translate the vertices in a coordinate region by an offset — an exact,
   *  topology-preserving deformation. Bounds and offset are exact (ints,
   *  rational strings, or Fractions). */
  move(
    region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] },
    offset: [Coord, Coord, Coord],
  ): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.ops.push({
      op: "move",
      region: r,
      offset: [coordStr(offset[0]), coordStr(offset[1]), coordStr(offset[2])],
    });
    return this;
  }

  /** Mark every edge with both endpoints in a coordinate region as sharp, so a
   *  later subdivide keeps it crisp. */
  crease(region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] }): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.ops.push({ op: "crease", region: r });
    return this;
  }

  /** Scale a region about a pivot by a per-axis factor — taper, bulge, squash. */
  scale(
    region: { x?: [Coord, Coord]; y?: [Coord, Coord]; z?: [Coord, Coord] },
    factor: [Coord, Coord, Coord],
    pivot: [Coord, Coord, Coord] = [0, 0, 0],
  ): this {
    const bound = (b: [Coord, Coord] | undefined): [string, string] | undefined =>
      b ? [coordStr(b[0]), coordStr(b[1])] : undefined;
    const r: Region = {};
    const x = bound(region.x);
    const y = bound(region.y);
    const z = bound(region.z);
    if (x) r.x = x;
    if (y) r.y = y;
    if (z) r.z = z;
    this.ops.push({
      op: "scale",
      region: r,
      factor: [coordStr(factor[0]), coordStr(factor[1]), coordStr(factor[2])],
      pivot: [coordStr(pivot[0]), coordStr(pivot[1]), coordStr(pivot[2])],
    });
    return this;
  }

  trace(): Trace {
    return { version: 1, ops: this.ops.map((o) => ({ ...o })) };
  }
}
