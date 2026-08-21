/**
 * The judgment engine — one loop over a descriptor TABLE.
 *
 * This is the "smart, not a series of ifs" core: every threshold lives in data
 * (budgets.ts / the contract), every comparison is one generic evaluator, and
 * a new check is a new ROW, never a new branch. Each descriptor is a pure
 * quintuple — name the subject, measure a fact, look up its bound, decide if it
 * fails, phrase it — and `judge()` iterates descriptors × subjects.
 *
 * The engine is generic over the SUBJECT: a part (with its resolved intent
 * budget) or a material. The same loop judges both; only the descriptor tables
 * and the context differ. Adding a whole new subject kind is a new table plus
 * one `judge()` call, not a new engine.
 *
 * Two invariants keep it honest:
 *   - severity is only 'warning' | 'info', enforced in the TYPE. Errors are the
 *     province of the ten validated rule modules and the claims adjudicator; a
 *     budget or realism heuristic is advice, never a compile-blocker.
 *   - a descriptor with no bound stays SILENT. Existing scenes — no canonical
 *     role, no unphysical material — produce zero new issues (byte-identical).
 *
 * Facts that describe a whole repeat family (tri share, VRAM, size) are judged
 * once, on the base part (`partId === familyId`); per-instance flooding of a
 * repeat grid is thereby impossible.
 */

import { Census, CensusMaterial, Issue } from "../types.js";
import { NormalizedContract } from "../contract.js";
import type { SolvedScene } from "../solve/types.js";
import { ISSUE_CODES } from "../errors.js";
import { resolveBudgets, type ResolvedPartBudget } from "./budgets.js";
import { deriveFacts, type DerivedFacts } from "./facts.js";

/** A descriptor is generic over its subject's context. */
interface Descriptor<Ctx> {
  code: string;
  severity: "warning" | "info";
  /** The affected subject's name — jump-to target and provenance key. */
  target: (cx: Ctx) => string | undefined;
  /** Undefined ⇒ not measurable for this subject ⇒ skip. */
  fact: (cx: Ctx) => number | undefined;
  /** Undefined ⇒ ungated for this subject ⇒ skip (silence). */
  bound: (cx: Ctx) => number | undefined;
  fails: (fact: number, bound: number) => boolean;
  message: (cx: Ctx, fact: number, bound: number) => string;
  hint: (cx: Ctx, fact: number, bound: number) => string;
  /** Measured numbers behind the finding — reach the model via the report. */
  detail: (cx: Ctx, fact: number, bound: number) => Record<string, unknown>;
}

function mkIssue<Ctx>(d: Descriptor<Ctx>, cx: Ctx, fact: number, bound: number): Issue {
  // A measured overrun (how far past the budget, as a fraction) lets the
  // verdict rank "fix this first" by real magnitude, not just frequency.
  const overrun = bound > 0 ? Number((fact / bound - 1).toFixed(3)) : undefined;
  const target = d.target(cx);
  return {
    code: d.code,
    severity: d.severity,
    message: d.message(cx, fact, bound),
    hint: d.hint(cx, fact, bound),
    ...(target !== undefined ? { target } : {}),
    detail: { ...d.detail(cx, fact, bound), ...(overrun !== undefined ? { overrun } : {}) },
  };
}

/** The one loop: every descriptor against every subject; skip where ungated. */
function judge<Ctx>(descriptors: Descriptor<Ctx>[], subjects: Ctx[]): Issue[] {
  const out: Issue[] = [];
  for (const d of descriptors) {
    for (const cx of subjects) {
      const bound = d.bound(cx);
      if (bound === undefined) continue;
      const fact = d.fact(cx);
      if (fact === undefined) continue;
      if (d.fails(fact, bound)) out.push(mkIssue(d, cx, fact, bound));
    }
  }
  return out;
}

/* ---- subject: a solved part with its resolved intent budget --------------- */

interface PartCtx {
  census: Census;
  facts: DerivedFacts;
  contract: NormalizedContract;
  part: ResolvedPartBudget;
}

/** True only for the family's base part, so family-level facts fire once. */
const isBase = (cx: PartCtx): boolean => cx.part.partId === cx.part.familyId;

const pct = (v: number): string => `${Number((v * 100).toFixed(1))}%`;
const mib = (bytes: number): string => `${Number((bytes / (1024 * 1024)).toFixed(1))} MiB`;

const PART_DESCRIPTORS: Descriptor<PartCtx>[] = [
  // A prototype family spends more of the scene's triangle budget than its
  // role should — a RELATIVE judgment no per-part ceiling could make.
  {
    code: ISSUE_CODES.OVER_ROLE_TRI_SHARE,
    severity: "warning",
    target: (cx) => cx.part.partId,
    fact: (cx) => (isBase(cx) ? cx.facts.triShareByFamily.get(cx.part.familyId) : undefined),
    bound: (cx) => cx.part.budget.triShare?.softMax,
    fails: (f, b) => f > b,
    message: (cx, f, b) =>
      `'${cx.part.familyId}' (role ${cx.part.role}) owns ${pct(f)} of the scene's triangles, over the ${pct(b)} its role budgets`,
    hint: () => "move detail to the hero parts, or decimate this family",
    detail: (cx, f, b) => ({ share: f, budget: b, sceneTris: cx.facts.sceneTris }),
  },

  // A rank-3 hero carries FEWER triangles than a lower-rank family — the detail
  // budget is inverted. Pure ordinal comparison; no absolute number anywhere.
  {
    code: ISSUE_CODES.ROLE_RANK_INVERSION,
    severity: "warning",
    target: (cx) => cx.part.partId,
    fact: (cx) => {
      if (!isBase(cx) || cx.part.rank === undefined || cx.part.rank < 3) return undefined;
      const mine = cx.facts.trisByFamily.get(cx.part.familyId) ?? 0;
      let worst: number | undefined;
      for (const [fam, rank] of cx.facts.rankByFamily) {
        if (rank >= cx.part.rank!) continue;
        const theirs = cx.facts.trisByFamily.get(fam) ?? 0;
        if (theirs > mine) worst = Math.max(worst ?? 0, theirs);
      }
      return worst;
    },
    bound: (cx) => (cx.part.rank !== undefined && cx.part.rank >= 3 ? 0 : undefined),
    fails: (f) => f > 0,
    message: (cx, f) => {
      const mine = cx.facts.trisByFamily.get(cx.part.familyId) ?? 0;
      return `'${cx.part.familyId}' is a hero part (role ${cx.part.role}) with ${mine.toLocaleString()} triangles, fewer than a lower-detail part's ${f.toLocaleString()} — the detail budget is inverted`;
    },
    hint: () => "give the hero more geometry than the background, or correct the roles",
    detail: (cx, f) => ({ heroTris: cx.facts.trisByFamily.get(cx.part.familyId) ?? 0, lowerRankTris: f }),
  },

  // A part's bound textures decode to more VRAM than its role should ship —
  // "36 MiB for a 12-triangle table". Per family, not per instance.
  {
    code: ISSUE_CODES.PART_TEXTURE_BUDGET,
    severity: "warning",
    target: (cx) => cx.part.partId,
    fact: (cx) => (isBase(cx) ? cx.facts.textureBytesByPart.get(cx.part.partId) : undefined),
    bound: (cx) => cx.part.budget.textureBytes?.softMax,
    fails: (f, b) => f > b,
    message: (cx, f, b) =>
      `'${cx.part.familyId}' (role ${cx.part.role}) binds ${mib(f)} of texture, over the ${mib(b)} its role budgets`,
    hint: () => "shrink or share the textures, or raise the budget for this role",
    detail: (cx, f, b) => ({ textureBytes: f, budget: b }),
  },

  // A part wildly LARGER than the scene median — "avocado bigger than the fox".
  // One-sided so it fits the table; the small side is the next row.
  {
    code: ISSUE_CODES.SIZE_INCOHERENT,
    severity: "warning",
    target: (cx) => cx.part.partId,
    fact: (cx) => (isBase(cx) ? cx.facts.sizeRatioByPart.get(cx.part.partId) : undefined),
    bound: (cx) => cx.part.budget.sizeRatio?.max,
    fails: (f, b) => f > b,
    message: (cx, f) =>
      `'${cx.part.familyId}' is ${Number(f.toFixed(2))}× the scene's median part size — a likely unit/scale slip`,
    hint: () => "check this part's units (metres vs millimetres) against the rest of the scene",
    detail: (cx, f) => ({ sizeRatio: f, medianMaxDim: cx.facts.medianMaxDim }),
  },
  // ...and wildly SMALLER.
  {
    code: ISSUE_CODES.SIZE_INCOHERENT,
    severity: "warning",
    target: (cx) => cx.part.partId,
    fact: (cx) => (isBase(cx) ? cx.facts.sizeRatioByPart.get(cx.part.partId) : undefined),
    bound: (cx) => cx.part.budget.sizeRatio?.min,
    fails: (f, b) => f < b,
    message: (cx, f) =>
      `'${cx.part.familyId}' is ${Number(f.toFixed(3))}× the scene's median part size — a likely unit/scale slip`,
    hint: () => "check this part's units (metres vs millimetres) against the rest of the scene",
    detail: (cx, f) => ({ sizeRatio: f, medianMaxDim: cx.facts.medianMaxDim }),
  },

  // The part's worst triangle is a sliver beyond what its role tolerates — a
  // long thin triangle that passes every manifold check yet shades and (for a
  // rig) skins badly. The role sets the ceiling: tight for a hero, loose for a
  // background filler.
  {
    code: ISSUE_CODES.SLIVER_TRIANGLES,
    severity: "warning",
    target: (cx) => cx.part.partId,
    fact: (cx) => (isBase(cx) ? cx.facts.aspectRatioByPart.get(cx.part.partId) : undefined),
    bound: (cx) => cx.part.budget.maxAspectRatio,
    fails: (f, b) => f > b,
    message: (cx, f, b) =>
      `'${cx.part.familyId}' (role ${cx.part.role}) has a triangle with aspect ratio ${Number(f.toFixed(1))}:1, over the ${b}:1 its role tolerates`,
    hint: () => "remesh or re-topologise the slivers — they shade and (on a rig) skin poorly",
    detail: (cx, f, b) => ({ worstAspectRatio: f, budget: b }),
  },
];

/* ---- subject: a material (the PBR-combo heatmap, one line) ---------------- */

interface MaterialCtx {
  contract: NormalizedContract;
  material: CensusMaterial;
}

/** Rec709 luminance of a linear RGB colour. */
const luminance = (c: [number, number, number]): number =>
  0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

const MATERIAL_DESCRIPTORS: Descriptor<MaterialCtx>[] = [
  // A dark base colour driven fully metallic and mirror-smooth is a black
  // mirror, not a surface — the COMBINATION is unphysical though each value is
  // legal alone. Scalars only: a texture-driven channel reads null (B-8) and
  // never trips. Every number comes from conventions.pbr.realism.
  {
    code: ISSUE_CODES.UNREALISTIC_DARK_METAL,
    severity: "warning",
    target: (cx) => cx.material.name,
    fact: (cx) => {
      const r = cx.contract.pbrRealism;
      const p = cx.material.principled;
      if (!p.present || p.metallic === null || p.roughness === null || p.baseColor === null) {
        return undefined;
      }
      const lum = luminance(p.baseColor);
      const isDarkMetalMirror =
        lum <= r.darkLuminanceMax && p.metallic >= r.metalMin && p.roughness <= r.roughMax;
      return isDarkMetalMirror ? lum : undefined;
    },
    bound: (cx) => (cx.contract.pbrRealism.enabled ? cx.contract.pbrRealism.darkLuminanceMax : undefined),
    fails: (f, b) => f <= b,
    message: (cx, f) => {
      const p = cx.material.principled;
      return `material '${cx.material.name}' is near-black (luminance ${Number(f.toFixed(3))}) yet fully metallic (${p.metallic}) and mirror-smooth (roughness ${p.roughness}) — it renders as a black mirror`;
    },
    hint: () => "lighten the base colour, or lower metallic — a metal's base colour is its reflectance, rarely near-black",
    detail: (cx, f) => ({
      luminance: f,
      metallic: cx.material.principled.metallic,
      roughness: cx.material.principled.roughness,
    }),
  },
];

/** Deterministic issue order: by code, then target. */
function sortIssues(issues: Issue[]): Issue[] {
  return issues.sort((a, b) =>
    a.code === b.code ? (a.target ?? "").localeCompare(b.target ?? "") : a.code.localeCompare(b.code),
  );
}

/**
 * Judge a scene's intent budgets and material realism. Additive: returns
 * issues, never mutates. Material realism runs for any census (a mesh/usda
 * import has materials but no intent); part budgets need a solved scene, the
 * only place a `role` is authored.
 */
export function lintIntent(
  census: Census | undefined,
  contract: NormalizedContract,
  solved: SolvedScene | undefined,
  issues: Issue[],
): void {
  if (!census) return;
  const out: Issue[] = [];

  out.push(...judge(MATERIAL_DESCRIPTORS, census.materials.map((material) => ({ contract, material }))));

  if (solved && solved.parts.length > 0) {
    const budgets = resolveBudgets(solved, contract);
    const facts = deriveFacts(census, budgets);
    const parts = [...budgets.values()].map((part) => ({ census, facts, contract, part }));
    out.push(...judge(PART_DESCRIPTORS, parts));
  }

  issues.push(...sortIssues(out));
}
