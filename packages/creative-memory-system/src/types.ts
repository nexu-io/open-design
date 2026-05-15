/**
 * Creative Memory System — type definitions.
 * Public + internal shapes used by preferenceStore and the extraction adapter.
 */

// ---------------------------------------------------------------------------
// Signal vocabulary
// ---------------------------------------------------------------------------

export type SignalType =
  | "explicit_tag"
  | "revert_after_edit"
  | "manual_refinement"
  | "repeated_acceptance"
  | "thumbs_up"
  | "thumbs_down"
  | "single_rejection"
  | "abandoned_generation";

export type Polarity = "positive" | "negative";

export type Confidence = "low" | "medium" | "high";

export type PolarityStatus = "stable" | "under_review" | "archived";

export type Scope = "global" | "project";

// ---------------------------------------------------------------------------
// Preference record
// ---------------------------------------------------------------------------

export interface Preference {
  id: string;
  preference_type: string;
  pattern: string;
  polarity: Polarity;
  signal_strength: number;
  confidence: Confidence;
  sources: string[];
  accept_count: number;
  reject_count: number;
  explicit_tags: string[];
  last_seen: string;
  decay_at: string;
  scope: string;
  reversal_signals: number;
  reversal_first_seen: string | null;
  polarity_status: PolarityStatus;
  shadow_of: string | null;
}

// Internal-only field added during retrieval and stripped before return.
export interface RankedPreference extends Preference {
  _effective_priority?: number;
}

// ---------------------------------------------------------------------------
// Storage file shape
// ---------------------------------------------------------------------------

export interface RefinementLogEntry {
  id: string;
  artifact_id: string | null;
  project_id: string | null;
  timestamp: string;
  diff: Record<string, unknown>;
}

export interface PreferenceStoreFile {
  schema_version: string;
  user_id: string;
  memory_enabled: boolean;
  global_preferences: Preference[];
  project_overrides: Record<string, Preference[]>;
  refinement_log: RefinementLogEntry[];
  last_updated: string;
}

// ---------------------------------------------------------------------------
// Signal payload (input to ingestSignal)
// ---------------------------------------------------------------------------

export interface Signal {
  signal_type: SignalType;
  pattern: string;
  preference_type: string;
  polarity: Polarity;
  tag_text: string | null;
  scope: Scope;
  project_id: string | null;
  artifact_id: string | null;
  session_id: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

export interface ProjectOverrideSuppressionDiagnostic {
  type: "project_override_suppression";
  suppressed_pattern: string;
  suppressed_polarity: Polarity;
  suppressed_strength: number;
  override_polarity: Polarity | "unknown";
  override_strength: number;
  project_id: string;
  trace: string;
}

export interface HardCapAppliedDiagnostic {
  type: "hard_cap_applied";
  total_eligible: number;
  cap: number;
  dropped: number;
  trace: string;
}

export interface DiversityCeilingAppliedDiagnostic {
  type: "diversity_ceiling_applied";
  negative_count_before: number;
  negative_count_after: number;
  max_negative_slots: number;
  ratio: number;
  trimmed_patterns: string[];
  trace: string;
}

export interface DiversityBackfillDiagnostic {
  type: "diversity_backfill";
  backfilled_count: number;
  backfilled_patterns: string[];
  trace: string;
}

export interface CategoryCeilingAppliedDiagnostic {
  type: "category_ceiling_applied";
  categories_trimmed: { category: string; before: number; after: number }[];
  total_trimmed: number;
  trimmed_patterns: string[];
  max_per_category: number;
  trace: string;
}

export interface CategoryBackfillDiagnostic {
  type: "category_backfill";
  backfilled_count: number;
  backfilled_types: string[];
  trace: string;
}

export interface TokenBudgetExceededDiagnostic {
  type: "token_budget_exceeded";
  pattern: string;
  estimated_tokens_at_cut: number;
  budget: number;
  trace: string;
}

export type Diagnostic =
  | ProjectOverrideSuppressionDiagnostic
  | HardCapAppliedDiagnostic
  | DiversityCeilingAppliedDiagnostic
  | DiversityBackfillDiagnostic
  | CategoryCeilingAppliedDiagnostic
  | CategoryBackfillDiagnostic
  | TokenBudgetExceededDiagnostic;

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface RetrievalContext {
  project_id?: string;
  preference_types?: string[];
}

export interface RetrievalResult {
  positives: Preference[];
  negatives: Preference[];
  projectOverrides: Preference[];
  diagnostics: Diagnostic[];
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export interface CreatePreferenceInput {
  preference_type: string;
  pattern: string;
  polarity?: Polarity;
  signal_strength?: number;
  sources?: string[];
  accept_count?: number;
  reject_count?: number;
  explicit_tags?: string[];
  scope?: Scope;
  project_id?: string | null;
  shadow_of?: string | null;
}

export interface ListPreferencesOptions {
  scope?: "all" | "global" | `project:${string}`;
  polarity?: Polarity | "all";
  minStrength?: number;
  status?: PolarityStatus | "all";
}

export interface ResetMemoryOptions {
  scope?: "all" | "global" | `project:${string}`;
}

export interface DecayResult {
  decayed: number;
  archived: number;
}

export interface RefinementInput {
  artifact_id?: string | null;
  project_id?: string | null;
  diff?: Record<string, unknown>;
}
