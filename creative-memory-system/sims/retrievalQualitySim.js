/**
 * Creative Memory System — Retrieval Quality Simulator
 * Validates retrieval behavior quality before integration.
 *
 * Covers:
 *   - injection density analysis
 *   - conflict rate detection
 *   - stale preference injection prevention
 *   - prompt block size budgeting
 *   - top-N ceiling behavior
 *   - hysteresis band stability
 *   - retrieval flicker risk
 *   - project override conflict resolution
 *   - ranking quality under mixed signals
 *   - sparse vs dense user profiles
 *
 * Run: node retrievalQualitySim.js
 */

const path = require("path");
const fs = require("fs");

process.env.MEMORY_STORAGE_ROOT = path.join(__dirname, ".test-retrieval");

const store = require("../preferenceStore");

// ---------------------------------------------------------------------------
// Metrics engine
// ---------------------------------------------------------------------------

class RetrievalMetrics {
  constructor(label) {
    this.label = label;
    this.snapshots = [];
  }

  capture(retrieved, promptBlock, context = {}) {
    const allPrefs = [...retrieved.positives, ...retrieved.negatives];
    const snap = {
      ts: Date.now(),
      context,
      total_injected: allPrefs.length,
      positive_count: retrieved.positives.length,
      negative_count: retrieved.negatives.length,
      override_count: retrieved.projectOverrides.length,
      prompt_block_chars: promptBlock.length,
      prompt_block_lines: promptBlock ? promptBlock.split("\n").length : 0,
      strengths: allPrefs.map(p => p.signal_strength),
      confidences: allPrefs.map(p => p.confidence),
      patterns: allPrefs.map(p => p.pattern),
      polarities: allPrefs.map(p => p.polarity),
      statuses: allPrefs.map(p => p.polarity_status),
    };

    // Derived metrics
    snap.injection_density = snap.total_injected;
    snap.avg_strength = snap.strengths.length
      ? snap.strengths.reduce((a, b) => a + b, 0) / snap.strengths.length
      : 0;
    snap.min_strength = snap.strengths.length ? Math.min(...snap.strengths) : 0;
    snap.max_strength = snap.strengths.length ? Math.max(...snap.strengths) : 0;
    snap.strength_spread = snap.max_strength - snap.min_strength;
    snap.high_confidence_ratio = snap.confidences.filter(c => c === "high").length / Math.max(snap.total_injected, 1);
    snap.unique_patterns = new Set(snap.patterns).size;
    snap.duplicate_patterns = snap.patterns.length - snap.unique_patterns;

    // Conflict: same pattern appears with both polarities
    const patternPolarityMap = {};
    allPrefs.forEach(p => {
      if (!patternPolarityMap[p.pattern]) patternPolarityMap[p.pattern] = new Set();
      patternPolarityMap[p.pattern].add(p.polarity);
    });
    snap.conflicting_patterns = Object.values(patternPolarityMap)
      .filter(s => s.size > 1).length;
    snap.conflict_rate = snap.conflicting_patterns / Math.max(snap.unique_patterns, 1);

    // Polarity entropy: H = -p*log2(p) - (1-p)*log2(1-p)
    // where p = fraction of injected items that are positive
    // Max (1.0) at p=0.5, min (0) when all same polarity
    if (snap.total_injected > 0) {
      const p = snap.positive_count / snap.total_injected;
      if (p === 0 || p === 1) {
        snap.polarity_entropy = 0;
      } else {
        snap.polarity_entropy = -(p * Math.log2(p)) - ((1 - p) * Math.log2(1 - p));
      }
    } else {
      snap.polarity_entropy = 0;
    }

    // Category distribution: count per preference_type
    const catDist = {};
    allPrefs.forEach(p => {
      catDist[p.preference_type] = (catDist[p.preference_type] || 0) + 1;
    });
    snap.category_distribution = catDist;
    snap.category_count = Object.keys(catDist).length;
    snap.max_category_share = snap.total_injected > 0
      ? Math.max(...Object.values(catDist)) / snap.total_injected
      : 0;

    this.snapshots.push(snap);
    return snap;
  }

  flickerScore() {
    if (this.snapshots.length < 2) return { score: 0, detail: "insufficient data" };
    let flickers = 0;
    for (let i = 1; i < this.snapshots.length; i++) {
      const prev = new Set(this.snapshots[i - 1].patterns);
      const curr = new Set(this.snapshots[i].patterns);
      const added = [...curr].filter(p => !prev.has(p)).length;
      const removed = [...prev].filter(p => !curr.has(p)).length;
      flickers += added + removed;
    }
    const maxPossible = this.snapshots.reduce((s, snap) => s + snap.total_injected, 0);
    return {
      score: maxPossible > 0 ? flickers / maxPossible : 0,
      total_flickers: flickers,
      snapshots_compared: this.snapshots.length - 1,
    };
  }

  rankingQuality() {
    if (!this.snapshots.length) return { monotonic: true, violations: 0 };
    const last = this.snapshots[this.snapshots.length - 1];
    let violations = 0;
    for (let i = 1; i < last.strengths.length; i++) {
      if (last.strengths[i] > last.strengths[i - 1]) violations++;
    }
    return { monotonic: violations === 0, violations };
  }

  polarityEntropy() {
    if (!this.snapshots.length) return { current: 0, mean: 0, min: 0, max: 0, trend: "none" };
    const entropies = this.snapshots.map(s => s.polarity_entropy);
    const current = entropies[entropies.length - 1];
    const mean = entropies.reduce((a, b) => a + b, 0) / entropies.length;
    const min = Math.min(...entropies);
    const max = Math.max(...entropies);

    // Trend: compare first third vs last third average
    let trend = "stable";
    if (entropies.length >= 6) {
      const third = Math.floor(entropies.length / 3);
      const earlyAvg = entropies.slice(0, third).reduce((a, b) => a + b, 0) / third;
      const lateAvg = entropies.slice(-third).reduce((a, b) => a + b, 0) / third;
      if (lateAvg > earlyAvg + 0.1) trend = "diversifying";
      else if (lateAvg < earlyAvg - 0.1) trend = "polarizing";
    }

    return { current, mean, min, max, trend };
  }

  summary() {
    const last = this.snapshots[this.snapshots.length - 1] || {};
    const flicker = this.flickerScore();
    const ranking = this.rankingQuality();
    const entropy = this.polarityEntropy();
    return {
      label: this.label,
      total_snapshots: this.snapshots.length,
      last_injection_density: last.total_injected || 0,
      last_prompt_chars: last.prompt_block_chars || 0,
      last_conflict_rate: last.conflict_rate || 0,
      last_avg_strength: last.avg_strength || 0,
      last_duplicate_patterns: last.duplicate_patterns || 0,
      flicker_score: flicker.score,
      ranking_monotonic: ranking.monotonic,
      ranking_violations: ranking.violations,
      polarity_entropy: entropy.current,
      polarity_entropy_trend: entropy.trend,
      category_count: last.category_count || 0,
      max_category_share: last.max_category_share || 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const USER = "usr_rq_sim";
let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) { console.log(`  ✓ ${label}`); passed++; }
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

function retrieve(context = {}) {
  const r = store.retrieveForInjection(USER, context);
  const block = store.buildPromptBlock(r, context.project_id);
  return { retrieved: r, block };
}

// ---------------------------------------------------------------------------
// Scenario 1: Empty profile — zero injection
// ---------------------------------------------------------------------------

section("RQ-01 · Empty profile produces zero injection");
{
  cleanup();
  freshUser();
  const m = new RetrievalMetrics("empty_profile");
  const { retrieved, block } = retrieve();
  const snap = m.capture(retrieved, block);

  assert("Zero preferences injected", snap.total_injected === 0);
  assert("Empty prompt block", snap.prompt_block_chars === 0);
  assert("No conflicts", snap.conflict_rate === 0);
}

// ---------------------------------------------------------------------------
// Scenario 2: Sub-threshold preferences excluded
// ---------------------------------------------------------------------------

section("RQ-02 · Sub-threshold preferences excluded from injection");
{
  freshUser();
  // Single weak signal: 0.15 / 2.0 = 0.075 — well below 0.40 threshold
  store.ingestSignal(USER, sig({ signal_type: "repeated_acceptance" }));
  const m = new RetrievalMetrics("sub_threshold");
  const { retrieved, block } = retrieve();
  const snap = m.capture(retrieved, block);

  assert("Sub-threshold record not injected", snap.total_injected === 0);
  assert("Empty prompt block for weak signal", snap.prompt_block_chars === 0);
}

// ---------------------------------------------------------------------------
// Scenario 3: Threshold crossing — injection gate
// ---------------------------------------------------------------------------

section("RQ-03 · Preference crosses threshold → enters injection set");
{
  freshUser();
  const m = new RetrievalMetrics("threshold_crossing");

  // Accumulate to just below threshold
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t1" }));
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t2" }));
  // 2 × 0.30/2.0 = 0.30 — below 0.40

  let { retrieved: r1, block: b1 } = retrieve();
  let s1 = m.capture(r1, b1, { phase: "below_threshold" });
  assert("Below threshold: not injected", s1.total_injected === 0);

  // Push above threshold
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t3" }));
  // 3 × 0.15 = 0.45 — above 0.40

  let { retrieved: r2, block: b2 } = retrieve();
  let s2 = m.capture(r2, b2, { phase: "above_threshold" });
  assert("Above threshold: injected", s2.total_injected === 1);
  assert("Prompt block now non-empty", s2.prompt_block_chars > 0);
}

// ---------------------------------------------------------------------------
// Scenario 4: Top-N ranking — descending strength order
// ---------------------------------------------------------------------------

section("RQ-04 · Top-N ranking: preferences sorted by descending strength");
{
  freshUser();

  const patterns = [
    { pattern: "serif_headlines", count: 6 },   // strongest
    { pattern: "warm_palette", count: 4 },   // mid
    { pattern: "airy_spacing", count: 3 },   // at threshold edge
  ];

  for (const { pattern, count } of patterns) {
    for (let i = 0; i < count; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern,
        preference_type: "style",
        tag_text: `${pattern}_${i}`,
      }));
    }
  }

  const m = new RetrievalMetrics("top_n_ranking");
  const { retrieved, block } = retrieve();
  const snap = m.capture(retrieved, block);
  const ranking = m.rankingQuality();

  assert("Multiple preferences injected", snap.total_injected >= 2);
  assert("Ranking is monotonically descending", ranking.monotonic,
    `violations=${ranking.violations}`);
  assert("Strongest pattern first",
    retrieved.positives[0]?.pattern === "serif_headlines",
    `first=${retrieved.positives[0]?.pattern}`);
}

// ---------------------------------------------------------------------------
// Scenario 5: Strength ceiling — 1.0 cap under saturation
// ---------------------------------------------------------------------------

section("RQ-05 · Signal saturation: strength capped at 1.0");
{
  freshUser();

  for (let i = 0; i < 20; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      tag_text: `sat_${i}`,
    }));
  }

  const { retrieved, block } = retrieve();
  const m = new RetrievalMetrics("saturation");
  const snap = m.capture(retrieved, block);

  assert("Injected at ceiling", snap.total_injected === 1);
  assert("Strength capped at 1.0", snap.max_strength <= 1.0);
  assert("Confidence is high at ceiling",
    retrieved.positives[0]?.confidence === "high");
}

// ---------------------------------------------------------------------------
// Scenario 6: Hysteresis stability — repeated retrieval consistency
// ---------------------------------------------------------------------------

section("RQ-06 · Hysteresis stability: repeated retrieval produces identical sets");
{
  freshUser();

  // Build a stable multi-preference profile
  const stablePatterns = ["serif_headlines", "warm_palette", "airy_spacing", "round_corners"];
  for (const pat of stablePatterns) {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `${pat}_${i}`,
      }));
    }
  }

  const m = new RetrievalMetrics("hysteresis");
  // Take 10 consecutive snapshots without any state change
  for (let i = 0; i < 10; i++) {
    const { retrieved, block } = retrieve();
    m.capture(retrieved, block, { iteration: i });
  }

  const flicker = m.flickerScore();
  assert("Zero flicker over 10 identical retrievals", flicker.score === 0,
    `score=${flicker.score} flickers=${flicker.total_flickers}`);

  // Verify all snapshots have identical pattern sets
  const first = new Set(m.snapshots[0].patterns);
  const allIdentical = m.snapshots.every(s =>
    s.patterns.length === first.size && s.patterns.every(p => first.has(p))
  );
  assert("All 10 snapshots return identical pattern sets", allIdentical);
}

// ---------------------------------------------------------------------------
// Scenario 7: Flicker detection — boundary oscillation
// ---------------------------------------------------------------------------

section("RQ-07 · Flicker detection: preference near threshold boundary");
{
  freshUser();

  const m = new RetrievalMetrics("flicker_boundary");

  // Build a preference to just above threshold
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t1" }));
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t2" }));
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t3" }));
  // strength = 0.45, confidence = medium → injectable

  const { retrieved: r1, block: b1 } = retrieve();
  m.capture(r1, b1, { phase: "above" });
  assert("Initially injectable", m.snapshots[0].total_injected === 1);

  // Force decay to push below threshold
  const prefs = store.listPreferences(USER, { polarity: "positive" });
  if (prefs[0]) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    store.updatePreference(USER, prefs[0].id, {
      decay_at: yesterday.toISOString(),
    });
    store.runDecay(USER);
  }

  const { retrieved: r2, block: b2 } = retrieve();
  m.capture(r2, b2, { phase: "after_decay" });

  // Re-boost with another signal
  store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: "t4" }));
  const { retrieved: r3, block: b3 } = retrieve();
  m.capture(r3, b3, { phase: "re_boosted" });

  const flicker = m.flickerScore();
  assert("Flicker detected during boundary oscillation", flicker.total_flickers > 0,
    `flickers=${flicker.total_flickers}`);
  // This is expected behavior — the metric detects it so we can monitor
}

// ---------------------------------------------------------------------------
// Scenario 8: Prompt pollution — under_review / archived excluded
// ---------------------------------------------------------------------------

section("RQ-08 · Prompt pollution: under_review and archived records excluded");
{
  freshUser();

  // Build strong positive
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({ signal_type: "explicit_tag", tag_text: `t${i}` }));
  }

  // Push into under_review via 4 reversal signals
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      polarity: "negative",
      tag_text: "no",
      session_id: `sess_rev_${i}`,
    }));
  }

  const { retrieved, block } = retrieve();
  const m = new RetrievalMetrics("pollution_check");
  const snap = m.capture(retrieved, block);

  assert("under_review records excluded from injection", snap.total_injected === 0);
  assert("No archived/under_review status leaks",
    snap.statuses.every(s => s === "stable"));
  assert("Empty prompt block (no pollution)", snap.prompt_block_chars === 0);
}

// ---------------------------------------------------------------------------
// Scenario 9: Project override conflict resolution
// ---------------------------------------------------------------------------

section("RQ-09 · Project override shadows global for same pattern");
{
  freshUser();

  // Build injectable global positive
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "airy_spacing",
      preference_type: "layout",
      tag_text: `g${i}`,
      scope: "global",
    }));
  }

  // Build injectable project negative for same pattern
  for (let i = 0; i < 5; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "airy_spacing",
      preference_type: "layout",
      polarity: "negative",
      tag_text: "dense here",
      scope: "project",
      project_id: "proj_fin",
    }));
  }

  const m = new RetrievalMetrics("override_conflict");

  // Retrieve with project context
  const { retrieved: rProj, block: bProj } = retrieve({ project_id: "proj_fin" });
  const sProj = m.capture(rProj, bProj, { scope: "project" });

  assert("No duplicate patterns in project retrieval", sProj.duplicate_patterns === 0);
  assert("Zero conflict rate (project shadows global)", sProj.conflict_rate === 0);

  // Retrieve without project context — only global
  const { retrieved: rGlob, block: bGlob } = retrieve({});
  const sGlob = m.capture(rGlob, bGlob, { scope: "global_only" });

  assert("Global-only retrieval returns global preference",
    rGlob.positives.some(p => p.pattern === "airy_spacing"));
}

// ---------------------------------------------------------------------------
// Scenario 10: Prompt block size budget
// ---------------------------------------------------------------------------

section("RQ-10 · Prompt block character budget analysis");
{
  freshUser();

  const manyPatterns = [
    "serif_headlines", "warm_palette", "airy_spacing", "round_corners",
    "subtle_shadows", "muted_gradients", "monospace_code", "large_body_text",
    "dark_backgrounds", "accent_coral", "thin_borders", "generous_whitespace",
  ];

  for (const pat of manyPatterns) {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        tag_text: `${pat}_${i}`,
      }));
    }
  }

  // Add some negatives
  const negPatterns = ["neon_palette", "heavy_animation", "cramped_grid"];
  for (const pat of negPatterns) {
    for (let i = 0; i < 5; i++) {
      store.ingestSignal(USER, sig({
        signal_type: "explicit_tag",
        pattern: pat,
        preference_type: "style",
        polarity: "negative",
        tag_text: `avoid_${pat}`,
      }));
    }
  }

  const m = new RetrievalMetrics("prompt_budget");
  const { retrieved, block } = retrieve();
  const snap = m.capture(retrieved, block);

  // Budget guardrails
  const MAX_PROMPT_CHARS = 2000;
  assert(`Prompt block under ${MAX_PROMPT_CHARS} chars`,
    snap.prompt_block_chars <= MAX_PROMPT_CHARS,
    `actual=${snap.prompt_block_chars}`);
  assert("Prompt block has both Prefer and Avoid lines",
    block.includes("Prefer") && block.includes("Avoid"));
  assert("Injection density matches pattern count",
    snap.total_injected === manyPatterns.length + negPatterns.length,
    `injected=${snap.total_injected} expected=${manyPatterns.length + negPatterns.length}`);

  console.log(`\n  Prompt budget: ${snap.prompt_block_chars} chars, ${snap.prompt_block_lines} lines`);
  console.log(`  Injection density: ${snap.total_injected} preferences`);
}

// ---------------------------------------------------------------------------
// Scenario 11: Sparse user — minimal signal profile
// ---------------------------------------------------------------------------

section("RQ-11 · Sparse user: few signals, clean retrieval");
{
  freshUser();

  // Only 1 strong preference
  for (let i = 0; i < 4; i++) {
    store.ingestSignal(USER, sig({
      signal_type: "explicit_tag",
      pattern: "serif_headlines",
      preference_type: "typography",
      tag_text: `t${i}`,
    }));
  }

  const m = new RetrievalMetrics("sparse_user");
  const { retrieved, block } = retrieve();
  const snap = m.capture(retrieved, block);

  assert("Sparse user: exactly 1 preference injected", snap.total_injected === 1);
  assert("No conflicts in sparse profile", snap.conflict_rate === 0);
  // 4 × explicit_tag → strength 0.60 → medium confidence (injectable)
  const allMediumPlus = snap.confidences.every(c => c === "medium" || c === "high");
  assert("Sparse user: all injected prefs are medium+ confidence",
    allMediumPlus, `confidences=${snap.confidences.join(",")}`);


  const ranking = m.rankingQuality();
  assert("Trivially monotonic (single item)", ranking.monotonic);
}

// ---------------------------------------------------------------------------
// Scenario 12: Dense user — many diverse preferences
// ---------------------------------------------------------------------------

section("RQ-12 · Dense user: high diversity, ranking stability");
{
  freshUser();

  const categories = {
    typography: ["serif_headlines", "monospace_code", "geometric_sans"],
    color: ["warm_palette", "muted_earth", "high_contrast"],
    layout: ["airy_spacing", "generous_whitespace", "asymmetric_grid"],
    motion: ["subtle_easing", "spring_physics"],
    border: ["round_corners", "thin_borders"],
  };

  // Build each with different strength levels
  const signalCounts = [7, 6, 5, 4, 4, 3, 3, 3, 3, 3, 3, 3];
  let idx = 0;

  for (const [type, patterns] of Object.entries(categories)) {
    for (const pat of patterns) {
      const count = signalCounts[idx % signalCounts.length];
      for (let i = 0; i < count; i++) {
        store.ingestSignal(USER, sig({
          signal_type: "explicit_tag",
          pattern: pat,
          preference_type: type,
          tag_text: `${pat}_${i}`,
        }));
      }
      idx++;
    }
  }

  const m = new RetrievalMetrics("dense_user");
  const { retrieved, block } = retrieve();
  const snap = m.capture(retrieved, block);
  const ranking = m.rankingQuality();

  assert("Dense user: many preferences injected",
    snap.total_injected >= 10, `count=${snap.total_injected}`);
  assert("Ranking monotonically descending", ranking.monotonic,
    `violations=${ranking.violations}`);
  assert("No conflicting patterns in dense profile", snap.conflict_rate === 0);
  assert("Strength spread shows differentiation", snap.strength_spread > 0,
    `spread=${snap.strength_spread.toFixed(3)}`);
  assert("All unique patterns (no duplicates)", snap.duplicate_patterns === 0);

  console.log(`\n  Dense profile: ${snap.total_injected} prefs, spread=${snap.strength_spread.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"─".repeat(50)}`);
console.log(`Retrieval Quality Sim — Core Scenarios`);
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`${"─".repeat(50)}\n`);

cleanup();
process.exit(failed > 0 ? 1 : 0);
