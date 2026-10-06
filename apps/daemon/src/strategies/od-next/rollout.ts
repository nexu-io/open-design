import { createHash } from 'node:crypto';

import type {
  OdNextRolloutDecision,
  OdNextRolloutMode,
  OdNextRolloutModeSource,
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
 * OD Next is the default route. An installation that configured nothing runs
 * `active`, so the strategy decides how a run behaves unless someone asked it
 * not to.
 *
 * That inverts which case is load-bearing. While the strategy was opt-in, the
 * question was whether anyone had asked for it, and an installation that lost
 * its saved mode simply kept the behaviour it already had. Now the question is
 * whether anyone asked against it, and an installation that loses its saved
 * mode is switched back on. So the invariant this function has to keep is:
 * an installation that opted out reads `off` through every later release.
 *
 * That rests on the config never reading as unconfigured unless it genuinely
 * is. `off` is a value the config carries, and the read path in `app-config.ts`
 * keeps three states apart rather than two: no file at all is the only one that
 * reaches the default below. A file that exists but cannot be believed —
 * malformed JSON, a non-object body, a mode this build does not recognise —
 * resolves to `off` before it gets here, because "we cannot read your choice"
 * must not become "you chose OD Next". See
 * `OD_NEXT_MODE_WHEN_CONFIG_UNREADABLE`.
 *
 * `assertWritableControlValues` covers the write path for the same reason, but
 * only the write path: it cannot do anything about a file that was already bad
 * on disk, hand-edited, or written by another version.
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
  return { mode: 'active', source: 'default' };
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
  const requestedActive = policy.requestedMode === 'active';
  const eligible = evaluateEligibility && requestedActive && reasons.length === 0;
  const effectiveMode: OdNextRolloutMode = !evaluateEligibility
    ? 'off'
    : policy.requestedMode === 'off'
    || !policy.contentEnabled
    || !policy.behaviorEnabled
    ? 'off'
    : eligible
      ? 'active'
      : 'observe';
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

/**
 * What decides OD Next for this daemon, and what that decision came out as.
 *
 * Derived, with nothing persisted behind it. This used to consult a
 * `strategy_rollout_controls` row — a stop latch that outranked the saved mode
 * for the whole daemon instance and survived restart. That row is gone, so the
 * effective mode is a pure function of the requested mode and the two content
 * flags, and two callers reading this at the same moment cannot disagree.
 *
 * `requestedModeSource` is what makes this worth reporting at all: the mode
 * alone does not say who chose it, and `default` and a saved `off` now resolve
 * to opposite routes.
 */
export function readOdNextRolloutControlStatus(
  env: NodeJS.ProcessEnv = process.env,
  appConfig?: OdNextRolloutAppConfig | null,
): {
  strategyId: 'od-next-strategy';
  scope: 'daemon_instance';
  requestedMode: OdNextRolloutMode;
  requestedModeSource: OdNextRolloutModeSource;
  effectiveMode: OdNextRolloutMode;
} {
  const policy = readOdNextRolloutPolicy(env, appConfig);
  const effectiveMode: OdNextRolloutMode = policy.requestedMode === 'off'
    || !policy.contentEnabled
    || !policy.behaviorEnabled
    ? 'off'
    : policy.requestedMode;
  return {
    strategyId: 'od-next-strategy',
    scope: 'daemon_instance',
    requestedMode: policy.requestedMode,
    requestedModeSource: policy.requestedModeSource,
    effectiveMode,
  };
}
