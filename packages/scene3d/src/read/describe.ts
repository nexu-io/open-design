import type { Census, CensusMesh, Issue } from "../types.js";
import { didYouMean } from "../solve/did-you-mean.js";

/**
 * Level-of-detail for information.
 *
 * A 50k-prim scene graph does not fit in a reader's context, and reading it
 * linearly is the wrong operation anyway — it is the equivalent of learning
 * a city by walking every street. What a reader needs is what a minimap
 * gives a player: the whole shape at a glance, with detail only where they
 * are working.
 *
 * So this does not truncate. Truncation drops the tail, which is arbitrary;
 * this *summarises*, spending a fixed budget on whichever parts of the
 * scene carry the most information, and says explicitly what it folded away
 * so the reader knows the difference between "there is nothing else" and
 * "there is more, ask for it".
 *
 * Every ordering here is deterministic. The same census always produces
 * byte-identical output, because a summary that drifts between runs cannot
 * be diffed, and diffing it is most of the point.
 */

export interface DescribeOptions {
  /**
   * Roughly how many tokens the result may occupy. Approximated at four
   * characters per token, which is close enough for budgeting and does not
   * require a tokenizer.
   */
  budgetTokens?: number;
  /** Only describe parts intersecting this world-space box. */
  region?: { min: Vec3; max: Vec3 };
  /** Expand the group containing this part in full, whatever the budget. */
  focus?: string;
}

type Vec3 = [number, number, number];

interface Part {
  name: string;
  min: Vec3;
  max: Vec3;
  tris: number;
  groundGap: number | null;
}

interface Group {
  /** Shared name prefix, e.g. "prp_bracket". */
  key: string;
  parts: Part[];
  min: Vec3;
  max: Vec3;
  tris: number;
}

const CHARS_PER_TOKEN = 4;

/**
 * A query the census cannot answer — an unknown `focus` name. A refusal, not
 * an empty result: `--focus prp_nope` used to return the ordinary unfocused
 * digest, so an agent's typo got a confidently WRONG answer where `--look`
 * refuses a bad name and lists the legal ones. Same posture here.
 */
export class DescribeRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DescribeRefusal";
  }
}

function fmt(n: number): string {
  // Millimetre precision. Finer is noise at asset scale and costs budget on
  // digits that never change a decision.
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
}

function fmtVec(v: Vec3): string {
  return `${fmt(v[0])} ${fmt(v[1])} ${fmt(v[2])}`;
}

function span(min: Vec3, max: Vec3): Vec3 {
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

function unionInto(target: { min: Vec3; max: Vec3 }, min: Vec3, max: Vec3): void {
  for (let a = 0; a < 3; a++) {
    if (min[a] < target.min[a]) target.min[a] = min[a];
    if (max[a] > target.max[a]) target.max[a] = max[a];
  }
}

function partsOf(census: Census): Part[] {
  const spatialByName = new Map<string, CensusMesh>();
  for (const mesh of census.meshes) spatialByName.set(mesh.object, mesh);

  const out: Part[] = [];
  for (const obj of census.objects) {
    if (obj.type !== "MESH") continue;
    const mesh = spatialByName.get(obj.name);
    const s = mesh?.spatial;
    // Prefer the measured vertex bounds; fall back to the object's own
    // world AABB when an older runner produced no spatial block.
    const min = (s?.worldMin ?? obj.worldMin) as Vec3 | null | undefined;
    const max = (s?.worldMax ?? obj.worldMax) as Vec3 | null | undefined;
    if (!min || !max) continue;
    out.push({
      name: obj.name,
      min: [...min] as Vec3,
      max: [...max] as Vec3,
      tris: mesh?.tris ?? 0,
      groundGap: s?.groundGap ?? null,
    });
  }
  // Name order, so the output is stable across runs and diffable.
  out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return out;
}

/**
 * Cluster by shared name prefix.
 *
 * Asset names are hierarchical in practice (`prp_bracket_fr_side`), so the
 * name tree is a free approximation of the structure tree — and unlike a
 * spatial clustering it matches how the author thinks about the scene, which
 * is what makes the summary actionable rather than merely accurate.
 */
function group(parts: Part[]): Group[] {
  const byKey = new Map<string, Part[]>();
  for (const part of parts) {
    const tokens = part.name.split("_");
    // Two tokens captures "prp_bracket" without collapsing everything into
    // the shared "prp" prefix that every part in a project carries.
    const key = tokens.length > 2 ? tokens.slice(0, 2).join("_") : part.name;
    const list = byKey.get(key);
    if (list) list.push(part);
    else byKey.set(key, [part]);
  }

  const groups: Group[] = [];
  for (const [key, members] of byKey) {
    const box = {
      min: [Infinity, Infinity, Infinity] as Vec3,
      max: [-Infinity, -Infinity, -Infinity] as Vec3,
    };
    let tris = 0;
    for (const m of members) {
      unionInto(box, m.min, m.max);
      tris += m.tris;
    }
    groups.push({ key, parts: members, min: box.min, max: box.max, tris });
  }
  // Largest first: the biggest groups are what a reader needs to know exist
  // before anything else.
  groups.sort((a, b) => b.parts.length - a.parts.length || (a.key < b.key ? -1 : 1));
  return groups;
}

function intersects(part: Part, region: { min: Vec3; max: Vec3 }): boolean {
  for (let a = 0; a < 3; a++) {
    if (part.min[a] > region.max[a] || part.max[a] < region.min[a]) return false;
  }
  return true;
}

/**
 * Summarise a scene within a token budget.
 *
 * Returns plain text rather than JSON: this is meant to be read, and the
 * hierarchy is carried by indentation instead of by punctuation the reader
 * has to parse past.
 */
export function describeScene(
  census: Census,
  issues: Issue[] = [],
  options: DescribeOptions = {},
): string {
  const budget = (options.budgetTokens ?? 700) * CHARS_PER_TOKEN;
  let parts = partsOf(census);
  if (options.focus !== undefined) {
    // The focus must NAME something — a part or a group key — before any
    // region filter narrows the view, so "focus outside your region" still
    // resolves and an unknown name refuses with the vocabulary.
    const names = new Set(parts.map((p) => p.name));
    for (const g of group(parts)) names.add(g.key);
    if (!names.has(options.focus)) {
      const sorted = [...names].sort();
      const shown = sorted.slice(0, 24);
      const more = sorted.length > shown.length ? `, …${sorted.length - shown.length} more` : "";
      throw new DescribeRefusal(
        `no part or group named '${options.focus}' — ${didYouMean(options.focus, sorted)}known: ${shown.join(", ")}${more}`,
      );
    }
  }
  if (options.region) parts = parts.filter((p) => intersects(p, options.region!));

  const lines: string[] = [];
  let used = 0;
  let truncated = 0;
  const push = (line: string): boolean => {
    // Reserve room for the closing note, so the summary can always afford
    // to admit what it left out.
    if (used + line.length > budget - 120) {
      truncated++;
      return false;
    }
    lines.push(line);
    used += line.length + 1;
    return true;
  };

  if (parts.length === 0) {
    // The issues still lead, exactly as they do for a populated scene: an
    // empty world usually HAS a reason (a parse error, a failed import),
    // and swallowing it here made "why is my scene empty" unanswerable
    // from the digest that exists to answer such questions.
    const head = options.region ? "empty region — no parts intersect it" : "empty scene — no meshes";
    const errs = issues.filter((i) => i.severity === "error").slice(0, 3);
    if (errs.length === 0) return head;
    return [
      head,
      ...errs.map((i) => `  ${i.code}${i.target ? ` [${i.target}]` : ""} ${i.message}`),
      ...(issues.filter((i) => i.severity === "error").length > 3
        ? [`  … +${issues.filter((i) => i.severity === "error").length - 3} more errors`]
        : []),
    ].join("\n");
  }

  /* ---- the whole shape first ---------------------------------------- */
  const world = {
    min: [Infinity, Infinity, Infinity] as Vec3,
    max: [-Infinity, -Infinity, -Infinity] as Vec3,
  };
  let tris = 0;
  for (const p of parts) {
    unionInto(world, p.min, p.max);
    tris += p.tris;
  }
  const size = span(world.min, world.max);
  push(`scene: ${parts.length} parts, ${tris.toLocaleString("en-US")} tris`);
  push(`extent: ${fmtVec(size)} m  (min ${fmtVec(world.min)} → max ${fmtVec(world.max)})`);

  /* ---- what is wrong, before what exists ----------------------------- */
  // Issues come first because they are the reason to read this at all, and
  // a budget spent describing healthy geometry while an error scrolls off
  // the end is a budget spent backwards.
  //
  // Scoped like everything else: a region query keeps scene-level issues
  // (no target) and issues touching a described part, and drops findings
  // about parts the region excluded — listing all 35 of a scene's issues
  // under a 47-part region defeated the budget the region exists to serve.
  // A target that names no census part at all (a material, a shader) is
  // not spatial and always stays.
  if (options.region) {
    const inView = new Set(parts.map((p) => p.name));
    const allParts = new Set(partsOf(census).map((p) => p.name));
    issues = issues.filter((issue) => {
      if (!issue.target) return true;
      const named = issue.target.split(" <-> ");
      if (!named.some((n) => allParts.has(n))) return true;
      return named.some((n) => inView.has(n));
    });
  }
  if (issues.length > 0) {
    const byCode = new Map<string, { severity: string; targets: string[] }>();
    const rankOf = (s: string) => (s === "error" ? 0 : s === "warning" ? 1 : 2);
    for (const issue of issues) {
      const row = byCode.get(issue.code) ?? { severity: issue.severity, targets: [] };
      // A code can carry mixed severities in one scene (authored vs
      // reclassified imported findings) — the row wears the worst, so the
      // demotion marker below never demotes a line that still has a real
      // error in it.
      if (rankOf(issue.severity) < rankOf(row.severity)) row.severity = issue.severity;
      if (issue.target) row.targets.push(issue.target);
      byCode.set(issue.code, row);
    }
    const codes = [...byCode.entries()].sort((a, b) => {
      const rank = (s: string) => (s === "error" ? 0 : s === "warning" ? 1 : 2);
      return rank(a[1].severity) - rank(b[1].severity) || (a[0] < b[0] ? -1 : 1);
    });
    push(`issues: ${issues.length}`);
    for (const [code, row] of codes) {
      const shown = row.targets.slice(0, 3).join(", ");
      const more = row.targets.length > 3 ? ` +${row.targets.length - 3} more` : "";
      // Same demotion marker the report wears: a code letter must never
      // contradict the adjudicated severity a reclassification chose.
      const letter = /^S3D-([EWI])-/.exec(code)?.[1];
      const letterSeverity =
        letter === "E" ? "error" : letter === "W" ? "warning" : letter === "I" ? "info" : undefined;
      const label = letterSeverity && letterSeverity !== row.severity ? `${code}→${row.severity}` : code;
      push(`  ${label} ×${row.targets.length || 1}${shown ? `: ${shown}${more}` : ""}`);
    }
  }

  /* ---- allocation statistics ----------------------------------------- */
  // One line each, chosen because renders systematically hide both facts:
  // triangle-density spread says whether the budget was spent sensibly
  // across parts (a 100x spread is the classic generated-asset failure),
  // and the worst bilateral asymmetry names the lumpy half no screenshot
  // shows. Statistical metadata for a reader who cannot rotate the model.
  // Scoped to the same part set as everything above: a region-focused
  // digest that quoted density or asymmetry from meshes OUTSIDE the region
  // described one thing while claiming to describe another.
  const described = new Set(parts.map((p) => p.name));
  const scopedMeshes = census.meshes.filter((m) => described.has(m.object));
  const densities = scopedMeshes
    .map((m) => ({ name: m.object, d: m.triDensity }))
    .filter((r): r is { name: string; d: number } => typeof r.d === "number" && r.d > 0)
    .sort((a, b) => a.d - b.d);
  if (densities.length > 1) {
    const lo = densities[0]!;
    const hi = densities[densities.length - 1]!;
    const spread = hi.d / lo.d;
    push(
      `density: ${Math.round(lo.d)}-${Math.round(hi.d)} tris/m² (${spread >= 10 ? `${Math.round(spread)}x spread — ` : ""}sparsest ${lo.name}, densest ${hi.name})`,
    );
  }
  const asym = scopedMeshes
    .map((m) => ({ name: m.object, e: m.symmetry?.maxError }))
    .filter((r): r is { name: string; e: number } => typeof r.e === "number")
    .sort((a, b) => b.e - a.e)[0];
  if (asym && asym.e > 0.0005) {
    push(`asymmetry: worst ${asym.name} (${(asym.e * 1000).toFixed(1)}mm off its own mirror)`);
  }

  /* ---- structure, coarsest first ------------------------------------- */
  const groups = group(parts);
  push(`groups: ${groups.length}`);
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    const gs = span(g.min, g.max);
    const single = g.parts.length === 1;
    // A group of one is labelled with the PART's name, never the shared
    // prefix it was filed under: "prp_crate" when the only member is
    // "prp_crate_a" names something that does not exist, and the reader
    // cannot select or edit it.
    const head = single
      ? `  ${g.parts[0]!.name}: ${fmtVec(span(g.parts[0]!.min, g.parts[0]!.max))} m` +
        ` at ${fmtVec(g.parts[0]!.min)}`
      : `  ${g.key} ×${g.parts.length}: spans ${fmtVec(gs)} m, ${g.tris.toLocaleString("en-US")} tris`;
    if (!push(head)) {
      // push() counted this group's own header; the groups never attempted
      // are folded away too, and the closing note must say so — "1 more
      // line" over a summary missing forty groups falsely implies it is
      // nearly complete. One line each is their cheapest rendering, so the
      // count is a floor, never an overclaim.
      truncated += groups.length - gi - 1;
      break;
    }

    // Expand a group only when the reader asked for it, or when it is small
    // enough that naming its members costs less than describing them.
    const expand = options.focus
      ? g.parts.some((p) => p.name === options.focus) || g.key === options.focus
      : g.parts.length <= 4;
    if (expand && !single) {
      for (let pi = 0; pi < g.parts.length; pi++) {
        const p = g.parts[pi]!;
        const gap = p.groundGap === null ? "" : `, ground ${fmt(p.groundGap)}`;
        if (!push(`    ${p.name}: ${fmtVec(span(p.min, p.max))} m at ${fmtVec(p.min)}${gap}`)) {
          truncated += g.parts.length - pi - 1;
          break;
        }
      }
    }
  }

  /* ---- never imply completeness we did not deliver -------------------- */
  if (truncated > 0) {
    lines.push(
      `… ${truncated} more line(s) folded away by the token budget — ` +
        `re-describe with a larger budget, a region, or a focus to see them`,
    );
  }
  return lines.join("\n");
}
