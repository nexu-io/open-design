import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS, OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2,
  parseOdNextPromptBundleV2,
  renderOdNextProductionReadyInstructions, serializeOdNextPromptBundleV2,
} from '@open-design/contracts';
import { composeResumedRequest, usesProductionMarker } from '../../../src/strategies/od-next/request-resume.js';
import { TEST_PROMPT_BUNDLE } from '../strategy-task-test-fixtures.js';

function task(key: string, change?: (bundle: ReturnType<typeof parseOdNextPromptBundleV2>) => void) {
  const bundle = parseOdNextPromptBundleV2(TEST_PROMPT_BUNDLE);
  bundle.coreSystemPrompt.outputContract = OD_NEXT_PLAN_OUTPUT_INSTRUCTIONS;
  bundle.context.clientSystemPrompt = renderOdNextProductionReadyInstructions(key);
  change?.(bundle);
  const text = serializeOdNextPromptBundleV2(bundle);
  return { taskExecutionId: `task-${key}`, promptBundle: {
    kind: 'bundle' as const, schema: OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2, text,
    utf8Bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex'),
  } };
}

it('sends new query, key, attachments and runtime context without repeating stable skills or history', () => {
  const previous = task('aaa');
  const current = task('bbb', bundle => {
    bundle.userFirstPrompt = 'New query.';
    bundle.context.priorTranscript = 'Old history sentinel.';
    bundle.context.runtimeToolEnvironment = 'Current tool environment.';
    bundle.context.requestInputFacts = 'New frozen input location.';
    bundle.context.runContext = 'Current selected node.';
    bundle.taskMetadata.attachments = 'Current attachment.';
    bundle.context.recipeIdentity.appliedSnapshot = 'different-snapshot';
  });
  const text = composeResumedRequest(current, previous)!;
  expect(text).not.toContain('open_design_request_turn');
  for (const value of ['New query.', 'key="bbb"', 'Current tool environment.', 'New frozen input location.', 'Current selected node.', 'Current attachment.']) {
    expect(text).toContain(value);
  }
  expect(text).not.toContain('Old history sentinel.');
  expect(text).not.toContain('key="aaa"');
  expect(text).not.toContain(parseOdNextPromptBundleV2(previous.promptBundle.text).sessionSkills.generalOrchestrationSkill.body);
});

it.each(['core', 'skill', 'configuration', 'custom'] as const)('requires full input when %s instructions change', kind => {
  const previous = task('aaa');
  const current = task('bbb', bundle => {
    if (kind === 'core') bundle.coreSystemPrompt.coreStrategy += '\nChanged rule.';
    if (kind === 'skill') bundle.sessionSkills.taskTypeSkill.body += '\nChanged skill.';
    if (kind === 'configuration') bundle.taskMetadata.taskConfiguration = 'Changed configuration.';
    if (kind === 'custom') bundle.context.clientSystemPrompt += '\nChanged custom instruction.';
  });
  expect(composeResumedRequest(current, previous)).toBeNull();
});

it('does not reuse a native session carrying the retired output protocol', () => {
  const legacy = task('aaa', bundle => { bundle.coreSystemPrompt.outputContract = 'Old contract.'; });
  expect(usesProductionMarker(legacy)).toBe(false);
  expect(composeResumedRequest(task('bbb'), legacy)).toBeNull();
});

it('omits unchanged context and host-only identity from incremental input', () => {
  const decorate = (bundle: ReturnType<typeof parseOdNextPromptBundleV2>) => {
    bundle.context.runtimeToolEnvironment = 'Stable tool instructions sentinel.';
    bundle.context.runtimeFacts = 'Capability description.\n' + JSON.stringify({
      appliedSnapshot: 'host-snapshot', capabilitySnapshotHash: 'host-hash',
      selectedAgentId: 'codex', nativeChildLifecycleVerified: true,
    });
    bundle.context.runContext = 'Selected file A.';
  };
  const text = composeResumedRequest(task('bbb', decorate), task('aaa', decorate))!;
  for (const value of ['Stable tool instructions sentinel.', 'host-snapshot', 'host-hash', 'Selected file A.', 'task-bbb', 'open_design_request_turn']) {
    expect(text).not.toContain(value);
  }
});

it('explicitly clears context rather than silently retaining a previous selection', () => {
  const previous = task('aaa', bundle => { bundle.context.runContext = 'Selected file A.'; });
  const current = task('bbb', bundle => { bundle.context.runContext = ''; });
  expect(composeResumedRequest(current, previous)).toContain('Selected run context: cleared');
});

it('ignores snapshot churn but forwards actual capability changes', () => {
  const facts = (snapshot: string, supported: boolean) => 'Runtime capabilities.\n' + JSON.stringify({
    appliedSnapshot: snapshot, capabilitySnapshotHash: snapshot + '-hash',
    selectedAgentId: 'codex', nativeChildLifecycleVerified: supported,
  });
  const previous = task('aaa', bundle => { bundle.context.runtimeFacts = facts('old', true); });
  const unchanged = task('bbb', bundle => { bundle.context.runtimeFacts = facts('new', true); });
  expect(composeResumedRequest(unchanged, previous)).not.toContain('nativeChildLifecycleVerified');
  const changed = task('bbb', bundle => { bundle.context.runtimeFacts = facts('new', false); });
  const text = composeResumedRequest(changed, previous)!;
  expect(text).toContain('"nativeChildLifecycleVerified":false');
  expect(text).not.toContain('new-hash');
});

it.each(['runtimeToolEnvironment', 'requestInputFacts'] as const)('clears removed %s', field => {
  const previous = task('aaa', bundle => { bundle.context[field] = 'Old value.'; });
  const current = task('bbb', bundle => { delete bundle.context[field]; });
  expect(composeResumedRequest(current, previous)).toContain(': cleared.');
});

it('clears attachment references when the current request no longer carries them', () => {
  const previous = task('aaa', bundle => { bundle.taskMetadata.attachments = 'Old attachment.'; });
  const current = task('bbb', bundle => { delete bundle.taskMetadata.attachments; });
  expect(composeResumedRequest(current, previous)).toContain('Attachment references: cleared.');
});
