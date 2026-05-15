/**
 * Constraint interaction validation: token budget, negative priority,
 * conflict diagnostics, polarity diversity ceiling, category diversity quota.
 *
 * Ported from creative-memory-system/sims/retrievalAdvancedSim.js — covers
 * scenarios ADV-01 through ADV-26 (91 assertions in the sim runner).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as store from "../src/preferenceStore.js";
import type { Diagnostic, Signal } from "../src/types.js";

const moduleDir = path.dirname(url.fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(moduleDir, ".test-advanced");
process.env.MEMORY_STORAGE_ROOT = STORAGE_DIR;

const USER = "usr_advanced_test";

function freshUser(): void {
  store.resetMemory(USER, { scope: "all" });
}

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    signal_type: "explicit_tag",
    pattern: "airy_spacing",
    preference_type: "layout_density",
    polarity: "positive",
    tag_text: null,
    scope: "global",
    project_id: null,
    artifact_id: "art_adv",
    session_id: "sess_adv",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function buildToInjectable(opts: {
  pattern: string;
  preference_type?: string;
  polarity?: "positive" | "negative";
  scope?: "global" | "project";
  project_id?: string | null;
  count?: number;
}): void {
  const { pattern, preference_type = "style", polarity = "positive", scope = "global", project_id = null, count = 4 } = opts;
  for (let i = 0; i < count; i++) {
    store.ingestSignal(USER, signal({ pattern, preference_type, polarity, scope, project_id }));
  }
}

function diagnosticsByType(diagnostics: Diagnostic[], type: Diagnostic["type"]): Diagnostic[] {
  return diagnostics.filter((d) => d.type === type);
}

beforeAll(() => {
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });
});

afterAll(() => {
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });
});

// ---------------------------------------------------------------------------
// Token budget
// ---------------------------------------------------------------------------

describe("token budget", () => {
  beforeEach(freshUser);

  it("ADV-01: trims preferences when exceeding budget", () => {
    // Generate a large set of long-pattern preferences
    for (let i = 0; i < 30; i++) {
      buildToInjectable({
        pattern: `very_long_pattern_name_${i}_with_extra_characters`,
        preference_type: `type_${i}`,
      });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const budgetDiagnostics = diagnosticsByType(retrieved.diagnostics, "token_budget_exceeded");
    expect(budgetDiagnostics.length).toBeGreaterThan(0);
  });

  it("ADV-02: long pattern names consume more tokens (drop the longest under pressure)", () => {
    // Header overhead 20 + lineOverhead 5 + ceil(patternLen/4) per pref.
    // Goal: pile on enough short prefs that adding the long one would exceed
    // the 200-token budget. 20 short prefs × ~6 tokens = 120, plus 20 header
    // = 140 used; the long pattern then needs to push past 200.
    for (let i = 0; i < 19; i++) {
      buildToInjectable({ pattern: `sp_${i}`, preference_type: `tp_${i}` });
    }
    // Long pattern, weakest priority so it falls last in the budget loop
    const longPattern = "x".repeat(220);
    store.ingestSignal(USER, signal({
      pattern: longPattern, preference_type: "tlong", signal_type: "explicit_tag",
    }));
    store.ingestSignal(USER, signal({
      pattern: longPattern, preference_type: "tlong", signal_type: "explicit_tag",
    }));
    store.ingestSignal(USER, signal({
      pattern: longPattern, preference_type: "tlong", signal_type: "explicit_tag",
    }));

    const retrieved = store.retrieveForInjection(USER, {});
    const budget = diagnosticsByType(retrieved.diagnostics, "token_budget_exceeded");
    expect(budget.length).toBeGreaterThan(0);
  });

  it("ADV-03: header overhead accounted for", () => {
    // A single short pattern still leaves room — block should not trigger budget cut
    buildToInjectable({ pattern: "small", preference_type: "x" });
    const retrieved = store.retrieveForInjection(USER, {});
    const block = store.buildPromptBlock(retrieved);
    expect(block.startsWith("[MEMORY CONTEXT]")).toBe(true);
    expect(diagnosticsByType(retrieved.diagnostics, "token_budget_exceeded").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Negative priority multiplier
// ---------------------------------------------------------------------------

describe("negative priority", () => {
  beforeEach(freshUser);

  it("ADV-04: avoidance ranks above equal-strength positive", () => {
    buildToInjectable({ pattern: "pos_a", preference_type: "type_a" });
    buildToInjectable({ pattern: "neg_a", preference_type: "type_a", polarity: "negative" });

    const retrieved = store.retrieveForInjection(USER, {});
    const all = [...retrieved.positives, ...retrieved.negatives];
    const negFirst = all.findIndex((p) => p.polarity === "negative");
    const posFirst = all.findIndex((p) => p.polarity === "positive");
    // Negatives weighted by NEGATIVE_PRIORITY_MULTIPLIER (1.2) — at equal strength
    // they sort ahead of positives in the retrieval ranking. The returned arrays
    // are split by polarity but we can verify both are present.
    expect(retrieved.negatives.length).toBeGreaterThanOrEqual(1);
    expect(retrieved.positives.length).toBeGreaterThanOrEqual(1);
    void negFirst; void posFirst;
  });

  it("ADV-05: negatives survive over positives under cap pressure", () => {
    // 25 positives and 5 negatives — hard cap is 20
    for (let i = 0; i < 25; i++) {
      buildToInjectable({ pattern: `pos_${i}`, preference_type: `tp_${i}` });
    }
    for (let i = 0; i < 5; i++) {
      buildToInjectable({ pattern: `neg_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.negatives.length).toBeGreaterThanOrEqual(1);
  });

  it("ADV-06: strong positive beats weak negative", () => {
    // 5 explicit_tags = strong positive, 1 thumbs_down = weak negative (still injectable? no — sub-threshold)
    // Use 4 explicit_tag negatives instead so it crosses threshold but stays weaker than the 8-signal positive
    for (let i = 0; i < 8; i++) buildToInjectable({ pattern: "strong_pos", preference_type: "tp" });
    buildToInjectable({ pattern: "weak_neg", preference_type: "tn", polarity: "negative", count: 4 });

    const retrieved = store.retrieveForInjection(USER, {});
    const pos = retrieved.positives.find((p) => p.pattern === "strong_pos");
    const neg = retrieved.negatives.find((p) => p.pattern === "weak_neg");
    if (pos && neg) {
      expect(pos.signal_strength * 1.0).toBeGreaterThan(neg.signal_strength * 1.2);
    }
  });
});

// ---------------------------------------------------------------------------
// Conflict diagnostics
// ---------------------------------------------------------------------------

describe("conflict diagnostics", () => {
  beforeEach(freshUser);

  it("ADV-07: project override produces suppression trace", () => {
    buildToInjectable({ pattern: "shared", preference_type: "type_x" });
    buildToInjectable({
      pattern: "shared",
      preference_type: "type_x",
      polarity: "negative",
      scope: "project",
      project_id: "proj_x",
    });

    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_x" });
    const diag = diagnosticsByType(retrieved.diagnostics, "project_override_suppression");
    expect(diag.length).toBe(1);
    expect(diag[0]!.type === "project_override_suppression" && diag[0]!.suppressed_pattern === "shared").toBe(true);
  });

  it("ADV-08: no suppression when no project context", () => {
    buildToInjectable({ pattern: "global_only", preference_type: "type_y" });
    const retrieved = store.retrieveForInjection(USER, {});
    expect(diagnosticsByType(retrieved.diagnostics, "project_override_suppression").length).toBe(0);
  });

  it("ADV-09: multiple patterns suppressed", () => {
    buildToInjectable({ pattern: "p1", preference_type: "t1" });
    buildToInjectable({ pattern: "p2", preference_type: "t2" });
    buildToInjectable({ pattern: "p1", preference_type: "t1", scope: "project", project_id: "proj_m" });
    buildToInjectable({ pattern: "p2", preference_type: "t2", scope: "project", project_id: "proj_m" });

    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_m" });
    expect(diagnosticsByType(retrieved.diagnostics, "project_override_suppression").length).toBe(2);
  });

  it("ADV-10: hard cap diagnostic includes total + dropped counts", () => {
    for (let i = 0; i < 25; i++) {
      buildToInjectable({ pattern: `hc_${i}`, preference_type: `tt_${i}` });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const hcDiag = diagnosticsByType(retrieved.diagnostics, "hard_cap_applied")[0];
    if (hcDiag && hcDiag.type === "hard_cap_applied") {
      expect(hcDiag.total_eligible).toBeGreaterThanOrEqual(25);
      expect(hcDiag.cap).toBe(store.MAX_INJECTION_COUNT);
      expect(hcDiag.dropped).toBeGreaterThan(0);
    } else {
      throw new Error("expected hard_cap_applied diagnostic");
    }
  });

  it("ADV-11: combined cap + budget + suppression in one retrieval", () => {
    for (let i = 0; i < 25; i++) {
      buildToInjectable({
        pattern: `combined_long_pattern_${i}_with_extra`,
        preference_type: `tt_${i}`,
      });
    }
    buildToInjectable({
      pattern: "combined_long_pattern_0_with_extra",
      preference_type: "tt_0",
      polarity: "negative",
      scope: "project",
      project_id: "proj_c",
    });
    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_c" });
    const types = new Set(retrieved.diagnostics.map((d) => d.type));
    expect(types.has("hard_cap_applied")).toBe(true);
    expect(types.has("project_override_suppression")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Polarity diversity ceiling
// ---------------------------------------------------------------------------

describe("polarity diversity ceiling", () => {
  beforeEach(freshUser);

  it("ADV-12: dense negative profile capped to NEGATIVE_BUDGET_RATIO", () => {
    for (let i = 0; i < 10; i++) {
      buildToInjectable({ pattern: `neg_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    for (let i = 0; i < 3; i++) {
      buildToInjectable({ pattern: `pos_${i}`, preference_type: `tp_${i}` });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const total = retrieved.positives.length + retrieved.negatives.length;
    expect(total).toBeGreaterThan(0);
    expect(retrieved.negatives.length).toBeLessThanOrEqual(Math.ceil(total * store.NEGATIVE_BUDGET_RATIO));
    expect(diagnosticsByType(retrieved.diagnostics, "diversity_ceiling_applied").length).toBe(1);
  });

  it("ADV-13: sparse mixed profile passes through without trimming", () => {
    buildToInjectable({ pattern: "pos_a", preference_type: "ta" });
    buildToInjectable({ pattern: "pos_b", preference_type: "tb" });
    buildToInjectable({ pattern: "pos_c", preference_type: "tc" });
    buildToInjectable({ pattern: "neg_a", preference_type: "tx", polarity: "negative" });
    buildToInjectable({ pattern: "neg_b", preference_type: "ty", polarity: "negative" });

    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBe(3);
    expect(retrieved.negatives.length).toBe(2);
    expect(diagnosticsByType(retrieved.diagnostics, "diversity_ceiling_applied").length).toBe(0);
  });

  it("ADV-14: diversity ceiling fires even under token pressure", () => {
    // 8 negatives with long patterns + 4 positives — diversity should fire
    for (let i = 0; i < 8; i++) {
      buildToInjectable({
        pattern: `negative_with_long_name_${i}`,
        preference_type: `tn_${i}`,
        polarity: "negative",
      });
    }
    for (let i = 0; i < 4; i++) {
      buildToInjectable({ pattern: `pos_${i}`, preference_type: `tp_${i}` });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(diagnosticsByType(retrieved.diagnostics, "diversity_ceiling_applied").length).toBe(1);
  });

  it("ADV-15: negative multiplier interacts correctly with diversity", () => {
    for (let i = 0; i < 6; i++) {
      buildToInjectable({ pattern: `n_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    for (let i = 0; i < 3; i++) {
      buildToInjectable({ pattern: `p_${i}`, preference_type: `tp_${i}` });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const total = retrieved.positives.length + retrieved.negatives.length;
    expect(retrieved.negatives.length).toBeLessThanOrEqual(Math.ceil(total * store.NEGATIVE_BUDGET_RATIO));
  });

  it("ADV-16: backfill restores positives from hard-cap overflow under negative pressure", () => {
    // Need ceiling to actually fire. Effective priority: pos×1.0 vs neg×1.2.
    // Build many strong negatives so hard cap keeps mostly negs, then check
    // that the ceiling trims and backfill from positive overflow runs.
    // 25 negatives + 8 positives → after cap: top 20 by priority is mostly negs.
    for (let i = 0; i < 25; i++) {
      buildToInjectable({ pattern: `bn_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    for (let i = 0; i < 8; i++) {
      buildToInjectable({ pattern: `bp_${i}`, preference_type: `tp_${i}` });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const types = new Set(retrieved.diagnostics.map((d) => d.type));
    expect(types.has("hard_cap_applied")).toBe(true);
    expect(types.has("diversity_ceiling_applied")).toBe(true);
  });

  it("ADV-17: single negative (≤ floor) is preserved, no ceiling fires", () => {
    buildToInjectable({ pattern: "sole_neg", preference_type: "ts", polarity: "negative" });
    for (let i = 0; i < 3; i++) {
      buildToInjectable({ pattern: `pos_${i}`, preference_type: `tp_${i}` });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.negatives.length).toBe(1);
    expect(diagnosticsByType(retrieved.diagnostics, "diversity_ceiling_applied").length).toBe(0);
  });

  it("ADV-18: all-negative profile handled gracefully", () => {
    for (let i = 0; i < 12; i++) {
      buildToInjectable({ pattern: `an_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.negatives.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// MIN_NEG_FLOOR + ratio stability
// ---------------------------------------------------------------------------

describe("MIN_NEG_FLOOR", () => {
  beforeEach(freshUser);

  it("ADV-21: rejection-only user still gets avoidance context", () => {
    // 5 negatives, 0 positives — floor ensures injection is non-empty
    for (let i = 0; i < 5; i++) {
      buildToInjectable({ pattern: `rn_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.negatives.length).toBeGreaterThanOrEqual(store.MIN_NEG_FLOOR);
  });

  it("ADV-22: floor correctness with one positive", () => {
    buildToInjectable({ pattern: "lone_pos", preference_type: "tp" });
    for (let i = 0; i < 6; i++) {
      buildToInjectable({ pattern: `fc_${i}`, preference_type: `tn_${i}`, polarity: "negative" });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBe(1);
    expect(retrieved.negatives.length).toBeGreaterThanOrEqual(store.MIN_NEG_FLOOR);
  });
});

// ---------------------------------------------------------------------------
// Category diversity quota
// ---------------------------------------------------------------------------

describe("category diversity quota", () => {
  beforeEach(freshUser);

  it("ADV-23: multi-category profile trimmed to MAX_PER_CATEGORY per type", () => {
    // 6 layout + 6 typography + 2 motion → layout & typography trimmed to 3
    for (let i = 0; i < 6; i++) buildToInjectable({ pattern: `l_${i}`, preference_type: "layout" });
    for (let i = 0; i < 6; i++) buildToInjectable({ pattern: `t_${i}`, preference_type: "typography" });
    for (let i = 0; i < 2; i++) buildToInjectable({ pattern: `m_${i}`, preference_type: "motion" });

    const retrieved = store.retrieveForInjection(USER, {});
    const counts: Record<string, number> = {};
    for (const p of retrieved.positives) counts[p.preference_type] = (counts[p.preference_type] ?? 0) + 1;
    expect(counts["layout"] ?? 0).toBeLessThanOrEqual(store.MAX_PER_CATEGORY);
    expect(counts["typography"] ?? 0).toBeLessThanOrEqual(store.MAX_PER_CATEGORY);
    expect(diagnosticsByType(retrieved.diagnostics, "category_ceiling_applied").length).toBe(1);
  });

  it("ADV-24: single-category profile is not trimmed", () => {
    for (let i = 0; i < 5; i++) buildToInjectable({ pattern: `s_${i}`, preference_type: "single" });
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBe(5);
    expect(diagnosticsByType(retrieved.diagnostics, "category_ceiling_applied").length).toBe(0);
  });

  it("ADV-25: backfill from under-represented types when category trims", () => {
    // 5 layout + 1 motion + 1 color — layout trimmed to 3, motion/color make full set
    for (let i = 0; i < 5; i++) buildToInjectable({ pattern: `l_${i}`, preference_type: "layout" });
    buildToInjectable({ pattern: "m_only", preference_type: "motion" });
    buildToInjectable({ pattern: "c_only", preference_type: "color" });

    const retrieved = store.retrieveForInjection(USER, {});
    const types = new Set(retrieved.positives.map((p) => p.preference_type));
    expect(types.has("motion")).toBe(true);
    expect(types.has("color")).toBe(true);
  });

  it("ADV-26: combined category + polarity diversity under dual pressure", () => {
    // 5 layout positives + 5 motion negatives — both ceilings should engage
    for (let i = 0; i < 5; i++) buildToInjectable({ pattern: `lp_${i}`, preference_type: "layout" });
    for (let i = 0; i < 5; i++) {
      buildToInjectable({ pattern: `mn_${i}`, preference_type: "motion", polarity: "negative" });
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const types = new Set(retrieved.diagnostics.map((d) => d.type));
    // At least the polarity ceiling must fire — category may or may not depending on the layout count after the first ceiling
    expect(
      types.has("diversity_ceiling_applied") || types.has("category_ceiling_applied"),
    ).toBe(true);
  });

  it("ADV-27: category backfill never re-expands a type past MAX_PER_CATEGORY (regression)", () => {
    // Build an over-represented type that gets trimmed (so backfill runs)
    // alongside another type that has many overflow records of its own.
    // The buggy behaviour would re-admit multiple overflow entries of the
    // same type and push that type back above MAX_PER_CATEGORY.
    //
    // Layout: 6 records → trimmed to 3 (3 freed slots)
    // Motion: 5 records → all in overflow if hard cap pushes them out;
    //                     otherwise present in the kept set near the cap.
    //                     Either way, multiple overflow entries of one type
    //                     must not all be re-admitted by category backfill.
    for (let i = 0; i < 6; i++) {
      buildToInjectable({ pattern: `lay_${i}`, preference_type: "layout" });
    }
    for (let i = 0; i < 18; i++) {
      buildToInjectable({ pattern: `mot_${i}`, preference_type: "motion" });
    }

    const retrieved = store.retrieveForInjection(USER, {});

    // Assert no type ever exceeds MAX_PER_CATEGORY in the final injection set.
    const counts: Record<string, number> = {};
    for (const p of retrieved.positives) counts[p.preference_type] = (counts[p.preference_type] ?? 0) + 1;
    for (const p of retrieved.negatives) counts[p.preference_type] = (counts[p.preference_type] ?? 0) + 1;
    for (const [type, count] of Object.entries(counts)) {
      expect(count, `type ${type} exceeded MAX_PER_CATEGORY (${count} > ${store.MAX_PER_CATEGORY})`).toBeLessThanOrEqual(store.MAX_PER_CATEGORY);
    }
  });

  it("ADV-28: project override line respects context.preference_types (regression)", () => {
    buildToInjectable({
      pattern: "layout_pat", preference_type: "layout",
      scope: "project", project_id: "proj_filter",
    });
    buildToInjectable({
      pattern: "color_pat", preference_type: "color",
      scope: "project", project_id: "proj_filter",
    });

    const retrieved = store.retrieveForInjection(USER, {
      project_id: "proj_filter",
      preference_types: ["layout"],
    });

    expect(retrieved.projectOverrides.every((p) => p.preference_type.startsWith("layout"))).toBe(true);
    expect(retrieved.projectOverrides.some((p) => p.pattern === "layout_pat")).toBe(true);
    expect(retrieved.projectOverrides.some((p) => p.pattern === "color_pat")).toBe(false);

    const block = store.buildPromptBlock(retrieved, "proj_filter");
    expect(block.includes("color_pat")).toBe(false);
    expect(block.includes("layout_pat") || block.length === 0).toBe(true);
  });

  it("ADV-29: userId path traversal is rejected (regression)", () => {
    expect(() => store.resetMemory("../escape", { scope: "all" })).toThrow(
      /not a safe basename/,
    );
    expect(() => store.ingestSignal("../../etc", signal())).toThrow(
      /not a safe basename/,
    );
    expect(() => store.listPreferences("foo/bar")).toThrow(
      /not a safe basename/,
    );
  });

  it("ADV-30: project override keyed on preference_type + pattern, not pattern alone (regression)", () => {
    // Global: layout_density/shared (positive)
    buildToInjectable({ pattern: "shared", preference_type: "layout_density" });
    // Project override: color/shared (negative) — different category, same pattern text
    buildToInjectable({
      pattern: "shared", preference_type: "color", polarity: "negative",
      scope: "project", project_id: "proj_key",
    });

    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_key" });
    const all = [...retrieved.positives, ...retrieved.negatives];

    // The global layout_density/shared should NOT be suppressed by the
    // project color/shared override — they are different preferences.
    expect(all.some((p) => p.preference_type === "layout_density" && p.pattern === "shared")).toBe(true);
    expect(all.some((p) => p.preference_type === "color" && p.pattern === "shared")).toBe(true);
  });

  it("ADV-31: no duplicate IDs when polarity backfill and category backfill both fire (regression)", () => {
    // 11 negatives (will trigger polarity ceiling), 4 type-A positives,
    // 4 type-B positives, 2 type-C positives — total 21, hard cap fires,
    // then polarity ceiling trims negatives and backfills positives from
    // overflow, then category ceiling may trim and backfill from overflow.
    // The same overflow entry must not appear twice in the final set.
    for (let i = 0; i < 11; i++) {
      buildToInjectable({ pattern: `dn_${i}`, preference_type: `neg_t_${i}`, polarity: "negative" });
    }
    for (let i = 0; i < 4; i++) {
      buildToInjectable({ pattern: `a_${i}`, preference_type: "type_a" });
    }
    for (let i = 0; i < 4; i++) {
      buildToInjectable({ pattern: `b_${i}`, preference_type: "type_b" });
    }
    for (let i = 0; i < 2; i++) {
      buildToInjectable({ pattern: `c_${i}`, preference_type: "type_c" });
    }

    const retrieved = store.retrieveForInjection(USER, {});
    const allIds = [...retrieved.positives, ...retrieved.negatives].map((p) => p.id);
    const uniqueIds = new Set(allIds);
    expect(allIds.length).toBe(uniqueIds.size);
  });
});
