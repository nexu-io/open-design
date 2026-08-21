/**
 * The judgment engine — one loop over a descriptor TABLE.
 *
 * This is the "smart, not a series of ifs" core: every threshold lives in data
 * (budgets.ts / the contract), every comparison is one generic evaluator, and
 * a new intent check is a new ROW here, never a new branch elsewhere. Each
 * descriptor is a pure quadruple — measure a fact, look up its bound, decide
 * if it fails, phrase it — and `judge()` iterates descriptors × parts.
 *
 * Two invariants keep it honest:
 *   - severity is only 'warning' | 'info', enforced in the TYPE. Errors are the
 *     province of the ten validated rule modules and the claims adjudicator; an
 *     intent budget is advice, never a compile-blocker ("only w's").
 *   - a descriptor with no bound and no fact stays SILENT. Existing scenes,
 *     which use no canonical role and set no budget, resolve to empty budgets
 *     and produce zero new issues — byte-identical compiles.
 *
 * Facts that describe a whole repeat family (tri share, VRAM, size) are judged
 * once, on the base part (`partId === familyId`); per-instance flooding of a
 * repeat grid is thereby impossible.
 */

import { Census, Issue } from "../types.js";
import { NormalizedContract } from "../contract.js";
import type { SolvedScene } from "../solve/types.js";
import { ISSUE_CODES } from "../errors.js";
import { resolveBudgets, type ResolvedPartBudget } from "./budgets.js";
import { deriveFacts, type DerivedFacts } from "./facts.js";

interface JudgeCtx {
  census: Census;
  facts: DerivedFacts;
  contract: NormalizedContract;
  part: ResolvedPartBudget;
}

interface Descriptor {
  code: string;
  severity: "warning" | "info";
  /** Undefined ⇒ not measurable for this part ⇒ skip (no fact, no issue). */
  fact: (cx: JudgeCtx) => number | undefined;
  /** Undefined ⇒ ungated for this part ⇒ skip (no budget, silence). */
  bound: (cx: JudgeCtx) => number | undefined;
  fails: (fact: number, bound: number) => boolean;
  message: (cx: JudgeCtx, fact: number, bound: number) => string;
  hint: (cx: JudgeCtx, fact: number, bound: number) => string;
  /** Measured numbers behind the finding — reach the model via the report. */
  detail: (cx: JudgeCtx, fact: number, bound: number) => Record<string, unknown>;
}

/** True only for the family's base part, so family-level facts fire once. */
const isBase = (cx: JudgeCtx): boolean => cx.part.partId === cx.part.familyId;

const pct = (v: number): string => `${Number((v * 100).toFixed(1))}%`;
const mib = (bytes: number): string => `${Number((bytes / (1024 * 1024)).toFixed(1))} MiB`;

/**
 * The intent-budget descriptor table. Adding a check is adding a row; every
 * literal it needs comes from a role profile or the contract, never inline.
 */
const DESCRIPTORS: Descriptor[] = [
  // A prototype family spends more of the scene's triangle budget than its
  // role should. A backdrop that owns 40% of the tris is detail in the wrong
  // place — a RELATIVE judgment no per-part ceiling could make.
  {
    code: ISSUE_CODES.OVER_ROLE_TRI_SHARE,
    severity: "warning",
    fact: (cx) => (isBase(cx) ? cx.facts.triShareByFamily.get(cx.part.familyId) : undefined),
    bound: (cx) => cx.part.budget.triShare?.softMax,
    fails: (f, b) => f > b,
    message: (cx, f, b) =>
      `'${cx.part.familyId}' (role ${cx.part.role}) owns ${pct(f)} of the scene's triangles, over the ${pct(b)} its role budgets`,
    hint: () => "move detail to the hero parts, or decimate this family",
    detail: (cx, f, b) => ({ share: f, budget: b, sceneTris: cx.facts.sceneTris }),
  },

  // A high-detail part (hero/character, rank 3) carries FEWER triangles than a
  // lower-rank family in the same scene — the detail budget is inverted. Pure
  // ordinal comparison; there is no absolute triangle number anywhere.
  {
    code: ISSUE_CODES.ROLE_RANK_INVERSION,
    severity: "warning",
    fact: (cx) => {
      if (!isBase(cx) || cx.part.rank === undefined || cx.part.rank < 3) return undefined;
      const mine = cx.facts.trisByFamily.get(cx.part.familyId) ?? 0;
      let worst: number | undefined;
      for (const [fam, rank] of cx.facts.rankByFamily) {
        if (rank >= cx.part.rank!) continue;
        const theirs = cx.facts.trisByFamily.get(fam) ?? 0;
        if (theirs > mine) worst = Math.max(worst ?? 0, theirs);
      }
      return worst; // undefined ⇒ no inversion ⇒ silent
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
  // "36 MiB of textures for a 12-triangle table". Per family, so a repeated
  // part is not counted per instance.
  {
    code: ISSUE_CODES.PART_TEXTURE_BUDGET,
    severity: "warning",
    fact: (cx) => (isBase(cx) ? cx.facts.textureBytesByPart.get(cx.part.partId) : undefined),
    bound: (cx) => cx.part.budget.textureBytes?.softMax,
    fails: (f, b) => f > b,
    message: (cx, f, b) =>
      `'${cx.part.familyId}' (role ${cx.part.role}) binds ${mib(f)} of texture, over the ${mib(b)} its role budgets`,
    hint: () => "shrink or share the textures, or raise the budget for this role",
    detail: (cx, f, b) => ({ textureBytes: f, budget: b }),
  },

  // A part wildly LARGER than the scene median — the "avocado bigger than the
  // fox" scale slip. One-sided so it fits the table; the small side is its own
  // row below. Gated: fires only where a role or the contract sets a bound.
  {
    code: ISSUE_CODES.SIZE_INCOHERENT,
    severity: "warning",
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
    fact: (cx) => (isBase(cx) ? cx.facts.sizeRatioByPart.get(cx.part.partId) : undefined),
    bound: (cx) => cx.part.budget.sizeRatio?.min,
    fails: (f, b) => f < b,
    message: (cx, f) =>
      `'${cx.part.familyId}' is ${Number(f.toFixed(3))}× the scene's median part size — a likely unit/scale slip`,
    hint: () => "check this part's units (metres vs millimetres) against the rest of the scene",
    detail: (cx, f) => ({ sizeRatio: f, medianMaxDim: cx.facts.medianMaxDim }),
  },
];

/** Deterministic issue order: by code, then target. */
function sortIssues(issues: Issue[]): Issue[] {
  return issues.sort((a, b) =>
    a.code === b.code ? (a.target ?? "").localeCompare(b.target ?? "") : a.code.localeCompare(b.code),
  );
}

function mkIssue(d: Descriptor, cx: JudgeCtx, fact: number, bound: number): Issue {
  // A measured overrun (how far past the budget, as a fraction) lets the
  // verdict rank "fix this first" by real magnitude, not just frequency.
  const overrun = bound > 0 ? Number((fact / bound - 1).toFixed(3)) : undefined;
  return {
    code: d.code,
    severity: d.severity,
    message: d.message(cx, fact, bound),
    hint: d.hint(cx, fact, bound),
    target: cx.part.partId,
    detail: { ...d.detail(cx, fact, bound), ...(overrun !== undefined ? { overrun } : {}) },
  };
}

/**
 * Judge one scene's intent budgets. Additive: returns issues, never mutates.
 * A scene with no solved parts (a mesh/usda import) or no census produces
 * nothing — intent is only authored in scene.json.
 */
export function lintIntent(
  census: Census | undefined,
  contract: NormalizedContract,
  solved: SolvedScene | undefined,
  issues: Issue[],
): void {
  if (!census || !solved || solved.parts.length === 0) return;
  const budgets = resolveBudgets(solved, contract);
  const facts = deriveFacts(census, budgets);
  const parts = [...budgets.values()];
  const out: Issue[] = [];
  for (const d of DESCRIPTORS) {
    for (const part of parts) {
      const cx: JudgeCtx = { census, facts, contract, part };
      const bound = d.bound(cx);
      if (bound === undefined) continue;
      const fact = d.fact(cx);
      if (fact === undefined) continue;
      if (d.fails(fact, bound)) out.push(mkIssue(d, cx, fact, bound));
    }
  }
  issues.push(...sortIssues(out));
}
