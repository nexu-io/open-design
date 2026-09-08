import { describe, expect, it } from 'vitest';
import { executionProfileForRuntime } from '@open-design/contracts';
import { composeSystemPrompt } from '../../src/prompts/system.js';
import { resolveBundledOdNextRuntimeCapability } from '../../src/runtimes/od-next-capability-gate.js';

describe('AMR direct model prompt delivery', () => {
  it.each(['classic', 'slim'] as const)('uses the existing text artifact delivery in the %s legacy composer', (promptCoreVariant) => {
    const prompt = composeSystemPrompt({
      agentId: 'amr',
      streamFormat: 'acp-json-rpc',
      executionProfile: executionProfileForRuntime('amr', 'acp-json-rpc', 'none'),
      promptCoreVariant,
      metadata: { kind: 'prototype' },
    });
    expect(prompt).toContain('<artifact');
    expect(prompt).toContain('# API mode — no tools available');
    expect(prompt).toContain('Every later instruction in this prompt');
    expect(prompt.indexOf('# API mode — no tools available')).toBeLessThan(prompt.indexOf('DISCOVERY') < 0 ? prompt.length : prompt.indexOf('DISCOVERY'));
    expect(prompt).not.toContain('Project files are the source of truth. Write or update the files first');
    expect(prompt).not.toContain("This run uses OpenDesign's filesystem execution profile");
    if (promptCoreVariant === 'slim') {
      expect(prompt).toContain('no filesystem tools');
      expect(prompt).toContain('complete standalone document');
    }
  });

  it.each(['classic', 'slim'] as const)('keeps the no-tool override above the %s ask charter', (promptCoreVariant) => {
    const prompt = composeSystemPrompt({
      agentId: 'amr', streamFormat: 'acp-json-rpc', sessionMode: 'chat', promptCoreVariant,
      executionProfile: executionProfileForRuntime('amr', 'acp-json-rpc', 'none'),
    });
    expect(prompt).toContain('# API mode — no tools available');
    expect(prompt.indexOf('# API mode — no tools available')).toBeLessThan(prompt.indexOf('Ask mode'));
  });

  it('refuses OD Next admission for direct models instead of borrowing Vela/OpenCode native-child evidence', () => {
    const capability = resolveBundledOdNextRuntimeCapability({
      agentId: 'amr', amrRuntime: 'none', agentCliVersion: '0.0.1-od-next-local',
      runtimeCompanionName: 'opencode', runtimeCompanionVersion: '1.18.18',
    });
    expect(capability.reason).toBe('runtime_out_of_scope');
  });
});
