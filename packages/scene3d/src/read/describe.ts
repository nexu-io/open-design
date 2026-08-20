import type { Census, CensusMesh, Issue } from "../types.js";

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
    return options.region ? "empty region — no parts intersect it" : "empty scene — no meshes";
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
  if (issues.length > 0) {
    const byCode = new Map<string, { severity: string; targets: string[] }>();
    for (const issue of issues) {
      const row = byCode.get(issue.code) ?? { severity: issue.severity, targets: [] };
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
      push(`  ${code} ×${row.targets.length || 1}${shown ? `: ${shown}${more}` : ""}`);
    }
  }

  /* ---- allocation statistics ----------------------------------------- */
  // One line each, chosen because renders systematically hide both facts:
  // triangle-density spread says whether the budget was spent sensibly
  // across parts (a 100x spread is the classic generated-asset failure),
  // and the worst bilateral asymmetry names the lumpy half no screenshot
  // shows. Statistical metadata for a reader who cannot rotate the model.
  const densities = census.meshes
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
  const asym = census.meshes
    .map((m) => ({ name: m.object, e: m.symmetry?.maxError }))
    .filter((r): r is { name: string; e: number } => typeof r.e === "number")
    .sort((a, b) => b.e - a.e)[0];
  if (asym && asym.e > 0.0005) {
    push(`asymmetry: worst ${asym.name} (${(asym.e * 1000).toFixed(1)}mm off its own mirror)`);
  }

  /* ---- structure, coarsest first ------------------------------------- */
  const groups = group(parts);
  push(`groups: ${groups.length}`);
  for (const g of groups) {
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
    if (!push(head)) break;

    // Expand a group only when the reader asked for it, or when it is small
    // enough that naming its members costs less than describing them.
    const expand = options.focus
      ? g.parts.some((p) => p.name === options.focus) || g.key === options.focus
      : g.parts.length <= 4;
    if (expand && !single) {
      for (const p of g.parts) {
        const gap = p.groundGap === null ? "" : `, ground ${fmt(p.groundGap)}`;
        if (!push(`    ${p.name}: ${fmtVec(span(p.min, p.max))} m at ${fmtVec(p.min)}${gap}`)) break;
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
