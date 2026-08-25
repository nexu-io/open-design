export type OdNextRolloutMode = 'off' | 'observe' | 'active';

export type OdNextRolloutTaskType = 'prototype' | 'ppt' | 'marketing' | 'hyperframes';

/**
 * Immutable evaluation captured once when a logical Run is claimed. The same
 * envelope drives status diagnostics and created/finished/reconcile telemetry;
 * callers must not recompute it from later environment or latch state.
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

export type OdNextRolloutStopReasonCode =
  | 'machine_contract_leak'
  | 'default_critique_skipped'
  | 'native_resume_failed'
  | 'route_mode_drift'
  | 'complex_child_unverified'
  | 'threshold_exceeded'
  | 'quality_regression';

export type OdNextRolloutClearReasonCode =
  | 'operator_reset'
  | 'internal_test_reset';

export type OdNextRolloutControlReasonCode =
  | OdNextRolloutStopReasonCode
  | OdNextRolloutClearReasonCode;

export interface OdNextRolloutLatchStatus {
  mode: 'off' | 'observe';
  reasonCode: OdNextRolloutStopReasonCode;
  latchedAt: number;
}

export interface OdNextRolloutControlStatus {
  strategyId: 'od-next-strategy';
  scope: 'daemon_instance';
  requestedMode: OdNextRolloutMode;
  effectiveMode: OdNextRolloutMode;
  latch: OdNextRolloutLatchStatus | null;
  revision: number;
  updatedAt: number | null;
  lastEvent: null | {
    action: 'latched' | 'cleared';
    reasonCode: OdNextRolloutControlReasonCode;
    at: number;
  };
  resetAllowed: boolean;
}

export interface ResetOdNextRolloutControlRequest {
  expectedRevision: number;
}

export interface OdNextRolloutControlResponse {
  status: OdNextRolloutControlStatus;
}
