/** @module verify/verify
 * POST self-verify enforcement: programmatically checks that the model emitted a passing
 * `<od-card type="verify-scorecard">` covering every active `rule` memory whenever a
 * turn produced an artifact. The enforcement predates the scorecards being honor-system
 * only — `missing` (no scorecard) and `fail` (a row failed or a rule was uncovered) are
 * now surfaced to the user rather than silently tolerated.
 *
 * `enforceVerify` is a PURE function (no I/O, no clock, no provider call) so it is
 * fully unit-testable. A small ring buffer mirrors `extractions/` to surface recent
 * enforcement outcomes to the settings panel and `od memory verifications` CLI via the
 * `'verify'` SSE channel. Depends only on `core/` for the change bus.
 */

import { randomUUID } from 'node:crypto';
import { splitOnOdCards } from '@open-design/contracts';
import type {
  MemoryVerifyResult,
  MemoryVerifyRecord,
} from '@open-design/contracts';
import { memoryEvents } from '../core/index.js';

/**
 * A minimal view of a `rule` memory entry passed to {@link enforceVerify}. The `name`
 * is used for fuzzy scorecard-row matching; `check` carries the rubric line the row
 * should address (from the entry's `Check: ...` field).
 */
export interface ActiveRuleForVerify {
  name: string;
  /** The rule's Check line — the rubric a scorecard row should address. */
  check?: string;
}

/**
 * All inputs {@link enforceVerify} needs to evaluate the self-verify contract for one
 * turn. The function is pure over these inputs — no I/O is performed inside.
 */
export interface EnforceVerifyInput {
  /** The assistant's full turn text (reassembled from the event stream). */
  assistantOutput: string;
  /** Active `rule` memories at enforcement time. */
  activeRules: ActiveRuleForVerify[];
  /** Whether the turn produced an artifact — enforcement scopes to those. */
  hadArtifact: boolean;
  /** The master `verifyEnabled` hook. When false, enforcement is skipped. */
  verifyEnabled: boolean;
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'must', 'should', 'have',
  'from', 'into', 'when', 'then', 'than', 'your', 'into', 'over', 'every',
  'check', 'verify', 'rule', 'future', 'artifacts', 'satisfy', 'ensure',
]);

/**
 * @internal
 * Extracts the set of "significant" lowercase words from a string by stripping
 * punctuation, splitting on whitespace, and removing words shorter than 4 characters
 * or in the stop-word list. Used to compute shared-word overlap for fuzzy rule matching.
 */
function significantWords(value: string): Set<string> {
  const words = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * @internal
 * Returns true when a scorecard row's text covers the given rule, using lenient fuzzy
 * matching: direct substring containment OR ≥ 2 shared significant words. Lenient by
 * design because the model paraphrases the check rather than quoting it verbatim.
 */
// A scorecard row covers a rule when the row text shares enough signal with
// the rule's name or check. Lenient on purpose: the model paraphrases the
// check, so we accept either a direct substring containment or >= 2 shared
// significant words.
function rowCoversRule(rowText: string, rule: ActiveRuleForVerify): boolean {
  const row = rowText.toLowerCase().trim();
  if (!row) return false;
  const name = String(rule.name || '').toLowerCase().trim();
  const check = String(rule.check || '').toLowerCase().trim();
  if (name.length >= 5 && (row.includes(name) || name.includes(row))) return true;
  if (check.length >= 8 && (row.includes(check) || check.includes(row))) return true;
  const rowWords = significantWords(rowText);
  const ruleWords = significantWords(`${rule.name} ${rule.check ?? ''}`);
  let shared = 0;
  for (const w of rowWords) {
    if (ruleWords.has(w)) shared += 1;
    if (shared >= 2) return true;
  }
  return false;
}

/**
 * Deterministically evaluates the self-verify contract for one turn. Pure — no I/O,
 * no clock, no provider call. Returns `'skipped'` when enforcement is disabled, there
 * are no active rules, or the turn produced no artifact. Returns `'missing'` when the
 * model should have self-verified but emitted no scorecard. Returns `'pass'` or
 * `'fail'` based on whether all active rules were covered with passing rows.
 * @param input - The turn context: assistant output, active rules, artifact flag, and
 *   the `verifyEnabled` toggle.
 * @returns A {@link MemoryVerifyResult} with counts and the list of uncovered rules.
 */
// Deterministically evaluate the self-verify contract for one turn. Pure —
// no I/O, no clock, no provider call.
export function enforceVerify(input: EnforceVerifyInput): MemoryVerifyResult {
  const activeRules = Array.isArray(input.activeRules) ? input.activeRules : [];
  const base: MemoryVerifyResult = {
    status: 'skipped',
    rulesActive: activeRules.length,
    rulesCovered: 0,
    uncoveredRules: [],
    rowsTotal: 0,
    rowsFailed: 0,
    hadArtifact: !!input.hadArtifact,
  };

  if (!input.verifyEnabled) {
    return { ...base, status: 'skipped', skipReason: 'verify-disabled' };
  }
  if (activeRules.length === 0) {
    return { ...base, status: 'skipped', skipReason: 'no-rules' };
  }
  if (!input.hadArtifact) {
    return { ...base, status: 'skipped', skipReason: 'no-artifact' };
  }

  const segments = splitOnOdCards(String(input.assistantOutput || ''));
  const scorecard = segments
    .map((seg) => (seg.kind === 'card' ? seg.card : null))
    .find((card) => card?.kind === 'verify-scorecard');

  if (!scorecard || scorecard.kind !== 'verify-scorecard') {
    // Model produced an artifact against active rules but never self-verified.
    return {
      ...base,
      status: 'missing',
      uncoveredRules: activeRules.map((r) => r.name),
    };
  }

  const rows = scorecard.rows ?? [];
  const rowsFailed = rows.filter((r) => r.status === 'fail').length;
  const uncoveredRules = activeRules
    .filter((rule) => !rows.some((row) => rowCoversRule(row.rule, rule)))
    .map((rule) => rule.name);
  const rulesCovered = activeRules.length - uncoveredRules.length;
  const status: MemoryVerifyResult['status'] =
    rowsFailed > 0 || uncoveredRules.length > 0 ? 'fail' : 'pass';

  return {
    status,
    rulesActive: activeRules.length,
    rulesCovered,
    uncoveredRules,
    scorecardStatus: scorecard.status,
    rowsTotal: rows.length,
    rowsFailed,
    hadArtifact: true,
  };
}

// ----- Ring buffer (mirrors memory-extractions.ts) ------------------------

const MAX_RECORDS = 20;
const records: MemoryVerifyRecord[] = []; // newest first

type VerifyEmit =
  | MemoryVerifyRecord
  | { id: string; status: string; at: number };

/**
 * @internal
 * Fans out a verify event on the `'verify'` SSE channel. Deferred with `setImmediate`
 * so delete/clear events don't race with in-flight SSE writes.
 */
function emit(record: VerifyEmit): void {
  setImmediate(() => {
    try {
      memoryEvents.emit('verify', { ...record });
    } catch {
      // SSE failures are not the enforcer's problem.
    }
  });
}

/**
 * Records one enforcement outcome in the ring buffer and fans it out on the `'verify'`
 * SSE channel. `'skipped'` outcomes are NOT persisted — the history is a UX surface for
 * outcomes that had something to check, not a per-turn audit log.
 * @param result - The result from {@link enforceVerify}.
 * @param meta - Optional run / project ids for cross-linking in the settings panel.
 * @returns The persisted record, or `null` when the outcome was `'skipped'`.
 */
// Record one enforcement outcome and fan it out on the `verify` SSE channel.
// `skipped` outcomes are NOT persisted — the history is a UX surface for
// enforcement that actually had something to check, not a per-turn audit log.
export function recordVerify(
  result: MemoryVerifyResult,
  meta: { runId?: string; projectId?: string | null } = {},
): MemoryVerifyRecord | null {
  if (result.status === 'skipped') return null;
  const record: MemoryVerifyRecord = {
    ...result,
    id: randomUUID(),
    at: Date.now(),
    ...(meta.runId ? { runId: meta.runId } : {}),
    ...(meta.projectId !== undefined ? { projectId: meta.projectId } : {}),
  };
  records.unshift(record);
  if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
  emit(record);
  return record;
}

/**
 * Returns a newest-first shallow-copy snapshot of all persisted verification records.
 * Consumed by `GET /api/memory/verifications` and the `od memory verifications` CLI.
 */
export function listVerifications(): MemoryVerifyRecord[] {
  return records.map((r) => ({ ...r }));
}

/**
 * Removes a single verification record by id and emits a `status: 'deleted'` event so
 * the settings panel can drop the row immediately. Returns 0 when the id is not in the
 * buffer (idempotent).
 * @param id - The verification record id to remove.
 * @returns 1 if removed, 0 if already gone.
 */
export function removeVerification(id: string): number {
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return 0;
  const [removed] = records.splice(idx, 1);
  const base = removed as MemoryVerifyRecord;
  emit({ id: base.id, status: 'deleted', at: Date.now() });
  return 1;
}

/**
 * Clears the entire verification ring buffer and emits a single `status: 'cleared'`
 * event. Returns the number of records removed.
 */
export function clearVerifications(): number {
  const removed = records.length;
  records.length = 0;
  if (removed > 0) emit({ id: 'all', status: 'cleared', at: Date.now() });
  return removed;
}

/**
 * Wipes the ring buffer without emitting events. Intended only for test setup so each
 * test case starts from a deterministic empty state.
 */
// Test-only — wipe the buffer for a deterministic starting state.
export function __resetVerificationsForTests(): void {
  records.length = 0;
}
