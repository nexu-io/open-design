/**
 * Creative Memory System — Preference Store
 * Phase 1 · JSON Storage Layer
 *
 * Self-contained module. No external dependencies.
 * Node.js fs/path only.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STORAGE_ROOT = process.env.MEMORY_STORAGE_ROOT || path.join(__dirname, "memory");
const NORMALIZER = 2.0;
const DECAY_DAYS = 90;
const ARCHIVE_DAYS = 180;
const INJECTION_THRESHOLD = 0.40;
const TOKEN_BUDGET = 200;
const MAX_INJECTION_COUNT = 20;
const NEGATIVE_PRIORITY_MULTIPLIER = 1.2;
const NEGATIVE_BUDGET_RATIO = 0.50;
const MIN_NEG_FLOOR = 2;
const MAX_PER_CATEGORY = 3;
const CHARS_PER_TOKEN = 4;

const SIGNAL_WEIGHTS = {
  explicit_tag: 0.30,
  revert_after_edit: 0.25,
  manual_refinement: 0.20,
  repeated_acceptance: 0.15,
  thumbs_up: 0.10,
  thumbs_down: -0.10,
  single_rejection: -0.10,
  abandoned_generation: -0.02,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function uid(prefix) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}_${s}`;
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function now() {
  return new Date().toISOString();
}

function addDays(isoString, days) {
  const d = new Date(isoString);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24);
}

function calcConfidence(strength) {
  if (strength < 0.35) return "low";
  if (strength <= 0.65) return "medium";
  return "high";
}

function dropConfidence(current) {
  if (current === "high") return "medium";
  if (current === "medium") return "low";
  return "low";
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function userFilePath(userId) {
  return path.join(STORAGE_ROOT, userId, "preferences.json");
}

function loadFile(userId) {
  const fp = userFilePath(userId);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf8"));
}

function saveFile(userId, data) {
  const fp = userFilePath(userId);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  data.last_updated = now();
  fs.writeFileSync(fp, JSON.stringify(data, null, 2), "utf8");
}

function initFile(userId) {
  return {
    schema_version: "1.0",
    user_id: userId,
    memory_enabled: true,
    global_preferences: [],
    project_overrides: {},
    refinement_log: [],
    last_updated: now(),
  };
}

function ensureFile(userId) {
  let data = loadFile(userId);
  if (!data) {
    data = initFile(userId);
    saveFile(userId, data);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getAllPrefs(data) {
  const all = [...data.global_preferences];
  for (const prefs of Object.values(data.project_overrides)) all.push(...prefs);
  return all;
}

function getPrefArray(data, scope, projectId) {
  if (scope === "global") return data.global_preferences;
  if (scope === "project" && projectId) {
    if (!data.project_overrides[projectId]) data.project_overrides[projectId] = [];
    return data.project_overrides[projectId];
  }
  throw new Error(`Invalid scope: ${scope}. Use "global" or "project" with a projectId.`);
}

function findPrefById(data, prefId) {
  for (const pref of data.global_preferences) {
    if (pref.id === prefId) return { pref, array: data.global_preferences };
  }
  for (const [, arr] of Object.entries(data.project_overrides)) {
    const pref = arr.find((p) => p.id === prefId);
    if (pref) return { pref, array: arr };
  }
  return null;
}

function findExistingPref(array, pattern, preferenceType, polarity) {
  return array.find(
    (p) => p.pattern === pattern && p.preference_type === preferenceType && p.polarity === polarity
  ) || null;
}

function recalcStrength(pref) {
  // Re-derive signal_strength from raw counts and sources
  // weighted_sum is tracked implicitly via signal_strength * normalizer
  // On direct ingestion we mutate signal_strength directly with weights, so
  // this helper just re-clamps and re-derives confidence.
  pref.signal_strength = clamp(pref.signal_strength, 0.0, 1.0);
  pref.confidence = calcConfidence(pref.signal_strength);
  return pref;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new preference record.
 * @param {string} userId
 * @param {object} record — partial record; id, last_seen, decay_at auto-set
 * @returns {object} created record
 */
function createPreference(userId, record) {
  const data = ensureFile(userId);
  const t = now();
  const pref = {
    id: uid("pref"),
    preference_type: record.preference_type,
    pattern: record.pattern,
    polarity: record.polarity || "positive",
    signal_strength: clamp(record.signal_strength || 0, 0, 1),
    confidence: "low",
    sources: record.sources || [],
    accept_count: record.accept_count || 0,
    reject_count: record.reject_count || 0,
    explicit_tags: record.explicit_tags || [],
    last_seen: t,
    decay_at: addDays(t, DECAY_DAYS),
    scope: record.scope || "global",
    reversal_signals: 0,
    reversal_first_seen: null,
    polarity_status: "stable",
    shadow_of: record.shadow_of || null,
  };
  pref.confidence = calcConfidence(pref.signal_strength);

  const projectId = record.project_id || null;
  const array = getPrefArray(data, pref.scope === "global" ? "global" : "project", projectId);
  array.push(pref);
  saveFile(userId, data);
  return pref;
}

/**
 * Read a single preference by id.
 * @returns {object|null}
 */
function readPreference(userId, prefId) {
  const data = loadFile(userId);
  if (!data) return null;
  const result = findPrefById(data, prefId);
  return result ? result.pref : null;
}

/**
 * Update specific fields on a preference record.
 * Does NOT recalculate signal strength — use ingestSignal for that.
 * @returns {object|null} updated record
 */
function updatePreference(userId, prefId, fields) {
  const data = ensureFile(userId);
  const result = findPrefById(data, prefId);
  if (!result) return null;

  Object.assign(result.pref, fields);
  recalcStrength(result.pref);
  saveFile(userId, data);
  return result.pref;
}

/**
 * Hard delete a preference record (user "forget this" action).
 * @returns {boolean}
 */
function deletePreference(userId, prefId) {
  const data = ensureFile(userId);
  const result = findPrefById(data, prefId);
  if (!result) return false;

  const idx = result.array.indexOf(result.pref);
  result.array.splice(idx, 1);
  saveFile(userId, data);
  return true;
}

/**
 * List preferences with optional filters.
 * @param {object} options
 * @param {string} [options.scope]       "global" | "project:{id}" | "all" (default "all")
 * @param {string} [options.polarity]    "positive" | "negative" | "all" (default "all")
 * @param {number} [options.minStrength] (default 0)
 * @param {string} [options.status]      "stable" | "under_review" | "archived" | "all" (default "all")
 * @returns {object[]}
 */
function listPreferences(userId, options = {}) {
  const data = loadFile(userId);
  if (!data) return [];

  const {
    scope = "all",
    polarity = "all",
    minStrength = 0,
    status = "all",
  } = options;

  let prefs;
  if (scope === "all") {
    prefs = getAllPrefs(data);
  } else if (scope === "global") {
    prefs = [...data.global_preferences];
  } else if (scope.startsWith("project:")) {
    const projectId = scope.split(":")[1];
    prefs = [...(data.project_overrides[projectId] || [])];
  } else {
    prefs = getAllPrefs(data);
  }

  return prefs
    .filter((p) => polarity === "all" || p.polarity === polarity)
    .filter((p) => p.signal_strength >= minStrength)
    .filter((p) => status === "all" || p.polarity_status === status)
    .sort((a, b) => b.signal_strength - a.signal_strength);
}

/**
 * Reset memory for a user.
 * @param {object} options
 * @param {string} [options.scope] "global" | "project:{id}" | "all" (default "all")
 */
function resetMemory(userId, options = {}) {
  const data = ensureFile(userId);
  const { scope = "all" } = options;

  if (scope === "all" || scope === "global") {
    data.global_preferences = [];
  }
  if (scope === "all") {
    data.project_overrides = {};
    data.refinement_log = [];
    data.memory_enabled = true; // restore on full reset
  } else if (scope.startsWith("project:")) {
    const projectId = scope.split(":")[1];
    data.project_overrides[projectId] = [];
  }

  saveFile(userId, data);
}

// ---------------------------------------------------------------------------
// Signal ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a new signal and update or create the relevant preference record.
 *
 * Signal shape:
 * {
 *   signal_type:     string   (key from SIGNAL_WEIGHTS)
 *   pattern:         string
 *   preference_type: string
 *   polarity:        "positive" | "negative"
 *   tag_text:        string|null
 *   scope:           "global" | "project"
 *   project_id:      string|null
 *   artifact_id:     string|null
 *   session_id:      string
 *   timestamp:       ISO string
 * }
 *
 * @returns {object} the updated or created preference record
 */
function ingestSignal(userId, signal) {
  const data = ensureFile(userId);
  if (!data.memory_enabled) return null;

  const weight = SIGNAL_WEIGHTS[signal.signal_type];
  if (weight === undefined) throw new Error(`Unknown signal_type: ${signal.signal_type}`);

  const array = getPrefArray(data, signal.scope, signal.project_id);
  const t = signal.timestamp || now();

  // Look for existing record matching this pattern + polarity
  let pref = findExistingPref(array, signal.pattern, signal.preference_type, signal.polarity);

  // Look for existing record with OPPOSITE polarity (potential contradiction)
  const opposite = signal.polarity === "positive" ? "negative" : "positive";
  const oppositePref = findExistingPref(array, signal.pattern, signal.preference_type, opposite);

  if (oppositePref && oppositePref.polarity_status === "stable") {
    // This signal contradicts an existing stable record — apply reversal logic
    _applyReversal(data, array, oppositePref, signal, weight, t);
    saveFile(userId, data);
    return oppositePref;
  }

  if (!pref) {
    // New preference — create it with initial strength from this signal
    const initialStrength = clamp(Math.abs(weight) / NORMALIZER, 0, 1);
    pref = {
      id: uid("pref"),
      preference_type: signal.preference_type,
      pattern: signal.pattern,
      polarity: signal.polarity,
      signal_strength: initialStrength,
      confidence: calcConfidence(initialStrength),
      sources: [signal.signal_type],
      accept_count: signal.polarity === "positive" ? 1 : 0,
      reject_count: signal.polarity === "negative" ? 1 : 0,
      explicit_tags: signal.tag_text ? [signal.tag_text] : [],
      last_seen: t,
      decay_at: addDays(t, DECAY_DAYS),
      scope: signal.scope === "project" ? `project:${signal.project_id}` : "global",
      reversal_signals: 0,
      reversal_first_seen: null,
      polarity_status: "stable",
      shadow_of: null,
    };
    array.push(pref);
  } else {
    // Matching polarity — apply positive accumulation
    const rawAddition = Math.abs(weight) / NORMALIZER;
    pref.signal_strength = clamp(pref.signal_strength + rawAddition, 0, 1);
    pref.confidence = calcConfidence(pref.signal_strength);

    if (!pref.sources.includes(signal.signal_type)) pref.sources.push(signal.signal_type);
    if (signal.tag_text && !pref.explicit_tags.includes(signal.tag_text)) {
      pref.explicit_tags.push(signal.tag_text);
    }
    if (signal.polarity === "positive") pref.accept_count++;
    else pref.reject_count++;

    pref.last_seen = t;
    pref.decay_at = addDays(t, DECAY_DAYS);

    // If this record is a shadow and has reached medium+ confidence → promote it
    if (pref.shadow_of && (pref.confidence === "medium" || pref.confidence === "high")) {
      const originalResult = findPrefById(data, pref.shadow_of);
      if (originalResult) {
        originalResult.pref.polarity_status = "archived";
      }
      pref.shadow_of = null; // promoted to full active record
    }
  }

  saveFile(userId, data);
  return pref;
}

/**
 * Apply reversal logic when a contradictory signal arrives for an existing
 * stable preference. The ladder is intentionally graduated:
 *
 *   1 signal:  noise guard  — no change at all
 *   2 signals: strength × 0.80, status remains "stable"
 *   3 signals: strength × 0.60, confidence drops one rung
 *   4+ signals: strength reduced by weight × multiplier, confidence forced
 *               to "low", status flips to "under_review", and a SHADOW record
 *               of opposite polarity is created (or accumulated on, if one
 *               already exists). When a shadow reaches medium confidence it
 *               promotes to a full record and the original is archived.
 *
 * Why graduated. A naive last-write-wins or instant-flip strategy produces
 * flicker on every disagreement. The noise guard tolerates one off-day click;
 * the multiplier ramps so a *pattern* of contradictions decisively breaks the
 * preference instead of nibbling at it forever.
 *
 * Why shadows. They decouple "this preference is contested" from "this is the
 * new preference". Without shadows, contested preferences either flicker in
 * the prompt or vanish entirely with no path back if the user changes their
 * mind again.
 */
function _applyReversal(data, array, pref, signal, weight, t) {
  pref.reversal_signals = (pref.reversal_signals || 0) + 1;
  if (!pref.reversal_first_seen) pref.reversal_first_seen = t;

  const rs = pref.reversal_signals;

  // Determine multiplier
  let multiplier = 1.0;
  if (rs === 2) multiplier = 1.5;
  if (rs >= 3) multiplier = 2.0;

  const penalty = Math.abs(weight) * multiplier;

  // Apply confidence drop rules
  if (rs === 1) {
    // Noise guard — no change to signal_strength or confidence
  } else if (rs === 2) {
    pref.signal_strength = clamp(pref.signal_strength * 0.80, 0, 1);
    // confidence held
  } else if (rs === 3) {
    pref.signal_strength = clamp(pref.signal_strength * 0.60, 0, 1);
    pref.confidence = dropConfidence(pref.confidence);
  } else {
    // 4+ signals across 3+ sessions
    pref.signal_strength = clamp(pref.signal_strength - penalty / NORMALIZER, 0, 1);
    pref.confidence = "low";
    pref.polarity_status = "under_review";

    // Create shadow record if not already exists
    const shadowPolarity = pref.polarity === "positive" ? "negative" : "positive";
    const alreadyHasShadow = array.some(
      (p) => p.shadow_of === pref.id && p.polarity === shadowPolarity
    );

    if (!alreadyHasShadow) {
      const shadowStrength = Math.abs(weight) / NORMALIZER;
      const shadow = {
        id: uid("pref"),
        preference_type: pref.preference_type,
        pattern: pref.pattern,
        polarity: shadowPolarity,
        signal_strength: shadowStrength,
        confidence: calcConfidence(shadowStrength),
        sources: [signal.signal_type],
        accept_count: shadowPolarity === "positive" ? 1 : 0,
        reject_count: shadowPolarity === "negative" ? 1 : 0,
        explicit_tags: signal.tag_text ? [signal.tag_text] : [],
        last_seen: t,
        decay_at: addDays(t, DECAY_DAYS),
        scope: pref.scope,
        reversal_signals: 0,
        reversal_first_seen: null,
        polarity_status: "stable",
        shadow_of: pref.id,
      };
      array.push(shadow);
    } else {
      // Accumulate signal on existing shadow
      const shadow = array.find((p) => p.shadow_of === pref.id && p.polarity === shadowPolarity);
      if (shadow) {
        shadow.signal_strength = clamp(
          shadow.signal_strength + Math.abs(weight) / NORMALIZER,
          0, 1
        );
        shadow.confidence = calcConfidence(shadow.signal_strength);
        shadow.last_seen = t;
        shadow.decay_at = addDays(t, DECAY_DAYS);

        // If shadow reaches medium confidence → promote, archive original
        if (shadow.confidence === "medium" || shadow.confidence === "high") {
          pref.polarity_status = "archived";
          shadow.shadow_of = null; // promoted to full record
        }
      }
    }
  }

  pref.last_seen = t;
}

// ---------------------------------------------------------------------------
// Decay runner
// ---------------------------------------------------------------------------

/**
 * Run decay pass for a user. Call on session start or scheduled daily job.
 * @returns {{ decayed: number, archived: number }}
 */
function runDecay(userId) {
  const data = loadFile(userId);
  if (!data) return { decayed: 0, archived: 0 };

  let decayed = 0;
  let archived = 0;
  const n = now();

  function processArray(arr) {
    for (const pref of arr) {
      if (pref.polarity_status === "archived") continue;

      const daysSinceDecay = daysBetween(pref.decay_at, n);

      if (daysSinceDecay >= DECAY_DAYS) {
        // 180+ days since last signal — archive
        pref.polarity_status = "archived";
        archived++;
      } else if (daysSinceDecay >= 0) {
        // 90–180 days — apply decay
        pref.signal_strength = clamp(pref.signal_strength * 0.70, 0, 1);
        pref.confidence = dropConfidence(pref.confidence);
        pref.decay_at = addDays(n, DECAY_DAYS);
        decayed++;
      }
    }
  }

  processArray(data.global_preferences);
  for (const arr of Object.values(data.project_overrides)) processArray(arr);

  saveFile(userId, data);
  return { decayed, archived };
}

// ---------------------------------------------------------------------------
// Retrieval & Prompt Block Builder
// ---------------------------------------------------------------------------

/**
 * Retrieve preferences for prompt injection at generation time.
 *
 * Runs eleven stages in fixed order. The order is load-bearing — see
 * docs/retrieval-pipeline.md for the rationale behind each step.
 *
 *   1.  Load + memory-disabled gate
 *   2.  Project-override merge          → diagnostic: project_override_suppression
 *   3.  Lifecycle filter                (threshold, status, confidence, type)
 *   4.  Effective-priority scoring      (negatives × NEGATIVE_PRIORITY_MULTIPLIER)
 *   5.  Ranking                         (descending priority)
 *   6.  Hard-cap enforcement            → diagnostic: hard_cap_applied
 *   7.  Polarity diversity ceiling      → diagnostic: diversity_ceiling_applied
 *   8.  Polarity backfill               → diagnostic: diversity_backfill
 *   9.  Category diversity ceiling      → diagnostic: category_ceiling_applied
 *   10. Category backfill               → diagnostic: category_backfill
 *   11. Token-budget enforcement        → diagnostic: token_budget_exceeded
 *
 * @param {string} userId
 * @param {object} context
 * @param {string} [context.project_id]
 * @param {string[]} [context.preference_types]  filter by category; omit for all
 * @returns {{ positives: object[], negatives: object[], projectOverrides: object[], diagnostics: object[] }}
 */
function retrieveForInjection(userId, context = {}) {
  const data = loadFile(userId);
  if (!data || !data.memory_enabled) {
    return { positives: [], negatives: [], projectOverrides: [], diagnostics: [] };
  }

  const { project_id, preference_types } = context;
  const diagnostics = [];

  // Merge global + project, project wins on pattern conflicts
  let prefs = [...data.global_preferences];
  let projectPrefs = [];

  if (project_id && data.project_overrides[project_id]) {
    projectPrefs = data.project_overrides[project_id];
    const projectPatterns = new Set(projectPrefs.map((p) => p.pattern));

    // Conflict diagnostics: record which globals were suppressed
    for (const gp of prefs) {
      if (projectPatterns.has(gp.pattern)) {
        const override = projectPrefs.find((pp) => pp.pattern === gp.pattern);
        diagnostics.push({
          type: "project_override_suppression",
          suppressed_pattern: gp.pattern,
          suppressed_polarity: gp.polarity,
          suppressed_strength: gp.signal_strength,
          override_polarity: override ? override.polarity : "unknown",
          override_strength: override ? override.signal_strength : 0,
          project_id,
          trace: `${project_id} override ${gp.pattern} active — global ${gp.pattern} (${gp.polarity}, ${gp.signal_strength.toFixed(2)}) suppressed for this generation`,
        });
      }
    }

    prefs = prefs.filter((p) => !projectPatterns.has(p.pattern));
    prefs = [...prefs, ...projectPrefs];
  }

  // Apply filters
  prefs = prefs
    .filter((p) => p.signal_strength >= INJECTION_THRESHOLD)
    .filter((p) => p.polarity_status === "stable")
    .filter((p) => p.confidence === "medium" || p.confidence === "high")
    .filter((p) =>
      !preference_types || preference_types.some((t) => p.preference_type.startsWith(t))
    );

  // Compute effective priority: negatives get a multiplier
  for (const p of prefs) {
    p._effective_priority = p.signal_strength *
      (p.polarity === "negative" ? NEGATIVE_PRIORITY_MULTIPLIER : 1.0);
  }

  // Sort by effective priority descending
  prefs.sort((a, b) => b._effective_priority - a._effective_priority);

  // Hard N cap
  let overflowPrefs = [];
  if (prefs.length > MAX_INJECTION_COUNT) {
    diagnostics.push({
      type: "hard_cap_applied",
      total_eligible: prefs.length,
      cap: MAX_INJECTION_COUNT,
      dropped: prefs.length - MAX_INJECTION_COUNT,
      trace: `Hard cap: ${prefs.length} eligible, capped to ${MAX_INJECTION_COUNT}`,
    });
    overflowPrefs = prefs.slice(MAX_INJECTION_COUNT);
    prefs = prefs.slice(0, MAX_INJECTION_COUNT);
  }

  // ---------------------------------------------------------------------------
  // Stage 7 — Polarity diversity ceiling (with iterative solver).
  //
  // Goal: prevent dense negative profiles from producing prompts that are
  // mostly avoidance directives. Cap negatives at NEGATIVE_BUDGET_RATIO of
  // the FINAL injection set.
  //
  // For ratio R: neg ≤ floor(R / (1-R) * pos)
  // At R = 0.50 this simplifies to: neg ≤ pos.
  //
  // The solver is iterative because trimming negatives may free slots that get
  // filled by positives from the hard-cap overflow (see Stage 8). Adding
  // positives changes finalPos, which changes the constraint, which may allow
  // more negatives back in. We descend from currentNegs.length until the
  // constraint holds against the *post-backfill* finalPos count.
  //
  // MIN_NEG_FLOOR ensures rejection-only users — who have no positive signals
  // yet — still get useful avoidance context injected. Without the floor,
  // early users would see entirely empty memory blocks despite having clear
  // negative preferences.
  // ---------------------------------------------------------------------------
  const currentNegs = prefs.filter(p => p.polarity === "negative");
  const currentPos = prefs.filter(p => p.polarity === "positive");
  const positiveOverflow = overflowPrefs.filter(p => p.polarity === "positive");

  if (currentNegs.length > 0) {
    // Find the maximum keepNegs that satisfies:
    //   keepNegs ≤ floor(R / (1-R) * finalPos)
    // where finalPos = currentPos + min(positiveOverflow, currentNegs - keepNegs)
    // Start from the minimum of currentNegs and hard-cap-based estimate, decrease until stable.
    const ratio = NEGATIVE_BUDGET_RATIO / (1 - NEGATIVE_BUDGET_RATIO);
    let keepNegs = currentNegs.length;
    for (let n = currentNegs.length; n >= MIN_NEG_FLOOR; n--) {
      const trimmed = currentNegs.length - n;
      const backfillable = Math.min(positiveOverflow.length, trimmed);
      const finalPos = currentPos.length + backfillable;
      if (n <= Math.floor(ratio * finalPos)) {
        keepNegs = n;
        break;
      }
      keepNegs = n;
    }
    // Apply MIN_NEG_FLOOR
    let maxNegSlots = Math.max(MIN_NEG_FLOOR, keepNegs);

    if (currentNegs.length > maxNegSlots) {
      // Sort negatives by effective priority descending (strongest survive)
      const negsSorted = [...currentNegs].sort(
        (a, b) => b._effective_priority - a._effective_priority
      );
      const trimmed = negsSorted.slice(maxNegSlots);
      const trimmedIds = new Set(trimmed.map(p => p.id));

      // Remove trimmed negatives from prefs
      prefs = prefs.filter(p => !trimmedIds.has(p.id));

      // Backfill freed slots with positive overflow (if any)
      let backfilledCount = 0;
      if (trimmed.length > 0 && positiveOverflow.length > 0) {
        const backfill = positiveOverflow.slice(0, trimmed.length);
        if (backfill.length > 0) {
          prefs.push(...backfill);
          backfilledCount = backfill.length;
          // Re-sort after backfill to maintain ranking order
          prefs.sort((a, b) => b._effective_priority - a._effective_priority);
          diagnostics.push({
            type: "diversity_backfill",
            backfilled_count: backfill.length,
            backfilled_patterns: backfill.map(p => p.pattern),
            trace: `Diversity backfill: ${backfill.length} positive(s) promoted from overflow`,
          });
        }
      }

      const finalTotal = prefs.length;
      diagnostics.push({
        type: "diversity_ceiling_applied",
        negative_count_before: currentNegs.length,
        negative_count_after: maxNegSlots,
        max_negative_slots: maxNegSlots,
        ratio: NEGATIVE_BUDGET_RATIO,
        trimmed_patterns: trimmed.map(p => p.pattern),
        trace: `Diversity ceiling: ${currentNegs.length} negatives capped to ${maxNegSlots} (${(NEGATIVE_BUDGET_RATIO * 100).toFixed(0)}% of ${finalTotal} slots)`,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 9 — Category diversity quota.
  //
  // Goal: prevent any single preference_type from monopolising the prompt.
  // A user who refines layout ten times and motion once would otherwise see
  // a layout-only memory block, even though motion is also above threshold.
  //
  // At most MAX_PER_CATEGORY patterns per preference_type; weakest within an
  // over-represented category are trimmed. Backfill (Stage 10) then promotes
  // patterns from under-represented types out of the hard-cap overflow pool.
  //
  // The "2+ distinct categories across prefs ∪ overflow" guard catches a
  // subtle case: when the hard cap displaces every minority-category record
  // into overflow, the ceiling must still fire so the backfill stage has a
  // chance to rescue them. Without checking the overflow set, single-category
  // injection sets would skip this stage even when the *user* has multiple
  // active categories.
  // ---------------------------------------------------------------------------
  const catCounts = {};
  for (const p of prefs) {
    catCounts[p.preference_type] = (catCounts[p.preference_type] || 0) + 1;
  }
  const allCatTypes = new Set(Object.keys(catCounts));
  for (const p of overflowPrefs) allCatTypes.add(p.preference_type);
  const totalDistinctCats = allCatTypes.size;
  const overRepresented = totalDistinctCats >= 2
    ? Object.entries(catCounts).filter(([, count]) => count > MAX_PER_CATEGORY)
    : [];

  if (overRepresented.length > 0) {
    const catTrimmed = [];

    for (const [cat, count] of overRepresented) {
      // Get all prefs of this category, sorted by effective priority
      const catPrefs = prefs
        .filter(p => p.preference_type === cat)
        .sort((a, b) => b._effective_priority - a._effective_priority);

      // Keep top MAX_PER_CATEGORY, trim the rest
      const excess = catPrefs.slice(MAX_PER_CATEGORY);
      catTrimmed.push(...excess);
    }

    if (catTrimmed.length > 0) {
      const trimmedIds = new Set(catTrimmed.map(p => p.id));
      prefs = prefs.filter(p => !trimmedIds.has(p.id));

      // Backfill from overflow: prefer patterns from under-represented categories
      const remainingCats = {};
      for (const p of prefs) {
        remainingCats[p.preference_type] = (remainingCats[p.preference_type] || 0) + 1;
      }
      const underRepTypes = new Set(
        Object.entries(remainingCats)
          .filter(([, c]) => c < MAX_PER_CATEGORY)
          .map(([t]) => t)
      );

      // Also consider categories not yet in the set at all
      const allOverflowTypes = new Set(overflowPrefs.map(p => p.preference_type));
      for (const t of allOverflowTypes) {
        if (!remainingCats[t]) underRepTypes.add(t);
      }

      if (overflowPrefs.length > 0 && underRepTypes.size > 0) {
        const catBackfill = overflowPrefs
          .filter(p => underRepTypes.has(p.preference_type))
          .slice(0, catTrimmed.length);
        if (catBackfill.length > 0) {
          prefs.push(...catBackfill);
          prefs.sort((a, b) => b._effective_priority - a._effective_priority);
          diagnostics.push({
            type: "category_backfill",
            backfilled_count: catBackfill.length,
            backfilled_types: [...new Set(catBackfill.map(p => p.preference_type))],
            trace: `Category backfill: ${catBackfill.length} pattern(s) from under-represented types`,
          });
        }
      }

      diagnostics.push({
        type: "category_ceiling_applied",
        categories_trimmed: overRepresented.map(([cat, count]) => ({
          category: cat,
          before: count,
          after: MAX_PER_CATEGORY,
        })),
        total_trimmed: catTrimmed.length,
        trimmed_patterns: catTrimmed.map(p => p.pattern),
        max_per_category: MAX_PER_CATEGORY,
        trace: `Category ceiling: ${catTrimmed.length} pattern(s) trimmed from ${overRepresented.map(([c]) => c).join(", ")} (max ${MAX_PER_CATEGORY}/type)`,
      });
    }
  }

  // Token-budget ceiling
  let tokenCount = 20; // overhead for [MEMORY CONTEXT] header + line prefixes
  const budgeted = [];
  for (const p of prefs) {
    const patternTokens = Math.ceil(p.pattern.length / CHARS_PER_TOKEN);
    const lineOverhead = 5; // "Prefer (high): " / "Avoid (medium): " prefix tokens
    const prefTokens = patternTokens + lineOverhead;
    if (tokenCount + prefTokens > TOKEN_BUDGET) {
      diagnostics.push({
        type: "token_budget_exceeded",
        pattern: p.pattern,
        estimated_tokens_at_cut: tokenCount,
        budget: TOKEN_BUDGET,
        trace: `Token budget: ${p.pattern} dropped at ${tokenCount}/${TOKEN_BUDGET} est. tokens`,
      });
      continue;
    }
    tokenCount += prefTokens;
    budgeted.push(p);
  }

  // Clean up internal priority field
  for (const p of budgeted) delete p._effective_priority;
  for (const p of prefs) delete p._effective_priority;

  const positives = budgeted.filter((p) => p.polarity === "positive")
    .sort((a, b) => b.signal_strength - a.signal_strength);

  const negatives = budgeted.filter((p) => p.polarity === "negative")
    .sort((a, b) => b.signal_strength - a.signal_strength);

  const overrides = projectPrefs.filter(
    (p) => p.signal_strength >= INJECTION_THRESHOLD && p.polarity_status === "stable"
  );

  return { positives, negatives, projectOverrides: overrides, diagnostics };
}

/**
 * Build the [MEMORY CONTEXT] prompt block from retrieved preferences.
 * @param {{ positives, negatives, projectOverrides }} retrieved
 * @param {string} [projectId]
 * @returns {string}
 */
function buildPromptBlock(retrieved, projectId) {
  const { positives, negatives, projectOverrides } = retrieved;
  if (!positives.length && !negatives.length) return "";

  const lines = ["[MEMORY CONTEXT]"];

  const highPos = positives.filter((p) => p.confidence === "high").map((p) => p.pattern);
  const medPos = positives.filter((p) => p.confidence === "medium").map((p) => p.pattern);
  const highNeg = negatives.filter((p) => p.confidence === "high").map((p) => p.pattern);
  const medNeg = negatives.filter((p) => p.confidence === "medium").map((p) => p.pattern);

  if (highPos.length) lines.push(`Prefer (high):    ${highPos.join(" · ")}`);
  if (medPos.length) lines.push(`Prefer (medium):  ${medPos.join(" · ")}`);
  if (highNeg.length) lines.push(`Avoid (high):     ${highNeg.join(" · ")}`);
  if (medNeg.length) lines.push(`Avoid (medium):   ${medNeg.join(" · ")}`);

  if (projectOverrides.length && projectId) {
    const overridePatterns = projectOverrides.map((p) => p.pattern).join(", ");
    lines.push(`Project override: ${overridePatterns} active (${projectId})`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Refinement log
// ---------------------------------------------------------------------------

/**
 * Append a refinement diff to the log.
 * Diff shape is provisional — pending dev confirmation (open question #2).
 *
 * @param {string} userId
 * @param {object} entry
 * @param {string} entry.artifact_id
 * @param {string} entry.project_id
 * @param {object} entry.diff  — { from: { key: val }, to: { key: val } }
 */
function logRefinement(userId, entry) {
  const data = ensureFile(userId);
  const record = {
    id: uid("ref"),
    artifact_id: entry.artifact_id || null,
    project_id: entry.project_id || null,
    timestamp: now(),
    diff: entry.diff || {},
  };
  data.refinement_log.push(record);
  saveFile(userId, data);
  return record;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // CRUD
  createPreference,
  readPreference,
  updatePreference,
  deletePreference,
  listPreferences,
  resetMemory,

  // Signal ingestion
  ingestSignal,

  // Decay
  runDecay,

  // Retrieval & prompt building
  retrieveForInjection,
  buildPromptBlock,

  // Refinement log
  logRefinement,

  // Constants (exported for test harness use)
  SIGNAL_WEIGHTS,
  NORMALIZER,
  INJECTION_THRESHOLD,
  DECAY_DAYS,
  ARCHIVE_DAYS,
  TOKEN_BUDGET,
  MAX_INJECTION_COUNT,
  NEGATIVE_PRIORITY_MULTIPLIER,
  NEGATIVE_BUDGET_RATIO,
  MIN_NEG_FLOOR,
  MAX_PER_CATEGORY,
  CHARS_PER_TOKEN,
};
