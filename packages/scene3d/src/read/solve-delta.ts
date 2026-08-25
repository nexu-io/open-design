import type { SceneSpec, SolvedScene, Vec3 } from "../solve/types.js";

/**
 * The solve-diff residual classifier — the codec move made native.
 *
 * A codec never differentiates; it predicts from the previous frame and
 * spends its bits on the residual. The previous SOLVE is that frame: every
 * per-part change between two solves is one of
 *
 *   authored    — the part's own declaration (or a relation naming it)
 *                 changed: the edit itself, fully explained, one count;
 *   propagated  — the declaration is untouched but the box moved, and an
 *                 authored change is reachable through the part's relation
 *                 dependencies: the graph doing exactly its job. The
 *                 author's mental model already predicts it ("everything
 *                 on the plinth moves with the plinth"), so it compresses
 *                 to a count;
 *   residual    — a change NEITHER of those explains: a part moved or
 *                 switched support though nothing it depends on was
 *                 touched. With a deterministic solver that should never
 *                 happen, which is precisely why it deserves the report's
 *                 bandwidth when it does — it means the compiler itself
 *                 (a solver change, an epsilon, a contract default)
 *                 changed the answer under an unchanged declaration.
 *
 * Pure and deterministic: snapshots in, classification out. Fingerprints
 * and dependency edges are computed by the caller (a hash of the part's
 * authored spec entry plus every relation that targets it; the ids those
 * relations reference), so this module never sees the spec.
 */

export interface SolveSnapshotPart {
  id: string;
  center: Vec3;
  size: Vec3;
  restsOn?: string;
  /** Hash of the authored declaration + targeting relations (clones carry
   *  their base part's fingerprint — editing the base authored them all). */
  fingerprint: string;
  /** Ids this part's placement READS: relation references, plus the base
   *  part for a clone. The edges the explained-set propagates along. */
  deps?: string[];
}

export interface SolveSnapshot {
  /** Hash of the non-spec solve inputs (grid constraints etc.). Two
   *  snapshots with different bases are not comparable: a global input
   *  moved everything, and a fabricated per-part delta is worse than
   *  silence. */
  basis: string;
  parts: SolveSnapshotPart[];
}

export interface SolveResidual {
  id: string;
  /** `support` — what holds it up changed; `drift` — it moved. Both with
   *  no authored cause anywhere in the dependency closure. */
  kind: "support" | "drift";
  from?: string;
  to?: string;
}

export interface SolveDelta {
  /** Ids whose authored declaration changed — the edit itself. */
  authored: string[];
  added: string[];
  removed: string[];
  /** Untouched declarations that moved with an authored cause upstream. */
  propagated: string[];
  /** The surprises: changes with no authored cause in the closure. */
  residuals: SolveResidual[];
  /** Untouched and unmoved. */
  steady: number;
}

/**
 * Freeze one solve as the next compile's prediction frame.
 *
 * Fingerprint = hash of the part's authored declaration plus every relation
 * that names it, so "authored" is decided by bytes the author wrote, never
 * by solved output. Dependency edges are every part id a targeting relation
 * references — collected generically over the relation's string values, so
 * a relation added to the language tomorrow feeds the closure without this
 * module learning its name. Clones depend on their base: editing the base
 * authored them all.
 *
 * `hash` is injected (the pipeline passes its own `hashJson`) so this
 * module stays pure and the fingerprint stays byte-identical with every
 * other hash the compiler makes.
 */
export function snapshotSolve(
  spec: SceneSpec,
  solved: SolvedScene,
  basisInputs: unknown,
  hash: (value: unknown) => string,
): SolveSnapshot {
  const partIds = new Set(spec.parts.map((p) => p.id));
  const byId = new Map(spec.parts.map((p) => [p.id, p]));
  const relationsFor = new Map<string, unknown[]>();
  for (const relation of spec.relations ?? []) {
    const target = (relation as { part?: unknown }).part;
    const targets = Array.isArray(target) ? target : [target];
    for (const t of targets) {
      if (typeof t !== "string" || !partIds.has(t)) continue;
      let list = relationsFor.get(t);
      if (!list) relationsFor.set(t, (list = []));
      list.push(relation);
    }
  }
  const referencedIds = (value: unknown, out: Set<string>): void => {
    if (typeof value === "string") {
      if (partIds.has(value)) out.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) referencedIds(v, out);
      return;
    }
    if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (k === "part") continue;
        referencedIds(v, out);
      }
    }
  };
  const fingerprints = new Map<string, { fingerprint: string; deps: string[] }>();
  const forBase = (base: string): { fingerprint: string; deps: string[] } => {
    let entry = fingerprints.get(base);
    if (entry) return entry;
    const relations = relationsFor.get(base) ?? [];
    const deps = new Set<string>();
    for (const relation of relations) referencedIds(relation, deps);
    deps.delete(base);
    entry = {
      fingerprint: hash({ part: byId.get(base), relations }),
      deps: [...deps].sort(),
    };
    fingerprints.set(base, entry);
    return entry;
  };
  const parts: SolveSnapshotPart[] = solved.parts.map((part) => {
    const base = part.from ?? part.id;
    const { fingerprint, deps } = forBase(base);
    const own = part.from ? [...new Set([...deps, base])].sort() : deps;
    return {
      id: part.id,
      center: part.center,
      size: part.size,
      ...(part.restsOn !== undefined ? { restsOn: part.restsOn } : {}),
      fingerprint,
      ...(own.length > 0 ? { deps: own } : {}),
    };
  });
  parts.sort((a, b) => a.id.localeCompare(b.id));
  return { basis: hash({ basis: basisInputs ?? null }), parts };
}

const MOVED_EPS = 1e-9;

function moved(a: SolveSnapshotPart, b: SolveSnapshotPart): boolean {
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.center[i]! - b.center[i]!) > MOVED_EPS) return true;
    if (Math.abs(a.size[i]! - b.size[i]!) > MOVED_EPS) return true;
  }
  return false;
}

export function classifySolveDelta(
  prev: SolveSnapshot,
  next: SolveSnapshot,
): SolveDelta | undefined {
  // A different basis means a global input moved: nothing per-part can be
  // honestly attributed, so the delta declines to exist rather than lie.
  if (prev.basis !== next.basis) return undefined;
  const before = new Map(prev.parts.map((p) => [p.id, p]));
  const after = new Map(next.parts.map((p) => [p.id, p]));
  const delta: SolveDelta = {
    authored: [],
    added: [],
    removed: [],
    propagated: [],
    residuals: [],
    steady: 0,
  };
  for (const p of prev.parts) if (!after.has(p.id)) delta.removed.push(p.id);
  const explained = new Set<string>(delta.removed);
  for (const n of next.parts) {
    const p = before.get(n.id);
    if (!p) {
      delta.added.push(n.id);
      explained.add(n.id);
    } else if (p.fingerprint !== n.fingerprint) {
      delta.authored.push(n.id);
      explained.add(n.id);
    }
  }
  // Fixpoint: a part is explained when anything it depends on is. The graph
  // is small (MAX_PARTS-bounded) and acyclic in practice; the loop is
  // bounded by the part count either way.
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of next.parts) {
      if (explained.has(n.id)) continue;
      if (n.deps?.some((d) => explained.has(d))) {
        explained.add(n.id);
        grew = true;
      }
    }
  }
  for (const n of next.parts) {
    const p = before.get(n.id);
    if (!p || p.fingerprint !== n.fingerprint) continue; // counted above
    const restChanged = p.restsOn !== n.restsOn;
    const boxMoved = moved(p, n);
    if (!restChanged && !boxMoved) {
      delta.steady++;
      continue;
    }
    if (explained.has(n.id)) {
      // Predicted by the graph: compressible to a count.
      delta.propagated.push(n.id);
      continue;
    }
    // The residual: it changed and nothing it reads did.
    if (restChanged) {
      delta.residuals.push({
        id: n.id,
        kind: "support",
        ...(p.restsOn !== undefined ? { from: p.restsOn } : {}),
        ...(n.restsOn !== undefined ? { to: n.restsOn } : {}),
      });
    } else {
      delta.residuals.push({ id: n.id, kind: "drift" });
    }
  }
  // Deterministic order regardless of map iteration quirks.
  delta.authored.sort();
  delta.added.sort();
  delta.removed.sort();
  delta.propagated.sort();
  delta.residuals.sort((a, b) => a.id.localeCompare(b.id));
  return delta;
}

/** True when there is nothing worth a line in the report. */
export function solveDeltaIsEmpty(d: SolveDelta): boolean {
  return (
    d.authored.length === 0 &&
    d.added.length === 0 &&
    d.removed.length === 0 &&
    d.propagated.length === 0 &&
    d.residuals.length === 0
  );
}
