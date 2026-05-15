/**
 * Lifecycle, storage, and core engine validation.
 * Ported from sims/testHarness.js — 64 assertions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as store from "../src/preferenceStore.js";
import type { Polarity, Signal, SignalType } from "../src/types.js";

const moduleDir = path.dirname(url.fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(moduleDir, ".test-lifecycle");
process.env.MEMORY_STORAGE_ROOT = STORAGE_DIR;

const USER = "usr_lifecycle_test";

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
    artifact_id: "art_test",
    session_id: "sess_test",
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

describe("1. File initialisation", () => {
  beforeEach(freshUser);

  it("creates file on first access and is empty", () => {
    freshUser();
    const prefs = store.listPreferences(USER);
    expect(Array.isArray(prefs)).toBe(true);
    expect(prefs.length).toBe(0);
  });
});

describe("2. CRUD basics", () => {
  beforeEach(freshUser);

  it("supports create / read / update / delete", () => {
    const created = store.createPreference(USER, {
      preference_type: "layout_density",
      pattern: "airy_spacing",
      polarity: "positive",
      signal_strength: 0.5,
    });

    expect(created).toBeTruthy();
    expect(created.id.startsWith("pref_")).toBe(true);
    expect(created.decay_at).toBeTruthy();
    expect(created.confidence).toBe("medium");

    const read = store.readPreference(USER, created.id);
    expect(read?.id).toBe(created.id);

    const updated = store.updatePreference(USER, created.id, { signal_strength: 0.8 });
    expect(updated?.signal_strength).toBe(0.8);
    expect(updated?.confidence).toBe("high");

    const deleted = store.deletePreference(USER, created.id);
    expect(deleted).toBe(true);
    expect(store.readPreference(USER, created.id)).toBe(null);
  });
});

describe("3. Signal ingestion — accumulation", () => {
  beforeEach(freshUser);

  it("accumulates strength on repeated matching signals", () => {
    const p1 = store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: "save this" }));
    expect(p1).toBeTruthy();
    expect(p1!.signal_strength).toBeGreaterThan(0);
    expect(p1!.explicit_tags.includes("save this")).toBe(true);

    const s1 = p1!.signal_strength;

    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: "love this" }));
    const p2 = store.readPreference(USER, p1!.id)!;
    expect(p2.signal_strength).toBeGreaterThan(s1);

    store.ingestSignal(USER, signal({ signal_type: "manual_refinement" }));
    const p3 = store.readPreference(USER, p1!.id)!;
    expect(p3.signal_strength).toBeGreaterThan(p2.signal_strength);
  });
});

describe("4. Signal ingestion — confidence ladder", () => {
  beforeEach(freshUser);

  it("climbs through low → medium → high with enough signals", () => {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    const pref = prefs[0]!;
    expect(["medium", "high"].includes(pref.confidence)).toBe(true);
    expect(pref.signal_strength).toBeGreaterThanOrEqual(0.40);
  });
});

describe("5. Negative preference (rejection memory)", () => {
  beforeEach(freshUser);

  it("creates and tracks negative records", () => {
    const neg = store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      pattern: "neon_palette",
      preference_type: "color",
      polarity: "negative",
      tag_text: "too noisy",
    }))!;
    expect(neg.polarity).toBe("negative");
    expect(neg.explicit_tags.includes("too noisy")).toBe(true);

    store.ingestSignal(USER, signal({
      signal_type: "thumbs_down",
      pattern: "neon_palette",
      preference_type: "color",
      polarity: "negative",
    }));

    const negs = store.listPreferences(USER, { polarity: "negative" });
    expect(negs.length).toBe(1);
    expect(negs[0]!.reject_count).toBeGreaterThanOrEqual(1);
  });
});

describe("6. Reversal logic — noise guard (1 contradictory signal)", () => {
  beforeEach(freshUser);

  it("does not change strength or status on a single contradiction", () => {
    // Build a stable positive
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const before = store.listPreferences(USER, { polarity: "positive" })[0]!;
    const strengthBefore = before.signal_strength;

    // Apply 1 contradictory signal
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));

    const after = store.listPreferences(USER, { polarity: "positive" })[0]!;
    expect(after.signal_strength).toBe(strengthBefore);
    expect(after.polarity_status).toBe("stable");
  });
});

describe("7. Reversal logic — 2 contradictory signals", () => {
  beforeEach(freshUser);

  it("reduces strength by ~20% and keeps status stable", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const before = store.listPreferences(USER, { polarity: "positive" })[0]!;

    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));

    const after = store.listPreferences(USER, { polarity: "positive" })[0]!;
    expect(after.signal_strength).toBeLessThan(before.signal_strength);
    expect(after.polarity_status).toBe("stable");
  });
});

describe("8. Reversal logic — 4+ signals trigger under_review + shadow record", () => {
  beforeEach(freshUser);

  it("flips status to under_review and creates a shadow", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    }

    const all = store.listPreferences(USER, { status: "all" });
    const original = all.find((p) => p.polarity_status === "under_review");
    const shadow = all.find((p) => p.shadow_of !== null);

    expect(original?.polarity_status).toBe("under_review");
    expect(shadow).toBeTruthy();
    expect(shadow?.polarity).toBe("negative");
    expect(shadow?.confidence).toBe("low");
  });
});

describe("9. Decay runner", () => {
  beforeEach(freshUser);

  it("reduces strength after the decay window, archives after archive window", () => {
    const pref = store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }))!;
    // Manually backdate decay_at by 1 day — sits in the 0..90 day decay band
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store.updatePreference(USER, pref.id, {
      signal_strength: 0.8,
      decay_at: yesterday.toISOString(),
    });

    const result = store.runDecay(USER);
    const after = store.readPreference(USER, pref.id)!;
    expect(result.decayed).toBeGreaterThanOrEqual(1);
    expect(after.signal_strength).toBeLessThan(0.8);

    // Backdate by 91+ days to enter the archive band
    const past91 = new Date();
    past91.setDate(past91.getDate() - 91);
    store.updatePreference(USER, pref.id, { decay_at: past91.toISOString() });
    const result2 = store.runDecay(USER);
    const archived = store.readPreference(USER, pref.id)!;
    expect(archived.polarity_status).toBe("archived");
    expect(result2.archived).toBeGreaterThanOrEqual(1);
  });
});

describe("10. Retrieval & prompt block", () => {
  beforeEach(freshUser);

  it("retrieves positives + negatives and produces a prompt block", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag", pattern: "airy_spacing" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        signal_type: "explicit_tag",
        pattern: "neon_palette",
        preference_type: "color",
        polarity: "negative",
      }));
    }

    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBeGreaterThan(0);
    expect(retrieved.negatives.length).toBeGreaterThan(0);
    expect(retrieved.positives.every((p) => p.signal_strength >= 0.40)).toBe(true);
    expect([...retrieved.positives, ...retrieved.negatives].every((p) => p.polarity_status === "stable")).toBe(true);

    const block = store.buildPromptBlock(retrieved);
    expect(block.startsWith("[MEMORY CONTEXT]")).toBe(true);
    expect(block.includes("Prefer")).toBe(true);
    expect(block.includes("Avoid")).toBe(true);
  });
});

describe("11. Project overrides", () => {
  beforeEach(freshUser);

  it("project preference shadows global with same pattern", () => {
    // Global: airy_spacing positive
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    // Project override: same pattern, negative
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        signal_type: "explicit_tag",
        polarity: "negative",
        scope: "project",
        project_id: "proj_test",
      }));
    }

    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_test" });
    const allPatterns = [...retrieved.positives, ...retrieved.negatives].map((p) => p.pattern);
    const airySpacingEntries = allPatterns.filter((p) => p === "airy_spacing");
    expect(airySpacingEntries.length).toBeLessThanOrEqual(1);
  });
});

describe("12. Refinement log", () => {
  beforeEach(freshUser);

  it("appends entries with stable shape", () => {
    const entry = store.logRefinement(USER, {
      artifact_id: "art_001",
      project_id: "proj_001",
      diff: { from: { layout_density: "dense" }, to: { layout_density: "airy" } },
    });
    expect(entry).toBeTruthy();
    expect(entry.id.startsWith("ref_")).toBe(true);
    expect((entry.diff as { from: { layout_density: string } }).from.layout_density).toBe("dense");
  });
});

describe("13. Memory toggle", () => {
  beforeEach(freshUser);

  it("memory_enabled = false short-circuits ingestion and retrieval", () => {
    // Build a record then disable
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    const data = JSON.parse(fs.readFileSync(path.join(STORAGE_DIR, USER, "preferences.json"), "utf8"));
    data.memory_enabled = false;
    fs.writeFileSync(path.join(STORAGE_DIR, USER, "preferences.json"), JSON.stringify(data, null, 2));

    const result = store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    expect(result).toBe(null);

    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBe(0);
    expect(retrieved.negatives.length).toBe(0);
  });
});

describe("14. EDGE — under_review excluded from injection", () => {
  beforeEach(freshUser);

  it("4th contradictory signal triggers under_review + shadow excluded from injection", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    }

    const all = store.listPreferences(USER, { status: "all" });
    const original = all.find((p) => p.polarity_status === "under_review");
    const shadow = all.find((p) => p.shadow_of !== null);

    expect(original?.polarity_status).toBe("under_review");
    expect(shadow).toBeTruthy();

    const retrieved = store.retrieveForInjection(USER, {});
    const injectedIds = [...retrieved.positives, ...retrieved.negatives].map((p) => p.id);
    expect(injectedIds.includes(original?.id ?? "")).toBe(false);
    expect(injectedIds.includes(shadow?.id ?? "")).toBe(false);
  });
});

describe("15. EDGE — Shadow promotion archives original", () => {
  beforeEach(freshUser);

  it("shadow accumulates to medium → original archived, shadow promoted", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    }
    const allBefore = store.listPreferences(USER, { status: "all" });
    const shadow = allBefore.find((p) => p.shadow_of !== null);
    expect(shadow).toBeTruthy();

    // Push shadow to medium confidence
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    }

    const allAfter = store.listPreferences(USER, { status: "all" });
    const original = allAfter.find((p) => p.polarity_status === "archived");
    const promoted = allAfter.find((p) => p.shadow_of === null && p.polarity === "negative");
    const stillShadow = allAfter.find((p) => p.shadow_of !== null);

    expect(original?.polarity_status).toBe("archived");
    expect(Boolean(promoted) || !stillShadow).toBe(true);
  });
});

describe("16. EDGE — Decay and reversal apply independently", () => {
  beforeEach(freshUser);

  it("decay reduces strength independently of reversal", () => {
    const pref = store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }))!;
    for (let i = 0; i < 3; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const strengthAfterBuild = store.readPreference(USER, pref.id)!.signal_strength;

    // 1-day past keeps the record in the decay band (0..90), not archive
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store.updatePreference(USER, pref.id, { decay_at: yesterday.toISOString() });

    const decayResult = store.runDecay(USER);
    const afterDecay = store.readPreference(USER, pref.id)!;

    expect(decayResult.decayed).toBeGreaterThanOrEqual(1);
    expect(afterDecay.signal_strength).toBeLessThan(strengthAfterBuild);
    expect(afterDecay.polarity_status).toBe("stable");

    // Apply 2 contradictory signals (under noise guard) — strength should drop further
    const strengthBeforeReversal = afterDecay.signal_strength;
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));

    const afterBoth = store.readPreference(USER, pref.id)!;
    expect(afterBoth.signal_strength).toBeLessThan(strengthBeforeReversal);
  });
});

describe("17. EDGE — Signal strength ceiling clamps at 1.0", () => {
  beforeEach(freshUser);

  it("10 explicit_tag signals clamp to 1.0", () => {
    for (let i = 0; i < 10; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const pref = store.listPreferences(USER, { polarity: "positive" })[0]!;
    expect(pref.signal_strength).toBeLessThanOrEqual(1.0);
    expect(pref.signal_strength).toBe(1.0);
    expect(pref.confidence).toBe("high");
  });
});

describe("18. EDGE — Project override line in prompt block", () => {
  beforeEach(freshUser);

  it("project override conflict surfaces 'Project override' line", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        signal_type: "explicit_tag",
        polarity: "negative",
        scope: "project",
        project_id: "proj_fintech_01",
      }));
    }

    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_fintech_01" });
    const block = store.buildPromptBlock(retrieved, "proj_fintech_01");
    expect(block.length).toBeGreaterThan(0);
    expect(block.includes("Project override")).toBe(true);
    const airySpacingEntries = [...retrieved.positives, ...retrieved.negatives]
      .filter((p) => p.pattern === "airy_spacing");
    expect(airySpacingEntries.length).toBeLessThanOrEqual(1);
  });
});
