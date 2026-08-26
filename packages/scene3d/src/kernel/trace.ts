import { Rational } from "./rational.js";
import {
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

export type TraceOp =
  | {
      op: "cage";
      /** Each point is three rational strings; welded by exact coordinate. */
      points: Array<[string, string, string]>;
      faces: number[][];
      ids?: string[];
    }
  | { op: "subdivide"; levels: number }
  | { op: "mirror"; axis: 0 | 1 | 2 };

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
      default: {
        const bad = op as { op: string };
        throw new Error(`evalTrace: unknown op '${bad.op}'`);
      }
    }
  });
  if (!mesh) throw new Error("evalTrace: empty trace produced no geometry");
  return mesh;
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

  trace(): Trace {
    return { version: 1, ops: this.ops.map((o) => ({ ...o })) };
  }
}
