export type OdNextRolloutMode = 'off' | 'observe' | 'active';

export type OdNextRolloutTaskType = 'prototype' | 'ppt' | 'marketing' | 'hyperframes';

/**
 * Which authority decided the requested mode.
 *
 * `env` is `OD_NEXT_STRATEGY_ROLLOUT`, `app_config` is the installation's
 * saved `odNextStrategyMode`, and `default` means neither was set. Reported so
 * an operator who just configured the mode can confirm their configuration is
 * the one in effect instead of inferring it from the resulting mode.
 */
export type OdNextRolloutModeSource = 'env' | 'app_config' | 'default';

/**
 * Immutable evaluation captured once when a logical Run is claimed. The same
 * envelope drives status diagnostics and created/finished/reconcile telemetry;
 * callers must not recompute it from later environment state.
 */
export interface OdNextRolloutDecision {
  schemaVersion: 1;
  decisionClass: 'active' | 'observe' | 'off' | 'explicit_user' | 'not_applicable';
  requestedMode: OdNextRolloutMode;
  effectiveMode: OdNextRolloutMode;
  taskType: OdNextRolloutTaskType | null;
  assignmentBucket: number;
  eligible: boolean;
  syntheticCanary: boolean;
  reasonCodes: string[];
  primaryReasonCode: string;
}

/**
 * What decides OD Next for this daemon, and what that decision came out as.
 *
 * Read-only, and deliberately without a way to change it from here. This status
 * used to carry a stop latch: an automatic, daemon-wide disable that outranked
 * the saved mode, survived restart, and could only be lifted by an operator
 * running `od strategy rollout reset`. It is gone. Nothing turns OD Next off
 * for an installation except that installation asking for it, so `effectiveMode`
 * is now derived entirely from `requestedMode` and the content/behavior flags —
 * there is no state behind this endpoint for a caller to reconcile against.
 *
 * `requestedModeSource` is why this is still worth an endpoint: it names the
 * authority, which the saved mode alone cannot. `default` and a saved `off`
 * resolve to opposite routes.
 */
export interface OdNextRolloutControlStatus {
  strategyId: 'od-next-strategy';
  scope: 'daemon_instance';
  requestedMode: OdNextRolloutMode;
  requestedModeSource: OdNextRolloutModeSource;
  effectiveMode: OdNextRolloutMode;
}

export interface OdNextRolloutControlResponse {
  status: OdNextRolloutControlStatus;
}
