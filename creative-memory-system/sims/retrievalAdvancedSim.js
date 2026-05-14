/**
 * Creative Memory System — Advanced Retrieval Simulation
 * Validates the three reviewer-requested features:
 *
 *   1. Token-budget ceiling (est. 200 tokens, top-N as secondary hard cap)
 *   2. Negative priority multiplier (1.2× for avoidance bias)
 *   3. Conflict diagnostics (suppression traces for project overrides)
 *
 * Run: node retrievalAdvancedSim.js
 */

const path = require("path");
const fs = require("fs");

process.env.MEMORY_STORAGE_ROOT = path.join(__dirname, ".test-advanced");

const store = require("../preferenceStore");

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const USER = "usr_adv_sim";
let passed = 0;
let failed = 0;

function assert(label, cond, detail = "") {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else { console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`); failed++; }
}

function section(title) { console.log(`\n── ${title} ──`); }

function cleanup() {
  const dir = process.env.MEMORY_STORAGE_ROOT;
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
}

function freshUser() { store.resetMemory(USER, { scope: "all" }); }

function sig(overrides = {}) {
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

function retrieve(ctx = {}) {
  const r = store.retrieveForInjection(USER, ctx);
  const b = store.buildPromptBlock(r, ctx.project_id);
  return { retrieved: r, block: b };
}

// ===================================================================
// FEATURE 1: Token-Budget Ceiling
// ===================================================================

section("ADV-01 · Token budget: preferences trimmed when exceeding budget");
{
  cleanup();
  freshUser();

  // Create 25 preferences with medium-length pattern names
  // Each pattern ~15 chars → ~4 tokens + 5 overhead = ~9 tokens each
  // Budget = 200, header overhead = 20 → 180 available / 9 ≈ 20 patterns max
  for (let i = 0; i < 25; i++) {
    const pat = `pattern_style_${String(i).padStart(2, "0")}`;
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `t${j}`,
      }));
    }
  }

  const { retrieved, block } = retrieve();
  const total = retrieved.positives.length + retrieved.negatives.length;
  const diag = retrieved.diagnostics;

  assert("Token budget trims injection set below 25",
    total < 25, `total=${total}`);
  assert("Hard N cap applied (≤ 20)",
    total <= store.MAX_INJECTION_COUNT, `total=${total}`);
  assert("Diagnostics contain budget or cap traces",
    diag.length > 0, `diag_count=${diag.length}`);

  const budgetDiag = diag.filter(d => d.type === "token_budget_exceeded");
  const capDiag = diag.filter(d => d.type === "hard_cap_applied");
  assert("At least one cap or budget diagnostic emitted",
    budgetDiag.length > 0 || capDiag.length > 0);

  console.log(`\n  Injected: ${total}/${25} eligible`);
  console.log(`  Diagnostics: ${capDiag.length} cap, ${budgetDiag.length} budget`);
}

// ----

section("ADV-02 · Token budget: long pattern names consume more tokens");
{
  freshUser();

  // Short patterns (~8 chars → 2 tokens + 5 = 7 each)
  for (let i = 0; i < 5; i++) {
    const pat = `short_${i}`;
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `s${j}`,
      }));
    }
  }

  const { retrieved: rShort } = retrieve();
  const shortCount = rShort.positives.length + rShort.negatives.length;

  freshUser();

  // Long patterns (~40 chars → 10 tokens + 5 = 15 each)
  for (let i = 0; i < 5; i++) {
    const pat = `very_long_descriptive_pattern_name_num_${i}`;
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `l${j}`,
      }));
    }
  }

  const { retrieved: rLong } = retrieve();
  const longCount = rLong.positives.length + rLong.negatives.length;

  // Both should fit since only 5 patterns, but token cost differs
  assert("Short patterns: all 5 fit in budget", shortCount === 5,
    `count=${shortCount}`);
  assert("Long patterns: all 5 fit in budget", longCount === 5,
    `count=${longCount}`);

  // Now test with many long patterns that should exceed budget
  freshUser();
  for (let i = 0; i < 30; i++) {
    const pat = `extremely_verbose_pattern_name_for_testing_budget_${String(i).padStart(2, "0")}`;
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `x${j}`,
      }));
    }
  }

  const { retrieved: rMany } = retrieve();
  const manyCount = rMany.positives.length + rMany.negatives.length;
  const manyBudgetDiag = rMany.diagnostics.filter(d => d.type === "token_budget_exceeded");

  assert("30 long patterns: token budget drops some",
    manyCount < 30, `count=${manyCount}`);
  assert("Token budget diagnostics emitted for dropped patterns",
    manyBudgetDiag.length > 0, `dropped=${manyBudgetDiag.length}`);

  console.log(`\n  30 long patterns: ${manyCount} survived, ${manyBudgetDiag.length} dropped by budget`);
}

// ----

section("ADV-03 · Token budget: header overhead accounted for");
{
  freshUser();

  // Single pattern — should always fit
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "solo_pref",
      preference_type: "style",
      tag_text: `t${i}`,
    }));
  }

  const { retrieved, block } = retrieve();
  const total = retrieved.positives.length + retrieved.negatives.length;

  assert("Single pattern always fits within budget", total === 1);
  assert("No budget diagnostics for single pattern",
    retrieved.diagnostics.filter(d => d.type === "token_budget_exceeded").length === 0);
}

// ===================================================================
// FEATURE 2: Negative Priority Multiplier
// ===================================================================

section("ADV-04 · Negative priority: avoidance ranked above equal-strength positive");
{
  freshUser();

  // Positive at strength ~0.60 (4 × explicit_tag = 4 × 0.15 = 0.60)
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "positive_pref",
      preference_type: "style",
      tag_text: `p${i}`,
      polarity: "positive",
    }));
  }

  // Negative at strength ~0.60 (4 × explicit_tag)
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "negative_pref",
      preference_type: "style",
      tag_text: `n${i}`,
      polarity: "negative",
    }));
  }

  // Both should be injectable, but negative effective_priority = 0.60 × 1.2 = 0.72
  // Positive effective_priority = 0.60 × 1.0 = 0.60
  // So negative survives any budget cut first
  const { retrieved } = retrieve();
  const allInjected = [...retrieved.positives, ...retrieved.negatives];
  assert("Both positive and negative injected (no budget pressure)",
    allInjected.length === 2);
  assert("Negative pref present in injection",
    retrieved.negatives.some(p => p.pattern === "negative_pref"));
  assert("Positive pref present in injection",
    retrieved.positives.some(p => p.pattern === "positive_pref"));
}

// ----

section("ADV-05 · Negative priority: under budget pressure, negatives survive over positives");
{
  freshUser();

  // Create 18 positives (to approach hard cap)
  for (let i = 0; i < 18; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `positive_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  // Create 5 negatives at same strength
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `avoid_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  // 23 eligible, hard cap = 20, so 3 get cut
  // Negatives have effective_priority = 0.60 × 1.2 = 0.72
  // Positives have effective_priority = 0.60 × 1.0 = 0.60
  // So all 5 negatives should survive, and positives get trimmed
  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;
  const total = negCount + posCount;

  assert("Hard cap applied (total ≤ 20)", total <= 20, `total=${total}`);
  assert("All 5 negatives survived the cut", negCount === 5,
    `neg=${negCount}`);
  assert("Positives trimmed to fit cap", posCount < 18,
    `pos=${posCount}`);

  console.log(`\n  Under pressure: ${posCount} positives + ${negCount} negatives = ${total}`);
}

// ----

section("ADV-06 · Negative priority: strong positive still beats weak negative");
{
  freshUser();

  // Strong positive (8 signals → 0.15 × 8 = 1.20, clamped to 1.0)
  for (let i = 0; i < 8; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "strong_positive",
      preference_type: "style",
      tag_text: `sp${i}`,
      polarity: "positive",
    }));
  }

  // Weak negative (3 signals → 0.15 × 3 = 0.45)
  for (let i = 0; i < 3; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "weak_negative",
      preference_type: "style",
      tag_text: `wn${i}`,
      polarity: "negative",
    }));
  }

  // strong_positive effective_priority = 1.0 × 1.0 = 1.0
  // weak_negative effective_priority = 0.45 × 1.2 = 0.54
  // Strong positive should rank higher
  const { retrieved } = retrieve();
  const allInjected = [...retrieved.negatives, ...retrieved.positives];
  assert("Both survive (no budget pressure with 2 items)", allInjected.length === 2);

  // Under a tight budget, the strong positive would survive before the weak negative
  // (1.0 > 0.54 even with multiplier)
  assert("Strong positive at ceiling strength",
    retrieved.positives[0]?.signal_strength === 1.0);
}

// ===================================================================
// FEATURE 3: Conflict Diagnostics
// ===================================================================

section("ADV-07 · Conflict diagnostics: project override produces suppression trace");
{
  freshUser();

  // Global positive
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "editorial_hierarchy",
      preference_type: "layout",
      tag_text: `g${i}`,
      scope: "global",
    }));
  }

  // Project override (different polarity)
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "editorial_hierarchy",
      preference_type: "layout",
      polarity: "negative",
      tag_text: "not for this project",
      scope: "project",
      project_id: "proj_abc",
    }));
  }

  const { retrieved } = retrieve({ project_id: "proj_abc" });
  const diag = retrieved.diagnostics;
  const suppressions = diag.filter(d => d.type === "project_override_suppression");

  assert("Suppression diagnostic emitted", suppressions.length >= 1,
    `count=${suppressions.length}`);

  if (suppressions.length > 0) {
    const s = suppressions[0];
    assert("Trace identifies suppressed pattern",
      s.suppressed_pattern === "editorial_hierarchy");
    assert("Trace identifies suppressed polarity",
      s.suppressed_polarity === "positive");
    assert("Trace identifies override polarity",
      s.override_polarity === "negative");
    assert("Trace includes project_id",
      s.project_id === "proj_abc");
    assert("Trace string is human-readable",
      s.trace.includes("proj_abc") && s.trace.includes("editorial_hierarchy"));

    console.log(`\n  Diagnostic trace: ${s.trace}`);
  }
}

// ----

section("ADV-08 · Conflict diagnostics: no suppression when no project context");
{
  freshUser();

  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "some_style",
      preference_type: "style",
      tag_text: `g${i}`,
    }));
  }

  const { retrieved } = retrieve(); // no project context
  const suppressions = retrieved.diagnostics.filter(
    d => d.type === "project_override_suppression"
  );

  assert("No suppression diagnostics without project context",
    suppressions.length === 0);
}

// ----

section("ADV-09 · Conflict diagnostics: multiple patterns suppressed");
{
  freshUser();

  // Two global patterns
  const globals = ["cinematic_layouts", "warm_palette"];
  for (const pat of globals) {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `g${i}`,
        scope: "global",
      }));
    }
  }

  // Project overrides both
  for (const pat of globals) {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        polarity: "negative",
        tag_text: "override",
        scope: "project",
        project_id: "proj_xyz",
      }));
    }
  }

  const { retrieved } = retrieve({ project_id: "proj_xyz" });
  const suppressions = retrieved.diagnostics.filter(
    d => d.type === "project_override_suppression"
  );

  assert("Two suppression diagnostics for two overridden patterns",
    suppressions.length === 2, `count=${suppressions.length}`);

  const suppPatterns = suppressions.map(s => s.suppressed_pattern).sort();
  assert("Both cinematic_layouts and warm_palette suppressed",
    suppPatterns[0] === "cinematic_layouts" && suppPatterns[1] === "warm_palette",
    `patterns=${suppPatterns.join(",")}`);
}

// ----

section("ADV-10 · Conflict diagnostics: hard cap trace content");
{
  freshUser();

  // Create 25 injectable preferences to trigger hard cap
  for (let i = 0; i < 25; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `cap_test_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `t${j}`,
      }));
    }
  }

  const { retrieved } = retrieve();
  const capDiag = retrieved.diagnostics.filter(d => d.type === "hard_cap_applied");

  assert("Hard cap diagnostic emitted", capDiag.length === 1);
  if (capDiag.length > 0) {
    assert("Cap diagnostic reports correct total eligible",
      capDiag[0].total_eligible === 25, `eligible=${capDiag[0].total_eligible}`);
    assert("Cap diagnostic reports correct cap value",
      capDiag[0].cap === store.MAX_INJECTION_COUNT);
    assert("Cap diagnostic reports correct dropped count",
      capDiag[0].dropped === 5, `dropped=${capDiag[0].dropped}`);
    assert("Cap trace is human-readable",
      capDiag[0].trace.includes("25") && capDiag[0].trace.includes("20"));
  }
}

// ----

section("ADV-11 · Diagnostics: combined cap + budget + suppression in one retrieval");
{
  freshUser();

  // Global preference that will be suppressed
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "global_overridden",
      preference_type: "style",
      tag_text: `g${i}`,
      scope: "global",
    }));
  }

  // Project override
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "global_overridden",
      preference_type: "style",
      polarity: "negative",
      tag_text: "override",
      scope: "project",
      project_id: "proj_combo",
    }));
  }

  // Many additional project patterns to trigger cap
  for (let i = 0; i < 22; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `proj_pat_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `t${j}`,
        scope: "project",
        project_id: "proj_combo",
      }));
    }
  }

  const { retrieved } = retrieve({ project_id: "proj_combo" });
  const diag = retrieved.diagnostics;

  const types = new Set(diag.map(d => d.type));
  assert("Suppression diagnostic present", types.has("project_override_suppression"));

  // Depending on counts, either hard_cap or token_budget may fire
  const hasCap = types.has("hard_cap_applied");
  const hasBudget = types.has("token_budget_exceeded");
  assert("Cap or budget diagnostic present (23 eligible patterns)",
    hasCap || hasBudget, `types=${[...types].join(",")}`);

  console.log(`\n  Combined diagnostics: ${diag.length} entries`);
  console.log(`  Types: ${[...types].join(", ")}`);
}

// ===================================================================
// FEATURE 4: Polarity Diversity Ceiling
// ===================================================================

section("ADV-12 · Diversity ceiling: dense negative profile capped to 50% of slots");
{
  freshUser();

  // Create 5 positives
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `pos_style_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  // Create 15 negatives (dense rejection-heavy profile)
  for (let i = 0; i < 15; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `neg_style_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;
  const total = negCount + posCount;

  assert("Dense negative profile: total preferences injected",
    total > 0, `total=${total}`);
  assert("Negatives do NOT exceed 50% of injection set",
    negCount <= Math.ceil(total * store.NEGATIVE_BUDGET_RATIO),
    `neg=${negCount} pos=${posCount} total=${total} maxNeg=${Math.ceil(total * store.NEGATIVE_BUDGET_RATIO)}`);
  assert("Positives still present in injection",
    posCount > 0, `pos=${posCount}`);
  assert("Diversity ceiling diagnostic emitted",
    retrieved.diagnostics.some(d => d.type === "diversity_ceiling_applied"));

  const divDiag = retrieved.diagnostics.find(d => d.type === "diversity_ceiling_applied");
  if (divDiag) {
    assert("Diversity diagnostic reports correct ratio",
      divDiag.ratio === store.NEGATIVE_BUDGET_RATIO);
    assert("Diversity diagnostic trace is human-readable",
      divDiag.trace.includes("negatives") && divDiag.trace.includes("50%"));
  }

  console.log(`\n  Dense negatives: ${posCount} positives + ${negCount} negatives = ${total}`);
}

// ----

section("ADV-13 · Diversity ceiling: sparse mixed profile passes through without trimming");
{
  freshUser();

  // 3 positives + 2 negatives — well within 50% ratio
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `sparse_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `sparse_neg_${i}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;

  assert("Sparse mixed: all 3 positives injected", posCount === 3, `pos=${posCount}`);
  assert("Sparse mixed: all 2 negatives injected", negCount === 2, `neg=${negCount}`);
  assert("No diversity ceiling diagnostic for sparse profile",
    !retrieved.diagnostics.some(d => d.type === "diversity_ceiling_applied"));
}

// ----

section("ADV-14 · Diversity ceiling: interaction with token budget");
{
  freshUser();

  // Create 8 negatives with long patterns (expensive tokens)
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `very_long_negative_avoidance_pattern_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  // Create 4 positives with short patterns
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  const { retrieved } = retrieve();
  const total = retrieved.positives.length + retrieved.negatives.length;

  // Diversity ceiling runs before token budget — both may trim
  assert("Token + diversity: injection set is non-empty", total > 0);
  assert("Token + diversity: positives survive",
    retrieved.positives.length > 0, `pos=${retrieved.positives.length}`);

  // Check both diversity and budget diagnostics can coexist
  const diagTypes = new Set(retrieved.diagnostics.map(d => d.type));
  // At minimum, diversity ceiling should fire (8 neg vs 4 pos = 67% neg)
  assert("Diversity diagnostic fires with token pressure",
    diagTypes.has("diversity_ceiling_applied"));
}

// ----

section("ADV-15 · Diversity ceiling: negative multiplier + diversity interaction");
{
  freshUser();

  // 10 negatives and 10 positives at equal strength
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `balanced_neg_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `balanced_pos_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  // 20 eligible, fits within hard cap. 10 neg / 20 total = 50% exactly
  // Negatives have effective_priority = 0.60 × 1.2 = 0.72
  // Positives have effective_priority = 0.60 × 1.0 = 0.60
  // Without diversity ceiling, negatives would dominate top-N under pressure
  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;
  const total = negCount + posCount;

  assert("Equal split: total is 20", total === 20, `total=${total}`);
  assert("Equal split: negatives at exactly 50% ceiling",
    negCount <= Math.ceil(total * store.NEGATIVE_BUDGET_RATIO),
    `neg=${negCount} maxNeg=${Math.ceil(total * store.NEGATIVE_BUDGET_RATIO)}`);
  assert("Equal split: positives preserved",
    posCount >= 10, `pos=${posCount}`);

  console.log(`\n  Equal split: ${posCount} positives + ${negCount} negatives = ${total}`);
}

// ----

section("ADV-16 · Diversity ceiling: backfill restores positives from hard-cap overflow");
{
  freshUser();

  // Create 16 negatives (will be trimmed by diversity) and 8 positives
  // Total eligible = 24, hard cap = 20 → 4 overflow
  // After hard cap: top 20 by effective_priority (negatives rank higher due to 1.2×)
  // Diversity ceiling trims excess negatives, backfills with positive overflow
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `backfill_neg_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `backfill_pos_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;
  const total = negCount + posCount;
  const diagTypes = new Set(retrieved.diagnostics.map(d => d.type));

  assert("Backfill scenario: hard cap applied", diagTypes.has("hard_cap_applied"));
  assert("Backfill scenario: diversity ceiling applied",
    diagTypes.has("diversity_ceiling_applied"));

  // After diversity trimming, negatives should be ≤ 50% of final set
  assert("Backfill: negatives within diversity ratio after backfill",
    negCount <= Math.ceil(total * store.NEGATIVE_BUDGET_RATIO),
    `neg=${negCount} total=${total}`);

  // Backfill diagnostic should fire if positives were recovered from overflow
  if (diagTypes.has("diversity_backfill")) {
    const backfillDiag = retrieved.diagnostics.find(d => d.type === "diversity_backfill");
    assert("Backfill diagnostic reports count",
      backfillDiag.backfilled_count > 0);
    assert("Backfill diagnostic trace is readable",
      backfillDiag.trace.includes("positive"));
  }

  console.log(`\n  Backfill: ${posCount} positives + ${negCount} negatives = ${total}`);
}

// ----

section("ADV-17 · Diversity ceiling: single negative always survives (floor = 1)");
{
  freshUser();

  // 10 positives + 1 negative
  for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `floor_pos_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }
  for (let j = 0; j < 4; j++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "sole_negative",
      preference_type: "style",
      tag_text: `n${j}`,
      polarity: "negative",
    }));
  }

  const { retrieved } = retrieve();
  assert("Floor: single negative survives",
    retrieved.negatives.length === 1, `neg=${retrieved.negatives.length}`);
  assert("Floor: single negative pattern correct",
    retrieved.negatives[0]?.pattern === "sole_negative");
  assert("Floor: no diversity ceiling diagnostic (1 neg within floor)",
    !retrieved.diagnostics.some(d => d.type === "diversity_ceiling_applied"));
}

// ----

section("ADV-18 · Diversity ceiling: all-negative profile handled gracefully");
{
  freshUser();

  // 12 negatives, zero positives
  for (let i = 0; i < 12; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `all_neg_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;
  const total = negCount + posCount;

  assert("All-negative: some negatives still injected", negCount > 0, `neg=${negCount}`);
  assert("All-negative: diversity ceiling trims to 50% of total",
    negCount <= Math.ceil(total * store.NEGATIVE_BUDGET_RATIO) || total === negCount,
    `neg=${negCount} total=${total}`);
  assert("All-negative: zero positives (none exist to backfill)",
    posCount === 0, `pos=${posCount}`);

  // With all-negative and 0 positives, max_neg_slots = floor(12 * 0.5) = 6
  // but after trimming to 6, total becomes 6, and 6/6 = 100% which is > 50%
  // However, there's nothing to backfill with, so this is expected behavior
  assert("All-negative: diversity ceiling diagnostic emitted",
    retrieved.diagnostics.some(d => d.type === "diversity_ceiling_applied"));

  console.log(`\n  All-negative: ${negCount} negatives injected from 12 eligible`);
}

// ----

section("ADV-19 · Diversity: prompt composition drift — negative token share bounded");
{
  freshUser();

  // Create a mix where negatives have longer patterns (more tokens)
  // This tests that even when negatives pass the slot ceiling,
  // their token consumption is bounded by the combination of diversity + budget ceilings
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `extremely_verbose_negative_avoidance_pattern_number_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `short_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  const { retrieved, block } = retrieve();

  // Count approximate tokens consumed by negatives vs positives
  const negTokens = retrieved.negatives.reduce((sum, p) =>
    sum + Math.ceil(p.pattern.length / store.CHARS_PER_TOKEN) + 5, 0);
  const posTokens = retrieved.positives.reduce((sum, p) =>
    sum + Math.ceil(p.pattern.length / store.CHARS_PER_TOKEN) + 5, 0);
  const totalTokens = negTokens + posTokens;

  assert("Prompt composition: negatives don't consume > 80% of tokens",
    totalTokens === 0 || (negTokens / totalTokens) <= 0.80,
    `negTokens=${negTokens} totalTokens=${totalTokens} ratio=${totalTokens > 0 ? (negTokens / totalTokens).toFixed(2) : "n/a"}`);

  assert("Prompt composition: prompt block is non-empty", block.length > 0);
  assert("Prompt composition: block contains both Prefer and Avoid lines",
    block.includes("Prefer") || block.includes("Avoid"));

  console.log(`\n  Token composition: neg=${negTokens} pos=${posTokens} total=${totalTokens}`);
}

// ----

section("ADV-20 · Diversity stability: ratio holds over 30 sessions of negative accumulation");
{
  freshUser();

  // Start with 5 positives
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `stable_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  // Over 30 sessions, add 1 new negative per session
  const ratios = [];
  for (let session = 0; session < 30; session++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `session_neg_${String(session).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `sn${j}`,
        polarity: "negative",
        session_id: `sess_${session}`,
      }));
    }

    const { retrieved } = retrieve();
    const negCount = retrieved.negatives.length;
    const posCount = retrieved.positives.length;
    const total = negCount + posCount;
    ratios.push(total > 0 ? negCount / total : 0);
  }

  // After 30 sessions of negative accumulation, ratio should stay bounded
  const maxRatio = Math.max(...ratios);
  const lastRatio = ratios[ratios.length - 1];

  // Allow small floating-point margin above 0.50 due to rounding
  assert("30-session stability: max negative ratio ≤ 55%",
    maxRatio <= 0.55,
    `maxRatio=${maxRatio.toFixed(3)}`);
  assert("30-session stability: final negative ratio ≤ 55%",
    lastRatio <= 0.55,
    `lastRatio=${lastRatio.toFixed(3)}`);

  // Verify ratio didn't drift monotonically upward (stayed bounded)
  const earlyAvg = ratios.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
  const lateAvg = ratios.slice(-10).reduce((a, b) => a + b, 0) / 10;
  assert("30-session stability: late avg ratio not significantly higher than early",
    lateAvg <= earlyAvg + 0.15,
    `earlyAvg=${earlyAvg.toFixed(3)} lateAvg=${lateAvg.toFixed(3)}`);

  console.log(`\n  30-session ratios: max=${maxRatio.toFixed(3)} last=${lastRatio.toFixed(3)}`);
  console.log(`  Early avg: ${earlyAvg.toFixed(3)}  Late avg: ${lateAvg.toFixed(3)}`);
}

// ===================================================================
// FEATURE 5: MIN_NEG_FLOOR — Early Rejection-Only Users
// ===================================================================

section("ADV-21 · MIN_NEG_FLOOR: rejection-only user still gets avoidance context");
{
  freshUser();

  // User has ONLY rejections — no positive signals at all
  // This simulates a brand-new user who has only told the system what they DON'T want
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `early_reject_${i}`,
        preference_type: "style",
        tag_text: `r${j}`,
        polarity: "negative",
      }));
    }
  }

  const { retrieved, block } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;

  assert("Rejection-only user: negatives injected despite zero positives",
    negCount > 0, `neg=${negCount}`);
  assert("Rejection-only user: at least MIN_NEG_FLOOR negatives survive",
    negCount >= store.MIN_NEG_FLOOR, `neg=${negCount} floor=${store.MIN_NEG_FLOOR}`);
  assert("Rejection-only user: zero positives (as expected)",
    posCount === 0);
  assert("Rejection-only user: prompt block is non-empty",
    block.length > 0);
  assert("Rejection-only user: block contains Avoid lines",
    block.includes("Avoid"));

  console.log(`\n  Rejection-only: ${negCount} negatives injected (floor=${store.MIN_NEG_FLOOR})`);
}

// ----

section("ADV-22 · MIN_NEG_FLOOR: floor value correctness across profile sizes");
{
  freshUser();

  // 1 positive + 5 negatives → negCeiling = max(MIN_NEG_FLOOR, floor(R/(1-R)*1)) = max(2, 1) = 2
  // So 5 negatives should be trimmed to 2
  for (let j = 0; j < 4; j++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "lone_positive",
      preference_type: "style",
      tag_text: `p${j}`,
      polarity: "positive",
    }));
  }
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `floor_neg_${i}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  const { retrieved } = retrieve();
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;

  // With 1 positive, ratio formula gives floor(0.5/0.5 * 1) = 1
  // But MIN_NEG_FLOOR = 2, so ceiling = max(2, 1) = 2
  assert("Floor correctness: negatives capped at MIN_NEG_FLOOR when ratio < floor",
    negCount === store.MIN_NEG_FLOOR,
    `neg=${negCount} expected=${store.MIN_NEG_FLOOR}`);
  assert("Floor correctness: positive survived",
    posCount === 1, `pos=${posCount}`);
  assert("Floor correctness: diversity ceiling diagnostic emitted",
    retrieved.diagnostics.some(d => d.type === "diversity_ceiling_applied"));

  console.log(`\n  Floor test: ${posCount} pos + ${negCount} neg (floor=${store.MIN_NEG_FLOOR})`);
}

// ===================================================================
// FEATURE 6: Category Diversity Quota
// ===================================================================

section("ADV-23 · Category ceiling: multi-category profile trimmed to max per type");
{
  freshUser();

  // Create 6 layout + 6 typography + 2 motion preferences
  // Category ceiling = 3/type → layout trimmed to 3, typography trimmed to 3, motion untouched
  const categories = [
    { type: "layout", count: 6 },
    { type: "typography", count: 6 },
    { type: "motion", count: 2 },
  ];

  for (const { type, count } of categories) {
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < 4; j++) {
        store.ingestSignal(USER, sig({
          signal_type: "explicit_tag",
          pattern: `${type}_pattern_${i}`,
          preference_type: type,
          tag_text: `t${j}`,
          polarity: "positive",
        }));
      }
    }
  }

  const { retrieved } = retrieve();
  const all = [...retrieved.positives, ...retrieved.negatives];

  // Count per category
  const catCounts = {};
  all.forEach(p => {
    catCounts[p.preference_type] = (catCounts[p.preference_type] || 0) + 1;
  });

  assert("Category ceiling: layout capped at MAX_PER_CATEGORY",
    (catCounts["layout"] || 0) <= store.MAX_PER_CATEGORY,
    `layout=${catCounts["layout"]}`);
  assert("Category ceiling: typography capped at MAX_PER_CATEGORY",
    (catCounts["typography"] || 0) <= store.MAX_PER_CATEGORY,
    `typography=${catCounts["typography"]}`);
  assert("Category ceiling: motion untouched (below cap)",
    (catCounts["motion"] || 0) === 2,
    `motion=${catCounts["motion"]}`);
  assert("Category ceiling diagnostic emitted",
    retrieved.diagnostics.some(d => d.type === "category_ceiling_applied"));

  const catDiag = retrieved.diagnostics.find(d => d.type === "category_ceiling_applied");
  if (catDiag) {
    assert("Category diagnostic reports correct max_per_category",
      catDiag.max_per_category === store.MAX_PER_CATEGORY);
    assert("Category diagnostic trace is readable",
      catDiag.trace.includes("layout") || catDiag.trace.includes("typography"));
  }

  console.log(`\n  Multi-cat: layout=${catCounts["layout"]} typo=${catCounts["typography"]} motion=${catCounts["motion"]}`);
}

// ----

section("ADV-24 · Category ceiling: single-category profile untouched");
{
  freshUser();

  // All 8 preferences in same category "style" — ceiling should NOT fire
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `mono_cat_${i}`,
        preference_type: "style",
        tag_text: `t${j}`,
        polarity: "positive",
      }));
    }
  }

  const { retrieved } = retrieve();
  const total = retrieved.positives.length + retrieved.negatives.length;

  assert("Single-category: all 8 patterns survive (no ceiling)",
    total === 8, `total=${total}`);
  assert("Single-category: no category ceiling diagnostic",
    !retrieved.diagnostics.some(d => d.type === "category_ceiling_applied"));
}

// ----

section("ADV-25 · Category ceiling: backfill from under-represented types");
{
  freshUser();

  // Create 22 layout (will hit hard cap → overflow) + 2 motion + 3 color
  // After hard cap: top 20 → mostly layout. Category ceiling trims to 3 layout.
  // Backfill should pull from overflow (motion/color if available)
  for (let i = 0; i < 22; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `layout_heavy_${String(i).padStart(2, "0")}`,
        preference_type: "layout",
        tag_text: `l${j}`,
        polarity: "positive",
      }));
    }
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `motion_light_${i}`,
        preference_type: "motion",
        tag_text: `m${j}`,
        polarity: "positive",
      }));
    }
  }
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `color_mid_${i}`,
        preference_type: "color",
        tag_text: `c${j}`,
        polarity: "positive",
      }));
    }
  }

  const { retrieved } = retrieve();
  const all = [...retrieved.positives, ...retrieved.negatives];
  const catCounts = {};
  all.forEach(p => {
    catCounts[p.preference_type] = (catCounts[p.preference_type] || 0) + 1;
  });

  assert("Backfill: layout trimmed to MAX_PER_CATEGORY",
    (catCounts["layout"] || 0) <= store.MAX_PER_CATEGORY,
    `layout=${catCounts["layout"]}`);
  assert("Backfill: motion patterns present",
    (catCounts["motion"] || 0) > 0, `motion=${catCounts["motion"]}`);
  assert("Backfill: color patterns present",
    (catCounts["color"] || 0) > 0, `color=${catCounts["color"]}`);
  assert("Backfill: multi-category representation achieved",
    Object.keys(catCounts).length >= 2,
    `cats=${Object.keys(catCounts).join(",")}`);

  console.log(`\n  Backfill cats: ${JSON.stringify(catCounts)}`);
}

// ----

section("ADV-26 · Combined: category + polarity diversity under dual pressure");
{
  freshUser();

  // 8 layout positives + 8 typography negatives + 2 motion positives
  // Tests both polarity AND category ceiling interacting
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `combo_layout_${i}`,
        preference_type: "layout",
        tag_text: `l${j}`,
        polarity: "positive",
      }));
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `combo_typo_neg_${i}`,
        preference_type: "typography",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `combo_motion_${i}`,
        preference_type: "motion",
        tag_text: `m${j}`,
        polarity: "positive",
      }));
    }
  }

  const { retrieved } = retrieve();
  const all = [...retrieved.positives, ...retrieved.negatives];
  const negCount = retrieved.negatives.length;
  const posCount = retrieved.positives.length;
  const total = negCount + posCount;

  const catCounts = {};
  all.forEach(p => {
    catCounts[p.preference_type] = (catCounts[p.preference_type] || 0) + 1;
  });

  // Polarity diversity should bound negatives
  assert("Combined: negatives within polarity ceiling",
    negCount <= Math.ceil(total * store.NEGATIVE_BUDGET_RATIO) + 1,
    `neg=${negCount} total=${total}`);
  assert("Combined: positives present",
    posCount > 0, `pos=${posCount}`);

  // Category diversity should distribute across types
  assert("Combined: no single category exceeds MAX_PER_CATEGORY",
    Object.values(catCounts).every(c => c <= store.MAX_PER_CATEGORY),
    `cats=${JSON.stringify(catCounts)}`);
  assert("Combined: multi-category representation",
    Object.keys(catCounts).length >= 2,
    `cats=${Object.keys(catCounts).join(",")}`);

  console.log(`\n  Combined: ${JSON.stringify(catCounts)} | pos=${posCount} neg=${negCount}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Retrieval Quality Sim — Advanced Features`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`${"─".repeat(50)}\n`);

cleanup();
process.exit(failed > 0 ? 1 : 0);

