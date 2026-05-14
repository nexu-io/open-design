/**
 * Creative Memory System — Extraction Event Adapter
 * Phase 1 · Event handler stubs
 *
 * This module defines the contract between the generation pipeline and the
 * preference store. It is a stub: the handler signatures and signal mapping
 * are fully specified, but the pipeline hookpoints (where these are called)
 * are pending confirmation from the pipeline team (open question #1).
 *
 * Each handler receives a pipeline event, maps it to a signal object, and
 * calls store.ingestSignal. Nothing else.
 *
 * Run: node extractionAdapter.js  (runs self-test against mock events)
 */

const store = require("./preferenceStore");

// ---------------------------------------------------------------------------
// Signal classifier
// Derives preference_type and pattern from a generation event payload.
// In production this will call a lightweight classifier or use metadata
// attached to the artifact at generation time.
// ---------------------------------------------------------------------------

/**
 * Classify an artifact or edit event into (preference_type, pattern) pairs.
 *
 * Returns an array because one event can produce multiple signals —
 * e.g. accepting a layout also signals typography if both changed.
 *
 * @param {object} artifactMeta — metadata attached to the artifact at generation
 * @returns {{ preference_type: string, pattern: string }[]}
 *
 * STUB: In production, artifactMeta will be populated by the generation pipeline.
 * The classifier logic here is a placeholder that passes through whatever the
 * pipeline provides. The actual extraction of (type, pattern) from rendered
 * artifacts is a Phase 2 concern (aesthetic embeddings / screenshot analysis).
 */
function classifyArtifact(artifactMeta) {
  if (!artifactMeta || !artifactMeta.signals) return [];
  return artifactMeta.signals; // [{ preference_type, pattern }]
}

// ---------------------------------------------------------------------------
// Handler: generation_accepted
//
// Fired when the user accepts a generated artifact without editing.
// Trigger: user clicks "Use this" / "Keep" / closes the generation panel
// without discarding.
//
// NOT fired on: view, hover, expand, or abandon.
//
// Pipeline hookpoint: TBD — confirm with pipeline team (open question #1)
// ---------------------------------------------------------------------------

/**
 * @param {object} event
 * @param {string} event.user_id
 * @param {string} event.artifact_id
 * @param {string} event.session_id
 * @param {string} event.project_id        — null if outside a project
 * @param {string} event.timestamp         — ISO string
 * @param {object} event.artifact_meta     — { signals: [{ preference_type, pattern }] }
 * @param {string} [event.scope]           — "global" | "project" (default: "global")
 */
function onGenerationAccepted(event) {
  const signals = classifyArtifact(event.artifact_meta);
  const scope = event.project_id ? "project" : "global";

  for (const { preference_type, pattern } of signals) {
    store.ingestSignal(event.user_id, {
      signal_type: "repeated_acceptance",
      pattern,
      preference_type,
      polarity: "positive",
      tag_text: null,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler: artifact_edited_and_saved
//
// Fired when the user edits a generated artifact and saves the result.
// The edit is a signal of refinement — the user found the direction useful
// but adjusted it. This is a positive signal (manual_refinement) for the
// patterns present in the saved artifact, and optionally logs a refinement
// diff if before/after state is available.
//
// Pipeline hookpoint: TBD — confirm with pipeline team (open question #1)
// Diff shape: TBD — confirm with pipeline team (open question #2)
// ---------------------------------------------------------------------------

/**
 * @param {object} event
 * @param {string} event.user_id
 * @param {string} event.artifact_id
 * @param {string} event.session_id
 * @param {string} event.project_id
 * @param {string} event.timestamp
 * @param {object} event.artifact_meta     — signals for the SAVED (final) state
 * @param {object} [event.diff]            — { from: {key:val}, to: {key:val} } (optional, pending #2)
 */
function onArtifactEditedAndSaved(event) {
  const signals = classifyArtifact(event.artifact_meta);
  const scope = event.project_id ? "project" : "global";

  for (const { preference_type, pattern } of signals) {
    store.ingestSignal(event.user_id, {
      signal_type: "manual_refinement",
      pattern,
      preference_type,
      polarity: "positive",
      tag_text: null,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }

  // Log refinement diff if available (pending pipeline confirmation)
  if (event.diff) {
    store.logRefinement(event.user_id, {
      artifact_id: event.artifact_id,
      project_id: event.project_id || null,
      diff: event.diff,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler: explicit_tag_applied
//
// Fired when the user applies an inline tag during or after generation.
// Tags: "Too noisy", "Save this direction", "Not this", etc.
// These are the strongest signal — explicit user intent.
//
// Pipeline hookpoint: inline feedback UI → tag event
// ---------------------------------------------------------------------------

// Polarity map: which tags signal positive vs negative intent
const TAG_POLARITY = {
  "save this direction": "positive",
  "love this": "positive",
  "keep this style": "positive",
  "too noisy": "negative",
  "too crowded": "negative",
  "not this": "negative",
  "wrong direction": "negative",
  "too minimal": "negative",
  "too heavy": "negative",
};

/**
 * @param {object} event
 * @param {string} event.user_id
 * @param {string} event.artifact_id
 * @param {string} event.session_id
 * @param {string} event.project_id
 * @param {string} event.timestamp
 * @param {string} event.tag_text          — raw tag string from UI
 * @param {object} event.artifact_meta     — signals for the tagged artifact
 */
function onExplicitTagApplied(event) {
  const signals = classifyArtifact(event.artifact_meta);
  const scope = event.project_id ? "project" : "global";
  const tagLower = event.tag_text.toLowerCase().trim();
  const polarity = TAG_POLARITY[tagLower] || "positive"; // default positive if unknown

  for (const { preference_type, pattern } of signals) {
    store.ingestSignal(event.user_id, {
      signal_type: "explicit_tag",
      pattern,
      preference_type,
      polarity,
      tag_text: event.tag_text,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler: thumbs_rated
//
// Fired when the user gives a thumbs up or thumbs down on a generation.
// Weaker signal than explicit tags — captures general sentiment without
// specificity about what the user liked or disliked.
//
// Pipeline hookpoint: generation result UI → thumbs up/down buttons
// ---------------------------------------------------------------------------

/**
 * @param {object} event
 * @param {string} event.user_id
 * @param {string} event.artifact_id
 * @param {string} event.session_id
 * @param {string} event.project_id
 * @param {string} event.timestamp
 * @param {"up"|"down"} event.rating
 * @param {object} event.artifact_meta
 */
function onThumbsRated(event) {
  const signals = classifyArtifact(event.artifact_meta);
  const scope = event.project_id ? "project" : "global";
  const signal_type = event.rating === "up" ? "thumbs_up" : "thumbs_down";
  const polarity = event.rating === "up" ? "positive" : "negative";

  for (const { preference_type, pattern } of signals) {
    store.ingestSignal(event.user_id, {
      signal_type,
      pattern,
      preference_type,
      polarity,
      tag_text: null,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler: generation_abandoned
//
// Fired when the user views a generation and takes no action (closes,
// navigates away, or starts a new generation without accepting).
// Weak negative signal — does not fire on view or hover alone.
//
// Pipeline hookpoint: TBD — requires pipeline to distinguish "viewed and
// abandoned" from "viewed and not yet decided". Recommend a timeout-based
// approach (e.g. 30s of inactivity after view = abandon) or an explicit
// "discard" action.
// ---------------------------------------------------------------------------

/**
 * @param {object} event
 * @param {string} event.user_id
 * @param {string} event.artifact_id
 * @param {string} event.session_id
 * @param {string} event.project_id
 * @param {string} event.timestamp
 * @param {object} event.artifact_meta
 */
function onGenerationAbandoned(event) {
  const signals = classifyArtifact(event.artifact_meta);
  const scope = event.project_id ? "project" : "global";

  for (const { preference_type, pattern } of signals) {
    store.ingestSignal(event.user_id, {
      signal_type: "abandoned_generation",
      pattern,
      preference_type,
      polarity: "negative",
      tag_text: null,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Handler: revert_after_edit
//
// Fired when the user edits an artifact and then reverts to the original
// generated version. Strong signal — user tried the edit, decided it was
// worse, and returned to the generated output.
//
// Pipeline hookpoint: artifact edit history → revert action
// ---------------------------------------------------------------------------

/**
 * @param {object} event
 * @param {string} event.user_id
 * @param {string} event.artifact_id
 * @param {string} event.session_id
 * @param {string} event.project_id
 * @param {string} event.timestamp
 * @param {object} event.artifact_meta    — signals for the ORIGINAL (reverted-to) state
 */
function onRevertAfterEdit(event) {
  const signals = classifyArtifact(event.artifact_meta);
  const scope = event.project_id ? "project" : "global";

  for (const { preference_type, pattern } of signals) {
    store.ingestSignal(event.user_id, {
      signal_type: "revert_after_edit",
      pattern,
      preference_type,
      polarity: "positive", // reverted TO this — positive signal for it
      tag_text: null,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  onGenerationAccepted,
  onArtifactEditedAndSaved,
  onExplicitTagApplied,
  onThumbsRated,
  onGenerationAbandoned,
  onRevertAfterEdit,
  TAG_POLARITY,
};

// ---------------------------------------------------------------------------
// Self-test (run directly: node extractionAdapter.js)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const path = require("path");
  const fs = require("fs");

  process.env.MEMORY_STORAGE_ROOT = path.join(__dirname, ".test-adapter");
  const USER = "usr_adapter_test";

  let passed = 0; let failed = 0;
  function assert(label, condition, detail = "") {
    if (condition) { console.log(`  ✓ ${label}`); passed++; }
    else { console.error(`  ✗ ${label}${detail ? " — " + detail : ""}`); failed++; }
  }

  store.resetMemory(USER, { scope: "all" });

  const BASE_META = {
    signals: [
      { preference_type: "layout_density", pattern: "airy_spacing" },
      { preference_type: "typography", pattern: "serif_headlines" },
    ],
  };

  const baseEvent = {
    user_id: USER,
    artifact_id: "art_adapter_001",
    session_id: "sess_adapter_001",
    project_id: null,
    timestamp: new Date().toISOString(),
    artifact_meta: BASE_META,
  };

  console.log("\n── Adapter: generation_accepted ──");
  onGenerationAccepted(baseEvent);
  {
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    assert("Creates records for all classified patterns", prefs.length === 2);
    assert("signal_type is repeated_acceptance",
      prefs.every((p) => p.sources.includes("repeated_acceptance"))
    );
  }

  console.log("\n── Adapter: artifact_edited_and_saved ──");
  onArtifactEditedAndSaved({
    ...baseEvent,
    diff: { from: { layout_density: "dense" }, to: { layout_density: "airy" } },
  });
  {
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    assert("manual_refinement signal accumulated",
      prefs.some((p) => p.sources.includes("manual_refinement"))
    );
  }

  console.log("\n── Adapter: explicit_tag_applied (positive) ──");
  onExplicitTagApplied({ ...baseEvent, tag_text: "Save this direction" });
  {
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    assert("explicit_tag signal on positive tag",
      prefs.some((p) => p.sources.includes("explicit_tag"))
    );
  }

  console.log("\n── Adapter: explicit_tag_applied (negative) ──");
  onExplicitTagApplied({
    ...baseEvent,
    artifact_id: "art_adapter_002",
    artifact_meta: { signals: [{ preference_type: "layout_density", pattern: "crowded_layout" }] },
    tag_text: "Too noisy",
  });
  {
    const negs = store.listPreferences(USER, { polarity: "negative" });
    assert("Negative tag creates negative record", negs.length >= 1);
    assert("Tag text stored on negative record",
      negs.some((p) => p.explicit_tags.includes("Too noisy"))
    );
  }

  console.log("\n── Adapter: thumbs_rated ──");
  onThumbsRated({ ...baseEvent, rating: "up" });
  {
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    assert("thumbs_up signal accumulated",
      prefs.some((p) => p.sources.includes("thumbs_up"))
    );
  }
  onThumbsRated({
    ...baseEvent,
    artifact_meta: { signals: [{ preference_type: "motion", pattern: "heavy_animation" }] },
    rating: "down",
  });
  {
    const negs = store.listPreferences(USER, { polarity: "negative" });
    assert("thumbs_down creates negative record",
      negs.some((p) => p.pattern === "heavy_animation")
    );
  }

  console.log("\n── Adapter: generation_abandoned ──");
  onGenerationAbandoned({
    ...baseEvent,
    artifact_meta: { signals: [{ preference_type: "color", pattern: "neon_palette" }] },
  });
  {
    const negs = store.listPreferences(USER, { polarity: "negative" });
    assert("Abandoned generation creates weak negative",
      negs.some((p) => p.pattern === "neon_palette" && p.sources.includes("abandoned_generation"))
    );
  }

  console.log("\n── Adapter: revert_after_edit ──");
  onRevertAfterEdit(baseEvent);
  {
    const prefs = store.listPreferences(USER, { polarity: "positive" });
    assert("Revert creates positive signal for reverted-to state",
      prefs.some((p) => p.sources.includes("revert_after_edit"))
    );
  }

  console.log("\n── Adapter: project-scoped event ──");
  store.resetMemory(USER, { scope: "all" });
  onGenerationAccepted({
    ...baseEvent,
    project_id: "proj_fintech_01",
    artifact_meta: { signals: [{ preference_type: "layout_density", pattern: "dense_grid" }] },
  });
  {
    const prefs = store.listPreferences(USER, { scope: "project:proj_fintech_01" });
    assert("Project-scoped event writes to project override",
      prefs.some((p) => p.pattern === "dense_grid")
    );
    const global = store.listPreferences(USER, { scope: "global" });
    assert("Project-scoped event does not pollute global preferences",
      !global.some((p) => p.pattern === "dense_grid")
    );
  }

  console.log(`\n${"─".repeat(40)}`);
  console.log(`Adapter tests passed: ${passed}`);
  console.log(`Adapter tests failed: ${failed}`);
  console.log(`${"─".repeat(40)}\n`);

  const dir = path.join(__dirname, ".test-adapter");
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  process.exit(failed > 0 ? 1 : 0);
}
