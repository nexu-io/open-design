import { expect, it } from 'vitest';
import { amrAgentDef } from '../../src/runtimes/defs/amr.js';
import { agentSessionStorageKey } from '../../src/runtimes/amr-session-key.js';

it('selects the AMR harness per invocation without changing the default', () => {
  expect(amrAgentDef.buildArgs('', [])).toEqual(['agent', 'run']);
  expect(amrAgentDef.buildArgs('', [], [], { amrRuntime: 'pi' }))
    .toEqual(['agent', 'run', '--runtime', 'pi']);
  expect(amrAgentDef.buildArgs('', [], [], { amrRuntime: 'opencode' }))
    .toEqual(['agent', 'run', '--runtime', 'opencode']);
  expect(amrAgentDef.buildArgs('', [])).toEqual(['agent', 'run']);
});

it('keeps legacy OpenCode handles separate from Pi and other agents', () => {
  expect(agentSessionStorageKey('amr')).toBe('amr');
  expect(agentSessionStorageKey('amr', 'opencode')).toBe('amr');
  expect(agentSessionStorageKey('amr', 'pi')).toBe('amr:pi');
  expect(agentSessionStorageKey('pi')).toBe('pi');
});
