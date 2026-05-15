/**
 * Creative Memory System — Preference Store
 *
 * Self-contained module. No external dependencies beyond Node `fs`/`path`.
 * Local-first, deterministic, JSON-on-disk preference memory.
 *
 * See docs/architecture.md for design philosophy and docs/retrieval-pipeline.md
 * for the eleven-stage retrieval flow.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  Confidence,
  CreatePreferenceInput,
  DecayResult,
  Diagnostic,
  ListPreferencesOptions,
  Polarity,
  Preference,
  PreferenceStoreFile,
  RankedPreference,
  RefinementInput,
  RefinementLogEntry,
  ResetMemoryOptions,
  RetrievalContext,
  RetrievalResult,
  Scope,
  Signal,
  SignalType,
} from "./types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Storage root resolved at call time from MEMORY_STORAGE_ROOT, falling back to
 * `<module dir>/memory`. Resolving lazily lets tests override the env var
 * after the module is imported (ESM hoists imports above test-file
 * executable code, so capturing at module-load would freeze the wrong path).
 */
function resolveStorageRoot(): string {
  return process.env.MEMORY_STORAGE_ROOT ?? path.join(moduleDir, "memory");
}

/** @deprecated Use `getStorageRoot()` for live values. Retained for diagnostics. */
export const STORAGE_ROOT: string = resolveStorageRoot();

/** Live read of the resolved storage root. */
export function getStorageRoot(): string {
  return resolveStorageRoot();
}

export const NORMALIZER = 2.0;
export const DECAY_DAYS = 90;
export const ARCHIVE_DAYS = 180;
export const INJECTION_THRESHOLD = 0.40;
export const TOKEN_BUDGET = 200;
export const MAX_INJECTION_COUNT = 20;
export const NEGATIVE_PRIORITY_MULTIPLIER = 1.2;
export const NEGATIVE_BUDGET_RATIO = 0.50;
export const MIN_NEG_FLOOR = 2;
export const MAX_PER_CATEGORY = 3;
export const CHARS_PER_TOKEN = 4;

export const SIGNAL_WEIGHTS: Readonly<Record<SignalType, number>> = Object.freeze({
  explicit_tag: 0.30,
  revert_after_edit: 0.25,
  manual_refinement: 0.20,
  repeated_acceptance: 0.15,
  thumbs_up: 0.10,
  thumbs_down: -0.10,
  single_rejection: -0.10,
  abandoned_generation: -0.02,
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function uid(prefix: string): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${s}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

function now(): string {
  return new Date().toISOString();
}

function addDays(isoString: string, days: number): string {
  const d = new Date(isoString);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function calcConfidence(strength: number): Confidence {
  if (strength < 0.35) return "low";
  if (strength <= 0.65) return "medium";
  return "high";
}

function dropConfidence(current: Confidence): Confidence {
  if (current === "high") return "medium";
  if (current === "medium") return "low";
  return "low";
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

/**
 * Validate and resolve the on-disk path for a user's preferences file.
 * Rejects user IDs that would escape the storage root via path traversal.
 */
function userFilePath(userId: string): string {
  // Reject IDs that are not safe basenames — prevents path traversal via
  // segments like "../escape" which path.join would happily resolve outside
  // the storage root.
  if (!/^[A-Za-z0-9_\-]+$/.test(userId)) {
    throw new Error(
      `userFilePath: userId "${userId}" is not a safe basename. ` +
        "Only alphanumeric characters, hyphens, and underscores are allowed.",
    );
  }
  return path.join(resolveStorageRoot(), userId, "preferences.json");
}

/** Keys that would corrupt plain-object semantics if used as property names. */
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Validate a project_id for use as a key on project_overrides (a plain object).
 * Rejects prototype-polluting keys and non-safe-basename strings.
 */
function validateProjectId(projectId: string): void {
  if (UNSAFE_OBJECT_KEYS.has(projectId)) {
    throw new Error(
      `project_id "${projectId}" is not a safe key — it would corrupt object semantics. ` +
        "Use a normal identifier.",
    );
  }
  if (!/^[A-Za-z0-9_\-]+$/.test(projectId)) {
    throw new Error(
      `project_id "${projectId}" is not a safe key. ` +
        "Only alphanumeric characters, hyphens, and underscores are allowed.",
    );
  }
}

function loadFile(userId: string): PreferenceStoreFile | null {
  const fp = userFilePath(userId);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8")) as PreferenceStoreFile;
  } catch (err: unknown) {
    // A corrupt JSON file (e.g., from a crash during write) should not crash
    // the process. Treat it as if the file doesn't exist — the next ensureFile
    // call will reinitialize it. Log the error for observability.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `loadFile: failed to parse preferences.json for user "${userId}". ` +
        `The file may be corrupt. Error: ${message}`,
    );
  }
}

function saveFile(userId: string, data: PreferenceStoreFile): void {
  const fp = userFilePath(userId);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  data.last_updated = now();
  const content = JSON.stringify(data, null, 2);
  // Attempt atomic write (write-to-temp + rename). On platforms where rename
  // fails (Windows EPERM due to file locking), fall back to direct write.
  // The atomic path prevents corruption from mid-write crashes on POSIX;
  // the fallback ensures the subsystem still works on Windows where rename
  // semantics are less reliable under concurrent access.
  const tmpFp = `${fp}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmpFp, content, "utf8");
    fs.renameSync(tmpFp, fp);
  } catch {
    // Fallback: direct write (non-atomic but functional)
    try { fs.unlinkSync(tmpFp); } catch { /* ignore cleanup failure */ }
    fs.writeFileSync(fp, content, "utf8");
  }
}

function initFile(userId: string): PreferenceStoreFile {
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

function ensureFile(userId: string): PreferenceStoreFile {
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

function getAllPrefs(data: PreferenceStoreFile): Preference[] {
  const all: Preference[] = [...data.global_preferences];
  for (const prefs of Object.values(data.project_overrides)) all.push(...prefs);
  return all;
}

function getPrefArray(
  data: PreferenceStoreFile,
  scope: "global" | "project",
  projectId: string | null,
): Preference[] {
  if (scope === "global") return data.global_preferences;
  if (scope === "project" && projectId) {
    validateProjectId(projectId);
    if (!data.project_overrides[projectId]) data.project_overrides[projectId] = [];
    return data.project_overrides[projectId]!;
  }
  throw new Error(`Invalid scope: ${scope}. Use "global" or "project" with a projectId.`);
}

function findPrefById(
  data: PreferenceStoreFile,
  prefId: string,
): { pref: Preference; array: Preference[] } | null {
  for (const pref of data.global_preferences) {
    if (pref.id === prefId) return { pref, array: data.global_preferences };
  }
  for (const arr of Object.values(data.project_overrides)) {
    const pref = arr.find((p) => p.id === prefId);
    if (pref) return { pref, array: arr };
  }
  return null;
}

function findExistingPref(
  array: Preference[],
  pattern: string,
  preferenceType: string,
  polarity: Polarity,
): Preference | null {
  return (
    array.find(
      (p) =>
        p.pattern === pattern && p.preference_type === preferenceType && p.polarity === polarity,
    ) ?? null
  );
}

function recalcStrength(pref: Preference): Preference {
  pref.signal_strength = clamp(pref.signal_strength, 0.0, 1.0);
  pref.confidence = calcConfidence(pref.signal_strength);
  return pref;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new preference record. The id, last_seen, and decay_at fields are
 * auto-set; everything else passes through from the input.
 */
export function createPreference(userId: string, record: CreatePreferenceInput): Preference {
  const data = ensureFile(userId);
  const t = now();
  const pref: Preference = {
    id: uid("pref"),
    preference_type: record.preference_type,
    pattern: record.pattern,
    polarity: record.polarity ?? "positive",
    signal_strength: clamp(record.signal_strength ?? 0, 0, 1),
    confidence: "low",
    sources: record.sources ?? [],
    accept_count: record.accept_count ?? 0,
    reject_count: record.reject_count ?? 0,
    explicit_tags: record.explicit_tags ?? [],
    last_seen: t,
    decay_at: addDays(t, DECAY_DAYS),
    scope: record.scope ?? "global",
    reversal_signals: 0,
    reversal_first_seen: null,
    polarity_status: "stable",
    shadow_of: record.shadow_of ?? null,
  };
  pref.confidence = calcConfidence(pref.signal_strength);

  const projectId = record.project_id ?? null;
  const array = getPrefArray(
    data,
    pref.scope === "global" ? "global" : "project",
    projectId,
  );
  array.push(pref);
  saveFile(userId, data);
  return pref;
}

/** Read a single preference by id. */
export function readPreference(userId: string, prefId: string): Preference | null {
  const data = loadFile(userId);
  if (!data) return null;
  const result = findPrefById(data, prefId);
  return result ? result.pref : null;
}

/**
 * Update specific fields on a preference record. Does NOT recalculate signal
 * strength from scratch — use ingestSignal for that. Used primarily by tests
 * and "forget this" / "promote this" UI affordances.
 */
export function updatePreference(
  userId: string,
  prefId: string,
  fields: Partial<Preference>,
): Preference | null {
  const data = ensureFile(userId);
  const result = findPrefById(data, prefId);
  if (!result) return null;

  Object.assign(result.pref, fields);
  recalcStrength(result.pref);
  saveFile(userId, data);
  return result.pref;
}

/** Hard delete a preference record. */
export function deletePreference(userId: string, prefId: string): boolean {
  const data = ensureFile(userId);
  const result = findPrefById(data, prefId);
  if (!result) return false;

  const idx = result.array.indexOf(result.pref);
  result.array.splice(idx, 1);
  saveFile(userId, data);
  return true;
}

/** List preferences with optional filters. */
export function listPreferences(
  userId: string,
  options: ListPreferencesOptions = {},
): Preference[] {
  const data = loadFile(userId);
  if (!data) return [];

  const { scope = "all", polarity = "all", minStrength = 0, status = "all" } = options;

  let prefs: Preference[];
  if (scope === "all") {
    prefs = getAllPrefs(data);
  } else if (scope === "global") {
    prefs = [...data.global_preferences];
  } else if (scope.startsWith("project:")) {
    const projectId = scope.split(":")[1] ?? "";
    validateProjectId(projectId);
    prefs = [...(data.project_overrides[projectId] ?? [])];
  } else {
    prefs = getAllPrefs(data);
  }

  return prefs
    .filter((p) => polarity === "all" || p.polarity === polarity)
    .filter((p) => p.signal_strength >= minStrength)
    .filter((p) => status === "all" || p.polarity_status === status)
    .sort((a, b) => b.signal_strength - a.signal_strength);
}

/** Reset memory for a user. */
export function resetMemory(userId: string, options: ResetMemoryOptions = {}): void {
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
    const projectId = scope.split(":")[1] ?? "";
    validateProjectId(projectId);
    data.project_overrides[projectId] = [];
  }

  saveFile(userId, data);
}

// ---------------------------------------------------------------------------
// Signal ingestion
// ---------------------------------------------------------------------------

/**
 * Ingest a new signal and update or create the relevant preference record.
 * Returns the updated/created record, or `null` when memory is disabled.
 */
export function ingestSignal(userId: string, signal: Signal): Preference | null {
  const data = ensureFile(userId);
  if (!data.memory_enabled) return null;

  // Runtime validation of signal fields that could corrupt stored state.
  if (signal.polarity !== "positive" && signal.polarity !== "negative") {
    throw new Error(
      `ingestSignal: signal.polarity must be "positive" or "negative". Got: ${JSON.stringify(signal.polarity)}`,
    );
  }
  if (typeof signal.pattern !== "string" || signal.pattern.length === 0) {
    throw new Error(
      `ingestSignal: signal.pattern must be a non-empty string. Got: ${JSON.stringify(signal.pattern)}`,
    );
  }
  if (typeof signal.preference_type !== "string" || signal.preference_type.length === 0) {
    throw new Error(
      `ingestSignal: signal.preference_type must be a non-empty string. Got: ${JSON.stringify(signal.preference_type)}`,
    );
  }

  const weight = SIGNAL_WEIGHTS[signal.signal_type];
  if (weight === undefined) {
    throw new Error(`Unknown signal_type: ${signal.signal_type}`);
  }

  const array = getPrefArray(data, signal.scope, signal.project_id);
  const t = signal.timestamp || now();

  // Look for existing record matching this pattern + polarity.
  // Skip archived records — they should not silently absorb new signals.
  let pref = findExistingPref(array, signal.pattern, signal.preference_type, signal.polarity);

  // If the match is archived, reactivate it: clear the terminal status so the
  // accumulation path below can bring it back into the injectable set. This
  // lets a user re-establish a previously archived preference by signaling
  // again, rather than requiring manual deletion of the old record.
  if (pref && pref.polarity_status === "archived") {
    pref.polarity_status = "stable";
    pref.reversal_signals = 0;
    pref.reversal_first_seen = null;
  }

  // Look for existing record with OPPOSITE polarity (potential contradiction)
  const opposite: Polarity = signal.polarity === "positive" ? "negative" : "positive";
  const oppositePref = findExistingPref(array, signal.pattern, signal.preference_type, opposite);

  if (oppositePref && oppositePref.polarity_status === "stable") {
    // This signal contradicts an existing stable record — apply reversal logic
    applyReversal(data, array, oppositePref, signal, weight, t);
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
 *   1 signal:   noise guard — no change at all
 *   2 signals:  strength × 0.80, status remains "stable"
 *   3 signals:  strength × 0.60, confidence drops one rung
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
function applyReversal(
  data: PreferenceStoreFile,
  array: Preference[],
  pref: Preference,
  signal: Signal,
  weight: number,
  t: string,
): void {
  pref.reversal_signals = (pref.reversal_signals || 0) + 1;
  if (!pref.reversal_first_seen) pref.reversal_first_seen = t;

  const rs = pref.reversal_signals;

  // Determine multiplier (only used for 4+ signal cases)
  let multiplier = 1.0;
  if (rs === 2) multiplier = 1.5;
  if (rs >= 3) multiplier = 2.0;

  const penalty = Math.abs(weight) * multiplier;

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
    const shadowPolarity: Polarity = pref.polarity === "positive" ? "negative" : "positive";
    const alreadyHasShadow = array.some(
      (p) => p.shadow_of === pref.id && p.polarity === shadowPolarity,
    );

    if (!alreadyHasShadow) {
      const shadowStrength = Math.abs(weight) / NORMALIZER;
      const shadow: Preference = {
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
          0,
          1,
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
  // `penalty` is intentionally unused for rs in {1, 2, 3} (those branches use
  // the fixed × 0.80 / × 0.60 reductions). Kept as a single declaration so the
  // 4+ branch reads cleanly.
  void penalty;
}

// ---------------------------------------------------------------------------
// Decay runner
// ---------------------------------------------------------------------------

/**
 * Run decay pass for a user. Call on session start or as a scheduled daily job.
 *
 * Archival is based on `last_seen` age (days since the user last interacted
 * with the preference), not `decay_at`. This ensures the archive deadline is
 * fixed at ARCHIVE_DAYS since last interaction and is not pushed forward by
 * routine decay passes that reset `decay_at`.
 *
 * Decay (strength × 0.70) fires when `decay_at` is in the past (i.e. the
 * preference has been untouched for at least DECAY_DAYS since its last
 * signal or last decay pass). The decay branch resets `decay_at` forward so
 * the next decay fires another DECAY_DAYS later.
 */
export function runDecay(userId: string): DecayResult {
  const data = loadFile(userId);
  if (!data) return { decayed: 0, archived: 0 };

  let decayed = 0;
  let archived = 0;
  const n = now();

  function processArray(arr: Preference[]): void {
    for (const pref of arr) {
      if (pref.polarity_status === "archived") continue;

      // Archive check: based on last_seen, not decay_at.
      // A preference that has not been interacted with for ARCHIVE_DAYS
      // is terminal regardless of how many decay passes have run.
      const daysSinceLastSeen = daysBetween(pref.last_seen, n);
      if (daysSinceLastSeen >= ARCHIVE_DAYS) {
        pref.polarity_status = "archived";
        archived++;
        continue;
      }

      // Decay check: based on decay_at (resets each pass).
      const daysSinceDecay = daysBetween(pref.decay_at, n);
      if (daysSinceDecay >= 0) {
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
 */
export function retrieveForInjection(
  userId: string,
  context: RetrievalContext = {},
): RetrievalResult {
  const data = loadFile(userId);
  if (!data || !data.memory_enabled) {
    return { positives: [], negatives: [], projectOverrides: [], diagnostics: [] };
  }

  const { project_id, preference_types } = context;
  const diagnostics: Diagnostic[] = [];

  // Stage 2 — Project-override merge
  let prefs: RankedPreference[] = [...data.global_preferences];
  let projectPrefs: Preference[] = [];

  if (project_id && data.project_overrides[project_id]) {
    // Validate project_id as a safe key.
    validateProjectId(project_id);
    projectPrefs = data.project_overrides[project_id]!;

    // Key override identity on preference_type + pattern (not pattern alone).
    // Two records with the same pattern text but different categories are
    // independent preferences and must not suppress each other.
    const projectKeys = new Set(
      projectPrefs.map((p) => `${p.preference_type}\0${p.pattern}`),
    );

    // Conflict diagnostics: record which globals were suppressed
    for (const gp of prefs) {
      const key = `${gp.preference_type}\0${gp.pattern}`;
      if (projectKeys.has(key)) {
        const override = projectPrefs.find(
          (pp) => pp.preference_type === gp.preference_type && pp.pattern === gp.pattern,
        );
        diagnostics.push({
          type: "project_override_suppression",
          suppressed_pattern: gp.pattern,
          suppressed_polarity: gp.polarity,
          suppressed_strength: gp.signal_strength,
          override_polarity: override ? override.polarity : "unknown",
          override_strength: override ? override.signal_strength : 0,
          project_id,
          trace: `${project_id} override ${gp.preference_type}/${gp.pattern} active — global ${gp.preference_type}/${gp.pattern} (${gp.polarity}, ${gp.signal_strength.toFixed(2)}) suppressed for this generation`,
        });
      }
    }

    prefs = prefs.filter(
      (p) => !projectKeys.has(`${p.preference_type}\0${p.pattern}`),
    );
    prefs = [...prefs, ...projectPrefs];
  }

  // Stage 3 — Lifecycle filter
  prefs = prefs
    .filter((p) => p.signal_strength >= INJECTION_THRESHOLD)
    .filter((p) => p.polarity_status === "stable")
    .filter((p) => p.confidence === "medium" || p.confidence === "high")
    .filter(
      (p) =>
        !preference_types || preference_types.some((t) => p.preference_type.startsWith(t)),
    );

  // Stage 4 — Effective-priority scoring
  for (const p of prefs) {
    p._effective_priority =
      p.signal_strength * (p.polarity === "negative" ? NEGATIVE_PRIORITY_MULTIPLIER : 1.0);
  }

  // Stage 5 — Ranking
  prefs.sort((a, b) => (b._effective_priority ?? 0) - (a._effective_priority ?? 0));

  // Stage 6 — Hard-cap enforcement
  let overflowPrefs: RankedPreference[] = [];
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
  const currentNegs = prefs.filter((p) => p.polarity === "negative");
  const currentPos = prefs.filter((p) => p.polarity === "positive");
  const positiveOverflow = overflowPrefs.filter((p) => p.polarity === "positive");

  if (currentNegs.length > 0) {
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
    const maxNegSlots = Math.max(MIN_NEG_FLOOR, keepNegs);

    if (currentNegs.length > maxNegSlots) {
      // Sort negatives by effective priority descending (strongest survive)
      const negsSorted = [...currentNegs].sort(
        (a, b) => (b._effective_priority ?? 0) - (a._effective_priority ?? 0),
      );
      const trimmed = negsSorted.slice(maxNegSlots);
      const trimmedIds = new Set(trimmed.map((p) => p.id));

      // Remove trimmed negatives from prefs
      prefs = prefs.filter((p) => !trimmedIds.has(p.id));

      // Stage 8 — Polarity backfill
      if (trimmed.length > 0 && positiveOverflow.length > 0) {
        const backfill = positiveOverflow.slice(0, trimmed.length);
        if (backfill.length > 0) {
          prefs.push(...backfill);
          // Remove admitted entries from overflowPrefs so Stage 10 does not
          // re-admit the same records (which would produce duplicates).
          const admittedIds = new Set(backfill.map((p) => p.id));
          overflowPrefs = overflowPrefs.filter((p) => !admittedIds.has(p.id));
          // Re-sort after backfill to maintain ranking order
          prefs.sort((a, b) => (b._effective_priority ?? 0) - (a._effective_priority ?? 0));
          diagnostics.push({
            type: "diversity_backfill",
            backfilled_count: backfill.length,
            backfilled_patterns: backfill.map((p) => p.pattern),
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
        trimmed_patterns: trimmed.map((p) => p.pattern),
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
  const catCounts: Record<string, number> = {};
  for (const p of prefs) {
    catCounts[p.preference_type] = (catCounts[p.preference_type] ?? 0) + 1;
  }
  const allCatTypes = new Set<string>(Object.keys(catCounts));
  for (const p of overflowPrefs) allCatTypes.add(p.preference_type);
  const totalDistinctCats = allCatTypes.size;
  const overRepresented =
    totalDistinctCats >= 2
      ? Object.entries(catCounts).filter(([, count]) => count > MAX_PER_CATEGORY)
      : [];

  if (overRepresented.length > 0) {
    const catTrimmed: RankedPreference[] = [];

    for (const [cat] of overRepresented) {
      const catPrefs = prefs
        .filter((p) => p.preference_type === cat)
        .sort((a, b) => (b._effective_priority ?? 0) - (a._effective_priority ?? 0));

      const excess = catPrefs.slice(MAX_PER_CATEGORY);
      catTrimmed.push(...excess);
    }

    if (catTrimmed.length > 0) {
      const trimmedIds = new Set(catTrimmed.map((p) => p.id));
      prefs = prefs.filter((p) => !trimmedIds.has(p.id));

      // Stage 10 — Category backfill from overflow, preferring under-represented types
      const remainingCats: Record<string, number> = {};
      for (const p of prefs) {
        remainingCats[p.preference_type] = (remainingCats[p.preference_type] ?? 0) + 1;
      }
      // Compute per-type remaining capacity instead of a flat "has room" set.
      // The old set-membership approach allowed multiple overflow entries from
      // the same under-represented type to all be re-admitted, which could
      // re-expand a category past MAX_PER_CATEGORY after backfill.
      const remainingCapacity: Record<string, number> = {};
      for (const t of Object.keys(remainingCats)) {
        remainingCapacity[t] = Math.max(0, MAX_PER_CATEGORY - (remainingCats[t] ?? 0));
      }
      // Categories not currently present in `prefs` start with full capacity.
      const allOverflowTypes = new Set(overflowPrefs.map((p) => p.preference_type));
      for (const t of allOverflowTypes) {
        if (!(t in remainingCapacity)) remainingCapacity[t] = MAX_PER_CATEGORY;
      }

      const totalUnderRepCapacity = Object.values(remainingCapacity).reduce(
        (sum, n) => sum + n,
        0,
      );

      if (overflowPrefs.length > 0 && totalUnderRepCapacity > 0) {
        // Walk overflow in priority order, admitting one record per under-
        // represented type until that type's capacity is exhausted or until
        // we've filled the slots freed by `catTrimmed`.
        const catBackfill: RankedPreference[] = [];
        const slotBudget = catTrimmed.length;
        for (const p of overflowPrefs) {
          if (catBackfill.length >= slotBudget) break;
          const cap = remainingCapacity[p.preference_type] ?? 0;
          if (cap <= 0) continue;
          catBackfill.push(p);
          remainingCapacity[p.preference_type] = cap - 1;
        }
        if (catBackfill.length > 0) {
          prefs.push(...catBackfill);
          prefs.sort((a, b) => (b._effective_priority ?? 0) - (a._effective_priority ?? 0));
          diagnostics.push({
            type: "category_backfill",
            backfilled_count: catBackfill.length,
            backfilled_types: [...new Set(catBackfill.map((p) => p.preference_type))],
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
        trimmed_patterns: catTrimmed.map((p) => p.pattern),
        max_per_category: MAX_PER_CATEGORY,
        trace: `Category ceiling: ${catTrimmed.length} pattern(s) trimmed from ${overRepresented.map(([c]) => c).join(", ")} (max ${MAX_PER_CATEGORY}/type)`,
      });
    }
  }

  // Stage 11 — Token-budget enforcement
  let tokenCount = 20; // overhead for [MEMORY CONTEXT] header + line prefixes
  const budgeted: RankedPreference[] = [];
  for (const p of prefs) {
    const patternTokens = Math.ceil(p.pattern.length / CHARS_PER_TOKEN);
    const lineOverhead = 5;
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

  // Strip internal priority field before returning
  for (const p of budgeted) delete p._effective_priority;
  for (const p of prefs) delete p._effective_priority;

  const positives = budgeted
    .filter((p): p is Preference => p.polarity === "positive")
    .sort((a, b) => b.signal_strength - a.signal_strength);

  const negatives = budgeted
    .filter((p): p is Preference => p.polarity === "negative")
    .sort((a, b) => b.signal_strength - a.signal_strength);

  const overrides = projectPrefs.filter(
    (p) =>
      p.signal_strength >= INJECTION_THRESHOLD &&
      p.polarity_status === "stable" &&
      (!preference_types ||
        preference_types.some((t) => p.preference_type.startsWith(t))),
  );

  return { positives, negatives, projectOverrides: overrides, diagnostics };
}

/**
 * Build the [MEMORY CONTEXT] prompt block from retrieved preferences.
 * Returns an empty string when nothing is injectable.
 */
export function buildPromptBlock(retrieved: RetrievalResult, projectId?: string): string {
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
 * Append a refinement diff to the log. Diff shape is provisional — pending
 * pipeline-team confirmation (open question #2).
 */
export function logRefinement(userId: string, entry: RefinementInput): RefinementLogEntry {
  const data = ensureFile(userId);
  const record: RefinementLogEntry = {
    id: uid("ref"),
    artifact_id: entry.artifact_id ?? null,
    project_id: entry.project_id ?? null,
    timestamp: now(),
    diff: entry.diff ?? {},
  };
  data.refinement_log.push(record);
  saveFile(userId, data);
  return record;
}
