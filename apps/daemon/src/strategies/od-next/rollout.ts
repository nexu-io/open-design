import { createHash } from 'node:crypto';

import type Database from 'better-sqlite3';
import type {
  OdNextRolloutDecision,
  OdNextRolloutClearReasonCode,
  OdNextRolloutControlReasonCode,
  OdNextRolloutMode,
  OdNextRolloutModeSource,
  OdNextRolloutStopReasonCode,
  OdNextRolloutTaskType,
} from '@open-design/contracts';

export type {
  OdNextRolloutDecision,
  OdNextRolloutMode,
  OdNextRolloutModeSource,
  OdNextRolloutTaskType,
} from '@open-design/contracts';

/**
 * The single app-config field this policy consults. Structural on purpose: the
 * daemon's `AppConfigPrefs`, a partially read config, and a test literal all
 * satisfy it without this module depending on the config reader.
 */
export interface OdNextRolloutAppConfig {
  odNextStrategyMode?: OdNextRolloutMode | null | undefined;
}

export interface OdNextRolloutPolicy {
  requestedMode: OdNextRolloutMode;
  requestedModeSource: OdNextRolloutModeSource;
  assignmentPercent: number;
  assignmentSalt: string;
  contentEnabled: boolean;
  behaviorEnabled: boolean;
  eligibleTaskTypes: readonly OdNextRolloutTaskType[];
  eligibleAgents: readonly string[];
  productionActiveApproved: boolean;
  localSyntheticCanary: boolean;
}

const DEFAULT_TASK_TYPES: readonly OdNextRolloutTaskType[] = [
  'prototype',
  'ppt',
  'marketing',
  'hyperframes',
];
const DEFAULT_AGENTS = ['codex', 'claude', 'opencode', 'amr'] as const;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function list(value: string | undefined): string[] {
  return (value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function envMode(value: string | undefined): OdNextRolloutMode | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '') return null;
  return trimmed === 'observe' || trimmed === 'active' ? trimmed : 'off';
}

function configuredMode(value: unknown): OdNextRolloutMode | null {
  return value === 'off' || value === 'observe' || value === 'active' ? value : null;
}

/**
 * Which authority decides the requested mode, and what it decided.
 *
 * OD Next is opt-in. An installation that configured nothing runs `off` — the
 * ordinary strategy route — so shipping the strategy in a build never changes
 * how a run behaves until someone asks for it.
 *
 * `OD_NEXT_STRATEGY_ROLLOUT` outranks the saved `odNextStrategyMode` so that a
 * pinned process stays pinned: an operator debugging one daemon, a packaged
 * smoke run, and a test all set the mode for one process without overwriting
 * the user's choice, and without a user's saved choice overriding theirs. The
 * config is what survives a restart; the env var is what wins inside one.
 */
function resolveRequestedMode(
  env: NodeJS.ProcessEnv,
  appConfig: OdNextRolloutAppConfig | null | undefined,
): { mode: OdNextRolloutMode; source: OdNextRolloutModeSource } {
  const fromEnv = envMode(env.OD_NEXT_STRATEGY_ROLLOUT);
  if (fromEnv) return { mode: fromEnv, source: 'env' };
  const fromConfig = configuredMode(appConfig?.odNextStrategyMode);
  if (fromConfig) return { mode: fromConfig, source: 'app_config' };
  return { mode: 'off', source: 'default' };
}

export function readOdNextRolloutPolicy(
  env: NodeJS.ProcessEnv = process.env,
  appConfig?: OdNextRolloutAppConfig | null,
): OdNextRolloutPolicy {
  const taskTypes = list(env.OD_NEXT_STRATEGY_TASK_TYPES).filter(
    (value): value is OdNextRolloutTaskType => (
      value === 'prototype' || value === 'ppt' || value === 'marketing' || value === 'hyperframes'
    ),
  );
  const percent = Number(env.OD_NEXT_STRATEGY_ASSIGNMENT_PERCENT ?? '100');
  const requested = resolveRequestedMode(env, appConfig);
  return {
    requestedMode: requested.mode,
    requestedModeSource: requested.source,
    assignmentPercent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
    assignmentSalt: env.OD_NEXT_STRATEGY_ASSIGNMENT_SALT?.trim() || 'od-next-v2-rollout',
    contentEnabled: bool(env.OD_NEXT_STRATEGY_CONTENT_ENABLED, true),
    behaviorEnabled: bool(env.OD_NEXT_STRATEGY_BEHAVIOR_ENABLED, true),
    eligibleTaskTypes: taskTypes.length > 0 ? taskTypes : DEFAULT_TASK_TYPES,
    eligibleAgents: list(env.OD_NEXT_STRATEGY_AGENTS).length > 0
      ? list(env.OD_NEXT_STRATEGY_AGENTS)
      : DEFAULT_AGENTS,
    productionActiveApproved: bool(env.OD_NEXT_STRATEGY_PRODUCTION_ACTIVE_APPROVED, true),
    localSyntheticCanary: bool(env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY, false),
  };
}

export function odNextTaskTypeForProjectScenarioBinding(
  binding: { provenance?: unknown; taskProfile?: unknown } | null | undefined,
): OdNextRolloutTaskType | null {
  if (binding?.provenance !== 'automatic_default') return null;
  return binding.taskProfile === 'prototype'
    || binding.taskProfile === 'ppt'
    || binding.taskProfile === 'marketing'
    || binding.taskProfile === 'hyperframes'
    ? binding.taskProfile
    : null;
}

export function stableOdNextAssignmentBucket(identity: string, salt: string): number {
  const digest = createHash('sha256').update(`${salt}:${identity}`).digest();
  return digest.readUInt32BE(0) % 10_000;
}

export function evaluateOdNextRollout(input: {
  policy: OdNextRolloutPolicy;
  assignmentIdentity: string;
  taskType: OdNextRolloutTaskType | null;
  agentId: string | null;
  agentVersion: string | null;
  sourceKind: string | null;
  runtimeCapabilityVerified?: boolean;
  runtimeCapabilityReason?: string | null;
  stoppedMode?: Exclude<OdNextRolloutMode, 'active'> | null;
  routeApplicability?: 'eligible' | 'explicit_user' | 'not_applicable';
}): OdNextRolloutDecision {
  const { policy } = input;
  const assignmentBucket = stableOdNextAssignmentBucket(
    input.assignmentIdentity,
    policy.assignmentSalt,
  );
  const reasons: string[] = [];
  const routeApplicability = input.routeApplicability ?? 'eligible';
  if (routeApplicability === 'explicit_user') {
    reasons.push('od_next_rollout_explicit_user_authority');
  } else if (routeApplicability === 'not_applicable') {
    reasons.push('od_next_rollout_not_applicable');
  }
  const evaluateEligibility = routeApplicability === 'eligible';
  if (policy.requestedMode === 'off') reasons.push('od_next_rollout_off');
  if (!policy.contentEnabled) reasons.push('od_next_rollout_content_disabled');
  if (!policy.behaviorEnabled) reasons.push('od_next_rollout_behavior_disabled');
  if (evaluateEligibility && (!input.taskType || !policy.eligibleTaskTypes.includes(input.taskType))) {
    reasons.push('od_next_rollout_task_bucket_ineligible');
  }
  if (evaluateEligibility && (!input.agentId || !policy.eligibleAgents.includes(input.agentId))) {
    reasons.push('od_next_rollout_agent_ineligible');
  }
  if (evaluateEligibility && input.sourceKind !== 'bundled') reasons.push('od_next_rollout_bundled_identity_required');
  if (evaluateEligibility && assignmentBucket >= policy.assignmentPercent * 100) {
    reasons.push('od_next_rollout_assignment_excluded');
  }
  // This is an explicit, local-only escape hatch used to prove the public
  // daemon/browser chain while X1/X2 remain unresolved. It must never be
  // inferred from a runtime version (or enabled in a production process).
  const syntheticCanary = Boolean(
    policy.localSyntheticCanary && process.env.NODE_ENV !== 'production',
  );
  // agentVersion is retained as diagnostic rollout evidence only. Runtime
  // invocability is established by preflight and capability admission is
  // keyed by runtime path + agent id + adapter/schema, not a version pin.
  if (evaluateEligibility && !input.runtimeCapabilityVerified && !syntheticCanary) {
    reasons.push('od_next_rollout_x1_capability_fixture_unverified');
    if (input.runtimeCapabilityReason) reasons.push(`od_next_rollout_capability_${input.runtimeCapabilityReason}`);
  }
  if (evaluateEligibility && !policy.productionActiveApproved && !syntheticCanary) {
    reasons.push('od_next_rollout_x2_active_unapproved');
  }
  if (evaluateEligibility && input.stoppedMode) reasons.push('od_next_rollout_stop_latched');

  const requestedActive = policy.requestedMode === 'active';
  const eligible = evaluateEligibility && requestedActive && reasons.length === 0;
  const effectiveMode: OdNextRolloutMode = !evaluateEligibility
    ? 'off'
    : policy.requestedMode === 'off'
    || !policy.contentEnabled
    || !policy.behaviorEnabled
    ? 'off'
    : input.stoppedMode
      ?? (eligible
      ? 'active'
      : 'observe');
  return {
    schemaVersion: 1,
    decisionClass: routeApplicability === 'explicit_user'
      ? 'explicit_user'
      : routeApplicability === 'not_applicable'
        ? 'not_applicable'
        : effectiveMode,
    requestedMode: policy.requestedMode,
    effectiveMode,
    taskType: input.taskType,
    assignmentBucket,
    eligible,
    syntheticCanary,
    reasonCodes: [...new Set(reasons)],
    primaryReasonCode: reasons[0] ?? 'od_next_rollout_eligible',
  };
}

export function migrateOdNextRolloutStore(db: Database.Database): void {
  const existing = db.prepare(`PRAGMA table_info(strategy_rollout_controls)`).all() as Array<{
    name: string;
  }>;
  if (existing.length > 0 && !existing.some((column) => column.name === 'revision')) {
    db.transaction(() => {
      db.exec(`ALTER TABLE strategy_rollout_controls RENAME TO strategy_rollout_controls_legacy`);
      createOdNextRolloutControlTable(db);
      db.exec(`
        INSERT INTO strategy_rollout_controls (
          strategy_id, mode, reason_code, latched_at, updated_at, revision,
          last_event, last_event_reason_code
        )
        SELECT strategy_id, mode, reason_code, updated_at, updated_at, 1,
               'latched', reason_code
          FROM strategy_rollout_controls_legacy;
        DROP TABLE strategy_rollout_controls_legacy;
      `);
    })();
    return;
  }
  createOdNextRolloutControlTable(db);
}

function createOdNextRolloutControlTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategy_rollout_controls (
      strategy_id TEXT PRIMARY KEY,
      mode TEXT CHECK (mode IN ('off', 'observe')),
      reason_code TEXT CHECK (reason_code IN (
        'machine_contract_leak',
        'default_critique_skipped',
        'native_resume_failed',
        'route_mode_drift',
        'complex_child_unverified',
        'threshold_exceeded',
        'quality_regression'
      )),
      latched_at INTEGER,
      updated_at INTEGER NOT NULL,
      revision INTEGER NOT NULL,
      last_event TEXT NOT NULL CHECK (last_event IN ('latched', 'cleared')),
      last_event_reason_code TEXT NOT NULL CHECK (last_event_reason_code IN (
        'machine_contract_leak',
        'default_critique_skipped',
        'native_resume_failed',
        'route_mode_drift',
        'complex_child_unverified',
        'threshold_exceeded',
        'quality_regression',
        'operator_reset',
        'internal_test_reset'
      )),
      CHECK (
        (mode IS NULL AND reason_code IS NULL AND latched_at IS NULL)
        OR (mode IS NOT NULL AND reason_code IS NOT NULL AND latched_at IS NOT NULL)
      )
    );
  `);
}

interface OdNextRolloutControlRow {
  mode: 'off' | 'observe' | null;
  reasonCode: OdNextRolloutStopReasonCode | null;
  latchedAt: number | null;
  updatedAt: number;
  revision: number;
  lastEvent: 'latched' | 'cleared';
  lastEventReasonCode: OdNextRolloutControlReasonCode;
}

function readOdNextRolloutControlRow(
  db: Database.Database,
): OdNextRolloutControlRow | null {
  return db.prepare(`
    SELECT mode,
           reason_code AS reasonCode,
           latched_at AS latchedAt,
           updated_at AS updatedAt,
           revision,
           last_event AS lastEvent,
           last_event_reason_code AS lastEventReasonCode
      FROM strategy_rollout_controls WHERE strategy_id = 'od-next-strategy'
  `).get() as OdNextRolloutControlRow | undefined ?? null;
}

export function readOdNextRolloutStop(
  db: Database.Database,
): { mode: 'off' | 'observe'; reasonCode: OdNextRolloutStopReasonCode } | null {
  const row = readOdNextRolloutControlRow(db);
  return row?.mode && row.reasonCode
    ? { mode: row.mode, reasonCode: row.reasonCode }
    : null;
}

export function latchOdNextRolloutStop(
  db: Database.Database,
  input: {
    mode: 'off' | 'observe';
    reasonCode: OdNextRolloutStopReasonCode;
    updatedAt?: number;
  },
): void {
  const updatedAt = input.updatedAt ?? Date.now();
  db.prepare(`
    INSERT INTO strategy_rollout_controls (
      strategy_id, mode, reason_code, latched_at, updated_at, revision,
      last_event, last_event_reason_code
    )
    VALUES ('od-next-strategy', ?, ?, ?, ?, 1, 'latched', ?)
    ON CONFLICT(strategy_id) DO UPDATE SET
      mode = CASE
        WHEN strategy_rollout_controls.mode = 'off' THEN 'off'
        ELSE excluded.mode
      END,
      reason_code = CASE
        WHEN strategy_rollout_controls.mode = 'off' AND excluded.mode = 'observe'
          THEN strategy_rollout_controls.reason_code
        ELSE excluded.reason_code
      END,
      latched_at = CASE
        WHEN strategy_rollout_controls.mode = 'off' AND excluded.mode = 'observe'
          THEN strategy_rollout_controls.latched_at
        ELSE excluded.latched_at
      END,
      updated_at = excluded.updated_at,
      revision = strategy_rollout_controls.revision + 1,
      last_event = 'latched',
      last_event_reason_code = CASE
        WHEN strategy_rollout_controls.mode = 'off' AND excluded.mode = 'observe'
          THEN strategy_rollout_controls.reason_code
        ELSE excluded.last_event_reason_code
      END
  `).run(
    input.mode,
    input.reasonCode,
    updatedAt,
    updatedAt,
    input.reasonCode,
  );
}

export function clearOdNextRolloutStop(db: Database.Database): void {
  const row = readOdNextRolloutControlRow(db);
  if (!row || !row.mode) return;
  resetOdNextRolloutStop(db, {
    expectedRevision: row.revision,
    reasonCode: 'internal_test_reset',
  });
}

export function resetOdNextRolloutStop(
  db: Database.Database,
  input: {
    expectedRevision: number;
    reasonCode: OdNextRolloutClearReasonCode;
    updatedAt?: number;
  },
): { ok: true; changed: boolean } | { ok: false; currentRevision: number } {
  const row = readOdNextRolloutControlRow(db);
  if (!row) {
    return input.expectedRevision === 0
      ? { ok: true, changed: false }
      : { ok: false, currentRevision: 0 };
  }
  if (row.revision !== input.expectedRevision) {
    return { ok: false, currentRevision: row.revision };
  }
  if (!row.mode) return { ok: true, changed: false };
  const updatedAt = input.updatedAt ?? Date.now();
  const result = db.prepare(`
    UPDATE strategy_rollout_controls
       SET mode = NULL,
           reason_code = NULL,
           latched_at = NULL,
           updated_at = ?,
           revision = revision + 1,
           last_event = 'cleared',
           last_event_reason_code = ?
     WHERE strategy_id = 'od-next-strategy'
       AND revision = ?
       AND mode IS NOT NULL
  `).run(updatedAt, input.reasonCode, input.expectedRevision);
  return result.changes === 1
    ? { ok: true, changed: true }
    : {
        ok: false,
        currentRevision: readOdNextRolloutControlRow(db)?.revision ?? 0,
      };
}

export function readOdNextRolloutControlStatus(
  db: Database.Database,
  env: NodeJS.ProcessEnv = process.env,
  appConfig?: OdNextRolloutAppConfig | null,
): {
  strategyId: 'od-next-strategy';
  scope: 'daemon_instance';
  requestedMode: OdNextRolloutMode;
  requestedModeSource: OdNextRolloutModeSource;
  effectiveMode: OdNextRolloutMode;
  latch: null | {
    mode: 'off' | 'observe';
    reasonCode: OdNextRolloutStopReasonCode;
    latchedAt: number;
  };
  revision: number;
  updatedAt: number | null;
  lastEvent: null | {
    action: 'latched' | 'cleared';
    reasonCode: OdNextRolloutControlReasonCode;
    at: number;
  };
  resetAllowed: boolean;
} {
  const policy = readOdNextRolloutPolicy(env, appConfig);
  const row = readOdNextRolloutControlRow(db);
  const latch = row?.mode && row.reasonCode && row.latchedAt != null
    ? { mode: row.mode, reasonCode: row.reasonCode, latchedAt: row.latchedAt }
    : null;
  const effectiveMode: OdNextRolloutMode = policy.requestedMode === 'off'
    || !policy.contentEnabled
    || !policy.behaviorEnabled
    ? 'off'
    : latch?.mode ?? policy.requestedMode;
  return {
    strategyId: 'od-next-strategy',
    scope: 'daemon_instance',
    requestedMode: policy.requestedMode,
    requestedModeSource: policy.requestedModeSource,
    effectiveMode,
    latch,
    revision: row?.revision ?? 0,
    updatedAt: row?.updatedAt ?? null,
    lastEvent: row
      ? {
          action: row.lastEvent,
          reasonCode: row.lastEventReasonCode,
          at: row.updatedAt,
        }
      : null,
    resetAllowed: Boolean(latch),
  };
}

export function stopModeForOdNextSignal(
  signal: string,
): 'off' | 'observe' | null {
  if (signal === 'machine_contract_leak' || signal === 'default_critique_skipped') return 'off';
  if (
    signal === 'native_resume_failed'
    || signal === 'route_mode_drift'
    || signal === 'complex_child_unverified'
    || signal === 'threshold_exceeded'
    || signal === 'quality_regression'
  ) return 'observe';
  return null;
}

export function odNextRolloutSignalForRun(input: {
  durationMs: number;
  maxDurationMs?: number | null;
}): 'threshold_exceeded' | null {
  if (
    typeof input.maxDurationMs === 'number'
    && Number.isFinite(input.maxDurationMs)
    && input.maxDurationMs >= 0
    && input.durationMs > input.maxDurationMs
  ) return 'threshold_exceeded';
  return null;
}
