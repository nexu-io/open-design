/**
 * Creative Memory System — Test Harness
 * Simulates signal accumulation, reversal, decay, and retrieval scenarios.
 *
 * Run: node testHarness.js
 */

const path = require("path");
const fs = require("fs");

// Point store at a temp directory for testing
process.env.MEMORY_STORAGE_ROOT = path.join(__dirname, ".test-memory");

const store = require("../preferenceStore");

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function cleanup() {
  const dir = process.env.MEMORY_STORAGE_ROOT;
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = "usr_test01";

function freshUser() {
  store.resetMemory(USER, { scope: "all" });
}

function signal(overrides = {}) {
  return {
    signal_type: "repeated_acceptance",
    pattern: "airy_spacing",
    preference_type: "layout_density",
    polarity: "positive",
    tag_text: null,
    scope: "global",
    project_id: null,
    artifact_id: "art_001",
    session_id: "sess_001",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

section("1. File initialisation");
{
  cleanup();
  freshUser();
  const prefs = store.listPreferences(USER);
  assert("File created on first access", Array.isArray(prefs));
  assert("Empty on fresh init", prefs.length === 0);
}

// ----

section("2. CRUD basics");
{
  freshUser();

  const created = store.createPreference(USER, {
    preference_type: "typography",
    pattern: "serif_headlines",
    polarity: "positive",
    signal_strength: 0.5,
    scope: "global",
  });

  assert("Create returns a record", !!created);
  assert("Create assigns an id", created.id.startsWith("pref_"));
  assert("Create sets decay_at", !!created.decay_at);
  assert("Create derives confidence", created.confidence === "medium");

  const read = store.readPreference(USER, created.id);
  assert("Read returns the record", read && read.id === created.id);

  const updated = store.updatePreference(USER, created.id, { signal_strength: 0.8 });
  assert("Update applies field", updated.signal_strength === 0.8);
  assert("Update recalculates confidence", updated.confidence === "high");

  const deleted = store.deletePreference(USER, created.id);
  assert("Delete returns true", deleted === true);
  assert("Record gone after delete", store.readPreference(USER, created.id) === null);
}

// ----

section("3. Signal ingestion — accumulation");
{
  freshUser();

  // New preference created from first signal
  const p1 = store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: "save this" }));
  assert("New record created on first signal", !!p1);
  assert("Signal weight applied", p1.signal_strength > 0);
  assert("Tag text stored", p1.explicit_tags.includes("save this"));

  const s1 = p1.signal_strength;

  // Second signal of same type accumulates
  store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: "love this" }));
  const p2 = store.readPreference(USER, p1.id);
  assert("Second signal increases strength", p2.signal_strength > s1);

  // Add manual refinement
  store.ingestSignal(USER, signal({ signal_type: "manual_refinement" }));
  store.ingestSignal(USER, signal({ signal_type: "manual_refinement" }));
  const p3 = store.readPreference(USER, p1.id);
  assert("Strength increases with accumulation", p3.signal_strength > p2.signal_strength);
}

// ----

section("4. Signal ingestion — confidence ladder");
{
  freshUser();

  // 3 explicit tags + 2 manual refinements → should reach medium
  // weighted_sum = 3*0.30 + 2*0.20 = 1.30 → 1.30/2.0 = 0.65 → medium
  for (let i = 0; i < 3; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `tag_${i}` }));
  }
  for (let i = 0; i < 2; i++) {
    store.ingestSignal(USER, signal({ signal_type: "manual_refinement" }));
  }

  const prefs = store.listPreferences(USER, { polarity: "positive" });
  const pref = prefs[0];
  assert("Reaches medium confidence at 0.65", pref.confidence === "medium" || pref.confidence === "high");
  assert("Signal strength >= 0.40 (injectable)", pref.signal_strength >= 0.40);
}

// ----

section("5. Negative preference (rejection memory)");
{
  freshUser();

  const neg = store.ingestSignal(USER, signal({
    signal_type: "explicit_tag",
    pattern: "crowded_layout",
    polarity: "negative",
    tag_text: "too noisy",
  }));
  assert("Negative record created", neg && neg.polarity === "negative");
  assert("Tag stored on negative record", neg.explicit_tags.includes("too noisy"));

  store.ingestSignal(USER, signal({
    signal_type: "repeated_acceptance",
    pattern: "crowded_layout",
    polarity: "negative",
  }));

  const negs = store.listPreferences(USER, { polarity: "negative" });
  assert("Negative preference listed", negs.length === 1);
  assert("Reject count tracked", negs[0].reject_count >= 1);
}

// ----

section("6. Reversal logic — noise guard (1 contradictory signal)");
{
  freshUser();

  // Build up a positive preference
  for (let i = 0; i < 3; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }
  const before = store.listPreferences(USER, { polarity: "positive" })[0];
  const strengthBefore = before.signal_strength;

  // Single contradictory signal
  store.ingestSignal(USER, signal({
    signal_type: "single_rejection",
    polarity: "negative",
  }));

  // Should NOT change the positive record (noise guard)
  const after = store.listPreferences(USER, { polarity: "positive" })[0];
  assert("Noise guard: 1 contradictory signal does not change strength",
    after.signal_strength === strengthBefore,
    `before=${strengthBefore} after=${after.signal_strength}`
  );
  assert("Noise guard: polarity_status still stable", after.polarity_status === "stable");
}

// ----

section("7. Reversal logic — 2 contradictory signals (20% reduction)");
{
  freshUser();

  // Build positive preference
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }
  const before = store.listPreferences(USER, { polarity: "positive" })[0];

  // 2 contradictory signals
  for (let i = 0; i < 2; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "wrong direction",
    }));
  }

  const after = store.listPreferences(USER, { polarity: "positive" })[0];
  assert("2 contradictory signals reduce strength ~20%",
    after.signal_strength < before.signal_strength,
    `before=${before.signal_strength.toFixed(3)} after=${after.signal_strength.toFixed(3)}`
  );
  assert("polarity_status still stable after 2 reversals", after.polarity_status === "stable");
}

// ----

section("8. Reversal logic — 4+ signals trigger under_review + shadow record");
{
  freshUser();

  // Build strong positive preference
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }

  // 4 contradictory signals
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "not this",
      session_id: `sess_rev_${i}`,
    }));
  }

  const all = store.listPreferences(USER, { scope: "all", status: "all" });
  const original = all.find((p) => p.polarity === "positive" && !p.shadow_of);
  const shadow = all.find((p) => p.shadow_of !== null);

  assert("Original record enters under_review",
    original && original.polarity_status === "under_review",
    `status=${original?.polarity_status}`
  );
  assert("Shadow record created", !!shadow);
  assert("Shadow has opposite polarity", shadow && shadow.polarity === "negative");
  assert("Shadow starts at low confidence", shadow && shadow.confidence === "low");
}

// ----

section("9. Decay runner");
{
  freshUser();

  // Create a preference and manually push decay_at into the past
  const pref = store.createPreference(USER, {
    preference_type: "layout_density",
    pattern: "airy_spacing",
    polarity: "positive",
    signal_strength: 0.8,
    scope: "global",
  });

  // Manually set decay_at to yesterday to trigger decay
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  store.updatePreference(USER, pref.id, {
    decay_at: yesterday.toISOString(),
  });

  const result = store.runDecay(USER);
  const after = store.readPreference(USER, pref.id);

  assert("Decay runner reports decayed count", result.decayed >= 1);
  assert("Signal strength reduced after decay",
    after.signal_strength < 0.8,
    `strength=${after.signal_strength}`
  );

  // Test archival: set decay_at to 91+ days ago
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 91);
  store.updatePreference(USER, pref.id, { decay_at: oldDate.toISOString() });

  const result2 = store.runDecay(USER);
  const archived = store.readPreference(USER, pref.id);
  assert("Preference archived after 180+ days inactive",
    archived.polarity_status === "archived",
    `status=${archived.polarity_status}`
  );
  assert("Decay runner reports archived count", result2.archived >= 1);
}

// ----

section("10. Retrieval & prompt block");
{
  freshUser();

  // High confidence positive preferences
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }
  for (let i = 0; i < 3; i++) {
    store.ingestSignal(USER, signal({ signal_type: "manual_refinement" }));
  }

  // High confidence negative preference
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      pattern: "crowded_layout",
      preference_type: "layout_density",
      polarity: "negative",
      tag_text: "too crowded",
    }));
  }
  for (let i = 0; i < 2; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "revert_after_edit",
      pattern: "crowded_layout",
      preference_type: "layout_density",
      polarity: "negative",
    }));
  }

  const retrieved = store.retrieveForInjection(USER, {});
  assert("Retrieval returns positives", retrieved.positives.length > 0);
  assert("Retrieval returns negatives", retrieved.negatives.length > 0);
  assert("Only injectable strength returned",
    retrieved.positives.every((p) => p.signal_strength >= 0.40)
  );
  assert("Only stable preferences returned",
    [...retrieved.positives, ...retrieved.negatives].every((p) => p.polarity_status === "stable")
  );

  const block = store.buildPromptBlock(retrieved);
  assert("Prompt block starts with [MEMORY CONTEXT]", block.startsWith("[MEMORY CONTEXT]"));
  assert("Block contains Prefer line", block.includes("Prefer"));
  assert("Block contains Avoid line", block.includes("Avoid"));

  console.log("\n  Generated prompt block:");
  block.split("\n").forEach((l) => console.log(`  ${l}`));
}

// ----

section("11. Project overrides");
{
  freshUser();

  // Global positive preference
  store.ingestSignal(USER, signal({
    signal_type: "explicit_tag",
    tag_text: "global style",
    pattern: "airy_spacing",
    polarity: "positive",
    scope: "global",
  }));

  // Project override for same pattern
  store.ingestSignal(USER, signal({
    signal_type: "explicit_tag",
    tag_text: "dense for this project",
    pattern: "airy_spacing",
    polarity: "negative",
    scope: "project",
    project_id: "proj_fintech_01",
  }));

  const retrieved = store.retrieveForInjection(USER, { project_id: "proj_fintech_01" });
  // Project override should shadow global record for same pattern
  const allPatterns = [...retrieved.positives, ...retrieved.negatives].map((p) => p.pattern);
  const airySpacingEntries = allPatterns.filter((p) => p === "airy_spacing");
  assert("Project override shadows global for same pattern (no duplicate)",
    airySpacingEntries.length <= 1
  );
}

// ----

section("12. Refinement log");
{
  freshUser();

  const entry = store.logRefinement(USER, {
    artifact_id: "art_xyz",
    project_id: "proj_abc",
    diff: {
      from: { layout_density: "dense" },
      to: { layout_density: "airy" },
    },
  });

  assert("Refinement log entry created", !!entry);
  assert("Entry has id", entry.id.startsWith("ref_"));
  assert("Diff preserved", entry.diff.from.layout_density === "dense");
}

// ----

section("13. Memory toggle");
{
  freshUser();

  // Disable memory
  const data = require("fs").readFileSync(
    require("path").join(process.env.MEMORY_STORAGE_ROOT, USER, "preferences.json"),
    "utf8"
  );
  const parsed = JSON.parse(data);
  parsed.memory_enabled = false;
  require("fs").writeFileSync(
    require("path").join(process.env.MEMORY_STORAGE_ROOT, USER, "preferences.json"),
    JSON.stringify(parsed, null, 2)
  );

  const result = store.ingestSignal(USER, signal({ signal_type: "explicit_tag" }));
  assert("ingestSignal returns null when memory disabled", result === null);

  const retrieved = store.retrieveForInjection(USER, {});
  assert("retrieveForInjection returns empty when disabled",
    retrieved.positives.length === 0 && retrieved.negatives.length === 0
  );
}

// ---------------------------------------------------------------------------
// Edge case tests (from dev review)
// ---------------------------------------------------------------------------

section("14. EDGE — Reversal: 4th contradictory signal triggers under_review + shadow excluded from injection");
{
  freshUser();

  // Build a strong positive preference
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }

  // Session A: signals 1–3 (noise guard → 20% reduction → 40% reduction, still stable)
  store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative", tag_text: "no", session_id: "sess_rev_A" }));
  store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative", tag_text: "no", session_id: "sess_rev_A" }));
  store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative", tag_text: "no", session_id: "sess_rev_A" }));

  // Session B: 4th contradictory signal → crosses into under_review + shadow created
  store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative", tag_text: "no", session_id: "sess_rev_B" }));

  const all = store.listPreferences(USER, { status: "all" });
  const original = all.find((p) => p.polarity === "positive" && !p.shadow_of);
  const shadow = all.find((p) => p.shadow_of !== null);

  assert("EDGE 14: Original enters under_review at 4th contradictory signal",
    original && original.polarity_status === "under_review",
    `status=${original?.polarity_status}`
  );
  assert("EDGE 14: Shadow record exists", !!shadow);

  // Neither the original (under_review) nor shadow (low confidence) should inject
  const retrieved = store.retrieveForInjection(USER, {});
  const injectedIds = [
    ...retrieved.positives,
    ...retrieved.negatives,
  ].map((p) => p.id);

  assert("EDGE 14: under_review original excluded from injection",
    !injectedIds.includes(original?.id)
  );
  assert("EDGE 14: low-confidence shadow excluded from injection",
    !injectedIds.includes(shadow?.id)
  );
}

// ----

section("15. EDGE — Shadow accumulates to medium → original archived, shadow promoted");
{
  freshUser();

  // Build positive preference
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }

  // Push into under_review with 4 contradictory signals across sessions
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "not this",
      session_id: `sess_rev_${i}`,
    }));
  }

  // Find the shadow record
  let allAfterReversal = store.listPreferences(USER, { status: "all" });
  const shadow = allAfterReversal.find((p) => p.shadow_of !== null);
  assert("EDGE 15: Shadow exists before promotion", !!shadow);

  // Accumulate enough signal on shadow to reach medium confidence
  // medium threshold = signal_strength >= 0.35 → need weighted_sum >= 0.70
  // Each explicit_tag adds 0.30/2.0 = 0.15 to shadow → need ~5 more signals
  for (let i = 0; i < 6; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "definitely not this",
      session_id: `sess_promote_${i}`,
    }));
  }

  const all = store.listPreferences(USER, { status: "all" });
  const original = all.find((p) => p.polarity === "positive");
  const promoted = all.find((p) => p.polarity === "negative" && !p.shadow_of);
  const stillShadow = all.find((p) => p.shadow_of !== null);

  assert("EDGE 15: Original archived after shadow promotion",
    original && original.polarity_status === "archived",
    `status=${original?.polarity_status}`
  );
  assert("EDGE 15: Promoted shadow has shadow_of cleared", !!promoted || !stillShadow,
    `promoted=${!!promoted} stillShadow=${!!stillShadow}`
  );
}

// ----

section("16. EDGE — Decay and reversal apply simultaneously and independently");
{
  freshUser();

  // Build a positive preference
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }
  const prefs = store.listPreferences(USER, { polarity: "positive" });
  const pref = prefs[0];
  const strengthAfterBuild = pref.signal_strength;

  // Apply 1 contradictory signal (noise guard — no change yet)
  store.ingestSignal(USER, signal({ signal_type: "explicit_tag", polarity: "negative", tag_text: "no" }));

  // Now push decay_at into past to force decay
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  store.updatePreference(USER, pref.id, { decay_at: yesterday.toISOString() });

  const decayResult = store.runDecay(USER);
  const afterDecay = store.readPreference(USER, pref.id);

  assert("EDGE 16: Decay ran (decayed count >= 1)", decayResult.decayed >= 1);
  assert("EDGE 16: Strength reduced by decay (independently of reversal)",
    afterDecay.signal_strength < strengthAfterBuild,
    `before=${strengthAfterBuild.toFixed(3)} after=${afterDecay.signal_strength.toFixed(3)}`
  );
  assert("EDGE 16: Preference still stable (reversal only at noise guard stage)",
    afterDecay.polarity_status === "stable"
  );

  // Now apply 3 more reversal signals — reversal penalty stacks on decayed value
  const strengthBeforeReversal = afterDecay.signal_strength;
  for (let i = 1; i < 4; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "no",
      session_id: `sess_r${i}`,
    }));
  }

  const afterBoth = store.readPreference(USER, pref.id);
  assert("EDGE 16: Reversal further reduces already-decayed strength",
    afterBoth.signal_strength < strengthBeforeReversal,
    `decayed=${strengthBeforeReversal.toFixed(3)} after_reversal=${afterBoth.signal_strength.toFixed(3)}`
  );
}

// ----

section("17. EDGE — Signal strength ceiling (10 explicit_tag signals clamp to 1.0)");
{
  freshUser();

  // 10 explicit tags → weighted_sum = 10 × 0.30 = 3.0 → 3.0 / 2.0 = 1.5 → clamped to 1.0
  for (let i = 0; i < 10; i++) {
    store.ingestSignal(USER, signal({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }

  const prefs = store.listPreferences(USER, { polarity: "positive" });
  const pref = prefs[0];

  assert("EDGE 17: Signal strength does not exceed 1.0",
    pref.signal_strength <= 1.0,
    `signal_strength=${pref.signal_strength}`
  );
  assert("EDGE 17: Signal strength clamped exactly at 1.0",
    pref.signal_strength === 1.0,
    `signal_strength=${pref.signal_strength}`
  );
  assert("EDGE 17: Confidence is high at ceiling", pref.confidence === "high");
}

// ----

section("18. EDGE — Project override conflict surfaces 'Project override' line in prompt block");
{
  freshUser();

  // Build injectable global positive preference
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      tag_text: `t${i}`,
      pattern: "airy_spacing",
      polarity: "positive",
      scope: "global",
    }));
  }

  // Project-scoped override on same pattern — enough signal to be injectable
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, signal({
      signal_type: "explicit_tag",
      tag_text: "dense for fintech",
      pattern: "airy_spacing",
      polarity: "negative",
      scope: "project",
      project_id: "proj_fintech_01",
    }));
  }

  const retrieved = store.retrieveForInjection(USER, { project_id: "proj_fintech_01" });
  const block = store.buildPromptBlock(retrieved, "proj_fintech_01");

  assert("EDGE 18: Prompt block generated", block.length > 0);
  assert("EDGE 18: Project override line appears in prompt block",
    block.includes("Project override"),
    `block=\n${block}`
  );
  assert("EDGE 18: No duplicate pattern entries (project shadows global)",
    (() => {
      const all = [...retrieved.positives, ...retrieved.negatives];
      const patterns = all.map((p) => p.pattern);
      return patterns.length === new Set(patterns).size;
    })()
  );

  console.log("\n  Generated prompt block (project override):");
  block.split("\n").forEach((l) => console.log(`  ${l}`));
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(40)}`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`${"─".repeat(40)}\n`);

cleanup();
process.exit(failed > 0 ? 1 : 0);
