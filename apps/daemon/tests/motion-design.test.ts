import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  automaticStrategyTaskProfileForProjectMetadata,
  defaultScenarioTaskProfileForProjectMetadata,
  assertOdNextPlanningBuildOnlyV2,
} from '@open-design/contracts';
import { listSkills } from '../src/skills.js';
import { resolvePluginFolder } from '../src/plugins/registry.js';
import { createBundledStrategyBindingV2, loadBundledStrategyPromptAssetsV2 } from '../src/plugins/strategy-package.js';
import { readVerifiedProjectStrategyBinding, createAutomaticProjectStrategyBinding } from '../src/plugins/strategy-binding.js';
import { evaluateOdNextRollout, readOdNextRolloutPolicy } from '../src/strategies/od-next/rollout.js';
import { daemonOwnedOdNextPlanningCatalog } from '../src/strategies/od-next/resolver.js';

const root = path.resolve(import.meta.dirname, '../../..');
const metadata = { kind: 'video', intent: 'motion-design', videoModel: 'hyperframes-html' } as const;

describe('Motion Design official skill and OD Next route', () => {
  it('discovers the complete built-in skill first and loads identical task content', async () => {
    const skills = await listSkills([path.join(root, '.tmp/nonexistent-user-skills'), path.join(root, 'skills')]);
    expect(skills[0]?.id).toBe('motion-design');
    expect(skills[0]?.source).toBe('built-in');
    expect(skills[0]?.mode).toBe('video');
    const source = await readFile(path.join(root, 'skills/motion-design/SKILL.md'), 'utf8');
    const folder = path.join(root, 'plugins/_official/scenarios/od-next-strategy');
    const resolved = await resolvePluginFolder({ folder, folderId: 'od-next-strategy', sourceKind: 'bundled', source: folder, trust: 'bundled' });
    if (!resolved.ok) throw new Error(resolved.errors.join('; '));
    const binding = createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'motion-design' });
    const loaded = loadBundledStrategyPromptAssetsV2({ plugin: resolved.record, binding });
    expect(loaded.taskSkill).toBe(source);
    expect(binding.selectedTaskProfile.taskType).toBe('motion-design');
    expect(() => assertOdNextPlanningBuildOnlyV2(loaded.taskSkill, 'motion-design')).not.toThrow();
    expect(loaded.coreStrategy).toContain('OD Next Core Strategy');
    expect(loaded.generalOrchestration.length).toBeGreaterThan(100);
  });

  it('admits the exact automatic motion route without widening ordinary video or explicit plugins', () => {
    expect(automaticStrategyTaskProfileForProjectMetadata(metadata)).toBe('motion-design');
    expect(automaticStrategyTaskProfileForProjectMetadata({ kind: 'video' })).toBeNull();
    expect(automaticStrategyTaskProfileForProjectMetadata({ kind: 'image', intent: 'motion-design' })).toBeNull();
    expect(defaultScenarioTaskProfileForProjectMetadata(metadata, 'od-new-generation')).toBe('motion-design');
    expect(defaultScenarioTaskProfileForProjectMetadata(metadata, 'example-hyperframes')).toBeNull();
    const binding = createAutomaticProjectStrategyBinding({ metadata, taskProfile: 'motion-design', boundAt: 1 });
    expect(readVerifiedProjectStrategyBinding({ ...metadata, strategyBinding: binding! })).toEqual(binding);
    const input = { policy: readOdNextRolloutPolicy({}), assignmentIdentity: 'motion-test', taskType: 'motion-design' as const, agentId: 'codex', agentVersion: null, sourceKind: 'bundled', runtimeCapabilityVerified: true };
    expect(evaluateOdNextRollout(input).effectiveMode).toBe('active');
    expect(evaluateOdNextRollout({ ...input, routeApplicability: 'explicit_user' }).effectiveMode).toBe('off');
    expect(daemonOwnedOdNextPlanningCatalog('motion-design').productionRoutes).toContain('html');
    expect(daemonOwnedOdNextPlanningCatalog('motion-design').outputKinds).toContain('source');
  });
});
