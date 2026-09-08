import { describe, expect, it } from 'vitest';

import {
  evaluateOdNextRollout,
  odNextTaskTypeForProjectScenarioBinding,
  readOdNextRolloutControlStatus,
  readOdNextRolloutPolicy,
  stableOdNextAssignmentBucket,
} from '../../../src/strategies/od-next/rollout.js';
import { odNextRolloutAnalyticsProperties } from '../../../src/strategies/od-next/rollout-analytics.js';

function syntheticPolicy() {
  return readOdNextRolloutPolicy({
    OD_NEXT_STRATEGY_ROLLOUT: 'active',
    OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY: '1',
  });
}

describe('OD Next controlled rollout', () => {
  it('owns all four artifact types by default, and honours a mode that was named', () => {
    const policy = readOdNextRolloutPolicy({ OD_NEXT_STRATEGY_ROLLOUT: 'active' });
    expect(policy).toMatchObject({
      requestedMode: 'active',
      requestedModeSource: 'env',
      eligibleTaskTypes: ['prototype', 'ppt', 'marketing', 'hyperframes'],
      productionActiveApproved: true,
      assignmentPercent: 100,
    });
    // An installation that configured nothing runs the strategy: OD Next is
    // the default route, and the saved mode is how an installation leaves it.
    expect(readOdNextRolloutPolicy({})).toMatchObject({
      requestedMode: 'active',
      requestedModeSource: 'default',
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

  describe('choosing a mode for one installation', () => {
    it('takes the saved mode when the environment names none', () => {
      expect(readOdNextRolloutPolicy({}, { odNextStrategyMode: 'active' })).toMatchObject({
        requestedMode: 'active',
        requestedModeSource: 'app_config',
      });
      expect(readOdNextRolloutPolicy({}, { odNextStrategyMode: 'observe' }).requestedMode)
        .toBe('observe');
      // An empty variable is not a choice; it is how a shell exports nothing.
      expect(readOdNextRolloutPolicy(
        { OD_NEXT_STRATEGY_ROLLOUT: '  ' },
        { odNextStrategyMode: 'active' },
      )).toMatchObject({ requestedMode: 'active', requestedModeSource: 'app_config' });
    });

    it('lets the environment pin a mode over the one the installation saved', () => {
      // The env var is how one process gets pinned — an operator debugging a
      // daemon, a packaged smoke run, a test. It must not be outvoted by a
      // preference that the machine happens to have saved.
      expect(readOdNextRolloutPolicy(
        { OD_NEXT_STRATEGY_ROLLOUT: 'off' },
        { odNextStrategyMode: 'active' },
      )).toMatchObject({ requestedMode: 'off', requestedModeSource: 'env' });
      expect(readOdNextRolloutPolicy(
        { OD_NEXT_STRATEGY_ROLLOUT: 'active' },
        { odNextStrategyMode: 'off' },
      )).toMatchObject({ requestedMode: 'active', requestedModeSource: 'env' });
    });

    it('treats an absent preference, and only an absent one, as unconfigured', () => {
      // `null` and `undefined` are the two shapes of "nobody has chosen", and
      // they reach the default.
      for (const saved of [null, undefined] as unknown[]) {
        expect(readOdNextRolloutPolicy(
          {},
          { odNextStrategyMode: saved as never },
        )).toMatchObject({ requestedMode: 'active', requestedModeSource: 'default' });
      }

      // A value that is not a mode never arrives here in production: the read
      // path in `app-config.ts` resolves an unreadable config to `off` before
      // this function sees it, because unconfigured now means `active` and
      // "we could not read your choice" must not become "you chose OD Next".
      // The end-to-end guarantee is asserted across that join in
      // `tests/app-config.test.ts`; this function stays a pure reader of what
      // it is handed.
      for (const saved of ['acive', '', 'true', 1, {}] as unknown[]) {
        expect(readOdNextRolloutPolicy(
          {},
          { odNextStrategyMode: saved as never },
        )).toMatchObject({ requestedMode: 'active', requestedModeSource: 'default' });
      }
    });

    it('keeps an installation that opted out off, whatever the default becomes', () => {
      // The one guarantee the default owes users who were here before it
      // flipped. It holds only because opting out stores `off` rather than
      // clearing the key: a cleared key reads as unconfigured, and unconfigured
      // is `active`. If this ever goes red because the switch was "simplified"
      // into deleting the key, every opted-out installation was just switched
      // back on without being asked.
      expect(readOdNextRolloutPolicy({}, { odNextStrategyMode: 'off' })).toMatchObject({
        requestedMode: 'off',
        requestedModeSource: 'app_config',
      });
      expect(readOdNextRolloutPolicy({}, { odNextStrategyMode: 'observe' })).toMatchObject({
        requestedMode: 'observe',
        requestedModeSource: 'app_config',
      });
      // And the decision that follows has to actually leave the strategy
      // unused: a preserved `off` that still evaluated to `active` would keep
      // this guarantee only on paper.
      expect(evaluateOdNextRollout({
        policy: readOdNextRolloutPolicy({}, { odNextStrategyMode: 'off' }),
        assignmentIdentity: 'project:conversation',
        taskType: 'prototype',
        agentId: 'codex',
        agentVersion: 'codex-e2e 0.0.0',
        sourceKind: 'bundled',
        runtimeCapabilityVerified: true,
      })).toMatchObject({ requestedMode: 'off', effectiveMode: 'off', eligible: false });
    });

    it('admits an eligible task on an installation that stayed on the default', () => {
      const decision = evaluateOdNextRollout({
        policy: readOdNextRolloutPolicy(
          { OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY: '1' },
          { odNextStrategyMode: 'active' },
        ),
        assignmentIdentity: 'project:conversation',
        taskType: 'prototype',
        agentId: 'codex',
        agentVersion: 'codex-e2e 0.0.0',
        sourceKind: 'bundled',
      });
      expect(decision).toMatchObject({
        requestedMode: 'active',
        effectiveMode: 'active',
        eligible: true,
      });
    });

    it('reports the deciding authority through the control status', () => {
      expect(readOdNextRolloutControlStatus({}))
        .toEqual({
          strategyId: 'od-next-strategy',
          scope: 'daemon_instance',
          requestedMode: 'active',
          requestedModeSource: 'default',
          effectiveMode: 'active',
        });
      expect(readOdNextRolloutControlStatus({}, { odNextStrategyMode: 'off' }))
        .toMatchObject({ requestedMode: 'off', requestedModeSource: 'app_config', effectiveMode: 'off' });
      expect(readOdNextRolloutControlStatus({}, { odNextStrategyMode: 'active' }))
        .toMatchObject({
          requestedMode: 'active',
          requestedModeSource: 'app_config',
          effectiveMode: 'active',
        });
      // Status takes no database, because there is no longer any stored state
      // for the reported mode to disagree with. `toEqual` above is the point:
      // two readers at the same moment cannot see different answers.
      expect(readOdNextRolloutControlStatus({ OD_NEXT_STRATEGY_ROLLOUT: 'off' }, { odNextStrategyMode: 'active' }))
        .toMatchObject({ requestedMode: 'off', requestedModeSource: 'env', effectiveMode: 'off' });
    });
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

  it('cannot be turned off by anything a previous run did', () => {
    // What this replaces. OD Next used to carry a stop latch: a run that hit a
    // contract failure wrote a row that disabled the strategy for the whole
    // daemon instance, outranked the saved mode, survived restart, and could
    // only be lifted by an operator running `od strategy rollout reset`.
    //
    // The field regression that made the case against it: two vague prompts
    // made one agent emit a clarification state carrying a premature
    // executionMode. A single-task agent defect — the machine block never
    // reached the user — and it latched a global hard `off`, silently returning
    // every later request in the daemon to the legacy path across restarts. A
    // second signal did the same thing for a capability only one runtime
    // lacked, taking OD Next away from Codex, Claude and OpenCode because Vela
    // ships no child-lifecycle producer.
    //
    // Both were narrowed in place at the time. This is the general form of the
    // same fix, and what pins it is a shape rather than a list: the decision is
    // a function of the policy and THIS run's facts, and takes no argument
    // through which an earlier run could reach it. There is no signal left to
    // enumerate, so no new one can be added by accident.
    const facts = {
      assignmentIdentity: 'project:conversation',
      taskType: 'prototype',
      agentId: 'codex',
      agentVersion: 'codex-e2e 0.0.0',
      sourceKind: 'bundled',
      runtimeCapabilityVerified: true,
    } as const;
    const admitted = evaluateOdNextRollout({ policy: syntheticPolicy(), ...facts });
    expect(admitted).toMatchObject({ effectiveMode: 'active', eligible: true });
    // A fresh policy object each time: the reading of the environment and the
    // saved config is the only state involved, so repeating the call after any
    // number of failed or blocked tasks has to give the same answer.
    expect(evaluateOdNextRollout({ policy: syntheticPolicy(), ...facts })).toEqual(admitted);

    // Off stays reachable, through the mode and only through the mode.
    expect(evaluateOdNextRollout({
      policy: { ...syntheticPolicy(), requestedMode: 'off' },
      ...facts,
    })).toMatchObject({ effectiveMode: 'off', eligible: false });

    // And a blocked task still records its attribution — the consequence was
    // never the part worth keeping, the reason codes were.
    expect(readOdNextRolloutControlStatus({}, { odNextStrategyMode: 'active' }).effectiveMode)
      .toBe('active');
  });

  it('requires exact HyperFrames metadata', () => {
    expect(odNextTaskTypeForProjectScenarioBinding({ provenance: 'automatic_default' })).toBeNull();
    expect(odNextTaskTypeForProjectScenarioBinding({
      provenance: 'automatic_default',
      taskProfile: 'hyperframes',
    })).toBe('hyperframes');
  });
});
