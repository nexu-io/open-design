import { createHash } from 'node:crypto';
import {
  constants as fsConstants,
  type Dirent,
  type Stats,
} from 'node:fs';
import {
  lstat,
  open,
  readdir,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

import {
  normalizeAgentObservationV1,
  type NormalizedAgentObservationV1,
  type NormalizedPromptEvidenceV1,
  type NormalizedTimingEvidenceV1,
  type NormalizedUsageEvidenceV1,
  type StrategyInputStageV2,
} from '@open-design/contracts';
import {
  buildSafeChildPromptTelemetry,
  type SafeChildPromptInput,
} from '../prompt-telemetry.js';

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const DATE_PART_PATTERN = /^\d{2}$/u;
const YEAR_PATTERN = /^\d{4}$/u;
const DEFAULT_MAX_DAY_DIRECTORIES = 32;
const DEFAULT_MAX_DIRECTORY_ENTRIES = 4_096;
const DEFAULT_MAX_ROLLOUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_CHILD_SESSIONS = 256;
const DEFAULT_MAX_RECURSION_DEPTH = 16;

type ChildTerminalStatus = 'completed' | 'failed' | 'canceled';

export type CodexRolloutReadFailureReason =
  | 'parent_session_not_declared'
  | 'codex_home_not_declared'
  | 'codex_home_not_absolute'
  | 'invalid_session_id'
  | 'sessions_root_unavailable'
  | 'unsafe_rollout_directory'
  | 'rollout_rotation_window_exhausted'
  | 'rollout_not_found'
  | 'rollout_ambiguous'
  | 'unsafe_rollout_file'
  | 'rollout_too_large'
  | 'rollout_read_failed';

export interface CodexChildEvidenceDiagnostic {
  code: CodexRolloutReadFailureReason | string;
  count: number;
}

export interface CollectCodexChildEvidenceInput {
  /**
   * Must be the effective CODEX_HOME passed to the launched runtime. The
   * collector deliberately has no homedir fallback: callers that cannot name
   * the runtime-owned root get unavailable evidence instead of a home scan.
   */
  codexHome?: string | null;
  parentSessionId?: string | null;
  parentTurnId?: string | null;
  taskExecutionId: string;
  runId: string;
  taskRunIndex: number;
  stage: StrategyInputStageV2;
  parentObservationId: string;
  agentCliVersion?: string;
  runStartedAtMs?: number;
  runEndedAtMs?: number;
  maxDayDirectories?: number;
  maxDirectoryEntries?: number;
  maxRolloutBytes?: number;
  maxChildSessions?: number;
  maxRecursionDepth?: number;
}

export interface CodexChildEvidenceCollection {
  availability: 'complete' | 'partial' | 'unavailable';
  source: 'codex_rollout';
  /** Distinct Child agents observed, not invocations. See `knownChildCount`. */
  knownChildCount: number;
  observations: NormalizedAgentObservationV1[];
  limitations: string[];
  diagnostics: CodexChildEvidenceDiagnostic[];
}

interface PromptIdentity {
  hash: string;
  bytes: number;
  safePayload: SafeChildPromptInput;
  truncated: boolean;
}

interface UsageValues extends Record<string, number | undefined> {
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

interface ChildActivity {
  sessionId: string;
  kind: string;
  atMs?: number;
}

interface ParsedTurn {
  turnId: string;
  startedAtMs?: number;
  endedAtMs?: number;
  abortedStatus?: ChildTerminalStatus;
  completedStatus?: Extract<ChildTerminalStatus, 'completed' | 'failed'>;
  malformedCompletionError?: boolean;
  promptIdentities: PromptIdentity[];
  modelCalls: UsageValues[];
  childActivities: ChildActivity[];
}

interface ParsedRollout {
  sessionId: string;
  parentSessionId?: string;
  parentDeclarationConflict: boolean;
  malformedLineCount: number;
  turns: ParsedTurn[];
}

interface ReadRolloutSuccess {
  ok: true;
  parsed: ParsedRollout;
}

interface ReadRolloutFailure {
  ok: false;
  reason: CodexRolloutReadFailureReason;
}

type ReadRolloutResult = ReadRolloutSuccess | ReadRolloutFailure;

interface ResolvedRolloutPathSuccess {
  ok: true;
  filePath: string;
  stat: Stats;
}

interface ResolvedRolloutPathFailure {
  ok: false;
  reason: CodexRolloutReadFailureReason;
}

type ResolvedRolloutPath = ResolvedRolloutPathSuccess | ResolvedRolloutPathFailure;

interface PendingObservation {
  atMs: number;
  sequence: number;
  observation: NormalizedAgentObservationV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function boundedPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(fallback, Math.max(1, Math.floor(value)));
}

function timestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value !== 'string') return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function codePointCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function stableDigest(parts: readonly string[]): string {
  return sha256(JSON.stringify([...parts]));
}

function normalizeActivityKind(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]/gu, '_').slice(0, 64)
    : '';
}

function terminalFromActivityKind(kind: string): ChildTerminalStatus | undefined {
  if (kind === 'completed' || kind === 'complete' || kind === 'succeeded') {
    return 'completed';
  }
  if (kind === 'failed' || kind === 'errored') return 'failed';
  if (kind === 'canceled' || kind === 'cancelled' || kind === 'interrupted') return 'canceled';
  return undefined;
}

function terminalFromAbortPayload(payload: Record<string, unknown>): ChildTerminalStatus {
  const reason = normalizeActivityKind(payload.reason ?? payload.status);
  return reason === 'canceled' || reason === 'cancelled' || reason === 'interrupted'
    ? 'canceled'
    : 'failed';
}

function safeSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return SESSION_ID_PATTERN.test(trimmed) ? trimmed : undefined;
}

function declaredParentSessionId(payload: Record<string, unknown>): {
  value?: string;
  conflict: boolean;
} {
  const direct = safeSessionId(payload.parent_thread_id);
  const source = isRecord(payload.source) ? payload.source : undefined;
  const subagent = source && isRecord(source.subagent) ? source.subagent : undefined;
  const spawn = subagent && isRecord(subagent.thread_spawn)
    ? subagent.thread_spawn
    : undefined;
  const nested = spawn ? safeSessionId(spawn.parent_thread_id) : undefined;
  if (direct && nested && direct !== nested) return { conflict: true };
  const value = direct ?? nested;
  return value ? { value, conflict: false } : { conflict: false };
}

function addUsage(target: UsageValues, source: Record<string, unknown>): void {
  const fields = [
    ['input_tokens', 'inputTokens'],
    ['output_tokens', 'outputTokens'],
    ['reasoning_output_tokens', 'thoughtTokens'],
    ['cached_input_tokens', 'cacheReadTokens'],
    ['cache_write_input_tokens', 'cacheWriteTokens'],
  ] as const;
  for (const [raw, normalized] of fields) {
    const value = finiteNonNegative(source[raw]);
    if (value !== undefined) target[normalized] = (target[normalized] ?? 0) + value;
  }
}

function parseRolloutStructure(source: string, expectedSessionId: string): ParsedRollout | null {
  const records: Array<Record<string, unknown>> = [];
  let malformedLineCount = 0;
  for (const line of source.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) records.push(parsed);
      else malformedLineCount += 1;
    } catch {
      malformedLineCount += 1;
    }
  }

  const metadata = records
    .filter((record) => record.type === 'session_meta')
    .map((record) => isRecord(record.payload) ? record.payload : null)
    .filter((payload): payload is Record<string, unknown> => Boolean(
      payload &&
      (safeSessionId(payload.id) ?? safeSessionId(payload.session_id)) === expectedSessionId
    ));
  if (metadata.length === 0) return null;
  const parentDeclarations = metadata.map((payload) => {
    // In Codex 0.147.0 Child rollouts `id` is the Child thread id while the
    // legacy `session_id` can still identify the root session. Treat `id` as
    // authoritative and use session_id only for older records without id.
    const metadataId = safeSessionId(payload.id) ?? safeSessionId(payload.session_id);
    if (metadataId !== expectedSessionId) return null;
    return declaredParentSessionId(payload);
  });
  if (parentDeclarations.some((declaration) => declaration === null)) return null;
  const validParentDeclarations = parentDeclarations.filter(
    (declaration): declaration is { value?: string; conflict: boolean } => declaration !== null,
  );
  const declaredParents = new Set(
    validParentDeclarations.map((declaration) => declaration.value ?? '<missing>'),
  );
  const parentDeclarationConflict = declaredParents.size > 1 ||
    validParentDeclarations.some((declaration) => declaration.conflict);
  const parentSessionId = parentDeclarationConflict
    ? undefined
    : validParentDeclarations[0]?.value;

  const turns = new Map<string, ParsedTurn>();
  let activeTurnId: string | undefined;
  const seenTokenTotals = new Map<string, Set<string>>();
  for (const record of records) {
    const payload = isRecord(record.payload) ? record.payload : undefined;
    if (!payload) continue;
    const recordAtMs = timestampMs(record.timestamp);
    if (record.type === 'event_msg' && payload.type === 'task_started') {
      const turnId = typeof payload.turn_id === 'string' && payload.turn_id.trim()
        ? payload.turn_id.trim()
        : undefined;
      if (!turnId) continue;
      activeTurnId = turnId;
      if (!turns.has(turnId)) {
        turns.set(turnId, {
          turnId,
          ...(recordAtMs !== undefined ? { startedAtMs: recordAtMs } : {}),
          promptIdentities: [],
          modelCalls: [],
          childActivities: [],
        });
      }
      continue;
    }
    if (!activeTurnId) continue;
    const turn = turns.get(activeTurnId);
    if (!turn || record.type !== 'event_msg') continue;
    if (payload.type === 'user_message' && typeof payload.message === 'string') {
      const safe = buildSafeChildPromptTelemetry([payload.message]);
      turn.promptIdentities.push({
        hash: sha256(payload.message),
        bytes: Buffer.byteLength(payload.message, 'utf8'),
        safePayload: safe.safePayload,
        truncated: safe.truncated,
      });
      continue;
    }
    if (payload.type === 'token_count') {
      const info = isRecord(payload.info) ? payload.info : undefined;
      const last = info && isRecord(info.last_token_usage)
        ? info.last_token_usage
        : undefined;
      if (!last) continue;
      const total = info && isRecord(info.total_token_usage)
        ? info.total_token_usage
        : undefined;
      const currentTurnId = activeTurnId;
      const fingerprint = total ? stableDigest([
        String(total.input_tokens ?? ''),
        String(total.cached_input_tokens ?? ''),
        String(total.output_tokens ?? ''),
        String(total.reasoning_output_tokens ?? ''),
      ]) : stableDigest([currentTurnId, String(turn.modelCalls.length)]);
      const fingerprints = seenTokenTotals.get(currentTurnId) ?? new Set<string>();
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      seenTokenTotals.set(currentTurnId, fingerprints);
      const usage: UsageValues = {};
      addUsage(usage, last);
      if (Object.keys(usage).length > 0) turn.modelCalls.push(usage);
      continue;
    }
    if (payload.type === 'sub_agent_activity') {
      const sessionId = safeSessionId(payload.agent_thread_id);
      const kind = normalizeActivityKind(payload.kind);
      if (sessionId && kind) {
        const atMs = timestampMs(payload.occurred_at_ms) ?? recordAtMs;
        turn.childActivities.push({
          sessionId,
          kind,
          ...(atMs !== undefined ? { atMs } : {}),
        });
      }
      continue;
    }
    if (payload.type === 'turn_aborted') {
      turn.abortedStatus = terminalFromAbortPayload(payload);
      if (recordAtMs !== undefined) turn.endedAtMs = recordAtMs;
      activeTurnId = undefined;
      continue;
    }
    if (payload.type === 'task_complete') {
      const completedTurnId = typeof payload.turn_id === 'string' && payload.turn_id.trim()
        ? payload.turn_id.trim()
        : activeTurnId;
      const completed = completedTurnId ? turns.get(completedTurnId) : undefined;
      if (completed) {
        if (recordAtMs !== undefined) completed.endedAtMs = recordAtMs;
        if (payload.error === undefined || payload.error === null) {
          completed.completedStatus = 'completed';
        } else if (
          isRecord(payload.error) &&
          typeof payload.error.message === 'string' &&
          payload.error.message.trim().length > 0
        ) {
          // Codex 0.147.0 records a terminal inference failure on the Child's
          // task_complete payload. Parent sub_agent_activity only has
          // started/interacted/interrupted, so this is the runtime-owned
          // failed terminal rather than a status inferred from prose.
          completed.completedStatus = 'failed';
        } else {
          completed.malformedCompletionError = true;
        }
      }
      if (completedTurnId === activeTurnId) activeTurnId = undefined;
    }
  }

  return {
    sessionId: expectedSessionId,
    ...(parentSessionId ? { parentSessionId } : {}),
    parentDeclarationConflict,
    malformedLineCount,
    turns: [...turns.values()],
  };
}

function isUnsafeDirectoryStat(stat: Stats): boolean {
  if (!stat.isDirectory() || stat.isSymbolicLink()) return true;
  if ((stat.mode & 0o022) !== 0) return true;
  return typeof process.getuid === 'function' && stat.uid !== process.getuid();
}

function isUnsafeFileStat(stat: Stats): boolean {
  if (!stat.isFile() || stat.isSymbolicLink()) return true;
  if ((stat.mode & 0o022) !== 0) return true;
  return typeof process.getuid === 'function' && stat.uid !== process.getuid();
}

async function safeDirectoryEntries(
  directory: string,
  maxEntries: number,
): Promise<Dirent[] | null> {
  const stat = await lstat(directory).catch(() => null);
  if (!stat || isUnsafeDirectoryStat(stat)) return null;
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => null);
  if (!entries || entries.length > maxEntries) return null;
  return entries;
}

async function resolveRolloutPath(input: {
  codexHome: string | null | undefined;
  sessionId: string;
  maxDayDirectories: number;
  maxDirectoryEntries: number;
  maxRolloutBytes: number;
}): Promise<ResolvedRolloutPath> {
  const codexHome = input.codexHome?.trim();
  if (!codexHome) return { ok: false, reason: 'codex_home_not_declared' };
  if (!path.isAbsolute(codexHome)) return { ok: false, reason: 'codex_home_not_absolute' };
  if (!SESSION_ID_PATTERN.test(input.sessionId)) {
    return { ok: false, reason: 'invalid_session_id' };
  }
  const sessionsRoot = path.join(codexHome, 'sessions');
  const rootEntries = await safeDirectoryEntries(sessionsRoot, input.maxDirectoryEntries);
  if (!rootEntries) return { ok: false, reason: 'sessions_root_unavailable' };
  const rootRealPath = await realpath(sessionsRoot).catch(() => null);
  if (!rootRealPath) return { ok: false, reason: 'sessions_root_unavailable' };

  const matches: string[] = [];
  let scannedDays = 0;
  let exhausted = false;
  const years = rootEntries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && YEAR_PATTERN.test(entry.name))
    .sort((left, right) => codePointCompare(right.name, left.name));
  for (const year of years) {
    const yearPath = path.join(sessionsRoot, year.name);
    const monthEntries = await safeDirectoryEntries(yearPath, input.maxDirectoryEntries);
    if (!monthEntries) return { ok: false, reason: 'unsafe_rollout_directory' };
    const months = monthEntries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && DATE_PART_PATTERN.test(entry.name))
      .sort((left, right) => codePointCompare(right.name, left.name));
    for (const month of months) {
      const monthPath = path.join(yearPath, month.name);
      const dayEntries = await safeDirectoryEntries(monthPath, input.maxDirectoryEntries);
      if (!dayEntries) return { ok: false, reason: 'unsafe_rollout_directory' };
      const days = dayEntries
        .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && DATE_PART_PATTERN.test(entry.name))
        .sort((left, right) => codePointCompare(right.name, left.name));
      for (const day of days) {
        if (scannedDays >= input.maxDayDirectories) {
          exhausted = true;
          break;
        }
        scannedDays += 1;
        const dayPath = path.join(monthPath, day.name);
        const files = await safeDirectoryEntries(dayPath, input.maxDirectoryEntries);
        if (!files) return { ok: false, reason: 'unsafe_rollout_directory' };
        const suffix = `-${input.sessionId}.jsonl`;
        for (const entry of files) {
          if (
            entry.isFile() &&
            !entry.isSymbolicLink() &&
            entry.name.startsWith('rollout-') &&
            entry.name.endsWith(suffix)
          ) {
            matches.push(path.join(dayPath, entry.name));
          }
        }
      }
      if (exhausted) break;
    }
    if (exhausted) break;
  }
  if (matches.length > 1) return { ok: false, reason: 'rollout_ambiguous' };
  const filePath = matches[0];
  if (!filePath) {
    return {
      ok: false,
      reason: exhausted ? 'rollout_rotation_window_exhausted' : 'rollout_not_found',
    };
  }
  const stat = await lstat(filePath).catch(() => null);
  if (!stat || isUnsafeFileStat(stat)) return { ok: false, reason: 'unsafe_rollout_file' };
  if (stat.size > input.maxRolloutBytes) return { ok: false, reason: 'rollout_too_large' };
  const resolved = await realpath(filePath).catch(() => null);
  if (!resolved || !resolved.startsWith(`${rootRealPath}${path.sep}`)) {
    return { ok: false, reason: 'unsafe_rollout_file' };
  }
  return { ok: true, filePath, stat };
}

async function readRollout(input: {
  codexHome: string | null | undefined;
  sessionId: string;
  maxDayDirectories: number;
  maxDirectoryEntries: number;
  maxRolloutBytes: number;
}): Promise<ReadRolloutResult> {
  const resolved = await resolveRolloutPath(input);
  if (!resolved.ok) return resolved;
  const noFollow = typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
  const handle = await open(resolved.filePath, fsConstants.O_RDONLY | noFollow).catch(() => null);
  if (!handle) return { ok: false, reason: 'rollout_read_failed' };
  try {
    const opened = await handle.stat();
    if (
      isUnsafeFileStat(opened) ||
      opened.size !== resolved.stat.size ||
      opened.dev !== resolved.stat.dev ||
      opened.ino !== resolved.stat.ino
    ) {
      return { ok: false, reason: 'unsafe_rollout_file' };
    }
    const source = await handle.readFile({ encoding: 'utf8' });
    const parsed = parseRolloutStructure(source, input.sessionId);
    if (!parsed) return { ok: false, reason: 'rollout_read_failed' };
    return { ok: true, parsed };
  } catch {
    return { ok: false, reason: 'rollout_read_failed' };
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function aggregateUsage(calls: readonly UsageValues[]): UsageValues | undefined {
  if (calls.length === 0) return undefined;
  const result: UsageValues = {};
  for (const call of calls) {
    for (const key of [
      'inputTokens',
      'outputTokens',
      'thoughtTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
    ] as const) {
      const value = call[key];
      if (value !== undefined) result[key] = (result[key] ?? 0) + value;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizedUsage(
  values: UsageValues | undefined,
  limitations: string[],
): NormalizedUsageEvidenceV1 | undefined {
  if (!values) return undefined;
  const complete = values.inputTokens !== undefined && values.outputTokens !== undefined;
  return {
    availability: complete ? 'complete' : 'partial',
    source: 'rollout',
    accountingMode: 'additive',
    values,
    valueSources: Object.fromEntries(
      Object.keys(values).map((key) => [key, 'rollout']),
    ),
    limitations: complete ? limitations : [...limitations, 'codex_usage_fields_partial'],
  };
}

function normalizedPrompt(
  prompts: readonly PromptIdentity[],
): NormalizedPromptEvidenceV1['childInjected'] | undefined {
  if (prompts.length === 0) return undefined;
  const bytes = prompts.reduce((total, prompt) => total + prompt.bytes, 0);
  if (prompts.length === 1) {
    return {
      availability: 'exact',
      source: 'rollout',
      hash: prompts[0]?.hash,
      bytes,
      safePayload: prompts[0]?.safePayload,
      limitations: [
        'child_prompt_safe_payload_redacted',
        ...(prompts[0]?.truncated ? ['child_prompt_safe_payload_truncated'] : []),
      ],
    };
  }
  const combinedSafe = buildSafeChildPromptTelemetry(prompts.flatMap((prompt) => (
    prompt.safePayload.messages.map((message) => message.redactedContent)
  )));
  const truncated = combinedSafe.truncated || prompts.some((prompt) => prompt.truncated);
  return {
    availability: 'partial',
    source: 'rollout',
    hash: stableDigest(prompts.map((prompt) => prompt.hash)),
    bytes,
    safePayload: {
      ...combinedSafe.safePayload,
      rawBytes: bytes,
      truncated,
    } satisfies SafeChildPromptInput,
    limitations: [
      'child_prompt_safe_payload_redacted',
      'multiple_child_messages_aggregated',
      ...(truncated
        ? ['child_prompt_safe_payload_truncated']
        : []),
    ],
  };
}

function runningTiming(startedAtMs: number | undefined): NormalizedTimingEvidenceV1 | undefined {
  if (startedAtMs === undefined) return undefined;
  return {
    availability: 'partial',
    evidence: [{
      source: 'runtime',
      clockDomain: 'unix_epoch_ms',
      startedAtMs,
    }],
    limitations: ['codex_child_terminal_time_not_yet_observed'],
  };
}

function terminalTiming(
  startedAtMs: number | undefined,
  endedAtMs: number | undefined,
): NormalizedTimingEvidenceV1 | undefined {
  if (startedAtMs === undefined && endedAtMs === undefined) return undefined;
  const complete = startedAtMs !== undefined && endedAtMs !== undefined;
  return {
    availability: complete ? 'complete' : 'partial',
    evidence: [{
      source: 'runtime',
      clockDomain: 'unix_epoch_ms',
      ...(startedAtMs !== undefined ? { startedAtMs } : {}),
      ...(endedAtMs !== undefined ? { endedAtMs } : {}),
      ...(complete ? { durationMs: Math.max(0, endedAtMs - startedAtMs) } : {}),
    }],
    limitations: complete ? [] : ['codex_child_timing_partial'],
  };
}

function terminalFromEvidence(input: {
  turn: ParsedTurn;
  activities: readonly ChildActivity[];
}): {
  status?: ChildTerminalStatus;
  endedAtMs?: number;
  conflict?: boolean;
  source?: 'parent_sub_agent_activity' | 'child_turn_aborted' | 'child_task_complete';
  limitations: string[];
} {
  const explicit = input.activities
    .map((activity) => ({
      status: terminalFromActivityKind(activity.kind),
      atMs: activity.atMs,
    }))
    .filter((candidate): candidate is {
      status: ChildTerminalStatus;
      atMs: number | undefined;
    } => (
      candidate.status !== undefined
    ));
  const statuses = new Set(explicit.map((candidate) => candidate.status));
  if (input.turn.abortedStatus) statuses.add(input.turn.abortedStatus);
  if (input.turn.completedStatus) statuses.add(input.turn.completedStatus);
  if (input.turn.malformedCompletionError) {
    return {
      conflict: true,
      limitations: ['codex_child_terminal_payload_malformed'],
    };
  }
  if (statuses.size > 1) {
    return {
      conflict: true,
      limitations: ['codex_child_terminal_status_conflict'],
    };
  }
  const explicitStatus = explicit[0]?.status;
  if (explicitStatus) {
    const observedTimes = explicit
      .map((candidate) => candidate.atMs)
      .filter((value): value is number => value !== undefined);
    const endedAtMs = observedTimes.length > 0
      ? Math.max(...observedTimes)
      : input.turn.endedAtMs;
    return {
      status: explicitStatus,
      ...(endedAtMs !== undefined ? { endedAtMs } : {}),
      source: 'parent_sub_agent_activity',
      limitations: [],
    };
  }
  if (input.turn.abortedStatus) {
    return {
      status: input.turn.abortedStatus,
      ...(input.turn.endedAtMs !== undefined ? { endedAtMs: input.turn.endedAtMs } : {}),
      source: 'child_turn_aborted',
      limitations: ['codex_child_terminal_from_turn_aborted'],
    };
  }
  if (input.turn.completedStatus) {
    return {
      status: input.turn.completedStatus,
      ...(input.turn.endedAtMs !== undefined ? { endedAtMs: input.turn.endedAtMs } : {}),
      source: 'child_task_complete',
      limitations: [],
    };
  }
  return { limitations: ['codex_child_terminal_not_observed'] };
}

function diagnosticList(counts: Map<string, number>): CodexChildEvidenceDiagnostic[] {
  return [...counts.entries()]
    .sort(([left], [right]) => codePointCompare(left, right))
    .map(([code, count]) => ({ code, count }));
}

function selectParentTurn(input: {
  rollout: ParsedRollout;
  parentTurnId: string | null | undefined;
  runStartedAtMs: number | undefined;
  runEndedAtMs: number | undefined;
}): ParsedTurn | null {
  const explicit = input.parentTurnId?.trim();
  if (explicit) {
    return input.rollout.turns.find((turn) => turn.turnId === explicit) ?? null;
  }
  const runStartedAtMs = input.runStartedAtMs;
  if (runStartedAtMs === undefined) return null;
  const candidates = input.rollout.turns.filter((turn) => {
    if (turn.startedAtMs === undefined) return false;
    if (turn.startedAtMs < runStartedAtMs - 15_000) return false;
    return input.runEndedAtMs === undefined || turn.startedAtMs <= input.runEndedAtMs + 30_000;
  });
  return candidates.length === 1 ? candidates[0] ?? null : null;
}

/**
 * Collect Codex child facts beside the main JSON event parser. It only opens
 * the explicitly declared parent session plus child session ids referenced by
 * that parent's selected turn, and it never returns rollout paths or prompt
 * text. Failure is data: callers receive unavailable/partial facts and the
 * normal Run lifecycle remains untouched.
 */
export async function collectCodexChildEvidence(
  input: CollectCodexChildEvidenceInput,
): Promise<CodexChildEvidenceCollection> {
  const limitations = new Set<string>();
  const diagnostics = new Map<string, number>();
  const pending: PendingObservation[] = [];
  let observationSequence = 0;
  const maxDayDirectories = boundedPositiveInteger(
    input.maxDayDirectories,
    DEFAULT_MAX_DAY_DIRECTORIES,
  );
  const maxDirectoryEntries = boundedPositiveInteger(
    input.maxDirectoryEntries,
    DEFAULT_MAX_DIRECTORY_ENTRIES,
  );
  const maxRolloutBytes = boundedPositiveInteger(input.maxRolloutBytes, DEFAULT_MAX_ROLLOUT_BYTES);
  const maxChildSessions = boundedPositiveInteger(
    input.maxChildSessions,
    DEFAULT_MAX_CHILD_SESSIONS,
  );
  const maxRecursionDepth = boundedPositiveInteger(
    input.maxRecursionDepth,
    DEFAULT_MAX_RECURSION_DEPTH,
  );
  const parentSessionId = safeSessionId(input.parentSessionId);
  if (!parentSessionId) {
    const reason: CodexRolloutReadFailureReason = input.parentSessionId
      ? 'invalid_session_id'
      : 'parent_session_not_declared';
    return {
      availability: 'unavailable',
      source: 'codex_rollout',
      knownChildCount: 0,
      observations: [],
      limitations: ['codex_parent_session_not_declared'],
      diagnostics: [{ code: reason, count: 1 }],
    };
  }

  const readCache = new Map<string, Promise<ReadRolloutResult>>();
  const load = (sessionId: string): Promise<ReadRolloutResult> => {
    const existing = readCache.get(sessionId);
    if (existing) return existing;
    const created = readRollout({
      codexHome: input.codexHome,
      sessionId,
      maxDayDirectories,
      maxDirectoryEntries,
      maxRolloutBytes,
    });
    readCache.set(sessionId, created);
    return created;
  };
  const root = await load(parentSessionId);
  if (!root.ok) {
    return {
      availability: 'unavailable',
      source: 'codex_rollout',
      knownChildCount: 0,
      observations: [],
      limitations: ['codex_parent_rollout_unavailable'],
      diagnostics: [{ code: root.reason, count: 1 }],
    };
  }
  if (root.parsed.parentDeclarationConflict) {
    return {
      availability: 'unavailable',
      source: 'codex_rollout',
      knownChildCount: 0,
      observations: [],
      limitations: ['codex_parent_metadata_conflict'],
      diagnostics: [{ code: 'parent_declaration_conflict', count: 1 }],
    };
  }
  if (root.parsed.malformedLineCount > 0) {
    limitations.add('codex_parent_rollout_contains_malformed_lines');
  }
  const parentTurn = selectParentTurn({
    rollout: root.parsed,
    parentTurnId: input.parentTurnId,
    runStartedAtMs: input.runStartedAtMs,
    runEndedAtMs: input.runEndedAtMs,
  });
  if (!parentTurn) {
    return {
      availability: 'unavailable',
      source: 'codex_rollout',
      knownChildCount: 0,
      observations: [],
      limitations: ['codex_parent_turn_not_uniquely_mapped'],
      diagnostics: [{ code: 'parent_turn_not_mapped', count: 1 }],
    };
  }
  const rootStart = parentTurn.startedAtMs ?? input.runStartedAtMs;
  const rootEnd = parentTurn.endedAtMs ?? input.runEndedAtMs;
  if (rootStart === undefined || rootEnd === undefined) {
    return {
      availability: 'unavailable',
      source: 'codex_rollout',
      knownChildCount: 0,
      observations: [],
      limitations: ['codex_parent_turn_window_unavailable'],
      diagnostics: [{ code: 'parent_turn_window_unavailable', count: 1 }],
    };
  }

  const ancestorTurnIds = new Set(root.parsed.turns.map((turn) => turn.turnId));
  const visitedSessionTurns = new Set<string>();
  const attemptedChildSessions = new Set<string>();
  const ancestry = new Set([parentSessionId]);

  const recordDiagnostic = (code: string): void => {
    diagnostics.set(code, (diagnostics.get(code) ?? 0) + 1);
  };
  const appendObservation = (atMs: number | undefined, observation: NormalizedAgentObservationV1): void => {
    pending.push({
      atMs: atMs ?? Number.MAX_SAFE_INTEGER,
      sequence: observationSequence,
      observation,
    });
    observationSequence += 1;
  };

  const collectChildren = async (args: {
    parentSessionId: string;
    parentTurn: ParsedTurn;
    parentObservationId: string;
    ancestry: Set<string>;
    ancestorTurnIds: Set<string>;
    depth: number;
  }): Promise<void> => {
    const activitiesBySession = new Map<string, ChildActivity[]>();
    for (const activity of args.parentTurn.childActivities) {
      const sequence = activitiesBySession.get(activity.sessionId) ?? [];
      sequence.push(activity);
      activitiesBySession.set(activity.sessionId, sequence);
    }
    if (args.depth >= maxRecursionDepth && activitiesBySession.size > 0) {
      limitations.add('codex_child_recursion_depth_exceeded');
      recordDiagnostic('child_recursion_depth_exceeded');
      return;
    }
    for (const [childSessionId, activities] of activitiesBySession) {
      if (args.ancestry.has(childSessionId)) {
        limitations.add('codex_child_cycle_rejected');
        recordDiagnostic('child_cycle_rejected');
        continue;
      }
      if (!attemptedChildSessions.has(childSessionId)) {
        if (attemptedChildSessions.size >= maxChildSessions) {
          limitations.add('codex_child_session_limit_exceeded');
          recordDiagnostic('child_session_limit_exceeded');
          continue;
        }
        attemptedChildSessions.add(childSessionId);
      }
      const child = await load(childSessionId);
      if (!child.ok) {
        limitations.add('codex_child_rollout_unavailable');
        recordDiagnostic(child.reason);
        continue;
      }
      if (child.parsed.parentDeclarationConflict) {
        limitations.add('codex_child_parent_declaration_conflict');
        recordDiagnostic('parent_declaration_conflict');
        continue;
      }
      if (child.parsed.parentSessionId !== args.parentSessionId) {
        limitations.add('codex_child_parent_unverified');
        recordDiagnostic(child.parsed.parentSessionId
          ? 'child_parent_mismatch'
          : 'child_parent_missing');
        continue;
      }
      if (child.parsed.malformedLineCount > 0) {
        limitations.add('codex_child_rollout_contains_malformed_lines');
      }
      const nextAncestry = new Set(args.ancestry).add(childSessionId);
      const nextAncestorTurnIds = new Set(args.ancestorTurnIds);
      for (const turn of child.parsed.turns) nextAncestorTurnIds.add(turn.turnId);
      const ownTurns = child.parsed.turns.filter((turn) => {
        if (args.ancestorTurnIds.has(turn.turnId)) {
          limitations.add('codex_inherited_turn_excluded');
          return false;
        }
        if (turn.startedAtMs === undefined) return false;
        return turn.startedAtMs >= rootStart - 2_000 && turn.startedAtMs <= rootEnd + 2_000;
      });
      if (ownTurns.length === 0) {
        limitations.add('codex_child_turn_not_observed');
        recordDiagnostic('child_turn_not_observed');
        continue;
      }
      // Attribute each parent activity to the Child turn it happened in.
      //
      // A Codex sub-agent is re-invoked by its parent, and every invocation
      // opens another turn in the Child's own rollout, so `started` followed by
      // N-1 `interacted` is the ordinary shape of one delegated package rather
      // than an ambiguity — rejecting it discarded every Child of a real
      // complex Run. Terminals still have to be read per turn: handing the
      // whole session's activity list to each one would let a single parent
      // record terminate them all and stamp them with one `endedAtMs`.
      const orderedTurns = [...ownTurns].sort((a, b) => (
        (a.startedAtMs ?? 0) - (b.startedAtMs ?? 0)
      ));
      const activitiesByTurn = new Map<string, ChildActivity[]>();
      for (const activity of activities) {
        const owner = [...orderedTurns].reverse().find((candidate) => (
          candidate.startedAtMs !== undefined
          && activity.atMs !== undefined
          && activity.atMs >= candidate.startedAtMs - 2_000
        )) ?? orderedTurns[0];
        if (!owner) continue;
        const bucket = activitiesByTurn.get(owner.turnId) ?? [];
        bucket.push(activity);
        activitiesByTurn.set(owner.turnId, bucket);
      }
      for (const turn of orderedTurns) {
        const visitKey = `${childSessionId}\u0000${turn.turnId}`;
        if (visitedSessionTurns.has(visitKey)) {
          limitations.add('codex_child_turn_duplicate_rejected');
          recordDiagnostic('child_turn_duplicate_rejected');
          continue;
        }
        visitedSessionTurns.add(visitKey);
        const turnDigest = stableDigest([childSessionId, turn.turnId]);
        const childObservationId = `codex-child:${turnDigest}`;
        const modelObservationId = `codex-model-call:${turnDigest}`;
        const accountingTurnId = `codex:${turnDigest}`;
        const usageValues = aggregateUsage(turn.modelCalls);
        const turnLimitations = [
          'codex_rollout_structural_facts_only',
          ...(turn.modelCalls.length > 1 ? ['codex_model_calls_aggregated_per_child_turn'] : []),
        ];
        const usage = normalizedUsage(usageValues, turnLimitations);
        const prompt = normalizedPrompt(turn.promptIdentities);
        const terminal = terminalFromEvidence({
          turn,
          activities: activitiesByTurn.get(turn.turnId) ?? [],
        });
        if (terminal.conflict) recordDiagnostic('child_terminal_status_conflict');
        const startedTiming = runningTiming(turn.startedAtMs);
        const completedTiming = terminalTiming(
          turn.startedAtMs,
          terminal.endedAtMs ?? turn.endedAtMs,
        );
        for (const limitation of terminal.limitations) limitations.add(limitation);

        const commonIdentity = {
          taskExecutionId: input.taskExecutionId,
          runId: input.runId,
          taskRunIndex: input.taskRunIndex,
          runtimeSessionId: childSessionId,
        };
        const hasIndependentUsage = usage !== undefined;
        const childAccounting = hasIndependentUsage
          ? {
              turnId: accountingTurnId,
              disposition: 'exclude_inherited' as const,
              ownerObservationId: modelObservationId,
            }
          : undefined;
        appendObservation(turn.startedAtMs, normalizeAgentObservationV1({
          identity: {
            observationId: childObservationId,
            ...commonIdentity,
            parentObservationId: args.parentObservationId,
          },
          kind: 'child_agent',
          stage: input.stage,
          status: 'running',
          ...(startedTiming ? { timing: startedTiming } : {}),
          ...(childAccounting ? { turnAccounting: childAccounting } : {}),
          attributes: {
            runtimePath: 'codex',
            ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
            runtimeAdapterVersion: 'od-codex-child-evidence/v1',
            providerTurnHash: stableDigest([turn.turnId]),
            promptContentRedacted: true,
          },
          limitations: turnLimitations,
        }));

        if (usage) {
          appendObservation(terminal.endedAtMs ?? turn.endedAtMs, normalizeAgentObservationV1({
            identity: {
              observationId: modelObservationId,
              ...commonIdentity,
              parentObservationId: childObservationId,
            },
            kind: 'model_call',
            stage: input.stage,
            status: terminal.status ?? 'unknown',
            ...(prompt ? { prompt: { childInjected: prompt } } : {}),
            usage,
            ...(completedTiming ? { timing: completedTiming } : {}),
            turnAccounting: {
              turnId: accountingTurnId,
              disposition: 'owner',
              ownerObservationId: modelObservationId,
            },
            attributes: {
              runtimePath: 'codex',
              ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
              runtimeAdapterVersion: 'od-codex-child-evidence/v1',
              providerTurnHash: stableDigest([turn.turnId]),
              modelCallCount: turn.modelCalls.length,
              promptContentRedacted: true,
            },
            limitations: turnLimitations,
          }));
        }

        await collectChildren({
          parentSessionId: childSessionId,
          parentTurn: turn,
          parentObservationId: childObservationId,
          ancestry: nextAncestry,
          ancestorTurnIds: nextAncestorTurnIds,
          depth: args.depth + 1,
        });

        if (terminal.status) {
          appendObservation(terminal.endedAtMs ?? turn.endedAtMs, normalizeAgentObservationV1({
            identity: {
              observationId: childObservationId,
              ...commonIdentity,
              parentObservationId: args.parentObservationId,
            },
            kind: 'child_agent',
            stage: input.stage,
            status: terminal.status,
            ...(prompt ? { prompt: { childInjected: prompt } } : {}),
            ...(usage ? { usage } : {}),
            ...(completedTiming ? { timing: completedTiming } : {}),
            ...(childAccounting ? { turnAccounting: childAccounting } : {}),
            attributes: {
              runtimePath: 'codex',
              ...(input.agentCliVersion ? { agentCliVersion: input.agentCliVersion } : {}),
              runtimeAdapterVersion: 'od-codex-child-evidence/v1',
              providerTurnHash: stableDigest([turn.turnId]),
              promptContentRedacted: true,
              ...(terminal.source ? { terminalEvidence: terminal.source } : {}),
            },
            limitations: [...turnLimitations, ...terminal.limitations],
          }));
        } else {
          limitations.add('codex_child_terminal_not_observed');
        }
      }
    }
  };

  await collectChildren({
    parentSessionId,
    parentTurn,
    parentObservationId: input.parentObservationId,
    ancestry,
    ancestorTurnIds,
    depth: 0,
  });

  if (pending.length === 0 && parentTurn.childActivities.length > 0) {
    limitations.add('codex_child_activity_unresolved');
  }
  const observations = pending
    .sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence)
    .map(({ observation }) => observation);
  const childStatuses = new Map<string, Set<NormalizedAgentObservationV1['status']>>();
  for (const observation of observations) {
    if (observation.kind !== 'child_agent') continue;
    const statuses = childStatuses.get(observation.identity.observationId) ?? new Set();
    statuses.add(observation.status);
    childStatuses.set(observation.identity.observationId, statuses);
  }
  const terminalStatuses = new Set<NormalizedAgentObservationV1['status']>([
    'completed',
    'failed',
    'canceled',
  ]);
  const hasIncompleteChild = [...childStatuses.values()].some((statuses) => (
    statuses.has('running') && ![...statuses].some((status) => terminalStatuses.has(status))
  ));
  if (hasIncompleteChild) limitations.add('codex_child_terminal_not_observed');

  // One Child agent, however many times its parent re-invoked it.
  //
  // Codex opens a new turn in the Child's rollout per invocation, and the
  // per-turn observation identity above is what keeps each invocation's
  // lifecycle separate. The coverage figure answers a different question —
  // "how many Children ran" — which is the one OpenCode's `knownChildIds.size`
  // answers too. Counting observation ids here instead reported three
  // sub-agents as four and left the two runtimes' figures incomparable.
  const knownChildCount = new Set(observations
    .filter((observation) => observation.kind === 'child_agent')
    .map((observation) => observation.identity.runtimeSessionId)
    .filter((sessionId): sessionId is string => typeof sessionId === 'string')).size;

  return {
    availability: limitations.size > 0 || diagnostics.size > 0
        ? 'partial'
        : 'complete',
    source: 'codex_rollout',
    knownChildCount,
    observations,
    limitations: [...limitations].sort(codePointCompare),
    diagnostics: diagnosticList(diagnostics),
  };
}
