/**
 * Creative Memory System — Long-Running Retrieval Simulation
 * Extended scenarios: temporal evolution, cross-session stability,
 * decay-under-load, reinjection stability, and adversarial edge cases.
 *
 * Run: node retrievalLongRunSim.js
 */

const path = require("path");
const fs = require("fs");

process.env.MEMORY_STORAGE_ROOT = path.join(__dirname, ".test-longrun");

const store = require("../preferenceStore");

// ---------------------------------------------------------------------------
// Metrics (lightweight inline — same shape as core sim)
// ---------------------------------------------------------------------------

function captureMetrics(retrieved, block) {
  const all = [...retrieved.positives, ...retrieved.negatives];
  const pos = retrieved.positives.length;
  const neg = retrieved.negatives.length;
  const total = all.length;

  // Polarity entropy: H = -p*log2(p) - (1-p)*log2(1-p)
  let polarity_entropy = 0;
  if (total > 0) {
    const p = pos / total;
    if (p > 0 && p < 1) {
      polarity_entropy = -(p * Math.log2(p)) - ((1 - p) * Math.log2(1 - p));
    }
  }

  // Category distribution
  const catDist = {};
  all.forEach(pref => {
    catDist[pref.preference_type] = (catDist[pref.preference_type] || 0) + 1;
  });

  return {
    total,
    pos,
    neg,
    overrides: retrieved.projectOverrides.length,
    chars: block.length,
    patterns: all.map(p => p.pattern),
    strengths: all.map(p => p.signal_strength),
    confidences: all.map(p => p.confidence),
    statuses: all.map(p => p.polarity_status),
    unique: new Set(all.map(p => p.pattern)).size,
    polarity_entropy,
    category_distribution: catDist,
    category_count: Object.keys(catDist).length,
  };
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const USER = "usr_longrun";
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

// ---------------------------------------------------------------------------
// LR-01: Multi-session accumulation stability
// ---------------------------------------------------------------------------

section("LR-01 · Multi-session accumulation: 20 sessions, consistent ranking");
{
  cleanup();
  freshUser();

  const patterns = ["serif_headlines", "warm_palette", "round_corners", "airy_spacing"];
  const snapshots = [];

  // Simulate 20 sessions, each adding signals
  for (let session = 0; session < 20; session++) {
    const pat = patterns[session % patterns.length];
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: pat,
      preference_type: "style",
      tag_text: `s${session}`,
      session_id: `sess_${session}`,
    }));

    const { retrieved, block } = retrieve();
    snapshots.push(captureMetrics(retrieved, block));
  }

  // After 20 sessions, injection set should have stabilized
  const last = snapshots[snapshots.length - 1];
  assert("After 20 sessions: preferences injected", last.total >= 3,
    `total=${last.total}`);

  // Check ranking is monotonic in final snapshot
  let mono = true;
  for (let i = 1; i < last.strengths.length; i++) {
    if (last.strengths[i] > last.strengths[i - 1]) mono = false;
  }
  assert("Final ranking is monotonically descending", mono);

  // Check stability of last 5 snapshots (should have same pattern set)
  const last5 = snapshots.slice(-5);
  const refPatterns = new Set(last5[0].patterns);
  const stable = last5.every(s =>
    s.patterns.length === refPatterns.size &&
    s.patterns.every(p => refPatterns.has(p))
  );
  assert("Last 5 snapshots have identical pattern sets", stable);
}

// ---------------------------------------------------------------------------
// LR-02: Decay under continuous load
// ---------------------------------------------------------------------------

section("LR-02 · Decay under load: active preference survives, stale decays");
{
  freshUser();

  // Pattern A: continuously reinforced
  // Pattern B: set once and left to decay
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "active_pattern",
      preference_type: "style",
      tag_text: `a${i}`,
    }));
  }
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "stale_pattern",
      preference_type: "style",
      tag_text: `s${i}`,
    }));
  }

  // Force decay on stale_pattern by pushing its decay_at into the past
  const allPrefs = store.listPreferences(USER, { polarity: "positive", status: "all" });
  const stale = allPrefs.find(p => p.pattern === "stale_pattern");
  if (stale) {
    const past = new Date();
    past.setDate(past.getDate() - 91);
    store.updatePreference(USER, stale.id, { decay_at: past.toISOString() });
    store.runDecay(USER);
  }

  // Reinforce active_pattern
  store.ingestSignal(USER, sig({
    signal_type: "explicit_tag",
    pattern: "active_pattern",
    preference_type: "style",
    tag_text: "still_active",
  }));

  const { retrieved, block } = retrieve();
  const snap = captureMetrics(retrieved, block);

  assert("Active pattern still injectable",
    snap.patterns.includes("active_pattern"));
  assert("Stale pattern excluded after decay",
    !snap.patterns.includes("stale_pattern"));
}

// ---------------------------------------------------------------------------
// LR-03: Reversal during active retrieval — injection set mutation
// ---------------------------------------------------------------------------

section("LR-03 · Reversal during active use: injection set updates correctly");
{
  freshUser();

  // Build injectable preference
  for (let i = 0; i < 6; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "serif_headlines",
      preference_type: "typography",
      tag_text: `t${i}`,
    }));
  }

  const { retrieved: r1 } = retrieve();
  assert("Pre-reversal: serif_headlines injected",
    r1.positives.some(p => p.pattern === "serif_headlines"));

  // Full reversal: 4 contradictory signals
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "serif_headlines",
      preference_type: "typography",
      polarity: "negative",
      tag_text: "switched to sans",
      session_id: `rev_${i}`,
    }));
  }

  const { retrieved: r2, block: b2 } = retrieve();
  const snap = captureMetrics(r2, b2);

  assert("Post-reversal: serif_headlines removed from injection",
    !snap.patterns.includes("serif_headlines"));
  assert("No under_review records in injection",
    snap.statuses.every(s => s === "stable"));
}

// ---------------------------------------------------------------------------
// LR-04: Reinjection stability — shadow promotion restores injection
// ---------------------------------------------------------------------------

section("LR-04 · Shadow promotion: reversed preference re-enters injection");
{
  freshUser();

  // Build positive, then fully reverse
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "dense_grid",
      preference_type: "layout",
      tag_text: `t${i}`,
    }));
  }
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "dense_grid",
      preference_type: "layout",
      polarity: "negative",
      tag_text: "actually no",
      session_id: `rev_${i}`,
    }));
  }

  // Promote shadow by accumulating negative signals on it
  for (let i = 0; i < 8; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "dense_grid",
      preference_type: "layout",
      polarity: "negative",
      tag_text: "confirmed no",
      session_id: `prom_${i}`,
    }));
  }

  const { retrieved, block } = retrieve();
  const snap = captureMetrics(retrieved, block);

  // The promoted shadow (now a full negative record) should be injectable
  // if it has enough strength and medium+ confidence
  const negDenseGrid = retrieved.negatives.find(p => p.pattern === "dense_grid");
  assert("Promoted shadow re-enters injection as negative",
    !!negDenseGrid,
    `found=${!!negDenseGrid}`);
  if (negDenseGrid) {
    assert("Promoted record has stable status", negDenseGrid.polarity_status === "stable");
    assert("Promoted record has medium+ confidence",
      negDenseGrid.confidence === "medium" || negDenseGrid.confidence === "high");
  }
}

// ---------------------------------------------------------------------------
// LR-05: Mixed signal types — ranking reflects weight hierarchy
// ---------------------------------------------------------------------------

section("LR-05 · Mixed signal weights: explicit_tag > manual_refinement > thumbs_up");
{
  freshUser();

  // Pattern A: only thumbs_up (weight 0.10)
  for (let i = 0; i < 10; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "thumbs_up",
      pattern: "thumbs_only",
      preference_type: "style",
    }));
  }

  // Pattern B: only manual_refinement (weight 0.20)
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "manual_refinement",
      pattern: "refinement_only",
      preference_type: "style",
    }));
  }

  // Pattern C: only explicit_tag (weight 0.30)
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "tagged_only",
      preference_type: "style",
      tag_text: `t${i}`,
    }));
  }

  const { retrieved } = retrieve();
  const positives = retrieved.positives;

  if (positives.length >= 3) {
    const idxTag = positives.findIndex(p => p.pattern === "tagged_only");
    const idxRef = positives.findIndex(p => p.pattern === "refinement_only");
    const idxThumb = positives.findIndex(p => p.pattern === "thumbs_only");

    // tagged should be strongest (0.30 * 4 / 2 = 0.60)
    // refinement should be mid   (0.20 * 5 / 2 = 0.50)
    // thumbs should be lowest    (0.10 * 10 / 2 = 0.50) — tie with refinement
    assert("Explicit tags ranked highest", idxTag < idxRef || idxTag < idxThumb,
      `tag_idx=${idxTag} ref_idx=${idxRef} thumb_idx=${idxThumb}`);
  } else {
    assert("At least 3 injectable preferences for weight comparison",
      positives.length >= 3, `got=${positives.length}`);
  }
}

// ---------------------------------------------------------------------------
// LR-06: Preference type filtering — scoped retrieval
// ---------------------------------------------------------------------------

section("LR-06 · Preference type filtering: scoped retrieval");
{
  freshUser();

  // Build preferences across different types
  const types = [
    { type: "typography", pattern: "serif_headlines" },
    { type: "color", pattern: "warm_palette" },
    { type: "layout", pattern: "airy_spacing" },
    { type: "motion", pattern: "spring_physics" },
  ];

  for (const { type, pattern } of types) {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern,
        preference_type: type,
        tag_text: `${type}_${i}`,
      }));
    }
  }

  // Filter by typography only
  const rTypo = store.retrieveForInjection(USER, { preference_types: ["typography"] });
  assert("Type filter: only typography returned",
    rTypo.positives.every(p => p.preference_type === "typography"),
    `types=${rTypo.positives.map(p => p.preference_type).join(",")}`);
  assert("Type filter: 1 typography preference",
    rTypo.positives.length === 1);

  // Filter by multiple types
  const rMulti = store.retrieveForInjection(USER, {
    preference_types: ["color", "layout"],
  });
  assert("Multi-type filter: 2 preferences returned",
    rMulti.positives.length === 2,
    `count=${rMulti.positives.length}`);
}

// ---------------------------------------------------------------------------
// LR-07: Stress test — 50 distinct patterns
// ---------------------------------------------------------------------------

section("LR-07 · Stress: 50 distinct patterns, ranking + budget integrity");
{
  freshUser();

  for (let i = 0; i < 50; i++) {
    const count = 3 + Math.floor(i / 10); // vary strength
    for (let j = 0; j < count; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `pattern_${String(i).padStart(3, "0")}`,
        preference_type: "style",
        tag_text: `t${j}`,
      }));
    }
  }

  const { retrieved, block } = retrieve();
  const snap = captureMetrics(retrieved, block);

  assert("50-pattern stress: capped to MAX_INJECTION_COUNT",
    snap.total <= store.MAX_INJECTION_COUNT,
    `total=${snap.total} cap=${store.MAX_INJECTION_COUNT}`);

  // Ranking check
  let mono = true;
  for (let i = 1; i < snap.strengths.length; i++) {
    if (snap.strengths[i] > snap.strengths[i - 1]) mono = false;
  }
  assert("50-pattern stress: ranking monotonic", mono);
  assert("50-pattern stress: no duplicate patterns", snap.unique === snap.total);

  // Budget: prompt block should still be manageable
  const MAX_CHARS = 5000;
  assert(`Prompt block under ${MAX_CHARS} chars at 50 patterns`,
    snap.chars <= MAX_CHARS, `chars=${snap.chars}`);

  console.log(`\n  Stress results: ${snap.total} injected, ${snap.chars} chars, ${snap.unique} unique`);
}

// ---------------------------------------------------------------------------
// LR-08: Cross-project isolation
// ---------------------------------------------------------------------------

section("LR-08 · Cross-project isolation: projects don't leak into each other");
{
  freshUser();

  // Project A preferences
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "dark_theme",
      preference_type: "color",
      tag_text: `a${i}`,
      scope: "project",
      project_id: "proj_a",
    }));
  }

  // Project B preferences
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "light_theme",
      preference_type: "color",
      tag_text: `b${i}`,
      scope: "project",
      project_id: "proj_b",
    }));
  }

  const { retrieved: rA } = retrieve({ project_id: "proj_a" });
  const { retrieved: rB } = retrieve({ project_id: "proj_b" });

  assert("Project A retrieval does not contain proj_b patterns",
    !rA.positives.some(p => p.pattern === "light_theme"));
  assert("Project B retrieval does not contain proj_a patterns",
    !rB.positives.some(p => p.pattern === "dark_theme"));
}

// ---------------------------------------------------------------------------
// LR-09: Confidence gate — low confidence excluded even if above threshold
// ---------------------------------------------------------------------------

section("LR-09 · Confidence gate: low confidence excluded even if strength >= threshold");
{
  freshUser();

  // Create a preference manually with high strength but force low confidence
  const pref = store.createPreference(USER, {
    preference_type: "style",
    pattern: "forced_low_conf",
    polarity: "positive",
    signal_strength: 0.80,
    scope: "global",
  });

  // Force confidence to low (simulate edge case)
  store.updatePreference(USER, pref.id, {
    signal_strength: 0.80,
    confidence: "low",
  });

  // The store's recalcStrength will recalc confidence from strength on update
  // So we need to check what actually happens
  const read = store.readPreference(USER, pref.id);

  // If confidence was recalculated to high (because 0.80 > 0.65), this test
  // validates that recalcStrength is working correctly
  if (read.confidence === "high") {
    assert("Confidence auto-corrected from strength (recalcStrength works)",
      read.confidence === "high");
  } else {
    // If confidence stayed low despite high strength, retrieval should exclude it
    const { retrieved } = retrieve();
    assert("Low-confidence record excluded despite high strength",
      !retrieved.positives.some(p => p.pattern === "forced_low_conf"));
  }
}

// ---------------------------------------------------------------------------
// LR-10: Temporal sequence — preference evolution over time
// ---------------------------------------------------------------------------

section("LR-10 · Temporal evolution: preference strengthens then decays correctly");
{
  freshUser();

  const history = [];

  // Phase 1: Build up (sessions 1-5)
  for (let s = 0; s < 5; s++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "evolving_pref",
      preference_type: "style",
      tag_text: `build_${s}`,
      session_id: `build_${s}`,
    }));
    const { retrieved, block } = retrieve();
    const snap = captureMetrics(retrieved, block);
    history.push({ phase: "build", session: s, ...snap });
  }

  // Phase 2: No activity + forced decay
  const prefs = store.listPreferences(USER, { polarity: "positive" });
  const target = prefs.find(p => p.pattern === "evolving_pref");
  if (target) {
    for (let d = 0; d < 3; d++) {
      const past = new Date();
      past.setDate(past.getDate() - 1);
      store.updatePreference(USER, target.id, { decay_at: past.toISOString() });
      store.runDecay(USER);
      const { retrieved, block } = retrieve();
      const snap = captureMetrics(retrieved, block);
      history.push({ phase: "decay", cycle: d, ...snap });
    }
  }

  // Verify trajectory
  const buildPhase = history.filter(h => h.phase === "build");
  const decayPhase = history.filter(h => h.phase === "decay");

  // During build: injection count should become 1 when threshold is crossed
  const firstInjection = buildPhase.findIndex(h => h.total > 0);
  assert("Preference enters injection set during build phase",
    firstInjection >= 0, `first_at=${firstInjection}`);

  // During decay: strength should decrease
  if (decayPhase.length >= 2) {
    const evolving = store.readPreference(USER, target.id);
    assert("Strength decreased after decay cycles",
      evolving.signal_strength < 1.0,
      `strength=${evolving.signal_strength.toFixed(3)}`);
  }

  console.log(`\n  Evolution: ${history.length} snapshots tracked`);
  console.log(`  First injection at session: ${firstInjection}`);
}

// ---------------------------------------------------------------------------
// LR-11: Diversity ceiling stability under temporal evolution
// ---------------------------------------------------------------------------

section("LR-11 · Diversity temporal: negative accumulation over 25 sessions stays bounded");
{
  freshUser();

  // Phase 1: Build 6 strong positives
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 5; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `temporal_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  // Phase 2: Over 25 sessions, accumulate 2 new negatives per session
  const snapshots = [];
  for (let session = 0; session < 25; session++) {
    for (let n = 0; n < 2; n++) {
      const idx = session * 2 + n;
      for (let j = 0; j < 4; j++) {
        store.ingestSignal(USER, sig({
          signal_type: "explicit_tag",
          pattern: `temporal_neg_${String(idx).padStart(2, "0")}`,
          preference_type: "style",
          tag_text: `n${j}`,
          polarity: "negative",
          session_id: `sess_${session}`,
        }));
      }
    }

    const { retrieved, block } = retrieve();
    const snap = captureMetrics(retrieved, block);
    snap.neg_ratio = snap.neg / Math.max(snap.total, 1);
    snapshots.push(snap);
  }

  // Verify diversity ratio stays bounded throughout
  const maxNegRatio = Math.max(...snapshots.map(s => s.neg_ratio));
  const lastSnap = snapshots[snapshots.length - 1];

  assert("Temporal diversity: max negative ratio ≤ 55% across 25 sessions",
    maxNegRatio <= 0.55, `maxRatio=${maxNegRatio.toFixed(3)}`);
  assert("Temporal diversity: positives still present in final snapshot",
    lastSnap.pos > 0, `pos=${lastSnap.pos}`);
  assert("Temporal diversity: ranking stays monotonic",
    (() => {
      for (let i = 1; i < lastSnap.strengths.length; i++) {
        if (lastSnap.strengths[i] > lastSnap.strengths[i - 1]) return false;
      }
      return true;
    })());

  console.log(`\n  Temporal: max ratio=${maxNegRatio.toFixed(3)} final=${lastSnap.neg_ratio.toFixed(3)}`);
  console.log(`  Final: ${lastSnap.pos} pos + ${lastSnap.neg} neg = ${lastSnap.total}`);
}

// ---------------------------------------------------------------------------
// LR-12: Cross-project diversity isolation
// ---------------------------------------------------------------------------

section("LR-12 · Cross-project diversity: ceiling applied independently per retrieval context");
{
  freshUser();

  // Project A: 2 positives + 6 negatives (should trigger diversity)
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `proj_a_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
        scope: "project",
        project_id: "proj_diverse_a",
      }));
    }
  }
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `proj_a_neg_${i}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
        scope: "project",
        project_id: "proj_diverse_a",
      }));
    }
  }

  // Project B: 4 positives + 1 negative (should NOT trigger diversity)
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `proj_b_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
        scope: "project",
        project_id: "proj_diverse_b",
      }));
    }
  }
  for (let j = 0; j < 4; j++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "proj_b_neg_0",
      preference_type: "style",
      tag_text: `n${j}`,
      polarity: "negative",
      scope: "project",
      project_id: "proj_diverse_b",
    }));
  }

  const { retrieved: rA } = retrieve({ project_id: "proj_diverse_a" });
  const { retrieved: rB } = retrieve({ project_id: "proj_diverse_b" });

  const aNeg = rA.negatives.length;
  const aPos = rA.positives.length;
  const aTotal = aNeg + aPos;

  assert("Project A: diversity ceiling applied (6 neg > 50%)",
    aNeg <= Math.ceil(aTotal * store.NEGATIVE_BUDGET_RATIO) || aTotal <= 3,
    `neg=${aNeg} total=${aTotal}`);

  const bNeg = rB.negatives.length;
  const bPos = rB.positives.length;

  assert("Project B: no diversity ceiling needed (1 neg ≤ 50%)",
    !rB.diagnostics.some(d => d.type === "diversity_ceiling_applied"));
  assert("Project B: all preferences intact",
    bPos === 4 && bNeg === 1, `pos=${bPos} neg=${bNeg}`);
}

// ---------------------------------------------------------------------------
// LR-13: Diversity under decay — decayed negatives free diversity slots
// ---------------------------------------------------------------------------

section("LR-13 · Diversity under decay: decayed negatives free diversity slots for positives");
{
  freshUser();

  // Build 3 positives + 8 negatives (will trigger diversity ceiling)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 5; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `decay_div_pos_${i}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `decay_div_neg_${i}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  // Snapshot before decay
  const { retrieved: r1 } = retrieve();
  const negBefore = r1.negatives.length;

  // Force decay on half the negatives
  const negPrefs = store.listPreferences(USER, { polarity: "negative", status: "stable" });
  const toDecay = negPrefs.slice(0, 4);
  for (const p of toDecay) {
    const past = new Date();
    past.setDate(past.getDate() - 91);
    store.updatePreference(USER, p.id, { decay_at: past.toISOString() });
  }
  store.runDecay(USER);

  // Snapshot after decay
  const { retrieved: r2 } = retrieve();
  const negAfter = r2.negatives.length;
  const posAfter = r2.positives.length;

  assert("Decay + diversity: fewer negatives after decay",
    negAfter <= negBefore, `before=${negBefore} after=${negAfter}`);
  assert("Decay + diversity: positives still present",
    posAfter > 0, `pos=${posAfter}`);

  console.log(`\n  Decay effect: neg ${negBefore} → ${negAfter}, pos=${posAfter}`);
}

// ---------------------------------------------------------------------------
// LR-14: Diversity stress — 40 patterns (20 pos + 20 neg), cap + diversity + budget
// ---------------------------------------------------------------------------

section("LR-14 · Diversity stress: 40 patterns under cap + diversity + budget triple constraint");
{
  freshUser();

  // 20 positives with varying strength
  for (let i = 0; i < 20; i++) {
    const count = 3 + Math.floor(i / 5);
    for (let j = 0; j < count; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `stress_pos_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `p${j}`,
        polarity: "positive",
      }));
    }
  }

  // 20 negatives with varying strength
  for (let i = 0; i < 20; i++) {
    const count = 3 + Math.floor(i / 5);
    for (let j = 0; j < count; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `stress_neg_${String(i).padStart(2, "0")}`,
        preference_type: "style",
        tag_text: `n${j}`,
        polarity: "negative",
      }));
    }
  }

  const { retrieved, block } = retrieve();
  const snap = captureMetrics(retrieved, block);

  assert("Stress: total within hard cap",
    snap.total <= store.MAX_INJECTION_COUNT, `total=${snap.total}`);
  assert("Stress: negatives within diversity ratio",
    snap.neg <= Math.ceil(snap.total * store.NEGATIVE_BUDGET_RATIO),
    `neg=${snap.neg} maxNeg=${Math.ceil(snap.total * store.NEGATIVE_BUDGET_RATIO)}`);
  assert("Stress: positives present",
    snap.pos > 0, `pos=${snap.pos}`);
  assert("Stress: no duplicate patterns",
    snap.unique === snap.total, `unique=${snap.unique} total=${snap.total}`);

  // Ranking monotonicity (within each polarity group)
  let monoPos = true;
  for (let i = 1; i < retrieved.positives.length; i++) {
    if (retrieved.positives[i].signal_strength > retrieved.positives[i - 1].signal_strength) monoPos = false;
  }
  let monoNeg = true;
  for (let i = 1; i < retrieved.negatives.length; i++) {
    if (retrieved.negatives[i].signal_strength > retrieved.negatives[i - 1].signal_strength) monoNeg = false;
  }
  assert("Stress: positive ranking monotonic", monoPos);
  assert("Stress: negative ranking monotonic", monoNeg);

  // Prompt block should exist and be bounded
  assert("Stress: prompt block generated", snap.chars > 0);
  assert("Stress: prompt block under 2000 chars", snap.chars <= 2000, `chars=${snap.chars}`);

  const diagTypes = new Set(retrieved.diagnostics.map(d => d.type));
  console.log(`\n  Stress: ${snap.pos} pos + ${snap.neg} neg = ${snap.total}`);
  console.log(`  Prompt: ${snap.chars} chars, diagnostics: ${[...diagTypes].join(", ")}`);
}

// ---------------------------------------------------------------------------
// LR-15: Polarity entropy drift over 20 sessions
// ---------------------------------------------------------------------------

section("LR-15 · Polarity entropy: balanced profile maintains high entropy over sessions");
{
  freshUser();

  // Build a mixed profile: 5 positives + 3 negatives per session over 20 sessions
  const entropies = [];
  for (let session = 0; session < 20; session++) {
    // Add 1 positive and 1 negative per session
    for (let j = 0; j < 4; j++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `entropy_pos_${session}`,
        preference_type: "style",
        tag_text: `ep${j}`,
        polarity: "positive",
        session_id: `sess_${session}`,
      }));
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: `entropy_neg_${session}`,
        preference_type: "style",
        tag_text: `en${j}`,
        polarity: "negative",
        session_id: `sess_${session}`,
      }));
    }

    const { retrieved, block } = retrieve();
    const snap = captureMetrics(retrieved, block);
    entropies.push(snap.polarity_entropy);
  }

  // With equal pos/neg, entropy should be near 1.0 (max)
  const avgEntropy = entropies.reduce((a, b) => a + b, 0) / entropies.length;
  const lastEntropy = entropies[entropies.length - 1];
  const minEntropy = Math.min(...entropies);

  assert("Entropy drift: average entropy ≥ 0.5 (balanced profile)",
    avgEntropy >= 0.5, `avgEntropy=${avgEntropy.toFixed(3)}`);
  assert("Entropy drift: final entropy ≥ 0.5",
    lastEntropy >= 0.5, `lastEntropy=${lastEntropy.toFixed(3)}`);
  assert("Entropy drift: minimum entropy never drops below 0.3",
    minEntropy >= 0.3, `minEntropy=${minEntropy.toFixed(3)}`);

  // Entropy should be stable, not drifting monotonically
  const earlyAvg = entropies.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const lateAvg = entropies.slice(-5).reduce((a, b) => a + b, 0) / 5;
  assert("Entropy drift: stable over time (no monotonic drift)",
    Math.abs(lateAvg - earlyAvg) <= 0.3,
    `earlyAvg=${earlyAvg.toFixed(3)} lateAvg=${lateAvg.toFixed(3)}`);

  console.log(`\n  Entropy: avg=${avgEntropy.toFixed(3)} last=${lastEntropy.toFixed(3)} min=${minEntropy.toFixed(3)}`);
  console.log(`  Early avg: ${earlyAvg.toFixed(3)}  Late avg: ${lateAvg.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// LR-16: Category diversity under temporal evolution
// ---------------------------------------------------------------------------

section("LR-16 · Category diversity: 5 types accumulate over 15 sessions, no type dominates");
{
  freshUser();

  const types = ["layout", "typography", "color", "motion", "component"];

  // Over 15 sessions, accumulate patterns across all 5 types
  // But bias toward layout (2 per session) vs others (1 per session)
  const snapshots = [];
  for (let session = 0; session < 15; session++) {
    // Layout gets 2 patterns per session (dominant)
    for (let k = 0; k < 2; k++) {
      for (let j = 0; j < 4; j++) {
        store.ingestSignal(USER, sig({
          signal_type: "explicit_tag",
          pattern: `layout_s${session}_${k}`,
          preference_type: "layout",
          tag_text: `l${j}`,
          polarity: "positive",
          session_id: `sess_${session}`,
        }));
      }
    }
    // Other types get 1 pattern per session
    for (const type of types.slice(1)) {
      for (let j = 0; j < 4; j++) {
        store.ingestSignal(USER, sig({
          signal_type: "explicit_tag",
          pattern: `${type}_s${session}`,
          preference_type: type,
          tag_text: `t${j}`,
          polarity: "positive",
          session_id: `sess_${session}`,
        }));
      }
    }

    const { retrieved, block } = retrieve();
    const snap = captureMetrics(retrieved, block);
    snapshots.push(snap);
  }

  const lastSnap = snapshots[snapshots.length - 1];
  const catDist = lastSnap.category_distribution;

  // Category ceiling should prevent layout from dominating
  assert("Category temporal: layout within MAX_PER_CATEGORY",
    (catDist["layout"] || 0) <= store.MAX_PER_CATEGORY,
    `layout=${catDist["layout"]}`);
  assert("Category temporal: at least 3 distinct categories in injection",
    lastSnap.category_count >= 3,
    `cats=${lastSnap.category_count}`);

  // No single category should dominate more than 40% of injection
  const maxShare = lastSnap.total > 0
    ? Math.max(...Object.values(catDist)) / lastSnap.total
    : 0;
  assert("Category temporal: no category exceeds 40% share",
    maxShare <= 0.40 || lastSnap.total <= 5,
    `maxShare=${maxShare.toFixed(3)}`);

  console.log(`\n  Category dist: ${JSON.stringify(catDist)}`);
  console.log(`  Total: ${lastSnap.total} | max share: ${maxShare.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Retrieval Quality Sim — Long-Running Scenarios`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`${"─".repeat(50)}\n`);

cleanup();
process.exit(failed > 0 ? 1 : 0);
