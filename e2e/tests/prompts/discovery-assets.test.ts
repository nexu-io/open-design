import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeOdNextStrategyBundleHeadV2,
  type OdNextStrategyRequestRecipeV2,
} from '@open-design/contracts';

const folder = resolve(import.meta.dirname, '../../../plugins/_official/scenarios/od-next-strategy');
const asset = (name: string) => readFileSync(resolve(folder, name), 'utf8').trim();
const core = asset('assets/core-system-prompt.md');
const orchestration = asset('assets/general-orchestration.md');
const policy = asset('agent-discovery/SKILL.md');
const hex = (body: string) => createHash('sha256').update(body).digest('hex');

function recipe(taskType: 'generic' | 'prototype'): OdNextStrategyRequestRecipeV2 {
  const taskSkill = taskType === 'generic' ? null : asset('assets/task-profiles/prototype.md');
  return {
    recipe: 'od-next-plan-build-v2', strategyId: 'od-next-strategy', strategyVersion: '2.0.0',
    snapshotId: 'synthetic-content-witness', packageHash: hex(core + orchestration),
    taskType, taskProfileDigest: taskSkill ? hex(taskSkill) : null, taskProfileVersion: '2.0.0',
    executionProfile: 'filesystem', coreStrategy: core, generalOrchestration: orchestration, taskSkill,
    skillDiscovery: { policy, catalog: '# Synthetic official metadata\n\nprototype: interactive websites',
      catalogRevision: `sha256:${hex('synthetic-catalog')}`,
      ...(taskType === 'prototype' ? { explicitTaskType: taskType } : {}) },
    activeStages: [
      { name: 'discovery', atoms: [{ name: 'discovery-question-form' }] },
      { name: 'plan', atoms: [{ name: 'direction-picker' }, { name: 'todo-write' }] },
      { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
    ],
  };
}

describe('bundled V2 Discovery content and composer boundary', () => {
  it('carries unbound resolution and answer-only exceptions in the actual shared assets', () => {
    const head = composeOdNextStrategyBundleHeadV2(recipe('generic'));
    expect(head.coreSystemPrompt.coreStrategy).toBe(core);
    expect(head.sessionSkills.generalOrchestrationSkill.body).toBe(orchestration);
    expect(head.sessionSkills.taskTypeSkill).toBeUndefined();
    expect(head.sessionSkills.discoverySkill?.body).toContain(policy);
    // These are load-bearing exceptions to the previous all-typed/all-HTML
    // instructions, not a claim that a model has obeyed them in a live turn.
    expect(core).toContain('This initial resolution is not a task-type switch.');
    expect(core).toContain('Generic artifact tasks still require');
    expect(orchestration).toContain('Never force it into HTML merely');
    expect(orchestration).toContain('no active primary and no Plan');
    expect(head.coreSystemPrompt.outputContract).toContain('outcome answered');
  });

  it('retains the complete explicit typed profile and Direct Edit/Production ceilings', () => {
    const typed = recipe('prototype');
    const head = composeOdNextStrategyBundleHeadV2(typed);
    expect(head.sessionSkills.taskTypeSkill?.body).toBe(typed.taskSkill);
    expect(head.sessionSkills.discoverySkill?.body).toContain('client explicitly selected prototype');
    expect(core).toContain('Existing typed\nprofiles retain their primary HTML deliverable contract.');
    expect(core).toContain('Direct Edit is confined to the request stage and always uses simple mode.');
    expect(orchestration).toContain('Production never selects a different route or execution mode');
    expect(orchestration).toContain('Spawning acceptance Children or performing formal acceptance of any kind.');
  });
});
