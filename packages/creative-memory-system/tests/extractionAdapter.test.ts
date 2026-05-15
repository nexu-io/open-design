/**
 * Extraction adapter self-test.
 * Ported from creative-memory-system/extractionAdapter.js — 12 assertions.
 *
 * Verifies that each adapter handler maps its event correctly to ingestSignal,
 * including signal_type, polarity, scope (project vs global), and tag handling.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as adapter from "../src/extractionAdapter.js";
import * as store from "../src/preferenceStore.js";

const moduleDir = path.dirname(url.fileURLToPath(import.meta.url));
const STORAGE_DIR = path.join(moduleDir, ".test-adapter");
process.env.MEMORY_STORAGE_ROOT = STORAGE_DIR;

const USER = "usr_adapter_test";

const BASE_META: adapter.ArtifactMeta = {
  signals: [
    { preference_type: "layout_density", pattern: "airy_spacing" },
    { preference_type: "typography", pattern: "serif_headlines" },
  ],
};

function baseEvent() {
  return {
    user_id: USER,
    artifact_id: "art_adapter_001",
    session_id: "sess_adapter_001",
    project_id: null,
    timestamp: new Date().toISOString(),
    artifact_meta: BASE_META,
  };
}

function freshUser(): void {
  store.resetMemory(USER, { scope: "all" });
}

beforeAll(() => {
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });
});

afterAll(() => {
  if (fs.existsSync(STORAGE_DIR)) fs.rmSync(STORAGE_DIR, { recursive: true });
});

describe("extractionAdapter", () => {
  beforeEach(freshUser);

  it("onGenerationAccepted creates records for all classified patterns", () => {
    adapter.onGenerationAccepted(baseEvent());
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    expect(prefs.length).toBe(2);
    expect(prefs.every((p) => p.sources.includes("repeated_acceptance"))).toBe(true);
  });

  it("onArtifactEditedAndSaved emits manual_refinement", () => {
    adapter.onArtifactEditedAndSaved({
      ...baseEvent(),
      diff: { from: { layout_density: "dense" }, to: { layout_density: "airy" } },
    });
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    expect(prefs.some((p) => p.sources.includes("manual_refinement"))).toBe(true);
  });

  it("onExplicitTagApplied with positive tag creates positive record", () => {
    adapter.onExplicitTagApplied({ ...baseEvent(), tag_text: "Save this direction" });
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    expect(prefs.some((p) => p.sources.includes("explicit_tag"))).toBe(true);
  });

  it("onExplicitTagApplied with negative tag creates negative record", () => {
    adapter.onExplicitTagApplied({
      ...baseEvent(),
      artifact_id: "art_adapter_002",
      artifact_meta: { signals: [{ preference_type: "layout_density", pattern: "crowded_layout" }] },
      tag_text: "Too noisy",
    });
    const negs = store.listPreferences(USER, { polarity: "negative" });
    expect(negs.length).toBeGreaterThanOrEqual(1);
    expect(negs.some((p) => p.explicit_tags.includes("Too noisy"))).toBe(true);
  });

  it("onExplicitTagApplied throws on unrecognized tag (regression)", () => {
    expect(() =>
      adapter.onExplicitTagApplied({ ...baseEvent(), tag_text: "too busy" }),
    ).toThrow(/unrecognized tag/);
    expect(() =>
      adapter.onExplicitTagApplied({ ...baseEvent(), tag_text: "don't use this" }),
    ).toThrow(/unrecognized tag/);
    // Verify no record was created
    const all = store.listPreferences(USER, { status: "all" });
    expect(all.length).toBe(0);
  });

  it("onThumbsRated up emits thumbs_up positive", () => {
    adapter.onThumbsRated({ ...baseEvent(), rating: "up" });
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    expect(prefs.some((p) => p.sources.includes("thumbs_up"))).toBe(true);
  });

  it("onThumbsRated down creates negative record", () => {
    adapter.onThumbsRated({
      ...baseEvent(),
      artifact_meta: { signals: [{ preference_type: "motion", pattern: "heavy_animation" }] },
      rating: "down",
    });
    const negs = store.listPreferences(USER, { polarity: "negative" });
    expect(negs.some((p) => p.pattern === "heavy_animation")).toBe(true);
  });

  it("onThumbsRated throws on invalid rating value (regression)", () => {
    expect(() =>
      adapter.onThumbsRated({ ...baseEvent(), rating: "UP" } as unknown as adapter.ThumbsRatedEvent),
    ).toThrow(/must be exactly "up" or "down"/);
    expect(() =>
      adapter.onThumbsRated({ ...baseEvent(), rating: null } as unknown as adapter.ThumbsRatedEvent),
    ).toThrow(/must be exactly "up" or "down"/);
    expect(() =>
      adapter.onThumbsRated({ ...baseEvent(), rating: "" } as unknown as adapter.ThumbsRatedEvent),
    ).toThrow(/must be exactly "up" or "down"/);
  });

  it("project-scoped event rejects unsafe project_id (regression)", () => {
    expect(() =>
      adapter.onGenerationAccepted({
        ...baseEvent(),
        project_id: "__proto__",
        artifact_meta: { signals: [{ preference_type: "layout", pattern: "test" }] },
      }),
    ).toThrow(/not a safe key/);
    expect(() =>
      adapter.onGenerationAccepted({
        ...baseEvent(),
        project_id: "constructor",
        artifact_meta: { signals: [{ preference_type: "layout", pattern: "test" }] },
      }),
    ).toThrow(/not a safe key/);
  });

  it("onGenerationAbandoned creates weak negative", () => {
    adapter.onGenerationAbandoned({
      ...baseEvent(),
      artifact_meta: { signals: [{ preference_type: "color", pattern: "neon_palette" }] },
    });
    const negs = store.listPreferences(USER, { polarity: "negative" });
    expect(negs.some((p) => p.pattern === "neon_palette" && p.sources.includes("abandoned_generation"))).toBe(true);
  });

  it("onRevertAfterEdit creates positive signal for reverted-to state", () => {
    adapter.onRevertAfterEdit(baseEvent());
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    expect(prefs.some((p) => p.sources.includes("revert_after_edit"))).toBe(true);
  });

  it("project-scoped event writes to project override", () => {
    adapter.onGenerationAccepted({
      ...baseEvent(),
      project_id: "proj_fintech_01",
      artifact_meta: { signals: [{ preference_type: "layout_density", pattern: "dense_grid" }] },
    });
    const projectPrefs = store.listPreferences(USER, { scope: "project:proj_fintech_01" });
    expect(projectPrefs.some((p) => p.pattern === "dense_grid")).toBe(true);

    const globalPrefs = store.listPreferences(USER, { scope: "global" });
    expect(globalPrefs.some((p) => p.pattern === "dense_grid")).toBe(false);
  });

  it("classifyArtifact pass-through returns the supplied signals", () => {
    const out = adapter.classifyArtifact(BASE_META);
    expect(out).toEqual(BASE_META.signals);
  });

  it("classifyArtifact throws on missing or malformed payload (fail-fast)", () => {
    // Missing payload is treated as a pipeline wiring bug and surfaces an
    // observable error rather than silently disabling learning for the event.
    expect(() => adapter.classifyArtifact(null as unknown as adapter.ArtifactMeta)).toThrow(
      /artifact_meta is required/,
    );
    expect(() =>
      adapter.classifyArtifact(undefined as unknown as adapter.ArtifactMeta),
    ).toThrow(/artifact_meta is required/);
    expect(() =>
      adapter.classifyArtifact({ signals: undefined } as unknown as adapter.ArtifactMeta),
    ).toThrow(/signals must be an array/);
    expect(() =>
      adapter.classifyArtifact({ signals: "not-an-array" } as unknown as adapter.ArtifactMeta),
    ).toThrow(/signals must be an array/);
  });

  it("classifyArtifact throws on malformed signal entries (regression)", () => {
    // A payload like { signals: [{}] } must not silently forward undefined
    // pattern/preference_type into ingestSignal and persist corrupt records.
    expect(() =>
      adapter.classifyArtifact({ signals: [{}] } as unknown as adapter.ArtifactMeta),
    ).toThrow(/signals\[0\] is malformed/);
    expect(() =>
      adapter.classifyArtifact({
        signals: [{ preference_type: "layout", pattern: "" }],
      } as unknown as adapter.ArtifactMeta),
    ).toThrow(/signals\[0\] is malformed/);
    expect(() =>
      adapter.classifyArtifact({
        signals: [
          { preference_type: "layout", pattern: "valid" },
          { preference_type: "", pattern: "also_valid" },
        ],
      } as unknown as adapter.ArtifactMeta),
    ).toThrow(/signals\[1\] is malformed/);
  });

  it("TAG_POLARITY map is frozen and complete for known tags", () => {
    expect(Object.isFrozen(adapter.TAG_POLARITY)).toBe(true);
    expect(adapter.TAG_POLARITY["save this direction"]).toBe("positive");
    expect(adapter.TAG_POLARITY["too noisy"]).toBe("negative");
  });
});
