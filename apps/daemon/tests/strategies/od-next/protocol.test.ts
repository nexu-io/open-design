import type { OpenDesignPlanContractV2 } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';

import {
  OdNextMachineProtocolStream,
  passThroughOrdinaryAssistantText,
} from '../../../src/strategies/od-next/protocol.js';

const plan = {
  schema: 'open-design.plan-contract/v2',
  strategy: {
    id: 'od-next-strategy',
    version: '2.0.0',
    packageHash: 'a'.repeat(64),
    snapshotId: 'snapshot-1',
  },
  taskProfile: {
    schemaVersion: '2',
    taskType: 'prototype',
    taskProfileVersion: '2.0.0',
    goal: 'Build a prototype',
    contextAndAudience: 'Operators',
    inputsAndReferences: ['request'],
    constraints: [],
    canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
    requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
    designSpec: {
      source: 'resolved-baseline',
      version: '1',
      decisions: { palette: 'neutral' },
    },
    buildRequirements: [{ id: 'build', text: 'Build the prototype.' }],
    assumptions: [],
    risks: [],
    taskSpecific: {},
  },
  fullPlan: {
    executionMode: 'simple',
    steps: [{ id: 'build', objective: 'Build', outputs: ['prototype'] }],
    readinessArtifacts: [],
    buildPackages: [],
  },
  runManifest: {
    selectedAgentId: 'codex',
    capabilitySnapshotHash: 'b'.repeat(64),
    inputRefs: ['request'],
    productionRoutes: ['html'],
    preflight: { intake: 'passed', execution: 'passed' },
  },
  decisionSummary: {
    goal: 'Build a prototype',
    deliverables: ['prototype'],
    keyConstraints: [],
    assumptions: [],
    risks: [],
    openDecisions: [],
  },
} as const;

const state = {
  schema: 'open-design.strategy-state/v2',
  route: 'full_plan',
  inputStage: 'request',
  outcome: 'plan_ready',
  executionMode: 'simple',
  reasonCodes: [],
} as const;

function machineBlock(tag: string, value: unknown): string {
  return `<${tag}>\n${JSON.stringify(value)}\n</${tag}>`;
}

describe('OD Next machine protocol stream', () => {
  it('recognizes exact blocks across every chunk boundary and never returns machine bytes', () => {
    const wire = [
      'Ready to build.\n',
      machineBlock('open-design-plan-contract', plan),
      '\n',
      machineBlock('open-design-runtime-state', state),
      '\nOne open decision remains.',
    ].join('');

    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();
      expect(visible).not.toContain('open-design-plan-contract');
      expect(visible).not.toContain('open-design-runtime-state');
      expect(result.visibleText).toBe('Ready to build.\n\n\nOne open decision remains.');
      expect(result.issues).toEqual([]);
      expect(result.planContract).toEqual(plan);
      expect(result.runtimeState).toEqual(state);
    }
  });

  it('normalizes a premature clarification execution mode instead of failing schema', () => {
    // Observed field shape: the agent asks for clarification but also
    // predicts the eventual execution mode. The prediction has no authority
    // at this stage, so it is discarded rather than fatal.
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '先对齐两个问题。',
      '<open-design-runtime-state>',
      JSON.stringify({
        schema: 'open-design.strategy-state/v2',
        route: 'full_plan',
        inputStage: 'request',
        outcome: 'clarification_required',
        executionMode: 'simple',
        reasonCodes: ['scope_required'],
      }),
      '</open-design-runtime-state>',
    ].join('\n'));
    const result = stream.finish();
    expect(result.issues).toEqual([]);
    expect(result.runtimeState).toMatchObject({
      outcome: 'clarification_required',
      executionMode: null,
    });
    expect(result.normalizations).toEqual([
      'od_next_protocol_clarification_execution_mode_normalized',
    ]);
  });

  it('does not treat Markdown headings or ordinary JSON as machine protocol', () => {
    const text = '# Plan Contract\n\n```json\n{"route":"full_plan"}\n```';
    const stream = new OdNextMachineProtocolStream();
    expect(stream.push(text)).toBe(text);
    const result = stream.finish();
    expect(result.visibleText).toBe(text);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'od_next_protocol_runtime_state_missing',
    ]);
  });

  it('fails closed on duplicates without selecting the last block', () => {
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'summary',
      machineBlock('open-design-plan-contract', plan),
      machineBlock('open-design-plan-contract', plan),
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(visible).toBe('summary\n\n\n');
    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toBeUndefined();
    expect(result.issues.map((issue) => issue.code)).toContain(
      'od_next_protocol_plan_contract_duplicate',
    );
  });

  it('keeps one schema-valid fenced contract only as a repair anchor', () => {
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      '```json',
      JSON.stringify(plan),
      '```',
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toEqual(plan);
    expect(result.issues.map((issue) => issue.code)).toContain(
      'od_next_protocol_plan_contract_invalid_json',
    );
  });

  it('recovers a repair anchor from prose wrapped around the contract', () => {
    // The whole-body fence pattern only matches a block that is nothing but a
    // fence. An agent that narrates either side of its JSON produced no anchor
    // at all, so the one allowed serialization repair could not engage and the
    // task went straight to a terminal block.
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      'Here is the plan:',
      '```json',
      JSON.stringify(plan),
      '```',
      'Let me know if you want changes.',
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toEqual(plan);
  });

  it('does not recover an anchor from a body that carries no complete object', () => {
    // Fail closed: a truncated block must stay unrecovered rather than have a
    // partial object mistaken for a declaration.
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      JSON.stringify(plan).slice(0, 60),
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.planContract).toBeUndefined();
    expect(result.repairPlanContract).toBeUndefined();
  });

  it('does not end the recovered object on a brace inside a string value', () => {
    const withBrace = {
      ...plan,
      taskProfile: { ...plan.taskProfile, goal: 'Build a prototype using { and } in prose' },
    };
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      '<open-design-plan-contract>',
      'plan follows',
      JSON.stringify(withBrace),
      '</open-design-plan-contract>',
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(result.repairPlanContract).toEqual(withBrace);
  });

  it('suppresses malformed and oversized reserved blocks instead of leaking them', () => {
    const stream = new OdNextMachineProtocolStream({ maxMachineBlockBytes: 64 });
    const visible = stream.push(
      `before<open-design-plan-contract data-x="bad">${'x'.repeat(200)}\n</open-design-plan-contract>after`,
    );
    const result = stream.finish();

    expect(visible).toBe('beforeafter');
    expect(result.visibleText).toBe('beforeafter');
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'od_next_protocol_machine_block_malformed',
      'od_next_protocol_machine_block_too_large',
      'od_next_protocol_runtime_state_missing',
    ]));
  });

  it('consumes an incomplete closing tag at EOF across every chunk boundary', () => {
    const complete = machineBlock('open-design-plan-contract', plan);
    const wire = `summary\n${complete.slice(0, -1)}`;

    for (let split = 0; split <= wire.length; split += 1) {
      const stream = new OdNextMachineProtocolStream();
      const visible = stream.push(wire.slice(0, split)) + stream.push(wire.slice(split));
      const result = stream.finish();

      expect(visible, `split ${split}`).toBe('summary\n');
      expect(result.visibleText, `split ${split}`).toBe('summary\n');
      expect(result.planContract, `split ${split}`).toBeUndefined();
      expect(result.repairPlanContract, `split ${split}`).toEqual(plan);
      expect(result.issues.map((issue) => issue.code), `split ${split}`).toEqual(
        expect.arrayContaining([
          'od_next_protocol_machine_block_malformed',
          'od_next_protocol_runtime_state_missing',
        ]),
      );
    }
  });

  it('leaves the ordinary Run path byte-for-byte unchanged', () => {
    const ordinary = `Visible <open-design-runtime-state>{"not":"active"}</open-design-runtime-state>`;
    expect(passThroughOrdinaryAssistantText(null, ordinary)).toBe(ordinary);

    const strategy = new OdNextMachineProtocolStream();
    expect(passThroughOrdinaryAssistantText(strategy, ordinary)).toBe('Visible ');
    expect(strategy.finish().visibleText).toBe('Visible ');
  });

  it('does not terminate suppression on a closing-tag string inside JSON', () => {
    const hostile = structuredClone(plan) as unknown as OpenDesignPlanContractV2;
    hostile.taskProfile.goal = 'Never leak </open-design-plan-contract> machine bytes';
    hostile.decisionSummary.goal = hostile.taskProfile.goal;
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'summary',
      machineBlock('open-design-plan-contract', hostile),
      machineBlock('open-design-runtime-state', state),
    ].join('\n'));
    const result = stream.finish();

    expect(visible).toBe('summary\n\n');
    expect(result.planContract).toMatchObject({
      taskProfile: { goal: hostile.taskProfile.goal },
    });
    expect(result.issues).toEqual([]);
  });
});
