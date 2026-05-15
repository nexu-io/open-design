/**
 * Creative Memory System — Extraction Event Adapter
 *
 * Defines the contract between the generation pipeline and the preference
 * store. Each handler receives a pipeline event, maps it to a signal object,
 * and calls ingestSignal. Nothing else.
 *
 * The handler signatures and signal mapping are fully specified, but the
 * pipeline hookpoints (where these handlers are invoked from inside the
 * generation pipeline) are pending pipeline-team confirmation. See
 * docs/open-questions.md questions #1–#4.
 */

import { ingestSignal, logRefinement } from "./preferenceStore.js";
import type { Polarity, SignalType } from "./types.js";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

/**
 * Pipeline-classified pattern attached to an artifact at generation time.
 * In production this will be populated by a lightweight classifier or by
 * metadata the generation pipeline attaches to the artifact. The adapter
 * itself does not derive these from raw artifacts (open question #4).
 */
export interface ArtifactSignal {
  preference_type: string;
  pattern: string;
}

export interface ArtifactMeta {
  signals: ArtifactSignal[];
}

interface BaseEvent {
  user_id: string;
  artifact_id: string;
  session_id: string;
  project_id: string | null;
  timestamp: string;
  artifact_meta: ArtifactMeta;
}

export interface GenerationAcceptedEvent extends BaseEvent {}

export interface ArtifactEditedAndSavedEvent extends BaseEvent {
  /** Provisional shape; pending pipeline-team confirmation (open question #2). */
  diff?: Record<string, unknown>;
}

export interface ExplicitTagAppliedEvent extends BaseEvent {
  tag_text: string;
}

export interface ThumbsRatedEvent extends BaseEvent {
  rating: "up" | "down";
}

export interface GenerationAbandonedEvent extends BaseEvent {}

export interface RevertAfterEditEvent extends BaseEvent {}

// ---------------------------------------------------------------------------
// Signal classifier (stub)
// ---------------------------------------------------------------------------

/**
 * Classify an artifact event into (preference_type, pattern) pairs.
 *
 * Returns an array because one event can produce multiple signals — e.g.
 * accepting a layout also signals typography if both changed.
 *
 * In production, `artifact_meta` is populated by the generation pipeline
 * upstream of this module. The classifier here is intentionally a
 * pass-through: actual extraction of (type, pattern) from rendered artifacts
 * is upstream concern (open question #4).
 *
 * Throws if `artifactMeta` or its `signals` array is missing. A broken
 * pipeline payload is exactly the wiring bug the adapter should surface;
 * silently turning it into `[]` would hide failures and disable learning
 * for that event with no observable signal.
 */
export function classifyArtifact(artifactMeta: ArtifactMeta): ArtifactSignal[] {
  if (artifactMeta == null) {
    throw new Error(
      "classifyArtifact: artifact_meta is required. " +
        "A null or undefined payload indicates a pipeline wiring bug; the adapter " +
        "fails fast rather than silently dropping the signal.",
    );
  }
  if (!Array.isArray(artifactMeta.signals)) {
    throw new Error(
      "classifyArtifact: artifact_meta.signals must be an array. " +
        `Got ${typeof artifactMeta.signals}. ` +
        "Upstream classification is missing or malformed.",
    );
  }
  // Validate each signal entry: both pattern and preference_type must be
  // non-empty strings. A payload like { signals: [{}] } would otherwise
  // forward undefined values into ingestSignal and persist corrupt records.
  for (let i = 0; i < artifactMeta.signals.length; i++) {
    const entry = artifactMeta.signals[i];
    if (
      !entry ||
      typeof entry.pattern !== "string" ||
      entry.pattern.length === 0 ||
      typeof entry.preference_type !== "string" ||
      entry.preference_type.length === 0
    ) {
      throw new Error(
        `classifyArtifact: signals[${i}] is malformed. ` +
          `Each entry must have non-empty string "pattern" and "preference_type". ` +
          `Got: ${JSON.stringify(entry)}`,
      );
    }
  }
  return artifactMeta.signals;
}

// ---------------------------------------------------------------------------
// Polarity map: which tag strings signal positive vs negative intent
// ---------------------------------------------------------------------------

export const TAG_POLARITY: Readonly<Record<string, Polarity>> = Object.freeze({
  "save this direction": "positive",
  "love this": "positive",
  "keep this style": "positive",
  "too noisy": "negative",
  "too crowded": "negative",
  "not this": "negative",
  "wrong direction": "negative",
  "too minimal": "negative",
  "too heavy": "negative",
});

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function dispatchSignals(
  event: BaseEvent,
  signal_type: SignalType,
  polarity: Polarity,
  tag_text: string | null,
): void {
  const signals = classifyArtifact(event.artifact_meta);
  const scope: "global" | "project" = event.project_id ? "project" : "global";

  for (const { preference_type, pattern } of signals) {
    ingestSignal(event.user_id, {
      signal_type,
      pattern,
      preference_type,
      polarity,
      tag_text,
      scope,
      project_id: event.project_id || null,
      artifact_id: event.artifact_id,
      session_id: event.session_id,
      timestamp: event.timestamp,
    });
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Fired when the user accepts a generated artifact without editing.
 * Trigger: explicit "Use this" / "Keep" action, not view/hover/expand.
 *
 * Pipeline hookpoint: TBD (open question #1).
 */
export function onGenerationAccepted(event: GenerationAcceptedEvent): void {
  dispatchSignals(event, "repeated_acceptance", "positive", null);
}

/**
 * Fired when the user edits a generated artifact and saves the result.
 * Edits signal refinement — the user found the direction useful but adjusted
 * it. Logs the refinement diff if available.
 *
 * Pipeline hookpoint: TBD (open question #1).
 * Diff shape: TBD (open question #2).
 */
export function onArtifactEditedAndSaved(event: ArtifactEditedAndSavedEvent): void {
  dispatchSignals(event, "manual_refinement", "positive", null);

  if (event.diff) {
    logRefinement(event.user_id, {
      artifact_id: event.artifact_id,
      project_id: event.project_id ?? null,
      diff: event.diff,
    });
  }
}

/**
 * Fired when the user applies an inline tag during or after generation.
 * Tags are the strongest signal type — explicit user intent.
 */
export function onExplicitTagApplied(event: ExplicitTagAppliedEvent): void {
  const tagLower = event.tag_text.toLowerCase().trim();
  const polarity: Polarity = TAG_POLARITY[tagLower] ?? "positive";
  dispatchSignals(event, "explicit_tag", polarity, event.tag_text);
}

/**
 * Fired when the user gives a thumbs up or thumbs down on a generation.
 * Weaker than explicit tags — captures sentiment without specificity.
 */
export function onThumbsRated(event: ThumbsRatedEvent): void {
  const signal_type: SignalType = event.rating === "up" ? "thumbs_up" : "thumbs_down";
  const polarity: Polarity = event.rating === "up" ? "positive" : "negative";
  dispatchSignals(event, signal_type, polarity, null);
}

/**
 * Fired when the user views a generation and takes no action. Weak negative
 * signal; does NOT fire on view or hover alone. Requires the pipeline to
 * distinguish "viewed and abandoned" from "viewed and not yet decided".
 *
 * Pipeline hookpoint: TBD (open question #1).
 */
export function onGenerationAbandoned(event: GenerationAbandonedEvent): void {
  dispatchSignals(event, "abandoned_generation", "negative", null);
}

/**
 * Fired when the user edits an artifact and reverts to the original.
 * Strong signal — user tried the edit, decided it was worse, returned to
 * the generated output.
 */
export function onRevertAfterEdit(event: RevertAfterEditEvent): void {
  dispatchSignals(event, "revert_after_edit", "positive", null);
}
