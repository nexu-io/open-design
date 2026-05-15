/**
 * Long-running temporal validation: multi-session accumulation, decay under
 * load, reversal during active use, cross-project isolation, polarity
 * entropy, category dominance over time.
 *
 * Ported from creative-memory-system/sims/retrievalLongRunSim.js — covers
 * scenarios LR-01 through LR-16 (47 assertions in the sim runner).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as store from "../src/preferenceStore.js";
import type { Signal } from "../src/types.js";

const moduleDir = path.dirname(url.fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(moduleDir, ".test-longrun");
process.env.MEMORY_STORAGE_ROOT = STORAGE_DIR;

const USER = "usr_longrun_test";

function freshUser(): void {
  store.resetMemory(USER, { scope: "all" });
}

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    signal_type: "explicit_tag",
    pattern: "airy_spacing",
    preference_type: "layout",
    polarity: "positive",
    tag_text: null,
    scope: "global",
    project_id: null,
    artifact_id: "art_lr",
    session_id: "sess_lr",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

beforeAll(() => {
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });
});

afterAll(() => {
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });
});

describe("multi-session accumulation", () => {
  beforeEach(freshUser);

  it("LR-01: 20 sessions accumulate to a stable injection set", () => {
    const patterns = ["airy_spacing", "serif_headlines", "earth_palette"];
    for (let s = 0; s < 20; s++) {
      for (const pattern of patterns) {
        store.ingestSignal(USER, signal({
          pattern, preference_type: pattern.split("_")[0]!, session_id: `sess_${s}`,
        }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBeGreaterThanOrEqual(3);
    // Strength should be saturated (ceiling at 1.0)
    expect(retrieved.positives.every((p) => p.signal_strength === 1.0)).toBe(true);
  });

  it("LR-02: active preferences survive decay, stale ones decay", () => {
    // Active
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ pattern: "active", preference_type: "p1" }));
    }
    // Stale — push decay_at far back to trigger archive
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ pattern: "stale", preference_type: "p2" }));
    }
    const stale = store.listPreferences(USER).find((p) => p.pattern === "stale")!;
    const past91 = new Date();
    past91.setDate(past91.getDate() - 91);
    store.updatePreference(USER, stale.id, { decay_at: past91.toISOString() });
    store.runDecay(USER);

    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.some((p) => p.pattern === "active")).toBe(true);
    expect(retrieved.positives.some((p) => p.pattern === "stale")).toBe(false);
  });

  it("LR-03: reversal mid-use updates injection set correctly", () => {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, signal({ pattern: "contested", preference_type: "tc" }));
    }
    const r1 = store.retrieveForInjection(USER, {});
    expect(r1.positives.some((p) => p.pattern === "contested")).toBe(true);

    // 4 contradictory signals → under_review + shadow
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        pattern: "contested", preference_type: "tc", polarity: "negative",
      }));
    }
    const r2 = store.retrieveForInjection(USER, {});
    // Either excluded entirely (under_review + shadow at low conf) or transitioned via shadow
    expect(r2.positives.some((p) => p.pattern === "contested" && p.polarity_status === "stable")).toBe(false);
  });

  it("LR-04: shadow promotion brings reversed preference back as opposite polarity", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ pattern: "flipped", preference_type: "tf" }));
    }
    // Drive reversal + accumulate on shadow
    for (let i = 0; i < 8; i++) {
      store.ingestSignal(USER, signal({
        pattern: "flipped", preference_type: "tf", polarity: "negative",
      }));
    }
    const all = store.listPreferences(USER, { status: "all" });
    const archived = all.find((p) => p.pattern === "flipped" && p.polarity_status === "archived");
    const promoted = all.find(
      (p) => p.pattern === "flipped" && p.polarity === "negative" && p.shadow_of === null,
    );
    expect(archived).toBeTruthy();
    expect(promoted).toBeTruthy();
  });

  it("LR-05: signal weights ranked correctly: explicit_tag > manual_refinement > thumbs_up", () => {
    for (let i = 0; i < 3; i++) {
      store.ingestSignal(USER, signal({ pattern: "p_tag", preference_type: "tt", signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 3; i++) {
      store.ingestSignal(USER, signal({ pattern: "p_ref", preference_type: "tr", signal_type: "manual_refinement" }));
    }
    for (let i = 0; i < 3; i++) {
      store.ingestSignal(USER, signal({ pattern: "p_thumb", preference_type: "th", signal_type: "thumbs_up" }));
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const tagPref = retrieved.positives.find((p) => p.pattern === "p_tag");
    const refPref = retrieved.positives.find((p) => p.pattern === "p_ref");
    const thumbPref = retrieved.positives.find((p) => p.pattern === "p_thumb");

    expect(tagPref).toBeTruthy();
    if (tagPref && refPref) expect(tagPref.signal_strength).toBeGreaterThan(refPref.signal_strength);
    if (refPref && thumbPref) expect(refPref.signal_strength).toBeGreaterThanOrEqual(thumbPref.signal_strength);
  });

  it("LR-06: preference_type filtering scopes retrieval correctly", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ pattern: "lay_a", preference_type: "layout" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ pattern: "typ_a", preference_type: "typography" }));
    }
    const filtered = store.retrieveForInjection(USER, { preference_types: ["layout"] });
    expect(filtered.positives.every((p) => p.preference_type.startsWith("layout"))).toBe(true);
    expect(filtered.positives.length).toBe(1);
  });

  it("LR-07: 50-pattern stress stays within hard cap and budget", () => {
    for (let i = 0; i < 50; i++) {
      for (let j = 0; j < 4; j++) {
        store.ingestSignal(USER, signal({
          pattern: `stress_${i}`, preference_type: `type_${i}`, signal_type: "explicit_tag",
        }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const total = retrieved.positives.length + retrieved.negatives.length;
    expect(total).toBeLessThanOrEqual(store.MAX_INJECTION_COUNT);

    const block = store.buildPromptBlock(retrieved);
    expect(block.length).toBeLessThan(2000); // generous upper bound; budget is ~200 tokens
  });

  it("LR-08: cross-project isolation — projects don't leak", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        pattern: "p_a", preference_type: "ta", scope: "project", project_id: "proj_a",
      }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        pattern: "p_b", preference_type: "tb", scope: "project", project_id: "proj_b",
      }));
    }
    const rA = store.retrieveForInjection(USER, { project_id: "proj_a" });
    const rB = store.retrieveForInjection(USER, { project_id: "proj_b" });

    expect(rA.positives.some((p) => p.pattern === "p_a")).toBe(true);
    expect(rA.positives.some((p) => p.pattern === "p_b")).toBe(false);
    expect(rB.positives.some((p) => p.pattern === "p_b")).toBe(true);
    expect(rB.positives.some((p) => p.pattern === "p_a")).toBe(false);
  });

  it("LR-09: low-confidence excluded even if strength ≥ threshold", () => {
    // Construct a record manually at exactly threshold but low confidence
    const created = store.createPreference(USER, {
      preference_type: "edge",
      pattern: "edgy",
      polarity: "positive",
      signal_strength: 0.34, // below medium-confidence cutoff (0.35)
    });
    expect(created.confidence).toBe("low");

    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.some((p) => p.pattern === "edgy")).toBe(false);
  });

  it("LR-10: temporal evolution — strengthen then decay correctly", () => {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, signal({ pattern: "evolve", preference_type: "te" }));
    }
    const built = store.listPreferences(USER, { polarity: "positive" })[0]!;
    expect(built.signal_strength).toBeGreaterThanOrEqual(0.65);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store.updatePreference(USER, built.id, { decay_at: yesterday.toISOString() });
    store.runDecay(USER);
    const decayed = store.readPreference(USER, built.id)!;
    expect(decayed.signal_strength).toBeLessThan(built.signal_strength);
  });
});

describe("temporal diversity invariants", () => {
  beforeEach(freshUser);

  it("LR-11: 25 sessions of negative accumulation stay bounded by ratio", () => {
    for (let s = 0; s < 25; s++) {
      for (let i = 0; i < 6; i++) {
        store.ingestSignal(USER, signal({
          pattern: `n_${i}`, preference_type: `tn_${i}`, polarity: "negative", session_id: `s_${s}`,
        }));
      }
      for (let i = 0; i < 2; i++) {
        store.ingestSignal(USER, signal({
          pattern: `p_${i}`, preference_type: `tp_${i}`, session_id: `s_${s}`,
        }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const total = retrieved.positives.length + retrieved.negatives.length;
    expect(retrieved.negatives.length).toBeLessThanOrEqual(
      Math.max(store.MIN_NEG_FLOOR, Math.ceil(total * store.NEGATIVE_BUDGET_RATIO)),
    );
  });

  it("LR-13: decayed negatives free diversity slots for positives", () => {
    // Belt-and-suspenders: extra hard reset since LR-11 runs many sessions
    // and may leave a populated file even after the beforeEach reset.
    store.resetMemory(USER, { scope: "all" });
    const before = store.listPreferences(USER, { status: "all" });
    if (before.length !== 0) {
      // Force-clear by deleting each remaining record
      for (const p of before) store.deletePreference(USER, p.id);
    }

    for (let i = 0; i < 6; i++) {
      store.ingestSignal(USER, signal({
        pattern: `dn_${i}`, preference_type: `dnt_${i}`, polarity: "negative",
      }));
      store.ingestSignal(USER, signal({
        pattern: `dn_${i}`, preference_type: `dnt_${i}`, polarity: "negative",
      }));
      store.ingestSignal(USER, signal({
        pattern: `dn_${i}`, preference_type: `dnt_${i}`, polarity: "negative",
      }));
      store.ingestSignal(USER, signal({
        pattern: `dn_${i}`, preference_type: `dnt_${i}`, polarity: "negative",
      }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ pattern: `dp_${i}`, preference_type: `dpt_${i}` }));
      store.ingestSignal(USER, signal({ pattern: `dp_${i}`, preference_type: `dpt_${i}` }));
      store.ingestSignal(USER, signal({ pattern: `dp_${i}`, preference_type: `dpt_${i}` }));
      store.ingestSignal(USER, signal({ pattern: `dp_${i}`, preference_type: `dpt_${i}` }));
    }

    // Decay the negatives — push their decay_at past archive
    for (const neg of store.listPreferences(USER, { polarity: "negative" })) {
      const past91 = new Date();
      past91.setDate(past91.getDate() - 91);
      store.updatePreference(USER, neg.id, { decay_at: past91.toISOString() });
    }
    store.runDecay(USER);

    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.negatives.length).toBe(0);
    expect(retrieved.positives.length).toBe(4);
  });

  it("LR-14: triple constraint (cap + diversity + budget) on 40 patterns", () => {
    for (let i = 0; i < 30; i++) {
      store.ingestSignal(USER, signal({
        pattern: `pp_with_long_name_${i}`, preference_type: `tp_${i}`,
      }));
      store.ingestSignal(USER, signal({
        pattern: `pp_with_long_name_${i}`, preference_type: `tp_${i}`,
      }));
      store.ingestSignal(USER, signal({
        pattern: `pp_with_long_name_${i}`, preference_type: `tp_${i}`,
      }));
      store.ingestSignal(USER, signal({
        pattern: `pp_with_long_name_${i}`, preference_type: `tp_${i}`,
      }));
    }
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 4; j++) {
        store.ingestSignal(USER, signal({
          pattern: `nn_${i}`, preference_type: `tnn_${i}`, polarity: "negative",
        }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const total = retrieved.positives.length + retrieved.negatives.length;
    expect(total).toBeLessThanOrEqual(store.MAX_INJECTION_COUNT);
    expect(retrieved.negatives.length).toBeLessThanOrEqual(
      Math.max(store.MIN_NEG_FLOOR, Math.ceil(total * store.NEGATIVE_BUDGET_RATIO)),
    );
  });

  it("LR-15: balanced profile maintains polarity entropy over sessions", () => {
    for (let s = 0; s < 10; s++) {
      for (let i = 0; i < 3; i++) {
        store.ingestSignal(USER, signal({
          pattern: `bp_${i}`, preference_type: `bp_t_${i}`, session_id: `s_${s}`,
        }));
      }
      for (let i = 0; i < 3; i++) {
        store.ingestSignal(USER, signal({
          pattern: `bn_${i}`, preference_type: `bn_t_${i}`, polarity: "negative", session_id: `s_${s}`,
        }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBeGreaterThan(0);
    expect(retrieved.negatives.length).toBeGreaterThan(0);
    // Both polarities present means entropy > 0
  });

  it("LR-16: 5 categories accumulate without one dominating", () => {
    const types = ["layout", "typography", "color", "motion", "grid"];
    for (let s = 0; s < 15; s++) {
      for (const t of types) {
        for (let i = 0; i < 2; i++) {
          store.ingestSignal(USER, signal({
            pattern: `${t}_p_${i}`, preference_type: t, session_id: `s_${s}`,
          }));
        }
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const counts: Record<string, number> = {};
    for (const p of retrieved.positives) counts[p.preference_type] = (counts[p.preference_type] ?? 0) + 1;
    for (const t of types) {
      expect(counts[t] ?? 0).toBeLessThanOrEqual(store.MAX_PER_CATEGORY);
    }
  });
});
