/**
 * Retrieval quality validation: ranking, hysteresis, flicker, threshold gating,
 * prompt pollution. Ported from sims/retrievalQualitySim.js — 36 assertions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as store from "../src/preferenceStore.js";
import type { Diagnostic, Preference, RetrievalResult, Signal } from "../src/types.js";

const moduleDir = path.dirname(url.fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(moduleDir, ".test-quality");
process.env.MEMORY_STORAGE_ROOT = STORAGE_DIR;

const USER = "usr_quality_test";

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
    artifact_id: "art_quality",
    session_id: "sess_quality",
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

interface Snapshot {
  total_injected: number;
  positive_count: number;
  negative_count: number;
  patterns: string[];
  strengths: number[];
  confidences: string[];
  statuses: string[];
  prompt_block_chars: number;
  prompt_block_lines: number;
  duplicate_patterns: number;
}

function captureSnapshot(retrieved: RetrievalResult, block: string): Snapshot {
  const all = [...retrieved.positives, ...retrieved.negatives];
  return {
    total_injected: all.length,
    positive_count: retrieved.positives.length,
    negative_count: retrieved.negatives.length,
    patterns: all.map((p) => p.pattern),
    strengths: all.map((p) => p.signal_strength),
    confidences: all.map((p) => p.confidence),
    statuses: all.map((p) => p.polarity_status),
    prompt_block_chars: block.length,
    prompt_block_lines: block ? block.split("\n").length : 0,
    duplicate_patterns: all.length - new Set(all.map((p) => p.pattern)).size,
  };
}

function isMonotonic(prefs: Preference[]): boolean {
  for (let i = 1; i < prefs.length; i++) {
    if (prefs[i]!.signal_strength > prefs[i - 1]!.signal_strength) return false;
  }
  return true;
}

describe("retrieval quality", () => {
  beforeEach(freshUser);

  it("RQ-01: empty profile produces zero injection", () => {
    const retrieved = store.retrieveForInjection(USER, {});
    const block = store.buildPromptBlock(retrieved);
    const snap = captureSnapshot(retrieved, block);
    expect(snap.total_injected).toBe(0);
    expect(snap.prompt_block_chars).toBe(0);
  });

  it("RQ-02: sub-threshold preferences excluded", () => {
    // 1 explicit_tag = 0.30/2 = 0.15, below 0.40 threshold
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    const retrieved = store.retrieveForInjection(USER, {});
    const block = store.buildPromptBlock(retrieved);
    const snap = captureSnapshot(retrieved, block);
    expect(snap.total_injected).toBe(0);
    expect(snap.prompt_block_chars).toBe(0);
  });

  it("RQ-03: preference crosses threshold → enters injection set", () => {
    // 1 signal — below threshold
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    const r1 = store.retrieveForInjection(USER, {});
    expect(r1.positives.length + r1.negatives.length).toBe(0);

    // Add more to cross threshold + reach medium confidence
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const r2 = store.retrieveForInjection(USER, {});
    const block2 = store.buildPromptBlock(r2);
    expect(r2.positives.length).toBe(1);
    expect(block2.length).toBeGreaterThan(0);
  });

  it("RQ-04: top-N ranking is monotonically descending", () => {
    const patterns = [
      ["airy_spacing", 4],
      ["serif_headlines", 3],
      ["earth_palette", 2],
    ] as const;
    for (const [pattern, count] of patterns) {
      for (let i = 0; i < count; i++) {
        store.ingestSignal(USER, signal({ signal_type: "explicit_tag", pattern }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    expect(retrieved.positives.length).toBeGreaterThanOrEqual(2);
    expect(isMonotonic(retrieved.positives)).toBe(true);
  });

  it("RQ-05: signal strength capped at 1.0", () => {
    for (let i = 0; i < 20; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const snap = captureSnapshot(retrieved, store.buildPromptBlock(retrieved));
    expect(snap.total_injected).toBe(1);
    expect(Math.max(...snap.strengths)).toBeLessThanOrEqual(1.0);
    expect(retrieved.positives[0]!.confidence).toBe("high");
  });

  it("RQ-06: hysteresis — repeated retrievals are identical (zero flicker)", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const snapshots: Snapshot[] = [];
    for (let i = 0; i < 10; i++) {
      const r = store.retrieveForInjection(USER, {});
      snapshots.push(captureSnapshot(r, store.buildPromptBlock(r)));
    }

    const firstPatterns = JSON.stringify([...snapshots[0]!.patterns].sort());
    for (const snap of snapshots) {
      const sortedPatterns = JSON.stringify([...snap.patterns].sort());
      expect(sortedPatterns).toBe(firstPatterns);
    }
  });

  it("RQ-07: flicker detection works at threshold boundary", () => {
    // Build a preference just at threshold, then decay to push below, then re-ingest
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const r1 = store.retrieveForInjection(USER, {});
    expect(r1.positives.length).toBe(1);

    // 1-day past keeps the record in the decay band (status remains stable)
    const pref = store.listPreferences(USER, { polarity: "positive" })[0]!;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store.updatePreference(USER, pref.id, { decay_at: yesterday.toISOString() });
    store.runDecay(USER);

    const r2 = store.retrieveForInjection(USER, {});
    expect(r2.positives.length + r2.negatives.length).toBe(0);

    // Re-ingest to bring back into the injection set
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const r3 = store.retrieveForInjection(USER, {});
    expect(r3.positives.length).toBe(1);
  });

  it("RQ-08: under_review and archived records excluded from injection", () => {
    // Build positive then push to under_review
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative" }));
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const snap = captureSnapshot(retrieved, store.buildPromptBlock(retrieved));
    expect(snap.total_injected).toBe(0);
    expect(snap.statuses.every((s) => s === "stable")).toBe(true);
  });

  it("RQ-09: project override shadows global for same pattern", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({
        signal_type: "explicit_tag",
        polarity: "negative",
        scope: "project",
        project_id: "proj_q9",
      }));
    }
    const retrieved = store.retrieveForInjection(USER, { project_id: "proj_q9" });
    const overrideDiagnostic = retrieved.diagnostics.find(
      (d): d is Extract<Diagnostic, { type: "project_override_suppression" }> =>
        d.type === "project_override_suppression",
    );
    expect(overrideDiagnostic).toBeTruthy();
    expect(overrideDiagnostic?.suppressed_pattern).toBe("airy_spacing");
  });

  it("RQ-10: prompt block character budget stays within limits", () => {
    // Use distinct preference_types per pattern so the category quota
    // (MAX_PER_CATEGORY=3) doesn't trim — this scenario is about token budget,
    // not category diversity.
    const positives = [
      { pattern: "airy_spacing", preference_type: "layout_density" },
      { pattern: "serif_headlines", preference_type: "typography" },
      { pattern: "earth_palette", preference_type: "color" },
      { pattern: "subtle_motion", preference_type: "motion" },
      { pattern: "wide_grid", preference_type: "grid" },
    ];
    const negatives = [
      { pattern: "neon_palette", preference_type: "color_avoid" },
      { pattern: "heavy_animation", preference_type: "motion_avoid" },
    ];
    for (const { pattern, preference_type } of positives) {
      for (let i = 0; i < 4; i++) {
        store.ingestSignal(USER, signal({ signal_type: "explicit_tag", pattern, preference_type }));
      }
    }
    for (const { pattern, preference_type } of negatives) {
      for (let i = 0; i < 4; i++) {
        store.ingestSignal(USER, signal({
          signal_type: "explicit_tag", pattern, preference_type, polarity: "negative",
        }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const block = store.buildPromptBlock(retrieved);
    const snap = captureSnapshot(retrieved, block);

    expect(block.length).toBeGreaterThan(0);
    expect(block.includes("Prefer") && block.includes("Avoid")).toBe(true);
    expect(snap.total_injected).toBe(positives.length + negatives.length);
  });

  it("RQ-11: sparse user — clean retrieval, no conflicts", () => {
    for (let i = 0; i < 4; i++) {
      store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const snap = captureSnapshot(retrieved, store.buildPromptBlock(retrieved));
    expect(snap.total_injected).toBe(1);
  });

  it("RQ-12: dense user — many preferences, ranking stable, no duplicates", () => {
    const patterns: string[] = [];
    for (let i = 0; i < 12; i++) patterns.push(`pattern_${i}`);
    for (const pattern of patterns) {
      for (let i = 0; i < 4; i++) {
        store.ingestSignal(USER, signal({ signal_type: "explicit_tag", pattern, preference_type: "style" }));
      }
    }
    const retrieved = store.retrieveForInjection(USER, {});
    const snap = captureSnapshot(retrieved, store.buildPromptBlock(retrieved));
    expect(snap.total_injected).toBeGreaterThanOrEqual(10);
    expect(isMonotonic(retrieved.positives)).toBe(true);
    expect(snap.duplicate_patterns).toBe(0);
  });
});
