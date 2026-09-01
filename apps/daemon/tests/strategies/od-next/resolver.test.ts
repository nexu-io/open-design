import { describe, expect, it } from 'vitest';
import type { OpenDesignPlanContractV2 } from '@open-design/contracts';

import {
  decideStrategyRequestRoute,
  resolveDaemonOwnedOdNextExecutionPreflight,
  resolveStrategyFields,
  runExecutionPreflight,
  runIntakePreflight,
} from '../../../src/strategies/od-next/resolver.js';

function daemonPlan(
  taskType: string,
  route: string,
  outputKind: string,
  inputRefs: string[] = ['request'],
): OpenDesignPlanContractV2 {
  return {
    taskProfile: {
      taskType,
      requiredDeliverables: [{ id: outputKind, kind: outputKind }],
    },
    runManifest: { productionRoutes: [route], inputRefs },
  } as OpenDesignPlanContractV2;
}

describe('OD Next resolver and preflight', () => {
  it('preserves locked values unless one explicit user change produces a ChangeSet', () => {
    expect(resolveStrategyFields({
      audience: {
        lockedValue: 'operators',
        missingPolicy: 'ask',
        candidates: [{ source: 'project_metadata', value: 'executives' }],
      },
      format: {
        lockedValue: 'html',
        missingPolicy: 'block',
        candidates: [{
          source: 'user_explicit',
          value: 'tsx',
          explicitChange: true,
        }],
      },
    })).toEqual({
      values: { audience: 'operators', format: 'tsx' },
      fields: {
        audience: { status: 'confirmed', source: 'locked', value: 'operators' },
        format: { status: 'confirmed', source: 'user_explicit', value: 'tsx' },
      },
      changeSet: [{ field: 'format', from: 'html', to: 'tsx' }],
      askFields: [],
      blockedFields: [],
      conflictedFields: [],
    });
  });

  it('reports equal-authority conflicts and applies infer/default/ask/block policies', () => {
    const result = resolveStrategyFields({
      goal: {
        missingPolicy: 'block',
        candidates: [
          { source: 'user_explicit', value: 'A' },
          { source: 'user_explicit', value: 'B' },
        ],
      },
      platform: { missingPolicy: 'infer', inferredValue: 'responsive' },
      theme: { missingPolicy: 'default', defaultValue: 'neutral' },
      audience: { missingPolicy: 'ask' },
      source: { missingPolicy: 'block' },
    });

    expect(result.values).toEqual({ platform: 'responsive', theme: 'neutral' });
    expect(result.fields).toMatchObject({
      goal: { status: 'conflicted' },
      platform: { status: 'inferred', value: 'responsive' },
      theme: { status: 'defaulted', value: 'neutral' },
      audience: { status: 'missing' },
      source: { status: 'missing' },
    });
    expect(result.askFields).toEqual(['audience']);
    expect(result.blockedFields).toEqual(['source']);
    expect(result.conflictedFields).toEqual(['goal']);
  });

  it('falls back from Direct Edit only before route lock and Build start', () => {
    const ineligible = {
      editableBaselineExists: false,
      localAndUnambiguous: true,
      canonicalDeliverableStable: true,
      deliverableSetStable: true,
      dependenciesBounded: true,
    };
    expect(decideStrategyRequestRoute({
      preference: 'direct_edit',
      routeLocked: false,
      buildStarted: false,
      directEdit: ineligible,
    })).toEqual({
      route: 'full_plan',
      executionMode: null,
      reasonCodes: ['od_next_route_direct_edit_baseline_missing'],
    });
    expect(() => decideStrategyRequestRoute({
      preference: 'direct_edit',
      routeLocked: true,
      buildStarted: true,
      directEdit: ineligible,
    })).toThrowError(expect.objectContaining({
      reasonCodes: ['od_next_route_locked_scope_escape'],
    }));
  });

  it('uses only declared input/capability facts for the two preflights', () => {
    expect(runIntakePreflight({
      inputRefs: [{ id: 'request', accessible: true }, { id: 'brand', accessible: false }],
      selectedAgentAvailable: true,
      nativeContinuation: 'unknown',
      taskProfileAvailable: false,
      dependencies: [{ id: 'font', available: false }],
    })).toEqual({
      status: 'blocked',
      reasonCodes: [
        'od_next_preflight_input_unavailable:brand',
        'od_next_preflight_native_continuation_unverified',
        'od_next_preflight_task_profile_unavailable',
        'od_next_preflight_dependency_unavailable:font',
      ],
    });

    expect(runExecutionPreflight({
      productionRoutes: [{ id: 'html', available: true }],
      dependencies: [{ id: 'renderer', available: true }],
      inputs: [{ id: 'request', available: true }],
      renderers: [],
      exporters: [],
      templates: [],
      outputKinds: [{ id: 'prototype', supported: true }],
    })).toEqual({ status: 'passed', reasonCodes: [] });
  });

  it('allows only daemon-owned routes and output kinds for the four production profiles', () => {
    for (const [taskType, route, outputKind] of [
      ['prototype', 'prototype-html', 'prototype'],
      ['ppt', 'deck-html', 'presentation'],
      ['marketing', 'marketing-html', 'image'],
      ['hyperframes', 'hyperframes-html', 'video'],
    ] as const) {
      expect(runExecutionPreflight(resolveDaemonOwnedOdNextExecutionPreflight(
        daemonPlan(taskType, route, outputKind),
      ))).toEqual({ status: 'passed', reasonCodes: [] });
    }
    expect(runExecutionPreflight(resolveDaemonOwnedOdNextExecutionPreflight(
      daemonPlan('audio', 'audio-render', 'audio', ['host-path']),
    ))).toEqual({
      status: 'blocked',
      reasonCodes: [
        'od_next_preflight_route_unavailable:audio-render',
        'od_next_preflight_input_unavailable:host-path',
        'od_next_preflight_output_unsupported:audio',
      ],
    });
  });
});
