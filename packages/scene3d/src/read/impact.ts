import type { Census, Issue } from "../types.js";

/**
 * What an edit changed, including outside the field of view.
 *
 * The stated fear about editing a large scene is action at a distance: move
 * a cliff, and it orphans a path, breaks a sightline and clips a scatter
 * region — none of which is in the working set, and none of which a render
 * of the cliff would show. The remedy is not a better viewport. It is for
 * the compiler to say, after every edit, what changed state because of it.
 *
 * Three kinds of change are reported, and the third is the one that earns
 * this module:
 *
 *   parts    — added, removed, or moved, with the delta.
 *   issues   — appeared or resolved, keyed by code and target.
 *   contacts — made or broken. This is the action-at-a-distance signal. A
 *              part that did not move can still lose the thing it was
 *              resting on, and nothing about that part's own numbers
 *              changes. Only the relationship does.
 *
 * Everything is derived by comparing two censuses, so it costs nothing at
 * build time and cannot disagree with what was measured.
 */

type Vec3 = [number, number, number];

export interface PartMove {
  part: string;
  /** World-space movement of the part's bounding-box centre. */
  delta: Vec3;
  distance: number;
}

export interface ContactChange {
  a: string;
  b: string;
  /** Separation before and after, in metres. */
  before: number | null;
  after: number | null;
}

export interface ImpactReport {
  partsAdded: string[];
  partsRemoved: string[];
  partsMoved: PartMove[];
  partsResized: string[];
  issuesAppeared: Array<{ code: string; target?: string }>;
  issuesResolved: Array<{ code: string; target?: string }>;
  contactsMade: ContactChange[];
  contactsBroken: ContactChange[];
  /** Materials whose measured properties changed, with per-property
   *  before → after prose. The delta used to be blind to every
   *  non-geometric edit: a roughness change produced "unchanged since
   *  previous compile" in a report whose own materials line, eight lines
   *  down, printed the new value. */
  materialsChanged: Array<{ name: string; changes: string[] }>;
  /** Animation facts that changed (frame range, clips, measured cycle
   *  bounds) — the other formerly invisible edit class. */
  animationChanged: string[];
  /** True when nothing at all changed — worth stating rather than inferring
   *  from the empty arrays. */
  unchanged: boolean;
  /**
   * True when THIS compile produced no measured world (the build never ran
   * or failed), so no geometric or contact diff can honestly exist. Only
   * the issue lists carry information in that state. Without this flag, a
   * failed parse used to diff as an EMPTY WORLD: entering a failure
   * reported every contact broken and every part removed, being inside
   * one reported "unchanged" while real edits accumulated, and the first
   * success afterwards re-announced the entire scene as appeared.
   */
  noBuild?: boolean;
}

/**
 * Movement below this is not an edit.
 *
 * Blender's transforms and the vertex mean are floating point, so a scene
 * recompiled without changes can differ in the last bits. A millimetre is
 * far above that noise and far below anything a person means to do.
 */
const MOVE_EPSILON = 0.001;

interface Box {
  min: Vec3;
  max: Vec3;
}

function boxes(census: Census | undefined): Map<string, Box> {
  const out = new Map<string, Box>();
  if (!census) return out;
  const spatial = new Map(census.meshes.map((m) => [m.object, m.spatial]));
  for (const obj of census.objects) {
    if (obj.type !== "MESH") continue;
    const s = spatial.get(obj.name);
    const min = (s?.worldMin ?? obj.worldMin) as Vec3 | null | undefined;
    const max = (s?.worldMax ?? obj.worldMax) as Vec3 | null | undefined;
    if (!min || !max) continue;
    out.set(obj.name, { min: [...min] as Vec3, max: [...max] as Vec3 });
  }
  return out;
}

function centre(b: Box): Vec3 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

function size(b: Box): Vec3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

function pairKey(a: string, b: string): string {
  // Order-independent, so a runner that reports (a,b) one run and (b,a) the
  // next does not read as the contact having been broken and remade.
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

function contactMap(census: Census | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of census?.contacts ?? []) out.set(pairKey(c.a, c.b), c.separation);
  return out;
}

function issueKey(i: Issue): string {
  return `${i.code}\u0000${i.target ?? ""}`;
}

/** Compare two compiles. `previous` absent means this is the first one. */
export function changeImpact(
  previous: Census | undefined,
  next: Census | undefined,
  previousIssues: Issue[] = [],
  nextIssues: Issue[] = [],
): ImpactReport {
  // A compile with no census measured nothing: diffing it as an empty
  // world fabricates a catastrophe (everything removed, every contact
  // broken) that no edit caused. The ISSUE diff still carries truth —
  // the parse error that stopped the build is exactly the change worth
  // reporting — so it is kept while every geometric section is refused.
  if (!next) {
    const beforeIssues = new Map(previousIssues.map((i) => [issueKey(i), i]));
    const afterIssues = new Map(nextIssues.map((i) => [issueKey(i), i]));
    const issuesAppeared = [...afterIssues.values()]
      .filter((i) => !beforeIssues.has(issueKey(i)))
      .map((i) => ({ code: i.code, target: i.target }));
    const issuesResolved = [...beforeIssues.values()]
      .filter((i) => !afterIssues.has(issueKey(i)))
      .map((i) => ({ code: i.code, target: i.target }));
    const order = (l: Array<{ code: string; target?: string }>) =>
      l.sort(
        (a, b) =>
          (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) ||
          ((a.target ?? "") < (b.target ?? "") ? -1 : (a.target ?? "") > (b.target ?? "") ? 1 : 0),
      );
    order(issuesAppeared);
    order(issuesResolved);
    return {
      partsAdded: [], partsRemoved: [], partsMoved: [], partsResized: [],
      issuesAppeared, issuesResolved,
      contactsMade: [], contactsBroken: [],
      materialsChanged: [], animationChanged: [],
      unchanged: false,
      noBuild: true,
    };
  }
  const before = boxes(previous);
  const after = boxes(next);

  const partsAdded: string[] = [];
  const partsRemoved: string[] = [];
  const partsMoved: PartMove[] = [];
  const partsResized: string[] = [];

  for (const name of after.keys()) if (!before.has(name)) partsAdded.push(name);
  for (const name of before.keys()) if (!after.has(name)) partsRemoved.push(name);

  for (const [name, nowBox] of after) {
    const wasBox = before.get(name);
    if (!wasBox) continue;
    const was = centre(wasBox);
    const now = centre(nowBox);
    const delta: Vec3 = [now[0] - was[0], now[1] - was[1], now[2] - was[2]];
    const distance = Math.hypot(delta[0], delta[1], delta[2]);
    if (distance > MOVE_EPSILON) partsMoved.push({ part: name, delta, distance });
    const wasSize = size(wasBox);
    const nowSize = size(nowBox);
    if (wasSize.some((v, i) => Math.abs(v - nowSize[i]!) > MOVE_EPSILON)) partsResized.push(name);
  }

  const beforeIssues = new Map(previousIssues.map((i) => [issueKey(i), i]));
  const afterIssues = new Map(nextIssues.map((i) => [issueKey(i), i]));
  const issuesAppeared = [...afterIssues.values()]
    .filter((i) => !beforeIssues.has(issueKey(i)))
    .map((i) => ({ code: i.code, target: i.target }));
  const issuesResolved = [...beforeIssues.values()]
    .filter((i) => !afterIssues.has(issueKey(i)))
    .map((i) => ({ code: i.code, target: i.target }));

  /* ---- materials: the measured principled properties, diffed --------- */
  const materialsChanged: Array<{ name: string; changes: string[] }> = [];
  {
    const prevMats = new Map((previous?.materials ?? []).map((m) => [m.name, m]));
    const fmtV = (v: unknown): string =>
      Array.isArray(v)
        ? `[${v.map((n) => (typeof n === "number" ? Number(n.toFixed(3)) : n)).join(", ")}]`
        : typeof v === "number"
          ? String(Number(v.toFixed(4)))
          : String(v);
    // Added and removed materials are reported HERE, not assumed to ride
    // the part diff: swapping a mesh's material moves no box, so a
    // replacement on an otherwise unchanged part used to produce
    // "unchanged since previous compile" while the render visibly changed.
    const nextNames = new Set((next?.materials ?? []).map((m) => m.name));
    for (const was of previous?.materials ?? []) {
      if (!nextNames.has(was.name)) materialsChanged.push({ name: was.name, changes: ["removed"] });
    }
    for (const mat of next?.materials ?? []) {
      const was = prevMats.get(mat.name);
      if (!was) {
        materialsChanged.push({ name: mat.name, changes: ["added"] });
        continue;
      }
      const changes: string[] = [];
      const props: Array<keyof typeof mat.principled> = [
        "metallic", "roughness", "ior", "baseColor", "emission", "emissionStrength", "alpha",
      ];
      for (const prop of props) {
        const a = was.principled?.[prop];
        const b = mat.principled?.[prop];
        if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
          changes.push(`${prop} ${fmtV(a ?? "unset")} → ${fmtV(b ?? "unset")}`);
        }
      }
      if (
        changes.length === 0 &&
        was.graph !== undefined &&
        mat.graph !== undefined &&
        was.graph !== mat.graph
      ) {
        // The structural fingerprint catches what the property list cannot
        // (a texture rewired, a node inserted) — named generically rather
        // than silently absorbed.
        changes.push("node graph changed");
      }
      if (changes.length > 0) materialsChanged.push({ name: mat.name, changes });
    }
    // Reassignment: a mesh switched from existing material A to existing
    // material B. Both material RECORDS are unchanged, no box moved — the
    // per-object binding is the only fact that differs, so it is diffed
    // directly or the visible render change reads as "unchanged".
    const prevWear = new Map((previous?.meshes ?? []).map((m) => [m.object, m.materials ?? []]));
    for (const mesh of next?.meshes ?? []) {
      const was = prevWear.get(mesh.object);
      if (was === undefined) continue; // added parts already ride the part diff
      const now = mesh.materials ?? [];
      if (was.join(" ") !== now.join(" ")) {
        materialsChanged.push({
          name: mesh.object,
          changes: [`wears [${now.join(", ") || "none"}] (was [${was.join(", ") || "none"}])`],
        });
      }
    }
    materialsChanged.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /* ---- animation: frame range, clips, measured cycle bounds ---------- */
  const animationChanged: string[] = [];
  if (previous && next) {
    const a = previous.animation;
    const b = next.animation;
    if (Boolean(a) !== Boolean(b)) {
      // One census carries no animation block (an older runner, a partial
      // census). Nested comparisons would all silently skip, making "the
      // scene started animating" read as no change — the presence flip is
      // itself the finding, with whatever detail the present side carries.
      const present = (a ?? b)!;
      const moving = (present.keyframedObjects ?? []).join(", ");
      animationChanged.push(
        b
          ? `animation facts appeared (animated objects [${moving || "none"}])`
          : `animation facts no longer measured (previously animated: [${moving || "none"}])`,
      );
    }
    if (a && b) {
      if (a.frameStart !== b.frameStart || a.frameEnd !== b.frameEnd) {
        animationChanged.push(
          `frame range ${a.frameStart}–${a.frameEnd} → ${b.frameStart}–${b.frameEnd}`,
        );
      }
      const clipsA = ((a as { actionNames?: string[] }).actionNames ?? []).join(", ");
      const clipsB = ((b as { actionNames?: string[] }).actionNames ?? []).join(", ");
      if (clipsA !== clipsB) animationChanged.push(`clips [${clipsA}] → [${clipsB}]`);
      // Which objects MOVE — compiler-owned spin/bob/screw keyframes carry
      // no clip names, so a part starting or stopping its motion was
      // invisible to the clip diff and to every geometric one (a spinning
      // part's rest box does not move).
      const movingA = (a.keyframedObjects ?? []).join(", ");
      const movingB = (b.keyframedObjects ?? []).join(", ");
      if (movingA !== movingB) {
        animationChanged.push(
          `animated objects [${movingA || "none"}] → [${movingB || "none"}]`,
        );
      }
      const boundsA = (a as { animatedBounds?: { min?: number[]; max?: number[] } }).animatedBounds;
      const boundsB = (b as { animatedBounds?: { min?: number[]; max?: number[] } }).animatedBounds;
      if (boundsA?.min && boundsA.max && boundsB?.min && boundsB.max) {
        const moved = [0, 1, 2].some(
          (i) =>
            Math.abs(boundsA.min![i]! - boundsB.min![i]!) > MOVE_EPSILON ||
            Math.abs(boundsA.max![i]! - boundsB.max![i]!) > MOVE_EPSILON,
        );
        if (moved) {
          const span = (bb: { min?: number[]; max?: number[] }) =>
            [0, 1, 2].map((i) => Number((bb.max![i]! - bb.min![i]!).toFixed(3))).join(" × ");
          animationChanged.push(`cycle bounds ${span(boundsA)} → ${span(boundsB)}`);
        }
      } else if (Boolean(boundsA?.min) !== Boolean(boundsB?.min)) {
        animationChanged.push(boundsB?.min ? "scene now animates" : "scene no longer animates");
      }
    }
  }

  const beforeContacts = contactMap(previous);
  const afterContacts = contactMap(next);
  const contactsMade: ContactChange[] = [];
  const contactsBroken: ContactChange[] = [];
  const split = (key: string): [string, string] => {
    const [a, b] = key.split("\u0000");
    return [a!, b!];
  };
  for (const [key, sep] of afterContacts) {
    if (beforeContacts.has(key)) continue;
    const [a, b] = split(key);
    contactsMade.push({ a, b, before: null, after: sep });
  }
  for (const [key, sep] of beforeContacts) {
    if (afterContacts.has(key)) continue;
    const [a, b] = split(key);
    contactsBroken.push({ a, b, before: sep, after: null });
  }

  // Deterministic ordering throughout, so two runs of the same edit produce
  // an identical report and the report itself can be diffed.
  const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  partsAdded.sort(byName);
  partsRemoved.sort(byName);
  partsResized.sort(byName);
  partsMoved.sort((a, b) => b.distance - a.distance || byName(a.part, b.part));
  contactsMade.sort((x, y) => byName(x.a, y.a) || byName(x.b, y.b));
  contactsBroken.sort((x, y) => byName(x.a, y.a) || byName(x.b, y.b));
  const order = (l: Array<{ code: string; target?: string }>) =>
    l.sort((a, b) => byName(a.code, b.code) || byName(a.target ?? "", b.target ?? ""));
  order(issuesAppeared);
  order(issuesResolved);

  return {
    partsAdded,
    partsRemoved,
    partsMoved,
    partsResized,
    issuesAppeared,
    issuesResolved,
    contactsMade,
    contactsBroken,
    materialsChanged,
    animationChanged,
    unchanged:
      partsAdded.length === 0 &&
      partsRemoved.length === 0 &&
      partsMoved.length === 0 &&
      partsResized.length === 0 &&
      issuesAppeared.length === 0 &&
      issuesResolved.length === 0 &&
      contactsMade.length === 0 &&
      contactsBroken.length === 0 &&
      materialsChanged.length === 0 &&
      animationChanged.length === 0,
  };
}

export interface FormatImpactOptions {
  /**
   * Cap the rendered lines, appending a deterministic "… +K more changes"
   * note when the report is longer. The cap is honest because the line order
   * below is fixed and consequence-first: whatever is dropped is always less
   * severe than whatever is kept, and the broken-support lines — the reason
   * this report exists — can never fall below the fold.
   */
  maxLines?: number;
}

/**
 * Render an impact report as the short prose a reader actually wants.
 *
 * Order is consequence-first, not category-first: a support that silently
 * stopped supporting, then a defect that appeared, then one that cleared,
 * then the mechanical moves that caused them. A reader (or a model that just
 * made an edit) needs the damage before the mechanics, and a line cap must
 * never be able to hide the damage behind a list of moves.
 */
export function formatImpact(report: ImpactReport, options: FormatImpactOptions = {}): string {
  if (report.unchanged) return "no change since the previous compile";
  const out: string[] = [];
  // A no-census compile with no issue delta used to render as the EMPTY
  // STRING — the one report shape that says nothing at all. The state is
  // itself the finding, so it always prints, before whatever issue lines
  // exist.
  if (report.noBuild) {
    out.push(
      "this compile produced no measured world (the build failed or never ran) — geometric diffs withheld",
    );
  }
  const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

  // 1. Broken contacts — the action-at-a-distance failure, first and unmissable.
  for (const c of report.contactsBroken) {
    out.push(`contact BROKEN: ${c.a} ↔ ${c.b} (was ${fmt(c.before ?? 0)}m apart)`);
  }
  // 2. Defects that appeared, then 3. defects that cleared.
  for (const i of report.issuesAppeared) {
    out.push(`issue APPEARED: ${i.code}${i.target ? ` on ${i.target}` : ""}`);
  }
  for (const i of report.issuesResolved) {
    out.push(`issue resolved: ${i.code}${i.target ? ` on ${i.target}` : ""}`);
  }
  // 4. New contacts, then 5. the mechanical part changes that drove all of it.
  for (const c of report.contactsMade) {
    out.push(`contact made: ${c.a} ↔ ${c.b} (${fmt(c.after ?? 0)}m apart)`);
  }
  if (report.partsAdded.length) out.push(`added: ${report.partsAdded.join(", ")}`);
  if (report.partsRemoved.length) out.push(`removed: ${report.partsRemoved.join(", ")}`);
  for (const m of report.partsMoved.slice(0, 8)) {
    out.push(
      `moved: ${m.part} by ${fmt(m.distance)}m ` +
        `(${fmt(m.delta[0])}, ${fmt(m.delta[1])}, ${fmt(m.delta[2])})`,
    );
  }
  if (report.partsMoved.length > 8) out.push(`moved: +${report.partsMoved.length - 8} more`);
  if (report.partsResized.length) out.push(`resized: ${report.partsResized.join(", ")}`);
  // 6. Non-geometric edits — materials and animation. Previously invisible:
  // a roughness change read as "unchanged since previous compile".
  for (const m of (report.materialsChanged ?? []).slice(0, 8)) {
    out.push(`material ${m.name}: ${m.changes.join(" · ")}`);
  }
  if ((report.materialsChanged ?? []).length > 8) {
    out.push(`material: +${report.materialsChanged.length - 8} more`);
  }
  for (const line of report.animationChanged ?? []) out.push(`animation: ${line}`);

  const cap = options.maxLines;
  if (cap !== undefined && cap > 0 && out.length > cap) {
    const kept = out.slice(0, cap - 1);
    kept.push(`… +${out.length - (cap - 1)} more changes`);
    return kept.join("\n");
  }
  return out.join("\n");
}
