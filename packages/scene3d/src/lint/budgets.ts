/**
 * Intent → budget resolution (the "judge what you MEANT" layer).
 *
 * A part's `role` is authored intent — a hero prop, a background filler, a
 * character. This module turns that intent into NUMBERS: the standard a part
 * of that role is held to. It is the data half of the smart-compiler spine:
 * every threshold lives in a table (built-in ROLE_PROFILES, or a project's
 * contract overrides), never in an `if`. The judgment half (facts ⊗ budgets →
 * issues) lives in judge.ts and reads what this produces.
 *
 * Composition, most-specific wins (the same layering `TARGET_PROFILES` uses):
 *   contract.partBudgets[id]  >  contract.roleBudgets[role]  >  ROLE_PROFILES[role]  >  {}
 *
 * An unknown / free-form role ("lid", "post") resolves to an empty budget and
 * is judged by nothing — roles stay free-form, existing scenes keep shipping
 * unchanged, and the smart checks activate only for the canonical roles a
 * project opts into.
 */

import { NormalizedContract } from "../contract.js";
import type { Budget } from "../types.js";
import type { SolvedScene, SolvedPart } from "../solve/types.js";

export type { Budget };

/**
 * The built-in role library — the ONLY place default role numbers live (game-
 * ready convention: BitSoul texel 512 hero / 256 prop / 128 bg). A project
 * redefines any of it through `conventions.budgets.roles`. Kept small on
 * purpose; unknown roles are legal and inert. `rank` is an ordinal detail tier
 * the judge compares BETWEEN parts (a rank-3 hero with fewer triangles than a
 * rank-1 background is a misallocated budget) with no absolute number.
 */
export const ROLE_PROFILES: Readonly<Record<string, Budget>> = {
  hero: { rank: 3, texelDensity: { min: 512 } },
  character: { rank: 3, texelDensity: { min: 512 } },
  prop: { rank: 2, triShare: { softMax: 0.5 }, texelDensity: { min: 256 } },
  background: {
    rank: 1,
    triShare: { softMax: 0.15 },
    texelDensity: { min: 128 },
    // A backdrop shipping a 1024² RGBA (4 MiB decoded) or more is over-invested.
    textureBytes: { softMax: 4 * 1024 * 1024 },
  },
  decor: { rank: 1, triShare: { softMax: 0.1 } },
};

/** A part's fully-resolved standard, keyed by its census object name. */
export interface ResolvedPartBudget {
  /** == census object name (`SolvedPart.id`). */
  partId: string;
  /** Effective role (a clone inherits its base part's role via the spread). */
  role?: string;
  /** Prototype id — repeat clones of one part share it, so family-level facts
   *  (tri share, VRAM) aggregate across the whole repeat grid. */
  familyId: string;
  /** Merged budget: absolute numbers only, ready for the judge. */
  budget: Budget;
  rank?: number;
}

/** Shallow-merge budgets, later arguments winning per top-level key. */
function mergeBudgets(...layers: Array<Budget | undefined>): Budget {
  const out: Budget = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of Object.keys(layer) as (keyof Budget)[]) {
      const v = layer[key];
      if (v !== undefined) (out as Record<string, unknown>)[key] = v;
    }
  }
  return out;
}

/**
 * Resolve every solved part to its effective budget. Pure and deterministic:
 * the returned map is keyed by object name, and each entry is the composition
 * of (built-in profile, project role override, project per-part override).
 */
export function resolveBudgets(
  solved: SolvedScene,
  contract: NormalizedContract,
): Map<string, ResolvedPartBudget> {
  const byId = new Map<string, SolvedPart>();
  for (const p of solved.parts) byId.set(p.id, p);
  const roleOverrides = contract.roleBudgets ?? {};
  const partOverrides = contract.partBudgets ?? {};

  const out = new Map<string, ResolvedPartBudget>();
  for (const p of solved.parts) {
    // A repeat clone carries its base's role via the spread, but resolve the
    // family through `from` so tri-share / VRAM aggregate over the whole grid.
    const base = p.from ? byId.get(p.from) : undefined;
    const familyId = base?.id ?? p.id;
    const role = p.role ?? base?.role;
    const profile = role ? ROLE_PROFILES[role] : undefined;
    const budget = mergeBudgets(
      profile,
      role ? roleOverrides[role] : undefined,
      partOverrides[p.id],
    );
    out.set(p.id, {
      partId: p.id,
      ...(role !== undefined ? { role } : {}),
      familyId,
      budget,
      ...(budget.rank !== undefined ? { rank: budget.rank } : {}),
    });
  }
  return out;
}
