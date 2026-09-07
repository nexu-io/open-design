import { describe, expect, it } from 'vitest';

import {
  createProjectSkillDiscoveryBinding,
  parseProjectSkillDiscoveryRequest,
  readAgentNativeSkillDiscoveryMode,
  readVerifiedProjectSkillDiscoveryBinding,
} from '../src/skill-discovery/binding.js';

describe('Agent-native Skill discovery project authority', () => {
  it('accepts only the exact typed client marker', () => {
    expect(parseProjectSkillDiscoveryRequest({
      mode: 'agent',
      catalog: 'open-design-official',
    })).toEqual({
      mode: 'agent',
      catalog: 'open-design-official',
    });
    for (const invalid of [
      null,
      true,
      { mode: 'agent' },
      { mode: 'router', catalog: 'open-design-official' },
      { mode: 'agent', catalog: 'user' },
      { mode: 'agent', catalog: 'open-design-official', injected: true },
    ]) {
      expect(() => parseProjectSkillDiscoveryRequest(invalid)).toThrow(/skillDiscovery is invalid/);
    }
  });

  it('creates and re-verifies daemon-owned binding without inference', () => {
    const binding = createProjectSkillDiscoveryBinding(1234);
    expect(binding).toEqual({
      schemaVersion: 1,
      provenance: 'no_explicit_task_type',
      catalog: 'open-design-official',
      boundAt: 1234,
    });
    expect(readVerifiedProjectSkillDiscoveryBinding({
      kind: 'other',
      skillDiscoveryBinding: binding,
    })).toEqual(binding);
    expect(readVerifiedProjectSkillDiscoveryBinding({ kind: 'other' })).toBeNull();
    expect(readVerifiedProjectSkillDiscoveryBinding({
      kind: 'other',
      skillDiscoveryBinding: {
        ...binding,
        provenance: 'client_claim',
      } as unknown as typeof binding,
    })).toBeNull();
  });

  it('has a process kill switch with explicit rollout modes', () => {
    expect(readAgentNativeSkillDiscoveryMode({})).toBe('active');
    expect(readAgentNativeSkillDiscoveryMode({ OD_AGENT_NATIVE_SKILL_DISCOVERY: '  ' })).toBe('active');
    expect(readAgentNativeSkillDiscoveryMode({ OD_AGENT_NATIVE_SKILL_DISCOVERY: 'off' })).toBe('off');
    expect(readAgentNativeSkillDiscoveryMode({ OD_AGENT_NATIVE_SKILL_DISCOVERY: 'observe' })).toBe('observe');
    expect(readAgentNativeSkillDiscoveryMode({ OD_AGENT_NATIVE_SKILL_DISCOVERY: 'canary' })).toBe('canary');
    expect(readAgentNativeSkillDiscoveryMode({ OD_AGENT_NATIVE_SKILL_DISCOVERY: 'active' })).toBe('active');
    expect(readAgentNativeSkillDiscoveryMode({ OD_AGENT_NATIVE_SKILL_DISCOVERY: 'unexpected' })).toBe('off');
  });
});
