import type { OdNextRolloutDecision } from './rollout.js';

/** Low-cardinality fields shared byte-for-byte by run_created/run_finished. */
export function odNextRolloutAnalyticsProperties(
  decision: OdNextRolloutDecision | null,
): Record<string, unknown> {
  if (!decision) return {};
  return {
    strategy_rollout_decision_class: decision.decisionClass,
    strategy_rollout_requested_mode: decision.requestedMode,
    strategy_rollout_effective_mode: decision.effectiveMode,
    strategy_rollout_task_profile: decision.taskType ?? 'not_applicable',
    strategy_rollout_assignment_class: decision.eligible ? 'included' : 'not_included',
    strategy_rollout_primary_reason_code: decision.primaryReasonCode,
    strategy_rollout_synthetic_canary: decision.syntheticCanary,
  };
}
