// POST self-verify enforcement (THREAD 2).
//
// The self-verify scorecard used to be honor-system: the prompt asked the
// model to emit a `<od-card type="verify-scorecard">` and fix failures in
// place, and nothing checked that it actually did. This module makes the
// contract PROGRAMMATICALLY ENFORCED whenever `verifyEnabled` is on: after a
// turn that produced an artifact and has active `rule` memories, the daemon
// deterministically evaluates whether the model emitted a passing scorecard
// covering every active rule, and records the verdict. `missing` (scorecard
// skipped) and `fail` (a row failed or a rule was left uncovered) are
// enforcement failures surfaced to the user, never silently tolerated.
//
// The evaluation is a PURE function (`enforceVerify`) so it is fully testable
// without a model call. A small ring buffer mirrors `memory-extractions.ts`
// so the settings panel and the `od memory verifications` CLI can list recent
// enforcement outcomes, fed over the `verify` SSE channel on
// `/api/memory/events`.

import { randomUUID } from 'node:crypto';
import { splitOnOdCards } from '@open-design/contracts';
import type {
  MemoryVerifyResult,
  MemoryVerifyRecord,
} from '@open-design/contracts';
import { memoryEvents } from './memory.js';

export interface ActiveRuleForVerify {
  name: string;
  /** The rule's Check line — the rubric a scorecard row should address. */
  check?: string;
}

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

function significantWords(value: string): Set<string> {
  const words = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

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

function emit(record: VerifyEmit): void {
  setImmediate(() => {
    try {
      memoryEvents.emit('verify', { ...record });
    } catch {
      // SSE failures are not the enforcer's problem.
    }
  });
}

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

export function listVerifications(): MemoryVerifyRecord[] {
  return records.map((r) => ({ ...r }));
}

export function removeVerification(id: string): number {
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return 0;
  const [removed] = records.splice(idx, 1);
  const base = removed as MemoryVerifyRecord;
  emit({ id: base.id, status: 'deleted', at: Date.now() });
  return 1;
}

export function clearVerifications(): number {
  const removed = records.length;
  records.length = 0;
  if (removed > 0) emit({ id: 'all', status: 'cleared', at: Date.now() });
  return removed;
}

// Test-only — wipe the buffer for a deterministic starting state.
export function __resetVerificationsForTests(): void {
  records.length = 0;
}
