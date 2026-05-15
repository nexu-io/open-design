/**
 * Creative Memory System — public entry point.
 *
 * The host pipeline only needs:
 *   - retrieveForInjection / buildPromptBlock at generation time
 *   - ingestSignal (or the typed adapter handlers) on pipeline events
 *   - runDecay on session start or scheduled job
 *
 * Everything else is exposed for tests, host-level diagnostics, and tooling.
 */

export {
  // Constants
  ARCHIVE_DAYS,
  CHARS_PER_TOKEN,
  DECAY_DAYS,
  INJECTION_THRESHOLD,
  MAX_INJECTION_COUNT,
  MAX_PER_CATEGORY,
  MIN_NEG_FLOOR,
  NEGATIVE_BUDGET_RATIO,
  NEGATIVE_PRIORITY_MULTIPLIER,
  NORMALIZER,
  SIGNAL_WEIGHTS,
  STORAGE_ROOT,
  TOKEN_BUDGET,
  // Storage helpers
  getStorageRoot,
  // CRUD
  createPreference,
  deletePreference,
  listPreferences,
  readPreference,
  resetMemory,
  updatePreference,
  // Ingestion
  ingestSignal,
  // Decay
  runDecay,
  // Retrieval & prompt building
  buildPromptBlock,
  retrieveForInjection,
  // Refinement log
  logRefinement,
} from "./preferenceStore.js";

export type {
  Confidence,
  CreatePreferenceInput,
  DecayResult,
  Diagnostic,
  ListPreferencesOptions,
  Polarity,
  PolarityStatus,
  Preference,
  PreferenceStoreFile,
  RefinementInput,
  RefinementLogEntry,
  ResetMemoryOptions,
  RetrievalContext,
  RetrievalResult,
  Scope,
  Signal,
  SignalType,
  // Specific diagnostic event types
  CategoryBackfillDiagnostic,
  CategoryCeilingAppliedDiagnostic,
  DiversityBackfillDiagnostic,
  DiversityCeilingAppliedDiagnostic,
  HardCapAppliedDiagnostic,
  ProjectOverrideSuppressionDiagnostic,
  TokenBudgetExceededDiagnostic,
} from "./types.js";

export {
  TAG_POLARITY,
  classifyArtifact,
  onArtifactEditedAndSaved,
  onExplicitTagApplied,
  onGenerationAbandoned,
  onGenerationAccepted,
  onRevertAfterEdit,
  onThumbsRated,
} from "./extractionAdapter.js";

export type {
  ArtifactMeta,
  ArtifactSignal,
  ArtifactEditedAndSavedEvent,
  ExplicitTagAppliedEvent,
  GenerationAbandonedEvent,
  GenerationAcceptedEvent,
  RevertAfterEditEvent,
  ThumbsRatedEvent,
} from "./extractionAdapter.js";
