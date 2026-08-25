import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

import {
  clearOdNextRolloutStop,
  evaluateOdNextRollout,
  latchOdNextRolloutStop,
  migrateOdNextRolloutStore,
  odNextRolloutSignalForRun,
  odNextTaskTypeForProjectScenarioBinding,
  readOdNextRolloutControlStatus,
  readOdNextRolloutPolicy,
  readOdNextRolloutStop,
  resetOdNextRolloutStop,
  stableOdNextAssignmentBucket,
  stopModeForOdNextSignal,
} from '../../../src/strategies/od-next/rollout.js';
import {
  rolloutStopSignalForBlockedContinuation,
} from '../../../src/strategies/od-next/automatic-continuation-service.js';
import { latchOdNextRolloutStopOperationally } from '../../../src/strategies/od-next/rollout-control-telemetry.js';
import { odNextRolloutAnalyticsProperties } from '../../../src/strategies/od-next/rollout-analytics.js';

function syntheticPolicy() {
  return readOdNextRolloutPolicy({
    OD_NEXT_STRATEGY_ROLLOUT: 'active',
    OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY: '1',
  });
}

describe('OD Next controlled rollout', () => {
  it('defaults production rollout to all four owned artifact types while retaining explicit off', () => {
    const policy = readOdNextRolloutPolicy({});
    expect(policy).toMatchObject({
      requestedMode: 'active',
      eligibleTaskTypes: ['prototype', 'ppt', 'marketing', 'hyperframes'],
      productionActiveApproved: true,
      assignmentPercent: 100,
    });
    expect(readOdNextRolloutPolicy({ OD_NEXT_STRATEGY_ROLLOUT: 'off' }).requestedMode)
      .toBe('off');
    expect([
      odNextTaskTypeForProjectScenarioBinding({ provenance: 'automatic_default', taskProfile: 'prototype' }),
      odNextTaskTypeForProjectScenarioBinding({ provenance: 'automatic_default', taskProfile: 'ppt' }),
      odNextTaskTypeForProjectScenarioBinding({ provenance: 'automatic_default', taskProfile: 'marketing' }),
      odNextTaskTypeForProjectScenarioBinding({ provenance: 'automatic_default', taskProfile: 'hyperframes' }),
    ]).toEqual(['prototype', 'ppt', 'marketing', 'hyperframes']);
    expect(odNextTaskTypeForProjectScenarioBinding({ provenance: 'explicit_user', taskProfile: 'prototype' })).toBeNull();
    expect(odNextTaskTypeForProjectScenarioBinding({ provenance: 'legacy_unknown', taskProfile: 'ppt' })).toBeNull();
    for (const taskType of ['prototype', 'ppt', 'marketing', 'hyperframes'] as const) {
      expect(evaluateOdNextRollout({
        policy,
        assignmentIdentity: `default:${taskType}`,
        taskType,
        agentId: 'opencode',
        agentVersion: '1.18.18',
        sourceKind: 'bundled',
        runtimeCapabilityVerified: true,
      })).toMatchObject({ requestedMode: 'active', effectiveMode: 'active', eligible: true });
    }
  });

  it('keeps off and observe behavior-inert and never calls an active bucket eligible', () => {
    for (const requestedMode of ['off', 'observe'] as const) {
      const decision = evaluateOdNextRollout({
        policy: { ...syntheticPolicy(), requestedMode },
        assignmentIdentity: 'project:conversation',
        taskType: 'prototype',
        agentId: 'codex',
        agentVersion: 'codex-e2e 0.0.0',
        sourceKind: 'bundled',
      });
      expect(decision).toMatchObject({ requestedMode, effectiveMode: requestedMode, eligible: false });
    }
  });

  it('projects one decision into a fixed low-cardinality analytics allowlist', () => {
    const decision = evaluateOdNextRollout({
      policy: syntheticPolicy(),
      assignmentIdentity: 'project:conversation',
      taskType: 'prototype',
      agentId: 'codex',
      agentVersion: 'codex-e2e 0.0.0',
      sourceKind: 'bundled',
    });
    expect(Object.keys(odNextRolloutAnalyticsProperties(decision)).sort()).toEqual([
      'strategy_rollout_assignment_class',
      'strategy_rollout_decision_class',
      'strategy_rollout_effective_mode',
      'strategy_rollout_primary_reason_code',
      'strategy_rollout_requested_mode',
      'strategy_rollout_synthetic_canary',
      'strategy_rollout_task_profile',
    ]);
    expect(odNextRolloutAnalyticsProperties(decision)).not.toHaveProperty(
      'strategy_rollout_assignment_bucket',
    );
    expect(odNextRolloutAnalyticsProperties(decision)).not.toHaveProperty(
      'strategy_rollout_reason_codes',
    );
  });

  it('requires complete capability evidence without using CLI version as an admission pin', () => {
    const base = {
      assignmentIdentity: 'project:conversation',
      taskType: 'prototype' as const,
      agentId: 'codex',
      sourceKind: 'bundled',
    };
    expect(evaluateOdNextRollout({
      ...base,
      policy: readOdNextRolloutPolicy({ OD_NEXT_STRATEGY_ROLLOUT: 'active' }),
      agentVersion: 'codex 9.9.9',
    })).toMatchObject({
      effectiveMode: 'observe',
      eligible: false,
      reasonCodes: expect.arrayContaining(['od_next_rollout_x1_capability_fixture_unverified']),
    });
    expect(evaluateOdNextRollout({
      ...base,
      policy: readOdNextRolloutPolicy({ OD_NEXT_STRATEGY_ROLLOUT: 'active' }),
      agentVersion: null,
      runtimeCapabilityVerified: true,
    })).toMatchObject({
      effectiveMode: 'active',
      eligible: true,
    });
    expect(evaluateOdNextRollout({
      ...base,
      policy: syntheticPolicy(),
      agentVersion: null,
    })).toMatchObject({ effectiveMode: 'active', eligible: true, syntheticCanary: true });
  });

  it('gates task bucket, agent, version, bundled provenance, content, behavior, and assignment', () => {
    const decision = evaluateOdNextRollout({
      policy: {
        ...syntheticPolicy(),
        contentEnabled: false,
        behaviorEnabled: false,
        assignmentPercent: 0,
      },
      assignmentIdentity: 'same-id',
      taskType: null,
      agentId: 'cursor',
      agentVersion: 'cursor-e2e 0.0.0',
      sourceKind: 'community',
    });
    expect(decision.effectiveMode).toBe('off');
    expect(decision.reasonCodes).toEqual(expect.arrayContaining([
      'od_next_rollout_content_disabled',
      'od_next_rollout_behavior_disabled',
      'od_next_rollout_task_bucket_ineligible',
      'od_next_rollout_agent_ineligible',
      'od_next_rollout_bundled_identity_required',
      'od_next_rollout_assignment_excluded',
    ]));
  });

  it('reconstructs stable assignment across evaluations', () => {
    const bucket = stableOdNextAssignmentBucket('project:conversation', 'salt');
    expect(stableOdNextAssignmentBucket('project:conversation', 'salt')).toBe(bucket);
    expect(bucket).toBeGreaterThanOrEqual(0);
    expect(bucket).toBeLessThan(10_000);
  });

  it('persists automatic stop and manual rollback without touching task rows', () => {
    const db = new Database(':memory:');
    migrateOdNextRolloutStore(db);
    latchOdNextRolloutStop(db, { mode: 'observe', reasonCode: 'native_resume_failed', updatedAt: 1 });
    expect(readOdNextRolloutStop(db)).toEqual({ mode: 'observe', reasonCode: 'native_resume_failed' });
    expect(readOdNextRolloutControlStatus(db, { OD_NEXT_STRATEGY_ROLLOUT: 'active' }))
      .toMatchObject({
        scope: 'daemon_instance',
        requestedMode: 'active',
        effectiveMode: 'observe',
        revision: 1,
        lastEvent: { action: 'latched', reasonCode: 'native_resume_failed', at: 1 },
      });
    latchOdNextRolloutStop(db, { mode: 'off', reasonCode: 'machine_contract_leak', updatedAt: 2 });
    expect(readOdNextRolloutStop(db)).toEqual({ mode: 'off', reasonCode: 'machine_contract_leak' });
    latchOdNextRolloutStop(db, { mode: 'observe', reasonCode: 'quality_regression', updatedAt: 3 });
    expect(readOdNextRolloutStop(db)).toEqual({
      mode: 'off',
      reasonCode: 'machine_contract_leak',
    });
    expect(resetOdNextRolloutStop(db, {
      expectedRevision: 2,
      reasonCode: 'operator_reset',
      updatedAt: 4,
    })).toEqual({ ok: false, currentRevision: 3 });
    clearOdNextRolloutStop(db);
    expect(readOdNextRolloutStop(db)).toBeNull();
    expect(readOdNextRolloutControlStatus(db, { OD_NEXT_STRATEGY_ROLLOUT: 'off' }))
      .toMatchObject({
        requestedMode: 'off',
        effectiveMode: 'off',
        revision: 4,
        resetAllowed: false,
        lastEvent: { action: 'cleared', reasonCode: 'internal_test_reset' },
      });
    latchOdNextRolloutStop(db, {
      mode: 'observe',
      reasonCode: 'threshold_exceeded',
      updatedAt: 5,
    });
    expect(readOdNextRolloutStop(db)).toEqual({
      mode: 'observe',
      reasonCode: 'threshold_exceeded',
    });
    db.close();
  });

  it('maps execution-local stop signals without any observability dependency', () => {
    expect(stopModeForOdNextSignal('native_resume_failed')).toBe('observe');
    expect(stopModeForOdNextSignal('machine_contract_leak')).toBe('off');
    expect(stopModeForOdNextSignal('unknown')).toBeNull();
    expect(odNextRolloutSignalForRun({ durationMs: 101, maxDurationMs: 100 }))
      .toBe('threshold_exceeded');
    expect(odNextRolloutSignalForRun({ durationMs: 100, maxDurationMs: 100 }))
      .toBeNull();
  });

  it('emits a bounded operational event when a run latches the instance', async () => {
    const db = new Database(':memory:');
    migrateOdNextRolloutStore(db);
    const capture = vi.fn().mockResolvedValue(undefined);
    latchOdNextRolloutStopOperationally({
      db,
      analytics: {
        capture,
        captureSafety: vi.fn(),
        mergeAnonymousPerson: vi.fn(),
        identifyGroup: vi.fn(),
        shutdown: vi.fn(),
      },
      analyticsContext: {
        deviceId: 'device',
        sessionId: 'session',
        clientType: 'web',
        locale: 'en',
        requestId: null,
      },
      appVersion: '0.19.2',
      mode: 'observe',
      reasonCode: 'native_resume_failed',
    });
    await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(1));
    expect(capture).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'strategy_rollout_control_changed',
      properties: {
        strategy_id: 'od-next-strategy',
        action: 'latch',
        scope: 'daemon_instance',
        requested_latch_mode: 'observe',
        effective_latch_mode: 'observe',
        reason_code: 'native_resume_failed',
        effective_mode: 'observe',
      },
    }));
    db.close();
  });

  it('does not stop the whole daemon for one agent-side protocol defect', () => {
    // Field-observed regression: two vague prompts made the agent emit a
    // clarification state carrying a premature executionMode. That is a
    // single-task agent defect — the machine block never reached the user —
    // yet it latched a global hard `off`, silently returning every later
    // request in the daemon to the legacy path across restarts.
    for (const code of [
      'od_next_protocol_runtime_state_invalid_schema',
      'od_next_protocol_runtime_state_missing',
      'od_next_protocol_runtime_state_invalid_json',
      'od_next_protocol_runtime_state_duplicate',
      'od_next_protocol_plan_contract_invalid_schema',
      'od_next_protocol_plan_contract_duplicate',
      'od_next_protocol_plan_contract_missing',
      'od_next_protocol_plan_contract_unexpected',
      'od_next_protocol_stage_mismatch',
    ]) {
      expect(rolloutStopSignalForBlockedContinuation([code]), code).toBeNull();
    }

    // A block the stream could not delimit or had to drop is a genuine
    // contract-boundary failure and still stops the rollout.
    expect(rolloutStopSignalForBlockedContinuation([
      'od_next_protocol_machine_block_malformed',
    ])).toBe('machine_contract_leak');
    expect(rolloutStopSignalForBlockedContinuation([
      'od_next_protocol_machine_block_too_large',
    ])).toBe('machine_contract_leak');

    // Route/mode drift and unverified children keep their existing signals.
    expect(rolloutStopSignalForBlockedContinuation([
      'od_next_protocol_route_mismatch',
    ])).toBe('route_mode_drift');
    expect(rolloutStopSignalForBlockedContinuation([
      'od_next_protocol_execution_mode_mismatch',
    ])).toBe('route_mode_drift');
  });

  it('never turns unverifiable Children into the daemon-wide stop', () => {
    // The other two signals mean OD Next's own contract broke, which is true
    // whichever agent hit it. Unverifiable Children are a property of ONE
    // runtime — Vela ships no child-lifecycle producer, so an AMR complex Run
    // cannot be certified at all — and that task is already fail-closed with
    // its reason codes persisted. Latching took OD Next away from Codex,
    // Claude and OpenCode because a fourth runtime lacks a capability, and only
    // an operator `od strategy rollout reset` gave it back.
    for (const reasonCode of [
      'od_next_complex_child_evidence_missing',
      'od_next_complex_child_evidence_invalid',
      'od_next_complex_child_started_missing',
      'od_next_complex_child_terminal_missing',
    ]) {
      expect(rolloutStopSignalForBlockedContinuation([reasonCode]), reasonCode).toBeNull();
    }

    // A genuine contract break still stops the daemon, even alongside a child
    // code, because that one is not about the runtime.
    expect(rolloutStopSignalForBlockedContinuation([
      'od_next_complex_child_evidence_missing',
      'od_next_protocol_route_mismatch',
    ])).toBe('route_mode_drift');
  });

  it('requires exact HyperFrames metadata and lets hard off dominate an observe latch', () => {
    expect(odNextTaskTypeForProjectScenarioBinding({ provenance: 'automatic_default' })).toBeNull();
    expect(odNextTaskTypeForProjectScenarioBinding({
      provenance: 'automatic_default',
      taskProfile: 'hyperframes',
    })).toBe('hyperframes');
    expect(evaluateOdNextRollout({
      policy: { ...syntheticPolicy(), requestedMode: 'off' },
      assignmentIdentity: 'project:conversation',
      taskType: 'prototype',
      agentId: 'codex',
      agentVersion: 'codex-e2e 0.0.0',
      sourceKind: 'bundled',
      stoppedMode: 'observe',
    }).effectiveMode).toBe('off');
  });
});
